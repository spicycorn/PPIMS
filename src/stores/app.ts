/**
 * 应用级状态：根目录、当前视图、当前打开的项目文件夹、分类维度（根配置，2.9）。
 */
import { defineStore } from 'pinia';
import type { CategoryDimension } from '../../shared/types';

export type AppView = 'setup' | 'list' | 'detail';

export const useAppStore = defineStore('app', {
  state: () => ({
    rootDir: '',
    view: 'setup' as AppView,
    currentProjectFolder: '',
    saving: false,
    /** 分类维度（根级配置，全局唯一；2.9 不预置业务维度） */
    dimensions: [] as CategoryDimension[],
  }),
  actions: {
    setRootDir(dir: string) {
      this.rootDir = dir;
      this.view = 'list';
      // 换根目录后重新加载该根下的维度定义
      void this.loadDimensions();
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

    /* ---------- 分类维度（2.9） ---------- */
    async loadDimensions() {
      if (!this.rootDir) {
        this.dimensions = [];
        return;
      }
      try {
        const cfg = await window.api.getRootConfig(this.rootDir);
        this.dimensions = cfg.dimensions ?? [];
      } catch {
        this.dimensions = [];
      }
    },
    /** 增/删/改名后统一落盘（主进程会 normalize） */
    async saveDimensions() {
      if (!this.rootDir) return;
      const cfg = await window.api.saveRootConfig(this.rootDir, { dimensions: this.dimensions });
      this.dimensions = cfg.dimensions ?? [];
    },
    addDimension(name: string) {
      const trimmed = (name ?? '').trim();
      if (!trimmed) return;
      // 重名不重复加
      if (this.dimensions.some((d) => d.name === trimmed)) return;
      // 生成稳定 id（dim_ + 序号），避免与已有冲突
      let id = `dim_${Date.now().toString(36)}`;
      const taken = new Set(this.dimensions.map((d) => d.id));
      while (taken.has(id)) id = `dim_${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`;
      this.dimensions.push({ id, name: trimmed });
      void this.saveDimensions();
    },
    renameDimension(id: string, name: string) {
      const d = this.dimensions.find((x) => x.id === id);
      if (!d) return;
      const trimmed = (name ?? '').trim();
      if (!trimmed) return;
      d.name = trimmed;
      void this.saveDimensions();
    },
    removeDimension(id: string) {
      this.dimensions = this.dimensions.filter((d) => d.id !== id);
      void this.saveDimensions();
    },
  },
});
