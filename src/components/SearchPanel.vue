<template>
  <div class="sp">
    <div class="card-block">
      <div class="row-gap">
        <el-icon><Search /></el-icon>
        <strong>检索 · 条件筛选</strong>
      </div>
      <el-form :inline="true" style="margin-top: 10px" label-width="70px">
        <el-form-item label="关键词">
          <el-input v-model="kw" placeholder="文件名 / 阶段 / 槽位" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="阶段">
          <el-select v-model="filterStage" clearable placeholder="全部" style="width: 150px">
            <el-option v-for="s in stages" :key="s.id" :label="s.info.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" clearable placeholder="全部" style="width: 130px">
            <el-option v-for="(label, key) in STATUS_LABEL" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="格式">
          <el-select v-model="filterFormat" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="(label, key) in FORMAT_LABEL" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="muted">命中 {{ results.length }} 个文件</div>
      <el-table :data="results" size="small" style="margin-top: 8px" @row-click="onRowClick">
        <el-table-column prop="file.name" label="文件" min-width="160">
          <template #default="{ row }">{{ row.file.name }} <span class="muted">v{{ row.file.version }}</span></template>
        </el-table-column>
        <el-table-column prop="stageName" label="阶段" width="140" />
        <el-table-column prop="slotName" label="槽位" width="140" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.qualified ? 'success' : 'warning'">
              {{ statusLabel(row.file.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="file.format" label="格式" width="70" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '../stores/project';
import { QUALIFIED_STATUSES, STATUS_LABEL, FORMAT_LABEL, type FileInstance, type FileStatus } from '../../shared/types';

const emit = defineEmits<{ (e: 'open-slot', stageId: string, slotId: string): void }>();

const store = useProjectStore();
const { stages, allSlots } = storeToRefs(store);

const kw = ref('');
const filterStage = ref('');
const filterStatus = ref('');
const filterFormat = ref('');

interface ResultRow {
  stageId: string;
  stageName: string;
  slotId: string;
  slotName: string;
  file: FileInstance;
  qualified: boolean;
}

const results = computed<ResultRow[]>(() => {
  const k = kw.value.trim().toLowerCase();
  const out: ResultRow[] = [];
  for (const { stage, slot } of allSlots.value) {
    if (filterStage.value && stage.id !== filterStage.value) continue;
    for (const file of slot.files) {
      if (filterStatus.value && file.status !== filterStatus.value) continue;
      if (filterFormat.value && file.format !== filterFormat.value) continue;
      if (k) {
        const hay = `${file.name} ${stage.info.name} ${slot.name}`.toLowerCase();
        if (!hay.includes(k)) continue;
      }
      out.push({
        stageId: stage.id,
        stageName: stage.info.name,
        slotId: slot.id,
        slotName: slot.name,
        file,
        qualified: QUALIFIED_STATUSES.includes(file.status),
      });
    }
  }
  return out;
});

function onRowClick(row: ResultRow) {
  emit('open-slot', row.stageId, row.slotId);
}

function statusLabel(s: FileStatus): string {
  return STATUS_LABEL[s];
}
</script>
