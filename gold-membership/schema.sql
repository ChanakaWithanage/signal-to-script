-- Run against the D1 database bound as DB. The Pages functions also ensure these tables exist.
CREATE TABLE IF NOT EXISTS membership_requests (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, note TEXT,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','paid','closed')),
 plan TEXT NOT NULL DEFAULT 'monthly',
 created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS membership_requests_recent ON membership_requests(created_ms DESC);
CREATE INDEX IF NOT EXISTS membership_requests_email ON membership_requests(email,created_ms DESC);
CREATE TABLE IF NOT EXISTS memberships (
 email TEXT PRIMARY KEY, created_ms INTEGER NOT NULL,
 access_until_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS membership_codes (
 code_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_ms INTEGER NOT NULL,
 valid_until_ms INTEGER NOT NULL, revoked_ms INTEGER,
 FOREIGN KEY(email) REFERENCES memberships(email)
);
CREATE INDEX IF NOT EXISTS membership_codes_email ON membership_codes(email);
CREATE TABLE IF NOT EXISTS membership_sessions (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL,
 created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS membership_sessions_email ON membership_sessions(email,expires_ms);


-- Member-only real-time notification channels (email / Discord / Telegram).
CREATE TABLE IF NOT EXISTS gold_alert_preferences (
 email TEXT PRIMARY KEY,
 email_enabled INTEGER NOT NULL DEFAULT 0,
 discord_cipher TEXT,
 telegram_chat_id TEXT,
 telegram_connect_hash TEXT,
 telegram_connect_expires_ms INTEGER,
 email_enabled_ms INTEGER,
 discord_enabled_ms INTEGER,
 telegram_enabled_ms INTEGER,
 updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gold_alert_state (
 id TEXT PRIMARY KEY, started_bar_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gold_alert_deliveries (
 event_id TEXT NOT NULL, email TEXT NOT NULL, channel TEXT NOT NULL,
 status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
 last_error TEXT, updated_ms INTEGER NOT NULL,
 PRIMARY KEY(event_id,email,channel)
);
CREATE TABLE IF NOT EXISTS gold_alert_test_limits (
 email TEXT NOT NULL, channel TEXT NOT NULL, last_test_ms INTEGER NOT NULL,
 PRIMARY KEY(email,channel)
);

-- Temporary information pages; never store a plaintext bearer token or customer details.
CREATE TABLE IF NOT EXISTS membership_support_links (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL,
 revoked_ms INTEGER, replaced_by TEXT
);
CREATE INDEX IF NOT EXISTS membership_support_links_recent ON membership_support_links(created_ms DESC);
