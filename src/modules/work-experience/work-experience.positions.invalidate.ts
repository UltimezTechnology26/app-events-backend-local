// modules/work-experience/work-experience.positions.invalidate.ts
//
// Shared cache-invalidation helper for Positions, used by both
// work-experience.positions.service.ts and
// work-experience.positions.status.service.ts — split into its own file so
// neither has to duplicate it.
//
// Dual cache invalidation (a real, pre-existing cross-cutting dependency,
// not introduced here): EVERY mutation calls BOTH
// `deleteKeysByPattern('app_positions_list*')` (the legacy pattern) AND
// `invalidateStaticPositionsListCache()` (imported from the EXISTING
// `modules/work-experience/work-experience.cache.ts`, reused as-is).

import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import { invalidateStaticPositionsListCache } from './work-experience.cache'

/**
 * Preserve the exact legacy dual-invalidation pattern — both calls, on
 * every mutation, every time. Returns `deleteKeysByPattern`'s result so the
 * `update_position_details` update branch can echo it back as `delted_key`,
 * matching legacy exactly.
 */
export async function invalidatePositionCaches(): Promise<unknown> {
  const deletedKey = await deleteKeysByPattern('app_positions_list*')
  await invalidateStaticPositionsListCache()
  return deletedKey
}
