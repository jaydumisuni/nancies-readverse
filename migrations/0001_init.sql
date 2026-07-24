PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('comic', 'manga', 'manhwa', 'manhua', 'graphic_novel', 'light_novel', 'web_novel', 'novel', 'book')),
  title TEXT NOT NULL,
  subtitle TEXT,
  creator TEXT,
  series_title TEXT,
  volume_number REAL,
  issue_number REAL,
  description TEXT,
  cover_url TEXT,
  source_id TEXT,
  source_item_url TEXT,
  format TEXT,
  file_key TEXT,
  favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0, 1)),
  saved_file INTEGER NOT NULL DEFAULT 0 CHECK (saved_file IN (0, 1)),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reading_progress (
  item_id TEXT PRIMARY KEY REFERENCES library_items(id) ON DELETE CASCADE,
  locator TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  categories_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  health TEXT NOT NULL DEFAULT 'untested',
  requires_browser INTEGER NOT NULL DEFAULT 0 CHECK (requires_browser IN (0, 1)),
  last_success_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_jobs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  content_kind TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  fetch_lanes INTEGER NOT NULL DEFAULT 10,
  verification_lanes INTEGER NOT NULL DEFAULT 2,
  progress_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gogo_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  personality TEXT NOT NULL DEFAULT 'sweet_flirty',
  chatter_level TEXT NOT NULL DEFAULT 'balanced',
  reading_interruptions TEXT NOT NULL DEFAULT 'important_only',
  catchphrases_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO gogo_preferences (id) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_library_title ON library_items(title);
CREATE INDEX IF NOT EXISTS idx_library_series ON library_items(series_title);
CREATE INDEX IF NOT EXISTS idx_library_favourite ON library_items(favourite);
CREATE INDEX IF NOT EXISTS idx_sources_enabled_priority ON sources(enabled, priority DESC);
CREATE INDEX IF NOT EXISTS idx_search_jobs_status ON search_jobs(status, created_at);
