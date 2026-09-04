<template>
  <div class="plist">
    <el-row :gutter="12">
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="row-gap">
              <el-icon><List /></el-icon>
              <span>项目列表</span>
              <el-tag size="small" type="info">{{ visibleItems.length }} 个</el-tag>
              <div style="flex: 1"></div>
              <el-button size="small" :icon="Operation" @click="dimOpen = true">分类维度</el-button>
              <el-button size="small" :icon="Refresh" @click="refresh">刷新</el-button>
            </div>
            <!-- 分组 / 筛选 / 排序（2.9 视图层） -->
            <div class="row-gap view-bar" v-if="app.dimensions.length">
              <span class="muted">视图</span>
              <el-select v-model="groupDim" size="small" style="width: 150px" clearable placeholder="不分组">
                <el-option v-for="d in app.dimensions" :key="d.id" :label="`按「${d.name}」分组`" :value="d.id" />
              </el-select>
              <el-select
                v-if="groupDim"
                v-model="filterValue"
                size="small"
                style="width: 150px"
                clearable
                placeholder="全部取值"
              >
                <el-option v-for="v in distinctVals" :key="v" :label="v" :value="v" />
              </el-select>
              <el-select v-model="sortMode" size="small" style="width: 130px">
                <el-option label="按名称" value="name" />
                <el-option label="按立项时间" value="date" />
                <el-option v-if="groupDim" label="按取值" value="value" />
              </el-select>
            </div>
          </template>

          <el-empty v-if="groups.length === 0" description="该根目录下还没有项目，请新建一个" :image-size="80" />

          <template v-for="g in groups" :key="g.key">
            <div v-if="groupDim" class="group-head">
              <el-icon><Collection /></el-icon>
              <span class="group-label">{{ g.label }}</span>
              <el-tag size="small">{{ g.items.length }} 个</el-tag>
            </div>
            <el-table :data="g.items" size="default" @row-click="onRowClick" class="clickable">
              <el-table-column prop="info.name" label="项目名称" min-width="130">
                <template #default="{ row }">{{ row.info?.name ?? '（未命名）' }}</template>
              </el-table-column>
              <el-table-column prop="info.code" label="项目编号" width="110">
                <template #default="{ row }">{{ row.info?.code ?? '—' }}</template>
              </el-table-column>
              <!-- 分类取值列（按当前维度动态显示） -->
              <el-table-column v-if="groupDim" :label="groupDimName" width="110">
                <template #default="{ row }">{{ row.info?.categories?.[groupDim] || '—' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" link type="primary" @click.stop="open(row)">打开</el-button>
                  <el-button size="small" link :icon="Operation" @click.stop="editCats(row)" title="编辑分类" />
                </template>
              </el-table-column>
            </el-table>
          </template>

          <div class="rootbar mono">{{ rootDir }}</div>
        </el-card>
      </el-col>

      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="row-gap">
              <el-icon><Plus /></el-icon>
              <span>新建项目</span>
            </div>
          </template>
          <el-form :model="form" label-width="90px" :rules="rules" ref="formRef">
            <!-- ① 提示选模板（建项第一步） -->
            <el-divider content-position="left">① 套用结构模板（可选，一键生成"阶段 + 插槽"树）</el-divider>
            <el-form-item label="套用模板">
              <el-select v-model="selectedTemplateId" clearable placeholder="结构模板（默认套用「岩土勘察项目（标准）」；清空则建空项目）" style="width: 100%">
                <el-option v-for="t in templateList" :key="t.id" :label="t.name" :value="t.id">
                  <span>{{ t.name }}</span>
                  <span class="muted" style="float: right; font-size: 12px">{{ countTemplateSlots(t) }} 个插槽</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item v-if="selectedTemplateId">
              <el-alert
                :title="`将套用「${selectedTemplateName}」的结构（阶段 + 插槽树），创建后无需再逐一手填插槽`"
                type="success"
                :closable="false"
                show-icon
              />
            </el-form-item>

            <!-- ② 项目信息（地区/名称/阶段/类型/编号/下发时间/备注） -->
            <el-divider content-position="left">② 项目信息</el-divider>
            <el-form-item label="地区" prop="region">
              <el-input v-model="form.region" placeholder="项目所在地区" />
            </el-form-item>
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" placeholder="如：XX 河道治理工程勘察" />
            </el-form-item>
            <el-form-item label="阶段">
              <el-input v-model="form.stage" placeholder="初始阶段（选填）" />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="form.type" clearable filterable allow-create placeholder="选填（如 勘测/设计/施工…）">
                <el-option label="勘测" value="勘测" />
                <el-option label="设计" value="设计" />
                <el-option label="施工" value="施工" />
                <el-option label="岩土" value="岩土" />
                <el-option label="测绘" value="测绘" />
                <el-option label="水文" value="水文" />
                <el-option label="物探" value="物探" />
              </el-select>
            </el-form-item>
            <el-form-item label="编号" prop="code">
              <el-input v-model="form.code" placeholder="如：60-F14742S" />
            </el-form-item>
            <el-form-item label="下发时间">
              <el-date-picker v-model="form.dispatchDate" type="date" value-format="YYYY-MM-DD" placeholder="选填" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" />
            </el-form-item>

            <!-- 分类取值（动态：按当前维度渲染，2.9） -->
            <template v-if="app.dimensions.length">
              <el-divider content-position="left">分类（可选）</el-divider>
              <el-form-item v-for="d in app.dimensions" :key="d.id" :label="d.name">
                <el-input v-model="categoryValues[d.id]" :placeholder="`如：${d.name === '地区' ? '华北 / 华南…' : '填一个取值，如 岩土 / 客户A'}`" />
              </el-form-item>
            </template>

            <el-form-item>
              <el-button type="primary" :loading="creating" @click="create">
                {{ selectedTemplateId ? '按结构模板创建项目' : '创建项目' }}
              </el-button>
              <el-button :icon="Collection" @click="tplOpen = true">结构模板库</el-button>
              <span class="muted">{{ selectedTemplateId ? '套用所选结构模板' : '不选模板则建空项目' }}（插槽可增删/改名/调序/嵌套）</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- 分类维度管理（2.9：用户自定义、可扩展多维） -->
    <el-dialog v-model="dimOpen" title="分类维度（自定义、可扩展）" width="520px" destroy-on-close>
      <p class="muted" style="margin-bottom: 10px">
        维度是项目的<strong>分类字段</strong>（如"地区""专业""客户"），只用于列表<strong>分组/筛选/排序</strong>，
        不改变项目文件夹的存放方式（仍自包含、可整体搬移）。系统不预置业务维度，由你按需定义。
      </p>
      <el-empty v-if="app.dimensions.length === 0" description="还没有维度。加一个，比如「地区」" :image-size="60" />
      <div v-for="d in app.dimensions" :key="d.id" class="row-gap dim-row">
        <el-tag size="default">{{ d.name }}</el-tag>
        <div style="flex: 1" />
        <el-button size="small" link :icon="Edit" @click="renameDim(d)">改名</el-button>
        <el-button size="small" link type="danger" :icon="Delete" @click="removeDim(d)">删除</el-button>
      </div>
      <el-divider />
      <div class="row-gap">
        <el-input v-model="newDimName" placeholder="新维度名，如：地区 / 专业 / 客户 / 年份" style="flex: 1" @keyup.enter="addDim" />
        <el-button type="primary" :icon="Plus" @click="addDim">添加维度</el-button>
      </div>
    </el-dialog>

    <!-- 编辑某项目分类取值 -->
    <el-dialog v-model="catOpen" title="编辑分类取值" width="440px" destroy-on-close>
      <div v-for="d in app.dimensions" :key="d.id" class="row-gap cat-row">
        <span class="cat-dim">{{ d.name }}</span>
        <el-input v-model="catDraft[d.id]" :placeholder="`填写「${d.name}」取值`" />
      </div>
      <template #footer>
        <el-button @click="catOpen = false">取消</el-button>
        <el-button type="primary" @click="applyCats">保存</el-button>
      </template>
    </el-dialog>

    <!-- 结构模板库（全局；列表页无当前项目，"从当前项目另存"不可用） -->
    <el-dialog v-model="tplOpen" title="结构模板库" width="900px" top="6vh" destroy-on-close>
      <TemplateManager @saved="loadTemplates" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Refresh, Plus, List, Collection, Operation, Edit, Delete } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../core/stores/app';
import { useProjectStore, createDefaultProject } from '../core/stores/project';
import TemplateManager from './TemplateManager.vue';
import type { ProjectInfo, StructureTemplate, CategoryDimension, CategoryValues } from '../core/types';
import { countTemplateSlots } from '../core/template-mapping';
import { distinctValues } from '../core/classify';

const app = useAppStore();
const projectStore = useProjectStore();
const { rootDir } = storeToRefs(app);

const items = ref<Array<{ name: string; folder: string; info: ProjectInfo | null }>>([]);
const creating = ref(false);
const formRef = ref<FormInstance>();

// 结构模板（全局蓝图）
const templateList = ref<StructureTemplate[]>([]);
const selectedTemplateId = ref('');
const tplOpen = ref(false);
const selectedTemplateName = computed(
  () => templateList.value.find((t) => t.id === selectedTemplateId.value)?.name ?? '',
);

/* ---------------- 视图：分组 / 筛选 / 排序（2.9） ---------------- */
const groupDim = ref(''); // '' = 不分组
const filterValue = ref('');
const sortMode = ref<'name' | 'date' | 'value'>('name');

const groupDimName = computed(() => app.dimensions.find((d) => d.id === groupDim.value)?.name ?? '');
const distinctVals = computed(() =>
  groupDim.value ? distinctValues(items.value, groupDim.value) : [],
);

interface ProjectGroup {
  key: string;
  label: string;
  items: typeof items.value[number][];
}

const visibleItems = computed(() => {
  let list = [...items.value];
  if (groupDim.value && filterValue.value) {
    list = list.filter((p) => (p.info?.categories?.[groupDim.value] || '').trim() === filterValue.value);
  }
  type Item = { name: string; folder: string; info: ProjectInfo | null };
  const byName = (a: Item, b: Item) =>
    (a.info?.name ?? '').localeCompare(b.info?.name ?? '', 'zh-CN');
  if (sortMode.value === 'date') {
    list.sort((a, b) => (b?.info?.dispatchDate ?? '').localeCompare(a?.info?.dispatchDate ?? ''));
  } else if (sortMode.value === 'value' && groupDim.value) {
    list.sort((a, b) =>
      (a?.info?.categories?.[groupDim.value] ?? '').localeCompare(b?.info?.categories?.[groupDim.value] ?? '', 'zh-CN'),
    );
  } else {
    list.sort((a, b) => byName(a, b));
  }
  return list;
});

const groups = computed<ProjectGroup[]>(() => {
  if (!groupDim.value) {
    return visibleItems.value.length ? [{ key: 'all', label: '全部', items: visibleItems.value }] : [];
  }
  const map = new Map<string, ProjectGroup>();
  for (const p of visibleItems.value) {
    const v = (p.info?.categories?.[groupDim.value] || '').trim();
    const key = v || '__none__';
    if (!map.has(key)) map.set(key, { key, label: v || '（未分类）', items: [] });
    map.get(key)!.items.push(p);
  }
  const arr = [...map.values()];
  // "（未分类）"放最后
  arr.sort((a, b) => (a.key === '__none__' ? 1 : 0) - (b.key === '__none__' ? 1 : 0) || a.label.localeCompare(b.label, 'zh-CN'));
  return arr;
});

/* ---------------- 分类取值（新建表单） ---------------- */
const categoryValues = reactive<CategoryValues>({});

async function loadTemplates() {
  try {
    templateList.value = await window.api.listTemplates();
    // 默认选中预置模板（软件自带一套，开箱即用；建项默认套用）
    if (!selectedTemplateId.value && templateList.value.length) {
      const preset = templateList.value.find((t) => t.name === '岩土勘察项目（标准）') ?? templateList.value[0];
      selectedTemplateId.value = preset.id;
    }
  } catch {
    templateList.value = [];
  }
}

const form = reactive<ProjectInfo>({
  name: '',
  code: '',
  region: '',
  stage: '',
  type: '',
  dispatchDate: '',
  remark: '',
});

const rules: FormRules = {
  name: [{ required: true, message: '请填写项目名称', trigger: 'blur' }],
  code: [{ required: true, message: '请填写项目编号', trigger: 'change' }],
};

async function refresh() {
  if (!rootDir.value) return;
  items.value = await window.api.listProjects(rootDir.value);
}

async function create() {
  await formRef.value?.validate();
  creating.value = true;
  try {
    // 收集非空分类取值
    const cats: CategoryValues = {};
    for (const d of app.dimensions) {
      const v = (categoryValues[d.id] ?? '').trim();
      if (v) cats[d.id] = v;
    }
    const info: ProjectInfo = { ...form, categories: Object.keys(cats).length ? cats : undefined };
    let folder: string;
    if (selectedTemplateId.value) {
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
    // 重置表单与分类取值
    Object.assign(form, { name: '', code: '', region: '', stage: '', type: '', dispatchDate: '', remark: '' });
    selectedTemplateId.value = '';
    for (const k of Object.keys(categoryValues)) delete categoryValues[k];
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

/* ---------------- 维度管理（2.9） ---------------- */
const dimOpen = ref(false);
const newDimName = ref('');

function addDim() {
  app.addDimension(newDimName.value);
  newDimName.value = '';
}
async function renameDim(d: CategoryDimension) {
  try {
    const { value } = await ElMessageBox.prompt('维度名', '改名维度', {
      inputValue: d.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
    if (value?.trim()) app.renameDimension(d.id, value.trim());
  } catch {
    /* 取消 */
  }
}
async function removeDim(d: CategoryDimension) {
  try {
    await ElMessageBox.confirm(
      `删除维度「${d.name}」？各项目已填的该维度取值将不再参与分组（数据不删除，下次保存该项目时惰性清理）。`,
      '删除维度',
      { type: 'warning' },
    );
    app.removeDimension(d.id);
  } catch {
    /* 取消 */
  }
}

/* ---------------- 编辑某项目分类取值 ---------------- */
const catOpen = ref(false);
const catDraft = reactive<CategoryValues>({});
let catTarget: { folder: string } | null = null;

function editCats(row: { folder: string; info: ProjectInfo | null }) {
  catTarget = row;
  for (const d of app.dimensions) {
    catDraft[d.id] = row.info?.categories?.[d.id] ?? '';
  }
  catOpen.value = true;
}
async function applyCats() {
  if (!catTarget) return;
  const cats: CategoryValues = {};
  for (const d of app.dimensions) {
    const v = (catDraft[d.id] ?? '').trim();
    if (v) cats[d.id] = v;
  }
  try {
    await window.api.patchProjectInfo(catTarget.folder, { categories: Object.keys(cats).length ? cats : {} });
    ElMessage.success('分类已保存');
    catOpen.value = false;
    await refresh();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

onMounted(async () => {
  await app.loadDimensions();
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
.view-bar {
  margin-top: 8px;
  border-top: 1px solid #f0f2f5;
  padding-top: 8px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 6px;
  font-weight: 600;
}
.group-head:first-child {
  margin-top: 0;
}
.group-label {
  font-size: 14px;
}
.dim-row {
  margin-bottom: 6px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.cat-dim {
  min-width: 70px;
  font-weight: 600;
}
</style>
