// modules/system_settings/system_settings.experience_level.validation.ts
//
// Ports experience_level.js's express-validator chain for POST /save and
// POST /update/:request_row_id:
//   check('experience').trim().not().isEmpty().withMessage('The Experience field is required')
// as a plain function so it can be shared by both handlers without Express middleware wiring.

export interface ExperienceLevelInput {
  experience?: string
}

export function validateExperienceLevelInput(
  input: ExperienceLevelInput
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.experience || !input.experience.trim()) {
    errObj.experience = 'The Experience field is required'
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
