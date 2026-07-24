PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  google_subject TEXT UNIQUE,
  email TEXT,
  display_name TEXT NOT NULL,
  birthday TEXT,
  gender TEXT,
  pronouns TEXT,
  status_text TEXT,
  profile_photo_url TEXT,
  selected_companion TEXT NOT NULL DEFAULT 'gojo',
  theme_id TEXT NOT NULL DEFAULT 'pink',
  setup_completed INTEGER NOT NULL DEFAULT 0 CHECK (setup_completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companion_preferences (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL,
  ring_color TEXT NOT NULL,
  chatter_level TEXT NOT NULL DEFAULT 'balanced',
  humour_level INTEGER NOT NULL DEFAULT 70 CHECK (humour_level BETWEEN 0 AND 100),
  flirt_level INTEGER NOT NULL DEFAULT 25 CHECK (flirt_level BETWEEN 0 AND 100),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, companion_id)
);

CREATE TABLE IF NOT EXISTS reader_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  item_id TEXT,
  locator TEXT,
  note_text TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reader_highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  item_id TEXT,
  locator TEXT NOT NULL,
  selected_text TEXT,
  color TEXT NOT NULL DEFAULT '#ff7eab',
  note_id TEXT REFERENCES reader_notes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_sync_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  last_sync_at TEXT,
  sync_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profiles_google_subject ON user_profiles(google_subject);
CREATE INDEX IF NOT EXISTS idx_notes_user_item ON reader_notes(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user_item ON reader_highlights(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_user ON device_sync_state(user_id, last_sync_at DESC);
