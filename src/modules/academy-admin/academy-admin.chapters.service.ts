// modules/academy-admin/academy-admin.chapters.service.ts
//
// Ports chapters.js's Chapters CRUD routes (courses_list/add_n_update_details/list/details/delete,
// ~line 1-333) verbatim. No caching added here (unlike Courses) - legacy has none on this
// collection either, and Chapters is a lower-traffic, lower-cardinality admin list (one page per
// course) than Sources/Courses; not worth the added invalidation surface for this volume.
import { ChaptersM, CoursesM, LessonsM } from './academy-admin.models'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for this helper (see academy-admin.courses.service.ts)
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { buildChapterListMatchQuery, buildChapterListPipeline, extractChapterListResult } from './academy-admin.chapters.queries'
import { GetChapterListParams, SaveChapterInput } from './academy-admin.chapters.types'

/**
 * Ports /courses_list (~line 11-18) - a course-name dropdown source for the chapter form.
 *
 * CONFIRMED PRE-EXISTING BUG, ported as-is (flagged, not fixed): the legacy projection includes
 * `course_url`, a field that doesn't exist on the Courses schema (the real field is
 * `course_slug`) - it always projects as `undefined`. Harmless (the frontend dropdown only needs
 * `_id`/`course_name`), but a real, confirmed field-name typo worth naming rather than silently
 * "fixing" the projection's shape.
 */
export async function getCoursesForChapterForm() {
  const courses = await CoursesM.find({}, { _id: 1, course_name: 1, course_url: 1 }).sort({ course_name: 1 })
  return { status: true, message: courses }
}

export async function getChapterList(params: GetChapterListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100
  const courseRowId = params.courseRowIdRaw !== undefined ? Number.parseInt(params.courseRowIdRaw) : undefined
  const matchQuery = buildChapterListMatchQuery({ search: params.search, date: params.date, courseRowId })

  const pipeline = buildChapterListPipeline({ matchQuery, skip, limit })
  const aggregateOutput = await ChaptersM.aggregate(pipeline)
  const { data, count } = extractChapterListResult(aggregateOutput)

  return { status: true, message: data, count }
}

export async function getChapterDetail(chapterRowIdRaw: string) {
  const chapterRowId = Number.parseInt(chapterRowIdRaw)
  if (Number.isNaN(chapterRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Course Row ID.' } }
  }

  const chapter = await ChaptersM.findOne({ _id: chapterRowId })
  if (!chapter) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Chapter row id.' } }
  }

  return { status: true, message: chapter }
}

export async function saveChapter(input: SaveChapterInput) {
  const errObj: Record<string, string> = {}
  let chapterRowId: number | undefined

  if (input.chapterRowIdRaw) {
    chapterRowId = Number.parseInt(input.chapterRowIdRaw)
    if (Number.isNaN(chapterRowId)) {
      errObj.chapter_row_id = 'Sorry, Invalid Chapter Row ID.'
    } else {
      const existing = await ChaptersM.findOne({ _id: chapterRowId })
      if (!existing) {
        errObj.chapter_row_id = 'Sorry, Invalid Chapter Row ID.'
      }
    }
  }

  let courseRowId: number | undefined
  if (input.courseRowIdRaw) {
    courseRowId = Number.parseInt(input.courseRowIdRaw)
    if (Number.isNaN(courseRowId)) {
      errObj.course_row_id = 'Sorry, Invalid Course Row ID.'
    } else {
      const course = await CoursesM.findOne({ _id: courseRowId }, { _id: 1 })
      if (!course) {
        errObj.course_row_id = 'Sorry, Invalid Course Row ID.'
      } else if (input.chapterNumberRaw) {
        const chapterNumber = Number.parseInt(input.chapterNumberRaw)
        if (Number.isNaN(chapterNumber)) {
          errObj.chapter_number = 'Sorry, Invalid Chapter Number'
        } else {
          const whereChapterNumber: Record<string, unknown> = chapterRowId
            ? { chapter_number: input.chapterNumberRaw, course_row_id: courseRowId, _id: { $ne: chapterRowId } }
            : { chapter_number: input.chapterNumberRaw, course_row_id: courseRowId }
          const duplicate = await ChaptersM.findOne(whereChapterNumber, { _id: 1 })
          if (duplicate) {
            errObj.chapter_number = 'Sorry, This Chapter Number already exists.'
          }
        }
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (chapterRowId) {
    const updateArray = {
      course_row_id: input.courseRowIdRaw,
      chapter_number: input.chapterNumberRaw,
      title: input.title,
      description: input.description,
    }
    await ChaptersM.updateOne({ _id: chapterRowId }, { $set: updateArray })
    return { status: true, message: { alert_message: 'This Chapter details has been updated successfully.' } }
  }

  const saveObject = {
    course_row_id: input.courseRowIdRaw,
    chapter_number: input.chapterNumberRaw,
    title: input.title,
    description: input.description,
    date_n_time: getPresentDateTime(),
  }
  await new ChaptersM(saveObject).save()
  return { status: true, message: { alert_message: 'This Chapter details has been added successfully.' } }
}

export async function deleteChapter(chapterRowIdRaw: string) {
  const chapterRowId = Number.parseInt(chapterRowIdRaw)
  if (Number.isNaN(chapterRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid chapter Row ID.' } }
  }

  const chapter = await ChaptersM.findOne({ _id: chapterRowId })
  if (!chapter) {
    return { status: false, message: { alert_message: 'Sorry, Invalid chapter row id.' } }
  }

  const referencingLesson = await LessonsM.findOne({ chapter_row_id: chapterRowId })
  if (referencingLesson) {
    return { status: false, message: { alert_message: "Sorry, This chapter can't delete beacuse its used in some lessons." } }
  }

  await ChaptersM.deleteOne({ _id: chapterRowId })
  return { status: true, message: { alert_message: 'This chapter details has been deleted successfully.' } }
}
