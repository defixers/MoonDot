<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Note } from '../../shared/work'
import { result, work } from '../work'
const props = defineProps<{
  projectId: string
  taskId: string | null
  notes: Note[]
  readonly?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const body = ref(''),
  editing = ref<string>(),
  error = ref(''),
  busy = ref(false)
const notes = computed(() => props.notes.filter((note) => note.taskId === props.taskId))
async function save() {
  busy.value = true
  error.value = ''
  try {
    await result(
      work().saveNote({
        id: editing.value,
        projectId: props.projectId,
        taskId: props.taskId,
        body: body.value,
      }),
    )
    body.value = ''
    editing.value = undefined
    emit('changed')
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}
async function remove(id: string) {
  busy.value = true
  error.value = ''
  try {
    await result(work().deleteNote({ id }))
    emit('changed')
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="notes-panel">
    <h2>{{ taskId ? '任务备注' : '项目备注' }}</h2>
    <p
      v-if="!notes.length"
      class="muted"
    >
      还没有备注，记下创作方向或待确认事项。
    </p>
    <article
      v-for="note in notes"
      :key="note.id"
      class="note-item"
    >
      <p class="preserve-text">{{ note.body }}</p>
      <small class="muted">
        {{ note.author }} · {{ new Date(note.createdAt).toLocaleString() }}
      </small>
      <div
        v-if="!readonly"
        class="inline-actions"
      >
        <button
          :disabled="busy"
          @click="
            () => {
              editing = note.id
              body = note.body
            }
          "
        >
          编辑备注
        </button>
        <button
          :disabled="busy"
          @click="remove(note.id)"
        >
          删除备注
        </button>
      </div>
    </article>
    <form
      v-if="!readonly"
      @submit.prevent="save"
    >
      <label>
        {{ taskId ? '任务备注内容' : '项目备注内容' }}
        <textarea
          v-model="body"
          required
          maxlength="10000"
          rows="3"
        />
      </label>
      <div class="form-actions">
        <button
          v-if="editing"
          type="button"
          @click="
            () => {
              editing = undefined
              body = ''
            }
          "
        >
          取消编辑
        </button>
        <button
          class="primary"
          :disabled="busy || !body.trim()"
        >
          {{ editing ? '保存备注' : '添加备注' }}
        </button>
      </div>
    </form>
    <p
      v-if="error"
      role="alert"
      class="error-text"
    >
      {{ error }}
    </p>
  </section>
</template>
