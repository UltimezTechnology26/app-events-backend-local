import logger from '../../../config/logger'
import { ActorRef } from '../status-audit/status-audit.types'
import { insertChangeLog } from '../status-audit/status-audit.queries'
import { deleteChangeRequest, findRequestById, markRejected } from './change-request.queries'
import { ApplyChangeRequestResult, CHANGE_REQUEST_STATUS } from './change-request.types'

const LOG_ACTION_REJECT = 'reject'

export const NOT_FOUND_MESSAGE = 'Sorry, Invalid change request id'
export const NOT_PENDING_MESSAGE = 'Sorry, This change request is no longer pending'
const REJECTED_MESSAGE = 'Change request rejected'
const CANCELLED_MESSAGE = 'Change request cancelled'

/** A reject is recorded in full, unlike a cancel (decision §13.1 item 13). */
export async function rejectChangeRequest({
  changeRequestId,
  actor,
  reason,
}: {
  changeRequestId: number
  actor: ActorRef
  reason: string
}): Promise<ApplyChangeRequestResult> {
  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }
  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    return { status: false, message: { alert_message: NOT_PENDING_MESSAGE } }
  }

  await markRejected({ id: changeRequestId, actor, reason })

  try {
    await insertChangeLog({
      module: request.module,
      target_collection: request.target_collection,
      target_row_id: request.target_row_id ?? request.root_document_id,
      root_document_id: request.root_document_id,
      section: request.section,
      action: LOG_ACTION_REJECT,
      actor,
      changes: request.changes,
      reason,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: reject log write failed')
  }

  return { status: true, message: { alert_message: REJECTED_MESSAGE } }
}

/**
 * Hard-deletes the request and writes no log. Decision §13.1 item 13: a cancel by the person who
 * made the edit behaves as a delete button and leaves no trace, deliberately unlike a reject.
 */
export async function cancelChangeRequest({
  changeRequestId,
  actor,
}: {
  changeRequestId: number
  actor: ActorRef
}): Promise<ApplyChangeRequestResult> {
  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }
  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    return { status: false, message: { alert_message: NOT_PENDING_MESSAGE } }
  }

  await deleteChangeRequest(changeRequestId)

  return { status: true, message: { alert_message: CANCELLED_MESSAGE } }
}
