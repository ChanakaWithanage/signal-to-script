# Signal to Script — by CW

A simple publication for free TradingView scripts, strategy breakdowns and Pine Script development notes. Static HTML/CSS/JS on **Cloudflare Pages** with optional Pages Functions + D1 download tracking.

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

Without D1, the file download still works, but the count stays hidden (`Download count available after launch`). To show the true number:

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

Support currently points to GitHub issues in this new repository. Update the URL to your preferred Fiverr contact/profile or verified email if desired.

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
