// modules/system_settings/system_settings.validation.ts
//
// Per the user's explicit decision, all 5 system-settings categories
// (experience_level, report_issues_options, event_tags, area_of_interests,
// user_expertise) share this ONE validation file. Each category gets its own
// `// ==== <Category> ====` section. Tasks 2-5 add new sections below.

// ==== Experience Level ====

/**
 * Ports experience_level.js's express-validator chain for POST /save and
 * POST /update/:request_row_id:
 *   check('experience').trim().not().isEmpty().withMessage('The Experience field is required')
 * as a plain function so it can be shared by both handlers without Express middleware wiring.
 */
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

// ==== Report Issues Options ====
//
// Ports controllers/admin_panel/category_tags/report_issues_options.js's POST
// /add_update validation exactly: the express-validator chain (module_type
// not empty (untrimmed), tab_key/tab_name trimmed not-empty, report_issues
// isArray({min:1})) PLUS the handler's own manual re-validation block that
// runs after arrangeValidation and can overwrite/add to the same errObj:
//   if (!Array.isArray(report_issues)) errObj.report_issues = 'Report issues must be an array'
//   else report_issues.forEach(item => !item._id || !item.option -> errObj[`report_issues_${index}`] = ...)
// sub_tab_key is NOT required by the legacy file — it defaults to `null` and
// is only ever used as part of the composite lookup key, never validated.

export interface ReportIssueOption {
  _id: string | number
  option: string
}

export interface ReportIssuesOptionsInput {
  module_type?: string | number
  tab_key?: string
  tab_name?: string
  sub_tab_key?: string | null
  report_issues?: ReportIssueOption[]
  active_status?: boolean
}

export function validateReportIssuesOptionsInput(
  input: ReportIssuesOptionsInput
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}

  // The real legacy file uses express-validator's `.not().isEmpty()`, which does
  // NOT reject `0` — a plain `!input.module_type` falsy check would incorrectly
  // reject a legitimate `0` value, so check explicitly for missing/empty instead.
  if (input.module_type === undefined || input.module_type === null || input.module_type === '') {
    errObj.module_type = 'Module type is required'
  }
  if (!input.tab_key || !input.tab_key.trim()) {
    errObj.tab_key = 'Tab key is required'
  }
  if (!input.tab_name || !input.tab_name.trim()) {
    errObj.tab_name = 'Tab name is required'
  }

  if (!Array.isArray(input.report_issues) || input.report_issues.length < 1) {
    errObj.report_issues = 'At least one issue option is required'
  }

  if (!Array.isArray(input.report_issues)) {
    errObj.report_issues = 'Report issues must be an array'
  } else {
    input.report_issues.forEach((item, index) => {
      if (!item._id || !item.option) {
        errObj[`report_issues_${index}`] = 'Each issue must have option id and text'
      }
    })
  }

  return { valid: Object.keys(errObj).length === 0, errObj }
}

// ==== Event Tags ====
//
// Ports controllers/admin_panel/category_tags/event_tags.js's POST /save and
// POST /update/:request_row_id validation exactly: the express-validator
// chain only requires `event_tag` (trimmed, not empty) — the `keywords`
// check is commented out in the legacy file, so it is intentionally not
// validated here either.

export interface EventTagInput {
  event_tag?: string
  keywords?: string
}

export function validateEventTagInput(
  input: EventTagInput
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.event_tag || !input.event_tag.trim()) {
    errObj.event_tag = 'The Event tag field is required'
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}

// ==== Area of Interests ====
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's POST
// /save_n_add_user_looking and POST /update_looking/:looking_id validation
// exactly. The two routes use DIFFERENT express-validator messages for the
// same field (a genuine legacy quirk, not a typo introduced here):
//   save:   check('looking_for_name').trim().not().isEmpty()
//             .withMessage('The Looking for Name field is required')
//   update: check('looking_for_name').trim().not().isEmpty()
//             .withMessage('The Looking for field is required')
// Reproduced as one shared function taking the desired message as a param
// (defaulting to the save-route wording), rather than as two near-duplicate
// functions, so each caller supplies its own route's exact legacy string.

export interface AreaOfInterestInput {
  looking_for_name?: string
}

export function validateAreaOfInterestInput(
  input: AreaOfInterestInput,
  requiredMessage: string = 'The Looking for Name field is required'
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.looking_for_name || !input.looking_for_name.trim()) {
    errObj.looking_for_name = requiredMessage
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}

// ==== User Expertise ====
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's POST
// /save_n_add_position and POST /update_position/:designation_id validation
// exactly. Like area_of_interests.js, the two routes use DIFFERENT
// express-validator messages for the same field (confirmed by reading the
// real legacy file in full rather than the brief's inline snippet, which
// used one generic message for both):
//   save:   check('designation_name').trim().not().isEmpty()
//             .withMessage('The expertise  field is required')
//           (the double space before "field" is a genuine legacy typo,
//           preserved verbatim, not introduced here)
//   update: check('designation_name').trim().not().isEmpty()
//             .withMessage('The Designation Name field is required')
// Reproduced as one shared function taking the desired message as a param,
// following the same pattern as validateAreaOfInterestInput above.
//
// `show_in_job_status` is typed as `number` here (not `boolean`, as the
// brief's inline snippet had it) because `models/app/static/user_designationsM.js`
// defines it as `{ type: Number, default: 1 }` (1 = show in job, 2 = don't
// show) — an enum-like numeric flag, not a boolean.

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
