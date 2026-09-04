/**
 * PPIMS 单元测试（v1.1.0 个人归档版）。
 *
 * 一、结构模板映射（项目→结构模板，纯逻辑）。
 * 二、util（动态格式识别 / 重名加序号 / 大小标签）。
 * 三、classify（分类纯逻辑）。
 *
 * 说明：v1.1.0 已删除内置编辑（csv/docx/xlsx 引擎），只保留外部预览/编辑，
 * 故不再有引擎保真测试。
 */
import { describe, it, expect } from 'vitest';
import { projectToTemplateStructure, countTemplateSlots } from '../../core/template-mapping';
import { getFormat, baseName, autoNumberName, fileSizeLabel } from '../../core/util';
import type { Project, Slot, StructureTemplate } from '../../core/types';
import { SCHEMA_VERSION } from '../../core/types';

/* ================================================================
 * 一、结构模板映射（项目→结构模板，纯逻辑）
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
 * 二、util（动态格式识别 / 重名加序号 / 大小标签）
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
});

/* ================================================================
 * 三、classify（分类纯逻辑）
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
