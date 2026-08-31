// modules/partners/partners.queries.ts
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'

/**
 * Ports services/company/front_page.ts's partnersList()/getPartnerListDetails() search-array
 * building (report_list_type-independent portion) verbatim.
 */
export function buildPartnersSearchArray({
  search,
  businessModelIds,
  location,
  reportListType,
  categoryRowId,
  revenueGrowthId,
}: {
  search?: string
  businessModelIds?: number[]
  location?: string
  reportListType: number
  categoryRowId?: number
  revenueGrowthId?: number
}): Record<string, any>[] {
  const searchArray: Record<string, any>[] = [{}]

  if (search) {
    searchArray.push({
      $or: [
        { company_name: { $regex: `^${search}`, $options: 'i' } },
        { company_id: { $regex: `^${search}`, $options: 'i' } },
      ],
    })
  }

  if (businessModelIds && businessModelIds.length > 0) {
    searchArray.push({ business_model_id: { $in: businessModelIds } })
  }

  if (location) {
    searchArray.push({ company_location: { $regex: location, $options: 'i' } })
  }

  if ([3, 4].includes(reportListType) && categoryRowId !== undefined && !Number.isNaN(categoryRowId)) {
    searchArray.push({ category_ids: categoryRowId })
  }

  if (reportListType === 5 && revenueGrowthId !== undefined) {
    if (revenueGrowthId === 1) searchArray.push({ revenue_growth: { $lt: 0 } })
    if (revenueGrowthId === 2) searchArray.push({ revenue_growth: { $gte: 0, $lte: 10 } })
    if (revenueGrowthId === 3) searchArray.push({ revenue_growth: { $gt: 10, $lte: 50 } })
    if (revenueGrowthId === 4) searchArray.push({ revenue_growth: { $gt: 50 } })
  }

  return searchArray
}

/** Ports getPartnerListDetails()'s "top partner countries" aggregation (services/company/front_page.ts:3088-3134) verbatim. */
export function buildTopPartnerCountriesPipeline(countryRegexList: { name: string; regex: RegExp }[]) {
  return [
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company',
        pipeline: [{ $match: { approval_status: 1, active_status: 1, company_location: { $exists: true, $ne: '' } } }, { $project: { company_location: 1, _id: 0 } }],
      },
    },
    { $unwind: { path: '$company', preserveNullAndEmptyArrays: false } },
    { $match: { 'company.company_location': { $exists: true, $ne: '' } } },
    {
      $addFields: {
        matched_countries: {
          $filter: { input: countryRegexList, as: 'c', cond: { $regexMatch: { input: '$company.company_location', regex: '$$c.regex' } } },
        },
      },
    },
    { $unwind: '$matched_countries' },
    { $group: { _id: '$matched_countries.name', partner_count: { $sum: 1 } } },
    { $sort: { partner_count: -1 } },
    { $limit: 5 },
  ]
}

/**
 * Ports partnersList()'s report_list_type===1 branch (services/company/front_page.ts:3213-4154),
 * $facet-converted per the standing list+count fix — the real source's count pipeline already
 * matched the data pipeline's shared upstream (company lookup/enrichment/search-match) exactly,
 * just without the follower/event/funding/investment/revenue/products/holdings/jobs enrichment
 * (irrelevant to counting), so those enrichment stages now live only in the `data` facet branch.
 */
export function buildPartnersCompaniesPipeline({ searchArray, userRowId, skip, limit }: { searchArray: Record<string, any>[]; userRowId: number; skip: number; limit: number }) {
  return [
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company',
        pipeline: [
          { $match: { active_status: 1, approval_status: 1 } },
          ...buildProfessionalEnrichmentStages(),
          {
            $lookup: {
              from: 'cln_static_company_business_models',
              localField: 'business_model_id',
              foreignField: '_id',
              as: 'business_info',
              pipeline: [{ $project: { business_name: 1 } }],
            },
          },
          {
            $lookup: {
              from: 'cln_static_company_business_models',
              localField: 'main_business_model_id',
              foreignField: '_id',
              as: 'main_business_info',
              pipeline: [{ $project: { business_name: 1 } }],
            },
          },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_static_countries',
              localField: 'country_id',
              foreignField: '_id',
              as: 'country_info',
              pipeline: [{ $project: { country_name: 1, country_flag: 1 } }],
            },
          },
          { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              company_size_row_id: 1,
              company_valuation: 1,
              main_business_model_id: 1,
              business_model_id: 1,
              company_name: 1,
              company_id: 1,
              company_logo: 1,
              established_in: 1,
              describe_in_one_line: 1,
              company_location: 1,
              country_id: 1,
              latitude: 1,
              longitude: 1,
              active_status: 1,
              approval_status: 1,
              country_flag: '$country_info.country_flag',
              country_name: '$country_info.country_name',
              main_business_model_name: '$main_business_info.business_name',
              business_name: '$business_info.business_name',
            },
          },
        ],
      },
    },
    { $unwind: { path: '$company' } },
    {
      $set: {
        company_name: '$company.company_name',
        company_id: '$company.company_id',
        company_location: { $cond: { if: '$company.company_location', then: '$company.company_location', else: '' } },
        business_model_id: '$company.business_model_id',
      },
    },
    { $match: { $and: searchArray } },
    {
      $facet: {
        data: [
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: 'company_row_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                {
                  $lookup: {
                    from: 'cln_professionals',
                    localField: 'user_row_id',
                    foreignField: '_id',
                    as: 'inner_user_info',
                    pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }],
                  },
                },
                { $unwind: { path: '$inner_user_info' } },
                { $count: 'count' },
              ],
            },
          },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: 'company_row_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: userRowId } }],
              as: 'info_user_following',
            },
          },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_watchlists',
              localField: 'company_row_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: userRowId } }],
              as: 'info_company_watchlist',
            },
          },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_events',
              let: { companyId: '$company_row_id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$company_row_id', '$$companyId'] }, { $eq: ['$active_status', 1] }, { $eq: ['$approval_status', 1] }, { $gt: ['$company_row_id', 0] }] } } },
                { $group: { _id: null, total_events: { $sum: 1 } } },
              ],
              as: 'event_info',
            },
          },
          { $addFields: { total_events: { $ifNull: [{ $arrayElemAt: ['$event_info.total_events', 0] }, 0] } } },
          {
            $lookup: {
              from: 'cln_event_sponsor_partner_details',
              localField: 'company_row_id',
              foreignField: 'user_company_row_id',
              as: 'info_sponsor',
              pipeline: [
                { $match: { sponsor_partner_type: 1, account_type: 2, registered_type: 1 } },
                {
                  $lookup: {
                    from: 'cln_events',
                    localField: 'event_row_id',
                    foreignField: '_id',
                    as: 'info_event',
                    pipeline: [
                      { $match: { active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] } } },
                      {
                        $lookup: {
                          from: 'cln_professionals',
                          localField: 'user_row_id',
                          foreignField: '_id',
                          as: 'user_info',
                          pipeline: [{ $match: { login_status: { $ne: 1 } } }, { $project: { _id: 1, login_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
                      {
                        $lookup: {
                          from: 'cln_company_lists',
                          localField: 'company_row_id',
                          foreignField: '_id',
                          as: 'company_info',
                          pipeline: [{ $match: { active_status: { $ne: 1 } } }, { $project: { _id: 1, active_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
                      {
                        $set: {
                          company_active_status: { $cond: { if: '$company_info', then: '$company_info.active_status', else: 1 } },
                          login_status: { $cond: { if: '$user_info', then: '$user_info.login_status', else: 1 } },
                        },
                      },
                      {
                        $match: {
                          $or: [{ login_status: 1, list_event_type: 1 }, { company_active_status: 1, list_event_type: 2 }, { list_event_type: 3, login_status: 1, company_active_status: 1 }],
                        },
                      },
                      { $project: { _id: 1 } },
                    ],
                  },
                },
                { $unwind: { path: '$info_event' } },
                { $count: 'count' },
              ],
            },
          },
          {
            $lookup: {
              from: 'cln_event_sponsor_partner_details',
              localField: 'company_row_id',
              foreignField: 'user_company_row_id',
              as: 'info_partner',
              pipeline: [
                { $match: { sponsor_partner_type: 2, account_type: 2, registered_type: 1 } },
                {
                  $lookup: {
                    from: 'cln_events',
                    localField: 'event_row_id',
                    foreignField: '_id',
                    as: 'info_event',
                    pipeline: [
                      { $match: { active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] } } },
                      {
                        $lookup: {
                          from: 'cln_professionals',
                          localField: 'user_row_id',
                          foreignField: '_id',
                          as: 'user_info',
                          pipeline: [{ $match: { login_status: { $ne: 1 } } }, { $project: { _id: 1, login_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
                      {
                        $lookup: {
                          from: 'cln_company_lists',
                          localField: 'company_row_id',
                          foreignField: '_id',
                          as: 'company_info',
                          pipeline: [{ $match: { active_status: { $ne: 1 } } }, { $project: { _id: 1, active_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
                      {
                        $set: {
                          company_active_status: { $cond: { if: '$company_info', then: '$company_info.active_status', else: 1 } },
                          login_status: { $cond: { if: '$user_info', then: '$user_info.login_status', else: 1 } },
                        },
                      },
                      {
                        $match: {
                          $or: [{ login_status: 1, list_event_type: 1 }, { company_active_status: 1, list_event_type: 2 }, { list_event_type: 3, login_status: 1, company_active_status: 1 }],
                        },
                      },
                      { $project: { _id: 1 } },
                    ],
                  },
                },
                { $unwind: { path: '$info_event' } },
                { $count: 'count' },
              ],
            },
          },
          {
            $addFields: {
              total_sponsors: { $cond: { if: { $gt: [{ $size: '$info_sponsor' }, 0] }, then: [{ $arrayElemAt: ['$info_sponsor.count', 0] }], else: [0] } },
              total_partners: { $cond: { if: { $gt: [{ $size: '$info_partner' }, 0] }, then: [{ $arrayElemAt: ['$info_partner.count', 0] }], else: [0] } },
            },
          },
          {
            $lookup: {
              from: 'cln_funding_investment_lists',
              let: { companyId: '$company_row_id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$funds_raised_company_row_id', '$$companyId'] }, { $eq: ['$funds_raised_registered_type', 1] }, { $eq: ['$verified_status', 1] }] } } },
                {
                  $lookup: {
                    from: 'cln_company_lists',
                    let: { it: '$investor_type', irt: '$investor_registered_type', iid: '$investor_row_id' },
                    pipeline: [
                      { $match: { $and: [{ $expr: { $and: [{ $eq: [2, '$$it'] }, { $eq: [1, '$$irt'] }, { $eq: ['$_id', '$$iid'] }] } }, { active_status: 1 }] } },
                      { $project: { _id: 1 } },
                    ],
                    as: 'company_info',
                  },
                },
                { $set: { company_investor_id: { $ifNull: [{ $arrayElemAt: ['$company_info._id', 0] }, 0] } } },
                {
                  $set: {
                    investor_data: {
                      $switch: { branches: [{ case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$company_investor_id' }], default: '$investor_row_id' },
                    },
                  },
                },
                { $match: { investor_data: { $gt: 0 } } },
                {
                  $group: {
                    _id: '$round_id',
                    funds_raised_company_row_id: { $first: '$funds_raised_company_row_id' },
                    amount: { $first: '$amount' },
                    category_row_id: { $first: '$category_row_id' },
                    investor_identities: { $push: { investor_row_id: '$investor_row_id', investor_type: '$investor_type', investor_registered_type: '$investor_registered_type' } },
                  },
                },
                {
                  $group: {
                    _id: '$funds_raised_company_row_id',
                    total_funds_raised_amount: { $sum: '$amount' },
                    round_ids: { $addToSet: '$_id' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: { $push: '$investor_identities' },
                  },
                },
                { $addFields: { funds_raised_ids: { $reduce: { input: '$funds_raised_ids', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } } },
                { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_ids', foreignField: '_id', as: 'funding_rounds', pipeline: [{ $project: { _id: 0, category_name: 1 } }] } },
              ],
              as: 'funding_info',
            },
          },
          { $set: { funding_data: { $arrayElemAt: ['$funding_info', 0] } } },
          {
            $addFields: {
              total_funds_raised_companies: { $size: { $ifNull: ['$funding_data.funds_raised_ids', []] } },
              total_funds_raised_rounds: { $size: { $ifNull: ['$funding_data.round_ids', []] } },
              funds_raised_rounds: { $ifNull: ['$funding_data.funding_rounds.category_name', []] },
              total_funds_raised_amount: { $ifNull: ['$funding_data.total_funds_raised_amount', 0] },
            },
          },
          {
            $lookup: {
              from: 'cln_funding_investment_lists',
              let: { investorId: '$company_row_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$investor_row_id', '$$investorId'] }, investor_type: 2, investor_registered_type: 1, verified_status: 1 } },
                {
                  $lookup: {
                    from: 'cln_company_lists',
                    let: { fr_reg_type: '$funds_raised_registered_type', fr_company_id: '$funds_raised_company_row_id' },
                    pipeline: [
                      { $match: { $and: [{ $expr: { $and: [{ $eq: ['$$fr_reg_type', 1] }, { $eq: ['$_id', '$$fr_company_id'] }] } }, { active_status: 1 }] } },
                      { $project: { _id: 1 } },
                    ],
                    as: 'recipient_company',
                  },
                },
                { $addFields: { recipient_ok: { $cond: [{ $eq: ['$funds_raised_registered_type', 1] }, { $gt: [{ $size: '$recipient_company' }, 0] }, true] } } },
                { $match: { recipient_ok: true } },
                {
                  $lookup: {
                    from: 'cln_funding_investment_lists',
                    let: { round_id: '$round_id' },
                    pipeline: [{ $match: { $expr: { $eq: ['$round_id', '$$round_id'] } } }, { $project: { _id: 1 } }],
                    as: 'round_investor_rows',
                  },
                },
                { $match: { $expr: { $lte: [{ $size: '$round_investor_rows' }, 1] } } },
                {
                  $group: {
                    _id: '$investor_row_id',
                    total_invested_amount: { $sum: '$amount' },
                    round_ids: { $addToSet: '$round_id' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: { $addToSet: '$funds_raised_company_row_id' },
                  },
                },
              ],
              as: 'investments_agg',
            },
          },
          {
            $lookup: {
              from: 'cln_static_company_funding_rounds',
              let: { category_ids: { $ifNull: [{ $arrayElemAt: ['$investments_agg.category_ids', 0] }, []] } },
              pipeline: [{ $match: { $expr: { $in: ['$_id', '$$category_ids'] } } }, { $project: { category_name: 1 } }],
              as: 'invested_rounds',
            },
          },
          {
            $addFields: {
              total_invested_amount: { $ifNull: [{ $arrayElemAt: ['$investments_agg.total_invested_amount', 0] }, 0] },
              total_invested_rounds: { $size: { $ifNull: [{ $arrayElemAt: ['$investments_agg.category_ids', 0] }, []] } },
              total_invested_companies: { $size: { $ifNull: [{ $arrayElemAt: ['$investments_agg.funds_raised_ids', 0] }, []] } },
            },
          },
          { $project: { investments_agg: 0 } },
          {
            $lookup: {
              from: 'cln_company_revenue_details',
              localField: 'company_row_id',
              foreignField: 'company_row_id',
              as: 'revenue_info',
              pipeline: [
                { $sort: { year: -1, quarter: -1 } },
                {
                  $group: {
                    _id: '$company_row_id',
                    pushed_data: { $push: { $cond: [{ $lt: ['$quarter', 5] }, { year: '$year', quarter: '$quarter', revenue: '$revenue' }, '$$REMOVE'] } },
                    total_revenue: { $sum: '$revenue' },
                  },
                },
                {
                  $project: {
                    total_revenue: 1,
                    revenue_growth: {
                      $cond: [
                        { $and: [{ $gte: [{ $size: '$pushed_data' }, 2] }, { $ne: [{ $arrayElemAt: ['$pushed_data.revenue', 1] }, 0] }] },
                        { $multiply: [{ $divide: [{ $subtract: [{ $arrayElemAt: ['$pushed_data.revenue', 0] }, { $arrayElemAt: ['$pushed_data.revenue', 1] }] }, { $arrayElemAt: ['$pushed_data.revenue', 1] }] }, 100] },
                        0,
                      ],
                    },
                  },
                },
              ],
            },
          },
          { $unwind: { path: '$revenue_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_products',
              let: { companyId: '$company_row_id' },
              as: 'products_info',
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$company_row_id', '$$companyId'] }, { $eq: ['$company_type', 1] }] } } },
                { $group: { _id: '$company_row_id', total_products: { $sum: 1 }, product_ids: { $addToSet: { register_type: '$register_type', product_type: '$product_type', product_row_id: '$product_row_id' } } } },
                { $project: { _id: 0, total_products: 1, product_ids: 1 } },
              ],
            },
          },
          { $unwind: { path: '$products_info', preserveNullAndEmptyArrays: true } },
          { $set: { total_products: '$products_info.total_products', product_ids: '$products_info.product_ids' } },
          {
            $lookup: {
              from: 'cln_company_holdings',
              let: { companyId: '$company_row_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$company_row_id', '$$companyId'] }, company_type: 1 } },
                {
                  $group: {
                    _id: '$company_row_id',
                    total_holdings: { $sum: '$purchased_value_in_usd' },
                    token_row_ids: { $addToSet: { $cond: { if: { $eq: ['$token_type', 1] }, then: '$token_row_id', else: '$$REMOVE' } } },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { total_holdings: -1 } },
              ],
              as: 'company_holdings',
            },
          },
          {
            $addFields: {
              total_holdings: { $ifNull: [{ $arrayElemAt: ['$company_holdings.total_holdings', 0] }, 0] },
              token_row_ids: { $ifNull: [{ $arrayElemAt: ['$company_holdings.token_row_ids', 0] }, []] },
            },
          },
          {
            $lookup: {
              from: 'cln_jobs',
              let: { companyId: '$company_row_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$company_row_id', '$$companyId'] }, active_status: 'active', is_deleted: false } },
                { $project: { _id: 0, job_title: 1 } },
                { $sort: { createdAt: -1 } },
              ],
              as: 'company_jobs',
            },
          },
          { $addFields: { job_roles: { $map: { input: '$company_jobs', as: 'job', in: '$$job.job_title' } } } },
          {
            $project: {
              _id: 1,
              user_row_id: 1,
              company_size_row_id: '$company.company_size_row_id',
              company_valuation: '$company.company_valuation',
              country_name: '$company.country_name',
              country_flag: '$company.country_flag',
              active_status: '$company.active_status',
              approval_status: '$company.approval_status',
              company_row_id: '$company._id',
              company_location: 1,
              company_name: 1,
              company_id: 1,
              latitude: '$company.latitude',
              longitude: '$company.longitude',
              company_logo: '$company.company_logo',
              established_in: '$company.established_in',
              describe_in_one_line: '$company.describe_in_one_line',
              watchlist_status: { $cond: { if: '$info_company_watchlist', then: 1, else: 0 } },
              following_status: { $cond: { if: '$info_user_following', then: 1, else: 0 } },
              total_followers: { $cond: { if: { $gt: [{ $size: '$followers_info' }, 0] }, then: '$followers_info.count', else: 0 } },
              main_business_model_name: '$company.main_business_model_name',
              business_name: '$company.business_name',
              total_events: 1,
              total_sponsors: 1,
              total_partners: 1,
              total_funds_raised_companies: 1,
              total_funds_raised_rounds: 1,
              funds_raised_rounds: 1,
              total_funds_raised_amount: 1,
              total_invested_rounds: 1,
              total_invested_amount: 1,
              invested_rounds: '$invested_rounds.category_name',
              total_revenue: '$revenue_info.total_revenue',
              revenue_growth: '$revenue_info.revenue_growth',
              product_ids: 1,
              total_holdings: 1,
              token_row_ids: 1,
              job_roles: 1,
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

/**
 * Ports partnersList()'s report_list_type===2 branch (services/company/front_page.ts:4155-4631),
 * $facet-converted per the standing list+count fix.
 */
export function buildPartnersEventsPipeline({ matchQuery, sortFilter, searchArray, userRowId, skip, limit }: { matchQuery: Record<string, any>; sortFilter: Record<string, any>; searchArray: Record<string, any>[]; userRowId: number; skip: number; limit: number }) {
  return [
    { $match: { active_status: 1, approval_status: 1, company_row_id: { $gt: 0 } } },
    { $match: matchQuery },
    { $group: { _id: '$company_row_id', total_events: { $sum: 1 } } },
    sortFilter,
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          { $lookup: { from: 'cln_company_added_to_partners', localField: '_id', foreignField: 'company_row_id', as: 'info_parnters', pipeline: [{ $project: { _id: 1 } }] } },
          { $unwind: { path: '$info_parnters' } },
          ...buildProfessionalEnrichmentStages(),
          { $project: { company_name: 1, company_id: 1, company_logo: 1, latitude: 1, longitude: 1, company_location: 1, business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, country_id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id',
        country_id: '$company_info.country_id',
      },
    },
    {
      $lookup: {
        from: 'cln_static_company_business_models',
        localField: 'main_business_model_id',
        foreignField: '_id',
        as: 'main_business_info',
        pipeline: [{ $project: { business_name: 1 } }],
      },
    },
    { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_info', pipeline: [{ $project: { business_name: 1 } }] } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'country_info', pipeline: [{ $project: { country_name: 1, country_flag: 1 } }] } },
    { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
    { $match: { $and: searchArray } },
    {
      $facet: {
        data: [
          {
            $lookup: {
              from: 'cln_event_sponsor_partner_details',
              localField: '_id',
              foreignField: 'user_company_row_id',
              as: 'info_sponsor',
              pipeline: [
                { $match: { sponsor_partner_type: 1, account_type: 2, registered_type: 1 } },
                {
                  $lookup: {
                    from: 'cln_events',
                    localField: 'event_row_id',
                    foreignField: '_id',
                    as: 'info_event',
                    pipeline: [
                      { $match: { active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] } } },
                      {
                        $lookup: {
                          from: 'cln_professionals',
                          localField: 'user_row_id',
                          foreignField: '_id',
                          as: 'user_info',
                          pipeline: [{ $match: { login_status: { $ne: 1 } } }, { $project: { _id: 1, login_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
                      {
                        $lookup: {
                          from: 'cln_company_lists',
                          localField: 'company_row_id',
                          foreignField: '_id',
                          as: 'company_info',
                          pipeline: [{ $match: { active_status: { $ne: 1 } } }, { $project: { _id: 1, active_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
                      {
                        $set: {
                          company_active_status: { $cond: { if: '$company_info', then: '$company_info.active_status', else: 1 } },
                          login_status: { $cond: { if: '$user_info', then: '$user_info.login_status', else: 1 } },
                        },
                      },
                      { $match: { $or: [{ login_status: 1, list_event_type: 1 }, { company_active_status: 1, list_event_type: 2 }, { list_event_type: 3, login_status: 1, company_active_status: 1 }] } },
                      { $project: { _id: 1 } },
                    ],
                  },
                },
                { $unwind: { path: '$info_event' } },
                { $count: 'count' },
              ],
            },
          },
          {
            $lookup: {
              from: 'cln_event_sponsor_partner_details',
              localField: '_id',
              foreignField: 'user_company_row_id',
              as: 'info_partner',
              pipeline: [
                { $match: { sponsor_partner_type: 2, account_type: 2, registered_type: 1 } },
                {
                  $lookup: {
                    from: 'cln_events',
                    localField: 'event_row_id',
                    foreignField: '_id',
                    as: 'info_event',
                    pipeline: [
                      { $match: { active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] } } },
                      {
                        $lookup: {
                          from: 'cln_professionals',
                          localField: 'user_row_id',
                          foreignField: '_id',
                          as: 'user_info',
                          pipeline: [{ $match: { login_status: { $ne: 1 } } }, { $project: { _id: 1, login_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
                      {
                        $lookup: {
                          from: 'cln_company_lists',
                          localField: 'company_row_id',
                          foreignField: '_id',
                          as: 'company_info',
                          pipeline: [{ $match: { active_status: { $ne: 1 } } }, { $project: { _id: 1, active_status: 1 } }],
                        },
                      },
                      { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
                      {
                        $set: {
                          company_active_status: { $cond: { if: '$company_info', then: '$company_info.active_status', else: 1 } },
                          login_status: { $cond: { if: '$user_info', then: '$user_info.login_status', else: 1 } },
                        },
                      },
                      { $match: { $or: [{ login_status: 1, list_event_type: 1 }, { company_active_status: 1, list_event_type: 2 }, { list_event_type: 3, login_status: 1, company_active_status: 1 }] } },
                      { $project: { _id: 1 } },
                    ],
                  },
                },
                { $unwind: { path: '$info_event' } },
                { $count: 'count' },
              ],
            },
          },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                {
                  $lookup: {
                    from: 'cln_professionals',
                    localField: 'user_row_id',
                    foreignField: '_id',
                    as: 'inner_user_info',
                    pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }],
                  },
                },
                { $unwind: { path: '$inner_user_info' } },
                { $count: 'count' },
              ],
            },
          },
          { $lookup: { from: 'cln_company_followers', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id: userRowId } }], as: 'info_user_following' } },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_watchlists', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id: userRowId } }], as: 'info_company_watchlist' } },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              company_row_id: '$_id',
              company_name: 1,
              company_id: 1,
              company_location: 1,
              main_business_model_id: 1,
              country_id: 1,
              total_events: 1,
              latitude: '$company.latitude',
              longitude: '$company.longitude',
              company_logo: '$company_info.company_logo',
              describe_in_one_line: '$company_info.describe_in_one_line',
              country_flag: '$country_info.country_flag',
              country_name: '$country_info.country_name',
              business_name: '$business_info.business_name',
              total_sponsors: { $cond: { if: { $gt: [{ $size: '$info_sponsor' }, 0] }, then: '$info_sponsor.count', else: 0 } },
              total_partners: { $cond: { if: { $gt: [{ $size: '$info_partner' }, 0] }, then: '$info_partner.count', else: 0 } },
              main_business_model_name: '$main_business_info.business_name',
              watchlist_status: { $cond: { if: '$info_company_watchlist', then: 1, else: 0 } },
              following_status: { $cond: { if: '$info_user_following', then: 1, else: 0 } },
              total_followers: { $cond: { if: { $gt: [{ $size: '$followers_info' }, 0] }, then: '$followers_info.count', else: 0 } },
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

/**
 * Ports partnersList()'s report_list_type===8 branch (services/company/front_page.ts:5596-5892,
 * companies with active job openings), $facet-converted per the standing list+count fix.
 */
export function buildPartnersJobsPipeline({ matchQuery, searchArray, userRowId, skip, limit }: { matchQuery: Record<string, any>; searchArray: Record<string, any>[]; userRowId: number; skip: number; limit: number }) {
  const companyJoin = (extraProject: Record<string, any>) => ({
    $lookup: {
      from: 'cln_company_lists',
      localField: '_id',
      foreignField: '_id',
      as: 'company_info',
      pipeline: [
        { $match: { approval_status: 1, active_status: 1 } },
        { $lookup: { from: 'cln_company_added_to_partners', localField: '_id', foreignField: 'company_row_id', as: 'info_parnters', pipeline: [{ $project: { _id: 1 } }] } },
        { $unwind: { path: '$info_parnters' } },
        ...buildProfessionalEnrichmentStages(),
        { $project: extraProject },
      ],
    },
  })

  return [
    { $match: { active_status: 'active', is_deleted: false } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$company_row_id', job_roles: { $push: '$job_title' } } },
    { $match: { $expr: { $gt: [{ $size: '$job_roles' }, 0] } } },
    companyJoin({
      company_name: 1,
      company_id: 1,
      company_logo: 1,
      company_location: 1,
      company_valuation: 1,
      business_model_id: 1,
      describe_in_one_line: 1,
      main_business_model_id: 1,
      country_id: 1,
      latitude: 1,
      longitude: 1,
    }),
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id',
        country_id: '$company_info.country_id',
        company_logo: '$company_info.company_logo',
        describe_in_one_line: '$company_info.describe_in_one_line',
        company_valuation: '$company_info.company_valuation',
      },
    },
    { $match: matchQuery },
    { $match: { $and: searchArray } },
    {
      $facet: {
        data: [
          { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'country_info', pipeline: [{ $project: { country_name: 1, country_flag: 1 } }] } },
          { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'inner_user_info', pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }] } },
                { $unwind: { path: '$inner_user_info' } },
                { $count: 'count' },
              ],
            },
          },
          { $lookup: { from: 'cln_company_followers', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id: userRowId } }], as: 'info_user_following' } },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_watchlists', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id: userRowId } }], as: 'info_company_watchlist' } },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              job_roles: 1,
              company_name: 1,
              company_id: 1,
              company_location: 1,
              business_model_id: 1,
              main_business_model_id: 1,
              company_logo: 1,
              describe_in_one_line: 1,
              company_valuation: 1,
              latitude: '$company.latitude',
              longitude: '$company.longitude',
              country_flag: '$country_info.country_flag',
              country_name: '$country_info.country_name',
              business_name: '$business_info.business_name',
              main_business_model_name: '$main_business_info.business_name',
              watchlist_status: { $cond: { if: '$info_company_watchlist', then: 1, else: 0 } },
              following_status: { $cond: { if: '$info_user_following', then: 1, else: 0 } },
              total_followers: { $cond: [{ $gt: [{ $size: '$followers_info' }, 0] }, '$followers_info.count', 0] },
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractPartnersPaginatedResult(aggregateOutput: any[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return {
    data: facetResult.data,
    count: facetResult.totalCount[0]?.count ?? 0,
  }
}

/** Ports requests_to_partners.js's GET /list/:approval_status/:skip/:limit (lines 16-267), $facet-converted per the standing list+count fix. */
export function buildPartnerRequestsListPipeline({ approvalStatus, scoreQuery, skip, limit }: { approvalStatus: number; scoreQuery: Record<string, any>; skip: number; limit: number }) {
  return [
    { $match: { approval_status: approvalStatus } },
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1 } }],
      },
    },
    { $unwind: { path: '$user_info' } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { active_status: 1 } },
          {
            $project: {
              _id: 1,
              company_name: 1,
              company_id: 1,
              company_email_id: 1,
              website_link: 1,
              basic_details_score: 1,
              seo_details_score: 1,
              social_media_score: 1,
              owned_product_score: 1,
              team_detail_score: 1,
              job_opening_score: 1,
              funding_score: 1,
              revenue_score_score: 1,
              investment_score: 1,
              faq_score: 1,
              holding_crypto_score: 1,
              profile_score: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        basic_details_score: '$company_info.basic_details_score',
        seo_details_score: '$company_info.seo_details_score',
        social_media_score: '$company_info.social_media_score',
        owned_product_score: '$company_info.owned_product_score',
        team_detail_score: '$company_info.team_detail_score',
        job_opening_score: '$company_info.job_opening_score',
        funding_score: '$company_info.funding_score',
        revenue_score_score: '$company_info.revenue_score_score',
        investment_score: '$company_info.investment_score',
        faq_score: '$company_info.faq_score',
        holding_crypto_score: '$company_info.holding_crypto_score',
        profile_score: '$company_info.profile_score',
      },
    },
    { $match: scoreQuery },
    {
      $facet: {
        data: [
          {
            $project: {
              _id: 1,
              approval_status: 1,
              date_n_time: 1,
              // CONFIRMED BUG FIX (found via live testing): admin's pending/approved/rejected
              // partner-request pages all read `created_date_n_time` for their "Requested On"
              // column, but this collection's field is `date_n_time` — the real source never
              // aliased it either, so this column has always rendered blank. Added the alias
              // rather than renaming `date_n_time`, since it's additive and doesn't risk
              // anything else that reads the original field name.
              created_date_n_time: '$date_n_time',
              rejected_reason: 1,
              approval_date_n_time: 1,
              company_name: 1,
              company_id: 1,
              company_email_id: 1,
              website_link: 1,
              contact_number: '$company_info.contact_number',
              company_logo: '$company_info.company_logo',
              user_name: 1,
              full_name: 1,
              email_id: 1,
              basic_details_score: 1,
              seo_details_score: 1,
              social_media_score: 1,
              owned_product_score: 1,
              team_detail_score: 1,
              job_opening_score: 1,
              funding_score: 1,
              revenue_score_score: 1,
              investment_score: 1,
              faq_score: 1,
              holding_crypto_score: 1,
              profile_score: 1,
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

/**
 * Ports company.js's GET /partners_list/:skip/:limit (admin-side directory, lines 3782-4022),
 * $facet-converted per the standing list+count fix.
 *
 * CONFIRMED BUG FIX: the real source only ran its count query `if (queryRun.length > 0)` —
 * meaning a page with zero rows on it (e.g. skipped past the end of a nonzero-total list)
 * silently reported `count: 0` even when the true total was nonzero. A single shared $facet
 * makes this structurally impossible: totalCount is always computed from the same upstream
 * match, independent of whether the data page happens to be empty.
 */
export function buildAdminPartnersListPipeline({ elemMatchQuery, skip, limit }: { elemMatchQuery: Record<string, any>; skip: number; limit: number }) {
  return [
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { approval_status: 1, active_status: 1 } }],
      },
    },
    { $match: { company_info: { $elemMatch: elemMatchQuery } } },
    { $unwind: { path: '$company_info' } },
    {
      $lookup: {
        from: 'cln_company_created_by_admins',
        localField: 'company_row_id',
        foreignField: 'company_row_id',
        as: 'created_by_admin',
      },
    },
    { $unwind: { path: '$created_by_admin', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { updated_by_id: '$company_info.updated_by_row_id', updated_by_type: '$company_info.updated_by' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$updated_by_id'] }, { $eq: ['$$updated_by_type', 'user'] }] } } }, { $project: { full_name: 1 } }],
        as: 'updated_by_user_info',
      },
    },
    {
      $lookup: {
        from: 'cln_sub_admins',
        let: { updated_by_id: '$company_info.updated_by_row_id', updated_by_type: '$company_info.updated_by' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$updated_by_id'] }, { $in: ['$$updated_by_type', ['admin', 'subadmin']] }] } } }, { $project: { full_name: 1 } }],
        as: 'updated_by_admin_info',
      },
    },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_id: '$company_info.user_row_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$user_id'] } } }],
        as: 'user_info',
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_sub_admins',
        let: { sub_admin_id: '$company_info.sub_admin_row_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$sub_admin_id'] } } }],
        as: 'sub_admin_info',
      },
    },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        data: [
          {
            $project: {
              _id: 1,
              company_row_id: 1,
              user_row_id: '$company_info.user_row_id',
              company_name: '$company_info.company_name',
              company_id: '$company_info.company_id',
              company_email_id: '$company_info.company_email_id',
              company_logo: '$company_info.company_logo',
              created_date_n_time: '$company_info.created_date_n_time',
              claim_status: '$company_info.claim_status',
              created_admin_row_id: '$created_by_admin.sub_admin_row_id',
              created_user_name: '$user_info.full_name',
              sub_admin_name: '$sub_admin_info.full_name',
              sub_admin_username: '$sub_admin_info.user_name',
              basic_details_score: '$company_info.basic_details_score',
              seo_details_score: '$company_info.seo_details_score',
              social_media_score: '$company_info.social_media_score',
              owned_product_score: '$company_info.owned_product_score',
              team_detail_score: '$company_info.team_detail_score',
              job_opening_score: '$company_info.job_opening_score',
              funding_score: '$company_info.funding_score',
              revenue_score_score: '$company_info.revenue_score_score',
              investment_score: '$company_info.investment_score',
              faq_score: '$company_info.faq_score',
              holding_crypto_score: '$company_info.holding_crypto_score',
              profile_score: '$company_info.profile_score',
              updated_by: '$company_info.updated_by',
              updated_by_row_id: '$company_info.updated_by_row_id',
              updated_date_n_time: '$company_info.updated_date_n_time',
              updated_by_full_name: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$company_info.updated_by', 'user'] },
                      then: { $let: { vars: { userInfo: { $arrayElemAt: ['$updated_by_user_info', 0] } }, in: { $ifNull: ['$$userInfo.full_name', ''] } } },
                    },
                    {
                      case: { $eq: ['$company_info.updated_by', 'admin'] },
                      then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } },
                    },
                    {
                      case: { $eq: ['$company_info.updated_by', 'subadmin'] },
                      then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } },
                    },
                  ],
                  default: '',
                },
              },
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

/**
 * Ports the admin dashboard's live_company_partners stat (company.js's company_overview/overview,
 * Part 3 §7 Phase H step 3) — count of live, approved companies flagged as partners. Delegated
 * here from modules/company_admin/ per the confirmed domain-split principle. Ported verbatim.
 */
export function buildLiveCompanyPartnersCountPipeline() {
  return [
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { approval_status: 1, active_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ]
}

/**
 * Ports the admin dashboard's total_event_partners_sponsor stat.
 *
 * CONFIRMED BUG FIX: the real source's final stage was `$group: {_id: '$company_row_id', count:
 * {$sum:1}}` — grouping per company rather than counting the whole result set, so the "total"
 * returned to the client was actually just the FIRST company's own sponsor count (the first
 * element of the grouped array), not a true sum across all companies. Confirmed identical in both
 * company_overview and overview via a full byte-level diff before porting. Fixed to a real
 * `$count`, matching every other "total_*" field's shape in this dashboard.
 */
export function buildEventPartnersSponsorTotalPipeline() {
  return [
    {
      $lookup: {
        from: 'cln_events',
        localField: 'event_row_id',
        foreignField: '_id',
        as: 'event_info',
        pipeline: [{ $match: { active_status: 1, approval_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$event_info' } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { account_type: '$account_type', registered_type: '$registered_type', user_company_row_id: '$user_company_row_id' },
        as: 'company_info',
        pipeline: [
          {
            $match: {
              $and: [
                { approval_status: 1, active_status: 1 },
                { $expr: { $and: [{ $eq: [2, '$$account_type'] }, { $eq: [1, '$$registered_type'] }, { $eq: ['$_id', '$$user_company_row_id'] }] } },
              ],
            },
          },
          {
            $lookup: {
              from: 'cln_professionals',
              localField: 'user_row_id',
              foreignField: '_id',
              as: 'user_info',
              pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1, login_status: 1 } }],
            },
          },
          { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
          { $set: { login_status: { $cond: { if: '$user_info', then: '$user_info.login_status', else: 1 } } } },
          { $match: { login_status: 1 } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ]
}
