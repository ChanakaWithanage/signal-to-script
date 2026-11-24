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

-- Unique NOWPayments hosted invoices and signed completed-payment unlocks.
-- Older premium_orders/premium_slots are historical only and not used by this checkout.
CREATE TABLE IF NOT EXISTS premium_nowpayments_orders (
 id TEXT PRIMARY KEY,
 secret_hash TEXT NOT NULL UNIQUE,
 slug TEXT NOT NULL,
 currency TEXT NOT NULL,
 amount_usd TEXT NOT NULL,
 invoice_id TEXT UNIQUE,
 invoice_url TEXT,
 status TEXT NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','waiting','paid','failed')),
 created_ms INTEGER NOT NULL,
 created_at_utc TEXT, created_at_ist TEXT,
 paid_ms INTEGER, paid_at_utc TEXT, paid_at_ist TEXT,
 visitor_session_id TEXT, visitor_country TEXT, visitor_region TEXT,
 visitor_city TEXT, visitor_timezone TEXT, visitor_browser_timezone TEXT,
 payment_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_np_invoice ON premium_nowpayments_orders(invoice_id);

-- Session-level checkout attempts, including failures before an invoice is issued.
-- Cloudflare provides approximate IP-derived geography; no IP address is retained.
CREATE TABLE IF NOT EXISTS premium_checkout_attempts (
 id TEXT PRIMARY KEY,
 session_id TEXT, provider TEXT NOT NULL, slug TEXT NOT NULL, currency TEXT,
 country TEXT, region TEXT, city TEXT, visitor_timezone TEXT, browser_timezone TEXT,
 status TEXT NOT NULL, order_id TEXT, error_code TEXT,
 created_ms INTEGER NOT NULL, created_at_utc TEXT NOT NULL, created_at_ist TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkout_attempt_time ON premium_checkout_attempts(created_ms);

-- PayPal purchases are separate from NOWPayments invoices; their payment evidence
-- is verified via PayPal's Orders v2 server API before private download delivery.
CREATE TABLE IF NOT EXISTS premium_paypal_orders (
 id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL UNIQUE, slug TEXT NOT NULL,
 amount_usd TEXT NOT NULL, paypal_order_id TEXT NOT NULL UNIQUE,
 paypal_capture_id TEXT UNIQUE, status TEXT NOT NULL,
 created_ms INTEGER NOT NULL, created_at_utc TEXT NOT NULL, created_at_ist TEXT NOT NULL,
 paid_ms INTEGER, paid_at_utc TEXT, paid_at_ist TEXT,
 visitor_session_id TEXT, visitor_country TEXT, visitor_region TEXT,
 visitor_city TEXT, visitor_timezone TEXT
);


-- One-field $4.99 script purchase requests submitted directly from checkout.
-- Email is stored only so the owner can reply; the request is not an automatic payment.
CREATE TABLE IF NOT EXISTS premium_manual_requests (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 slug TEXT NOT NULL,
 product TEXT NOT NULL,
 price_usd TEXT NOT NULL,
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new',
 notify_status TEXT NOT NULL DEFAULT 'not_configured',
 session_id TEXT,
 visitor_country TEXT,
 visitor_region TEXT,
 visitor_city TEXT,
 visitor_timezone TEXT,
 browser_timezone TEXT,
 created_ms INTEGER NOT NULL,
 created_at_utc TEXT NOT NULL,
 created_at_ist TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_requests_date ON premium_manual_requests(created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_manual_requests_email ON premium_manual_requests(email, created_ms);

-- Seven-day Gold Breakout trial; email becomes account identity after link verification.
CREATE TABLE IF NOT EXISTS gold_trial_pending (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_ms INTEGER NOT NULL,
 expires_ms INTEGER NOT NULL, used_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gold_trial_pending_email ON gold_trial_pending(email,created_ms);
CREATE TABLE IF NOT EXISTS gold_trial_accounts (
 email TEXT PRIMARY KEY,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,
 lifetime INTEGER NOT NULL DEFAULT 0,expiry_notice_sent_ms INTEGER
);
CREATE TABLE IF NOT EXISTS gold_trial_sessions (
 token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_ms INTEGER NOT NULL,created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gold_trial_sessions_email ON gold_trial_sessions(email,expires_ms);
CREATE TABLE IF NOT EXISTS gold_trial_preferences (
 email TEXT PRIMARY KEY,email_alerts INTEGER NOT NULL DEFAULT 1,
 discord_webhook_cipher TEXT,telegram_chat_id TEXT,telegram_connect_hash TEXT,
 telegram_connect_expires_ms INTEGER,updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gold_trial_deliveries (
 event_id TEXT NOT NULL,email TEXT NOT NULL,channel TEXT NOT NULL,
 status TEXT NOT NULL,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,
 PRIMARY KEY(event_id,email,channel)
);
CREATE TABLE IF NOT EXISTS gold_trial_state (
 id TEXT PRIMARY KEY,last_event_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL
);

-- Account-scoped upgrade prompts begin only after five days of active history.
CREATE TABLE IF NOT EXISTS gold_trial_offer_prompts (
 email TEXT PRIMARY KEY,last_shown_ms INTEGER NOT NULL,
 shown_count INTEGER NOT NULL DEFAULT 1
);

-- Zero-verification Gold subscribers: browser sessions must not inherit a paid
-- account's entitlement without proof from a completed purchase receipt.
CREATE TABLE IF NOT EXISTS gold_trial_instant_sessions (
 token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,proven INTEGER NOT NULL DEFAULT 0,
 created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gold_trial_subscribers (
 email TEXT PRIMARY KEY,first_signup_ms INTEGER NOT NULL,last_signup_ms INTEGER NOT NULL,
 signup_count INTEGER NOT NULL DEFAULT 1,source TEXT,country TEXT,region TEXT,city TEXT,
 timezone TEXT,referrer TEXT,utm_source TEXT,utm_medium TEXT,utm_campaign TEXT
);
CREATE INDEX IF NOT EXISTS idx_gold_trial_subscribers_last ON gold_trial_subscribers(last_signup_ms DESC);

-- Persist confirmed 15-minute gold OHLC bars for longer history and outages.
-- Each instrument has its own independent series: never merge GC=F with XAUUSD.
CREATE TABLE IF NOT EXISTS gold_candle_history (
 symbol TEXT NOT NULL,
 time_ms INTEGER NOT NULL,
 open REAL NOT NULL,
 high REAL NOT NULL,
 low REAL NOT NULL,
 close REAL NOT NULL,
 source TEXT NOT NULL,
 PRIMARY KEY(symbol,time_ms)
);
