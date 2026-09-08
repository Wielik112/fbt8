import Stripe from 'stripe';

let client;

// Lazily construct the Stripe client so missing config yields a clear
// error at request time rather than a crash at import time.
export function getStripe() {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error('missing_stripe_key');
    err.code = 'NO_STRIPE_KEY';
    throw err;
  }
  client = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  return client;
}

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripeErrorMessage(err) {
  if (err?.code === 'NO_STRIPE_KEY') {
    return 'Płatności nie są skonfigurowane. Ustaw STRIPE_SECRET_KEY w zmiennych środowiskowych projektu.';
  }
  if (err?.type && String(err.type).startsWith('Stripe')) {
    return `Błąd płatności: ${err.message}`;
  }
  return 'Błąd podczas tworzenia płatności.';
}
