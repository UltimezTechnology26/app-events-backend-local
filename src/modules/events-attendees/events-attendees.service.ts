// modules/events-attendees/events-attendees.service.ts
//
// Ports controllers/events/attendees.js's GET /all_list (2815) — reuses the ALREADY-ported,
// already-optimized services/events/attendees.ts's getAttendeesList (single $facet, no bug) —
// and GET /attendees_count (2854), the counts widget on the same "Attendees List" admin page.
//
// NOT ported yet (deliberately deferred, not overlooked): GET /search_previous_event/:event_row_id
// (attendees.js:1761, ~500 lines) — an autocomplete endpoint used during event creation/editing
// to search previously-invited attendees for re-inviting, a different UI flow than the Attendees
// List admin page itself. Flagged for its own follow-up pass rather than a rushed port here.
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
import { getAttendeesList } from '../../../services/events/attendees'

export { getAttendeesList }

export async function getAttendeesCount(statusRaw?: string) {
  const matchQuery = Number.parseInt(statusRaw as string) === 1 ? { invitation_type: 2 } : {}

  const finalQuery = await event_attendeesM.aggregate(
    [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'cln_events',
          localField: 'event_row_id',
          foreignField: '_id',
          as: 'event_info',
          pipeline: [
            { $match: { active_status: 1, approval_status: 1 } },
            { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $match: { login_status: 1, approval_status: 1 } }, { $project: { _id: 1, login_status: 1, approval_status: 1 } }, { $limit: 1 }] } },
            { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info', pipeline: [{ $match: { active_status: 1, approval_status: 1 } }, { $project: { _id: 1, active_status: 1, approval_status: 1 } }, { $limit: 1 }] } },
            { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
            { $set: { login_status: { $cond: { if: '$user_row_id', then: '$user_info.login_status', else: 1 } }, company_active_status: { $cond: { if: '$company_row_id', then: '$company_info.active_status', else: 1 } } } },
            { $match: { $or: [{ login_status: 1, list_event_type: 1 }, { company_active_status: 1, list_event_type: 2 }, { list_event_type: 3, login_status: 1, company_active_status: 1 }] } },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
        },
      },
      { $unwind: { path: '$event_info' } },
      { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $project: { _id: 1, approval_status: 1, login_status: 1 } }, { $limit: 1 }] } },
      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'cln_professionals_manual_retrievals', localField: 'user_row_id', foreignField: '_id', as: 'user_manual_info', pipeline: [{ $project: { _id: 1 } }, { $limit: 1 }] } },
      { $unwind: { path: '$user_manual_info', preserveNullAndEmptyArrays: true } },
      { $set: { user_data: { $switch: { branches: [{ case: { $eq: ['$user_type', 1] }, then: '$user_info' }, { case: { $eq: ['$user_type', 2] }, then: '$user_manual_info' }], default: '' } } } },
      { $match: { user_data: { $ne: '' } } },
      {
        $facet: {
          email_counts: [
            { $group: { _id: '$sg_message_id' } },
            { $lookup: { from: 'cln_emails_events', localField: '_id', foreignField: 'sg_message_id', as: 'email_info', pipeline: [{ $sort: { _id: -1 } }, { $limit: 1 }, { $project: { event_type: 1, sg_message_id: 1 } }] } },
            { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: null,
                totalProcessed: { $sum: { $cond: [{ $eq: ['$email_info.event_type', 'processed'] }, 1, 0] } },
                totalDeferred: { $sum: { $cond: [{ $eq: ['$email_info.event_type', 'deferred'] }, 1, 0] } },
                totalDelivered: { $sum: { $cond: [{ $eq: ['$email_info.event_type', 'delivered'] }, 1, 0] } },
                totalOpen: { $sum: { $cond: [{ $eq: ['$email_info.event_type', 'open'] }, 1, 0] } },
                totalBounceDrops: { $sum: { $cond: [{ $eq: ['$email_info.event_type', 'drop'] }, 1, 0] } },
                totalBounce: { $sum: { $cond: [{ $eq: ['$email_info.event_type', 'bounce'] }, 1, 0] } },
              },
            },
          ],
          attendee_count: [{ $count: 'count' }],
        },
      },
    ],
    { allowDiskUse: true }
  )

  const emailCounts = finalQuery[0]?.email_counts?.[0] || []
  const attendeesCount = finalQuery[0]?.attendee_count?.[0]?.count || 0
  return { status: true, email_counts: emailCounts, attendes_count: attendeesCount }
}
