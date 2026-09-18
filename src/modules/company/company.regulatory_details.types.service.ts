// modules/company/company.regulatory_details.types.service.ts
//
// Business logic for the Regulatory Types sub-resource, migrated from
// controllers/admin_panel/category_tags/regularity_details.js. Regulatory
// Bodies logic lives in company.regulatory_details.bodies.service.ts —
// split out purely to stay under the file-length limit, even though both
// sub-resources share the single legacy controller file. There is NO GET
// /list route in the legacy file for either sub-resource — none is added
// here.

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import {
  findRegulatoryTypeById,
  findDuplicateRegulatoryTypeName,
  updateRegulatoryTypeName,
  insertRegulatoryType,
  deleteRegulatoryTypeById,
  findBodiesUsingRegulatoryType,
} from './company.regulatory_details.queries'

export interface SaveNEditTypeParams {
  body: Record<string, unknown>
  preValidationErrors: Record<string, string>
}

/** Ports POST /save_n_edit verbatim (legacy lines 15-64, minus the FIX #4 err.message leak). */
export async function saveNEditType({ body, preValidationErrors }: SaveNEditTypeParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let category_row_id = 0
  if (body.category_row_id) {
    category_row_id = Number.parseInt(body.category_row_id as string)

    const checkRegularities = await findRegulatoryTypeById(category_row_id)
    if (!checkRegularities) {
      errObj['category_row_id'] = 'Invalid category row id'
    }
  }

  let regulator_type_name = ''
  if (body.regulator_type_name) {
    regulator_type_name = sanitize(body.regulator_type_name as string)
    const check_query = await findDuplicateRegulatoryTypeName(category_row_id, regulator_type_name)
    if (check_query) {
      errObj['regulator_type_name'] = 'Sorry, This Regulatory type  already exist.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (category_row_id > 0) {
    await updateRegulatoryTypeName(category_row_id, regulator_type_name)
    return { status: true, message: { alert_message: 'This Regularity type details has been updated successfully.' }, tokenStatus: true }
  }

  await insertRegulatoryType(regulator_type_name, getPresentDateTime())
  return { status: true, message: { alert_message: 'New Regularity type details has been added successfully.' }, tokenStatus: true }
}

/**
 * Ports GET /delete_type/:category_row_id verbatim (legacy lines 66-110).
 * Preserves the EXISTING delete-guard: refuses to delete a regulatory type
 * still referenced by any regulatory body's regulatory_type_id.
 */
export async function deleteRegulatoryType(categoryRowIdRaw: string) {
  const category_row_id = Number.parseInt(categoryRowIdRaw)

  const checkQuery = await findRegulatoryTypeById(category_row_id)
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Sorry, Invalid regulatory type id ' }, tokenStatus: true }
  }

  const check_bodies = await findBodiesUsingRegulatoryType(category_row_id)
  if (check_bodies) {
    return { status: false, message: { alert_message: 'Sorry, regulatory type is used in bodies, cannot delete.' }, tokenStatus: true }
  }

  await deleteRegulatoryTypeById(category_row_id)
  return { status: true, message: { alert_message: 'This regulatory type details has been deleted successfully.' }, tokenStatus: true }
}
