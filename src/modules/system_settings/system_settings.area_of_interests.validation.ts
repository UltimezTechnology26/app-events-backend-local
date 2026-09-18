// modules/system_settings/system_settings.area_of_interests.validation.ts
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's POST
// /save and POST /update/:request_row_id validation exactly: only
// `looking_for_name` is required (trimmed, not empty). The save handler's
// error message differs from the update handler's — both are supported via
// the `requiredMessage` parameter, matching how experience_level's
// validator already handles the same asymmetry.

export interface AreaOfInterestInput {
  looking_for_name?: string
}

export function validateAreaOfInterestInput(
  input: AreaOfInterestInput,
  requiredMessage = 'The Looking for Name field is required'
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.looking_for_name || !input.looking_for_name.trim()) {
    errObj.looking_for_name = requiredMessage
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
