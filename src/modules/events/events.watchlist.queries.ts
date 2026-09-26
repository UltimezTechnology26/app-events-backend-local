// modules/events/events.watchlist.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /event_watchlist/:event_row_id (line 7226) -
// backs the Published Events list's "Watchlist" clickable count-cell modal. A genuinely separate
// route/collection from attendees_invitees_list (event_watchlistsM, not event_attendeesM) - no
// registered/un-registered status here, legacy's own wishlist_list.js renders no such badge.
export function buildWatchlistSearchClause(search?: string): Record<string, unknown>[] {
  if (!search) return [{}]
  return [{}, { $or: [{ full_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] }]
}

/** One flat $facet (data + count) instead of legacy's 2 separate aggregate calls. */
export function buildWatchlistPipeline(eventRowId: number, search: string | undefined) {
  return [
    { $match: { event_row_id: eventRowId } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        profile_image: '$img_info.profile_image',
      },
    },
    { $match: { $and: buildWatchlistSearchClause(search) } },
    {
      $facet: {
        data: [{ $project: { user_name: 1, full_name: 1, email_id: 1, profile_image: 1, date_n_time: 1 } }, { $sort: { _id: -1 as const } }],
        countPrep: [{ $count: 'count' }],
      },
    },
  ]
}
