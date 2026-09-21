// modules/professionals-meetings/professionals-meetings.admin.queries.ts
// Aggregation pipelines ported verbatim from admin_panel/app/meetings/meetings.js.
export function buildJournalistInterviewListPipeline(filter: Record<string, any>, search: string | undefined, skip: number, limit: number) {
  return [
    { $match: filter },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    ...(search ? [{ $match: { $or: [{ meeting_title: { $regex: search, $options: 'i' } }, { 'user_info.full_name': { $regex: search, $options: 'i' } }] } }] : []),
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'user_profile' } },
    { $unwind: { path: '$user_profile', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'status_update_by', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $sort: { meeting_datetime: 1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        meeting_type: 1, meeting_title: 1, meeting_datetime: 1, meeting_timezone: 1, meeting_link: 1, status: 1,
        job_role: 1, upload_document: 1, user_row_id: 1, company_row_id: 1, rejected_comment: 1, rescheduled_by: 1,
        rescheduled_count: 1, status_update_by: 1, status_update_date: 1, status_update_admin_user_type: 1,
        sub_admin_name: '$sub_admin_info.full_name', created_on: '$createdAt',
        user_name: '$user_info.full_name', user_profile_image: '$user_profile.profile_image', email_id: '$user_info.email_id',
        mobile_number: '$user_info.mobile_number', country_mobile_id: '$user_info.country_mobile_id',
        approval_status: '$user_info.login_status', pro_batch: '$user_info.pro_batch',
      },
    },
  ]
}

export function buildJournalistInterviewCountPipeline(filter: Record<string, any>, search: string | undefined) {
  return [
    { $match: filter },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    ...(search ? [{ $match: { $or: [{ meeting_title: { $regex: search, $options: 'i' } }, { 'user_info.full_name': { $regex: search, $options: 'i' } }] } }] : []),
    { $count: 'total' },
  ]
}

export function buildAdminMeetingsListPipeline(statusFilter: Record<string, any>, skip: number, limit: number) {
  return [
    { $match: statusFilter },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_details' } },
    { $unwind: { path: '$company_details', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'user_profile' } },
    { $unwind: { path: '$user_profile', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'requested_user_row_id', foreignField: '_id', as: 'requested_users' } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'requested_user_row_id', foreignField: 'user_row_id', as: 'requested_user_profiles' } },
    { $lookup: { from: 'cln_company_lists', localField: 'requested_company_row_id', foreignField: '_id', as: 'requested_companies' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'status_update_by', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $sort: { meeting_datetime: 1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        meeting_type: 1, meeting_title: 1, meeting_datetime: 1, meeting_timezone: 1, meeting_link: 1, status: 1,
        job_role: 1, upload_document: 1, user_row_id: 1, company_row_id: 1, rejected_comment: 1, rescheduled_by: 1,
        rescheduled_count: 1, status_update_by: 1, status_update_date: 1, status_update_admin_user_type: 1,
        sub_admin_name: '$sub_admin_info.full_name', created_on: '$createdAt',
        user_name: '$user_info.full_name', email_id: '$user_info.email_id', mobile_number: '$user_info.mobile_number',
        country_mobile_id: '$user_info.country_mobile_id', approval_status: '$user_info.login_status', pro_batch: '$user_info.pro_batch',
        user_profile_image: '$user_profile.profile_image',
        requested_users: {
          $map: {
            input: '$requested_users',
            as: 'ru',
            in: {
              name: '$$ru.full_name',
              id: '$$ru._id',
              profile_image: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$requested_user_profiles', as: 'rup', cond: { $eq: ['$$rup.user_row_id', '$$ru._id'] } } }, as: 'match', in: '$$match.profile_image' } }, 0] },
            },
          },
        },
        requested_companies: { $map: { input: '$requested_companies', as: 'rc', in: { id: '$$rc._id', name: '$$rc.company_name', logo: '$$rc.company_logo' } } },
        company_name: '$company_details.company_name',
        company_logo: '$company_details.company_logo',
      },
    },
  ]
}
