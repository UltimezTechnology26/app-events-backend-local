// modules/system_settings/system_settings.report_issues_options.queries.ts
//
// Data-access layer for this category — the only place
// `reportFeedbackIssuesOptionsM` is touched directly.

const reportFeedbackIssuesOptionsM = require('../../../models/app/static/report_feedback_issues_optionsM')

export async function findReportIssuesOptions(moduleType: unknown, tabKey: unknown, subTabKey: unknown) {
  return reportFeedbackIssuesOptionsM.findOne({ module_type: moduleType, tab_key: tabKey, sub_tab_key: subTabKey })
}

export async function updateReportIssuesOptions(checkQueryId: unknown, updateFields: Record<string, unknown>) {
  return reportFeedbackIssuesOptionsM.updateOne({ _id: checkQueryId }, { $set: updateFields })
}

export async function insertReportIssuesOptions(insertFields: Record<string, unknown>) {
  return new reportFeedbackIssuesOptionsM(insertFields).save()
}
