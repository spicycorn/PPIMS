<template>
  <div class="sw">
    <!-- 槽位元数据（名称/格式/必要性/时限/审查属性） -->
    <div class="card-block">
      <div class="row-gap" style="margin-bottom: 10px">
        <el-icon :size="18"><Setting /></el-icon>
        <strong>槽位属性</strong>
        <el-tag size="small">{{ slot.name }}</el-tag>
      </div>
      <el-form :inline="true" label-width="70px">
        <el-form-item label="名称">
          <el-input v-model="meta.name" style="width: 180px" @change="applyMeta" />
        </el-form-item>
        <el-form-item label="期望格式">
          <el-select v-model="meta.format" style="width: 130px" @change="applyMeta">
            <el-option v-for="(label, key) in FORMAT_LABEL" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="必要性">
          <el-select v-model="meta.necessity" style="width: 110px" @change="applyMeta">
            <el-option v-for="(label, key) in NECESSITY_LABEL" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="时限">
          <el-date-picker
            v-model="meta.deadline"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选填"
            @change="applyMeta"
          />
        </el-form-item>
        <el-form-item label="需审查">
          <el-switch v-model="meta.reviewRequired" @change="applyMeta" />
        </el-form-item>
      </el-form>
    </div>

    <!-- 页签：模板编辑 / 文件管理 -->
    <el-tabs v-model="tab" class="sw-tabs">
      <el-tab-pane label="模板编辑" name="editor">
        <TemplateEditor :stage="stage" :slot="slot" />
      </el-tab-pane>
      <el-tab-pane label="文件管理" name="files">
        <FilePanel :stage="stage" :slot="slot" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Setting } from '@element-plus/icons-vue';
import { FORMAT_LABEL, NECESSITY_LABEL, type Slot, type Stage } from '../../shared/types';
import { useProjectStore } from '../stores/project';
import TemplateEditor from './TemplateEditor.vue';
import FilePanel from './FilePanel.vue';

const props = defineProps<{ stage: Stage; slot: Slot }>();
const store = useProjectStore();
const tab = ref('editor');

// 本地元数据编辑缓冲
const meta = reactive({
  name: props.slot.name,
  format: props.slot.format,
  necessity: props.slot.necessity,
  deadline: props.slot.deadline,
  reviewRequired: props.slot.reviewRequired,
});

// 切换槽位时同步
watch(
  () => props.slot.id,
  (id) => {
    const s = store.findSlot(props.stage.id, id);
    if (s) {
      meta.name = s.name;
      meta.format = s.format;
      meta.necessity = s.necessity;
      meta.deadline = s.deadline;
      meta.reviewRequired = s.reviewRequired;
    }
  },
);

function applyMeta() {
  store.updateSlot(props.stage.id, props.slot.id, { ...meta, deadline: meta.deadline || undefined });
}
</script>

<style scoped>
.sw-tabs {
  margin-top: 4px;
}
</style>
