CREATE TABLE IF NOT EXISTS script_downloads (
  slug TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0)
);
