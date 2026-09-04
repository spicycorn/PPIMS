/**
 * CSV 原位编辑引擎（纯文本表格，保真核心）。
 *
 * 保真保证：
 *  - 读 csv → 按行解析成二维网格（处理引号内逗号/换行）；
 *  - 编辑"只改单元格值"，其余行/分隔符不动；
 *  - 写回按原分隔符（默认逗号）重新序列化，UTF-8。
 *
 * 仅依赖 Node fs / 纯 JS，Electron 主进程内运行，不依赖外部进程。
 */

/** 识别出的 csv 网格 */
export interface CsvModel {
  sheetNames: string[];      // csv 只有一个"表"，固定 ['Sheet1']
  active: string;            // 'Sheet1'
  cells: Array<{ r: number; c: number; v: string }>;
  rows: number;
  cols: number;
  fullText: string;          // 原始文本（查看用）
}

/** 解析 CSV 文本为二维网格（处理引号内逗号/换行）。 */
export function parseCsv(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      grid.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // 收尾
  if (field !== '' || row.length) {
    row.push(field);
    grid.push(row);
  }
  return grid;
}

/** 把一个单元格值序列化为 csv 字段（必要时加引号）。 */
function toField(v: string): string {
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** 序列化二维网格为 CSV 文本。 */
export function serializeCsv(grid: string[][]): string {
  return grid
    .map((row) => row.map(toField).join(','))
    .join('\n');
}

/** 识别 csv → 网格模型（只读，不改动）。 */
export function recognizeCsv(text: string): CsvModel {
  const grid = parseCsv(text);
  const rows = grid.length;
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const cells: Array<{ r: number; c: number; v: string }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      cells.push({ r, c, v: grid[r][c] });
    }
  }
  return { sheetNames: ['Sheet1'], active: 'Sheet1', cells, rows, cols, fullText: text };
}

/** 编辑 csv（改单元格值）→ 新文本。edits: { r, c, v }。 */
export function applyCsv(text: string, edits: Array<{ r: number; c: number; v: string }>): string {
  const grid = parseCsv(text);
  for (const e of edits) {
    if (!grid[e.r]) grid[e.r] = [];
    grid[e.r][e.c] = e.v;
  }
  return serializeCsv(grid);
}
