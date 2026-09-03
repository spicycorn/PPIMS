<template>
  <div class="scanp">
    <div class="card-block">
      <div class="row-gap">
        <el-icon><FolderChecked /></el-icon>
        <strong>多层级自动扫描</strong>
        <span class="muted">递归识别外部"像项目"的文件夹（含深层树状结构 / 嵌套项目）→ 逐条或批量确认 → 导入为自包含项目（不读文件内容）</span>
        <div style="flex: 1"></div>
        <el-button type="primary" :icon="FolderOpened" :loading="scanning" @click="pickAndScan">
          {{ result ? '重新扫描' : '选择目录并扫描' }}
        </el-button>
      </div>

      <el-alert
        v-if="result?.truncated"
        title="因深度/规模上限已截断（性能保护）。可把范围缩小到一个更具体的目录重扫。"
        type="warning"
        :closable="false"
        style="margin-top: 10px"
      />
      <div v-if="result" class="muted" style="margin-top: 10px">
        已扫描 <strong>{{ result.scannedDirs }}</strong> 个目录，命中 <strong>{{ result.candidates.length }}</strong> 个候选项目。
        展开某行可修正 名称/编号/分类取值/子目录归阶段（可选），再点"导入该项目"；或直接用"全部导入"。
      </div>

      <div v-if="result && result.candidates.length" class="row-gap" style="margin-top: 10px">
        <el-checkbox v-model="onlyHigh">只看高置信</el-checkbox>
        <span class="muted">当前展示 {{ visibleCandidates.length }} / {{ result.candidates.length }} 个</span>
        <div style="flex: 1"></div>
        <el-button type="success" :loading="importingAll" @click="importAll">
          全部导入（用预匹配阶段一键批量导入）
        </el-button>
      </div>
    </div>

    <div v-if="result && result.candidates.length" style="margin-top: 10px">
      <el-table :data="visibleCandidates" size="default" row-key="path">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-form">
              <el-form label-width="90px" size="small">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-form-item label="项目名称">
                      <el-input v-model="edits[row.path].name" placeholder="项目名" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="项目编号">
                      <el-input v-model="edits[row.path].code" placeholder="编号（选填）" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <!-- 分类取值（按当前维度动态） -->
                <template v-if="app.dimensions.length">
                  <el-divider content-position="left" style="margin: 6px 0">分类取值（可选）</el-divider>
                  <el-row :gutter="10">
                    <el-col :span="12" v-for="d in app.dimensions" :key="d.id">
                      <el-form-item :label="d.name">
                        <el-input v-model="edits[row.path].cats[d.id]" :placeholder="`填「${d.name}」取值`" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                </template>

                <!-- 子目录 → 阶段归并（可选：默认按名预匹配，匹配不进的进"日常管理"） -->
                <el-divider content-position="left" style="margin: 6px 0">子目录 → 阶段（可选，默认按名匹配；留空即归"日常管理"）</el-divider>
                <div v-if="row.subdirs.length === 0" class="muted">无子目录（顶层散文件将归入"日常管理"）</div>
                <div v-for="sd in row.subdirs" :key="sd.name" class="row-gap submap">
                  <span class="subname mono">{{ sd.name }}（{{ sd.fileCount }} 文件）</span>
                  <div style="flex: 1" />
                  <el-select v-model="edits[row.path].stageMap[sd.name]" size="small" style="width: 200px" clearable placeholder="（未归 → 日常管理）">
                    <el-option label="（未归 → 日常管理）" value="" />
                    <el-option v-for="st in stageOptions" :key="st.id" :label="st.name" :value="st.id" />
                  </el-select>
                </div>

                <div class="row-gap" style="margin-top: 12px">
                  <el-button type="success" size="small" :loading="edits[row.path].importing" @click="importOne(row)">
                    导入该项目（复制到当前根目录，不改动原文件）
                  </el-button>
                  <span v-if="edits[row.path].done" class="muted">{{ edits[row.path].done }}</span>
                </div>
              </el-form>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="项目名" min-width="150" />
        <el-table-column prop="relPath" label="位置" min-width="170">
          <template #default="{ row }"><span class="mono">{{ row.relPath }}</span></template>
        </el-table-column>
        <el-table-column label="层级" width="60">
          <template #default="{ row }"><span class="muted">{{ row.nestDepth }} 层</span></template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.isPPIMS ? 'primary' : 'info'">{{ row.isPPIMS ? 'PPIMS' : '自建' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="fileCount" label="文件" width="70" />
        <el-table-column label="置信" width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="row.confidence === 'high' ? 'success' : 'info'">{{ row.confidence === 'high' ? '高' : '中' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="命中原因" min-width="140" show-overflow-tooltip>
          <template #default="{ row }"><span class="muted">{{ row.reason }}</span></template>
        </el-table-column>
      </el-table>
    </div>

    <el-empty v-else-if="result && result.candidates.length === 0" description="该目录下未识别到像项目的文件夹。可换一个更具体的目录重试。" :image-size="70" />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { FolderChecked, FolderOpened } from '@element-plus/icons-vue';
import { useAppStore } from '../stores/app';
import type { ScannedCandidate, ScanResult, ProjectInfo, CategoryValues } from '../../shared/types';
import { PRESET_STAGES } from '../../shared/types';
import { matchStage, suggestNameCode } from '../../shared/scan';

const app = useAppStore();

// 阶段选项（导入后项目预置 5 阶段；用稳定 id 供主进程映射）
const stageOptions = PRESET_STAGES.map((s, i) => ({ id: `stage_${i}`, name: s.name }));

const scanning = ref(false);
const result = ref<ScanResult | null>(null);
const onlyHigh = ref(false);
const importingAll = ref(false);

interface RowEdit {
  name: string;
  code: string;
  cats: CategoryValues;
  stageMap: Record<string, string>;
  importing: boolean;
  done: string;
}

const edits = reactive<Record<string, RowEdit>>({});

/** 只看高置信（strong）候选 */
const visibleCandidates = computed<ScannedCandidate[]>(() => {
  const all = result.value?.candidates ?? [];
  if (!onlyHigh.value) return all;
  return all.filter((c) => c.strength === 'strong');
});

/** 为候选生成默认编辑态（名称建议 + 子目录→阶段预匹配） */
function ensureEdit(c: ScannedCandidate) {
  if (edits[c.path]) return edits[c.path];
  const sug = suggestNameCode(c.name);
  const stageMap: Record<string, string> = {};
  for (const sd of c.subdirs) {
    stageMap[sd.name] = matchStage(sd.name, stageOptions) ?? '';
  }
  edits[c.path] = {
    name: sug.name,
    code: sug.code,
    cats: {},
    stageMap,
    importing: false,
    done: '',
  };
  return edits[c.path];
}

async function pickAndScan() {
  const dir = await window.api.openDialog({ title: '选择要扫描的目录（可多层级 / 深层树状结构）', directory: true });
  if (!dir) return;
  scanning.value = true;
  result.value = null;
  try {
    result.value = await window.api.scanProjects(dir as string);
    // 为每个候选预填编辑态
    for (const c of result.value.candidates) ensureEdit(c);
    if (result.value.candidates.length === 0) {
      ElMessage.info('未识别到像项目的文件夹');
    } else {
      ElMessage.success(`命中 ${result.value.candidates.length} 个候选项目`);
    }
  } catch (e) {
    ElMessage.error(`扫描失败：${(e as Error).message}`);
  } finally {
    scanning.value = false;
  }
}

/** 核心导入（共用：单条 / 批量），用给定编辑态提交 */
async function doImportCore(c: ScannedCandidate, e: RowEdit): Promise<{ ok: boolean; msg: string }> {
  if (!app.rootDir) return { ok: false, msg: '尚未设置数据根目录' };
  if (!e.name.trim()) return { ok: false, msg: '请先填写项目名称' };
  const cats: CategoryValues = {};
  for (const d of app.dimensions) {
    const v = (e.cats[d.id] ?? '').trim();
    if (v) cats[d.id] = v;
  }
  const info: ProjectInfo = {
    name: e.name.trim(),
    code: e.code.trim(),
    establishDate: new Date().toISOString().slice(0, 10),
    categories: Object.keys(cats).length ? cats : undefined,
  };
  const subdirStage = Object.entries(e.stageMap)
    .filter(([, v]) => v)
    .map(([name, stageId]) => ({ name, stageId }));
  const res = await window.api.scanImport({
    sourceDir: c.path,
    info,
    subdirStage,
    rootDir: app.rootDir,
    stages: stageOptions,
  });
  return { ok: true, msg: `已导入（${res.copiedCount} 个文件）→ ${res.folderName}` };
}

async function importOne(c: ScannedCandidate) {
  const e = ensureEdit(c);
  e.importing = true;
  e.done = '';
  try {
    const r = await doImportCore(c, e);
    if (!r.ok) {
      ElMessage.warning(r.msg);
    } else {
      e.done = r.msg;
      ElMessage.success(`已导入项目：${e.name}`);
    }
  } catch (err) {
    ElMessage.error(`导入失败：${(err as Error).message}`);
  } finally {
    e.importing = false;
  }
}

async function importAll() {
  if (!app.rootDir) {
    ElMessage.warning('尚未设置数据根目录');
    return;
  }
  const list = visibleCandidates.value;
  if (!list.length) {
    ElMessage.info('没有可导入的候选');
    return;
  }
  importingAll.value = true;
  let okCount = 0;
  let failCount = 0;
  for (const c of list) {
    const e = ensureEdit(c);
    e.importing = true;
    e.done = '';
    try {
      const r = await doImportCore(c, e);
      if (r.ok) {
        okCount++;
        e.done = r.msg;
      } else {
        failCount++;
        e.done = r.msg;
      }
    } catch (err) {
      failCount++;
      e.done = `失败：${(err as Error).message}`;
    } finally {
      e.importing = false;
    }
  }
  importingAll.value = false;
  ElMessage[failCount ? 'warning' : 'success'](`批量导入完成：成功 ${okCount} 个，失败 ${failCount} 个`);
}
</script>

<style scoped>
.scanp {
  padding: 4px;
}
.expand-form {
  padding: 8px 12px;
  background: #fafbfc;
  border-radius: 6px;
}
.submap {
  margin-bottom: 6px;
}
.subname {
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
