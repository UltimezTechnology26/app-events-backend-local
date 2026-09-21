// modules/academy-admin/academy-admin.users.queries.ts
//
// Ports users.js's GET /users_list/:skip/:limit (~line 247-551) and GET
// /certificate_list/:skip/:limit (~line 940-1129) aggregation-building logic.
import { extractPaginatedResult } from '../common/common.pagination'

export function buildCourseMatchExpr(courseRowId?: number): Record<string, unknown>[] {
  return courseRowId !== undefined && !Number.isNaN(courseRowId) ? [{ $eq: ['$course_row_id', courseRowId] }] : []
}

export function buildUsersListSearchQuery({ search, date }: { search?: string; date?: string }): Record<string, unknown> {
  const searchArray: Record<string, unknown>[] = []

  if (date) {
    const inputDate = new Date(date)
    const startDate = new Date(new Date(inputDate).setHours(0, 0, 0, 0))
    const endDate = new Date(new Date(inputDate).setHours(23, 59, 59, 999))
    searchArray.push({ date_n_time: { $gte: startDate, $lte: endDate } })
  }

  if (search) {
    searchArray.push({ $or: [{ full_name: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] })
  }

  return searchArray.length > 0 ? { $and: searchArray } : {}
}

/**
 * $facet-converted version of /users_list's aggregation pipeline.
 *
 * CONFIRMED PERF FIX: legacy applied `.skip(skip).limit(limit)` (Mongoose just appends
 * `{$skip}`/`{$limit}` to the pipeline's END) AFTER three expensive per-professional
 * sub-pipeline $lookups (`completed_summary`, `ongoing_courses`, each themselves joining
 * `cln_academy_courses_lessons` again) - so every one of those ran against the FULL matched set
 * of professionals with any quiz activity, not just the returned page. The `first_lesson` lookup
 * (needed to compute `first_lesson_date`, which the results are SORTED by) genuinely must run
 * before pagination - sorting after paginating would be wrong - so it stays pre-facet; the two
 * purely-DISPLAY lookups (`profile_info`, `completed_summary`, `ongoing_courses`) move into the
 * $facet's `data` branch, where they only ever run against the page actually returned. The
 * separate legacy `totalResult` aggregate (a second, cheaper pass) is folded into the same $facet
 * call as `totalCount`.
 */
export function buildUsersListPipeline({ searchQuery, courseMatchExpr, skip, limit }: { searchQuery: Record<string, unknown>; courseMatchExpr: Record<string, unknown>[]; skip: number; limit: number }) {
  return [
    {
      $lookup: {
        from: 'cln_academy_quiz_lession_started_details',
        let: { userId: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$user_row_id', '$$userId'] }, ...courseMatchExpr] } } }, { $limit: 1 }],
        as: 'has_quiz',
      },
    },
    { $match: { 'has_quiz.0': { $exists: true }, ...searchQuery } },
    {
      $lookup: {
        from: 'cln_academy_quiz_lession_started_details',
        let: { userId: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$user_row_id', '$$userId'] } } }, { $sort: { date_n_time: 1 as const } }, { $limit: 1 }, { $project: { date_n_time: 1, _id: 0 } }],
        as: 'first_lesson',
      },
    },
    { $addFields: { first_lesson_date: { $arrayElemAt: ['$first_lesson.date_n_time', 0] } } },
    { $sort: { first_lesson_date: -1 as const } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'profile_info' } },
          { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_academy_quiz_lession_started_details',
              let: { userId: '$_id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$user_row_id', '$$userId'] }, { $eq: ['$lesson_status', 1] }, ...courseMatchExpr] } } },
                { $group: { _id: '$course_row_id', completed_lessons: { $sum: 1 } } },
                { $lookup: { from: 'cln_academy_courses_lessons', localField: '_id', foreignField: 'course_row_id', as: 'total_lessons' } },
                { $addFields: { total_lessons_count: { $size: '$total_lessons' } } },
                { $match: { $expr: { $eq: ['$completed_lessons', '$total_lessons_count'] } } },
                { $count: 'completed_courses' },
              ],
              as: 'completed_summary',
            },
          },
          { $addFields: { completed_courses: { $ifNull: [{ $arrayElemAt: ['$completed_summary.completed_courses', 0] }, 0] } } },
          {
            $lookup: {
              from: 'cln_academy_quiz_lession_started_details',
              let: { userId: '$_id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$user_row_id', '$$userId'] }, ...courseMatchExpr] } } },
                { $group: { _id: '$course_row_id', completed_lessons: { $sum: { $cond: [{ $eq: ['$lesson_status', 1] }, 1, 0] } } } },
                { $lookup: { from: 'cln_academy_courses_lessons', localField: '_id', foreignField: 'course_row_id', as: 'all_lessons' } },
                { $addFields: { total_lessons: { $size: '$all_lessons' } } },
                { $match: { $expr: { $and: [{ $gt: ['$completed_lessons', 0] }, { $lt: ['$completed_lessons', '$total_lessons'] }] } } },
                { $lookup: { from: 'cln_academy_courses', localField: '_id', foreignField: '_id', pipeline: [{ $project: { course_name: 1, _id: 0 } }], as: 'course_info' } },
                { $project: { course_name: { $arrayElemAt: ['$course_info.course_name', 0] } } },
              ],
              as: 'ongoing_courses',
            },
          },
          {
            $project: {
              _id: 1,
              user_name: 1,
              pro_batch: 1,
              full_name: 1,
              email_id: 1,
              completed_courses: 1,
              ongoing_courses: 1,
              date_n_time: '$first_lesson_date',
              profile_image: '$profile_info.profile_image',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractUsersListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}

export function buildCertificateListMatchQuery({ date, courseRowId }: { date?: string; courseRowId?: number }): Record<string, unknown> {
  const searchArray: Record<string, unknown>[] = []

  if (date) {
    const inputDate = new Date(date)
    const startDate = new Date(new Date(inputDate).setHours(0, 0, 0, 0))
    const endDate = new Date(new Date(inputDate).setHours(23, 59, 59, 999))
    searchArray.push({ date_n_time: { $gte: startDate, $lte: endDate } })
  }

  if (courseRowId !== undefined && !Number.isNaN(courseRowId)) {
    searchArray.push({ course_row_id: courseRowId })
  }

  return searchArray.length > 0 ? { $and: searchArray } : {}
}

/**
 * $facet-converted version of /certificate_list's aggregation pipeline.
 *
 * CONFIRMED PERF FIX: legacy's own search-by-name $match sits AFTER the course/lessons lookups
 * even though it only depends on `user_info` (available right after the 2nd lookup) - and the
 * whole pipeline runs twice, once via `.skip().limit()` for data and again (identically, minus
 * pagination) for `$count`. Restructured so the search filter applies right after the `user_info`
 * lookup it actually needs, and $facet-converted so the two remaining display-only lookups
 * (`lessons`/`first_lesson`+`first_answer`, needed only for `lesson_count`/`start_date`) only run
 * against the returned page.
 */
export function buildCertificateListPipeline({ matchQuery, search, skip, limit }: { matchQuery: Record<string, unknown>; search?: string; skip: number; limit: number }) {
  return [
    { $match: matchQuery },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    ...(search ? [{ $match: { 'user_info.full_name': { $regex: search, $options: 'i' } } }] : []),
    { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
    { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'profile_info' } },
          { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_academy_courses_lessons', localField: 'course_row_id', foreignField: 'course_row_id', as: 'lessons' } },
          { $addFields: { lesson_count: { $size: '$lessons' } } },
          {
            $lookup: {
              from: 'cln_academy_courses_lessons',
              let: { courseId: '$course_row_id' },
              pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$course_row_id', '$$courseId'] }, { $eq: ['$lesson_number', 1] }] } } }, { $project: { _id: 1 } }],
              as: 'first_lesson',
            },
          },
          { $unwind: { path: '$first_lesson', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_academy_quiz_answers',
              let: { userId: '$user_row_id', lessonId: '$first_lesson._id' },
              pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$user_row_id', '$$userId'] }, { $eq: ['$lesson_row_id', '$$lessonId'] }] } } }, { $limit: 1 }, { $project: { _id: 0, date_n_time: 1 } }],
              as: 'first_answer',
            },
          },
          { $addFields: { start_date: { $arrayElemAt: ['$first_answer.date_n_time', 0] } } },
          {
            $project: {
              _id: 0,
              certificate_id: '$_id',
              user_row_id: '$user_row_id',
              full_name: '$user_info.full_name',
              user_name: '$user_info.user_name',
              email_id: '$user_info.email_id',
              pro_batch: '$user_info.pro_batch',
              profile_image: '$profile_info.profile_image',
              course_name: '$course_info.course_name',
              course_url: '$course_info.course_slug',
              course_row_id: '$course_row_id',
              percentage_score: '$percentage_score',
              download_status: '$download_status',
              certificate_pdf_url: '$certificate_pdf_url',
              end_date: '$date_n_time',
              lesson_count: '$lesson_count',
              start_date: '$start_date',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractCertificateListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}
