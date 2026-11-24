# Gold Breakout seven-day trial — deployment and operations

## What is included
The Gold Breakout strategy trial is served at `/trial.html` and promoted from the homepage, strategy article, and checkout.

- Email-only secure sign-in, one account per email, 20-minute single-use access links.
- Trial begins on the first successful verification; remains free for exactly 7 × 24 hours.
- 15-minute gold-futures candles from Yahoo's chart endpoint (GC=F). The source and last confirmed candle are shown in the workspace. Data is not represented as the same feed as a TradingView chart.
- Server-side Gold Breakout preview engine. The paid Pine script is never exposed by trial API or browser scripts. The preview uses a 1% protective stop, 00:00–07:00 UTC+3 range and trading until 20:00 UTC+3; intrabar double breaks are intentionally excluded.
- Up to 30 days of past trades and 30-day chart for free trial. Extended 60-day lookback is unlocked after lifetime membership.
- Email, encrypted Discord webhook and Telegram bot notifications of newly confirmed entry/exit events while trial/member access is active.
- On day 7 the user sees a lifetime upgrade offer; no recurring billing. Unexpired/paid membership receipts activate the lifetime entitlement for the account's email.

## Cloudflare Pages configuration
The existing Cloudflare Pages application uses `public/` as its output and `functions/` for server endpoints. Reuse the same D1 binding `DB`. Pages Functions create tables on first use, or apply `schema.sql` to D1.

Set Cloudflare Pages project secrets/environment variables:

| Key | Usage |
| --- | --- |
| `DB` | **Existing D1 binding**, same database shared with the scheduled worker. |
| `RESEND_API_KEY` | Resend API key for sign-in links and email alerts; reuse your existing key. |
| `TRIAL_EMAIL_FROM` | Verified sending address, e.g. `Signal to Script <alerts@yourdomain.com>`, or omit to reuse `MANUAL_REQUEST_FROM`. |
| `ALERTS_ENCRYPTION_KEY` | 32 random bytes encoded as exactly 64 hex characters; **same value** in the Cron Worker. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token created in BotFather, for webhook connection and alerts. |
| `TELEGRAM_BOT_USERNAME` | Bot username, e.g. `SignalGoldAlertsBot`, to build the connection link. |
| `TELEGRAM_WEBHOOK_SECRET` | Long secret header used to verify Telegram webhook requests. |

`TRIAL_EMAIL_FROM` and `MANUAL_REQUEST_FROM` must be verified sender addresses in Resend. Choose a mail sender address that can deliver from your verified domain.

For a development environment, use a separate D1 database and test bot if appropriate.

## Scheduled signal and notification Worker
Cloudflare Pages runs HTTP requests, but **won't send emails after a page is closed**. Deploy `workers/gold-alerts.js` as a separate Worker with a Cron Trigger.

1. Copy `workers/wrangler.example.toml` to `workers/wrangler.toml`. Set the same `DB` D1 database ID already used by Pages.
2. From repository root: `npx wrangler deploy --config workers/wrangler.toml`.
3. Add the worker secrets: `npx wrangler secret put RESEND_API_KEY --config workers/wrangler.toml`, plus `TRIAL_EMAIL_FROM`, `ALERTS_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN` (repeat for each key; the shared encryption key must match Pages).
4. Check that the Cron trigger exists at `*/5 * * * *`. The worker polls new closed bars, deduplicates by strategy event/account/channel in D1, and sends matching entry/exit alerts.
5. First Cron run establishes the initial cursor without sending stale historical alerts. Subsequent runs send only newly detected events and one trial-complete email per account. Errors are recorded in Cloudflare Worker logs and `gold_trial_deliveries`.

For Telegram, call Bot API **once** to register the Pages webhook (replace values locally, do not commit the token):

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  --data-urlencode "url=https://signaltoscript.com/api/trial/telegram-webhook" \
  --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Customers click **Connect** in the workspace, open their private Telegram bot link, and press **Start**. The bot associates their chat ID with the account via a single-use code stored as a hash.

## Membership access
The existing checkout continues to accept manual payment requests ($4.99) and NOWPayments crypto ($12.99) using the site's current verification. A completed private membership receipt link can be pasted into the trial dashboard's **Activate membership** field; only a verified completed receipt sets `gold_trial_accounts.lifetime=1`. Manual requests must first be marked `paid` by the operator. An unverified request cannot unlock premium access. Existing free-script Google login is separate and unaffected.

The old November 30 checkout shutdown has been removed; it would have left people who registered for a seven-day trial unable to upgrade after day seven.

## QA checklist
1. Open `/trial.html` as a guest; enter an email, open the single-use link from the inbox, confirm that the second click fails and that a second email link can sign the user in again without restarting their trial.
2. Verify a real, refreshed chart with 15-minute candles, daily range lines, entry/exit markers, source label, last candle timestamp, and a 30-day trade list. Live market changes require new confirmed data; prices should not be simulated.
3. Confirm unsigned users cannot fetch `/api/trial/data` and expired users get `TRIAL_ENDED`. Ensure unpaid users cannot access 60-day results and the original premium Pine source is never served from trial APIs.
4. Enable email delivery, connect Discord and Telegram; send a test notification using a new, genuine confirmed signal (do not send historical trades).
5. Verify one notification per event and channel; open the page in two tabs and ensure no duplicated deliveries.
6. Redeem a completed manual/crypto membership receipt in the trial, check lifetime state and extended backtest; verify an unpaid receipt fails.
7. Test responsive display: 360px, 768px and desktop; verify onboarding, chart sizing, membership paywall, and keyboard tab order.
8. Run `node --test tests/gold-trial.test.mjs` on Node 22. The GitHub workflow also checks syntax of all new Cloudflare Functions and trial browser scripts.

## Data refresh and availability
The market adapter uses the public Yahoo chart endpoint `GC=F` for 15-minute COMEX gold-futures candles. The workspace explicitly shows the feed name and the latest closed candle timestamp. This is an independently calculated preview, not an execution engine and not an exact rendering of TradingView’s `TVC:GOLD` history. For guaranteed production uptime, a provider-backed R2 candle ingestion and retention pipeline can replace the adapter without changing the UI or strategy API.

The backend is in a public repository, so while premium Pine files remain private in R2 and browser users do not receive the original source, the preview engine algorithm is readable on GitHub. If implementation secrecy is required beyond the website, move the strategy engine to a private Worker repository.
