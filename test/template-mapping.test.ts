/**
 * 项目架构模板功能 —— 纯映射逻辑单测（不依赖 electron/文件系统）。
 * 覆盖：从现有项目捕获 阶段+槽位+各槽位已挂模板文件 的"另存为模板"核心映射。
 */
import { describe, it, expect } from 'vitest';
import { projectToTemplateStages } from '../shared/template-mapping';
import type { Project, Slot, Stage, Template } from '../shared/types';
import { SCHEMA_VERSION } from '../shared/types';

function makeProject(): Project {
  const tmplA: Template = {
    id: 'tmpl_a',
    name: '勘察大纲',
    format: 'docx',
    path: 'templates/勘察大纲.docx',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const tmplB: Template = {
    id: 'tmpl_b',
    name: '工作量表',
    format: 'xlsx',
    path: 'templates/工作量表.xlsx',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const slotA: Slot = {
    id: 'slot_a',
    name: '勘察大纲',
    format: 'docx',
    necessity: 'required',
    reviewRequired: true,
    templateId: 'tmpl_a', // 挂了模板 A
    files: [],
    order: 0,
  };
  const slotB: Slot = {
    id: 'slot_b',
    name: '工作量确认表',
    format: 'xlsx',
    necessity: 'should',
    reviewRequired: false,
    templateId: 'tmpl_b', // 挂了模板 B
    files: [],
    order: 1,
  };
  const slotC: Slot = {
    id: 'slot_c',
    name: '试验记录',
    format: 'docx',
    necessity: 'optional',
    reviewRequired: true,
    // 无 templateId → 无模板文件
    files: [],
    order: 2,
  };

  const stage: Stage = {
    id: 'stage_1',
    info: { name: '项目策划', description: '资料最密集', startTime: '' },
    slots: [slotA, slotB, slotC],
    weight: 1,
    order: 0,
  };

  return {
    id: 'proj_1',
    info: { name: 'XX 河道勘察', code: '60-F1', establishDate: '2026-01-01' },
    rootPath: '',
    stages: [stage],
    templates: [tmplA, tmplB],
    schemaVersion: SCHEMA_VERSION,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('projectToTemplateStages（项目→模板结构映射）', () => {
  it('正确捕获阶段数量、名称、说明', () => {
    const out = projectToTemplateStages(makeProject());
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('项目策划');
    expect(out[0].description).toBe('资料最密集');
  });

  it('正确捕获槽位数量与 名称/格式/必要性/需审查', () => {
    const out = projectToTemplateStages(makeProject());
    const slots = out[0].slots;
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      name: '勘察大纲',
      format: 'docx',
      necessity: 'required',
      reviewRequired: true,
    });
    expect(slots[1]).toMatchObject({
      name: '工作量确认表',
      format: 'xlsx',
      necessity: 'should',
      reviewRequired: false,
    });
    expect(slots[2]).toMatchObject({
      name: '试验记录',
      format: 'docx',
      necessity: 'optional',
      reviewRequired: true,
    });
  });

  it('已挂模板的槽位带上 templateFileName + templateFileSrc；未挂的不带', () => {
    const out = projectToTemplateStages(makeProject());
    const [a, b, c] = out[0].slots;
    // 挂模板 A（docx）
    expect(a.templateFileName).toBe('勘察大纲.docx');
    expect(a.templateFileSrc).toBe('templates/勘察大纲.docx');
    // 挂模板 B（xlsx）
    expect(b.templateFileName).toBe('工作量表.xlsx');
    expect(b.templateFileSrc).toBe('templates/工作量表.xlsx');
    // 未挂模板 → 无文件引用
    expect(c.templateFileName).toBeUndefined();
    expect(c.templateFileSrc).toBeUndefined();
  });
});
