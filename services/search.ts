
import logger from '../config/logger';
import professionalsM from '../models/app/professionalsM';
import companyM from '../models/app/company/companyM';
import eventM from '../models/app/events/eventM';
import sanitize from 'mongo-sanitize';
import redisCache, { CacheDuration } from "../config/redis";
import { getPositionResolutionStages } from '../src/modules/work-experience/work-experience.queries';
import { joinPositionNamesExpr } from '../src/modules/funding/funding.queries';

/**
 * Builds the $lookup stage resolving a professional's latest public work
 * experience for getSearchDetails' global people-search results.
 * Previously only resolved position via cln_static_professionals_work_positions
 * — no cln_manual_user_positions fallback at all, and no positions[] array
 * support (worse than the report_list_type sections in linkPageServices.ts,
 * which at least had partial manual support before their own fix). Now uses
 * getPositionResolutionStages() to resolve the full positions[] array (both
 * static + manual sources) and joins multiple resolved names into one display
 * string via joinPositionNamesExpr, mirroring the fix already applied to
 * modules/funding/funding.queries.ts's richProfessionalNestedLookups and
 * services/app/linkPageServices.ts's equivalent nested lookups. Extracted as a
 * pure, exported function so it's independently testable.
 */
export function buildGlobalSearchWorkExperienceLookup(): any {
    return {
        $lookup: {
            from: "cln_professionals_work_experiences",
            localField: "_id",
            foreignField: "user_row_id",
            pipeline: [
                { $match: { public_view: true, user_account_type: 1 } },
                { $sort: { start_date: -1 } },
                { $limit: 1 },

                // resolves the full positions[] array (both static + manual sources)
                // instead of a single position_row_id lookup.
                ...getPositionResolutionStages(),
                { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },

                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        let: {
                            company_type: '$company_type',
                            company_row_id: '$company_row_id'
                        },
                        as: "info_company",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$company_type'] },
                                            { $eq: ['$_id', "$$company_row_id"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    company_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_manual_retrievals",
                        let: {
                            company_type: '$company_type',
                            company_row_id: '$company_row_id'
                        },
                        as: "info_manual_company",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$company_type'] },
                                            { $eq: ['$_id', "$$company_row_id"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    company_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        position_name: "$resolved_position_name",
                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                    }
                },
            ],
            as: "info_work",
        }
    };
}

const getSearchDetails = async (search_value: string, search_type: string, user_row_id: number, checkUserToken: any) => {
    try {
        const isSearchEmpty = !search_value || search_value.trim() === '';
        const key = `search_global_api_${search_value || 'all'}_type_${search_type}_${user_row_id}`;


        const cache_response = await redisCache.getCache({ key: key });

        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_reponse_status: true
            };
        }

        if (Number.parseInt(search_type) === 1) {
            const now = new Date();
            const matchStage: any = {
                approval_status: 1,
                active_status: 1
            };

            if (search_value) {
                matchStage.$or = [
                    { event_title: { $regex: search_value, $options: 'i' } },
                    { event_tag: { $regex: search_value, $options: 'i' } }
                ];
            } else {
                const now = new Date();
                matchStage.$or = [
                    { start_date: { $gte: now } },
                    {
                        $and: [
                            { start_date: { $lte: now } },
                            { end_date: { $gte: now } }
                        ]
                    }
                ];
            }

            const event_query = await eventM.aggregate([
                { $match: matchStage },
                {
                    $facet: {
                        events: [
                            {
                                $lookup: {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    pipeline: [
                                        { $match: { login_status: { $ne: 1 } } },
                                        { $project: { _id: 1, login_status: 1 } }
                                    ],
                                    as: "user_info"
                                }
                            },
                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_company_lists",
                                    localField: "company_row_id",
                                    foreignField: "_id",
                                    pipeline: [
                                        { $match: { active_status: { $ne: 1 } } },
                                        { $project: { _id: 1, active_status: 1 } }
                                    ],
                                    as: "company_info"
                                }
                            },
                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                            {
                                $addFields: {
                                    company_active_status: {
                                        $ifNull: ["$company_info.active_status", 1]
                                    },
                                    login_status: {
                                        $ifNull: ["$user_info.login_status", 1]
                                    }
                                }
                            },
                            {
                                $match: {
                                    $or: [
                                        { login_status: 1, list_event_type: 1 },
                                        { company_active_status: 1, list_event_type: 2 },
                                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                                    ]
                                }
                            },
                            {
                                $project: {
                                    event_venue: 1,
                                    event_title: 1,
                                    event_image: 1,
                                    event_url: 1,
                                    event_tag: 1,
                                    event_type: 1,
                                    start_date: 1,
                                    end_date: 1,
                                    event_city: 1,
                                    event_state: 1
                                }
                            },
                            { $sort: { start_date: 1 } },
                            { $limit: 5 }
                        ]
                    }
                },
                { $unwind: "$events" },
                { $replaceRoot: { newRoot: "$events" } }
            ]);

            if (isSearchEmpty) {
                await redisCache.setCache({ key: key, value: { events: event_query }, ttl: CacheDuration.THIRTY_MINUTES });
            }

            return {
                status: true,
                message: { events: event_query },
                cache_reponse_status: false
            };

        } else if (Number.parseInt(search_type) === 2) {
            const baseMatchStage: any = {
                approval_status: 1,
                active_status: 1
            };

            if (search_value) {
                baseMatchStage.$or = [
                    { company_name: { $regex: search_value, $options: 'i' } },
                    { company_id: { $regex: search_value, $options: 'i' } }
                ];
            }


            const company_query = await companyM.aggregate([
                { $match: baseMatchStage },
                {
                    $facet: {
                        companies: [
                            {
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "main_business_model_id",
                                    foreignField: "_id",
                                    as: "main_business_info",
                                    pipeline: [{ $project: { business_name: 1 } }]
                                }
                            },
                            {
                                $addFields: {
                                    main_business_model_name: {
                                        $arrayElemAt: ["$main_business_info.business_name", 0]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_company_followers",
                                    let: { company_id: "$_id" },
                                    pipeline: [
                                        { $match: { $expr: { $eq: ["$company_row_id", "$$company_id"] } } },
                                        {
                                            $lookup: {
                                                from: "cln_professionals",
                                                localField: "user_row_id",
                                                foreignField: "_id",
                                                pipeline: [
                                                    { $match: { login_status: 1 } },
                                                    { $project: { _id: 1 } }
                                                ],
                                                as: "inner_user_info"
                                            }
                                        },
                                        {
                                            $match: {
                                                $expr: { $gt: [{ $size: "$inner_user_info" }, 0] }
                                            }
                                        }
                                    ],
                                    as: "followers_info"
                                }
                            },
                            {
                                $addFields: {
                                    total_followers: { $size: "$followers_info" }
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
                                $group: {
                                    _id: "$_id",
                                    company_name: { $first: "$company_name" },
                                    company_id: { $first: "$company_id" },
                                    company_logo: { $first: "$company_logo" },
                                    main_business_model_name: { $first: "$main_business_model_name" },
                                    total_followers: { $first: "$total_followers" },
                                    following_status: {
                                        $first: {
                                            $cond: {
                                                if: { $ifNull: ["$info_user_following", false] },
                                                then: 1,
                                                else: 0
                                            }
                                        }
                                    }
                                }
                            },
                            { $sort: { total_followers: -1, _id: -1 } },
                            { $limit: 5 }
                        ]
                    }
                },
                { $unwind: "$companies" },
                { $replaceRoot: { newRoot: "$companies" } }
            ]);

            await redisCache.setCache({ key: key, value: { companies: company_query }, ttl: CacheDuration.THIRTY_MINUTES });

            return {
                status: true,
                message: { companies: company_query },
                cache_reponse_status: false
            };

        } else if (Number.parseInt(search_type) === 3) {
            const baseMatchStage: any = {
                login_status: 1,
                approval_status: 1
            };

            if (search_value) {
                baseMatchStage.$or = [
                    { full_name: { $regex: search_value, $options: 'i' } },
                    { user_name: { $regex: search_value, $options: 'i' } }
                ];
            }

            const users_query = await professionalsM.aggregate([
                { $match: baseMatchStage },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                buildGlobalSearchWorkExperienceLookup(),
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        pipeline: [{ $project: { _id: 0, designation_name: 1 } }],
                        as: "designation_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        as: "followers"
                    }
                },
                {
                    $addFields: {
                        total_followers: { $size: "$followers" }
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }, { $project: { confirm_request_status: 1 } }],
                        as: "info_user_followed"
                    }
                },
                { $unwind: { path: "$info_user_followed", preserveNullAndEmptyArrays: true } },

                {
                    $project: {
                        user_name: 1,
                        full_name: 1,
                        pro_batch: 1,
                        designation_array: "$designation_info.designation_name",
                        profile_image: "$img_info.profile_image",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        user_followed_status: { $cond: { if: "$info_user_followed.confirm_request_status", then: "$info_user_followed.confirm_request_status", else: 0 } },
                        total_followers: 1
                    }
                },
                { $sort: { total_followers: -1 } },
                { $limit: 5 }
            ]);

            await redisCache.setCache({ key: key, value: { professionals: users_query }, ttl: CacheDuration.THIRTY_MINUTES });

            return {
                status: true,
                message: { professionals: users_query },
                checkUserToken: checkUserToken,
                cache_reponse_status: false
            };

        } else {
            return {
                status: false,
                message: { alert_message: 'Supplied invalid search type.' }
            };
        }
    } catch (error) {
        logger.error(`getSearchDetails - Error: ${error instanceof Error ? error.message : String(error)}`);
        return {
            status: false,
            message: { alert_message: 'Internal server error.' }
        };
    }
}

export { getSearchDetails };