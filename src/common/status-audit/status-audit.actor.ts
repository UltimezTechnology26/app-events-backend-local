import { ActorRef, ActorType, UpdateTracker } from './status-audit.types'

const KNOWN_ACTOR_TYPES: readonly string[] = ['admin', 'subadmin', 'user', 'system']

/**
 * `type: 'admin'` is NOT a `cln_sub_admins` row at all - it authenticates against a completely
 * separate model (`admin_authM`, controllers/admin_panel/auth.js's '/login'), and that login
 * route hardcodes `admin_row_id: 1` in the JWT for EVERY full-admin login, regardless of which
 * `admin_authM` row actually signed in (`resultArray['_id'] = 1`, never `rowData._id`) - `id`
 * carries no meaningful, distinguishable identity for this type the way it does for `subadmin`
 * (whose id is the real `subAdminData._id`). Confirmed live: a sub-admin reviewer's real id
 * resolved to their name correctly, but an `admin` actor's id (1, from this exact login flow)
 * has no matching `cln_sub_admins` row to find - looking one up there was never going to work.
 * `type: 'subadmin'` is unaffected by any of this - it keeps its real id-based lookup below.
 */
export async function resolveActorName(actor: ActorRef | null | undefined): Promise<string | null> {
  if (!actor || actor.id === null || actor.id === undefined) return null

  if (actor.type === 'admin') {
    return 'Main Admin'
  }
  if (actor.type === 'subadmin') {
    // Lazy require, same reasoning as change-request.common-resolvers.ts - this file is
    // imported from change-request.service.ts, which change-request.apply.test.ts mocks
    // mongoose around, so an eager require here would reproduce the exact "mongoose.Schema is
    // not a constructor" regression already hit once this session for a different eager-loaded
    // cache module.
    const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
    const doc = await sub_adminM.findById(actor.id).select('full_name').lean()
    return doc?.full_name ?? null
  }
  if (actor.type === 'user') {
    const professionalsM = require('../../../models/app/professionalsM')
    const doc = await professionalsM.findById(actor.id).select('full_name').lean()
    return doc?.full_name ?? null
  }
  return null
}

/**
 * Maps getUpdateTrackerFields()'s { updated_by, updated_by_row_id } to an ActorRef.
 * Row ids are coerced because several call sites type them as `string | number`
 * (raw JWT-decoded values are not guaranteed numeric at the type level).
 */
export function toActorRef(tracker: UpdateTracker): ActorRef {
  const rawType = tracker.updated_by
  const type: ActorType = rawType !== null && KNOWN_ACTOR_TYPES.includes(rawType)
    ? (rawType as ActorType)
    : 'system'

  if (tracker.updated_by_row_id === null || tracker.updated_by_row_id === undefined) {
    return { type, id: null }
  }

  const id = Number(tracker.updated_by_row_id)
  return { type, id: Number.isNaN(id) ? null : id }
}

/**
 * Resolves the actor TYPE from the tracker but takes the actor ID from an explicitly
 * supplied value.
 *
 * Needed because getUpdateTrackerFields() hardcodes `updated_by_row_id: 0` for a full
 * admin (admin_manager_type === 1) and discards admin_row_id entirely — see
 * coinpedia-backend-library/auth/index.ts:70-72. Only sub-admins carry a real id there.
 * Since the maker-checker flow has full admins doing the approving and publishing, that
 * would leave every admin action recorded as `id: 0` and make "which admin approved
 * this" unanswerable. A caller holding the real admin_row_id passes it here instead.
 *
 * Falls back to the tracker's own id when no usable explicit id is given.
 */
export function toActorRefWithId(
  tracker: UpdateTracker,
  explicitId: number | string | null | undefined,
): ActorRef {
  const base = toActorRef(tracker)

  if (explicitId === null || explicitId === undefined || explicitId === '') {
    return base
  }

  const id = Number(explicitId)
  return Number.isNaN(id) ? base : { type: base.type, id }
}
