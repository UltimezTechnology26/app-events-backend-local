// modules/company/company.discovery.ts
//
// Public company-discovery endpoints (popular / trending / search), relocated
// verbatim from services/company/front_page.ts (Part 3 §7 Phase H step 13).
// No behavior change — same pipelines, same cache keys/TTLs, same response
// shapes. Diffed against the pre-move baseline via the characterization
// harness (scripts/characterization) before/after this move.
import redisCache, { CacheDuration } from '../../../config/redis'
import logger from '../../../config/logger'

const companyM = require('../../../models/app/company/companyM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const companyBusinessModelsM = require('../../../models/app/static/company_business_modelsM')

export const getPopularCompanies = async () => {
    try {
        const key = 'app_popular_companies';
        const cache_response = await redisCache.getCache({ key: key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true
            };
        }

        const result = await companyM.aggregate([
            {
                $match: {
                    approval_status: 1,
                    active_status: 1,
                    business_model_id: { $exists: true, $ne: null }
                }
            },
            {
                $unwind: "$business_model_id"
            },
            {
                $group: {
                    _id: "$business_model_id",
                    companyCount: { $sum: 1 }
                }
            },
            { $sort: { companyCount: -1 } },
            { $limit: 4 },
            {
                $lookup: {
                    from: "cln_static_company_business_models",
                    localField: "_id",
                    foreignField: "_id",
                    as: "businessModelDetails",
                    pipeline: [
                        { $match: { active_status: true } },
                        { $project: { _id: 1, business_name: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$businessModelDetails", preserveNullAndEmptyArrays: false } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    let: { businessId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$approval_status", 1] },
                                        { $eq: ["$active_status", 1] },
                                        {
                                            $or: [
                                                { $eq: ["$main_business_model_id", "$$businessId"] },
                                                {
                                                    $cond: {
                                                        if: { $isArray: "$business_model_id" },
                                                        then: { $in: ["$$businessId", "$business_model_id"] },
                                                        else: { $eq: ["$business_model_id", "$$businessId"] }
                                                    }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_company_followers",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "followers",
                                pipeline: [
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "userInfo",
                                            pipeline: [
                                                { $match: { login_status: 1 } },
                                                { $project: { _id: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$userInfo" } },
                                    { $group: { _id: "$company_row_id", count: { $sum: 1 } } }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                followers_count: {
                                    $ifNull: [{ $arrayElemAt: ["$followers.count", 0] }, 0]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_countries",
                                localField: "country_id",
                                foreignField: "_id",
                                as: "countryInfo",
                                pipeline: [
                                    { $project: { country_name: 1, country_flag: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$countryInfo", preserveNullAndEmptyArrays: true } },
                        // Stage 7c: Sort by followers and limit to top 2
                        { $sort: { followers_count: -1, _id: 1 } },
                        { $limit: 2 },
                        {
                            $project: {
                                _id: 1,
                                company_name: 1,
                                company_id: 1,
                                company_email_id: 1,
                                company_logo: 1,
                                followers_count: 1,
                                describe_in_one_line: 1,
                                company_location: 1,
                                city: 1,
                                state: 1,
                                country_name: "$countryInfo.country_name",
                                country_flag: "$countryInfo.country_flag"
                            }
                        }
                    ],
                    as: "topCompanies"
                }
            },
            {
                $project: {
                    business_model_name: "$businessModelDetails.business_name",
                    topCompanies: 1,
                    companyCount: 1
                }
            }
        ])

        // Set cache asynchronously (non-blocking)
        redisCache.setCache({ key: key, value: result, ttl: CacheDuration.TWELVE_HOURS })
            .catch((err: Error) => logger.error(`Cache set error. ${err.message}`));

        return {
            status: true,
            message: result,
            cache_response_status: false
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        logger.error(`Popular companies. ${errorMessage}`);

        // Return appropriate error response
        return {
            status: false,
            message: 'An error occurred while fetching popular companies',
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        };
    }
}

export const getTrendingCompanies = async (user_row_id: number, skip: number, limit: number) => {
    try {
        // Input validation
        if (skip < 0) skip = 0;
        if (limit <= 0 || limit > 100) limit = 10; // Prevent excessive limits

        const key = `app_trending_companies_${user_row_id}_${skip}_${limit}`;
        const cache_response = await redisCache.getCache({ key: key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true
            };
        }

        const result = await companyM.aggregate([
            {
                $match: {
                    approval_status: 1,
                    active_status: 1,
                }
            },
            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "inner_user_info",
                                pipeline: [
                                    {
                                        $match: { login_status: 1 }
                                    },
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$inner_user_info" } },
                        {
                            $group: {
                                _id: "$company_row_id",
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    followers_count: {
                        $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0]
                    }
                }
            },
            { $sort: { followers_count: -1, _id: 1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    company_id: 1,
                    company_name: 1,
                    company_logo: 1,
                    company_valuation: 1,
                    country_id: 1,
                    followers_count: 1,
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },

                }
            }
        ]);

        // Set cache asynchronously (non-blocking)
        redisCache.setCache({ key: key, value: result, ttl: CacheDuration.THIRTY_MINUTES })
            .catch((err: Error) => logger.error(`Cache set error. ${err.message}`));

        return {
            status: true,
            message: result,
            cache_response_status: false
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        logger.error(`Trending companies. ${errorMessage}`);

        return {
            status: false,
            message: 'An error occurred while fetching trending companies',
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        };
    }
}

export const searchCompanies = async (search: string, limit: number) => {
    try {
        // Input validation
        if (!search || typeof search !== 'string' || search.trim().length === 0) {
            return {
                status: false,
                message: []
            };
        }

        // Limit validation
        if (!limit || limit <= 0 || limit > 100) {
            limit = 10;
        }

        const key = `app_search_companies_${search}_${limit}`;
        const cache_response = await redisCache.getCache({ key: key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true
            };
        }

        // Optimized search with proper indexing
        let search_query = [
            { active_status: 1, approval_status: 1 },
            {
                $or: [
                    { company_id: { $regex: search, $options: "i" } },
                    { company_name: { $regex: search, $options: "i" } },

                ],
            },
        ];

        const result = await companyM
            .find(
                { $and: search_query },
                {
                    _id: 1,
                    company_id: 1,
                    company_name: 1,
                    company_logo: 1,
                    country_id: 1,
                    company_valuation: 1,
                    view_counts: 1
                }
            )
            .sort({ _id: -1 })
            .limit(limit)
        redisCache.setCache({ key: key, value: result, ttl: CacheDuration.THIRTY_MINUTES })
            .catch((err: Error) => logger.error(`Cache set error. ${err.message}`));

        return {
            status: true,
            message: result,
            cache_response_status: false
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        logger.error(`Search companies. ${errorMessage}`);

        return {
            status: false,
            message: [],
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        };
    }
}

/**
 * Paginated list of companies with any social link populated (twitter/
 * facebook/linkedin/etc). No confirmed frontend caller in either repo audited
 * during this engagement, but kept live in its natural home rather than a
 * separate "dead code" file — per the FINAL PHASE decision, this route's URL
 * may still be depended on by a consumer outside those two repos.
 */
export const twitterList = async (skipParam: any, limitParam: any) => {
    const skip = !Number.isNaN(Number.parseInt(skipParam)) ? Number.parseInt(skipParam) : 0
    const limit = !Number.isNaN(Number.parseInt(limitParam)) ? Number.parseInt(limitParam) : 100

    const get_query = await company_social_linksM.aggregate([
        {
            $match: {
                $or: [
                    { twitter: { $exists: true, $ne: "" } },
                    { facebook: { $exists: true, $ne: "" } },
                    { linkedin: { $exists: true, $ne: "" } },
                    { instagram: { $exists: true, $ne: "" } },
                    { telegram: { $exists: true, $ne: "" } },
                    { medium: { $exists: true, $ne: "" } },
                    { reddit: { $exists: true, $ne: "" } },
                    { feed_url: { $exists: true, $ne: "" } }
                ]
            }
        },
        {
            $lookup:
            {
                from: "cln_company_lists",
                localField: "company_row_id",
                foreignField: "_id",
                as: "info_company",
                pipeline: [
                    {
                        $match: { approval_status: 1, active_status: 1, company_id: { $exists: true, $ne: "" } }
                    },
                    {
                        $project: {
                            _id: 0,
                            company_id: 1,
                            company_name: 1,
                            company_logo: 1
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$info_company" } },
        {
            $project: {
                _id: 0,
                company_id: "$info_company.company_id",
                company_name: "$info_company.company_name",
                company_logo: "$info_company.company_logo",
                company_row_id: 1,
                twitter: 1,
                facebook: 1,
                linkedin: 1,
                instagram: 1,
                telegram: 1,
                medium: 1,
                reddit: 1,
                feed_url: 1
            }
        }
    ]).skip(skip).limit(limit)

    const count_query = await company_social_linksM.aggregate([
        {
            $match: {
                $or: [
                    { twitter: { $exists: true, $ne: "" } },
                    { facebook: { $exists: true, $ne: "" } },
                    { linkedin: { $exists: true, $ne: "" } },
                    { instagram: { $exists: true, $ne: "" } },
                    { telegram: { $exists: true, $ne: "" } },
                    { medium: { $exists: true, $ne: "" } },
                    { reddit: { $exists: true, $ne: "" } },
                    { feed_url: { $exists: true, $ne: "" } }
                ]
            }
        },
        {
            $lookup:
            {
                from: "cln_company_lists",
                localField: "company_row_id",
                foreignField: "_id",
                as: "info_company",
                pipeline: [
                    {
                        $match: { approval_status: 1, active_status: 1, company_id: { $exists: true, $ne: "" } }
                    },
                    {
                        $project: {
                            _id: 0,
                            company_id: 1
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$info_company" } },
        {
            $count: 'count'
        }
    ])

    let total_counts = 0
    if (count_query[0]) {
        total_counts = count_query[0].count
    }

    return { status: true, message: get_query, count: total_counts }
}

/**
 * Per-business-model company counts (top 4 + the rest). No confirmed frontend
 * caller in either repo audited during this engagement — kept live in its
 * natural home rather than a separate "dead code" file, same rationale as
 * twitterList above.
 */
export const uniqueBusinessModels = async () => {
    const unique = await companyM.distinct("main_business_model_id");

    const businessModelPromises = unique.map(async (i: any) => {
        const checkActive = await companyBusinessModelsM.findOne({ _id: i, active_status: true }, { business_name: 1, _id: 0 });
        if (checkActive) {
            const count = await companyM.countDocuments({ main_business_model_id: i })
            return { main_business_id: i, main_business_name: checkActive.business_name, count }
        }
        return null
    })

    let myArr = (await Promise.all(businessModelPromises)).filter((item: any) => item !== null)

    myArr.sort((a: any, b: any) => b.count - a.count)

    return { status: true, message: myArr.slice(0, 4), other_array: myArr.slice(4) }
}
