// modules/work-experience/work-experience.positions.validation.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's POST
// /update_position_details validation exactly: the express-validator chain
// only requires `position_name` (trimmed, not empty) — see
// `check('position_name').trim().not().isEmpty().withMessage('The position
// name  field is required')` (double space before "field" is a genuine
// legacy typo, preserved verbatim, not introduced here).

export interface PositionInput {
  position_name?: string
  position_row_id?: number
}

export function validatePositionInput(
  input: PositionInput
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.position_name || !input.position_name.trim()) {
    errObj.position_name = 'The position name  field is required'
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
