/**
 * 预置结构模板（v1.1.0：软件自带一套，开箱即用，免去"很空不易上手"）。
 *
 * 设计依据：设计文档勘测需求——岩土工程勘察标准流程五阶段：
 *   项目立项 → 项目策划 → 项目执行 → 成果审查与归档 → 结算与总结
 * 每阶段挂合适插槽，用户建项时默认套用，再按实际增删即可。
 *
 * 说明：纯结构（阶段 + 插槽树），无任何模板文件；内嵌代码（不依赖运行时文件），
 * 打包后仍可用。
 */
import type { TplCreateInput } from './types';

export interface PresetTemplate {
  /** 预置标识（稳定，用于去重判断）。 */
  key: string;
  /** 模板名（展示用）。 */
  name: string;
  /** 描述。 */
  description: string;
  /** 结构（阶段 + 插槽树）。 */
  structure: TplCreateInput['slots'];
}

/** 岩土勘察项目（标准流程）——软件自带的主模板。 */
export const SURVEY_PROJECT_PRESET: PresetTemplate = {
  key: 'preset_survey_project',
  name: '岩土勘察项目（标准）',
  description: '岩土工程勘察标准流程：立项 → 策划 → 执行 → 成果审查与归档 → 结算与总结。建项默认套用，按实际增删插槽即可。',
  structure: [
    {
      name: '项目立项',
      subSlots: [
        { name: '委托书 / 合同', subSlots: [] },
        { name: '项目任务书', subSlots: [] },
        { name: '立项审批表', subSlots: [] },
      ],
    },
    {
      name: '项目策划',
      subSlots: [
        { name: '勘察大纲', subSlots: [] },
        { name: '技术设计 / 勘察方案', subSlots: [] },
        { name: '工作量确认表', subSlots: [] },
      ],
    },
    {
      name: '项目执行',
      subSlots: [
        { name: '野外原始记录', subSlots: [] },
        { name: '室内试验成果', subSlots: [] },
        { name: '勘察报告（初稿）', subSlots: [] },
      ],
    },
    {
      name: '成果审查与归档',
      subSlots: [
        { name: '审查意见 / 修改记录', subSlots: [] },
        { name: '勘察报告（终稿）', subSlots: [] },
        { name: '归档目录 / 材料', subSlots: [] },
      ],
    },
    {
      name: '结算与总结',
      subSlots: [
        { name: '结算材料 / 对账单', subSlots: [] },
        { name: '项目总结', subSlots: [] },
      ],
    },
  ],
};

/** 全部预置模板（目前只有一个主模板）。 */
export const PRESET_TEMPLATES: PresetTemplate[] = [SURVEY_PROJECT_PRESET];
