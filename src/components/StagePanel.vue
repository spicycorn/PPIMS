<template>
  <div class="stagepanel">
    <div class="sp-head">
      <el-icon><Files /></el-icon>
      <span>阶段 · 槽位 · 文件</span>
      <div style="flex: 1"></div>
      <el-button size="small" :icon="Plus" @click="addStage">阶段</el-button>
    </div>

    <div v-if="stages.length === 0" class="muted" style="padding: 12px">
      还没有阶段，点击右上"阶段"新建
    </div>

    <div v-for="stage in stages" :key="stage.id" class="stage-block">
      <!-- 阶段头 -->
      <div
        class="stage-header"
        :class="{ active: selectedStageId === stage.id }"
        @click="emit('select-stage', stage.id)"
      >
        <el-icon><Folder /></el-icon>
        <span class="stage-name">{{ stage.info.name }}</span>
        <el-tag size="small" :type="stageProgress(stage.id) >= 100 ? 'success' : 'info'">
          {{ stageProgress(stage.id) }}%
        </el-tag>
        <div class="stage-actions" @click.stop>
          <el-button size="small" link :icon="Top" @click="moveStage(stage.id, -1)" title="上移" />
          <el-button size="small" link :icon="Bottom" @click="moveStage(stage.id, 1)" title="下移" />
          <el-button size="small" link :icon="Edit" @click="renameStage(stage)" title="改名" />
          <el-button size="small" link type="danger" :icon="Delete" @click="removeStage(stage)" title="删除" />
        </div>
      </div>

      <!-- 槽位列表 -->
      <div class="slot-list">
        <div v-if="stage.slots.length === 0" class="muted" style="padding: 4px 10px 8px 24px">
          暂无槽位
        </div>
        <div
          v-for="slot in sortedSlots(stage)"
          :key="slot.id"
          class="slot-row"
          :class="{ active: selectedSlotId === slot.id }"
          @click="emit('select-slot', stage.id, slot.id)"
        >
          <el-tag size="small" :type="necessityTag(slot.necessity)" disable-transitions>
            {{ necessityLabel(slot.necessity) }}
          </el-tag>
          <span class="slot-name">{{ slot.name }}</span>
          <el-icon v-if="slot.templateId"><Document /></el-icon>
          <span class="muted">({{ slot.files.length }})</span>
          <div class="slot-actions" @click.stop>
            <el-button size="small" link :icon="Top" @click="moveSlot(stage.id, slot.id, -1)" title="上移" />
            <el-button size="small" link :icon="Bottom" @click="moveSlot(stage.id, slot.id, 1)" title="下移" />
            <el-button size="small" link :icon="Edit" @click="renameSlot(stage, slot)" title="改名" />
            <el-button size="small" link type="danger" :icon="Delete" @click="removeSlot(stage, slot)" title="删除" />
          </div>
        </div>
        <!-- 文件实例 -->
        <template v-for="slot in sortedSlots(stage)" :key="slot.id + '_files'">
          <div v-for="file in slot.files" :key="file.id" class="file-row" @click="emit('select-slot', stage.id, slot.id)">
            <el-icon><Paperclip /></el-icon>
            <span>{{ file.name }} <span class="muted">v{{ file.version }}</span></span>
            <el-tag size="small" :type="statusTag(file.status)">{{ statusLabel(file.status) }}</el-tag>
          </div>
        </template>
        <div class="slot-add" @click.stop>
          <el-button size="small" text type="primary" :icon="Plus" @click="addSlot(stage)">添加槽位</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ElMessageBox } from 'element-plus';
import { Plus, Top, Bottom, Edit, Delete, Folder, Files, Paperclip, Document } from '@element-plus/icons-vue';
import { useProjectStore } from '../stores/project';
import {
  NECESSITY_LABEL,
  STATUS_LABEL,
  type FileStatus,
  type Necessity,
  type Slot,
  type Stage,
} from '../../shared/types';

defineProps<{ selectedStageId: string; selectedSlotId: string }>();
const emit = defineEmits<{
  (e: 'select-stage', stageId: string): void;
  (e: 'select-slot', stageId: string, slotId: string): void;
}>();

const store = useProjectStore();
const { stages } = storeToRefs(store);

function stageProgress(stageId: string): number {
  return store.progress.stages[stageId] ?? 0;
}
function sortedSlots(stage: Stage): Slot[] {
  return [...stage.slots].sort((a, b) => a.order - b.order);
}
function necessityTag(n: Necessity): '' | 'success' | 'warning' | 'danger' | 'info' {
  return n === 'required' ? 'danger' : n === 'should' ? 'warning' : 'info';
}
function necessityLabel(n: Necessity): string {
  return NECESSITY_LABEL[n];
}
function statusTag(s: FileStatus): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<FileStatus, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'info',
    drafting: 'warning',
    pending_review: 'warning',
    reviewed: 'success',
    archived: 'success',
  };
  return map[s];
}
function statusLabel(s: FileStatus): string {
  return STATUS_LABEL[s];
}

/* ---------- 阶段 CRUD ---------- */
async function addStage() {
  try {
    const { value } = await ElMessageBox.prompt('新阶段名称', '新增阶段', {
      inputValue: '',
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    });
    if (value) {
      const st = store.addStage(value.trim());
      emit('select-stage', st.id);
    }
  } catch {
    /* 取消 */
  }
}
async function renameStage(stage: Stage) {
  try {
    const { value } = await ElMessageBox.prompt('阶段名称', '改名', {
      inputValue: stage.info.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
    if (value) store.renameStage(stage.id, value.trim());
  } catch {
    /* 取消 */
  }
}
async function removeStage(stage: Stage) {
  try {
    await ElMessageBox.confirm(
      `确定删除阶段"${stage.info.name}"及其全部槽位/文件记录吗？（已复制进项目目录的文件不会被删除）`,
      '删除阶段',
      { type: 'warning' },
    );
    store.removeStage(stage.id);
  } catch {
    /* 取消 */
  }
}
function moveStage(stageId: string, dir: -1 | 1) {
  store.moveStage(stageId, dir);
}

/* ---------- 槽位 CRUD ---------- */
async function addSlot(stage: Stage) {
  try {
    const { value } = await ElMessageBox.prompt('槽位名称（如：勘测大纲）', '新增槽位', {
      inputValue: '',
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    });
    if (value) {
      const s = store.addSlot(stage.id, { name: value.trim() });
      emit('select-slot', stage.id, s.id);
    }
  } catch {
    /* 取消 */
  }
}
async function renameSlot(stage: Stage, slot: Slot) {
  try {
    const { value } = await ElMessageBox.prompt('槽位名称', '改名', {
      inputValue: slot.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
    if (value) store.updateSlot(stage.id, slot.id, { name: value.trim() });
  } catch {
    /* 取消 */
  }
}
async function removeSlot(stage: Stage, slot: Slot) {
  try {
    await ElMessageBox.confirm(`确定删除槽位"${slot.name}"吗？`, '删除槽位', { type: 'warning' });
    store.removeSlot(stage.id, slot.id);
  } catch {
    /* 取消 */
  }
}
function moveSlot(stageId: string, slotId: string, dir: -1 | 1) {
  store.moveSlot(stageId, slotId, dir);
}
</script>

<style scoped>
.stagepanel {
  padding: 10px;
}
.sp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 10px;
}
.stage-actions,
.slot-actions {
  display: none;
  gap: 2px;
}
.stage-block:hover .stage-actions,
.slot-row:hover .slot-actions {
  display: flex;
}
.stage-name {
  font-weight: 600;
  flex: 1;
}
.stage-header.active {
  background: #ecf5ff;
}
.slot-list {
  border-top: 1px solid #f0f2f5;
}
.slot-name {
  flex: 1;
  font-size: 13px;
}
.slot-row.active {
  background: #ecf5ff;
}
.slot-add {
  padding: 2px 10px 8px 24px;
}
</style>
