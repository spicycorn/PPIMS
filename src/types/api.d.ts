/**
 * 渲染层可见的 window.api 类型声明（与 electron/preload.ts 的 Api 对齐，但不引入 electron 类型）。
 */
import type { Project, ProjectTemplate, TplCreateInput } from '../../shared/types';

export interface OpenDialogOpts {
  title?: string;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiSelections?: boolean;
}

export interface ProjectListItem {
  name: string;
  folder: string;
  info: Project['info'] | null;
}

export interface FileCopyInResult {
  relativePath: string;
  baseName: string;
  size: number;
}

export interface Api {
  openDialog(opts?: OpenDialogOpts): Promise<string | string[] | null>;
  saveDialog(opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;

  listProjects(rootDir: string): Promise<ProjectListItem[]>;
  createProject(rootDir: string, project: Project): Promise<{ folder: string; folderName: string; rootPath: string }>;
  loadProject(projectFolder: string): Promise<{ project: Project; rootPath: string }>;
  saveProject(projectFolder: string, project: Project): Promise<{ saved: string }>;
  deleteProject(projectFolder: string): Promise<{ deleted: string }>;
  openFolder(folder: string): Promise<{ error: string | null }>;

  pickFileAndCopyIn(projectRoot: string, destDir: string, suggestedName?: string): Promise<FileCopyInResult | null>;
  copyFile(src: string, projectRoot: string, destDir: string, baseName: string): Promise<FileCopyInResult>;
  downloadFile(projectRoot: string, relativePath: string, suggestedName?: string): Promise<{ savedTo: string } | null>;
  readFile(absPath: string): Promise<Uint8Array>;

  recognizeDocx(absPath: string): Promise<any>;
  applyDocx(
    absPath: string,
    replacements: Array<{ oldText: string; newText: string }>,
    outputAbsPath?: string,
  ): Promise<{ written: string; applied: number; missed: string[] }>;

  recognizeXlsx(absPath: string): Promise<any>;
  applyXlsx(
    absPath: string,
    activeSheet: string,
    edits: Array<{ addr: string; value: string }>,
    outputAbsPath?: string,
  ): Promise<{ written: string; applied: number }>;

  importScan(libraryDir: string, stages: Array<{ id: string; name: string }>): Promise<any>;
  importCopy(params: any): Promise<{ copied: Array<{ from: string; to: string }> }>;

  // 项目架构模板（全局蓝图）
  listTemplates(): Promise<ProjectTemplate[]>;
  getTemplate(id: string): Promise<ProjectTemplate>;
  createTemplate(input: TplCreateInput): Promise<ProjectTemplate>;
  updateTemplate(id: string, input: TplCreateInput): Promise<ProjectTemplate>;
  duplicateTemplate(id: string, name?: string): Promise<ProjectTemplate>;
  deleteTemplate(id: string): Promise<{ deleted: string }>;
  saveTemplateFromProject(projectFolder: string, name?: string, description?: string): Promise<ProjectTemplate>;
  applyTemplate(rootDir: string, project: Project, templateId: string): Promise<{ folder: string; folderName: string; rootPath: string; appliedTemplateId: string }>;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
