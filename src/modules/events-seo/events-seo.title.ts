// modules/events-seo/events-seo.title.ts
//
// Every event page title ends with " | Events Coinpedia" (same idea as Company's " | Coinpedia
// Company Listing" / Professionals' " | Coinpedia User Profile"). The public event page appends it
// when rendering, so the SEO Details form has to show - and save - the same thing.
export const EVENT_TITLE_SUFFIX = ' | Events Coinpedia'
export const EVENT_TITLE_MAX_LENGTH = 60

const hasSuffix = (title: string): boolean => title.toLowerCase().endsWith(EVENT_TITLE_SUFFIX.toLowerCase())

/**
 * Appends the suffix to a title that doesn't have it yet. An empty title stays empty, and a title
 * that already ends with the suffix (any casing) is returned untouched, so it is safe to apply
 * to stored values on every read.
 */
export function withEventTitleSuffix(title: unknown): string {
  if (typeof title !== 'string') return ''
  const trimmed = title.trim()
  if (!trimmed || hasSuffix(trimmed)) return trimmed
  return `${trimmed}${EVENT_TITLE_SUFFIX}`
}

/**
 * For a title WE generate (the default taken from the event name): same as withEventTitleSuffix,
 * but trims the event name on a word boundary first when needed so the finished title still fits
 * the 60-character SEO limit. Stored titles an admin wrote are never trimmed.
 */
export function buildDefaultEventMetaTitle(eventTitle: unknown): string {
  if (typeof eventTitle !== 'string') return ''
  const trimmed = eventTitle.trim()
  if (!trimmed || hasSuffix(trimmed)) return trimmed
  const room = EVENT_TITLE_MAX_LENGTH - EVENT_TITLE_SUFFIX.length
  if (trimmed.length <= room) return `${trimmed}${EVENT_TITLE_SUFFIX}`
  const cut = trimmed.lastIndexOf(' ', room)
  const base = (cut > room * 0.6 ? trimmed.slice(0, cut) : trimmed.slice(0, room)).replace(/[\s,;:.\-–—|]+$/, '')
  return `${base}${EVENT_TITLE_SUFFIX}`
}
