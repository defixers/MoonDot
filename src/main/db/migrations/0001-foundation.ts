export const foundationMigration = {
  version: 1,
  name: '0001-foundation',
  sql: `CREATE TABLE app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL CHECK (json_valid(value)),
    updated_at TEXT NOT NULL
  );`,
}
