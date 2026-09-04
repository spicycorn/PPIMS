/**
 * 全局结构模板服务（主进程）。
 * - 存储位置：app.getPath('userData')/ppims-templates/<id>/template.json
 *     （纯结构：阶段 + 插槽树，无任何模板文件）
 * - 职责：列表 / 新建 / 从项目另存 / 编辑 / 复制 / 删除 / 应用(生成新项目插槽树)。
 * 设计依据：v1.0.0 "结构模板 = 阶段 + 插槽树（不含模板文件）"，建项时套用结构免去逐一手填。
 */
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Project,
  Slot,
  StructureTemplate,
  TplCreateInput,
  TplSlotInput,
} from '../types';
import { sanitize } from '../paths';
import { projectToTemplateStructure } from '../template-mapping';
import { ensureDir } from './fs';
import { PRESET_TEMPLATES } from '../presets';

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

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function templatesRoot(): string {
  return path.join(app.getPath('userData'), 'ppims-templates');
}

function dirOf(id: string): string {
  return path.join(templatesRoot(), id);
}

function jsonPathOf(id: string): string {
  return path.join(dirOf(id), 'template.json');
}

/* ---------------- 结构树构建（输入 → 新插槽树） ---------------- */

/** 把结构模板输入（纯结构）构建为新项目的插槽树（id 全新，files 为空）。 */
export function slotsFromStructure(input: TplSlotInput[]): Slot[] {
  return input.map((inSlot, i) => ({
    id: uid('slot'),
    name: inSlot.name.trim() || `插槽${i + 1}`,
    files: [],
    subSlots: slotsFromStructure(inSlot.subSlots),
    order: i,
  }));
}

/* ---------------- 读取 ---------------- */

export async function listTemplates(): Promise<StructureTemplate[]> {
  const root = templatesRoot();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: StructureTemplate[] = [];
  for (const id of entries) {
    const dir = path.join(root, id);
    if (!(await isDir(dir))) continue;
    try {
      const raw = await fs.readFile(path.join(dir, 'template.json'), 'utf-8');
      out.push(JSON.parse(raw) as StructureTemplate);
    } catch {
      /* 损坏的模板跳过 */
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return out;
}

/**
 * 启动时种入预置模板（软件自带一套，开箱即用）。
 * 幂等：按模板名去重，已存在则跳过；用户删除后下次启动会重新种入（保证"自带模板"）。
 * @return 本次新种入的模板数量
 */
export async function seedPresetTemplates(): Promise<number> {
  const existing = await listTemplates();
  const existingNames = new Set(existing.map((t) => t.name));
  let seeded = 0;
  for (const preset of PRESET_TEMPLATES) {
    if (existingNames.has(preset.name)) continue;
    await materializeTemplate({
      name: preset.name,
      description: preset.description,
      slots: preset.structure,
    });
    seeded++;
  }
  return seeded;
}

export async function getTemplate(id: string): Promise<StructureTemplate> {
  const raw = await fs.readFile(jsonPathOf(id), 'utf-8');
  return JSON.parse(raw) as StructureTemplate;
}

/* ---------------- 落盘（新建 / 编辑共用） ---------------- */

export async function materializeTemplate(input: TplCreateInput): Promise<StructureTemplate> {
  if (!input.name.trim()) throw new Error('模板名称不能为空');
  const id = uid('tpl');
  const dir = dirOf(id);
  await ensureDir(dir);
  const tpl: StructureTemplate = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || '',
    structure: input.slots.map((s) => ({ name: s.name, subSlots: s.subSlots.map((sub) => ({ name: sub.name, subSlots: [] })) })),
    createdAt: now(),
    updatedAt: now(),
  };
  await fs.writeFile(jsonPathOf(id), JSON.stringify(tpl, null, 2), 'utf-8');
  return tpl;
}

/** 从现有项目另存为结构模板：抓"阶段 + 插槽"树（纯结构，无文件）。 */
export async function saveTemplateFromProject(
  projectFolder: string,
  name?: string,
  description?: string,
): Promise<StructureTemplate> {
  const raw = await fs.readFile(path.join(projectFolder, 'project.json'), 'utf-8');
  const project = JSON.parse(raw) as Project;
  const projectName = project.info?.name || '项目';
  return materializeTemplate({
    name: name?.trim() || `结构_${projectName}`,
    description: description?.trim() || `从项目「${projectName}」另存`,
    slots: projectToTemplateStructure(project),
  });
}

/* ---------------- 编辑 / 复制 / 删除 ---------------- */

export async function updateTemplate(id: string, input: TplCreateInput): Promise<StructureTemplate> {
  const existing = await getTemplate(id);
  const updated: StructureTemplate = {
    ...existing,
    name: input.name.trim() || existing.name,
    description: input.description?.trim() || '',
    structure: input.slots.map((s) => ({ name: s.name, subSlots: s.subSlots.map((sub) => ({ name: sub.name, subSlots: [] })) })),
    updatedAt: now(),
  };
  await fs.writeFile(jsonPathOf(id), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export async function duplicateTemplate(id: string, newName?: string): Promise<StructureTemplate> {
  const src = await getTemplate(id);
  const newId = uid('tpl');
  const dest = dirOf(newId);
  await ensureDir(dest);
  const copy: StructureTemplate = {
    ...src,
    id: newId,
    name: newName?.trim() || `${src.name}_副本`,
    structure: src.structure.map((s) => ({
      name: s.name,
      subSlots: s.subSlots.map((sub) => ({ name: sub.name, subSlots: [] })),
    })),
    createdAt: now(),
    updatedAt: now(),
  };
  await fs.writeFile(jsonPathOf(newId), JSON.stringify(copy, null, 2), 'utf-8');
  return copy;
}

export async function deleteTemplate(id: string): Promise<{ deleted: string }> {
  await fs.rm(dirOf(id), { recursive: true, force: true });
  return { deleted: dirOf(id) };
}

/* ---------------- 应用：生成新项目插槽树 ---------------- */

export interface ApplyResult {
  folder: string;
  folderName: string;
  rootPath: string;
  appliedTemplateId: string;
}

/**
 * 用结构模板生成一个新项目（建项目文件夹 + 写带插槽树的 project.json，无文件）。
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

  const finalProject: Project = {
    ...project,
    slots: slotsFromStructure(tpl.structure),
    updatedAt: now(),
  };
  await fs.writeFile(path.join(folder, 'project.json'), JSON.stringify(finalProject, null, 2), 'utf-8');

  return { folder, folderName, rootPath: folder, appliedTemplateId: templateId };
}
