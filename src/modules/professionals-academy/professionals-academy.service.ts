// modules/professionals-academy/professionals-academy.service.ts
// Ports controllers/main/users.js's certificate_list / save_n_update_visibility /
// certificate_visible / save_certificate_urls (~844-1166). Same behavior, same response shape.
import { CoursesCertificatesM } from './professionals-academy.models'
import { getCompletedCertificates, getInProgressCourses, getPublicCertificates } from './professionals-academy.queries'
import { getCache, setCache, buildCertificateListKey, buildCertificateVisibleKey, invalidateProfessionalsAcademyCaches } from './professionals-academy.cache'
import type { UserAuthResult } from './professionals-academy.types'

const CERTIFICATE_LIST_CACHE_TTL_SECONDS = 60

export function resolveUserRowId(auth: UserAuthResult, queryUserRowIdRaw: unknown): number {
  if (!auth.status) return 0
  if (auth.message.user_type === 1) return auth.message.user_row_id
  const parsed = Number.parseInt(queryUserRowIdRaw as string)
  return Number.isNaN(parsed) ? 0 : parsed
}

// CONFIRMED PERF FIX: legacy runs these two aggregates as two sequential `await`s even though
// neither depends on the other's result — Promise.all them, matching this migration's standard
// independent-query fix (see professionals.detail.service.ts for the same pattern on a larger
// scale).
export async function getCertificateList(userRowId: number) {
  const cacheKey = buildCertificateListKey(userRowId)
  const cached = await getCache({ key: cacheKey })
  // CONFIRMED BUG FIX (found via live before/after comparison against legacy): getCache always
  // resolves to a {status, message} envelope, `{status:false, message:null}` on a cache miss —
  // never null/undefined. `if (cached)` was always truthy, so every request short-circuited into
  // returning `{status:false, message:null}` instead of ever computing the real result. Must
  // check `cached.status`, and unwrap `cached.message` (the stored result), matching every other
  // module's usage of this cache helper (see funding.controller.ts).
  if (cached.status) return cached.message

  const [certificates, progressCourses] = await Promise.all([getCompletedCertificates(userRowId), getInProgressCourses(userRowId)])

  const completedCourseIds = new Set(certificates.map((c: any) => c.course_row_id.toString()))
  const progressFiltered = progressCourses.filter((c: any) => !completedCourseIds.has(c.course_row_id.toString()))
  const finalCourses = [...certificates, ...progressFiltered]

  const result = finalCourses.length === 0
    ? { status: false, message: 'No courses found for this user.' }
    : { status: true, message: finalCourses }

  if (result.status) await setCache({ key: cacheKey, value: result, ttl: CERTIFICATE_LIST_CACHE_TTL_SECONDS })
  return result
}

export async function saveNUpdateVisibility(userRowId: number, courseRowId: number, certificatePublic: unknown) {
  if (!userRowId || !courseRowId) {
    return { status: false, message: 'Missing required fields: user_row_id and course_row_id are required.', user_row_id: { user_row_id: userRowId, course_row_id: courseRowId } }
  }

  const existingCertificate = await CoursesCertificatesM.findOne({ user_row_id: userRowId, course_row_id: courseRowId })
  if (!existingCertificate) {
    return { status: false, message: 'Certificate not found for the given user and course.' }
  }

  existingCertificate.certificate_public = Boolean(certificatePublic)
  await existingCertificate.save()
  await invalidateProfessionalsAcademyCaches()

  return {
    status: true,
    message: 'Certificate visibility settings updated successfully.',
    data: {
      certificate_id: existingCertificate._id,
      average_score: existingCertificate.percentage_score,
      user_row_id: existingCertificate.user_row_id,
      course_row_id: existingCertificate.course_row_id,
      certificate_public: existingCertificate.certificate_public,
    },
  }
}

export async function getCertificateVisible(userRowId: number) {
  const cacheKey = buildCertificateVisibleKey(userRowId)
  const cached = await getCache({ key: cacheKey })
  if (cached.status) return cached.message

  const certificates = await getPublicCertificates(userRowId)
  const result = certificates.length === 0
    ? { status: false, message: 'No certificates found for this user.' }
    : { status: true, message: certificates }

  if (result.status) await setCache({ key: cacheKey, value: result, ttl: CERTIFICATE_LIST_CACHE_TTL_SECONDS })
  return result
}

export async function saveCertificateUrls(userRowId: number, courseRowId: number, certificatePdfUrl: string, certificateImageUrl: string) {
  if (!courseRowId || !certificatePdfUrl || !certificateImageUrl) {
    return { status: false, message: 'Missing required fields: course_row_id, certificate_pdf_url or certificate_image_url' }
  }

  await CoursesCertificatesM.findOneAndUpdate(
    { user_row_id: userRowId, course_row_id: courseRowId },
    { user_row_id: userRowId, course_row_id: courseRowId, certificate_pdf_url: certificatePdfUrl, certificate_image_url: certificateImageUrl },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await invalidateProfessionalsAcademyCaches()

  return { status: true, message: 'Certificate data saved successfully' }
}
