// modules/professionals/professionals.duplicate-check.ts
//
// Advisory-only duplicate-name check for the admin "Create New Professional" form (user-requested,
// 2026-09-22) - mirrors company.duplicate-check.ts exactly, scoped to `full_name` on `ProfessionalM`
// instead of `company_name` on `CompanyM`. Never blocks creation; it only surfaces information so
// the admin can make an informed call and skip creating a genuine duplicate. Scoped to the admin
// creation flow only (not self-registration), per the same decision already made for Company.
import { ProfessionalM } from './professionals.models'
import { nameSimilarity, normalizeName } from '../../common/name-similarity/name-similarity'

const SIMILARITY_THRESHOLD = 0.6
const MAX_SIMILAR_MATCHES = 5
const CANDIDATE_FETCH_LIMIT = 20000

export interface DuplicateProfessionalMatch {
  _id: number
  full_name: string
  user_name: string | null
  similarity: number
}

export interface DuplicateCheckResult {
  exact_match: DuplicateProfessionalMatch | null
  similar_matches: DuplicateProfessionalMatch[]
}

/**
 * Exact match (case-insensitive) plus up to 5 "similar name" candidates above a similarity
 * threshold - same algorithm and scale tradeoff as `checkCompanyNameForDuplicates` (an in-memory
 * scan over up to 20,000 candidates, no schema change or backfill needed). No corporate-suffix
 * stripping here - a person's name has no equivalent of "Inc"/"LLC".
 */
export async function checkProfessionalNameForDuplicates(rawName: string, excludeUserRowId?: number): Promise<DuplicateCheckResult> {
  const trimmedName = rawName.trim()
  if (!trimmedName) return { exact_match: null, similar_matches: [] }

  const normalizedTarget = normalizeName(trimmedName)

  const [exactMatchDoc, candidates] = await Promise.all([
    ProfessionalM.findOne({ full_name: trimmedName }).collation({ locale: 'en', strength: 2 }).select('_id full_name user_name'),
    ProfessionalM.find({}, { _id: 1, full_name: 1, user_name: 1 }).limit(CANDIDATE_FETCH_LIMIT),
  ])

  const exactMatch: DuplicateProfessionalMatch | null =
    exactMatchDoc && Number(exactMatchDoc._id) !== excludeUserRowId
      ? { _id: Number(exactMatchDoc._id), full_name: exactMatchDoc.full_name ?? '', user_name: exactMatchDoc.user_name ?? null, similarity: 1 }
      : null

  const scored: DuplicateProfessionalMatch[] = []
  for (const candidate of candidates) {
    const candidateId = Number(candidate._id)
    if (candidateId === excludeUserRowId) continue
    if (exactMatch && candidateId === exactMatch._id) continue
    if (!candidate.full_name) continue

    const similarity = nameSimilarity(normalizedTarget, normalizeName(candidate.full_name))
    if (similarity >= SIMILARITY_THRESHOLD) {
      scored.push({ _id: candidateId, full_name: candidate.full_name, user_name: candidate.user_name ?? null, similarity })
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity)

  return { exact_match: exactMatch, similar_matches: scored.slice(0, MAX_SIMILAR_MATCHES) }
}
