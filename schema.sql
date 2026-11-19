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
 
-- Browser-scoped one-time guest downloads. The cookie value itself is never stored.
CREATE TABLE IF NOT EXISTS free_guest_downloads (
  token_hash TEXT PRIMARY KEY,
  script_slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Premium TRC20 checkout: three active amount lanes (1.990, 1.991, 1.992 USDT).
-- Private Pine source files are stored in R2, not in the D1 database.
CREATE TABLE IF NOT EXISTS premium_orders (
 id TEXT PRIMARY KEY,
 secret_hash TEXT NOT NULL UNIQUE,
 slug TEXT NOT NULL,
 amount_micro INTEGER NOT NULL,
 lane INTEGER NOT NULL,
 created_ms INTEGER NOT NULL,
 expires_ms INTEGER NOT NULL,
 paid_ms INTEGER,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
 tx_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_premium_orders_status ON premium_orders(status,expires_ms);
CREATE TABLE IF NOT EXISTS premium_slots (
 lane INTEGER PRIMARY KEY CHECK(lane IN (0,1,2)),
 order_id TEXT,
 hold_until_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS premium_engagement (
 date_utc TEXT NOT NULL,
 slug TEXT NOT NULL,
 event TEXT NOT NULL,
 count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(date_utc,slug,event)
);
