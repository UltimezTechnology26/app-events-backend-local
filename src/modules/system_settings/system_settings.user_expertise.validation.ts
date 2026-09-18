// modules/system_settings/system_settings.user_expertise.validation.ts
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's POST
// /save and POST /update validation exactly: only `designation_name` is
// required (trimmed, not empty). The double space in the default message
// ('The expertise  field is required') is a legacy typo — preserved
// verbatim, not corrected.

export interface UserExpertiseInput {
  designation_name?: string
  show_in_job_status?: number
}

export function validateUserExpertiseInput(
  input: UserExpertiseInput,
  requiredMessage: string = 'The expertise  field is required'
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.designation_name || !input.designation_name.trim()) {
    errObj.designation_name = requiredMessage
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
