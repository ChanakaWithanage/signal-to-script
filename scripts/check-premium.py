#!/usr/bin/env python3
"""Check premium scripts never leak through free routes and checkout copy stays honest."""
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
public=root/"public"
premium=["gold-breakout-15m","supertrend-dema-reversal"]
home=(public/"index.html").read_text(encoding="utf-8")
free=(root/"functions/api/download.js").read_text(encoding="utf-8")
guard=(root/"functions/scripts/_middleware.js").read_text(encoding="utf-8")
premium_api=(root/"functions/api/premium.js").read_text(encoding="utf-8")
library=(root/"functions/_lib/premium.js").read_text(encoding="utf-8")
checkout=(public/"checkout.html").read_text(encoding="utf-8")
site=(public/"site.js").read_text(encoding="utf-8")

for slug in premium:
    assert not (public/"scripts"/(slug+".pine")).exists(), f"Paid source published under static scripts: {slug}"
    assert f"'{slug}'" not in free, f"Paid slug in free API: {slug}"
    assert f"'{slug}.pine'" in guard, f"Missing paid static route block: {slug}"
    assert f'href="/checkout.html?script={slug}"' in home, f"Premium CTA missing: {slug}"
    assert f'data-buy-script="{slug}"' in home
    assert f'/{slug}' not in (public/"join.html").read_text(encoding="utf-8")

assert home.index('id="premium-scripts"') < home.index('id="free-scripts"'), "Premium products must be first"
assert "1.99 USDT" in home and "Planned regular 4.99 USDT" in home
assert "Black Friday" in home
assert 'name="robots" content="noindex, nofollow"' in checkout
assert "Planned regular 4.99 USDT" in checkout and "~60% launch saving" in checkout
assert "November 30, 2026" in checkout and "not a claim that this script previously sold" in checkout
assert "PREMIUM_CHECKOUT_ENABLED" in premium_api, "Checkout must start disabled by default"
assert 'if(!(await storageAvailable(env,slug)))' in premium_api, "Do not accept payments until R2 file exists"
assert "receipt?.result!=='SUCCESS'" in library and "only_confirmed" in library
assert "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" in library
assert "TYemkXWco4P6h1UCVgvneiMhiVaDpqVBwq" in library
assert "for(let lane=0;lane<3;lane++)" in library
assert "tx_hash TEXT UNIQUE" in library
assert "article_click" in site and "buy_click" in site and "article_view" in site
assert "PREMIUM_BUCKET" in premium_api and "PREMIUM_BUCKET.get" in premium_api
assert "guest" in (public/"join.html").read_text(encoding="utf-8").lower(), "Free guest path must survive"
assert "data-premium-article=" in (public/"articles/gold-breakout-15m-strategy.html").read_text(encoding="utf-8")
assert "data-premium-article=" in (public/"articles/supertrend-dema-reversal-strategy.html").read_text(encoding="utf-8")
assert "script_downloads" in (root/"functions/api/count.js").read_text(encoding="utf-8")
print("Premium rules verified: paid sources private, free quotas preserved, pricing and checkout wiring checked.")
