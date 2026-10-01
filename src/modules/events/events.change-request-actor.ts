// modules/events/events.change-request-actor.ts
//
// Shared "is this write from the admin panel, and if so build its ActorRef" gate for all 10
// Events change-request sections (see change-request.registry.ts). Company's own equivalent
// (USER_TYPE_COMPANY_OWNER/ADMIN_ROW_ID_MAIN_ADMIN, company.settings.service.ts) is duplicated
// inline 3x within that one file; extracted into a shared helper here instead, since Events'
// gate needs to be applied from ~9 separate legacy controller files rather than one.
//
// Every one of these 10 sections' write routes is guarded by `checkAllLoginToken`, which accepts
// EITHER the event's own host (self-service, `user_type: 1`) OR an admin token (`user_type: 2`)
// on the exact same route (confirmed by reading every route directly - see the Phase 4 plan doc's
// own "Task 3b Step 5" notes). Per user decision 2026-09-25: only the admin-panel path is gated -
// the event's own host keeps writing live immediately, unchanged, exactly matching Company's own
// "Publish gate applies to admin-panel edits only" precedent.
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { ActorRef } from '../../common/status-audit/status-audit.types'

/** checkAllLoginToken's own normalized `user_type`: 1 = app user (the event's own host here), 2 = admin. */
const USER_TYPE_ADMIN = 2

/** Matches company.settings.service.ts's own ADMIN_ROW_ID_MAIN_ADMIN sentinel exactly. */
const ADMIN_ROW_ID_MAIN_ADMIN = 0

export interface CheckAllLoginTokenActor {
  status: boolean
  message: { user_row_id: number | string; user_type: number | string }
}

/** True when this request came from an admin token - false for the event's own host via self-service, which keeps writing live. */
export function isAdminPanelActor(actor: CheckAllLoginTokenActor): boolean {
  return Boolean(actor.status) && Number(actor.message.user_type) === USER_TYPE_ADMIN
}

export function buildEventChangeRequestActor(actor: CheckAllLoginTokenActor): ActorRef {
  const adminRowId = Number(actor.message.user_row_id)
  return toActorRefWithId(
    { updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin', updated_by_row_id: adminRowId },
    adminRowId,
  )
}
