// modules/community-admin/community-admin.groups.controller.ts
//
// Phase 3 slice of the Community migration (Manage Community / Groups). Ports the routes out of
// controllers/admin_panel/main/community/groups.js. Mounted at a temporary `_v2` prefix
// ('/community/groups_v2') parallel to the untouched legacy '/admin_panel/community/groups' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { saveGroup, getGroupList, deleteGroup } from './community-admin.groups.service'

export const communityGroupsRouter: Router = express.Router()

const COMMUNITY_GROUPS_ACCESS_IDS = [13]

communityGroupsRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, COMMUNITY_GROUPS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

communityGroupsRouter.post(
  '/add_n_update_details',
  writeEndpointRateLimiter,
  [
    check('name').trim().notEmpty().withMessage('Group name is required.'),
    check('hashtag').trim().notEmpty().withMessage('Hashtag is required.'),
    check('icon').trim().notEmpty().withMessage('Icon is required.'),
    check('group_id').optional().isInt().withMessage('Group ID must be an integer.'),
  ],
  asyncRoute('Community group save.', async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await saveGroup({
      groupIdRaw: req.body.group_id,
      name: req.body.name,
      hashtag: req.body.hashtag,
      icon: req.body.icon,
    })
    res.json(result)
  }),
)

communityGroupsRouter.get(
  '/group_list',
  asyncRoute('Community group list.', async (_req, res) => {
    res.json(await getGroupList())
  }),
)

communityGroupsRouter.get(
  '/delete_group/:group_id',
  writeEndpointRateLimiter,
  asyncRoute('Community group delete.', async (req, res) => {
    res.json(await deleteGroup(req.params.group_id as string))
  }),
)
