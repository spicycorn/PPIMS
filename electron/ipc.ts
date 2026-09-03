/**
 * IPC 处理层：把渲染层请求落到 Node/Electron 主进程能力（文件、对话框、Word/Excel 引擎、导入）。
 * 全部基于本地 Node fs 与 jszip/xlsx，离线可用、不依赖任何云服务。
 */
import { ipcMain, dialog, shell } from 'electron';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IPC, type LibraryScanResult } from './ipc-channels';
import { ensureDir, copyFile } from './services/fs';
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
import type { Project, TplCreateInput, RootConfig, ScannedCandidate, ScanImportInput } from '../shared/types';
import { PRESET_STAGES } from '../shared/types';
import { sanitize, stageFolderName, TEMPLATES_DIR, DAILY_DIR, BACKUP_DIR } from '../shared/paths';
import { walkTree, matchStage, type ScanTreeNode } from '../shared/scan';
import { normalizeDimensions } from '../shared/classify';

/* ---------------- 工具 ---------------- */

/** POSIX 相对路径（跨平台一致，保证项目文件夹可搬移） */
function relPosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

// ensureDir / copyFile 统一从 ./services/fs 导入（与 template-service 共用）

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

  /* ---------------- 根配置（分类维度，2.9） ---------------- */

  // 读取 <root>/ppims.json；不存在返回空维度（不预置业务）
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

  // 保存维度定义（先 normalize，防非法 id/重名/超量）
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

  // 轻量打补项目信息（如分类取值）：读 → 合并 info → 写回，不整对象覆盖
  ipcMain.handle(
    IPC.PROJECT_PATCH_INFO,
    async (_e, { projectFolder, info }: { projectFolder: string; info: Partial<Project['info']> }) => {
      const jsonPath = path.join(projectFolder, 'project.json');
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(raw) as Project;
      data.info = { ...data.info, ...info };
      // 规整分类取值：只剔除空值（键的合法性由渲染层按维度定义校验后传入，见 2.9 惰性清理）
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

  /* ---------------- 多层级自动扫描 + 逐条导入（2.10，v0.3.0 全程递归） ---------------- */

  // 性能保护上限：递归深度（v0.3.0 提到 12，覆盖绝大多数真实项目树）、扫描目录总数、单目录列出文件数
  const SCAN_MAX_DEPTH = 12;
  const SCAN_MAX_DIRS = 8000;
  const SCAN_MAX_LISTED = 800;

  // 跳过这些目录（系统/缓存/依赖，避免误报与无谓遍历）
  const SCAN_SKIP_DIRS = new Set([
    'node_modules', '.git', '.hg', '.svn', '__pycache__', '.venv', 'venv',
    'dist', 'dist-electron', 'build', 'out', '.cache', '.next', '.nuxt',
  ]);

  // 浅层列出一个目录的直接子项（目录+文件），不读任何文件内容
  async function shallowList(dir: string): Promise<{ subdirs: string[]; files: string[] }> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const subdirs: string[] = [];
    const files: string[] = [];
    for (const e of entries) {
      if (e.isDirectory()) subdirs.push(e.name);
      else if (e.isFile()) files.push(e.name);
    }
    return { subdirs, files: files.slice(0, SCAN_MAX_LISTED) };
  }

  // 递归扫描（v0.3.0：全程下钻、不再"高置信即停"；命中候选仍继续找嵌套项目；
  // 识别/去重纯逻辑走 shared/scan.ts walkTree，可单测、不硬编码业务）
  ipcMain.handle(
    IPC.SCAN_PROJECTS,
    async (_e, { rootDir }: { rootDir: string }) => {
      const ctx = { scannedDirs: 0, truncated: false };

      // 按"目录树"惰性列出（深度/规模保护），供 walkTree 纯逻辑消费
      async function buildTree(dir: string, depth: number): Promise<ScanTreeNode | null> {
        if (depth > SCAN_MAX_DEPTH || ctx.scannedDirs >= SCAN_MAX_DIRS) {
          ctx.truncated = true;
          return null;
        }
        ctx.scannedDirs++;
        let subdirs: string[];
        let files: string[];
        try {
          ({ subdirs, files } = await shallowList(dir));
        } catch {
          return null; // 无权限/不存在，跳过
        }
        const name = path.basename(dir) || dir;
        const node: ScanTreeNode = {
          name,
          isPPIMS: files.includes('project.json'),
          files,
          subdirs: [],
        };
        for (const sd of subdirs) {
          if (SCAN_SKIP_DIRS.has(sd)) continue;
          const child = await buildTree(path.join(dir, sd), depth + 1);
          if (child) node.subdirs.push(child);
        }
        return node;
      }

      const tree = await buildTree(rootDir, 1);
      if (!tree) {
        return { root: rootDir, candidates: [], truncated: ctx.truncated, scannedDirs: ctx.scannedDirs };
      }

      // walkTree 产出候选（relPath 为相对扫描根的路径，'.'=扫描根本身）
      const relCandidates = walkTree(tree);
      // relPath → 绝对路径（导入用）
      const candidates: ScannedCandidate[] = relCandidates.map((c) => ({
        ...c,
        path: c.relPath === '.' ? rootDir : path.join(rootDir, c.relPath),
      }));

      // 强候选优先、同强度按相对路径排序，稳定展示
      candidates.sort((a, b) =>
        a.strength === b.strength
          ? a.relPath.localeCompare(b.relPath, 'zh-CN')
          : a.strength === 'strong'
            ? -1
            : 1,
      );
      return { root: rootDir, candidates, truncated: ctx.truncated, scannedDirs: ctx.scannedDirs };
    },
  );

  // 逐条导入：把确认后的候选复制为 PPIMS 自包含项目（不改原文件、不覆盖已有）
  ipcMain.handle(
    IPC.SCAN_IMPORT,
    async (_e, input: ScanImportInput) => {
      const { sourceDir, info, subdirStage, rootDir, stages } = input;
      // 生成自包含文件夹（名称_编号）
      const folderName = sanitize(`${info.name}_${info.code || info.name}`);
      const folder = path.join(rootDir, folderName);
      if (await exists(folder)) {
        throw new Error(`项目文件夹已存在：${folderName}（换一个名称或编号）`);
      }
      await ensureDir(folder);
      await ensureDir(path.join(folder, TEMPLATES_DIR));
      await ensureDir(path.join(folder, DAILY_DIR));
      await ensureDir(path.join(folder, BACKUP_DIR));

      // 预置阶段（共用 shared PRESET_STAGES，与 createDefaultProject 一致，不重复硬编码）
      const presetStages = PRESET_STAGES;
      const stageOrderName = presetStages.map((s) => s.name);
      const project: Project = {
        id: `proj_${Date.now().toString(36)}`,
        info: { ...info, categories: info.categories },
        rootPath: '',
        stages: presetStages.map((s, i) => ({
          id: `stage_${i}_${Date.now().toString(36)}`,
          info: { name: s.name, description: s.description, startTime: '' },
          slots: [],
          weight: 1,
          order: i,
        })),
        templates: [],
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const data = stripRuntime(project);
      await fs.writeFile(path.join(folder, 'project.json'), JSON.stringify(data, null, 2), 'utf-8');

      // 把候选的"资料"按"最近祖先子目录"归并到阶段目录递归复制（v0.3.0 嵌套结构不丢失）
      // 规则：
      // - 文件所在"第一个子目录"（最近祖先）决定归入哪个阶段（用户 subdirStage 指定，或按名匹配阶段，或"日常管理"）；
      // - 该子目录之下的更深层结构按原相对路径保留（如 策划/大纲/XX.docx → <阶段>/策划/大纲/XX.docx）；
      // - 顶层散文件 → 日常管理。
      const copied: Array<{ from: string; to: string }> = [];

      // 子目录名 → 目标阶段文件夹名（用户指定优先，否则按名匹配阶段，否则日常管理）
      const targetFolderForSubdir = (sdName: string): string => {
        const mapping = subdirStage.find((m) => m.name === sdName);
        const stageId = mapping?.stageId || '';
        const stageName = stages.find((s) => s.id === stageId)?.name;
        const order = stageName ? stageOrderName.indexOf(stageName) : -1;
        if (order >= 0) return stageFolderName(order, stageName!);
        // 用户未指定 → 用阶段名匹配（matchStage 纯逻辑）
        const matched = matchStage(sdName, stages);
        if (matched) {
          const mName = stages.find((s) => s.id === matched)?.name;
          const mOrder = mName ? stageOrderName.indexOf(mName) : -1;
          if (mOrder >= 0) return stageFolderName(mOrder, mName!);
        }
        return DAILY_DIR;
      };

      // 递归收集源目录所有文件（带相对路径），带深度/规模保护
      const allFiles: Array<{ rel: string }> = [];
      const impCaps = { scannedDirs: 0, truncated: false };
      const IMPORT_MAX_DEPTH = 12;
      const IMPORT_MAX_DIRS = 8000;
      async function collectFiles(dir: string, rel: string, depth: number): Promise<void> {
        if (depth > IMPORT_MAX_DEPTH || impCaps.scannedDirs >= IMPORT_MAX_DIRS) {
          impCaps.truncated = true;
          return;
        }
        impCaps.scannedDirs++;
        let entries: Dirent<string>[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          if (ent.isDirectory()) {
            await collectFiles(path.join(dir, ent.name), rel ? `${rel}/${ent.name}` : ent.name, depth + 1);
          } else if (ent.isFile()) {
            allFiles.push({ rel: rel ? `${rel}/${ent.name}` : ent.name });
          }
        }
      }
      await collectFiles(sourceDir, '', 1);

      // 逐文件复制：按"最近祖先子目录"归并阶段，保留更深层相对结构
      for (const { rel } of allFiles) {
        const parts = rel.split('/');
        const fileBase = parts[parts.length - 1];
        // 最近祖先子目录 = 第一个路径段（若文件在顶层则无）
        const ancestorSubdir = parts.length > 1 ? parts[0] : '';
        const targetFolder = ancestorSubdir ? targetFolderForSubdir(ancestorSubdir) : DAILY_DIR;
        const destDir = path.join(folder, targetFolder, ...(ancestorSubdir ? [sanitize(ancestorSubdir)] : []));
        const dest = path.join(destDir, sanitize(fileBase));
        const src = path.join(sourceDir, ...parts);
        try {
          await ensureDir(destDir);
          await copyFile(src, dest);
          copied.push({ from: rel, to: relPosix(folder, dest) });
        } catch {
          /* 单文件失败不阻断整体 */
        }
      }

      return { folder, folderName, rootPath: folder, copiedCount: copied.length };
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
