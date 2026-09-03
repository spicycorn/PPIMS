<template>
  <div class="tplmgr">
    <!-- 顶部操作栏 -->
    <div class="row-gap" style="margin-bottom: 12px">
      <el-button type="primary" :icon="Plus" @click="startCreate">新建模板</el-button>
      <el-button :icon="FolderOpened" @click="pickSaveFromProject" :disabled="!currentFolder">
        从当前项目另存
      </el-button>
      <div style="flex: 1" />
      <span class="muted">共 {{ templates.length }} 个模板（全局，所有项目可套用）</span>
    </div>

    <!-- 模板列表 -->
    <el-table v-if="templates.length" :data="templates" size="default">
      <el-table-column label="模板名称" min-width="160">
        <template #default="{ row }">
          <div style="font-weight: 600">{{ row.name }}</div>
          <div class="muted" style="font-size: 12px">{{ row.description || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="规模" width="120">
        <template #default="{ row }">
          {{ row.stages.length }} 阶段 · {{ countTemplateSlots(row) }} 槽位
        </template>
      </el-table-column>
      <el-table-column label="更新" width="160">
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="startEdit(row)">编辑</el-button>
          <el-button size="small" link @click="duplicate(row)">复制</el-button>
          <el-button size="small" link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="还没有模板。新建一个，或从当前项目另存，以后建项目可一键套用" :image-size="70" />

    <!-- 编辑器（新建 / 编辑） -->
    <el-dialog
      v-model="editorOpen"
      :title="editing ? `编辑模板 · ${draft.name}` : '新建模板'"
      width="820px"
      top="6vh"
      append-to-body
    >
      <el-form label-width="90px" @submit.prevent>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="模板名称" required>
              <el-input v-model="draft.name" placeholder="如：岩土勘察项目模板" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="说明">
              <el-input v-model="draft.description" placeholder="选填，描述适用场景" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="row-gap" style="margin: 8px 0 12px">
        <el-button size="small" :icon="Plus" @click="addStage">添加阶段</el-button>
        <span class="muted">每个阶段下可加多个槽位，槽位可挂模板文件（.docx/.xlsx）</span>
      </div>

      <div v-if="draft.stages.length === 0" class="muted" style="padding: 8px 0">
        还没有阶段。点"添加阶段"开始搭结构。
      </div>

      <el-card
        v-for="(stage, si) in draft.stages"
        :key="si"
        shadow="never"
        class="stage-card"
      >
        <template #header>
          <div class="row-gap">
            <el-tag size="small" type="info">阶段 {{ si + 1 }}</el-tag>
            <el-input
              v-model="stage.name"
              placeholder="阶段名称，如：项目策划"
              style="width: 220px"
              size="small"
            />
            <el-input v-model="stage.description" placeholder="说明（选填）" style="flex: 1" size="small" />
            <el-button size="small" link type="danger" @click="removeStage(si)">删除</el-button>
          </div>
        </template>

        <div v-if="stage.slots.length === 0" class="muted" style="padding: 4px 0 8px">
          该阶段还没有槽位。
        </div>

        <el-table :data="stage.slots" size="small" border>
          <el-table-column label="槽位名" min-width="130">
            <template #default="{ row }">
              <el-input v-model="row.name" placeholder="如：勘察大纲" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="格式" width="130">
            <template #default="{ row }">
              <el-select v-model="row.format" size="small">
                <el-option v-for="(lbl, key) in FORMAT_LABEL" :key="key" :label="lbl" :value="key" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="必要性" width="110">
            <template #default="{ row }">
              <el-select v-model="row.necessity" size="small">
                <el-option v-for="(lbl, key) in NECESSITY_LABEL" :key="key" :label="lbl" :value="key" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="需审查" width="80" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.reviewRequired" size="small" inline-prompt />
            </template>
          </el-table-column>
          <el-table-column label="模板文件" min-width="200">
            <template #default="{ row }">
              <div class="row-gap">
                <span v-if="row.templateFileName" class="mono" style="font-size: 12px">
                  📎 {{ row.templateFileName }}
                </span>
                <span v-else class="muted">未挂</span>
                <el-button size="small" link @click="attachFile(row)">
                  {{ row.templateFileName ? '更换' : '挂载' }}
                </el-button>
                <el-button
                  v-if="row.templateFileName"
                  size="small"
                  link
                  type="danger"
                  @click="clearSlotFile(row)"
                >
                  移除
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="" width="60">
            <template #default="{ $index }">
              <el-button size="small" link type="danger" @click="stage.slots.splice($index, 1)">删</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-button size="small" :icon="Plus" style="margin-top: 8px" @click="addSlot(stage)">
          添加槽位
        </el-button>
      </el-card>

      <template #footer>
        <div class="row-gap">
          <el-button @click="editorOpen = false">取消</el-button>
          <el-button type="primary" :loading="savingTpl" @click="saveEditor">
            {{ editing ? '保存修改' : '创建模板' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 从当前项目另存：命名对话框 -->
    <el-dialog v-model="saveDlgOpen" title="从当前项目另存为模板" width="480px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="模板名称">
          <el-input v-model="saveName" :placeholder="`模板_${defaultSaveName}`" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="saveDesc" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDlgOpen = false">取消</el-button>
        <el-button type="primary" :loading="savingTpl" @click="doSaveFromProject">另存为模板</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, FolderOpened } from '@element-plus/icons-vue';
import { useAppStore } from '../core/stores/app';
import type {
  FileFormat,
  Necessity,
  ProjectTemplate,
  TplCreateInput,
  TplSlotInput,
  TplStageInput,
} from '../core/types';
import { FORMAT_LABEL, NECESSITY_LABEL } from '../core/types';
import { countTemplateSlots } from '../core/template-mapping';
import { formatDateTime } from '../core/util';

const props = defineProps<{
  /** 当前项目文件夹（用于"从当前项目另存"）；空 = 不在项目内 */
  currentFolder?: string;
}>();

/** 模板发生增删改后通知外部（如项目列表刷新"套用模板"下拉） */
const emit = defineEmits<{ saved: [] }>();

const app = useAppStore();
const currentFolder = ref(props.currentFolder ?? '');

const templates = ref<ProjectTemplate[]>([]);
const savingTpl = ref(false);

/* ---------------- 编辑器状态 ---------------- */

interface DraftSlot extends TplSlotInput {
  templateFileName?: string;
}
interface DraftStage extends TplStageInput {
  // TplStageInput 已含 slots: TplSlotInput[]
}
interface Draft {
  name: string;
  description: string;
  stages: DraftStage[];
}

const editorOpen = ref(false);
const editing = ref<string | null>(null); // 模板 id，null=新建
const draft = reactive<Draft>({ name: '', description: '', stages: [] });

function blankDraft(): Draft {
  return { name: '', description: '', stages: [] };
}

function addStage() {
  draft.stages.push({ name: '', description: '', slots: [] });
}

function removeStage(i: number) {
  draft.stages.splice(i, 1);
}

function addSlot(stage: DraftStage) {
  stage.slots.push({
    name: '',
    format: 'docx',
    necessity: 'required',
    reviewRequired: true,
    templateFileSrc: '',
    templateFileName: '',
    keepTemplateFile: '',
  });
}

/** 挂载模板文件：选一个 .docx/.xlsx/.pdf 文件，记绝对路径（保存时由主进程拷入） */
async function attachFile(slot: DraftSlot) {
  const src = await window.api.openDialog({
    title: '选择模板文件',
    filters: [
      { name: 'Office 文档', extensions: ['docx', 'xlsx', 'pdf', 'doc', 'xls'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (typeof src !== 'string' || !src) return;
  slot.templateFileSrc = src;
  slot.templateFileName = src.split(/[\\/]/).pop() || src;
  slot.keepTemplateFile = ''; // 换了文件 → 不再保留旧文件
}

/** 移除槽位模板文件（清掉新文件/保留文件两种引用） */
function clearSlotFile(slot: DraftSlot) {
  slot.templateFileName = '';
  slot.templateFileSrc = '';
  slot.keepTemplateFile = '';
}

function startCreate() {
  editing.value = null;
  Object.assign(draft, blankDraft());
  editorOpen.value = true;
}

function startEdit(tpl: ProjectTemplate) {
  editing.value = tpl.id;
  // 还原为 draft（模板文件只保留名字，源路径用占位——编辑时若未更换则不重拷）
  Object.assign(draft, {
    name: tpl.name,
    description: tpl.description ?? '',
    stages: tpl.stages.map((st) => ({
      name: st.name,
      description: st.description,
      slots: st.slots.map((sl) => ({
        name: sl.name,
        format: sl.format,
        necessity: sl.necessity,
        reviewRequired: sl.reviewRequired,
        templateFileSrc: '',
        templateFileName: sl.templateFileName,
        // 保留原模板文件：记下 templates/ 下的相对路径，主进程见 keepTemplateFile 则不重拷
        keepTemplateFile: sl.templateFile || '',
      })),
    })),
  });
  editorOpen.value = true;
}

async function saveEditor() {
  if (!draft.name.trim()) {
    ElMessage.warning('请填写模板名称');
    return;
  }
  const input: TplCreateInput = {
    name: draft.name,
    description: draft.description,
    stages: draft.stages
      .filter((st) => st.name.trim())
      .map((st) => ({
        name: st.name,
        description: st.description,
        slots: st.slots
          .filter((sl) => sl.name.trim())
          .map((sl) => ({
            name: sl.name,
            format: sl.format as FileFormat,
            necessity: sl.necessity as Necessity,
            reviewRequired: sl.reviewRequired,
            templateFileSrc: sl.templateFileSrc || undefined,
            templateFileName: sl.templateFileName || undefined,
            keepTemplateFile: sl.keepTemplateFile || undefined,
          })),
      })),
  };
  savingTpl.value = true;
  try {
    if (editing.value) {
      await window.api.updateTemplate(editing.value, input);
      ElMessage.success('模板已更新');
    } else {
      await window.api.createTemplate(input);
      ElMessage.success('模板已创建');
    }
    editorOpen.value = false;
    await refresh();
    emit('saved');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    savingTpl.value = false;
  }
}

/* ---------------- 列表操作 ---------------- */

async function refresh() {
  templates.value = await window.api.listTemplates();
}

async function duplicate(tpl: ProjectTemplate) {
  savingTpl.value = true;
  try {
    await window.api.duplicateTemplate(tpl.id);
    ElMessage.success('已复制模板');
    await refresh();
    emit('saved');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    savingTpl.value = false;
  }
}

async function remove(tpl: ProjectTemplate) {
  try {
    await ElMessageBox.confirm(`确定删除模板「${tpl.name}」？该操作不可恢复。`, '删除模板', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await window.api.deleteTemplate(tpl.id);
    ElMessage.success('已删除');
    await refresh();
    emit('saved');
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

/* ---------------- 从当前项目另存 ---------------- */

const saveDlgOpen = ref(false);
const saveName = ref('');
const saveDesc = ref('');
const defaultSaveName = ref('项目');

async function pickSaveFromProject() {
  if (!currentFolder.value) {
    ElMessage.warning('请先打开一个项目，再"从当前项目另存"');
    return;
  }
  // 取当前项目名做默认模板名
  try {
    const { project } = await window.api.loadProject(currentFolder.value);
    defaultSaveName.value = project.info?.name ?? '项目';
    saveName.value = `模板_${defaultSaveName.value}`;
  } catch {
    saveName.value = '';
  }
  saveDesc.value = '';
  saveDlgOpen.value = true;
}

async function doSaveFromProject() {
  if (!currentFolder.value) return;
  savingTpl.value = true;
  try {
    await window.api.saveTemplateFromProject(
      currentFolder.value,
      saveName.value || undefined,
      saveDesc.value || undefined,
    );
    ElMessage.success('已另存为全局模板');
    saveDlgOpen.value = false;
    await refresh();
    emit('saved');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    savingTpl.value = false;
  }
}


onMounted(refresh);
void app;
</script>

<style scoped>
.tplmgr {
  padding: 4px;
}
.stage-card {
  margin-bottom: 12px;
  border: 1px solid #ebeef5;
}
</style>
