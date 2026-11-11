#!/usr/bin/env python3
"""Validate Cloudflare Pages browser caching rules and API no-store protection."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
headers = (root / "public" / "_headers").read_text(encoding="utf-8")
rules = {}
current = None
for line in headers.splitlines():
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    if not line[0].isspace():
        current = line.strip()
        if current in rules:
            raise SystemExit(f"Duplicate path rule: {current}")
        rules[current] = {}
    elif current is None:
        raise SystemExit("Header before any path")
    else:
        name, sep, value = line.strip().partition(":")
        if not sep or not value.strip():
            raise SystemExit(f"Invalid header: {line}")
        if name.lower() in rules[current]:
            raise SystemExit(f"Duplicate header: {current} {name}")
        rules[current][name.lower()] = value.strip()

revalidate = "public, max-age=0, must-revalidate"
for path in ["/", "/index.html", "/articles/*", "/404.html", "/join.html", "/privacy.html", "/styles.css", "/site.js", "/join.js", "/scripts/*", "/ads.txt", "/robots.txt"]:
    assert rules[path]["cache-control"] == revalidate, path
assert rules["/images/*"]["cache-control"] == "public, max-age=3600, must-revalidate"
assert rules["/favicon.svg"]["cache-control"] == "public, max-age=86400, must-revalidate"
assert rules["/scripts/*"]["x-content-type-options"] == "nosniff"
assert "/api/*" not in rules, "Pages Functions must set Cache-Control themselves"
assert all("immutable" not in value for rule in rules.values() for value in rule.values())
assert "/_astro/*" not in rules
for path in ["functions/api/count.js", "functions/api/download.js"]:
    source = (root / path).read_text(encoding="utf-8")
    for line in source.splitlines():
        if "new Response(" in line or "Response.json(" in line:
            if "return" in line and ("status: 404" in line or "status: 503" in line):
                assert "'Cache-Control': 'no-store'" in line, (path, line)
    assert "'Cache-Control': 'no-store'" in source, path
print(f"Cache policy verified ({len(rules)} static path rules, APIs no-store).")
