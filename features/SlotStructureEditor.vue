<template>
  <div class="sse" :style="{ marginLeft: (depth ?? 0) ? '18px' : '0' }">
    <div v-for="(node, i) in nodes" :key="i" class="sse-node">
      <div class="row-gap">
        <el-icon><Folder /></el-icon>
        <el-input v-model="node.name" :placeholder="`插槽名称${i + 1}`" size="small" style="width: 220px" />
        <el-button size="small" link type="primary" :icon="Plus" @click="addSub(node)">子插槽</el-button>
        <el-button size="small" link type="danger" :icon="Delete" @click="nodes.splice(i, 1)">删</el-button>
      </div>
      <slot-structure-editor v-if="node.subSlots.length" :nodes="node.subSlots" :depth="(depth ?? 0) + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder, Plus, Delete } from '@element-plus/icons-vue';
import type { TplSlotInput } from '../core/types';
import SlotStructureEditor from './SlotStructureEditor.vue';

defineProps<{
  nodes: TplSlotInput[];
  depth?: number;
}>();

function addSub(node: TplSlotInput) {
  node.subSlots.push({ name: '', subSlots: [] });
}
</script>

<style scoped>
.sse-node {
  margin-bottom: 6px;
}
</style>
