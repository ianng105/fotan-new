-- D1 Database Schema — 100% Cloudflare (Baileys DO replaces wuzapi)
-- Run: npx wrangler d1 execute wuzapi-db --file=schema.sql

-- Registered WhatsApp bots (one per DO instance)
CREATE TABLE IF NOT EXISTS userbots (
  id TEXT PRIMARY KEY,            -- bot UUID
  name TEXT NOT NULL,             -- display name (maps to DO idFromName)
  token TEXT NOT NULL,            -- auth token
  phone TEXT DEFAULT '',          -- WhatsApp JID
  connected INTEGER DEFAULT 0,    -- 0/1
  logged_in INTEGER DEFAULT 0,    -- 0/1
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Message history
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userbot_name TEXT NOT NULL,     -- which bot
  phone TEXT NOT NULL,            -- JID
  text TEXT NOT NULL,             -- message body
  direction TEXT DEFAULT 'out',   -- 'in' / 'out'
  status TEXT DEFAULT 'sent',     -- sent, delivered, read, failed
  created_at TEXT DEFAULT (datetime('now'))
);

-- API keys for auth
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,       -- the key value
  name TEXT DEFAULT '',           -- label
  active INTEGER DEFAULT 1,      -- 0/1
  last_used TEXT,                 -- last usage timestamp
  created_at TEXT DEFAULT (datetime('now'))
);

-- Default admin key
INSERT OR IGNORE INTO api_keys (key, name) VALUES ('my-admin-secret-token', 'Default Admin Key');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_userbot ON messages(userbot_name);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
