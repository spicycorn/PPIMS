/**
 * 进度自动计算（设计文档 2.2.3，验收标准 #6）。
 * 纯函数、无副作用，便于单元测试与主/渲染两层共用。
 *
 * 规则：
 * - 槽位完成度 = 已有"合格文件实例"？1 : 0
 *   合格 = 该槽位存在至少一个状态到达 已审(reviewed)/已归档(archived) 的文件实例。
 * - 槽位权重 = 必要性权重（必填 3 > 应填 2 > 可选 1）。
 * - 阶段进度 = Σ(槽位完成度 × 槽位权重) / Σ(槽位权重)。
 * - 项目进度 = Σ(阶段进度 × 阶段权重) / Σ(阶段权重)，阶段权重默认均等=1、可调。
 *
 * 原则：进度不是手填死值，而是随文件增删/状态变更实时推导，不失真。
 */
import {
  NECESSITY_WEIGHT,
  QUALIFIED_STATUSES,
  type Project,
  type Slot,
  type Stage,
} from './types';

/** 判断某槽位是否"完成"（存在合格文件实例） */
export function isSlotComplete(slot: Slot): boolean {
  return slot.files.some((f) => QUALIFIED_STATUSES.includes(f.status));
}

/** 槽位完成度 0 / 1 */
export function slotCompletion(slot: Slot): number {
  return isSlotComplete(slot) ? 1 : 0;
}

/** 阶段进度 0-100 */
export function stageProgress(stage: Stage): number {
  if (stage.slots.length === 0) return 0;
  const totalWeight = stage.slots.reduce((s, sl) => s + NECESSITY_WEIGHT[sl.necessity], 0);
  if (totalWeight === 0) return 0;
  const doneWeight = stage.slots.reduce(
    (s, sl) => s + (isSlotComplete(sl) ? NECESSITY_WEIGHT[sl.necessity] : 0),
    0,
  );
  return (doneWeight / totalWeight) * 100;
}

/** 项目进度 0-100 */
export function projectProgress(project: Project): number {
  if (project.stages.length === 0) return 0;
  const totalWeight = project.stages.reduce((s, st) => s + (st.weight || 1), 0);
  if (totalWeight === 0) return 0;
  const doneWeight = project.stages.reduce(
    (s, st) => s + (stageProgress(st) / 100) * (st.weight || 1),
    0,
  );
  return (doneWeight / totalWeight) * 100;
}

/** 一次性计算项目/各阶段/各槽位进度（供界面展示） */
export function computeAllProgress(project: Project): {
  project: number;
  stages: Record<string, number>;
  slots: Record<string, number>;
} {
  const stages: Record<string, number> = {};
  const slots: Record<string, number> = {};
  for (const st of project.stages) {
    const sp = stageProgress(st);
    stages[st.id] = round1(sp);
    for (const sl of st.slots) {
      slots[sl.id] = round1(slotCompletion(sl) * 100);
    }
  }
  return {
    project: round1(projectProgress(project)),
    stages,
    slots,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
