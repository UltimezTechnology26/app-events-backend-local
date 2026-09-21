// modules/academy-admin/academy-admin.courses.queries.ts
//
// Ports courses.js's GET /list/:skip/:limit (~line 1311-1376) aggregation-building logic.
import { extractPaginatedResult } from '../common/common.pagination'

/** Ports /list's date + search filter construction (verbatim: same regex/date-range shape). */
export function buildCourseListMatchQuery({ search, date }: { search?: string; date?: string }): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = []

  if (date) {
    const inputDate = new Date(date)
    const startDate = new Date(new Date(inputDate).setHours(0, 0, 0, 0))
    const endDate = new Date(new Date(inputDate).setHours(23, 59, 59, 999))
    query.push({ date_n_time: { $gte: startDate, $lte: endDate } })
  }

  if (search) {
    query.push({ $or: [{ course_name: { $regex: search, $options: 'i' } }] })
  }

  return query
}

/**
 * $facet-converted version of /list's aggregation pipeline.
 *
 * CONFIRMED PERF FIX: the legacy route ran its `cln_academy_courses_lessons` $lookup against
 * EVERY course first, THEN applied the search/date $match, THEN called `.skip()/.limit()` (which
 * Mongoose just appends as trailing pipeline stages) - so the lookup cost scaled with the whole
 * collection instead of the returned page, and a separate implicit count never existed at all
 * (legacy's /list had no total count in its response, meaning the frontend couldn't paginate
 * accurately). Moved $match ahead of the $lookup and $facet-converted so a real count comes back
 * alongside the data, from one aggregate call, matching every other list pipeline in this
 * migration (company_admin.list.queries.ts, professionals.list.queries.ts).
 */
export function buildCourseListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>[]; skip: number; limit: number }) {
  return [
    ...(matchQuery.length ? [{ $match: { $and: matchQuery } }] : []),
    { $sort: { _id: -1 as const } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_academy_courses_lessons', localField: '_id', foreignField: 'course_row_id', as: 'lesson_info' } },
          {
            $project: {
              _id: 1,
              course_name: 1,
              course_slug: 1,
              date_n_time: 1,
              course_description: 1,
              course_image: 1,
              total_lessons: { $size: '$lesson_info' },
              expert_tag: 1,
              meta_keywords: 1,
              meta_description: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractCourseListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}
