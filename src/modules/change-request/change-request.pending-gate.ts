import { AUDIT_MODULE_COMPANY, AUDIT_MODULE_EVENTS, AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'

// Model requires are lazy (inside the function), same reasoning as change-request.registry.ts's own
// cache-invalidation requires: change-request.apply.test.ts mocks mongoose, so an eager top-level
// require of a real Mongoose model here would blow up test setup.
const PENDING_APPROVAL_STATUS = 0

/**
 * A Company, Professional or Event that is still waiting for its first approval isn't live yet, so
 * there is nothing to protect with the approve-and-publish review: every edit made from the admin
 * panel is saved straight to the record, exactly like the owner's own self-service edits. The
 * approve -> publish flow only applies once the record has been approved.
 *
 * Returns false for an unknown module, so an unrecognised module keeps the staged flow.
 */
export async function isPendingRootRecord(module: string, rootDocumentId: number): Promise<boolean> {
  let model: { findOne: (filter: Record<string, unknown>, projection: Record<string, unknown>) => { lean: () => Promise<{ approval_status?: number } | null> } } | null = null
  if (module === AUDIT_MODULE_COMPANY) model = require('../../../models/app/company/companyM')
  else if (module === AUDIT_MODULE_PROFESSIONALS) model = require('../../../models/app/professionalsM')
  else if (module === AUDIT_MODULE_EVENTS) model = require('../../../models/app/events/eventM')
  if (!model) return false

  const record = await model.findOne({ _id: rootDocumentId }, { approval_status: 1 }).lean()
  return record !== null && record.approval_status === PENDING_APPROVAL_STATUS
}
