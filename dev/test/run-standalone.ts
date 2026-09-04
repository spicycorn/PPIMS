/**
 * 独立测试脚本（不依赖 vitest/esbuild，用 Node 原生 TS 类型剥离运行）。
 * 验证 v1.0.0 核心纯逻辑：docx 引擎 / csv 引擎 / util / classify / 结构模板映射。
 * 运行：node dev/test/run-standalone.ts
 */
import assert from 'node:assert';
import JSZip from 'jszip';
import { recognizeStructure, replaceInXml, writeDocx, readDocumentXml } from '../../core/services/docx-engine.ts';
import { recognizeCsv, applyCsv, parseCsv, serializeCsv } from '../../core/services/csv-engine.ts';
import { projectToTemplateStructure, countTemplateSlots } from '../../core/template-mapping.ts';
import { getFormat, autoNumberName, isEditableFormat, editEngine } from '../../core/util.ts';
import { normalizeDimensions, pruneCategoryValues, distinctValues, sanitizeProjectCategories, defaultRootConfig } from '../../core/classify.ts';
import type { Project } from '../../core/types.ts';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

console.log('\n一、docx 原位替换引擎 · 保真');

async function buildSampleDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 总则</w:t></w:r></w:p>
  <w:p><w:r><w:t>项目名称：</w:t></w:r><w:r><w:t>某某河道治理工程勘察</w:t></w:r></w:p>
  <w:p><w:r><w:t>项目编号：60-F14742S</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数量</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>钻孔</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body>
</w:document>`);
  const u8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return Buffer.from(u8);
}

async function main() {
  await test('识别出标题 / 正文 / 表格 / 中文', async () => {
    const docx = await buildSampleDocx();
    const structure = await recognizeStructure(docx);
    const headings = structure.paragraphs.filter((p) => p.isHeading);
    assert.ok(headings.length >= 1, 'should have headings');
    assert.ok(headings[0].text.includes('总则'));
    assert.ok(structure.fullText.includes('某某河道治理工程勘察'));
    assert.ok(structure.tables.length >= 1);
    assert.ok(structure.tables[0].headers.includes('项目'));
  });

  await test('原位替换：仅目标文本改变，其余不变', async () => {
    const before = await buildSampleDocx();
    const xml = await readDocumentXml(before);
    const { xml: newXml, applied, missed } = replaceInXml(xml, [
      { oldText: '某某河道治理工程勘察', newText: '新项目名称：长江支流整治' },
    ]);
    assert.equal(applied, 1);
    assert.equal(missed.length, 0);
    const after = await writeDocx(before, newXml);
    const afterXml = await readDocumentXml(after);
    assert.ok(afterXml.includes('新项目名称：长江支流整治'));
    assert.ok(!afterXml.includes('某某河道治理工程勘察'));
    assert.ok(afterXml.includes('第一章 总则'));
    assert.ok(afterXml.includes('钻孔'));
  });

  await test('未命中的替换如实上报 missed', async () => {
    const docx = await buildSampleDocx();
    const xml = await readDocumentXml(docx);
    const { applied, missed } = replaceInXml(xml, [{ oldText: '这段文字根本不存在', newText: 'x' }]);
    assert.equal(applied, 0);
    assert.deepStrictEqual(missed, ['这段文字根本不存在']);
  });

  console.log('\n二、CSV 原位编辑引擎');
  await test('识别 csv 网格（含引号内逗号）', () => {
    const text = '姓名,备注\n张三,"你好, 世界"\n李四,普通';
    const model = recognizeCsv(text);
    assert.equal(model.rows, 3);
    const grid = parseCsv(text);
    assert.equal(grid[1][1], '你好, 世界');
  });
  await test('编辑单元格后原位写回，其余不变', () => {
    const text = 'a,b\n1,2\n3,4';
    const out = applyCsv(text, [{ r: 1, c: 1, v: '99' }]);
    assert.ok(out.includes('1,99'));
    assert.ok(out.includes('3,4'));
  });
  await test('序列化含逗号/引号的值加引号', () => {
    const text = serializeCsv([['x', 'a,b'], ['y', 'say "hi"']]);
    assert.ok(text.includes('"a,b"'));
    assert.ok(text.includes('"say ""hi"""'));
  });

  console.log('\n三、util（动态格式 / 重名加序号 / 大小）');
  await test('getFormat 动态取扩展名', () => {
    assert.equal(getFormat('报告.DOCX'), 'docx');
    assert.equal(getFormat('a/b/图纸.dwg'), 'dwg');
    assert.equal(getFormat('无扩展名'), '');
  });
  await test('autoNumberName 重名加序号', () => {
    assert.equal(autoNumberName('任务书', new Set(['任务书'])), '任务书_2');
    assert.equal(autoNumberName('任务书', new Set(['任务书', '任务书_2'])), '任务书_3');
    assert.equal(autoNumberName('新文件', new Set(['任务书'])), '新文件');
  });
  await test('能力判定', () => {
    assert.ok(isEditableFormat('csv'));
    assert.ok(isEditableFormat('docx'));
    assert.ok(!isEditableFormat('pdf'));
    assert.equal(editEngine('csv'), 'sheet');
    assert.equal(editEngine('docx'), 'docx');
    assert.equal(editEngine('pdf'), null);
  });

  console.log('\n四、结构模板映射');
  function makeProject(): Project {
    return {
      id: 'proj_1',
      info: { name: 'XX 河道勘察', code: '60-F1', region: '华北' },
      rootPath: '',
      slots: [
        { id: 'slot_a', name: '勘察大纲', files: [], subSlots: [{ id: 'sub', name: '子项', files: [], subSlots: [], order: 0 }], order: 0 },
        { id: 'slot_b', name: '工作量确认表', files: [], subSlots: [], order: 1 },
      ],
      schemaVersion: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }
  await test('捕获顶层插槽 + 嵌套结构', () => {
    const out = projectToTemplateStructure(makeProject());
    assert.equal(out.length, 2);
    assert.equal(out[0].name, '勘察大纲');
    assert.equal(out[0].subSlots.length, 1);
    assert.equal(out[0].subSlots[0].name, '子项');
  });
  await test('countTemplateSlots 统计顶层+嵌套', () => {
    const n = countTemplateSlots({ id: 't', name: 'x', structure: projectToTemplateStructure(makeProject()), createdAt: '', updatedAt: '' });
    assert.equal(n, 3);
  });

  console.log('\n五、classify（分类纯逻辑）');
  await test('normalizeDimensions 去重 + 稳定 id', () => {
    const dims = normalizeDimensions([{ name: '地区' }, { name: '专业' }, { name: '地区' }, { name: '  ' }, { id: 'dim_custom', name: '客户' }]);
    assert.deepStrictEqual(dims.map((d) => d.name), ['地区', '专业', '客户']);
    assert.equal(dims.find((d) => d.name === '客户')?.id, 'dim_custom');
  });
  await test('pruneCategoryValues + distinctValues', () => {
    const dims = [{ id: 'dim_a', name: '地区' }, { id: 'dim_b', name: '专业' }];
    assert.deepStrictEqual(pruneCategoryValues({ dim_a: '华北', dim_b: '', dim_gone: 'x' }, dims), { dim_a: '华北' });
    const projects = [
      { info: { name: 'A', code: '1', categories: { dim_a: '华南' } } },
      { info: { name: 'B', code: '2', categories: { dim_a: '华北' } } },
    ];
    assert.deepStrictEqual(distinctValues(projects, 'dim_a'), ['华北', '华南']);
  });
  await test('sanitizeProjectCategories + defaultRootConfig', () => {
    assert.deepStrictEqual(sanitizeProjectCategories({ name: 'P', code: 'C', categories: { dim_a: '华北' } }, [{ id: 'dim_a', name: '地区' }]).categories, { dim_a: '华北' });
    assert.deepStrictEqual(defaultRootConfig().dimensions, []);
  });

  console.log(`\n========== 结果：${passed} 通过 / ${failed} 失败 ==========\n`);
  if (failed > 0) process.exit(1);
}

await main();
