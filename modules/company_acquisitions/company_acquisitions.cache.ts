const { getCache, setCache, deleteKeysByPattern } = require('../../config/cache_helper')

/** Deduped union of every cache pattern seen across all company-acquisitions write routes. */
export const COMPANY_ACQUISITIONS_CACHE_PATTERNS = [
  'company_acquisitions_list_*'
] as const

export async function invalidateCompanyAcquisitionsCaches(): Promise<void> {
  await Promise.all(COMPANY_ACQUISITIONS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

export function buildCompanyAcquisitionsListKey(companyRowId: number, skip: number, limit: number): string {
  return `company_acquisitions_list_${companyRowId}_${skip}_${limit}`
}

export { getCache, setCache }
