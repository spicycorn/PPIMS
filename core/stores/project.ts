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
import { sanitize } from '../paths';

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

    /**
     * 即时持久化到 project.json。
     * 返回是否真保存了：false = 前置条件不满足（无项目/无项目文件夹），并写入 error（不静默假成功）。
     * 保存失败（IO 异常）仍 throw，由调用方 catch。
     *
     * 关键：this.project 是 Vue reactive Proxy，直接过 Electron IPC 会触发
     * "An object could not be cloned"。先 JSON 深克隆成纯对象再过 IPC（结构化克隆安全）。
     */
    async persist(): Promise<boolean> {
      const app = useAppStore();
      if (!this.project) {
        this.error = '无法保存：没有打开的项目';
        return false;
      }
      if (!app.currentProjectFolder) {
        this.error = '无法保存：缺少项目文件夹（请先打开项目）';
        return false;
      }
      this.project.updatedAt = now();
      // 深克隆 reactive → 纯对象（修 "could not be cloned"）
      const plain = JSON.parse(JSON.stringify(this.project)) as Project;
      try {
        await window.api.saveProject(app.currentProjectFolder, plain);
        this.dirty = false;
        this.error = '';
        return true;
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

    /** 新建插槽。parentSlotId 为空 = 顶层（阶段）；否则挂到该插槽下（子插槽）。实时建对应文件夹。 */
    async addSlot(name: string, parentSlotId?: string): Promise<Slot> {
      if (!this.project) throw new Error('没有打开的项目');
      const app = useAppStore();
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
      // 实时：建插槽文件夹（嵌套镜像）
      if (app.currentProjectFolder) {
        await window.api.slotMkdir(app.currentProjectFolder, this.slotFolderRelPath(s.id));
      }
      this.touch();
      return s;
    },

    /** 删除插槽（含子插槽）。实时递归删除其文件夹（含全部文件）。 */
    async removeSlot(slotId: string): Promise<void> {
      if (!this.project) return;
      const app = useAppStore();
      const folderRel = this.slotFolderRelPath(slotId);
      // 实时：递归删插槽文件夹（含子插槽 + 全部文件）
      if (app.currentProjectFolder && folderRel) {
        await window.api.slotRm(app.currentProjectFolder, folderRel);
      }
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

    /** 改名插槽。实时：磁盘文件夹改名（含子内容）+ 子树全部文件 path 前缀更新。 */
    async renameSlot(slotId: string, name: string): Promise<void> {
      const s = this.findSlot(slotId);
      if (!s) return;
      const app = useAppStore();
      const oldName = s.name;
      if (oldName === name) return; // 无变化
      const oldFolderRel = this.slotFolderRelPath(slotId);
      s.name = name; // 先改树（slotFolderRelPath 依赖名链）
      const newFolderRel = this.slotFolderRelPath(slotId);
      // 实时：磁盘文件夹改名（含全部子内容）
      if (app.currentProjectFolder && oldFolderRel && newFolderRel && oldFolderRel !== newFolderRel) {
        await window.api.slotRename(app.currentProjectFolder, oldFolderRel, newFolderRel);
      }
      // 级联更新子树所有文件的 path 前缀（oldFolder/xxx → newFolder/xxx）
      if (oldFolderRel && newFolderRel && oldFolderRel !== newFolderRel) {
        const walk = (node: Slot) => {
          const prefixOld = `${oldFolderRel}/`;
          for (const f of node.files) {
            if (f.path && f.path.startsWith(prefixOld)) {
              f.path = newFolderRel + f.path.slice(oldFolderRel.length);
            }
          }
          for (const sub of node.subSlots) walk(sub);
        };
        walk(s);
      }
      this.touch();
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

    /** 删除文件。实时：物理删除插槽文件夹内的文件。 */
    async removeFile(slotId: string, fileId: string): Promise<void> {
      const s = this.findSlot(slotId);
      if (!s) return;
      const app = useAppStore();
      const f = s.files.find((x) => x.id === fileId);
      // 实时：物理删除文件
      if (app.currentProjectFolder && f?.path) {
        await window.api.deleteFile(app.currentProjectFolder, f.path);
      }
      s.files = s.files.filter((x) => x.id !== fileId);
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

    /** 返回插槽的名链（根 → 该插槽），用于算插槽文件夹路径。如 ["阶段1","勘测大纲"]。 */
    slotNameChain(slotId: string): string[] {
      if (!this.project) return [];
      const find = (arr: Slot[], trail: string[]): string[] | null => {
        for (const s of arr) {
          const next = [...trail, s.name];
          if (s.id === slotId) return next;
          const hit = find(s.subSlots, next);
          if (hit) return hit;
        }
        return null;
      };
      return find(this.project.slots, []) ?? [];
    },

    /** 插槽文件夹相对路径（如 "阶段1/勘测大纲"）。 */
    slotFolderRelPath(slotId: string): string {
      return this.slotNameChain(slotId).map(sanitize).join('/');
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
