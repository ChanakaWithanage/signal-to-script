#!/usr/bin/env python3
"""Verify canonical URLs, social previews, sitemap and robots for signaltoscript.com."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

public = Path(__file__).resolve().parents[1] / "public"
domain = "https://signaltoscript.com"
pages = {
    "index.html": "/",
    "articles/supertrend-dema-reversal-strategy.html": "/articles/supertrend-dema-reversal-strategy.html",
    "articles/1r-bear-breakout-achievements.html": "/articles/1r-bear-breakout-achievements.html",
    "articles/pinbar-3-line-strike-combo-alerts.html": "/articles/pinbar-3-line-strike-combo-alerts.html",
    "articles/automate-tradingview-strategies-chrome-extension.html": "/articles/automate-tradingview-strategies-chrome-extension.html",
    "join.html": "/join.html",
    "privacy.html": "/privacy.html",
    "terms.html": "/terms.html",
    "refunds.html": "/refunds.html"
}
for filename, path in pages.items():
    html = (public / filename).read_text(encoding="utf-8")
    url = domain + path
    assert html.count('rel="canonical"') == 1, filename
    assert f'<link rel="canonical" href="{url}">' in html, filename
    assert f'<meta property="og:url" content="{url}">' in html, filename
    assert "signal-to-script.pages.dev" not in html, filename
    if filename == "index.html" or filename.startswith("articles/"):
        match = re.search(r'<meta property="og:image" content="([^"]+)">', html)
        assert match and match.group(1).startswith(domain + "/images/"), filename
        asset_path = match.group(1)[len(domain) + 1:]
        assert (public / asset_path).is_file(), (filename, asset_path)

ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
xml = ET.parse(public / "sitemap.xml")
urls = [n.text for n in xml.findall(".//s:loc", ns)]
expected = {domain + path for path in pages.values()}
assert set(urls) == expected and len(urls) == len(expected), "Unexpected sitemap URLs"
for page in public.rglob("*.html"):
    html = page.read_text(encoding="utf-8")
    assert 'class="policy-links"' in html, f"Policy footer missing: {page}"
    for policy in ("/terms.html", "/refunds.html", "/privacy.html"):
        assert f'href="{policy}"' in html, f"Missing {policy} link in {page}"

robots = (public / "robots.txt").read_text(encoding="utf-8")
assert f"Sitemap: {domain}/sitemap.xml" in robots
assert "Disallow: /" not in robots
print(f"SEO checks passed: {len(pages)} canonical pages, {len(urls)} sitemap URLs.")
