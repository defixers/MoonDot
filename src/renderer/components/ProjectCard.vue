<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight, CalendarDays, Check, Circle, Disc3, Flag, Layers, Music2 } from '@lucide/vue'
import { projectStatuses, projectTypes, type Project } from '../../shared/work'
const props = defineProps<{ project: Project }>()
const typeIcon = computed(() => ({ single: Music2, album: Layers, ep: Disc3 })[props.project.type])
const createdDate = computed(() =>
  new Date(props.project.createdAt)
    .toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replaceAll('/', '.'),
)
</script>
<template>
  <RouterLink
    class="project-card"
    :class="`project-card--${project.type}`"
    :to="`/projects/${project.id}`"
    :aria-label="`打开项目 ${project.name}`"
  >
    <div class="card-artwork">
      <img
        v-if="project.cover"
        :src="project.cover"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div
        v-else
        class="card-placeholder"
        aria-hidden="true"
      >
        <div class="card-orbit" />
        <div class="card-record"><span>月</span></div>
      </div>
      <span
        class="card-status"
        :class="{ complete: project.status === 'completed' }"
      >
        <Check
          v-if="project.status === 'completed'"
          :size="12"
          :stroke-width="2.5"
          aria-hidden="true"
        />
        <Circle
          v-else
          :size="9"
          :stroke-width="2.5"
          aria-hidden="true"
        />
        {{ projectStatuses[project.status] }}
      </span>
    </div>
    <div class="card-information">
      <div class="card-type-row">
        <span class="card-type">
          <component
            :is="typeIcon"
            :size="14"
            aria-hidden="true"
          />
          {{ projectTypes[project.type] }}
        </span>
        <ArrowUpRight
          class="card-open-icon"
          :size="17"
          aria-hidden="true"
        />
      </div>
      <h2 :title="project.name">{{ project.name }}</h2>
      <div class="card-dates">
        <div>
          <span class="card-date-label">
            <CalendarDays
              :size="13"
              aria-hidden="true"
            />
            创建日期
          </span>
          <time :datetime="project.createdAt">{{ createdDate }}</time>
        </div>
        <div>
          <span class="card-date-label">
            <Flag
              :size="13"
              aria-hidden="true"
            />
            截止日期
          </span>
          <time
            v-if="project.dueDate"
            :datetime="project.dueDate"
          >
            {{ project.dueDate.replaceAll('-', '.') }}
          </time>
          <span
            v-else
            class="card-no-date"
          >
            未设置
          </span>
        </div>
      </div>
    </div>
  </RouterLink>
</template>
<style scoped>
.project-card {
  --artwork-start: #eef3ff;
  --artwork-end: #cfddf5;
  --artwork-ink: #6684b4;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 9px 9px 0;
  border: 1px solid #e3e8f0;
  border-radius: 18px;
  background: var(--bg-surface);
  box-shadow: 0 2px 4px #17274203;
  transition:
    border-color 0.18s,
    box-shadow 0.18s,
    transform 0.18s;
}
.project-card--album {
  --artwork-start: #f2eff9;
  --artwork-end: #dbd4ec;
  --artwork-ink: #9180b0;
}
.project-card--ep {
  --artwork-start: #ecf5f4;
  --artwork-end: #ccdfdd;
  --artwork-ink: #6e9c97;
}
.project-card:hover {
  border-color: #c3d2e9;
  box-shadow:
    0 10px 26px #203c6510,
    0 2px 6px #203c6506;
  transform: translateY(-3px);
}
.project-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.card-artwork {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 11px;
  background: var(--artwork-start);
  isolation: isolate;
}
.card-artwork > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.28s ease;
}
.project-card:hover .card-artwork > img {
  transform: scale(1.035);
}
.card-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 15% 15%, #ffffffb3, transparent 65%),
    linear-gradient(125deg, var(--artwork-start), var(--artwork-end));
}
.card-orbit {
  position: absolute;
  width: 115%;
  aspect-ratio: 1;
  border: 1px solid #ffffff5c;
  border-radius: 50%;
  transform: translate(18%, 35%);
  box-shadow:
    0 0 0 24px #ffffff18,
    0 0 0 48px #ffffff12;
}
.card-record {
  display: grid;
  place-items: center;
  width: 45%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid #ffffffb3;
  background:
    repeating-radial-gradient(circle, transparent 0 5px, #ffffff40 6px 7px),
    linear-gradient(135deg, #ffffff66, #ffffff08);
  box-shadow:
    0 10px 24px #4158790b,
    inset 0 0 0 11px #ffffff18;
  transform: rotate(-15deg);
}
.card-record span {
  display: grid;
  place-items: center;
  width: 34%;
  aspect-ratio: 1;
  border: 1px solid #ffffffb3;
  border-radius: 50%;
  background: var(--artwork-start);
  color: var(--artwork-ink);
  font-size: 20px;
  font-weight: 500;
  transform: rotate(15deg);
}
.card-status {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid #ffffffc9;
  border-radius: 20px;
  background: #fffffff2;
  color: #59677c;
  box-shadow: 0 2px 8px #20345008;
  font-size: 11px;
  line-height: 18px;
}
.card-status.complete {
  color: #21725a;
  background: #f3fcf8f5;
}
.card-information {
  padding: 17px 12px 18px;
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.card-type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}
.card-type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #77859a;
}
.card-open-icon {
  color: #a1adc0;
  transition:
    color 0.18s,
    transform 0.18s;
}
.project-card:hover .card-open-icon,
.project-card:focus-visible .card-open-icon {
  color: var(--accent);
  transform: translate(1px, -1px);
}
.card-information h2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  min-height: 2.9em;
  margin: 0 0 17px;
  font-size: 18px;
  line-height: 1.45;
  font-weight: 600;
  color: #202c3e;
  letter-spacing: -0.2px;
}
.card-dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-top: 15px;
  border-top: 1px solid #edf0f5;
  margin-top: auto;
}
.card-dates > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.card-date-label {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #8a96a8;
  font-size: 10px;
}
.card-dates time,
.card-no-date {
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: #59677d;
}
.card-no-date {
  color: #99a3b2;
}
@media (prefers-reduced-motion: reduce) {
  .project-card:hover,
  .project-card:hover .card-artwork > img,
  .project-card:hover .card-open-icon,
  .project-card:focus-visible .card-open-icon {
    transform: none;
  }
}
</style>
