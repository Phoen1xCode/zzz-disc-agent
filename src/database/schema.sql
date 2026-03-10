-- 驱动盘主表
CREATE TABLE IF NOT EXISTS drive_discs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 6),
  set_name TEXT NOT NULL,
  rarity INTEGER NOT NULL CHECK(rarity BETWEEN 1 AND 3),
  level INTEGER NOT NULL DEFAULT 0 CHECK(level BETWEEN 0 AND 15),
  main_stat TEXT NOT NULL,
  main_value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'unreviewed',
  is_equipped INTEGER NOT NULL DEFAULT 0,
  equipped_to TEXT,
  fingerprint TEXT UNIQUE,
  scan_batch_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 副词条表
CREATE TABLE IF NOT EXISTS sub_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disc_id INTEGER NOT NULL REFERENCES drive_discs(id) ON DELETE CASCADE,
  stat_type TEXT NOT NULL,
  value REAL NOT NULL,
  upgrade_count INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

-- 评分矩阵
CREATE TABLE IF NOT EXISTS score_matrix (
  disc_id INTEGER NOT NULL REFERENCES drive_discs(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  team_name TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL,
  scored_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (disc_id, character_name, team_name)
);

-- 升级日志
CREATE TABLE IF NOT EXISTS upgrade_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disc_id INTEGER NOT NULL REFERENCES drive_discs(id),
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  new_sub TEXT,
  enhanced_sub TEXT,
  decision TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- 分配方案快照
CREATE TABLE IF NOT EXISTS assignment_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT,
  plan TEXT NOT NULL,
  total_score REAL,
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 触发器
CREATE TRIGGER IF NOT EXISTS update_disc_timestamp
AFTER UPDATE ON drive_discs
BEGIN
  UPDATE drive_discs SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 索引
CREATE INDEX IF NOT EXISTS idx_disc_status ON drive_discs(status);
CREATE INDEX IF NOT EXISTS idx_disc_slot_set ON drive_discs(slot, set_name);
CREATE INDEX IF NOT EXISTS idx_disc_fingerprint ON drive_discs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_sub_stats_disc ON sub_stats(disc_id);
CREATE INDEX IF NOT EXISTS idx_score_char_team ON score_matrix(character_name, team_name);
CREATE INDEX IF NOT EXISTS idx_assignment_active ON assignment_snapshots(is_active);
