// Business logic for sub-admin account CRUD, ported verbatim from
// controllers/admin_panel/sub_admin.js (lines 22-546, the account-CRUD
// handlers only - access-type/manager-roles and sub-admin-email handlers live
// in this module's own sub_admin_access_type.service.ts / sub_admin_emails.service.ts).
// Structural port only - every query shape, field name, and message string
// is unchanged; `create_sub_admin`/`update_sub_admin_detail` deliberately
// keep the legacy quirk of folding a failed checkAdminLoginToken into
// `errObj['alert_message']` instead of returning early, exactly as today.

import bcrypt from 'bcryptjs'
import { getIntIdFromArray } from '@ultimez-interview/coinpedia-backend-library/validation'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
const sub_admin_access_typeM = require('../../../models/admin_panel/app/sub_admin_access_typeM')

import { RETIRED_SUB_ADMIN_TYPES, SUB_ADMIN_TYPE } from './sub_admin.types'
import type { CheckTokenResult, CreateOrUpdateSubAdminBody, DisableSubAdminBody, ServiceResponse } from './sub_admin.types'

const BCRYPT_SALT_ROUNDS = 10

/** Ports GET /list/:skip/:limit (legacy lines 22-92). */
export async function listSubAdmins(skipRaw: string, limitRaw: string, search: string | undefined): Promise<ServiceResponse> {
  let query: Record<string, unknown> = {}
  if (search) {
    query = {
      $or: [
        { full_name: { $regex: search, $options: 'i' } },
        { email_id: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
      ],
    }
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  const [queryRun, countQueryRun] = await Promise.all([
    sub_adminM
      .find(query, { _id: 1, email_id: 1, create_type_row_id: 1, mobile_number: 1, login_status: 1, date_n_time: 1, full_name: 1, sub_admin_type: 1, disabled_reason: 1, disabled_date_n_time: 1 })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit),
    sub_adminM.countDocuments(query),
  ])

  const allCreateTypeIds = [...new Set(queryRun.flatMap((run: any) => run.create_type_row_id || []))]
  const createTypesLookup = allCreateTypeIds.length
    ? await sub_admin_access_typeM.find({ _id: { $in: allCreateTypeIds }, type_status: 1 }, { create_type_name: 1, _id: 1 })
    : []

  const myArray = []
  for (const run of queryRun) {
    const rowCreateTypeIds = run.create_type_row_id || []
    myArray.push({
      _id: run._id,
      full_name: run.full_name,
      email_id: run.email_id,
      mobile_number: run.mobile_number,
      login_status: run.login_status,
      sub_admin_type: run.sub_admin_type,
      date_n_time: run.date_n_time,
      disabled_reason: run.disabled_reason,
      disabled_date_n_time: run.disabled_date_n_time,
      create_type_row_id: getIntIdFromArray(run.create_type_row_id),
      create_types_query: createTypesLookup.filter((type: any) => rowCreateTypeIds.includes(type._id)),
    })
  }

  return { status: true, message: myArray, countQueryRun }
}

const RETIRED_SUB_ADMIN_TYPE_MESSAGE = 'The Developer Team type is retired. Choose Restricted Access or Full Access.'

function parseSubAdminType(value: CreateOrUpdateSubAdminBody['sub_admin_type']): number {
  return value ? Number.parseInt(String(value)) : SUB_ADMIN_TYPE.MARKETING_RESTRICTED
}

/** A retired type is only allowed when the account already holds it (`currentType`). */
function isRetiredTypeChange(requestedType: number, currentType?: number): boolean {
  return RETIRED_SUB_ADMIN_TYPES.includes(requestedType) && requestedType !== currentType
}

/** Ports POST /create_sub_admin (legacy lines 94-163). */
export async function createSubAdmin(body: CreateOrUpdateSubAdminBody, errObj: Record<string, string>, checkToken: CheckTokenResult): Promise<ServiceResponse> {
  if (!checkToken.status) {
    errObj['alert_message'] = checkToken.message as string
  }

  const email_id = sanitize(body.email_id).toLowerCase()
  const checkEmailId = await sub_adminM.findOne({ email_id })
  if (checkEmailId) {
    errObj['email_id'] = 'Sorry, This Email ID already exists.'
  }

  const create_type_row_id_array = getIntIdFromArray(body.create_type_row_id as unknown[])
  let create_type_row_id: number[] = []
  if (create_type_row_id_array.length > 0) {
    create_type_row_id = create_type_row_id_array
  } else {
    errObj['create_type_row_id'] = 'The Create type row Ids field must be integer in object'
  }

  const sub_admin_type = parseSubAdminType(body.sub_admin_type)
  if (isRetiredTypeChange(sub_admin_type)) {
    errObj['sub_admin_type'] = RETIRED_SUB_ADMIN_TYPE_MESSAGE
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const password = await bcrypt.hash(body.password as string, BCRYPT_SALT_ROUNDS)
  const save_query = await new sub_adminM({
    full_name: body.full_name,
    email_id,
    mobile_number: body.mobile_number ? body.mobile_number : '',
    password,
    create_type_row_id,
    login_status: 1,
    date_n_time: getPresentDateTime(),
    sub_admin_type,
  }).save()

  return { status: true, message: { alert_message: 'The sub admin details created successfully.', save_query } }
}

/** Ports POST /update_sub_admin_detail/:sub_admin_row_id (legacy lines 165-236). */
export async function updateSubAdminDetail(subAdminRowId: string, body: CreateOrUpdateSubAdminBody, errObj: Record<string, string>, checkToken: CheckTokenResult): Promise<ServiceResponse> {
  if (!checkToken.status) {
    errObj['alert_message'] = checkToken.message as string
  }

  const email_id = sanitize(body.email_id).toLowerCase()
  const mobile_number = body.mobile_number

  const queryRun = await sub_adminM.findOne({ _id: sanitize(subAdminRowId) })
  if (queryRun) {
    const checkEmailId = await sub_adminM.findOne({ $and: [{ _id: { $ne: sanitize(queryRun._id) } }, { email_id }] })
    if (checkEmailId) {
      errObj['email_id'] = 'Sorry, This Email ID already exists.'
    }
  } else {
    errObj['alert_message'] = 'Sorry! Invalid Sub admin Row ID'
  }

  const create_type_row_id_array = getIntIdFromArray(body.create_type_row_id as unknown[])
  let create_type_row_id: number[] = []
  if (create_type_row_id_array.length > 0) {
    create_type_row_id = create_type_row_id_array
  } else {
    errObj['create_type_row_id'] = 'The Create type row Ids field must be integer in object'
  }

  const sub_admin_type = parseSubAdminType(body.sub_admin_type)
  if (isRetiredTypeChange(sub_admin_type, queryRun?.sub_admin_type)) {
    errObj['sub_admin_type'] = RETIRED_SUB_ADMIN_TYPE_MESSAGE
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  await sub_adminM.updateOne(
    { _id: subAdminRowId },
    {
      $set: {
        full_name: body.full_name,
        email_id,
        mobile_number,
        create_type_row_id,
        sub_admin_type,
      },
    },
  )

  return { status: true, message: { alert_message: 'Sub Admin details Updated Successfully.' } }
}

/** Ports GET /enable_user/:sub_admin_row_id (legacy lines 238-270). */
export async function enableSubAdmin(subAdminRowIdRaw: string): Promise<ServiceResponse> {
  const sub_admin_row_id = Number.parseInt(subAdminRowIdRaw)
  const queryRun = await sub_adminM.findOne({ _id: sub_admin_row_id })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Sub Admin Row Id.' } }
  }

  const checkLoginStatus = await sub_adminM.findOne({ _id: sub_admin_row_id, login_status: 0 })
  if (!checkLoginStatus) {
    return { status: false, message: { alert_message: 'Sorry! Sub Admin is already Enabled.' } }
  }

  await sub_adminM.updateOne({ _id: sub_admin_row_id, login_status: 0 }, { $set: { login_status: 1 } })
  return { status: true, message: { alert_message: 'Sub Admin Enabled Successfully.' } }
}

/** Ports POST /disable_user/:sub_admin_row_id (legacy lines 272-324). */
export async function disableSubAdmin(subAdminRowIdRaw: string, body: DisableSubAdminBody, errObj: Record<string, string>): Promise<ServiceResponse> {
  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const sub_admin_row_id = Number.parseInt(subAdminRowIdRaw)
  const queryRun = await sub_adminM.findOne({ _id: sub_admin_row_id })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Sub Admin Row Id.' } }
  }

  const checkLoginStatus = await sub_adminM.findOne({ _id: sub_admin_row_id, login_status: 1 })
  if (!checkLoginStatus) {
    return { status: false, message: { alert_message: 'Sorry! Sub Admin is already Disabled.' } }
  }

  await sub_adminM.updateOne(
    { _id: sub_admin_row_id, login_status: 1 },
    { $set: { login_status: 0, disabled_reason: body.reason_for_disable, disabled_date_n_time: getPresentDateTime() } },
  )
  return { status: true, message: { alert_message: 'Sub Admin Disabled Successfully.' } }
}

/** Ports POST /update_subadmin_password/:sub_admin_row_id (legacy lines 507-546). */
export async function updateSubAdminPassword(subAdminRowIdRaw: string, newPassword: string, errObj: Record<string, string>): Promise<ServiceResponse> {
  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const sub_admin_row_id = Number.parseInt(subAdminRowIdRaw)
  const queryRunCheck = await sub_adminM.findOne({ _id: sub_admin_row_id })
  if (!queryRunCheck) {
    return { status: false, message: { alert_message: 'Inavlid Sub Admin Row Id' } }
  }

  const get_password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS)
  await sub_adminM.updateOne({ _id: sub_admin_row_id }, { $set: { password: get_password } })
  return { status: true, message: { alert_message: 'Profile Password Updated Successfully' } }
}
