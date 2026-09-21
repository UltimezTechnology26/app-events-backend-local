// modules/professionals/professionals.self-service.controller.ts
//
// Ports controllers/app/users/setting.js's POST /update_user_details (~45-445) — the first of
// setting.js's remaining 17 unmigrated routes (see plan doc's gap analysis, 2026-09-11).
//
// Mounted at a temporary `_v2` prefix (routes/app.js: '/setting_profile_v2') parallel to the
// untouched legacy '/setting' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken, checkAdminLoginToken, checkUserLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  updateUserDetails, getProfileScore, getAllUsersProfileScores, updateUserDetailsApi,
  getUsersProfessionalDetailsResponse, getUserIndividualDetailsResponse, getNewUserIndividualDetails,
  updateUsername, verifyEmailAccount, resendOtp, changeMobileNumber,
  getCompanySuggestionListResponse, getCompanySuggestionResponse, getUserSuggestionResponse,
  updateWalletAddress, updatePushNotification, getPublicStatusList,
} from './professionals.self-service.service'
import { UserAuthResult, UserTokenAuthResult } from './professionals.self-service.types'

export const professionalsSelfServiceRouter: Router = express.Router()

professionalsSelfServiceRouter.post(
  '/update_user_details',
  writeEndpointRateLimiter,
  [
    check('gender').trim().isInt({ min: 1, max: 3 }).withMessage('The gender field value must be contain 1,2 or 3.'),
    check('full_name').trim().not().isEmpty().withMessage('The Full Name field is required.').isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.').isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('account_visible_type').trim().isInt({ min: 1, max: 2 }).withMessage('The account visible type field value must be contain 1 or 2.'),
    check('user_bio').trim().not().isEmpty().withMessage('The User Bio field is required.'),
    check('designation_id').not().isEmpty().withMessage('The Designation Id field is required.'),
    check('about_in_one_line').not().isEmpty().withMessage('The About in One Line field is required.'),
  ],
  asyncRoute('Update user profile.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await updateUserDetails(auth, req.body, errObj))
  }),
)

// Access id [0] preserved exactly — see professionals-followers.service.ts's doc comment.
professionalsSelfServiceRouter.get('/profile_score', asyncRoute('Profile score.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [0])
  const result = await getProfileScore(auth, req.query.user_row_id, req.query.score)
  res.status(result.httpStatus).json(result.body)
}))

// Access id [0] preserved exactly — see professionals-followers.service.ts's doc comment.
professionalsSelfServiceRouter.get('/all_users_profile_scores/:skip/:limit', asyncRoute('All users profile scores.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = checkAdminLoginToken(req.headers, [0])
  res.json(await getAllUsersProfileScores(auth, req.params.skip as string, req.params.limit as string))
}))

// No-login-token (checkApiKey-only) route — matches legacy exactly (no auth check here at all).
professionalsSelfServiceRouter.post(
  '/update_user_details_api',
  writeEndpointRateLimiter,
  [check('full_name').trim().not().isEmpty().withMessage('The Full Name field is required.').isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.').isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.')],
  asyncRoute('Update user profile.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    res.json(await updateUserDetailsApi(req.body, errObj))
  }),
)

professionalsSelfServiceRouter.get('/users_professional_details', asyncRoute('users_professional_details', async (req: Request, res: Response) => {
  res.json(await getUsersProfessionalDetailsResponse())
}))

professionalsSelfServiceRouter.get('/user_individual_details', asyncRoute('User personal details.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getUserIndividualDetailsResponse(auth, req.query.user_row_id, req.query.include_pending_overlay === 'true'))
}))

// No-login-token (checkApiKey-only) route — matches legacy exactly.
professionalsSelfServiceRouter.get('/new_user_individual_details', asyncRoute('User personal details.', async (req: Request, res: Response) => {
  res.json(await getNewUserIndividualDetails(req.query.user_row_id, req.query.api_for_type))
}))

professionalsSelfServiceRouter.post(
  '/update_username',
  writeEndpointRateLimiter,
  [
    check('user_name').trim().not().isEmpty().withMessage('The username field is required.')
      .isLength({ min: 4 }).withMessage('The username field must be at least 4 characters.')
      .isLength({ max: 50 }).withMessage('The username field must be less than 255 characters.'),
  ],
  asyncRoute('Update Username.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await updateUsername(auth, req.body.user_name, errObj))
  }),
)

professionalsSelfServiceRouter.post(
  '/verify_email_account',
  writeEndpointRateLimiter,
  [check('otp_number').trim().not().isEmpty().withMessage('The otp number field is required.')
    .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.')],
  asyncRoute('Verify email account.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await verifyEmailAccount(auth, req.body.otp_number, errObj))
  }),
)

professionalsSelfServiceRouter.get('/resend_otp', writeEndpointRateLimiter, asyncRoute('Resend OTP.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await resendOtp(auth))
}))

professionalsSelfServiceRouter.post(
  '/change_mobile_number',
  writeEndpointRateLimiter,
  [
    check('mobile_number').trim().not().isEmpty().withMessage('The Mobile Number field is required.')
      .isLength({ min: 5 }).withMessage('The Mobile Number field must be at least 5 characters in length.')
      .isLength({ max: 20 }).withMessage('The Mobile Number field must be less than or equal to 20 characters in length.'),
  ],
  asyncRoute('Change mobile number.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await changeMobileNumber(auth, req.body, errObj))
  }),
)

professionalsSelfServiceRouter.get('/company_suggestion_list/:search_value', asyncRoute('Company suggestions.', async (req: Request, res: Response) => {
  res.json(await getCompanySuggestionListResponse(req.params.search_value as string))
}))

professionalsSelfServiceRouter.get('/company_suggestion/:search_value', asyncRoute('Company suggestion.', async (req: Request, res: Response) => {
  res.json(await getCompanySuggestionResponse(req.params.search_value as string))
}))

professionalsSelfServiceRouter.get('/user_suggestion/:search_value', asyncRoute('User suggestion.', async (req: Request, res: Response) => {
  res.json(await getUserSuggestionResponse(req.params.search_value as string))
}))

professionalsSelfServiceRouter.post(
  '/update_wallet_address',
  writeEndpointRateLimiter,
  [check('wallet_address').trim().not().isEmpty().withMessage('The Wallet Address field is required.')],
  asyncRoute('Update wallet address.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await updateWalletAddress(auth, req.body.wallet_address, errObj))
  }),
)

professionalsSelfServiceRouter.get('/update_push_notification', writeEndpointRateLimiter, asyncRoute('Update push notification.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await updatePushNotification(auth, req.query.push_notification_status))
}))

// Legacy quirk preserved: no hard auth gate — falls back to req.query.user_row_id when unauthenticated.
professionalsSelfServiceRouter.get('/public_status_list', asyncRoute('Public status list.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await getPublicStatusList(auth, req.query.user_row_id))
}))
