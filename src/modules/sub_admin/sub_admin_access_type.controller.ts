// Ports controllers/admin_panel/sub_admin.js's access-type/manager-roles
// routes (lines 362-480) into this module's convention. Dual-mounted at
// /sub_admin_v2 (routes/admin_panel.js, same prefix as sub_admin.controller.ts's
// subAdminRouter - Express merges multiple routers on one prefix fine,
// matching how /sub_admin itself already serves both from one legacy file).
import express, { Router } from 'express'
const { check, validationResult } = require('express-validator')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { addAccessTypeStub, listAccessTypes, updateAccessType, refreshAccessType } from './sub_admin_access_type.service'

const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')

export const subAdminAccessTypeRouter: Router = express.Router()
subAdminAccessTypeRouter.use(requireAdminAccess([0]))

subAdminAccessTypeRouter.get('/add_access_type', asyncRoute('Add access type.', async (_req, res) => {
  const result = await addAccessTypeStub()
  return res.json(result)
}))

subAdminAccessTypeRouter.get('/access_types', asyncRoute('Access types list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await listAccessTypes()
  return res.json(result)
}))

subAdminAccessTypeRouter.post('/update_access_type/:request_row_id', [
  check('description').optional({ nullable: true }).isString(),
  check('responsibilities').optional({ nullable: true }).isArray(),
  check('can_extra').optional({ nullable: true }).isArray(),
  check('cant_extra').optional({ nullable: true }).isArray(),
], asyncRoute('Update access type.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await updateAccessType(String(req.params.request_row_id), req.body, errObj)
  return res.json(result)
}))

subAdminAccessTypeRouter.post('/refresh_access_type/:request_row_id', asyncRoute('Refresh access type.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await refreshAccessType(String(req.params.request_row_id))
  return res.json(result)
}))
