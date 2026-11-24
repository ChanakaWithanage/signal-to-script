# Gold Breakout seven-day trial — deployment and operations

## What is included
The Gold Breakout strategy trial is served at `/trial.html` and promoted from the homepage, strategy article, and checkout.

- Workspace-first onboarding: visitors enter the live Gold chart before registration. A dismissible email modal immediately activates free entry and exit alerts. Historical chart signals and available 30-day backtest results are public, so visitors can inspect the strategy first. No inbox verification is required.
- Trial begins on the first email submission; remains free for exactly 7 × 24 hours.
- 15-minute COMEX gold-futures candles from two Yahoo Finance endpoints, with an independent spot-gold candle fallback from biquote. If both feeds fail, the page shows an embedded gold price chart and retry control rather than an indefinite loading indicator. Data is not represented as the same feed as a TradingView chart.
- Server-side Gold Breakout preview engine. The paid Pine script is never exposed by trial API or browser scripts. The preview uses a 1% protective stop, 00:00–07:00 UTC+3 range and trading until 20:00 UTC+3; intrabar double breaks are intentionally excluded.
- The Gold chart is fixed at 15-minute candles. Real COMEX futures sometimes omit the broker day's first four 15-minute bars because of the exchange maintenance interval. The strategy engine accepts a session with at least 20 actual bars covering the early overnight range and final 06:00 hour; it does not invent candles. Days that are truly incomplete are skipped.
- Chart markers are generated exclusively from server-calculated ENTRY (BUY/SELL) and EXIT events on exact 15-minute candle timestamps. Large arrow/circle markers, a confirmed-signal count, recent-event navigation and two visible-range controls keep the markers legible instead of compressing 30 days to a single image. The most recent confirmed signal is initially in view; select Latest candles to return to the present.
- If both candle feeds fail, the embedded TradingView chart stays at 15 minutes but is clearly labeled as price-only while strategy overlays reconnect. It must not be presented as a fully overlaid strategy chart.
- Past entry and exit signals, completed trades, statistics and up to 30 days of confirmed chart data are publicly visible. Free trial signup activates future alerts. Extended 60-day lookback is unlocked after lifetime membership.
- Email, encrypted Discord webhook and Telegram bot notifications of newly confirmed entry/exit events while trial/member access is active.
- Upgrade messaging begins after five full days, with at most one account-scoped popup per 24 hours. The homepage and Gold article show no price or trial countdown. After seven days, past results remain public, while future notification delivery requires lifetime activation.

## Cloudflare Pages configuration
The existing Cloudflare Pages application uses `public/` as its output and `functions/` for server endpoints. Reuse the same D1 binding `DB`. Pages Functions create tables on first use, or apply `schema.sql` to D1.

Set Cloudflare Pages project secrets/environment variables:

| Key | Usage |
| --- | --- |
| `DB` | **Existing D1 binding**, shared with the scheduled worker. New subscriber tables are created on first use. |
| `TRIAL_ADMIN_KEY` | Optional private API key (32 or more characters) for the owner-only subscriber overview. Keep it in Pages secrets. |
| `RESEND_API_KEY` | Resend API key for actual signal alerts; signup itself does not require email delivery. |
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

## Subscriber counts and email lead records

Every email signup is recorded in `gold_trial_subscribers` with a unique email, first and last submission timestamps, submission count, acquisition source, UTM values, browser timezone and approximate Cloudflare country/region/city when available. No IP address is intentionally recorded in this table. Repeat submissions do not reset the seven-day trial.

Run these SQL queries in the Cloudflare D1 console:

```sql
SELECT COUNT(*) AS unique_subscribers, COALESCE(SUM(signup_count),0) AS total_submissions
FROM gold_trial_subscribers;

SELECT email, datetime(first_signup_ms/1000,'unixepoch') AS joined_utc,
       datetime(last_signup_ms/1000,'unixepoch') AS last_signup_utc,
       signup_count, country, region, timezone, utm_source, utm_campaign
FROM gold_trial_subscribers ORDER BY last_signup_ms DESC LIMIT 100;
```

To retrieve counts and the 100 most recent subscriber emails remotely, configure the `TRIAL_ADMIN_KEY` secret in Cloudflare Pages, then call:

```bash
curl -H "Authorization: Bearer $TRIAL_ADMIN_KEY" "https://signaltoscript.com/api/trial/subscribers"
```

Without the secret, the endpoint responds with 404. Do not place this key in browser JavaScript.

Instant signup establishes a browser-bound trial. Only a verified legacy sign-in or a completed purchase receipt can unlock an existing paid membership. Entering someone else's email must not give that browser their paid entitlement.

## Data resilience

The API concurrently tries both Yahoo chart hosts for 15-minute GC=F gold-futures candles, then real XAUUSD spot bars from biquote if Yahoo is throttled or blocked. It reports feed name, last confirmed candle and actual history coverage. The browser falls back to an embedded TradingView gold price chart if server-side candle data fails; the TradingView fallback does not claim to show custom strategy overlays.
## Membership access
The existing checkout continues to accept manual payment requests ($4.99) and NOWPayments crypto ($12.99) using the site's current verification. A completed private membership receipt link can be pasted into the trial dashboard's **Activate membership** field; only a verified completed receipt sets `gold_trial_accounts.lifetime=1`. Manual requests must first be marked `paid` by the operator. An unverified request cannot unlock premium access. Existing free-script Google login is separate and unaffected.

The old November 30 checkout shutdown has been removed; it would have left people who registered for a seven-day trial unable to upgrade after day seven.

## QA checklist
1. Open `/trial.html` as a guest. The workspace and real candles should load immediately behind the email dialog. Dismiss it, explore recent candles, then activate alerts by entering an email. Confirm that repeated sign-ins do not reset the original seven-day period.
2. Before sign-in verify public data is limited to a recent five-day chart with no full 30-day metrics or trades. After sign-in verify the real 15-minute chart, daily range, entry/exit markers, feed timestamp and full historical results.
3. Confirm anonymous and expired users can review past signals and available 30-day results but cannot request extended 60-day data. Extended 60-day results and the premium Pine source remain protected.
4. Enable email delivery, connect Discord and Telegram; send a test notification using a new, genuine confirmed signal (do not send historical trades).
5. Confirm only one alert is sent per event/channel. Confirm the upgrade popup never appears during days 0-4, appears starting at day five, is suppressed in other tabs for 24 hours, and never appears for lifetime users.
6. Redeem a completed manual/crypto membership receipt in the trial, check lifetime state and extended backtest; verify an unpaid receipt fails.
7. Test responsive display: 360px, 768px and desktop; verify onboarding, chart sizing, membership paywall, and keyboard tab order.
8. Run `node --test tests/gold-trial.test.mjs` on Node 22. The GitHub workflow also checks syntax of all new Cloudflare Functions and trial browser scripts.

## Seven-day and 30-day history

The Gold workspace now loads the available 15-minute OHLC dataset as a single series. It opens on **Past week**, and visitors can choose **Past 30 days**, **Latest signal** or **Latest candles**. The controls change the visible chart window, not the candle interval: all four views remain 15 minutes. The horizontal recent-signals list includes up to 100 historical events, rather than only the latest seven, and every event is clickable to locate it on the chart.

Data retrieval order:

1. Request up to 30 days of actual COMEX gold-futures 15m candles from Yahoo's two chart hosts and a third server-side Yahoo proxy route. Prefer full-range responses over partial responses.
2. Save confirmed candles to Cloudflare D1 in `gold_candle_history`, keyed by `(symbol,time_ms)`. The same scheduled alert worker updates this archive. This preserves up to 65 days of real bars against provider outages. Writes are incremental; existing bars are not rewritten every five minutes.
3. When live Yahoo retrieval fails, try the fresh retained futures history. If unavailable, use real XAUUSD spot 15m data from biquote, augmented only with *previously saved XAUUSD spot candles*. Futures and spot OHLC are never mixed.
4. Show the actual provider, last confirmed candle, dates, number of 15-minute bars and calendar-day coverage. If only two days of data exist, report that clearly rather than claim 30 days.

The biquote endpoint is a **rolling 192-bar history** (roughly two trading days), not a month-long history. A fully historical month can be displayed immediately if one of the Yahoo routes responds; D1 retention adds resilience over subsequent sessions. No synthetic history, fake signals or unverified results are created.

Apply the updated `schema.sql` or allow the server to create the `gold_candle_history` table on first write. Make sure both Cloudflare Pages and the five-minute scheduled Worker have the same `DB` D1 binding; this is required for continuous archiving. Check the `gold_candle_history` row count and timeframe:

```sql
SELECT symbol, COUNT(*) AS candles,
       datetime(MIN(time_ms)/1000,'unixepoch') AS earliest_utc,
       datetime(MAX(time_ms)/1000,'unixepoch') AS latest_utc
FROM gold_candle_history GROUP BY symbol;
```

## Data refresh and availability
The market adapter uses Yahoo `GC=F` and a separate biquote XAUUSD spot fallback for real 15-minute OHLC data. The workspace explicitly shows the feed name and the latest closed candle timestamp. This is an independently calculated preview, not an execution engine and not an exact rendering of TradingView’s `TVC:GOLD` history. For guaranteed production uptime, a provider-backed R2 candle ingestion and retention pipeline can replace the adapter without changing the UI or strategy API.

The backend is in a public repository, so while premium Pine files remain private in R2 and browser users do not receive the original source, the preview engine algorithm is readable on GitHub. If implementation secrecy is required beyond the website, move the strategy engine to a private Worker repository.
