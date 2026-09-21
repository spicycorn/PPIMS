<template>
  <div class="app">
    <RootSetup v-if="view === 'setup'" />
    <ProjectList v-else-if="view === 'list'" />
    <ProjectDetail v-else-if="view === 'detail' && project" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage } from 'element-plus';
import { useAppStore } from './stores/app';
import { useProjectStore } from './stores/project';
import RootSetup from '../features/RootSetup.vue';
import ProjectList from '../features/ProjectList.vue';
import ProjectDetail from '../features/ProjectDetail.vue';

const app = useAppStore();
const projectStore = useProjectStore();
const { view } = storeToRefs(app);
const { project } = storeToRefs(projectStore);

let offNavigate: (() => void) | null = null;

/**
 * 从悬浮框导航（v1.2.7）：folder 非空=打开该项目，空=回项目列表。
 * 边界：主窗口 rootDir 为空（如刚重启尚未设根目录，但悬浮框读磁盘有项目）→ 先从磁盘恢复最近根目录。
 */
async function navigateTo(folder: string) {
  if (!app.rootDir) {
    try {
      const last = await window.api.getLastRootDir();
      if (last) app.setRootDir(last);
    } catch {
      /* ignore */
    }
  }
  if (folder) {
    // 若当前打开的是另一个项目，先重置（避免旧项目内容闪现），再加载新项目
    if (app.currentProjectFolder !== folder) {
      projectStore.reset();
    }
    app.openProject(folder);
    try {
      await projectStore.load(folder);
    } catch (e) {
      ElMessage.error(`打开项目失败：${(e as Error).message}`);
      app.closeProject();
    }
  } else {
    projectStore.reset();
    app.closeProject();
  }
}

onMounted(() => {
  offNavigate = window.api.onMainNavigate(async (payload) => {
    void navigateTo(payload?.folder ?? '');
  });
});
onBeforeUnmount(() => {
  offNavigate?.();
});
</script>

<style scoped>
.app {
  height: 100%;
}
</style>
