/**
 * 预加载脚本：通过 contextBridge 暴露类型化 API（window.api）给渲染层。
 * contextIsolation 开启、nodeIntegration 关闭 —— 渲染层不直接接触 Node，安全且可控。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Project, StructureTemplate, TplCreateInput, RootConfig } from './types';

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

  // 根配置（分类维度）
  getRootConfig(rootDir: string): Promise<RootConfig>;
  saveRootConfig(rootDir: string, config: RootConfig): Promise<{ saved: string; dimensions: RootConfig['dimensions'] }>;

  persistRootDir(rootDir: string): Promise<{ saved: string }>;
  getLastRootDir(): Promise<string>;

  trayBoxShowMain(): Promise<{ shown: boolean }>;
  trayBoxHideMain(): Promise<{ hidden: boolean }>;

  // 项目
  listProjects(rootDir: string): Promise<Array<{ name: string; folder: string; info: Project['info'] | null }>>;
  createProject(rootDir: string, project: Project): Promise<{ folder: string; folderName: string; rootPath: string }>;
  loadProject(projectFolder: string): Promise<{ project: Project; rootPath: string }>;
  saveProject(projectFolder: string, project: Project): Promise<{ saved: string }>;
  patchProjectInfo(projectFolder: string, info: Partial<Project['info']>): Promise<{ saved: string; info: Project['info'] }>;
  deleteProject(projectFolder: string): Promise<{ deleted: string }>;
  openFolder(folder: string): Promise<{ error: string | null }>;

  // 文件（v1.1.0：扁平 files/，只外部预览/编辑 + 下载）
  copyFile(src: string, projectRoot: string, suggestedBaseName?: string): Promise<{ relativePath: string; baseName: string; fileName: string; format: string; size: number }>;
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

const api: Api = {
  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),

  getRootConfig: (rootDir) => ipcRenderer.invoke('root:config:get', rootDir),
  saveRootConfig: (rootDir, config) => ipcRenderer.invoke('root:config:save', { rootDir, config }),

  persistRootDir: (rootDir) => ipcRenderer.invoke('root:dir:persist', rootDir),
  getLastRootDir: () => ipcRenderer.invoke('root:dir:getLast'),

  trayBoxShowMain: () => ipcRenderer.invoke('tray-box:showMain'),
  trayBoxHideMain: () => ipcRenderer.invoke('tray-box:hideMain'),

  listProjects: (rootDir) => ipcRenderer.invoke('project:list', rootDir),
  createProject: (rootDir, project) => ipcRenderer.invoke('project:create', { rootDir, project }),
  loadProject: (projectFolder) => ipcRenderer.invoke('project:load', projectFolder),
  saveProject: (projectFolder, project) => ipcRenderer.invoke('project:save', { projectFolder, project }),
  patchProjectInfo: (projectFolder, info) => ipcRenderer.invoke('project:patchInfo', { projectFolder, info }),
  deleteProject: (projectFolder) => ipcRenderer.invoke('project:delete', projectFolder),
  openFolder: (folder) => ipcRenderer.invoke('project:openFolder', folder),

  copyFile: (src, projectRoot, suggestedBaseName) =>
    ipcRenderer.invoke('file:copy', { src, projectRoot, suggestedBaseName }),
  downloadFile: (projectRoot, relativePath, suggestedName) =>
    ipcRenderer.invoke('file:download', { projectRoot, relativePath, suggestedName }),
  openFileExternal: (absPath) => ipcRenderer.invoke('file:openExternal', absPath),
  deleteFile: (projectRoot, relativePath) => ipcRenderer.invoke('file:delete', { projectRoot, relativePath }),

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
