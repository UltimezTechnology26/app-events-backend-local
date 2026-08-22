// modules/company/company.regulatory_details.service.ts
//
// Business logic for the Regulatory Types + Regulatory Bodies admin CRUD,
// migrated from controllers/admin_panel/category_tags/regularity_details.js
// into modules/company/'s subfeature-file convention. This legacy controller
// is a genuine two-sub-resource outlier (regulatory TYPES and regulatory
// BODIES share one legacy file) — both sub-resources are kept in this single
// service/controller pair, matching the legacy file's own structure, per the
// migration plan's explicit instruction not to force this into two modules.
//
// There is NO GET /list route in the legacy file for either sub-resource —
// none is added here.
//
// Two cascading side effects are the highest-risk part of this port and are
// reproduced EXACTLY, in the same order, with no added safety checks:
//
//   1) saveRegulatoryBody (ports POST /save_n_edit_bodies, legacy lines
//      113-221): if the given country_id does not already exist in
//      cln_exchanges_static_countries, a new country row is silently
//      auto-created (`new company_exchanges_countriesM({ country_id }).save()`)
//      BEFORE the duplicate-body check and BEFORE the body itself is
//      saved/updated (legacy lines 148-153).
//
//   2) deleteRegulatoryBody (ports GET /delete_bodies/:category_row_id,
//      legacy lines 226-278): after the body is deleted, the country_id is
//      re-counted for remaining bodies; if zero remain, the country row is
//      ALSO deleted (legacy lines 254-262). The country_id used for the
//      re-count/delete is captured from the body record BEFORE the delete
//      (legacy line 254, `const { country_id } = bodyRecord`) — not re-read
//      afterward, since the body document no longer exists at that point.

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../utils/helpers/helper')
const company_exchanges_countriesM = require('../../models/app/company/company_exchanges_countriesM')
const company_regulatory_typesM = require('../../models/app/company/company_regulatory_typesM')
const companyM = require('../../models/app/company/companyM')
const company_exchanges_bodiesM = require('../../models/app/company/company_exchanges_bodiesM')

export interface SaveNEditTypeParams {
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/** Ports POST /save_n_edit verbatim (legacy lines 15-64, minus the FIX #4 err.message leak). */
export async function saveNEditType({ body, preValidationErrors }: SaveNEditTypeParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let category_row_id = 0
  if (body.category_row_id) {
    category_row_id = Number.parseInt(body.category_row_id)

    const checkRegularities = await company_regulatory_typesM.findOne({ _id: category_row_id })
    if (!checkRegularities) {
      errObj['category_row_id'] = 'Invalid category row id'
    }
  }

  let regulator_type_name = ''
  if (body.regulator_type_name) {
    regulator_type_name = sanitize(body.regulator_type_name)
    const check_query = await company_regulatory_typesM
      .findOne({ _id: { $ne: category_row_id }, regulator_type_name: regulator_type_name }, { _id: 1 })
      .collation({ locale: 'en', strength: 2 })
    if (check_query) {
      errObj['regulator_type_name'] = 'Sorry, This Regulatory type  already exist.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (category_row_id > 0) {
    await company_regulatory_typesM.updateOne({ _id: category_row_id }, { $set: { regulator_type_name: regulator_type_name } })
    return { status: true, message: { alert_message: 'This Regularity type details has been updated successfully.' }, tokenStatus: true }
  }

  await new company_regulatory_typesM({ regulator_type_name: regulator_type_name, date_n_time: getPresentDateTime() }).save()
  return { status: true, message: { alert_message: 'New Regularity type details has been added successfully.' }, tokenStatus: true }
}

/**
 * Ports GET /delete_type/:category_row_id verbatim (legacy lines 66-110).
 * Preserves the EXISTING delete-guard: refuses to delete a regulatory type
 * still referenced by any regulatory body's regulatory_type_id.
 */
export async function deleteRegulatoryType(categoryRowIdRaw: string) {
  const category_row_id = Number.parseInt(categoryRowIdRaw)

  const checkQuery = await company_regulatory_typesM.findOne({ _id: category_row_id })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Sorry, Invalid regulatory type id ' }, tokenStatus: true }
  }

  const check_bodies = await company_exchanges_bodiesM.findOne({ regulatory_type_id: category_row_id })
  if (check_bodies) {
    return { status: false, message: { alert_message: 'Sorry, regulatory type is used in bodies, cannot delete.' }, tokenStatus: true }
  }

  await company_regulatory_typesM.deleteOne({ _id: category_row_id })
  return { status: true, message: { alert_message: 'This regulatory type details has been deleted successfully.' }, tokenStatus: true }
}

export interface SaveNEditBodiesParams {
  body: Record<string, any>
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
    category_row_id = Number.parseInt(body.category_row_id)

    const checkRegularities = await company_exchanges_bodiesM.findOne({ _id: category_row_id })
    if (!checkRegularities) {
      errObj['category_row_id'] = 'Invalid category row id'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const { regulatory_bodies_name, country_id, regulatory_type_id } = body
  const parsed_country_id = Number.parseInt(country_id)
  const parsed_type_id = Number.parseInt(regulatory_type_id)

  // Cascade #1: silently auto-create the country row if it doesn't exist yet.
  const existingCountry = await company_exchanges_countriesM.findOne({ country_id: parsed_country_id })
  if (!existingCountry) {
    await new company_exchanges_countriesM({
      country_id: parsed_country_id,
    }).save()
  }

  const duplicateQuery: Record<string, any> = {
    regulatory_bodies_name: regulatory_bodies_name.trim(),
    country_id: parsed_country_id,
  }
  if (category_row_id > 0) {
    duplicateQuery._id = { $ne: category_row_id }
  }

  const duplicateExists = await company_exchanges_bodiesM.findOne(duplicateQuery)
  if (duplicateExists) {
    return {
      status: false,
      message: { regulatory_bodies_name: 'This regulatory body already exists for the selected country.' },
      tokenStatus: true,
    }
  }

  if (category_row_id > 0) {
    await company_exchanges_bodiesM.updateOne(
      { _id: category_row_id },
      {
        $set: {
          regulatory_bodies_name: regulatory_bodies_name.trim(),
          country_id: parsed_country_id,
          regulatory_type_id: parsed_type_id,
        },
      }
    )
    return { status: true, message: { alert_message: 'This regulatory body detail has been updated successfully.' }, tokenStatus: true }
  }

  await new company_exchanges_bodiesM({
    regulatory_bodies_name: regulatory_bodies_name.trim(),
    country_id: parsed_country_id,
    regulatory_type_id: parsed_type_id,
    date_n_time: getPresentDateTime(),
  }).save()

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

  const bodyRecord = await company_exchanges_bodiesM.findOne({ _id: category_row_id })
  if (!bodyRecord) {
    return { status: false, message: { alert_message: 'Sorry, Invalid regulatory body ID.' }, tokenStatus: true }
  }

  const checkCategoryInUse = await companyM.findOne({
    'regularities_details.regulatory_bodies_ids': category_row_id,
  })
  if (checkCategoryInUse) {
    return { status: false, message: { alert_message: 'Sorry, regulatory body is in use, cannot delete.' }, tokenStatus: true }
  }

  const { country_id } = bodyRecord

  await company_exchanges_bodiesM.deleteOne({ _id: category_row_id })

  const remainingBodies = await company_exchanges_bodiesM.countDocuments({ country_id })

  if (remainingBodies === 0) {
    await company_exchanges_countriesM.deleteOne({ country_id: Number.parseInt(country_id) })
  }

  return { status: true, message: { alert_message: 'Regulatory body deleted successfully.' }, tokenStatus: true }
}
