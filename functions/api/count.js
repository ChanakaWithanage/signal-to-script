const AVAILABLE = new Set(['supertrend-dema-reversal','1r-bear-breakout-achievements','goat-trap-pinbar-3ls-combo']);
export async function onRequestGet({ request, env }) {
  const slug = new URL(request.url).searchParams.get('script');
  if (!AVAILABLE.has(slug)) return Response.json({ error: 'Unknown script' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!env.DB) return Response.json({ count: null, configured: false }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const record = await env.DB.prepare('SELECT downloads FROM script_downloads WHERE slug = ?').bind(slug).first();
    return Response.json({ count: Number(record?.downloads ?? 0) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ count: null, configured: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
