CREATE TABLE IF NOT EXISTS script_downloads (
  slug TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0)
);
 
-- Google member login. Legacy unverified email data may still exist in D1.
-- Pages Functions also create these tables on first use when the DB binding exists.
CREATE TABLE IF NOT EXISTS free_download_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS free_download_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
 
-- Google sign-in identities and sessions. Legacy unverified email data is preserved
-- but the old registration endpoint is disabled.
CREATE TABLE IF NOT EXISTS free_google_members (
  google_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS free_google_sessions (
  token_hash TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
