// modules/academy-admin/academy-admin.lessons.queries.ts
//
// Ports lessons.js's GET /list/:skip/:limit (~line 262-530) and GET /participates_list/
// :lesson_row_id/:skip/:limit (~line 744-967) aggregation-building logic.
import { extractPaginatedResult } from '../common/common.pagination'

export function buildLessonListMatchQuery({ search, courseRowId }: { search?: string; courseRowId?: number }): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = []

  if (search) {
    query.push({ $or: [{ course_name: { $regex: search, $options: 'i' } }, { title: { $regex: search, $options: 'i' } }] })
  }

  if (courseRowId !== undefined && !Number.isNaN(courseRowId)) {
    query.push({ course_row_id: courseRowId })
  }

  return query
}

/**
 * $facet-converted version of /list's aggregation pipeline (ported verbatim otherwise, including
 * the average-time-spent sub-pipeline).
 *
 * CONFIRMED PERF FIX: the legacy route ran the full 3-lookup pipeline (courses, quiz questions,
 * participates, PLUS a $group-based average-time sub-pipeline against quiz answers) once for the
 * data page, then a SEPARATE, cheaper pipeline again just for `$count` — the second one re-did the
 * course $lookup for no reason since the count doesn't need `course_name`. Folded into one $facet
 * call; the count branch now matches on the pre-lookup fields only (search/course_row_id never
 * depend on the joined `course_name` in this route — legacy's own count pipeline already proved
 * this by joining and then filtering on the same $and it had before the join).
 */
export function buildLessonListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>[]; skip: number; limit: number }) {
  return [
    ...(matchQuery.length ? [{ $match: { $and: matchQuery } }] : []),
    {
      $facet: {
        data: [
          { $sort: { course_row_id: 1 as const, lesson_number: 1 as const } },
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
          { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_academy_quiz_questions', localField: '_id', foreignField: 'lesson_row_id', as: 'lessonQuestion' } },
          { $lookup: { from: 'cln_academy_quiz_lession_started_details', localField: '_id', foreignField: 'lesson_row_id', as: 'participates_info' } },
          {
            $lookup: {
              from: 'cln_academy_quiz_answers',
              let: { lesson_id: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$lesson_row_id', '$$lesson_id'] } } },
                { $group: { _id: { user: '$user_row_id' }, startTime: { $min: '$date_n_time' }, endTime: { $max: '$date_n_time' } } },
                { $project: { timeSpentSeconds: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 1000] } } },
                { $group: { _id: null, avgTimeSeconds: { $avg: '$timeSpentSeconds' } } },
              ],
              as: 'average_time_info',
            },
          },
          { $addFields: { time_spent: { $ifNull: [{ $arrayElemAt: ['$average_time_info.avgTimeSeconds', 0] }, 0] } } },
          { $set: { course_name: '$course_info.course_name', course_url: '$course_info.course_url' } },
          {
            $project: {
              _id: 1,
              title: 1,
              course_url: 1,
              course_name: 1,
              course_row_id: 1,
              date_n_time: 1,
              description: 1,
              lesson_image_url: 1,
              lesson_number: 1,
              lesson_status: 1,
              lesson_url: 1,
              author_name: 1,
              author_id: 1,
              author_link: 1,
              reviewed_by_name: 1,
              reviewed_by_id: 1,
              reviewed_by_link: 1,
              updated_on: 1,
              total_question: { $size: '$lessonQuestion' },
              total_participates: { $size: '$participates_info' },
              time_spent: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractLessonListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}

export function buildParticipatesMatchQuery({ lessonRowId, search, date, quizResult, lessonStatus }: { lessonRowId: number; search?: string; date?: string; quizResult?: number; lessonStatus?: number }): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = [{ lesson_row_id: lessonRowId }]

  if (date) {
    const inputDate = new Date(date)
    const startDate = new Date(inputDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(inputDate)
    endDate.setHours(23, 59, 59, 999)
    query.push({ date_n_time: { $gte: startDate, $lte: endDate } })
  }

  if (search) {
    query.push({ $or: [{ full_name: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] })
  }

  if (quizResult === 1) {
    query.push({ lesson_score: { $gte: 7 } })
  } else if (quizResult === 2) {
    query.push({ lesson_score: { $lt: 7 } })
  }

  if (lessonStatus === 1) {
    query.push({ lesson_status: 1 })
  } else if (lessonStatus === 2) {
    query.push({ lesson_status: 0 })
  }

  return query
}

const PARTICIPATES_USER_LOOKUP = {
  $lookup: {
    from: 'cln_professionals',
    localField: 'user_row_id',
    foreignField: '_id',
    as: 'user_info',
    pipeline: [
      { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
      { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, full_name: 1, pro_batch: 1, user_name: 1, email_id: 1, wallet_address: 1, mobile_number: 1, profile_image: '$img_info.profile_image' } },
    ],
  },
}

/**
 * $facet-converted version of /participates_list's aggregation pipeline.
 *
 * CONFIRMED PERF FIX: same "run the whole lookup-heavy pipeline twice, once for data once for
 * count" pattern as /list above - one $facet call replaces both. `lesson_score` is computed
 * post-join (it depends on `lessonAns`, itself a join), so the $match stays after the joins in
 * both branches, matching legacy's own ordering exactly (this is not the "match before lookup"
 * class of fix - that only applies when the filtered fields don't depend on the join).
 *
 * CONFIRMED PRE-EXISTING BUG, ported as-is (flagged, not fixed): the `quiz_result` filter
 * (`lesson_score: {$gte: 7}` / `{$lt: 7}`, see buildParticipatesMatchQuery) is applied in this
 * $match stage, but `lesson_score` is only ever computed in the LATER $project stage
 * ($size: '$lessonAns') - at $match time the field doesn't exist on any document yet. Mongo's
 * $gte/$lt on a missing field never matches, so whenever an admin picks a "Quiz Result" filter
 * value, the participates list silently returns zero rows, always. This is legacy's real,
 * current behavior (confirmed by reading the aggregation order, not assumed) - preserved
 * verbatim rather than silently reordering the pipeline to make the filter actually work, since
 * that would be a real behavior change needing sign-off first.
 */
export function buildParticipatesListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>[]; skip: number; limit: number }) {
  const joinAndScoreStages = [
    PARTICIPATES_USER_LOOKUP,
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_academy_quiz_answers', localField: '_id', foreignField: 'lesson_started_row_id', as: 'lessonAns', pipeline: [{ $match: { answer_status: true } }] } },
    { $set: { full_name: '$user_info.full_name', user_name: '$user_info.user_name', email_id: '$user_info.email_id', pro_batch: '$user_info.pro_batch', wallet_address: '$user_info.wallet_address' } },
    { $sort: { _id: -1 as const } },
    { $match: { $and: matchQuery } },
  ]

  return [
    ...joinAndScoreStages,
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              full_name: 1,
              user_name: 1,
              email_id: 1,
              pro_batch: 1,
              wallet_address: 1,
              lesson_status: 1,
              user_info: '$user_info',
              lesson_score: { $size: '$lessonAns' },
              lessonAns: '$lessonAns',
              date_n_time: 1,
              mobile_number: '$user_info.mobile_number',
              profile_image: '$user_info.profile_image',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractParticipatesListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}
