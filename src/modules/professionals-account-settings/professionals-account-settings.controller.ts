// modules/professionals-account-settings/professionals-account-settings.controller.ts
//
// Phase A (4th and final setting.js slice). Ports controllers/app/users/setting.js's
// /delete_user_account, /verify_email_n_delete_account, /change_email_id,
// /verify_current_email_id, /update_new_email_id, /verify_new_email_id (~1942-2311) into a
// dedicated module, split out of the core `professionals` module per the plan's per-domain
// granularity.
//
// Mounted at a temporary `_v2` prefix (routes/app.js: '/setting_account_v2') parallel to the
// untouched legacy '/setting' mount.
//
// NO CACHING (deliberate, matching legacy): none of these six routes are cached in legacy, and
// all are either one-shot OTP-flow writes or account-mutating actions — nothing here is a
// repeated, expensive read worth caching.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  deleteUserAccount, verifyEmailAndDeleteAccount, changeEmailId,
  verifyCurrentEmailId, updateNewEmailId, verifyNewEmailId,
} from './professionals-account-settings.service'
import { UserTokenResult } from './professionals-account-settings.types'

export const professionalsAccountSettingsRouter: Router = express.Router()

const OTP_VALIDATION = [
  check('otp_number').trim().not().isEmpty().withMessage('The otp number field is required.').isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.'),
]
const VERIFY_TOKEN_VALIDATION = [check('verify_token').trim().not().isEmpty().withMessage('The verify token field is required.')]

professionalsAccountSettingsRouter.get(
  '/delete_user_account',
  writeEndpointRateLimiter,
  asyncRoute('Delete user account.', async (req: Request, res: Response) => {
    const auth: UserTokenResult = checkUserLoginToken(req.headers)
    res.json(await deleteUserAccount(auth))
  }),
)

professionalsAccountSettingsRouter.post(
  '/verify_email_n_delete_account',
  writeEndpointRateLimiter,
  OTP_VALIDATION,
  asyncRoute('Verify email and delete account.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenResult = checkUserLoginToken(req.headers)
    res.json(await verifyEmailAndDeleteAccount(auth, req.body.otp_number, errObj))
  }),
)

professionalsAccountSettingsRouter.get(
  '/change_email_id',
  writeEndpointRateLimiter,
  asyncRoute('Change email id.', async (req: Request, res: Response) => {
    const auth: UserTokenResult = checkUserLoginToken(req.headers)
    res.json(await changeEmailId(auth))
  }),
)

professionalsAccountSettingsRouter.post(
  '/verify_current_email_id',
  writeEndpointRateLimiter,
  [...OTP_VALIDATION, ...VERIFY_TOKEN_VALIDATION],
  asyncRoute('Verify current email id.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenResult = checkUserLoginToken(req.headers)
    res.json(await verifyCurrentEmailId(auth, req.body.otp_number, req.body.verify_token, errObj))
  }),
)

professionalsAccountSettingsRouter.post(
  '/update_new_email_id',
  writeEndpointRateLimiter,
  [
    check('email_id').trim().not().isEmpty().withMessage('The Email ID field is required.')
      .isEmail().withMessage('The Email ID field must be contain valid email.')
      .isLength({ min: 4 }).withMessage('The Email ID field must be at least 4 characters.')
      .isLength({ max: 255 }).withMessage('The Email ID field must be less than 255 characters.'),
  ],
  asyncRoute('Update new email id.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenResult = checkUserLoginToken(req.headers)
    res.json(await updateNewEmailId(auth, req.body.email_id, errObj))
  }),
)

professionalsAccountSettingsRouter.post(
  '/verify_new_email_id',
  writeEndpointRateLimiter,
  [...OTP_VALIDATION, ...VERIFY_TOKEN_VALIDATION],
  asyncRoute('Verify new email id.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenResult = checkUserLoginToken(req.headers)
    res.json(await verifyNewEmailId(auth, req.body.otp_number, req.body.verify_token, errObj))
  }),
)
