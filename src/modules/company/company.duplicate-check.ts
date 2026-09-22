// modules/company/company.duplicate-check.ts
//
// Advisory-only duplicate-company-name check for the admin "Create New Company" form
// (user-requested, 2026-09-22). Never blocks creation - the admin always keeps full freedom to
// create a company regardless of what this returns; it only surfaces information so they can make
// an informed call, and flags the new record for a later "Possible Duplicates" review queue if
// they proceed anyway. Scoped to company_name only (no website/URL comparison), and to the admin
// creation flow only (not public self-registration) - both per explicit user decision. Lives in
// this module (not company_admin) since it queries CompanyM directly and is called from both
// company_admin.controller.ts (the check-name endpoint) and company.settings.service.ts (the
// actual admin-create write path) - company_admin reaching in here is the normal direction (it
// already depends on this module's model via the legacy companyM.js reverse-shim).
import { CompanyM } from './company.models'

const SIMILARITY_THRESHOLD = 0.6
const MAX_SIMILAR_MATCHES = 5
const CANDIDATE_FETCH_LIMIT = 20000

// Common corporate suffixes that shouldn't by themselves make two names look "different" (e.g.
// "Coinbase" vs "Coinbase Inc" should score as near-identical, not merely similar).
const CORPORATE_SUFFIXES = ['inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'group', 'technologies', 'technology', 'tech']

export interface DuplicateCompanyMatch {
  _id: number
  company_name: string
  company_id: string
  similarity: number
}

export interface DuplicateCheckResult {
  exact_match: DuplicateCompanyMatch | null
  similar_matches: DuplicateCompanyMatch[]
}

/** Lowercase, strip punctuation, collapse whitespace, drop trailing corporate suffixes - so "Coinbase, Inc." and "coinbase inc" normalize to the same "coinbase". */
export function normalizeCompanyName(name: string): string {
  const stripped = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = stripped.split(' ').filter((word) => !CORPORATE_SUFFIXES.includes(word))
  return words.join(' ')
}

function toBigrams(value: string): Set<string> {
  const padded = ` ${value} `
  const bigrams = new Set<string>()
  for (let i = 0; i < padded.length - 1; i += 1) {
    bigrams.add(padded.slice(i, i + 2))
  }
  return bigrams
}

/** Dice's coefficient over character bigrams - simple, dependency-free, and good enough at this scale to rank "how close are these two names" without a real fuzzy-search engine. 1 = identical, 0 = nothing in common. */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const bigramsA = toBigrams(a)
  const bigramsB = toBigrams(b)
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0

  let overlap = 0
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) overlap += 1
  }
  return (2 * overlap) / (bigramsA.size + bigramsB.size)
}

/**
 * Exact match (case-insensitive, existing `findCompanyByNameCI` semantics) plus up to 5 "similar
 * name" candidates above a similarity threshold. The similarity pass fetches only `_id`/
 * `company_name`/`company_id` for every company and scores in memory - no schema change or
 * backfill needed to work against every existing company today. Flagged for revisit (a precomputed
 * indexed normalized-name field) if this collection grows large enough for a full scan to be felt -
 * not built preemptively for a check that only runs on the low-frequency "admin is creating a
 * company" action.
 */
export async function checkCompanyNameForDuplicates(rawName: string, excludeCompanyId?: number): Promise<DuplicateCheckResult> {
  const trimmedName = rawName.trim()
  if (!trimmedName) return { exact_match: null, similar_matches: [] }

  const normalizedTarget = normalizeCompanyName(trimmedName)

  const [exactMatchDoc, candidates] = await Promise.all([
    CompanyM.findOne({ company_name: trimmedName }).collation({ locale: 'en', strength: 2 }).select('_id company_name company_id'),
    CompanyM.find({}, { _id: 1, company_name: 1, company_id: 1 }).limit(CANDIDATE_FETCH_LIMIT),
  ])

  const exactMatch: DuplicateCompanyMatch | null =
    exactMatchDoc && Number(exactMatchDoc._id) !== excludeCompanyId
      ? { _id: Number(exactMatchDoc._id), company_name: exactMatchDoc.company_name, company_id: exactMatchDoc.company_id, similarity: 1 }
      : null

  const scored: DuplicateCompanyMatch[] = []
  for (const candidate of candidates) {
    const candidateId = Number(candidate._id)
    if (candidateId === excludeCompanyId) continue
    if (exactMatch && candidateId === exactMatch._id) continue

    const similarity = nameSimilarity(normalizedTarget, normalizeCompanyName(candidate.company_name))
    if (similarity >= SIMILARITY_THRESHOLD) {
      scored.push({ _id: candidateId, company_name: candidate.company_name, company_id: candidate.company_id, similarity })
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity)

  return { exact_match: exactMatch, similar_matches: scored.slice(0, MAX_SIMILAR_MATCHES) }
}
