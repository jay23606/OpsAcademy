/**
 * JWT authentication middleware
 *
 * Every API caller has an identity: either a registered account or a guest
 * token issued by POST /api/auth/guest. That identity owns sandboxes and
 * progress, so limits and access checks have something to attach to.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getStore } = require('../lib/store');
const { verifySupabaseToken } = require('../lib/supabaseAuth');

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, guest: Boolean(user.guest) },
    config.jwtSecret,
    { expiresIn: user.guest ? config.guestJwtExpiry : config.jwtExpiry }
  );
}

/** @returns the token payload, or null if the token is missing, expired or forged */
function verifyToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    // If local verification fails, check if it's a Supabase token
    const supabaseUser = verifySupabaseToken(token);
    if (supabaseUser) {
      try {
        const store = getStore();
        const existing = store.get('users', supabaseUser.id);
        if (!existing) {
          store.set('users', supabaseUser.id, {
            id: supabaseUser.id,
            name: supabaseUser.name,
            email: supabaseUser.email,
            guest: supabaseUser.guest,
            emailVerified: supabaseUser.emailVerified,
            createdAt: new Date().toISOString(),
          });
        }
      } catch {}
      return supabaseUser;
    }
    return null;
  }

  // Resetting a password signs out every session started before it, so a
  // stolen token stops working. Guests have no password to change.
  if (!payload.guest) {
    const user = getStore().get('users', payload.id);
    if (user && user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt) return null;
  }
  return payload;
}

function tokenFromRequest(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function requireAuth(req, res, next) {
  const user = verifyToken(tokenFromRequest(req));
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: missing, expired or invalid token' });
  }
  req.user = user;
  next();
}

/** Attaches req.user when a valid token is present, but lets the request through either way. */
function optionalAuth(req, res, next) {
  req.user = verifyToken(tokenFromRequest(req));
  next();
}

/** For features that need a real account, such as certificates. */
function requireRegistered(req, res, next) {
  if (!req.user || req.user.guest) {
    return res.status(403).json({ success: false, error: 'Create an account to use this feature' });
  }
  next();
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Operator-only endpoints. They do not exist (404) unless ADMIN_TOKEN is
 * configured, and then need `x-admin-token`.
 */
function requireAdmin(req, res, next) {
  if (!config.adminToken) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  if (!safeEqual(req.headers['x-admin-token'] || '', config.adminToken)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.optionalAuth = optionalAuth;
module.exports.requireRegistered = requireRegistered;
module.exports.requireAdmin = requireAdmin;
module.exports.signToken = signToken;
module.exports.verifyToken = verifyToken;
module.exports.safeEqual = safeEqual;
