#!/usr/bin/env python3
"""Verify that optional membership and the four guest-gated download links are connected."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
public = root / "public"
slugs = {p.stem for p in (public / "scripts").glob("*.pine")}
assert len(slugs) >= 4, "Expected at least four downloadable Pine Scripts"

for page in public.rglob("*.html"):
    if page.name == "404.html":
        continue
    html = page.read_text(encoding="utf-8")
    assert "—" not in html, f"Em dash in {page}"
    assert 'href="/join.html"' in html, f"Signup navigation missing in {page}"
    assert "ca-pub-9855777255503695" in html, f"AdSense missing in {page}"
    for slug in re.findall(r"/api/download\?script=([a-z0-9-]+)", html):
        assert slug in slugs, f"Unknown Pine Script {slug} in {page}"

for slug in slugs:
    for name in ("download", "count"):
        source = (root / f"functions/api/{name}.js").read_text(encoding="utf-8")
        assert f"'{slug}'" in source, f"Script not allowlisted: {slug} in {name}"

for path in ("public/site.js", "public/join.js", "public/join.html", "public/privacy.html",
             "functions/api/access.js", "functions/api/join.js", "functions/api/logout.js",
             "functions/_lib/download-access.js"):
    assert (root / path).exists(), path

helper = (root / "functions/_lib/download-access.js").read_text(encoding="utf-8")
assert "INSERT OR IGNORE INTO free_guest_downloads" in helper, "Missing atomic guest quota"
assert "HttpOnly" in helper and "SameSite=Lax" in helper, "Missing secure session cookie"
assert "showModal()" in (public / "site.js").read_text(encoding="utf-8")
assert "free_download_sessions" in (root / "functions/api/join.js").read_text(encoding="utf-8")
print("Optional signup, guest quota and all four download routes verified.")
