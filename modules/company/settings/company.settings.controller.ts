// modules/company/company.settings.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkUserLoginToken, checkAllLoginToken, verifyEmailTempToken, checkApiKey } = require('../../../middleware/authorization')
const { arrangeValidation } = require('../../../utils/helpers/helper')
import {
  saveOrUpdateBasicCompanyDetails,
  saveOrUpdateBasicCompanyDetailsTeamPanel,
  saveOrUpdateSocialDetails,
  saveOrUpdateSocialMediaDetailsTeamPanel,
  getIndividualDetails,
  getIndividualDetailsTeamPanel,
  updateCompanyLogo,
  removeCompanyLogo,
  followCompany,
  unfollowCompany,
  removeFollower,
  getCompanyFollowersList,
  getCompanyWalletAddressList,
  addCompanyWalletAddress,
  verifyCompanyEmailOtp,
  sendEmailOtp,
  updateCompanySeo,
  getCompanySeo,
} from './company.settings.service'
import {
  updateBasicCompanyDetailsValidation,
  updateNewBasicCompanyDetailsValidation,
  updateSocialDetailsValidation,
  updateSocialMediaDetailsValidation,
  addCompanyWalletAddressValidation,
  verifyCompanyEmailOtpValidation,
  updateCompanySeoValidation,
} from './company.settings.validation'

/**
 * Ports controllers/app/company/setting.js's 19 routes (Part 3 §7 Phase G step 1) — folded
 * into modules/company/ rather than a new module, per the user's explicit direction (mounted
 * at the same '/company/setting' path prefix to preserve every existing frontend call site
 * unchanged). 2 dead, fully-commented-out routes (remove_company_wallet, remove_podcast_id)
 * are not ported — there was no live logic to carry forward.
 */
export const companySettingsRouter: Router = express.Router()

companySettingsRouter.post('/update_basic_company_details', updateBasicCompanyDetailsValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await saveOrUpdateBasicCompanyDetails({ actor, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Update company details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

// without token api for team
companySettingsRouter.post('/update_new_basic_company_details', checkApiKey, updateNewBasicCompanyDetailsValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const result = await saveOrUpdateBasicCompanyDetailsTeamPanel({ body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Update company details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companySettingsRouter.post('/update_social_details', updateSocialDetailsValidation, async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const errObj = arrangeValidation(validationResult(req))
    const result = await saveOrUpdateSocialDetails({ actor, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

// without token api for team panel
companySettingsRouter.post('/update_social_media_details', updateSocialMediaDetailsValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const result = await saveOrUpdateSocialMediaDetailsTeamPanel({ body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

companySettingsRouter.get('/individual_details', async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await getIndividualDetails({ actor, queryCompanyRowId: req.query.company_row_id as string | undefined })
    res.json(result)
  } catch (err: any) {
    console.log('Company details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

// without login token api for team panel
companySettingsRouter.get('/individual_company_details/:user_row_id', checkApiKey, async (req: Request, res: Response) => {
  try {
    const result = await getIndividualDetailsTeamPanel({ queryCompanyRowId: req.query.company_row_id as string | undefined })
    res.json(result)
  } catch (err: any) {
    console.log('Company details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companySettingsRouter.post('/update_company_logo', async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await updateCompanyLogo({ actor, body: req.body })
    res.json(result)
  } catch (err: any) {
    console.log('Update company logo.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companySettingsRouter.get('/remove_company_logo', async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await removeCompanyLogo({ actor, queryCompanyRowId: req.query.company_row_id })
    res.json(result)
  } catch (err: any) {
    console.log('Update company logo.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companySettingsRouter.get('/follow/:following_company_row_id', async (req: Request, res: Response) => {
  try {
    const checkUserToken = checkUserLoginToken(req.headers)
    const result = await followCompany({ checkUserToken, followingCompanyRowIdRaw: req.params.following_company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Follow company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companySettingsRouter.get('/unfollow/:following_company_row_id', async (req: Request, res: Response) => {
  try {
    const checkUserToken = checkUserLoginToken(req.headers)
    const result = await unfollowCompany({ checkUserToken, followingCompanyRowIdRaw: req.params.following_company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Unfollow company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companySettingsRouter.get('/remove_follower/:follower_user_row_id', async (req: Request, res: Response) => {
  try {
    const checkUserToken = checkUserLoginToken(req.headers)
    const result = await removeFollower({ checkUserToken, followerUserRowIdRaw: req.params.follower_user_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Remove Follower.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companySettingsRouter.get('/company_followers/:company_row_id', async (req: Request, res: Response) => {
  try {
    const result = await getCompanyFollowersList({ companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Company followers.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companySettingsRouter.get('/company_wallet_address_list', async (req: Request, res: Response) => {
  const checkUserToken = checkUserLoginToken(req.headers)
  try {
    const result = await getCompanyWalletAddressList({ checkUserToken })
    res.json(result)
  } catch (err: any) {
    console.log('Company wallet address list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companySettingsRouter.post('/add_company_wallet_address', addCompanyWalletAddressValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const checkUserToken = checkUserLoginToken(req.headers)
    const result = await addCompanyWalletAddress({ checkUserToken, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Add company wallet address list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companySettingsRouter.post('/verify_company_email_otp', verifyCompanyEmailOtpValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const checkUserToken = verifyEmailTempToken(req.headers)
    const result = await verifyCompanyEmailOtp({ checkUserToken, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Verify company email otp.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// email_verify_otp
companySettingsRouter.get('/send_email_otp', async (req: Request, res: Response) => {
  try {
    const checkUserToken = checkUserLoginToken(req.headers)
    const result = await sendEmailOtp({ checkUserToken })
    res.json(result)
  } catch (err: any) {
    console.log('Send email otp.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companySettingsRouter.post('/update_company_seo', updateCompanySeoValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await updateCompanySeo({ actor, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Update company SEO error:', err.message, err)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

companySettingsRouter.get('/get_company_seo/:company_id', async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await getCompanySeo({ actor, companyId: req.params.company_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Get company SEO error:', err)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})
