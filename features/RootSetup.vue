<template>
  <div class="setup">
    <el-card class="setup-card">
      <template #header>
        <div class="row-gap">
          <el-icon :size="22"><FolderOpened /></el-icon>
          <span>选择数据根目录</span>
        </div>
      </template>
      <p class="muted">
        PPIMS 是本地项目资料管理工具。请选择一个文件夹作为<strong>数据根目录</strong>，
        所有项目都会以"自包含文件夹"形式保存在该目录下，可整体复制/搬移/备份。
      </p>
      <div v-if="rootDir" class="chosen mono">当前根目录：{{ rootDir }}</div>
      <el-space style="margin-top: 14px">
        <el-button type="primary" @click="chooseRoot">选择 / 更换根目录</el-button>
      </el-space>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAppStore } from '../core/stores/app';

const app = useAppStore();
const { rootDir } = storeToRefs(app);

async function chooseRoot() {
  const dir = await window.api.openDialog({ title: '选择数据根目录', directory: true });
  if (dir) app.setRootDir(dir as string);
}
</script>

<style scoped>
.setup {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.setup-card {
  width: 560px;
}
.chosen {
  margin-top: 12px;
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  word-break: break-all;
}
</style>
