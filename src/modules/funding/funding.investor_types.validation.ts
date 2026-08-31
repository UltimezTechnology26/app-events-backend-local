// modules/funding/funding.investor_types.validation.ts
//
// Ports the express-validator checks from controllers/admin_panel/category_tags/
// funding_investor_types.js's POST /save_n_edit (legacy lines 264-268) as a plain
// validation function: category_name is required, investor_type is required and
// must be 1 (User) or 2 (Company).
//
// The legacy chain is `.not().isEmpty().withMessage('...is required.')` BEFORE
// `.isInt({min:1,max:2}).withMessage('...contains only 1 or 2.')`, and this
// codebase's `arrangeValidation` helper (utils/helpers/helper.js) keeps only the
// FIRST validation error per field — so when `investor_type` is missing/empty,
// legacy returns the "required" message, not the range message. The range
// message only surfaces when a value IS present but out of range.
export interface FundingInvestorTypeInput {
  category_name?: string
  investor_type?: number // 1 = User, 2 = Company
  category_row_id?: number
}

export function validateFundingInvestorTypeInput(input: FundingInvestorTypeInput): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.category_name || !input.category_name.trim()) {
    errObj.category_name = 'The investor category name field is required.'
  }
  if (input.investor_type === undefined || input.investor_type === null || Number.isNaN(input.investor_type)) {
    errObj.investor_type = 'The investor type field is required.'
  } else if (![1, 2].includes(input.investor_type)) {
    errObj.investor_type = 'The investor type field contains only 1 or 2.'
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
