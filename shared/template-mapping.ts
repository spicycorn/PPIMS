/**
 * 纯映射：项目结构 → 模板结构输入（项目架构模板功能）。
 * 不依赖 electron / node:path，主进程与单元测试都能安全导入。
 *
 * 语义：把项目里"阶段 + 槽位 + 各槽位已挂模板文件"捕获成模板蓝图输入，
 * 用于"从现有项目另存为模板"。槽位保留 名称/格式/必要性/需审查；
 * 已挂模板的槽位带上 templateFileName（basename）+ templateFileSrc（模板相对 posix 路径）。
 */
import type { Project, TplStageInput, TplSlotInput } from './types';

/** 浏览器安全的 basename（不依赖 node:path） */
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export function projectToTemplateStages(project: Project): TplStageInput[] {
  return project.stages.map((st) => ({
    name: st.info.name,
    description: st.info.description,
    slots: st.slots.map((sl) => {
      const slotIn: TplSlotInput = {
        name: sl.name,
        format: sl.format,
        necessity: sl.necessity,
        reviewRequired: sl.reviewRequired,
      };
      const linked = sl.templateId ? project.templates.find((t) => t.id === sl.templateId) : undefined;
      if (linked) {
        slotIn.templateFileName = baseName(linked.path);
        slotIn.templateFileSrc = linked.path; // 相对 posix，调用方（主进程）解析为绝对源路径
      }
      return slotIn;
    }),
  }));
}
