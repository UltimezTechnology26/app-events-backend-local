// modules/system_settings/system_settings.event_tags.list.stages.ts
//
// Ports controllers/admin_panel/category_tags/event_tags.js's GET /list
// (lines 12-167) per-count `$lookup`/`$addFields`/`$project` blocks
// verbatim, each extracted into its own small builder function purely to
// keep any single file/function under the project's line-length limit —
// the six blocks below are assembled, in this same order, by
// buildEventTagsListStages in system_settings.event_tags.list.queries.ts.
// Includes the legacy quirk that "ongoing_count" is actually
// upcoming_temp + ongoing_temp combined via $add.

export function buildTotalEventsStages(): object[] {
  return [
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          { $match: { approval_status: 1, $expr: { $in: ['$$tagId', '$event_tags'] } } },
          { $count: 'count' },
        ],
        as: 'events_count_res',
      },
    },
    { $addFields: { total_events: { $ifNull: [{ $arrayElemAt: ['$events_count_res.count', 0] }, 0] } } },
    { $project: { events_count_res: 0 } },
  ]
}

export function buildDeletedEventsStages(): object[] {
  return [
    {
      $lookup: {
        from: 'cln_deleted_events',
        let: { tagId: '$_id' },
        pipeline: [{ $match: { $expr: { $in: ['$$tagId', '$event_tags'] } } }, { $count: 'count' }],
        as: 'deleted_res',
      },
    },
    { $addFields: { deleted_count: { $ifNull: [{ $arrayElemAt: ['$deleted_res.count', 0] }, 0] } } },
    { $project: { deleted_res: 0 } },
  ]
}

export function buildPendingEventsStages(): object[] {
  return [
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          { $match: { approval_status: 0, $expr: { $in: ['$$tagId', '$event_tags'] } } },
          { $count: 'count' },
        ],
        as: 'pending_res',
      },
    },
    { $addFields: { pending_count: { $ifNull: [{ $arrayElemAt: ['$pending_res.count', 0] }, 0] } } },
    { $project: { pending_res: 0 } },
  ]
}

export function buildUpcomingEventsStages(present: Date): object[] {
  return [
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          {
            $match: {
              approval_status: 1,
              start_date: { $gt: present },
              $expr: { $in: ['$$tagId', '$event_tags'] },
            },
          },
          { $count: 'count' },
        ],
        as: 'upcoming_res',
      },
    },
    { $addFields: { upcoming_temp: { $ifNull: [{ $arrayElemAt: ['$upcoming_res.count', 0] }, 0] } } },
    { $project: { upcoming_res: 0 } },
  ]
}

/** Sets ongoing_temp, then combines it with upcoming_temp into ongoing_count (legacy quirk). */
export function buildOngoingEventsStages(present: Date): object[] {
  return [
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          {
            $match: {
              approval_status: 1,
              start_date: { $lte: present },
              end_date: { $gte: present },
              $expr: { $in: ['$$tagId', '$event_tags'] },
            },
          },
          { $count: 'count' },
        ],
        as: 'ongoing_res',
      },
    },
    { $addFields: { ongoing_temp: { $ifNull: [{ $arrayElemAt: ['$ongoing_res.count', 0] }, 0] } } },
    { $project: { ongoing_res: 0 } },
    { $addFields: { ongoing_count: { $add: ['$ongoing_temp', '$upcoming_temp'] } } },
    { $project: { ongoing_temp: 0, upcoming_temp: 0 } },
  ]
}

export function buildEndedEventsStages(present: Date): object[] {
  return [
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          {
            $match: {
              approval_status: 1,
              end_date: { $lt: present },
              $expr: { $in: ['$$tagId', '$event_tags'] },
            },
          },
          { $count: 'count' },
        ],
        as: 'ended_res',
      },
    },
    { $addFields: { ended_count: { $ifNull: [{ $arrayElemAt: ['$ended_res.count', 0] }, 0] } } },
    { $project: { ended_res: 0 } },
  ]
}
