// modules/company_revenue/company_revenue.service.ts
import { checkCompanyOwnership } from '../common/common.ownership'
import { invalidateCompanyRevenueCaches } from './company_revenue.cache'
import {
  findRevenueById,
  findRevenueForDeletion,
  findExistingRevenueRecord,
  findExistingYearlyRevenueRecord,
  findExistingQuarterlyRevenueRecord,
  findActiveCompanyById,
  findDuplicateBulkRevenueRecord,
  insertBulkRevenueRow,
  fetchCompanyRevenueSummaryRows,
  insertRevenueRecord,
  updateRevenueRecord
} from './company_revenue.queries'

const { deleteCompanyRevenue, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface RevenueStreamInput {
  category_row_id?: string | number
  stream_amount?: string | number
}

export interface SaveOrUpdateRevenueBody {
  company_row_id?: string | number
  revenue_row_id?: string | number
  revenue_streams?: RevenueStreamInput[]
  year?: string | number
  quarter?: string | number
  revenue?: string | number
}

export interface SaveOrUpdateRevenueParams {
  /** 0 when the caller isn't an app user (admin), or genuinely unresolved. */
  user_row_id: number
  user_type: number
  body: SaveOrUpdateRevenueBody
  /** express-validator's arrangeValidation(errors) output from the controller's own field checks. */
  preValidationErrors: Record<string, string>
  /** Only present when user_type === 2 (admin/subadmin caller). */
  admin_actor?: AdminActor
}

export interface RevenueResultMessage {
  alert_message?: string
  [key: string]: string | undefined
}

/**
 * Shared by saveOrUpdateRevenue, saveRevenueDetailsAdmin, and updateRevenueDetailsAdmin
 * (extracted — was previously inlined only in saveOrUpdateRevenue, which meant the two
 * admin-specific routes below silently never persisted revenue_streams at all despite the
 * repository layer (insertRevenueRecord/updateRevenueRecord) already supporting the field).
 */
function buildRevenueStreamsFromBody(revenue_streams_input: RevenueStreamInput[] | undefined, errObj: Record<string, string>): { category_row_id: number; stream_amount: number }[] {
  const revenue_streams: { category_row_id: number; stream_amount: number }[] = []
  if (revenue_streams_input && revenue_streams_input[0] && revenue_streams_input[0].category_row_id) {
    for (const revenue_run of revenue_streams_input) {
      let inner_error_status = false
      if (revenue_run.category_row_id && revenue_run.stream_amount) {
        if (Number.isNaN(Number.parseInt(revenue_run.category_row_id as string))) {
          errObj['revenue_streams'] = 'The Category Row ID field contains valid stream category id.'
          inner_error_status = true
        }
        if (Number.isNaN(Number.parseFloat(revenue_run.stream_amount as string))) {
          errObj['revenue_streams'] = 'The Stream amount field must be greater than or equal to 0.'
          inner_error_status = true
        }
        if (!inner_error_status) {
          if (Number.parseInt(revenue_run.category_row_id as string) > 0 && Number.parseFloat(revenue_run.stream_amount as string) > 0) {
            revenue_streams.push({ category_row_id: Number.parseInt(revenue_run.category_row_id as string), stream_amount: Number.parseFloat(revenue_run.stream_amount as string) })
          }
        }
      } else {
        errObj['revenue_streams'] = 'The Category Row ID and Stream amount fields are required.'
      }
    }
  }
  return revenue_streams
}

/**
 * Ports controllers/app/company/revenue.js's POST /update_n_save_details (lines
 * 238-393) — add or edit one quarterly/yearly revenue record, with its
 * revenue_streams[] breakdown.
 *
 * OWNERSHIP CHECK UPGRADE (Part 3 §7 Phase D step 1, same change already applied
 * to modules/team-members/ in Phase B step 5): the real source used
 * checkCompanyRowID, which never checks active_status or approval_status —
 * replaced with common.ownership.ts's checkCompanyOwnership, which does. This is
 * a genuine, intentional tightening (an app user whose OWN company is inactive
 * or not yet approved can no longer save revenue against it), not a
 * byte-for-byte port; consistent with the already-established Phase B
 * precedent, not a new decision made here.
 *
 * Preserved exactly: the errObj accumulates across every check (no
 * early-return), calculateCompanyProfileScore only runs on the INSERT branch
 * (not on update) — a real asymmetry in the original source, not an omission
 * introduced by this port.
 */
export async function saveOrUpdateRevenue({ user_row_id, user_type, body, preValidationErrors, admin_actor }: SaveOrUpdateRevenueParams): Promise<{ status: boolean; message: RevenueResultMessage; insert_object?: Record<string, unknown> }> {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let company_row_id = 0
  let revenue_row_id = 0

  if (body.company_row_id) {
    if (!Number.isNaN(Number.parseInt(body.company_row_id as string))) {
      company_row_id = Number.parseInt(body.company_row_id as string)
      if (user_type == 1) {
        const check_company = await checkCompanyOwnership({ company_row_id, user_row_id })
        if (!check_company.status) {
          errObj['company_row_id'] = (check_company.message as RevenueResultMessage).alert_message as string
        }
      } else if (user_type === 2) {
        // ADMIN AUTHZ FIX: `checkAllLoginToken(headers, [7])`'s admin fallback only confirms the
        // caller holds the generic "revenue" permission, not that they're assigned to THIS
        // company — unlike the dedicated admin route's checkCompanySubadminAccess scoping
        // (saveRevenueDetailsAdmin below). Apply that same per-company check here so a subadmin
        // with revenue access can't write another company's revenue via this route instead.
        if (!admin_actor) {
          errObj['alert_message'] = 'Sorry, You are not authorized to perform this action.'
        } else {
          const check_access = await checkCompanySubadminAccess(subadminAccessParams(admin_actor, company_row_id))
          if (!check_access.status) {
            errObj['alert_message'] = check_access.message
          }
        }
      }

      if (company_row_id) {
        if (body.revenue_row_id) {
          if (!Number.isNaN(Number.parseInt(body.revenue_row_id as string))) {
            revenue_row_id = Number.parseInt(body.revenue_row_id as string)
            const check_revenue_query = await findRevenueById(revenue_row_id)
            if (!check_revenue_query) {
              errObj['revenue_row_id'] = 'Sorry, Invalid Revenue Row ID.'
            }
          }
        }
      }
    } else {
      errObj['company_row_id'] = 'Invalid Company Row ID.'
    }
  } else {
    errObj['company_row_id'] = 'The Company row id field is required.'
  }

  const revenue_streams = buildRevenueStreamsFromBody(body.revenue_streams, errObj)

  let year = 0
  let quarter = 0
  if (body.year && body.quarter) {
    year = Number.parseInt(body.year as string)
    quarter = Number.parseInt(body.quarter as string)

    const check_existing_revenue = await findExistingRevenueRecord({ company_row_id, year, quarter, excludeRevenueRowId: revenue_row_id })
    if (check_existing_revenue) {
      errObj['quarter'] = 'Sorry, This revenue details already exists.'
    }

    if (quarter !== 5) {
      const check_yearly_revenue = await findExistingYearlyRevenueRecord({ company_row_id, year, excludeRevenueRowId: revenue_row_id })
      if (check_yearly_revenue) {
        errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
      }
    }

    if (quarter == 5) {
      const check_quartely_revenue = await findExistingQuarterlyRevenueRecord({ company_row_id, year, excludeRevenueRowId: revenue_row_id })
      if (check_quartely_revenue) {
        errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const insert_object: { year: number; quarter: number; revenue: number; revenue_streams: { category_row_id: number; stream_amount: number }[]; updated_date_n_time: string; company_row_id?: number } = {
    year,
    quarter,
    revenue: Number.parseFloat(body.revenue as string),
    revenue_streams,
    updated_date_n_time: getPresentDateTime()
  }

  if (!revenue_row_id) {
    insert_object.company_row_id = company_row_id
    await insertRevenueRecord({ ...insert_object, company_row_id })
    await invalidateCompanyRevenueCaches()
    await calculateCompanyProfileScore(company_row_id, ['revenue'])
    return {
      status: true,
      message: { alert_message: "Your company's revenue details have been saved successfully. Thank you for keeping your financial information current!" },
      insert_object
    }
  }

  await updateRevenueRecord({ _id: revenue_row_id, company_row_id }, insert_object)
  await invalidateCompanyRevenueCaches()
  return {
    status: true,
    message: { alert_message: "Your company's revenue details have been updated successfully. Thank you for keeping your financial information current!" },
    insert_object
  }
}

export interface DeleteRevenueParams {
  user_row_id: number
  user_type: number
  revenue_row_id_raw: string
  /** Only present when user_type === 2 (admin/subadmin caller). */
  admin_actor?: AdminActor
}

/**
 * Ports controllers/app/company/revenue.js's GET /delete_revenue/:revenue_row_id
 * (lines 553-617).
 *
 * OWNERSHIP CHECK UPGRADE: same reasoning as saveOrUpdateRevenue above — real
 * source called checkCompanyRowID({ company_row_id: '', user_row_id }) (resolve
 * the caller's OWN company by user_row_id, no company_row_id given), replaced
 * with checkCompanyOwnership({ user_row_id }), which additionally gates on
 * active_status/approval_status.
 */
export async function deleteRevenueDetails({ user_row_id, user_type, revenue_row_id_raw, admin_actor }: DeleteRevenueParams): Promise<{ status: boolean; message: RevenueResultMessage }> {
  const errObj: Record<string, string> = {}

  let revenue_row_id = 0
  if (!Number.isNaN(Number.parseInt(revenue_row_id_raw))) {
    revenue_row_id = Number.parseInt(revenue_row_id_raw)
  } else {
    errObj['revenue_row_id'] = 'The revenue row id field must be contain valid number.'
  }

  let companyRowId: number | undefined
  if (user_type == 1) {
    const check_company = await checkCompanyOwnership({ user_row_id })
    if (!check_company.status) {
      errObj['alert_message'] = (check_company.message as RevenueResultMessage).alert_message as string
    } else {
      companyRowId = (check_company.message as { company_row_id: number }).company_row_id
    }
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const checkCompanyData = await findRevenueForDeletion({ revenueRowId: revenue_row_id, companyRowId })
  if (!checkCompanyData) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Revenue Row ID' } }
  }

  // ADMIN AUTHZ FIX: same reasoning as saveOrUpdateRevenue above — this route's admin fallback
  // only confirms generic "revenue" permission, not per-company assignment. Validate against the
  // record's OWN company (now known from the lookup above) before allowing the delete, matching
  // deleteRevenueDetailsAdmin's scoping.
  if (user_type === 2) {
    if (!admin_actor) {
      return { status: false, message: { alert_message: 'Sorry, You are not authorized to perform this action.' } }
    }
    const check_access = await checkCompanySubadminAccess(subadminAccessParams(admin_actor, checkCompanyData.company_row_id))
    if (!check_access.status) {
      return { status: false, message: { alert_message: check_access.message } }
    }
  }

  await deleteCompanyRevenue({ type: 1, revenue_row_id })
  await invalidateCompanyRevenueCaches()
  await calculateCompanyProfileScore(checkCompanyData?.company_row_id, ['revenue'])

  return { status: true, message: { alert_message: 'The revenue details have been successfully deleted. Thank you for your action!' } }
}

// ---------------------------------------------------------------------------
// Admin CRUD (Part 3 §7 Phase D step 3) — ports controllers/admin_panel/app/
// company.js's save_revenue_details through revenue_bulk_data (lines 4837-5288).
// ---------------------------------------------------------------------------

const sanitize = require('mongo-sanitize')
const { checkCompanySubadminAccess, getPresentYearOnly } = require('../../../utils/helpers/helper')

export interface AdminActor {
  admin_row_id: string | number
  admin_manager_type: string | number
  sub_admin_type: string | number
}

function subadminAccessParams(actor: AdminActor, company_row_id: number) {
  return {
    admin_row_id: Number.parseInt(actor.admin_row_id as string),
    admin_manager_type: actor.admin_manager_type,
    sub_admin_type: Number.parseInt(actor.sub_admin_type as string),
    company_row_id
  }
}

export interface AdminRevenueBody {
  year?: string | number
  quarter?: string | number
  revenue?: string | number
  company_row_id?: string | number
  revenue_streams?: RevenueStreamInput[]
}

export interface SaveRevenueDetailsAdminParams {
  actor: AdminActor
  company_row_id_raw: string
  body: AdminRevenueBody
  preValidationErrors: Record<string, string>
}

/**
 * Ports controllers/admin_panel/app/company.js's POST
 * /save_revenue_details/:company_row_id (lines 4837-4931). Unlike the app-side
 * saveOrUpdateRevenue above, admin always inserts (this route has no
 * revenue_row_id / update path — that's update_revenue_details's job below),
 * and the ownership check is checkCompanySubadminAccess (an admin-role check),
 * not checkCompanyOwnership (an app-user-owns-this-company check) — these are
 * genuinely different checks for genuinely different actors, not a duplicate
 * to unify.
 */
export async function saveRevenueDetailsAdmin({ actor, company_row_id_raw, body, preValidationErrors }: SaveRevenueDetailsAdminParams): Promise<{ status: boolean; message: RevenueResultMessage }> {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let company_row_id = Number.parseInt(company_row_id_raw)
  let year = 0
  let quarter = 0

  if (Number.isNaN(Number.parseInt(company_row_id_raw))) {
    errObj['company_row_id'] = 'Company Row Id should be an integer'
  } else {
    const companyQuery = await findActiveCompanyById(company_row_id)
    if (companyQuery) {
      company_row_id = companyQuery._id
      const check_access = await checkCompanySubadminAccess(subadminAccessParams(actor, Number.parseInt(company_row_id_raw)))
      if (!check_access.status) {
        errObj['alert_message'] = check_access.message
      }
    } else {
      errObj['company_row_id'] = 'Invalid Company Row Id'
    }

    if (body.year && body.quarter) {
      year = Number.parseInt(body.year as string)
      quarter = Number.parseInt(body.quarter as string)

      const check_existing_revenue = await findExistingRevenueRecord({ company_row_id, year, quarter })
      if (check_existing_revenue) {
        errObj['quarter'] = 'Sorry, This revenue details already exists.'
      }
      if (quarter !== 5) {
        const check_yearly_revenue = await findExistingYearlyRevenueRecord({ company_row_id, year })
        if (check_yearly_revenue) {
          errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
        }
      }
      if (quarter == 5) {
        const check_quartely_revenue = await findExistingQuarterlyRevenueRecord({ company_row_id, year })
        if (check_quartely_revenue) {
          errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
        }
      }
    }
  }

  const revenue_streams = buildRevenueStreamsFromBody(body.revenue_streams, errObj)

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  await insertRevenueRecord({ year, quarter, revenue: Number.parseInt(body.revenue as string), company_row_id, revenue_streams })
  await invalidateCompanyRevenueCaches()
  return { status: true, message: { alert_message: 'Your company revenue details saved successfully.' } }
}

export interface UpdateRevenueDetailsAdminParams {
  actor: AdminActor
  request_row_id_raw: string
  body: AdminRevenueBody
  preValidationErrors: Record<string, string>
}

/**
 * Ports controllers/admin_panel/app/company.js's POST
 * /update_revenue_details/:request_row_id (lines 4999-5107).
 */
export async function updateRevenueDetailsAdmin({ actor, request_row_id_raw, body, preValidationErrors }: UpdateRevenueDetailsAdminParams): Promise<{ status: boolean; message: RevenueResultMessage }> {
  const errObj: Record<string, string> = { ...preValidationErrors }

  const check_access = await checkCompanySubadminAccess(subadminAccessParams(actor, Number.parseInt(body.company_row_id as string)))
  if (!check_access.status) {
    errObj['alert_message'] = check_access.message
  }

  let revenue_row_id = 0
  if (!Number.isNaN(Number.parseInt(request_row_id_raw))) {
    revenue_row_id = Number.parseInt(request_row_id_raw)
    const checkCompanyData = await findRevenueById(revenue_row_id)
    if (!checkCompanyData) {
      errObj['revenue_row_id'] = 'Invalid revenue Row Id'
    }
  } else {
    errObj['revenue_row_id'] = 'Invalid revenue Row Id'
  }

  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(body.company_row_id as string))) {
    company_row_id = Number.parseInt(body.company_row_id as string)
  }

  let year = 0
  let quarter = 0

  const companyQuery = await findActiveCompanyById(company_row_id)
  if (!companyQuery) {
    errObj['company_row_id'] = 'Invalid Company Row Id'
  } else {
    company_row_id = companyQuery._id

    if (body.year && body.quarter) {
      year = Number.parseInt(body.year as string)
      quarter = Number.parseInt(body.quarter as string)

      const check_existing_revenue = await findExistingRevenueRecord({ company_row_id, year, quarter, excludeRevenueRowId: revenue_row_id })
      if (check_existing_revenue) {
        errObj['quarter'] = 'Sorry, This revenue details already exists.'
      }
      if (quarter !== 5) {
        const check_yearly_revenue = await findExistingYearlyRevenueRecord({ company_row_id, year, excludeRevenueRowId: revenue_row_id })
        if (check_yearly_revenue) {
          errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
        }
      }
      if (quarter == 5) {
        const check_quartely_revenue = await findExistingQuarterlyRevenueRecord({ company_row_id, year, excludeRevenueRowId: revenue_row_id })
        if (check_quartely_revenue) {
          errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
        }
      }
    }
  }

  const revenue_streams = buildRevenueStreamsFromBody(body.revenue_streams, errObj)

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  await updateRevenueRecord({ _id: revenue_row_id }, { year, quarter, revenue: Number.parseInt(body.revenue as string), revenue_streams })
  await invalidateCompanyRevenueCaches()
  return { status: true, message: { alert_message: 'Your company revenue details updated successfully.' } }
}

/**
 * Ports controllers/admin_panel/app/company.js's GET
 * /revenue_delete/:request_row_id (lines 5109-5150).
 */
export async function deleteRevenueDetailsAdmin({ actor, revenue_row_id_raw }: { actor: AdminActor; revenue_row_id_raw: string }): Promise<{ status: boolean; message: RevenueResultMessage }> {
  const revenue_row_id = Number.parseInt(revenue_row_id_raw)
  if (Number.isNaN(revenue_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Revenue row id' } }
  }

  const checkCompanyData = await findRevenueById(revenue_row_id)
  if (!checkCompanyData) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row ID' } }
  }

  const check_access = await checkCompanySubadminAccess(subadminAccessParams(actor, checkCompanyData.company_row_id))
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  await deleteCompanyRevenue({ type: 1, revenue_row_id })
  await invalidateCompanyRevenueCaches()
  return { status: true, message: { alert_message: 'This revenue details has been deleted successfully.' } }
}

/**
 * Ports controllers/admin_panel/app/company.js's POST /revenue_bulk_data
 * (lines 5154-5288) — bulk-imports a company's revenue history.
 *
 * PRESERVED, NOT FIXED (flagged, out of Phase D step 3's scope — this step is
 * an extraction, not a bug-fix pass): two real bugs in the source, kept
 * byte-for-byte:
 *  (1) The array check reads `else if (Array.isArray(body.bulk_data))` where
 *      it should almost certainly be the negation — as written, the "must be
 *      an array" error fires when bulk_data genuinely IS an array, and a
 *      non-array value silently falls through instead of being rejected
 *      (bulk_data[0] on a non-array is undefined, so the insert loop below
 *      just never runs — no error surfaces at all).
 *  (2) The duplicate-year/quarter error inside the loop is written to a
 *      misspelled key that is never surfaced as the conventional alert field
 *      elsewhere in this codebase — a caller wouldn't see this specific
 *      validation message even though the request still gets rejected via
 *      other errObj keys as usual.
 * Neither is touched here; both are called out for a future confirmed-bug-fix
 * pass, same convention as every other "preserved, not fixed" note in this
 * codebase.
 *
 * PRESERVED, NOT FIXED (found while fixing this function's TS errors, out of
 * scope for that pass): a third bug, more severe than the two above — the
 * quarter_of_the_year range check below compares the YEAR value against the
 * valid quarter range (1-4) instead of the quarter value itself. Since the
 * year is already validated >= 1900 by the time this check runs, the
 * condition is unsatisfiable — EVERY bulk-upload row fails at this step
 * unconditionally, regardless of its actual quarter value, making this
 * endpoint's happy path entirely unreachable as currently written. Kept
 * byte-for-byte pending its own confirmed-fix pass, same as the two bugs
 * above.
 */
export interface BulkUploadRow {
  revenue_year?: string | number
  quarter_of_the_year?: string | number
  revenue_in_usd?: string | number
}

export interface BulkUploadBody {
  company_row_id?: string | number
  bulk_data?: unknown
}

export async function bulkUploadRevenueAdmin(body: BulkUploadBody): Promise<{ status: boolean; message: RevenueResultMessage }> {
  const persent_year = getPresentYearOnly()
  const errObj: Record<string, string> = {}

  let company_row_id = 0
  if (!body.company_row_id) {
    errObj['company_row_id'] = 'The company row id field is required.'
  } else if (Number.isNaN(Number.parseInt(body.company_row_id as string))) {
    errObj['company_row_id'] = 'The company row id field should contain valid company id.'
  } else {
    company_row_id = Number.parseInt(sanitize(body.company_row_id))
    const check_company_query = await findActiveCompanyById(company_row_id)
    if (!check_company_query) {
      errObj['company_row_id'] = 'Invalid company row id.'
    }
  }

  const inserted_array: { company_row_id: number; revenue_year: number | string; quarter_of_the_year: number | string; revenue_in_usd: number | string }[] = []
  if (!body.bulk_data) {
    errObj['bulk_data'] = 'The bulk data field is required'
  } else if (Array.isArray(body.bulk_data)) {
    errObj['bulk_data'] = 'The bulk data field must be an array.'
  } else {
    const bulk_data = body.bulk_data as BulkUploadRow[]
    if (bulk_data[0] && bulk_data[0].revenue_year && bulk_data[0].quarter_of_the_year && bulk_data[0].revenue_in_usd) {
      for (const run of bulk_data) {
        let revenue_year: number | string = ''
        let quarter_of_the_year: number | string = ''
        let revenue_in_usd: number | string = ''

        if (run.revenue_year) {
          const revenue_year_num = Number.parseInt(run.revenue_year as string)
          if (Number.isNaN(revenue_year_num)) {
            errObj['revenue_year'] = 'The revenue year field must be contain valid number.'
            break
          } else if (!(revenue_year_num >= 1900 && revenue_year_num <= persent_year)) {
            errObj['revenue_year'] = 'The revenue year field must be contain valid year.'
            break
          } else {
            revenue_year = sanitize(run.revenue_year)
          }
        } else {
          errObj['revenue_year'] = 'The revenue year field is required.'
          break
        }

        if (run.quarter_of_the_year) {
          const revenue_year_num = Number.parseInt(run.revenue_year as string)
          if (Number.isNaN(Number.parseInt(run.quarter_of_the_year as string))) {
            errObj['quarter_of_the_year'] = 'The quarter of the year field must be contain valid number.'
            break
          } else if (!(revenue_year_num >= 1 && revenue_year_num <= 4)) {
            errObj['quarter_of_the_year'] = 'The quarter of the year field must be contain number from 1 to 4.'
            break
          } else {
            quarter_of_the_year = Number.parseInt(sanitize(run.quarter_of_the_year))
          }
        } else {
          errObj['quarter_of_the_year'] = 'The revenue year field is required.'
          break
        }

        if (run.revenue_in_usd) {
          const revenue_in_usd_num = Number.parseFloat(run.revenue_in_usd as string)
          if (Number.isNaN(revenue_in_usd_num)) {
            errObj['revenue_in_usd'] = 'The revenue in usd field must be contain valid number.'
            break
          } else if (revenue_in_usd_num <= 0) {
            errObj['revenue_in_usd'] = 'The quarter of the year field must be value greater than zero.'
            break
          } else {
            revenue_in_usd = revenue_in_usd_num
          }
        } else {
          errObj['revenue_in_usd'] = 'The revenue in usd field is required.'
          break
        }

        const check_query = await findDuplicateBulkRevenueRecord({ company_row_id, revenue_year: revenue_year as number, quarter_of_the_year: quarter_of_the_year as number })
        if (check_query) {
          errObj['alret_message'] = `The revenue year ${revenue_year} and quarter of the year ${quarter_of_the_year} is already exist.`
        }

        inserted_array.push({ company_row_id, revenue_year, quarter_of_the_year, revenue_in_usd })
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  for (const run of inserted_array) {
    await insertBulkRevenueRow(run)
  }
  if (inserted_array.length) {
    await invalidateCompanyRevenueCaches()
  }

  return { status: true, message: { alert_message: 'This company revenue details has been updated successfully.' } }
}

/**
 * Ports company.js's company_individual_overview's total_revenue/last_year_revenue stats
 * (Part 3 §7 Phase H step 5) — delegated here from modules/company_admin/. Preserves the real
 * source's exact (asymmetric) presence rules: a key is included only when its aggregate produced
 * a row AND that row's total is truthy. `last_year_revenue` uses the CONFIRMED BUG FIX described
 * on buildCompanyLastYearRevenuePipeline (a real $sort, unlike the legacy unsorted $limit:1).
 */
export async function getCompanyRevenueSummary(companyRowId: number): Promise<{ total_revenue?: number; last_year_revenue?: number }> {
  const [totalRows, lastYearRows] = await fetchCompanyRevenueSummaryRows(companyRowId)

  const result: { total_revenue?: number; last_year_revenue?: number } = {}
  if (totalRows[0]?.total) {
    result.total_revenue = totalRows[0].total
  }
  if (lastYearRows[0]?.total) {
    result.last_year_revenue = lastYearRows[0].total
  }
  return result
}
