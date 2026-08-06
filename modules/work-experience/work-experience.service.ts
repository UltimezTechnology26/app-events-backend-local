const sanitize = require('mongo-sanitize')
const professional_positionsM = require('../../models/app/static/professional_positionsM')
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const { addManualPosition, calculateUserProfileScore, getUpdateTrackerFields } = require('../../utils/helpers/app_helper')
const { getPresentDateTime, checkUserSubadminAccess } = require('../../utils/helpers/helper')
const { updateNotification } = require('../../utils/helpers/notification_helper')
const { deleteKeysByPattern } = require('../../config/cache_helper')
import { invalidateWorkExperienceCaches } from './work-experience.cache'
import { buildEmployeeRequestCountPipeline } from './work-experience.queries'

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

  if (!professional_row_id) {
    if (body.public_view) {
      await professionals_work_experienceM.updateMany(
        { user_row_id: target_user_row_id, user_account_type: 1 },
        { $set: { public_view: false } }
      )
    }

    insert_array['user_account_type'] = 1
    insert_array['user_row_id'] = target_user_row_id
    insert_array['company_type'] = company_type
    insert_array['company_row_id'] = company_row_id

    await professionals_work_experienceM(insert_array).save()

    await professionalsM.updateOne({ _id: target_user_row_id }, { $set: { updated_date_n_time: getPresentDateTime() } })
    await calculateUserProfileScore(target_user_row_id, ['professional_detail'])
    if (company_type === 1 && company_row_id) {
      // Same gap as createOrUpdateWorkExperience's app-side path: this write lands in
      // professionals_work_experienceM, which the company's Team Details tab (employee_list_*)
      // and public profile (app_company_individual_other_details_*) both read.
      await deleteKeysByPattern('employee_list_*')
      await deleteKeysByPattern('app_company_individual_other_details_*')
    }

    return { status: true, message: { alert_message: 'Your professional details have been successfully submitted. ' } }
  } else {
    if (body.public_view) {
      await professionals_work_experienceM.updateMany(
        { _id: { $ne: professional_row_id }, user_account_type: 1, user_row_id: target_user_row_id },
        { $set: { public_view: false } }
      )
      await deleteKeysByPattern('speakers_list_*')
      await deleteKeysByPattern('professional_detail_lists*')
      await deleteKeysByPattern('app_user_detail_*')
    }
    await professionals_work_experienceM.updateOne({ _id: professional_row_id }, { $set: insert_array })
    const updateFields = getUpdateTrackerFields(admin_context)
    await professionalsM.updateOne(
      { _id: target_user_row_id },
      { $set: { updated_date_n_time: getPresentDateTime(), ...updateFields } }
    )
    await deleteKeysByPattern('speakers_list_*')
    await deleteKeysByPattern('professional_detail_lists*')
    await deleteKeysByPattern('app_user_detail_*')
    if (company_type === 1 && company_row_id) {
      await deleteKeysByPattern('employee_list_*')
      await deleteKeysByPattern('app_company_individual_other_details_*')
    }

    return {
      status: true,
      message: {
        alert_message: 'We have successfully updated your professional details',
        cache_response: 'cache expire from speaker list '
      }
    }
  }
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
