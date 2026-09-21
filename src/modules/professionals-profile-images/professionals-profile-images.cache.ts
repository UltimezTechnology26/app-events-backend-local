// modules/professionals-profile-images/professionals-profile-images.cache.ts
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

const PROFILE_IMAGE_CACHE_PATTERNS = [
  'speakers_list_*',
  'event_speakers_list_*',
  'individual_event_*',
  'app_company_individual_details_*',
  'user_detail*',
  'app_user_detail_*',
  'app_popular_professionals*',
] as const

// CONFIRMED CLEANUP, NOT A BEHAVIOR CHANGE: legacy's /update_profile_image "no existing image row"
// branch called this exact same set of 7 deleteKeysByPattern invalidations TWICE in a row
// (~1848-1850 then ~1856-1862, with professionalsM.updateOne sandwiched between the two
// identical blocks). Which keys end up deleted is identical whether invalidated once or twice —
// collapsing to one call removes redundant Redis round-trips without changing any observable
// response or cache state.
export async function invalidateProfileImageCaches(): Promise<void> {
  await Promise.all(PROFILE_IMAGE_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
