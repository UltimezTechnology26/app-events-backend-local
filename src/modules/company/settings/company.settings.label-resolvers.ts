import { LabelResolver } from '../../../common/change-request/change-request.diff'
import { buildArrayLabelResolver, buildEnumLabelResolver, buildSingleLabelResolver, resolveCompanyName, resolveCountryName, resolveDateLabel } from '../../../common/change-request/change-request.common-resolvers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const getCompanyBusinessModelsM = () => require('../../../../models/app/static/company_business_modelsM')

/** `main_business_model_id` is a single select (the company's ONE primary category). */
const resolveMainBusinessModelName = buildSingleLabelResolver(getCompanyBusinessModelsM, 'business_name')
/** `business_model_id` is the multi-select "Categories" field - a list of ids, unlike its single-value sibling above. */
const resolveBusinessModelNames = buildArrayLabelResolver(getCompanyBusinessModelsM, 'business_name')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveInvestorCategoryName = buildSingleLabelResolver(() => require('../../../../models/app/static/funding_investor_typesM'), 'category_name')

/**
 * Matches BasicDetailsAdditionalFields.tsx's own hardcoded band list ({_id:"1", name:"Micro",
 * count:"1-10"} etc.) - a static admin-panel enum, never a DB-backed lookup collection.
 */
const resolveCompanySizeLabel = buildEnumLabelResolver({
  1: 'Micro (1-10)',
  2: 'Small (11-50)',
  3: 'Medium (51-250)',
  4: 'Large (251 & Above)',
})

/**
 * `regularities_details` is submitted as one opaque array of `{regulatory_bodies_ids}` (see
 * company.settings.service.ts's stripRegulatoryDetailIds fix for the sibling Mongo-`_id` bug on
 * this same field) - resolves every entry's regulatory-body id in one query (bodies live nested
 * inside `company_regulatory_bodiesM.regulatory_bodies[]`, grouped by country, so a plain findById
 * can't reach them - unwind + match instead) and joins into one readable line. Lazy require, same
 * reasoning as change-request.common-resolvers.ts's buildSingleLabelResolver.
 */
const resolveRegulatoryDetails: LabelResolver = async (value) => {
  const entries = Array.isArray(value) ? value : [value]
  const ids = entries
    .map((entry: unknown) => Number((entry as { regulatory_bodies_ids?: unknown })?.regulatory_bodies_ids))
    .filter((id) => !Number.isNaN(id) && id !== 0)
  if (!ids.length) return null

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const company_regulatory_bodiesM = require('../../../../models/app/company/company_regulatory_bodiesM')
  const matches = await company_regulatory_bodiesM.aggregate([
    { $unwind: '$regulatory_bodies' },
    { $match: { 'regulatory_bodies._id': { $in: ids } } },
    { $project: { _id: '$regulatory_bodies._id', name: '$regulatory_bodies.regulatory_bodies_name' } },
  ])
  const nameById = new Map(matches.map((m: { _id: number; name: string }) => [m._id, m.name]))
  const names = ids.map((id) => nameById.get(id)).filter((name): name is string => Boolean(name))
  return names.length ? names.join(', ') : null
}

export const BASIC_DETAILS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  business_model_id: resolveBusinessModelNames,
  main_business_model_id: resolveMainBusinessModelName,
  investor_category_row_id: resolveInvestorCategoryName,
  country_id: resolveCountryName,
  country_mobile_id: resolveCountryName,
  company_size_row_id: resolveCompanySizeLabel,
  regularities_details: resolveRegulatoryDetails,
  manual_company_row_id: resolveCompanyName,
  established_in: resolveDateLabel,
}
