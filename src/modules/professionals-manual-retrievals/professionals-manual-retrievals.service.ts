// modules/professionals-manual-retrievals/professionals-manual-retrievals.service.ts
// Ports controllers/admin_panel/app/user/manual_users.js's 8 routes (~381-1423). Same behavior,
// same response shapes — confirmed perf fixes noted inline; confirmed pre-existing bugs flagged,
// not silently fixed.
import { ProfessionalsManualRetrievalsM } from './professionals-manual-retrievals.models'
import {
  buildPendingListMatchQuery, buildPendingListPipeline,
  buildRejectedListMatchQuery, buildRejectedListPipeline,
  buildApprovedListMatchQuery, buildApprovedListPipeline,
  buildIndividualDetailPipeline,
  buildSpeakersAttendeesSearchArray, buildSpeakersAttendeesListPipeline, buildSpeakersAttendeesCountPipeline,
} from './professionals-manual-retrievals.queries'

const EventM = require('../../../models/app/events/eventM')
const EventAttendeesM = require('../../../models/app/events/event_attendeesM')
const EventSpeakersM = require('../../../models/app/events/event_speakersM')
const FundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const ProfessionalWorkExperienceM = require('../../../models/app/professionals_work_experienceM')
const EventSponsorsPartnerDetailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { deleteProfessionalDetails, deleteUserFunding } = require('../../../utils/helpers/app_helper')
const { deleteSponsorsPartners } = require('../../../utils/helpers/events_helper')

interface PagingParams {
  skipRaw: string
  limitRaw: string
}

function parsePaging({ skipRaw, limitRaw }: PagingParams): { errObj: Record<string, string>; skip: number; limit: number } {
  const errObj: Record<string, string> = {}
  if (Number.isNaN(Number.parseInt(skipRaw))) errObj['skip'] = 'The parameter skip field must be contain valid number'
  if (Number.isNaN(Number.parseInt(limitRaw))) errObj['limit'] = 'The parameter limit field must be contain valid number.'
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { errObj, skip, limit }
}

export async function getPendingList(params: { skipRaw: string; limitRaw: string; search?: string }) {
  const { errObj, skip, limit } = parsePaging(params)
  if (Object.keys(errObj).length) return { status: false, message: errObj }

  const matchQuery = buildPendingListMatchQuery(params.search)
  // CONFIRMED PERF FIX: legacy runs the list aggregate then the count as two sequential
  // `await`s — independent of each other, Promise.all'd here.
  const [list, count] = await Promise.all([
    ProfessionalsManualRetrievalsM.aggregate(buildPendingListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalsManualRetrievalsM.countDocuments(matchQuery),
  ])
  return { status: true, message: list, count }
}

export async function getRejectedList(params: { skipRaw: string; limitRaw: string; search?: string; rejectTypeRaw?: string }) {
  const { errObj, skip, limit } = parsePaging(params)
  if (Object.keys(errObj).length) return { status: false, message: errObj }

  const matchQuery = buildRejectedListMatchQuery(params.search, Number.parseInt(params.rejectTypeRaw as string))
  const [list, count] = await Promise.all([
    ProfessionalsManualRetrievalsM.aggregate(buildRejectedListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalsManualRetrievalsM.countDocuments(matchQuery),
  ])
  return { status: true, message: list, count }
}

export async function getApprovedList(params: { skipRaw: string; limitRaw: string; search?: string }) {
  const { errObj, skip, limit } = parsePaging(params)
  if (Object.keys(errObj).length) return { status: false, message: errObj }

  const matchQuery = buildApprovedListMatchQuery(params.search)
  const [list, count] = await Promise.all([
    ProfessionalsManualRetrievalsM.aggregate(buildApprovedListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalsManualRetrievalsM.countDocuments(matchQuery),
  ])
  return { status: true, message: list, count }
}

const INDIVIDUAL_DETAIL_FIELDS = [
  '_id', 'gender', 'full_name', 'email_id', 'mobile_number', 'profile_image', 'work_position',
  'user_link', 'created_on', 'updated_on', 'used_counts', 'used_types', 'approval_date',
  'approval_status', 'main_user_row_id', 'approval_sub_admin_row_id', 'reject_type', 'rejected_reason',
  'subadmin_name', 'company_name', 'company_email_id', 'company_logo', 'company_approval_status',
  'speaker_counts', 'funding_count', 'team_members_count',
] as const

// FLAGGED, NOT FIXED (real, confirmed bug): legacy never checks whether the aggregate found a
// matching document before reading `get_query[0]._id` etc. — an invalid/non-existent
// user_row_id throws a TypeError, caught by the outer try/catch as a generic "unexpected error"
// instead of a proper "not found" response. Ported as-is: adding a not-found guard would change
// this route's response for invalid ids from a crash-shaped generic error to a specific message,
// a real behavior change needing sign-off first.
export async function getIndividualDetail(userRowId: number) {
  const getQuery: any[] = await ProfessionalsManualRetrievalsM.aggregate(buildIndividualDetailPipeline(userRowId)).limit(1)

  const result: Record<string, unknown> = {}
  for (const field of INDIVIDUAL_DETAIL_FIELDS) {
    result[field] = getQuery[0][field]
  }
  return { status: true, message: result }
}

export async function rejectManualUser(auth: { admin_manager_type: number; sub_admin_type?: number }, userRowId: number, rejectType: unknown, rejectedReason: unknown, preValidationErrors: Record<string, unknown>) {
  const errObj = { ...preValidationErrors }
  let adminRowId = 0
  if (auth.admin_manager_type === 2) adminRowId = (auth as any).admin_row_id

  if (Number.parseInt(auth.sub_admin_type as unknown as string) === 2) {
    errObj['alert_message'] = 'You do not have permission to perform this action'
  }
  if (Number.isNaN(userRowId)) {
    errObj['user_row_id'] = 'The User row ID field should be a number'
  }
  if (Object.keys(errObj).length) return { status: false, message: errObj }

  const presentDateTime = getPresentDateTime()
  const checkQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: userRowId, approval_status: 0 })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Invalid Manual User Row ID.' } }
  }

  await ProfessionalsManualRetrievalsM.updateOne(
    { _id: userRowId },
    { $set: { approval_status: 2, approval_date: presentDateTime, reject_type: rejectType, approval_sub_admin_row_id: adminRowId, rejected_reason: rejectedReason } },
  )
  return { status: true, message: { alert_message: 'This manual user details has been rejected successfully.' } }
}

export async function getSpeakersAttendeesEventsList(userRowId: number, skip: number, limit: number, search?: string, type?: number) {
  const searchArray = buildSpeakersAttendeesSearchArray(userRowId, search, type)
  // CONFIRMED PERF FIX: legacy runs the list aggregate then the count aggregate as two
  // sequential `await`s — independent of each other, Promise.all'd here.
  const [list, countResult] = await Promise.all([
    EventM.aggregate(buildSpeakersAttendeesListPipeline(userRowId, searchArray)).skip(skip).limit(limit),
    EventM.aggregate(buildSpeakersAttendeesCountPipeline(userRowId, searchArray)),
  ])
  const count = countResult[0] ? countResult[0].count : 0
  return { status: true, message: list, count }
}

export async function revokeManualUser(auth: { sub_admin_type?: number }, userRowId: number) {
  if (Number.parseInt(auth.sub_admin_type as unknown as string) === 2) {
    return { status: false, message: { alert_message: 'You do not have permission to perform this action' } }
  }
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Invalid Manual User Row ID' } }
  }

  const checkQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: userRowId, approval_status: 2 })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Invalid Manual User Row ID' } }
  }

  await ProfessionalsManualRetrievalsM.updateOne({ _id: userRowId, approval_status: 2 }, { $set: { approval_status: 0 } })
  return { status: true, message: { alert_message: 'This Manual User details has been revoked sucessfully.' } }
}

export async function deleteManualUser(auth: { sub_admin_type?: number }, userRowId: number) {
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Invalid Manual User Row ID' } }
  }
  if (Number.parseInt(auth.sub_admin_type as unknown as string) === 2) {
    return { status: false, message: { alert_message: 'You do not have permission to perform this action' } }
  }

  const checkQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: userRowId, approval_status: { $in: [0, 2] } })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Invalid Manual User Row ID' } }
  }

  // CONFIRMED PERF FIX: legacy runs these 5 independent existence checks as sequential
  // `await`s (each against a different collection, keyed only by this user_row_id) —
  // Promise.all'd here; the conditional deletes that follow are likewise independent of each
  // other and run in parallel too. Same end state, less time spent waiting.
  const [attendeeQuery, speakersQuery, spQuery, fundsQuery, workExperienceQuery] = await Promise.all([
    EventAttendeesM.findOne({ user_type: 2, user_row_id: userRowId }),
    EventSpeakersM.findOne({ user_type: 2, user_row_id: userRowId }),
    EventSponsorsPartnerDetailsM.findOne({ account_type: 1, registered_type: 2, user_company_row_id: userRowId }),
    FundingInvestmentM.findOne({ investor_type: 1, investor_registered_type: 2, investor_row_id: userRowId }),
    ProfessionalWorkExperienceM.findOne({ user_account_type: 2, user_row_id: userRowId }),
  ])

  await Promise.all([
    attendeeQuery ? EventAttendeesM.deleteMany({ user_type: 2, user_row_id: userRowId }) : null,
    speakersQuery ? EventSpeakersM.deleteMany({ user_type: 2, user_row_id: userRowId }) : null,
    spQuery ? deleteSponsorsPartners({ type: 2, account_type: 1, registered_type: 2, user_company_row_id: userRowId }) : null,
    fundsQuery ? deleteUserFunding({ type: 2, investor_type: 1, registered_type: 2, funding_row_id: userRowId, investment_type: 1 }) : null,
    workExperienceQuery ? deleteProfessionalDetails({ type: 2, user_company_row_id: userRowId, user_type: 1, reqistered_type: 2 }) : null,
  ])

  await ProfessionalsManualRetrievalsM.deleteOne({ _id: userRowId })
  return { status: true, message: { alert_message: 'This Manual User details has been deleted sucessfully.' } }
}
