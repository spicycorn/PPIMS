/**
 * PPIMS 共享数据模型（单一事实源）。
 * 主进程（Node/Electron）与渲染层（Vue）共用此文件，保证数据结构一致。
 * 设计依据：《个人项目信息管理系统设计文档》第二章 2.2 数据模型。
 *
 * 约定：
 * - 所有时间字段用 ISO 8601 字符串（本地时区），全链路 UTF-8。
 * - 落盘数据（project.json）只存"配置与状态"，不存派生值（进度实时计算）。
 * - 文件路径统一用"相对项目根目录"的 POSIX 风格路径，保证项目文件夹可整体搬移。
 */

/** 槽位必要性：必填 > 应填 > 可选（进度权重依次递减） */
export type Necessity = 'required' | 'should' | 'optional';

/** 文件状态流转：待编 → 编制中 → 待审 → 已审 → 已归档 */
export type FileStatus = 'pending' | 'drafting' | 'pending_review' | 'reviewed' | 'archived';

/** 期望格式（槽位/文件） */
export type FileFormat = 'docx' | 'xlsx' | 'pdf' | 'dwg' | 'image' | 'other';

/** 字段类型（模板结构识别结果） */
export type FieldKind = 'text' | 'table' | 'section';

/** 项目信息（建项时填写，设计文档 2.2.1） */
export interface ProjectInfo {
  /** 项目名称（必填） */
  name: string;
  /** 项目编号（必填），如 60-F14742S */
  code: string;
  /** 立项时间（必填，事实字段手填） */
  establishDate: string;
  /** 专业（选填）：岩土/测绘/水文/物探 等 */
  specialty?: string;
  /** 工程地点（选填） */
  location?: string;
  /** 当前阶段 id（自动推导，可手动覆盖） */
  currentStageId?: string;
  /** 备注（选填） */
  remark?: string;
}

/** 阶段信息（建/调阶段时填写，设计文档 2.2.2） */
export interface StageInfo {
  /** 阶段名称（必填） */
  name: string;
  /** 起始时间（选填） */
  startTime?: string;
  /** 完成时间（自动/手填） */
  endTime?: string;
  /** 说明（选填） */
  description?: string;
}

/** 文件实例（用户按模板填写生成，或直接上传；含版本） */
export interface FileInstance {
  id: string;
  /** 显示名（不含扩展名） */
  name: string;
  format: FileFormat;
  status: FileStatus;
  /** 版本号（自 1 递增） */
  version: number;
  createdAt: string;
  updatedAt: string;
  /** 相对项目根目录的 POSIX 路径 */
  path: string;
  /** 备注 */
  remark?: string;
}

/** 模板结构模型 —— 识别出的可编辑字段 */
export interface TemplateField {
  id: string;
  /** 中文标签（识别或用户命名） */
  label: string;
  /** 当前值（已填写内容） */
  value: string;
  kind: FieldKind;
  /**
   * 锚点：用于在 document.xml 中做"原位文本替换"的定位键。
   * 形如 `__PPIMS_FIELD_<n>__`，写入模板后即为占位符；
   * 识别时从现有文本/标签推断，保存时把 value 替换回该锚点对应的 <w:t>。
   */
  anchor: string;
  /** 表格行（kind=table 时） */
  row?: number;
  /** 表格列（kind=table 时） */
  col?: number;
}

/** 模板中的章节（Heading 推断） */
export interface TemplateSection {
  id: string;
  /** 章节标题文本 */
  title: string;
  /** 层级（1-6，对应 Heading1-6） */
  level: number;
  /** 该章节下识别出的字段 id 列表 */
  fieldIds: string[];
}

/** 模板结构识别结果（设计文档 2.6 模板引擎 ②） */
export interface TemplateStructure {
  sections: TemplateSection[];
  fields: TemplateField[];
}

/** 模板文件（挂在槽位上，是该槽位资料的"骨架"） */
export interface Template {
  id: string;
  name: string;
  format: FileFormat;
  /** 相对项目根目录的 POSIX 路径（templates/ 下） */
  path: string;
  /** 结构识别结果（可编辑表单的数据源） */
  structure?: TemplateStructure;
  /** Excel 活动工作表名（xlsx 编辑时定位） */
  activeSheet?: string;
  createdAt: string;
  updatedAt: string;
}

/** 槽位（名称 + 期望格式 + 模板 + 必要性/时限/审查属性，设计文档 2.2） */
export interface Slot {
  id: string;
  name: string;
  /** 期望格式 */
  format: FileFormat;
  /** 必要性 */
  necessity: Necessity;
  /** 时限（ISO 日期，考核/截止） */
  deadline?: string;
  /** 是否需审查 */
  reviewRequired: boolean;
  /** 关联模板 id（可选） */
  templateId?: string;
  /** 文件实例（多版本，按 version 升序） */
  files: FileInstance[];
  /** 排序（数字小在前） */
  order: number;
}

/** 阶段（含阶段信息 + 槽位集合） */
export interface Stage {
  id: string;
  info: StageInfo;
  slots: Slot[];
  /** 阶段权重（进度计算用，默认均等=1） */
  weight: number;
  /** 排序 */
  order: number;
}

/** 进度（派生值，实时计算，不落盘为独立结构） */
export interface Progress {
  /** 槽位完成度 0-100（已有合格文件实例即 100，否则 0；按必要性加权见公式） */
  slot: number;
  /** 阶段进度 0-100 */
  stage: number;
  /** 项目进度 0-100 */
  project: number;
}

/** 一个"合格文件"的定义：状态到达 已审(reviewed) 或 已归档(archived) 视为该槽位完成 */
export const QUALIFIED_STATUSES: FileStatus[] = ['reviewed', 'archived'];

/** 项目（文件夹自包含的完整数据，序列化即 project.json） */
export interface Project {
  id: string;
  info: ProjectInfo;
  /** 项目根目录绝对路径（仅本机使用，不入 project.json 关键数据，但保留便于加载） */
  rootPath: string;
  stages: Stage[];
  /** 模板集合（templates/ 下的所有模板） */
  templates: Template[];
  /** project.json 数据版本（迁移用） */
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** 当前 schema 版本 */
export const SCHEMA_VERSION = 1;

/** 状态流转定义（用于界面与校验） */
export const STATUS_FLOW: Record<FileStatus, FileStatus | null> = {
  pending: 'drafting',
  drafting: 'pending_review',
  pending_review: 'reviewed',
  reviewed: 'archived',
  archived: null,
};

export const STATUS_LABEL: Record<FileStatus, string> = {
  pending: '待编',
  drafting: '编制中',
  pending_review: '待审',
  reviewed: '已审',
  archived: '已归档',
};

export const NECESSITY_WEIGHT: Record<Necessity, number> = {
  required: 3,
  should: 2,
  optional: 1,
};

export const NECESSITY_LABEL: Record<Necessity, string> = {
  required: '必填',
  should: '应填',
  optional: '可选',
};

export const FORMAT_LABEL: Record<FileFormat, string> = {
  docx: 'Word 文档',
  xlsx: 'Excel 表格',
  pdf: 'PDF',
  dwg: 'CAD 图纸',
  image: '图片',
  other: '其他',
};
