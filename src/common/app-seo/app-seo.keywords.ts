// src/common/app-seo/app-seo.keywords.ts
//
// Meta keywords are saved as one comma-separated string. A keyword listed twice (compared
// case-insensitively, ignoring surrounding spaces) is rejected on save for every module that has
// an SEO Details form (events, companies, professionals).
import type { NextFunction, Request, Response } from 'express'

/** Keywords that appear more than once in the comma-separated list, as first written. */
export function findDuplicateKeywords(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const seen = new Set<string>()
  const duplicates = new Map<string, string>()
  for (const raw of value.split(',')) {
    const keyword = raw.trim()
    if (!keyword) continue
    const key = keyword.toLowerCase()
    if (seen.has(key)) duplicates.set(key, keyword)
    else seen.add(key)
  }
  return [...duplicates.values()]
}

/**
 * Express middleware for an SEO-save route: answers `status:false` (the same envelope the SEO form
 * already shows in its error modal via `alert_message`) when `meta_keywords` repeats a keyword.
 */
export function rejectDuplicateKeywords(req: Request, res: Response, next: NextFunction) {
  const duplicates = findDuplicateKeywords(req.body?.meta_keywords)
  if (duplicates.length === 0) return next()
  const alert_message = `Duplicate keywords are not allowed: ${duplicates.join(', ')}.`
  return res.json({ status: false, message: { alert_message, meta_keywords: alert_message } })
}
