# Gold Signal Room — standalone weekly, monthly and yearly Gold alerts

A separate Cloudflare Pages application for the Gold Breakout 15M strategy from SignalToScript. It copies the existing real gold candle and strategy engine, without modifying the strategy logic or publishing fabricated results.

## Included
- Visitors see 30-day historical candles, completed trades, modeled net P&L, win rate, win count, returns and historical BUY/SELL/EXIT markers.
- New public signals and the current public strategy status are delayed **30 minutes AFTER the confirming 15-minute candle closes**. The delay is enforced in /api/data before returning candles, events, trade history and status. The UI does not receive unreleased candles.
- Member sessions receive the latest confirmed candle results. The signal algorithm uses closed 15m candles, not an intrabar live quote.
- Visitor popup after 45 seconds and subsequent 2-minute re-invitations; dismissing retains the delayed feed.
- Black Friday prices: **7 days $4.99 (regular $12.49)**, **30 days $14.99 (regular $37.49)** and **365 days $89.99 (regular $224.99)** — all advertised at 60% off; see `/pricing.html` and the home-page cards. No repeating after a membership request in that page session.
- Request form stores the selected weekly/monthly/yearly plan in Cloudflare D1, optional email to operator via Resend.
- Admin page at /admin.html to list new requests, mark contacted/closed, and **explicitly mark payment confirmed and generate a monthly code**.
- Login with verified email + reusable high-entropy code; server verifies hashed code, code expiry, account expiry and HttpOnly cookie each data request.
- New code extends an active membership by the selected 7, 30 or 365 days from existing expiration, or starts that term from issuance if expired. Nothing is auto-billed. Optional email of member code.
- 60-day backtesting only for current members, matching the previous workspace's extended-history rule.

## Member-only instant alert delivery

The standalone site includes member-managed **email, Discord webhook and Telegram bot alerts** under the **Instant alerts** section. Members can opt in, disconnect and send limited test notifications. Discord webhooks are encrypted in D1. The member's selected plan expiry governs delivery.

**A separate one-minute Cloudflare Cron Worker must be deployed** to deliver new confirmed Gold BUY/SELL/EXIT signals while the website is closed. Pages-only deployment does not run background notifications.

Complete setup instructions: [Instant alerts — Cloudflare setup](docs/instant-alerts.md).

## Deploy as a NEW Cloudflare Pages project

Use the existing GitHub repository and create a second Cloudflare Pages project. Choose:
- Root directory: gold-membership
- Build command: leave empty (static site)
- Build output directory: public
- Production branch: main after merging
- Functions are found in the root directory's functions/ folder.

Create a Cloudflare D1 database for this new site (a separate DB is recommended). Bind it as **DB** in the new Pages project under Settings > Bindings. Either run schema.sql against it or let the Functions create the tables on the first request.

Set **ADMIN_KEY** (required, any nonempty value) as a secret environment variable. Existing short keys work; use a hard-to-guess secret for public deployments. To send email notifications and member codes automatically, set **RESEND_API_KEY**, **RESEND_FROM_EMAIL** (verified sender), and **OWNER_EMAIL**. Without Resend, requests are still stored and newly issued codes are displayed once in /admin.html for manual delivery.

The admin secret is intentionally never persisted in localStorage. Open /admin.html, enter ADMIN_KEY each time, review D1 requests, confirm payment yourself, generate code and send it to the user. The customer enters their email and code in the site login dialog. If a customer renews early, their selected plan's 7, 30 or 365 days are added to the existing expiry.

For local test: node --test tests/*.test.mjs (Node 20+). For Cloudflare Pages functions locally, use Wrangler Pages dev with an appropriately configured local D1 binding.

## Important before monetizing

The original `signaltoscript.com/trial.html` now redirects to this dedicated Gold Room. Its former `/api/trial/data` endpoint returns HTTP 410 to prevent bypassing the public 30-minute delay, and the old free-trial signup route is retired. Main-domain banners and Gold article CTAs link to the new pricing page. If the old `signal-to-script-gold-alerts` Cron Worker is still deployed on Cloudflare, disable its Cron Trigger when switching fully to the new Gold Room.

P&L is a modeled result from the existing engine ($100,000 capital, 1% fixed risk per completed trade, $0.30 spread, no compounding). Do not use the historical results as a claim of realized trading profit.

Protect admin access with Cloudflare Access or WAF/rate limiting before significant traffic. The code is strong and hashed, but no identity proof exists beyond possession of the assigned email + code. Never expose ADMIN_KEY to browser source, GitHub, or analytics. Separate Pages deployments must not expose the new D1/admin bindings to the original website.

Existing chart ingestion uses Yahoo GC=F with a spot Gold fallback (XAUUSD), and retained D1 candle history. Symbol/source changes are reported in the API and interface. The published feed reflects latest **confirmed strategy candles**; it is not an exchange-executed trade feed.
