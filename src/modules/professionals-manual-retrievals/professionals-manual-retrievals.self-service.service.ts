// modules/professionals-manual-retrievals/professionals-manual-retrievals.self-service.service.ts
// Ports controllers/app/users/manual_users.js in full (2 routes): /update_manual_detail,
// /edit_manual_detail — the no-login-token self-service flow for creating/editing a "manual"
// (not-yet-claimed) professional stub record. Neither legacy route has an auth gate; preserved
// as-is (checkApiKey-only, matching legacy exactly).
import sanitize from 'mongo-sanitize'
import { ProfessionalsManualRetrievalsM } from './professionals-manual-retrievals.models'
import type { UpdateManualDetailBody, EditManualDetailBody } from './professionals-manual-retrievals.self-service.types'

const ProfessionalM = require('../../../models/app/professionalsM')
const CompanyM = require('../../../models/app/company/companyM')
const CompanyManualRetrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const ProfessionalsWorkExperienceM = require('../../../models/app/professionals_work_experienceM')
const ProfessionalPositionsM = require('../../../models/app/static/professional_positionsM')
const { getPresentDateTime, validateAndSaveImage } = require('../../../utils/helpers/helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

export async function updateManualDetail(body: UpdateManualDetailBody, preValidationErrors: Record<string, unknown>) {
  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const dateNTime = getPresentDateTime()

  let emailId = ''
  if (body.email_id) {
    emailId = sanitize(body.email_id).toLowerCase()
    const checkUserQuery = await ProfessionalM.findOne({ email_id: emailId }).collation({ locale: 'en', strength: 2 })
    if (checkUserQuery) {
      errObj['email_id'] = 'Sorry, This Email ID is already exist.'
    } else {
      const checkManualUserQuery = await ProfessionalsManualRetrievalsM.findOne({ email_id: emailId }).collation({ locale: 'en', strength: 2 })
      if (checkManualUserQuery) errObj['email_id'] = 'Sorry, This Email ID is already exist.'
    }
  }

  let companyType: number | '' = ''
  let companyRowId: number | '' = ''
  let positionRowId: number | '' = ''
  if (body.company_type && body.company_row_id && body.position_row_id) {
    if ([1, 2].includes(Number.parseInt(String(body.company_type)))) {
      companyType = Number.parseInt(String(body.company_type))
      companyRowId = Number.parseInt(String(body.company_row_id))
      if (companyType === 1) {
        const checkCompanyQuery = await CompanyM.findOne({ _id: companyRowId })
        if (!checkCompanyQuery) errObj['alert_message'] = 'The Company Row ID field is invalid.'
      } else if (companyType === 2) {
        const checkManualCompanyQuery = await CompanyManualRetrievalsM.findOne({ _id: companyRowId })
        if (!checkManualCompanyQuery) errObj['alert_message'] = 'The Manual Company Row ID field is invalid.'
      }
    } else {
      errObj['alert_message'] = 'The Company Type field cotain value 1 or 2.'
    }

    const parsedPositionRowId = Number.parseInt(String(body.position_row_id))
    if (!Number.isNaN(parsedPositionRowId)) {
      positionRowId = parsedPositionRowId
      const getQuery = await ProfessionalPositionsM.findOne({ _id: positionRowId, active_status: true })
      if (!getQuery) errObj['position_row_id'] = 'Sorry, Invalid position row id.'
    }
  }

  let profileImage = ''
  if (Object.keys(errObj).length === 0 && body.profile_image) {
    const validateNSaveImage = await validateAndSaveImage(body.profile_image, 6)
    if (!validateNSaveImage.status) {
      errObj['profile_image'] = 'Sorry, Invalid Profile Image.'
    } else {
      profileImage = validateNSaveImage.webp_file_name
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Flagged, not fixed: this looks up a manual-retrieval row whose used_counts field is already 1
  // rather than tracking a real running counter — a pre-existing bug, ported as-is.
  let usedCounts = 0
  const getCountsQuery = await ProfessionalsManualRetrievalsM.findOne({ used_counts: 1 })
  if (getCountsQuery) usedCounts = Number.parseInt(String(getCountsQuery.used_counts)) + 1

  const fullName = body.full_name
  const gender = Number.parseInt(String(body.gender)) ? Number.parseInt(String(body.gender)) : 0

  const updateArray = {
    gender,
    full_name: fullName,
    email_id: emailId,
    used_counts: usedCounts,
    profile_image: profileImage,
    mobile_number: body.mobile_number,
    user_link: body.user_link,
    created_on: dateNTime,
    updated_on: dateNTime,
  }

  const insertQuery = await new ProfessionalsManualRetrievalsM(updateArray).save()
  const manualUserRowId = insertQuery._id

  if (companyType && companyRowId && positionRowId) {
    const experienceArray = {
      user_account_type: 2,
      user_row_id: manualUserRowId,
      employment_type: 1,
      position_row_id: positionRowId,
      public_view: true,
      company_type: companyType,
      company_row_id: companyRowId,
      till_date_status: 2,
    }
    await ProfessionalsWorkExperienceM(experienceArray).save()
    await deleteKeysByPattern('app_users_list_*')
  }

  const manualData = {
    _id: manualUserRowId,
    user_account_type: 2,
    gender,
    full_name: fullName,
    email_id: emailId,
    company_type: companyType,
    profile_image: profileImage,
    company_row_id: companyRowId,
    position_row_id: positionRowId,
  }

  return { status: true, message: { manual_data: manualData, alert_message: 'The manual user details has been listed successfully.' } }
}

export async function editManualDetail(body: EditManualDetailBody, hasFiles: boolean, preValidationErrors: Record<string, unknown>) {
  const errObj: Record<string, unknown> = { ...preValidationErrors }

  let userRowId = 0
  if (body.user_row_id) {
    userRowId = Number.parseInt(String(body.user_row_id))
    const checkManualQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: userRowId })
    if (checkManualQuery) {
      if (checkManualQuery.profile_image) errObj['profile_image'] = 'The profile image for this user is already exist.'
    } else {
      errObj['user_row_id'] = 'Sorry, Invalid manual user row id.'
    }
  }

  let profileImage = ''
  if (Object.keys(errObj).length === 0) {
    if (hasFiles && body.profile_image) {
      const validateNSaveImage = await validateAndSaveImage(body.profile_image, 6)
      if (!validateNSaveImage.status) {
        errObj['profile_image'] = 'Sorry, Invalid Profile Image.'
      } else {
        profileImage = validateNSaveImage.webp_file_name
      }
    } else {
      errObj['profile_image'] = 'The profile image field is required.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  await ProfessionalsManualRetrievalsM.updateOne({ _id: userRowId }, { $set: { profile_image: profileImage } })
  const getManualUserQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: userRowId })
  await deleteKeysByPattern('app_users_list_*')

  return { status: true, message: { manual_data: getManualUserQuery, alert_message: 'The manual user details has been listed successfully.' } }
}
