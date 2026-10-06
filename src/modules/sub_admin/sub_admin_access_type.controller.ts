// Manager Roles access-type routes, mounted at /sub_admin_v2 alongside
// sub_admin.controller.ts's subAdminRouter (Express merges both on one prefix).
// Super-admin only: list access types, AI-refresh a role's description text,
// and read / AI-refresh the overall sub-admin type guide.
import express, { Router } from 'express'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { listAccessTypes, refreshAccessType } from './sub_admin_access_type.service'
import { getTypeGuide, refreshTypeGuide } from './sub_admin_type_guide.service'

const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')

export const subAdminAccessTypeRouter: Router = express.Router()
subAdminAccessTypeRouter.use(requireAdminAccess([0]))

subAdminAccessTypeRouter.get('/access_types', asyncRoute('Access types list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await listAccessTypes()
  return res.json(result)
}))

subAdminAccessTypeRouter.post('/refresh_access_type/:request_row_id', asyncRoute('Refresh access type.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await refreshAccessType(String(req.params.request_row_id))
  return res.json(result)
}))

subAdminAccessTypeRouter.get('/type_guide', asyncRoute('Sub admin type guide.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  return res.json(await getTypeGuide())
}))

subAdminAccessTypeRouter.post('/refresh_type_guide', asyncRoute('Refresh sub admin type guide.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  return res.json(await refreshTypeGuide())
}))
