// modules/team-members/team-members.service.ts
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const professionals_manual_retrievalsM = require('../../models/app/users/professionals_manual_retrievalsM')
const { calculateCompanyProfileScore } = require('../../utils/helpers/app_helper')
const { getPresentDateTime, checkCompanySubadminAccess } = require('../../utils/helpers/helper')
const { updateNotification } = require('../../utils/helpers/notification_helper')
const { deleteKeysByPattern } = require('../../config/cache_helper')
import { validatePositions, ResolvedPosition } from '../work-experience/work-experience.service'

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
