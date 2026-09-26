// modules/events/events.view.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /view_event/:request_row_id (8288) and its
// three same-file position-resolution sub-pipeline builders (8019-8285). Pipeline shape ported
// verbatim — this is a single-document detail view (no pagination bug class applies).
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../funding/funding.queries'

function companyLookupStages(companyTypeMatchValue: 1 | 2, collection: string, asName: string) {
  return {
    $lookup: {
      from: collection,
      let: { company_type: '$company_type', company_row_id: '$company_row_id' },
      as: asName,
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: [companyTypeMatchValue, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
        { $project: { _id: 1, company_name: 1 } },
      ],
    },
  }
}

const POSITION_COMPANY_PROJECT = {
  $project: {
    position_name: '$resolved_position_name',
    company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
  },
}

/** Speakers sub-query's info_work pipeline (registered users). */
export function buildViewEventSpeakersInfoWorkPipeline() {
  return [
    {
      $match: {
        $and: [{ user_row_id: { $nin: ['', null] } }, { $expr: { $and: [{ $eq: ['$user_row_id', '$$user_row_id'] }, { $eq: ['$public_view', true] }, { $eq: ['$user_account_type', '$$user_type'] }] } }],
      },
    },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    { $limit: 1 },
    companyLookupStages(1, 'cln_company_lists', 'info_company'),
    { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
    companyLookupStages(2, 'cln_company_manual_retrievals', 'info_manual_company'),
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    POSITION_COMPANY_PROJECT,
  ]
}

/** Sponsors/partners sub-query's info_work pipeline, registered-user branch. */
export function buildSponsorsPartnersUserInfoWorkPipeline() {
  return [
    { $match: { public_view: true, user_account_type: 1 } },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    { $limit: 1 },
    companyLookupStages(1, 'cln_company_lists', 'info_company'),
    { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
    companyLookupStages(2, 'cln_company_manual_retrievals', 'info_manual_company'),
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    POSITION_COMPANY_PROJECT,
  ]
}

/** Sponsors/partners sub-query's info_work pipeline, manually-entered user branch (note: $limit:1 runs BEFORE position resolution here, unlike the two pipelines above — preserved as-is, not unified). */
export function buildSponsorsPartnersManualUserInfoWorkPipeline() {
  return [
    { $match: { public_view: true, user_account_type: 2 } },
    { $limit: 1 },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    companyLookupStages(1, 'cln_company_lists', 'info_company'),
    { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
    companyLookupStages(2, 'cln_company_manual_retrievals', 'info_manual_company'),
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    POSITION_COMPANY_PROJECT,
  ]
}

export function buildViewEventMainPipeline(requestRowId: number) {
  return [
    { $match: { _id: requestRowId } },
    { $lookup: { from: 'cln_events_seo_details', localField: '_id', foreignField: 'event_row_id', as: 'event_seo' } },
    { $unwind: { path: '$event_seo', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'created_by_sub_admin_id', foreignField: '_id', as: 'sub_admin' } },
    { $unwind: { path: '$sub_admin', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'updated_by_row_id', foreignField: '_id', as: 'updated_by_user_info' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'updated_by_row_id', foreignField: '_id', as: 'updated_by_admin_info' } },
    {
      $addFields: {
        tagIds: {
          $cond: [
            { $isArray: '$event_tags' },
            '$event_tags',
            { $cond: [{ $gt: [{ $size: { $ifNull: [{ $objectToArray: '$event_tags' }, []] } }, 0] }, { $map: { input: { $objectToArray: '$event_tags' }, as: 't', in: '$$t.v' } }, []] },
          ],
        },
      },
    },
    { $lookup: { from: 'cln_events_tags', let: { tagIds: '$tagIds' }, pipeline: [{ $match: { $expr: { $in: ['$_id', '$$tagIds'] } } }, { $match: { active_status: true } }], as: 'eventTags' } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        user_row_id: 1,
        company_row_id: 1,
        list_event_type: 1,
        event_title: 1,
        event_tags: 1,
        event_type: 1,
        event_image: 1,
        event_city: 1,
        event_state: 1,
        event_venue: 1,
        event_url: 1,
        event_link: 1,
        event_card_image: 1,
        start_date: 1,
        end_date: 1,
        event_price: 1,
        event_description: 1,
        event_brief: 1,
        describe_in_one_line: 1,
        event_image_type: 1,
        ticket_link: 1,
        contact_mobile_number: 1,
        contact_email_id: 1,
        active_status: 1,
        approval_status: 1,
        reason_for_reject: 1,
        rejected_date_n_time: 1,
        disable_reason: 1,
        disabled_date_n_time: 1,
        created_by_admin_status: 1,
        created_by_sub_admin_id: 1,
        created_date_n_time: 1,
        speakers: 1,
        meta_keywords: '$event_seo.meta_keywords',
        meta_description: '$event_seo.meta_description',
        meta_title: '$event_seo.meta_title',
        contact_country_row_id: 1,
        webinar_meeting_type: 1,
        webinar_meeting_link: 1,
        utc_row_id: 1,
        latitude: 1,
        longitude: 1,
        alt_image_text: 1,
        company_id: '$company_info.company_id',
        company_name: '$company_info.company_name',
        company_email_id: '$company_info.company_email_id',
        about_company: '$company_info.about_company',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        user_bio: '$user_info.user_bio',
        event_tags_array: '$eventTags',
        sub_admin_full_name: '$sub_admin.full_name',
        sub_admin_email_id: '$sub_admin.email_id',
        sub_admin_name: { $cond: [{ $eq: ['$created_by_admin_status', 2] }, '$sub_admin.full_name', null] },
        utc_time: '$utc_dates.utc_time',
        country: '$utc_dates.country',
        timezone: '$utc_dates.timezone',
        build_event_page_score: 1,
        seo_details_score: 1,
        contact_details_score: 1,
        tickets_coupons_score: 1,
        speakers_score: 1,
        sponsors_partners_score: 1,
        attendees_score: 1,
        faq_score: 1,
        profile_score: 1,
        updated_by: '$updated_by',
        updated_by_row_id: '$updated_by_row_id',
        updated_date_n_time: '$updated_date_n_time',
        updated_by_full_name: {
          $switch: {
            branches: [
              { case: { $eq: ['$updated_by', 'user'] }, then: { $let: { vars: { userInfo: { $arrayElemAt: ['$updated_by_user_info', 0] } }, in: { $ifNull: ['$$userInfo.full_name', ''] } } } },
              { case: { $eq: ['$updated_by', 'admin'] }, then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } } },
              { case: { $eq: ['$updated_by', 'subadmin'] }, then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } } },
            ],
            default: '',
          },
        },
      },
    },
  ]
}

export function buildContactDetailsPipeline(eventRowId: number) {
  return [
    { $match: { event_row_id: eventRowId } },
    { $lookup: { from: 'cln_static_event_contact_types', localField: 'contact_type', foreignField: '_id', as: 'contact_type_info' } },
    { $unwind: { path: '$contact_type_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'country_info' } },
    { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
    { $set: { contact_type: { $ifNull: ['$contact_type', 9] } } },
    {
      $project: {
        contact_number: 1,
        contact_type: 1,
        contact_reason: 1,
        email_id: 1,
        country_id: 1,
        contact_type_name: '$contact_type_info.contact_type_name',
        country_code: '$country_info.country_code',
        country_name: '$country_info.country_name',
      },
    },
  ]
}

export function buildSpeakersPipeline(eventRowId: number) {
  return [
    { $match: { event_row_id: eventRowId } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_type: '$user_type' },
        as: 'user_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$user_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }, { login_status: 1 }] } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_type: '$user_type', user_row_id: '$user_row_id' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$user_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } }, { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }],
      },
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_type', 2] }] }, then: '$manual_info' },
            ],
            default: '',
          },
        },
      },
    },
    { $lookup: { from: 'cln_professionals_work_experiences', let: { user_type: '$user_type', user_row_id: '$user_data._id' }, pipeline: buildViewEventSpeakersInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    { $match: { user_data: { $exists: true, $ne: '' } } },
    {
      $project: {
        _id: 1,
        user_row_id: 1,
        user_type: 1,
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        email_id: '$user_data.email_id',
        profile_image: '$user_data.profile_image',
        position_name: '$info_work.position_name',
        company_name: '$info_work.company_name',
      },
    },
  ]
}

export function buildSponsorsPartnersPipeline(eventRowId: number) {
  return [
    { $sort: { _id: -1 as const } },
    { $match: { event_row_id: eventRowId } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { account_type: '$account_type', registered_type: '$registered_type', user_company_row_id: '$user_company_row_id' },
        as: 'user_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$account_type'] }, { $eq: [1, '$$registered_type'] }, { $eq: ['$_id', '$$user_company_row_id'] }] } }, { login_status: 1 }] } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', pipeline: buildSponsorsPartnersUserInfoWorkPipeline(), as: 'info_work' } },
          { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, user_name: 1, profile_image: '$img_info.profile_image', position_name: '$info_work.position_name', company_name: '$info_work.company_name', full_name: 1, email_id: 1, approval_status: 1 } },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { account_type: '$account_type', registered_type: '$registered_type', user_company_row_id: '$user_company_row_id' },
        as: 'user_manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$account_type'] }, { $eq: [2, '$$registered_type'] }, { $eq: ['$_id', '$$user_company_row_id'] }] } } },
          { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', as: 'info_work', pipeline: buildSponsorsPartnersManualUserInfoWorkPipeline() } },
          { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, gender: 1, full_name: 1, email_id: 1, profile_image: 1, position_name: '$info_work.position_name', company_name: '$info_work.company_name' } },
        ],
      },
    },
    { $unwind: { path: '$user_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { account_type: '$account_type', registered_type: '$registered_type', user_company_row_id: '$user_company_row_id' },
        as: 'company_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [2, '$$account_type'] }, { $eq: [1, '$$registered_type'] }, { $eq: ['$_id', '$$user_company_row_id'] }] } }, { active_status: 1 }] } },
          { $project: { _id: 1, company_id: 1, company_logo: 1, company_name: 1, company_email_id: 1, website_link: 1, active_status: 1, approval_status: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { account_type: '$account_type', registered_type: '$registered_type', user_company_row_id: '$user_company_row_id' },
        as: 'company_manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$account_type'] }, { $eq: [2, '$$registered_type'] }, { $eq: ['$_id', '$$user_company_row_id'] }] } } }],
      },
    },
    { $unwind: { path: '$company_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        sp_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$account_type', 1] }, { $eq: ['$registered_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$account_type', 1] }, { $eq: ['$registered_type', 2] }] }, then: '$user_manual_info' },
              { case: { $and: [{ $eq: ['$account_type', 2] }, { $eq: ['$registered_type', 1] }] }, then: '$company_info' },
              { case: { $and: [{ $eq: ['$account_type', 2] }, { $eq: ['$registered_type', 2] }] }, then: '$company_manual_info' },
            ],
            default: '',
          },
        },
      },
    },
    { $match: { sp_data: { $nin: ['', null] } } },
    {
      $project: {
        event_row_id: 1,
        sponsor_partner_type: 1,
        account_type: 1,
        registered_type: 1,
        user_company_row_id: 1,
        sponsorship_type_title: 1,
        manual_type: 1,
        created_date_n_time: 1,
        sp_user_position_name: { $cond: { if: '$user_info.position_name', then: '$user_info.position_name', else: '$user_manual_info.position_name' } },
        sp_user_company_name: { $cond: { if: '$user_info.company_name', then: '$user_info.company_name', else: '$user_manual_info.company_name' } },
        sp_image: { $cond: { if: '$sp_data.profile_image', then: '$sp_data.profile_image', else: '$sp_data.company_logo' } },
        sp_name: { $cond: { if: '$sp_data.full_name', then: '$sp_data.full_name', else: '$sp_data.company_name' } },
        sp_email_id: { $cond: { if: '$sp_data.email_id', then: '$sp_data.email_id', else: '$sp_data.company_email_id' } },
        sp_link: { $cond: { if: '$sp_data.website_link', then: '$sp_data.website_link', else: '' } },
      },
    },
  ]
}
