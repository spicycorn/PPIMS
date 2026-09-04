/**
 * 纯映射：项目插槽树 → 结构模板输入（"从现有项目另存为结构模板"）。
 * 不依赖 electron / node:path，主进程与单元测试都能安全导入。
 *
 * 语义：把项目里"阶段 + 插槽"的**树结构**捕获成结构模板输入（纯结构，无文件内容），
 * 用于"从现有项目另存为结构模板"。保留每个插槽的名称与嵌套关系，丢弃文件。
 */
import type { Project, StructureTemplate, TplSlotInput } from './types';

/** 项目插槽树 → 结构模板输入（纯结构：名称 + 嵌套，无文件）。 */
export function projectToTemplateStructure(project: Project): TplSlotInput[] {
  return project.slots.map((s) => ({
    name: s.name,
    subSlots: s.subSlots.map((sub) => ({
      name: sub.name,
      subSlots: sub.subSlots.map((ss) => ({
        name: ss.name,
        subSlots: [],
      })),
    })),
  }));
}

/** 统计一个结构模板里的插槽总数（顶层 + 嵌套）。 */
export function countTemplateSlots(tpl: StructureTemplate): number {
  let n = 0;
  const walk = (arr: TplSlotInput[]) => {
    for (const s of arr) {
      n += 1;
      walk(s.subSlots);
    }
  };
  walk(tpl.structure as unknown as TplSlotInput[]);
  return n;
}
