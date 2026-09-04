/**
 * 独立测试脚本（不依赖 vitest/esbuild，用 Node 原生 TS 类型剥离运行）。
 * 验证 v1.1.0 核心纯逻辑：util / 结构模板映射 / classify。
 * 运行：node dev/test/run-standalone.ts
 *
 * 说明：v1.1.0 已删除内置编辑（csv/docx 引擎），只保留外部预览/编辑，
 * 故不再有引擎测试。
 */
import assert from 'node:assert';
import { projectToTemplateStructure, countTemplateSlots } from '../../core/template-mapping.ts';
import { getFormat, autoNumberName, fileSizeLabel } from '../../core/util.ts';
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

async function main() {
  console.log('\n一、util（动态格式 / 重名加序号 / 大小）');
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
  await test('fileSizeLabel 人类可读', () => {
    assert.equal(fileSizeLabel(512), '512 B');
    assert.ok(fileSizeLabel(1024).includes('KB'));
    assert.ok(fileSizeLabel(1024 * 1024).includes('MB'));
  });

  console.log('\n二、结构模板映射');
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

  console.log('\n三、classify（分类纯逻辑）');
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
