<template>
  <div class="ip">
    <div class="card-block">
      <div class="row-gap">
        <el-icon><FolderChecked /></el-icon>
        <strong>导入项目文件库</strong>
        <span class="muted">扫描外部文件夹 → 按子目录归阶段 → 复制入项目</span>
        <div style="flex: 1"></div>
        <el-button type="primary" :icon="FolderOpened" @click="pickLibrary">选择文件库</el-button>
      </div>

      <div v-if="!scan" class="muted" style="margin-top: 10px">
        尚未选择文件库。选择后系统按子目录名匹配阶段，未匹配项进入"日常管理（未分类）"。
      </div>

      <template v-else>
        <el-alert
          :title="`文件库：${scan.root}`"
          type="info"
          :closable="false"
          style="margin-top: 10px"
        />
        <el-table :data="rows" size="default" style="margin-top: 10px">
          <el-table-column prop="name" label="子目录" min-width="160" />
          <el-table-column label="文件数" width="90">
            <template #default="{ row }">{{ row.fileCount }}</template>
          </el-table-column>
          <el-table-column label="归入阶段" min-width="180">
            <template #default="{ row }">
              <el-select v-model="row.targetStage" size="small" style="width: 100%">
                <el-option label="（未分类 → 日常管理）" value="" />
                <el-option
                  v-for="s in stages"
                  :key="s.id"
                  :label="s.info.name"
                  :value="s.id"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>

        <div class="row-gap" style="margin-top: 12px">
          <el-button type="success" :loading="copying" @click="doCopy">复制到项目</el-button>
          <span v-if="copiedCount" class="muted">已复制 {{ copiedCount }} 个文件</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { FolderChecked, FolderOpened } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../stores/app';
import { useProjectStore } from '../stores/project';
import { stageFolderName } from '../../shared/paths';
import type { Stage } from '../../shared/types';

const app = useAppStore();
const store = useProjectStore();
const { stages } = storeToRefs(store);

interface ScanRow {
  name: string;
  fileCount: number;
  targetStage: string; // stageId 或 ''（未分类）
}
const scan = ref<any>(null);
const rows = ref<ScanRow[]>([]);
const copying = ref(false);
const copiedCount = ref(0);

async function pickLibrary() {
  const dir = await window.api.openDialog({ title: '选择项目文件库文件夹', directory: true });
  if (!dir) return;
  const dirStr = dir as string;
  const stageList = stages.value.map((s: Stage) => ({ id: s.id, name: s.info.name }));
  const result = await window.api.importScan(dirStr, stageList);
  scan.value = result;
  rows.value = (result.subdirs as any[]).map((sd) => ({
    name: sd.name,
    fileCount: sd.files.length,
    targetStage: sd.matchedStageId ?? '',
  }));
  // 顶层散文件也提示
  if (result.looseFiles.length) {
    ElMessage.info(`发现 ${result.looseFiles.length} 个顶层散文件（未归子目录），将进入日常管理`);
  }
}

async function doCopy() {
  if (!scan.value) return;
  copying.value = true;
  try {
    // 建立 stageId → 阶段文件夹名 映射
    const stageMap: Record<string, string> = {};
    for (const s of store.stages) {
      const order = store.stages.indexOf(s);
      stageMap[s.id] = stageFolderName(order, s.info.name);
    }
    const subdirs = rows.value.map((r) => ({ name: r.name, matchedStageId: r.targetStage || null }));
    const res = await window.api.importCopy({
      libraryDir: scan.value.root,
      subdirs,
      projectRoot: app.currentProjectFolder,
      stageMap,
    });
    copiedCount.value = res.copied.length;
    ElMessage.success(`已复制 ${res.copied.length} 个文件入项目`);
  } catch (e) {
    ElMessage.error(`导入失败：${(e as Error).message}`);
  } finally {
    copying.value = false;
  }
}
</script>
