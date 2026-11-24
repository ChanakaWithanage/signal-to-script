#!/usr/bin/env python3
"""Check premium NOWPayments checkout is protected and existing free scripts stay free."""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
public=root/"public"
slugs=["portfolio-trend-dashboard","gold-breakout-15m","supertrend-dema-reversal"]
home=(public/"index.html").read_text(encoding="utf-8")
free=(root/"functions/api/download.js").read_text(encoding="utf-8")
guard=(root/"functions/scripts/_middleware.js").read_text(encoding="utf-8")
premium=(root/"functions/api/premium.js").read_text(encoding="utf-8")
provider=(root/"functions/_lib/premium.js").read_text(encoding="utf-8")
ipn=(root/"functions/api/nowpayments-ipn.js").read_text(encoding="utf-8")
checkout=(public/"checkout.html").read_text(encoding="utf-8")
frontend=(public/"checkout.js").read_text(encoding="utf-8")
site=(public/"site.js").read_text(encoding="utf-8")

for slug in slugs:
    assert not (public/"scripts"/(slug+".pine")).exists(), f"Paid source publicly accessible: {slug}"
    assert f"'{slug}'" not in free, f"Paid slug in free API: {slug}"
    assert f"'{slug}.pine'" in guard, f"Direct premium URL not blocked: {slug}"
    if slug == "gold-breakout-15m":
        assert 'href="/trial.html"' in home and 'Gold Breakout 15M' in home, "Gold should lead with the free trial"
    else:
        assert f'href="/checkout?script={slug}' in home, f"Missing checkout link: {slug}"
        assert f'data-buy-script="{slug}"' in home, f"Missing buy tracker: {slug}"
    assert f'data-download-script="{slug}"' not in home, f"Paid CTA marked as free: {slug}"
assert home.index('id="premium-scripts"')<home.index('id="free-scripts"')
assert "Get Gold Breakout alerts for free" in home and "7 days free" not in home
assert "$4.99" not in home.split('gold-library-feature',1)[1].split('<div class="feature"',1)[0]
assert "$4.99" in checkout and "$12.99 crypto" in checkout
assert 'href="/trial.html"' in home and "Try it before you buy" not in home
assert "CURRENT_USER_PASSWORD" not in premium
assert 'name="robots" content="noindex, nofollow"' in checkout
assert "Planned regular price" in checkout and "$12.99 crypto" in checkout
assert "FOUNDERS LAUNCH" in checkout and "Get Gold Breakout alerts for free" in checkout
assert "NOWPayments" in checkout and "NOWPayments" in premium
assert "NOWPAYMENTS_API_KEY" in provider and "NOWPAYMENTS_IPN_SECRET" in provider
assert "PREMIUM_CHECKOUT_ENABLED" in provider, "Checkout must be disabled until explicitly enabled"
assert 'storageAvailable(env,slug)' in premium and "PREMIUM_BUCKET?.get" in premium
assert "checkMinimum" in premium and "min-amount?" in provider, "Minimum must be checked before invoice"
assert "invoice" in premium and "invoice_url" in provider
assert "validInvoiceUrl" in premium, "Invoice URL host must be validated"
assert "validateSignature" in ipn and "x-nowpayments-sig" in ipn
assert "crypto.subtle.verify" in provider, "IPN must have cryptographic HMAC verification"
assert "event.payment_status!=='finished'" in ipn and "matchesPayment(row,payment)" in ipn
assert "provider(env,'payment/'+paymentId" in ipn, "Webhook must verify status through provider API"
assert "payment_id TEXT UNIQUE" in provider, "No payment reuse across orders"
assert "localStorage" in frontend and "api('download'" in frontend, "Keep order access in the purchasing browser"
assert "article_click" in site and "article_view" in site and "buy_click" in site
assert "guest" in (public/"join.html").read_text(encoding="utf-8").lower()
assert "data-premium-article=" in (public/"articles/gold-breakout-15m-strategy.html").read_text(encoding="utf-8")
assert "data-premium-article=" in (public/"articles/supertrend-dema-reversal-strategy.html").read_text(encoding="utf-8")
print("NOWPayments premium checkout, pricing, private delivery and signed payment verification wired.")
