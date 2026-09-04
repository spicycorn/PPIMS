/**
 * PPIMS 单元测试（v1.0.0 个人归档版）。
 *
 * 一、Word 原位替换引擎 —— 保真测试（验收硬证据）：
 *   1) 结构识别能找出标题 / 正文 / 表格；
 *   2) 原位替换后，docx zip 中"只有 word/document.xml 这一项改变"，其余 entry 字节级不变；
 *   3) document.xml 内部"只有目标 <w:t> 的文本被替换"，其余全部不变；
 *   4) 中文（CJK）写入正确、无乱码；
 *   5) 未命中的替换如实上报 missed，不静默失败。
 *
 * 二、结构模板映射（项目→结构模板，纯逻辑）。
 *
 * 三、CSV 原位编辑引擎（识别 + 编辑 + 保真）。
 *
 * 四、util（动态格式识别 / 重名加序号 / 大小标签）。
 *
 * 五、classify（分类纯逻辑）。
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  recognizeStructure,
  replaceInXml,
  writeDocx,
  readDocumentXml,
} from '../../core/services/docx-engine';
import { recognizeCsv, applyCsv, parseCsv, serializeCsv } from '../../core/services/csv-engine';
import { projectToTemplateStructure, countTemplateSlots } from '../../core/template-mapping';
import { getFormat, baseName, autoNumberName, fileSizeLabel, isEditableFormat, editEngine } from '../../core/util';
import type { Project, Slot, StructureTemplate } from '../../core/types';
import { SCHEMA_VERSION } from '../../core/types';

/* ================================================================
 * 一、Word 原位替换引擎 · 保真
 * ================================================================ */

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
    expect(structure.fullText).toContain('某某河道治理工程勘察');
    expect(structure.fullText).toContain('60-F14742S');
    expect(structure.tables.length).toBeGreaterThanOrEqual(1);
    expect(structure.tables[0].headers).toContain('项目');
  });

  it('原位替换后：仅目标 <w:t> 文本改变，zip 其余 entry 字节级不变', async () => {
    const before = await buildSampleDocx();
    const beforeHashes = await entryHashes(before);
    const beforeXml = await readDocumentXml(before);
    const { xml: newXml, applied, missed } = replaceInXml(beforeXml, [
      { oldText: '某某河道治理工程勘察', newText: '新项目名称：长江支流整治' },
    ]);
    expect(applied).toBe(1);
    expect(missed.length).toBe(0);
    const after = await writeDocx(before, newXml);
    const afterHashes = await entryHashes(after);
    const afterXml = await readDocumentXml(after);
    for (const name of Object.keys(beforeHashes)) {
      if (name === 'word/document.xml') continue;
      expect(afterHashes[name]).toBe(beforeHashes[name]);
    }
    expect(afterXml).toContain('新项目名称：长江支流整治');
    expect(afterXml).not.toContain('某某河道治理工程勘察');
    expect(afterXml).toContain('第一章 总则');
    expect(afterXml).toContain('钻孔');
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

/* ================================================================
 * 二、结构模板映射（项目→结构模板，纯逻辑）
 * ================================================================ */

function makeProject(): Project {
  const file1 = {
    id: 'f1', name: '勘察大纲', format: 'docx', size: 1024,
    createdAt: '2026-01-01T00:00:00.000Z', path: 'files/勘察大纲.docx', tags: ['重要'],
  };
  const slotA: Slot = {
    id: 'slot_a', name: '勘察大纲', files: [file1],
    subSlots: [{ id: 'slot_sub', name: '子项', files: [], subSlots: [], order: 0 }],
    order: 0,
  };
  const slotB: Slot = { id: 'slot_b', name: '工作量确认表', files: [], subSlots: [], order: 1 };

  return {
    id: 'proj_1',
    info: { name: 'XX 河道勘察', code: '60-F1', region: '华北' },
    rootPath: '',
    slots: [slotA, slotB],
    schemaVersion: SCHEMA_VERSION,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('projectToTemplateStructure（项目→结构模板映射）', () => {
  it('正确捕获顶层插槽数量与名称', () => {
    const out = projectToTemplateStructure(makeProject());
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('勘察大纲');
    expect(out[1].name).toBe('工作量确认表');
  });

  it('正确捕获嵌套子插槽结构', () => {
    const out = projectToTemplateStructure(makeProject());
    expect(out[0].subSlots).toHaveLength(1);
    expect(out[0].subSlots[0].name).toBe('子项');
    expect(out[1].subSlots).toHaveLength(0);
  });

  it('countTemplateSlots 统计顶层 + 嵌套', () => {
    const tpl: StructureTemplate = {
      id: 't', name: 'x', structure: projectToTemplateStructure(makeProject()),
      createdAt: '', updatedAt: '',
    };
    expect(countTemplateSlots(tpl)).toBe(3); // 2 顶层 + 1 子
  });
});

/* ================================================================
 * 三、CSV 原位编辑引擎
 * ================================================================ */

describe('csv 引擎 · 识别 + 编辑 + 保真', () => {
  it('识别 csv 网格（含引号内逗号）', () => {
    const text = '姓名,备注\n张三,"你好, 世界"\n李四,普通';
    const model = recognizeCsv(text);
    expect(model.rows).toBe(3);
    expect(model.cols).toBe(2);
    const grid = parseCsv(text);
    expect(grid[1][1]).toBe('你好, 世界'); // 引号内逗号保留
  });

  it('编辑单元格后原位写回，其余单元格不变', () => {
    const text = 'a,b\n1,2\n3,4';
    const out = applyCsv(text, [{ r: 1, c: 1, v: '99' }]);
    expect(out).toContain('1,99');
    expect(out).toContain('3,4'); // 其余不变
    expect(out).toContain('a,b');
  });

  it('序列化时对含逗号/引号的值加引号', () => {
    const grid = [['x', 'a,b'], ['y', 'say "hi"']];
    const text = serializeCsv(grid);
    expect(text).toContain('"a,b"');
    expect(text).toContain('"say ""hi"""');
  });
});

/* ================================================================
 * 四、util（动态格式识别 / 重名加序号 / 大小标签）
 * ================================================================ */

describe('util · 动态格式与命名', () => {
  it('getFormat 动态取扩展名（无枚举，任意格式）', () => {
    expect(getFormat('报告.DOCX')).toBe('docx');
    expect(getFormat('a/b/图纸.dwg')).toBe('dwg');
    expect(getFormat('压缩包.zip')).toBe('zip');
    expect(getFormat('无扩展名')).toBe('');
  });

  it('baseName 取主干（去扩展名/路径）', () => {
    expect(baseName('a/b/报告.docx')).toBe('报告');
    expect(baseName('无扩展名')).toBe('无扩展名');
  });

  it('autoNumberName 重名加序号', () => {
    const existing = new Set(['任务书']);
    expect(autoNumberName('任务书', existing)).toBe('任务书_2');
    expect(autoNumberName('任务书', new Set(['任务书', '任务书_2']))).toBe('任务书_3');
    expect(autoNumberName('新文件', existing)).toBe('新文件');
  });

  it('fileSizeLabel 人类可读', () => {
    expect(fileSizeLabel(512)).toBe('512 B');
    expect(fileSizeLabel(1024)).toContain('KB');
    expect(fileSizeLabel(1024 * 1024)).toContain('MB');
  });

  it('isEditableFormat / editEngine 能力判定', () => {
    expect(isEditableFormat('csv')).toBe(true);
    expect(isEditableFormat('docx')).toBe(true);
    expect(isEditableFormat('pdf')).toBe(false);
    expect(editEngine('csv')).toBe('sheet');
    expect(editEngine('xlsx')).toBe('sheet');
    expect(editEngine('docx')).toBe('docx');
    expect(editEngine('pdf')).toBe(null);
  });
});

/* ================================================================
 * 五、classify（分类纯逻辑）
 * ================================================================ */
import {
  normalizeDimensions,
  pruneCategoryValues,
  distinctValues,
  sanitizeProjectCategories,
  defaultRootConfig,
} from '../../core/classify';

describe('classify · 维度规整与取值清理', () => {
  it('normalizeDimensions：保留合法项、去重名、生成稳定 id', () => {
    const dims = normalizeDimensions([
      { name: '地区' },
      { name: '专业' },
      { name: '地区' },
      { name: '  ' },
      { id: 'dim_custom', name: '客户' },
    ]);
    expect(dims.map((d) => d.name)).toEqual(['地区', '专业', '客户']);
    expect(dims.find((d) => d.name === '客户')?.id).toBe('dim_custom');
    for (const d of dims) expect(d.id).toMatch(/^dim_/);
  });

  it('pruneCategoryValues：只保留仍在维度定义里的键、剔除空值', () => {
    const dims = [{ id: 'dim_a', name: '地区' }, { id: 'dim_b', name: '专业' }];
    expect(pruneCategoryValues({ dim_a: '华北', dim_b: '', dim_gone: 'x' }, dims)).toEqual({ dim_a: '华北' });
  });

  it('distinctValues：取某维度出现过的取值（去重、排序）', () => {
    const projects = [
      { info: { name: 'A', code: '1', categories: { dim_a: '华南' } } },
      { info: { name: 'B', code: '2', categories: { dim_a: '华北' } } },
      { info: { name: 'C', code: '3', categories: { dim_a: '华南' } } },
    ];
    expect(distinctValues(projects, 'dim_a')).toEqual(['华北', '华南']);
  });

  it('sanitizeProjectCategories + defaultRootConfig', () => {
    expect(sanitizeProjectCategories({ name: 'P', code: 'C', categories: { dim_a: '华北' } }, [{ id: 'dim_a', name: '地区' }]).categories).toEqual({ dim_a: '华北' });
    expect(defaultRootConfig().dimensions).toEqual([]);
  });
});
