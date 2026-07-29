PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted'))
);

CREATE TABLE IF NOT EXISTS profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  nickname TEXT,
  bio TEXT,
  avatar_key TEXT,
  pronouns TEXT,
  birthday TEXT,
  gender TEXT,
  favourite_genres TEXT NOT NULL DEFAULT '[]',
  reading_visibility TEXT NOT NULL DEFAULT 'approximate' CHECK(reading_visibility IN ('reading','book','approximate','private')),
  allow_followers INTEGER NOT NULL DEFAULT 1,
  allow_message_requests INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  author TEXT,
  series TEXT,
  volume TEXT,
  isbn10 TEXT,
  isbn13 TEXT,
  language TEXT,
  cover_url TEXT,
  edition_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  notebook_id TEXT,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  note_type TEXT NOT NULL CHECK(note_type IN ('Thought','Reaction','Review','Theory','Question','Recommendation','Quote','Reading update')),
  body TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('private','followers','public','notebook','direct')),
  chapter TEXT,
  volume TEXT,
  page TEXT,
  spoiler_scope TEXT NOT NULL DEFAULT 'No spoilers',
  spoiler_boundary TEXT,
  image_key TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  reply_count INTEGER NOT NULL DEFAULT 0,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  spoiler_scope TEXT NOT NULL DEFAULT 'No spoilers',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS reactions (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'heart',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(note_id, account_id, reaction)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(follower_id, followed_id),
  CHECK(follower_id <> followed_id)
);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('public','private','invite-only')),
  cover_key TEXT,
  rules TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notebook_members (
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','moderator','member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(notebook_id, account_id)
);

CREATE TABLE IF NOT EXISTS notebook_reading_list (
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(notebook_id, book_id)
);

CREATE TABLE IF NOT EXISTS saved_notes (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(account_id, note_id)
);

CREATE TABLE IF NOT EXISTS reading_presence (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('reading','book','approximate','private')),
  chapter_bucket TEXT,
  volume_bucket TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(conversation_id, account_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT,
  shared_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  shared_book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  shared_notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  entity_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS rating_sources (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_book_id TEXT NOT NULL,
  rating REAL NOT NULL CHECK(rating >= 0 AND rating <= 5),
  rating_count INTEGER NOT NULL CHECK(rating_count >= 0),
  edition_match REAL NOT NULL CHECK(edition_match >= 0 AND edition_match <= 1),
  collected_at TEXT NOT NULL,
  PRIMARY KEY(book_id, source_name, source_book_id)
);

CREATE INDEX IF NOT EXISTS idx_notes_public_created ON notes(visibility, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_book_created ON notes(book_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_notebook_created ON notes(notebook_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_replies_note_created ON replies(note_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_presence_book ON reading_presence(book_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_account_created ON notifications(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_book ON rating_sources(book_id, collected_at DESC);
