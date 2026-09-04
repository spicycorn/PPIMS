/**
 * 渲染层可见的 window.api 类型声明（与 preload.ts 的 Api 对齐，不引入 electron 类型）。
 */
import type { Project, StructureTemplate, TplCreateInput, RootConfig } from './types';

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

export interface FileCopyResult {
  relativePath: string;
  baseName: string;
  fileName: string;
  format: string;
  size: number;
}

export interface Api {
  openDialog(opts?: OpenDialogOpts): Promise<string | string[] | null>;
  saveDialog(opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;

  getRootConfig(rootDir: string): Promise<RootConfig>;
  saveRootConfig(rootDir: string, config: RootConfig): Promise<{ saved: string; dimensions: RootConfig['dimensions'] }>;

  persistRootDir(rootDir: string): Promise<{ saved: string }>;
  getLastRootDir(): Promise<string>;

  /** 从悬浮框请求显示主窗口（点击未归档项目时）。 */
  trayBoxShowMain(): Promise<{ shown: boolean }>;
  /** 主窗口"最小化到托盘"（隐藏主窗口，从系统托盘调出）。 */
  trayBoxHideMain(): Promise<{ hidden: boolean }>;

  listProjects(rootDir: string): Promise<ProjectListItem[]>;
  createProject(rootDir: string, project: Project): Promise<{ folder: string; folderName: string; rootPath: string }>;
  loadProject(projectFolder: string): Promise<{ project: Project; rootPath: string }>;
  saveProject(projectFolder: string, project: Project): Promise<{ saved: string }>;
  patchProjectInfo(projectFolder: string, info: Partial<Project['info']>): Promise<{ saved: string; info: Project['info'] }>;
  deleteProject(projectFolder: string): Promise<{ deleted: string }>;
  openFolder(folder: string): Promise<{ error: string | null }>;

  copyFile(src: string, projectRoot: string, suggestedBaseName?: string): Promise<FileCopyResult>;
  downloadFile(projectRoot: string, relativePath: string, suggestedName?: string): Promise<{ savedTo: string } | null>;
  openFileExternal(absPath: string): Promise<{ error: string | null }>;
  deleteFile(projectRoot: string, relativePath: string): Promise<{ deleted: string }>;

  // 结构模板（阶段 + 插槽树）
  listTemplates(): Promise<StructureTemplate[]>;
  getTemplate(id: string): Promise<StructureTemplate>;
  createTemplate(input: TplCreateInput): Promise<StructureTemplate>;
  updateTemplate(id: string, input: TplCreateInput): Promise<StructureTemplate>;
  duplicateTemplate(id: string, name?: string): Promise<StructureTemplate>;
  deleteTemplate(id: string): Promise<{ deleted: string }>;
  saveTemplateFromProject(projectFolder: string, name?: string, description?: string): Promise<StructureTemplate>;
  applyTemplate(rootDir: string, project: Project, templateId: string): Promise<{ folder: string; folderName: string; rootPath: string; appliedTemplateId: string }>;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
