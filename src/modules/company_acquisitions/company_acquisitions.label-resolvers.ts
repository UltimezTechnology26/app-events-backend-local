import { LabelResolver } from '../../common/change-request/change-request.diff'
import { buildEnumLabelResolver, resolveDateLabel } from '../../common/change-request/change-request.common-resolvers'

/** 1 = registered company (companyM), 2 = manually-added/unregistered (company_manual_retrievalsM) - see isPartyToAcquisition. */
const resolveRegisteredTypeLabel = buildEnumLabelResolver({ 1: 'Registered', 2: 'Manually Added' })

/**
 * `acquirer_company_row_id`/`acquired_company_row_id` resolve against one of two collections
 * depending on the sibling `acquirer_registered_type`/`acquired_registered_type` - same
 * "LabelResolver only sees its own field's value" limitation as Team Members' sub_position_row_id,
 * so this tries the registered-company collection first (the common case) and falls back to the
 * manually-added one, rather than leaving an unregistered party's id unresolved. Requires are
 * lazy, same reasoning as change-request.common-resolvers.ts.
 */
const resolveAcquisitionPartyName: LabelResolver = async (value) => {
  const row_id = Number(value)
  if (!row_id) return null
  /* eslint-disable @typescript-eslint/no-var-requires */
  const companyM = require('../../../models/app/company/companyM')
  const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
  /* eslint-enable @typescript-eslint/no-var-requires */
  const registered = await companyM.findById(row_id).select('company_name').lean()
  if (registered) return registered.company_name ?? null
  const manual = await company_manual_retrievalsM.findById(row_id).select('company_name').lean()
  return manual?.company_name ?? null
}

export const ACQUISITIONS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  acquirer_company_row_id: resolveAcquisitionPartyName,
  acquired_company_row_id: resolveAcquisitionPartyName,
  acquirer_registered_type: resolveRegisteredTypeLabel,
  acquired_registered_type: resolveRegisteredTypeLabel,
  acquisition_date: resolveDateLabel,
}
