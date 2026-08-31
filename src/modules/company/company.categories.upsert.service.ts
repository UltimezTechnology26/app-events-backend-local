// modules/company/company.categories.upsert.service.ts
//
// Ports the reachable POST /add_n_update_details handler from
// controllers/admin_panel/category_tags/company_business_model.js verbatim
// (legacy lines 174-266). Split out of company.categories.service.ts
// purely to stay under the file-length limit.

import {
  findDuplicateCompanyCategoryName,
  findDuplicateCompanyCategoryBusinessId,
  findCompanyCategoryById,
  insertCompanyCategory,
  updateCompanyCategory,
} from './company.categories.queries'
import { invalidateCompanyCategoriesCaches } from './company.categories.cache'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface AddOrUpdateCompanyCategoryParams {
  body: Record<string, unknown>
  preValidationErrors: Record<string, string>
}

/**
 * Ports the reachable POST /add_n_update_details handler verbatim (legacy
 * lines 174-266): case-insensitive uniqueness checks on business_name and
 * business_id via `.collation({ locale: 'en', strength: 2 })`, then either
 * inserts a new category (no business_row_id) or updates an existing one.
 */
export async function addOrUpdateCompanyCategory({ body, preValidationErrors }: AddOrUpdateCompanyCategoryParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let business_row_id: number | '' = ''
  if (!Number.isNaN(Number.parseInt(body.business_row_id as string))) {
    business_row_id = Number.parseInt(body.business_row_id as string)
  }

  let business_name = ''
  let business_id = ''

  if (body.business_name) {
    business_name = sanitize(body.business_name).trim()

    const duplicateName = await findDuplicateCompanyCategoryName(business_row_id, business_name)

    if (duplicateName) {
      errObj['business_name'] = 'This Category Name already exists.'
    }
  }

  if (body.business_id) {
    business_id = sanitize(body.business_id).trim()

    const duplicateId = await findDuplicateCompanyCategoryBusinessId(business_row_id, business_id)

    if (duplicateId) {
      errObj['business_id'] = 'This Category  ID already exists.'
    }
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const update_array: Record<string, unknown> = {}
  update_array['business_name'] = business_name
  // Bug fix (found via live user report, confirmed identical in the legacy
  // controller this was ported from): business_id was only ever added to
  // update_array inside the create branch below, so editing an existing
  // category's ID was silently dropped on save - it validated against
  // duplicates but never actually persisted.
  update_array['business_id'] = business_id

  if (!business_row_id) {
    update_array['date_n_time'] = getPresentDateTime()
    update_array['active_status'] = true

    await insertCompanyCategory(update_array)
    await invalidateCompanyCategoriesCaches()

    return { status: true, message: { alert_message: 'New Company category details has been added successfuly.' } }
  }

  const check_category = await findCompanyCategoryById(business_row_id)
  if (check_category) {
    await updateCompanyCategory(business_row_id, update_array)
    await invalidateCompanyCategoriesCaches()

    return {
      status: true,
      message: { alert_message: 'This Company category details has been updated successfully.' },
      update_array,
    }
  }

  return { status: true, message: { alert_message: 'Sorry, Invalid business row id.' } }
}
