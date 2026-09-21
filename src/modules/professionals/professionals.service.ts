// modules/professionals/professionals.service.ts
//
// Ports user.js's /create_new_user (~2166-2353), /update_user (~2353-2573), /enable_user
// (~2573-2654), /disable_user (~2654-2756), /users_pages (~2099-2166), and /public_status_list
// (~4593-4618).
const sanitize = require('mongo-sanitize')
const { validateAndSaveImage, getIntIdFromArray, deleteImageDigitalOcean, checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { sendEmail } = require('../../../config/email')
const { shiftUserFromManualToRegister } = require('../../../utils/helpers/events_helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
const companyM = require('../../../models/app/company/companyM')
const eventM = require('../../../models/app/events/eventM')
const userPodcastsM = require('../../../models/app/podcast/userPodcastsM')
const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')
const employees_requestsM = require('../../../models/app/company/employees_requestsM')
const default_profile_imgM = require('../../../models/app/static/default_profile_imgM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
import { ProfessionalM, ProfessionalSocialLinksM, ProfessionalSeoDetailsM, ProfessionalProfileImagesM, ProfessionalDisabledM } from './professionals.models'
import { getUsersPagesList, findConflictingUserFields, findConflictingUserFieldsForCreate } from './professionals.queries'
import { invalidateProfessionalsCaches } from './professionals.cache'
import { recordProfessionalStatusChange } from './professionals.audit'
import { AdminAuthResult } from './professionals.types'

const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')

/** Ports /users_pages (~2099-2166) verbatim (no logic change — see professionals.queries.ts). */
export async function getUsersPages(search?: string) {
  const queryRun = await getUsersPagesList(search)
  return { status: true, message: queryRun }
}

/** Ports /public_status_list/:user_row_id (~4593-4618) verbatim. */
export async function getPublicStatusList(userRowIdRaw: string) {
  const user_row_id = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(user_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }
  const query = await professionals_work_experienceM.find({ user_row_id, till_date_status: 2 }, { position: 1, company_name: 1, public_view: 1 })
  return { status: true, message: query }
}

function buildSocialLinksArray(body: Record<string, unknown>, userRowId: number) {
  return {
    facebook: body.facebook || '',
    twitter: body.twitter || '',
    linkedin: body.linkedin || '',
    instagram: body.instagram || '',
    video_link: body.video_link || '',
    telegram: body.telegram || '',
    medium: body.medium || '',
    reddit: body.reddit || '',
    user_row_id: userRowId,
  }
}

/**
 * Ports /create_new_user (~2166-2353). CONFIRMED PERF FIX applied consistently with
 * /update_user's named fix (see professionals.queries.ts's findConflictingUserFieldsForCreate):
 * the 3 sequential username/email/mobile findOnes collapse into one $or query.
 */
export async function createNewUser({ admin, body, preValidationErrors }: { admin: AdminAuthResult; body: Record<string, any>; preValidationErrors: Record<string, string> }) {
  const errObj: Record<string, string> = { ...preValidationErrors }
  if (!admin.status) return admin

  let admin_row_id = 0
  if (admin.message.admin_manager_type === 2) {
    admin_row_id = Number(admin.message.admin_row_id)
  }

  const conflicts = await findConflictingUserFieldsForCreate({
    userName: sanitize(body.user_name),
    emailId: body.email_id ? sanitize(body.email_id) : undefined,
    mobileNumber: body.mobile_number ? sanitize(body.mobile_number) : undefined,
  })
  for (const row of conflicts) {
    if (row.user_name === body.user_name) errObj.user_name = 'The User name is already in use.'
    if (body.email_id && row.email_id === body.email_id) errObj.email_id = 'The Email Id is already in use.'
    if (body.mobile_number && row.mobile_number === body.mobile_number) errObj.mobile_number = 'The Mobile Number is already in use.'
  }

  if (body.mobile_number && /[^0-9\-()\s]/.test(body.mobile_number)) {
    errObj.mobile_number = 'The Mobile Number field cannot have speacial charaters.'
  }

  let looking_for_id: number[] = []
  if (body.looking_for_id?.length > 0) {
    const arr = await getIntIdFromArray(body.looking_for_id)
    if (arr.length > 0) looking_for_id = arr
    else errObj.looking_for_id = 'The looking for Ids field must be integer in object'
  }

  let designation_id: number[] = []
  if (body.designation_id?.length > 0) {
    const arr = await getIntIdFromArray(body.designation_id)
    if (arr.length > 0) designation_id = arr
    else errObj.designation_id = 'The Designation Ids field must be integer in object'
  }

  let profile_image = ''
  if (!Object.keys(errObj).length && body.profile_image) {
    const validate_n_save_image = await validateAndSaveImage(body.profile_image, 1)
    if (!validate_n_save_image.status) errObj.profile_image = 'Sorry, Invalid profile image.'
    else profile_image = validate_n_save_image.webp_file_name
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const date_n_time = new Date()
  const insertArray = {
    gender: body.gender,
    full_name: body.full_name,
    referral_row_id: 1,
    referral_user_name: 'coinpedia',
    user_name: body.user_name,
    email_id: body.email_id || '',
    mobile_number: body.mobile_number,
    country_id: body.country_id,
    account_visible_type: body.account_visible_type,
    work_position: body.work_position,
    company_name: body.company_name,
    designation_id,
    podcast_id: body.podcast_id,
    podcast_title: body.podcast_title ? String(body.podcast_title).trim() : '',
    created_date_n_time: date_n_time,
    updated_date_n_time: date_n_time,
    sub_admin_row_id: admin_row_id,
    claim_status: 1,
    location: body.location,
    user_bio: body.user_bio || '',
    looking_for_id,
  }

  const savedData = await new ProfessionalM(insertArray).save()
  const user_row_id = Number.parseInt(String(savedData._id))

  // CONFIRMED GAP FIX (user-requested, 2026-09-20, "creation of professionals and company
  // profile must be registered in the change log/history"): mirrors the equivalent fix in
  // `company.settings.service.ts`'s own company-creation path - `create` never existed as a
  // LifecycleAction at all until this fix, so no professional creation was ever audited.
  await recordProfessionalStatusChange({
    documentId: user_row_id,
    action: 'create',
    tracker: getUpdateTrackerFields(admin),
    adminRowId: admin_row_id,
    fullName: savedData.full_name,
  })

  await Promise.all([
    new ProfessionalSocialLinksM(buildSocialLinksArray(body, user_row_id)).save(),
    new ProfessionalSeoDetailsM({ meta_keywords: body.meta_keywords, meta_description: body.meta_description, user_row_id }).save(),
  ])

  const manual_user_row_id = Number.parseInt(body.manual_user_row_id)
  if (!Number.isNaN(manual_user_row_id)) {
    const check_manual_query = await professionals_manual_retrievalsM.findOne({ _id: manual_user_row_id })
    if (check_manual_query) {
      await shiftUserFromManualToRegister({ manual_user_row_id, register_user_row_id: user_row_id, sub_admin_row_id: admin_row_id })
    }
  }

  if (body.profile_image) {
    await new ProfessionalProfileImagesM({ profile_image, profile_image_type: 0, user_row_id }).save()
  }

  const pass_subject = ' Coinpedia Has Listed Your User Profile. ! Claim This User Profile Now '
  const pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${savedData.full_name},</p>
                <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that your user profile has been listed on Coinpedia. You can claim this profile page to unlock unlimited features and enhance your online presence.</p>
                <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                <ul>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                </ul>
                <p style="color:#000;font-weight: 400;font-size:17px;">Get started with the user profile today, by submitting a claim request to our admin. Our admin will review and notify you via email. Upon admin’s approval, you get access to all the features. </p>
                <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> </p>`

  await sendEmail(savedData.email_id, pass_subject, pass_message)
  await invalidateProfessionalsCaches()

  return { status: true, message: { alert_message: 'New user successfully created.' }, user_row_id }
}

/**
 * Ports /update_user/:user_row_id (~2353-2573). CONFIRMED PERF FIX (named in the plan): the 3
 * sequential username/email/mobile uniqueness `findOne` calls collapse into one `$or` query via
 * findConflictingUserFields.
 */
export async function updateUser({ admin, userRowIdRaw, body, preValidationErrors }: { admin: AdminAuthResult; userRowIdRaw: string; body: Record<string, any>; preValidationErrors: Record<string, string> }) {
  const errObj: Record<string, string> = { ...preValidationErrors }
  if (!admin.status) return admin

  const user_row_id = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(user_row_id)) {
    return { status: false, message: { ...errObj, alert_message: 'User row ID must be integer' } }
  }

  const admin_row_id = Number(admin.message.admin_row_id)
  if (admin.message.admin_manager_type !== 1 && admin_row_id) {
    const check_user = await ProfessionalM.findOne({ _id: user_row_id })
    if (admin.message.sub_admin_type != 3) {
      if (check_user?.sub_admin_row_id || Number(admin.message.sub_admin_type) === 2 || Number(admin.message.sub_admin_type) === 1) {
        if (admin_row_id !== check_user?.sub_admin_row_id) {
          errObj.created_by_sub_admin_id = 'You do not have access to edit this user'
        }
      }
    }
  }

  const getUser = await ProfessionalM.findOne({ _id: user_row_id })
  if (!getUser) {
    return { status: false, message: { alert_message: 'Invalid User Row Id in URL' } }
  }

  const conflicts = await findConflictingUserFields({
    userRowId: user_row_id,
    userName: sanitize(body.user_name),
    emailId: body.email_id ? sanitize(body.email_id) : undefined,
    mobileNumber: body.mobile_number ? sanitize(body.mobile_number) : undefined,
  })
  for (const row of conflicts) {
    if (row.user_name === body.user_name) errObj.user_name = 'The User name is already in use.'
    if (body.email_id && row.email_id === body.email_id) errObj.email_id = 'The Email Id is already in use.'
    if (body.mobile_number && row.mobile_number === body.mobile_number) errObj.mobile_number = 'The Mobile Number is already in use.'
  }

  if (body.mobile_number && /[^0-9\-()\s]/.test(body.mobile_number)) {
    errObj.mobile_number = 'The Mobile Number field cannot have speacial charaters.'
  }

  let looking_for_id: number[] = []
  if (body.looking_for_id?.length > 0) {
    const arr = await getIntIdFromArray(body.looking_for_id)
    if (arr.length > 0) looking_for_id = arr
    else errObj.looking_for_id = 'The looking for Ids field must be integer in object'
  }

  let designation_id: number[] = []
  if (body.designation_id?.length > 0) {
    const arr = await getIntIdFromArray(body.designation_id)
    if (arr.length > 0) designation_id = arr
    else errObj.designation_id = 'The Designation Ids field must be integer in object'
  }

  let profile_image = ''
  if (!Object.keys(errObj).length && body.profile_image) {
    const validate_n_save_image = await validateAndSaveImage(body.profile_image, 1)
    if (!validate_n_save_image.status) errObj.profile_image = 'Sorry, Invalid profile image.'
    else profile_image = validate_n_save_image.webp_file_name
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (body.company_name) {
    const company_name = sanitize(body.company_name).toLowerCase()
    const getQuery = await companyM.findOne({ approval_status: 1, active_status: 1, company_name }, { _id: 1 })
    if (getQuery) {
      const checkQuery = await employees_requestsM.findOne({ company_row_id: getQuery._id, user_row_id })
      if (!checkQuery) {
        await new employees_requestsM({ company_row_id: getQuery._id, user_row_id, approval_status: 1, date_n_time: new Date() }).save()
      }
    }
  }

  const updateFields = getUpdateTrackerFields(admin)
  const insertArray = {
    gender: body.gender,
    full_name: body.full_name,
    user_name: body.user_name,
    email_id: body.email_id,
    mobile_number: body.mobile_number,
    country_id: body.country_id,
    account_visible_type: body.account_visible_type,
    work_position: body.work_position,
    company_name: body.company_name,
    designation_id,
    podcast_id: body.podcast_id,
    podcast_title: body.podcast_title ? String(body.podcast_title).trim() : '',
    location: body.location || '',
    user_bio: body.user_bio || '',
    looking_for_id,
    updated_date_n_time: new Date(),
    ...updateFields,
  }

  await Promise.all([
    ProfessionalM.updateOne({ _id: user_row_id }, { $set: insertArray }),
    ProfessionalSocialLinksM.findOneAndUpdate({ user_row_id }, { $set: buildSocialLinksArray(body, user_row_id) }, { upsert: true }),
    ProfessionalSeoDetailsM.findOneAndUpdate({ user_row_id }, { $set: { meta_keywords: body.meta_keywords, meta_description: body.meta_description, user_row_id } }, { upsert: true }),
  ])

  if (body.profile_image) {
    const checkImage = await ProfessionalProfileImagesM.findOne({ user_row_id })
    if (checkImage) {
      if ((checkImage.profile_image_type ?? 0) > 0) {
        const imageQuery = await default_profile_imgM.findOne({ image_name: checkImage.profile_image }, { _id: 1 })
        if (!imageQuery) {
          await deleteImageDigitalOcean(checkImage.profile_image, 1)
        }
      }
      await ProfessionalProfileImagesM.updateOne({ user_row_id }, { $set: { profile_image, profile_image_type: 0 } })
    } else {
      await new ProfessionalProfileImagesM({ profile_image, profile_image_type: 0, user_row_id }).save()
    }
  }

  await invalidateProfessionalsCaches()
  return { status: true, message: { alert_message: 'Profile updated successfully.' } }
}

/**
 * Ports /enable_user/:user_row_id (~2573-2654). CONFIRMED PERF FIX (named in the plan): the
 * company-status check and events check are independent reads of unrelated collections keyed off
 * the same user_row_id — Promise.all'd instead of chained. The trailing "refetch the professional
 * to read email/full_name for the notification email" is also dropped in favor of reusing the
 * already-fetched `queryRunCheck` document (update_date/login_status are the only fields that
 * change, and neither is used in the email) — same data, one fewer round-trip.
 */
export async function enableUser({ admin, userRowIdRaw }: { admin: AdminAuthResult; userRowIdRaw: string }) {
  if (!admin.status) return admin
  const user_row_id = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(user_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRunCheck = await ProfessionalM.findOne({ _id: user_row_id })
  if (!queryRunCheck) {
    return { status: false, message: { alert_message: 'Invalid User Row Id' } }
  }

  const check_access = await checkUserSubadminAccess({
    admin_row_id: Number(admin.message.admin_row_id),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number(admin.message.sub_admin_type),
    user_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message }, tokenStatus: true }
  }

  if (queryRunCheck.login_status !== 0) {
    return { status: false, message: { alert_message: 'This User is already Enabled' } }
  }

  const updateFields = getUpdateTrackerFields(admin)
  const [, check_company_status, checkEvents] = await Promise.all([
    ProfessionalM.updateOne({ _id: user_row_id }, { $set: { login_status: 1, ...updateFields, updated_date_n_time: new Date() } }),
    companyM.findOne({ user_row_id, active_status: 1, approval_status: 1 }),
    eventM.findOne({ user_row_id }),
  ])
  await recordProfessionalStatusChange({
    documentId: user_row_id,
    action: 'enable',
    tracker: updateFields,
    adminRowId: admin.message.admin_row_id,
  })

  const company_status = check_company_status ? 1 : 0
  if (checkEvents) {
    if (company_status === 1) {
      await eventM.updateMany({ user_row_id }, { $set: { active_status: 1 } })
    } else {
      await eventM.updateMany({ user_row_id, list_event_type: 1 }, { $set: { active_status: 1 } })
    }
  }

  const pass_subject = 'CoinPedia Account Resumed'
  const pass_message = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${queryRunCheck.full_name},</p>
                            <div style="color:#000;">
                                <p style="color:#000;font-weight: 400;font-size:17px;">Congratulations ! </p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Your Coinpedia account has been Unblocked and all the features are now active. You can now continue using your account. </p>
                            </div>
                        `
  await sendEmail(queryRunCheck.email_id, pass_subject, pass_message)
  await invalidateProfessionalsCaches()

  return { status: true, message: { alert_message: 'This User is Enabled successfully.', check_access } }
}

/**
 * Ports /disable_user/:user_row_id (~2654-2756). CONFIRMED PERF FIX (named in the plan): the
 * podcast/company/events existence checks are 3 independent reads keyed off the same
 * user_row_id — Promise.all'd instead of the real route's 7 sequential chained awaits. The
 * dependent writes that follow a positive check (deleting the podcast row, disabling the
 * company + its podcast, disabling events) still run only when their own check found a row,
 * same as the real route.
 */
export async function disableUser({ admin, userRowIdRaw, reasonForDisable }: { admin: AdminAuthResult; userRowIdRaw: string; reasonForDisable: string }) {
  if (!admin.status) return admin

  const check_access = await checkUserSubadminAccess({
    admin_row_id: Number(admin.message.admin_row_id),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number(admin.message.sub_admin_type),
    user_row_id: Number.parseInt(userRowIdRaw),
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const user_row_id = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(user_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRunCheck = await ProfessionalM.findOne({ _id: user_row_id })
  if (!queryRunCheck) {
    return { status: false, message: { alert_message: 'Oops! Invalid User Row Id' } }
  }

  if (queryRunCheck.login_status !== 1) {
    return { status: false, message: { alert_message: 'Sorry! This User is already Disabled' } }
  }

  const updateFields = getUpdateTrackerFields(admin)
  const [, checkPodcast, checkCompany, checkEvents] = await Promise.all([
    ProfessionalM.updateOne({ _id: user_row_id }, { $set: { login_status: 0, ...updateFields, updated_date_n_time: new Date() } }),
    userPodcastsM.findOne({ user_row_id }),
    companyM.findOne({ user_row_id }),
    eventM.findOne({ user_row_id }),
  ])
  await recordProfessionalStatusChange({
    documentId: user_row_id,
    action: 'disable',
    tracker: updateFields,
    adminRowId: admin.message.admin_row_id,
    reason: reasonForDisable,
  })

  const followUpWrites: Promise<unknown>[] = [new ProfessionalDisabledM({ user_row_id, disabled_reason: reasonForDisable, date_n_time: new Date() }).save()]

  if (checkPodcast) {
    followUpWrites.push(userPodcastsM.deleteOne({ user_row_id }))
  }

  if (checkCompany) {
    followUpWrites.push(companyM.updateOne({ _id: checkCompany._id }, { $set: { active_status: 0 } }))
    const checkCompanyPodcast = await companyPodcastsM.findOne({ company_row_id: checkCompany._id })
    if (checkCompanyPodcast) {
      followUpWrites.push(companyPodcastsM.deleteOne({ company_row_id: checkCompany._id }))
    }
  }

  if (checkEvents) {
    followUpWrites.push(eventM.updateMany({ user_row_id }, { $set: { active_status: 0 } }))
  }

  await Promise.all(followUpWrites)

  const pass_subject = 'CoinPedia Account Blocked'
  const pass_message = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${queryRunCheck.full_name},</p>
                        <div style="color:#000;">
                            <p style="color:#000;font-weight: 400;font-size:17px;">This mail is to notify you that your CoinPedia account has been blocked due to ${reasonForDisable}. Please reach out to our Support team for more information and unblock request.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">DO NOT REPLY TO THIS EMAIL. </p>
                        </div>`
  await sendEmail(queryRunCheck.email_id, pass_subject, pass_message)
  await invalidateProfessionalsCaches()

  return { status: true, message: { alert_message: 'This User is Disabled successfully.' } }
}
