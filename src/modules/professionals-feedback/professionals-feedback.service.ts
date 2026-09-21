// modules/professionals-feedback/professionals-feedback.service.ts
// Ports controllers/app/users/feedback.js in full (3 routes): /save_details, /list,
// /submite_issues (route name typo preserved on the controller side). Same behavior, same
// response shapes.
// All three models are shared with the still-legacy admin_panel/app/feedback.js (and
// report_feedback_issues_optionsM with the admin category-tags controller and the already-migrated
// system_settings module) — required directly, not colocated, matching precedent elsewhere in this
// migration (professionals-points, professionals-referrals).
import sanitize from 'mongo-sanitize'
import type { SaveFeedbackBody, SubmitIssueBody, UserTokenAuthResult } from './professionals-feedback.types'

const ProfessionalsFeedbackM = require('../../../models/app/professionals_feedbackM')
const ReportFeedbackIssuesOptionsM = require('../../../models/app/static/report_feedback_issues_optionsM')
const ReportIssuesUserDetailsM = require('../../../models/report_issues_user_detailsM')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { getCache, setCache } = require('../../../config/cache_helper')

const ONE_MINUTE_MS = 60 * 1000

export async function saveFeedbackDetails(auth: UserTokenAuthResult, body: SaveFeedbackBody, preValidationErrors: Record<string, unknown>) {
  const errObj: Record<string, unknown> = { ...preValidationErrors }
  let userRowId = 0
  const dateNTime = getPresentDateTime()

  if (auth.status) {
    userRowId = auth.message
    const checkQuery1 = await ProfessionalsFeedbackM.findOne({ user_row_id: userRowId }, { date_n_time: 1 })
    if (checkQuery1) {
      const addedOneMinuteTime = ONE_MINUTE_MS + new Date(checkQuery1.date_n_time).getTime()
      if (dateNTime < addedOneMinuteTime) {
        errObj['alert_message'] = 'Sorry for inconvenience, submit your feedback in next one minute.'
      }
    }
  } else if (body.email_id) {
    const checkQuery2 = await ProfessionalsFeedbackM.findOne({ email_id: sanitize(body.email_id) }, { date_n_time: 1 })
    if (checkQuery2) {
      const addedOneMinuteTime = ONE_MINUTE_MS + new Date(checkQuery2.date_n_time).getTime()
      if (dateNTime < addedOneMinuteTime) {
        errObj['alert_message'] = 'Sorry for inconvenience, submit your feedback in next one minute.'
      }
    }
  } else {
    errObj['email_id'] = 'The Valid Email ID field is required.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const feedbackSave = new ProfessionalsFeedbackM({
    user_row_id: userRowId,
    email_id: body.email_id,
    feedback_type: body.feedback_type,
    message: body.message,
    website_rating: body.website_rating,
    speed_rating: body.speed_rating,
    date_n_time: dateNTime,
  })
  await feedbackSave.save()
  return { status: true, message: { alert_message: 'Your feedback details submitted successfully.' } }
}

export async function getFeedbackIssuesOptionsList(auth: UserTokenAuthResult, query: Record<string, unknown>) {
  if (!auth.status) return auth

  const search = query.search ? String(query.search).trim() : ''
  const moduleType = !Number.isNaN(Number.parseInt(String(query.module_type))) ? Number.parseInt(String(query.module_type)) : null
  const tabKey = query.tab_key ? String(query.tab_key).trim() : null
  const subTabKey = query.sub_tab_key ? String(query.sub_tab_key).trim() : null

  const matchQuery: Record<string, unknown> = { active_status: true }
  if (moduleType !== null) matchQuery['module_type'] = moduleType
  if (tabKey) matchQuery['tab_key'] = tabKey
  if (subTabKey) matchQuery['sub_tab_key'] = subTabKey
  if (search) {
    matchQuery['$or'] = [
      { tab_name: { $regex: search, $options: 'i' } },
      { tab_key: { $regex: search, $options: 'i' } },
      { 'report_issues.option': { $regex: search, $options: 'i' } },
    ]
  }

  const shouldBypassCache = Boolean(search || moduleType !== null || tabKey || subTabKey)
  const cacheKey = `report_issue_options_list_${JSON.stringify(query)}`

  if (!shouldBypassCache) {
    const cacheResponse = await getCache({ key: cacheKey })
    if (cacheResponse.status) {
      return { status: true, data: cacheResponse.message.list, count: cacheResponse.message.count, cache_response_status: true }
    }
  }

  const list = await ReportFeedbackIssuesOptionsM.aggregate([
    { $match: matchQuery },
    { $project: { _id: 1, module_type: 1, tab_key: 1, tab_name: 1, sub_tab_key: 1, report_issues: 1 } },
    { $sort: { date_n_time: -1 } },
  ])

  if (!shouldBypassCache) {
    await setCache({ key: cacheKey, value: { list, count: list.length }, ttl: 300 })
  }

  return { status: true, data: list, count: list.length, cache_response_status: false }
}

export async function submitIssue(auth: UserTokenAuthResult, body: SubmitIssueBody, preValidationErrors: Record<string, unknown>) {
  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }
  if (!auth.status) {
    return { status: false, message: auth.message }
  }

  const userRowId = auth.message
  const { module_type: moduleType, module_row_id: moduleRowId, tab_key: tabKey, tab_name: tabName, sub_tab_key: subTabKey = null, option_id: optionId, description = null } = body

  const optionMaster = await ReportFeedbackIssuesOptionsM.findOne(
    { module_type: moduleType, tab_key: tabKey, sub_tab_key: subTabKey, active_status: true, 'report_issues._id': optionId },
    { report_issues: 1 },
  )

  if (!optionMaster) {
    return { status: false, message: { alert_message: 'Invalid issue option selected.' } }
  }

  const optionObj = optionMaster.report_issues.find((o: any) => o._id === optionId)
  if (!optionObj) {
    return { status: false, message: { alert_message: 'Issue option not found.' } }
  }

  const existingIssue = await ReportIssuesUserDetailsM.findOne({
    user_row_id: userRowId,
    module_type: moduleType,
    module_row_id: moduleRowId,
    tab_key: tabKey,
    sub_tab_key: subTabKey ?? null,
    option_id: optionId,
    tab_name: tabName,
    approved_status: 0,
  })

  if (existingIssue) {
    return { status: false, message: { alert_message: 'This issue is already under review' } }
  }

  const saveObj = new ReportIssuesUserDetailsM({
    module_type: moduleType,
    module_row_id: moduleRowId,
    tab_key: tabKey,
    tab_name: tabName,
    sub_tab_key: subTabKey,
    option_id: optionId,
    option_text: optionObj.option,
    description,
    user_row_id: userRowId,
    requested_on: getPresentDateTime(),
  })
  await saveObj.save()

  return { status: true, message: { alert_message: 'The issue has been reported successfully.' } }
}
