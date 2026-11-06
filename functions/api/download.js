const AVAILABLE = new Set(['supertrend-dema-reversal','1r-bear-breakout-achievements']);
export async function onRequestGet({ request, env }) {
  const slug = new URL(request.url).searchParams.get('script');
  if (!AVAILABLE.has(slug)) return new Response('Script not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const assetUrl = new URL(`/scripts/${slug}.pine`, request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl));
  if (!assetResponse.ok) return new Response('Script unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  // Atomic D1 increment; never display fake download totals.
  if (env.DB) {
    try {
      await env.DB.prepare(`INSERT INTO script_downloads (slug, downloads)
        VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET downloads = downloads + 1`)
        .bind(slug).run();
    } catch (error) { console.error('Could not record download', error); }
  }
  return new Response(assetResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.pine"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
