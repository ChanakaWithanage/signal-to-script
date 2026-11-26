-- Run against the D1 database bound as DB. The Pages functions also ensure these tables exist.
CREATE TABLE IF NOT EXISTS membership_requests (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, note TEXT,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','paid','closed')),
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
