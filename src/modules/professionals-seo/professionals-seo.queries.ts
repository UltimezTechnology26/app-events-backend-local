// modules/professionals-seo/professionals-seo.queries.ts
// Ported 1:1 from controllers/app/users/setting.js's GET /get_user_seo aggregation
// (~2537-2755). Same stages, same $project field names — no new behavior.
import ProfessionalM from '../../../models/app/professionalsM'

export async function getUserSeoAggregate(userRowId: number) {
  return ProfessionalM.aggregate([
    { $match: { _id: userRowId } },
    {
      $lookup: {
        from: 'cln_sub_admins',
        localField: 'sub_admin_row_id',
        foreignField: '_id',
        as: 'sub_admin_info',
        pipeline: [{ $project: { _id: 1, full_name: 1, email_id: 1 } }],
      },
    },
    { $lookup: { from: 'cln_static_countries', localField: 'country_mobile_id', foreignField: '_id', as: 'country_info' } },
    { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_seo_details', localField: '_id', foreignField: 'user_row_id', as: 'seo_details' } },
    { $unwind: { path: '$seo_details', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_social_links', localField: '_id', foreignField: 'user_row_id', as: 'social_details' } },
    { $unwind: { path: '$social_details', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'info_img' } },
    { $unwind: { path: '$info_img', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: '_id',
        foreignField: 'user_row_id',
        pipeline: [
          { $match: { public_view: true, user_account_type: 1 } },
          {
            $lookup: {
              from: 'cln_static_professionals_work_positions',
              localField: 'position_row_id',
              foreignField: '_id',
              as: 'info_position',
              pipeline: [{ $project: { _id: 1, position_name: 1 } }],
            },
          },
          { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
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
              position_name: '$info_position.position_name',
              company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
            },
          },
        ],
        as: 'info_work',
      },
    },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_faq_lists',
        localField: '_id',
        foreignField: 'user_row_id',
        as: 'faq',
        pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }],
      },
    },
    { $addFields: { created_by_status: { $cond: [{ $gt: [{ $size: '$sub_admin_info' }, 0] }, 2, 0] } } },
    {
      $project: {
        _id: 1,
        url: '$user_name',
        start_date: 1,
        end_date: 1,
        created_date_n_time: '$created_date_n_time',
        updated_date_n_time: '$updated_date_n_time',
        country_name: '$country_info.country_name',
        location: 1,
        work_position: '$info_work.position_name',
        company_name: '$info_work.company_name',
        mobile_number: 1,
        country_id: 1,
        country_mobile_id: 1,
        facebook: '$social_details.facebook',
        twitter: '$social_details.twitter',
        linkedin: '$social_details.linkedin',
        telegram: '$social_details.telegram',
        instagram: '$social_details.instagram',
        medium: '$social_details.medium',
        reddit: '$social_details.reddit',
        feed_url: '$social_details.feed_url',
        youtube_channel: '$social_details.youtube_channel',
        video_link: '$social_details.video_link',
        title: '$full_name',
        description: '$user_bio',
        image: '$info_img.profile_image',
        meta_title: '$seo_details.meta_title',
        meta_description: '$seo_details.meta_description',
        meta_keywords: '$seo_details.meta_keywords',
        robots_index: '$seo_details.robots_index',
        robots_follow: '$seo_details.robots_follow',
        og_title: '$seo_details.og_title',
        og_description: '$seo_details.og_description',
        twitter_title: '$seo_details.twitter_title',
        twitter_description: '$seo_details.twitter_description',
        twitter_creator: '$seo_details.twitter_creator',
        faq: 1,
        created_by_status: 1,
        user_name: 1,
        full_name: 1,
        email_id: 1,
        sub_admin_name: '$sub_admin_info.full_name',
      },
    },
  ])
}
