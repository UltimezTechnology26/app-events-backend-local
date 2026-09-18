import { LabelResolver } from '../../common/change-request/change-request.diff'
import { buildEnumLabelResolver, buildSingleLabelResolver, resolveCompanyName, resolveDateLabel } from '../../common/change-request/change-request.common-resolvers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveFundingCategoryName = buildSingleLabelResolver(() => require('../../../models/app/static/funding_roundsM'), 'category_name')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveInvestorCategoryName = buildSingleLabelResolver(() => require('../../../models/app/static/funding_investor_typesM'), 'category_name')

/** 1 = an app person (professionalsM/professionals_manual_retrievalsM), 2 = a company (companyM/company_manual_retrievalsM) - see validateInvestorsArray. */
const resolveInvestorTypeLabel = buildEnumLabelResolver({ 1: 'Person', 2: 'Company' })
/** 1 = an existing registered record, 2 = a manually-added (unregistered) one - same validateInvestorsArray branching. */
const resolveRegisteredTypeLabel = buildEnumLabelResolver({ 1: 'Registered', 2: 'Manually Added' })

/**
 * Resolves ONE investor's `investor_row_id` to its display name, branching on the SAME
 * `investor_type`/`investor_registered_type` combination validateInvestorsArray itself checks
 * (funding.service.ts) - unlike Team Members' sub_position_row_id, the full context needed to
 * pick the right collection is already sitting right next to the id in the same array item, so
 * no try-then-fallback guessing is needed here. All requires are lazy (inside the function), same
 * reasoning as change-request.common-resolvers.ts.
 */
async function resolveInvestorRowName(investor_type: number, investor_registered_type: number, investor_row_id: number): Promise<string | null> {
  if (!investor_row_id) return null
  /* eslint-disable @typescript-eslint/no-var-requires */
  const model = investor_type === 1
    ? (investor_registered_type === 1 ? require('../../../models/app/professionalsM') : require('../../../models/app/users/professionals_manual_retrievalsM'))
    : (investor_registered_type === 1 ? require('../../../models/app/company/companyM') : require('../../../models/app/company/company_manual_retrievalsM'))
  /* eslint-enable @typescript-eslint/no-var-requires */
  const nameField = investor_type === 1 ? 'full_name' : 'company_name'
  const doc = await model.findById(investor_row_id).select(nameField).lean()
  return doc ? (doc[nameField] ?? null) : null
}

/**
 * `investors` (Funding Round) is submitted as one opaque array (computeDiff's default/untyped
 * comparison - same tradeoff already accepted for Team Members' `positions`), so this resolves
 * every entry into one "Name (Person/Company)" line and joins them, rather than resolving each
 * sub-field independently the way single-value fields above do.
 */
const resolveInvestorsList: LabelResolver = async (value) => {
  const investors = Array.isArray(value) ? value : []
  if (!investors.length) return null

  const lines = await Promise.all(
    investors.map(async (inv: { investor_type?: number; investor_registered_type?: number; investor_row_id?: number }) => {
      const investor_type = Number(inv?.investor_type)
      const investor_registered_type = Number(inv?.investor_registered_type)
      const investor_row_id = Number(inv?.investor_row_id)
      const name = await resolveInvestorRowName(investor_type, investor_registered_type, investor_row_id)
      if (!name) return null
      return `${name} (${investor_type === 1 ? 'Person' : 'Company'})`
    }),
  )
  const resolved = lines.filter((line): line is string => Boolean(line))
  return resolved.length ? resolved.join(', ') : null
}

export const INVESTMENT_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  category_row_id: resolveFundingCategoryName,
  investor_category_row_id: resolveInvestorCategoryName,
  investor_type: resolveInvestorTypeLabel,
  investor_registered_type: resolveRegisteredTypeLabel,
  funds_raised_registered_type: resolveRegisteredTypeLabel,
  funds_raised_company_row_id: resolveCompanyName,
  announcement_date: resolveDateLabel,
}

export const FUNDING_ROUND_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  category_row_id: resolveFundingCategoryName,
  investors: resolveInvestorsList,
  announcement_date: resolveDateLabel,
}
