# Gold Signal Room — standalone monthly and yearly Gold alerts

A separate Cloudflare Pages application for the Gold Breakout 15M strategy from SignalToScript. It copies the existing real gold candle and strategy engine, without modifying the strategy logic or publishing fabricated results.

## Included
- Visitors see 30-day historical candles, completed trades, modeled net P&L, win rate, win count, returns and historical BUY/SELL/EXIT markers.
- New public signals and the current public strategy status are delayed **30 minutes AFTER the confirming 15-minute candle closes**. The delay is enforced in /api/data before returning candles, events, trade history and status. The UI does not receive unreleased candles.
- Member sessions receive the latest confirmed candle results. The signal algorithm uses closed 15m candles, not an intrabar live quote.
- Visitor popup after 45 seconds and subsequent 2-minute re-invitations; dismissing retains the delayed feed.
- Black Friday prices: **30 days $25 (planned regular $40)** and **365 days $200 (planned regular $320)** — 37.5% below planned regular prices. Weekly sales temporarily disabled; previously issued weekly requests and invoices remain supported; see `/pricing.html` and the home-page cards. No repeating after a membership request in that page session.
- Request form stores the selected monthly/yearly plan in Cloudflare D1, optional email to operator via Resend.
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

For local test: node --test tests/*.test.mjs (Node 22.13+). For Cloudflare Pages functions locally, use Wrangler Pages dev with an appropriately configured local D1 binding.

## Temporary customer information links

After deploying this change, open `/admin.html` and authenticate with the existing `ADMIN_KEY`. Under **Temporary customer information links**:

- **Generate 30-minute link** creates a new independent URL. Copy it immediately; the complete URL is available only in the current admin page session. You can paste that URL into a message or PDF yourself. Refreshing the page cannot recover the token.
- **Revoke** immediately blocks future requests to that URL.
- **Regenerate** atomically revokes the selected URL and creates a fresh 30-minute replacement. It also works for expired or revoked links; an already replaced link cannot be regenerated again. Other independent links remain valid.
- **Refresh links** lists the latest 100 records, including expired/revoked ones. Tokens and their hashes are never returned in the list.

The URL contains only a random 256-bit bearer token. D1 table `membership_support_links` stores its SHA-256 hash, a separate random management ID, creation/expiration timestamps and revocation/replacement metadata; no customer data is accepted or stored. The table and index are created automatically on first use with the existing `DB` binding (also included in `schema.sql`). No new secrets, packages, or deployment bindings are needed. This link never creates a membership, session, payment or access code.

`GET /support/<token>` and `HEAD` check D1 server-side on every request. Unknown, expired (including the exact expiration boundary) or revoked tokens receive the same 404 page without contact details. Database errors fail closed with 503. HTML and JSON responses, including errors, use `private, no-store`, `noindex, nofollow, noarchive` and `no-referrer`; there are no analytics or third-party resources on this page. Do not add a cache override to `/support/*` or `/api/admin/support-links`, or log full bearer URLs in application/edge analytics. Platform infrastructure may otherwise retain request paths; treat shared URLs as secrets while active.

The customer page rechecks availability every 10 seconds, hides information on failure (with a five-second request timeout), counts down using server time, and revalidates when returning to the page. Revocation prevents new successful requests immediately; an already open page normally hides within 10 seconds, or within 15 seconds if the check times out. A browser that is suspended cannot run timers, and material someone has already copied cannot be recalled.

The support page includes `support@signaltoscript.com` and the existing website membership request link. It explicitly states that Fiverr order discussions and payments stay on Fiverr and external email is only for permitted access delivery. It does not claim Fiverr has approved a particular contact method or use temporary links to bypass platform rules.

Validation: `node --test tests/*.test.mjs` (Node 22.13+ for the real SQLite tests, matching CI). The temporary-link tests cover admin authentication/origin checks, hashed storage, exact expiry, revocation, transactional regeneration/rollback, safe customer links, unavailable responses, and open-page hiding. Merging is not proof of deployment: verify the new admin section and generate a fresh URL on the deployed app before sharing or creating a PDF.

## Important before monetizing

The original `signaltoscript.com/trial.html` now redirects to this dedicated Gold Room. Its former `/api/trial/data` endpoint returns HTTP 410 to prevent bypassing the public 30-minute delay, and the old free-trial signup route is retired. Main-domain banners and Gold article CTAs link to the new pricing page. If the old `signal-to-script-gold-alerts` Cron Worker is still deployed on Cloudflare, disable its Cron Trigger when switching fully to the new Gold Room.

P&L is a modeled result from the existing engine ($100,000 capital, 1% fixed risk per completed trade, $0.30 spread, no compounding). Do not use the historical results as a claim of realized trading profit.

Protect admin access with Cloudflare Access or WAF/rate limiting before significant traffic. The code is strong and hashed, but no identity proof exists beyond possession of the assigned email + code. Never expose ADMIN_KEY to browser source, GitHub, or analytics. Separate Pages deployments must not expose the new D1/admin bindings to the original website.

Existing chart ingestion uses Yahoo GC=F with a spot Gold fallback (XAUUSD), and retained D1 candle history. Symbol/source changes are reported in the API and interface. The published feed reflects latest **confirmed strategy candles**; it is not an exchange-executed trade feed.
