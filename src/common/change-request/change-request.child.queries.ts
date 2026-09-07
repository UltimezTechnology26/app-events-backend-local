import { CHANGE_REQUEST_STATUS, ChangeRequestDoc, REQUEST_PROJECTION } from './change-request.types'

const change_requestM = require('../../../models/common/change_requestM')

/**
 * Finds any in-flight (not-yet-published) request for one specific ROW, not a whole section —
 * status `PENDING` or `APPROVED`. `APPROVED` means reviewed but not yet live, so it must still be
 * treated as the baseline for a new edit; otherwise a second submission would create a duplicate
 * request instead of amending the approved-but-unpublished one. This is the lookup a
 * document-scope section never needs, since it has at most one in-flight request per
 * (company, section). A list section can have several rows in flight at once, so editing an
 * existing row must be scoped down to that row's own target_row_id to amend the right one.
 */
export async function findPendingRequestForTargetRow({
  module,
  targetRowId,
  section,
}: {
  module: string
  targetRowId: number
  section: string
}): Promise<ChangeRequestDoc | null> {
  return change_requestM
    .findOne(
      {
        module,
        section,
        target_row_id: targetRowId,
        status: { $in: [CHANGE_REQUEST_STATUS.PENDING, CHANGE_REQUEST_STATUS.APPROVED] },
      },
      REQUEST_PROJECTION,
    )
    .lean()
}
