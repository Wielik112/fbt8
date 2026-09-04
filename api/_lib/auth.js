import crypto from 'node:crypto';

export const COOKIE_NAME = 'fbt_admin';
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function signingKey() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

function hmac(payload) {
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('hex');
}

// Constant-time string comparison that tolerates differing lengths.
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // Still run a comparison to avoid short-circuit timing leaks.
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function makeToken() {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${hmac(exp)}`;
}

export function verifyToken(token) {
  if (!token || !signingKey()) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return safeEqual(sig, hmac(expStr));
}

export function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// True when the request carries a valid admin session (cookie or Bearer token).
export function isAdmin(req) {
  let token = parseCookies(req)[COOKIE_NAME];
  if (!token) {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
  }
  return verifyToken(token);
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}; SameSite=Strict; Secure`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`);
}

// Reads a JSON body robustly whether or not the platform pre-parsed it.
export async function readJsonBody(req) {
  if (req.body != null) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body || '{}'); } catch { return {}; }
    }
    return req.body;
  }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
