/**
 * 应用级状态：根目录、当前视图、当前打开的项目文件夹。
 */
import { defineStore } from 'pinia';

export type AppView = 'setup' | 'list' | 'detail';

export const useAppStore = defineStore('app', {
  state: () => ({
    rootDir: '',
    view: 'setup' as AppView,
    currentProjectFolder: '',
    saving: false,
  }),
  actions: {
    setRootDir(dir: string) {
      this.rootDir = dir;
      this.view = 'list';
    },
    gotoList() {
      this.view = 'list';
    },
    openProject(folder: string) {
      this.currentProjectFolder = folder;
      this.view = 'detail';
    },
    closeProject() {
      this.currentProjectFolder = '';
      this.view = 'list';
    },
  },
});
