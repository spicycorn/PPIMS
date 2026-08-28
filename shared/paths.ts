/**
 * 项目内文件路径规则（主进程与渲染层共用，保证一致）。
 * 目录结构（设计文档 2.5）：
 *   项目根/
 *     project.json
 *     templates/                     ← 模板
 *     <NN>_<阶段名>/<槽位名>/<文件>   ← 阶段文件夹内按槽位存文件实例
 *     日常管理/                       ← 未归类 / 日常管理
 *     _backup/                       ← 历史版本备份
 */

/** 文件名净化（保留 CJK，替换非法字符） */
export function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
}

/** 阶段文件夹名：01_项目立项（order 从 0 起） */
export function stageFolderName(order: number, name: string): string {
  return `${String(order + 1).padStart(2, '0')}_${sanitize(name)}`;
}

/** 阶段文件夹的 POSIX 相对路径 */
export function stageDir(order: number, name: string): string {
  return stageFolderName(order, name);
}

/** 槽位文件夹相对路径（阶段目录 + 槽位名） */
export function slotDir(stageOrder: number, stageName: string, slotName: string): string {
  return `${stageDir(stageOrder, stageName)}/${sanitize(slotName)}`;
}

/** 未分类 / 日常管理目录 */
export const DAILY_DIR = '日常管理';

/** 历史版本备份目录 */
export const BACKUP_DIR = '_backup';

/** 模板目录 */
export const TEMPLATES_DIR = 'templates';
