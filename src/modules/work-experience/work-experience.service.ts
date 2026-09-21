const sanitize = require('mongo-sanitize')
const professional_positionsM = require('../../../models/app/static/professional_positionsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const { addManualPosition, calculateUserProfileScore, deleteProfessionalDetails } = require('../../../utils/helpers/app_helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
const { getPresentDateTime, checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import { invalidateWorkExperienceCaches } from './work-experience.cache'
import { buildEmployeeRequestCountPipeline, getManualProfessionalDetailListPipeline } from './work-experience.queries'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../modules/change-request/change-request.child.service'
import { SECTION_PROFESSIONAL_DETAILS } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

const ADMIN_ROW_ID_MAIN_ADMIN = 0

export interface ResolvedPosition {
  position_type: number
  position_row_id: number
  sub_position_row_id: number
}

export interface ValidatePositionsResult {
  status: boolean
  message: any
  positions?: ResolvedPosition[]
}

/**
 * Validates req.body.additional_positions: max 3, no duplicates, each position_row_id must
 * exist and be active in professional_positionsM, position_type===2 requires sub_position_name
 * and resolves via addManualPosition. Returns the resolved positions[] array ready to save.
 */
export async function validatePositions(rawPositionsInput: any): Promise<ValidatePositionsResult> {
  let positions: ResolvedPosition[] = []
  let raw_positions = rawPositionsInput

  if (!raw_positions) {
    return { status: false, message: 'At least one position is required.' }
  }

  if (typeof raw_positions === 'string') {
    try { raw_positions = JSON.parse(raw_positions) } catch (e) { raw_positions = [] }
  }

  if (!Array.isArray(raw_positions) || raw_positions.length === 0) {
    return { status: false, message: 'At least one position is required.' }
  }
  if (raw_positions.length > 3) {
    return { status: false, message: 'You can add a maximum of 3 positions.' }
  }

  for (const ap of raw_positions) {
    const ap_position_type = Number.parseInt(ap.position_type)
    const ap_position_row_id = Number.parseInt(ap.position_row_id)
    let ap_sub_position_row_id = 0

    if (Number.isNaN(ap_position_type) || ap_position_type < 1 || ap_position_type > 2) {
      return { status: false, message: 'Invalid position type.' }
    }
    if (Number.isNaN(ap_position_row_id)) {
      return { status: false, message: 'Invalid position.' }
    }

    const ap_get_query = await professional_positionsM.findOne({ _id: ap_position_row_id, active_status: true })
    if (!ap_get_query) {
      return { status: false, message: 'Sorry, invalid position.' }
    }

    if (ap_position_type === 2) {
      if (!ap.sub_position_name) {
        return { status: false, message: 'Position name is required for custom positions.' }
      }
      const ap_manual_query = await addManualPosition(ap.sub_position_name)
      if (ap_manual_query.status) {
        ap_sub_position_row_id = Number.parseInt(ap_manual_query.sub_position_row_id)
      } else {
        return { status: false, message: 'Invalid custom position name.' }
      }
    }

    const is_dupe = positions.some((p) =>
      p.position_type === ap_position_type &&
      p.position_row_id === ap_position_row_id &&
      p.sub_position_row_id === ap_sub_position_row_id
    )
    if (is_dupe) {
      return { status: false, message: 'Duplicate position found.' }
    }

    positions.push({ position_type: ap_position_type, position_row_id: ap_position_row_id, sub_position_row_id: ap_sub_position_row_id })
  }

  return { status: true, message: null, positions }
}

export interface CreateOrUpdateWorkExperienceParams {
  user_row_id: number
  professional_details_id: number
  body: Record<string, any>
  /**
   * express-validator errors from the controller (arrangeValidation(errors)), folded into this
   * function's own errObj BEFORE the single save-gating check below — matching the real source's
   * one-shared-errObj behavior, so a validator-only failure (e.g. missing start_date) blocks the
   * save exactly like a business-logic failure does, instead of only surfacing in the HTTP
   * response after the record was already written.
   */
  preValidationErrors?: Record<string, string>
}

/**
 * Ports controllers/app/users/setting.js's POST /update_professional_details handler body
 * (lines ~2660-2911) — company validation, time-range/duplicate-"currently working" checks,
 * insert-or-update save, and cache invalidation. Response shapes for the two success paths are
 * DELIBERATELY normalized to this codebase's `{ alert_message }` envelope convention (the real
 * source returns bare strings, and the update branch leaks `check_work_query`/`till_date_status`
 * as extra top-level fields) — confirmed with the user, see task-5 brief.
 */
export async function createOrUpdateWorkExperience({
  user_row_id,
  professional_details_id,
  body,
  preValidationErrors
}: CreateOrUpdateWorkExperienceParams): Promise<{ status: boolean; message: any }> {
  // Spread first so this function's own business-logic checks below can still overwrite a
  // same-named key later (chronological last-write-wins, matching the real source).
  const errObj: Record<string, string> = { ...preValidationErrors }

  // ── Positions validation (accumulated into errObj, does not short-circuit) ──
  const positionsResult = await validatePositions(body.additional_positions)
  if (!positionsResult.status) {
    errObj['additional_positions'] = positionsResult.message
  }

  // ── Company / date / duplicate validation ────────────────────────────────
  let company_type = Number.parseInt(body.company_type)
  if (Number.isNaN(company_type)) company_type = 0
  let company_row_id = Number.parseInt(body.company_row_id)
  if (Number.isNaN(company_row_id)) company_row_id = 0
  let till_date_status = Number.parseInt(body.till_date_status)
  if (Number.isNaN(till_date_status)) till_date_status = 0

  let company_user_row_id = 0
  if (company_type == 1) {
    const company_reg_query = await companyM.findOne({ _id: company_row_id }, { _id: 1, user_row_id: 1 })
    if (!company_reg_query) {
      errObj['company_row_id'] = 'Sorry, Invalid registered company row id.'
    } else if (company_reg_query.user_row_id) {
      company_user_row_id = company_reg_query.user_row_id
    }
  } else if (company_type == 2) {
    const company_manual_query = await company_manual_retrievalsM.findOne({ _id: company_row_id }, { _id: 1 })
    if (!company_manual_query) {
      errObj['company_row_id'] = 'Sorry, Invalid manual company row id.'
    }
  }

  if (till_date_status === 1) {
    if (!body.end_date) {
      errObj['end_date'] = 'The End Date field is required.'
    }
  }

  if (!professional_details_id) {
    const check_time_range_query = await professionals_work_experienceM.findOne(
      {
        user_row_id: user_row_id,
        user_account_type: 1,
        company_type: sanitize(company_type),
        company_row_id: sanitize(company_row_id),
        start_date: { $lte: sanitize(body.start_date) },
        end_date: { $gte: sanitize(body.end_date) }
      },
      { _id: 1 }
    )
    if (check_time_range_query) {
      errObj['time_range'] = 'An experience with this duration already exists.'
    }
  }

  if (till_date_status === 2) {
    const conflict_query = await professionals_work_experienceM.findOne(
      {
        _id: { $ne: professional_details_id },
        user_account_type: 1,
        user_row_id: user_row_id,
        company_type: company_type,
        company_row_id: company_row_id,
        till_date_status: 2
      },
      { _id: 1 }
    )
    if (conflict_query) {
      errObj['alert_message'] = 'Sorry, your present working details already exist for this company. Please provide the end date for your previous experience.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const positions = positionsResult.positions as ResolvedPosition[]
  const primaryPos = positions[0]

  const insert_array: Record<string, any> = {}
  insert_array['positions'] = positions
  insert_array['position_row_id'] = primaryPos.position_row_id
  insert_array['position_type'] = primaryPos.position_type
  insert_array['sub_position_row_id'] = primaryPos.sub_position_row_id
  insert_array['responsibilities'] = body.responsibilities
  insert_array['employment_type'] = body.employment_type
  insert_array['till_date_status'] = till_date_status
  insert_array['start_date'] = body.start_date
  insert_array['location_type'] = body.location_type
  insert_array['end_date'] = till_date_status === 1 ? body.end_date : ''
  insert_array['public_view'] = body.public_view ? body.public_view : false

  if (!professional_details_id) {
    if (body.public_view == true) {
      await professionals_work_experienceM.updateMany({ user_row_id: user_row_id, user_account_type: 1 }, { $set: { public_view: false } })
    }
    insert_array['user_row_id'] = user_row_id
    insert_array['user_account_type'] = 1
    insert_array['company_type'] = company_type
    insert_array['company_row_id'] = company_row_id

    const insert_query = await professionals_work_experienceM(insert_array).save()

    // CONFIRMED BUG FIX: a manual company selected as a work-experience employer never
    // incremented its used_counts — see the identical fix/rationale in funding.service.ts.
    if (company_type === 2) {
      await company_manual_retrievalsM.updateOne({ _id: company_row_id }, { $inc: { used_counts: 1 } })
    }

    await deleteKeysByPattern('professional_detail_list_*')
    await deleteKeysByPattern('app_user_detail_*')
    await deleteKeysByPattern('app_user_other_details_*')
    await invalidateWorkExperienceCaches()
    if (company_type === 1 && company_row_id) {
      // This save writes to the same professionals_work_experienceM rows the company's Team
      // Details tab (employee_list_*) and public profile (app_company_individual_other_details_*)
      // read from — every other write path into this collection (team-members.service.ts) busts
      // both keys; this one didn't, so a newly-submitted pending request stayed invisible on the
      // company side until the 30-minute TTL expired (confirmed via manual testing).
      await deleteKeysByPattern('employee_list_*')
      await deleteKeysByPattern('app_company_individual_other_details_*')
    }

    await professionalsM.updateOne({ _id: user_row_id }, { $set: { updated_date_n_time: getPresentDateTime() } })

    if (company_type == 1 && company_user_row_id && till_date_status === 2) {
      await updateNotification({
        user_row_id: company_user_row_id,
        notify_type: 1,
        notify_type_row_id: user_row_id,
        message_row_id: 17,
        action_row_id: insert_query._id
      })
    }
    await calculateUserProfileScore(user_row_id, ['professional_detail'])

    return {
      status: true,
      message: {
        alert_message: 'Your professional details have been successfully submitted. Thank you for sharing your valuable experience with us.'
      }
    }
  } else {
    const check_work_query = await professionals_work_experienceM.findOne({ _id: professional_details_id })

    await professionals_work_experienceM.updateOne({ _id: professional_details_id }, { $set: insert_array })
    if (body.public_view == true) {
      await professionals_work_experienceM.updateMany(
        { _id: { $ne: professional_details_id }, user_account_type: 1, user_row_id: user_row_id },
        { $set: { public_view: false } }
      )
    }

    await professionalsM.updateOne({ _id: user_row_id }, { $set: { updated_date_n_time: getPresentDateTime() } })
    await deleteKeysByPattern('professional_detail_list_*')
    await deleteKeysByPattern('app_user_detail_*')
    await deleteKeysByPattern('app_user_other_details_*')
    await invalidateWorkExperienceCaches()
    if (company_type === 1 && company_row_id) {
      await deleteKeysByPattern('employee_list_*')
      await deleteKeysByPattern('app_company_individual_other_details_*')
    }

    if (check_work_query.till_date_status === 1 && check_work_query.verified_status === false) {
      if (company_type == 1 && company_user_row_id && till_date_status === 2) {
        await updateNotification({
          user_row_id: company_user_row_id,
          notify_type: 1,
          notify_type_row_id: user_row_id,
          message_row_id: 17,
          action_row_id: professional_details_id
        })
      }
    }
    await calculateUserProfileScore(user_row_id, ['professional_detail'])

    return {
      status: true,
      message: {
        alert_message: 'Your efforts to keep your information accurate are greatly appreciated. We have successfully updated your professional details.'
      }
    }
  }
}

/**
 * Result of checkAdminLoginToken(...) — the FULL object ({ status, message }), not just the
 * message payload. Required as-is because both checkUserSubadminAccess (needs
 * message.admin_row_id / admin_manager_type / sub_admin_type) and getUpdateTrackerFields
 * (needs the whole token shape) read from it.
 */
export interface AdminTokenContext {
  status: boolean
  message: any
}

export interface AdminCreateOrUpdateWorkExperienceParams {
  /** Full result of checkAdminLoginToken(...) for the acting admin — NOT the target professional. */
  admin_context: AdminTokenContext
  /** The professional whose work experience is being edited (admin acts on someone else's data). */
  target_user_row_id: number
  /** professionals_work_experienceM record id; 0/falsy means insert. */
  professional_row_id: number
  body: Record<string, any>
  /**
   * express-validator errors from the controller (arrangeValidation(errors)), folded into this
   * function's own errObj BEFORE the single save-gating check below — see the matching field on
   * CreateOrUpdateWorkExperienceParams for the full rationale.
   */
  preValidationErrors?: Record<string, string>
}

/**
 * Ports controllers/admin_panel/app/user.js's POST /update_professional_details handler body
 * (lines ~5170-5385) — the ADMIN write-path for editing a professional's work experience.
 * Deliberately NOT unified with createOrUpdateWorkExperience: preserves every admin-specific
 * divergence exactly (per explicit instruction), including:
 *  - checkUserSubadminAccess gate (app has no equivalent)
 *  - getUpdateTrackerFields merged into professionalsM.updateOne on update only
 *  - admin-specific cache keys ('speakers_list_*', 'professional_detail_lists*' [sic, note the
 *    missing underscore before the wildcard — a pre-existing divergence from app's
 *    'professional_detail_list_*', preserved verbatim, not a typo to "fix" here], 'app_user_detail_*'),
 *    invoked twice on update: once inside `if (body.public_view)`, then unconditionally again
 *    right after the updateOne — NOT invalidateWorkExperienceCaches() and NOT app_user_other_details_*
 *  - no updateNotification call anywhere
 *  - response shapes are the RAW admin strings, including the trailing space in the insert
 *    alert_message and the leaked `cache_response` second key on the update response
 *  - the extra public_status_id branch for public_view resolution
 */
export async function adminCreateOrUpdateWorkExperience({
  admin_context,
  target_user_row_id,
  professional_row_id,
  body,
  preValidationErrors
}: AdminCreateOrUpdateWorkExperienceParams): Promise<{ status: boolean; message: any }> {
  // Spread first so this function's own business-logic checks below can still overwrite a
  // same-named key later (chronological last-write-wins, matching the real source).
  const errObj: Record<string, string> = { ...preValidationErrors }

  const check_access = await checkUserSubadminAccess({
    admin_row_id: Number.parseInt(admin_context.message.admin_row_id),
    admin_manager_type: admin_context.message.admin_manager_type,
    sub_admin_type: Number.parseInt(admin_context.message.sub_admin_type),
    user_row_id: target_user_row_id
  })
  if (!check_access.status) {
    errObj['alert_message'] = check_access.message
  }

  const positionsResult = await validatePositions(body.additional_positions)
  if (!positionsResult.status) {
    errObj['additional_positions'] = positionsResult.message
  }

  let company_type = Number.parseInt(body.company_type)
  if (Number.isNaN(company_type)) company_type = 0
  let company_row_id = Number.parseInt(body.company_row_id)
  if (Number.isNaN(company_row_id)) company_row_id = 0
  let till_date_status = Number.parseInt(body.till_date_status)
  if (Number.isNaN(till_date_status)) till_date_status = 0

  if (company_type == 1) {
    const company_reg_query = await companyM.findOne({ _id: company_row_id }, { _id: 1 })
    if (!company_reg_query) {
      errObj['company_row_id'] = 'Sorry, Invalid registered company row id'
    }
  } else if (company_type == 2) {
    const company_manual_query = await company_manual_retrievalsM.findOne({ _id: company_row_id }, { _id: 1 })
    if (!company_manual_query) {
      errObj['company_row_id'] = 'Sorry, Invalid manual company row id'
    }
  }

  if (!professional_row_id) {
    const check_time_range_query = await professionals_work_experienceM.findOne(
      {
        user_row_id: target_user_row_id,
        user_account_type: 1,
        company_type: company_type,
        company_row_id: company_row_id,
        start_date: { $lte: sanitize(body.start_date) },
        end_date: { $gte: sanitize(body.end_date) }
      },
      { _id: 1 }
    )
    if (check_time_range_query) {
      errObj['time_range'] = 'An experience with this duration is already exists'
    }
  }

  if (till_date_status === 2) {
    const company_reg_query = await professionals_work_experienceM.findOne(
      {
        _id: { $ne: professional_row_id },
        user_account_type: 1,
        user_row_id: target_user_row_id,
        company_type: company_type,
        company_row_id: company_row_id,
        till_date_status: 2
      },
      { _id: 1 }
    )
    if (company_reg_query) {
      errObj['time_range'] = 'Sorry, your present working details already exist for this company. Please provide the end date for your previous experience.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const check_user = await professionalsM.findOne({ _id: target_user_row_id })
  if (!check_user) {
    return { status: false, message: 'Invalid User Row ID' }
  }

  const positions = (positionsResult.positions ?? []) as ResolvedPosition[]

  const insert_array: Record<string, any> = {}
  insert_array['responsibilities'] = body.responsibilities
  insert_array['employment_type'] = body.employment_type
  insert_array['till_date_status'] = till_date_status
  insert_array['start_date'] = body.start_date ? body.start_date : ''
  insert_array['location_type'] = body.location_type ? body.location_type : ''
  insert_array['end_date'] = till_date_status === 1 ? body.end_date : ''
  insert_array['positions'] = positions
  insert_array['position_row_id'] = positions[0]?.position_row_id
  insert_array['position_type'] = positions[0]?.position_type || 1
  insert_array['sub_position_row_id'] = positions[0]?.sub_position_row_id

  if (body.public_view) {
    insert_array['public_view'] = true
  } else if (Number.parseInt(body.public_status_id) == professional_row_id) {
    insert_array['public_view'] = true
  } else {
    insert_array['public_view'] = false
  }

  // Publish gate applies to admin-panel edits only (design §2) — this whole function is
  // admin-only (no owner path exists here; the app-side equivalent is
  // createOrUpdateWorkExperience above), so every call submits a change request instead of
  // writing live. The public_view demotion / notification / profile-score side effects below
  // only make sense once a write actually lands live, so they stay on the OLD code path, which no
  // longer runs for either branch — same deliberate scope limit as Team Members' identical gate
  // (team-members.service.ts's adminCreateOrUpdateTeamMember doc comment).
  const adminRowId = Number.parseInt(admin_context.message.admin_row_id)
  const actor = toActorRefWithId(
    {
      updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
      updated_by_row_id: adminRowId,
    },
    adminRowId,
  )

  if (!professional_row_id) {
    insert_array['user_account_type'] = 1
    insert_array['user_row_id'] = target_user_row_id
    insert_array['company_type'] = company_type
    insert_array['company_row_id'] = company_row_id

    return submitChildChangeRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_DETAILS,
      rootDocumentId: target_user_row_id,
      targetRowId: null,
      liveValues: {},
      submitted: insert_array,
      actor,
    })
  }

  const liveValues = (await professionals_work_experienceM.findOne({ _id: professional_row_id }).lean()) ?? {}
  return submitChildChangeRequest({
    module: AUDIT_MODULE_PROFESSIONALS,
    section: SECTION_PROFESSIONAL_DETAILS,
    rootDocumentId: target_user_row_id,
    targetRowId: professional_row_id,
    liveValues,
    submitted: insert_array,
    actor,
  })
}

export interface AdminDeleteProfessionalDetailParams {
  /** Full result of checkAdminLoginToken(...) for the acting admin — NOT the target professional. */
  admin_context: AdminTokenContext
  /** The professional whose work experience is being deleted (admin acts on someone else's data). */
  target_user_row_id: number
  /** professionals_work_experienceM record id being deleted. */
  professional_row_id: number
}

/**
 * CONFIRMED BUG FIX: admin-panel Delete for Professional Details used to go straight through the
 * legacy, ungated `GET admin_panel/users/delete_professional_details/:user_row_id/:professional_details_id`
 * (controllers/admin_panel/app/user.js:4538) — a plain GET that deleted the row immediately, no
 * change-request review at all. This was the only Add/Edit/Delete trio on this section where
 * Delete didn't go through review (Add/Edit already gate through adminCreateOrUpdateWorkExperience
 * above), confirmed live during Professionals-migration QA: an admin could delete a work-experience
 * entry with zero approval step while a same-admin edit to the exact same row required one.
 * Mirrors Awards' deleteAward admin branch (professionals-awards.service.ts) — ownership check,
 * row snapshot, submitChildDeleteRequest — and adminCreateOrUpdateWorkExperience's own
 * actor-construction pattern immediately above.
 */
export async function adminDeleteProfessionalDetail({
  admin_context,
  target_user_row_id,
  professional_row_id,
}: AdminDeleteProfessionalDetailParams): Promise<{ status: boolean; message: any }> {
  const check_access = await checkUserSubadminAccess({
    admin_row_id: Number.parseInt(admin_context.message.admin_row_id),
    admin_manager_type: admin_context.message.admin_manager_type,
    sub_admin_type: Number.parseInt(admin_context.message.sub_admin_type),
    user_row_id: target_user_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const query = await professionals_work_experienceM.findOne({ _id: professional_row_id, user_row_id: target_user_row_id })
  if (!query) {
    return { status: false, message: { alert_message: 'Invalid Professional Row ID' } }
  }

  const rowSnapshot = typeof query.toObject === 'function' ? query.toObject() : { ...query }

  const adminRowId = Number.parseInt(admin_context.message.admin_row_id)
  const actor = toActorRefWithId(
    {
      updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
      updated_by_row_id: adminRowId,
    },
    adminRowId,
  )

  return submitChildDeleteRequest({
    module: AUDIT_MODULE_PROFESSIONALS,
    section: SECTION_PROFESSIONAL_DETAILS,
    rootDocumentId: target_user_row_id,
    targetRowId: professional_row_id,
    rowSnapshot,
    actor,
  })
}

/**
 * Ports the admin dashboard's user_as_employee_request_pending/approved stats — delegated here
 * from modules/company_admin/ (Part 3 §7 Phase H step 3), since these are fundamentally
 * work-experience-domain counts, not company-admin's own concern.
 */
export async function getEmployeeRequestCounts() {
  const [pendingResult, approvedResult] = await Promise.all([
    professionals_work_experienceM.aggregate(buildEmployeeRequestCountPipeline({ verified: false })),
    professionals_work_experienceM.aggregate(buildEmployeeRequestCountPipeline({ verified: true })),
  ])

  return {
    pending: pendingResult[0]?.count ?? 0,
    approved: approvedResult[0]?.count ?? 0,
  }
}

// Phase B (work-experience reconciliation, per plan doc 2026-09-10). Ports
// controllers/app/users/setting.js's /delete_professional_details/:professional_details_id
// (~2313-2352) — the one remaining professionals-work-experience route not yet in this module.
// Same behavior, same response shape.
//
// FLAGGED, NOT FIXED: this calls the shared `deleteProfessionalDetails` helper
// (utils/helpers/app_helper.js:657), whose own catch block is `catch { console.error(...,
// err.message) }` — no bound `err` parameter, so `err.message` throws a *second*, unhandled
// ReferenceError if the delete itself ever fails, instead of the intended log-and-return-false.
// Not fixed here: it's a shared helper used by several other legacy call sites outside this
// migration's scope, and fixing it is a behavior change (a real error response instead of an
// uncaught exception) needing its own sign-off.
export async function deleteProfessionalDetail(userRowId: number, professionalDetailsIdRaw: string) {
  const professionalDetailsId = Number.parseInt(professionalDetailsIdRaw)
  if (Number.isNaN(professionalDetailsId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } }
  }

  const query: any = await professionals_work_experienceM.findOne(
    { _id: professionalDetailsId, user_row_id: userRowId },
    { company_row_id: 1, till_date_status: 1, company_type: 1 },
  )
  if (!query) {
    return { status: false, message: 'Invalid Professional Row ID' }
  }

  await deleteProfessionalDetails({ professional_details_id: professionalDetailsId, type: 1 })
  await deleteKeysByPattern('app_user_other_details_*')
  await deleteKeysByPattern('professional_detail_list_*')
  if (query.company_type === 1 && query.company_row_id) {
    await deleteKeysByPattern('employee_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
  }
  await calculateUserProfileScore(userRowId, ['professional_detail'])

  return { status: true, message: { alert_message: 'Your details have been deleted successfully. ' } }
}

// Phase B (work-experience reconciliation). Ports controllers/admin_panel/app/user/
// work_experiences.js's GET /manual_professional_detail_list/:user_row_id/:skip/:limit (~8-178).
// Same behavior, same company-grouped response shape — see getManualProfessionalDetailListPipeline
// in work-experience.queries.ts for the confirmed perf fix (user_row_id moved into the first
// $match instead of being applied after two $lookups).
export async function getManualProfessionalDetailList(userRowId: number, skip: number, limit: number) {
  const checkUser = await professionals_manual_retrievalsM.findOne({ _id: userRowId })
  if (!checkUser) {
    return { status: false, message: 'Invalid User Row ID.' }
  }

  const query = await professionals_work_experienceM
    .aggregate(getManualProfessionalDetailListPipeline(userRowId))
    .skip(skip)
    .limit(limit)

  return { status: true, message: query }
}
