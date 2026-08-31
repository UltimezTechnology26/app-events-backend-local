// modules/team-members/team-members.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
export { getCachedStaticPositionsList, invalidateStaticPositionsListCache } from '../work-experience/work-experience.cache'

export const TEAM_MEMBERS_CACHE_PATTERNS = [
  'employee_list_*',
  'app_company_individual_other_details_*',
  'app_user_other_details_*'
] as const

export async function invalidateTeamMembersCaches(): Promise<void> {
  await Promise.all(TEAM_MEMBERS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

export { getCache, setCache }
