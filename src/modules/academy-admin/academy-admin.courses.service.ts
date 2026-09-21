// modules/academy-admin/academy-admin.courses.service.ts
//
// Ports courses.js's Courses CRUD routes (add_n_update_details/list/details/delete,
// ~line 1160-1467) - the genuinely Phase-1-relevant slice of that 1,467-line legacy controller.
// The file's other routes (/overview, /testing, /participatedcounts, /lessonscompleted) are
// dashboard/analytics endpoints belonging to a separate, later phase - not ported here.
import { CoursesM, LessonsM } from './academy-admin.models'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for these helpers (see professionals.service.ts)
const sanitize = require('mongo-sanitize')
const { getPresentDateTime, validateAndSaveImage } = require('../../../utils/helpers/helper')
import { buildCourseListMatchQuery, buildCourseListPipeline, extractCourseListResult } from './academy-admin.courses.queries'
import { getCache, setCache, buildCourseListKey, ACADEMY_COURSE_LIST_TTL_SECONDS, invalidateCourseCaches } from './academy-admin.courses.cache'
import { GetCourseListParams, SaveCourseInput } from './academy-admin.courses.types'

/** Ported verbatim from courses.js's own `generateCourseUrl` helper (slug generation). */
export async function generateCourseUrl(value: string): Promise<string | false> {
  try {
    const trimStr = value.trim().toLowerCase()
    const normalized = trimStr.replace(/\s+/g, ' ')
    const hyphenated = normalized.replace(/\s/g, '-')
    let cleaned = hyphenated.replace(/[&/#\\,+()$~%.'":*?<>{}|^]/g, '')
    if (cleaned.endsWith('-')) {
      cleaned = cleaned.slice(0, -1)
    }
    return cleaned
  } catch {
    return false
  }
}

export async function getCourseList(params: GetCourseListParams) {
  const skip = !Number.isNaN(Number.parseFloat(params.skipRaw)) ? Number.parseFloat(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseFloat(params.limitRaw)) ? Number.parseFloat(params.limitRaw) : 100
  const matchQuery = buildCourseListMatchQuery({ search: params.search, date: params.date })

  const cacheKey = buildCourseListKey(skip, limit, { search: params.search, date: params.date })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) return cached.message

  const pipeline = buildCourseListPipeline({ matchQuery, skip, limit })
  const aggregateOutput = await CoursesM.aggregate(pipeline)
  const { data, count } = extractCourseListResult(aggregateOutput)

  const result = { status: true, message: data, count }
  await setCache({ key: cacheKey, value: result, ttl: ACADEMY_COURSE_LIST_TTL_SECONDS })
  return result
}

export async function getCourseDetail(courseRowIdRaw: string) {
  const courseRowId = Number.parseFloat(sanitize(courseRowIdRaw))
  if (Number.isNaN(courseRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Course Row ID.' } }
  }

  const course = await CoursesM.findOne({ _id: courseRowId })
  if (!course) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Course row id.' } }
  }

  return { status: true, message: course }
}

export async function saveCourse(input: SaveCourseInput) {
  const errObj: Record<string, string> = {}
  let courseRowId: number | undefined

  if (input.courseRowIdRaw) {
    courseRowId = Number.parseFloat(input.courseRowIdRaw)
    if (Number.isNaN(courseRowId)) {
      errObj.course_row_id = 'Sorry, Invalid Course Row ID.'
    } else {
      const existing = await CoursesM.findOne({ _id: courseRowId })
      if (!existing) {
        errObj.course_row_id = 'Sorry, Invalid Course Row ID.'
      }
    }
  }

  if (input.courseName) {
    const whereCourseName: Record<string, unknown> = courseRowId ? { course_name: sanitize(input.courseName), _id: { $ne: courseRowId } } : { course_name: sanitize(input.courseName) }
    const duplicate = await CoursesM.findOne(whereCourseName, { _id: 1 })
    if (duplicate) {
      errObj.course_name = 'Sorry, This Course Name already exists.'
    }
  }

  let courseImage = ''
  if (Object.keys(errObj).length === 0 && input.courseImage) {
    const validated = await validateAndSaveImage(input.courseImage, 9)
    if (!validated.status) {
      errObj.course_image = 'Sorry, Invalid course image.'
    } else {
      courseImage = validated.webp_file_name
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const generatedUrl = await generateCourseUrl(input.courseName as string)
  const saveObject = {
    course_name: input.courseName,
    course_description: input.courseDescription,
    date_n_time: getPresentDateTime(),
    course_slug: generatedUrl,
    course_image: courseImage,
    expert_tag: input.expertTag,
    meta_keywords: input.metaKeywords,
    meta_description: input.metaDescription,
  }

  if (courseRowId) {
    await CoursesM.updateOne({ _id: courseRowId }, { $set: saveObject })
    await invalidateCourseCaches()
    return { status: true, message: { alert_message: 'This Course details has been updated successfully.' } }
  }

  await new CoursesM(saveObject).save()
  await invalidateCourseCaches()
  return { status: true, message: { alert_message: 'This Course details has been added successfully.' } }
}

export async function deleteCourse(courseRowIdRaw: string) {
  const courseRowId = Number.parseFloat(courseRowIdRaw)
  if (Number.isNaN(courseRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid course Row ID.' } }
  }

  const course = await CoursesM.findOne({ _id: courseRowId })
  if (!course) {
    return { status: false, message: { alert_message: 'Sorry, Invalid course row id.' } }
  }

  const referencingLesson = await LessonsM.findOne({ course_row_id: courseRowId })
  if (referencingLesson) {
    return { status: false, message: { alert_message: "You'll need to remove this course from all lessons before deleting it." } }
  }

  await CoursesM.deleteOne({ _id: courseRowId })
  await invalidateCourseCaches()
  return { status: true, message: { alert_message: 'This course details has been deleted successfully.' } }
}
