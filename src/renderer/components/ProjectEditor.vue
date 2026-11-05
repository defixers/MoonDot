<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NModal } from 'naive-ui'
import { projectTypes, projectStatuses, type ProjectDraft, type Template } from '../../shared/work'
import { projectDefaults, result, work } from '../work'
const props = defineProps<{ project?: ProjectDraft }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const draft = ref<ProjectDraft>(
  props.project
    ? ({
        ...Object.fromEntries(
          Object.keys(projectDefaults).map((key) => [
            key,
            props.project![key as keyof ProjectDraft] ??
              projectDefaults[key as keyof typeof projectDefaults],
          ]),
        ),
        id: props.project.id,
      } as ProjectDraft)
    : { ...projectDefaults, tags: [] },
)
const tags = ref(draft.value.tags.join('，')),
  templates = ref<Template[]>([]),
  busy = ref(false),
  error = ref(''),
  step = ref(props.project ? 0 : 1)
onMounted(async () => {
  try {
    templates.value = await result(work().templates(undefined))
    if (!draft.value.id)
      draft.value.templateId =
        (await result(work().preferences(undefined))).defaultTemplateId ?? templates.value[0]?.id
  } catch (e) {
    error.value = String(e)
  }
})
async function cover(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    error.value = '封面请选择 2MB 以内的 PNG、JPEG 或 WebP 图片'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    draft.value.cover = String(reader.result)
    error.value = ''
  }
  reader.readAsDataURL(file)
}
async function save() {
  busy.value = true
  error.value = ''
  try {
    const item = await result(
      work().saveProject({
        ...draft.value,
        tags: tags.value
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    )
    emit('saved', item.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <NModal
    :show="true"
    preset="card"
    :title="project ? '编辑项目' : '创建项目'"
    class="editor-modal"
    :mask-closable="false"
    @close="emit('close')"
    @esc="emit('close')"
  >
    <p
      v-if="step"
      class="muted"
    >
      {{ step === 1 ? '1 · 基本信息' : '2 · 流程与初始任务' }}
    </p>
    <form @submit.prevent="step === 1 ? (step = 2) : save()">
      <div
        v-if="step !== 2"
        class="form-grid"
      >
        <label>
          项目名称
          <input
            v-model="draft.name"
            required
            maxlength="120"
            autofocus
          />
        </label>
        <label>
          艺人
          <input
            v-model="draft.artist"
            maxlength="120"
          />
        </label>
        <label>
          项目类型
          <select
            v-model="draft.type"
            aria-label="项目类型"
          >
            <option
              v-for="(label, key) in projectTypes"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label>
          状态
          <select
            v-model="draft.status"
            aria-label="状态"
          >
            <template
              v-for="(label, key) in projectStatuses"
              :key="key"
            >
              <option
                v-if="key !== 'archived'"
                :value="key"
              >
                {{ label }}
              </option>
            </template>
          </select>
        </label>
        <label>
          流派
          <input
            v-model="draft.genre"
            maxlength="80"
          />
        </label>
        <label>
          BPM
          <input
            :value="draft.bpm ?? ''"
            type="number"
            min="20"
            max="400"
            @input="
              draft.bpm = ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : null
            "
          />
        </label>
        <label>
          调性
          <input
            v-model="draft.musicalKey"
            maxlength="40"
          />
        </label>
        <label>
          项目截止日
          <input
            v-model="draft.dueDate"
            type="date"
          />
        </label>
        <label>
          标签（逗号分隔）
          <input
            v-model="tags"
            maxlength="600"
          />
        </label>
        <label>
          项目颜色
          <input
            v-model="draft.color"
            type="color"
          />
        </label>
        <label class="span-2">
          参与人
          <input
            v-model="draft.participants"
            maxlength="1000"
          />
        </label>
        <label class="span-2">
          项目描述
          <textarea
            v-model="draft.description"
            maxlength="10000"
            rows="3"
          />
        </label>
        <label class="span-2">
          项目封面
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="cover"
          />
        </label>
        <div
          v-if="draft.cover"
          class="span-2"
        >
          <img
            :src="draft.cover"
            class="cover-preview"
            alt="项目封面预览"
          />
          <button
            type="button"
            @click="draft.cover = ''"
          >
            移除封面
          </button>
        </div>
      </div>
      <div v-else>
        <label>
          流程模板
          <select
            v-model="draft.templateId"
            aria-label="流程模板"
            required
          >
            <option
              v-for="item in templates"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select>
        </label>
        <ol class="stage-preview">
          <li
            v-for="(stage, index) in templates.find((t) => t.id === draft.templateId)?.stages"
            :key="index"
          >
            {{ stage.name }}
            <span>{{ Math.round(stage.weight * 10) / 10 }}%</span>
          </li>
        </ol>
        <label class="check-label">
          <input
            v-model="draft.initialTasks"
            type="checkbox"
          />
          生成初始任务（确认创作方向、整理参考资料）
        </label>
        <p class="muted">
          阶段会独立复制到此项目；修改模板不会改变已有项目。预算将在后续阶段开放。
        </p>
      </div>
      <p
        v-if="error"
        role="alert"
        class="error-text"
      >
        {{ error }}
      </p>
      <div class="form-actions">
        <button
          v-if="step === 2"
          type="button"
          @click="step = 1"
        >
          上一步
        </button>
        <button
          type="button"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          class="primary"
          :disabled="busy"
        >
          {{ step === 1 ? '下一步' : busy ? '保存中…' : '保存项目' }}
        </button>
      </div>
    </form>
  </NModal>
</template>
