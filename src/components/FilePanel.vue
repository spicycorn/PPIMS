<template>
  <div class="fp">
    <div class="card-block">
      <div class="row-gap" style="margin-bottom: 10px">
        <el-icon><Folder /></el-icon>
        <strong>文件实例（多版本 · 状态流转）</strong>
        <el-tag size="small" type="info">{{ slot.files.length }} 个文件</el-tag>
        <div style="flex: 1"></div>
        <el-button type="primary" :icon="Upload" @click="upload">上传文件</el-button>
      </div>

      <el-empty v-if="slot.files.length === 0" description="还没有文件，可上传现成文件，或在「模板编辑」页生成" :image-size="70" />

      <el-table v-else :data="slot.files" size="default">
        <el-table-column label="版本" width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="row.version === latestVersion ? 'primary' : 'info'">
              v{{ row.version }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="格式" width="100">
          <template #default="{ row }">{{ FORMAT_LABEL[row.format as FileFormat] }}</template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default="{ row }">
            <el-select v-model="row.status" size="small" style="width: 130px" @change="onStatusChange(row)">
              <el-option v-for="(label, key) in STATUS_LABEL" :key="key" :label="label" :value="key" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" :icon="Download" @click="download(row)">下载</el-button>
            <el-button size="small" link type="danger" :icon="Delete" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="muted" style="margin-top: 8px">
        状态到达"已审 / 已归档"即视为该槽位完成，阶段与项目进度随之自动重算。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Upload, Download, Delete, Folder } from '@element-plus/icons-vue';
import { useAppStore } from '../stores/app';
import { useProjectStore } from '../stores/project';
import { STATUS_LABEL, FORMAT_LABEL, type FileFormat, type FileInstance, type Slot, type Stage } from '../../shared/types';
import { slotDir } from '../../shared/paths';
import { formatDateTime } from '../../shared/util';

const props = defineProps<{ stage: Stage; slot: Slot }>();
const app = useAppStore();
const store = useProjectStore();

const latestVersion = computed(() =>
  props.slot.files.reduce((m, f) => Math.max(m, f.version), 0),
);

async function upload() {
  const stageOrder = store.stages.findIndex((s) => s.id === props.stage.id);
  const dir = slotDir(stageOrder, props.stage.info.name, props.slot.name);
  const res = await window.api.pickFileAndCopyIn(app.currentProjectFolder, dir, props.slot.name);
  if (!res) return;
  const ext = (res.baseName.split('.').pop() || '').toLowerCase();
  const format = ['docx', 'doc'].includes(ext) ? 'docx' : ['xlsx', 'xls'].includes(ext) ? 'xlsx' : 'other';
  store.addFile(props.stage.id, props.slot.id, {
    name: res.baseName.replace(/\.\w+$/, ''),
    format,
    status: 'drafting',
    path: res.relativePath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await store.persist();
  ElMessage.success(`已上传：${res.baseName}（v${latestVersion.value}）`);
}

async function onStatusChange(row: FileInstance) {
  await store.persist();
  ElMessage.success(`状态已更新为：${STATUS_LABEL[row.status]}`);
}

async function download(row: FileInstance) {
  const res = await window.api.downloadFile(
    app.currentProjectFolder,
    row.path,
    `${row.name}_v${row.version}`,
  );
  if (res) ElMessage.success(`已下载到：${res.savedTo}`);
}

async function remove(row: FileInstance) {
  try {
    await ElMessageBox.confirm(`确定删除 v${row.version} 吗？`, '删除文件', { type: 'warning' });
    store.removeFile(props.stage.id, props.slot.id, row.id);
    await store.persist();
  } catch {
    /* 取消 */
  }
}
</script>
