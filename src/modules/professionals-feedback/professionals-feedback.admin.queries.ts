// modules/professionals-feedback/professionals-feedback.admin.queries.ts
// Aggregation pipelines ported verbatim from admin_panel/app/feedback.js.
export function buildUsersFeedbackListPipeline(query: Record<string, any>) {
  return [
    { $match: query },
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, user_row_id: 1, email_id: 1, feedback_type: 1, date_n_time: 1,
        full_name: '$user_info.full_name', user_name: '$user_info.user_name', user_email_id: '$user_info.email_id',
      },
    },
  ]
}

function buildReportIssueOptionLookup() {
  return {
    $lookup: {
      from: 'cln_static_report_issue',
      let: { tabKey: '$tab_key', subTabKey: '$sub_tab_key', optionId: '$option_id', moduleType: '$module_type' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$module_type', '$$moduleType'] },
                { $eq: ['$tab_key', '$$tabKey'] },
                { $cond: [{ $ifNull: ['$$subTabKey', false] }, { $eq: ['$sub_tab_key', '$$subTabKey'] }, true] },
              ],
            },
          },
        },
        { $unwind: '$report_issues' },
        { $match: { $expr: { $eq: ['$report_issues._id', '$$optionId'] } } },
        { $project: { _id: 0, option_id: '$report_issues._id', option_name: '$report_issues.option' } },
      ],
      as: 'issue_option_info',
    },
  }
}

export function buildReportUsersIssuesListPipeline(matchQuery: Record<string, any>, search: string | undefined) {
  const pipeline: any[] = [
    { $match: matchQuery },
    { $lookup: { from: 'cln_company_lists', localField: 'module_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'module_row_id', foreignField: '_id', as: 'professional_info' } },
    { $unwind: { path: '$professional_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'module_row_id', foreignField: '_id', as: 'userImage' } },
    { $unwind: { path: '$userImage', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_markets_tokens',
        let: { moduleRowId: '$module_row_id', moduleType: '$module_type' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$$moduleType', 3] }, { $eq: ['$_id', '$$moduleRowId'] }] } } },
          { $project: { _id: 1, token_name: 1, symbol: 1, token_id: 1 } },
        ],
        as: 'token_info',
      },
    },
    { $unwind: { path: '$token_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_exchanges',
        let: { moduleRowId: '$module_row_id', moduleType: '$module_type' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$$moduleType', 4] }, { $eq: ['$_id', '$$moduleRowId'] }] } } },
          { $project: { _id: 1, exchange_name: 1, exchange_slug: 1 } },
        ],
        as: 'exchange_info',
      },
    },
    { $unwind: { path: '$exchange_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_chains',
        let: { moduleRowId: '$module_row_id', moduleType: '$module_type' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$$moduleType', 5] }, { $eq: ['$_id', '$$moduleRowId'] }] } } },
          { $project: { _id: 1, chain_name: 1, chain_slug: 1 } },
        ],
        as: 'chain_info',
      },
    },
    { $unwind: { path: '$chain_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'approved_row_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    buildReportIssueOptionLookup(),
    { $unwind: { path: '$issue_option_info', preserveNullAndEmptyArrays: true } },
  ]

  if (search) {
    // Flagged, not fixed: the `user_info.full_name` clause below has a typo'd operator key
    // ($onameptions instead of $options), ported verbatim from legacy — MongoDB rejects an
    // unrecognized operator, so any search on this route throws and falls into the generic
    // catch-error response instead of ever matching by full_name. Pre-existing, not a new bug
    // introduced by this port; fixing the typo would be a real behavior change (search suddenly
    // starts working) that needs sign-off, not a silent "fix" during migration.
    pipeline.push({
      $match: {
        $or: [
          { 'company_info.company_name': { $regex: search, $options: 'i' } },
          { 'token_info.token_name': { $regex: search, $options: 'i' } },
          { 'exchange_info.exchange_name': { $regex: search, $options: 'i' } },
          { 'chain_info.chain_name': { $regex: search, $options: 'i' } },
          { 'user_info.full_name': { $regex: search, $onameptions: 'i' } },
          { 'user_info.user_name': { $regex: search, $options: 'i' } },
          { 'user_info.email_id': { $regex: search, $options: 'i' } },
          { 'issue_option_info.option_name': { $regex: search, $options: 'i' } },
        ],
      },
    })
  }

  return pipeline
}

export function buildReportUsersIssuesProjectStage() {
  return {
    $project: {
      _id: 1, requested_on: 1, approved_status: 1, approved_by: 1, approved_date_n_time: 1, approved_row_id: 1,
      profile_image: '$userImage.profile_image',
      approved_name: { $cond: [{ $eq: ['$approved_by', 1] }, 'Admin', '$sub_admin_info.full_name'] },
      company_name: '$company_info.company_name', company_logo: '$company_info.company_logo', company_id: '$company_info.company_id',
      user_name: { $cond: [{ $ifNull: ['$user_info.full_name', false] }, '$user_info.full_name', '$user_info.user_name'] },
      professional_name: '$professional_info.user_name', professional_full_name: '$professional_info.full_name',
      option_name: '$issue_option_info.option_name', description: 1, tab_name: 1, tab_key: 1, module_type: 1,
      token_name: '$token_info.token_name', token_id: '$token_id',
      exchange_name: '$exchange_info.exchange_name', exchange_slug: '$exchange_info.exchange_slug',
      chain_name: '$chain_info.chain_name', chain_slug: '$chain_info.chain_slug',
      issue_rejected_reason: 1,
    },
  }
}

export function buildIndividualReportDetailsPipeline(issueRowId: number) {
  return [
    { $match: { _id: issueRowId } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'module_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'module_row_id', foreignField: '_id', as: 'professional_info' } },
    { $unwind: { path: '$professional_info', preserveNullAndEmptyArrays: true } },
    buildReportIssueOptionLookup(),
    { $unwind: { path: '$issue_option_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, user_row_id: 1, full_name: '$user_info.full_name', user_name: '$user_info.user_name', email_id: '$user_info.email_id',
        user_status: '$user_info.login_status', professional_info: '$professional_info', login_status: '$user_info.login_status',
        company_name: '$company_info.company_name', company_id: '$company_info.company_id', company_email: '$company_info.company_email_id',
        professional_name: '$professional_info.user_name',
        tab_key: 1, tab_name: 1, sub_tab_key: 1, option_name: '$issue_option_info.option_name', description: 1, module_type: 1,
        approved_status: 1, approved_by: 1, approved_row_id: 1, approved_date_n_time: 1, requested_on: 1,
      },
    },
  ]
}
