import { LabelResolver } from '../../common/change-request/change-request.diff'
import { buildEnumLabelResolver, resolveDateLabel } from '../../common/change-request/change-request.common-resolvers'

const resolveTokenTypeLabel = buildEnumLabelResolver({ 1: 'Registered', 2: 'Manually Added' })
const resolveCompanyTypeLabel = buildEnumLabelResolver({ 1: 'Registered Company', 2: 'Manually Added' })

/**
 * `token_row_id` resolves against tokensM (registered, token_type 1) or search_contract_addressM
 * (manual, token_type 2) - see saveOrUpdateHolding's own branching. Requires are lazy, same
 * reasoning as change-request.common-resolvers.ts.
 *
 * `record` (the sibling `token_type`, threaded through by computeDiff) picks the right collection
 * first, same "confirmed report" fix as Owned Products' resolveProductName - two independent
 * auto-increment id spaces mean a manually-added token's row id can coincidentally also exist in
 * the registered tokensM collection, so trying registered-then-manual unconditionally risked
 * resolving to a completely unrelated token. Falls back to trying both, registered first, only
 * when `token_type` isn't available on this side of the diff.
 */
const resolveTokenName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null
  /* eslint-disable @typescript-eslint/no-var-requires */
  const tokensM = require('../../../models/markets/tokensM')
  const search_contract_addressM = require('../../../models/markets/search_contract_addressM')
  /* eslint-enable @typescript-eslint/no-var-requires */

  const tokenType = Number(record?.token_type)
  if (tokenType === 2) {
    const manual = await search_contract_addressM.findById(row_id).select('token_name').lean()
    return manual?.token_name ?? null
  }
  if (tokenType === 1) {
    const registered = await tokensM.findById(row_id).select('token_name').lean()
    return registered?.token_name ?? null
  }

  const registered = await tokensM.findById(row_id).select('token_name').lean()
  if (registered?.token_name) return registered.token_name
  const manual = await search_contract_addressM.findById(row_id).select('token_name').lean()
  return manual?.token_name ?? null
}

export const HOLDING_CRYPTO_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  token_row_id: resolveTokenName,
  token_type: resolveTokenTypeLabel,
  company_type: resolveCompanyTypeLabel,
  purchased_date: resolveDateLabel,
}
