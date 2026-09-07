import logger from '../../../config/logger'
import { ActorRef } from '../status-audit/status-audit.types'
import { insertChangeLog } from '../status-audit/status-audit.queries'
import { findRequestById, markApproved } from './change-request.queries'
import { ApplyChangeRequestResult, CHANGE_REQUEST_STATUS } from './change-request.types'

const LOG_ACTION_APPROVE = 'approve'
const RATING_MIN = 1
const RATING_MAX = 10

export const NOT_FOUND_MESSAGE = 'Sorry, Invalid change request id'
export const NOT_PENDING_MESSAGE = 'Sorry, This change request is no longer pending'
export const INVALID_RATING_MESSAGE = 'Sorry, Rating must be a whole number from 1 to 10'
export const NOTE_REQUIRED_MESSAGE = 'The Note field is required'
const APPROVED_MESSAGE = 'Change request approved'

/**
 * Approve does NOT apply the change — it only records the reviewer's decision (rating + note)
 * and moves the request from PENDING to APPROVED. Publishing (making it live) is a separate,
 * later action — see change-request.apply.ts, now gated on APPROVED rather than PENDING.
 */
export async function approveChangeRequest({
  changeRequestId,
  actor,
  rating,
  note,
}: {
  changeRequestId: number
  actor: ActorRef
  rating: number
  note: string
}): Promise<ApplyChangeRequestResult> {
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    return { status: false, message: { alert_message: INVALID_RATING_MESSAGE } }
  }
  if (note.trim() === '') {
    return { status: false, message: { alert_message: NOTE_REQUIRED_MESSAGE } }
  }

  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }
  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    return { status: false, message: { alert_message: NOT_PENDING_MESSAGE } }
  }

  await markApproved({ id: changeRequestId, actor, rating, note })

  try {
    await insertChangeLog({
      module: request.module,
      target_collection: request.target_collection,
      target_row_id: request.target_row_id ?? request.root_document_id,
      root_document_id: request.root_document_id,
      section: request.section,
      action: LOG_ACTION_APPROVE,
      actor,
      changes: request.changes,
      reason: note,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: approve log write failed')
  }

  return { status: true, message: { alert_message: APPROVED_MESSAGE } }
}
