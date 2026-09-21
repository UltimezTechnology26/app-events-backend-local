// modules/professionals/professionals.detail.queries.ts
//
// Query builders/runners for user.js's GET /single_details/:user_row_id (~2975-3437) — the
// plan's headline Phase A perf fix: ~20 sequential single-record `await`s collapsed into two
// batched Promise.all rounds (see professionals.detail.service.ts for the round split and the
// reasoning for which lookups are genuinely dependent vs independent).
//
// Every model here is either already colocated in professionals.models.ts (re-exported from
// legacy per the OverwriteModelError fix documented there) or is required directly from its
// legacy top-level `models/` path — same pattern professionals.service.ts already uses for
// companyM/eventM/etc. None of these are redeclared with `mongoose.model(...)`, so there is no
// OverwriteModelError risk: a plain `require()` of an already-registered legacy model file just
// returns the same cached module object.
import { array_column } from '../../../utils/helpers/helper'
import { ProfessionalM, ProfessionalSocialLinksM, ProfessionalSeoDetailsM, ProfessionalProfileImagesM, ProfessionalDisabledM } from './professionals.models'

const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
const user_looking_forM = require('../../../models/app/static/user_looking_forM')
const user_designationsM = require('../../../models/app/static/user_designationsM')
const countryM = require('../../../models/app/static/countryM')
const default_profile_imgM = require('../../../models/app/static/default_profile_imgM')
const companyM = require('../../../models/app/company/companyM')
const companyFollowersM = require('../../../models/app/company/followersM')
const eventM = require('../../../models/app/events/eventM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const professionals_delete_actionsM = require('../../../models/app/professionals_delete_actionsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
// Legacy declares this same model twice under two different local names
// (`professionals_followersM` for the own-follower counts, `usersFollowersM` for the
// people-following-list aggregate) — both `require()` the identical file, so one shared binding
// here is the same object, not a duplicate declaration.
const professionalsFollowersM = require('../../../models/app/professionals_followersM')

/** Ports the base professional record fetch (user.js:2982). */
export function fetchCoreProfessional(userRowId: number) {
  return ProfessionalM.findOne({ _id: userRowId })
}

/** Ports the sub_admin_name lookup (user.js:3013-3016) — genuinely depends on the core record's `sub_admin_row_id`. */
export function fetchSubAdminName(subAdminRowId: number) {
  return sub_adminM.findOne({ _id: subAdminRowId }, { full_name: 1 })
}

/** Ports the "updated_by" professional-side lookup (user.js:3024-3027) — genuinely depends on the core record's `updated_by`/`updated_by_row_id`. */
export function fetchUpdatedByProfessional(updatedByRowId: number) {
  return ProfessionalM.findOne({ _id: updatedByRowId }, { full_name: 1 })
}

/** Ports the "updated_by" admin/subadmin-side lookup (user.js:3030-3033) — same genuine dependency as fetchUpdatedByProfessional. */
export function fetchUpdatedByAdmin(updatedByRowId: number) {
  return sub_adminM.findOne({ _id: updatedByRowId }, { full_name: 1 })
}

/** Ports the looking_for_names_list lookup (user.js:3048) — genuinely depends on the core record's `looking_for_id` array. */
export function fetchLookingForNames(lookingForIds: number[]) {
  return user_looking_forM.find({ _id: { $in: lookingForIds }, active_status: true }, { _id: 1, name: 1 })
}

/** Ports the designation_name_list lookup (user.js:3102) — genuinely depends on the core record's `designation_id` array. */
export function fetchDesignationNames(designationIds: number[]) {
  return user_designationsM.find({ _id: { $in: designationIds }, active_status: true }, { designation_name: 1 })
}

/** Ports the country_name lookup (user.js:3094) — genuinely depends on the core record's `country_id`. */
export function fetchCountryName(countryId: number) {
  return countryM.findOne({ _id: countryId }, { country_name: 1 })
}

/** Ports the default-profile-image fallback lookup (user.js:3116) — genuinely depends on the profile-image record's `profile_image_type`. */
export function fetchDefaultProfileImage(profileImageType: number) {
  return default_profile_imgM.findOne({ _id: profileImageType })
}

/** Ports the work-experience "current position" head query (user.js:3051) — independent of the core record, needs only `user_row_id`. */
export function fetchWorkExperienceHead(userRowId: number) {
  return professionals_work_experienceM
    .find({ user_row_id: userRowId, till_date_status: 2, public_view: true }, { position: 1, company_name: 1, till_date_status: 1 })
    .sort({ start_date: -1 })
    .limit(1)
}

/** Ports the social-links single lookup (user.js:3064) — independent, needs only `user_row_id`. */
export function fetchSocialLinks(userRowId: number) {
  return ProfessionalSocialLinksM.findOne({ user_row_id: userRowId })
}

/** Ports the SEO-details single lookup (user.js:3078) — independent, needs only `user_row_id`. */
export function fetchSeoDetails(userRowId: number) {
  return ProfessionalSeoDetailsM.findOne({ user_row_id: userRowId })
}

/** Ports the total_followers count (user.js:3084) — independent, needs only `user_row_id`. */
export function countTotalFollowers(userRowId: number) {
  return professionalsFollowersM.countDocuments({ following_user_row_id: userRowId, confirm_request_status: 2 })
}

/** Ports the total_following count (user.js:3085) — independent, needs only `user_row_id`. */
export function countTotalFollowing(userRowId: number) {
  return professionalsFollowersM.countDocuments({ follower_user_row_id: userRowId, confirm_request_status: 2 })
}

/** Ports the disabled_history lookup (user.js:3089) — independent, needs only `user_row_id`. */
export function fetchDisabledHistory(userRowId: number) {
  return ProfessionalDisabledM.find({ user_row_id: userRowId })
}

/** Ports the recovery_history lookup (user.js:3090) — independent, needs only `user_row_id`. */
export function fetchRecoveryHistory(userRowId: number) {
  return professionals_delete_actionsM.find({ user_row_id: userRowId })
}

/** Ports the profile-image lookup (user.js:3110) — independent, needs only `user_row_id`. */
export function fetchProfileImage(userRowId: number) {
  return ProfessionalProfileImagesM.findOne({ user_row_id: userRowId })
}

/** Ports the company_details lookup (user.js:3123) — independent, needs only `user_row_id`. */
export function fetchCompanyDetails(userRowId: number) {
  return companyM.findOne({ user_row_id: userRowId }, { company_id: 1, company_name: 1, company_logo: 1, company_email_id: 1, website_link: 1, approval_status: 1, active_status: 1 })
}

/** Ports the event_speakers existence lookup (user.js:3419) — independent, needs only `user_row_id`. */
export function fetchEventSpeakers(userRowId: number) {
  return event_speakersM.find({ user_row_id: userRowId }, { event_row_id: 1 })
}

/** Ports the sponsor/partner existence lookup (user.js:3430) — independent, needs only `user_row_id`. */
export function fetchSponsorPartnerEvents(userRowId: number) {
  return event_sponsors_partner_detailsM.find({ account_type: 1, registered_type: 1, sponsor_partner_row_id: userRowId }, { event_row_id: 1 })
}

/** Extracts an `event_row_id` array from a speaker/sponsor query result, matching legacy's `array_column(query, 'event_row_id')` usage. */
export function extractEventRowIds(rows: Array<{ event_row_id: unknown }>): unknown[] {
  return array_column(rows, 'event_row_id')
}

/** Ports the user_experience aggregation (user.js:3125-3214) verbatim — independent, needs only `user_row_id`. */
export function buildWorkExperienceAggregatePipeline(userRowId: number) {
  return [
    { $match: { user_row_id: userRowId } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'company_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }],
      },
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }],
      },
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_name', else: '$manual_info.company_name' } },
        company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_logo', else: '$manual_info.company_logo' } },
        company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_id', else: '' } },
        company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_email_id', else: '$manual_info.company_email_id' } },
      },
    },
    {
      $project: {
        user_row_id: 1,
        position: 1,
        responsibilities: 1,
        employment_type: 1,
        location: 1,
        till_date_status: 1,
        start_date: 1,
        end_date: 1,
        location_type: 1,
        public_view: 1,
        company_type: 1,
        company_row_id: 1,
        company_name: 1,
        company_logo: 1,
        company_id: 1,
        company_email_id: 1,
      },
    },
    { $sort: { till_date_status: -1, start_date: -1, _id: -1 } },
    {
      $group: {
        _id: { company_type: '$company_type', company_row_id: '$company_row_id' },
        company_name: { $first: '$company_name' },
        company_logo: { $first: '$company_logo' },
        company_type: { $first: '$company_type' },
        company_row_id: { $first: '$company_row_id' },
        professional_details: { $push: '$$ROOT' },
      },
    },
  ]
}

export function fetchWorkExperienceAggregate(userRowId: number) {
  return professionals_work_experienceM.aggregate(buildWorkExperienceAggregatePipeline(userRowId))
}

/** Ports the people_following_list aggregation (user.js:3218-3333) verbatim — independent, needs only `user_row_id`. */
export function buildPeopleFollowingPipeline(userRowId: number) {
  return [
    { $match: { follower_user_row_id: userRowId, confirm_request_status: 2 } },
    { $lookup: { from: 'cln_professionals', localField: 'following_user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: { login_status: 1 } } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'following_user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_social_links', localField: 'following_user_row_id', foreignField: 'user_row_id', as: 'social_info' } },
    { $unwind: { path: '$social_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_followers',
        localField: 'following_user_row_id',
        foreignField: 'following_user_row_id',
        pipeline: [{ $match: { confirm_request_status: 2 } }],
        as: 'count_following',
      },
    },
    {
      $lookup: {
        from: 'cln_professionals_followers',
        localField: 'following_user_row_id',
        foreignField: 'following_user_row_id',
        pipeline: [{ $match: { follower_user_row_id: userRowId } }],
        as: 'user_followed',
      },
    },
    { $unwind: { path: '$user_followed', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: 'following_user_row_id',
        foreignField: 'user_row_id',
        pipeline: [
          { $match: { till_date_status: 2, public_view: true } },
          { $sort: { start_date: -1 } },
          { $limit: 1 },
          { $project: { position: 1, company_name: 1, till_date_status: 1 } },
        ],
        as: 'designation_head',
      },
    },
    {
      $addFields: {
        work_position: {
          $cond: [{ $eq: [{ $size: '$designation_head' }, 0] }, '$user_info.work_position', { $ifNull: ['$designation_head.position', '$user_info.work_position'] }],
        },
        company_name: {
          $cond: [{ $eq: [{ $size: '$designation_head' }, 0] }, '$user_info.company_name', { $ifNull: ['$designation_head.company_name', '$user_info.company_name'] }],
        },
      },
    },
    {
      $project: {
        _id: '$user_info._id',
        profile_image: '$img_info.profile_image',
        user_name: '$user_info.user_name',
        pro_batch: '$user_info.pro_batch',
        user_approval_status: '$user_info.approval_status',
        full_name: '$user_info.full_name',
        work_position: 1,
        company_name: 1,
        facebook: '$social_info.facebook',
        twitter: '$social_info.twitter',
        linkedin: '$social_info.linkedin',
        instagram: '$social_info.instagram',
        video_link: '$social_info.video_link',
        telegram: '$social_info.telegram',
        medium: '$social_info.medium',
        reddit: '$social_info.reddit',
        total_followers: { $size: '$count_following' },
        user_followed_status: { $cond: { if: '$user_followed.confirm_request_status', then: '$user_followed.confirm_request_status', else: 0 } },
      },
    },
  ]
}

export function fetchPeopleFollowing(userRowId: number) {
  return professionalsFollowersM.aggregate(buildPeopleFollowingPipeline(userRowId))
}

/** Ports the company_following_list aggregation (user.js:3335-3414) verbatim — independent, needs only `user_row_id`. */
export function buildCompanyFollowingPipeline(userRowId: number) {
  return [
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'cmpny_info' } },
    { $unwind: '$cmpny_info' },
    { $lookup: { from: 'cln_professionals', localField: 'cmpny_info.user_row_id', foreignField: '_id', as: 'company_user_info' } },
    { $unwind: { path: '$company_user_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        login_status: { $cond: { if: '$company_user_info.login_status', then: '$company_user_info.login_status', else: 1 } },
        approval_status: '$cmpny_info.approval_status',
        active_status: '$cmpny_info.active_status',
      },
    },
    { $match: { user_row_id: userRowId, login_status: 1, approval_status: 1, active_status: 1 } },
    { $lookup: { from: 'cln_company_followers', localField: 'company_row_id', foreignField: 'company_row_id', as: 'count_following' } },
    {
      $lookup: {
        from: 'cln_company_followers',
        localField: 'company_row_id',
        foreignField: 'company_row_id',
        pipeline: [{ $match: { user_row_id: userRowId } }],
        as: 'user_followed',
      },
    },
    { $unwind: { path: '$user_followed', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'cmpny_info.main_business_model_id', foreignField: '_id', as: 'business' } },
    { $unwind: { path: '$business', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        company_logo: '$cmpny_info.company_logo',
        company_id: '$cmpny_info.company_id',
        company_name: '$cmpny_info.company_name',
        company_row_id: 1,
        facebook: '$cmpny_info.facebook',
        twitter: '$cmpny_info.twitter',
        linkedin: '$cmpny_info.linkedin',
        instagram: '$cmpny_info.instagram',
        video_link: '$cmpny_info.video_link',
        telegram: '$cmpny_info.telegram',
        medium: '$cmpny_info.medium',
        reddit: '$cmpny_info.reddit',
        business_name: '$business.business_name',
        total_followers: { $size: '$count_following' },
        user_followed_status: { $cond: { if: '$user_followed', then: 1, else: 0 } },
      },
    },
  ]
}

export function fetchCompanyFollowing(userRowId: number) {
  return companyFollowersM.aggregate(buildCompanyFollowingPipeline(userRowId))
}

/**
 * Ports the events aggregation (user.js:3437-3512) verbatim. GENUINE DEPENDENCY (not
 * parallelized further): the `$match`'s `_id: {$in: speakersEventsId}` / `_id: {$in:
 * sponsorPartnerId}` clauses need the event_row_id arrays produced by fetchEventSpeakers /
 * fetchSponsorPartnerEvents, so this must run after those two resolve.
 */
export function buildEventsPipeline({ userRowId, speakersEventsId, sponsorPartnerId }: { userRowId: number; speakersEventsId: unknown[]; sponsorPartnerId: unknown[] }) {
  return [
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $set: { user_login_status: '$user_info.login_status', company_active_status: '$company_info.active_status' } },
    {
      $match: {
        $and: [
          {
            $or: [
              { user_row_id: userRowId, list_event_type: { $in: [1, 3] } },
              { _id: { $in: speakersEventsId }, list_event_type: { $in: [1, 2, 3] } },
              { _id: { $in: sponsorPartnerId }, list_event_type: { $in: [1, 2, 3] } },
            ],
          },
          { active_status: 1, approval_status: 1 },
          {
            $or: [
              { user_login_status: 1, list_event_type: 1 },
              { company_active_status: 1, list_event_type: 2 },
              { list_event_type: 3, user_login_status: 1, company_active_status: 1 },
            ],
          },
        ],
      },
    },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    { $sort: { end_date: -1 } },
    {
      $project: {
        _id: 1,
        user_row_id: 1,
        company_row_id: 1,
        event_title: 1,
        event_type: 1,
        event_image: 1,
        event_url: 1,
        start_date: 1,
        end_date: 1,
        event_price: 1,
        created_date_n_time: 1,
        utc_time: '$utc_dates.utc_time',
      },
    },
  ]
}

export function fetchEvents(params: { userRowId: number; speakersEventsId: unknown[]; sponsorPartnerId: unknown[] }) {
  return eventM.aggregate(buildEventsPipeline(params))
}
