<template>
  <div class="sp">
    <div class="card-block">
      <div class="row-gap">
        <el-icon><Search /></el-icon>
        <strong>检索 · 条件筛选</strong>
      </div>
      <el-form :inline="true" style="margin-top: 10px" label-width="70px">
        <el-form-item label="关键词">
          <el-input v-model="kw" placeholder="文件名 / 插槽名" clearable style="width: 220px" />
        </el-form-item>
        <el-form-item label="插槽">
          <el-select v-model="filterSlot" clearable placeholder="全部（顶层插槽）" style="width: 170px">
            <el-option v-for="s in slots" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="格式">
          <el-select v-model="filterFormat" clearable placeholder="全部" style="width: 130px">
            <el-option v-for="f in formatList" :key="f" :label="f" :value="f" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="muted">命中 {{ results.length }} 个文件</div>
      <el-table v-if="results.length" :data="results" size="small" style="margin-top: 8px" @row-click="onRowClick">
        <el-table-column label="文件" min-width="180">
          <template #default="{ row }">
            {{ row.file.name }}
            <span v-if="row.file.tags.length" class="muted">
              <el-tag v-for="t in row.file.tags" :key="t" size="small" style="margin-left: 4px">{{ t }}</el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="插槽路径" min-width="160">
          <template #default="{ row }">{{ row.slotPath }}</template>
        </el-table-column>
        <el-table-column label="格式" width="90">
          <template #default="{ row }">{{ row.file.format || '—' }}</template>
        </el-table-column>
        <el-table-column label="大小" width="90">
          <template #default="{ row }">{{ fileSizeLabel(row.file.size) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '../core/stores/project';
import { fileSizeLabel } from '../core/util';

const emit = defineEmits<{ (e: 'open-slot', slotId: string): void }>();

const store = useProjectStore();
const { slots, allFiles } = storeToRefs(store);

const kw = ref('');
const filterSlot = ref('');
const filterFormat = ref('');

/** 动态格式列表（来自实际文件，非固定枚举） */
const formatList = computed(() => {
  const set = new Set<string>();
  for (const { file } of allFiles.value) {
    if (file.format) set.add(file.format);
  }
  return [...set].sort();
});

interface ResultRow {
  slotId: string;
  slotPath: string;
  file: (typeof allFiles.value)[number]['file'];
}

const results = computed<ResultRow[]>(() => {
  const k = kw.value.trim().toLowerCase();
  const out: ResultRow[] = [];
  for (const { slot, file, slotPath } of allFiles.value) {
    // 顶层插槽筛选：slotPath 第一段
    if (filterSlot.value) {
      const top = slotPath.split('/')[0];
      const topSlot = slots.value.find((s) => s.name === top);
      if (!topSlot || topSlot.id !== filterSlot.value) continue;
    }
    if (filterFormat.value && file.format !== filterFormat.value) continue;
    if (k) {
      const hay = `${file.name} ${slotPath}`.toLowerCase();
      if (!hay.includes(k)) continue;
    }
    out.push({ slotId: slot.id, slotPath, file });
  }
  return out;
});

function onRowClick(row: ResultRow) {
  emit('open-slot', row.slotId);
}
</script>
