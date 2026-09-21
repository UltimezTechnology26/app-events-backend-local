// modules/professionals-delete-lifecycle/professionals-delete-lifecycle.controller.ts
//
// Phase F of the Professionals migration (see plan doc). Ports the 5 delete/recover-lifecycle
// routes out of controllers/admin_panel/app/user.js (~3537-3927) into a dedicated module.
//
// Mounted at a temporary `_v2` prefix (routes/admin_panel.js: '/users_delete_lifecycle_v2')
// parallel to the untouched legacy '/users' mount.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getDeleteRequestsList, recoverAccount, getDeletedList, getRecoveredList } from './professionals-delete-lifecycle.service'
import { AdminAuthResult } from './professionals-delete-lifecycle.types'
// The admin panel's own direct Delete button now routes through the pending -> approve -> publish
// gate (user-requested 2026-09-20) instead of an immediate hard delete — see
// professionals.lifecycle-request.service.ts. `deleteUser`'s underlying hard-delete logic
// (deleteUserDetais) is still used, just now called from professionals.lifecycle-apply.ts at
// publish time instead of directly from this route.
import { submitDeleteUserRequest } from '../professionals/professionals.lifecycle-request.service'

export const professionalsDeleteLifecycleRouter: Router = express.Router()

const DELETE_LIFECYCLE_ACCESS_IDS = [1]

professionalsDeleteLifecycleRouter.get('/delete_requests/:skip/:limit', asyncRoute('Users requested to delete account list', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, DELETE_LIFECYCLE_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getDeleteRequestsList(req.params.skip as string, req.params.limit as string, req.query.search as string))
}))

professionalsDeleteLifecycleRouter.get(
  '/recover_account/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Recover account.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, DELETE_LIFECYCLE_ACCESS_IDS)
    res.json(await recoverAccount(auth, Number.parseInt(req.params.user_row_id as string), req.query.action_reason))
  }),
)

professionalsDeleteLifecycleRouter.get(
  '/delete_user/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Delete User.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, DELETE_LIFECYCLE_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await submitDeleteUserRequest(auth, req.params.user_row_id as string))
  }),
)

professionalsDeleteLifecycleRouter.get('/deleted_list/:skip/:limit', asyncRoute('Deleted users list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, DELETE_LIFECYCLE_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getDeletedList(req.params.skip as string, req.params.limit as string, req.query.search as string))
}))

professionalsDeleteLifecycleRouter.get('/recovered_list/:skip/:limit', asyncRoute('Recovered users list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, DELETE_LIFECYCLE_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getRecoveredList(req.params.skip as string, req.params.limit as string, req.query.search as string))
}))
