// modules/company/company.settings.queries.ts
import { getPositionResolutionStages } from '../../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../../funding/funding.queries'

/**
 * Ports setting.js's buildCompanyFollowersInfoWorkPipeline() (lines 25-98) verbatim — the
 * nested cln_professionals_work_experiences sub-pipeline for the info_work lookup inside
 * getCompanyFollowers() below. Resolves position name(s) via getPositionResolutionStages()
 * (both cln_static_professionals_work_positions and cln_manual_user_positions), joined into a
 * single display string via joinPositionNamesExpr. { $limit: 1 } kept in its original position:
 * after position resolution, before company lookups.
 */
export function buildCompanyFollowersInfoWorkPipeline(): object[] {
  return [
    { $match: { public_view: true, user_account_type: 1 } },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    { $limit: 1 },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_company',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
          { $project: { _id: 1, company_name: 1 } },
        ],
      },
    },
    { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_manual_company',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
          { $project: { _id: 1, company_name: 1 } },
        ],
      },
    },
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        position_name: '$resolved_position_name',
        company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
      },
    },
  ]
}

/** Ports setting.js's getCompanyData()'s aggregation pipeline (lines 1138-1309) verbatim. */
export function buildIndividualDetailsPipeline(companyRowId: number): object[] {
  return [
    { $match: { _id: companyRowId } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_mobile_id', foreignField: '_id', as: 'country_info' } },
    { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_created_by_admins', localField: '_id', foreignField: 'company_row_id', as: 'created_by_admins_info' } },
    { $unwind: { path: '$created_by_admins_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_seo_details', localField: '_id', foreignField: 'company_row_id', as: 'seo_details' } },
    { $unwind: { path: '$seo_details', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_social_links', localField: '_id', foreignField: 'company_row_id', as: 'social_links' } },
    { $unwind: { path: '$social_links', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'info_main_business' } },
    { $unwind: { path: '$info_main_business', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'info_investor_category' } },
    { $unwind: { path: '$info_investor_category', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_static_company_business_models',
        localField: 'business_model_id',
        foreignField: '_id',
        as: 'info_business',
        pipeline: [{ $match: { active_status: true } }, { $project: { _id: 1, business_name: 1 } }],
      },
    },
    {
      $project: {
        country_id: 1, _id: 1, user_row_id: 1, company_name: 1, company_id: 1, company_email_id: 1, company_location: 1,
        country_mobile_id: 1, city: 1, state: 1, longitude: 1, latitude: 1, contact_number: 1, website_link: 1,
        describe_in_one_line: 1, established_in: 1, main_business_model_id: 1, main_business_name: '$info_main_business.business_name',
        business_model_id: 1, approval_status: 1, active_status: 1, updated_date_n_time: 1, company_logo: 1, reason_rejected: 1,
        rejected_date_n_time: 1, disable_reason: 1, disabled_date_n_time: 1, nft_wallet_address: 1, sub_admin_row_id: 1,
        claim_status: 1, company_valuation: 1, company_size_row_id: 1, investor_category_row_id: 1, email_verify_status: 1,
        basic_details_score: 1, seo_details_score: 1, social_media_score: 1, owned_product_score: 1, team_detail_score: 1,
        job_opening_score: 1, funding_score: 1, revenue_score_score: 1, investment_score: 1, faq_score: 1, holding_crypto_score: 1,
        profile_score: 1, country_sortname: '$country_info.sortname', country_code: '$country_info.country_code',
        country_name: '$country_info.country_name', country_flag: '$country_info.country_flag',
        created_admin_row_id: '$created_by_admins_info.sub_admin_row_id', created_by_type: '$created_by_admins_info.admin_sub_admin_type',
        facebook: '$social_links.facebook', twitter: '$social_links.twitter', linkedin: '$social_links.linkedin',
        instagram: '$social_links.instagram', video_link: '$social_links.video_link', telegram: '$social_links.telegram',
        medium: '$social_links.medium', reddit: '$social_links.reddit', other_social_links: '$social_links.other_social_links',
        feed_url: '$social_links.feed_url', youtube_channel: '$social_links.youtube_channel', about_company: 1,
        meta_keywords: '$seo_details.meta_keywords', meta_description: '$seo_details.meta_description', meta_title: '$seo_details.meta_title',
        business_models_categories: '$info_business', investor_category_name: '$info_investor_category.category_name',
        // Additive aliases for the admin "Individual Company Details" popup (Part 3 §7 Phase H
        // step 10 follow-up), which reads `business_name` (array) and `main_business_models`
        // (object with .business_name) rather than this pipeline's own `business_models_categories`/
        // `main_business_name` field names. Same underlying data, just projected under the second
        // set of keys too — additive, so the existing app-settings consumer's response is
        // byte-identical aside from these 2 new keys.
        business_name: '$info_business',
        main_business_models: { _id: '$info_main_business._id', business_name: '$info_main_business.business_name' },
      },
    },
  ]
}

/** Ports setting.js's /company_followers/:company_row_id aggregation pipeline (lines 1801-1865). */
export function buildCompanyFollowersPipeline(companyRowId: number): object[] {
  return [
    { $match: { company_row_id: companyRowId } },
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [{ $project: { user_name: 1, full_name: 1, approval_status: 1, pro_batch: 1, login_status: 1, account_visible_type: 1, designation_id: 1 } }],
      },
    },
    { $match: { user_info: { $elemMatch: { login_status: 1 } } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: 'user_row_id', foreignField: 'user_row_id', pipeline: buildCompanyFollowersInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: '$user_info._id', profile_image: '$img_info.profile_image', user_name: '$user_info.user_name', full_name: '$user_info.full_name',
        pro_batch: '$user_info.pro_batch', approval_status: '$user_info.approval_status', login_status: '$user_info.login_status',
        account_visible_type: '$user_info.account_visible_type', user_row_id: 1, position_name: '$info_work.position_name',
        company_name: '$info_work.company_name', designation_id: '$user_info.designation_id',
      },
    },
  ]
}

/** Ports setting.js's /get_company_seo/:company_id aggregation pipeline (lines 2373-2506). */
export function buildGetCompanySeoPipeline(condition: Record<string, any>): object[] {
  return [
    { $match: condition },
    { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info', pipeline: [{ $project: { _id: 1, full_name: 1 } }] } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $project: { _id: 1, full_name: 1, user_name: 1, profile_image: 1 } }] } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_seo_details', localField: '_id', foreignField: 'company_row_id', as: 'seo_details' } },
    { $unwind: { path: '$seo_details', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_social_links', localField: '_id', foreignField: 'company_row_id', as: 'social_links' } },
    { $unwind: { path: '$social_links', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_faq_lists', localField: '_id', foreignField: 'company_row_id', as: 'faq', pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }] } },
    {
      $addFields: {
        created_by_status: {
          $switch: {
            branches: [
              { case: { $gt: [{ $size: '$sub_admin_info' }, 0] }, then: 2 },
              {
                case: {
                  $and: [
                    { $eq: [{ $size: '$sub_admin_info' }, 0] },
                    { $or: [{ $gt: ['$user_info.full_name', ''] }, { $gt: ['$user_info.full_name', 0] }] },
                  ],
                },
                then: 1,
              },
            ],
            default: 0,
          },
        },
      },
    },
    {
      $project: {
        _id: 1, url: '$company_id', title: '$company_name', description: '$about_company', image: '$company_logo',
        facebook: '$social_links.facebook', twitter: '$social_links.twitter', linkedin: '$social_links.linkedin',
        telegram: '$social_links.telegram', instagram: '$social_links.instagram', medium: '$social_links.medium',
        reddit: '$social_links.reddit', feed_url: '$social_links.feed_url', youtube_channel: '$social_links.youtube_channel',
        video_link: '$social_links.video_link', website_link: 1, established_in: 1, start_date: 1, created_date_n_time: '$created_date_n_time',
        meta_title: '$seo_details.meta_title', meta_description: '$seo_details.meta_description', meta_keywords: '$seo_details.meta_keywords',
        robots_index: '$seo_details.robots_index', robots_follow: '$seo_details.robots_follow', og_title: '$seo_details.og_title',
        og_description: '$seo_details.og_description', twitter_title: '$seo_details.twitter_title', twitter_description: '$seo_details.twitter_description',
        twitter_creator: '$seo_details.twitter_creator', faq: 1, created_by_status: 1,
        // Real source (setting.js:2498-2503): `email_id`/`sub_admin_name` are each set TWICE in
        // the same $project — company_email_id first, then overwritten by user_info.email_id;
        // sub_admin_name repeated identically. Preserved exactly: object key dedup means the
        // LAST assignment for each wins (email_id -> user_info.email_id; company_email_id is
        // silently dropped from the response despite being computed first).
        sub_admin_name: '$sub_admin_info.full_name',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
      },
    },
  ]
}
