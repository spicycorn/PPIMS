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

  // 项目
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_LOAD: 'project:load',
  PROJECT_SAVE: 'project:save',
  PROJECT_PATCH_INFO: 'project:patchInfo',
  PROJECT_DELETE: 'project:delete',
  PROJECT_OPEN_FOLDER: 'project:openFolder',

  // 文件（v1.0.0：扁平 files/，重名加序号）
  FILE_COPY: 'file:copy',
  FILE_DOWNLOAD: 'file:download',
  FILE_OPEN_EXTERNAL: 'file:openExternal',
  FILE_DELETE: 'file:delete',
  FILE_READ: 'file:read',

  // Word（docx 系原位编辑）
  DOCX_RECOGNIZE: 'docx:recognize',
  DOCX_APPLY: 'docx:apply',

  // Excel（xlsx 系原位编辑）
  XLSX_RECOGNIZE: 'xlsx:recognize',
  XLSX_APPLY: 'xlsx:apply',

  // CSV（原位编辑）
  CSV_RECOGNIZE: 'csv:recognize',
  CSV_APPLY: 'csv:apply',

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

/** Word 识别结果（渲染层用） */
export interface DocxRecognizeResult {
  paragraphs: Array<{
    index: number;
    text: string;
    isHeading: boolean;
    headingLevel: number;
    inTable: boolean;
  }>;
  tables: Array<{ index: number; headers: string[]; rows: number; cols: number }>;
  fullText: string;
}

/** Excel 识别结果 */
export interface XlsxRecognizeResult {
  sheetNames: string[];
  active: string;
  cells: Array<{ r: number; c: number; v: string }>;
  rows: number;
  cols: number;
  fullText: string;
}

/** CSV 识别结果 */
export interface CsvRecognizeResult {
  sheetNames: string[];
  active: string;
  cells: Array<{ r: number; c: number; v: string }>;
  rows: number;
  cols: number;
  fullText: string;
}

export interface ProjectCreateParams {
  rootDir: string;
  project: Project;
}

export interface ProjectLoadResult {
  project: Project;
  rootPath: string;
}
