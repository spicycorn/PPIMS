/**
 * 项目 store：内存中持有当前 Project（单一事实源），所有增删改动作在此完成并即时持久化。
 * v1.0.0：插槽树（可嵌套）+ 多文件 + 标签；无进度/无状态/无版本/无必要性。
 */
import { defineStore } from 'pinia';
import {
  SCHEMA_VERSION,
  type FileEntry,
  type Project,
  type Slot,
} from '../types';
import { useAppStore } from './app';

function uid(prefix = 'id'): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {
    /* ignore */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null as Project | null,
    loading: false,
    dirty: false,
    error: '' as string,
    /** 当前选中的插槽 id（ProjectDetail/SlotTreePanel/SlotWorkspace 共用，干净联动） */
    selectedSlotId: '' as string,
  }),

  getters: {
    /** 顶层插槽（= 阶段，按 order 升序） */
    slots(state): Slot[] {
      if (!state.project) return [];
      return [...state.project.slots].sort((a, b) => a.order - b.order);
    },
    /** 全部插槽（展平，含嵌套，便于检索） */
    allSlots(): Slot[] {
      const out: Slot[] = [];
      const walk = (s: Slot) => {
        out.push(s);
        [...s.subSlots].sort((a, b) => a.order - b.order).forEach(walk);
      };
      this.slots.forEach(walk);
      return out;
    },
    /** 全部文件（展平，含插槽名路径，便于检索） */
    allFiles(): Array<{ slot: Slot; file: FileEntry; slotPath: string }> {
      const out: Array<{ slot: Slot; file: FileEntry; slotPath: string }> = [];
      const walk = (s: Slot, path: string) => {
        for (const f of s.files) out.push({ slot: s, file: f, slotPath: path });
        for (const sub of s.subSlots) walk(sub, `${path}/${sub.name}`);
      };
      for (const top of this.slots) walk(top, top.name);
      return out;
    },
  },

  actions: {
    /* ---------- 生命周期 ---------- */
    async load(folder: string) {
      this.loading = true;
      this.error = '';
      try {
        const { project } = await window.api.loadProject(folder);
        this.project = project;
        this.dirty = false;
      } catch (e) {
        this.error = (e as Error).message;
        throw e;
      } finally {
        this.loading = false;
      }
    },

    /** 即时持久化到 project.json */
    async persist(): Promise<void> {
      const app = useAppStore();
      if (!this.project || !app.currentProjectFolder) return;
      this.project.updatedAt = now();
      try {
        await window.api.saveProject(app.currentProjectFolder, this.project);
        this.dirty = false;
      } catch (e) {
        this.error = (e as Error).message;
        throw e;
      }
    },

    reset() {
      this.project = null;
      this.dirty = false;
      this.error = '';
      this.selectedSlotId = '';
    },

    /** 选中插槽（供树面板/子插槽跳转/检索共用） */
    selectSlot(id: string) {
      this.selectedSlotId = id;
    },

    /* ---------- 项目信息 ---------- */
    updateProjectInfo(partial: Partial<Project['info']>) {
      if (!this.project) return;
      this.project.info = { ...this.project.info, ...partial };
      this.touch();
    },

    /* ---------- 插槽树 CRUD ---------- */

    /** 新建插槽。parentSlotId 为空 = 顶层（阶段）；否则挂到该插槽下（子插槽）。 */
    addSlot(name: string, parentSlotId?: string): Slot {
      if (!this.project) throw new Error('没有打开的项目');
      const s: Slot = {
        id: uid('slot'),
        name,
        files: [],
        subSlots: [],
        order: parentSlotId
          ? this.findSlot(parentSlotId)?.subSlots.length ?? 0
          : this.project.slots.length,
      };
      if (parentSlotId) {
        const parent = this.findSlot(parentSlotId);
        if (!parent) throw new Error('父插槽不存在');
        parent.subSlots.push(s);
      } else {
        this.project.slots.push(s);
      }
      this.touch();
      return s;
    },

    removeSlot(slotId: string) {
      if (!this.project) return;
      const remove = (arr: Slot[]): boolean => {
        const i = arr.findIndex((s) => s.id === slotId);
        if (i >= 0) {
          arr.splice(i, 1);
          arr.forEach((s, idx) => (s.order = idx));
          return true;
        }
        return arr.some((s) => remove(s.subSlots));
      };
      remove(this.project.slots);
      this.touch();
    },

    renameSlot(slotId: string, name: string) {
      const s = this.findSlot(slotId);
      if (s) {
        s.name = name;
        this.touch();
      }
    },

    /** 在上/下兄弟间移动（dir: -1 上移，1 下移）。 */
    moveSlot(slotId: string, dir: -1 | 1) {
      const arr = this.slotSiblings(slotId);
      if (!arr) return;
      const i = arr.findIndex((s) => s.id === slotId);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      arr.forEach((s, idx) => (s.order = idx));
      this.touch();
    },

    /* ---------- 文件 CRUD（多文件，各自独立） ---------- */

    /** 向插槽添加一个（或多个已构造好的）文件。 */
    addFiles(slotId: string, files: FileEntry[]) {
      const s = this.findSlot(slotId);
      if (!s) throw new Error('插槽不存在');
      s.files.push(...files);
      this.touch();
    },

    removeFile(slotId: string, fileId: string) {
      const s = this.findSlot(slotId);
      if (!s) return;
      s.files = s.files.filter((f) => f.id !== fileId);
      this.touch();
    },

    /** 更新文件属性（名称/备注等）。 */
    updateFile(slotId: string, fileId: string, partial: Partial<FileEntry>) {
      const f = this.findFile(slotId, fileId);
      if (f) {
        Object.assign(f, partial);
        this.touch();
      }
    },

    addFileTag(slotId: string, fileId: string, tag: string) {
      const f = this.findFile(slotId, fileId);
      const t = tag.trim();
      if (f && t && !f.tags.includes(t)) {
        f.tags.push(t);
        this.touch();
      }
    },

    removeFileTag(slotId: string, fileId: string, tag: string) {
      const f = this.findFile(slotId, fileId);
      if (f) {
        f.tags = f.tags.filter((x) => x !== tag);
        this.touch();
      }
    },

    /* ---------- 工具 ---------- */

    /** 在插槽树中按 id 查找插槽（id 唯一，递归全树）。 */
    findSlot(slotId: string): Slot | undefined {
      if (!this.project) return undefined;
      const find = (arr: Slot[]): Slot | undefined => {
        for (const s of arr) {
          if (s.id === slotId) return s;
          const hit = find(s.subSlots);
          if (hit) return hit;
        }
        return undefined;
      };
      return find(this.project.slots);
    },

    findFile(slotId: string, fileId: string): FileEntry | undefined {
      return this.findSlot(slotId)?.files.find((f) => f.id === fileId);
    },

    /** 返回该插槽所在的兄弟数组（顶层或某父插槽的 subSlots）。 */
    slotSiblings(slotId: string): Slot[] | undefined {
      if (!this.project) return undefined;
      const find = (arr: Slot[]): Slot[] | undefined => {
        if (arr.some((s) => s.id === slotId)) return arr;
        for (const s of arr) {
          const hit = find(s.subSlots);
          if (hit) return hit;
        }
        return undefined;
      };
      return find(this.project.slots);
    },

    touch() {
      if (this.project) this.project.updatedAt = now();
      this.dirty = true;
      void this.persist().catch(() => {
        /* 持久化错误已通过 error 字段暴露 */
      });
    },
  },
});

/** 新建项目的默认数据（v1.0.0：空插槽树，结构由结构模板带出或用户自建）。 */
export function createDefaultProject(info: Project['info']): Project {
  return {
    id: uid('proj'),
    info,
    rootPath: '',
    slots: [],
    schemaVersion: SCHEMA_VERSION,
    createdAt: now(),
    updatedAt: now(),
  };
}
