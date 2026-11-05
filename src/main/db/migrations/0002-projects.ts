// This schema belongs exclusively to moondot-remake.db. Never apply it to moondot.db.
export const projectsMigration = {
  version: 2,
  name: '0002-project-directories',
  sql: `CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data)),
    root_directory TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'incomplete' CHECK(status IN ('incomplete','completed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX projects_deleted ON projects(deleted_at);
  CREATE TABLE project_files (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY(project_id, path)
  );`,
}
