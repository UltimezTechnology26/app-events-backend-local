// modules/professionals-audit/professionals-audit.controller.ts
//
// Phase G of the Professionals migration (see plan doc). Ports 4 ancillary/audit routes out of
// controllers/admin_panel/app/user.js (~4618-5185) into a dedicated module. `/user_followers` and
// `/login_into_account` are deliberately NOT included here — the plan's model-to-module mapping
// assigns the followers workflow (including these two admin routes) to its own, not-yet-built
// `professionals-followers` module, not this "audit" one.
//
// Mounted at a temporary `_v2` prefix (routes/admin_panel.js: '/users_audit_v2') parallel to the
// untouched legacy '/users' mount.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, checkApiKey } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getIpAddressList, getPointsList, getChangeLogs, getSeoOverview } from './professionals-audit.service'
import { AdminAuthResult } from './professionals-audit.types'

export const professionalsAuditRouter: Router = express.Router()

const AUDIT_ACCESS_IDS = [1]

professionalsAuditRouter.get('/users_ip_address_list/:skip/:limit', asyncRoute('Users ip address list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, AUDIT_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getIpAddressList(req.params.skip as string, req.params.limit as string, req.query.search as string, req.query.domain as string))
}))

professionalsAuditRouter.get('/points_list', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, AUDIT_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  try {
    res.json(await getPointsList(req.query.point_type as string, req.query.status as string, req.query.search as string))
  } catch (error) {
    console.error('Error fetching points list:', error)
    res.status(500).json({ status: false, message: 'Internal Server Error' })
  }
})

// CONFIRMED BUG FIX: legacy had NO admin-token check on this route at all — see
// professionals-audit.service.ts's getChangeLogs doc comment for the full reasoning (mirrors
// Phase A's precedent on GET /overview).
professionalsAuditRouter.get('/change_logs/:module_type/:module_id', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, AUDIT_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  try {
    const result = await getChangeLogs(req.params.module_type as string, req.params.module_id as string, {
      search: req.query.search as string,
      userType: req.query.user_type as string,
      dateFrom: req.query.date_from as string,
      dateTo: req.query.date_to as string,
      pageRaw: req.query.page as string,
      limitRaw: req.query.limit as string,
    })
    res.json(result)
  } catch (error: any) {
    console.error('Error fetching change logs:', error)
    res.status(500).json({ status: false, message: 'Internal Server Error', error: error?.message })
  }
})

// Matches legacy's own gate: `checkApiKey` only (no admin-token check) — same pattern already
// documented for /new_years_overview and /new_users_overview in Phase A's professionals module.
professionalsAuditRouter.get('/seo_overview', checkApiKey, async (req: Request, res: Response) => {
  try {
    res.json(await getSeoOverview())
  } catch (error: any) {
    console.error('SEO Overview Error:', error)
    res.status(500).json({ status: false, message: 'Internal Server Error', error: error.message })
  }
})
