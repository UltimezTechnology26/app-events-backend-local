// modules/company_holdings/company_holdings.service.ts
import { checkCompanyOwnership } from '../common/common.ownership'
import { invalidateCompanyHoldingsCaches } from './company_holdings.cache'
import {
  findActiveCompanyById,
  findManualCompanyById,
  findTokenById,
  findSearchContractAddressById,
  findHoldingByIdAndCompany,
  findHoldingById,
  findTokenOwnedByUser,
  updateHoldingById,
  createHolding,
  deleteHoldingById,
  HoldingUpdateFields
} from './company_holdings.queries'

const { calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

export interface HoldingActor {
  user_type: number
  user_row_id: number
}

export interface SaveOrUpdateHoldingBody {
  company_type?: string | number
  submitted_from_type?: string | number
  company_row_id?: string | number
  token_type?: string | number
  token_row_id?: string | number
  holding_row_id?: string | number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
}

export interface SaveOrUpdateHoldingParams {
  actor: HoldingActor
  body: SaveOrUpdateHoldingBody
  preValidationErrors: Record<string, string>
}

export interface HoldingResultMessage {
  alert_message?: string
  [key: string]: string | undefined
}

/**
 * Ports controllers/app/company/products_n_holding/company_holding.js's POST
 * /update_n_save_details (lines 18-211).
 *
 * OWNERSHIP CHECK UPGRADE (same reasoning as modules/company_products/'s Phase E upgrade):
 * checkCompanyRowID replaced with common.ownership.ts's checkCompanyOwnership for the
 * app-user path (submitted_from_type !== 2).
 *
 * CONFIRMED FIX (Part 1 §3): the profile-score recompute block is replaced with the existing
 * calculateCompanyProfileScore(['holding_crypto']) helper — same computation
 * (`company_holdingM.exists({company_row_id}) ? 5 : 0`), now shared instead of re-typed.
 *
 * PRESERVED, NOT FIXED (flagged): the real source captures `company_holdings_list_*`'s
 * deleteKeysByPattern() RESULT and leaks it as a top-level `deleteKey` response field (on both
 * the insert and update branches) — an internal cache-clearing detail exposed to the client.
 * Kept exactly; not something this port cleans up.
 */
export async function saveOrUpdateHolding({ actor, body, preValidationErrors }: SaveOrUpdateHoldingParams): Promise<{ status: boolean; message: HoldingResultMessage; deleteKey?: unknown }> {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let company_type = 0
  if (!Number.isNaN(Number.parseInt(body.company_type as string))) company_type = Number.parseInt(body.company_type as string)

  let submitted_from_type = 1
  if (!Number.isNaN(Number.parseInt(body.submitted_from_type as string))) submitted_from_type = Number.parseInt(body.submitted_from_type as string)

  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(body.company_row_id as string))) company_row_id = Number.parseInt(body.company_row_id as string)

  let holding_row_id = 0
  if (submitted_from_type === 2) {
    if (company_type === 1) {
      const check_company_query = await findActiveCompanyById(company_row_id)
      if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
    } else {
      const check_company_query = await findManualCompanyById(company_row_id)
      if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
    }
  } else if (actor.user_type == 1) {
    const check_company = await checkCompanyOwnership({ company_row_id, user_row_id: actor.user_row_id })
    if (!check_company.status) errObj['company_row_id'] = (check_company.message as HoldingResultMessage).alert_message as string
  }

  const token_type = Number.parseInt(body.token_type as string)
  const token_row_id = Number.parseInt(body.token_row_id as string)
  if (!Number.isNaN(token_row_id)) {
    if (token_type === 1) {
      const check_token_query = await findTokenById(token_row_id)
      if (!check_token_query) errObj['alert_message'] = 'Sorry, Invalid token row id'
    } else if (token_type === 2) {
      const check_token_query = await findSearchContractAddressById(token_row_id)
      if (!check_token_query) errObj['alert_message'] = 'Sorry, Invalid token row id'
    }

    if (body.holding_row_id) {
      if (!Number.isNaN(Number.parseInt(body.holding_row_id as string))) {
        const check_valid_query = await findHoldingByIdAndCompany(Number.parseInt(body.holding_row_id as string), company_row_id)
        if (check_valid_query) {
          holding_row_id = Number.parseInt(body.holding_row_id as string)
        } else {
          errObj['alert_message'] = 'Sorry, Invalid Holding Row ID.'
        }
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_object: HoldingUpdateFields = { company_type, company_row_id, token_row_id, token_type }
  if (body.purchased_date) update_object.purchased_date = body.purchased_date
  update_object.purchased_value = body.purchased_value
  update_object.purchased_value_in_usd = body.purchased_value_in_usd

  if (holding_row_id) {
    await updateHoldingById(holding_row_id, update_object)
    const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_company_list_*')
    return { status: true, message: { alert_message: 'This company holding details has been updated successfully.' }, deleteKey }
  }

  await createHolding({ ...update_object, date_n_time: getPresentDateTime() })

  await calculateCompanyProfileScore(company_row_id, ['holding_crypto'])

  const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
  await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('app_company_list_*')

  return { status: true, message: { alert_message: 'New company holding details has been listed successfully.' }, deleteKey }
}

export interface DeleteHoldingParams {
  actor: HoldingActor
  holding_row_id_raw: string
}

/**
 * Ports controllers/app/company/products_n_holding/company_holding.js's GET
 * /delete_holding/:holding_row_id (lines 392-515).
 */
export async function deleteHolding({ actor, holding_row_id_raw }: DeleteHoldingParams): Promise<{ status: boolean; message: HoldingResultMessage }> {
  const errObj: Record<string, string> = {}
  let holding_row_id = 0

  if (Number.isNaN(Number.parseInt(holding_row_id_raw))) {
    errObj['holding_row_id'] = 'The holding row id field must be contain valid number.'
  } else {
    holding_row_id = Number.parseInt(holding_row_id_raw)
    const check_query = await findHoldingById(holding_row_id)
    if (!check_query) {
      errObj['holding_row_id'] = 'Invalid holding row id.'
    } else {
      const { company_row_id, company_type, token_type, token_row_id } = check_query

      if (actor.user_type == 1) {
        let validation_status = false
        if (company_row_id && company_type == 1) {
          const check_event_res = await checkCompanyOwnership({ company_row_id, user_row_id: actor.user_row_id })
          if (check_event_res.status) validation_status = true
        }
        if (token_row_id && token_type == 1) {
          const check_token_query = await findTokenOwnedByUser({ token_row_id, user_row_id: actor.user_row_id })
          if (check_token_query) validation_status = true
        }
        if (!validation_status) errObj['holding_row_id'] = 'Invalid user access.'
      }
    }
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const check_query = await findHoldingById(holding_row_id)
  await deleteHoldingById(holding_row_id)
  await invalidateCompanyHoldingsCaches()

  await calculateCompanyProfileScore(check_query?.company_row_id, ['holding_crypto'])

  return { status: true, message: { alert_message: 'This Company Holding details for this company have been deleted successfully.' } }
}
