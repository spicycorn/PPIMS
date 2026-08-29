/**
 * IPC 处理层：把渲染层请求落到 Node/Electron 主进程能力（文件、对话框、Word/Excel 引擎、导入）。
 * 全部基于本地 Node fs 与 jszip/xlsx，离线可用、不依赖任何云服务。
 */
import { ipcMain, dialog, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IPC, type LibraryScanResult } from './ipc-channels';
import { recognizeStructure, replaceInXml, writeDocx, readDocumentXml } from './services/docx-engine';
import * as XLSX from 'xlsx';
import { recognizeWorkbook, writeWorkbook } from './services/xlsx-engine';
import {
  listTemplates,
  getTemplate,
  materializeTemplate,
  saveTemplateFromProject,
  updateTemplate,
  duplicateTemplate,
  deleteTemplate,
  applyTemplateToNewProject,
} from './services/template-service';
import type { Project, TplCreateInput } from '../shared/types';
import { sanitize, stageFolderName, TEMPLATES_DIR, DAILY_DIR, BACKUP_DIR } from '../shared/paths';

/* ---------------- 工具 ---------------- */

/** POSIX 相对路径（跨平台一致，保证项目文件夹可搬移） */
function relPosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

/* ---------------- 对话框 ---------------- */

interface OpenDialogOpts {
  title?: string;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiSelections?: boolean;
}

export function registerIpc(): void {
  // 打开对话框（选目录 / 选文件）
  ipcMain.handle(
    IPC.OPEN_DIALOG,
    async (_e, opts: OpenDialogOpts = {}) => {
      const props: Array<'openFile' | 'openDirectory' | 'multiSelections'> = [];
      if (opts.directory) props.push('openDirectory');
      else props.push('openFile');
      if (opts.multiSelections) props.push('multiSelections');
      const res = await dialog.showOpenDialog({
        title: opts.title,
        properties: props,
        filters: opts.filters,
      });
      if (res.canceled) return null;
      return opts.multiSelections ? res.filePaths : res.filePaths[0] ?? null;
    },
  );

  ipcMain.handle(
    IPC.SAVE_DIALOG,
    async (_e, opts: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> } = {}) => {
      const res = await dialog.showSaveDialog({
        title: opts.title,
        defaultPath: opts.defaultPath,
        filters: opts.filters,
      });
      if (res.canceled) return null;
      return res.filePath;
    },
  );

  /* ---------------- 项目 ---------------- */

  ipcMain.handle(IPC.PROJECT_LIST, async (_e, rootDir: string) => {
    if (!rootDir) return [];
    let entries: string[] = [];
    try {
      entries = await fs.readdir(rootDir);
    } catch {
      return [];
    }
    const result: Array<{ name: string; folder: string; info: Project['info'] | null }> = [];
    for (const name of entries) {
      const folder = path.join(rootDir, name);
      const jsonPath = path.join(folder, 'project.json');
      try {
        const stat = await fs.stat(folder);
        if (!stat.isDirectory()) continue;
        const raw = await fs.readFile(jsonPath, 'utf-8');
        const data = JSON.parse(raw) as Project;
        result.push({ name, folder, info: data.info ?? null });
      } catch {
        // 非项目文件夹，跳过
      }
    }
    return result;
  });

  ipcMain.handle(
    IPC.PROJECT_CREATE,
    async (_e, { rootDir, project }: { rootDir: string; project: Project }) => {
      await ensureDir(rootDir);
      const folderName = sanitize(`${project.info.name}_${project.info.code}`);
      const folder = path.join(rootDir, folderName);
      if (await exists(folder)) {
        throw new Error(`项目文件夹已存在：${folderName}`);
      }
      // 生成自包含文件夹结构（设计文档 2.5）
      await ensureDir(folder);
      await ensureDir(path.join(folder, TEMPLATES_DIR));
      await ensureDir(path.join(folder, DAILY_DIR));
      await ensureDir(path.join(folder, BACKUP_DIR));
      for (const [i, stage] of project.stages.entries()) {
        const stageFolder = path.join(folder, stageFolderName(i, stage.info.name));
        await ensureDir(stageFolder);
      }
      // 落盘 project.json
      const data = stripRuntime(project);
      await fs.writeFile(path.join(folder, 'project.json'), JSON.stringify(data, null, 2), 'utf-8');
      return { folder, folderName, rootPath: folder };
    },
  );

  ipcMain.handle(IPC.PROJECT_LOAD, async (_e, projectFolder: string) => {
    const jsonPath = path.join(projectFolder, 'project.json');
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(raw) as Project;
    return { project: data, rootPath: projectFolder };
  });

  ipcMain.handle(IPC.PROJECT_SAVE, async (_e, { projectFolder, project }: { projectFolder: string; project: Project }) => {
    const jsonPath = path.join(projectFolder, 'project.json');
    const data = stripRuntime(project);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
    return { saved: jsonPath };
  });

  ipcMain.handle(IPC.PROJECT_DELETE, async (_e, projectFolder: string) => {
    await fs.rm(projectFolder, { recursive: true, force: true });
    return { deleted: projectFolder };
  });

  ipcMain.handle(IPC.PROJECT_OPEN_FOLDER, async (_e, folder: string) => {
    const err = await shell.openPath(folder);
    return { error: err || null };
  });

  /* ---------------- 文件 ---------------- */

  // 选文件 → 复制到目标目录 → 返回相对项目根的路径
  ipcMain.handle(
    IPC.FILE_COPY_IN,
    async (_e, { projectRoot, destDir, suggestedName }: { projectRoot: string; destDir: string; suggestedName?: string }) => {
      const res = await dialog.showOpenDialog({
        title: '选择要上传的文件',
        properties: ['openFile'],
      });
      if (res.canceled || !res.filePaths[0]) return null;
      const src = res.filePaths[0];
      const base = suggestedName ? sanitize(suggestedName) : path.basename(src);
      const dest = path.join(projectRoot, destDir, base);
      await copyFile(src, dest);
      return { relativePath: relPosix(projectRoot, dest), baseName: base, size: (await fs.stat(dest)).size };
    },
  );

  // 直接复制一个"已选定"的绝对路径文件到项目内目标目录（不弹对话框，供模板挂载/导入复用）
  ipcMain.handle(
    IPC.FILE_COPY,
    async (_e, { src, projectRoot, destDir, baseName }: { src: string; projectRoot: string; destDir: string; baseName: string }) => {
      const dest = path.join(projectRoot, destDir, sanitize(baseName));
      await copyFile(src, dest);
      return { relativePath: relPosix(projectRoot, dest), baseName: sanitize(baseName), size: (await fs.stat(dest)).size };
    },
  );

  // 下载（复制到用户选定位置）
  ipcMain.handle(
    IPC.FILE_DOWNLOAD,
    async (_e, { projectRoot, relativePath, suggestedName }: { projectRoot: string; relativePath: string; suggestedName?: string }) => {
      const src = path.join(projectRoot, relativePath);
      const res = await dialog.showSaveDialog({
        title: '下载文件',
        defaultPath: suggestedName ? path.join(os.homedir(), 'Downloads', suggestedName) : path.join(os.homedir(), 'Downloads', path.basename(relativePath)),
      });
      if (res.canceled || !res.filePath) return null;
      await copyFile(src, res.filePath);
      return { savedTo: res.filePath };
    },
  );

  ipcMain.handle(IPC.FILE_READ, async (_e, absPath: string) => {
    const buf = await fs.readFile(absPath);
    return buf;
  });

  /* ---------------- Word ---------------- */

  ipcMain.handle(IPC.DOCX_RECOGNIZE, async (_e, absPath: string) => {
    const buf = await fs.readFile(absPath);
    const structure = await recognizeStructure(buf);
    return {
      paragraphs: structure.paragraphs.map((p) => ({
        index: p.index,
        text: p.text,
        isHeading: p.isHeading,
        headingLevel: p.headingLevel,
        inTable: p.inTable,
      })),
      tables: structure.tables,
      fullText: structure.fullText,
    };
  });

  // 原位替换并写回（保真）
  ipcMain.handle(
    IPC.DOCX_APPLY,
    async (_e, { absPath, replacements, outputAbsPath }: { absPath: string; replacements: Array<{ oldText: string; newText: string }>; outputAbsPath?: string }) => {
      const buf = await fs.readFile(absPath);
      const xml = await readDocumentXml(buf);
      const { xml: newXml, applied, missed } = replaceInXml(xml, replacements);
      const out = await writeDocx(buf, newXml);
      const dest = outputAbsPath ? outputAbsPath : absPath;
      await ensureDir(path.dirname(dest));
      await fs.writeFile(dest, out);
      return { written: dest, applied, missed };
    },
  );

  /* ---------------- Excel ---------------- */

  ipcMain.handle(IPC.XLSX_RECOGNIZE, async (_e, absPath: string) => {
    const buf = await fs.readFile(absPath);
    const model = await recognizeWorkbook(buf);
    return {
      sheetNames: model.sheetNames,
      active: model.active,
      cells: model.cells.map((c) => ({
        addr: XLSX.utils.encode_cell({ r: c.r, c: c.c }),
        value: c.v,
      })),
      rows: model.rows,
      cols: model.cols,
    };
  });

  ipcMain.handle(
    IPC.XLSX_APPLY,
    async (_e, { absPath, activeSheet, edits, outputAbsPath }: { absPath: string; activeSheet: string; edits: Array<{ addr: string; value: string }>; outputAbsPath?: string }) => {
      const buf = await fs.readFile(absPath);
      const out = await writeWorkbook(buf, activeSheet, edits);
      const dest = outputAbsPath ? outputAbsPath : absPath;
      await ensureDir(path.dirname(dest));
      await fs.writeFile(dest, out);
      return { written: dest, applied: edits.length };
    },
  );

  /* ---------------- 导入 ---------------- */

  ipcMain.handle(
    IPC.IMPORT_SCAN,
    async (_e, { libraryDir, stages }: { libraryDir: string; stages: Array<{ id: string; name: string }> }) => {
      const entries = await fs.readdir(libraryDir, { withFileTypes: true });
      const result: LibraryScanResult = { root: libraryDir, subdirs: [], looseFiles: [] };
      for (const ent of entries) {
        const full = path.join(libraryDir, ent.name);
        if (ent.isDirectory()) {
          const files = await fs.readdir(full);
          // 按子目录名匹配阶段（包含阶段名即匹配）
          const matched = stages.find((s) => ent.name.includes(s.name) || s.name.includes(ent.name));
          result.subdirs.push({
            name: ent.name,
            matchedStageId: matched ? matched.id : null,
            files,
          });
        } else if (ent.isFile()) {
          result.looseFiles.push(ent.name);
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    IPC.IMPORT_COPY,
    async (_e, { libraryDir, subdirs, projectRoot, stageMap }: { libraryDir: string; subdirs: Array<{ name: string; matchedStageId: string | null }>; projectRoot: string; stageMap: Record<string, string> }) => {
      const copied: Array<{ from: string; to: string }> = [];
      for (const sub of subdirs) {
        const srcDir = path.join(libraryDir, sub.name);
        const targetStageFolder = sub.matchedStageId ? stageMap[sub.matchedStageId] : '日常管理';
        const destDir = path.join(projectRoot, targetStageFolder, sub.name);
        const files = await fs.readdir(srcDir);
        for (const f of files) {
          const src = path.join(srcDir, f);
          const dest = path.join(destDir, f);
          await copyFile(src, dest);
          copied.push({ from: relPosix(libraryDir, src), to: relPosix(projectRoot, dest) });
        }
      }
      return { copied };
    },
  );

  /* ---------------- 项目架构模板（全局蓝图） ---------------- */

  ipcMain.handle(IPC.TPL_LIST, async () => {
    return listTemplates();
  });

  ipcMain.handle(IPC.TPL_GET, async (_e, id: string) => {
    return getTemplate(id);
  });

  ipcMain.handle(IPC.TPL_CREATE, async (_e, input: TplCreateInput) => {
    return materializeTemplate(input);
  });

  ipcMain.handle(IPC.TPL_UPDATE, async (_e, { id, input }: { id: string; input: TplCreateInput }) => {
    return updateTemplate(id, input);
  });

  ipcMain.handle(IPC.TPL_DUPLICATE, async (_e, { id, name }: { id: string; name?: string }) => {
    return duplicateTemplate(id, name);
  });

  ipcMain.handle(IPC.TPL_DELETE, async (_e, id: string) => {
    return deleteTemplate(id);
  });

  ipcMain.handle(IPC.TPL_SAVE_FROM_PROJECT, async (_e, { projectFolder, name, description }: { projectFolder: string; name?: string; description?: string }) => {
    return saveTemplateFromProject(projectFolder, name, description);
  });

  ipcMain.handle(IPC.TPL_APPLY, async (_e, { rootDir, project, templateId }: { rootDir: string; project: Project; templateId: string }) => {
    return applyTemplateToNewProject({ rootDir, project, templateId });
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 落盘前去掉运行时字段（如绝对路径），保证 project.json 可搬移 */
function stripRuntime(project: Project): Project {
  const { rootPath: _omit, ...rest } = project;
  void _omit;
  return { ...rest, rootPath: '' };
}
