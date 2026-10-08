// modules/community-admin/community-admin.overview.controller.ts
//
// Phase 3 slice of the Community migration (Overview page). Ports routes out of
// controllers/admin_panel/main/community/overview.js. CUTOVER COMPLETE (2026-10-07): that legacy
// file and its mount are gone; this module now owns the plain '/community/overview' path (no
// more `_v2` suffix) with no parallel legacy sibling.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getOverviewDetails, getGroupOverviewDetails } from './community-admin.overview.service'

export const communityOverviewRouter: Router = express.Router()

const COMMUNITY_OVERVIEW_ACCESS_IDS = [13]

communityOverviewRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, COMMUNITY_OVERVIEW_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

communityOverviewRouter.get(
  '/details',
  asyncRoute('Community overview details.', async (req, res) => {
    res.json(await getOverviewDetails(req.query.date as string | undefined))
  }),
)

communityOverviewRouter.get(
  '/group_details/:group_id',
  asyncRoute('Community overview group details.', async (req, res) => {
    res.json(await getGroupOverviewDetails(req.params.group_id as string))
  }),
)
