<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NModal } from 'naive-ui'
import type { Template, TemplateDraft } from '../../shared/work'
import { result, work, useActions } from '../work'
const templates = ref<Template[]>([]),
  draft = ref<TemplateDraft>(),
  remove = ref<Template>()
const { error, busy, run } = useActions(load)
async function load() {
  try {
    templates.value = await result(work().templates(undefined))
  } catch (e) {
    error.value = String(e)
  }
}
onMounted(load)
function edit(item?: Template, copy = false) {
  draft.value = item
    ? {
        id: copy ? undefined : item.id,
        name: copy ? `${item.name}（副本）` : item.name,
        stages: item.stages.map((s) => ({ ...s })),
      }
    : {
        name: '',
        stages: [
          { name: '企划', weight: 10 },
          { name: '制作', weight: 80 },
          { name: '交付', weight: 10 },
        ],
      }
}
function move(index: number, offset: number) {
  const rows = draft.value!.stages
  const target = index + offset
  if (target < 0 || target >= rows.length) return
  ;[rows[index], rows[target]] = [rows[target]!, rows[index]!]
}
async function save() {
  await run(async () => {
    const saved = await result(
      work().saveTemplate({ ...draft.value!, stages: draft.value!.stages.map((s) => ({ ...s })) }),
    )
    draft.value = undefined
    return saved
  })
}
</script>
<template>
  <div class="heading-row">
    <div class="page-heading">
      <p class="eyebrow">复用你的制作流程</p>
      <h1>阶段模板</h1>
      <p>调整阶段、顺序和相对权重；保存时自动归一化为 100%，仅影响之后创建的项目。</p>
    </div>
    <button
      class="primary"
      @click="edit()"
    >
      新建模板
    </button>
  </div>
  <p
    v-if="error"
    role="alert"
    class="error-text"
  >
    {{ error }}
  </p>
  <div class="project-grid">
    <article
      v-for="template in templates"
      :key="template.id"
      class="surface"
    >
      <h2>{{ template.name }}</h2>
      <ol class="stage-preview">
        <li
          v-for="(stage, index) in template.stages"
          :key="index"
        >
          {{ stage.name }}
          <span>{{ Math.round(stage.weight * 10) / 10 }}%</span>
        </li>
      </ol>
      <div class="form-actions">
        <button @click="edit(template)">编辑模板</button>
        <button @click="edit(template, true)">复制模板</button>
        <button
          :disabled="templates.length <= 1"
          @click="remove = template"
        >
          删除模板
        </button>
      </div>
    </article>
  </div>
  <NModal
    :show="!!draft"
    preset="card"
    title="编辑阶段模板"
    class="editor-modal"
    :mask-closable="false"
    @close="draft = undefined"
  >
    <form
      v-if="draft"
      @submit.prevent="save"
    >
      <label>
        模板名称
        <input
          v-model="draft.name"
          required
          maxlength="120"
        />
      </label>
      <div
        v-for="(stage, index) in draft.stages"
        :key="index"
        class="template-row"
      >
        <label>
          阶段 {{ index + 1 }} 名称
          <input
            v-model="stage.name"
            required
            maxlength="120"
          />
        </label>
        <label>
          权重
          <input
            v-model.number="stage.weight"
            type="number"
            min="0.01"
            max="1000"
            step="any"
            required
          />
        </label>
        <button
          type="button"
          :disabled="index === 0"
          @click="move(index, -1)"
        >
          上移
        </button>
        <button
          type="button"
          :disabled="index === draft.stages.length - 1"
          @click="move(index, 1)"
        >
          下移
        </button>
        <button
          type="button"
          :disabled="draft.stages.length <= 1"
          @click="draft.stages.splice(index, 1)"
        >
          移除
        </button>
      </div>
      <button
        type="button"
        :disabled="draft.stages.length >= 30"
        @click="draft.stages.push({ name: '', weight: 10 })"
      >
        添加阶段
      </button>
      <p
        v-if="error"
        role="alert"
        class="error-text"
      >
        {{ error }}
      </p>
      <div class="form-actions">
        <button
          type="button"
          @click="draft = undefined"
        >
          取消
        </button>
        <button
          class="primary"
          :disabled="busy"
        >
          保存模板
        </button>
      </div>
    </form>
  </NModal>
  <NModal
    :show="!!remove"
    preset="card"
    title="删除模板"
    class="editor-modal"
    @close="remove = undefined"
  >
    <p>删除「{{ remove?.name }}」？已有项目中的阶段不会改变。</p>
    <div class="form-actions">
      <button @click="remove = undefined">取消</button>
      <button
        :disabled="busy"
        @click="
          run(async () => {
            const saved = await result(work().deleteTemplate({ id: remove!.id }))
            remove = undefined
            return saved
          })
        "
      >
        确认删除模板
      </button>
    </div>
  </NModal>
</template>
