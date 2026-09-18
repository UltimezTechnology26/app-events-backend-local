import rateLimit from 'express-rate-limit'

/**
 * Shared rate limiter for write/mutation endpoints across the new TypeScript
 * modules (Part 3 §7/§10 — "add the shared infrastructure once", confirmed
 * active requirement: express-rate-limit on every write endpoint, no such
 * gate existed anywhere in this codebase before this build; the only prior
 * gate anywhere is checkApiKey, a static shared secret, not a rate limiter).
 *
 * 30 requests per 15-minute window per IP: generous enough that a real
 * company owner managing their own team (a handful of add/remove/approve
 * actions in one sitting) never hits it, restrictive enough to blunt
 * scripted abuse. Keyed on IP (express-rate-limit's default), not on the
 * authenticated user, since auth happens inside the route handler after this
 * middleware runs — matches how this limiter is mounted (before the route's
 * own checkAllLoginToken/checkAdminLoginToken call).
 */
export const writeEndpointRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: { alert_message: 'Too many requests. Please try again later.' } }
})
