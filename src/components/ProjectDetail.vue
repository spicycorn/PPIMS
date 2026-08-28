<template>
  <div class="app-shell">
    <!-- 工具栏 -->
    <el-header class="toolbar" height="auto">
      <div class="row-gap">
        <el-icon :size="20"><Briefcase /></el-icon>
        <div>
          <div class="proj-name">{{ project!.info.name }}</div>
          <div class="muted mono">{{ project!.info.code }} · 立项 {{ project!.info.establishDate }}</div>
        </div>
        <el-divider direction="vertical" />
        <div class="prog">
          <div class="row-gap">
            <span class="muted">项目进度</span>
            <el-progress
              :percentage="progress.project"
              :stroke-width="10"
              style="width: 180px"
              :status="progress.project >= 100 ? 'success' : undefined"
            />
            <el-tag :type="progress.project >= 100 ? 'success' : 'primary'" size="small">
              {{ progress.project }}%
            </el-tag>
          </div>
        </div>
        <div style="flex: 1"></div>
        <el-button :icon="Download" @click="importOpen = true">导入文件库</el-button>
        <el-button :icon="Search" @click="searchOpen = true">检索</el-button>
        <el-button :icon="Refresh" :loading="saving" @click="save">保存</el-button>
        <el-button :icon="FolderOpened" @click="openFolder">打开文件夹</el-button>
        <el-button :icon="Back" @click="close">返回项目列表</el-button>
      </div>
      <!-- 缺项提示 -->
      <div v-if="missingCount > 0" class="row-gap missing">
        <el-alert
          :title="`尚有 ${missingCount} 个必填/应填槽位未完成`"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>
    </el-header>

    <div class="app-main">
      <!-- 左：阶段 / 槽位 / 文件 树 -->
      <div class="app-sidebar">
        <StagePanel
          :selected-stage-id="selectedStageId"
          :selected-slot-id="selectedSlotId"
          @select-stage="onSelectStage"
          @select-slot="onSelectSlot"
        />
      </div>

      <!-- 右：槽位工作区 -->
      <div class="app-content">
        <el-empty
          v-if="!selectedSlot"
          description="请在左侧选择一个槽位，开始挂载模板 / 填写 / 上传文件"
        />
        <SlotWorkspace
          v-else
          :stage="selectedStage!"
          :slot="selectedSlot"
          @files-changed="onFilesChanged"
        />
      </div>
    </div>

    <!-- 导入文件库 -->
    <el-dialog v-model="importOpen" title="导入项目文件库" width="760px" top="8vh">
      <ImportPanel />
    </el-dialog>

    <!-- 检索 -->
    <el-dialog v-model="searchOpen" title="检索 · 条件筛选" width="820px" top="8vh">
      <SearchPanel @open-slot="onSearchOpenSlot" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, FolderOpened, Back, Briefcase, Download, Search } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../stores/app';
import { useProjectStore } from '../stores/project';
import StagePanel from './StagePanel.vue';
import SlotWorkspace from './SlotWorkspace.vue';
import ImportPanel from './ImportPanel.vue';
import SearchPanel from './SearchPanel.vue';
import { QUALIFIED_STATUSES } from '../../shared/types';

const app = useAppStore();
const projectStore = useProjectStore();
const { project, dirty } = storeToRefs(projectStore);

const selectedStageId = ref('');
const selectedSlotId = ref('');
const importOpen = ref(false);
const searchOpen = ref(false);

const selectedStage = computed(() => projectStore.stages.find((s) => s.id === selectedStageId.value) ?? null);
const selectedSlot = computed(() =>
  selectedSlotId.value ? projectStore.findSlot(selectedStageId.value, selectedSlotId.value) ?? null : null,
);

const progress = computed(() => projectStore.progress);

/** 未完成的"必填/应填"槽位数量（缺项提示） */
const missingCount = computed(() => {
  if (!project.value) return 0;
  let n = 0;
  for (const { slot } of projectStore.allSlots) {
    if (slot.necessity === 'optional') continue;
    const done = slot.files.some((f) => QUALIFIED_STATUSES.includes(f.status));
    if (!done) n++;
  }
  return n;
});

const saving = computed(() => dirty.value);

function onSelectStage(stageId: string) {
  selectedStageId.value = stageId;
  selectedSlotId.value = '';
}

function onSelectSlot(stageId: string, slotId: string) {
  selectedStageId.value = stageId;
  selectedSlotId.value = slotId;
}

function onSearchOpenSlot(stageId: string, slotId: string) {
  searchOpen.value = false;
  onSelectSlot(stageId, slotId);
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

function onFilesChanged() {
  // 进度为派生值，自动重算（无需额外动作）
}

onMounted(async () => {
  if (projectStore.stages.length) {
    selectedStageId.value = projectStore.stages[0]?.id ?? '';
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
.missing {
  width: 100%;
}
.prog {
  min-width: 320px;
}
</style>
