import { LabelResolver } from '../../common/change-request/change-request.diff'
import { buildEnumLabelResolver } from '../../common/change-request/change-request.common-resolvers'

const resolveProductTypeLabel = buildEnumLabelResolver({ 1: 'Token', 2: 'Chain', 3: 'Exchange' })
const resolveRegisterTypeLabel = buildEnumLabelResolver({ 1: 'Registered', 2: 'Manually Added' })
const resolveCompanyTypeLabel = buildEnumLabelResolver({ 1: 'Registered Company', 2: 'Manually Added' })

type ProductCandidate = { getModel: () => { findById: (id: number) => { select: (f: string) => { lean: () => Promise<Record<string, unknown> | null> } } }; nameField: string }

/* eslint-disable @typescript-eslint/no-var-requires */
const TOKEN_CANDIDATES: ProductCandidate[] = [
  { getModel: () => require('../../../models/markets/tokensM'), nameField: 'token_name' },
  { getModel: () => require('../../../models/markets/search_contract_addressM'), nameField: 'token_name' },
]
const CHAIN_CANDIDATES: ProductCandidate[] = [
  { getModel: () => require('../../../models/markets/chainsM'), nameField: 'chain_name' },
  { getModel: () => require('../../../models/markets/chains_manualsM'), nameField: 'chain_name' },
]
const EXCHANGE_CANDIDATES: ProductCandidate[] = [
  { getModel: () => require('../../../models/markets/exchangeM'), nameField: 'exchange_name' },
  { getModel: () => require('../../../models/markets/exchange_manualsM'), nameField: 'exchange_name' },
]
/* eslint-enable @typescript-eslint/no-var-requires */

const CANDIDATES_BY_PRODUCT_TYPE: Record<number, ProductCandidate[]> = {
  1: TOKEN_CANDIDATES,
  2: CHAIN_CANDIDATES,
  3: EXCHANGE_CANDIDATES,
}

async function resolveAgainst(row_id: number, candidates: ProductCandidate[]): Promise<string | null> {
  for (const { getModel, nameField } of candidates) {
    const doc = await getModel().findById(row_id).select(nameField).lean()
    if (doc && doc[nameField]) return doc[nameField] as string
  }
  return null
}

/**
 * `product_row_id` resolves against one of SIX collections depending on the sibling
 * `product_type`/`register_type` pair (see saveOrUpdateProduct's own product_type===1/2/3 x
 * register_type===1/2 branches, company_products.queries.ts's findActiveTokenById /
 * findSearchContractAddressById / findActiveChainById / findManualChainById /
 * findActiveExchangeById / findManualExchangeById).
 *
 * CONFIRMED BUG FIX: this used to try all six collections in a fixed Token->Chain->Exchange
 * order and stop at the first match - since every collection's row ids are independent
 * auto-increment counters, a newly added Chain/Exchange product whose id happened to also exist
 * in tokensM resolved to that UNRELATED token's name instead. `record` (the full submitted/before
 * object, threaded through by computeDiff) carries the sibling `product_type`, which narrows the
 * search to the right pair of collections; `register_type` (1=registered, 2=manual) further picks
 * which of that pair to try first. Falls back to every candidate, in the original order, only
 * when `product_type` itself isn't available on this side of the diff (e.g. resolving `old_value`
 * on a CREATE, where `before` is `{}`).
 */
const resolveProductName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null

  const productType = Number(record?.product_type)
  const candidates = CANDIDATES_BY_PRODUCT_TYPE[productType]
  if (!candidates) {
    return resolveAgainst(row_id, [...TOKEN_CANDIDATES, ...CHAIN_CANDIDATES, ...EXCHANGE_CANDIDATES])
  }

  const registerType = Number(record?.register_type)
  const ordered = registerType === 2 ? [...candidates].reverse() : candidates
  return resolveAgainst(row_id, ordered)
}

export const OWNED_PRODUCTS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  product_row_id: resolveProductName,
  product_type: resolveProductTypeLabel,
  register_type: resolveRegisterTypeLabel,
  company_type: resolveCompanyTypeLabel,
}
