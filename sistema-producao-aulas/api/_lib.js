const crypto = require('crypto');

const KEY = 'ttpa:db';

function redisCfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis não configurado (KV_REST_API_URL / KV_REST_API_TOKEN)');
  return { url, token };
}

async function redis(cmd) {
  const { url, token } = redisCfg();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'Redis HTTP ' + r.status);
  return d.result;
}

// Compare-and-set atômico: só grava se a versão ainda for a esperada.
const CAS = `local cur = redis.call('GET', KEYS[1])
local ver = 0
if cur then ver = cjson.decode(cur).version end
if ver ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

async function readDb() {
  const raw = await redis(['GET', KEY]);
  return raw ? JSON.parse(raw) : null;
}

async function writeDb(expectedVersion, data) {
  const doc = JSON.stringify({ version: expectedVersion + 1, data });
  const ok = await redis(['EVAL', CAS, '1', KEY, String(expectedVersion), doc]);
  return ok === 1 ? expectedVersion + 1 : null;
}

function secret() {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || '';
}
function token() {
  return crypto.createHmac('sha256', secret()).update('ttpa-session').digest('hex');
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function isAuthed(req) {
  if (!secret()) return false;
  const m = /(?:^|;\s*)ttpa=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return !!m && safeEq(m[1], token());
}
function checkPassword(pw) {
  const p = process.env.APP_PASSWORD;
  return !!p && safeEq(pw || '', p);
}
function sessionCookie() {
  return `ttpa=${token()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
}

async function readBody(req) {
  if (req.body !== undefined && !Buffer.isBuffer(req.body)) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = { readDb, writeDb, isAuthed, checkPassword, sessionCookie, readBody };
