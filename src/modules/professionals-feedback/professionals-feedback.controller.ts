// modules/professionals-feedback/professionals-feedback.controller.ts
// Ports controllers/app/users/feedback.js (self-service — distinct from the still-legacy admin
// admin_panel/app/feedback.js). Mounted at a `_v2` suffix parallel to the untouched legacy
// '/feedback' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { saveFeedbackDetails, getFeedbackIssuesOptionsList, submitIssue } from './professionals-feedback.service'
import { UserTokenAuthResult } from './professionals-feedback.types'

export const professionalsFeedbackRouter: Router = express.Router()

professionalsFeedbackRouter.post(
  '/save_details',
  writeEndpointRateLimiter,
  [
    check('feedback_type').not().isEmpty().withMessage('The Feedback Type field is required'),
    check('message').not().isEmpty().withMessage('The Message field is required').isLength({ min: 4 }).withMessage('The Message field must be at least 6 characters in length.'),
    check('website_rating').not().isEmpty().withMessage('The Website Rating field is required'),
    check('speed_rating').not().isEmpty().withMessage('The Speed Rating field is required'),
  ],
  asyncRoute('Save feedback details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await saveFeedbackDetails(auth, req.body, errObj))
  }),
)

professionalsFeedbackRouter.get('/list', asyncRoute('List report issue options.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await getFeedbackIssuesOptionsList(auth, req.query as Record<string, unknown>))
}))

professionalsFeedbackRouter.post(
  '/submite_issues',
  writeEndpointRateLimiter,
  [
    check('module_type').isInt().withMessage('Module type is required'),
    check('module_row_id').isInt().withMessage('Module row id is required'),
    check('tab_key').trim().notEmpty().withMessage('Tab key is required'),
    check('tab_name').trim().notEmpty().withMessage('Tab name is required'),
    check('option_id').isInt().withMessage('Issue option is required'),
    check('description').optional().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  ],
  asyncRoute('Submit issue.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await submitIssue(auth, req.body, errObj))
  }),
)
