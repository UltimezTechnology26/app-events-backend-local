// modules/professionals-social-links/professionals-social-links.cache.ts
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/** Ported verbatim from setting.js's own write-path invalidation for these two routes. */
export async function invalidateAfterAuthenticatedUpdate(): Promise<void> {
  await Promise.all([
    deleteKeysByPattern('user_detail*'),
    deleteKeysByPattern('app_user_detail_*'),
    deleteKeysByPattern('app_user_other_details_*'),
  ])
}

// The no-login-token route only ever invalidated these two patterns in legacy — NOT the third
// pattern above. FLAGGED, NOT FIXED: looks like an inconsistency between the two routes rather
// than an intentional difference, but changing it would be a real behavior change needing sign-off.
export async function invalidateAfterApiKeyOnlyUpdate(): Promise<void> {
  await Promise.all([deleteKeysByPattern('user_detail*'), deleteKeysByPattern('app_user_detail_*')])
}
