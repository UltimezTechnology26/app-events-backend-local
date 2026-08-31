// modules/team-members/team-members.service.ts
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const employees_requestsM = require('../../../models/app/company/employees_requestsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const { calculateCompanyProfileScore, deleteProfessionalDetails } = require('../../../utils/helpers/app_helper')
const { getPresentDateTime, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { validatePositions, ResolvedPosition } from '../work-experience/work-experience.service'
import { buildCompanyTeamMemberCountPipeline, getTeamMembersForCompanyIds } from './team-members.queries'

/**
 * Full result of checkAdminLoginToken(...) for the acting admin — used only for
 * checkCompanySubadminAccess's admin_row_id/admin_manager_type/sub_admin_type fields.
 */
export interface AdminTokenContext {
  status: boolean
  message: any
}

export interface CreateOrUpdateEmployeeDetailsParams {
  /** The requesting company-owner's own user_row_id — used to look up THEIR OWN company. */
  company_owner_user_row_id: number
  /** professionals_work_experienceM record id; 0/falsy means insert. */
  work_row_id: number
  body: Record<string, any>
  /**
   * express-validator errors from the controller (arrangeValidation(errors)), folded into this
   * function's own errObj BEFORE the single save-gating check below — matching the real source's
   * one-shared-errObj behavior (see work-experience.service.ts's matching field for full rationale).
   */
  preValidationErrors?: Record<string, string>
}

/**
 * Ports controllers/app/company/employee.js's POST /update_employee_details handler body
 * (lines ~21-238) — the APP write-path where a company owner adds/edits one of their own
 * team members' work-experience record. Reuses validatePositions() from
 * work-experience.service.ts for the additional_positions loop (verified byte-identical to the
 * real source here — do not reimplement).
 *
 * Deliberately NOT unified with adminCreateOrUpdateEmployeeDetails: preserves every divergence
 * from the admin write-path exactly, including:
 *  - company is resolved from the CALLER's own record (companyM.findOne({ user_row_id:
 *    company_owner_user_row_id, active_status: 1 })) plus an approval_status===1 gate — admin
 *    instead trusts a body-supplied company_row_id directly, no approval check
 *  - no checkCompanySubadminAccess gate (app has no equivalent; the caller IS the company owner)
 *  - public_view defaults to false on insert (admin defaults to true)
 *  - cache keys cleared: 'employee_list_*' and 'app_company_individual_other_details_*' only —
 *    admin additionally clears 'app_user_other_details_*'
 *  - insert response leaks the full saved Mongoose document as `insert_query` in `message` — a
 *    real, existing behavior, preserved verbatim, not something to "clean up" here
 *  - update response message has a typo ("...are update successfully .") and the function's
 *    return value carries a sibling top-level `delete_cache` field (the resolved value of the
 *    first deleteKeysByPattern(...) call) alongside `status`/`message` — both preserved verbatim
 */
export async function createOrUpdateEmployeeDetails({
  company_owner_user_row_id,
  work_row_id,
  body,
  preValidationErrors
}: CreateOrUpdateEmployeeDetailsParams): Promise<{ status: boolean; message: any; delete_cache?: any }> {
  // Spread first so this function's own business-logic checks below can still overwrite a
  // same-named key later (chronological last-write-wins, matching the real source).
  const errObj: Record<string, string> = { ...preValidationErrors }

  let company_row_id = 0
  const check_company_query = await companyM.findOne(
    { user_row_id: company_owner_user_row_id, active_status: 1 },
    { _id: 1, approval_status: 1 }
  )
  if (check_company_query) {
    if (check_company_query.approval_status == 1) {
      company_row_id = check_company_query._id
    } else {
      errObj['alert_message'] = 'Sorry, Your company is still not approved. Please wait for approval.'
    }
  } else {
    errObj['alert_message'] = 'Sorry, This user company does not exist.'
  }

  // ── Positions validation (accumulated into errObj, does not short-circuit) — reuses
  // validatePositions() rather than re-deriving the identical loop. ──
  const positionsResult = await validatePositions(body.additional_positions)
  if (!positionsResult.status) {
    errObj['additional_positions'] = positionsResult.message
  }
  const positions = (positionsResult.positions ?? []) as ResolvedPosition[]
  let position_row_id = 0
  let sub_position_row_id = 0
  if (positions.length > 0) {
    position_row_id = positions[0].position_row_id
    sub_position_row_id = positions[0].sub_position_row_id
  }

  let user_account_type = 0
  let user_row_id = 0
  let resolved_work_row_id = 0

  if (work_row_id) {
    if (!Number.isNaN(Number.parseInt(String(work_row_id)))) {
      resolved_work_row_id = Number.parseInt(String(work_row_id))
      const check_query = await professionals_work_experienceM.findOne({ _id: resolved_work_row_id })
      if (!check_query) {
        errObj['alert_message'] = 'Invalid work row id'
      }
    }
  } else {
    if (!Number.isNaN(Number.parseInt(body.user_account_type)) && !Number.isNaN(Number.parseInt(body.user_row_id))) {
      user_account_type = Number.parseInt(body.user_account_type)
      user_row_id = Number.parseInt(body.user_row_id)
      if (user_account_type == 1) {
        const user_reg_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 }, { _id: 1 })
        if (!user_reg_query) {
          errObj['investor_row_id'] = 'Sorry, Invalid registered user row id'
        }
      } else if (user_account_type == 2) {
        const user_manual_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id }, { _id: 1 })
        if (!user_manual_query) {
          errObj['investor_row_id'] = 'Sorry, Invalid manual user row id'
        }
      }
    }
    if (user_row_id && user_account_type) {
      const check_work_query = await professionals_work_experienceM.findOne(
        { till_date_status: 2, user_account_type, user_row_id, company_type: 1, company_row_id },
        { _id: 1 }
      )
      if (check_work_query) {
        errObj['alert_message'] = 'Sorry, This employee details are already exist.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_array: Record<string, any> = {}
  update_array['employment_type'] = body.employment_type ? Number.parseInt(body.employment_type) : ''
  if (body.location_type) {
    update_array['location_type'] = Number.parseInt(body.location_type)
  }
  update_array['designation_type'] = body.designation_type
  update_array['responsibilities'] = body.responsibilities
  update_array['start_date'] = body.start_date ? body.start_date : ''
  update_array['positions'] = positions
  update_array['position_row_id'] = position_row_id
  update_array['position_type'] = positions[0]?.position_type || 1
  update_array['sub_position_row_id'] = sub_position_row_id
  update_array['public_view'] = false

  if (!resolved_work_row_id) {
    update_array['user_account_type'] = user_account_type
    update_array['user_row_id'] = user_row_id
    update_array['company_type'] = 1
    update_array['company_row_id'] = company_row_id
    update_array['till_date_status'] = 2
    update_array['verified_status'] = true
    update_array['verified_on'] = getPresentDateTime()

    await professionals_work_experienceM.updateMany({ user_row_id: user_row_id }, { $set: { public_view: false } })
    const insert_query = await professionals_work_experienceM(update_array).save()
    await deleteKeysByPattern('employee_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_user_other_details_*')
    if (user_account_type == 1) {
      await updateNotification({
        user_row_id,
        notify_type: 2,
        notify_type_row_id: company_row_id,
        message_row_id: 18,
        action_row_id: insert_query._id
      })
    }
    await calculateCompanyProfileScore(company_row_id, ['team_detail'])

    return {
      status: true,
      message: { alert_message: 'This team members details are added successfully.', insert_query: insert_query }
    }
  } else {
    await professionals_work_experienceM.updateMany(
      { _id: { $ne: resolved_work_row_id }, user_row_id: user_row_id },
      { $set: { public_view: false } }
    )
    await professionals_work_experienceM.updateOne({ _id: resolved_work_row_id }, { $set: update_array })
    const delete_cache = await deleteKeysByPattern('employee_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_user_other_details_*')

    return {
      status: true,
      message: { alert_message: 'This team members details are update successfully .' },
      delete_cache: delete_cache
    }
  }
}

export interface AdminCreateOrUpdateEmployeeDetailsParams {
  /** Full result of checkAdminLoginToken(...) for the acting admin. */
  admin_context: AdminTokenContext
  /** professionals_work_experienceM record id; 0/falsy means insert. */
  work_row_id: number
  body: Record<string, any>
  /**
   * express-validator errors from the controller (arrangeValidation(errors)), folded into this
   * function's own errObj BEFORE the single save-gating check below — see the matching field on
   * CreateOrUpdateEmployeeDetailsParams for the full rationale.
   */
  preValidationErrors?: Record<string, string>
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's POST /update_employee_details handler
 * body (lines ~16-231) — the ADMIN write-path for adding/editing a company's team member on
 * behalf of the company. Reuses validatePositions() from work-experience.service.ts for the
 * additional_positions loop (verified byte-identical to the real source here — do not
 * reimplement).
 *
 * Deliberately NOT unified with createOrUpdateEmployeeDetails: preserves every divergence from
 * the app write-path exactly, including:
 *  - gated by checkCompanySubadminAccess (using a body-supplied company_row_id) instead of
 *    resolving the caller's own company — no approval_status check at all
 *  - public_view defaults to true on insert (app defaults to false)
 *  - cache keys cleared: 'employee_list_*', 'app_company_individual_other_details_*', AND
 *    'app_user_other_details_*' — one more key than the app version clears
 *  - response messages are clean (no insert_query leak, no delete_cache leak, no typo) —
 *    "This employee details are added successfully." / "...are updated successfully."
 */
export async function adminCreateOrUpdateEmployeeDetails({
  admin_context,
  work_row_id,
  body,
  preValidationErrors
}: AdminCreateOrUpdateEmployeeDetailsParams): Promise<{ status: boolean; message: any }> {
  // Spread first so this function's own business-logic checks below can still overwrite a
  // same-named key later (chronological last-write-wins, matching the real source).
  const errObj: Record<string, string> = { ...preValidationErrors }

  let resolved_work_row_id = 0
  let company_row_id = 0
  let user_account_type = 0
  let user_row_id = 0

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(admin_context.message.admin_row_id),
    admin_manager_type: admin_context.message.admin_manager_type,
    sub_admin_type: Number.parseInt(admin_context.message.sub_admin_type),
    company_row_id: Number.parseInt(body.company_row_id)
  })
  if (!check_access.status) {
    errObj['alert_message'] = check_access.message
  }

  // ── Positions validation (accumulated into errObj, does not short-circuit) — reuses
  // validatePositions() rather than re-deriving the identical loop. ──
  const positionsResult = await validatePositions(body.additional_positions)
  if (!positionsResult.status) {
    errObj['additional_positions'] = positionsResult.message
  }
  const positions = (positionsResult.positions ?? []) as ResolvedPosition[]
  let position_row_id = 0
  let sub_position_row_id = 0
  if (positions.length > 0) {
    position_row_id = positions[0].position_row_id
    sub_position_row_id = positions[0].sub_position_row_id
  }

  if (work_row_id) {
    if (!Number.isNaN(Number.parseInt(String(work_row_id)))) {
      resolved_work_row_id = Number.parseInt(String(work_row_id))
      const check_query = await professionals_work_experienceM.findOne({ _id: resolved_work_row_id })
      if (!check_query) {
        errObj['alert_message'] = 'Invalid work row id'
      }
    }
  } else {
    if (!body.company_row_id) {
      errObj['company_row_id'] = 'The Company Row ID field is required.'
    } else {
      company_row_id = Number.parseInt(body.company_row_id)
      const check_company_query = await companyM.findOne({ _id: company_row_id }, { _id: 1 })
      if (!check_company_query) {
        errObj['alert_message'] = 'Sorry, Invalid Company Row ID.'
      }
    }
    if (!Number.isNaN(Number.parseInt(body.user_account_type)) && !Number.isNaN(Number.parseInt(body.user_row_id))) {
      user_account_type = Number.parseInt(body.user_account_type)
      user_row_id = Number.parseInt(body.user_row_id)
      if (user_account_type === 1) {
        const user_reg_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 }, { _id: 1 })
        if (!user_reg_query) {
          errObj['investor_row_id'] = 'Sorry, Invalid registered user row id'
        }
      } else if (user_account_type === 2) {
        const user_manual_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id }, { _id: 1 })
        if (!user_manual_query) {
          errObj['investor_row_id'] = 'Sorry, Invalid manual user row id'
        }
      }
    }
    if (user_row_id && user_account_type && company_row_id) {
      const check_work_query = await professionals_work_experienceM.findOne(
        { till_date_status: 2, user_account_type, user_row_id, company_type: 1, company_row_id },
        { _id: 1 }
      )
      if (check_work_query) {
        errObj['alert_message'] = 'Sorry, This employee details are already exist.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_array: Record<string, any> = {}
  const employment_type = Number.parseInt(body.employment_type)
  const designation_type = Number.parseInt(body.designation_type)
  const location_type = body.location_type ? Number.parseInt(body.location_type) : ''
  update_array['employment_type'] = employment_type
  update_array['designation_type'] = designation_type
  update_array['location_type'] = location_type
  update_array['responsibilities'] = body.responsibilities
  update_array['start_date'] = body.start_date
  update_array['positions'] = positions
  update_array['position_row_id'] = position_row_id
  update_array['position_type'] = positions[0]?.position_type || 1
  update_array['sub_position_row_id'] = sub_position_row_id
  update_array['public_view'] = true

  if (!resolved_work_row_id) {
    update_array['user_row_id'] = user_row_id
    update_array['user_account_type'] = user_account_type
    update_array['company_type'] = 1
    update_array['company_row_id'] = company_row_id
    update_array['till_date_status'] = 2
    update_array['verified_status'] = true
    update_array['verified_on'] = getPresentDateTime()

    await professionals_work_experienceM.updateMany({ user_row_id, user_account_type }, { $set: { public_view: false } })
    const insert_query = await professionals_work_experienceM(update_array).save()
    await deleteKeysByPattern('employee_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_user_other_details_*')
    if (user_account_type == 1) {
      await updateNotification({
        user_row_id,
        notify_type: 2,
        notify_type_row_id: company_row_id,
        message_row_id: 18,
        action_row_id: insert_query._id
      })
    }
    await calculateCompanyProfileScore(company_row_id, ['team_detail'])

    return { status: true, message: { alert_message: 'This employee details are added successfully.' } }
  } else {
    await professionals_work_experienceM.updateMany(
      { _id: { $ne: resolved_work_row_id }, user_row_id, user_account_type },
      { $set: { public_view: false } }
    )
    await professionals_work_experienceM.updateOne({ _id: resolved_work_row_id }, { $set: update_array })
    await deleteKeysByPattern('employee_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_user_other_details_*')

    return { status: true, message: { alert_message: 'This employee details are updated successfully.' } }
  }
}

/**
 * Ports controllers/app/company/employee.js's GET /remove_employee/:request_row_id
 * (lines 17-60) verbatim — as-is, no redesign (Part 3 §7 Phase B step 5, §8). Keeps the
 * same inline company-resolution + approval-status check as this file's other
 * functions above (not common.ownership.ts) so the exact original error message
 * wording is preserved; controller-layer concern per this module's established
 * convention. `delete_cache1` (the raw deleteKeysByPattern return value) is
 * preserved as a sibling top-level field on success, matching the real source.
 */
export async function removeEmployee({
  company_owner_user_row_id,
  request_row_id
}: {
  company_owner_user_row_id: number
  request_row_id: number
}): Promise<{ status: boolean; message: any; delete_cache1?: any }> {
  const check_company_query = await companyM.findOne({ user_row_id: company_owner_user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
  if (!check_company_query) {
    return { status: false, message: { alert_message: 'Sorry, This user company does not exist.' } }
  }
  if (check_company_query.approval_status != 1) {
    return { status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } }
  }

  const company_row_id = check_company_query._id
  const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, company_type: 1, company_row_id })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invalid Request row id' } }
  }

  await professionals_work_experienceM.deleteOne({ _id: request_row_id, company_type: 1, company_row_id })

  const delete_cache1 = await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('employee_list_*')
  await deleteKeysByPattern('app_user_other_details_*')
  await calculateCompanyProfileScore(company_row_id, ['team_detail'])

  return { status: true, message: { alert_message: 'This employee details has been removed successfully.' }, delete_cache1 }
}

/**
 * Ports controllers/app/company/employee.js's GET /approve_request/:request_row_id
 * (lines 62-118) verbatim — as-is, no redesign (Part 3 §7 Phase B step 5, §8). Same
 * inline ownership/approval check as removeEmployee above, for the same reason.
 */
export async function approveEmployeeRequest({
  company_owner_user_row_id,
  request_row_id
}: {
  company_owner_user_row_id: number
  request_row_id: number
}): Promise<{ status: boolean; message: any }> {
  const check_company_query = await companyM.findOne({ user_row_id: company_owner_user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
  if (!check_company_query) {
    return { status: false, message: { alert_message: 'Sorry, This user company does not exist.' } }
  }
  if (check_company_query.approval_status != 1) {
    return { status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } }
  }

  const company_row_id = check_company_query._id
  const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, company_type: 1, company_row_id, verified_status: false })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invalid Request row id' } }
  }

  await professionals_work_experienceM.updateOne({ _id: request_row_id }, {
    $set: {
      verified_status: true,
      verified_on: getPresentDateTime()
    }
  })
  await deleteKeysByPattern('employee_list_*')
  await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('app_user_other_details_*')

  if (check_query.user_account_type == 1) {
    await updateNotification({
      user_row_id: check_query.user_row_id,
      notify_type: 2,
      notify_type_row_id: company_row_id,
      message_row_id: 19,
      action_row_id: check_query._id
    })
  }

  return { status: true, message: { alert_message: 'This employee details has been verified successfully.' } }
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /remove_employee/:request_row_id
 * (Part 3 §7 Phase H step 8) — the ADMIN write-path, gated by checkCompanySubadminAccess against
 * the found record's own company_row_id (NOT the caller's own company, unlike removeEmployee
 * above). Deliberately NOT unified with removeEmployee: the real source has no company-ownership
 * pre-check at all — it looks the work-experience record up by `_id` alone, THEN derives
 * company_row_id from whatever it finds, THEN gates on sub-admin access to that company. Uses
 * deleteProfessionalDetails({type:1}) (a plain deleteOne under the hood) rather than
 * professionals_work_experienceM.deleteOne directly, matching the real source exactly.
 */
export async function adminRemoveEmployee({
  admin_context,
  request_row_id
}: {
  admin_context: AdminTokenContext
  request_row_id: number
}): Promise<{ status: boolean; message: any }> {
  const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invalid Request row id' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(admin_context.message.admin_row_id),
    admin_manager_type: admin_context.message.admin_manager_type,
    sub_admin_type: Number.parseInt(admin_context.message.sub_admin_type),
    company_row_id: check_query.company_row_id
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  await deleteProfessionalDetails({ professional_details_id: request_row_id, type: 1 })
  await deleteKeysByPattern('employee_list_*')
  await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('app_user_other_details_*')
  await calculateCompanyProfileScore(check_query.company_row_id, ['team_detail'])

  return { status: true, message: { alert_message: 'This employee details has been removed successfully.' } }
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /approve_request/:request_row_id
 * (Part 3 §7 Phase H step 8) — same admin sub-admin-access gating rationale as adminRemoveEmployee
 * above. Response message text is a REAL, confirmed divergence from approveEmployeeRequest's own
 * ("...has been approved successfully." here vs. "...has been verified successfully." there) —
 * preserved exactly, not unified. The real source's "Invaild request row id" typo (missing the
 * second 'l') is also preserved verbatim, matching this engagement's standing typo-preservation
 * precedent.
 */
export async function adminApproveEmployeeRequest({
  admin_context,
  request_row_id
}: {
  admin_context: AdminTokenContext
  request_row_id: number
}): Promise<{ status: boolean; message: any }> {
  const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, verified_status: false })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invaild request row id' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(admin_context.message.admin_row_id),
    admin_manager_type: admin_context.message.admin_manager_type,
    sub_admin_type: Number.parseInt(admin_context.message.sub_admin_type),
    company_row_id: check_query.company_row_id
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  await professionals_work_experienceM.updateOne({ _id: request_row_id }, {
    $set: {
      verified_status: true,
      verified_on: getPresentDateTime()
    }
  })
  await deleteKeysByPattern('employee_list_*')
  await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('app_user_other_details_*')

  if (check_query.user_account_type == 1) {
    await updateNotification({
      user_row_id: check_query.user_row_id,
      notify_type: 2,
      notify_type_row_id: check_query.company_row_id,
      message_row_id: 19,
      action_row_id: check_query._id
    })
  }

  return { status: true, message: { alert_message: 'This employee request has been approved successfully.' } }
}

/**
 * Ports company.js's company_individual_overview's team_members/pending_team_members stats
 * (Part 3 §7 Phase H step 5) — delegated here from modules/company_admin/. Preserves the real
 * source's exact presence rule: a key is included only when its aggregate's $count stage
 * actually produced a row (which happens only when the count is greater than 0).
 */
export async function getCompanyTeamMemberCounts(companyRowId: number): Promise<{ team_members?: number; pending_team_members?: number }> {
  const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
  const [teamRows, pendingRows]: [any[], any[]] = await Promise.all([
    professionals_work_experienceM.aggregate(buildCompanyTeamMemberCountPipeline({ companyRowId })),
    professionals_work_experienceM.aggregate(buildCompanyTeamMemberCountPipeline({ companyRowId, verifiedStatus: false })),
  ])

  const result: { team_members?: number; pending_team_members?: number } = {}
  if (teamRows[0]) {
    result.team_members = teamRows[0].count
  }
  if (pendingRows[0]) {
    result.pending_team_members = pendingRows[0].count
  }
  return result
}

/**
 * Lets a logged-in user submit a request to be marked as "working at" a
 * company (pending admin/company approval). No confirmed frontend caller in
 * either repo audited during this engagement — kept live in its natural home
 * (team/work-experience domain, matching the Build Order's original intent to
 * pair it with the team_members route) rather than a separate "dead code"
 * file, per the FINAL PHASE decision: this route's URL may still be depended
 * on by a consumer outside those two repos.
 */
export const submitRequestAsWorking = async (headers: any, companyIdParam: any) => {
  let user_row_id = 0
  const checkUserToken = checkUserLoginToken(headers)
  if (checkUserToken.status) {
    user_row_id = checkUserToken.message
  }

  const company_query = await companyM.findOne({ company_id: companyIdParam }, { _id: 1, user_row_id: 1 })
  if (company_query) {
    let company_user_row_id = Number.parseInt(company_query.user_row_id)
    let company_row_id = Number.parseInt(company_query._id)

    if (user_row_id === company_user_row_id) {
      return { status: false, message: { alert_message: 'Yeah! You are trying to do something which is not possible.' } }
    }
    else {
      const employees_request_query = await employees_requestsM.findOne({ company_row_id: company_row_id, user_row_id: user_row_id }, { _id: 1 })
      if (employees_request_query) {
        return { status: false, message: { alert_message: 'Your already employee of this company.' } }
      }
      else {
        const saveData = new employees_requestsM({ company_row_id: company_row_id, user_row_id: user_row_id, approval_status: 1, date_n_time: getPresentDateTime() })
        await saveData.save()

        return { status: true, message: { alert_message: 'Your request to this company submitted successfully.' } }
      }
    }
  }
  else {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company ID' } }
  }
}

const isJsonString = (str: any): boolean => {
  try {
    JSON.parse(str)
  } catch (e) {
    return false
  }
  return true
}

/**
 * Moved out of controllers/app/company/front_page.js's GET /team_members/:company_row_id?
 * (completeness follow-up — that route was the only one in the file still holding real logic
 * inline instead of delegating to a module). CONFIRMED BUG FIX (Part 3 §7 Phase H step 14)
 * carried over verbatim: the only live caller (admin-coinpedia's token-detail page, via
 * team_members_list.js) passes company_row_id as a URL PATH segment (/team_members/4763), not
 * the JSON-array query string this route originally expected — meaning it 404'd before ever
 * reaching real logic. Accepts both: an optional path param (the actually-used form) or the
 * original query-string array form.
 */
export const getTeamMembersForRequest = async (headers: any, companyRowIdParam: any, companyRowIdQuery: any) => {
  let user_row_id = 0
  const checkUserToken = checkUserLoginToken(headers)
  if (checkUserToken.status) {
    user_row_id = checkUserToken.message
  }

  let company_row_id_array: number[] = []
  if (companyRowIdParam) {
    const parsed = Number.parseInt(companyRowIdParam)
    if (!Number.isNaN(parsed)) {
      company_row_id_array = [parsed]
    }
  } else if (companyRowIdQuery) {
    if (isJsonString(companyRowIdQuery)) {
      company_row_id_array = JSON.parse(companyRowIdQuery)
    }
  }

  if (company_row_id_array && company_row_id_array.length) {
    const get_query = await getTeamMembersForCompanyIds({ companyRowIds: company_row_id_array, viewerUserRowId: user_row_id })
    return { status: true, message: get_query, company_row_id_array }
  }
  return { status: false, message: { alert_message: 'Sorry, Invalid company row id.' } }
}
