// modules/events/events.employees.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /employees (event.js:5187) — the sub-admin
// list backing the Published Events page's "Select Subadmin" dropdown filter. Only sub-admins who
// have actually created at least one event show up (matches legacy: `created_by_admin_status: 2,
// created_by_sub_admin_id: {$gt: 0}` grouped by sub-admin, filtered to non-blank names).
export function buildEventsEmployeesPipeline() {
  return [
    { $match: { created_by_admin_status: 2, created_by_sub_admin_id: { $gt: 0 } } },
    { $group: { _id: '$created_by_sub_admin_id', events_created: { $sum: 1 } } },
    {
      $lookup: {
        from: 'cln_sub_admins',
        localField: '_id',
        foreignField: '_id',
        as: 'subadmin_info',
        pipeline: [{ $project: { full_name: 1, email_id: 1 } }],
      },
    },
    { $unwind: { path: '$subadmin_info', preserveNullAndEmptyArrays: true } },
    { $set: { full_name: '$subadmin_info.full_name' } },
    { $match: { full_name: { $nin: [null, ''] } } },
    { $sort: { full_name: 1 as const } },
    { $project: { _id: 1, events_created: 1, full_name: 1, email_id: '$subadmin_info.email_id' } },
  ]
}
