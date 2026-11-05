<script setup lang="ts">
import { ref, watch } from 'vue'
import { NAlert, NButton, NCard, NForm, NFormItem, NInput } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
const workspace = useWorkspaceStore()
const displayName = ref(workspace.profile.displayName)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
watch(
  () => workspace.profile.displayName,
  (name) => {
    displayName.value = name
  },
)
async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    await workspace.saveProfile(displayName.value)
    saved.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-heading">
    <p class="eyebrow">只属于当前电脑</p>
    <h1>设置</h1>
    <p>设置你的本机显示名，月句会在工作台使用它。</p>
  </div>
  <NCard
    title="本机用户"
    class="settings-card"
  >
    <NForm @submit.prevent="save">
      <NFormItem
        label="显示名"
        :label-props="{ for: 'display-name' }"
      >
        <NInput
          v-model:value="displayName"
          :input-props="{ id: 'display-name' }"
          :maxlength="80"
          show-count
          placeholder="例如：林深"
          :disabled="!workspace.loaded || saving"
          @update:value="saved = false"
        />
      </NFormItem>
      <p class="muted">可以留空，最多 80 个字符。此名称仅保存在本机，无需注册账号。</p>
      <NButton
        type="primary"
        attr-type="submit"
        :loading="saving"
        :disabled="!workspace.loaded"
      >
        保存设置
      </NButton>
      <p
        v-if="saved"
        class="saved-status"
        role="status"
      >
        设置已保存
      </p>
      <NAlert
        v-if="error"
        type="error"
        class="notice"
      >
        {{ error }}
      </NAlert>
    </NForm>
  </NCard>
  <NCard
    title="素材与核心备份"
    class="notice"
  >
    <p>当前尚未开放目录配置。素材库和核心备份目录将由你选择。</p>
    <p class="muted">
      核心备份只覆盖数据库、已确认母带、文档与清单，不提供完整素材备份。同盘迁移快照不能防止磁盘损坏。
    </p>
  </NCard>
</template>
