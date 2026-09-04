import {
  makeToken, isAdmin, setSessionCookie, clearSessionCookie,
  safeEqual, readJsonBody,
} from './_lib/auth.js';

// POST   /api/login  -> sign in with { password }
// GET    /api/login  -> { authed: boolean } session status
// DELETE /api/login  -> sign out
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ authed: isAdmin(req) });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return res.status(500).json({ error: 'ADMIN_PASSWORD nie jest ustawione w konfiguracji projektu.' });
    }
    const body = await readJsonBody(req);
    const password = String(body?.password ?? '');
    if (!password || !safeEqual(password, expected)) {
      return res.status(401).json({ error: 'Nieprawidłowe hasło.' });
    }
    const token = makeToken();
    setSessionCookie(res, token);
    return res.status(200).json({ ok: true, token });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Metoda niedozwolona.' });
}
