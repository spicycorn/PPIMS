<template>
  <div class="app">
    <RootSetup v-if="view === 'setup'" />
    <ProjectList v-else-if="view === 'list'" />
    <ProjectDetail v-else-if="view === 'detail' && project" />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAppStore } from './stores/app';
import { useProjectStore } from './stores/project';
import RootSetup from '../features/RootSetup.vue';
import ProjectList from '../features/ProjectList.vue';
import ProjectDetail from '../features/ProjectDetail.vue';

const app = useAppStore();
const { view } = storeToRefs(app);
const { project } = storeToRefs(useProjectStore());
</script>

<style scoped>
.app {
  height: 100%;
}
</style>
