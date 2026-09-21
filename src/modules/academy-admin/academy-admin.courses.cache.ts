// modules/academy-admin/academy-admin.courses.cache.ts
//
// Read-through cache for the paginated /list read, invalidated on every write route that changes
// course data (create/update/delete) - same style as professionals.cache.ts (parameterized keys +
// `deleteKeysByPattern` patterns). Legacy's own add_n_update_details already invalidated
// 'academy_course_list_*'/'lessons_list_*'/'individual_lesson_*' on write, but never actually
// cached the list read itself - this closes that half of the gap (see the legacy-api-module-
// migration skill's "a .cache.ts that only handles invalidation is half the job" note).
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

export const ACADEMY_COURSE_LIST_CACHE_PATTERN = 'academy_course_list_*'
// Preserved verbatim from legacy's own invalidation list (lessons.js/quiz_questions.js's own
// list/detail caches also key off these patterns) - not this module's own cache, but still
// invalidated here since course writes affect lesson listings' displayed course names too.
export const ACADEMY_LESSONS_LIST_CACHE_PATTERN = 'lessons_list_*'
export const ACADEMY_INDIVIDUAL_LESSON_CACHE_PATTERN = 'individual_lesson_*'

export async function invalidateCourseCaches(): Promise<void> {
  await Promise.all([deleteKeysByPattern(ACADEMY_COURSE_LIST_CACHE_PATTERN), deleteKeysByPattern(ACADEMY_LESSONS_LIST_CACHE_PATTERN), deleteKeysByPattern(ACADEMY_INDIVIDUAL_LESSON_CACHE_PATTERN)])
}

export function buildCourseListKey(skip: number, limit: number, query: Record<string, unknown>): string {
  return `academy_course_list_${skip}_${limit}_${JSON.stringify(query || {})}`
}

// The list is read on every Manage Courses page load/filter change; a short TTL absorbs bursts
// of identical requests while bounding staleness after a write.
export const ACADEMY_COURSE_LIST_TTL_SECONDS = 60

export { getCache, setCache }
