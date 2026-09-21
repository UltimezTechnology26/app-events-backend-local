// modules/professionals-seo/professionals-seo.controller.ts
//
// Phase A (4-way setting.js split). Ports controllers/app/users/setting.js's /update_user_seo
// (~2378-2514) and /get_user_seo/:user_row_id (~2519-2779) into a dedicated module, split out of
// the core `professionals` module per the plan's per-domain granularity.
//
// Mounted at a temporary `_v2` prefix (routes/app.js: '/setting_seo_v2') parallel to the
// untouched legacy '/setting' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { updateUserSeo, getUserSeo } from './professionals-seo.service'
import { UserAuthResult } from './professionals-seo.types'

export const professionalsSeoRouter: Router = express.Router()

professionalsSeoRouter.post(
  '/update_user_seo',
  writeEndpointRateLimiter,
  [
    check('module_id').not().isEmpty().withMessage('The User ID field is required.'),
    check('meta_title').not().isEmpty().withMessage('The Meta Title field is required.'),
    check('meta_description').not().isEmpty().withMessage('The Meta Description field is required.'),
    check('meta_keywords').not().isEmpty().withMessage('The Meta Keywords field is required.'),
  ],
  asyncRoute('Update user SEO error:', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    if (Object.keys(errObj).length > 0) return res.json({ status: false, message: errObj })

    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await updateUserSeo(auth, req.body))
  }),
)

professionalsSeoRouter.get(
  '/get_user_seo/:user_row_id',
  asyncRoute('Get User seo error:', async (req: Request, res: Response) => {
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await getUserSeo(auth, req.params.user_row_id as string))
  }),
)
