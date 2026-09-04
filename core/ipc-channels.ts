/**
 * IPC 通道名与参数/返回类型（主进程与渲染层共用的契约）。
 */
import type { Project } from './types';

export const IPC = {
  // 对话框
  OPEN_DIALOG: 'dialog:open',
  SAVE_DIALOG: 'dialog:save',

  // 根配置（分类维度）
  ROOT_CONFIG_GET: 'root:config:get',
  ROOT_CONFIG_SAVE: 'root:config:save',

  // 最近使用的根目录（持久化，供悬浮框等独立窗口读取）
  ROOT_DIR_PERSIST: 'root:dir:persist',
  ROOT_DIR_GET_LAST: 'root:dir:getLast',

  // 项目
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_LOAD: 'project:load',
  PROJECT_SAVE: 'project:save',
  PROJECT_PATCH_INFO: 'project:patchInfo',
  PROJECT_DELETE: 'project:delete',
  PROJECT_OPEN_FOLDER: 'project:openFolder',

  // 文件（v1.1.0：扁平 files/，只外部预览/编辑 + 下载）
  FILE_COPY: 'file:copy',
  FILE_DOWNLOAD: 'file:download',
  FILE_OPEN_EXTERNAL: 'file:openExternal',
  FILE_DELETE: 'file:delete',

  // 结构模板（阶段 + 插槽树）
  TPL_LIST: 'template:list',
  TPL_GET: 'template:get',
  TPL_CREATE: 'template:create',
  TPL_UPDATE: 'template:update',
  TPL_DUPLICATE: 'template:duplicate',
  TPL_DELETE: 'template:delete',
  TPL_SAVE_FROM_PROJECT: 'template:saveFromProject',
  TPL_APPLY: 'template:apply',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export interface ProjectCreateParams {
  rootDir: string;
  project: Project;
}

export interface ProjectLoadResult {
  project: Project;
  rootPath: string;
}
