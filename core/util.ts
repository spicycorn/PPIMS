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
