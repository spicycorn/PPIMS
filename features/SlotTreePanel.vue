<template>
  <div class="slottree">
    <div v-if="root" class="sp-head">
      <el-icon><Files /></el-icon>
      <span>插槽树</span>
      <div style="flex: 1"></div>
      <el-button size="small" :icon="Plus" @click="addTop">插槽</el-button>
    </div>

    <div v-if="slots.length === 0 && root" class="muted" style="padding: 12px">
      还没有插槽，点击右上"插槽"新建（顶层插槽 = 阶段）
    </div>

    <div v-for="slot in slots" :key="slot.id" class="slot-node">
      <!-- 插槽行 -->
      <div
        class="slot-row"
        :class="{ active: selectedSlotId === slot.id }"
        @click="emit('select', slot.id)"
      >
        <el-icon><Folder /></el-icon>
        <span class="slot-name">{{ slot.name }}</span>
        <span class="muted">({{ slot.files.length }})</span>
        <div class="slot-actions" @click.stop>
          <el-button size="small" link :icon="Top" @click="move(slot.id, -1)" title="上移" />
          <el-button size="small" link :icon="Bottom" @click="move(slot.id, 1)" title="下移" />
          <el-button size="small" link :icon="Edit" @click="rename(slot)" title="改名" />
          <el-button size="small" link type="danger" :icon="Delete" @click="remove(slot)" title="删除" />
        </div>
      </div>

      <!-- 子插槽（递归自身）+ "子插槽"按钮 -->
      <div class="subtree">
        <slot-tree-panel
          v-if="slot.subSlots.length"
          :slots="slot.subSlots"
          :selected-slot-id="selectedSlotId"
          :root="false"
          @select="(id) => emit('select', id)"
        />
        <el-button size="small" text type="primary" :icon="Plus" @click="addSub(slot)">子插槽</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { Plus, Top, Bottom, Edit, Delete, Folder, Files } from '@element-plus/icons-vue';
import { useProjectStore } from '../core/stores/project';
import type { Slot } from '../core/types';
import SlotTreePanel from './SlotTreePanel.vue';

defineProps<{
  slots: Slot[];
  selectedSlotId: string;
  root: boolean;
}>();
const emit = defineEmits<{ (e: 'select', slotId: string): void }>();

const store = useProjectStore();

/* ---------- 插槽 CRUD ---------- */
async function addTop() {
  try {
    const { value } = await ElMessageBox.prompt('插槽名称（顶层 = 阶段，如：项目立项）', '新增插槽', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    });
    if (value) {
      const s = store.addSlot(value.trim());
      emit('select', s.id);
    }
  } catch {
    /* 取消 */
  }
}
async function addSub(parent: Slot) {
  try {
    const { value } = await ElMessageBox.prompt('子插槽名称（如：勘测大纲）', `在"${parent.name}"下新增`, {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    });
    if (value) {
      const s = store.addSlot(value.trim(), parent.id);
      emit('select', s.id);
    }
  } catch {
    /* 取消 */
  }
}
async function rename(slot: Slot) {
  try {
    const { value } = await ElMessageBox.prompt('插槽名称', '改名', {
      inputValue: slot.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
    if (value) store.renameSlot(slot.id, value.trim());
  } catch {
    /* 取消 */
  }
}
async function remove(slot: Slot) {
  try {
    await ElMessageBox.confirm(`确定删除插槽"${slot.name}"及其子插槽吗？（已上传的文件记录会移除，物理文件保留）`, '删除插槽', {
      type: 'warning',
    });
    store.removeSlot(slot.id);
  } catch {
    /* 取消 */
  }
}
function move(slotId: string, dir: -1 | 1) {
  store.moveSlot(slotId, dir);
}
</script>

<style scoped>
.slottree {
  padding: 10px;
}
.sp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 10px;
}
.slot-actions {
  display: none;
  gap: 2px;
}
.slot-row:hover .slot-actions {
  display: flex;
}
.slot-name {
  flex: 1;
  font-size: 13px;
}
.slot-row.active {
  background: #ecf5ff;
}
.slot-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
}
.subtree {
  margin-left: 18px;
  border-left: 1px solid #eef0f3;
  padding-left: 4px;
}
</style>
