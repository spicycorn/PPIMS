/**
 * 全局项目架构模板服务（主进程）。
 * - 存储位置：app.getPath('userData')/ppims-templates/<id>/
 *     template.json   ← ProjectTemplate 结构（阶段+槽位+类型+模板文件引用）
 *     templates/      ← 各槽位的模板文件（.docx/.xlsx），从源拷入，自包含
 * - 职责：列表 / 新建(编辑器) / 从项目另存 / 编辑 / 复制 / 删除 / 应用(生成新项目结构)。
 * - 应用是原子的：建项目文件夹 + 拷模板文件进新项目 templates/ + 槽位链接各自副本。
 * 设计依据：用户"全局模板库、完整带属性、新建项目时套用"的需求。
 */
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Project,
  ProjectTemplate,
  ProjectTemplateSlot,
  ProjectTemplateStage,
  Slot,
  Stage,
  Template,
  TplCreateInput,
  TplStageInput,
  TplSlotInput,
} from '../types';
import { sanitize, TEMPLATES_DIR, stageFolderName } from '../paths';
import { projectToTemplateStages } from '../template-mapping';
import { ensureDir, copyFile } from './fs';

/* 输入类型（TplSlotInput/TplStageInput/TplCreateInput）定义在 shared/types.ts，
   渲染层 / preload / api.d.ts 均可安全引用（不引入 electron）。 */

/* ---------------- 工具 ---------------- */

function uid(prefix = 'id'): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {
    /* ignore */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ensureDir / copyFile 统一从 ./fs 导入（与 ipc.ts 共用）

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** 全局模板根目录（跨所有项目根目录共享） */
function templatesRoot(): string {
  return path.join(app.getPath('userData'), 'ppims-templates');
}

function dirOf(id: string): string {
  return path.join(templatesRoot(), id);
}

function jsonPathOf(id: string): string {
  return path.join(dirOf(id), 'template.json');
}

function filesDirOf(id: string): string {
  return path.join(dirOf(id), 'templates');
}

/* ---------------- 读取 ---------------- */

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const root = templatesRoot();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: ProjectTemplate[] = [];
  for (const id of entries) {
    const dir = path.join(root, id);
    if (!(await isDir(dir))) continue;
    try {
      const raw = await fs.readFile(path.join(dir, 'template.json'), 'utf-8');
      out.push(JSON.parse(raw) as ProjectTemplate);
    } catch {
      /* 损坏的模板跳过 */
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return out;
}

export async function getTemplate(id: string): Promise<ProjectTemplate> {
  const raw = await fs.readFile(jsonPathOf(id), 'utf-8');
  return JSON.parse(raw) as ProjectTemplate;
}

/* ---------------- 落盘（新建 / 编辑共用） ---------------- */

/**
 * 落盘单个槽位（新建 / 编辑共用）：
 * - 有 templateFileSrc（新挂/换文件）→ 拷入 templates/，引用新文件
 * - 有 keepTemplateFile（编辑时保留原文件）→ 只引用 templates/ 下已有文件，不重拷
 * - 都没有 → 该槽位不带模板文件
 */
async function buildSlot(inSlot: TplSlotInput, order: number, filesDir: string): Promise<ProjectTemplateSlot> {
  const slot: ProjectTemplateSlot = {
    id: uid('slot'),
    name: inSlot.name.trim() || `槽位${order + 1}`,
    format: inSlot.format,
    necessity: inSlot.necessity,
    reviewRequired: inSlot.reviewRequired,
    order,
  };
  if (inSlot.templateFileSrc) {
    const baseName = sanitize(inSlot.templateFileName || path.basename(inSlot.templateFileSrc));
    await copyFile(inSlot.templateFileSrc, path.join(filesDir, baseName));
    slot.templateFile = path.basename(baseName);
    slot.templateFileName = baseName;
  } else if (inSlot.keepTemplateFile) {
    slot.templateFile = inSlot.keepTemplateFile;
    slot.templateFileName = path.basename(inSlot.keepTemplateFile);
  }
  return slot;
}

/**
 * 把蓝图结构（含源文件路径）落成全局模板：
 * 拷模板文件进 templates/ + 写 template.json，返回创建/更新后的 ProjectTemplate。
 */
export async function materializeTemplate(input: TplCreateInput): Promise<ProjectTemplate> {
  if (!input.name.trim()) throw new Error('模板名称不能为空');
  const id = uid('tpl');
  const filesDir = filesDirOf(id);
  await ensureDir(filesDir);

  const stages: ProjectTemplateStage[] = [];
  for (let si = 0; si < input.stages.length; si++) {
    const inStage = input.stages[si];
    const slots: ProjectTemplateSlot[] = [];
    for (let sl = 0; sl < inStage.slots.length; sl++) {
      slots.push(await buildSlot(inStage.slots[sl], sl, filesDir));
    }
    stages.push({
      id: uid('stg'),
      name: inStage.name.trim() || `阶段${si + 1}`,
      description: inStage.description,
      slots,
      order: si,
    });
  }

  const tpl: ProjectTemplate = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || '',
    stages,
    createdAt: now(),
    updatedAt: now(),
  };
  await fs.writeFile(jsonPathOf(id), JSON.stringify(tpl, null, 2), 'utf-8');
  return tpl;
}

/** 从现有项目另存为全局模板：抓阶段+槽位+各槽位已挂的模板文件 */
export async function saveTemplateFromProject(
  projectFolder: string,
  name?: string,
  description?: string,
): Promise<ProjectTemplate> {
  const raw = await fs.readFile(path.join(projectFolder, 'project.json'), 'utf-8');
  const project = JSON.parse(raw) as Project;
  const projectName = project.info?.name || '项目';

  const stages = projectToTemplateStages(project);
  // 把模板相对路径解析为绝对源路径（纯映射不含绝对路径，这里补）
  for (const st of stages) {
    for (const sl of st.slots) {
      if (sl.templateFileSrc && !path.isAbsolute(sl.templateFileSrc)) {
        sl.templateFileSrc = path.join(projectFolder, sl.templateFileSrc);
      }
    }
  }

  return materializeTemplate({
    name: name?.trim() || `模板_${projectName}`,
    description: description?.trim() || `从项目「${projectName}」另存`,
    stages,
  });
}

/* ---------------- 编辑 / 复制 / 删除 ---------------- */

/** 编辑模板（名称/描述/结构）：重写 template.json；结构变化时同步模板文件 */
export async function updateTemplate(id: string, input: TplCreateInput): Promise<ProjectTemplate> {
  const existing = await getTemplate(id);
  const updated: ProjectTemplate = {
    ...existing,
    name: input.name.trim() || existing.name,
    description: input.description?.trim() || '',
    stages: (await rebuildStages(id, input.stages, existing.updatedAt)),
    updatedAt: now(),
  };
  await fs.writeFile(jsonPathOf(id), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

async function rebuildStages(
  id: string,
  inputStages: TplStageInput[],
  baseUpdatedAt: string,
): Promise<ProjectTemplateStage[]> {
  const filesDir = filesDirOf(id);
  const stages: ProjectTemplateStage[] = [];
  for (let si = 0; si < inputStages.length; si++) {
    const inStage = inputStages[si];
    const slots: ProjectTemplateSlot[] = [];
    for (let sl = 0; sl < inStage.slots.length; sl++) {
      slots.push(await buildSlot(inStage.slots[sl], sl, filesDir));
    }
    stages.push({
      id: uid('stg'),
      name: inStage.name.trim() || `阶段${si + 1}`,
      description: inStage.description,
      slots,
      order: si,
    });
  }
  void baseUpdatedAt;
  return stages;
}

/** 复制模板：整目录深拷（template.json + templates/） */
export async function duplicateTemplate(id: string, newName?: string): Promise<ProjectTemplate> {
  const src = dirOf(id);
  const newId = uid('tpl');
  const dest = dirOf(newId);
  await ensureDir(dest);
  // 拷 template.json（改写 id/name/时间）
  const raw = await fs.readFile(jsonPathOf(id), 'utf-8');
  const tpl = JSON.parse(raw) as ProjectTemplate;
  const copy: ProjectTemplate = {
    ...tpl,
    id: newId,
    name: newName?.trim() || `${tpl.name}_副本`,
    createdAt: now(),
    updatedAt: now(),
  };
  await fs.writeFile(jsonPathOf(newId), JSON.stringify(copy, null, 2), 'utf-8');
  // 拷 templates/ 下所有文件
  let files: string[] = [];
  try {
    files = await fs.readdir(path.join(src, 'templates'));
  } catch {
    files = [];
  }
  for (const f of files) {
    await copyFile(path.join(src, 'templates', f), path.join(dest, 'templates', f));
  }
  return copy;
}

export async function deleteTemplate(id: string): Promise<{ deleted: string }> {
  await fs.rm(dirOf(id), { recursive: true, force: true });
  return { deleted: dirOf(id) };
}

/* ---------------- 应用：生成新项目结构 ---------------- */

export interface ApplyResult {
  folder: string;
  folderName: string;
  rootPath: string;
  appliedTemplateId: string;
}

/**
 * 用全局模板生成一个新项目：
 * 1. 建项目文件夹 + 阶段目录（同 project:create）
 * 2. 把模板各槽位模板文件拷进新项目 templates/，槽位链接各自副本
 * 3. 写 project.json
 * 原子完成，渲染层拿回 folder 即可加载。
 */
export async function applyTemplateToNewProject(params: {
  rootDir: string;
  project: Project;
  templateId: string;
}): Promise<ApplyResult> {
  const { rootDir, project, templateId } = params;
  const tpl = await getTemplate(templateId);

  await ensureDir(rootDir);
  const folderName = sanitize(`${project.info.name}_${project.info.code}`);
  const folder = path.join(rootDir, folderName);
  try {
    await fs.access(folder);
    throw new Error(`项目文件夹已存在：${folderName}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  await ensureDir(folder);
  await ensureDir(path.join(folder, TEMPLATES_DIR));

  // 阶段目录 + 生成带模板文件的 stages
  const newTemplates: Template[] = [];
  const newStages: Stage[] = [];

  for (let si = 0; si < tpl.stages.length; si++) {
    const tStage = tpl.stages[si];
    const stageFolder = path.join(folder, stageFolderName(si, tStage.name));
    await ensureDir(stageFolder);

    const slots: Slot[] = [];
    for (let sl = 0; sl < tStage.slots.length; sl++) {
      const tSlot = tStage.slots[sl];
      const slot: Slot = {
        id: uid('slot'),
        name: tSlot.name,
        format: tSlot.format,
        necessity: tSlot.necessity,
        reviewRequired: tSlot.reviewRequired,
        files: [],
        order: sl,
      };
      // 拷模板文件进新项目 templates/，并链接
      if (tSlot.templateFile && tSlot.templateFileName) {
        const srcAbs = path.join(filesDirOf(templateId), tSlot.templateFile);
        const destBase = sanitize(tSlot.templateFileName);
        const destAbs = path.join(folder, TEMPLATES_DIR, destBase);
        await copyFile(srcAbs, destAbs);
        const newTmpl: Template = {
          id: uid('tmpl'),
          name: tSlot.templateFileName,
          format: tSlot.format,
          path: `${TEMPLATES_DIR}/${destBase}`,
          createdAt: now(),
          updatedAt: now(),
        };
        newTemplates.push(newTmpl);
        slot.templateId = newTmpl.id;
      }
      slots.push(slot);
    }
    newStages.push({
      id: uid('stage'),
      info: {
        name: tStage.name,
        description: tStage.description,
        startTime: now().slice(0, 10),
      },
      slots,
      weight: 1,
      order: si,
    });
  }

  const finalProject: Project = {
    ...project,
    stages: newStages,
    templates: newTemplates,
  };
  const { rootPath: _omit, ...rest } = finalProject;
  void _omit;
  await fs.writeFile(path.join(folder, 'project.json'), JSON.stringify({ ...rest, rootPath: '' }, null, 2), 'utf-8');

  return { folder, folderName, rootPath: folder, appliedTemplateId: templateId };
}
