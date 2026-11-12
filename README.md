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

## Google sign-in required for free downloads

All website download buttons now use Google sign-in. There is no guest download option or payment requirement. The Google Identity Services button appears directly inside the download dialog so users do not need to navigate to a separate registration page. Successful sign-in automatically downloads the selected Pine Script. Returning members download immediately.

The dedicated `public/join.html` page remains available from navigation. It uses the shared Google sign-in functionality in `public/site.js` and `public/join.js`. The Google OAuth Web client must authorize `https://signaltoscript.com`.

- `functions/api/google-login.js` verifies Google's signed ID token and creates a secure, HttpOnly, 30-day session whose random token is hashed in Cloudflare D1.
- `functions/api/access.js` reports membership session status.
- `functions/api/download.js` returns HTTP 401 without a valid Google session and HTTP 503 if D1 is missing or unavailable. Only authorized requests can download scripts.
- `functions/scripts/_middleware.js` validates the session before serving direct `/scripts/*.pine` static asset URLs, preventing an easy website download bypass.
- `functions/_lib/download-access.js` retains only Google member session helpers.
- `public/_headers` and the functions set no-store caching on script responses.
- `scripts/check-download-flow.py` checks both API and direct asset access policies.

Cloudflare Pages requires the existing D1 binding named `DB`. Legacy guest database rows are not used; this change does not delete historical data. The deprecated unverified email signup still returns HTTP 410.

**After deployment:** Confirm that unsigned requests to `/api/download?script=supertrend-dema-reversal` and `/scripts/supertrend-dema-reversal.pine` return 401. Confirm the Google popup signs in successfully, automatically downloads the selected script, and lets returning users download immediately. Cloudflare zone Cache Rules should not cache the protected routes.

**Source visibility:** The GitHub repository still publicly contains the Pine Script files. This changes access to download routes on the website, not GitHub repository permissions. Private storage or a private repository would be necessary for fully private source distribution.

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
