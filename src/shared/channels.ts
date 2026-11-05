export const SYSTEM_HEALTH_CHANNEL = 'system:health'
export const PROFILE_GET_CHANNEL = 'settings:get-profile'
export const PROFILE_SAVE_CHANNEL = 'settings:save-profile'
// Kept free of runtime schema imports: sandboxed preload cannot require arbitrary Node modules.
export const WORK_METHODS = [
  'templates',
  'saveTemplate',
  'deleteTemplate',
  'projects',
  'project',
  'saveProject',
  'projectState',
  'trashProject',
  'restoreProject',
  'purgeProject',
  'stageState',
  'tasks',
  'saveTask',
  'moveTask',
  'trashTask',
  'restoreTask',
  'saveNote',
  'deleteNote',
  'search',
  'preferences',
  'savePreferences',
  'undo',
] as const
export const workChannel = (method: (typeof WORK_METHODS)[number]) => `work:${method}`
