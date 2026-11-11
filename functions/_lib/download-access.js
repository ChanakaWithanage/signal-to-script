// Shared, privacy-conscious access helpers for Cloudflare Pages Functions.
// This is a lightweight email registration, not verified Google OAuth.
const MEMBER_COOKIE = 'sts_free_member';
const GUEST_COOKIE = 'sts_free_guest';
const ONE_MONTH = 30 * 24 * 60 * 60;
const SIX_MONTHS = 180 * 24 * 60 * 60;
let schemaPromise;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS free_download_members (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS free_download_sessions (
    token_hash TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS free_guest_downloads (
    token_hash TEXT PRIMARY KEY,
    script_slug TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
];

export async function ensureAccessSchema(db) {
  if (!db) return false;
  if (!schemaPromise) schemaPromise = (async () => {
    for (const statement of SCHEMA) await db.prepare(statement).run();
  })();
  try { await schemaPromise; return true; }
  catch (error) { schemaPromise = null; throw error; }
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.includes('='))
    .map(part => { const index = part.indexOf('='); return [part.slice(0,index),part.slice(index+1)]; }));
}

function validToken(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function memberToken(request) {
  const value = parseCookies(request)[MEMBER_COOKIE];
  return validToken(value) ? value : null;
}
function guestToken(request) {
  const value = parseCookies(request)[GUEST_COOKIE];
  return validToken(value) ? value : null;
}
export function randomToken() {
  const data = new Uint8Array(32);
  crypto.getRandomValues(data);
  return Array.from(data, b => b.toString(16).padStart(2,'0')).join('');
}
export async function hashToken(token) {
  const bytes = new TextEncoder().encode(token);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(hash, b => b.toString(16).padStart(2,'0')).join('');
}
export function cookieHeader(kind, value, age) {
  const name = kind === 'member' ? MEMBER_COOKIE : GUEST_COOKIE;
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}
export const ACCESS_AGE = { member: ONE_MONTH, guest: SIX_MONTHS };
export function noStore() { return { 'Cache-Control': 'no-store', 'Vary': 'Cookie' }; }

export async function isMember(db, request) {
  const token = memberToken(request);
  if (!token) return false;
  const row = await db.prepare(
    'SELECT member_id FROM free_download_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1'
  ).bind(await hashToken(token),new Date().toISOString()).first();
  return !!row;
}
export async function guestUsed(db, request) {
  const token = guestToken(request);
  if (!token) return false;
  return !!(await db.prepare(
    'SELECT token_hash FROM free_guest_downloads WHERE token_hash = ? LIMIT 1'
  ).bind(await hashToken(token)).first());
}
export async function claimGuestDownload(db, request, slug) {
  const existing = guestToken(request);
  const token = existing || randomToken();
  const result = await db.prepare(
    'INSERT OR IGNORE INTO free_guest_downloads (token_hash,script_slug) VALUES (?,?)'
  ).bind(await hashToken(token),slug).run();
  return {
    allowed: result.meta?.changes === 1,
    cookie: !existing && result.meta?.changes === 1 ? cookieHeader('guest',token,SIX_MONTHS) : null
  };
}
export function correctOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin;
}
