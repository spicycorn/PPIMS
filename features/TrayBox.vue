<template>
  <div class="tb" @mousedown="onDrag">
    <!-- 标题栏（可拖动） -->
    <div class="tb-head" title="拖动移动悬浮框">
      <span class="tb-title">📋 未完成归档项目</span>
      <el-button class="tb-close" size="small" text @click="close">✕</el-button>
    </div>

    <!-- 内容 -->
    <div class="tb-body">
      <div v-if="!rootDir" class="tb-empty">
        <p>尚未设置数据根目录</p>
        <el-button size="small" type="primary" @click="showMain">打开主窗口设置</el-button>
      </div>

      <div v-else-if="loading" class="tb-empty">加载中…</div>

      <div v-else-if="items.length === 0" class="tb-empty">
        <p>🎉 所有项目都已归档</p>
      </div>

      <div v-else>
        <div
          v-for="p in items"
          :key="p.folder"
          class="tb-item"
          @click="showMain"
          :title="`点击查看（${p.name}）`"
        >
          <div class="tb-item-main">
            <span class="tb-item-name">{{ p.name }}</span>
            <el-tag size="small" type="info" class="tb-item-stage">{{ p.stage || '未标记阶段' }}</el-tag>
          </div>
          <div class="tb-item-sub">{{ p.code }}{{ p.region ? ' · ' + p.region : '' }}</div>
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="tb-foot" v-if="rootDir && items.length">
      <el-button size="small" @click="showMain">打开主窗口</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

interface TrayProject {
  name: string;
  code: string;
  folder: string;
  stage?: string;
  region?: string;
}

const rootDir = ref('');
const loading = ref(true);
const items = ref<TrayProject[]>([]);

onMounted(async () => {
  try {
    rootDir.value = await window.api.getLastRootDir();
  } catch {
    rootDir.value = '';
  }
  if (!rootDir.value) {
    loading.value = false;
    return;
  }
  try {
    const list = await window.api.listProjects(rootDir.value);
    // 只列"未完成归档"的项目（v1.2.4：未显式标记 archived；旧项目无该字段视为未完成）
    items.value = list
      .filter((p) => p.info?.archived !== true)
      .map((p) => ({
        name: p.info?.name || p.name,
        code: p.info?.code || '',
        folder: p.folder,
        stage: p.info?.stage,
        region: p.info?.region,
      }));
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
});

function showMain() {
  window.api.trayBoxShowMain().catch(() => {
    ElMessage.error('无法显示主窗口');
  });
}

function close() {
  // 隐藏悬浮框（通过 postMessage 通知主进程，或直接 window.close）
  try {
    (window as unknown as { close: () => void }).close();
  } catch {
    /* ignore */
  }
}

/* ---------------- 拖动（无边框窗口手动拖动） ---------------- */
let dragging = false;
let lastX = 0;
let lastY = 0;
function onDrag(e: MouseEvent) {
  // 只在标题栏区域触发拖动
  const head = (e.currentTarget as HTMLElement).querySelector('.tb-head');
  if (!head || !head.contains(e.target as Node)) return;
  dragging = true;
  lastX = e.screenX;
  lastY = e.screenY;
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  lastX = e.screenX;
  lastY = e.screenY;
  // 无边框窗口拖动：通过 postMessage 发给主进程
  (window as unknown as { __drayDrag?: (dx: number, dy: number) => void }).__drayDrag?.(dx, dy);
}
function onDragEnd() {
  dragging = false;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
}
</script>

<style scoped>
/* 平滑展示：窗口 showInactive 后，渲染层做 fade-in（不闪屏） */
@keyframes tb-fade-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.tb {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 13px;
  animation: tb-fade-in 0.22s ease;
}
.tb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  cursor: move;
  user-select: none;
}
.tb-title {
  font-weight: 600;
  color: #303133;
}
.tb-close {
  padding: 0 4px;
  color: #909399;
}
.tb-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
}
.tb-empty {
  text-align: center;
  padding: 24px 12px;
  color: #909399;
}
.tb-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}
.tb-item:hover {
  background: #ecf5ff;
}
.tb-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.tb-item-name {
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-item-stage {
  flex-shrink: 0;
}
.tb-item-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}
.tb-foot {
  padding: 8px;
  border-top: 1px solid #ebeef5;
  text-align: center;
}
</style>
