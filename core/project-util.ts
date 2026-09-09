/**
 * 项目工具（主进程共享）。
 * - stripRuntime：去掉 rootPath（运行时绝对路径），使 project.json 可搬移、不绑机器。
 * - ensureSlotFolders：递归建插槽文件夹（嵌套镜像），供 ipc.ts / template-service.ts 复用。
 * 从 ipc.ts 提取为共享模块，避免循环依赖与重复定义。
 */
import path from 'node:path';
import type { Project, Slot } from './types';
import { sanitize } from './paths';
import { ensureDir } from './services/fs';

export function stripRuntime(project: Project): Project {
  const { rootPath: _omit, ...rest } = project;
  void _omit;
  return { ...rest, rootPath: '' };
}

/** 递归建插槽文件夹（嵌套镜像）：每个插槽 = 一个文件夹，子插槽 = 嵌套。空插槽也建（占位）。 */
export async function ensureSlotFolders(projectRoot: string, slots: Slot[]): Promise<void> {
  for (const s of slots) {
    const dir = path.join(projectRoot, sanitize(s.name));
    await ensureDir(dir);
    await ensureSlotFolders(dir, s.subSlots);
  }
}

/** 插槽文件夹相对路径（按名链拼接）：如 ["阶段1","勘测大纲"] → "阶段1/勘测大纲"。 */
export function slotFolderRel(slotNames: string[]): string {
  return slotNames.map(sanitize).join('/');
}
