// modules/professionals-profile-images/professionals-profile-images.controller.ts
//
// Phase A (4-way setting.js split). Ports controllers/app/users/setting.js's
// /update_profile_image (~1767-1877) and /remove_profile_image (~1879-1939) into a dedicated
// module, split out of the core `professionals` module per the plan's per-domain granularity.
//
// Mounted at a temporary `_v2` prefix (routes/app.js: '/setting_profile_images_v2') parallel to
// the untouched legacy '/setting' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { updateProfileImage, removeProfileImage } from './professionals-profile-images.service'
import { UserAuthResult } from './professionals-profile-images.types'

export const professionalsProfileImagesRouter: Router = express.Router()

professionalsProfileImagesRouter.post(
  '/update_profile_image',
  writeEndpointRateLimiter,
  [check('profile_image_type').isInt({ min: 0, max: 8 }).withMessage('Profile image type field must be at greater than or equal to 0 and less than equal to 8 number.')],
  asyncRoute('Update profile image.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await updateProfileImage(auth, req.body, errObj))
  }),
)

professionalsProfileImagesRouter.get(
  '/remove_profile_image',
  writeEndpointRateLimiter,
  asyncRoute('Remove profile image.', async (req: Request, res: Response) => {
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await removeProfileImage(auth, req.query.user_row_id))
  }),
)
