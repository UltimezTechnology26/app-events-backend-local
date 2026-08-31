// modules/company_admin/company_admin.seo_overview.queries.ts

/** Ported verbatim from the real source's includePatterns.join("|"). */
export const SEO_URL_INCLUDE_REGEX = ['watchlist', 'company', 'companies', 'partner'].join('|')

const HEADING_TAGS_ADD_FIELDS = {
  $addFields: {
    title_len: { $strLenCP: { $ifNull: ['$meta_title', ''] } },
    tags: { $map: { input: { $ifNull: ['$header_structure', []] }, as: 'h', in: '$$h.tag' } },
  },
}

const HEADING_COUNTS_ADD_FIELDS = {
  $addFields: {
    h1_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H1'] } } } },
    h2_count: { $size: { $filter: { input: '$tags', cond: { $eq: ['$$this', 'H2'] } } } },
    h1_index: { $indexOfArray: ['$tags', 'H1'] },
    h2_index: { $indexOfArray: ['$tags', 'H2'] },
    h3_index: { $indexOfArray: ['$tags', 'H3'] },
  },
}

/**
 * Shared by both the company-level and static-URL SEO health facets — identical branches in
 * the real source, kept as one function here so they can never silently drift apart.
 */
function buildSeoHealthFacetStage() {
  return {
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
  }
}

/** Ports the "1️⃣ RECENT CHANGES" block — the 10 most recently SEO-edited, still-resolvable companies. */
export function buildRecentSeoChangesPipeline() {
  return [
    { $match: { module_key: 'company' } },
    { $sort: { updated_at: -1 } },
    { $group: { _id: '$module_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $addFields: { module_id_num: { $toInt: '$module_id' } } },
    { $lookup: { from: 'cln_company_lists', localField: 'module_id_num', foreignField: '_id', as: 'active_company' } },
    { $lookup: { from: 'cln_company_deleted_history_lists', localField: 'module_id_num', foreignField: 'company_row_id', as: 'deleted_company' } },
    {
      $addFields: {
        company_data: {
          $cond: [{ $gt: [{ $size: '$active_company' }, 0] }, { $arrayElemAt: ['$active_company', 0] }, { $arrayElemAt: ['$deleted_company', 0] }],
        },
      },
    },
    {
      $addFields: {
        company_id: '$company_data.company_id',
        company_name: '$company_data.company_name',
        approval_status: '$company_data.approval_status',
        active_status: '$company_data.active_status',
      },
    },
    { $match: { company_id: { $exists: true, $ne: '' } } },
    { $project: { active_company: 0, deleted_company: 0, company_data: 0 } },
    { $sort: { updated_at: -1 } },
    { $limit: 10 },
  ]
}

/**
 * Ports the "2️⃣ COMPANY SEO STATS" block.
 *
 * CONFIRMED BUG FIX: the real source aggregated `company_other_detailsM` — a variable
 * `require()`'d nowhere in the entire codebase (the same ReferenceError already confirmed and
 * fixed for company_admin.service.ts's updateCompanyPageDetails, Part 3 §7 Phase H step 6) — so
 * this route has always crashed on every call. `meta_title` and `header_structure` (the two
 * fields this pipeline actually reads) both live on `company_seo_detailsM`, the same
 * already-correct, already-populated collection `saveOrUpdateBasicCompanyDetails` and
 * `saveOrUpdateSocialDetails` write to — confirmed via its schema, which declares both fields.
 * Aggregating there instead both fixes the crash and keeps this route on the same canonical SEO
 * storage every other SEO-writing code path already uses.
 */
export function buildCompanySeoStatsPipeline() {
  return [
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'c',
        pipeline: [{ $match: { company_id: { $exists: true, $ne: '' }, approval_status: 1, active_status: 1 } }],
      },
    },
    { $match: { c: { $ne: [] } } },
    HEADING_TAGS_ADD_FIELDS,
    HEADING_COUNTS_ADD_FIELDS,
    buildSeoHealthFacetStage(),
  ]
}

/** Ports the "3️⃣ STATIC URL SEO STATS" block. */
export function buildStaticUrlSeoStatsPipeline() {
  return [{ $match: { module: 'app', url: { $regex: SEO_URL_INCLUDE_REGEX, $options: 'i' } } }, HEADING_TAGS_ADD_FIELDS, HEADING_COUNTS_ADD_FIELDS, buildSeoHealthFacetStage()]
}

/** Ports the plain static-URLs listing block (returned to the client as-is, no stats computed). */
export function buildStaticUrlsPipeline() {
  return [{ $match: { module: 'app', url: { $regex: SEO_URL_INCLUDE_REGEX, $options: 'i' } } }]
}

/** Ports the real source's `val(obj, key)` helper for reading a $facet branch's count. */
export function extractFacetCount(facetResult: Record<string, [{ count: number }] | undefined>[], key: string): number {
  return facetResult?.[0]?.[key]?.[0]?.count || 0
}
