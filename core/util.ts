/**
 * 跨层共享的纯工具函数（不依赖 electron / node:fs），渲染层与主进程均可安全导入。
 *
 * v1.0.0：格式识别是**动态**的（按扩展名判定，任意格式都成立），不做固定枚举。
 */

/** 把 ISO 时间戳格式化为 `YYYY-MM-DD HH:mm`；空值返回占位符。 */
export function formatDateTime(iso: string | undefined | null, placeholder = '—'): string {
  if (!iso) return placeholder;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return placeholder;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 当前时刻的 ISO 时间戳 */
export function nowIso(): string {
  return new Date().toISOString();
}

/* ============================================================
 * 格式识别（动态、无枚举、任意格式）
 * ============================================================ */

/**
 * 从文件名取"格式"（= 小写扩展名，不含点）。
 * 动态判定：任意扩展名都成立，不做固定枚举。
 * 例：`报告.DOCX` → `docx`；`无扩展名` → ``（空串）。
 */
export function getFormat(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** 取文件名主干（不含扩展名、不含路径）。例：`a/b/报告.docx` → `报告`。 */
export function baseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * 重名自动加序号：若 name 已存在，返回 name_2、name_3…（避免覆盖）。
 * @param name 期望的文件名主干（不含扩展名）
 * @param existing 已存在的文件名主干集合
 */
export function autoNumberName(name: string, existing: Set<string> | string[]): string {
  const set = Array.isArray(existing) ? new Set(existing) : existing;
  if (!set.has(name)) return name;
  let i = 2;
  while (set.has(`${name}_${i}`)) i += 1;
  return `${name}_${i}`;
}

/** 人类可读的文件大小（B/KB/MB/GB）。 */
export function fileSizeLabel(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '—';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = size;
  let u = -1;
  do {
    v /= 1024;
    u += 1;
  } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}

/* ============================================================
 * 编辑/预览能力判定（"用哪个引擎"，非格式枚举）
 * ============================================================ */

/** 可"应用内原位编辑"的格式（csv + zip 系 Word/Excel）。 */
const EDITABLE = new Set(['csv', 'docx', 'docm', 'dotx', 'xlsx', 'xlsm', 'xltm']);
/** 老式二进制 Word/Excel：应用内查看 + 编辑后存为现代格式（docx/xlsx）。 */
const DOC_XLS = new Set(['doc', 'xls']);

/** 该格式能否应用内原位编辑（csv/docx/docm/dotx/xlsx/xlsm/xltm）。 */
export function isEditableFormat(format: string): boolean {
  return EDITABLE.has(format);
}

/** 该格式是否为老式 doc/xls（查看 + 存为现代格式）。 */
export function isDocXlsFormat(format: string): boolean {
  return DOC_XLS.has(format);
}

/** 编辑 csv/xlsx 系（表格）还是 docx 系（文档）。用于选引擎。 */
export function editEngine(format: string): 'sheet' | 'docx' | null {
  if (format === 'csv' || format === 'xlsx' || format === 'xlsm' || format === 'xltm') return 'sheet';
  if (format === 'docx' || format === 'docm' || format === 'dotx') return 'docx';
  return null;
}
