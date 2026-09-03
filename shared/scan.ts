/**
 * 多层级自动扫描（设计文档 2.10）的纯逻辑层：
 * 识别启发式、递归树扫描、嵌套候选链去重、子目录→阶段匹配、名称建议。
 * 零 electron / 零 node / 零文件系统依赖——输入是"目录树结构（名字 + 子项，不读内容）"，
 * 渲染层 / 主进程 / 单元测试都能安全导入。
 *
 * 原则（2.10）：只认目录结构 + 列文件名，不读文件内容；识别规则可单测、不硬编码业务。
 * 文件系统递归与导入落盘在主进程 ipc.ts；本文件只做"给结构 → 判候选 / 去重 / 匹配 / 建议"。
 *
 * v0.3.0 变更：
 * - 候选判定改为"递归感知"——文件嵌套在任意深度都计入信号（原来只看直接子目录的直接文件）；
 * - 新增 walkTree 纯函数：在一棵目录树上递归找出全部候选，并对"父→子"候选链去重（保留最像项目的那一个）；
 * - 新增"候选强度"分级（strong / weak），供嵌套链去重与界面排序使用。
 */
import type { ScannedCandidate, ScannedSubdir } from './types';

/** "文档/资料"类文件扩展名（判定候选置信度用；图片/压缩包等不计入"资料"，但计入"文件数"信号） */
const DOC_EXT_RE = /\.(docx?|xlsx?|pdf|dwg|dxf|txt|csv|pptx?)$/i;

/** 判断一个文件名是否"文档/资料"类（用于候选置信度） */
export function isDocFileName(name: string): boolean {
  return DOC_EXT_RE.test(name);
}

/* ============================================================
 * 一、单节点打分（纯函数，公式与 v0.2.0 一致，兼容既有测试）
 * ============================================================ */

/**
 * 打分输入：一个目录的"名字 + 子项结构"。
 * subdirs 里每个子目录带 文件数 / 文档数；顶层散文件带 文件数 / 文档数。
 * 注：这里的 fileCount / docFileCount 可以是"直接数"（v0.2.0）也可以是"递归数"（v0.3.0），
 * 打分公式对两者通用——递归数由 walkTree / ipc 提供。
 */
export interface ScanNodeInput {
  name: string;
  isPPIMS: boolean;
  subdirs: Array<{ name: string; fileCount: number; docFileCount: number }>;
  looseFileCount: number;
  looseDocFileCount: number;
}

/** 候选强度：strong=项目特征明确（project.json / 多资料子目录）；weak=疑似（仅多文档文件） */
export type CandidateStrength = 'strong' | 'weak';

/** 打分结果 */
export interface ScanScore {
  isCandidate: boolean;
  confidence: 'high' | 'medium';
  /** 候选强度（嵌套链去重用；非候选时恒为 weak） */
  strength: CandidateStrength;
  reason: string;
}

/**
 * 识别启发式（纯函数）：
 * - 含 project.json → 直接 high / strong（PPIMS 项目）；
 * - ≥2 个"有文件的资料子目录" → high / strong（像"多阶段资料"的项目结构）；
 * - 否则，文档/资料文件总数 ≥2 → medium / weak（疑似，交用户判断）；
 * - 否则不判定为候选。
 * 信号综合，不硬编码任何业务名。
 */
export function scoreProject(node: ScanNodeInput): ScanScore {
  if (node.isPPIMS) {
    return { isCandidate: true, confidence: 'high', strength: 'strong', reason: '含 project.json（PPIMS 项目）' };
  }
  const materialSubdirs = node.subdirs.filter((s) => s.fileCount > 0).length;
  const totalDocs =
    node.looseDocFileCount + node.subdirs.reduce((n, s) => n + s.docFileCount, 0);
  if (materialSubdirs >= 2) {
    return { isCandidate: true, confidence: 'high', strength: 'strong', reason: `含 ${materialSubdirs} 个资料子目录` };
  }
  if (totalDocs >= 2) {
    return { isCandidate: true, confidence: 'medium', strength: 'weak', reason: `含 ${totalDocs} 个文档/资料文件` };
  }
  return { isCandidate: false, confidence: 'medium', strength: 'weak', reason: '资料信号不足' };
}

/* ============================================================
 * 二、递归目录树扫描（纯函数）+ 嵌套候选链去重
 * ============================================================ */

/** 一棵目录树节点（只含结构，不读内容；主进程按此惰性列出） */
export interface ScanTreeNode {
  /** 目录名（basename） */
  name: string;
  /** 是否含 project.json（PPIMS 项目） */
  isPPIMS: boolean;
  /** 直接文件名字清单 */
  files: string[];
  /** 直接子目录（递归） */
  subdirs: ScanTreeNode[];
}

/** 递归文件数（该节点自身直接文件 + 所有后代） */
export function recursiveFileCount(node: ScanTreeNode): number {
  return node.files.length + node.subdirs.reduce((n, c) => n + recursiveFileCount(c), 0);
}

/** 递归"资料文件"数（该节点自身直接资料 + 所有后代） */
export function recursiveDocFileCount(node: ScanTreeNode): number {
  return node.files.filter(isDocFileName).length +
    node.subdirs.reduce((n, c) => n + recursiveDocFileCount(c), 0);
}

/** 对一个目录树节点打分（递归感知：子目录的 fileCount 用其递归文件数） */
export function scoreTreeNode(node: ScanTreeNode): ScanScore {
  return scoreProject({
    name: node.name,
    isPPIMS: node.isPPIMS,
    subdirs: node.subdirs.map((c) => ({
      name: c.name,
      fileCount: recursiveFileCount(c),
      docFileCount: recursiveDocFileCount(c),
    })),
    looseFileCount: node.files.length,
    looseDocFileCount: node.files.filter(isDocFileName).length,
  });
}

/** 候选链去重的最小信息 */
interface CandidateNode {
  node: ScanTreeNode;
  path: string; // 从扫描根开始的绝对/相对路径（去重用）
  score: ScanScore;
  depth: number;
}

/**
 * 在一棵目录树上递归找出全部候选（纯函数，可单测）。
 *
 * 去重规则（嵌套候选链）：
 * - 若候选 A 是候选 B 的严格祖先（B 在 A 的子树内），则"弱的那个"被丢弃：
 *   - B 强度 ≥ A 强度 → 丢弃 A（保留更深层、更像项目的 B，覆盖"年份/地区 → 项目"分组场景）；
 *   - B 强度 < A 强度（A 是 strong 项目、B 只是其下的疑似子目录）→ 丢弃 B（保留 A，避免把阶段目录误报为项目）；
 *   - 强度相同 → 保留更深层（更具体）的 B，丢弃 A。
 * - 非祖先关系的候选互不影响。
 *
 * @param root 扫描根目录树
 * @param rootPath 扫描根的相对路径（用于产出 relPath；默认 '.'）
 */
export function walkTree(root: ScanTreeNode, rootPath = '.'): ScannedCandidate[] {
  const found: CandidateNode[] = [];

  // 深度优先收集所有候选（不做剪枝——v0.3.0 全程递归下钻，嵌套项目也要找到）
  function collect(node: ScanTreeNode, path: string, depth: number): void {
    const score = scoreTreeNode(node);
    if (score.isCandidate) found.push({ node, path, score, depth });
    for (const c of node.subdirs) {
      collect(c, path ? `${path}/${c.name}` : c.name, depth + 1);
    }
  }
  collect(root, rootPath, 1);

  // 嵌套候选链去重
  const isAncestor = (ancPath: string, descPath: string): boolean =>
    descPath !== ancPath && descPath.startsWith(ancPath + '/');

  const kept: CandidateNode[] = [];
  for (const a of found) {
    let dropped = false;
    for (const b of found) {
      if (a === b) continue;
      // b 是 a 的严格祖先
      if (isAncestor(b.path, a.path)) {
        // a 比 b 更弱（b strong 且 a weak）→ a 是更深层的疑似子目录，但 b 是明确项目 → 丢 a
        // 其余情况（b 不更强）→ 由"更深层优先"规则保留 a，这里不丢
        if (b.score.strength === 'strong' && a.score.strength === 'weak') {
          dropped = true;
          break;
        }
      }
    }
    if (!dropped) kept.push(a);
  }

  // 反向：a 是 b 的严格祖先 且 a 更弱 → 丢 a（分组文件夹场景）
  const final: CandidateNode[] = [];
  for (const a of kept) {
    let dropped = false;
    for (const b of kept) {
      if (a === b) continue;
      // a 是 b 的严格祖先，且 b 强度 ≥ a → b 更具体，丢 a
      if (isAncestor(a.path, b.path) && strengthRank(b.score.strength) >= strengthRank(a.score.strength)) {
        dropped = true;
        break;
      }
    }
    if (!dropped) final.push(a);
  }

  // 转为候选（subdir 清单用"直接子目录 + 其递归文件数"，导入时按"最近祖先"归并）
  return final.map((c) => {
    const subdirs: ScannedSubdir[] = c.node.subdirs.map((s) => ({
      name: s.name,
      files: s.files, // 直接文件名（界面展示用；导入递归复制不依赖此清单深度）
      fileCount: recursiveFileCount(s),
    }));
    return {
      path: c.path,
      name: c.node.name,
      isPPIMS: c.node.isPPIMS,
      subdirs,
      looseFileCount: c.node.files.length,
      fileCount: recursiveFileCount(c.node),
      confidence: c.score.confidence,
      strength: c.score.strength,
      reason: c.score.reason,
      nestDepth: c.depth,
      relPath: c.path,
    } as ScannedCandidate;
  });
}

function strengthRank(s: CandidateStrength): number {
  return s === 'strong' ? 2 : 1;
}

/* ============================================================
 * 三、子目录 → 阶段匹配 + 名称建议（纯函数，可单测，v0.2.0 兼容）
 * ============================================================ */

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

/** 由浅层扫描数据构建一个候选（纯函数，供主进程/测试共用；v0.2.0 兼容） */
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
    looseDocFileCount: input.looseFileCount,
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
    strength: score.strength,
    reason: score.reason,
    nestDepth: 1,
    relPath: input.relPath,
  };
}
