/**
 * 跨层共享的纯工具函数（不依赖 electron / node:fs），渲染层与主进程均可安全导入。
 */

/** 把 ISO 时间戳格式化为 `YYYY-MM-DD HH:mm`；空值返回占位符。
 *  （FilePanel 的文件时间、TemplateManager 的保存时间共用，避免各写一份） */
export function formatDateTime(iso: string | undefined | null, placeholder = '—'): string {
  if (!iso) return placeholder;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return placeholder;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 当前时刻的 ISO 时间戳（主进程 store 与各服务共用，避免各处 new Date() 风格不一致） */
export function nowIso(): string {
  return new Date().toISOString();
}
