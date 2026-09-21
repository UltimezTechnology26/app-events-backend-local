// modules/professionals-feedback/professionals-feedback.admin.controller.ts
// Ports admin_panel/app/feedback.js. Mounted at a `_v2` suffix parallel to the untouched legacy
// admin feedback mount.
//
// SECURITY FIX (see professionals-feedback.admin.service.ts's doc comment): /individual_report_details
// and /report_issues_overview_counts had zero admin-token check in legacy — both now gated with
// access id [-1], matching every sibling route in this file, mirroring Phase A/Phase G's identical
// precedent fix.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  getUsersFeedbackList, getIndividualFeedbackDetails, getReportUsersIssuesList, getIndividualReportDetails,
  getApprovedByFilterList, approveRejectIssue, getReportIssuesOverviewCounts,
} from './professionals-feedback.admin.service'
import { AdminAuthResult } from './professionals-feedback.admin.types'

export const professionalsFeedbackAdminRouter: Router = express.Router()

professionalsFeedbackAdminRouter.get('/users_feedback_list/:skip/:limit', asyncRoute('User Feedback list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [0])
  res.json(await getUsersFeedbackList(auth, req.params.skip as string, req.params.limit as string, req.query.search))
}))

professionalsFeedbackAdminRouter.get('/individual_details/:feedback_row_id', asyncRoute('Individual feedback details.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [0])
  res.json(await getIndividualFeedbackDetails(auth, req.params.feedback_row_id as string))
}))

professionalsFeedbackAdminRouter.get('/report_users_issues_list/:skip/:limit', asyncRoute('Issues list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await getReportUsersIssuesList(auth, req.params.skip as string, req.params.limit as string, req.query as any))
}))

professionalsFeedbackAdminRouter.get('/individual_report_details/:issue_row_id', asyncRoute('Individual issue details.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await getIndividualReportDetails(auth, req.params.issue_row_id as string))
}))

professionalsFeedbackAdminRouter.get('/approved_by_filter_list', asyncRoute('Approved by filter list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await getApprovedByFilterList(auth))
}))

professionalsFeedbackAdminRouter.post('/approve_reject_issue', writeEndpointRateLimiter, asyncRoute('Approve/reject issue.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await approveRejectIssue(auth, req.body))
}))

professionalsFeedbackAdminRouter.get('/report_issues_overview_counts', asyncRoute('Issue overview.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await getReportIssuesOverviewCounts(auth))
}))
