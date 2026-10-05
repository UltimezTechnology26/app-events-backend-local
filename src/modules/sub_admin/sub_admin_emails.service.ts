// Business logic for the Sub Admin Mails notification-recipient CRUD, ported
// verbatim from controllers/admin_panel/sub_admin.js's email handlers (lines
// 550-800). Structural port only - same queries, same message strings,
// including the legacy quirk of folding a failed checkAdminLoginToken into
// `errObj['alert_message']` (add_sub_admin_email/edit) instead of returning
// early, exactly as today.

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const sub_admin_emailsM = require('../../../models/admin_panel/app/sub_admin_emailsM')

import type { CheckTokenResult, ServiceResponse } from './sub_admin.types'

interface AddSubAdminEmailBody {
  full_name?: string
  email_id?: string
  type?: string | number
  sub_admin_row_id?: string | number
}

/** Ports POST /add_sub_admin_email (legacy lines 550-623). */
export async function addSubAdminEmail(body: AddSubAdminEmailBody, errObj: Record<string, string>, checkToken: CheckTokenResult): Promise<ServiceResponse> {
  if (!checkToken.status) {
    errObj['alert_message'] = checkToken.message as string
  }

  const email_id = sanitize(body.email_id).toLowerCase()

  if (body.sub_admin_row_id) {
    const sub_admin_row_id = Number.parseInt(sanitize(String(body.sub_admin_row_id)))
    const check_query = await sub_admin_emailsM.findOne({ _id: sub_admin_row_id })
    if (!check_query) {
      errObj['sub_admin_row_id'] = 'Invalid sub admin row id'
    }
    const checkEmailId = await sub_admin_emailsM.findOne({ $and: [{ _id: { $ne: sub_admin_row_id } }, { email_id }] })
    if (checkEmailId) {
      errObj['email_id'] = 'Sorry, This Email ID already exists.'
    }
  } else {
    const checkEmailId = await sub_admin_emailsM.findOne({ email_id })
    if (checkEmailId) {
      errObj['email_id'] = 'Sorry, This Email ID already exists.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const insertArray = {
    full_name: body.full_name,
    email_id,
    date_n_time: getPresentDateTime(),
    type: body.type,
  }

  if (body.sub_admin_row_id) {
    await sub_admin_emailsM.updateOne({ _id: Number.parseInt(sanitize(String(body.sub_admin_row_id))) }, { $set: insertArray })
    return { status: true, message: { alert_message: 'Sub admin email details updated successfully' } }
  }

  await new sub_admin_emailsM(insertArray).save()
  return { status: true, message: { alert_message: 'The sub admin email details created successfully.' } }
}

/** Ports GET /view/:sub_admin_row_id (legacy lines 625-655). */
export async function viewSubAdminEmail(subAdminRowIdRaw: string): Promise<ServiceResponse> {
  const queryRun = await sub_admin_emailsM.findOne(
    { _id: Number.parseInt(sanitize(subAdminRowIdRaw)) },
    { _id: 1, full_name: 1, email_id: 1, date_n_time: 1, type: 1 },
  )

  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry! Invalid User Row id' } }
  }

  return {
    status: true,
    message: {
      _id: queryRun._id,
      full_name: queryRun.full_name,
      email_id: queryRun.email_id,
      date_n_time: queryRun.date_n_time,
      type: queryRun.type,
    },
  }
}

interface EditSubAdminEmailBody {
  full_name?: string
  email_id?: string
  type?: string | number
}

/** Ports POST /edit/:sub_admin_row_id (legacy lines 657-719). */
export async function editSubAdminEmail(subAdminRowId: string, body: EditSubAdminEmailBody, errObj: Record<string, string>, checkToken: CheckTokenResult): Promise<ServiceResponse> {
  if (!checkToken.status) {
    errObj['alert_message'] = checkToken.message as string
  }

  const email_id = sanitize(body.email_id).toLowerCase()

  const queryRun = await sub_admin_emailsM.findOne({ _id: sanitize(subAdminRowId) })
  if (queryRun) {
    const checkEmailId = await sub_admin_emailsM.findOne({ $and: [{ _id: { $ne: sanitize(queryRun._id) } }, { email_id }] })
    if (checkEmailId) {
      errObj['email_id'] = 'Sorry, This Email ID already exists.'
    }
  } else {
    errObj['alert_message'] = 'Sorry! Invalid Sub admin Row ID'
  }

  if (body.type) {
    if (Number.parseInt(String(body.type)) <= 1 && Number.parseInt(String(body.type)) >= 3) {
      errObj['type'] = 'The type should be between 1 to 3'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const insertArray = { full_name: body.full_name, type: body.type, email_id }
  await sub_admin_emailsM.updateOne({ _id: subAdminRowId }, { $set: insertArray })

  return { status: true, message: { alert_message: 'Sub Admin details Updated Successfully.', insertArray } }
}

/** Ports GET /delete/:sub_admin_row_id (legacy lines 721-744). */
export async function deleteSubAdminEmail(subAdminRowIdRaw: string): Promise<ServiceResponse> {
  const id = Number.parseInt(subAdminRowIdRaw)
  const queryRun = await sub_admin_emailsM.findOne({ _id: id })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Invalid Subadmin Row id' } }
  }

  await sub_admin_emailsM.deleteOne({ _id: id })
  return { status: true, message: { alert_message: 'Subadmin Deleted Successfully' } }
}

/** Ports GET /sub_admin_email_list/:skip/:limit (legacy lines 746-800). */
export async function listSubAdminEmails(skipRaw: string, limitRaw: string, search: string | undefined): Promise<ServiceResponse> {
  let query: Record<string, unknown> = {}
  if (search) {
    query = {
      $or: [
        { full_name: { $regex: search, $options: 'i' } },
        { email_id: { $regex: search, $options: 'i' } },
      ],
    }
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  const [queryRun, count] = await Promise.all([
    sub_admin_emailsM.find(query, { _id: 1, email_id: 1, date_n_time: 1, full_name: 1, type: 1 }).sort({ _id: -1 }).skip(skip).limit(limit),
    sub_admin_emailsM.countDocuments(query),
  ])

  const myArray = queryRun.map((run: any) => ({
    _id: run._id,
    full_name: run.full_name,
    email_id: run.email_id,
    date_n_time: run.date_n_time,
    type: run.type,
  }))

  return { status: true, message: myArray, countQueryRun: count }
}
