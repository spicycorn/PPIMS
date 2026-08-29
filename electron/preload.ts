/**
 * 预加载脚本：通过 contextBridge 暴露类型化 API（window.api）给渲染层。
 * contextIsolation 开启、nodeIntegration 关闭 —— 渲染层不直接接触 Node，安全且可控。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Project, ProjectTemplate, TplCreateInput } from '../shared/types';

export interface OpenDialogOpts {
  title?: string;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiSelections?: boolean;
}

export interface Api {
  // 对话框
  openDialog(opts?: OpenDialogOpts): Promise<string | string[] | null>;
  saveDialog(opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>;

  // 项目
  listProjects(rootDir: string): Promise<Array<{ name: string; folder: string; info: Project['info'] | null }>>;
  createProject(rootDir: string, project: Project): Promise<{ folder: string; folderName: string; rootPath: string }>;
  loadProject(projectFolder: string): Promise<{ project: Project; rootPath: string }>;
  saveProject(projectFolder: string, project: Project): Promise<{ saved: string }>;
  deleteProject(projectFolder: string): Promise<{ deleted: string }>;
  openFolder(folder: string): Promise<{ error: string | null }>;

  // 文件
  pickFileAndCopyIn(projectRoot: string, destDir: string, suggestedName?: string): Promise<{ relativePath: string; baseName: string; size: number } | null>;
  copyFile(src: string, projectRoot: string, destDir: string, baseName: string): Promise<{ relativePath: string; baseName: string; size: number }>;
  downloadFile(projectRoot: string, relativePath: string, suggestedName?: string): Promise<{ savedTo: string } | null>;
  readFile(absPath: string): Promise<Uint8Array>;

  // Word
  recognizeDocx(absPath: string): Promise<any>;
  applyDocx(absPath: string, replacements: Array<{ oldText: string; newText: string }>, outputAbsPath?: string): Promise<{ written: string; applied: number; missed: string[] }>;

  // Excel
  recognizeXlsx(absPath: string): Promise<any>;
  applyXlsx(absPath: string, activeSheet: string, edits: Array<{ addr: string; value: string }>, outputAbsPath?: string): Promise<{ written: string; applied: number }>;

  // 导入
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

const api: Api = {
  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),

  listProjects: (rootDir) => ipcRenderer.invoke('project:list', rootDir),
  createProject: (rootDir, project) => ipcRenderer.invoke('project:create', { rootDir, project }),
  loadProject: (projectFolder) => ipcRenderer.invoke('project:load', projectFolder),
  saveProject: (projectFolder, project) => ipcRenderer.invoke('project:save', { projectFolder, project }),
  deleteProject: (projectFolder) => ipcRenderer.invoke('project:delete', projectFolder),
  openFolder: (folder) => ipcRenderer.invoke('project:openFolder', folder),

  pickFileAndCopyIn: (projectRoot, destDir, suggestedName) =>
    ipcRenderer.invoke('file:copyIn', { projectRoot, destDir, suggestedName }),
  copyFile: (src, projectRoot, destDir, baseName) =>
    ipcRenderer.invoke('file:copy', { src, projectRoot, destDir, baseName }),
  downloadFile: (projectRoot, relativePath, suggestedName) =>
    ipcRenderer.invoke('file:download', { projectRoot, relativePath, suggestedName }),
  readFile: (absPath) => ipcRenderer.invoke('file:read', absPath),

  recognizeDocx: (absPath) => ipcRenderer.invoke('docx:recognize', absPath),
  applyDocx: (absPath, replacements, outputAbsPath) =>
    ipcRenderer.invoke('docx:apply', { absPath, replacements, outputAbsPath }),

  recognizeXlsx: (absPath) => ipcRenderer.invoke('xlsx:recognize', absPath),
  applyXlsx: (absPath, activeSheet, edits, outputAbsPath) =>
    ipcRenderer.invoke('xlsx:apply', { absPath, activeSheet, edits, outputAbsPath }),

  importScan: (libraryDir, stages) => ipcRenderer.invoke('import:scan', { libraryDir, stages }),
  importCopy: (params) => ipcRenderer.invoke('import:copy', params),

  // 项目架构模板（全局蓝图）
  listTemplates: () => ipcRenderer.invoke('template:list'),
  getTemplate: (id) => ipcRenderer.invoke('template:get', id),
  createTemplate: (input) => ipcRenderer.invoke('template:create', input),
  updateTemplate: (id, input) => ipcRenderer.invoke('template:update', { id, input }),
  duplicateTemplate: (id, name) => ipcRenderer.invoke('template:duplicate', { id, name }),
  deleteTemplate: (id) => ipcRenderer.invoke('template:delete', id),
  saveTemplateFromProject: (projectFolder, name, description) =>
    ipcRenderer.invoke('template:saveFromProject', { projectFolder, name, description }),
  applyTemplate: (rootDir, project, templateId) =>
    ipcRenderer.invoke('template:apply', { rootDir, project, templateId }),
};

contextBridge.exposeInMainWorld('api', api);
