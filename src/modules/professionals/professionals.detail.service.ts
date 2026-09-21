// modules/professionals/professionals.detail.service.ts
//
// Ports user.js's GET /single_details/:user_row_id (~2975-3437) — the plan's headline Phase A
// perf fix. The real route ran ~20 single-record queries as sequential `await`s, one after
// another, purely because that's the order they were written in — not because most of them
// actually depend on each other. Reading the handler closely shows the true dependency shape is
// two rounds:
//
//   ROUND 1 (everything that only needs `user_row_id`, not the core record's field values):
//   the core professional record itself, the work-experience "current position" head, social
//   links, SEO details, both follower counts, disabled/recovery history, the profile-image row,
//   company details, the three lookup-heavy aggregates (work-experience, people-following,
//   company-following), and the event-speaker/sponsor-partner existence checks. None of these
//   read anything the others produce, so they run together in one Promise.all.
//
//   ROUND 2 (genuinely dependent on round 1's results, so they cannot be pulled into round 1):
//   - sub_admin_name needs the core record's `sub_admin_row_id`.
//   - updated_by_full_name needs the core record's `updated_by`/`updated_by_row_id`.
//   - looking_for_names_list needs the core record's `looking_for_id` array.
//   - designation_name_list needs the core record's `designation_id` array.
//   - country_name needs the core record's `country_id`.
//   - the default-profile-image fallback needs round 1's profile-image row's `profile_image_type`.
//   - the events aggregate needs the event_row_id arrays produced by round 1's speaker/sponsor
//     existence checks (see professionals.detail.queries.ts's buildEventsPipeline comment).
//   These five/six lookups don't depend on EACH OTHER, only on round 1, so they themselves run
//   together in one Promise.all once round 1 resolves — two batched rounds total instead of ~20
//   sequential awaits.
//
// Response shape is preserved field-for-field from the real route's `resObject` — this is a
// migration, not a redesign; nothing below invents a new field or drops an existing one.
import {
  fetchCoreProfessional,
  fetchSubAdminName,
  fetchUpdatedByProfessional,
  fetchUpdatedByAdmin,
  fetchLookingForNames,
  fetchDesignationNames,
  fetchCountryName,
  fetchDefaultProfileImage,
  fetchWorkExperienceHead,
  fetchSocialLinks,
  fetchSeoDetails,
  countTotalFollowers,
  countTotalFollowing,
  fetchDisabledHistory,
  fetchRecoveryHistory,
  fetchProfileImage,
  fetchCompanyDetails,
  fetchWorkExperienceAggregate,
  fetchPeopleFollowing,
  fetchCompanyFollowing,
  fetchEventSpeakers,
  fetchSponsorPartnerEvents,
  extractEventRowIds,
  fetchEvents,
} from './professionals.detail.queries'
import { ProfessionalM } from './professionals.models'

/**
 * CONFIRMED NEW ROUTE (user-requested, 2026-09-19): the admin panel's Professional View page
 * should open at `/admin/professionals/view/<user_name>/`, the same username the public profile
 * page uses in its own URL, instead of the numeric row id. A plain, unrestricted `findOne` (no
 * approval/login-status filter) - an admin must be able to view a pending or disabled
 * professional by their username too, same reasoning as Company's own
 * `getIndividualDetailsBySlug`.
 */
export async function getProfessionalDetailBySlug(userNameSlug: string) {
  if (!userNameSlug) {
    return { status: false, message: { alert_message: 'The user name field is required.' } }
  }

  const professional = await ProfessionalM.findOne({ user_name: userNameSlug }).select('_id').lean()
  if (!professional) {
    return { status: false, message: { alert_message: 'Professional not found.' } }
  }

  return getProfessionalDetail(String(professional._id))
}

export async function getProfessionalDetail(userRowIdRaw: string) {
  const user_row_id = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(user_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  // ROUND 1 — independent reads, none needs another's result (see file header).
  const [
    queryRun,
    userDesignationHead,
    socialQueryRun,
    seoQueryRun,
    totalFollowers,
    totalFollowing,
    disabledHistory,
    recoveryHistory,
    imageQueryRun,
    companyDetails,
    userExperience,
    peopleFollowingList,
    companyFollowingList,
    eventSpeakersQuery,
    sponsorPartnerQuery,
  ] = await Promise.all([
    fetchCoreProfessional(user_row_id),
    fetchWorkExperienceHead(user_row_id),
    fetchSocialLinks(user_row_id),
    fetchSeoDetails(user_row_id),
    countTotalFollowers(user_row_id),
    countTotalFollowing(user_row_id),
    fetchDisabledHistory(user_row_id),
    fetchRecoveryHistory(user_row_id),
    fetchProfileImage(user_row_id),
    fetchCompanyDetails(user_row_id),
    fetchWorkExperienceAggregate(user_row_id),
    fetchPeopleFollowing(user_row_id),
    fetchCompanyFollowing(user_row_id),
    fetchEventSpeakers(user_row_id),
    fetchSponsorPartnerEvents(user_row_id),
  ])

  if (!queryRun) {
    return { status: false, message: { alert_message: 'No data Found' } }
  }

  const speakersEventsId = eventSpeakersQuery?.length ? extractEventRowIds(eventSpeakersQuery) : []
  const sponsorPartnerId = sponsorPartnerQuery?.length ? extractEventRowIds(sponsorPartnerQuery) : []
  const speakerStatus = speakersEventsId.length > 0

  // ROUND 2 — depends on round 1's results (see file header for the genuine dependency on each).
  const [subAdmin, updatedByFullName, lookingForNamesList, designationNameList, countryQuery, defaultImageQuery, events] = await Promise.all([
    queryRun.sub_admin_row_id ? fetchSubAdminName(queryRun.sub_admin_row_id) : Promise.resolve(null),
    resolveUpdatedByFullName(queryRun.updated_by, queryRun.updated_by_row_id),
    queryRun.looking_for_id ? fetchLookingForNames(queryRun.looking_for_id) : Promise.resolve([]),
    queryRun.designation_id ? fetchDesignationNames(queryRun.designation_id) : Promise.resolve([]),
    queryRun.country_id ? fetchCountryName(queryRun.country_id) : Promise.resolve(null),
    // `!= 0` (not `!== 0`) is the pre-existing guard here and does NOT actually exclude a
    // null/undefined `profile_image_type` - preserved as-is; the cast below just satisfies the
    // type checker for this same pre-existing behavior, not a new gap introduced by real typing.
    imageQueryRun && imageQueryRun.profile_image_type != 0 ? fetchDefaultProfileImage(imageQueryRun.profile_image_type as number) : Promise.resolve(null),
    fetchEvents({ userRowId: user_row_id, speakersEventsId, sponsorPartnerId }),
  ])

  // `company_name`/`podcast_id`/`podcast_title`/`work_position`/`password` are read off the core
  // professional record here (matching legacy user.js:2975-3437 exactly) but none of them are
  // fields on `cln_professionals`' own schema (confirmed against professionals.models.ts's full
  // field list) - a plain `findOne` always returns `undefined` for these, pre-existing since this
  // route was first ported, not introduced by real schema typing. Preserved as-is (ported
  // byte-for-byte), cast to `any` only so these specific reads type-check the same way they always
  // silently did before ProfessionalM had a real type.
  const legacyUntypedFields = queryRun as any
  const resObject: Record<string, unknown> = {}
  resObject['_id'] = queryRun._id
  resObject['account_visible_type'] = queryRun.account_visible_type
  resObject['user_name'] = queryRun.user_name
  resObject['full_name'] = queryRun.full_name
  resObject['email_id'] = queryRun.email_id
  resObject['pro_batch'] = queryRun.pro_batch
  resObject['mobile_number'] = queryRun.mobile_number
  resObject['country_id'] = queryRun.country_id
  resObject['login_status'] = queryRun.login_status
  resObject['approval_status'] = queryRun.approval_status
  resObject['reason_rejected'] = queryRun.reason_rejected
  resObject['rejected_date_n_time'] = queryRun.rejected_date_n_time
  resObject['gender'] = queryRun.gender
  resObject['created_date_n_time'] = queryRun.created_date_n_time
  resObject['company_name'] = legacyUntypedFields.company_name
  resObject['referral_user_name'] = queryRun.referral_user_name
  resObject['designation_id_array'] = queryRun.designation_id
  resObject['podcast_id'] = legacyUntypedFields.podcast_id
  resObject['podcast_title'] = legacyUntypedFields.podcast_title
  resObject['sub_admin_row_id'] = queryRun.sub_admin_row_id
  resObject['claim_status'] = queryRun.claim_status
  resObject['user_bio'] = queryRun.user_bio
  resObject['location'] = queryRun.location
  resObject['looking_for_id_array'] = queryRun.looking_for_id
  resObject['vcf_status'] = queryRun.vcf_status

  resObject['updated_by'] = queryRun.updated_by
  resObject['updated_by_row_id'] = queryRun.updated_by_row_id
  resObject['updated_date_n_time'] = queryRun.updated_date_n_time
  resObject['updated_by_full_name'] = updatedByFullName
  resObject['sub_admin_name'] = subAdmin?.full_name || ''
  resObject['sub_admin_row_id'] = queryRun.sub_admin_row_id

  resObject['looking_for_names_list'] = queryRun.looking_for_id ? lookingForNamesList : []

  if (userDesignationHead && userDesignationHead.length > 0) {
    resObject['work_position'] = userDesignationHead[0].position
    resObject['company_name'] = userDesignationHead[0].company_name
  } else {
    resObject['work_position'] = legacyUntypedFields.work_position
    resObject['company_name'] = legacyUntypedFields.company_name
  }

  if (socialQueryRun) {
    resObject['facebook'] = socialQueryRun.facebook
    resObject['twitter'] = socialQueryRun.twitter
    resObject['linkedin'] = socialQueryRun.linkedin
    resObject['instagram'] = socialQueryRun.instagram
    resObject['video_link'] = socialQueryRun.video_link
    resObject['telegram'] = socialQueryRun.telegram
    resObject['medium'] = socialQueryRun.medium
    resObject['reddit'] = socialQueryRun.reddit
    resObject['youtube_channel'] = socialQueryRun.youtube_channel
  }

  if (seoQueryRun) {
    resObject['meta_keywords'] = seoQueryRun.meta_keywords
    resObject['meta_description'] = seoQueryRun.meta_description
  }

  resObject['total_followers'] = totalFollowers
  resObject['total_following'] = totalFollowing

  resObject['country_name'] = countryQuery ? countryQuery.country_name : ''

  resObject['disabled_history'] = disabledHistory
  resObject['recovery_history'] = recoveryHistory

  resObject['designation_name_list'] = queryRun.designation_id ? designationNameList : []

  resObject['set_password_status'] = Boolean(legacyUntypedFields.password)

  if (imageQueryRun) {
    if (imageQueryRun.profile_image_type == 0) {
      resObject['profile_image'] = imageQueryRun.profile_image
    } else if (defaultImageQuery) {
      resObject['profile_image'] = defaultImageQuery['image_name']
    }
  }

  resObject['company_details'] = companyDetails
  resObject['user_experience'] = userExperience
  resObject['people_following_list'] = peopleFollowingList
  resObject['company_following_list'] = companyFollowingList
  resObject['speaker_status'] = speakerStatus
  resObject['events'] = events

  // CONFIRMED BUG FIX: these are real fields on the professional document, kept up to date by
  // calculateUserProfileScore() on every self-service write (utils/helpers/app_helper.js) - the
  // self-service `single_details` equivalent already projects them (professionals.self-service.
  // service.ts's PROFILE_SCORE_FIELDS), but this admin route's resObject builder never copied them
  // over even though queryRun already has them. That left the admin professional editor's Profile
  // Strength widget always reading undefined -> displaying "0% Incomplete" for every professional,
  // regardless of how complete their profile actually is. Additive fields only - no existing field
  // changed or removed.
  resObject['professional_profile_score'] = queryRun.professional_profile_score
  resObject['seo_details_score'] = queryRun.seo_details_score
  resObject['social_media_score'] = queryRun.social_media_score
  resObject['academy_score'] = queryRun.academy_score
  resObject['community_score'] = queryRun.community_score
  resObject['professional_detail_score'] = queryRun.professional_detail_score
  resObject['investment_score'] = queryRun.investment_score
  resObject['award_score'] = queryRun.award_score
  resObject['faq_score'] = queryRun.faq_score
  resObject['profile_score'] = queryRun.profile_score

  return { status: true, message: resObject }
}

/** Ports the updated_by full-name resolution (user.js:3021-3036) — genuinely depends on the core record's `updated_by`/`updated_by_row_id`, so it can't join round 1. */
async function resolveUpdatedByFullName(updatedBy: string | null | undefined, updatedByRowId: number | null | undefined): Promise<string> {
  if (!updatedBy || !updatedByRowId) return ''

  if (updatedBy === 'user') {
    const userQuery = await fetchUpdatedByProfessional(updatedByRowId)
    return userQuery?.full_name || ''
  }

  if (updatedBy === 'admin' || updatedBy === 'subadmin') {
    const adminQuery = await fetchUpdatedByAdmin(updatedByRowId)
    return adminQuery?.full_name || ''
  }

  return ''
}
