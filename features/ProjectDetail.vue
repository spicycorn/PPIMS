<template>
  <div class="app-shell">
    <!-- 工具栏 -->
    <el-header class="toolbar" height="auto">
      <div class="row-gap">
        <el-icon :size="20"><Briefcase /></el-icon>
        <div>
          <div class="proj-name">{{ project!.info.name }}</div>
          <div class="muted mono">
            {{ project!.info.code }}
            <template v-if="project!.info.region"> · {{ project!.info.region }}</template>
            <template v-if="project!.info.type"> · {{ project!.info.type }}</template>
            <template v-if="project!.info.dispatchDate"> · 下发 {{ project!.info.dispatchDate }}</template>
          </div>
        </div>
        <div style="flex: 1"></div>
        <el-button :icon="Collection" @click="tplOpen = true">结构模板库</el-button>
        <el-button :icon="Search" @click="searchOpen = true">检索</el-button>
        <el-button :icon="Refresh" :loading="saving" @click="save">保存</el-button>
        <el-button :icon="FolderOpened" @click="openFolder">打开文件夹</el-button>
        <el-button :icon="Back" @click="close">返回项目列表</el-button>
      </div>
    </el-header>

    <div class="app-main">
      <!-- 左：插槽树（顶层插槽 + 嵌套子插槽） -->
      <div class="app-sidebar">
        <SlotTreePanel :slots="projectStore.slots" :selected-slot-id="selectedSlotId" :root="true" @select="onSelectSlot" />
      </div>

      <!-- 右：插槽工作区（文件 + 子插槽） -->
      <div class="app-content">
        <el-empty v-if="!selectedSlot" description="请在左侧选择一个插槽，上传 / 管理文件，或添加子插槽" />
        <SlotWorkspace v-else :slot="selectedSlot" />
      </div>
    </div>

    <!-- 检索 -->
    <el-dialog v-model="searchOpen" title="检索 · 条件筛选" width="820px" top="8vh">
      <SearchPanel @open-slot="onSearchOpenSlot" />
    </el-dialog>

    <!-- 结构模板库（全局；带当前项目，可"从当前项目另存"） -->
    <el-dialog v-model="tplOpen" title="结构模板库" width="900px" top="6vh" destroy-on-close>
      <TemplateManager :current-folder="app.currentProjectFolder" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, FolderOpened, Back, Briefcase, Search, Collection } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../core/stores/app';
import { useProjectStore } from '../core/stores/project';
import SlotTreePanel from './SlotTreePanel.vue';
import SlotWorkspace from './SlotWorkspace.vue';
import SearchPanel from './SearchPanel.vue';
import TemplateManager from './TemplateManager.vue';

const app = useAppStore();
const projectStore = useProjectStore();
const { project, dirty, selectedSlotId } = storeToRefs(projectStore);

const searchOpen = ref(false);
const tplOpen = ref(false);

const selectedSlot = computed(() =>
  selectedSlotId.value ? projectStore.findSlot(selectedSlotId.value) ?? null : null,
);

const saving = computed(() => dirty.value);

function onSelectSlot(slotId: string) {
  projectStore.selectSlot(slotId);
}

function onSearchOpenSlot(slotId: string) {
  searchOpen.value = false;
  projectStore.selectSlot(slotId);
}

async function save() {
  try {
    await projectStore.persist();
    ElMessage.success('已保存到 project.json');
  } catch (e) {
    ElMessage.error(`保存失败：${(e as Error).message}`);
  }
}

async function openFolder() {
  const res = await window.api.openFolder(app.currentProjectFolder);
  if (res.error) ElMessage.error(res.error);
}

function close() {
  projectStore.reset();
  app.closeProject();
}

onMounted(() => {
  if (projectStore.slots.length) {
    projectStore.selectSlot(projectStore.slots[0]?.id ?? '');
  }
});
</script>

<style scoped>
.toolbar {
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.proj-name {
  font-size: 16px;
  font-weight: 600;
}
</style>
