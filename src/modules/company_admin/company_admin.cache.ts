// modules/company_admin/company_admin.cache.ts
import { getCache, setCache } from '@ultimez-interview/coinpedia-backend-library/cache'
import { YearsOverviewResult } from './company_admin.types'

const NEW_COMPANY_YEARS_OVERVIEW_KEY = 'new_company_years_overview'

export async function getNewCompanyYearsOverviewCache() {
  return getCache({ key: NEW_COMPANY_YEARS_OVERVIEW_KEY })
}

export async function setNewCompanyYearsOverviewCache(value: YearsOverviewResult) {
  return setCache({ key: NEW_COMPANY_YEARS_OVERVIEW_KEY, value, ttl: 120 })
}
