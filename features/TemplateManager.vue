<template>
  <div class="tplmgr">
    <!-- 顶部操作栏 -->
    <div class="row-gap" style="margin-bottom: 12px">
      <el-button type="primary" :icon="Plus" @click="startCreate">新建结构模板</el-button>
      <el-button :icon="FolderOpened" @click="pickSaveFromProject" :disabled="!currentFolder">
        从当前项目另存
      </el-button>
      <div style="flex: 1" />
      <span class="muted">共 {{ templates.length }} 个结构模板（全局，所有项目可套用）</span>
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
          {{ countTemplateSlots(row) }} 个插槽
        </template>
      </el-table-column>
      <el-table-column label="更新" width="160">
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="startEdit(row)">编辑</el-button>
          <el-button size="small" link @click="duplicate(row)">复制</el-button>
          <el-button size="small" link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="还没有结构模板。新建一个，或从当前项目另存，以后建项目可一键套用结构" :image-size="70" />

    <!-- 结构编辑器（新建 / 编辑） -->
    <el-dialog
      v-model="editorOpen"
      :title="editing ? `编辑结构模板 · ${draft.name}` : '新建结构模板'"
      width="760px"
      top="6vh"
      append-to-body
    >
      <el-form label-width="90px" @submit.prevent>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="模板名称" required>
              <el-input v-model="draft.name" placeholder="如：岩土勘察项目结构" />
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
        <el-button size="small" :icon="Plus" @click="draft.slots.push({ name: '', subSlots: [] })">添加插槽</el-button>
        <span class="muted">插槽可嵌套（顶层插槽 = 阶段），搭出"阶段 + 插槽"树</span>
      </div>

      <div v-if="draft.slots.length === 0" class="muted" style="padding: 8px 0">
        还没有插槽。点"添加插槽"开始搭结构。
      </div>

      <slot-structure-editor :nodes="draft.slots" />

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
    <el-dialog v-model="saveDlgOpen" title="从当前项目另存为结构模板" width="480px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="模板名称">
          <el-input v-model="saveName" :placeholder="`结构_${defaultSaveName}`" />
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
import type { StructureTemplate, TplCreateInput, TplSlotInput } from '../core/types';
import { countTemplateSlots } from '../core/template-mapping';
import { formatDateTime } from '../core/util';
import SlotStructureEditor from './SlotStructureEditor.vue';

const props = defineProps<{ currentFolder?: string }>();
const emit = defineEmits<{ saved: [] }>();
const currentFolder = ref(props.currentFolder ?? '');

const templates = ref<StructureTemplate[]>([]);
const savingTpl = ref(false);

interface Draft {
  name: string;
  description: string;
  slots: TplSlotInput[];
}
const editorOpen = ref(false);
const editing = ref<string | null>(null);
const draft = reactive<Draft>({ name: '', description: '', slots: [] });

function startCreate() {
  editing.value = null;
  draft.name = '';
  draft.description = '';
  draft.slots = [];
  editorOpen.value = true;
}

function startEdit(tpl: StructureTemplate) {
  editing.value = tpl.id;
  draft.name = tpl.name;
  draft.description = tpl.description ?? '';
  draft.slots = tpl.structure.map((s) => ({
    name: s.name,
    subSlots: s.subSlots.map((sub) => ({ name: sub.name, subSlots: [] })),
  }));
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
    slots: draft.slots.filter((s) => s.name.trim()),
  };
  savingTpl.value = true;
  try {
    if (editing.value) {
      await window.api.updateTemplate(editing.value, input);
      ElMessage.success('结构模板已更新');
    } else {
      await window.api.createTemplate(input);
      ElMessage.success('结构模板已创建');
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

async function refresh() {
  templates.value = await window.api.listTemplates();
}

async function duplicate(tpl: StructureTemplate) {
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

async function remove(tpl: StructureTemplate) {
  try {
    await ElMessageBox.confirm(`确定删除结构模板「${tpl.name}」？该操作不可恢复。`, '删除模板', {
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

const saveDlgOpen = ref(false);
const saveName = ref('');
const saveDesc = ref('');
const defaultSaveName = ref('项目');

async function pickSaveFromProject() {
  if (!currentFolder.value) {
    ElMessage.warning('请先打开一个项目，再"从当前项目另存"');
    return;
  }
  try {
    const { project } = await window.api.loadProject(currentFolder.value);
    defaultSaveName.value = project.info?.name ?? '项目';
    saveName.value = `结构_${defaultSaveName.value}`;
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
    ElMessage.success('已另存为全局结构模板');
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
</script>

<style scoped>
.tplmgr {
  padding: 4px;
}
</style>
