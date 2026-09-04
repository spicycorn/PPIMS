/**
 * IPC 处理层：把渲染层请求落到 Node/Electron 主进程能力（文件、对话框、Word/Excel/CSV 引擎、结构模板）。
 * v1.0.0：建项只建 files/ 目录；多文件扁平复制到 files/；csv 原位编辑；doc/xls 外部打开/下载。
 * 全部基于本地 Node fs 与 jszip/xlsx，离线可用、不依赖任何云服务。
 */
import { ipcMain, dialog, shell, app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IPC } from './ipc-channels';
import { ensureDir, copyFile } from './services/fs';
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
import type { Project, TplCreateInput, RootConfig } from './types';
import { sanitize, FILES_DIR } from './paths';
import { getFormat } from './util';
import { normalizeDimensions } from './classify';

/* ---------------- 工具 ---------------- */

function relPosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
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

export function registerIpc(): void {
  /* ---------------- 对话框 ---------------- */

  interface OpenDialogOpts {
    title?: string;
    directory?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
    multiSelections?: boolean;
  }

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

  /* ---------------- 根配置（分类维度） ---------------- */

  ipcMain.handle(IPC.ROOT_CONFIG_GET, async (_e, rootDir: string) => {
    if (!rootDir) return { dimensions: [] };
    try {
      const raw = await fs.readFile(path.join(rootDir, 'ppims.json'), 'utf-8');
      const data = JSON.parse(raw) as RootConfig;
      return { dimensions: Array.isArray(data.dimensions) ? data.dimensions : [] };
    } catch {
      return { dimensions: [] };
    }
  });

  ipcMain.handle(
    IPC.ROOT_CONFIG_SAVE,
    async (_e, { rootDir, config }: { rootDir: string; config: RootConfig }) => {
      await ensureDir(rootDir);
      const dimensions = normalizeDimensions(config.dimensions ?? []);
      const out: RootConfig = { dimensions };
      const p = path.join(rootDir, 'ppims.json');
      await fs.writeFile(p, JSON.stringify(out, null, 2), 'utf-8');
      return { saved: p, dimensions };
    },
  );

  /* ---------------- 最近根目录（持久化，供悬浮框读取） ---------------- */

  function lastRootPath(): string {
    return path.join(app.getPath('userData'), 'ppims-config.json');
  }

  ipcMain.handle(IPC.ROOT_DIR_PERSIST, async (_e, rootDir: string) => {
    const p = lastRootPath();
    await ensureDir(path.dirname(p));
    await fs.writeFile(p, JSON.stringify({ lastRootDir: rootDir || '' }, null, 2), 'utf-8');
    return { saved: p };
  });

  ipcMain.handle(IPC.ROOT_DIR_GET_LAST, async () => {
    try {
      const raw = await fs.readFile(lastRootPath(), 'utf-8');
      const data = JSON.parse(raw) as { lastRootDir?: string };
      return data.lastRootDir || '';
    } catch {
      return '';
    }
  });

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
      // v1.0.0：自包含文件夹 = project.json + files/（扁平存放上传文件）
      await ensureDir(folder);
      await ensureDir(path.join(folder, FILES_DIR));
      await fs.writeFile(path.join(folder, 'project.json'), JSON.stringify(stripRuntime(project), null, 2), 'utf-8');
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

  ipcMain.handle(
    IPC.PROJECT_PATCH_INFO,
    async (_e, { projectFolder, info }: { projectFolder: string; info: Partial<Project['info']> }) => {
      const jsonPath = path.join(projectFolder, 'project.json');
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(raw) as Project;
      data.info = { ...data.info, ...info };
      if (data.info.categories) {
        const pruned: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.info.categories)) {
          const s = (v ?? '').trim();
          if (s) pruned[k] = s;
        }
        if (Object.keys(pruned).length) data.info.categories = pruned;
        else delete data.info.categories;
      }
      data.updatedAt = new Date().toISOString();
      await fs.writeFile(jsonPath, JSON.stringify(stripRuntime(data), null, 2), 'utf-8');
      return { saved: jsonPath, info: data.info };
    },
  );

  ipcMain.handle(IPC.PROJECT_DELETE, async (_e, projectFolder: string) => {
    await fs.rm(projectFolder, { recursive: true, force: true });
    return { deleted: projectFolder };
  });

  ipcMain.handle(IPC.PROJECT_OPEN_FOLDER, async (_e, folder: string) => {
    const err = await shell.openPath(folder);
    return { error: err || null };
  });

  /* ---------------- 文件（v1.0.0：扁平复制到 files/，重名自动加序号） ---------------- */

  // 复制一个"已选定"的绝对路径文件到项目 files/（重名自动加序号，保证存储唯一）
  ipcMain.handle(
    IPC.FILE_COPY,
    async (_e, { src, projectRoot, suggestedBaseName }: { src: string; projectRoot: string; suggestedBaseName?: string }) => {
      const filesDir = path.join(projectRoot, FILES_DIR);
      await ensureDir(filesDir);
      const base = path.basename(src);
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      const wantStem = suggestedBaseName?.trim() || stem;
      // 重名自动加序号（对 files/ 内已有文件，保证存储唯一）
      let candidate = `${wantStem}${ext}`;
      let n = 2;
      while (await exists(path.join(filesDir, candidate))) {
        candidate = `${wantStem}_${n}${ext}`;
        n++;
      }
      const dest = path.join(filesDir, candidate);
      await copyFile(src, dest);
      const size = (await fs.stat(dest)).size;
      return {
        relativePath: relPosix(projectRoot, dest),
        baseName: path.basename(candidate, ext),
        fileName: candidate,
        format: getFormat(candidate),
        size,
      };
    },
  );

  // 下载（复制到用户选定位置）
  ipcMain.handle(
    IPC.FILE_DOWNLOAD,
    async (_e, { projectRoot, relativePath, suggestedName }: { projectRoot: string; relativePath: string; suggestedName?: string }) => {
      const src = path.join(projectRoot, relativePath);
      const res = await dialog.showSaveDialog({
        title: '下载文件',
        defaultPath: suggestedName
          ? path.join(os.homedir(), 'Downloads', suggestedName)
          : path.join(os.homedir(), 'Downloads', path.basename(relativePath)),
      });
      if (res.canceled || !res.filePath) return null;
      await copyFile(src, res.filePath);
      return { savedTo: res.filePath };
    },
  );

  // 用系统程序打开（doc/xls/pdf 等外部打开）
  ipcMain.handle(IPC.FILE_OPEN_EXTERNAL, async (_e, absPath: string) => {
    const err = await shell.openPath(absPath);
    return { error: err || null };
  });

  // 删除项目内文件（files/ 下物理删除）
  ipcMain.handle(IPC.FILE_DELETE, async (_e, { projectRoot, relativePath }: { projectRoot: string; relativePath: string }) => {
    await fs.rm(path.join(projectRoot, relativePath), { force: true });
    return { deleted: relativePath };
  });

  /* ---------------- 结构模板（阶段 + 插槽树） ---------------- */

  ipcMain.handle(IPC.TPL_LIST, async () => listTemplates());
  ipcMain.handle(IPC.TPL_GET, async (_e, id: string) => getTemplate(id));
  ipcMain.handle(IPC.TPL_CREATE, async (_e, input: TplCreateInput) => materializeTemplate(input));
  ipcMain.handle(IPC.TPL_UPDATE, async (_e, { id, input }: { id: string; input: TplCreateInput }) => updateTemplate(id, input));
  ipcMain.handle(IPC.TPL_DUPLICATE, async (_e, { id, name }: { id: string; name?: string }) => duplicateTemplate(id, name));
  ipcMain.handle(IPC.TPL_DELETE, async (_e, id: string) => deleteTemplate(id));
  ipcMain.handle(IPC.TPL_SAVE_FROM_PROJECT, async (_e, { projectFolder, name, description }: { projectFolder: string; name?: string; description?: string }) =>
    saveTemplateFromProject(projectFolder, name, description));
  ipcMain.handle(IPC.TPL_APPLY, async (_e, { rootDir, project, templateId }: { rootDir: string; project: Project; templateId: string }) =>
    applyTemplateToNewProject({ rootDir, project, templateId }));
}
