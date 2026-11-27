# Gold VIP Telegram and NOWPayments — setup guide

The implementation is opt-in and stays off until the bot and payment credentials are configured. Reuse existing gold-signal-room Cloudflare Pages, gold-signal-room-alerts Cron Worker and gold-signals-db D1.

## 1. Telegram bot (BotFather)

1. Open the verified https://t.me/BotFather and send /newbot.
2. Suggested display name: Gold Signal Room VIP Alerts. Choose an available username ending in bot (example: GoldSignalRoomVIPBot).
3. Keep the BotFather API token secret. Never paste it in chat or commit it.
4. Set TELEGRAM_BOT_TOKEN on Gold Pages and Gold Cron Worker as an encrypted secret; set TELEGRAM_BOT_USERNAME on Gold Pages to the username without @.

## 2. Two channels

Public: Gold Signal Room | Free Gold Signals. Choose PUBLIC and an available @username. Add the bot as an administrator with Post Messages permission. Public delayed posts remain available free.

VIP: Gold Signal Room VIP | Live Alerts. Choose PRIVATE. Add the bot as an administrator with Post Messages, Invite Users via Link and Ban/Restrict Users permissions. Do not share the private invite publicly; verified paying members use personal single-use, ten-minute invitations.

To obtain the private numeric VIP channel ID, do this BEFORE setting a Telegram webhook: post a test message inside your private VIP channel after adding the bot as administrator. On your own terminal set BOT_TOKEN to your secret and run:

    export BOT_TOKEN='REPLACE_LOCALLY'
    curl -s "https://api.telegram.org/bot$BOT_TOKEN/getUpdates"

Look for channel_post → chat → id (a negative -100... value) matching your VIP channel title. Use this value as VIP_TELEGRAM_CHANNEL. If the webhook is already active, temporarily delete it and restore it after finding the ID. The public channel uses a different value, its @username.

## 3. Gold Pages Production variables

Cloudflare Workers & Pages → gold-signal-room → Settings → Variables and Secrets:

- TELEGRAM_BOT_TOKEN = bot secret
- TELEGRAM_BOT_USERNAME = bot username without @
- TELEGRAM_WEBHOOK_SECRET = separate random secret (openssl rand -hex 24)
- PUBLIC_TELEGRAM_CHANNEL = @yourPublicGoldChannel
- VIP_TELEGRAM_ENABLED = true after channel permissions are configured
- VIP_TELEGRAM_CHANNEL = actual numeric -100... private channel ID

Keep the existing Pages D1 DB binding. Redeploy Gold Pages.

## 4. Register webhook once

On your own terminal:

    export BOT_TOKEN='REPLACE_LOCALLY'
    export WEBHOOK_SECRET='REPLACE_LOCALLY'
    curl -sS -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
      --data-urlencode 'url=https://gold.signaltoscript.com/api/telegram-webhook' \
      --data-urlencode "secret_token=$WEBHOOK_SECRET" \
      --data-urlencode 'allowed_updates=["message","chat_member"]'

Check:

    curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"

The single bot webhook receives private /start connection messages and VIP channel membership updates. It cannot coexist with a different webhook for the same bot.

## 5. Existing scheduled Worker variables

In gold-signal-room-alerts, preserving DB binding and the one-minute cron:

- TELEGRAM_BOT_TOKEN = same bot secret
- PUBLIC_TELEGRAM_ENABLED = true
- PUBLIC_TELEGRAM_CHANNEL = your @public username
- VIP_TELEGRAM_ENABLED = true
- VIP_TELEGRAM_CHANNEL = same numeric -100... ID

If deploying via Wrangler, edit the actual gold-membership/workers/wrangler.toml in your checkout, preserving existing D1 UUID, then deploy:

    npx wrangler deploy --config gold-membership/workers/wrangler.toml

The existing free channel posts after the 30-minute public delay. Gold VIP posts on confirmed signals without that extra delay. Both show strategy-derived stop-loss for entries and explain that this strategy has no fixed take-profit level; its exit is announced by an EXIT alert. The Worker also removes expired or disconnected VIP members.

## 6. NOWPayments crypto checkout on Gold Pages

You may reuse an existing NOWPayments merchant account if it supports this product. The Gold website uses separate data and settlement endpoints from the main SignalToScript site.

Gold Pages → Production Variables and Secrets:

- GOLD_CRYPTO_ENABLED = true ONLY after merchant setup
- NOWPAYMENTS_API_KEY = your merchant API key (secret)
- NOWPAYMENTS_IPN_SECRET = your merchant IPN signature secret (secret)
- NOWPAYMENTS_PAYOUT_CURRENCY = e.g. usdtbsc, matching the merchant payout setting
- GOLD_CRYPTO_CODE_KEY = fresh 64-character hex key generated using openssl rand -hex 32 (secret)
- Optional RESEND_API_KEY and RESEND_FROM_EMAIL for email delivery of paid membership codes

The Gold payment IPN callback is https://gold.signaltoscript.com/api/crypto-ipn. Do not replace the main site's script checkout callback. Each Gold invoice explicitly configures this Gold-specific callback.

Plans: weekly $4.99, monthly $14.99, yearly $89.99. The gateway may have a minimum amount higher than $4.99 on some currencies. The server checks minimums for selected currencies and shows the actual provider limit without silently raising the charge. Manual requests remain available.

When NOWPayments reports finished, the Gold Pages Function verifies its HMAC-SHA512 signature, independently fetches merchant payment details, checks invoice/order/amount, and adds 7, 30 or 365 days to the correct account. The encrypted access code is displayed only to the purchasing browser holding its private receipt and emailed if Resend is configured. A browser redirect alone never grants membership.

Redeploy Gold Pages after configuring the secrets.

## 7. Verify before inviting customers

1. Pin a free channel welcome post linking to https://gold.signaltoscript.com/pricing.html.
2. Issue a short VIP test membership in your Gold admin dashboard, log in, connect Telegram via the site's Connect Telegram button, press Start in the bot.
3. Return to the website and select Get my VIP channel invite; use it with the same connected Telegram account.
4. Verify actual confirmed signals arrive to VIP without the added public delay and show entry price, stop-loss, and managed EXIT notification. Public notifications follow their own 30-minute delay.
5. Use a supported small crypto checkout/test transfer to confirm verified settlement, code issue and expiry. Never treat a redirect alone as payment success.
6. Confirm member removal after expiry. Bot must have Ban/Restrict Members permission.

Useful D1 inspection queries:

    SELECT id,email,plan,amount_usd,status,provisioned_ms FROM gold_crypto_orders ORDER BY created_ms DESC LIMIT 20;
    SELECT email,chat_id,removed_ms FROM gold_vip_members;
    SELECT event_id,status FROM gold_vip_posts ORDER BY updated_ms DESC LIMIT 20;

No live Telegram channels, payment transactions, or Cloudflare secrets were created or activated by this repository change.
