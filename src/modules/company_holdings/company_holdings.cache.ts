// modules/company_holdings/company_holdings.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import { invalidateSharedCompanyCaches } from '../common/common.cache-patterns'

export const COMPANY_HOLDINGS_CACHE_PATTERNS = [
  'company_holdings_list_*'
] as const

export async function invalidateCompanyHoldingsCaches(): Promise<void> {
  await Promise.all([
    ...COMPANY_HOLDINGS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateSharedCompanyCaches()
  ])
}

export function buildHoldingListKey(companyRowId: number, skip: number, limit: number): string {
  return `company_holdings_list_${companyRowId}_${skip}_${limit}_`
}

export { getCache, setCache }
