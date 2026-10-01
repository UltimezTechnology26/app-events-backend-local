// common/name-similarity/name-similarity.ts
//
// Generic bigram-similarity scoring, extracted out of company.duplicate-check.ts (2026-09-22) so
// the professionals duplicate-name check can reuse the exact same algorithm instead of a
// copy-pasted second implementation - CLAUDE.md's "no code block duplicated across services"
// rule. `normalizeName`'s `stripWords` param defaults to none - Company's own corporate-suffix
// list is now passed in explicitly by that module, professionals passes none (a person's name has
// no equivalent of "Inc"/"LLC" to strip).

/** Lowercase, strip punctuation, collapse whitespace, drop any word in `stripWords`. */
export function normalizeName(name: string, stripWords: readonly string[] = []): string {
  const stripped = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (stripWords.length === 0) return stripped

  const stripSet = new Set(stripWords)
  const words = stripped.split(' ').filter((word) => !stripSet.has(word))
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
