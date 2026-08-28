/**
 * Excel（xlsx）编辑引擎 —— 保留工作簿结构，只改单元格（设计文档 1.3，验收 #3 #4 Excel 部分）。
 * 用 SheetJS（xlsx，纯 JS）读取/写入单元格，保留工作簿整体结构（样式/列宽/合并格等以工作簿为单位保留）。
 * 中文健壮性：全链路 UTF-8（SheetJS 原生支持 CJK）。
 */
import * as XLSX from 'xlsx';

/** 读取工作簿为可编辑模型 */
export interface SheetCell {
  r: number; // 行（0 起）
  c: number; // 列（0 起）
  v: string;
}

export interface WorkbookModel {
  sheetNames: string[];
  active: string;
  cells: SheetCell[]; // 活动表的非空单元格
  rows: number;
  cols: number;
}

/** 解析 xlsx 为模型（只读） */
export async function recognizeWorkbook(xlsx: Buffer | ArrayBuffer | Uint8Array): Promise<WorkbookModel> {
  const buf = toBuffer(xlsx);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const active = wb.SheetNames[0] ?? '';
  const ws = wb.Sheets[active];
  const ref = ws ? ws['!ref'] : null;
  let rows = 0;
  let cols = 0;
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    rows = range.e.r - range.s.r + 1;
    cols = range.e.c - range.s.c + 1;
  }
  const cells: SheetCell[] = [];
  if (ws) {
    for (const key of Object.keys(ws)) {
      if (key === '!ref' || key.startsWith('!')) continue;
      const cell = ws[key] as XLSX.CellObject;
      if (cell && cell.v !== undefined && cell.v !== null) {
        const addr = XLSX.utils.decode_cell(key);
        cells.push({ r: addr.r, c: addr.c, v: String(cell.v) });
      }
    }
  }
  return { sheetNames: wb.SheetNames, active, cells, rows, cols };
}

/**
 * 按单元格地址写入值，保留工作簿其余结构。
 * @param edits 编辑列表 { addr: "B2", value: "..." }
 * @returns 新的 xlsx Buffer
 */
export async function writeWorkbook(
  original: Buffer | ArrayBuffer | Uint8Array,
  activeSheet: string,
  edits: Array<{ addr: string; value: string }>,
): Promise<Buffer> {
  const wb = XLSX.read(toBuffer(original), { type: 'buffer' });
  const sheetName = activeSheet || wb.SheetNames[0];
  if (!wb.SheetNames.includes(sheetName)) throw new Error(`工作表不存在：${sheetName}`);
  const ws = wb.Sheets[sheetName];
  for (const { addr, value } of edits) {
    ws[XLSX.utils.encode_cell({ r: XLSX.utils.decode_cell(addr).r, c: XLSX.utils.decode_cell(addr).c })] = {
      t: 's',
      v: value,
    };
  }
  // 更新 !ref
  const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  let maxR = ref.e.r;
  let maxC = ref.e.c;
  for (const { addr } of edits) {
    const p = XLSX.utils.decode_cell(addr);
    maxR = Math.max(maxR, p.r);
    maxC = Math.max(maxC, p.c);
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: ref.s.r, c: ref.s.c }, e: { r: maxR, c: maxC } });
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(out);
}

function toBuffer(input: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(input);
}
