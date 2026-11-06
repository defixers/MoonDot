<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    activeKey: string | number
    kind?: 'page' | 'step' | 'panel'
  }>(),
  { kind: 'panel' },
)
const surface = ref<HTMLElement>()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let animation: Animation | undefined

function stop() {
  animation?.cancel()
  animation = undefined
}
function enter(previous?: string | number) {
  stop()
  if (!surface.value || reducedMotion.matches || document.hidden) return
  const backwards =
    typeof previous === 'number' &&
    typeof props.activeKey === 'number' &&
    props.activeKey < previous
  const transform =
    props.kind === 'step'
      ? `translateX(${backwards ? -12 : 12}px)`
      : `translateY(${props.kind === 'page' ? 8 : 4}px)`
  // Enter only: content is immediately interactive, with no outgoing page or blank interval.
  const current = surface.value.animate(
    [
      { opacity: 0.65, transform },
      { opacity: 1, transform: 'none' },
    ],
    {
      duration: { page: 220, step: 180, panel: 160 }[props.kind],
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )
  animation = current
  void current.finished.then(
    () => {
      if (animation === current) animation = undefined
    },
    () => {
      /* Rapid navigation cancels the previous animation. */
    },
  )
}
watch(
  () => props.activeKey,
  (_, previous) => enter(previous),
  { flush: 'post' },
)
onMounted(() => {
  reducedMotion.addEventListener('change', stop)
  enter()
})
onUnmounted(() => {
  stop()
  reducedMotion.removeEventListener('change', stop)
})
</script>
<template>
  <div
    ref="surface"
    class="motion-view"
    :data-motion="kind"
  >
    <slot />
  </div>
</template>
<style scoped>
.motion-view {
  min-width: 0;
}
</style>
