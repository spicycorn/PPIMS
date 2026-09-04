<template>
  <div class="fe">
    <div v-if="loading" class="muted" style="padding: 20px">正在识别文件内容…</div>

    <!-- 表格编辑（csv / xlsx 系） -->
    <template v-else-if="engine === 'sheet'">
      <el-table :data="gridRows" size="small" border style="max-height: 560px; overflow: auto">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column v-for="c in colIndices" :key="c" :label="colLabel(c)">
          <template #default="{ row }">
            <el-input
              v-model="row.cells[c]"
              size="small"
              placeholder=" "
              @input="markDirty"
            />
          </template>
        </el-table-column>
      </el-table>
      <div class="muted" style="margin-top: 8px">共 {{ gridRows.length }} 行 × {{ maxCol }} 列。直接编辑单元格，保存即原位写回。</div>
    </template>

    <!-- 文档编辑（docx 系） -->
    <template v-else-if="engine === 'docx'">
      <div class="docx-edit" style="max-height: 560px; overflow: auto; padding: 8px; background: #fff; border: 1px solid #e4e7ed">
        <div v-for="p in paragraphs" :key="p.index" class="docx-p" :class="{ heading: p.isHeading }">
          <textarea
            v-model="p.text"
            rows="1"
            class="docx-ta"
            @input="markDirty"
          />
        </div>
      </div>
      <div class="muted" style="margin-top: 8px">直接编辑段落文本，保存即原位写回（样式/字体/表格字节级保留）。</div>
    </template>

    <div class="row-gap" style="margin-top: 14px; justify-content: flex-end">
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">保存</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useAppStore } from '../core/stores/app';
import type { FileEntry, Slot } from '../core/types';
import { editEngine } from '../core/util';

const props = defineProps<{ slot: Slot; file: FileEntry }>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const app = useAppStore();
const engine = computed(() => editEngine(props.file.format));
const loading = ref(true);
const saving = ref(false);
const dirty = ref(false);

/* ---------- 表格（csv/xlsx） ---------- */
interface GridRow {
  cells: Record<number, string>;
}
const gridRows = ref<GridRow[]>([]);
const maxCol = ref(1);
const colIndices = computed(() => Array.from({ length: maxCol.value }, (_, i) => i));

/** 0-indexed 列号 → A/B/… 字母 */
function colLabel(c: number): string {
  let label = '';
  let n = c;
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/** 0-indexed (r,c) → A1 风格地址（xlsx 编辑用） */
function cellAddr(r: number, c: number): string {
  return `${colLabel(c)}${r + 1}`;
}

/* ---------- 文档（docx） ---------- */
interface DocxPara {
  index: number;
  text: string;
  originalText: string; // 识别时的原文（用于原位替换 oldText）
  isHeading: boolean;
}
const paragraphs = ref<DocxPara[]>([]);

function markDirty() {
  dirty.value = true;
}

onMounted(async () => {
  try {
    const abs = `${app.currentProjectFolder}/${props.file.path}`;
    if (engine.value === 'sheet') {
      const res =
        props.file.format === 'csv'
          ? await window.api.recognizeCsv(abs)
          : await window.api.recognizeXlsx(abs);
      const rows = res.rows ?? 0;
      const cols = res.cols ?? 1;
      maxCol.value = Math.max(1, cols);
      const grid: GridRow[] = Array.from({ length: rows }, () => ({ cells: {} }));
      for (const cell of res.cells ?? []) {
        if (!grid[cell.r]) grid[cell.r] = { cells: {} };
        grid[cell.r].cells[cell.c] = cell.v ?? '';
      }
      gridRows.value = grid;
    } else if (engine.value === 'docx') {
      const res = await window.api.recognizeDocx(abs);
      paragraphs.value = (res.paragraphs ?? []).map((p: any) => ({
        index: p.index,
        text: p.text ?? '',
        originalText: p.text ?? '',
        isHeading: p.isHeading,
      }));
    }
  } catch (e) {
    ElMessage.error(`识别失败：${(e as Error).message}`);
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  try {
    const abs = `${app.currentProjectFolder}/${props.file.path}`;
    if (props.file.format === 'csv') {
      const edits: Array<{ r: number; c: number; v: string }> = [];
      gridRows.value.forEach((row, r) => {
        for (const [c, v] of Object.entries(row.cells)) {
          edits.push({ r, c: Number(c), v });
        }
      });
      await window.api.applyCsv(abs, edits);
    } else if (engine.value === 'sheet') {
      const edits: Array<{ addr: string; value: string }> = [];
      gridRows.value.forEach((row, r) => {
        for (const [c, v] of Object.entries(row.cells)) {
          edits.push({ addr: cellAddr(r, Number(c)), value: v });
        }
      });
      await window.api.applyXlsx(abs, 'Sheet1', edits);
    } else if (engine.value === 'docx') {
      // 原位替换：只替换"有改动"的段落（originalText → newText，字面替换）
      const replacements = paragraphs.value
        .filter((p) => p.originalText && p.text !== p.originalText)
        .map((p) => ({ oldText: p.originalText, newText: p.text }));
      const res = await window.api.applyDocx(abs, replacements);
      if (res.missed.length) ElMessage.warning(`有 ${res.missed.length} 处未精确命中（重复文本时），已尽量原位写回`);
    }
    ElMessage.success('已保存（原位写回）');
    emit('saved');
  } catch (e) {
    ElMessage.error(`保存失败：${(e as Error).message}`);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.docx-p {
  margin: 2px 0;
}
.docx-p.heading .docx-ta {
  font-weight: 700;
  font-size: 15px;
}
.docx-ta {
  width: 100%;
  border: none;
  resize: vertical;
  font-family: inherit;
  background: transparent;
  padding: 2px 4px;
}
.docx-ta:focus {
  outline: 1px solid #409eff;
}
</style>
