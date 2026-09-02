/**
 * 多层级自动扫描（设计文档 2.10）的纯逻辑层：识别启发式、子目录→阶段匹配、名称建议。
 * 零 electron / 零 node / 零文件系统依赖，输入是"目录名 + 直接子项结构"，渲染层/主进程/单元测试都能安全导入。
 *
 * 原则（2.10）：只认目录结构 + 列文件名，不读文件内容；识别规则可单测、不硬编码业务。
 * 文件系统递归与导入落盘在主进程 ipc.ts，本文件只做"给结构 → 判候选/匹配/建议"。
 */
import type { ScannedCandidate, ScannedSubdir } from './types';

/** "文档/资料"类文件扩展名（判定候选用，非业务硬编码，只是文件类型集合） */
const DOC_EXT_RE = /\.(docx?|xlsx?|pdf|dwg|dxf|txt|csv)$/i;

/** 判断一个文件名是否"文档/资料"类（用于候选置信度） */
export function isDocFileName(name: string): boolean {
  return DOC_EXT_RE.test(name);
}

/**
 * 打分输入：一个目录的"名字 + 直接子项结构"（由主进程浅层扫描得到）。
 * subdirs 里每个子目录带 文件数 / 文档数；顶层散文件带 文件数 / 文档数。
 */
export interface ScanNodeInput {
  name: string;
  isPPIMS: boolean;
  subdirs: Array<{ name: string; fileCount: number; docFileCount: number }>;
  looseFileCount: number;
  looseDocFileCount: number;
}

/** 打分结果 */
export interface ScanScore {
  isCandidate: boolean;
  confidence: 'high' | 'medium';
  reason: string;
}

/**
 * 识别启发式（纯函数）：
 * - 含 project.json → 直接 high（PPIMS 项目）；
 * - ≥2 个"有文件的资料子目录" → high（像"多阶段资料"的项目结构）；
 * - 否则，文档/资料文件总数 ≥2 → medium（疑似，交用户判断）；
 * - 否则不判定为候选。
 * 信号综合，不硬编码任何业务名。
 */
export function scoreProject(node: ScanNodeInput): ScanScore {
  if (node.isPPIMS) {
    return { isCandidate: true, confidence: 'high', reason: '含 project.json（PPIMS 项目）' };
  }
  const materialSubdirs = node.subdirs.filter((s) => s.fileCount > 0).length;
  const totalDocs =
    node.looseDocFileCount + node.subdirs.reduce((n, s) => n + s.docFileCount, 0);
  if (materialSubdirs >= 2) {
    return { isCandidate: true, confidence: 'high', reason: `含 ${materialSubdirs} 个资料子目录` };
  }
  if (totalDocs >= 2) {
    return { isCandidate: true, confidence: 'medium', reason: `含 ${totalDocs} 个文档/资料文件` };
  }
  return { isCandidate: false, confidence: 'medium', reason: '资料信号不足' };
}

/**
 * 子目录名 → 阶段 id 匹配（纯函数，可单测）。
 * 规则：阶段名包含子目录名，或子目录名包含阶段名（忽略空白）；取首个命中。
 * 不硬编码业务——完全由传入的阶段名驱动。
 */
export function matchStage(
  subdirName: string,
  stages: Array<{ id: string; name: string }>,
): string | null {
  const a = subdirName.replace(/\s+/g, '');
  if (!a) return null;
  for (const st of stages) {
    const b = st.name.replace(/\s+/g, '');
    if (!b) continue;
    if (a.includes(b) || b.includes(a)) return st.id;
  }
  return null;
}

/** 由目录名建议 项目名 + 编号（纯函数）。
 * 形如 "XX河道治理工程_60-F14742S" → name="XX河道治理工程", code="60-F14742S"；
 * 无 "_" 时整体作名称、编号留空。 */
export function suggestNameCode(dirName: string): { name: string; code: string } {
  const raw = dirName.replace(/[\\/:*?"<>|]/g, ' ').trim();
  // 优先按最后一个 "_" 切分（右侧像编号）
  const idx = raw.lastIndexOf('_');
  if (idx > 0 && idx < raw.length - 1) {
    const left = raw.slice(0, idx).trim();
    const right = raw.slice(idx + 1).trim();
    // 右侧像编号（含字母数字）才切分，否则整体作名称
    if (/[a-z0-9]/i.test(right) && left.length >= 1) {
      return { name: left, code: right };
    }
  }
  return { name: raw, code: '' };
}

/** 由浅层扫描数据构建一个候选（纯函数，供主进程/测试共用）。 */
export function buildCandidate(input: {
  path: string;
  name: string;
  relPath: string;
  isPPIMS: boolean;
  subdirs: ScannedSubdir[];
  looseFileCount: number;
}): ScannedCandidate {
  const fileCount =
    input.looseFileCount + input.subdirs.reduce((n, s) => n + s.fileCount, 0);
  const node: ScanNodeInput = {
    name: input.name,
    isPPIMS: input.isPPIMS,
    subdirs: input.subdirs.map((s) => ({
      name: s.name,
      fileCount: s.fileCount,
      docFileCount: s.files.filter(isDocFileName).length,
    })),
    looseFileCount: input.looseFileCount,
    looseDocFileCount: input.looseFileCount, // 浅层：顶层散文件是否文档由主进程可再精算，此处保守计
  };
  const score = scoreProject(node);
  return {
    path: input.path,
    name: input.name,
    isPPIMS: input.isPPIMS,
    subdirs: input.subdirs,
    looseFileCount: input.looseFileCount,
    fileCount,
    confidence: score.isCandidate ? score.confidence : 'medium',
    relPath: input.relPath,
  };
}
