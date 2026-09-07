// modules/company_products/company_products.service.ts
import { checkCompanyOwnership } from '../common/common.ownership'
import { invalidateCompanyProductsCaches } from './company_products.cache'
import {
  findActiveCompanyById,
  findManualCompanyById,
  findActiveTokenById,
  findSearchContractAddressById,
  findActiveChainById,
  findManualChainById,
  findActiveExchangeById,
  findManualExchangeById,
  findProductByIdAndCompany,
  findDuplicateProduct,
  updateProductById,
  createProduct,
  productExistsForCompany,
  setChainOwningCompaniesScore,
  setExchangeOwningCompaniesScore,
  findProductById,
  deleteProductById,
  findTokenOwnedByUser,
  findChainOwnedByUser,
  findExchangeOwnedByUser,
  findProductByIdAndCompanyLean,
  findProductByIdLean,
  ProductUpdateFields
} from './company_products.queries'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../common/change-request/change-request.child.service'
import { computeDiff } from '../../common/change-request/change-request.diff'
import { COMPANY_SECTION_REGISTRY, SECTION_OWNED_PRODUCTS } from '../../common/change-request/change-request.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import logger from '../../../config/logger'

const { calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface ProductActor {
  user_type: number
  user_row_id: number
}

export interface SaveOrUpdateProductBody {
  submitted_from_type?: string | number
  company_type?: string | number
  company_row_id?: string | number
  edit_product_row_id?: string | number
  register_type?: string | number
  product_row_id?: string | number
  product_type?: string | number
}

export interface SaveOrUpdateProductParams {
  actor: ProductActor
  body: SaveOrUpdateProductBody
  preValidationErrors: Record<string, string>
}

export interface ProductResultMessage {
  alert_message?: string
  products?: boolean
  owned_product_score?: number
  [key: string]: string | boolean | number | undefined
}

const USER_TYPE_COMPANY_OWNER = 1
const ADMIN_ROW_ID_MAIN_ADMIN = 0
const LOG_ACTION_CREATE = 'create'
const LOG_ACTION_UPDATE = 'update'
const LOG_ACTION_DELETE = 'delete'

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
export async function saveOrUpdateProduct({ actor, body, preValidationErrors }: SaveOrUpdateProductParams): Promise<{ status: boolean; message: ProductResultMessage }> {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let submitted_from_type = 1
  if (!Number.isNaN(Number.parseInt(body.submitted_from_type as string))) submitted_from_type = Number.parseInt(body.submitted_from_type as string)

  let company_type = 0
  if (!Number.isNaN(Number.parseInt(body.company_type as string))) company_type = Number.parseInt(body.company_type as string)

  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(body.company_row_id as string))) company_row_id = Number.parseInt(body.company_row_id as string)

  let edit_product_row_id = 0
  let user_row_id = 0
  const register_type = Number.parseInt(body.register_type as string)
  const product_row_id = Number.parseInt(body.product_row_id as string)
  const product_type = Number.parseInt(body.product_type as string)

  // PERF FIX: these 3 validation checks are independent of each other (each writes its
  // own distinct errObj key — 'alert_message', 'company_row_id', 'product_row_id' — so
  // concurrent writes can't collide) but previously ran as 3 sequential awaits. Batched
  // into one Promise.all; same validations, same error messages, same final errObj.
  await Promise.all([
    (async () => {
      if (body.edit_product_row_id && !Number.isNaN(Number.parseInt(body.edit_product_row_id as string))) {
        const check_valid_query = await findProductByIdAndCompany(Number.parseInt(body.edit_product_row_id as string), company_row_id)
        if (check_valid_query) {
          edit_product_row_id = Number.parseInt(body.edit_product_row_id as string)
        } else {
          errObj['alert_message'] = 'Sorry, Invalid Edit Product Row ID.'
        }
      }
    })(),
    (async () => {
      if (submitted_from_type === 2) {
        if (company_type === 1) {
          const check_company_query = await findActiveCompanyById(company_row_id)
          if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
        } else {
          const check_company_query = await findManualCompanyById(company_row_id)
          if (!check_company_query) errObj['company_row_id'] = 'Invalid company row id'
        }
      } else if (actor.user_type == 1) {
        user_row_id = actor.user_row_id
        const check_company = await checkCompanyOwnership({ company_row_id, user_row_id })
        if (!check_company.status) errObj['company_row_id'] = (check_company.message as ProductResultMessage).alert_message as string
      }
    })(),
    (async () => {
      if (product_type == 1) {
        if (register_type == 1) {
          const user_reg_query = await findActiveTokenById(product_row_id)
          if (!user_reg_query) errObj['product_row_id'] = 'Sorry, Invalid product row id'
        } else if (register_type == 2) {
          const user_manual_query = await findSearchContractAddressById(product_row_id)
          if (!user_manual_query) errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
        }
      } else if (product_type == 2) {
        if (register_type == 1) {
          const company_reg_query = await findActiveChainById(product_row_id)
          if (!company_reg_query) errObj['product_row_id'] = 'Sorry, Invalid product row id'
        } else {
          const company_manual_query = await findManualChainById(product_row_id)
          if (!company_manual_query) errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
        }
      } else if (product_type == 3) {
        if (register_type == 1) {
          const user_reg_query = await findActiveExchangeById(product_row_id)
          if (!user_reg_query) errObj['product_row_id'] = 'Sorry, Invalid product row id'
        } else if (register_type == 2) {
          const user_manual_query = await findManualExchangeById(product_row_id)
          if (!user_manual_query) errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
        }
      }
    })()
  ])

  if (register_type && product_row_id && product_type) {
    const check_product_query = await findDuplicateProduct({ company_type, company_row_id, register_type, product_row_id, product_type, edit_product_row_id })
    if (check_product_query) errObj['alert_message'] = 'Sorry, This type of product is already exists.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const productFields = { company_type, register_type, product_row_id, product_type }

  // Publish gate applies to admin-panel edits only (design §2), same branch shape as every prior
  // tab. submitted_from_type === 2 is a separate, unreachable-from-either-frontend path (see plan
  // context) — if it were ever reached, it would still flow through this same owner/non-owner
  // branch since nothing here special-cases it.
  const isProductCompanyOwner = actor.user_type === USER_TYPE_COMPANY_OWNER
  if (!isProductCompanyOwner) {
    const liveValues = edit_product_row_id
      ? ((await findProductByIdAndCompanyLean(edit_product_row_id, company_row_id)) ?? {})
      : {}
    return submitChildChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_OWNED_PRODUCTS,
      rootDocumentId: company_row_id,
      targetRowId: edit_product_row_id || null,
      liveValues,
      submitted: productFields,
      actor: toActorRefWithId(
        {
          updated_by: actor.user_row_id === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actor.user_row_id,
        },
        actor.user_row_id,
      ),
    })
  }

  const update_object: ProductUpdateFields = { company_type, company_row_id, register_type, product_row_id, product_type }
  const ownerActor = toActorRefWithId({ updated_by: 'user', updated_by_row_id: actor.user_row_id }, actor.user_row_id)

  if (edit_product_row_id) {
    const preWriteProductValues = (await findProductByIdAndCompanyLean(edit_product_row_id, company_row_id)) ?? {}

    await updateProductById(edit_product_row_id, update_object)
    await invalidateCompanyProductsCaches()

    const ownerProductChanges = await computeDiff({
      before: preWriteProductValues,
      submitted: productFields,
      schemaPaths: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].schemaPaths,
      editableFields: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].editableFields,
    })
    if (ownerProductChanges.length > 0) {
      try {
        await insertChangeLog({
          module: AUDIT_MODULE_COMPANY,
          target_collection: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].collection,
          target_row_id: edit_product_row_id,
          root_document_id: company_row_id,
          section: SECTION_OWNED_PRODUCTS,
          action: LOG_ACTION_UPDATE,
          actor: ownerActor,
          changes: ownerProductChanges,
          reason: null,
          snapshot: null,
        })
      } catch (err) {
        logger.error({ err, company_row_id, edit_product_row_id }, 'company_products: owner update change log write failed')
      }
    }

    return { status: true, message: { alert_message: 'This company product details has been updated successfully.' } }
  }

  await createProduct({ ...update_object, date_n_time: getPresentDateTime() })

  await calculateCompanyProfileScore(company_row_id, ['owned_product'])
  const products = await productExistsForCompany(company_row_id)
  const owned_product_score = products ? 10 : 0

  if (product_type == 2) {
    await setChainOwningCompaniesScore(product_row_id, 15)
  } else if (product_type == 3) {
    await setExchangeOwningCompaniesScore(product_row_id, 15)
  }

  await invalidateCompanyProductsCaches()

  const ownerProductCreateChanges = await computeDiff({
    before: {},
    submitted: productFields,
    schemaPaths: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].schemaPaths,
    editableFields: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].editableFields,
  })
  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].collection,
      target_row_id: company_row_id,
      root_document_id: company_row_id,
      section: SECTION_OWNED_PRODUCTS,
      action: LOG_ACTION_CREATE,
      actor: ownerActor,
      changes: ownerProductCreateChanges,
      reason: null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, company_row_id }, 'company_products: owner create change log write failed')
  }

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
export async function deleteProduct({ actor, edit_product_row_id_raw }: DeleteProductParams): Promise<{ status: boolean; message: ProductResultMessage }> {
  const errObj: Record<string, string> = {}
  let user_row_id = 0
  let edit_product_row_id = 0

  if (actor.user_type == 1) user_row_id = actor.user_row_id

  if (Number.isNaN(Number.parseInt(edit_product_row_id_raw))) {
    errObj['edit_product_row_id'] = 'The own company product row id field must be contain valid number.'
  } else {
    edit_product_row_id = Number.parseInt(edit_product_row_id_raw)
    const check_query = await findProductById(edit_product_row_id)

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
            const check_token_query = await findTokenOwnedByUser({ product_row_id, user_row_id })
            if (check_token_query) validation_status = true
          }
          if (product_row_id && product_type == 2) {
            const check_token_query = await findChainOwnedByUser({ product_row_id, user_row_id })
            if (check_token_query) validation_status = true
          }
          if (product_row_id && product_type == 3) {
            const check_token_query = await findExchangeOwnedByUser({ product_row_id, user_row_id })
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

  const check_query = await findProductById(edit_product_row_id)
  const rowSnapshot = (await findProductByIdLean(edit_product_row_id)) ?? {}

  // Publish gate applies to admin-panel edits only (design §2).
  const isDeleteCompanyOwner = actor.user_type === USER_TYPE_COMPANY_OWNER
  if (!isDeleteCompanyOwner) {
    return submitChildDeleteRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_OWNED_PRODUCTS,
      rootDocumentId: check_query?.company_row_id ?? 0,
      targetRowId: edit_product_row_id,
      rowSnapshot,
      actor: toActorRefWithId(
        {
          updated_by: actor.user_row_id === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actor.user_row_id,
        },
        actor.user_row_id,
      ),
    })
  }

  await deleteProductById(edit_product_row_id)
  await invalidateCompanyProductsCaches()

  await calculateCompanyProfileScore(check_query?.company_row_id, ['owned_product'])

  if (check_query?.product_type == 2) {
    await setChainOwningCompaniesScore(check_query.product_row_id, 0)
  } else if (check_query?.product_type == 3) {
    await setExchangeOwningCompaniesScore(check_query.product_row_id, 0)
  }

  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: COMPANY_SECTION_REGISTRY[SECTION_OWNED_PRODUCTS].collection,
      target_row_id: edit_product_row_id,
      root_document_id: check_query?.company_row_id ?? 0,
      section: SECTION_OWNED_PRODUCTS,
      action: LOG_ACTION_DELETE,
      actor: toActorRefWithId({ updated_by: 'user', updated_by_row_id: actor.user_row_id }, actor.user_row_id),
      changes: [],
      reason: null,
      snapshot: rowSnapshot,
    })
  } catch (err) {
    logger.error({ err, edit_product_row_id }, 'company_products: owner delete change log write failed')
  }

  return { status: true, message: { alert_message: 'This own company details for this company have been deleted successfully.' } }
}
