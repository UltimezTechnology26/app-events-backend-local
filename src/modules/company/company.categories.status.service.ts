// modules/company/company.categories.status.service.ts
//
// Ports GET /enable/:request_row_id, GET /disable/:request_row_id, and GET
// /delete/:request_row_id from
// controllers/admin_panel/category_tags/company_business_model.js. Split
// out of company.categories.service.ts purely to stay under the
// file-length limit.

import {
  findCompanyCategoryById,
  updateCompanyCategory,
  deleteCompanyCategoryById,
} from './company.categories.queries'
import { invalidateCompanyCategoriesCaches } from './company.categories.cache'

/** Ports GET /enable/:request_row_id verbatim (legacy lines 496-527). */
export async function enableCompanyCategory({ requestRowIdRaw }: { requestRowIdRaw: string }) {
  if (Number.isNaN(Number.parseInt(requestRowIdRaw))) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)

  const get_query = await findCompanyCategoryById(request_row_id)
  if (!get_query) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  await updateCompanyCategory(request_row_id, { active_status: true })
  const [deletedKey] = await invalidateCompanyCategoriesCaches()

  return {
    status: true,
    delted_key: deletedKey,
    message: { alert_message: 'This  Company category details has been enabled successfully.' },
  }
}

/** Ports GET /disable/:request_row_id verbatim (legacy lines 531-562). */
export async function disableCompanyCategory({ requestRowIdRaw }: { requestRowIdRaw: string }) {
  if (Number.isNaN(Number.parseInt(requestRowIdRaw))) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)

  const get_query = await findCompanyCategoryById(request_row_id)
  if (!get_query) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  await updateCompanyCategory(request_row_id, { active_status: false })
  await invalidateCompanyCategoriesCaches()

  return { status: true, message: { alert_message: 'This Company category details has been disabled successfully.' } }
}

/** Ports GET /delete/:request_row_id verbatim (legacy lines 564-587). */
export async function deleteCompanyCategory({ requestRowIdRaw }: { requestRowIdRaw: string }) {
  const request_row_id = Number.parseInt(requestRowIdRaw)

  const checkQuery = await findCompanyCategoryById(request_row_id)
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Sorry, Invalid crypto category id ' } }
  }

  await deleteCompanyCategoryById(request_row_id)
  await invalidateCompanyCategoriesCaches()

  return { status: true, message: { alert_message: 'This Company category has been deleted successfully.' } }
}
