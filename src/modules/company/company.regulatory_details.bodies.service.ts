// modules/company/company.regulatory_details.bodies.service.ts
//
// Business logic for the Regulatory Bodies sub-resource, migrated from
// controllers/admin_panel/category_tags/regularity_details.js. Regulatory
// Types logic lives in company.regulatory_details.types.service.ts — split
// out purely to stay under the file-length limit.
//
// Two cascading side effects here are reproduced EXACTLY, in the same
// order, with no added safety checks: (1) saveNEditBodies silently
// auto-creates the country row (legacy lines 148-153) if it doesn't exist
// yet, BEFORE the duplicate-body check and the body write itself; (2)
// deleteRegulatoryBody (legacy lines 254-262) captures country_id off the
// body record BEFORE deleting it, deletes the body, re-counts remaining
// bodies for that captured country_id, and deletes the country row too if
// zero remain — the count/delete uses the captured id, never re-read from
// the now-deleted body document.

const { getPresentDateTime } = require('../../../utils/helpers/helper')
import {
  findRegulatoryBodyById,
  findCountryByCountryId,
  insertCountry,
  findDuplicateRegulatoryBody,
  updateRegulatoryBody,
  insertRegulatoryBody,
  findCompanyUsingRegulatoryBody,
  deleteRegulatoryBodyById,
  countRegulatoryBodiesForCountry,
  deleteCountryByCountryId,
} from './company.regulatory_details.queries'

export interface SaveNEditBodiesParams {
  body: Record<string, unknown>
  preValidationErrors: Record<string, string>
}

/**
 * Ports POST /save_n_edit_bodies verbatim (legacy lines 113-221, minus the
 * FIX #4 err.message leak). Cascade #1 (auto-create-country) is reproduced
 * exactly at legacy lines 148-153: the country lookup/create happens after
 * the token check and the pre-validation errObj check pass, before the
 * duplicate-body check and before the body itself is written.
 */
export async function saveNEditBodies({ body, preValidationErrors }: SaveNEditBodiesParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let category_row_id = 0
  if (body.category_row_id) {
    category_row_id = Number.parseInt(body.category_row_id as string)

    const checkRegularities = await findRegulatoryBodyById(category_row_id)
    if (!checkRegularities) {
      errObj['category_row_id'] = 'Invalid category row id'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const regulatory_bodies_name = body.regulatory_bodies_name as string
  const parsed_country_id = Number.parseInt(body.country_id as string)
  const parsed_type_id = Number.parseInt(body.regulatory_type_id as string)

  // Cascade #1: silently auto-create the country row if it doesn't exist yet.
  const existingCountry = await findCountryByCountryId(parsed_country_id)
  if (!existingCountry) {
    await insertCountry(parsed_country_id)
  }

  const duplicateQuery: Record<string, unknown> = {
    regulatory_bodies_name: regulatory_bodies_name.trim(),
    country_id: parsed_country_id,
  }
  if (category_row_id > 0) {
    duplicateQuery._id = { $ne: category_row_id }
  }

  const duplicateExists = await findDuplicateRegulatoryBody(duplicateQuery)
  if (duplicateExists) {
    return {
      status: false,
      message: { regulatory_bodies_name: 'This regulatory body already exists for the selected country.' },
      tokenStatus: true,
    }
  }

  if (category_row_id > 0) {
    await updateRegulatoryBody(category_row_id, {
      regulatory_bodies_name: regulatory_bodies_name.trim(),
      country_id: parsed_country_id,
      regulatory_type_id: parsed_type_id,
    })
    return { status: true, message: { alert_message: 'This regulatory body detail has been updated successfully.' }, tokenStatus: true }
  }

  await insertRegulatoryBody({
    regulatory_bodies_name: regulatory_bodies_name.trim(),
    country_id: parsed_country_id,
    regulatory_type_id: parsed_type_id,
    date_n_time: getPresentDateTime(),
  })

  return { status: true, message: { alert_message: 'New regulatory body detail has been added successfully.' }, tokenStatus: true }
}

/**
 * Ports GET /delete_bodies/:category_row_id verbatim (legacy lines 226-278).
 * Preserves the EXISTING delete-guard: refuses to delete a regulatory body
 * still referenced by any company's regularities_details.regulatory_bodies_ids.
 *
 * Cascade #2 (delete-then-recount-then-conditionally-delete-country) is
 * reproduced in the exact same sequence as legacy lines 254-262:
 *   1. Capture country_id off the body record BEFORE deleting it.
 *   2. Delete the body.
 *   3. Re-count remaining bodies for that captured country_id.
 *   4. If zero remain, delete the country row for that same country_id.
 * The count query runs AFTER the delete, and is scoped to the country_id
 * captured in step 1 (not re-read from the now-deleted body document).
 */
export async function deleteRegulatoryBody(categoryRowIdRaw: string) {
  const category_row_id = Number.parseInt(categoryRowIdRaw)

  const bodyRecord = await findRegulatoryBodyById(category_row_id)
  if (!bodyRecord) {
    return { status: false, message: { alert_message: 'Sorry, Invalid regulatory body ID.' }, tokenStatus: true }
  }

  const checkCategoryInUse = await findCompanyUsingRegulatoryBody(category_row_id)
  if (checkCategoryInUse) {
    return { status: false, message: { alert_message: 'Sorry, regulatory body is in use, cannot delete.' }, tokenStatus: true }
  }

  const { country_id } = bodyRecord

  await deleteRegulatoryBodyById(category_row_id)

  const remainingBodies = await countRegulatoryBodiesForCountry(country_id)

  if (remainingBodies === 0) {
    await deleteCountryByCountryId(Number.parseInt(country_id))
  }

  return { status: true, message: { alert_message: 'Regulatory body deleted successfully.' }, tokenStatus: true }
}
