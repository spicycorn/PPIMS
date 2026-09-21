<template>
  <div class="fp">
    <div class="card-block">
      <div class="row-gap" style="margin-bottom: 10px">
        <el-icon><Folder /></el-icon>
        <strong>文件</strong>
        <el-tag size="small" type="info">{{ slot.files.length }} 个</el-tag>
        <div style="flex: 1"></div>
        <el-button type="primary" :icon="Upload" @click="upload">上传文件</el-button>
      </div>

      <el-empty v-if="slot.files.length === 0" description="还没有文件，点击右上的上传文件按钮添加（可一次传多个）" :image-size="70" />

      <el-table v-else :data="slot.files" size="default">
        <el-table-column label="名称 / 格式" min-width="180">
          <template #default="{ row }">
            <div class="row-gap">
              <el-button size="small" link @click="rename(row)" :title="row.name">{{ row.name }}</el-button>
              <el-tag size="small" :type="formatTagType(row.format)">{{ row.format || '未知' }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="90">
          <template #default="{ row }">{{ fileSizeLabel(row.size) }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="标签" min-width="140">
          <template #default="{ row }">
            <div class="row-gap">
              <el-tag
                v-for="t in row.tags"
                :key="t"
                size="small"
                class="tag-item"
                @click="removeTag(row, t)"
                :title="`点击移除标签${t}`"
              >
                {{ t }}
              </el-tag>
              <el-button size="small" link type="primary" @click="addTag(row)">＋标签</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link :icon="Open" title="用系统程序打开（预览 / 编辑）" @click="openExternal(row)">打开</el-button>
            <el-button size="small" link :icon="Download" @click="download(row)">下载</el-button>
            <el-button size="small" link type="danger" :icon="Delete" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { Upload, Download, Delete, Folder, Open } from '@element-plus/icons-vue';
import { useAppStore } from '../core/stores/app';
import { useProjectStore } from '../core/stores/project';
import type { FileEntry, Slot } from '../core/types';
import { formatDateTime, fileSizeLabel } from '../core/util';

const props = defineProps<{ slot: Slot }>();
const app = useAppStore();
const store = useProjectStore();

function formatTagType(format: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  if (['xlsx', 'xlsm', 'xltm', 'xls', 'csv'].includes(format)) return 'success';
  if (['zip', 'rar', '7z'].includes(format)) return 'warning';
  if (['docx', 'doc', 'dotx', 'docm'].includes(format)) return 'info';
  return 'info';
}

/* ---------- 上传（多文件，重名自动加序号，存入当前插槽文件夹） ---------- */
async function upload() {
  const res = await window.api.openDialog({ title: '选择要上传的文件（可多选）', multiSelections: true });
  if (!res) return;
  const files = Array.isArray(res) ? res : [res];
  const slotFolder = store.slotFolderRelPath(props.slot.id);
  let okCount = 0;
  for (const src of files) {
    const r = await window.api.copyFile(src, app.currentProjectFolder, slotFolder);
    store.addFiles(props.slot.id, [
      {
        id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: r.baseName,
        format: r.format,
        size: r.size,
        createdAt: new Date().toISOString(),
        path: r.relativePath,
        tags: [],
      },
    ]);
    okCount++;
  }
  const saved = await store.persist();
  if (saved) {
    ElMessage.success(`已上传 ${okCount} 个文件到「${props.slot.name}」`);
  } else {
    ElMessage.warning(`已上传 ${okCount} 个文件，但项目状态未保存：${store.error || '未知原因'}`);
  }
}

/* ---------- 标签 ---------- */
async function addTag(row: FileEntry) {
  try {
    const { value } = await ElMessageBox.prompt('标签（如：重要 / 已核）', `为"${row.name}"添加标签`, {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
    });
    if (value) store.addFileTag(props.slot.id, row.id, value);
  } catch {
    /* 取消 */
  }
}
function removeTag(row: FileEntry, tag: string) {
  store.removeFileTag(props.slot.id, row.id, tag);
}

/* ---------- 改名 ---------- */
async function rename(row: FileEntry) {
  try {
    const { value } = await ElMessageBox.prompt('文件名称', '改名', {
      inputValue: row.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
    if (value) store.updateFile(props.slot.id, row.id, { name: value.trim() });
  } catch {
    /* 取消 */
  }
}

/* ---------- 打开 / 下载 / 删除 ---------- */
async function openExternal(row: FileEntry) {
  const abs = `${app.currentProjectFolder}/${row.path}`;
  const res = await window.api.openFileExternal(abs);
  if (res.error) ElMessage.error(res.error);
}
async function download(row: FileEntry) {
  const res = await window.api.downloadFile(app.currentProjectFolder, row.path, `${row.name}.${row.format}`);
  if (res) ElMessage.success(`已下载到：${res.savedTo}`);
}
async function remove(row: FileEntry) {
  try {
    await ElMessageBox.confirm(`确定删除文件"${row.name}"吗？（项目内记录与插槽文件夹内的物理文件都会移除）`, '删除文件', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await store.removeFile(props.slot.id, row.id); // 统一：物理删除 + 移出树 + 落盘
    ElMessage.success(`已删除文件"${row.name}"`);
  } catch (e) {
    if (typeof e === 'string' && (e === 'cancel' || e === 'close')) return; // 用户取消
    ElMessage.error(`删除文件失败：${(e as Error).message}`);
  }
}
</script>

<style scoped>
.tag-item {
  cursor: pointer;
}
</style>
