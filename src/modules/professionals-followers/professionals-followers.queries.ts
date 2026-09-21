// modules/professionals-followers/professionals-followers.queries.ts
// Ported from controllers/app/users/followers.js (~16-1444).
import { PipelineStage } from 'mongoose'

// CONFIRMED DEDUP (no behavior change): this exact ~150-line position-resolution sub-pipeline
// (resolving positions[] against BOTH cln_static_professionals_work_positions and
// cln_manual_user_positions, with a legacy singular-field fallback) was copy-pasted identically
// into `info_work` lookups in 3 separate routes (followers_list, following_list,
// follow_requests_pending_list) — confirmed byte-for-byte identical across all three before
// extracting. NOTE: this predates and is NOT the same helper as work-experience.queries.ts's
// getPositionResolutionStages() — that one resolves into a `positions` field with a different
// shape; this file's version was never migrated to use it, so it's extracted here as its own
// function rather than risking a behavior change by unifying the two now.
function buildFollowerInfoWorkPipeline(): object[] {
  return [
    { $match: { public_view: true, user_account_type: 1 } },
    { $lookup: { from: 'cln_static_professionals_work_positions', localField: 'position_row_id', foreignField: '_id', as: 'info_position', pipeline: [{ $project: { _id: 1, position_name: 1 } }] } },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        let: { positions: { $ifNull: ['$positions', []] } },
        as: 'resolved_static_positions',
        pipeline: [{ $match: { $expr: { $in: ['$_id', { $map: { input: '$$positions', as: 'p', in: '$$p.position_row_id' } }] } } }, { $project: { _id: 1, position_name: 1 } }],
      },
    },
    {
      $lookup: {
        from: 'cln_manual_user_positions',
        let: { positions: { $ifNull: ['$positions', []] } },
        as: 'resolved_manual_positions',
        pipeline: [{ $match: { $expr: { $in: ['$_id', { $map: { input: '$$positions', as: 'p', in: '$$p.sub_position_row_id' } }] } } }, { $project: { _id: 1, position_name: 1 } }],
      },
    },
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
        positions: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: ['$positions', []] } }, 0] },
            then: {
              $map: {
                input: { $ifNull: ['$positions', []] },
                as: 'p',
                in: {
                  position_type: '$$p.position_type',
                  position_row_id: '$$p.position_row_id',
                  sub_position_row_id: '$$p.sub_position_row_id',
                  position_name: {
                    $cond: {
                      if: { $eq: ['$$p.position_type', 2] },
                      then: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_manual_positions', cond: { $eq: ['$$this._id', '$$p.sub_position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                      else: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_static_positions', cond: { $eq: ['$$this._id', '$$p.position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                    },
                  },
                },
              },
            },
            else: [{ position_type: '$position_type', position_row_id: '$position_row_id', sub_position_row_id: '$sub_position_row_id', position_name: '$info_position.position_name' }],
          },
        },
        company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
      },
    },
  ]
}

function buildSearchQuery(search?: string): object {
  if (!search) return {}
  return {
    $or: [
      { user_name: { $regex: search, $options: 'i' } },
      { full_name: { $regex: search, $options: 'i' } },
      { position_name: { $regex: search, $options: 'i' } },
      { company_name: { $regex: search, $options: 'i' } },
    ],
  }
}

export function buildFollowersListPipeline(userRowId: number, search?: string): object[] {
  return [
    { $match: { following_user_row_id: userRowId, confirm_request_status: 2 } },
    { $lookup: { from: 'cln_professionals', localField: 'follower_user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $project: { _id: 1, login_status: 1, user_name: 1, full_name: 1, pro_batch: 1, email_id: 1, approval_status: 1 } }] } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $set: { login_status: '$user_info.login_status' } },
    { $match: { login_status: 1 } },
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'follower_user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: 'follower_user_row_id', foreignField: 'user_row_id', pipeline: buildFollowerInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    { $set: { user_name: '$user_info.user_name', full_name: '$user_info.full_name', pro_batch: '$user_info.pro_batch', positions: '$info_work.positions', position_name: '$info_work.position_name', company_name: '$info_work.company_name' } },
    { $match: buildSearchQuery(search) },
    { $lookup: { from: 'cln_professionals_followers', localField: 'follower_user_row_id', foreignField: 'following_user_row_id', pipeline: [{ $match: { follower_user_row_id: userRowId } }], as: 'user_followed' } },
    { $unwind: { path: '$user_followed', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: '$user_info._id', user_name: 1, user_row_id: '$user_info._id', full_name: 1, pro_batch: 1, position_name: 1, company_name: 1,
        follower_user_row_id: 1, following_user_row_id: 1, confirm_request_status: 1, email_id: '$user_info.email_id',
        user_approval_status: '$user_info.approval_status', positions: 1,
        user_followed_status: { $cond: { if: '$user_followed.confirm_request_status', then: '$user_followed.confirm_request_status', else: 0 } },
        profile_image: '$img_info.profile_image',
      },
    },
  ]
}

export function buildFollowingListPipeline(userRowId: number, search?: string): object[] {
  return [
    { $match: { follower_user_row_id: userRowId, confirm_request_status: 2 } },
    { $lookup: { from: 'cln_professionals', localField: 'following_user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: { login_status: 1 } } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'following_user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_followers', localField: 'following_user_row_id', foreignField: 'following_user_row_id', pipeline: [{ $match: { confirm_request_status: 2 } }], as: 'count_following' } },
    { $lookup: { from: 'cln_professionals_followers', localField: 'following_user_row_id', foreignField: 'following_user_row_id', pipeline: [{ $match: { follower_user_row_id: userRowId } }], as: 'user_followed' } },
    { $unwind: { path: '$user_followed', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: 'following_user_row_id', foreignField: 'user_row_id', pipeline: buildFollowerInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    { $set: { user_name: '$user_info.user_name', full_name: '$user_info.full_name', position_name: '$info_work.position_name', positions: '$info_work.positions', company_name: '$info_work.company_name', pro_batch: '$user_info.pro_batch' } },
    { $match: buildSearchQuery(search) },
    {
      $project: {
        _id: '$user_info._id', profile_image: '$img_info.profile_image', user_name: 1, full_name: 1, pro_batch: 1, company_name: 1, position_name: 1, positions: 1,
        user_approval_status: '$user_info.approval_status', total_followers: { $size: '$count_following' },
        user_followed_status: { $cond: { if: '$user_followed.confirm_request_status', then: '$user_followed.confirm_request_status', else: 0 } },
      },
    },
  ]
}

export function buildFollowRequestsPendingListPipeline(userRowId: number, search?: string): object[] {
  return [
    { $match: { following_user_row_id: userRowId, confirm_request_status: 1 } },
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'follower_user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'follower_user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: { login_status: 1 } } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: 'follower_user_row_id', foreignField: 'user_row_id', pipeline: buildFollowerInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    { $set: { user_name: '$user_info.user_name', full_name: '$user_info.full_name', pro_batch: '$user_info.pro_batch', position_name: '$info_work.position_name', company_name: '$info_work.company_name', positions: '$info_work.positions' } },
    { $match: buildSearchQuery(search) },
    {
      $project: {
        _id: '$user_info._id', user_name: 1, full_name: 1, pro_batch: 1, position_name: 1, company_name: 1,
        approval_status: '$user_info.approval_status', follower_user_row_id: 1, confirm_request_status: 1,
        profile_image: '$img_info.profile_image', positions: 1,
      },
    },
  ]
}

export function buildCompanyFollowingListPipeline(matchQuery: object[]): object[] {
  return [
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_info', pipeline: [{ $match: { active_status: true } }] } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info' } },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'co_info' } },
          { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              company_name: 1, user_row_id: 1, company_id: 1, company_logo: 1, business_model_id: 1, main_business_model_id: 1,
              approval_status: 1, active_status: 1, main_business_model_name: '$main_business_info.business_name',
              business_name: '$business_info.business_name', country_name: '$co_info.country_name', country_flag: '$co_info.country_flag',
            },
          },
        ],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $lookup: { from: 'cln_professionals', localField: 'company_info.user_row_id', foreignField: '_id', as: 'company_user_info' } },
    { $unwind: { path: '$company_user_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        login_status: { $cond: { if: '$company_user_info.login_status', then: '$company_user_info.login_status', else: 1 } },
        approval_status: '$company_info.approval_status', active_status: '$company_info.active_status',
        company_name: '$company_info.company_name', company_id: '$company_info.company_id',
      },
    },
    { $match: { $and: matchQuery } },
    {
      $project: {
        _id: '$company_info._id', following_status: { $cond: { if: '$company_info._id', then: true, else: false } },
        company_name: 1, company_id: 1, company_logo: '$company_info.company_logo', business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id', main_business_model_name: '$company_info.main_business_model_name',
        business_name: '$company_info.business_name',
      },
    },
  ]
}

export function buildCompanyFollowingMatchQuery(userRowId: number, search?: string): object[] {
  const query: object[] = [{ user_row_id: userRowId, login_status: 1, approval_status: 1, active_status: 1 }]
  if (search) query.push({ $or: [{ company_name: { $regex: search, $options: 'i' } }, { company_id: { $regex: search, $options: 'i' } }] })
  return query
}

export function buildAdminUserFollowersListPipeline(userRowId: number, search?: string): object[] {
  return [
    { $match: { following_user_row_id: userRowId, confirm_request_status: 2 } },
    { $lookup: { from: 'cln_professionals', localField: 'follower_user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: '$user_info' },
    { $match: { 'user_info.login_status': 1 } },
    ...(search ? [{ $match: { $or: [{ 'user_info.full_name': { $regex: search, $options: 'i' } }, { 'user_info.email_id': { $regex: search, $options: 'i' } }] } }] : []),
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'follower_user_row_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, confirm_request_status: 1, user_name: '$user_info.user_name', full_name: '$user_info.full_name', email_id: '$user_info.email_id', profile_image: '$img_info.profile_image', date_n_time: 1 } },
    { $sort: { _id: -1 } },
  ]
}

export function buildAdminUserFollowersCountPipeline(userRowId: number, search?: string): object[] {
  return [
    { $match: { following_user_row_id: userRowId, confirm_request_status: 2 } },
    { $lookup: { from: 'cln_professionals', localField: 'follower_user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: '$user_info' },
    { $match: { 'user_info.login_status': 1 } },
    ...(search ? [{ $match: { $or: [{ 'user_info.full_name': { $regex: search, $options: 'i' } }, { 'user_info.email_id': { $regex: search, $options: 'i' } }] } }] : []),
    { $count: 'count' },
  ]
}

export function buildViewUserPipeline(viewUserRowId: number): PipelineStage[] {
  return [
    { $match: { login_status: 1, _id: viewUserRowId } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$other_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, user_name: 1, full_name: 1, email_id: 1, mobile_number: 1, country_id: 1, gender: 1, user_bio: 1, location: 1,
        profile_image: '$img_info.profile_image', profile_image_type: '$img_info.profile_image_type',
      },
    },
  ] as PipelineStage[]
}
