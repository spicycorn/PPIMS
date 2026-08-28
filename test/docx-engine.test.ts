/**
 * Word 原位替换引擎 —— 保真单元测试（验收 #4 的硬证据）。
 *
 * 断言：
 *  1) 结构识别能找出标题 / 正文 / 表格；
 *  2) 原位替换后，docx zip 中"只有 word/document.xml 这一项改变"，
 *     其余 entry（styles.xml / rels / [Content_Types].xml 等）字节级不变；
 *  3) document.xml 内部"只有目标 <w:t> 的文本被替换"，其余标签 / 属性 / 其它 <w:t> 全部不变；
 *  4) 中文（CJK）写入正确、无乱码；
 *  5) 未命中的替换如实上报 missed，不静默失败。
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  recognizeStructure,
  replaceInXml,
  writeDocx,
  readDocumentXml,
} from '../electron/services/docx-engine';

/** 构造一个最小但合法的 docx（含标题 / 正文 / 表格 / 中文字符） */
async function buildSampleDocx(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );

  // 样式表：定义 Heading1（保真测试要确认它不被改动）
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:rFonts w:ascii="宋体" w:eastAsia="宋体"/></w:rPr>
  </w:style>
</w:styles>`,
  );

  // 文档正文：标题 + 正文（含中文待填字段）+ 表格
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
  <w:p>
    <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
    <w:r><w:rPr><w:b/></w:rPr><w:t>第一章 总则</w:t></w:r>
  </w:p>
  <w:p>
    <w:r><w:t>项目名称：</w:t></w:r>
    <w:r><w:t>某某河道治理工程勘察</w:t></w:r>
  </w:p>
  <w:p>
    <w:r><w:t>项目编号：60-F14742S</w:t></w:r>
  </w:p>
  <w:tbl>
    <w:tr>
      <w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>数量</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:t>钻孔</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body>
</w:document>`,
  );

  const u8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return Buffer.from(u8);
}

/** 列出 zip 内每个 entry 的 SHA-256（用于字节级对比） */
async function entryHashes(docx: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(docx);
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const content = await (entry as any).async('nodebuffer');
    out[name] = Buffer.from(content).toString('hex');
  }
  return out;
}

describe('docx 原位替换引擎 · 保真', () => {
  it('识别出标题 / 正文 / 表格 / 中文', async () => {
    const docx = await buildSampleDocx();
    const structure = await recognizeStructure(docx);

    const headings = structure.paragraphs.filter((p) => p.isHeading);
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0].text).toContain('总则');

    // 正文中文识别正确
    expect(structure.fullText).toContain('某某河道治理工程勘察');
    expect(structure.fullText).toContain('60-F14742S');

    // 表格识别
    expect(structure.tables.length).toBeGreaterThanOrEqual(1);
    expect(structure.tables[0].headers).toContain('项目');
    expect(structure.tables[0].rows).toBeGreaterThanOrEqual(2);
  });

  it('原位替换后：仅目标 <w:t> 文本改变，zip 其余 entry 字节级不变', async () => {
    const before = await buildSampleDocx();
    const beforeHashes = await entryHashes(before);
    const beforeXml = await readDocumentXml(before);

    // 只改一个字段（中文）
    const { xml: newXml, applied, missed } = replaceInXml(beforeXml, [
      { oldText: '某某河道治理工程勘察', newText: '新项目名称：长江支流整治' },
    ]);
    expect(applied).toBe(1);
    expect(missed.length).toBe(0);

    const after = await writeDocx(before, newXml);
    const afterHashes = await entryHashes(after);
    const afterXml = await readDocumentXml(after);

    // 1) 其它 entry 字节级不变
    for (const name of Object.keys(beforeHashes)) {
      if (name === 'word/document.xml') continue;
      expect(afterHashes[name], `entry ${name} 必须字节级一致`).toBe(beforeHashes[name]);
    }

    // 2) document.xml 只有目标文本被替换，其它 <w:t> 不变
    expect(afterXml).toContain('新项目名称：长江支流整治');
    expect(afterXml).not.toContain('某某河道治理工程勘察');
    // 其它文本保持原样
    expect(afterXml).toContain('第一章 总则');
    expect(afterXml).toContain('项目编号：60-F14742S');
    expect(afterXml).toContain('钻孔');
    expect(afterXml).toContain('12');

    // 3) 除被替换的文本外，XML 结构（标签/属性）不变：
    //    去掉被替换的新文本与旧文本差异后，应一致
    const normBefore = beforeXml.replace('某某河道治理工程勘察', 'XX');
    const normAfter = afterXml.replace('新项目名称：长江支流整治', 'XX');
    expect(normAfter).toBe(normBefore);
  });

  it('跨 run 拆分的文本也能原位命中', async () => {
    const docx = await buildSampleDocx();
    const xml = await readDocumentXml(docx);
    // "项目名称：" 与 "某某河道治理工程勘察" 分在两个 <w:t>，拼接起来命中
    const { applied, missed } = replaceInXml(xml, [
      { oldText: '项目名称：某某河道治理工程勘察', newText: '项目名称：替换成功' },
    ]);
    expect(applied).toBe(1);
    expect(missed.length).toBe(0);
  });

  it('未命中的替换如实上报 missed，不静默失败', async () => {
    const docx = await buildSampleDocx();
    const xml = await readDocumentXml(docx);
    const { applied, missed } = replaceInXml(xml, [
      { oldText: '这段文字根本不存在', newText: 'x' },
    ]);
    expect(applied).toBe(0);
    expect(missed).toEqual(['这段文字根本不存在']);
  });
});
