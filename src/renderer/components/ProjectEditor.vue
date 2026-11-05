<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NModal } from 'naive-ui'
import {
  Check,
  Disc3,
  Layers,
  Music2,
  FolderOpen,
  Folder,
  CalendarDays,
  Flag,
  Upload,
  ImagePlus,
  Trash2,
} from '@lucide/vue'
import {
  MAX_COVER_BYTES,
  MAX_PEOPLE_INPUT,
  parsePersonnel,
  phases,
  projectTypes,
  type Project,
  type ProjectDraft,
} from '../../shared/work'
import { projectDefaults, result, work } from '../work'
import ProjectDateField from './ProjectDateField.vue'
const props = defineProps<{ project?: Project }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const draft = reactive<ProjectDraft>(
  props.project
    ? {
        id: props.project.id,
        name: props.project.name,
        type: props.project.type,
        description: props.project.description,
        cover: props.project.cover,
        dueDate: props.project.dueDate,
        stages: JSON.parse(JSON.stringify(props.project.stages)),
      }
    : projectDefaults(),
)
const peopleText = reactive(
  draft.stages.map((stage) =>
    Object.fromEntries(
      Object.entries(stage.people).map(([role, names]) => [role, names.join('，')]),
    ),
  ),
)
const parsedPeople = computed(() =>
  phases.map((phase, index) =>
    Object.fromEntries(
      phase.roles.map((role) => [role, parsePersonnel(peopleText[index]?.[role] ?? '')]),
    ),
  ),
)
const type = ref(props.project?.type ?? '')
const typeOptions = [
  { key: 'single', name: '单曲', english: 'SINGLE', icon: Music2, description: '聚焦一次灵感' },
  { key: 'album', name: '专辑', english: 'ALBUM', icon: Layers, description: '展开完整的音乐叙事' },
  { key: 'ep', name: 'EP', english: 'EXTENDED PLAY', icon: Disc3, description: '收集一组创作表达' },
] as const
const step = ref(1),
  error = ref(''),
  busy = ref(false),
  coverBusy = ref(false)
const coverInput = ref<HTMLInputElement>(),
  coverName = ref(''),
  coverSize = ref(''),
  coverDragging = ref(false)
const directory = ref(''),
  defaultDirectory = ref(''),
  directoryBusy = ref(false),
  directoryError = ref('')
let directorySequence = 0,
  coverSequence = 0
const steps = ['基本信息', '项目类型', '岗位人员', '交付日期', '确认创建']
const stageCount = (index: number) =>
  new Set(Object.values(parsedPeople.value[index]!).flatMap((value) => value.names)).size
const scheduledCount = computed(() => draft.stages.filter((stage) => stage.dueDate).length)
const peopleInvalid = computed(() =>
  parsedPeople.value.some((stage) => Object.values(stage).some((value) => value.error)),
)
const canNext = computed(
  () =>
    !coverBusy.value &&
    (step.value === 1
      ? !!draft.name.trim()
      : step.value === 2
        ? !!type.value
        : step.value === 3
          ? !peopleInvalid.value
          : true),
)
function syncPeople() {
  if (peopleInvalid.value) {
    step.value = 3
    error.value = '请先修正标记的人员输入'
    return false
  }
  for (const [index, stage] of parsedPeople.value.entries())
    draft.stages[index]!.people = Object.fromEntries(
      Object.entries(stage).map(([role, value]) => [role, value.names]),
    )
  return true
}
function next() {
  if (!canNext.value || (step.value === 3 && !syncPeople())) return
  error.value = ''
  step.value++
}
async function cover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await loadCover(file)
  input.value = ''
}
async function dropCover(event: DragEvent) {
  coverDragging.value = false
  if (busy.value || coverBusy.value) return
  const files = event.dataTransfer?.files
  if (!files?.length) return
  if (files.length !== 1) {
    error.value = '请一次选择一张封面图片'
    return
  }
  await loadCover(files[0]!)
}
async function loadCover(file: File) {
  const ticket = ++coverSequence
  coverBusy.value = false
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > MAX_COVER_BYTES
  ) {
    error.value = '请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片'
    return
  }
  coverBusy.value = true
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('无法读取封面图片'))
      reader.readAsDataURL(file)
    })
    const preview = new Image()
    preview.src = data
    await preview.decode()
    if (ticket === coverSequence) {
      draft.cover = data
      coverName.value = file.name
      coverSize.value = `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      error.value = ''
    }
  } catch {
    if (ticket === coverSequence) {
      error.value = '图片无法读取，请选择有效的 PNG、JPEG 或 WebP 图片'
    }
  } finally {
    if (ticket === coverSequence) coverBusy.value = false
  }
}
function removeCover() {
  coverSequence++
  coverBusy.value = false
  draft.cover = ''
  coverName.value = ''
  coverSize.value = ''
  error.value = ''
  if (coverInput.value) coverInput.value.value = ''
}
async function useDefaultDirectory() {
  const ticket = ++directorySequence
  directoryBusy.value = true
  directoryError.value = ''
  try {
    const selected = await result(work().defaultProjectDirectory(undefined))
    if (ticket === directorySequence) {
      directory.value = selected.directory
      defaultDirectory.value = selected.directory
    }
  } catch (cause) {
    if (ticket === directorySequence) directoryError.value = (cause as Error).message
  } finally {
    if (ticket === directorySequence) directoryBusy.value = false
  }
}
async function chooseDirectory() {
  const ticket = ++directorySequence
  directoryBusy.value = true
  directoryError.value = ''
  try {
    const selected = await result(work().chooseDirectory(undefined))
    if (!selected) return
    const checked = await result(work().checkDirectory({ directory: selected }))
    if (ticket === directorySequence) directory.value = checked.directory
  } catch (cause) {
    if (ticket === directorySequence) directoryError.value = (cause as Error).message
  } finally {
    if (ticket === directorySequence) directoryBusy.value = false
  }
}
onMounted(() => {
  if (!props.project) void useDefaultDirectory()
})
onUnmounted(() => {
  directorySequence++
  coverSequence++
})
async function save() {
  if (
    busy.value ||
    directoryBusy.value ||
    coverBusy.value ||
    !type.value ||
    (!props.project && !directory.value) ||
    !syncPeople()
  )
    return
  busy.value = true
  error.value = ''
  try {
    const value = JSON.parse(JSON.stringify(draft)) as ProjectDraft
    value.type = type.value as ProjectDraft['type']
    if (!props.project) value.parentDirectory = directory.value
    const saved = await result(work().saveProject(value))
    emit('saved', saved.id)
  } catch (cause) {
    error.value = (cause as Error).message
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
    :close-on-esc="!busy"
    @update:show="!busy && emit('close')"
  >
    <ol
      class="wizard-steps"
      aria-label="创建步骤"
    >
      <li
        v-for="(label, index) in steps"
        :key="label"
        :class="{ current: step === index + 1, visited: step > index + 1 }"
        :aria-current="step === index + 1 ? 'step' : undefined"
      >
        <span>{{ index + 1 }}</span>
        {{ index === 4 && project ? '确认保存' : label }}
      </li>
    </ol>
    <form
      class="form-stack"
      @submit.prevent="step < 5 ? next() : save()"
    >
      <fieldset
        :disabled="busy"
        class="form-stack"
      >
        <div
          v-if="step === 1"
          class="form-stack"
        >
          <h2>为这次创作起个名字</h2>
          <label>
            项目名称
            <input
              v-model="draft.name"
              required
              maxlength="120"
              autofocus
            />
          </label>
          <section
            class="cover-field"
            aria-label="项目封面"
          >
            <div class="cover-heading">
              <span>项目封面</span>
              <span class="cover-optional">选填</span>
            </div>
            <input
              ref="coverInput"
              class="sr-only"
              tabindex="-1"
              aria-label="项目封面（选填）"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="coverBusy"
              @change="cover"
            />
            <div
              class="cover-upload"
              :class="{ 'is-dragging': coverDragging, 'has-cover': !!draft.cover }"
              :aria-busy="coverBusy"
              @dragover.prevent="coverDragging = !busy && !coverBusy"
              @dragleave.self="coverDragging = false"
              @drop.prevent="dropCover"
            >
              <button
                class="cover-art"
                type="button"
                :disabled="coverBusy"
                :aria-label="draft.cover ? '更换项目封面' : '选择项目封面'"
                @click="coverInput?.click()"
              >
                <img
                  v-if="draft.cover"
                  :src="draft.cover"
                  alt="项目封面预览"
                  class="cover-preview"
                />
                <template v-else>
                  <span class="cover-disc">
                    <Disc3
                      :size="58"
                      :stroke-width="1"
                      aria-hidden="true"
                    />
                  </span>
                  <span class="cover-art-caption">YOUR NEXT SOUND</span>
                </template>
                <span class="cover-art-edit">
                  <ImagePlus
                    :size="15"
                    aria-hidden="true"
                  />
                </span>
              </button>
              <div class="cover-content">
                <strong>
                  {{
                    coverDragging
                      ? '松开鼠标，上传封面'
                      : draft.cover
                        ? '让作品拥有自己的面孔'
                        : '给这次创作一个画面'
                  }}
                </strong>
                <p class="cover-help">点击选择或将图片拖到这里</p>
                <p
                  v-if="draft.cover"
                  class="cover-file"
                  :title="coverName || '当前项目封面'"
                >
                  {{ coverName || '当前项目封面' }}
                  <span v-if="coverSize">· {{ coverSize }}</span>
                </p>
                <div class="cover-actions">
                  <button
                    type="button"
                    :disabled="coverBusy"
                    @click="coverInput?.click()"
                  >
                    <Upload
                      :size="15"
                      aria-hidden="true"
                    />
                    {{ draft.cover ? '更换图片' : '选择图片' }}
                  </button>
                  <button
                    v-if="draft.cover"
                    type="button"
                    class="cover-remove"
                    :disabled="coverBusy"
                    @click="removeCover"
                  >
                    <Trash2
                      :size="14"
                      aria-hidden="true"
                    />
                    移除封面
                  </button>
                </div>
                <p
                  class="cover-limit"
                  role="status"
                >
                  {{ coverBusy ? '正在读取图片…' : 'PNG、JPEG、WebP · 最大 10 MB' }}
                </p>
              </div>
            </div>
          </section>
          <label>
            项目备注（选填）
            <textarea
              v-model="draft.description"
              rows="4"
              maxlength="10000"
              placeholder="记录创作想法、制作要求或其他说明"
            />
          </label>
        </div>
        <div
          v-if="step === 2"
          class="form-stack"
        >
          <h2>选择项目类型</h2>
          <p class="muted">用于识别项目，不限制歌曲数量或岗位人员。</p>
          <div
            class="type-options"
            role="radiogroup"
            aria-label="项目类型"
          >
            <label
              v-for="option in typeOptions"
              :key="option.key"
              class="type-option"
              :class="{ selected: type === option.key }"
            >
              <input
                v-model="type"
                type="radio"
                name="project-type"
                :value="option.key"
                :aria-label="option.name"
                required
              />
              <span class="type-option-top">
                <span class="type-option-icon">
                  <component
                    :is="option.icon"
                    :size="25"
                    :stroke-width="1.6"
                  />
                </span>
                <span class="type-option-check">
                  <Check
                    v-if="type === option.key"
                    :size="13"
                  />
                </span>
              </span>
              <strong>{{ option.name }}</strong>
              <small>{{ option.english }}</small>
              <span class="type-option-description">{{ option.description }}</span>
            </label>
          </div>
        </div>
        <div
          v-if="step === 3"
          class="form-stack"
        >
          <h2>一起完成这次创作的人</h2>
          <p class="muted">
            每个岗位可填写多人，用逗号或换行分隔，同一人可以担任多个岗位。可留空并点击“下一步”，稍后补充。
          </p>
          <details
            v-for="(phase, index) in phases"
            :key="phase.key"
            class="stage-section"
          >
            <summary>
              {{ phase.name }}
              <span>{{ stageCount(index) }} 人</span>
            </summary>
            <div class="form-grid">
              <label
                v-for="(role, roleIndex) in phase.roles"
                :key="role"
              >
                {{ role }}
                <textarea
                  v-model="peopleText[index]![role]"
                  rows="2"
                  :maxlength="MAX_PEOPLE_INPUT"
                  class="personnel-input"
                  :aria-label="role"
                  :aria-invalid="!!parsedPeople[index]![role]?.error"
                  :aria-describedby="`people-error-${index}-${roleIndex}`"
                  placeholder="待添加"
                />
                <small
                  v-if="parsedPeople[index]![role]?.error"
                  :id="`people-error-${index}-${roleIndex}`"
                  class="error-text"
                >
                  {{ parsedPeople[index]![role]!.error }}
                </small>
              </label>
            </div>
          </details>
        </div>
        <div
          v-if="step === 4"
          class="form-stack schedule-step"
        >
          <div class="schedule-heading">
            <div>
              <h2>留出从容创作的时间</h2>
              <p class="muted">选择日期或使用日历快捷选项。可留空并点击“下一步”，稍后补充。</p>
            </div>
            <CalendarDays
              :size="28"
              :stroke-width="1.5"
            />
          </div>
          <div class="schedule-summary">
            <span>阶段交付安排</span>
            <span>{{ scheduledCount }} / 5 已设置</span>
          </div>
          <div class="schedule-list">
            <div
              v-for="(phase, index) in phases"
              :key="phase.key"
              class="schedule-row"
            >
              <span class="schedule-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="schedule-phase">{{ phase.name }}</span>
              <ProjectDateField
                v-model="draft.stages[index]!.dueDate"
                :label="phase.name + '交付日期'"
                :disabled="busy"
              />
            </div>
          </div>
          <div class="deadline-card">
            <div>
              <Flag :size="20" />
              <div>
                <strong>项目截止日期</strong>
                <small>为整个项目留一个目标日期</small>
              </div>
            </div>
            <ProjectDateField
              v-model="draft.dueDate"
              label="项目截止日期"
              :disabled="busy"
            />
          </div>
        </div>
        <div
          v-if="step === 5"
          class="form-stack"
        >
          <h2>{{ project ? '确认项目信息' : '一切就绪，开始创作' }}</h2>
          <div class="review-hero">
            <img
              v-if="draft.cover"
              :src="draft.cover"
              alt="项目封面"
              class="cover-preview"
            />
            <div>
              <strong>{{ draft.name }}</strong>
              <p>
                {{ projectTypes[type as keyof typeof projectTypes] }} · 截止日期
                {{ draft.dueDate || '未设置' }}
              </p>
            </div>
          </div>
          <p class="preserve-text">{{ draft.description || '未填写项目备注' }}</p>
          <div
            v-for="(phase, index) in phases"
            :key="phase.key"
            class="review-stage"
          >
            <strong>{{ phase.name }} · {{ draft.stages[index]!.dueDate || '未设交付日期' }}</strong>
            <p
              v-for="role in phase.roles"
              :key="role"
            >
              {{ role }}：{{ draft.stages[index]!.people[role]?.join('、') || '待添加' }}
            </p>
          </div>
          <section
            v-if="!project"
            class="project-location"
          >
            <div class="location-heading">
              <span class="location-icon"><FolderOpen :size="22" /></span>
              <div>
                <h3>项目存放位置</h3>
                <p>
                  {{
                    directory === defaultDirectory && directory
                      ? '系统文档文件夹 · 默认位置'
                      : '自定义位置'
                  }}
                </p>
              </div>
              <span
                v-if="directory === defaultDirectory && directory"
                class="location-badge"
              >
                默认
              </span>
            </div>
            <label class="location-path">
              <span class="sr-only">项目存放位置</span>
              <input
                :value="directory"
                readonly
                :placeholder="directoryBusy ? '正在准备默认目录…' : '请选择可写的存放位置'"
              />
            </label>
            <div class="location-preview">
              <Folder :size="16" />
              <span>独立项目文件夹</span>
              <span class="muted">内含 5 个阶段文件夹</span>
            </div>
            <p
              v-if="directoryError"
              role="alert"
              class="error-text"
            >
              {{ directoryError }}
            </p>
            <div class="location-footer">
              <span class="muted">已有同名目录时不会覆盖</span>
              <div>
                <button
                  v-if="directory !== defaultDirectory || !directory"
                  type="button"
                  :disabled="directoryBusy"
                  @click="useDefaultDirectory"
                >
                  使用默认位置
                </button>
                <button
                  type="button"
                  :disabled="directoryBusy"
                  @click="chooseDirectory"
                >
                  更改位置
                </button>
              </div>
            </div>
          </section>
          <template v-else>
            <p class="muted preserve-text">
              项目目录：{{ project.rootDirectory }}
              <br />
              修改名称不会重命名磁盘目录。需要重新关联目录时，请在项目详情中选择“重新定位”。
            </p>
          </template>
        </div>
        <p
          v-if="error"
          class="error-text"
          role="alert"
        >
          {{ error }}
        </p>
        <div class="form-actions">
          <button
            v-if="step > 1"
            type="button"
            @click="
              () => {
                step--
                error = ''
              }
            "
          >
            上一步
          </button>
          <button
            v-if="step < 5"
            class="primary"
            :disabled="!canNext"
          >
            下一步
          </button>
          <button
            v-else
            class="primary"
            :disabled="busy || directoryBusy || coverBusy || (!project && !directory)"
          >
            {{ busy ? '正在保存…' : project ? '保存修改' : '确认创建' }}
          </button>
        </div>
      </fieldset>
    </form>
  </NModal>
</template>
<style scoped>
.cover-field {
  min-width: 0;
}
.cover-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
  font-weight: 500;
}
.cover-optional {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 400;
  background: #eef1f6;
  border-radius: 5px;
  padding: 1px 6px;
}
.cover-upload {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: 24px;
  padding: 20px;
  border: 1px solid #e1e7f0;
  border-radius: 16px;
  background: linear-gradient(120deg, #f5f8fe, #fcfdff 70%);
  transition:
    border-color 0.18s,
    background 0.18s;
}
.cover-upload.is-dragging {
  border-color: var(--accent);
  background: #edf3ff;
}
.cover-art {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 170px;
  height: 170px;
  padding: 0;
  overflow: hidden;
  border: 1px solid #dbe4f2;
  border-radius: 12px;
  background:
    radial-gradient(circle at 15% 15%, #fff9, transparent 65%),
    linear-gradient(135deg, #e7eefa, #d6dff0);
  color: #6b83ab;
  box-shadow: 0 6px 16px #2b426010;
}
.cover-disc {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border: 1px solid #fff9;
  border-radius: 50%;
  background: #ffffff36;
  box-shadow: 0 0 0 9px #ffffff24;
}
.cover-art-caption {
  font-size: 8px;
  letter-spacing: 2px;
}
.cover-art .cover-preview {
  width: 100%;
  height: 100%;
  margin: 0;
  border-radius: 0;
  object-fit: cover;
}
.cover-art-edit {
  position: absolute;
  display: grid;
  place-items: center;
  bottom: 9px;
  right: 9px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #fffffff0;
  color: #58729b;
  box-shadow: 0 2px 6px #203c6510;
}
.cover-art:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.cover-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-width: 0;
}
.cover-content strong {
  font-size: 15px;
  font-weight: 600;
}
.cover-content p {
  margin: 6px 0 0;
}
.cover-help {
  font-size: 12px;
  color: var(--text-secondary);
}
.cover-file {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 11px;
}
.cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.cover-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 7px 11px;
}
.cover-actions .cover-remove {
  color: var(--text-secondary);
  background: transparent;
  border-color: transparent;
}
.cover-actions .cover-remove:hover {
  color: #b42332;
  background: #fff0f1;
}
.cover-content .cover-limit {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}
@media (max-width: 560px) {
  .cover-upload {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .cover-art {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
  }
}
</style>
