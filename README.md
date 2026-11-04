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
