// modules/professionals-audit/professionals-audit.queries.ts
// Ported from controllers/admin_panel/app/user.js (~4618-5185).

/** True only when `search` can only match a field that's populated by the `cln_professionals` join (full_name/user_name) rather than a native field on the ip-address row itself (page/device_name) — used to decide whether the expensive join can be deferred until after pagination. */
export function ipAddressSearchNeedsJoin(search?: string): boolean {
  return Boolean(search)
}

export function buildIpAddressNativeMatch(domainRaw?: string): object {
  if (!domainRaw) return {}
  const domain = Number.parseInt(domainRaw)
  return Number.isNaN(domain) ? {} : { domain_row_id: domain }
}

export function buildIpAddressSearchQuery(search?: string, domainRaw?: string): object {
  const domain = domainRaw !== undefined ? Number.parseInt(domainRaw) : undefined
  if (search && domainRaw) {
    return { $and: [{ $or: [{ full_name: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }] }, { domain_row_id: domain }] }
  }
  if (search) {
    return {
      $or: [
        { full_name: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
        { page: { $regex: search, $options: 'i' } },
        { device_name: { $regex: search, $options: 'i' } },
      ],
    }
  }
  if (domainRaw) return { domain_row_id: domain }
  return {}
}

const IP_ADDRESS_PROJECT = { user_row_id: 1, device_name: 1, ip_address: 1, domain_row_id: 1, profile_image: 1, page: 1, date_n_time: 1, full_name: 1, user_name: 1, pro_batch: 1 }

const IP_ADDRESS_JOIN_STAGES: object[] = [
  { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
  { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'userImage' } },
  { $unwind: { path: '$userImage', preserveNullAndEmptyArrays: true } },
  { $set: { full_name: '$user_info.full_name', user_name: '$user_info.user_name', pro_batch: '$user_info.pro_batch', profile_image: '$userImage.profile_image' } },
]

/**
 * CONFIRMED PERF FIX (production 504, real data volume — `cln_professionals_ip_addreses` is an
 * unbounded login/session-history log, not a small table): the ported-as-is legacy shape ran the
 * `cln_professionals`/`cln_professionals_profile_images` joins over the ENTIRE collection, then
 * sorted all of it, and only applied `$skip`/`$limit` as the very last stages (via the service's
 * trailing `.skip().limit()`, which just appends `$skip`/`$limit` to the end of the pipeline array)
 * — so even the plain "no search" page load joined and sorted every row ever logged before
 * returning 20. When `search` doesn't need the joined fields (i.e. no search term at all — the
 * default, highest-traffic case), filter/sort/paginate on native fields FIRST and only join the
 * page's own ~20 rows afterward. A name search still needs the join before matching (full_name/
 * user_name only exist post-join) — that path is unchanged and remains the slower one, same as
 * before, since it's the much less frequent, admin-initiated case.
 */
export function buildIpAddressListPipeline(search: string | undefined, domainRaw: string | undefined, skip: number, limit: number): object[] {
  if (!ipAddressSearchNeedsJoin(search)) {
    return [
      { $match: buildIpAddressNativeMatch(domainRaw) },
      { $sort: { _id: -1 } },
      { $skip: skip },
      { $limit: limit },
      ...IP_ADDRESS_JOIN_STAGES,
      { $project: IP_ADDRESS_PROJECT },
    ]
  }
  const searchQuery = buildIpAddressSearchQuery(search, domainRaw)
  return [...IP_ADDRESS_JOIN_STAGES, { $match: searchQuery }, { $project: IP_ADDRESS_PROJECT }, { $sort: { _id: -1 } }, { $skip: skip }, { $limit: limit }]
}

export function buildIpAddressCountPipeline(search: string | undefined, domainRaw: string | undefined): object[] {
  if (!ipAddressSearchNeedsJoin(search)) {
    return [{ $match: buildIpAddressNativeMatch(domainRaw) }, { $count: 'count' }]
  }
  const searchQuery = buildIpAddressSearchQuery(search, domainRaw)
  return [
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $set: { full_name: '$user_info.full_name', user_name: '$user_info.user_name' } },
    { $match: searchQuery },
    { $count: 'count' },
  ]
}

export function buildPointsListPipeline(pointType?: string, status?: string, search?: string): object[] {
  const matchConditions: object[] = []
  if (pointType) matchConditions.push({ point_type: { $regex: pointType, $options: 'i' } })
  if (status === 'credited' || status === 'debited') matchConditions.push({ point_status: status })

  return [
    ...(matchConditions.length ? [{ $match: { $and: matchConditions } }] : []),
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    ...(search
      ? [{ $match: { $or: [{ 'user_info.full_name': { $regex: search, $options: 'i' } }, { 'user_info.user_name': { $regex: search, $options: 'i' } }, { point_type: { $regex: search, $options: 'i' } }] } }]
      : []),
    {
      $project: {
        _id: 1, user_row_id: 1, point_type: 1, point_status: 1, points: 1, createdAt: 1,
        full_name: '$user_info.full_name', user_name: '$user_info.user_name', pro_batch: '$user_info.pro_batch', email_id: '$user_info.email_id',
      },
    },
    { $sort: { createdAt: -1 } },
  ]
}

export function buildChangeLogsMatchConditions(moduleType: string, moduleId: string, userType?: string, dateFrom?: string, dateTo?: string): object[] {
  const matchConditions: object[] = [{ module_key: moduleType }, { module_id: moduleId }]
  if (userType) matchConditions.push({ user_type: userType })
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {}
    if (dateFrom) dateFilter.$gte = new Date(dateFrom) as any
    if (dateTo) dateFilter.$lte = new Date(dateTo) as any
    matchConditions.push({ updated_at: dateFilter })
  }
  return matchConditions
}

export function buildChangeLogsPipeline(matchConditions: object[], search: string | undefined, skip: number, limit: number): object[] {
  return [
    { $match: { $and: matchConditions } },
    { $lookup: { from: 'cln_professionals', localField: 'updated_by', foreignField: '_id', as: 'users_data' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'updated_by', foreignField: '_id', as: 'admins_data' } },
    { $addFields: { user_info: { $cond: [{ $eq: ['$user_type', 'user'] }, { $arrayElemAt: ['$users_data', 0] }, { $arrayElemAt: ['$admins_data', 0] }] } } },
    { $project: { users_data: 0, admins_data: 0 } },
    ...(search ? [{ $match: { $or: [{ 'user_info.full_name': { $regex: search, $options: 'i' } }, { 'user_info.user_name': { $regex: search, $options: 'i' } }, { 'user_info.email_id': { $regex: search, $options: 'i' } }] } }] : []),
    {
      $project: {
        _id: 1, module_key: 1, module_id: 1,
        old_meta_title: 1, new_meta_title: 1, old_meta_description: 1, new_meta_description: 1,
        old_meta_keywords: 1, new_meta_keywords: 1, old_og_title: 1, new_og_title: 1,
        old_og_description: 1, new_og_description: 1, old_twitter_title: 1, new_twitter_title: 1,
        old_twitter_description: 1, new_twitter_description: 1, old_robots_index: 1, new_robots_index: 1,
        old_robots_follow: 1, new_robots_follow: 1, old_twitter_creator: 1, new_twitter_creator: 1,
        user_type: 1, updated_at: 1,
        full_name: '$user_info.full_name', user_name: '$user_info.user_name', email_id: '$user_info.email_id',
      },
    },
    { $sort: { updated_at: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]
}

const SEO_FACET_STAGES: object[] = [
  { $addFields: { title_len: { $strLenCP: { $ifNull: ['$meta_title', ''] } }, tags: { $map: { input: { $ifNull: ['$header_structure', []] }, as: 'h', in: '$$h.tag' } } } },
  {
    $addFields: {
      h1_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H1'] } } } },
      h2_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H2'] } } } },
      h1_index: { $indexOfArray: ['$tags', 'H1'] },
      h2_index: { $indexOfArray: ['$tags', 'H2'] },
      h3_index: { $indexOfArray: ['$tags', 'H3'] },
    },
  },
  {
    $facet: {
      total: [{ $count: 'count' }],
      title_warn: [{ $match: { title_len: { $gt: 60, $lte: 70 } } }, { $count: 'count' }],
      title_err: [{ $match: { title_len: { $gt: 70 } } }, { $count: 'count' }],
      h1_missing: [{ $match: { h1_count: 0 } }, { $count: 'count' }],
      h1_multi: [{ $match: { h1_count: { $gt: 1 } } }, { $count: 'count' }],
      h2_missing: [{ $match: { h2_count: 0 } }, { $count: 'count' }],
      bad_seq: [
        {
          $match: {
            $or: [
              { $and: [{ h2_index: { $gte: 0 } }, { h1_index: -1 }] },
              { $and: [{ h2_index: { $gte: 0 } }, { $expr: { $lt: ['$h2_index', '$h1_index'] } }] },
              { $and: [{ h3_index: { $gte: 0 } }, { h2_index: -1 }] },
              { $and: [{ h3_index: { $gte: 0 } }, { $expr: { $lt: ['$h3_index', '$h2_index'] } }] },
            ],
          },
        },
        { $count: 'count' },
      ],
    },
  },
]

export function buildSeoOverviewRecentLogsPipeline(): object[] {
  return [
    { $match: { module_key: 'professional' } },
    { $sort: { updated_at: -1 } },
    { $group: { _id: '$module_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $addFields: { module_id_num: { $toInt: '$module_id' } } },
    { $lookup: { from: 'cln_professionals', localField: 'module_id_num', foreignField: '_id', as: 'u' } },
    { $match: { 'u.0.user_name': { $exists: true, $ne: '' } } },
    {
      $addFields: {
        user_name: { $arrayElemAt: ['$u.user_name', 0] },
        full_name: { $arrayElemAt: ['$u.full_name', 0] },
        email_id: { $arrayElemAt: ['$u.email_id', 0] },
        login_status: { $arrayElemAt: ['$u.login_status', 0] },
        approval_status: { $arrayElemAt: ['$u.approval_status', 0] },
      },
    },
    { $project: { u: 0 } },
    { $limit: 10 },
  ]
}

export function buildSeoOverviewUserStatsPipeline(): object[] {
  return [
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'u', pipeline: [{ $match: { user_name: { $exists: true, $ne: '' }, approval_status: 1 } }] } },
    { $match: { u: { $ne: [] } } },
    ...SEO_FACET_STAGES,
  ]
}

export function buildSeoOverviewStaticStatsPipeline(excludeRegex: string): object[] {
  return [{ $match: { module: 'app', url: { $not: { $regex: excludeRegex, $options: 'i' } } } }, ...SEO_FACET_STAGES]
}

/**
 * CONFIRMED PERF FIX (Overview page slow-load, 14s+ observed on production): this pipeline
 * returned every field of every matching `cln_seo_static_urls` document (including the full
 * `header_structure` array), with no `$limit` — but the frontend's `ProfessionalsSeoDetailsOverview`
 * widget only ever reads `row.url` for its "Static URLs" table. Projected down to just `url` so the
 * response isn't carrying (and MongoDB isn't materializing) data that's immediately discarded.
 */
export function buildSeoOverviewStaticUrlsPipeline(excludeRegex: string): object[] {
  return [{ $match: { module: 'app', url: { $not: { $regex: excludeRegex, $options: 'i' } } } }, { $project: { _id: 0, url: 1 } }]
}
