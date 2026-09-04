<template>
  <div class="sw">
    <!-- 插槽头（名称 + 文件数） -->
    <div class="card-block sw-head">
      <div class="row-gap">
        <el-icon :size="18"><Folder /></el-icon>
        <strong>{{ slot.name }}</strong>
        <el-tag size="small" type="info">{{ slot.files.length }} 个文件</el-tag>
        <span v-if="slot.subSlots.length" class="muted">· {{ slot.subSlots.length }} 个子插槽</span>
      </div>
    </div>

    <!-- 文件管理（列表 / 上传 / 查看 / 原位编辑 / 标签） -->
    <FilePanel :slot="slot" />

    <!-- 子插槽列表 -->
    <div class="card-block sub-block">
      <div class="row-gap" style="margin-bottom: 8px">
        <el-icon :size="16"><Files /></el-icon>
        <strong>子插槽</strong>
        <div style="flex: 1"></div>
        <el-button size="small" text type="primary" :icon="Plus" @click="addSub">添加子插槽</el-button>
      </div>
      <div v-if="!slot.subSlots.length" class="muted">暂无子插槽（插槽可嵌套，形成多级树）</div>
      <div v-else class="sub-list">
        <el-tag
          v-for="sub in slot.subSlots"
          :key="sub.id"
          class="sub-tag"
          @click="goSub(sub.id)"
        >
          {{ sub.name }} ({{ sub.files.length }})
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox, ElMessage } from 'element-plus';
import { Folder, Files, Plus } from '@element-plus/icons-vue';
import type { Slot } from '../core/types';
import { useProjectStore } from '../core/stores/project';
import FilePanel from './FilePanel.vue';

const props = defineProps<{ slot: Slot }>();
const store = useProjectStore();

async function addSub() {
  try {
    const { value } = await ElMessageBox.prompt('子插槽名称（如：勘测大纲）', `在"${props.slot.name}"下新增`, {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    });
    if (value) {
      const s = store.addSlot(value.trim(), props.slot.id);
      store.selectSlot(s.id);
      ElMessage.success(`已创建子插槽"${s.name}"`);
    }
  } catch {
    /* 取消 */
  }
}

function goSub(subId: string) {
  store.selectSlot(subId);
}
</script>

<style scoped>
.sw-head {
  margin-bottom: 12px;
}
.sub-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sub-tag {
  cursor: pointer;
}
</style>
