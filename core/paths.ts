/**
 * 项目内文件路径规则（主进程与渲染层共用，保证一致）。
 * v1.2.2 存储模型（嵌套镜像、自包含、可整体搬移）：
 *   项目根/
 *     project.json              ← 插槽树 + 文件清单（单一事实源）
 *     <顶层插槽名>/              ← 顶层插槽 = 一个文件夹
 *       <文件名>                 ← 该插槽下的文件
 *       <子插槽名>/              ← 子插槽 = 嵌套文件夹
 *         <文件名>
 *
 * 说明：插槽树直接镜像为磁盘目录（所见即所得）。FileEntry.path =
 *   <插槽文件夹相对路径>/<文件名>（如 阶段1/勘测大纲/任务书.docx）。
 * 加插槽→建文件夹；删插槽→递归删文件夹（含子插槽 + 全部文件）；改插槽名→改文件夹名（级联）。
 * 兼容：加载旧项目（文件在扁平 files/ 下）时自动迁移到嵌套结构（见 ipc.ts PROJECT_LOAD）。
 */

/** 文件名净化（保留 CJK，替换非法字符） */
export function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
}

/** 插槽文件夹路径（相对项目根）：按插槽名层级拼接。例：["阶段1","勘测大纲"] → "阶段1/勘测大纲" */
export function slotFolderRelPath(slotNames: string[]): string {
  return slotNames.map(sanitize).join('/');
}

/** 文件相对路径：<插槽文件夹>/<文件名>。slotNames 为空（理论不会发生）时退化为项目根下。 */
export function fileRelPath(slotNames: string[], fileName: string): string {
  const folder = slotFolderRelPath(slotNames);
  return folder ? `${folder}/${sanitize(fileName)}` : sanitize(fileName);
}
