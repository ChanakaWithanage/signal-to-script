# Signal to Script | by CW

A simple publication for free TradingView scripts, strategy breakdowns and Pine Script development notes. Static HTML/CSS/JS on **Cloudflare Pages** with Pages Functions, required D1 membership sessions, and download tracking.

## Deployment (GitHub + Cloudflare Pages)

1. Create an empty **public** GitHub repository called `signal-to-script` under `ChanakaWithanage`. Do **not** initialize a README because this project already includes one.
2. From this folder, run:

   ```bash
   git init
   git add .
   git commit -m "Launch Signal to Script"
   git branch -M main
   git remote add origin https://github.com/ChanakaWithanage/signal-to-script.git
   git push -u origin main
   ```

3. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Import an existing Git repository**. Connect GitHub and select `signal-to-script`.
4. Set production branch to `main`, framework to `None`, build command to `exit 0` and output directory to `public`. Deploy.
5. Your website will appear at the `*.pages.dev` address shown by Cloudflare. Later Git pushes deploy automatically.

## Enable accurate download counts

D1 is required for Google-authenticated downloads. Without D1, sign-in and downloads are unavailable. To enable download tracking and member sessions:

1. Cloudflare dashboard → **D1** → **Create Database** → name it `signal-to-script-downloads`.
2. Open the database **Console** and execute the SQL in `schema.sql`:

   ```sql
   CREATE TABLE IF NOT EXISTS script_downloads (
     slug TEXT PRIMARY KEY,
     downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0)
   );
   ```

3. Open your Cloudflare Pages project → **Settings → Bindings → Add → D1 database**. Set the **variable name to `DB`** and select `signal-to-script-downloads`.
4. Redeploy the Pages project so the D1 binding takes effect.
5. Visit the article and click **Download free Pine Script**. A valid request counts once and serves the file. Refresh the article to see the updated value.

**Do not set invented totals in the database.** If you already have genuine historic downloads you can substantiate, those can be imported separately.

## Adding another script

- Include its `.pine` file under `public/scripts/` and convert it to **Pine Script v6** before publishing.
- Add a new article in `public/articles/` following the *original indicator → expected change → what changed → download* format.
- Add the script slug to the allowed set in `functions/api/download.js` and `functions/api/count.js`.
- Add a homepage entry and point it to `/api/download?script=<slug>`; `data-download-count="<slug>"` displays its real count.
- Run `python scripts/check-pine-v6.py`. This automated check verifies the version header; it **does not compile Pine Script**. Compile and test each new v6 script in TradingView's Pine Editor before release.
- Add an actual chart screenshot when you have one; do not invent TradingView charts or backtest results.

## Contact link

Public customer support uses support@signaltoscript.com. Cloudflare Email Routing forwards incoming mail to the configured private destination inbox. GitHub repository links are retained only for project source and downloads.

## Attribution and publishing rights

Supertrend originally published by KivancOzbilgic. The Pine file includes an MPL-2.0 attribution header. Review the licensing and rights in any client-delivered custom script before making it public.

## Google AdSense / Auto ads

AdSense publisher ID: `pub-9855777255503695`.

- `public/ads.txt` contains the required authorized-sellers entry and is published at `/ads.txt`.
- The asynchronous AdSense loader is inside `<head>` on the homepage and each content article.
- `public/404.html` intentionally has no ad code because it is an error page without article content.
- When adding **any new public HTML content page**, include the same loader in its `<head>` and run `python scripts/check-adsense.py`. The GitHub Actions check enforces this on pushes and pull requests.
- AdSense ad serving is **not automatic upon deployment**. Add the actual site/domain to AdSense, obtain site approval, and turn on **Auto ads** under AdSense → Ads → Edit site → Apply to site.
- Once deployed, verify that `https://YOUR-DOMAIN/ads.txt` returns the expected line, and inspect the page source on both homepage and articles for the loader.
- Google controls whether and where an ad is shown. The code enables eligible content pages to request Auto ads, not a guaranteed ad impression on each page. Consider relevant regional consent requirements before serving personalized ads.

## 1R Bear Breakout Achievements

- Article: `public/articles/1r-bear-breakout-achievements.html`
- Pine v6 source: `public/scripts/1r-bear-breakout-achievements.pine`
- Original material was supplied as an existing indicator; no public TradingView source link is asserted.
- Main chart: `public/images/1r-bear-breakout-btc-daily.webp`. Other screenshots illustrate early missed signals, indicator settings, and the 1R concept.
- The download and download-count Cloudflare endpoints permit `1r-bear-breakout-achievements`.
- The Pine source was ported from the supplied delivered script with its trigger tracking, expiry and alerts; the unused volume input is removed and IBS plot hidden from the price pane.
- Complete a Pine Editor v6 compile and chart-behavior check before public release. Confirm you have redistribution rights for the client-delivered script.

## Browser caching (Cloudflare Pages)

This repository is a **plain HTML/CSS/JavaScript** Cloudflare Pages site. The deployed output is `public/`. It does **not** use Astro or generate content-hashed assets. Cloudflare Pages already has CDN caching and ETag-based revalidation for static files; browser rules below are deliberately conservative.

The policy in `public/_headers` is:

| Resource | Browser `Cache-Control` | Reason |
| --- | --- | --- |
| `/`, `/index.html`, `/articles/*`, `/404.html` | `public, max-age=0, must-revalidate` | HTML updates must appear on the next visit. |
| `/styles.css`, `/site.js` | `public, max-age=0, must-revalidate` | They are not fingerprinted and can change at the same URL. |
| `/images/*` | `public, max-age=3600, must-revalidate` | Original screenshots and chart images may be replaced. The maximum browser-stale period is one hour. |
| `/favicon.svg` | `public, max-age=86400, must-revalidate` | Infrequently changed artwork. |
| `/scripts/*`, `/ads.txt`, `/robots.txt` | `public, max-age=0, must-revalidate` | Always revalidate updated downloads and site metadata. |
| `/api/count`, `/api/download` | `no-store` | Cloudflare Pages Functions set this header themselves on both success and errors. |

Do **not** add one-year `immutable` rules for `styles.css`, `site.js`, or image paths unless the build is changed to include a **content hash in every referenced URL**. In particular, copying `/_astro/*` rules from a different website does not help this repository.

The `_headers` file applies to **Pages static asset responses only**, not Functions. Avoid custom Cache Everything / Edge Cache TTL rules on the Cloudflare domain that would cache HTML or bypass Functions and redirects. When adding another section outside `/articles/`, ensure its HTML is covered by revalidation rules.

### Verify after Cloudflare deployment

From a shell, replace `YOUR_HOST` with the deployed `pages.dev` or custom domain:

```bash
curl -sI https://YOUR_HOST/ | grep -iE '^cache-control:|^etag:'
curl -sI https://YOUR_HOST/styles.css | grep -i '^cache-control:'
curl -sI https://YOUR_HOST/images/1r-bear-breakout-featured.webp | grep -i '^cache-control:'
curl -sI https://YOUR_HOST/favicon.svg | grep -i '^cache-control:'
curl -s -D - -o /dev/null "https://YOUR_HOST/api/count?script=supertrend-dema-reversal" | grep -i '^cache-control:'
```

The first four should show their configured revalidation/TTL headers, and the API response should show `no-store`. Check actual response headers after the deployment: the repository itself does not establish the state of dashboard-level cache rules.

## Pinbar + 3 Line Strike Combo (v6)
- Article: `public/articles/pinbar-3-line-strike-combo-alerts.html`
- Download: `public/scripts/goat-trap-pinbar-3ls-combo.pine`
- TradingView screenshots: `public/images/pinbar-*.webp`
- The uploaded source was already in Pine Script v6 and has been retained unchanged. It uses `barstate.isconfirmed` for **combined** pinbar + 3LS alerts, so alerts are confirmed at bar close; the earlier standalone pinbar alert could be configured for intrabar triggering.
- This implements the supplied 3LS candle-color + immediate previous-body comparison rules, not every possible 3 Line Strike definition.
- The original pinbar and 3LS fragments were supplied by a client; confirm redistribution rights and the appropriate original-source attribution before licensing these scripts further.

## Browser-only TradingView automation guide

- Article: `public/articles/automate-tradingview-strategies-chrome-extension.html`
- The guide uses the existing `public/scripts/supertrend-dema-reversal.pine` as its real Pine v6 example.
- The Chrome extension is an **architecture proposal**, not included or confirmed working in this repository. Do not advertise it as a tested download or link to an unverified repo.
- Before live rollout, confirm TradingView alert-log access, browser extension permissions, exchange demo execution, account-mode handling and secure key storage. Free TradingView Basic accounts currently lack technical alerts.
- When adding extension screenshots, capture genuine TradingView alert-log entries, extension demo settings, and Binance Futures Demo execution records; do not invent trade confirmations.

## Free TradingView visual bridge article

The article at `public/articles/automate-tradingview-strategies-chrome-extension.html` explains a working codebase and experimental local Chrome extension for Binance Futures, avoiding paid TradingView technical alerts via visual table encoding.

The site's `public/scripts/supertrend-visual-bridge.pine` is the Pine Script v6 Supertrend example from the external extension repository. Download slug `supertrend-visual-bridge` is supported by both Cloudflare API allowlists. The existing D1 counter creates its database row on the first download.

Genuine images from the sample: `public/images/supertrend-visual-bridge-chart.webp` and `public/images/tv-futures-bridge-extension-popup.webp`. The popup image does not prove a trade filled. No live end-to-end execution claim is made. The home hero continues to feature the existing Supertrend + DEMA article.

## One free guest download or unlimited Google downloads

Every published Pine Script download offers two clear choices:

- **Download once as guest:** one free file per browser, no Google account needed. A Secure, HttpOnly cookie (`sts_free_guest`) identifies the browser's guest allowance; only its SHA-256 token hash and chosen script slug are stored in Cloudflare D1. The cookie expires after 180 days.
- **Continue with Google:** verified Google sign-in allows unlimited free downloads through a secure, HttpOnly, 30-day member session. Existing members download immediately.

Download links fall back to the dedicated `/join.html?script=...` page for crawlers or visitors who cannot use the JavaScript popup. Both the dialog and join page provide the guest option when a script is selected. The frontend displays `guestUsed`, and the server atomically claims a guest allowance with `INSERT OR IGNORE` only after confirming that the file exists.

- `functions/api/access.js` exposes `member`, `guestUsed`, and `guestLimit: 1`.
- `functions/api/download.js` returns 403 with `GUEST_LIMIT_REACHED` after a guest's first successful download. Missing D1 returns 503, not an unlimited fallback. It supports either the existing authenticated static assets or private R2 via `SCRIPT_BUCKET`.
- `functions/_lib/download-access.js` handles guest and member cookies, session verification, the D1 guest quota and member checks.
- `functions/scripts/_middleware.js` protects direct `/scripts/*.pine` URLs: members can open static files if R2 is not configured, while guests use the tracked API download flow. Direct static access cannot bypass the guest quota.
- `scripts/check-download-flow.py` validates frontend and endpoint wiring. `scripts/test-guest-access.mjs` tests first guest success, repeat denial, unlimited member downloads, private R2 failure and direct static protection.

The guest quota is deliberately browser-scoped, not an identity verification system. Clearing cookies, using a different browser or private mode can make a new guest allowance available; concurrent first requests without a cookie can also evade the soft limit. Do not advertise this as a strict one-per-person entitlement. For stronger control or paid content, use verified accounts and private storage. Existing guest quota rows in D1 remain valid when a visitor retains their old cookie.

Cloudflare Pages needs its existing D1 binding named `DB`. Google login needs the existing authorized web origin `https://signaltoscript.com`. The deprecated unverified email signup endpoint still returns HTTP 410. Download routes must not be cached by Cloudflare zone rules. The public GitHub repo may still expose source files; a guest quota on the website does not make the code private.

**Deployment smoke test:** Use an incognito browser to download a script as guest, check a second download is declined, then sign in with Google and download again. The `/join.html?script=...` fallback should offer the same guest action. Without JavaScript, the link still leads to an informative sign-in page.

## SEO migration to signaltoscript.com

The primary website address is `https://signaltoscript.com`. Cloudflare dashboard redirects handle `www.signaltoscript.com` and the legacy `signal-to-script.pages.dev` hostname; those redirect rules are not managed in this repository.

- `public/sitemap.xml`: canonical homepage, four published articles, and Google signup page.
- `public/robots.txt`: advertises the sitemap at the new domain.
- Public HTML pages: one canonical link and matching Open Graph URL per page; homepage and article images have full absolute URLs.
- `public/_headers`: sitemap XML response type and conservative caching.
- `scripts/check-seo.py`: verifies canonicals, sitemap coverage and real image paths in CI.

After deployment, verify `https://signaltoscript.com/sitemap.xml` and `https://signaltoscript.com/robots.txt` are accessible, add `signaltoscript.com` as a Domain property in Google Search Console, and submit `sitemap.xml`. For Google authentication, make sure `https://signaltoscript.com` is in Authorized JavaScript origins on the existing OAuth client before using the new domain. No new Client ID is needed.

Do not add guessed sitemap `lastmod` dates or redirect every old article to the homepage. The Cloudflare redirect should preserve each original article path.


## Free-download UX and private storage rollout (November 2026)

The download dialog now displays the selected script, explains exactly why Google sign-in is needed, names the limited Google identity data stored, and starts the download automatically. It includes a retry action if the download fails and a dedicated sign-in page fallback if the Google button does not load. The sign-in page also immediately downloads a selected script for an existing member.

The join and privacy pages deliberately do not load AdSense. The homepage now links to the privacy notice and explains that Google sign-in is needed before downloading.

### Google authentication branding: action required in Google Cloud

Google Identity Services authenticates using a signed Google ID token; the site does not request Gmail or Google Drive API access. The repository cannot verify or publish the OAuth branding.

In the Google Cloud Console for the existing OAuth web client:
1. Under Google Auth Platform > Branding, confirm the public app name Signal to Script, homepage https://signaltoscript.com/, privacy policy https://signaltoscript.com/privacy.html, and a working support contact.
2. Verify domain ownership and make sure https://signaltoscript.com is an authorized JavaScript origin.
3. Submit or complete Verify Branding, then Publish branding only once Google approves the application branding.
4. Test the account chooser in a private browsing window and confirm the displayed application identity and permissions.

Do not claim Google has verified the application until that is confirmed in the actual Google Cloud dashboard.

Official guide: https://developers.google.com/identity/verification/authentication-verification

### Optional private Cloudflare R2 migration, without forced downtime

The deployed website already protects both /api/download and direct /scripts/*.pine requests with authenticated Cloudflare Pages Functions. The public GitHub repository still contains the actual Pine files; website route protection does not make those source files private on GitHub.

This change adds support for a private Cloudflare R2 bucket, using the binding name SCRIPT_BUCKET. Existing authenticated static-file downloads continue to work while no R2 binding exists. When SCRIPT_BUCKET is present, the API serves ONLY R2 objects and direct static-asset downloads return 404 after the session check.

To switch to R2:
1. Create a private R2 bucket in Cloudflare, without public r2.dev or custom-domain access.
2. Upload all published Pine files with exact object keys:
   - supertrend-dema-reversal.pine
   - 1r-bear-breakout-achievements.pine
   - goat-trap-pinbar-3ls-combo.pine
   - supertrend-visual-bridge.pine
3. Verify the objects and their source content before changing bindings.
4. Add the R2 bucket binding SCRIPT_BUCKET to the Cloudflare Pages project, in the intended environment; redeploy to activate.
5. Confirm an anonymous /api/download?script=supertrend-dema-reversal request still returns 401, while an authenticated API request downloads the correct Pine file. Direct /scripts/supertrend-dema-reversal.pine must return 404 for a signed-in visitor when R2 is enabled.
6. Only after successful R2 rollout, remove the Pine files from the public static build and consider moving the repository to private hosting. Public Git history still contains prior copies, and making the repository private does not revoke previously copied source.

If an object is missing from R2, the API returns 503 rather than falling back to a public asset. No migration is activated simply by merging this code; the Cloudflare bucket and binding must be configured separately. Keep the required D1 binding DB and avoid caching authenticated download routes.


## PayHere business policies (November 2026)

The following user-facing policies are published with canonical URLs on the production domain:

- `https://signaltoscript.com/terms.html`: Terms & Conditions for free website content and separately agreed custom digital development.
- `https://signaltoscript.com/refunds.html`: Refund & Cancellation Policy covering free downloads, paid custom work, cancellations, digital delivery and refunds.
- `https://signaltoscript.com/privacy.html`: Privacy Policy for Google sign-in, D1 sessions, analytics, ads on content pages and conditional payment processing.

All content pages, including the 404 page, contain a shared policy footer linking to all three documents and the existing support section. Policy and sign-in pages do not load Google AdSense; the Stage 1/2 download modal, Google sign-in, retry/fallback UX and optional R2 delivery are unchanged. The sitemap lists all policy URLs and CI verifies canonical links, policy footers, ad placement and cache headers.

**Still required for PayHere merchant review:** publish accurate merchant identity details that match the PayHere application (legal/registered business or freelance name, phone and postal/business address); support@signaltoscript.com is now publicly linked. Do not invent these details in code. PayHere may also expect the actual paid offering, pricing, ordering/checkout process and proof of business; the present site focuses on free script downloads, and PayHere checkout has not yet been integrated. Approval is decided by PayHere and its bank partners.

Review the written policy terms and refund/cancellation commitments before accepting payments. Private support, refund and account deletion requests now use support@signaltoscript.com rather than public GitHub Issues. Cloudflare Email Routing forwards incoming messages; sending replies from this branded address needs a separate outgoing mail provider or SMTP setup.

Official guidance:
- https://support.payhere.lk/policy-samples
- https://support.payhere.lk/application-process
- https://blog.payhere.lk/attention-spiders-here-are-the-must-haves-of-your-payhere-affiliated-website/

## Public business support address

The website displays `support@signaltoscript.com` as the customer support contact in the footer, homepage support section, every published article, and Terms, Refund and Privacy policies. The email uses a `mailto:` link.

Cloudflare Email Routing receives and forwards email but does not host an outgoing mailbox. Configure an outgoing mail service if customer replies must come from `support@signaltoscript.com`. Never put account credentials or payment card details into public GitHub Issues or website copy. Do not claim the business phone or physical address has been verified or added; those may still be needed for PayHere merchant approval.

## Gold Breakout 15M Strategy article (November 12, 2026)

- Article: `public/articles/gold-breakout-15m-strategy.html`
- Source: `public/scripts/gold-breakout-15m.pine` (Pine Script v6, supplied v1.1.0).
- Download slug: `gold-breakout-15m`, registered in download and count endpoints and the sign-in popup.
- Actual TradingView screenshots extracted from the supplied five-page strategy overview are published as nine descriptive WebP files under `public/images/gold-breakout-15m-*.webp`.
- The article's primary download CTA is immediately beneath the hero image. A second CTA near the bottom follows the testing explanation. Both use the existing Google sign-in and automatic download.
- The documented snapshot is from TVC:GOLD, 15-minute chart, August 3 to November 11, 2026. The PDF reports 67 closed trades, 59.7% win rate, +1,783.94 USD net profit and 1.893 profit factor with zero slippage and no spread modeling. It is not evidence of performance on MGC or other gold instruments.
- SEO: unique title and description, real chart Open Graph image, descriptive image alt text, article schema, internal links and sitemap entry.

**R2 note:** If a Cloudflare Pages environment has `SCRIPT_BUCKET` configured, upload `gold-breakout-15m.pine` under the identical R2 object key before publishing that environment. The private-storage path intentionally does not fall back to the public static asset, so a missing object returns HTTP 503. Without that binding, the existing signed-in static download route works.

**Pine validation note:** The automated repository check verifies the `//@version=6` header, not Pine compilation or the Strategy Tester result. Compile and visually verify the script in TradingView before treating its historical results as reproducible. Publish only if you have redistribution rights to the supplied strategy code and screenshots.


## Premium Pine Script launch through NOWPayments (November 2026)

The homepage features two premium scripts before the three free scripts:
- `gold-breakout-15m` (Gold Breakout 15M Strategy)
- `supertrend-dema-reversal` (Supertrend + DEMA Reversal Strategy)

The early Black Friday launch price is **$12.49 USD equivalent in cryptocurrency**, with a **planned**, not historically charged, regular price of **$49.49 USD**. This is approximately 75% below the planned price. The promotion expires **December 1, 2026 at 00:00 UTC**; afterward new orders are paused pending a new price configuration. The USD-denominated price remains fixed within our catalog; NOWPayments provides the exact crypto payment quote at invoice checkout.

### Embedded NOWPayments checkout with per-purchase invoices

NOWPayments shared widget `iid=5487105772` demonstrates the merchant's $12.49 offer, but sharing that exact invoice would not let the site identify which buyer purchased which script. Instead, the checkout uses the same embedded-widget format (`/embeds/payment-widget?iid=<per-purchase invoice ID>`) with a fresh NOWPayments invoice for each order and an unguessable `order_id`, signed webhook and private browser receipt. The default pay-in preference is USDT on BNB Smart Chain (`usdtbsc`), requested using NOWPayments' optional `pay_currency` invoice parameter. Buyers can also select TRC20 or another crypto invoice at checkout. The D1 order stores currency `auto`, so a permitted coin switch within NOWPayments does not prevent an otherwise valid invoice payment from unlocking the purchased source.

### Activation checklist: checkout stays OFF until configured

No real payments should be sent until the entire setup has been tested and the payment provider approves the product category and merchant.

1. **Private source files.** Create a private R2 bucket without `r2.dev` or public custom-domain access. Upload:
   - `gold-breakout-15m.pine` (recover from [previous git version](https://github.com/ChanakaWithanage/signal-to-script/blob/19841e92aad249008cc4147fa4f80133c596eaf3/public/scripts/gold-breakout-15m.pine))
   - `supertrend-dema-reversal.pine` (recover from [previous git version](https://github.com/ChanakaWithanage/signal-to-script/blob/19841e92aad249008cc4147fa4f80133c596eaf3/public/scripts/supertrend-dema-reversal.pine))
   Bind the R2 bucket to Cloudflare Pages as `PREMIUM_BUCKET`. Keep your D1 binding `DB`. Never enable a public R2 object URL for paid scripts.
2. **NOWPayments dashboard.** Add and verify a payout wallet and choose the **actual payout cryptocurrency** you intend to receive in your merchant account. Generate an API key and the **IPN secret** from NOWPayments account/payment settings. Do not put either value in git or public client JavaScript.
3. **Cloudflare Pages configuration.** In production, create encrypted secrets:
   - `NOWPAYMENTS_API_KEY` (NOWPayments API key)
   - `NOWPAYMENTS_IPN_SECRET` (NOWPayments IPN secret)
   Set an environment variable `NOWPAYMENTS_PAYOUT_CURRENCY` matching your actual dashboard payout selection, such as `trx` or `usdttrc20`. This must not be guessed; the provider's minimum calculator uses the pay-in/payout pair.
4. **Webhook.** Configure the NOWPayments instant payment notification callback as `https://signaltoscript.com/api/nowpayments-ipn`. Ensure Cloudflare bot/WAF rules allow genuine NOWPayments POST callbacks. The endpoint is intentionally public but requires a valid `x-nowpayments-sig` HMAC-SHA512 signature. For a `finished` event it also calls the authenticated `GET /v1/payment/{payment_id}` API and checks product order ID, invoice ID, currency, amount and terminal status before marking an order paid.
5. **Network minimums.** NOWPayments minimums depend on the customer's payment currency and the merchant's payout currency. For a selected payment method (`usdtbsc` or `usdttrc20`), the backend checks `GET /v1/min-amount` before creating the invoice. For `auto`, NOWPayments validates the currency selected inside the widget. Minimums can change and a $12.49 price is not guaranteed to clear every currency pair.
6. **Enable only after readiness tests.** When R2 delivery, customer payments, minimums, wallet, IPN status verification and applicable merchant rules have been confirmed, set `PREMIUM_CHECKOUT_ENABLED=true` in the Cloudflare Pages production environment and redeploy. By default it is disabled and no invoice can be created.

The site defaults to USDT on BNB Smart Chain, offers USDT on TRON as an explicit alternative, and provides an unrestricted coin choice. The per-purchase NOWPayments widget is embedded on checkout; NOWPayments generates the deposit address and payment instructions. The site never touches wallet private keys.

### Order lifecycle, security and delivery

- Browser creates a new order through `POST /api/premium`. The server validates selected script, discounted period, private R2 object, environment switch and (for specific selected coins) live minimum before asking NOWPayments `POST /v1/invoice` to generate a **per-order** invoice used by the embedded widget.
- An order identifier and random 64-character access secret are saved in the buyer's browser localStorage. Only its SHA-256 hash is stored in D1. The checkout does not require Google sign-in. Retain the order ID and provider receipt if the browser's localStorage is lost.
- NOWPayments sends payment events to `functions/api/nowpayments-ipn.js`. The server verifies the sorted JSON HMAC-SHA512 signature; **only `finished`** qualifies for delivery, never `waiting`, `confirming`, `confirmed` or `partially_paid`.
- The server uses the NOWPayments API key to verify the finished payment record, including matching the specific `order_id`, `invoice_id` and requested USD amount. The paid currency may differ from the originally preferred coin if the widget allowed the customer to switch it. D1 marks the order paid once and ensures a provider payment ID cannot unlock multiple purchases. A widget display or frontend redirect is not proof of payment.
- On a paid order the buyer can download only the purchased source file from `PREMIUM_BUCKET`. The free download API and direct `/scripts/*.pine` paths reject both premium files, even for members.
- All paid file URLs are private. Premium source code can still be recovered from earlier **public Git commit history**, so exclusive source distribution requires new private versions and appropriate licensing/redistribution permissions.
- Existing free guest download and Google unlimited download behavior continues for the three free scripts.

### Monitoring and engagement

Daily aggregate event counts live in D1 table `premium_engagement`: `article_click`, `article_view`, and `buy_click`, for each of the two premium products. No visitor fingerprint or email address is collected for those counters.

```sql
SELECT date_utc, slug, event, count FROM premium_engagement
ORDER BY date_utc DESC, slug, event;
```

Successful invoices and pending orders are stored in a **new** `premium_nowpayments_orders` D1 table. Older unused `premium_orders` / `premium_slots` tables can be left in D1 for historical traceability.

```sql
SELECT slug, currency, status, COUNT(*) AS orders
FROM premium_nowpayments_orders GROUP BY slug, currency, status
ORDER BY slug, currency, status;
```

CI runs mocked NOWPayments invoice/minimum/payment-status/webhook tests. Passing these tests does **not** confirm real credentials, incoming IPN delivery through Cloudflare, the payout wallet configuration or a live $12.49 payment. Perform a real end-to-end purchase with a supported amount and verify refund/support processes before launch.
