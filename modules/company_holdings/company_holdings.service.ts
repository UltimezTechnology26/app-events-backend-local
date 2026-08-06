// modules/company_holdings/company_holdings.service.ts
import { checkCompanyOwnership } from '../common/common.ownership'
import { invalidateCompanyHoldingsCaches } from './company_holdings.cache'

const { calculateCompanyProfileScore } = require('../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../utils/helpers/helper')
const { deleteKeysByPattern } = require('../../config/cache_helper')

export interface HoldingActor {
  user_type: number
  user_row_id: number
}

export interface SaveOrUpdateHoldingParams {
  actor: HoldingActor
  body: any
  preValidationErrors: Record<string, string>
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
export async function saveOrUpdateHolding({ actor, body, preValidationErrors }: SaveOrUpdateHoldingParams): Promise<{ status: boolean; message: any; deleteKey?: any }> {
  const company_holdingM = require('../../models/markets/products_n_holding/company_holdingM')
  const companyM = require('../../models/app/company/companyM')
  const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
  const tokensM = require('../../models/markets/tokensM')
  const search_contract_addressM = require('../../models/markets/search_contract_addressM')

  const errObj: Record<string, string> = { ...preValidationErrors }

  let company_type = 0
  if (!Number.isNaN(Number.parseInt(body.company_type))) company_type = Number.parseInt(body.company_type)

  let submitted_from_type = 1
  if (!Number.isNaN(Number.parseInt(body.submitted_from_type))) submitted_from_type = Number.parseInt(body.submitted_from_type)

  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(body.company_row_id))) company_row_id = Number.parseInt(body.company_row_id)

  let holding_row_id = 0
  if (submitted_from_type === 2) {
    if (company_type === 1) {
      const check_company_query = await companyM.findOne({ _id: company_row_id, active_status: 1 })
      if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
    } else {
      const check_company_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
      if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
    }
  } else if (actor.user_type == 1) {
    const check_company = await checkCompanyOwnership({ company_row_id, user_row_id: actor.user_row_id })
    if (!check_company.status) errObj['company_row_id'] = (check_company.message as any).alert_message
  }

  const token_type = Number.parseInt(body.token_type)
  const token_row_id = Number.parseInt(body.token_row_id)
  if (!Number.isNaN(token_row_id)) {
    const match_query = { _id: token_row_id }
    if (token_type === 1) {
      const check_token_query = await tokensM.findOne(match_query)
      if (!check_token_query) errObj['alert_message'] = 'Sorry, Invalid token row id'
    } else if (token_type === 2) {
      const check_token_query = await search_contract_addressM.findOne(match_query)
      if (!check_token_query) errObj['alert_message'] = 'Sorry, Invalid token row id'
    }

    if (body.holding_row_id) {
      if (!Number.isNaN(Number.parseInt(body.holding_row_id))) {
        const check_valid_query = await company_holdingM.findOne({ _id: Number.parseInt(body.holding_row_id), company_row_id })
        if (check_valid_query) {
          holding_row_id = Number.parseInt(body.holding_row_id)
        } else {
          errObj['alert_message'] = 'Sorry, Invalid Holding Row ID.'
        }
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_object: any = { company_type, company_row_id, token_row_id, token_type }
  if (body.purchased_date) update_object.purchased_date = body.purchased_date
  update_object.purchased_value = body.purchased_value
  update_object.purchased_value_in_usd = body.purchased_value_in_usd

  if (holding_row_id) {
    await company_holdingM.updateOne({ _id: holding_row_id }, { $set: update_object })
    const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_company_list_*')
    return { status: true, message: { alert_message: 'This company holding details has been updated successfully.' }, deleteKey }
  }

  update_object.date_n_time = getPresentDateTime()
  await new company_holdingM(update_object).save()

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
export async function deleteHolding({ actor, holding_row_id_raw }: DeleteHoldingParams): Promise<{ status: boolean; message: any }> {
  const company_holdingM = require('../../models/markets/products_n_holding/company_holdingM')
  const tokensM = require('../../models/markets/tokensM')

  const errObj: Record<string, string> = {}
  let holding_row_id = 0

  if (Number.isNaN(Number.parseInt(holding_row_id_raw))) {
    errObj['holding_row_id'] = 'The holding row id field must be contain valid number.'
  } else {
    holding_row_id = Number.parseInt(holding_row_id_raw)
    const check_query = await company_holdingM.findOne({ _id: holding_row_id })
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
          const check_token_query = await tokensM.findOne({ _id: token_row_id, user_row_id: actor.user_row_id }, { _id: 1 })
          if (check_token_query) validation_status = true
        }
        if (!validation_status) errObj['holding_row_id'] = 'Invalid user access.'
      }
    }
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const check_query = await company_holdingM.findOne({ _id: holding_row_id })
  await company_holdingM.deleteOne({ _id: holding_row_id })
  await invalidateCompanyHoldingsCaches()

  await calculateCompanyProfileScore(check_query?.company_row_id, ['holding_crypto'])

  return { status: true, message: { alert_message: 'This Company Holding details for this company have been deleted successfully.' } }
}
