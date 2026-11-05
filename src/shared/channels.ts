export const SYSTEM_HEALTH_CHANNEL = 'system:health'
export const PROFILE_GET_CHANNEL = 'settings:get-profile'
export const PROFILE_SAVE_CHANNEL = 'settings:save-profile'
// Keep runtime schema imports out of the sandboxed preload.
export const WORK_METHODS = [
  'projects',
  'project',
  'saveProject',
  'projectState',
  'trashProject',
  'restoreProject',
  'purgeProject',
  'deleteProjectFiles',
  'relocateProject',
  'search',
  'chooseDirectory',
  'defaultProjectDirectory',
  'checkDirectory',
  'chooseImports',
  'files',
  'createFolder',
  'renameFile',
  'trashFile',
  'openFolder',
  'revealFile',
  'startImport',
  'importStatus',
  'cancelImport',
] as const
export const workChannel = (method: (typeof WORK_METHODS)[number]) => `work:${method}`
