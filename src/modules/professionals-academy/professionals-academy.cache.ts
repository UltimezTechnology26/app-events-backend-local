// modules/professionals-academy/professionals-academy.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/** New caching added during migration (legacy had none on these reads). */
export const PROFESSIONALS_ACADEMY_CACHE_PATTERNS = [
  'professionals_academy_certificate_list_*',
  'professionals_academy_certificate_visible_*',
  // Legacy's save_n_update_visibility already invalidates this shared self-service-profile cache
  // key on write — preserved here so behavior doesn't change.
  'app_user_other_details_*',
] as const

export async function invalidateProfessionalsAcademyCaches(): Promise<void> {
  await Promise.all(PROFESSIONALS_ACADEMY_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

export function buildCertificateListKey(userRowId: number): string {
  return `professionals_academy_certificate_list_${userRowId}`
}

export function buildCertificateVisibleKey(userRowId: number): string {
  return `professionals_academy_certificate_visible_${userRowId}`
}

export { getCache, setCache }
