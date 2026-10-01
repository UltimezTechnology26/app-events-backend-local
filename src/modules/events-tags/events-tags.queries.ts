// modules/events-tags/events-tags.queries.ts
//
// Ports controllers/app/events/events_listed.js's GET /events_tags (1461) — the shared endpoint
// behind 3 duplicated admin-coinpedia proxy files (events-manage/{events_approvals,manage,
// published_events}/events_tags.js, dedup flagged in the migration audit). Not the same as
// `event_tags/list` (already ported in system_settings.event_tags — that's admin CRUD for the
// tag catalog; this route is a dropdown/picker data source combining tags + default images +
// the calling user's own previous-event/company/profile snapshot).
//
// No perf bug found here — legacy already batches its 4-7 independent queries via one
// Promise.all (events_listed.js:1610-1620); ported as-is.
import { buildViewEventSpeakersInfoWorkPipeline } from '../events/events.view.queries'

/** Reuses events.view.queries.ts's identical position/company-resolution shape (same pipeline, just applied to the calling user's own profile instead of a speaker's). */
export function buildEventsTagsUserInfoWorkPipeline() {
  return buildViewEventSpeakersInfoWorkPipeline()
}

export function buildPreviousEventPipeline(userRowId: number) {
  return [
    { $match: { user_row_id: userRowId, $or: [{ contact_email_id: { $ne: '' }, contact_mobile_number: { $ne: '' } }] } },
    { $sort: { _id: -1 as const } },
    { $lookup: { from: 'cln_event_contacts', localField: '_id', foreignField: 'event_row_id', as: 'contact_info' } },
    { $unwind: { path: '$contact_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_countries', localField: 'contact_info.country_id', foreignField: '_id', as: 'co_info' } },
    { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
    { $set: { contact_id: 'contact_info._id' } },
    {
      $project: {
        event_row_id: '$contact_info.event_row_id',
        country_id: '$contact_info.country_id',
        contact_number: '$contact_info.contact_number',
        email_id: '$contact_info.email_id',
        contact_type: '$contact_info.contact_type',
        contact_reason: '$contact_info.contact_reason',
        country_code: '$co_info.country_code',
      },
    },
    { $sort: { contact_id: 1 as const } },
  ]
}

export function buildCompanySnapshotPipeline(userRowId: number) {
  return [
    { $match: { user_row_id: userRowId, approval_status: 1, active_status: 1 } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info' } },
    { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'co_info' } },
    { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        company_id: 1,
        company_name: 1,
        company_email_id: 1,
        company_logo: { $cond: { if: '$company_logo', then: '$company_logo', else: 'company.png' } },
        main_business_model_id: 1,
        country_name: '$co_info.country_name',
        main_business_model_name: '$main_business_info.business_name',
      },
    },
  ]
}

export function buildUserSnapshotPipeline(userRowId: number) {
  return [
    { $match: { _id: userRowId } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'co_info' } },
    { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'user_image' } },
    { $unwind: { path: '$user_image', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', pipeline: buildEventsTagsUserInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        full_name: 1,
        pro_batch: 1,
        user_name: 1,
        position_name: '$info_work.position_name',
        company_name: '$info_work.company_name',
        country_name: '$co_info.country_name',
        user_bio: '$user_bio',
        profile_image: '$user_image.profile_image',
      },
    },
  ]
}
