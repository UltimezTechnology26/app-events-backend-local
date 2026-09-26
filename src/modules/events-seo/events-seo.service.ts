// modules/events-seo/events-seo.service.ts
//
// Ports controllers/admin_panel/events/event.js's GET /seo_overview (13052) — the "SEO" tab's
// dashboard data. Already well-optimized in legacy (4 independent aggregates run via one
// Promise.all, each internally using its own $facet) — ported as-is, no perf bug found.
const eventM = require('../../../models/app/events/eventM')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const seo_static_urlsM = require('../../../models/seo_static_urlsM')

function val(obj: any, key: string) {
  return obj?.[0]?.[key]?.[0]?.count || 0
}

export async function getSeoOverview() {
  const recentLogsPromise = seo_change_logsM.aggregate([
    { $match: { module_key: 'event' } },
    { $sort: { updated_at: -1 } },
    { $group: { _id: '$module_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $addFields: { module_id_num: { $toInt: '$module_id' } } },
    { $lookup: { from: 'cln_events', let: { eid: '$module_id_num' }, pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$eid'] } } }, { $project: { event_url: 1, event_title: 1, active_status: 1, approval_status: 1 } }], as: 'event' } },
    { $match: { 'event.0': { $exists: true } } },
    { $addFields: { event_url: { $arrayElemAt: ['$event.event_url', 0] }, event_title: { $arrayElemAt: ['$event.event_title', 0] }, active_status: { $arrayElemAt: ['$event.active_status', 0] }, approval_status: { $arrayElemAt: ['$event.approval_status', 0] } } },
    { $match: { event_url: { $exists: true, $ne: '' } } },
    { $project: { event: 0, module_id_num: 0 } },
    { $sort: { updated_at: -1 } },
    { $limit: 10 },
  ])

  const eventStatsPromise = eventM.aggregate([
    { $match: { event_url: { $exists: true, $ne: '' }, approval_status: 1, active_status: 1 } },
    { $lookup: { from: 'cln_events_seo_details', localField: '_id', foreignField: 'event_row_id', as: 'event_seo' } },
    { $unwind: { path: '$event_seo', preserveNullAndEmptyArrays: true } },
    { $addFields: { title_len: { $strLenCP: { $ifNull: ['$event_seo.meta_title', ''] } }, tags: { $map: { input: { $ifNull: ['$event_seo.header_structure', []] }, as: 'h', in: '$$h.tag' } } } },
    {
      $addFields: {
        h1_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H1'] } } } },
        h2_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H2'] } } } },
        h1_index: { $indexOfArray: ['$tags', 'H1'] },
        h2_index: { $indexOfArray: ['$tags', 'H2'] },
        h3_index: { $indexOfArray: ['$tags', 'H3'] },
      },
    },
    {
      $facet: {
        total: [{ $count: 'count' }],
        title_warn: [{ $match: { title_len: { $gt: 60, $lte: 70 } } }, { $count: 'count' }],
        title_err: [{ $match: { title_len: { $gt: 70 } } }, { $count: 'count' }],
        h1_missing: [{ $match: { h1_count: 0 } }, { $count: 'count' }],
        h1_multi: [{ $match: { h1_count: { $gt: 1 } } }, { $count: 'count' }],
        h2_missing: [{ $match: { h2_count: 0 } }, { $count: 'count' }],
        bad_seq: [
          { $match: { $or: [{ $and: [{ h2_index: { $gte: 0 } }, { h1_index: -1 }] }, { $and: [{ h2_index: { $gte: 0 } }, { $expr: { $lt: ['$h2_index', '$h1_index'] } }] }, { $and: [{ h3_index: { $gte: 0 } }, { h2_index: -1 }] }, { $and: [{ h3_index: { $gte: 0 } }, { $expr: { $lt: ['$h3_index', '$h2_index'] } }] }] } },
          { $count: 'count' },
        ],
      },
    },
  ])

  const staticStatsPromise = seo_static_urlsM.aggregate([
    { $match: { module: 'event' } },
    { $addFields: { title_len: { $strLenCP: { $ifNull: ['$meta_title', ''] } }, tags: { $map: { input: { $ifNull: ['$header_structure', []] }, as: 'h', in: '$$h.tag' } } } },
    {
      $addFields: {
        h1_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H1'] } } } },
        h2_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H2'] } } } },
        h1_index: { $indexOfArray: ['$tags', 'H1'] },
        h2_index: { $indexOfArray: ['$tags', 'H2'] },
        h3_index: { $indexOfArray: ['$tags', 'H3'] },
      },
    },
    {
      $facet: {
        total: [{ $count: 'count' }],
        title_warn: [{ $match: { title_len: { $gt: 60, $lte: 70 } } }, { $count: 'count' }],
        title_err: [{ $match: { title_len: { $gt: 70 } } }, { $count: 'count' }],
        h1_missing: [{ $match: { h1_count: 0 } }, { $count: 'count' }],
        h1_multi: [{ $match: { h1_count: { $gt: 1 } } }, { $count: 'count' }],
        h2_missing: [{ $match: { h2_count: 0 } }, { $count: 'count' }],
        bad_seq: [
          { $match: { $or: [{ $and: [{ h2_index: { $gte: 0 } }, { h1_index: -1 }] }, { $and: [{ h2_index: { $gte: 0 } }, { $expr: { $lt: ['$h2_index', '$h1_index'] } }] }, { $and: [{ h3_index: { $gte: 0 } }, { h2_index: -1 }] }, { $and: [{ h3_index: { $gte: 0 } }, { $expr: { $lt: ['$h3_index', '$h2_index'] } }] }] } },
          { $count: 'count' },
        ],
      },
    },
  ])

  const staticUrlsPromise = seo_static_urlsM.aggregate([{ $match: { module: 'event' } }])

  const [recentLogs, eventStats, staticStats, staticUrls] = await Promise.all([recentLogsPromise, eventStatsPromise, staticStatsPromise, staticUrlsPromise])

  return {
    status: true,
    message: {
      static_urls: staticUrls,
      recent_changes: recentLogs,
      total_urls: val(eventStats, 'total') + val(staticStats, 'total'),
      h1_missing: val(eventStats, 'h1_missing') + val(staticStats, 'h1_missing'),
      h2_missing: val(eventStats, 'h2_missing') + val(staticStats, 'h2_missing'),
      multiple_h1: val(eventStats, 'h1_multi') + val(staticStats, 'h1_multi'),
      bad_heading_sequence: val(eventStats, 'bad_seq') + val(staticStats, 'bad_seq'),
      title_length_issues: {
        title_above_60_to_70: val(eventStats, 'title_warn') + val(staticStats, 'title_warn'),
        title_above_70: val(eventStats, 'title_err') + val(staticStats, 'title_err'),
      },
    },
  }
}
