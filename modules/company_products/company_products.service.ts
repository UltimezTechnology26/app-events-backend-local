// modules/company_products/company_products.service.ts
import { checkCompanyOwnership } from '../common/common.ownership'
import { invalidateCompanyProductsCaches } from './company_products.cache'

const { calculateCompanyProfileScore } = require('../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../utils/helpers/helper')

export interface ProductActor {
  user_type: number
  user_row_id: number
}

export interface SaveOrUpdateProductParams {
  actor: ProductActor
  body: any
  preValidationErrors: Record<string, string>
}

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's POST
 * /update_n_save_details (lines 35-279).
 *
 * OWNERSHIP CHECK UPGRADE (same reasoning as modules/company_revenue/'s Phase D upgrade):
 * checkCompanyRowID (no active_status/approval_status gate) replaced with
 * common.ownership.ts's checkCompanyOwnership for the app-user ownership path
 * (submitted_from_type !== 2). The admin/manual path (submitted_from_type === 2) is
 * unchanged — it never used checkCompanyRowID, it looks up companyM/company_manual_retrievalsM
 * directly.
 *
 * CONFIRMED FIX (Part 1 §3 finding 5): the 4x-duplicated profile-score recompute block is
 * replaced with the existing calculateCompanyProfileScore(['owned_product']) helper — same
 * computation (`company_productsM.exists({company_row_id}) ? 10 : 0`), now shared instead of
 * re-typed. `products`/`owned_product_score` are still computed locally afterward purely to
 * preserve the real response shape (`message.products`, `message.owning_product_score`) — the
 * shared helper itself only writes to the DB, it doesn't return these values.
 */
export async function saveOrUpdateProduct({ actor, body, preValidationErrors }: SaveOrUpdateProductParams): Promise<{ status: boolean; message: any }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const companyM = require('../../models/app/company/companyM')
  const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
  const tokensM = require('../../models/markets/tokensM')
  const search_contract_addressM = require('../../models/markets/search_contract_addressM')
  const chainsM = require('../../models/markets/chainsM')
  const chains_manualsM = require('../../models/markets/chains_manualsM')
  const exchangeM = require('../../models/markets/exchangeM')
  const exchange_manualsM = require('../../models/markets/exchange_manualsM')

  const errObj: Record<string, string> = { ...preValidationErrors }

  let submitted_from_type = 1
  if (!Number.isNaN(Number.parseInt(body.submitted_from_type))) submitted_from_type = Number.parseInt(body.submitted_from_type)

  let company_type = 0
  if (!Number.isNaN(Number.parseInt(body.company_type))) company_type = Number.parseInt(body.company_type)

  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(body.company_row_id))) company_row_id = Number.parseInt(body.company_row_id)

  let edit_product_row_id = 0
  let user_row_id = 0
  const register_type = Number.parseInt(body.register_type)
  const product_row_id = Number.parseInt(body.product_row_id)
  const product_type = Number.parseInt(body.product_type)

  // PERF FIX: these 3 validation checks are independent of each other (each writes its
  // own distinct errObj key — 'alert_message', 'company_row_id', 'product_row_id' — so
  // concurrent writes can't collide) but previously ran as 3 sequential awaits. Batched
  // into one Promise.all; same validations, same error messages, same final errObj.
  await Promise.all([
    (async () => {
      if (body.edit_product_row_id && !Number.isNaN(Number.parseInt(body.edit_product_row_id))) {
        const check_valid_query = await company_productsM.findOne({ _id: Number.parseInt(body.edit_product_row_id), company_row_id })
        if (check_valid_query) {
          edit_product_row_id = Number.parseInt(body.edit_product_row_id)
        } else {
          errObj['alert_message'] = 'Sorry, Invalid Edit Product Row ID.'
        }
      }
    })(),
    (async () => {
      if (submitted_from_type === 2) {
        if (company_type === 1) {
          const check_company_query = await companyM.findOne({ _id: company_row_id, active_status: 1 })
          if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
        } else {
          const check_company_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
          if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
        }
      } else if (actor.user_type == 1) {
        user_row_id = actor.user_row_id
        const check_company = await checkCompanyOwnership({ company_row_id, user_row_id })
        if (!check_company.status) errObj['company_row_id'] = (check_company.message as any).alert_message
      }
    })(),
    (async () => {
      if (product_type == 1) {
        if (register_type == 1) {
          const user_reg_query = await tokensM.findOne({ _id: product_row_id, active_status: 1 })
          if (!user_reg_query) errObj['product_row_id'] = 'Sorry, Invalid product row id'
        } else if (register_type == 2) {
          const user_manual_query = await search_contract_addressM.findOne({ _id: product_row_id }, { _id: 1 })
          if (!user_manual_query) errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
        }
      } else if (product_type == 2) {
        if (register_type == 1) {
          const company_reg_query = await chainsM.findOne({ _id: product_row_id, status: 1 }, { _id: 1, user_row_id: 1 })
          if (!company_reg_query) errObj['product_row_id'] = 'Sorry, Invalid product row id'
        } else {
          const company_manual_query = await chains_manualsM.findOne({ _id: product_row_id }, { _id: 1 })
          if (!company_manual_query) errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
        }
      } else if (product_type == 3) {
        if (register_type == 1) {
          const user_reg_query = await exchangeM.findOne({ _id: product_row_id, status: 1 })
          if (!user_reg_query) errObj['product_row_id'] = 'Sorry, Invalid product row id'
        } else if (register_type == 2) {
          const user_manual_query = await exchange_manualsM.findOne({ _id: product_row_id }, { _id: 1 })
          if (!user_manual_query) errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
        }
      }
    })()
  ])

  if (register_type && product_row_id && product_type) {
    const check_product_query = await company_productsM.findOne({
      company_type, company_row_id, register_type, product_row_id, product_type,
      _id: { $ne: edit_product_row_id }
    })
    if (check_product_query) errObj['alert_message'] = 'Sorry, This type of product is already exists.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_object: any = { company_type, company_row_id, register_type, product_row_id, product_type }

  if (edit_product_row_id) {
    await company_productsM.updateOne({ _id: edit_product_row_id }, { $set: update_object })
    await invalidateCompanyProductsCaches()
    return { status: true, message: { alert_message: 'This company product details has been updated successfully.' } }
  }

  update_object.date_n_time = getPresentDateTime()
  await new company_productsM(update_object).save()

  await calculateCompanyProfileScore(company_row_id, ['owned_product'])
  const products = await company_productsM.exists({ company_row_id })
  const owned_product_score = products ? 10 : 0

  if (product_type == 2) {
    await chainsM.updateOne({ _id: product_row_id }, { $set: { owning_companies_score: 15 } })
  } else if (product_type == 3) {
    await exchangeM.updateOne({ _id: product_row_id }, { $set: { owning_companies_score: 15 } })
  }

  await invalidateCompanyProductsCaches()
  return {
    status: true,
    message: { alert_message: 'New company product details has been listed successfully.', products, owned_product_score }
  }
}

export interface DeleteProductParams {
  actor: ProductActor
  edit_product_row_id_raw: string
}

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /delete_product/:edit_product_row_id (lines 640-798).
 *
 * PRESERVED, NOT FIXED (flagged): the real source's "invalid access" error is written to
 * `errObj['holding_row_id']` — a copy-pasted key from company_holding.js's own delete route,
 * never renamed for products. Kept exactly; a caller looking for a product-specific field name
 * here wouldn't find one, same as the real behavior today.
 */
export async function deleteProduct({ actor, edit_product_row_id_raw }: DeleteProductParams): Promise<{ status: boolean; message: any }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const tokensM = require('../../models/markets/tokensM')
  const chainsM = require('../../models/markets/chainsM')
  const exchangeM = require('../../models/markets/exchangeM')

  const errObj: Record<string, string> = {}
  let user_row_id = 0
  let edit_product_row_id = 0

  if (actor.user_type == 1) user_row_id = actor.user_row_id

  if (Number.isNaN(Number.parseInt(edit_product_row_id_raw))) {
    errObj['edit_product_row_id'] = 'The own company product row id field must be contain valid number.'
  } else {
    edit_product_row_id = Number.parseInt(edit_product_row_id_raw)
    const check_query = await company_productsM.findOne({ _id: edit_product_row_id })

    if (!check_query) {
      errObj['edit_product_row_id'] = 'Invalid  own company product row id.'
    } else {
      const { product_row_id, company_row_id, company_type, product_type, register_type } = check_query

      if (user_row_id) {
        let validation_status = false
        if (company_row_id && company_type == 1) {
          const check_event_res = await checkCompanyOwnership({ company_row_id, user_row_id })
          if (check_event_res.status) validation_status = true
        }

        if (register_type === 1) {
          if (product_row_id && product_type == 1) {
            const check_token_query = await tokensM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
            if (check_token_query) validation_status = true
          }
          if (product_row_id && product_type == 2) {
            const check_token_query = await chainsM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
            if (check_token_query) validation_status = true
          }
          if (product_row_id && product_type == 3) {
            const check_token_query = await exchangeM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
            if (check_token_query) validation_status = true
          }
        }

        if (!validation_status) errObj['holding_row_id'] = 'Invalid user access.'
      }
    }
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const check_query = await company_productsM.findOne({ _id: edit_product_row_id })
  await company_productsM.deleteOne({ _id: edit_product_row_id })
  await invalidateCompanyProductsCaches()

  await calculateCompanyProfileScore(check_query?.company_row_id, ['owned_product'])

  if (check_query?.product_type == 2) {
    await chainsM.updateOne({ _id: check_query.product_row_id }, { $set: { owning_companies_score: 0 } })
  } else if (check_query?.product_type == 3) {
    await exchangeM.updateOne({ _id: check_query.product_row_id }, { $set: { owning_companies_score: 0 } })
  }

  return { status: true, message: { alert_message: 'This own company details for this company have been deleted successfully.' } }
}
