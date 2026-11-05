export const projectsMigration = {
  version: 2,
  name: '0002-projects',
  sql: `
CREATE TABLE stage_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, stages TEXT NOT NULL CHECK(json_valid(stages)));
INSERT INTO stage_templates VALUES
('00000000-0000-4000-8000-000000000001','单曲','[{"name":"企划","weight":5},{"name":"词曲","weight":15},{"name":"编曲","weight":20},{"name":"录音","weight":20},{"name":"剪辑","weight":10},{"name":"混音","weight":20},{"name":"母带","weight":5},{"name":"交付","weight":5}]'),
('00000000-0000-4000-8000-000000000002','EP / 专辑','[{"name":"统筹","weight":5},{"name":"词曲","weight":15},{"name":"编曲","weight":15},{"name":"录音","weight":20},{"name":"剪辑","weight":10},{"name":"混音","weight":15},{"name":"母带","weight":10},{"name":"交付","weight":10}]'),
('00000000-0000-4000-8000-000000000003','影视 / 游戏配乐','[{"name":"需求","weight":10},{"name":"作曲","weight":20},{"name":"编曲","weight":20},{"name":"录制","weight":15},{"name":"编辑","weight":10},{"name":"混音","weight":15},{"name":"交付","weight":10}]');
CREATE TABLE projects (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, artist TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('single','ep','album','ost','score','other')),
 genre TEXT NOT NULL, bpm INTEGER CHECK(bpm BETWEEN 20 AND 400), musical_key TEXT NOT NULL, due_date TEXT NOT NULL,
 participants TEXT NOT NULL, description TEXT NOT NULL, tags TEXT NOT NULL CHECK(json_valid(tags)), color TEXT NOT NULL, cover TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planning','active','on_hold','completed','archived')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE project_stages (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
 weight REAL NOT NULL CHECK(weight>0), position INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('todo','doing','done')) DEFAULT 'todo',
 UNIQUE(project_id,position)
);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 stage_id TEXT REFERENCES project_stages(id), parent_id TEXT REFERENCES tasks(id), title TEXT NOT NULL, description TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('todo','doing','review','done','canceled')), priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','urgent')),
 due_date TEXT NOT NULL, assignee TEXT NOT NULL, rank TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX tasks_project ON tasks(project_id,deleted_at,status,rank);
CREATE INDEX tasks_parent ON tasks(parent_id);
CREATE INDEX projects_status ON projects(deleted_at,status,updated_at);
CREATE TABLE notes (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
 body TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX notes_project ON notes(project_id,task_id);
CREATE TABLE activity_logs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, action TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX activity_project ON activity_logs(project_id,created_at);
CREATE VIRTUAL TABLE search_index USING fts5(kind UNINDEXED, entity_id UNINDEXED, project_id UNINDEXED, task_id UNINDEXED, title, body, tokenize='trigram');
CREATE TRIGGER projects_search_insert AFTER INSERT ON projects BEGIN
 INSERT INTO search_index VALUES('project',new.id,new.id,NULL,new.name,new.code||' '||new.artist||' '||new.genre||' '||new.participants||' '||new.description||' '||new.tags);
END;
CREATE TRIGGER projects_search_update AFTER UPDATE ON projects BEGIN
 DELETE FROM search_index WHERE kind='project' AND entity_id=old.id;
 INSERT INTO search_index VALUES('project',new.id,new.id,NULL,new.name,new.code||' '||new.artist||' '||new.genre||' '||new.participants||' '||new.description||' '||new.tags);
END;
CREATE TRIGGER projects_search_delete AFTER DELETE ON projects BEGIN DELETE FROM search_index WHERE kind='project' AND entity_id=old.id; END;
CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks BEGIN INSERT INTO search_index VALUES('task',new.id,new.project_id,new.id,new.title,new.description||' '||new.assignee); END;
CREATE TRIGGER tasks_search_update AFTER UPDATE ON tasks BEGIN
 DELETE FROM search_index WHERE kind='task' AND entity_id=old.id;
 INSERT INTO search_index VALUES('task',new.id,new.project_id,new.id,new.title,new.description||' '||new.assignee);
END;
CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN DELETE FROM search_index WHERE kind='task' AND entity_id=old.id; END;
CREATE TRIGGER notes_search_insert AFTER INSERT ON notes BEGIN INSERT INTO search_index VALUES('note',new.id,new.project_id,new.task_id,'备注',new.body); END;
CREATE TRIGGER notes_search_update AFTER UPDATE ON notes BEGIN
 DELETE FROM search_index WHERE kind='note' AND entity_id=old.id;
 INSERT INTO search_index VALUES('note',new.id,new.project_id,new.task_id,'备注',new.body);
END;
CREATE TRIGGER notes_search_delete AFTER DELETE ON notes BEGIN DELETE FROM search_index WHERE kind='note' AND entity_id=old.id; END;
`,
} as const
