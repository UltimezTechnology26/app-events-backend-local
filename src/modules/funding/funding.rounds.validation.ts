// modules/funding/funding.rounds.validation.ts
//
// Ports the express-validator check from controllers/admin_panel/category_tags/
// funding_rounds.js's POST /save_n_edit (legacy line 241-242) as a plain
// validation function: category_name is required. Unlike its sibling
// funding_investor_types.js, this legacy controller has no investor_type
// field at all.
export interface FundingRoundInput {
  category_name?: string
  category_row_id?: number
}

export function validateFundingRoundInput(input: FundingRoundInput): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.category_name || !input.category_name.trim()) {
    errObj.category_name = 'The category name field is required.'
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
