#!/usr/bin/env python3
"""Verify guest quota and Google unlimited download access are wired correctly."""
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
public=root/"public"
slugs={p.stem for p in (public/"scripts").glob("*.pine")}
assert len(slugs)>=5, "Expected all five published Pine Scripts"
for page in public.rglob("*.html"):
    if page.name=="404.html":
        continue
    html=page.read_text(encoding="utf-8")
    assert "—" not in html, f"Em dash in {page}"
    assert 'href="/join.html"' in html, f"Sign-in navigation missing in {page}"
    if page.name not in {"join.html", "privacy.html", "terms.html", "refunds.html"}:
        assert "ca-pub-9855777255503695" in html, f"AdSense missing in {page}"
    else:
        assert "googlesyndication.com" not in html, f"Ads should not load on sign-in or policy pages: {page}"
    assert "guest" in (public/"join.html").read_text(encoding="utf-8").lower(), "Guest option missing"
    assert 'href="/api/download?script=' not in html, f"Direct API URL exposed as download link: {page}"
    downloads = re.findall(r'<a\b[^>]*href="/join\.html\?script=([a-z0-9-]+)"[^>]*>', html)
    for slug in downloads:
        assert slug in slugs, (page, slug)
    assert len(downloads) == html.count('data-download-script='), f"Each download link needs a working JS hook: {page}"

for slug in slugs:
    for name in ("download","count"):
        source=(root/f"functions/api/{name}.js").read_text(encoding="utf-8")
        assert f"'{slug}'" in source, f"Missing {slug} in {name}"
for path in ("public/site.js","public/join.js","public/join.html","public/privacy.html",
             "functions/api/access.js","functions/api/join.js","functions/api/logout.js",
             "functions/api/google-login.js","functions/_lib/download-access.js",
             "functions/scripts/_middleware.js"):
    assert (root/path).exists(),path

site=(public/"site.js").read_text(encoding="utf-8")
join=(public/"join.js").read_text(encoding="utf-8")
helper=(root/"functions/_lib/download-access.js").read_text(encoding="utf-8")
download=(root/"functions/api/download.js").read_text(encoding="utf-8")
access=(root/"functions/api/access.js").read_text(encoding="utf-8")
guard=(root/"functions/scripts/_middleware.js").read_text(encoding="utf-8")
assert "showModal()" in site and "mountGoogleButton" in site
assert "a[data-download-script]" in site and "a.dataset.downloadScript" in site
assert "google-login" in site, "Google login must work from download dialog"
assert "signal-signed-in" in join and "downloadSelected()" in join
assert "gate-guest" in site and "join-guest" in join, "Guest download buttons must exist"
assert site.index('gate-google-primary') < site.index('class="gate-guest"'), "Sign-in must appear before guest option in popup"
join_html=(public/"join.html").read_text(encoding="utf-8")
assert join_html.index('class="join-google-primary"') < join_html.index('id="join-guest"'), "Sign-in must appear before guest option on join page"
css=(public/"styles.css").read_text(encoding="utf-8")
assert ".gate-google-primary" in css and ".join-google-primary" in css, "Primary Google sign-in styling missing"
assert "claimGuestDownload" in download, "Keep one-download guest quota"
assert 'id="google-button"' in (public/"join.html").read_text(encoding="utf-8")
assert "free_google_sessions" in (root/"functions/api/google-login.js").read_text(encoding="utf-8")
assert "verifyGoogleCredential" in (root/"functions/api/google-login.js").read_text(encoding="utf-8")
assert "HttpOnly" in helper and "SameSite=Lax" in helper
assert "free_guest_downloads" in helper and "INSERT OR IGNORE" in helper and "guestUsed" in helper
assert "guestUsed" in access and "guestLimit:1" in access
assert "claimGuestDownload" in download and "GUEST_LIMIT_REACHED" in download
assert "status:403" in download and "Set-Cookie" in download
assert "member=await isMember(env.DB,request)" in download
assert "if(!member)" in download, "Google members must bypass guest quota"
assert "if(!env.DB)" in download, "Downloads must fail closed without D1"
assert "await isMember(env.DB,request)" in guard
assert "await next()" in guard and "SIGN_IN_REQUIRED" in guard
assert "status:401" in guard and "Cache-Control" in guard
assert "SCRIPT_BUCKET" in download and "SCRIPT_BUCKET" in guard, "Private R2 source must fail closed when enabled"
assert "gate-retry" in site and "gate-privacy" in site and "gate-full" in site
assert "if(valid)downloadSelected();return" in join
assert "Gmail" in site and "Google Drive" in (public/"privacy.html").read_text(encoding="utf-8")
assert 'href="/privacy.html"' in (public/"index.html").read_text(encoding="utf-8")
assert "410" in (root/"functions/api/join.js").read_text(encoding="utf-8")
print("One guest download and unlimited Google access wired to all 5 script routes.")

# Gold strategy conversion placement and source wiring.
gold = (public/"articles/gold-breakout-15m-strategy.html").read_text(encoding="utf-8")
assert gold.index('class="gold-lead-image"') < gold.index('id="download"') < gold.index("What makes this breakout"), "Early download CTA should immediately follow hero chart"
assert gold.count('data-download-script="gold-breakout-15m"') >= 2
assert "2026" in gold and "59.7%" in gold and "1.893" in gold
assert "gold-breakout-15m" in site
