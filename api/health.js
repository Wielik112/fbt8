import { connectionString, detectedDbVars, ping } from './_lib/db.js';

// GET /api/health -> quick diagnostics. Exposes env var NAMES only (never
// values/secrets) plus the result of a real `SELECT 1` against the database.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const detected = detectedDbVars();
  const cs = connectionString();

  const out = {
    ok: false,
    hasConnectionString: !!cs,
    detectedDbEnvVars: detected,
    adminPasswordSet: !!process.env.ADMIN_PASSWORD,
  };

  if (!cs) {
    out.error = detected.length
      ? 'Zmienne DB istnieją, ale żadna nie jest prawidłowym connection stringiem — sprawdź nazwę lub wykonaj Redeploy.'
      : 'Brak zmiennej połączenia. Podłącz Postgres i wykonaj Redeploy.';
    return res.status(200).json(out);
  }

  try {
    out.ok = await ping();
    return res.status(200).json(out);
  } catch (err) {
    out.error = String(err?.message || err);
    return res.status(200).json(out);
  }
}
