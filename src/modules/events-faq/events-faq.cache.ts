// src/modules/events-faq/events-faq.cache.ts
//
// Ports controllers/events/faq.js's own cache key + invalidation patterns verbatim (same
// `event_faq_list_*` / `individual_event_*` pair every route there already invalidated).
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')

export async function invalidateFaqCaches(): Promise<void> {
  await Promise.all([deleteKeysByPattern('event_faq_list_*'), deleteKeysByPattern('individual_event_*')])
}

export function buildFaqListKey({
  eventRowId,
  skip,
  limit,
  query,
}: {
  eventRowId: number
  skip: number
  limit: number
  query: Record<string, unknown>
}): string {
  return `event_faq_list_${eventRowId}_${skip}_${limit}_${JSON.stringify(query)}`
}

export { getCache, setCache }
