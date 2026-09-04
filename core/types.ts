/**
 * PPIMS 共享数据模型（单一事实源）。
 * 主进程（Node/Electron）与渲染层（Vue）共用此文件，保证数据结构一致。
 *
 * v1.0.0 个人归档版：
 * - 定位从"项目完成度 + 审核流转 + 多版本"改为"归档已完成文件、分类管理"。
 * - 删除：文件状态流转、必要性、版本号、进度、固定格式枚举、期望格式、"填模板生成文档"流程。
 * - 新增：插槽可嵌套（多级树）、文件自定义标签、动态格式识别（无固定枚举、无死代码）。
 *
 * 约定：
 * - 所有时间字段用 ISO 8601 字符串（本地时区），全链路 UTF-8。
 * - 文件路径统一用"相对项目根目录"的 POSIX 风格路径，保证项目文件夹可整体搬移。
 * - 格式识别是**动态**的（按扩展名判定，任意格式），不做固定枚举。
 */

/** 分类维度（用户自定义、可扩展多维） */
export interface CategoryDimension {
  /** 稳定 id（形如 dim_xxx） */
  id: string;
  /** 维度名（用户可见，如"地区""专业"） */
  name: string;
}

/** 项目分类取值：维度 id → 取值（自由文本） */
export type CategoryValues = Record<string, string>;

/** 数据根目录的根级配置（存 <root>/ppims.json，全局唯一） */
export interface RootConfig {
  dimensions: CategoryDimension[];
}

/** 项目信息（建项时填写） */
export interface ProjectInfo {
  /** 项目名称（必填） */
  name: string;
  /** 项目编号（必填） */
  code: string;
  /** 地区（选填） */
  region?: string;
  /** 初始阶段（选填，自由文本） */
  stage?: string;
  /** 类型（选填，如 勘测/设计/施工…） */
  type?: string;
  /** 下发时间（选填，ISO 日期） */
  dispatchDate?: string;
  /** 备注（选填） */
  remark?: string;
  /** 分类取值（维度 id → 取值） */
  categories?: CategoryValues;
}

/**
 * 文件条目（独立文件，无版本/无状态）。
 * = 上传的文件名 + 属性 + 自定义标签。
 * 同一插槽（文件夹）下可有多个独立文件，各自保留自己的名字与属性。
 */
export interface FileEntry {
  id: string;
  /** 显示名（不含扩展名；重名自动加序号，如 任务书 → 任务书_2） */
  name: string;
  /** 动态格式（扩展名，如 docx/pdf/zip/csv；非固定枚举，上传什么就是什么） */
  format: string;
  /** 文件大小（字节，自动） */
  size: number;
  /** 上传时间（自动，ISO） */
  createdAt: string;
  /** 更新时间（编辑后保存时更新，ISO） */
  updatedAt?: string;
  /** 相对项目根目录的 POSIX 路径 */
  path: string;
  /** 描述/备注（用户填，可选） */
  remark?: string;
  /** 自定义标签（如"重要""已核"，纯归档用，非状态流转） */
  tags: string[];
}

/**
 * 插槽（统一节点，可嵌套成多级树）。
 * 本质是一个"文件夹"：
 * - 可挂文件（files，1..n 个，各自独立）
 * - 可挂子插槽（subSlots，形成多级树）
 * 阶段（Stage）就是顶层插槽。
 */
export interface Slot {
  id: string;
  name: string;
  /** 插槽下的文件（1..n，各自独立命名） */
  files: FileEntry[];
  /** 子插槽（多级树） */
  subSlots: Slot[];
  /** 排序（数字小在前） */
  order: number;
}

/** 项目（文件夹自包含的完整数据，序列化即 project.json） */
export interface Project {
  id: string;
  info: ProjectInfo;
  /** 项目根目录绝对路径（仅本机使用） */
  rootPath: string;
  /** 顶层插槽（= 阶段） */
  slots: Slot[];
  /** project.json 数据版本（迁移用） */
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

/* ============================================================
 * 结构模板（全局蓝图）= "阶段 + 插槽"树（不含任何模板文件）。
 * 用于一键建项时带出结构，免去逐一手填插槽。
 * 存于 Electron app.getPath('userData')/templates/<id>/template.json。
 * ============================================================ */

/** 结构模板（纯结构：插槽树，名称 + 嵌套，无 id/文件） */
export interface StructureTemplate {
  id: string;
  name: string;
  description?: string;
  /** 插槽树（纯结构：name + subSlots，无 id/files/order） */
  structure: TplSlotInput[];
  createdAt: string;
  updatedAt: string;
}

/* ---------- 结构模板"输入"类型（新建/编辑时渲染层提交，主进程据此落盘） ---------- */

/** 输入：结构模板中的插槽（纯结构） */
export interface TplSlotInput {
  name: string;
  subSlots: TplSlotInput[];
}

/** 输入：新建/编辑结构模板的完整结构 */
export interface TplCreateInput {
  name: string;
  description?: string;
  slots: TplSlotInput[];
}

/** 当前 schema 版本（v1.0.0 新数据模型，不兼容旧版） */
export const SCHEMA_VERSION = 2;
