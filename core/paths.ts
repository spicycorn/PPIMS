/**
 * 项目内文件路径规则（主进程与渲染层共用，保证一致）。
 * v1.0.0 存储模型（扁平、自包含、可整体搬移）：
 *   项目根/
 *     project.json          ← 插槽树 + 文件清单（单一事实源）
 *     files/                ← 所有上传的文件（扁平存放）
 *       <文件名>             ← 按"自动编号后的显示名 + 扩展名"命名
 *
 * 说明：插槽树（含嵌套）与"插槽→文件"的归属关系都记录在 project.json 的
 * FileEntry 里；files/ 只是物理存放区，扁平化便于搬移、避免多级目录重命名/移动复杂度。
 */

/** 文件名净化（保留 CJK，替换非法字符） */
export function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
}

/** 文件物理存放目录（相对项目根） */
export const FILES_DIR = 'files';

/** 项目内文件的相对路径：files/<文件名> */
export function fileRelPath(fileName: string): string {
  return `${FILES_DIR}/${sanitize(fileName)}`;
}
