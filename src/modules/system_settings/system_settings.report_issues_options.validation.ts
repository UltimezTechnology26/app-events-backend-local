// modules/system_settings/system_settings.report_issues_options.validation.ts
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
