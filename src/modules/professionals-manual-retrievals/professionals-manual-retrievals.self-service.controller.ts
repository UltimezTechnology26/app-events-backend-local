// modules/professionals-manual-retrievals/professionals-manual-retrievals.self-service.controller.ts
// Ports controllers/app/users/manual_users.js (self-service — distinct from the admin-panel
// manual_users.js already covered by professionals-manual-retrievals.controller.ts / Phase C).
// Mounted at a `_v2` suffix parallel to the untouched legacy '/manual_users' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { updateManualDetail, editManualDetail } from './professionals-manual-retrievals.self-service.service'

export const professionalsManualRetrievalsSelfServiceRouter: Router = express.Router()

professionalsManualRetrievalsSelfServiceRouter.post(
  '/update_manual_detail',
  writeEndpointRateLimiter,
  [check('full_name').trim().not().isEmpty().withMessage('The Full Name field is required.')],
  asyncRoute('Update manual user details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    res.json(await updateManualDetail(req.body, errObj))
  }),
)

professionalsManualRetrievalsSelfServiceRouter.post(
  '/edit_manual_detail',
  writeEndpointRateLimiter,
  [check('user_row_id').trim().not().isEmpty().withMessage('The Manual user row id field is required.')],
  asyncRoute('Edit manual user details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const result: any = await editManualDetail(req.body, Boolean(req.files), errObj)
    // Legacy quirk preserved: the error-path response also echoes req.files verbatim (a debug
    // leftover) — not carried into the success path.
    if (!result.status) result.req = req.files
    res.json(result)
  }),
)
