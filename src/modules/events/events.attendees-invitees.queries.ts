// modules/events/events.attendees-invitees.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /attendees_invitees_list/:event_row_id/:status
// (line 6926) - backs the Published Events list's "Total Attendees"/"Total Invitees" clickable
// count-cell modals. `:status` is `invitation_status` (1 = attendees/accepted, 0 = invitees/
// pending) - the SAME route serves both modals, just a different status value.
export function buildSearchClause(search?: string): Record<string, unknown>[] {
  if (!search) return [{}]
  return [{}, { $or: [{ full_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] }]
}

/** Resolves whichever of the registered-professional lookup or the manual-retrieval lookup
 * actually applies to this row's `user_type` (1 = registered, 2 = manually-added guest) -
 * ported verbatim from event.js's own `user_data` $switch (both list and count pipelines used the
 * identical $switch; consolidated to one shared stage builder here). */
function userDataStages() {
  return [
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_type: '$user_type' },
        as: 'user_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$user_type'] }, { $eq: ['$_id', '$$user_row_id'] }, { $eq: ['$login_status', 1] }] } } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } },
          { $limit: 1 },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_type: '$user_type', user_row_id: '$user_row_id' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } },
          { $limit: 1 },
        ],
      },
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $eq: ['$user_type', 1] }, then: '$user_info' },
              { case: { $eq: ['$user_type', 2] }, then: '$manual_info' },
            ],
            default: '',
          },
        },
      },
    },
    {
      $set: {
        user_name: { $cond: { if: '$user_data.user_name', then: '$user_data.user_name', else: '' } },
        full_name: '$user_data.full_name',
        profile_image: '$user_data.profile_image',
        email_id: '$user_data.email_id',
      },
    },
  ]
}

/** One flat $facet (data + count) instead of legacy's 2 separate aggregate calls - this
 * migration's own established fix for this exact pattern. Matches legacy exactly: no
 * pagination, `search` is the only filter, full matching result set returned every call. */
export function buildAttendeesInviteesPipeline(eventRowId: number, invitationStatus: number, search: string | undefined) {
  return [
    { $sort: { _id: -1 as const } },
    { $match: { event_row_id: eventRowId, invitation_status: invitationStatus } },
    ...userDataStages(),
    { $match: { $and: buildSearchClause(search) } },
    {
      $facet: {
        data: [
          {
            $project: {
              _id: 1,
              event_row_id: 1,
              user_type: 1,
              user_row_id: 1,
              invitation_status: 1,
              invitation_type: 1,
              created_date_n_time: 1,
              user_name: 1,
              full_name: 1,
              email_id: 1,
              profile_image: 1,
            },
          },
        ],
        countPrep: [{ $count: 'count' }],
      },
    },
  ]
}
