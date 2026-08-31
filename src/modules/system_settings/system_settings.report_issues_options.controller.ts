// modules/system_settings/system_settings.report_issues_options.controller.ts
//
// Ports controllers/admin_panel/category_tags/report_issues_options.js's
// single route (POST /add_update). This legacy controller has no list/enable/
// disable/delete routes at all, so none are added here. Role array `[0]`
// confirmed verbatim from its one `checkAdminLoginToken(req.headers, [0])`
// call. Mounted with no extra path prefix onto systemSettingsRouter, which
// already applies requireAdminAccess([0]) before this route runs.
import express, { Router } from 'express'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { upsertReportIssuesOptions } from './system_settings.report_issues_options.service'

export const reportIssuesOptionsRouter: Router = express.Router()

reportIssuesOptionsRouter.post('/report_issues_options/add_update', writeEndpointRateLimiter, asyncRoute('Save/update report issue options', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const result = await upsertReportIssuesOptions({ actor, input: req.body })
  return res.json(result)
}))
