// modules/company/company.individual.ts
//
// Public company-profile-by-slug lookup (getCompanyIndividualDetails), relocated
// verbatim from services/company/front_page.ts (Part 3 §7 Phase H step 13). No
// behavior change — same pipeline, same cache key/TTL, same response shape.
// Diffed against the pre-move baseline via the characterization harness
// (scripts/characterization) before/after this move.
import redisCache from '../../../config/redis'
import logger from '../../../config/logger'

const companyM = require('../../../models/app/company/companyM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')

// Raw shape written into `result` below: either the full aggregation row
// (spread wholesale from queryRun[0], whose fields are the ones listed in
// the `company_data` $project stage further down) or, on the "not found"
// path, just the alert/status fields. The index signature documents that
// the aggregation row's exact field set isn't re-declared here (it's
// already fully specified in the $project stage) rather than widening to
// `any`.
interface CompanyIndividualResult {
    _id?: number
    total_watchlists?: number
    total_followers?: number
    alert_message?: string
    account_status?: number
    [key: string]: unknown
}

const companyIndividualDetails = async ({ user_row_id, company_id }: { user_row_id: number, company_id: string }) => {
    let result: CompanyIndividualResult = {}
    const queryRun = await companyM.aggregate([
        // Early filtering with indexed fields
        { $match: { approval_status: 1, active_status: 1, company_id: company_id } },

        // User lookup with early filtering
        {
            $lookup: {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "user_info",
                pipeline: [
                    { $match: { login_status: 1 } },
                    { $project: { _id: 1, user_name: 1, full_name: 1, account_visible_type: 1, gender: 1, pro_batch: 1 } }
                ]
            }
        },
        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

        // Filter out users with invalid login status
        { $match: { $or: [{ user_info: { $exists: true } }, { user_info: { $eq: null } }] } },

        // Essential lookups only
        {
            $lookup: {
                from: "cln_company_seo_details",
                localField: "_id",
                foreignField: "company_row_id",
                as: "seo_details"
            }
        },
        { $unwind: { path: "$seo_details", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "cln_company_social_links",
                localField: "_id",
                foreignField: "company_row_id",
                as: "social_links"
            }
        },
        { $unwind: { path: "$social_links", preserveNullAndEmptyArrays: true } },

        {
            $lookup: {
                from: "cln_professionals_profile_images",
                localField: "user_row_id",
                foreignField: "user_row_id",
                as: "img_info"
            }
        },
        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },

        {
            $lookup: {
                from: "cln_company_created_by_admins",
                localField: "_id",
                foreignField: "company_row_id",
                as: "created_by_admin"
            }
        },
        { $unwind: { path: "$created_by_admin", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "cln_static_countries",
                localField: "country_mobile_id",
                foreignField: "_id",
                as: "country_info"
            }
        },
        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

        // Business model lookups
        {
            $lookup: {
                from: "cln_static_company_business_models",
                localField: "main_business_model_id",
                foreignField: "_id",
                as: "main_business_info",
                pipeline: [{ $project: { business_name: 1 } }]
            }
        },
        { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "cln_static_company_business_models",
                let: {
                    business_model_ids: "$business_model_id",
                    main_business_id: "$main_business_model_id"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $in: ["$_id", "$$business_model_ids"] },
                                    { $ne: ["$_id", "$$main_business_id"] }
                                ]
                            }
                        }
                    },
                    { $project: { business_name: 1 } }
                ],
                as: "business_info"
            }
        },
        {
            $lookup:
            {
                from: "cln_company_followers",
                localField: "_id",
                foreignField: "company_row_id",
                pipeline: [{ $match: { "user_row_id": user_row_id } }],
                as: "info_user_following"
            }
        },
        { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
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

        // Optimized count aggregations with parallel processing
        {
            $facet: {
                "watchlist_count": [
                    {
                        $lookup: {
                            from: "cln_company_watchlists",
                            localField: "_id",
                            foreignField: "company_row_id",
                            as: "info_watchlists",
                            pipeline: [
                                {
                                    $lookup: {
                                        from: "cln_professionals",
                                        localField: "user_row_id",
                                        foreignField: "_id",
                                        as: "inner_user_info",
                                        pipeline: [
                                            { $match: { login_status: 1 } },
                                            { $project: { _id: 1 } }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$inner_user_info" } },
                                { $count: 'count' }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            total_watchlists: {
                                $cond: {
                                    if: { $gt: [{ $size: "$info_watchlists" }, 0] },
                                    then: { $arrayElemAt: ["$info_watchlists.count", 0] },
                                    else: 0
                                }
                            }
                        }
                    },
                    { $project: { total_watchlists: 1 } }
                ],
                "followers_count": [
                    {
                        $lookup: {
                            from: "cln_company_followers",
                            localField: "_id",
                            foreignField: "company_row_id",
                            as: "info_followers",
                            pipeline: [
                                {
                                    $lookup: {
                                        from: "cln_professionals",
                                        localField: "user_row_id",
                                        foreignField: "_id",
                                        as: "inner_user_info",
                                        pipeline: [
                                            { $match: { login_status: 1 } },
                                            { $project: { _id: 1 } }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$inner_user_info" } },
                                { $count: 'count' }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            total_followers: {
                                $cond: {
                                    if: { $gt: [{ $size: "$info_followers" }, 0] },
                                    then: { $arrayElemAt: ["$info_followers.count", 0] },
                                    else: 0
                                }
                            }
                        }
                    },
                    { $project: { total_followers: 1 } }
                ],
                "company_data": [
                    {
                        $project: {
                            _id: 1,
                            regularities_details: 1,
                            approval_status: 1,
                            company_name: 1,
                            company_id: 1,
                            company_logo: 1,
                            country_id: 1,
                            country_mobile_id: 1,
                            user_row_id: 1,
                            podcast_id: 1,
                            podcast_title: 1,
                            headquarter: 1,
                            website_link: 1,
                            contact_number: 1,
                            describe_in_one_line: 1,
                            company_location: 1,
                            city: 1,
                            state: 1,
                            longitude: 1,
                            latitude: 1,
                            company_valuation: 1,
                            company_size_row_id: 1,
                            investor_category_row_id: 1,
                            view_counts: 1,
                            main_business_model_id: 1,
                            business_model_id: 1,
                            established_in: 1,
                            company_email_id: 1,
                            nft_wallet_address: 1,
                            sub_admin_row_id: 1,
                            claim_status: 1,
                            updated_date_n_time: 1,
                            profile_scores: {
                                basic_details_score: "$basic_details_score",
                                seo_details_score: "$seo_details_score",
                                social_media_score: "$social_media_score",
                                owned_product_score: "$owned_product_score",
                                team_detail_score: "$team_detail_score",
                                job_opening_score: "$job_opening_score",
                                funding_score: "$funding_score",
                                revenue_score_score: "$revenue_score_score",
                                investment_score: "$investment_score",
                                faq_score: "$faq_score",
                                holding_crypto_score: "$holding_crypto_score",
                                profile_score: "$profile_score",
                            },
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            pro_batch: "$user_info.pro_batch",
                            account_visible_type: "$user_info.account_visible_type",
                            gender: "$user_info.gender",
                            profile_image: "$img_info.profile_image",
                            profile_image_type: "$img_info.profile_image_type",
                            country_code: "$country_info.country_code",
                            country_name: "$country_info.country_name",
                            main_business_model_name: "$main_business_info.business_name",
                            business_name_list: "$business_info",
                            social_links: {
                                facebook: { $cond: { if: "$social_links.facebook", then: "$social_links.facebook", else: "" } },
                                twitter: { $cond: { if: "$social_links.twitter", then: "$social_links.twitter", else: "" } },
                                linkedin: { $cond: { if: "$social_links.linkedin", then: "$social_links.linkedin", else: "" } },
                                instagram: { $cond: { if: "$social_links.instagram", then: "$social_links.instagram", else: "" } },
                                telegram: { $cond: { if: "$social_links.telegram", then: "$social_links.telegram", else: "" } },
                                medium: { $cond: { if: "$social_links.medium", then: "$social_links.medium", else: "" } },
                                reddit: { $cond: { if: "$social_links.reddit", then: "$social_links.reddit", else: "" } },
                                other_social_links: { $cond: { if: "$social_links.other_social_links", then: "$social_links.other_social_links", else: "" } },
                                youtube_channel: "$social_links.youtube_channel",
                                feed_url: { $cond: { if: "$social_links.feed_url", then: "$social_links.feed_url", else: "" } },
                                video_link: { $cond: { if: "$social_links.video_link", then: "$social_links.video_link", else: "" } },
                            },
                            feed_url: { $cond: { if: "$social_links.feed_url", then: "$social_links.feed_url", else: "" } },
                            seo_details: {
                                meta_title: "$seo_details.meta_title",
                                meta_keywords: "$seo_details.meta_keywords",
                                meta_description: "$seo_details.meta_description",
                                robots_index: "$seo_details.robots_index",
                                robots_follow: "$seo_details.robots_follow",
                                og_title: "$seo_details.og_title",
                                og_description: "$seo_details.og_description",
                                twitter_title: "$seo_details.twitter_title",
                                twitter_description: "$seo_details.twitter_description",
                                twitter_creator: "$seo_details.twitter_creator",
                            },
                            about_company: "$about_company",
                            watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                            following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } }
                        }
                    }
                ]
            }
        },
        // Combine the facet results
        {
            $project: {
                company_data: { $arrayElemAt: ["$company_data", 0] },
                total_watchlists: { $arrayElemAt: ["$watchlist_count.total_watchlists", 0] },
                total_followers: { $arrayElemAt: ["$followers_count.total_followers", 0] }
            }
        },
        // Merge the final document
        {
            $replaceRoot: {
                newRoot: {
                    $mergeObjects: [
                        "$company_data",
                        { total_watchlists: { $ifNull: ["$total_watchlists", 0] } },
                        { total_followers: { $ifNull: ["$total_followers", 0] } }
                    ]
                }
            }
        }
    ]).limit(1)

    const company_row_id = queryRun[0]._id;
    if (queryRun[0] && company_row_id) {
        result = queryRun[0];

        // Optimized array access with null checks
        result['total_watchlists'] = result.total_watchlists || 0;
        result['total_followers'] = result.total_followers || 0;

        // Async view count update (non-blocking)
        companyM.updateOne({ _id: company_row_id }, { $inc: { view_counts: 1 } }).catch((err: unknown) => {
            logger.error(`Update company view count. ${err instanceof Error ? err.message : String(err)}`);
        });

        return { status: true, message: result };
    }
    else {
        result['alert_message'] = 'This company account is not valid.';
        result['account_status'] = 0;

        // Optimized parallel queries for status checking
        const [statusQuery, deleteQuery] = await Promise.all([
            companyM.aggregate([
                { $match: { approval_status: 1 } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            { $project: { _id: 1, login_status: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                    }
                },
                {
                    $match: {
                        $and: [
                            { company_id: company_id },
                            {
                                $or: [
                                    { login_status: 0 },
                                    { active_status: 0 }
                                ]
                            }
                        ]
                    }
                }
            ]).limit(1).collation({ locale: 'en', strength: 2 }),

            company_deleted_historyM.findOne(
                { company_id: company_id, approval_status: 1 },
                { _id: 1 }
            ).collation({ locale: 'en', strength: 2 })
        ]);

        if (statusQuery[0]) {
            result['account_status'] = 1;
            result['alert_message'] = 'This company account is disabled.';
        }
        else if (deleteQuery) {
            result['account_status'] = 2;
            result['alert_message'] = 'This company account is deleted.';
        }

        return { status: false, message: result };
    }
}

export const getCompanyIndividualDetails = async ({ user_row_id, company_id }: { user_row_id: number, company_id: string }) => {
    try {
        const key = `app_company_individual_details_${company_id}_${user_row_id}`;

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_reponse_status: true
            };
        }

        const { status, message } = await companyIndividualDetails({ user_row_id, company_id });
        if (status) {
            await redisCache.setCache({
                key,
                value: message,
                ttl: 1800 // 30 minutes
            });
            return { status: true, message, cache_reponse_status: false };
        } else {
            return { status: false, message, cache_reponse_status: false };
        }
    } catch (error) {
        logger.error(`Company individual details. ${(error as Error).message}`);
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            cache_reponse_status: false
        };
    }
}
