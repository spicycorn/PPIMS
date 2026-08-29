<template>
  <div class="plist">
    <el-row :gutter="12">
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="row-gap">
              <el-icon><List /></el-icon>
              <span>项目列表</span>
              <el-tag size="small" type="info">{{ items.length }} 个</el-tag>
              <div style="flex: 1"></div>
              <el-button size="small" :icon="Refresh" @click="refresh">刷新</el-button>
            </div>
          </template>
          <el-empty v-if="items.length === 0" description="该根目录下还没有项目，请新建一个" :image-size="80" />
          <el-table v-else :data="items" size="default" @row-click="onRowClick" class="clickable">
            <el-table-column prop="info.name" label="项目名称" min-width="140">
              <template #default="{ row }">{{ row.info?.name ?? '（未命名）' }}</template>
            </el-table-column>
            <el-table-column prop="info.code" label="项目编号" width="130">
              <template #default="{ row }">{{ row.info?.code ?? '—' }}</template>
            </el-table-column>
            <el-table-column prop="info.establishDate" label="立项时间" width="120">
              <template #default="{ row }">{{ row.info?.establishDate ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button size="small" link type="primary" @click.stop="open(row)">打开</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="rootbar mono">{{ rootDir }}</div>
        </el-card>
      </el-col>

      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="row-gap">
              <el-icon><Plus /></el-icon>
              <span>新建项目（项目信息，建项时填写）</span>
            </div>
          </template>
          <el-form :model="form" label-width="90px" :rules="rules" ref="formRef">
            <el-form-item label="项目名称" prop="name">
              <el-input v-model="form.name" placeholder="如：XX 河道治理工程勘察" />
            </el-form-item>
            <el-form-item label="项目编号" prop="code">
              <el-input v-model="form.code" placeholder="如：60-F14742S" />
            </el-form-item>
            <el-form-item label="立项时间" prop="establishDate">
              <el-date-picker v-model="form.establishDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
            </el-form-item>
            <el-form-item label="专业">
              <el-select v-model="form.specialty" clearable placeholder="选填">
                <el-option label="岩土" value="岩土" />
                <el-option label="测绘" value="测绘" />
                <el-option label="水文" value="水文" />
                <el-option label="物探" value="物探" />
              </el-select>
            </el-form-item>
            <el-form-item label="工程地点">
              <el-input v-model="form.location" placeholder="选填" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" />
            </el-form-item>

            <el-divider content-position="left">从模板创建（选填）</el-divider>
            <el-form-item label="套用模板">
              <el-select v-model="selectedTemplateId" clearable placeholder="选一个模板，一键生成阶段/槽位/模板文件" style="width: 100%">
                <el-option v-for="t in templateList" :key="t.id" :label="t.name" :value="t.id">
                  <span>{{ t.name }}</span>
                  <span class="muted" style="float: right; font-size: 12px">{{ t.stages.length }} 阶段 · {{ slotCount(t) }} 槽位</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item v-if="selectedTemplateId">
              <el-alert
                :title="`将套用「${selectedTemplateName}」的完整结构（阶段+槽位+各槽位模板文件），创建后无需再逐一手填槽位`"
                type="success"
                :closable="false"
                show-icon
              />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="creating" @click="create">
                {{ selectedTemplateId ? '按模板创建项目' : '创建项目' }}
              </el-button>
              <el-button :icon="Collection" @click="tplOpen = true">模板库</el-button>
              <span class="muted">{{ selectedTemplateId ? '套用所选模板结构' : '不选模板则预置 5 个阶段' }}（可增删/改名/调序）</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- 模板库（全局；列表页无当前项目，"从当前项目另存"不可用） -->
    <el-dialog v-model="tplOpen" title="模板库" width="900px" top="6vh" destroy-on-close>
      <TemplateManager @saved="loadTemplates" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Refresh, Plus, List, Collection } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../stores/app';
import { useProjectStore, createDefaultProject } from '../stores/project';
import TemplateManager from './TemplateManager.vue';
import type { ProjectInfo, ProjectTemplate } from '../../shared/types';

const app = useAppStore();
const projectStore = useProjectStore();
const { rootDir } = storeToRefs(app);

const items = ref<Array<{ name: string; folder: string; info: ProjectInfo | null }>>([]);
const creating = ref(false);
const formRef = ref<FormInstance>();

// 模板（全局蓝图）
const templateList = ref<ProjectTemplate[]>([]);
const selectedTemplateId = ref('');
const tplOpen = ref(false);
const selectedTemplateName = computed(
  () => templateList.value.find((t) => t.id === selectedTemplateId.value)?.name ?? '',
);

function slotCount(t: ProjectTemplate): number {
  return t.stages.reduce((n, st) => n + st.slots.length, 0);
}

async function loadTemplates() {
  try {
    templateList.value = await window.api.listTemplates();
  } catch {
    templateList.value = [];
  }
}
const form = reactive<ProjectInfo>({
  name: '',
  code: '',
  establishDate: new Date().toISOString().slice(0, 10),
  specialty: '',
  location: '',
  remark: '',
});

const rules: FormRules = {
  name: [{ required: true, message: '请填写项目名称', trigger: 'blur' }],
  code: [{ required: true, message: '请填写项目编号', trigger: 'blur' }],
  establishDate: [{ required: true, message: '请选择立项时间', trigger: 'change' }],
};

async function refresh() {
  if (!rootDir.value) return;
  items.value = await window.api.listProjects(rootDir.value);
}

async function create() {
  await formRef.value?.validate();
  creating.value = true;
  try {
    const info = { ...form };
    let folder: string;
    if (selectedTemplateId.value) {
      // 从全局模板生成完整结构（阶段+槽位+模板文件副本）
      const shell = createDefaultProject(info);
      const res = await window.api.applyTemplate(rootDir.value, shell, selectedTemplateId.value);
      folder = res.folder;
      ElMessage.success(`已按模板「${selectedTemplateName.value}」创建项目：${info.name}`);
    } else {
      const project = createDefaultProject(info);
      const res = await window.api.createProject(rootDir.value, project);
      folder = res.folder;
      ElMessage.success(`项目已创建：${info.name}`);
    }
    await app.openProject(folder);
    await projectStore.load(folder);
    await refresh();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    creating.value = false;
  }
}

async function open(row: { folder: string }) {
  await app.openProject(row.folder);
  try {
    await projectStore.load(row.folder);
  } catch (e) {
    ElMessage.error(`加载失败：${(e as Error).message}`);
  }
}

function onRowClick(row: { folder: string }) {
  void open(row);
}

onMounted(() => {
  void refresh();
  void loadTemplates();
});
</script>

<style scoped>
.plist {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}
.rootbar {
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}
</style>
