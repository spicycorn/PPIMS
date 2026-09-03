/**
 * PPIMS 单元测试（合并自 docx-engine.test.ts 与 template-mapping.test.ts）。
 *
 * 一、Word 原位替换引擎 —— 保真测试（验收 #4 的硬证据）：
 *   1) 结构识别能找出标题 / 正文 / 表格；
 *   2) 原位替换后，docx zip 中"只有 word/document.xml 这一项改变"，其余 entry 字节级不变；
 *   3) document.xml 内部"只有目标 <w:t> 的文本被替换"，其余标签 / 属性 / 其它 <w:t> 全部不变；
 *   4) 中文（CJK）写入正确、无乱码；
 *   5) 未命中的替换如实上报 missed，不静默失败。
 *
 * 二、项目架构模板 —— 纯映射逻辑（不依赖 electron/文件系统）：
 *   从现有项目捕获 阶段+槽位+各槽位已挂模板文件 的"另存为模板"核心映射。
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  recognizeStructure,
  replaceInXml,
  writeDocx,
  readDocumentXml,
} from '../electron/services/docx-engine';
import { projectToTemplateStages } from '../shared/template-mapping';
import type { Project, Slot, Stage, Template } from '../shared/types';
import { SCHEMA_VERSION } from '../shared/types';

/* ================================================================
 * 一、Word 原位替换引擎 · 保真
 * ================================================================ */

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

    expect(structure.fullText).toContain('某某河道治理工程勘察');
    expect(structure.fullText).toContain('60-F14742S');

    expect(structure.tables.length).toBeGreaterThanOrEqual(1);
    expect(structure.tables[0].headers).toContain('项目');
    expect(structure.tables[0].rows).toBeGreaterThanOrEqual(2);
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
      expect(afterHashes[name], `entry ${name} 必须字节级一致`).toBe(beforeHashes[name]);
    }

    expect(afterXml).toContain('新项目名称：长江支流整治');
    expect(afterXml).not.toContain('某某河道治理工程勘察');
    expect(afterXml).toContain('第一章 总则');
    expect(afterXml).toContain('项目编号：60-F14742S');
    expect(afterXml).toContain('钻孔');
    expect(afterXml).toContain('12');

    const normBefore = beforeXml.replace('某某河道治理工程勘察', 'XX');
    const normAfter = afterXml.replace('新项目名称：长江支流整治', 'XX');
    expect(normAfter).toBe(normBefore);
  });

  it('跨 run 拆分的文本也能原位命中', async () => {
    const docx = await buildSampleDocx();
    const xml = await readDocumentXml(docx);
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

/* ================================================================
 * 二、projectToTemplateStages（项目→模板结构映射）
 * ================================================================ */

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
    templateId: 'tmpl_a',
    files: [],
    order: 0,
  };
  const slotB: Slot = {
    id: 'slot_b',
    name: '工作量确认表',
    format: 'xlsx',
    necessity: 'should',
    reviewRequired: false,
    templateId: 'tmpl_b',
    files: [],
    order: 1,
  };
  const slotC: Slot = {
    id: 'slot_c',
    name: '试验记录',
    format: 'docx',
    necessity: 'optional',
    reviewRequired: true,
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
    expect(a.templateFileName).toBe('勘察大纲.docx');
    expect(a.templateFileSrc).toBe('templates/勘察大纲.docx');
    expect(b.templateFileName).toBe('工作量表.xlsx');
    expect(b.templateFileSrc).toBe('templates/工作量表.xlsx');
    expect(c.templateFileName).toBeUndefined();
    expect(c.templateFileSrc).toBeUndefined();
  });
});

/* ================================================================
 * 三、shared/classify.ts —— 分类纯逻辑（2.9）
 * ================================================================ */
import {
  normalizeDimensions,
  pruneCategoryValues,
  distinctValues,
  sanitizeProjectCategories,
  defaultRootConfig,
} from '../shared/classify';

describe('shared/classify · 维度规整与取值清理', () => {
  it('normalizeDimensions：保留合法项、去重名、生成稳定 id', () => {
    const dims = normalizeDimensions([
      { name: '地区' },
      { name: '专业' },
      { name: '地区' }, // 重名，应被去重
      { name: '  ' }, // 空名，应剔除
      { id: 'dim_custom', name: '客户' }, // 合法自定义 id，应保留
    ]);
    expect(dims.map((d) => d.name)).toEqual(['地区', '专业', '客户']);
    expect(dims.find((d) => d.name === '客户')?.id).toBe('dim_custom');
    // 生成的 id 都符合 dim_ 前缀
    for (const d of dims) expect(d.id).toMatch(/^dim_/);
    // id 互不冲突
    const ids = new Set(dims.map((d) => d.id));
    expect(ids.size).toBe(dims.length);
  });

  it('pruneCategoryValues：只保留仍在维度定义里的键、剔除空值', () => {
    const dims = [{ id: 'dim_a', name: '地区' }, { id: 'dim_b', name: '专业' }];
    const cleaned = pruneCategoryValues(
      { dim_a: '华北', dim_b: '', dim_gone: 'x' },
      dims,
    );
    expect(cleaned).toEqual({ dim_a: '华北' }); // dim_b 空值剔除、dim_gone 已删维度剔除
  });

  it('sanitizeProjectCategories：取值全空时删除 categories 键', () => {
    const withCats = { name: 'P', code: 'C', establishDate: '2026-01-01', categories: { dim_a: '华北' } };
    const dims = [{ id: 'dim_a', name: '地区' }];
    expect(sanitizeProjectCategories(withCats, dims).categories).toEqual({ dim_a: '华北' });
    const empty = { ...withCats, categories: { dim_a: '   ' } };
    expect('categories' in sanitizeProjectCategories(empty, dims)).toBe(false);
  });

  it('distinctValues：取某维度出现过的取值（去重、排序）', () => {
    const projects = [
      { info: { name: 'A', code: '1', establishDate: '2026-01-01', categories: { dim_a: '华南' } } },
      { info: { name: 'B', code: '2', establishDate: '2026-01-01', categories: { dim_a: '华北' } } },
      { info: { name: 'C', code: '3', establishDate: '2026-01-01', categories: { dim_a: '华南' } } },
      { info: { name: 'D', code: '4', establishDate: '2026-01-01' } },
    ];
    expect(distinctValues(projects, 'dim_a')).toEqual(['华北', '华南']);
  });

  it('defaultRootConfig：不预置任何业务维度（符合"不预置业务"）', () => {
    expect(defaultRootConfig().dimensions).toEqual([]);
  });
});

/* ================================================================
 * 四、shared/scan.ts —— 多层扫描识别纯逻辑（2.10）
 * ================================================================ */
import {
  scoreProject,
  matchStage,
  suggestNameCode,
  isDocFileName,
  walkTree,
  recursiveFileCount,
  recursiveDocFileCount,
  scoreTreeNode,
  type ScanTreeNode,
} from '../shared/scan';

describe('shared/scan · 候选识别启发式', () => {
  it('含 project.json → 直接判定高置信 PPIMS 项目', () => {
    const s = scoreProject({
      name: '某项目',
      isPPIMS: true,
      subdirs: [],
      looseFileCount: 1,
      looseDocFileCount: 0,
    });
    expect(s.isCandidate).toBe(true);
    expect(s.confidence).toBe('high');
  });

  it('≥2 个有文件的资料子目录 → 高置信候选', () => {
    const s = scoreProject({
      name: '某工程',
      isPPIMS: false,
      subdirs: [
        { name: '立项', fileCount: 3, docFileCount: 2 },
        { name: '成果', fileCount: 5, docFileCount: 4 },
      ],
      looseFileCount: 0,
      looseDocFileCount: 0,
    });
    expect(s.isCandidate).toBe(true);
    expect(s.confidence).toBe('high');
  });

  it('仅 2 个文档文件（无多子目录）→ 中置信候选', () => {
    const s = scoreProject({
      name: '零散资料',
      isPPIMS: false,
      subdirs: [{ name: '杂项', fileCount: 2, docFileCount: 2 }],
      looseFileCount: 0,
      looseDocFileCount: 0,
    });
    expect(s.isCandidate).toBe(true);
    expect(s.confidence).toBe('medium');
  });

  it('资料信号不足（无文档、单子目录无文件）→ 不判候选', () => {
    const s = scoreProject({
      name: '空目录',
      isPPIMS: false,
      subdirs: [{ name: 'x', fileCount: 0, docFileCount: 0 }],
      looseFileCount: 1,
      looseDocFileCount: 0,
    });
    expect(s.isCandidate).toBe(false);
  });
});

describe('shared/scan · 子目录→阶段匹配（不硬编码业务）', () => {
  const stages = [
    { id: 's1', name: '项目立项' },
    { id: 's2', name: '成果审查与归档' },
  ];
  it('子目录名包含完整阶段名 → 命中', () => {
    expect(matchStage('项目立项材料', stages)).toBe('s1');
    expect(matchStage('成果审查与归档资料', stages)).toBe('s2');
  });
  it('仅部分重叠（非完整阶段名）→ 不命中，避免误判', () => {
    expect(matchStage('立项材料', stages)).toBeNull(); // 不含完整"项目立项"
  });
  it('无命中 → null（交用户手动归位）', () => {
    expect(matchStage('完全不相干', stages)).toBeNull();
  });
  it('空白子目录名 → null', () => {
    expect(matchStage('   ', stages)).toBeNull();
  });
});

describe('shared/scan · 名称建议', () => {
  it('按最后一个 _ 切分 名称 + 编号', () => {
    expect(suggestNameCode('XX河道治理工程_60-F14742S')).toEqual({
      name: 'XX河道治理工程',
      code: '60-F14742S',
    });
  });
  it('无 _ 时整体作名称、编号留空', () => {
    expect(suggestNameCode('XX河道治理工程')).toEqual({ name: 'XX河道治理工程', code: '' });
  });
  it('右侧不像编号（纯文字）时不切分', () => {
    const r = suggestNameCode('资料_汇总');
    expect(r.name).toBe('资料_汇总'); // "汇总"是纯文字，整体作名称
  });
});

describe('shared/scan · 文档文件判定', () => {
  it('docx/xlsx/pdf/dwg/txt/csv 判为资料文件', () => {
    expect(isDocFileName('勘察报告.docx')).toBe(true);
    expect(isDocFileName('工作量表.xlsx')).toBe(true);
    expect(isDocFileName('图纸.dwg')).toBe(true);
    expect(isDocFileName('说明.txt')).toBe(true);
    expect(isDocFileName('清单.csv')).toBe(true);
  });
  it('图片等不判为资料文件', () => {
    expect(isDocFileName('照片.jpg')).toBe(false);
    expect(isDocFileName('截图.png')).toBe(false);
  });
});

/* ================================================================
 * 五、shared/scan · 递归目录树扫描 + 嵌套候选链去重（v0.3.0）
 * ================================================================ */

/** 便捷构造目录树节点 */
function t(
  name: string,
  opts: { isPPIMS?: boolean; files?: string[]; subdirs?: ScanTreeNode[] } = {},
): ScanTreeNode {
  return { name, isPPIMS: opts.isPPIMS ?? false, files: opts.files ?? [], subdirs: opts.subdirs ?? [] };
}

describe('shared/scan · 递归树扫描（深层树状结构识别）', () => {
  it('3 层嵌套（年份 → 项目 → 阶段）：识别出最像项目的那一层，不报年份分组文件夹', () => {
    const root = t('root', {
      subdirs: [
        t('2023年项目', {
          subdirs: [
            t('某某河道', {
              subdirs: [
                t('项目策划', { files: ['大纲.docx', '预算.xlsx'] }),
                t('项目执行', { files: ['记录.docx'] }),
              ],
            }),
          ],
        }),
      ],
    });
    const out = walkTree(root);
    // 只保留"最像项目"的 某某河道（strong），年份/分组层被去重
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('某某河道');
    expect(out[0].strength).toBe('strong');
    expect(out[0].confidence).toBe('high');
    expect(out[0].nestDepth).toBe(3);
    // 文件总数为递归累加（3 个文件）
    expect(out[0].fileCount).toBe(3);
  });

  it('深层文件计入候选信号：文件嵌套 3 层仍识别为项目', () => {
    // 项目根 → 阶段 → 子文件夹 → 文件（文件在第 3 层子目录）
    const root = t('root', {
      subdirs: [
        t('某工程', {
          subdirs: [
            t('项目策划', { subdirs: [t('大纲', { files: ['总则.docx'] })] }),
            t('项目执行', { subdirs: [t('试验', { files: ['数据.xlsx'] })] }),
          ],
        }),
      ],
    });
    const out = walkTree(root);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('某工程');
    // 深层文件（总则.docx / 数据.xlsx）计入资料信号 → strong
    expect(out[0].strength).toBe('strong');
    expect(out[0].fileCount).toBe(2);
  });

  it('嵌套项目（项目里再套项目）：保留更深层、更具体的候选', () => {
    const root = t('root', {
      subdirs: [
        t('外项目', {
          // 外项目本身有 2 个资料子目录（strong），内部又嵌套一个"内项目"
          subdirs: [
            t('资料甲', { files: ['甲.docx', '甲2.docx'] }),
            t('内项目', {
              subdirs: [
                t('阶段A', { files: ['a.docx', 'a2.docx'] }),
                t('阶段B', { files: ['b.docx', 'b2.docx'] }),
              ],
            }),
          ],
        }),
      ],
    });
    const out = walkTree(root);
    const names = out.map((c) => c.name);
    // 内项目（更深层、更具体）必须被保留
    expect(names).toContain('内项目');
  });

  it('顶层散文件 + 单子目录：不误报为项目（信号不足）', () => {
    const root = t('root', {
      files: ['说明.txt'],
      subdirs: [t('空子目录', { subdirs: [] })],
    });
    const out = walkTree(root);
    // 无 ≥2 资料子目录、无 ≥2 文档文件 → 不识别任何候选
    expect(out.length).toBe(0);
  });

  it('含 project.json 的目录：识别为 high / strong（PPIMS 项目）', () => {
    const root = t('root', {
      subdirs: [t('某PPIMS', { isPPIMS: true, files: ['project.json'] })],
    });
    const out = walkTree(root);
    const p = out.find((c) => c.name === '某PPIMS');
    expect(p).toBeDefined();
    expect(p!.confidence).toBe('high');
    expect(p!.strength).toBe('strong');
    expect(p!.isPPIMS).toBe(true);
  });
});

describe('shared/scan · 递归文件计数（纯函数）', () => {
  it('recursiveFileCount：累加所有层级的文件', () => {
    const node = t('P', {
      files: ['a.docx'],
      subdirs: [
        t('S1', { files: ['b.xlsx', 'c.pdf'] }),
        t('S2', { subdirs: [t('S2a', { files: ['d.dwg'] })] }),
      ],
    });
    expect(recursiveFileCount(node)).toBe(4);
  });

  it('recursiveDocFileCount：只累加"资料"文件，图片不计', () => {
    const node = t('P', {
      files: ['a.docx', '照片.jpg'],
      subdirs: [t('S1', { files: ['b.xlsx', '截图.png'] })],
    });
    expect(recursiveDocFileCount(node)).toBe(2); // a.docx + b.xlsx
  });

  it('scoreTreeNode：递归感知打分（深层文件构成资料子目录 → strong）', () => {
    const node = t('P', {
      subdirs: [
        t('策划', { subdirs: [t('子', { files: ['x.docx'] })] }),
        t('执行', { subdirs: [t('子', { files: ['y.xlsx'] })] }),
      ],
    });
    const s = scoreTreeNode(node);
    expect(s.isCandidate).toBe(true);
    expect(s.confidence).toBe('high');
    expect(s.strength).toBe('strong');
  });
});
