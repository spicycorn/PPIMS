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

/** 分类维度（用户自定义、可扩展多维，设计文档 2.9） */
export interface CategoryDimension {
  /** 稳定 id（形如 dim_xxx，跨项目/跨取值引用用） */
  id: string;
  /** 维度名（用户可见，如"地区""专业"） */
  name: string;
}

/**
 * 项目分类取值：维度 id → 取值（自由文本）。
 * 例：{ "dim_x": "华北", "dim_y": "岩土" }。
 * 只落在"视图/组织"层，不影响项目内部结构与进度计算（设计文档 2.9）。
 */
export type CategoryValues = Record<string, string>;

/** 数据根目录的根级配置（存 <root>/ppims.json，全局唯一，设计文档 2.9） */
export interface RootConfig {
  /** 分类维度定义（顺序即显示顺序） */
  dimensions: CategoryDimension[];
}

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
  /** 分类取值（维度 id → 取值，设计文档 2.9；维度定义在根配置） */
  categories?: CategoryValues;
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

/* ============================================================
 * 项目架构模板（全局蓝图）—— 与槽位模板文件 Template 区分：
 * - Template         = 槽位的模板"文件"（.docx/.xlsx 骨架，挂在槽位上）
 * - ProjectTemplate  = 可复用的"项目架构"蓝图（阶段+槽位+类型+各槽位模板文件）
 * 存于 Electron app.getPath('userData')/templates/<id>/：
 *   template.json     ← ProjectTemplate 结构
 *   templates/        ← 各槽位的模板文件（.docx/.xlsx）
 * 应用时把结构 + 模板文件副本生成进新项目，免去逐一手填槽位。
 * ============================================================ */

/** 项目架构模板中的槽位（蓝图槽位：属性 + 模板文件引用） */
export interface ProjectTemplateSlot {
  id: string;
  name: string;
  format: FileFormat;
  necessity: Necessity;
  reviewRequired: boolean;
  /** 模板文件相对模板目录 templates/ 的 POSIX 路径；空=该槽位无模板文件 */
  templateFile?: string;
  /** 模板文件显示名（含扩展名） */
  templateFileName?: string;
  order: number;
}

/** 项目架构模板中的阶段 */
export interface ProjectTemplateStage {
  id: string;
  name: string;
  description?: string;
  slots: ProjectTemplateSlot[];
  order: number;
}

/** 项目架构模板（全局蓝图，一键生成新项目结构） */
export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  stages: ProjectTemplateStage[];
  createdAt: string;
  updatedAt: string;
}

/* ---------- 模板"输入"类型（新建/编辑时渲染层提交的结构，主进程据此落盘） ---------- */

/** 输入：蓝图槽位（templateFileSrc 是要拷进模板的源文件绝对路径） */
export interface TplSlotInput {
  name: string;
  format: FileFormat;
  necessity: Necessity;
  reviewRequired: boolean;
  /** 要拷进模板的源文件绝对路径（新挂/更换时填）；空 = 不带新文件 */
  templateFileSrc?: string;
  /** 模板文件建议名（含扩展名），默认取源文件名 */
  templateFileName?: string;
  /** 编辑时保留已存在的模板文件（templates/ 下的相对路径）；与 templateFileSrc 互斥 */
  keepTemplateFile?: string;
}

/** 输入：蓝图阶段 */
export interface TplStageInput {
  name: string;
  description?: string;
  slots: TplSlotInput[];
}

/** 输入：新建/编辑模板的完整结构 */
export interface TplCreateInput {
  name: string;
  description?: string;
  stages: TplStageInput[];
}

/* ============================================================
 * 多层级自动扫描（设计文档 2.10）—— 轻量：只认目录结构 + 列文件名，
 * 不读文件内容；识别纯逻辑在 shared/scan.ts（可单测），落盘在主进程。
 * ============================================================ */

/** 候选项目的直接子目录 + 该子目录下的文件名清单（不递归读内容） */
export interface ScannedSubdir {
  name: string;
  /** 该子目录"直接文件"的名字（界面展示用；导入按"最近祖先子目录"递归复制，不依赖此清单深度） */
  files: string[];
  /** 该子目录的"递归文件数"（v0.3.0：文件嵌套任意深度都计入） */
  fileCount: number;
}

/** 一个"像项目"的目录（扫描候选） */
export interface ScannedCandidate {
  /** 绝对路径（导入用） */
  path: string;
  /** 目录名（建议项目名来源） */
  name: string;
  /** 是否已是 PPIMS 项目（含 project.json，可直接加载/识别） */
  isPPIMS: boolean;
  /** 直接子目录 + 文件清单（isPPIMS=true 时用于核对结构） */
  subdirs: ScannedSubdir[];
  /** 顶层散文件数（不在子目录） */
  looseFileCount: number;
  /** 文件总数（v0.3.0：递归累加，文件嵌套任意深度都计入） */
  fileCount: number;
  /** 置信度：high=含 project.json 或多资料子目录；medium=仅多文档文件 */
  confidence: 'high' | 'medium';
  /** 候选强度：strong=项目特征明确；weak=疑似（嵌套候选链去重 + 排序用） */
  strength: 'strong' | 'weak';
  /** 命中原因（展示用，说明为何被识别为候选） */
  reason: string;
  /** 嵌套深度（相对扫描根，1=顶层；展示"所在层级"用） */
  nestDepth: number;
  /** 相对扫描根的 POSIX 路径（展示用） */
  relPath: string;
}

/** 扫描整体结果 */
export interface ScanResult {
  root: string;
  candidates: ScannedCandidate[];
  /** 因深度/规模上限被跳过的目录数（性能保护） */
  truncated: boolean;
  scannedDirs: number;
}

/** 导入输入：用户确认/修正后的候选元数据 */
export interface ScanImportInput {
  /** 候选项目绝对路径 */
  sourceDir: string;
  /** 项目信息（名称/编号/立项时间/分类取值等，用户确认） */
  info: ProjectInfo;
  /** 各子目录 → 阶段 id 的归并（空串=归入日常管理） */
  subdirStage: Array<{ name: string; stageId: string }>;
  /** 目标数据根目录 */
  rootDir: string;
  /** 当前项目的阶段（用于"子目录名匹配阶段"） */
  stages: Array<{ id: string; name: string }>;
}

/** 当前 schema 版本 */
export const SCHEMA_VERSION = 1;

/**
 * 预置阶段（设计文档 2.3，勘测业务默认值）—— 单一事实源，
 * 渲染层 createDefaultProject 与主进程 SCAN_IMPORT 共用，避免重复硬编码。
 * 用户建项后可增删/改名/调序，这里只是"默认骨架"。
 */
export const PRESET_STAGES: Array<{ name: string; description: string }> = [
  { name: '项目立项', description: '任务接收、合同关联、任务书' },
  { name: '项目策划', description: '大纲、QSHE、预算、分包（资料最密集）' },
  { name: '项目执行', description: '工作量确认、试验结果、中间资料、安全记录' },
  { name: '成果审查与归档', description: '报告、图纸、计算书、签字盖章、强制性条文' },
  { name: '结算与总结', description: '结算材料、经验总结、安全文件汇编' },
];

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
