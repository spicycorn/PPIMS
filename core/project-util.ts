/**
 * 项目工具（主进程共享）。
 * stripRuntime：去掉 rootPath（运行时绝对路径），使 project.json 可搬移、不绑机器。
 * 从 ipc.ts 提取为共享模块，供 ipc.ts / template-service.ts 复用（避免循环依赖与重复定义）。
 */
import type { Project } from './types';

export function stripRuntime(project: Project): Project {
  const { rootPath: _omit, ...rest } = project;
  void _omit;
  return { ...rest, rootPath: '' };
}
