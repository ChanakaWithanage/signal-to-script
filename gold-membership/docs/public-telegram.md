# Public Telegram channel — automatic Gold Signal Room marketing

This runs on the existing gold-signal-room-alerts Worker and its existing DB binding. No additional Worker, database, bot webhook or paid service is needed. The paid private alerts continue unchanged.

## Quick setup

1. In Telegram create a **public channel**, e.g. Gold Signal Room | Free Gold Updates. Choose an available public username. Copy the @username (not the bot username).
2. Open channel settings → Administrators → Add administrator. Select your existing Gold alerts bot and grant **Post Messages**. If you have no bot, use @BotFather, /newbot, and add the new bot as administrator. Do not share the token publicly.
3. On Cloudflare **Workers & Pages → gold-signal-room-alerts → Settings → Variables and Secrets**, set:
   - PUBLIC_TELEGRAM_CHANNEL = @your_actual_channel_username
   - PUBLIC_TELEGRAM_ENABLED = true
   - Existing TELEGRAM_BOT_TOKEN can be reused. Alternatively add a separate encrypted PUBLIC_TELEGRAM_BOT_TOKEN for the public channel.
4. Deploy the updated existing Worker from the repository root:
   
       npx wrangler deploy --config gold-membership/workers/wrangler.toml

   In the actual local wrangler.toml (not just the example), preserve the existing D1 database UUID and other vars. Set PUBLIC_TELEGRAM_ENABLED and PUBLIC_TELEGRAM_CHANNEL in its [vars] section, or manage them in the dashboard after deployment; Wrangler may otherwise overwrite text variables. Ensure the one-minute cron remains enabled. If this Worker has not yet been deployed, follow docs/instant-alerts.md first. Do not deploy a second instance.
5. Optional: on the **gold-signal-room Pages project** set PUBLIC_TELEGRAM_CHANNEL to the same @username, then redeploy Pages. The dashboard will show a free Telegram follow button. This variable is only the public username, not the bot token. No Pages webhook setup is needed for channel publishing.

## Channel description (copy into Telegram)

Gold Breakout 15M | Free delayed BUY, SELL & EXIT updates, daily ranges and weekly strategy scorecards. See every recorded win and loss. Members get confirmed signals without the added delay. Instant alerts from $25 / 30 days: https://gold.signaltoscript.com/pricing.html

## Pinned welcome post (post and pin manually once)

🥇 GOLD SIGNAL ROOM

Follow our rule-based 15-minute Gold breakout strategy. Here you can see the delayed entries and exits, daily market ranges and weekly strategy results.

🔓 Free channel: public signals at least 30 minutes after the confirming candle closes.

⚡ Member access: confirmed BUY, SELL & EXIT notifications without the added public delay, sent to Telegram, Discord or email.

Monthly $25 · Yearly $200
No automatic billing. Choose a plan and request access.

Start with 7 days:
https://gold.signaltoscript.com/?plan=monthly&utm_source=telegram&utm_medium=channel&utm_campaign=gold_room&utm_content=welcome#pricing

See results and all plans:
https://gold.signaltoscript.com/pricing.html?utm_source=telegram&utm_medium=channel&utm_campaign=gold_room&utm_content=welcome

## What is automated

- Weekday range update after the overnight range is confirmed and publicly released.
- BUY/SELL and EXIT events computed exclusively from delayed candles (at least 30 minutes after the 15m candle closes).
- Exit posts show modeled trade results; daily recaps include the actual available recorded outcomes.
- Friday scorecard if five session ranges and adequate history are available. Includes wins, losses and modeled net P&L, never cherry-picked winning trades.
- Inline buttons: direct monthly plan request, all pricing plans, and historical dashboard. Every button includes Telegram campaign attribution.
- A request originating from Telegram has a source tag such as [Telegram: signal_exit] in the existing admin notes and operator email. This is request attribution, not a click counter or payment attribution.
- First activation records a baseline rather than flooding the channel with old signals. No automated private DMs, scraping or unsolicited messages.
- No extra membership prompt step for users clicking the $25 button: after checking login status the selected monthly request dialog opens immediately.

The messages use the actual feed instrument, UTC confirmation time, and modeled figures on $100,000 with fixed 1% risk, $0.30 spread and no compounding. They do not claim actual account profits. If history is unavailable or a session is incomplete, the applicable reports are skipped. The schedule follows the strategy's UTC+3 session, not the user's phone timezone.

## Verify

Cloudflare Worker logs will show Public Telegram posts sent when a post is delivered.
D1 console:

    SELECT channel, post_id, status, datetime(updated_ms/1000,'unixepoch') AS updated_utc
    FROM gold_public_channel_posts ORDER BY updated_ms DESC LIMIT 30;

    SELECT channel, datetime(started_ms/1000,'unixepoch') AS activated_utc
    FROM gold_public_channel_state;

The first scheduled run only sets the baseline. For a quick end-to-end permission check, manually post the welcome message as the channel owner and use a subsequent real strategy event to verify bot publishing. The public bot must have Post Messages permission.

A post is atomically claimed before sending, so overlapping cron scans do not publish duplicates. Ambiguous or failed Telegram sends are not automatically retried: inspect failed/sending records and the channel first; deleting a specific claim allows retry only while that event remains eligible. This prioritizes avoiding duplicate public posts over guaranteed delivery. Old signals are not replayed after outages.

To stop publishing, set PUBLIC_TELEGRAM_ENABLED=false in the Worker. Existing public posts remain visible. Remove the optional Pages username to hide the website follow button.

## Marketing launch

Pin the welcome post, add the channel to social profiles and YouTube video descriptions, and sponsor posts in relevant channels after the public feed has built a useful visible history. Do not use the private member bot as the public landing page: the public channel is the free preview, the site is the membership conversion destination.
