<script setup lang="ts">
import { NDatePicker } from 'naive-ui'
import { ref, watchPostEffect } from 'vue'
const props = defineProps<{ modelValue: string; label: string; disabled?: boolean }>()
const field = ref<HTMLElement>()
// NDatePicker does not expose inputProps; label the actual input rather than its wrapper.
watchPostEffect(() => {
  field.value?.querySelector('input')?.setAttribute('aria-label', props.label)
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const daysFromNow = (days: number) => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTime()
}
const shortcuts = {
  今天: () => daysFromNow(0),
  一周后: () => daysFromNow(7),
  两周后: () => daysFromNow(14),
}
function update(value: string | [string, string] | null) {
  emit('update:modelValue', typeof value === 'string' ? value : '')
}
</script>
<template>
  <label
    ref="field"
    class="project-date-field"
  >
    <span class="sr-only">{{ label }}</span>
    <NDatePicker
      :formatted-value="modelValue || null"
      type="date"
      format="yyyy-MM-dd"
      value-format="yyyy-MM-dd"
      :placeholder="label === '项目截止日期' ? '选择截止日期' : '选择交付日期'"
      size="large"
      clearable
      close-on-select
      to="body"
      :disabled="disabled"
      :first-day-of-week="0"
      :actions="['clear', 'now']"
      :shortcuts="shortcuts"
      :year-range="[1900, 9999]"
      @update:formatted-value="update"
    />
  </label>
</template>
