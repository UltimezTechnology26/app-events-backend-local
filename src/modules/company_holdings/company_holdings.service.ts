// modules/company_holdings/company_holdings.service.ts
import { checkCompanyOwnership } from '../common/common.ownership'
import { invalidateCompanyHoldingsCaches } from './company_holdings.cache'
import {
  findActiveCompanyById,
  findManualCompanyById,
  findTokenById,
  findSearchContractAddressById,
  findHoldingByIdAndCompany,
  findHoldingByIdAndCompanyLean,
  findHoldingById,
  findHoldingByIdLean,
  findTokenOwnedByUser,
  updateHoldingById,
  createHolding,
  deleteHoldingById,
  HoldingUpdateFields
} from './company_holdings.queries'

const { calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../common/change-request/change-request.child.service'
import { computeDiff } from '../../common/change-request/change-request.diff'
import { COMPANY_SECTION_REGISTRY, SECTION_HOLDING_CRYPTO } from '../../common/change-request/change-request.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import logger from '../../../config/logger'

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

const USER_TYPE_COMPANY_OWNER = 1
const ADMIN_ROW_ID_MAIN_ADMIN = 0
const LOG_ACTION_CREATE = 'create'
const LOG_ACTION_UPDATE = 'update'
const LOG_ACTION_DELETE = 'delete'

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

  const holdingFields: Record<string, unknown> = { company_type, token_type, token_row_id, purchased_value: body.purchased_value, purchased_value_in_usd: body.purchased_value_in_usd }
  if (body.purchased_date) {
    holdingFields.purchased_date = body.purchased_date
  }

  // Publish gate applies to admin-panel edits only (design §2), same branch shape as every
  // prior tab. submitted_from_type === 2 is a separate, unreachable-from-either-frontend path
  // (see plan context) — if it were ever reached, it would still flow through this same
  // owner/non-owner branch since nothing here special-cases it.
  const isHoldingCompanyOwner = actor.user_type === USER_TYPE_COMPANY_OWNER
  if (!isHoldingCompanyOwner) {
    const liveValues = holding_row_id
      ? ((await findHoldingByIdAndCompanyLean(holding_row_id, company_row_id)) ?? {})
      : {}
    return submitChildChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_HOLDING_CRYPTO,
      rootDocumentId: company_row_id,
      targetRowId: holding_row_id || null,
      liveValues,
      submitted: holdingFields,
      actor: toActorRefWithId(
        {
          updated_by: actor.user_row_id === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actor.user_row_id,
        },
        actor.user_row_id,
      ),
    })
  }

  const update_object: HoldingUpdateFields = { company_type, company_row_id, token_row_id, token_type }
  if (body.purchased_date) update_object.purchased_date = body.purchased_date
  update_object.purchased_value = body.purchased_value
  update_object.purchased_value_in_usd = body.purchased_value_in_usd

  const ownerActor = toActorRefWithId({ updated_by: 'user', updated_by_row_id: actor.user_row_id }, actor.user_row_id)

  if (holding_row_id) {
    const preWriteHoldingValues = (await findHoldingByIdAndCompanyLean(holding_row_id, company_row_id)) ?? {}

    await updateHoldingById(holding_row_id, update_object)
    const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
    await deleteKeysByPattern('app_company_individual_other_details_*')
    await deleteKeysByPattern('app_company_list_*')

    const ownerHoldingChanges = await computeDiff({
      before: preWriteHoldingValues,
      submitted: holdingFields,
      schemaPaths: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].schemaPaths,
      editableFields: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].editableFields,
    })
    if (ownerHoldingChanges.length > 0) {
      try {
        await insertChangeLog({
          module: AUDIT_MODULE_COMPANY,
          target_collection: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].collection,
          target_row_id: holding_row_id,
          root_document_id: company_row_id,
          section: SECTION_HOLDING_CRYPTO,
          action: LOG_ACTION_UPDATE,
          actor: ownerActor,
          changes: ownerHoldingChanges,
          reason: null,
          snapshot: null,
        })
      } catch (err) {
        logger.error({ err, company_row_id, holding_row_id }, 'company_holdings: owner update change log write failed')
      }
    }

    return { status: true, message: { alert_message: 'This company holding details has been updated successfully.' }, deleteKey }
  }

  await createHolding({ ...update_object, date_n_time: getPresentDateTime() })

  await calculateCompanyProfileScore(company_row_id, ['holding_crypto'])

  const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
  await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('app_company_list_*')

  const ownerHoldingCreateChanges = await computeDiff({
    before: {},
    submitted: holdingFields,
    schemaPaths: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].schemaPaths,
    editableFields: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].editableFields,
  })
  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].collection,
      target_row_id: company_row_id,
      root_document_id: company_row_id,
      section: SECTION_HOLDING_CRYPTO,
      action: LOG_ACTION_CREATE,
      actor: ownerActor,
      changes: ownerHoldingCreateChanges,
      reason: null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, company_row_id }, 'company_holdings: owner create change log write failed')
  }

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
  const rowSnapshot = (await findHoldingByIdLean(holding_row_id)) ?? {}

  // Publish gate applies to admin-panel edits only (design §2).
  const isDeleteCompanyOwner = actor.user_type === USER_TYPE_COMPANY_OWNER
  if (!isDeleteCompanyOwner) {
    return submitChildDeleteRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_HOLDING_CRYPTO,
      rootDocumentId: check_query?.company_row_id ?? 0,
      targetRowId: holding_row_id,
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

  await deleteHoldingById(holding_row_id)
  await invalidateCompanyHoldingsCaches()

  await calculateCompanyProfileScore(check_query?.company_row_id, ['holding_crypto'])

  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: COMPANY_SECTION_REGISTRY[SECTION_HOLDING_CRYPTO].collection,
      target_row_id: holding_row_id,
      root_document_id: check_query?.company_row_id ?? 0,
      section: SECTION_HOLDING_CRYPTO,
      action: LOG_ACTION_DELETE,
      actor: toActorRefWithId({ updated_by: 'user', updated_by_row_id: actor.user_row_id }, actor.user_row_id),
      changes: [],
      reason: null,
      snapshot: rowSnapshot,
    })
  } catch (err) {
    logger.error({ err, holding_row_id }, 'company_holdings: owner delete change log write failed')
  }

  return { status: true, message: { alert_message: 'This Company Holding details for this company have been deleted successfully.' } }
}
