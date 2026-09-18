// modules/system_settings/system_settings.report_issues_options.service.ts
//
// Ports controllers/admin_panel/category_tags/report_issues_options.js's POST
// /add_update verbatim. Note this legacy file's success responses do NOT
// include `tokenStatus` (unlike experience_level.js) — preserved exactly, no
// tokenStatus added here. `checkUserLoginToken` is imported by the legacy
// file but never called anywhere in it (confirmed dead import) — only
// `checkAdminLoginToken` is used, mirrored via the `actor` param below.

const { getPresentDateTime } = require('../../../utils/helpers/helper')
import {
  validateReportIssuesOptionsInput,
  ReportIssuesOptionsInput,
} from './system_settings.report_issues_options.validation'
import {
  findReportIssuesOptions,
  updateReportIssuesOptions,
  insertReportIssuesOptions,
} from './system_settings.report_issues_options.queries'
import { Actor } from './system_settings.types'

export interface UpsertReportIssuesOptionsParams {
  actor: Actor
  input: ReportIssuesOptionsInput
}

export async function upsertReportIssuesOptions({ actor, input }: UpsertReportIssuesOptionsParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateReportIssuesOptionsInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const { module_type, tab_key, tab_name, sub_tab_key = null, report_issues, active_status = true } = input

  const checkQuery = await findReportIssuesOptions(module_type, tab_key, sub_tab_key)

  if (checkQuery) {
    await updateReportIssuesOptions(checkQuery._id, {
      tab_name,
      report_issues,
      active_status,
      date_n_time: getPresentDateTime(),
    })

    return { status: true, message: { alert_message: 'Report issue options updated successfully.' } }
  }

  await insertReportIssuesOptions({
    module_type,
    tab_key,
    tab_name,
    sub_tab_key,
    report_issues,
    active_status,
    date_n_time: getPresentDateTime(),
  })

  return { status: true, message: { alert_message: 'Report issue options added successfully.' } }
}
