/**
 * 项目 store：内存中持有当前 Project（单一事实源），所有增删改动作在此完成并即时持久化。
 * 阶段/槽位/模板/文件/进度全部围绕这一个对象，避免状态分裂。
 * 进度为派生值，实时用 shared/progress 计算（验收 #6）。
 */
import { defineStore } from 'pinia';
import {
  SCHEMA_VERSION,
  PRESET_STAGES,
  type FileInstance,
  type FileStatus,
  type Project,
  type Slot,
  type Stage,
  type Template,
} from '../types';
import { computeAllProgress } from '../progress';
import { useAppStore } from './app';

function uid(prefix = 'id'): string {
  // 优先 crypto，回退时间戳+随机
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

export interface ProgressSnapshot {
  project: number;
  stages: Record<string, number>;
  slots: Record<string, number>;
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null as Project | null,
    loading: false,
    dirty: false,
    error: '' as string,
  }),

  getters: {
    /** 阶段（按 order 升序） */
    stages(state): Stage[] {
      if (!state.project) return [];
      return [...state.project.stages].sort((a, b) => a.order - b.order);
    },
    /** 全部槽位（展平，便于检索/状态板） */
    allSlots(): Array<{ stage: Stage; slot: Slot }> {
      const out: Array<{ stage: Stage; slot: Slot }> = [];
      for (const st of this.stages) {
        for (const sl of [...st.slots].sort((a, b) => a.order - b.order)) {
          out.push({ stage: st, slot: sl });
        }
      }
      return out;
    },
    /** 进度快照（派生，实时计算） */
    progress(state): ProgressSnapshot {
      if (!state.project) return { project: 0, stages: {}, slots: {} };
      return computeAllProgress(state.project);
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

    /** 即时持久化到 project.json（验收 #2） */
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
    },

    /* ---------- 项目信息 ---------- */
    updateProjectInfo(partial: Partial<Project['info']>) {
      if (!this.project) return;
      this.project.info = { ...this.project.info, ...partial };
      this.touch();
    },

    /* ---------- 阶段 ---------- */
    addStage(name: string): Stage {
      if (!this.project) throw new Error('没有打开的项目');
      const stage: Stage = {
        id: uid('stage'),
        info: { name, startTime: now().slice(0, 10), description: '' },
        slots: [],
        weight: 1,
        order: this.project.stages.length,
      };
      this.project.stages.push(stage);
      this.touch();
      return stage;
    },

    removeStage(stageId: string) {
      if (!this.project) return;
      this.project.stages = this.project.stages.filter((s) => s.id !== stageId);
      this.reindexStages();
      this.touch();
    },

    renameStage(stageId: string, name: string) {
      const st = this.project?.stages.find((s) => s.id === stageId);
      if (st) {
        st.info.name = name;
        this.touch();
      }
    },

    updateStageInfo(stageId: string, partial: Partial<Stage['info']>) {
      const st = this.project?.stages.find((s) => s.id === stageId);
      if (st) {
        st.info = { ...st.info, ...partial };
        this.touch();
      }
    },

    moveStage(stageId: string, dir: -1 | 1) {
      if (!this.project) return;
      const arr = this.project.stages;
      const i = arr.findIndex((s) => s.id === stageId);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      this.reindexStages();
      this.touch();
    },

    reindexStages() {
      if (!this.project) return;
      const arr = [...this.project.stages].sort((a, b) => a.order - b.order);
      arr.forEach((s, i) => (s.order = i));
    },

    /* ---------- 槽位 ---------- */
    addSlot(stageId: string, slot?: Partial<Slot>): Slot {
      const st = this.project?.stages.find((s) => s.id === stageId);
      if (!st) throw new Error('阶段不存在');
      const s: Slot = {
        id: uid('slot'),
        name: slot?.name ?? '新槽位',
        format: slot?.format ?? 'docx',
        necessity: slot?.necessity ?? 'required',
        deadline: slot?.deadline,
        reviewRequired: slot?.reviewRequired ?? true,
        templateId: slot?.templateId,
        files: [],
        order: st.slots.length,
      };
      st.slots.push(s);
      this.touch();
      return s;
    },

    removeSlot(stageId: string, slotId: string) {
      const st = this.project?.stages.find((s) => s.id === stageId);
      if (!st) return;
      st.slots = st.slots.filter((s) => s.id !== slotId);
      st.slots.forEach((s, i) => (s.order = i));
      this.touch();
    },

    updateSlot(stageId: string, slotId: string, partial: Partial<Slot>) {
      const st = this.project?.stages.find((s) => s.id === stageId);
      const sl = st?.slots.find((s) => s.id === slotId);
      if (sl) {
        Object.assign(sl, partial);
        this.touch();
      }
    },

    moveSlot(stageId: string, slotId: string, dir: -1 | 1) {
      const st = this.project?.stages.find((s) => s.id === stageId);
      if (!st) return;
      const arr = [...st.slots].sort((a, b) => a.order - b.order);
      const i = arr.findIndex((s) => s.id === slotId);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      arr.forEach((s, idx) => (s.order = idx));
      this.touch();
    },

    /* ---------- 文件实例（多版本） ---------- */
    addFile(stageId: string, slotId: string, file: Omit<FileInstance, 'id' | 'version'>): FileInstance {
      const sl = this.findSlot(stageId, slotId);
      if (!sl) throw new Error('槽位不存在');
      const maxV = sl.files.reduce((m, f) => Math.max(m, f.version), 0);
      const fi: FileInstance = { ...file, id: uid('file'), version: maxV + 1 };
      sl.files.push(fi);
      sl.files.sort((a, b) => a.version - b.version);
      this.touch();
      return fi;
    },

    removeFile(stageId: string, slotId: string, fileId: string) {
      const sl = this.findSlot(stageId, slotId);
      if (!sl) return;
      sl.files = sl.files.filter((f) => f.id !== fileId);
      sl.files.forEach((f, i) => (f.version = i + 1));
      this.touch();
    },

    setFileStatus(stageId: string, slotId: string, fileId: string, status: FileStatus) {
      const sl = this.findSlot(stageId, slotId);
      const fi = sl?.files.find((f) => f.id === fileId);
      if (fi) {
        fi.status = status;
        fi.updatedAt = now();
        this.touch();
      }
    },

    /* ---------- 模板 ---------- */
    addTemplate(t: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Template {
      const tmpl: Template = { ...t, id: uid('tmpl'), createdAt: now(), updatedAt: now() };
      this.project?.templates.push(tmpl);
      this.touch();
      return tmpl;
    },

    updateTemplate(templateId: string, partial: Partial<Template>) {
      const tmpl = this.project?.templates.find((t) => t.id === templateId);
      if (tmpl) {
        Object.assign(tmpl, partial);
        tmpl.updatedAt = now();
        this.touch();
      }
    },

    /* ---------- 工具 ---------- */
    findSlot(stageId: string, slotId: string): Slot | undefined {
      return this.project?.stages.find((s) => s.id === stageId)?.slots.find((s) => s.id === slotId);
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

/** 新建项目的默认数据（预置阶段，设计文档 2.3；共用 shared PRESET_STAGES，不重复硬编码） */
export function createDefaultProject(info: Project['info']): Project {
  const presetStages = PRESET_STAGES;
  return {
    id: uid('proj'),
    info,
    rootPath: '',
    stages: presetStages.map((s, i) => ({
      id: uid('stage'),
      info: { name: s.name, description: s.description, startTime: '' },
      slots: [],
      weight: 1,
      order: i,
    })),
    templates: [],
    schemaVersion: SCHEMA_VERSION,
    createdAt: now(),
    updatedAt: now(),
  };
}
