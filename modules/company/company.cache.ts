// modules/company/company.cache.ts
const { getCache, setCache } = require('../../config/cache_helper')
import { SHARED_COMPANY_CACHE_PATTERNS, invalidateSharedCompanyCaches } from '../common/common.cache-patterns'

export { getCache, setCache, SHARED_COMPANY_CACHE_PATTERNS, invalidateSharedCompanyCaches }
