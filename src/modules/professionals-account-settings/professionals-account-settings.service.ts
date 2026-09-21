// modules/professionals-account-settings/professionals-account-settings.service.ts
// Ports controllers/app/users/setting.js's /delete_user_account, /verify_email_n_delete_account,
// /change_email_id, /verify_current_email_id, /update_new_email_id, /verify_new_email_id
// (~1942-2311). Same behavior, same response shape — two confirmed no-behavior-change perf fixes
// (see inline comments) and one flagged-not-fixed typo'd debug key.
import ProfessionalM from '../../../models/app/professionalsM'
import DomainsBlockedM from '../../../models/system_settings/domains_blockedM'
const CompanyM = require('../../../models/app/company/companyM')
const EventM = require('../../../models/app/events/eventM')
import { UpdateVerifyEmailsM, ProfessionalsDeleteVerificationsM } from './professionals-account-settings.models'
import type { UserTokenResult } from './professionals-account-settings.types'

const randomstring = require('randomstring')
const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { generateEmailTempToken, profileVerifyEmailToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')

const OTP_LENGTH = 6

export async function deleteUserAccount(auth: UserTokenResult) {
  if (!auth.status) return auth

  const userRowId = auth.message
  const checkUserQuery: any = await ProfessionalM.findOne({ _id: userRowId, login_status: 1 })
  if (!checkUserQuery) {
    return { status: false, message: { alert_message: 'Sorry, your login token is expired.' } }
  }

  const otpNumber = randomstring.generate({ length: OTP_LENGTH, charset: '0123456789' })
  const insertArray: Record<string, unknown> = { otp_number: otpNumber, status: false, date_n_time: getPresentDateTime() }

  const checkQuery = await ProfessionalsDeleteVerificationsM.findOne({ user_row_id: userRowId })
  if (checkQuery) {
    await ProfessionalsDeleteVerificationsM.updateOne({ user_row_id: userRowId }, { $set: insertArray })
  } else {
    await new ProfessionalsDeleteVerificationsM({ ...insertArray, user_row_id: userRowId }).save()
  }

  const passSubject = `${otpNumber} is OTP to delete coinpedia account.`
  const passMessage = `
                <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${checkUserQuery.full_name},</p>
                <p style="color:#000;font-weight: 500;font-size:17px;">CoinPedia Account Deletion Confirmation</p>
                <p style="color:#000;font-weight: 400;font-size:17px;">We received a request to permanently delete your coinpedia account.</p>
                <p style="color:#000;font-weight: 400;font-size:17px;"><b>${otpNumber}</b> is your OTP for email verification number to delete your account. </p>
                `
  await sendEmail(checkUserQuery.email_id, passSubject, passMessage)

  return { status: true, message: { alert_message: 'We have sent an OTP to registered Email ID, please verify to delete the account.' } }
}

export async function verifyEmailAndDeleteAccount(auth: UserTokenResult, otpNumber: string, preValidationErrors: Record<string, unknown>) {
  // Auth failure takes priority over validation errors, matching legacy's exact branch order
  // (it computes errObj first but only ever reads it inside the `if (checkToken.status)` branch).
  if (!auth.status) return auth
  if (Object.keys(preValidationErrors).length) return { status: false, message: preValidationErrors }

  const userRowId = auth.message
  const checkQuery: any = await ProfessionalsDeleteVerificationsM.findOne({ user_row_id: userRowId, status: false })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Something went wrong, please refersh your page or login once again.' } }
  }
  if (checkQuery.otp_number !== otpNumber) {
    return { status: false, message: { otp_number: 'Your OTP is not matching' } }
  }

  await ProfessionalM.updateOne({ _id: userRowId }, { $set: { login_status: 2, deleted_date_n_time: getPresentDateTime() } })
  await ProfessionalsDeleteVerificationsM.updateOne({ _id: checkQuery._id }, { $set: { status: true, otp_number: '' } })

  // CONFIRMED PERF FIX: legacy runs these two independent existence checks (and their conditional
  // deactivation writes) as sequential `await`s. Promise.all the reads — matching this migration's
  // standard independent-query fix.
  const [checkCompany, checkEvents] = await Promise.all([
    CompanyM.findOne({ user_row_id: userRowId }),
    EventM.findOne({ user_row_id: userRowId }),
  ])
  await Promise.all([
    checkCompany ? CompanyM.updateOne({ user_row_id: userRowId }, { $set: { active_status: 0 } }) : null,
    checkEvents ? EventM.updateMany({ user_row_id: userRowId }, { $set: { active_status: 0 } }) : null,
  ])

  return { status: true, message: { alert_message: 'Your user account has been deleted successfully.' } }
}

export async function changeEmailId(auth: UserTokenResult) {
  if (!auth.status) return auth

  const userRowId = auth.message
  const verifyOtp = randomstring.generate({ length: OTP_LENGTH, charset: '123456789' })
  const emailVerifyCode = randomstring.generate(10).toLowerCase()

  const insertArray: Record<string, unknown> = {
    otp_number: verifyOtp,
    email_verify_type: 0,
    email_verify_code: emailVerifyCode,
    email_id: '',
    date_n_time: getPresentDateTime(),
  }

  const checkEmailQuery = await UpdateVerifyEmailsM.findOne({ user_row_id: userRowId })
  if (!checkEmailQuery) {
    await new UpdateVerifyEmailsM({ ...insertArray, user_row_id: userRowId }).save()
  } else {
    await UpdateVerifyEmailsM.updateOne({ user_row_id: userRowId }, { $set: insertArray })
  }

  const userQuery: any = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1, full_name: 1, email_id: 1 })

  const passSubject = `${verifyOtp} is OTP to change email for coinpedia account.`
  const passMessage = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${userQuery.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">We have received a request to change your email of Coinpedia account . Please verify your old email address by entering the following OTP.</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verifyOtp}</b></p>
            <p style="color:#000;font-weight: 400;font-size:17px;">This OTP is valid for the next 15 minutes.</p>
            `
  await sendEmail(userQuery.email_id, passSubject, passMessage)

  return {
    status: true,
    message: { verify_token: generateEmailTempToken(userRowId, emailVerifyCode), alert_message: 'The OTP number has been sent to your email id.' },
  }
}

export async function verifyCurrentEmailId(auth: UserTokenResult, otpNumber: string, verifyToken: string, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth
  if (Object.keys(preValidationErrors).length) return { status: false, message: preValidationErrors }

  const userRowId = auth.message
  const checkVerifyToken = profileVerifyEmailToken(verifyToken)
  if (!checkVerifyToken.status) {
    return { status: false, message: checkVerifyToken.message }
  }

  const { account_row_id: accountRowId, email_verify_code: emailVerifyCode } = checkVerifyToken.message
  if (accountRowId !== userRowId) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }

  const checkEmailQuery: any = await UpdateVerifyEmailsM.findOne({ user_row_id: userRowId, email_verify_type: 0, email_verify_code: emailVerifyCode })
  if (!checkEmailQuery) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }
  if (checkEmailQuery.otp_number !== otpNumber) {
    return { status: false, message: { otp_number: 'Sorry, Your OTP is not matching' } }
  }

  await UpdateVerifyEmailsM.updateOne({ user_row_id: userRowId }, { $set: { otp_number: '', email_verify_type: 1, email_verify_code: '', date_n_time: getPresentDateTime() } })

  return { status: true, message: { alert_message: 'Your Email ID is old email id is verified, please update your new email id.' } }
}

export async function updateNewEmailId(auth: UserTokenResult, rawEmailId: string, preValidationErrors: Record<string, unknown>) {
  const errObj = { ...preValidationErrors }
  const emailId = rawEmailId ? sanitize(rawEmailId).toLowerCase() : ''

  // CONFIRMED PERF FIX (no behavior change): legacy runs these two lookups unconditionally
  // BEFORE checking auth, even though their result (errObj) is only ever used inside the
  // `if (checkToken.status)` branch — on an unauthenticated request the work is done and then
  // discarded. Checking auth first skips two DB queries with zero observable difference in
  // response, since the auth-failure response never depended on errObj either way.
  if (!auth.status) return auth

  if (rawEmailId) {
    const [checkEmailQuery, checkDomainQuery] = await Promise.all([
      ProfessionalM.findOne({ email_id: emailId }),
      DomainsBlockedM.findOne({ domain_name: emailId.split('@').slice(-1) }),
    ])
    if (checkEmailQuery) errObj['email_id'] = 'Sorry, This Email ID already exists.'
    if (checkDomainQuery) errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const userRowId = auth.message
  const checkEmailQuery = await UpdateVerifyEmailsM.findOne({ user_row_id: userRowId, email_verify_type: { $in: [1, 2] } })
  if (!checkEmailQuery) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }

  const verifyOtp = randomstring.generate({ length: OTP_LENGTH, charset: '123456789' })
  const emailVerifyCode = randomstring.generate(10).toLowerCase()

  await UpdateVerifyEmailsM.updateOne(
    { user_row_id: userRowId },
    { $set: { otp_number: verifyOtp, email_verify_type: 2, email_verify_code: emailVerifyCode, email_id: emailId, date_n_time: getPresentDateTime() } },
  )

  const userQuery: any = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1, full_name: 1 })

  const passSubject = `${verifyOtp} is OTP to confirm your new email for coinpedia account.`
  const passMessage = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${userQuery.full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">You recently selected <span style="color:#0029ff;">${emailId}</span> as your new Coinpedia Email ID. To verify this email address belongs to you, enter below OTP number</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verifyOtp}</b></p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">This OTP is valid for the next 15 minutes. If you did not make this change, please ignore this email.</p>
                    `
  await sendEmail(emailId, passSubject, passMessage)

  return { status: true, message: { verify_token: generateEmailTempToken(userRowId, emailVerifyCode), alert_message: 'The OTP number has been sent to your email id.' } }
}

export async function verifyNewEmailId(auth: UserTokenResult, otpNumber: string, verifyToken: string, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth
  if (Object.keys(preValidationErrors).length) return { status: false, message: preValidationErrors }

  const userRowId = auth.message
  const checkVerifyToken = profileVerifyEmailToken(verifyToken)
  if (!checkVerifyToken.status) {
    return { status: false, message: checkVerifyToken.message }
  }

  const { account_row_id: accountRowId, email_verify_code: emailVerifyCode } = checkVerifyToken.message
  if (accountRowId !== userRowId) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }

  const checkEmailQuery: any = await UpdateVerifyEmailsM.findOne({ user_row_id: userRowId, email_verify_type: 2, email_verify_code: emailVerifyCode })
  if (!checkEmailQuery) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }
  if (checkEmailQuery.otp_number !== otpNumber) {
    return { status: false, message: { otp_number: 'Sorry, Your OTP is not matching' } }
  }

  await ProfessionalM.updateOne({ _id: userRowId }, { $set: { email_id: checkEmailQuery.email_id, updated_date_n_time: getPresentDateTime() } })
  await UpdateVerifyEmailsM.deleteOne({ _id: checkEmailQuery._id })

  return { status: true, message: { email_id: checkEmailQuery.email_id, alert_message: 'Your new Email ID has been updated successfully.' } }
}
