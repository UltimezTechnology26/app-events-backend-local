// modules/system_settings/system_settings.service.ts
const experienceLevelsM = require('../../models/app/static/experience_levelsM')
const reportFeedbackIssuesOptionsM = require('../../models/app/static/report_feedback_issues_optionsM')
const eventTagsM = require('../../models/app/static/event_tagsM')
const eventM = require('../../models/app/events/eventM')
const userLookingForM = require('../../models/app/static/user_looking_forM')
const professionalsM = require('../../models/app/professionalsM')
const userDesignationsM = require('../../models/app/static/user_designationsM')
const { getPresentDateTime } = require('../../utils/helpers/helper')
import { extractPaginatedResult, buildPaginatedFacetStages } from '../common/common.pagination'
import {
  validateExperienceLevelInput,
  ExperienceLevelInput,
  validateReportIssuesOptionsInput,
  ReportIssuesOptionsInput,
  validateEventTagInput,
  EventTagInput,
  validateAreaOfInterestInput,
  AreaOfInterestInput,
  validateUserExpertiseInput,
  UserExpertiseInput,
} from './system_settings.validation'
import {
  buildExperienceLevelListFilter,
  buildExperienceLevelListPipeline,
  buildEventTagsListStages,
  buildEventTagUsageCheckFilter,
  buildAreaOfInterestsListStages,
  buildAreaOfInterestUsageCheckFilter,
  buildUserExpertiseListStages,
  buildUserExpertiseUsageCheckFilter,
} from './system_settings.queries'
import {
  invalidateEventTagsCaches,
  invalidateAreaOfInterestsCaches,
  invalidateUserExpertiseCaches,
} from './system_settings.cache'

interface Actor {
  status: boolean
  message: any
}

// ==== Experience Level ====
//
// Ports every handler body from controllers/admin_panel/category_tags/experience_level.js
// verbatim, following the repo's established `actor`-pattern convention (see
// modules/partners/partners.service.ts): the controller resolves
// `checkAdminLoginToken` into an `actor` object and passes it in; the service
// checks `actor.status` and returns the actor object itself (matching the
// legacy `res.json(checkToken)` behavior on auth failure) before doing any work.

export interface ListExperienceLevelsParams {
  actor: Actor
  search?: string
  skip: number
  limit: number
}

/**
 * Ports experience_level.js's GET /list (lines 10-27). The legacy handler runs a
 * plain, unfiltered `experience_levelsM.find()` with no pagination and returns the
 * full array as `message`. Fix #5 (approved) adds optional skip/limit pagination via
 * common.pagination.ts's $facet helper — when no skip/limit given, callers default to
 * a full list (see controller), preserving the legacy "return everything" behavior.
 * `count` is new (added by the pagination fix); `data`/`message` carries the same
 * records the legacy `.find()` would have returned.
 */
export async function listExperienceLevels({ actor, search, skip, limit }: ListExperienceLevelsParams) {
  if (!actor.status) {
    return actor
  }

  const filter = buildExperienceLevelListFilter({ search })
  const stages = buildExperienceLevelListPipeline({ filter, skip, limit })
  const aggregateOutput = await experienceLevelsM.aggregate(stages)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count, tokenStatus: true }
}

export interface SaveExperienceLevelParams {
  actor: Actor
  input: ExperienceLevelInput
}

/** Ports experience_level.js's POST /save (lines 29-57). */
export async function saveExperienceLevel({ actor, input }: SaveExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateExperienceLevelInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  await new experienceLevelsM({
    experience: input.experience,
    active_status: true,
    date_n_time: getPresentDateTime(),
  }).save()

  return { status: true, message: { alert_message: 'New Experience created successfully.' }, tokenStatus: true }
}

export interface UpdateExperienceLevelParams {
  actor: Actor
  requestRowId: number
  input: ExperienceLevelInput
}

/**
 * Ports experience_level.js's POST /update/:request_row_id (lines 59-88). The legacy
 * handler does NOT check whether a document with this id exists — it always calls
 * `updateOne` and always responds with the success message regardless of match count.
 * Preserved exactly: no existence check here either.
 */
export async function updateExperienceLevel({ actor, requestRowId, input }: UpdateExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateExperienceLevelInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  await experienceLevelsM.updateOne({ _id: requestRowId }, { experience: input.experience })

  return { status: true, message: { alert_message: 'Experience updated successfully.' }, tokenStatus: true }
}

export interface ToggleExperienceLevelParams {
  actor: Actor
  requestRowId: number
}

/**
 * Ports experience_level.js's GET /enable/:request_row_id (lines 90-113). The legacy
 * handler is NOT a simple "set active_status = true" — it first requires the row to
 * currently be active_status: false (i.e. it rejects enabling an already-enabled or
 * nonexistent row with a distinct error message). Preserved exactly rather than merged
 * into a single always-succeeds toggle.
 */
export async function enableExperienceLevel({ actor, requestRowId }: ToggleExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await experienceLevelsM.findOne({ _id: requestRowId, active_status: false })
  if (checkQuery) {
    await experienceLevelsM.updateOne({ _id: requestRowId }, { $set: { active_status: true } })
    return { status: true, message: { alert_message: 'This Experience enabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Experience row id  or already enabled.' },
    tokenStatus: true,
  }
}

/** Ports experience_level.js's GET /disable/:request_row_id (lines 115-137), mirror of enable above. */
export async function disableExperienceLevel({ actor, requestRowId }: ToggleExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await experienceLevelsM.findOne({ _id: requestRowId, active_status: true })
  if (checkQuery) {
    await experienceLevelsM.updateOne({ _id: requestRowId }, { $set: { active_status: false } })
    return { status: true, message: { alert_message: 'This Experience disabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Experience id  or already disabled.' },
    tokenStatus: true,
  }
}

export interface DeleteExperienceLevelParams {
  actor: Actor
  requestRowId: number
}

/** Ports experience_level.js's GET /delete/:request_row_id (lines 139-162). */
export async function deleteExperienceLevel({ actor, requestRowId }: DeleteExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await experienceLevelsM.findOne({ _id: requestRowId })
  if (checkQuery) {
    await experienceLevelsM.deleteOne({ _id: requestRowId })
    return { status: true, message: { alert_message: 'This Experience deleted successfully.' }, tokenStatus: true }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid Experience id ' }, tokenStatus: true }
}

// ==== Report Issues Options ====
//
// Ports controllers/admin_panel/category_tags/report_issues_options.js's POST
// /add_update (its only route) verbatim. Note this legacy file's success
// responses do NOT include `tokenStatus` (unlike experience_level.js above) —
// preserved exactly, no tokenStatus added here. `checkUserLoginToken` is
// imported by the legacy file but never called anywhere in it (confirmed
// dead import) — only `checkAdminLoginToken` is used, mirrored via the
// `actor` param below.

export interface UpsertReportIssuesOptionsParams {
  actor: Actor
  input: ReportIssuesOptionsInput
}

export async function upsertReportIssuesOptions({ actor, input }: UpsertReportIssuesOptionsParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateReportIssuesOptionsInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const { module_type, tab_key, tab_name, sub_tab_key = null, report_issues, active_status = true } = input

  const checkQuery = await reportFeedbackIssuesOptionsM.findOne({
    module_type,
    tab_key,
    sub_tab_key,
  })

  if (checkQuery) {
    await reportFeedbackIssuesOptionsM.updateOne(
      { _id: checkQuery._id },
      {
        $set: {
          tab_name,
          report_issues,
          active_status,
          date_n_time: getPresentDateTime(),
        },
      }
    )

    return { status: true, message: { alert_message: 'Report issue options updated successfully.' } }
  }

  const saveObj = new reportFeedbackIssuesOptionsM({
    module_type,
    tab_key,
    tab_name,
    sub_tab_key,
    report_issues,
    active_status,
    date_n_time: getPresentDateTime(),
  })
  await saveObj.save()

  return { status: true, message: { alert_message: 'Report issue options added successfully.' } }
}

// ==== Event Tags ====
//
// Ports controllers/admin_panel/category_tags/event_tags.js verbatim, with
// two approved fixes and one documented divergence from the task brief's
// inline snippets (the brief's snippets were not followed where they
// diverged from the real legacy file, per the migration's own rules):
//
// - FIX #1: the legacy save/update handlers call `res.json(errObj)` on a
//   validation failure WITHOUT `return`ing, so execution falls through into
//   the duplicate-check and (if no duplicate is found) the save/update still
//   runs despite the invalid input. Fixed here by returning immediately.
// - FIX #2: `deleteEventTag` now refuses deletion when `cln_events` still
//   has a document whose `event_tags` array contains this tag id (checked
//   only against live events via `eventM`, not `cln_deleted_events` — the
//   legacy list aggregation's `deleted_count` lookup is purely a display
//   stat, and a tag referenced only by an already soft-deleted event is not
//   "still referenced" in the sense fix #2 is meant to guard against).
// - Divergence: the legacy save handler never persists `keywords` (its
//   express-validator check for it is commented out AND the `.save()` call
//   itself omits the field), and the legacy update handler never touches
//   `keywords` either (also commented out). Preserved exactly — `keywords`
//   is accepted on the input type for forward-compatibility but is not
//   written by either function, matching the real file rather than the
//   brief's inline snippet (which set it on save).
// - Divergence: the legacy update handler's duplicate-name check queries
//   ALL tags (it does not exclude the row being updated by `_id`), unlike
//   the brief's placeholder-free stand-in which excluded it via `$ne`.
//   Preserved exactly as the legacy behavior, even though it means
//   re-submitting a tag's own unchanged name always triggers the duplicate
//   error.
// - Divergence: the legacy update handler has no existence check at all —
//   it always calls `updateOne` and always responds with the success
//   message, exactly like `updateExperienceLevel` above. Preserved exactly
//   rather than the brief's inline snippet, which added a "not found" branch.

function escapeRegexForEventTag(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

export interface ListEventTagsParams {
  actor: Actor
  search?: string
  activeStatus?: string
  skip: number
  limit: number
}

/** Ports event_tags.js's GET /list (lines 12-167). */
export async function listEventTags({ actor, search, activeStatus, skip, limit }: ListEventTagsParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildEventTagsListStages({ search, active_status: activeStatus })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await eventTagsM.aggregate(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  // NOTE: legacy event_tags.js's GET /list response does NOT include `tokenStatus`
  // (unlike its save/update/enable/disable/delete responses, which all do) — preserved
  // exactly, no tokenStatus added here.
  return { status: true, message: data, count }
}

export interface SaveEventTagParams {
  actor: Actor
  input: EventTagInput
}

/** Ports event_tags.js's POST /save (lines 170-220), with FIX #1 applied. */
export async function saveEventTag({ actor, input }: SaveEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateEventTagInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const cleanEventTag = (input.event_tag as string).trim()
  const isExists = await eventTagsM.findOne({
    event_tag: { $regex: '^' + escapeRegexForEventTag(cleanEventTag) + '$', $options: 'i' },
  })

  if (isExists) {
    return { status: false, message: { event_tag: 'This event tag already exists.' } }
  }

  await new eventTagsM({
    event_tag: input.event_tag,
    active_status: true,
    date_n_time: getPresentDateTime(),
  }).save()
  await invalidateEventTagsCaches()

  return { status: true, message: { alert_message: 'New Event tag created successfully.' }, tokenStatus: true }
}

export interface UpdateEventTagParams {
  actor: Actor
  requestRowId: number
  input: EventTagInput
}

/** Ports event_tags.js's POST /update/:request_row_id (lines 222-275), with FIX #1 applied. */
export async function updateEventTag({ actor, requestRowId, input }: UpdateEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateEventTagInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const cleanEventTag = (input.event_tag as string).trim()
  const isExists = await eventTagsM.findOne({
    event_tag: { $regex: '^' + escapeRegexForEventTag(cleanEventTag) + '$', $options: 'i' },
  })

  if (isExists) {
    return { status: false, message: { event_tag: 'This event tag already exists.' } }
  }

  await eventTagsM.updateOne({ _id: requestRowId }, { event_tag: input.event_tag })
  await invalidateEventTagsCaches()

  return { status: true, message: { alert_message: 'Event tag updated successfully.' }, tokenStatus: true }
}

export interface ToggleEventTagParams {
  actor: Actor
  requestRowId: number
}

/** Ports event_tags.js's GET /enable/:request_row_id (lines 277-301). */
export async function enableEventTag({ actor, requestRowId }: ToggleEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await eventTagsM.findOne({ _id: requestRowId, active_status: false })
  if (checkQuery) {
    await eventTagsM.updateOne({ _id: requestRowId }, { $set: { active_status: true } })
    await invalidateEventTagsCaches()
    return { status: true, message: { alert_message: 'This Event Tag enabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Event Tag id  or already enabled.' },
    tokenStatus: true,
  }
}

/** Ports event_tags.js's GET /disable/:request_row_id (lines 303-327), mirror of enable above. */
export async function disableEventTag({ actor, requestRowId }: ToggleEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await eventTagsM.findOne({ _id: requestRowId, active_status: true })
  if (checkQuery) {
    await eventTagsM.updateOne({ _id: requestRowId }, { $set: { active_status: false } })
    await invalidateEventTagsCaches()
    return { status: true, message: { alert_message: 'This Event Tag disabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Event Tag id  or already disabled.' },
    tokenStatus: true,
  }
}

export interface DeleteEventTagParams {
  actor: Actor
  requestRowId: number
}

/** Ports event_tags.js's GET /delete/:request_row_id (lines 329-353), with FIX #2 applied. */
export async function deleteEventTag({ actor, requestRowId }: DeleteEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildEventTagUsageCheckFilter(requestRowId)
  const inUse = await eventM.findOne(usageFilter)
  if (inUse) {
    return {
      status: false,
      message: { alert_message: 'This event tag is still used by an event and cannot be deleted.' },
      tokenStatus: true,
    }
  }

  const checkQuery = await eventTagsM.findOne({ _id: requestRowId })
  if (checkQuery) {
    await eventTagsM.deleteOne({ _id: requestRowId })
    await invalidateEventTagsCaches()
    return { status: true, message: { alert_message: 'This Event Tag deleted successfully.' }, tokenStatus: true }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid Event Tag id ' }, tokenStatus: true }
}

// ==== Area of Interests ====
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js verbatim,
// with FIX #2 applied and the cache-key standardization described in
// system_settings.cache.ts. Notable divergences from the task brief's
// inline snippets, found by reading the real legacy file (354 lines) in
// full rather than trusting the brief:
//
// - The save route (`/save_n_add_user_looking`) and update route
//   (`/update_looking/:looking_id`) use DIFFERENT required-field messages
//   for the same `looking_for_name` field ('The Looking for Name field is
//   required' vs 'The Looking for field is required') — both preserved via
//   `validateAreaOfInterestInput`'s `requiredMessage` param.
// - Save's duplicate-name check does NOT exclude any row (new record), but
//   update's DOES exclude the row being updated via `_id: { $ne: ... }` —
//   the opposite of event_tags.js's update, which does NOT exclude itself.
//   Both preserved exactly per their own legacy file.
// - Save trims the name before persisting (`req.body.looking_for_name.trim()`)
//   but update does NOT trim it (`req.body.looking_for_name` as-is) — a
//   genuine legacy asymmetry, preserved exactly.
// - `disable_looking` has NO `active_status` condition in its existence
//   check (`findOne({ _id })` only), unlike `enable_looking` (which requires
//   `active_status: false`) and unlike experience_level's disable (which
//   requires `active_status: true`). This means disabling an already-disabled
//   row still succeeds. Preserved exactly — not one of the two approved fixes.
// - `enable_looking`/`disable_looking`/`delete_looking_for` all echo the
//   `deleteKeysByPattern` result back to the client as a `delted_key` field
//   on the response (a legacy quirk unique to this file, absent from
//   experience_level.js/event_tags.js) — preserved exactly. `save`/`update`
//   do NOT echo it (they call the cache invalidation without capturing its
//   return value), also preserved exactly.
// - FIX #2: `deleteAreaOfInterest` refuses deletion when `cln_professionals`
//   still has a document whose `looking_for_id` array contains this area's
//   id, reusing the exact `$in`/`$ifNull` array-membership join already
//   proven by the legacy list aggregation's own `$lookup` into
//   `cln_professionals`.

export interface ListAreasOfInterestParams {
  actor: Actor
  search?: string
  status?: string
  skip: number
  limit: number
}

/** Ports area_of_interests.js's GET /list (lines 13-137). */
export async function listAreasOfInterest({ actor, search, status, skip, limit }: ListAreasOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildAreaOfInterestsListStages({ search, status })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await userLookingForM.aggregate(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveAreaOfInterestParams {
  actor: Actor
  input: AreaOfInterestInput
}

/** Ports area_of_interests.js's POST /save_n_add_user_looking (lines 142-196). */
export async function saveAreaOfInterest({ actor, input }: SaveAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateAreaOfInterestInput(input, 'The Looking for Name field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.looking_for_name as string).trim().toLowerCase()
  const checkExisting = await userLookingForM.findOne({
    $expr: { $eq: [{ $toLower: '$name' }, normalizedName] },
  })

  if (checkExisting) {
    return {
      status: false,
      message: { looking_for_name: 'This Area of interest already exists.' },
    }
  }

  await new userLookingForM({
    name: (input.looking_for_name as string).trim(),
    date_n_time: getPresentDateTime(),
  }).save()
  await invalidateAreaOfInterestsCaches()

  return {
    status: true,
    message: { alert_message: 'New Area of interest details has been added successfully.' },
  }
}

export interface UpdateAreaOfInterestParams {
  actor: Actor
  requestRowId: number
  input: AreaOfInterestInput
}

/** Ports area_of_interests.js's POST /update_looking/:looking_id (lines 199-259). */
export async function updateAreaOfInterest({ actor, requestRowId, input }: UpdateAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateAreaOfInterestInput(input, 'The Looking for field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.looking_for_name as string).trim().toLowerCase()
  const checkExisting = await userLookingForM.findOne({
    _id: { $ne: requestRowId },
    $expr: { $eq: [{ $toLower: '$name' }, normalizedName] },
  })

  if (checkExisting) {
    return {
      status: false,
      message: { looking_for_name: 'This Area of interest already exists.' },
    }
  }

  await userLookingForM.updateOne(
    { _id: requestRowId },
    { $set: { name: input.looking_for_name, date_n_time: getPresentDateTime() } }
  )
  await invalidateAreaOfInterestsCaches()

  return {
    status: true,
    message: { alert_message: 'This Area of interest details has been updated successfully.' },
  }
}

export interface ToggleAreaOfInterestParams {
  actor: Actor
  requestRowId: number
}

/** Ports area_of_interests.js's GET /enable_looking/:looking_id (lines 262-286). */
export async function enableAreaOfInterest({ actor, requestRowId }: ToggleAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await userLookingForM.findOne({ _id: requestRowId, active_status: false })
  if (checkQuery) {
    await userLookingForM.updateOne({ _id: requestRowId }, { $set: { active_status: true } })
    const [deletedKey] = await invalidateAreaOfInterestsCaches()
    return {
      status: true,
      message: { alert_message: 'This Area of interest has been enabled successfully.' },
      delted_key: deletedKey,
    }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Area of interest id or already enabled.' },
  }
}

/**
 * Ports area_of_interests.js's GET /disable_looking/:looking_id (lines
 * 288-312). NOTE: unlike enable above, the legacy existence check here has
 * NO `active_status` condition — preserved exactly (see file-header note).
 */
export async function disableAreaOfInterest({ actor, requestRowId }: ToggleAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await userLookingForM.findOne({ _id: requestRowId })
  if (checkQuery) {
    await userLookingForM.updateOne({ _id: requestRowId }, { $set: { active_status: false } })
    const [deletedKey] = await invalidateAreaOfInterestsCaches()
    return {
      status: true,
      message: { alert_message: 'This Area of interest has been disabled successfully.' },
      delted_key: deletedKey,
    }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Area of interest id or already disabled.' },
  }
}

export interface DeleteAreaOfInterestParams {
  actor: Actor
  requestRowId: number
}

/** Ports area_of_interests.js's GET /delete_looking_for/:looking_id (lines 314-338), with FIX #2 applied. */
export async function deleteAreaOfInterest({ actor, requestRowId }: DeleteAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildAreaOfInterestUsageCheckFilter(requestRowId)
  const inUse = await professionalsM.findOne(usageFilter)
  if (inUse) {
    return {
      status: false,
      message: { alert_message: 'This Area of interest is still assigned to a professional and cannot be deleted.' },
    }
  }

  const checkQuery = await userLookingForM.findOne({ _id: requestRowId })
  if (checkQuery) {
    await userLookingForM.deleteOne({ _id: requestRowId })
    const [deletedKey] = await invalidateAreaOfInterestsCaches()
    return {
      status: true,
      message: { alert_message: 'This Area of interest has been deleted successfully.' },
      delted_key: deletedKey,
    }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid Area of interest id' } }
}

// ==== User Expertise ====
//
// Ports controllers/admin_panel/category_tags/user_expertise.js verbatim,
// with FIX #2 applied and the cache-key standardization described in
// system_settings.cache.ts. Notable divergences from the task brief's
// inline snippets, found by reading the real legacy file (349 lines) in
// full rather than trusting the brief:
//
// - The save route (`/save_n_add_position`) and update route
//   (`/update_position/:designation_id`) use DIFFERENT required-field
//   messages for `designation_name` ('The expertise  field is required'
//   [sic, double space — a genuine legacy typo] vs 'The Designation Name
//   field is required') — both preserved via `validateUserExpertiseInput`'s
//   `requiredMessage` param.
// - `show_in_job_status` is carried through both save and update exactly as
//   the legacy handler does — `req.body.show_in_job_status` is written
//   as-is (no default, no coercion) on save, and the same on update.
// - Save's duplicate-name check does NOT exclude any row (new record), but
//   update's DOES exclude the row being updated via `_id: { $ne: ... }` —
//   the same asymmetry already seen in area_of_interests.js. Both preserved
//   exactly per the real file.
// - The duplicate-name error message differs between save
//   ('This Expertise  is already exists.' [sic, double space + grammar
//   preserved verbatim]) and update ('This expertise tag already exists.')
//   — a genuine legacy quirk, not a typo introduced here.
// - The legacy save handler has the same missing-`return`-after-validation-
//   error bug already fixed structurally in event_tags.js/area_of_interests.js
//   above (every branch here returns immediately) — not one of the two
//   explicitly-approved fixes, but a natural consequence of writing each
//   branch as an explicit `return`, exactly as done for every other category
//   in this file.
// - The legacy list handler has NO pagination, NO cache, and returns
//   `total_users` (this controller's own unique field, absent from every
//   sibling category) alongside the five status-count fields shared with
//   area_of_interests.js's list. Pagination/`count` are added here as the
//   same already-approved module-wide enhancement applied to every other
//   list handler in this file. Neither legacy file ever sends `tokenStatus`,
//   so none is added here.
// - `enable_position` does NOT echo `delted_key` on its response, but
//   `disable_position` DOES (`delted_key: delted_key`, verbatim) and
//   `delete_position` does NOT — a three-way split unique to this legacy
//   file (area_of_interests.js's enable/disable/delete all echo it
//   uniformly). Preserved exactly: only disable's response includes
//   `delted_key` here.
// - FIX #2: `deleteUserExpertise` refuses deletion when `cln_professionals`
//   still has a document whose `designation_id` array contains this
//   designation's id, reusing the exact `$in`/`$ifNull` array-membership
//   join already proven by the legacy list aggregation's own `$lookup` into
//   `cln_professionals` (and structurally identical to
//   `buildAreaOfInterestUsageCheckFilter`'s technique above).

export interface ListUserExpertiseParams {
  actor: Actor
  search?: string
  status?: string
  skip: number
  limit: number
}

/** Ports user_expertise.js's GET /list (lines 11-143). */
export async function listUserExpertise({ actor, search, status, skip, limit }: ListUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildUserExpertiseListStages({ search, status })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await userDesignationsM.aggregate(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveUserExpertiseParams {
  actor: Actor
  input: UserExpertiseInput
}

/** Ports user_expertise.js's POST /save_n_add_position (lines 149-199). */
export async function saveUserExpertise({ actor, input }: SaveUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateUserExpertiseInput(input, 'The expertise  field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.designation_name as string).trim().toLowerCase()
  const checkExisting = await userDesignationsM.findOne({
    $expr: { $eq: [{ $toLower: '$designation_name' }, normalizedName] },
  })

  if (checkExisting) {
    return {
      status: false,
      message: { designation_name: 'This Expertise  is already exists.' },
    }
  }

  await new userDesignationsM({
    designation_name: (input.designation_name as string).trim(),
    show_in_job_status: input.show_in_job_status,
    date_n_time: getPresentDateTime(),
  }).save()
  await invalidateUserExpertiseCaches()

  return { status: true, message: { alert_message: 'New user expertise has been added successfully.' } }
}

export interface UpdateUserExpertiseParams {
  actor: Actor
  requestRowId: number
  input: UserExpertiseInput
}

/** Ports user_expertise.js's POST /update_position/:designation_id (lines 201-263). */
export async function updateUserExpertise({ actor, requestRowId, input }: UpdateUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateUserExpertiseInput(input, 'The Designation Name field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.designation_name as string).trim().toLowerCase()
  const checkExisting = await userDesignationsM.findOne({
    _id: { $ne: requestRowId },
    $expr: { $eq: [{ $toLower: '$designation_name' }, normalizedName] },
  })

  if (checkExisting) {
    return {
      status: false,
      message: { designation_name: 'This expertise tag already exists.' },
    }
  }

  await userDesignationsM.updateOne(
    { _id: requestRowId },
    {
      $set: {
        designation_name: (input.designation_name as string).trim(),
        show_in_job_status: input.show_in_job_status,
        date_n_time: getPresentDateTime(),
      },
    }
  )
  await invalidateUserExpertiseCaches()

  return {
    status: true,
    message: { alert_message: 'This user expertise has been updated successfully.' },
  }
}

export interface ToggleUserExpertiseParams {
  actor: Actor
  requestRowId: number
}

/** Ports user_expertise.js's GET /enable_position/:designation_id (lines 266-292). */
export async function enableUserExpertise({ actor, requestRowId }: ToggleUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await userDesignationsM.findOne({ _id: requestRowId, active_status: false })
  if (checkQuery) {
    await userDesignationsM.updateOne({ _id: requestRowId }, { $set: { active_status: true } })
    await invalidateUserExpertiseCaches()
    return { status: true, message: { alert_message: 'This expertise enabled successfully.' } }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid expertise id or already enabled.' },
  }
}

/**
 * Ports user_expertise.js's GET /disable_position/:designation_id (lines
 * 294-319). NOTE: unlike enable/delete below, the legacy response here
 * echoes the cache-invalidation result back as `delted_key` — preserved
 * exactly (see file-header note).
 */
export async function disableUserExpertise({ actor, requestRowId }: ToggleUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await userDesignationsM.findOne({ _id: requestRowId })
  if (checkQuery) {
    await userDesignationsM.updateOne({ _id: requestRowId }, { $set: { active_status: false } })
    const [deletedKey] = await invalidateUserExpertiseCaches()
    return {
      status: true,
      message: { alert_message: 'This expertise disabled successfully.' },
      delted_key: deletedKey,
    }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid expertise id or already disabled.' },
  }
}

export interface DeleteUserExpertiseParams {
  actor: Actor
  requestRowId: number
}

/** Ports user_expertise.js's GET /delete_position/:designation_id (lines 321-346), with FIX #2 applied. */
export async function deleteUserExpertise({ actor, requestRowId }: DeleteUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildUserExpertiseUsageCheckFilter(requestRowId)
  const inUse = await professionalsM.findOne(usageFilter)
  if (inUse) {
    return {
      status: false,
      message: { alert_message: 'This user expertise is still assigned to a professional and cannot be deleted.' },
    }
  }

  const checkQuery = await userDesignationsM.findOne({ _id: requestRowId })
  if (checkQuery) {
    await userDesignationsM.deleteOne({ _id: requestRowId })
    await invalidateUserExpertiseCaches()
    return { status: true, message: { alert_message: 'This expertise has been deleted successfully.' } }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid expertise id' } }
}
