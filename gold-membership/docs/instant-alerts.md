# Gold Signal Room — Instant member alerts

The standalone Gold Signal Room supports **email, Discord and Telegram notifications**, independently of the open browser. Active weekly, monthly or yearly members configure their channels under **Instant alerts** on https://gold.signaltoscript.com; visitors see a member-only invitation.

Notifications are sent for new BUY, SELL and EXIT events **after the 15-minute signal candle closes**. A separate scheduled Cloudflare Worker checks for events every minute. The existing Gold breakout strategy is unchanged.

## 1. Existing Cloudflare Pages project: secrets

Keep the Pages project gold-signal-room, production branch main, root gold-membership, output public and D1 database binding named DB pointing to gold-signals-db. The app automatically creates new D1 tables when needed.

Open **Workers & Pages → gold-signal-room → Settings → Variables and Secrets** and configure the Production environment:

| Name | Channel | Description |
|---|---|---|
| RESEND_API_KEY | Email | Encrypted secret. Reuse your current Resend key used for membership codes. |
| RESEND_FROM_EMAIL | Email | Verified sender, e.g. Gold Signal Room <alerts@signaltoscript.com>. |
| ALERTS_ENCRYPTION_KEY | Discord | Encrypted secret, exactly 64 hexadecimal characters. |
| TELEGRAM_BOT_TOKEN | Telegram | Bot API token from @BotFather, encrypted. |
| TELEGRAM_BOT_USERNAME | Telegram | Public bot username without @. |
| TELEGRAM_WEBHOOK_SECRET | Telegram | Encrypted secret for verifying incoming Telegram messages. |
| ALERT_SITE_URL | Optional | Main site URL, e.g. https://gold.signaltoscript.com. |

Configure only the channels you want. Unconfigured channels show a setup-pending status.

Generate your Discord encryption key with:

    openssl rand -hex 32

Save that key privately and **use the identical value on Pages and the scheduled Worker**. Existing encrypted Discord webhooks cannot be read if you later change the key without reconnecting.

Redeploy Cloudflare Pages after changing bindings or secrets.

## 2. Deploy the scheduled alert Worker — required

Cloudflare Pages Functions cannot wake up on their own for background signal delivery. Deploy a separate Cloudflare Worker configured with a one-minute Cron Trigger, bound to **the same existing D1 database**.

On your local computer, from the GitHub repository root on latest main:

1. Copy gold-membership/workers/wrangler.example.toml to gold-membership/workers/wrangler.toml.
2. In the copied file, replace database_id with the real UUID from **Cloudflare → Storage & Databases → D1 → gold-signals-db**.
3. Keep the Worker name gold-signal-room-alerts, binding name DB and cron expression * * * * *.
4. Log in and deploy:

       npx wrangler login
       npx wrangler deploy --config gold-membership/workers/wrangler.toml

5. Add the channel secrets to this **Worker separately** (Pages secrets are not automatically shared):

       npx wrangler secret put RESEND_API_KEY --config gold-membership/workers/wrangler.toml
       npx wrangler secret put RESEND_FROM_EMAIL --config gold-membership/workers/wrangler.toml
       npx wrangler secret put ALERTS_ENCRYPTION_KEY --config gold-membership/workers/wrangler.toml
       npx wrangler secret put TELEGRAM_BOT_TOKEN --config gold-membership/workers/wrangler.toml

Only run commands for channels you enable. Use the same Resend key/sender, AES encryption key and Telegram token as in Pages.

The first successful run establishes a baseline and does not spam users with historical alerts. Later runs notify active members only, using opt-in timestamps and D1 delivery IDs for deduplication. Failed deliveries are retried up to three times.

## 3. Member email setup

On Gold Signal Room, log in with your email and paid membership code. Go to **Instant alerts**, enable **Email notifications**, then click **Send test email**. The email is sent to the membership address, not a user-entered arbitrary destination.

Members can disable email at any time. Automatic delivery pauses when their paid membership expires.

## 4. Member Discord setup

No separate bot is required for Discord webhooks.

1. Open Discord and select a server/channel where you have webhook management permission.
2. Go to **Edit Channel → Integrations → Webhooks → New Webhook**.
3. Copy the full webhook URL (it begins with https://discord.com/api/webhooks/).
4. In Gold Signal Room → **Instant alerts → Discord**, select **Connect Discord**, paste the URL, and save.
5. Use **Send test** to confirm that the private channel receives notifications.

Webhook URLs are encrypted before being saved in D1, never sent back to the member browser and never used for outbound requests to other domains. Members can change or disconnect a webhook.

## 5. Optional Telegram bot setup

Create a bot with **@BotFather** in Telegram using /newbot. Store TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET under your Cloudflare Pages project. Put the Telegram bot token on the scheduled Worker as well.

Register Telegram's webhook using the Bot API. Replace the token and secret with your configured values:

    curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
      -H "Content-Type: application/json" \
      -d '{"url":"https://gold.signaltoscript.com/api/telegram-webhook","secret_token":"YOUR_TELEGRAM_WEBHOOK_SECRET","allowed_updates":["message"]}'

The API callback only accepts Telegram's matching signed secret header. It binds private chats, not public groups.

Members select **Connect Telegram** on the website, open their one-time bot link, and press **Start** in Telegram. The connection code expires after 15 minutes. Returning to the website updates its status, after which they can **Send test**.

## 6. Verify everything is running

Cloudflare → D1 → gold-signals-db → Console:

    SELECT id, datetime(updated_ms/1000,'unixepoch') AS last_scan_utc
    FROM gold_alert_state;

    SELECT email,email_enabled,
      CASE WHEN discord_cipher IS NOT NULL THEN 'connected' ELSE 'off' END AS discord,
      CASE WHEN telegram_chat_id IS NOT NULL THEN 'connected' ELSE 'off' END AS telegram
    FROM gold_alert_preferences;

    SELECT event_id,channel,status,attempts,last_error
    FROM gold_alert_deliveries
    ORDER BY updated_ms DESC LIMIT 30;

The member dashboard uses the last cron heartbeat to show whether delivery scanning is active. If it says **Delivery setup pending**, confirm the Worker is deployed, the Cron Trigger is enabled and its DB binding points to gold-signals-db.

Use the built-in test-send buttons to verify email/Discord/Telegram separately. Tests are limited to one per channel per member every 10 minutes.

Delivery is triggered by **confirmed 15-minute signals**, not intrabar/tick moves, and actual arrival time also depends on market-data publication and external messaging providers.

Cloudflare reference: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Notes

- A fresh database is not required; all new notification tables are created by the existing Pages Functions and Worker.
- The same RESEND_API_KEY and RESEND_FROM_EMAIL can be used for manual membership emails and instant alerts.
- Discord encryption key rotation requires members to reconnect their webhooks.
- Active members may enable any number of supported channels; one signal is independently delivered to each.
- Members whose purchased 7, 30 or 365 days have expired receive no new notifications until they renew.
- Alert delivery operates through a separate Cron Worker. A Pages deployment alone does not activate background alerts.
