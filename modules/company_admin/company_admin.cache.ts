// modules/company_admin/company_admin.cache.ts
const { getCache, setCache } = require('../../config/cache_helper')

const NEW_COMPANY_YEARS_OVERVIEW_KEY = 'new_company_years_overview'

export async function getNewCompanyYearsOverviewCache() {
  return getCache({ key: NEW_COMPANY_YEARS_OVERVIEW_KEY })
}

export async function setNewCompanyYearsOverviewCache(value: any) {
  return setCache({ key: NEW_COMPANY_YEARS_OVERVIEW_KEY, value, ttl: 120 })
}
