#!/usr/bin/env python3
"""Ensure AdSense is included once in every publishable content page."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1] / "public"
CLIENT = "ca-pub-9855777255503695"
LOADER = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
ADS_LINE = "google.com, pub-9855777255503695, DIRECT, f08c47fec0942fa0"

errors = []
ads_file = ROOT / "ads.txt"
if not ads_file.exists() or ADS_LINE not in ads_file.read_text(encoding="utf-8").splitlines():
    errors.append("public/ads.txt: publisher entry missing")

pages = sorted(p for p in ROOT.rglob("*.html") if p.name not in {"404.html", "join.html", "privacy.html", "terms.html", "refunds.html"})
for private_page in ("join.html", "privacy.html", "terms.html", "refunds.html"):
    assert LOADER not in (ROOT / private_page).read_text(encoding="utf-8"), private_page
if not pages:
    errors.append("No public HTML content pages found")

for page in pages:
    html = page.read_text(encoding="utf-8")
    match = re.search(r"<head\b[^>]*>(.*?)</head>", html, flags=re.I | re.S)
    if not match:
        errors.append(f"{page}: missing <head>")
        continue
    head = match.group(1)
    if head.count(LOADER) != 1 or CLIENT not in head:
        errors.append(f"{page}: missing/duplicate AdSense loader or wrong client")
    if not re.search(r"<script\b[^>]*\basync\b[^>]*src=[\"']" + re.escape(LOADER), head, flags=re.I):
        errors.append(f"{page}: AdSense loader missing async script tag")

if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"AdSense configuration verified across {len(pages)} content page(s).")
