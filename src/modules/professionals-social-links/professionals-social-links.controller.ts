// modules/professionals-social-links/professionals-social-links.controller.ts
//
// Phase A (4-way setting.js split). Ports controllers/app/users/setting.js's
// /update_social_media_details (~855-918) and /update_user_social_media_details (~948-1005) into
// a dedicated module, split out of the core `professionals` module per the plan's per-domain
// granularity.
//
// Mounted at a temporary `_v2` prefix (routes/app.js: '/setting_social_links_v2') parallel to the
// untouched legacy '/setting' mount — legacy setting.js has hundreds of other routes not in this
// phase's scope and stays fully live.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken, checkApiKey } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { updateSocialMediaDetails, updateUserSocialMediaDetailsNoLogin } from './professionals-social-links.service'
import { UserAuthResult } from './professionals-social-links.types'

export const professionalsSocialLinksRouter: Router = express.Router()

professionalsSocialLinksRouter.post(
  '/update_social_media_details',
  writeEndpointRateLimiter,
  asyncRoute('Update user profile.', async (req: Request, res: Response) => {
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await updateSocialMediaDetails(auth, req.body))
  }),
)

// checkApiKey here is a no-op in practice — index.js already applies `app.use(checkApiKey)`
// globally before any route is reached — but ported for fidelity with the legacy route
// declaration rather than silently dropped.
professionalsSocialLinksRouter.post(
  '/update_user_social_media_details',
  checkApiKey,
  writeEndpointRateLimiter,
  [check('user_row_id').trim().not().isEmpty().withMessage('The user row id field is required.')],
  asyncRoute('Update user social media details (no login).', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    res.json(await updateUserSocialMediaDetailsNoLogin(req.body, errObj))
  }),
)
