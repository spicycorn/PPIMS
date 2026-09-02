/**
 * 项目分类（设计文档 2.9）的纯逻辑层：维度校验、取值清理、分组/排序辅助。
 * 零 electron / 零 node 依赖，渲染层与主进程、单元测试都能安全导入（去重落点）。
 *
 * 原则（2.9）：分类=元数据+视图层，不碰物理目录；维度用户自定义、可扩展；取值自由文本。
 */
import type { CategoryDimension, CategoryValues, ProjectInfo, RootConfig } from './types';

/** 合法的维度 id（dim_ 前缀 + 字母数字），拒绝非法/危险字符 */
const DIM_ID_RE = /^dim_[a-z0-9]{1,24}$/i;
/** 维度名：非空、长度上限，禁止换行（防止注入/换行破坏展示） */
const DIM_NAME_RE = /^[\p{L}\p{N} _\-（）()]{1,32}$/u;

/** 校验并规整一个维度名（返回是否合法） */
export function isValidDimensionName(name: string): boolean {
  return typeof name === 'string' && DIM_NAME_RE.test(name.trim());
}

/** 由任意种子字符串生成稳定的维度 id（dim_ + 前 8 位 base36），供新增维度用 */
export function makeDimensionId(seed: string, existing: Set<string>): string {
  const base = (seed.replace(/[^a-z0-9]/gi, '') || 'dim').slice(0, 8) || 'dim';
  let id = `dim_${base}`;
  let i = 1;
  while (existing.has(id)) {
    id = `dim_${base}${i}`;
    i++;
  }
  return id;
}

/** 校验并规整一组维度定义（去重名、保留合法项、限制数量） */
export function normalizeDimensions(
  dims: Array<{ id?: string; name?: string }>,
  max = 16,
): CategoryDimension[] {
  const out: CategoryDimension[] = [];
  const seenName = new Set<string>();
  const seenId = new Set<string>();
  for (const d of dims) {
    if (out.length >= max) break;
    const name = (d.name ?? '').trim();
    if (!isValidDimensionName(name) || seenName.has(name)) continue;
    let id = d.id ?? '';
    if (!DIM_ID_RE.test(id) || seenId.has(id)) {
      id = makeDimensionId(name || `d${out.length + 1}`, seenId);
    }
    seenName.add(name);
    seenId.add(id);
    out.push({ id, name });
  }
  return out;
}

/**
 * 清理项目取值：只保留"仍在维度定义里"的键；空值剔除。
 * 用于"删除维度后惰性清理"与"保存前规整"（不强制批量改所有项目，见 2.9）。
 */
export function pruneCategoryValues(
  values: CategoryValues | undefined,
  dims: CategoryDimension[],
): CategoryValues {
  const validIds = new Set(dims.map((d) => d.id));
  const out: CategoryValues = {};
  if (!values) return out;
  for (const [k, v] of Object.entries(values)) {
    if (!validIds.has(k)) continue;
    const s = (v ?? '').trim();
    if (s) out[k] = s;
  }
  return out;
}

/** 规整一条项目信息里的分类取值（供保存前调用，不改其它字段） */
export function sanitizeProjectCategories(info: ProjectInfo, dims: CategoryDimension[]): ProjectInfo {
  const pruned = pruneCategoryValues(info.categories, dims);
  const has = Object.keys(pruned).length > 0;
  const next: ProjectInfo = { ...info };
  if (has) next.categories = pruned;
  else delete next.categories;
  return next;
}

/** 取某维度下出现过的所有取值（用于"按维度分组/筛选"的下拉，纯展示用） */
export function distinctValues(
  projects: Array<{ info: ProjectInfo | null }>,
  dimId: string,
): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    const v = p.info?.categories?.[dimId];
    if (v) set.add(v.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/** 空根配置（首次选根目录时用，不预置任何业务维度——符合"不预置业务内容"） */
export function defaultRootConfig(): RootConfig {
  return { dimensions: [] };
}
