<template>
  <div class="te">
    <!-- ① 挂载模板 -->
    <div class="card-block">
      <div class="row-gap">
        <el-icon><Upload /></el-icon>
        <strong>模板文件（该槽位资料的"骨架"）</strong>
        <div style="flex: 1"></div>
        <el-button v-if="!slot.templateId" type="primary" :icon="Upload" @click="mountTemplate">选择模板文件</el-button>
        <el-button v-else :icon="Upload" @click="mountTemplate">更换模板</el-button>
        <el-button v-if="template" :icon="Refresh" :loading="recognizing" @click="recognize">重新识别</el-button>
      </div>
      <div v-if="template" class="tmpl-info mono">
        已挂载：{{ template.name }}
        <el-tag size="small">{{ template.format }}</el-tag>
        <span class="muted">{{ template.path }}</span>
      </div>
      <div v-else class="muted" style="margin-top: 8px">
        尚未挂载模板。选择 .docx / .xlsx 后，系统自动识别章节 / 字段 / 表格，渲染为可编辑表单。
      </div>
    </div>

    <!-- ② 结构识别 + ③ 可编辑表单 -->
    <div v-if="template" class="card-block">
      <div class="row-gap" style="margin-bottom: 10px">
        <el-icon><Edit /></el-icon>
        <strong>可编辑表单（所有文字均可改，格式保真）</strong>
        <el-tag v-if="stats.total > 0" size="small" type="info">共 {{ stats.total }} 段</el-tag>
        <el-tag v-if="stats.changed > 0" size="small" type="warning">已改 {{ stats.changed }}</el-tag>
      </div>

      <el-alert
        v-if="!fields.length"
        title="未识别到可编辑文本，请确认模板为有效 Word/Excel 文档"
        type="info"
        :closable="false"
        show-icon
      />

      <div v-else class="fields">
        <div v-for="(f, i) in fields" :key="f.id" class="field-row" :class="{ heading: f.isHeading }">
          <div class="field-label">
            <el-tag v-if="f.isHeading" size="small" type="primary">标题</el-tag>
            <el-tag v-else-if="f.inTable" size="small" type="warning">表格</el-tag>
            <el-tag v-else size="small">正文</el-tag>
            <span class="muted">{{ i + 1 }}</span>
          </div>
          <el-input
            v-model="f.value"
            :type="f.value.length > 60 ? 'textarea' : 'text'"
            :autosize="{ minRows: 1, maxRows: 4 }"
            :placeholder="f.originalText"
            size="default"
          />
        </div>
      </div>

      <!-- ④ 保存为文件实例 -->
      <div class="row-gap" style="margin-top: 14px">
        <el-button type="primary" :loading="saving" @click="saveInstance">
          <el-icon style="margin-right: 4px"><DocumentAdd /></el-icon>
          生成文件实例（原位替换，格式零改动）
        </el-button>
        <span class="muted">保存到槽位目录，自动计入版本与进度</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Refresh, Edit, DocumentAdd } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../stores/app';
import { useProjectStore } from '../stores/project';
import type { Slot, Stage, Template } from '../../shared/types';
import { slotDir } from '../../shared/paths';

const props = defineProps<{ stage: Stage; slot: Slot }>();
const app = useAppStore();
const store = useProjectStore();
const { project } = storeToRefs(store);

const recognizing = ref(false);
const saving = ref(false);

const template = computed<Template | null>(() =>
  props.slot.templateId
    ? project.value?.templates.find((t: Template) => t.id === props.slot.templateId) ?? null
    : null,
);

interface EditableField {
  id: string;
  isHeading: boolean;
  inTable: boolean;
  originalText: string;
  value: string;
}
const fields = reactive<EditableField[]>([]);

const stats = computed(() => ({
  total: fields.length,
  changed: fields.filter((f) => f.value !== f.originalText).length,
}));

// 槽位切换时重置
watch(
  () => props.slot.id,
  () => {
    fields.splice(0, fields.length);
  },
);

function templateAbsPath(): string | null {
  if (!template.value || !app.currentProjectFolder) return null;
  return `${app.currentProjectFolder}/${template.value.path}`;
}

/* ---------- ① 挂载模板 ---------- */
async function mountTemplate() {
  const res = await window.api.openDialog({
    title: '选择模板文件（.docx / .xlsx）',
    filters: [
      { name: 'Word/Excel 模板', extensions: ['docx', 'xlsx', 'doc', 'xls'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (!res) return;
  const src = res as string;
  const baseName = src.split(/[\\/]/).pop() || '模板';
  if (!app.currentProjectFolder) {
    ElMessage.error('尚未打开项目');
    return;
  }
  // 直接复制"已选定"文件到项目 templates/（不弹第二个对话框）
  const copied = await window.api.copyFile(src, app.currentProjectFolder, 'templates', baseName);
  const format = /\.xlsx$/i.test(baseName) ? 'xlsx' : /\.docx$/i.test(baseName) ? 'docx' : 'other';
  const tmpl = store.addTemplate({
    name: baseName,
    format,
    path: copied.relativePath,
  });
  store.updateSlot(props.stage.id, props.slot.id, { templateId: tmpl.id });
  await store.persist();
  ElMessage.success(`模板已挂载：${baseName}`);
  await recognize();
}

/* ---------- ② 识别结构 ---------- */
async function recognize() {
  if (!template.value) return;
  const abs = templateAbsPath();
  if (!abs) return;
  recognizing.value = true;
  fields.splice(0, fields.length);
  try {
    if (template.value.format === 'xlsx') {
      const model = await window.api.recognizeXlsx(abs);
      store.updateTemplate(template.value.id, { activeSheet: model.active });
      for (const c of model.cells) {
        fields.push({
          id: c.addr,
          isHeading: false,
          inTable: true,
          originalText: c.value,
          value: c.value,
        });
      }
    } else {
      const model = await window.api.recognizeDocx(abs);
      for (const p of model.paragraphs) {
        if (!p.text.trim()) continue;
        fields.push({
          id: `p${p.index}`,
          isHeading: p.isHeading,
          inTable: p.inTable,
          originalText: p.text,
          value: p.text,
        });
      }
    }
  } catch (e) {
    ElMessage.error(`识别失败：${(e as Error).message}`);
  } finally {
    recognizing.value = false;
  }
}

/* ---------- ④ 保存为文件实例 ---------- */
async function saveInstance() {
  if (!template.value) return;
  const abs = templateAbsPath();
  if (!abs) return;
  saving.value = true;
  try {
    const changed = fields.filter((f) => f.value !== f.originalText && f.originalText);
    // 填写结果写入槽位目录（不覆盖模板骨架）
    const stageOrder = store.stages.findIndex((s) => s.id === props.stage.id);
    const dir = slotDir(stageOrder, props.stage.info.name, props.slot.name);
    const baseName = template.value.name.replace(/\.\w+$/, '');
    const ext = template.value.format === 'xlsx' ? 'xlsx' : 'docx';
    const destRelFinal = `${dir}/${baseName}.${ext}`;
    const destAbs = `${app.currentProjectFolder}/${destRelFinal}`;
    let applied = 0;
    if (changed.length > 0) {
      if (template.value.format === 'xlsx') {
        const edits = changed.map((f) => ({ addr: f.id, value: f.value }));
        const res = await window.api.applyXlsx(abs, template.value.activeSheet || '', edits, destAbs);
        applied = res.applied;
      } else {
        const replacements = changed.map((f) => ({ oldText: f.originalText, newText: f.value }));
        const res = await window.api.applyDocx(abs, replacements, destAbs);
        applied = res.applied;
        if (res.missed.length) {
          ElMessage.warning(`有 ${res.missed.length} 处未精确命中（可能被拆分），请核对导出结果`);
        }
      }
    } else {
      // 无修改：直接把模板复制为文件实例（保底）
      await window.api.copyFile(abs, app.currentProjectFolder, dir, `${baseName}.${ext}`);
    }
    // 生成文件实例记录（相对路径）
    store.addFile(props.stage.id, props.slot.id, {
      name: baseName,
      format: template.value.format,
      status: 'drafting',
      path: destRelFinal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.persist();
    ElMessage.success(`已生成文件实例（写入 ${applied} 处修改），版本已累加`);
  } catch (e) {
    ElMessage.error(`生成失败：${(e as Error).message}`);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.fields {
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
}
.field-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 4px;
  border-bottom: 1px solid #f5f7fa;
}
.field-row:last-child {
  border-bottom: none;
}
.field-row.heading .el-input {
  font-weight: 600;
}
.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 70px;
  flex-shrink: 0;
}
.tmpl-info {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
