/**
 * Word（docx）原位文本替换引擎 —— 保真核心（设计文档 1.3 / 2.6，验收 #3 #4）。
 *
 * 保真保证：
 *  - 打开 docx(zip) → 取 word/document.xml 原始字符串；
 *  - 识别时只"读"（解析定位 <w:p>/<w:pStyle>/<w:tbl>/<w:t>），绝不重写结构；
 *  - 填写/替换时"只改 <w:t> 的文本内容"，其余字节一律不动；
 *  - 写回时仅替换该 zip entry，styles.xml / 字体 / 页边距 / 表格全部字节级保留。
 *
 * 中文健壮性：全链路 UTF-8 字符串处理，<w:t> 文本按原样替换，CJK 零改动。
 *
 * 仅依赖 jszip（纯 JS），可在 Electron 主进程内运行，不依赖任何外部进程。
 */
import JSZip from 'jszip';

/** 识别出的段落（章节/字段） */
export interface DocxParagraph {
  index: number;
  text: string;
  isHeading: boolean;
  headingLevel: number;
  inTable: boolean;
  textNodeCount: number;
}

/** 识别出的表格 */
export interface DocxTable {
  index: number;
  headers: string[];
  rows: number;
  cols: number;
}

/** 模板结构识别结果 */
export interface DocxStructure {
  paragraphs: DocxParagraph[];
  tables: DocxTable[];
  fullText: string;
}

/* ------------------------------------------------------------------ *
 *  对外 API
 * ------------------------------------------------------------------ */

/** 读取 docx 并解析结构（只读，不改动）。 */
export async function recognizeStructure(docx: Buffer | ArrayBuffer | Uint8Array): Promise<DocxStructure> {
  const zip = await JSZip.loadAsync(toUint8(docx));
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('不是有效的 docx：缺少 word/document.xml');
  const xml = await docEntry.async('string');
  return parseStructure(xml);
}

/**
 * 对 document.xml 原始字符串做"原位文本替换"（只改 <w:t> 文本节点内容）。
 * @returns { xml, applied, missed }
 */
export function replaceInXml(
  xml: string,
  replacements: Array<{ oldText: string; newText: string }>,
): { xml: string; applied: number; missed: string[] } {
  let out = xml;
  let applied = 0;
  const missed: string[] = [];
  for (const { oldText, newText } of replacements) {
    if (!oldText) {
      missed.push(oldText);
      continue;
    }
    const hit = replaceText(out, oldText, newText);
    if (hit) {
      out = hit;
      applied++;
    } else {
      missed.push(oldText);
    }
  }
  return { xml: out, applied, missed };
}

/** 从 docx 读取 word/document.xml 原始字符串（供原位替换用）。 */
export async function readDocumentXml(docx: Buffer | ArrayBuffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(toUint8(docx));
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('不是有效的 docx：缺少 word/document.xml');
  return docEntry.async('string');
}

/** 把新的 document.xml 写回原 docx（仅替换该 entry，其余字节保留）。 */
export async function writeDocx(
  original: Buffer | ArrayBuffer | Uint8Array,
  newDocumentXml: string,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(toUint8(original));
  if (!zip.file('word/document.xml')) zip.file('word/document.xml', newDocumentXml);
  else zip.file('word/document.xml', newDocumentXml);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return Buffer.from(out);
}

/* ------------------------------------------------------------------ *
 *  文本节点替换（核心）
 * ------------------------------------------------------------------ */

/**
 * 在文档 XML 中把 oldText 替换为 newText，三级降级：
 *  1) 某 <w:t> 节点文本 == oldText（整节点命中）→ 替换该节点文本；
 *  2) oldText 是某 <w:t> 节点文本的子串 → 节点内替换；
 *  3) oldText 由连续若干 <w:t> 拼接而成 → 首节点写 newText、其余清空。
 * 命中返回新串，未命中返回 null。
 */
function replaceText(xml: string, oldText: string, newText: string): string | null {
  const nodes = collectTextNodes(xml);
  if (nodes.length === 0) return null;

  // 1) 整节点命中（最干净）
  for (const n of nodes) {
    if (n.text === oldText) {
      return spliceNodeText(xml, n, newText);
    }
  }
  // 2) 节点内子串命中
  for (const n of nodes) {
    const idx = n.text.indexOf(oldText);
    if (idx !== -1) {
      const inner = n.text.slice(0, idx) + newText + n.text.slice(idx + oldText.length);
      return spliceNodeText(xml, n, inner);
    }
  }
  // 3) 跨节点拼接命中
  return replaceAcrossNodes(xml, nodes, oldText, newText);
}

/** 替换某节点的"内部文本"，保留标签与属性（含 xml:space 原样）。 */
function spliceNodeText(xml: string, n: TextNode, newInner: string): string {
  const safe = safeInner(newInner, n.tagHasSpacePreserve);
  return xml.slice(0, n.contentStart) + safe + xml.slice(n.contentEnd);
}

/** 跨连续节点替换：把 oldText 落到首节点，清空参与拼接的其余节点。 */
function replaceAcrossNodes(
  xml: string,
  nodes: TextNode[],
  oldText: string,
  newText: string,
): string | null {
  for (let i = 0; i < nodes.length; i++) {
    let acc = '';
    const involved: TextNode[] = [];
    for (let j = i; j < nodes.length; j++) {
      acc += nodes[j].text;
      involved.push(nodes[j]);
      if (acc.startsWith(oldText)) {
        // 命中：首节点写入 newText，其余清空（从后往前 splice 避免偏移）
        let result = spliceNodeText(xml, involved[0], newText);
        for (let k = involved.length - 1; k >= 1; k--) {
          const node = involved[k];
          // 在新串中重新定位该节点（文本已被清空过则跳过）
          const re = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;
          let mm: RegExpExecArray | null;
          let target: TextNode | null = null;
          while ((mm = re.exec(result)) !== null) {
            const cs = result.indexOf('>', mm.index) + 1;
            const ce = result.lastIndexOf('</w:t>', mm.index + mm[0].length);
            if (cs === node.contentStart && ce === node.contentEnd) {
              target = { ...node, contentStart: cs, contentEnd: ce };
              break;
            }
          }
          if (target) result = spliceNodeText(result, target, '');
        }
        return result;
      }
      if (acc.length > oldText.length * 3) break;
    }
  }
  return null;
}

interface TextNode {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  text: string;
  tagHasSpacePreserve: boolean;
}

/** 收集所有 <w:t>…</w:t> 文本节点（含属性信息）。 */
function collectTextNodes(xml: string): TextNode[] {
  const nodes: TextNode[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const fullStart = m.index;
    const fullEnd = m.index + m[0].length;
    const tag = xml.slice(fullStart, xml.indexOf('>', fullStart));
    const contentStart = xml.indexOf('>', fullStart) + 1;
    const contentEnd = fullEnd - '</w:t>'.length;
    const text = xml.slice(contentStart, contentEnd);
    nodes.push({
      start: fullStart,
      end: fullEnd,
      contentStart,
      contentEnd,
      text,
      tagHasSpacePreserve: /xml:space="preserve"/.test(tag),
    });
  }
  return nodes;
}

/**
 * 写入 <w:t> 内部文本前的安全处理：
 *  - XML 实体转义；
 *  - 若节点未带 xml:space="preserve" 且文本首尾有空白，用不间断空格兜底，
 *    避免 Word 裁掉首尾空白（保真细节）。
 */
function safeInner(inner: string, hasSpacePreserve: boolean): string {
  if (!inner) return '';
  let esc = inner
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (!hasSpacePreserve) {
    if (esc.startsWith(' ')) esc = '\u00A0' + esc.slice(1);
    if (esc.endsWith(' ')) esc = esc.slice(0, -1) + '\u00A0';
  }
  return esc;
}

/* ------------------------------------------------------------------ *
 *  结构识别（只读）
 * ------------------------------------------------------------------ */

function parseStructure(xml: string): DocxStructure {
  const paragraphs: DocxParagraph[] = [];
  const tables: DocxTable[] = [];

  const tableRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  const tableSpans: Array<{ start: number; end: number }> = [];
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(xml)) !== null) {
    tableSpans.push({ start: tm.index, end: tm.index + tm[0].length });
  }

  const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let pm: RegExpExecArray | null;
  let paraIndex = 0;
  while ((pm = paraRe.exec(xml)) !== null) {
    const pXml = pm[0];
    const text = extractText(pXml);
    if (text.trim().length === 0) {
      paraIndex++;
      continue;
    }
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(pXml)?.[1] ?? '';
    const isHeading = /^Heading\d/i.test(style) || /<w:outlineLvl/.test(pXml);
    const levelMatch = /Heading(\d)/i.exec(style);
    const pStart = pm.index;
    paragraphs.push({
      index: paraIndex,
      text,
      isHeading,
      headingLevel: levelMatch ? parseInt(levelMatch[1], 10) : 0,
      inTable: tableSpans.some((t) => pStart >= t.start && pStart <= t.end),
      textNodeCount: (pXml.match(/<w:t[\s>]/g) || []).length,
    });
    paraIndex++;
  }

  let ti = 0;
  let tmm: RegExpExecArray | null;
  const tableRe2 = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  while ((tmm = tableRe2.exec(xml)) !== null) {
    const tbl = tmm[0];
    const rowsArr = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    const colsArr = (rowsArr[0] || '').match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    tables.push({
      index: ti,
      headers: colsArr.map((c) => extractText(c).trim()),
      rows: rowsArr.length,
      cols: colsArr.length,
    });
    ti++;
  }

  return { paragraphs, tables, fullText: paragraphs.map((p) => p.text).join('\n') };
}

function extractText(pXml: string): string {
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml)) !== null) {
    texts.push(
      m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'),
    );
  }
  return texts.join('');
}

function toUint8(input: Buffer | ArrayBuffer | Uint8Array): Uint8Array {
  if (Buffer.isBuffer(input)) return new Uint8Array(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}
