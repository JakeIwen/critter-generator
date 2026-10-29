import express from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Sign-in for the public host. Cloudflare Access lets everyone reach the app
// except /auth/email, which it guards with its emailed one-time PIN. A visitor
// signs in either with the shared passcode or through that email path, and
// gets this app's own session cookie either way.
export const COOKIE = '__Host-critter_session';
const SESSION_MS = 7 * 24 * 3600_000; // Matches the Access session length.
const SESSION_METHODS = ['passcode', 'email', 'owner'];
const FAILURES_PER_IP = 10, FAILURES_TOTAL = 100, FAILURE_WINDOW_MS = 15 * 60_000;

export function createLogin({ publicOrigin, passcode, verifyAccess, secretFile, ownerEmail, now = () => Date.now() }) {
  const secret = loadSecret(secretFile);
  const passcodeHash = passcode ? sha256(passcode) : null;
  // A blank owner address configures nobody as owner; an empty claim must never match it.
  const ownerAddress = String(ownerEmail ?? '').trim().toLowerCase();
  // Passcode sessions are bound to the passcode, so changing it signs those visitors out.
  const sign = (method, expires) => createHmac('sha256', secret)
    .update(`${method}.${expires}.${method === 'passcode' ? passcodeHash?.toString('hex') : ''}`).digest('base64url');
  const failures = [];

  function sessionMethod(req) {
    const value = cookies(req.headers.cookie)[COOKIE];
    const [method, expires, signature] = value?.split('.') || [];
    if (!SESSION_METHODS.includes(method) || !(Number(expires) > now())) return null;
    if (method === 'passcode' && !passcodeHash) return null;
    return safeEqual(Buffer.from(signature || ''), Buffer.from(sign(method, expires))) ? method : null;
  }
  function signedIn(req) { return sessionMethod(req) !== null; }
  function isOwner(req) { return sessionMethod(req) === 'owner'; }
  function startSession(res, method) {
    const expires = now() + SESSION_MS;
    res.setHeader('Set-Cookie', `${COOKIE}=${method}.${expires}.${sign(method, expires)}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Lax`);
    res.redirect(303, '/');
  }
  // Pages get the sign-in form; API calls get a JSON error the frontend can show.
  function challenge(req, res) {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.redirect(302, '/auth');
    res.status(401).json({ error: 'Your sign-in has expired. Reload the page to sign in again.' });
  }
  function tooManyFailures(ip) {
    const cutoff = now() - FAILURE_WINDOW_MS;
    while (failures.length && failures[0].at < cutoff) failures.shift();
    return failures.length >= FAILURES_TOTAL || failures.filter(f => f.ip === ip).length >= FAILURES_PER_IP;
  }

  const router = express.Router();
  router.get('/auth', (req, res) => signedIn(req) ? res.redirect(302, '/') : page(res, 200, { passcode: Boolean(passcodeHash) }));
  router.post('/auth/passcode', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    // Browsers send Origin on form posts; requiring it blocks cross-site login forms.
    if (req.headers.origin !== publicOrigin.origin) return res.status(403).json({ error: 'Cross-origin access denied.' });
    if (!passcodeHash) return page(res, 404, { passcode: false });
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    if (tooManyFailures(ip)) return page(res, 429, { passcode: true, error: 'Too many wrong passcodes. Try again in 15 minutes.' });
    if (typeof req.body?.passcode === 'string' && safeEqual(sha256(req.body.passcode.trim()), passcodeHash)) return startSession(res, 'passcode');
    failures.push({ ip, at: now() });
    page(res, 401, { passcode: true, error: 'That passcode is not right.' });
  });
  // Cloudflare Access only lets listed emails reach this path, with a signed token.
  router.get('/auth/email', async (req, res) => {
    let claims;
    try { claims = await verifyAccess(req.headers['cf-access-jwt-assertion']); } catch {
      return page(res, 403, { passcode: Boolean(passcodeHash), error: 'Email sign-in did not go through. Try again.' });
    }
    const claimEmail = String(claims.email ?? '').trim().toLowerCase();
    startSession(res, ownerAddress && claimEmail === ownerAddress ? 'owner' : 'email');
  });

  return { signedIn, isOwner, challenge, router };
}

function page(res, status, { passcode, error }) {
  // Under the app-wide no-referrer policy, browsers post this form with "Origin: null".
  res.setHeader('Referrer-Policy', 'same-origin');
  res.status(status).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Critter Generator</title>
<style>
/* Static hex mirrors of the plum tokens in src/style.css (dark theme); this page runs no script. */
:root{color-scheme:dark;--bg:#16121b;--surface:#241f2b;--subtle:#2c2534;--border:#847c8e;--text:#eceaf0;--muted:#aea8b5;--accent:#af7cc6;--on-accent:#1b121f;--danger:#ff9088}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.6 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(340px,100% - 32px)}
h1{font:400 30px/1.2 Georgia,serif;margin:0 0 24px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:8px}
input{box-sizing:border-box;width:100%;padding:11px 12px;font:inherit;border:1px solid var(--border);background:var(--subtle);border-radius:8px;color:inherit}
button{margin-top:14px;width:100%;padding:12px;font:inherit;font-weight:600;border:0;border-radius:8px;background:var(--accent);color:var(--on-accent);cursor:pointer}
button:hover{filter:brightness(1.08)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
p{margin:16px 0 0;font-size:13px;color:var(--muted)}a{color:var(--accent)}
.error{color:var(--danger)}
</style></head><body><main>
<h1>Critter Generator</h1>
${passcode ? `<form method="post" action="/auth/passcode">
<label for="passcode">Passcode</label>
<input id="passcode" name="passcode" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Enter</button>
</form>` : ''}
${error ? `<p class="error" role="alert">${error}</p>` : ''}
<p><a href="/auth/email">${passcode ? 'Sign in with email instead' : 'Sign in with email'}</a></p>
</main></body></html>`);
}

function loadSecret(file) {
  if (existsSync(file)) return readFileSync(file);
  const secret = randomBytes(32);
  writeFileSync(file, secret, { mode: 0o600, flag: 'wx' });
  return secret;
}
function cookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(part => part.includes('='))
    .map(part => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]));
}
const sha256 = value => createHash('sha256').update(value).digest();
const safeEqual = (a, b) => a.length === b.length && timingSafeEqual(a, b);
