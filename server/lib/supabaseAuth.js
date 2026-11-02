/**
 * Supabase JWT verification helper.
 *
 * Verifies Supabase access tokens using the project's JWKS (ES256 public keys)
 * or secret key, so verification happens 100% locally with zero latency.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('./logger');

const JWKS_CACHE = new Map(); // kid -> crypto.KeyObject
let jwksUrl = null;

if (config.supabaseUrl) {
  jwksUrl = `${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
}

/** Preload JWKS public keys from Supabase */
async function refreshJwks() {
  if (!jwksUrl) return;
  try {
    const res = await fetch(jwksUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.keys)) {
      for (const jwk of data.keys) {
        if (jwk.kid) {
          const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
          JWKS_CACHE.set(jwk.kid, key);
        }
      }
      logger.info({ count: data.keys.length }, '[SupabaseAuth] JWKS keys loaded');
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[SupabaseAuth] Failed to fetch JWKS');
  }
}

// Initial JWKS fetch in background
if (jwksUrl && !config.isTest) {
  refreshJwks();
  // Refresh daily
  setInterval(refreshJwks, 24 * 60 * 60 * 1000).unref();
}


/**
 * Synchronously verify a Supabase access token if its key is cached.
 * @returns {object|null} normalized user payload { id, name, email, guest }
 */
function verifySupabaseToken(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) return null;

    const kid = decoded.header.kid;
    const alg = decoded.header.alg || 'ES256';

    let key = kid ? JWKS_CACHE.get(kid) : null;

    // If key not yet cached, but we know the algorithm, trigger a background refresh
    if (!key && jwksUrl) {
      refreshJwks();
      return null;
    }

    if (!key) return null;

    const payload = jwt.verify(token, key, { algorithms: [alg] });
    if (!payload || !payload.sub) return null;

    const metadata = payload.user_metadata || {};
    return {
      id: payload.sub,
      name: metadata.name || payload.email?.split('@')[0] || 'Learner',
      email: payload.email || null,
      guest: Boolean(payload.is_anonymous),
      emailVerified: Boolean(payload.email_confirmed_at),
      supabase: true,
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  verifySupabaseToken,
  refreshJwks,
};
