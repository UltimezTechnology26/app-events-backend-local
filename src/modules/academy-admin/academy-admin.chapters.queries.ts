// modules/academy-admin/academy-admin.chapters.queries.ts
//
// Ports chapters.js's GET /list/:skip/:limit (~line 126-240) aggregation-building logic.
import { extractPaginatedResult } from '../common/common.pagination'

/** Ports /list's date + search + course_row_id filter construction (verbatim shape). */
export function buildChapterListMatchQuery({ search, date, courseRowId }: { search?: string; date?: string; courseRowId?: number }): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = []

  if (date) {
    const inputDate = new Date(date)
    const startDate = new Date(inputDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(inputDate)
    endDate.setHours(23, 59, 59, 999)
    query.push({ date_n_time: { $gte: startDate, $lte: endDate } })
  }

  if (search) {
    query.push({ $or: [{ course_name: { $regex: search, $options: 'i' } }, { title: { $regex: search, $options: 'i' } }] })
  }

  if (courseRowId !== undefined && !Number.isNaN(courseRowId)) {
    query.push({ course_row_id: courseRowId })
  }

  return query
}

/**
 * $facet-converted version of /list's aggregation pipeline.
 *
 * CONFIRMED PERF FIX: the legacy route ran the EXACT SAME course $lookup + $match pipeline TWICE
 * per request - once via `.skip().limit()` for the page of data, then a second, separate call
 * for `$count` - meaning every request against this collection did double the lookup work for no
 * reason (the two results can't even structurally drift, since they're identical up to the
 * $match). One $facet call replaces both. Since `course_name` (used by both search and display)
 * only exists after the $lookup, the $match stays after it here - unlike Courses' own list, this
 * collection is small enough (one row per chapter, not per professional) that lookup-before-match
 * isn't the expensive part; running it twice was.
 */
export function buildChapterListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>[]; skip: number; limit: number }) {
  return [
    { $sort: { chapter_number: 1 as const, _id: -1 as const } },
    { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
    { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
    { $set: { course_name: '$course_info.course_name' } },
    ...(matchQuery.length ? [{ $match: { $and: matchQuery } }] : []),
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              course_name: 1,
              chapter_number: 1,
              course_row_id: 1,
              title: 1,
              description: 1,
              chapter_status: 1,
              date_n_time: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractChapterListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}
