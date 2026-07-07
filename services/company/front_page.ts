const company_revenue_growthM = require("../../models/app/company/company_revenue_growthM");
const eventM = require("../../models/app/events/eventM");
const fundingM = require("../../models/app/funding/fundingInvestmentM");
const jobsM = require("../../models/app/jobs/jobsM");
import added_to_partnersM from "../../models/app/company/added_to_partnersM";
import { filterTokens, getCompanyProducts, getMatchedProducts, getTokenList } from "../../utils/helpers/app_helper";
import { array_column, company_profile_completed_percentage, getMinusDates } from "../../utils/helpers/helper";
import redisCache, { CacheDuration } from "../../config/redis";
import company_deleted_historyM from "../../models/app/company/company_deleted_historyM";
import company_faqM from "../../models/app/company/company_faqM";
import professionals_work_experienceM from "../../models/app/professionals_work_experienceM";
import employees_requestsM from "../../models/app/company/employees_requestsM";
import company_productsM from "../../models/markets/products_n_holding/company_productsM";
import company_holdingM from "../../models/markets/products_n_holding/company_holdingM";
import { getEventsData, professionalfilterQuery } from "../../utils/helpers/events_helper";
import event_sponsors_partner_detailsM from "../../models/app/events/event_sponsors_partner_detailsM";

// Import required dependencies
const { getIntValues, getDistanceFromLatLon } = require('../../utils/helpers/helper');
const countryM = require('../../models/app/static/countryM');
const companyM = require('../../models/app/company/companyM');
const sanitize = require('mongo-sanitize');

interface CountryDocument {
    _id: number;
    country_name: string;
    country_flag: string;
    sortname: string;
    country_code: string;
}

interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

interface CompanyListParams {
    report_list_type: number;
    query: any;
    skip: number;
    limit: number;
    user_row_id: any;
    sort_filter: any;
    match_query: any;
    boundingBox?: BoundingBox | null;
}

const companyList = async ({ report_list_type, query, skip, limit, user_row_id, sort_filter, match_query, boundingBox }: CompanyListParams) => {

    if (report_list_type === 1) {

        const get_query = companyM.aggregate([

            {
                $match: {
                    approval_status: 1,
                    active_status: 1
                }
            },
            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            ...(boundingBox ? [{
                $match: {
                    lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                    lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                }
            }] : []),
            sort_filter,
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: { $ne: 1 } } },
                        { $project: { _id: 1, login_status: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $addFields: {
                    login_status: {
                        $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 }
                    }
                }
            },
            {
                $match: { login_status: 1 }
            },

            {
                $lookup: {
                    from: "cln_static_company_business_models",
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
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
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            { $match: query },

            { $skip: skip },
            { $limit: limit },

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
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$inner_user_info" },
                        { $count: "count" }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_events",
                    let: { companyId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$company_row_id", "$$companyId"] },
                                        { $eq: ["$active_status", 1] },
                                        { $eq: ["$approval_status", 1] },
                                        { $gt: ["$company_row_id", 0] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total_events: { $sum: 1 }
                            }
                        }
                    ],
                    as: "event_info"
                }
            },

            {
                $addFields: {
                    total_events: {
                        $ifNull: [{ $arrayElemAt: ["$event_info.total_events", 0] }, 0]
                    }
                }
            },
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "_id",
                    foreignField: "user_company_row_id",
                    as: "info_sponsor",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 1,
                                account_type: 2,
                                registered_type: 1
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "info_event",
                                pipeline: [
                                    {
                                        $match: {
                                            active_status: 1,
                                            approval_status: 1,
                                            list_event_type: { $in: [1, 2, 3] }
                                        }
                                    },
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                {
                                                    $project: {
                                                        login_status: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        $unwind: {
                                            path: "$user_info",
                                            preserveNullAndEmptyArrays: true
                                        }
                                    },

                                    {
                                        $lookup: {
                                            from: "cln_company_lists",
                                            localField: "company_row_id",
                                            foreignField: "_id",
                                            as: "company_info",
                                            pipeline: [
                                                {
                                                    $project: {
                                                        active_status: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        $unwind: {
                                            path: "$company_info",
                                            preserveNullAndEmptyArrays: true
                                        }
                                    },

                                    {
                                        $addFields: {
                                            company_active_status: {
                                                $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 }
                                            },
                                            login_status: {
                                                $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
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

                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$info_event" },
                        { $count: "count" }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "_id",
                    foreignField: "user_company_row_id",
                    as: "info_partner",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 2,
                                account_type: 2,
                                registered_type: 1
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "info_event",
                                pipeline: [
                                    {
                                        $match: {
                                            active_status: 1,
                                            approval_status: 1,
                                            list_event_type: { $in: [1, 2, 3] }
                                        }
                                    },
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                { $match: { login_status: { $ne: 1 } } },
                                                { $project: { login_status: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                                    {
                                        $lookup: {
                                            from: "cln_company_lists",
                                            localField: "company_row_id",
                                            foreignField: "_id",
                                            as: "company_info",
                                            pipeline: [
                                                { $match: { active_status: { $ne: 1 } } },
                                                { $project: { active_status: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                                    {
                                        $addFields: {
                                            company_active_status: {
                                                $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 }
                                            },
                                            login_status: {
                                                $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
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
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$info_event" },
                        { $count: "count" }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { companyId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        { $toInt: "$funds_raised_company_row_id" },
                                        "$$companyId"
                                    ]
                                },
                                funds_raised_registered_type: 1,
                                verified_status: 1
                            }
                        },

                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    it: "$investor_type",
                                    irt: "$investor_registered_type",
                                    iid: "$investor_row_id"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [2, "$$it"] },
                                                            { $eq: [1, "$$irt"] },
                                                            { $eq: ["$_id", "$$iid"] }
                                                        ]
                                                    }
                                                },
                                                { active_status: 1 }
                                            ]
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ],
                                as: "company_info"
                            }
                        },

                        {
                            $addFields: {
                                company_investor_id: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$company_info._id", 0] },
                                        0
                                    ]
                                }
                            }
                        },

                        {
                            $addFields: {
                                investor_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ["$investor_type", 2] },
                                                        { $eq: ["$investor_registered_type", 1] }
                                                    ]
                                                },
                                                then: "$company_investor_id"
                                            }
                                        ],
                                        default: "$investor_row_id"
                                    }
                                }
                            }
                        },

                        { $match: { investor_data: { $gt: 0 } } },

                        // Collapse to one document per round_id BEFORE the final group, so a
                        // multi-investor round's shared amount is counted once instead of once
                        // per investor row. category_row_id is kept via $first since it's the
                        // same across every row in a round.
                        {
                            $group: {
                                _id: "$round_id",
                                funds_raised_company_row_id: { $first: "$funds_raised_company_row_id" },
                                amount: { $first: "$amount" },
                                category_row_id: { $first: "$category_row_id" },
                                investor_identities: {
                                    $push: {
                                        investor_row_id: "$investor_row_id",
                                        investor_type: "$investor_type",
                                        investor_registered_type: "$investor_registered_type"
                                    }
                                }
                            }
                        },

                        // Final group back to one document per company. round_ids now counts
                        // distinct ROUNDS (not round types). category_ids is kept for the
                        // funding_rounds name lookup below. funds_raised_ids flattens the
                        // per-round investor identities collected above into one set, since
                        // total_funds_raised_companies should still reflect every distinct
                        // investor across all of this company's rounds.
                        {
                            $group: {
                                _id: "$funds_raised_company_row_id",
                                total_funds_raised_amount: { $sum: "$amount" },
                                round_ids: { $addToSet: "$_id" },
                                category_ids: { $addToSet: "$category_row_id" },
                                funds_raised_ids: { $push: "$investor_identities" }
                            }
                        },

                        // Flatten the per-round investor-identity arrays into one set of
                        // distinct investors across all rounds.
                        {
                            $addFields: {
                                funds_raised_ids: {
                                    $reduce: {
                                        input: "$funds_raised_ids",
                                        initialValue: [],
                                        in: { $setUnion: ["$$value", "$$this"] }
                                    }
                                }
                            }
                        },

                        {
                            $lookup: {
                                from: "cln_static_company_funding_rounds",
                                localField: "category_ids",
                                foreignField: "_id",
                                as: "funding_rounds",
                                pipeline: [
                                    { $project: { category_name: 1 } }
                                ]
                            }
                        }

                    ],
                    as: "funding_info"
                }
            },

            {
                $addFields: {
                    funding_data: { $arrayElemAt: ["$funding_info", 0] }
                }
            },

            {
                $addFields: {
                    total_funds_raised_companies: {
                        $size: { $ifNull: ["$funding_data.funds_raised_ids", []] }
                    },
                    total_funds_raised_rounds: {
                        $size: { $ifNull: ["$funding_data.round_ids", []] }
                    },
                    funds_raised_rounds: {
                        $ifNull: ["$funding_data.funding_rounds.category_name", []]
                    },
                    total_funds_raised_amount: {
                        $ifNull: ["$funding_data.total_funds_raised_amount", 0]
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { investorId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$investor_row_id", "$$investorId"] },
                                investor_type: 2,
                                investor_registered_type: 1,
                                verified_status: 1
                            }
                        },

                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    fr_reg_type: "$funds_raised_registered_type",
                                    fr_company_id: "$funds_raised_company_row_id"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$$fr_reg_type", 1] },
                                                            { $eq: ["$_id", "$$fr_company_id"] }
                                                        ]
                                                    }
                                                },
                                                { active_status: 1 }
                                            ]
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ],
                                as: "recipient_company"
                            }
                        },

                        {
                            $addFields: {
                                recipient_ok: {
                                    $cond: [
                                        { $eq: ["$funds_raised_registered_type", 1] },
                                        { $gt: [{ $size: "$recipient_company" }, 0] },
                                        true
                                    ]
                                }
                            }
                        },

                        { $match: { recipient_ok: true } },

                        // Self-lookup: count how many total rows (across all investors) share
                        // this row's round_id, to detect syndicate (multi-investor) rounds.
                        {
                            $lookup: {
                                from: "cln_funding_investment_lists",
                                let: { round_id: "$round_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ["$round_id", "$$round_id"] }
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ],
                                as: "round_investor_rows"
                            }
                        },

                        // Exclude syndicate rounds (more than 1 investor sharing round_id) —
                        // same rule already applied to investor_overview and investment_graph:
                        // syndicate amounts are excluded entirely, not deduped-and-included,
                        // since this investor's individual contribution isn't known.
                        {
                            $match: {
                                $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                            }
                        },

                        {
                            $group: {
                                _id: "$investor_row_id",
                                total_invested_amount: { $sum: "$amount" },
                                round_ids: { $addToSet: "$round_id" },
                                category_ids: { $addToSet: "$category_row_id" },
                                funds_raised_ids: { $addToSet: "$funds_raised_company_row_id" }
                            }
                        }
                    ],
                    as: "investments_agg"
                }
            },

            {
                $lookup: {
                    from: "cln_static_company_funding_rounds",
                    let: {
                        category_ids: {
                            $ifNull: [{ $arrayElemAt: ["$investments_agg.category_ids", 0] }, []]
                        }
                    },
                    pipeline: [
                        { $match: { $expr: { $in: ["$_id", "$$category_ids"] } } },
                        { $project: { category_name: 1 } }
                    ],
                    as: "invested_rounds"
                }
            },

            {
                $addFields: {
                    total_invested_amount: {
                        $ifNull: [{ $arrayElemAt: ["$investments_agg.total_invested_amount", 0] }, 0]
                    },
                    total_invested_rounds: {
                        $size: {
                            $ifNull: [{ $arrayElemAt: ["$investments_agg.round_ids", 0] }, []]
                        }
                    },
                    total_invested_companies: {
                        $size: {
                            $ifNull: [{ $arrayElemAt: ["$investments_agg.funds_raised_ids", 0] }, []]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "cln_company_revenue_details",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "revenue_info",
                    pipeline: [
                        { $sort: { year: -1, quarter: -1 } },

                        {
                            $group: {
                                _id: "$company_row_id",
                                pushed_data: {
                                    $push: {
                                        $cond: [
                                            { $lt: ["$quarter", 5] },
                                            {
                                                year: "$year",
                                                quarter: "$quarter",
                                                revenue: "$revenue"
                                            },
                                            "$$REMOVE"
                                        ]
                                    }
                                },
                                total_revenue: { $sum: "$revenue" }
                            }
                        },

                        {
                            $project: {
                                total_revenue: 1,
                                revenue_growth: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: [{ $size: "$pushed_data" }, 2] },
                                                { $ne: [{ $arrayElemAt: ["$pushed_data.revenue", 1] }, 0] }
                                            ]
                                        },
                                        {
                                            $multiply: [
                                                {
                                                    $divide: [
                                                        {
                                                            $subtract: [
                                                                { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                                                { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                            ]
                                                        },
                                                        { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                    ]
                                                },
                                                100
                                            ]
                                        },
                                        0
                                    ]
                                }
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$revenue_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_products",
                    let: { companyId: "$_id" },
                    as: "products_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$company_row_id", "$$companyId"] },
                                company_type: 1
                            }
                        },
                        {
                            $group: {
                                _id: "$company_row_id",
                                total_products: { $sum: 1 },
                                product_ids: {
                                    $addToSet: {
                                        register_type: "$register_type",
                                        product_type: "$product_type",
                                        product_row_id: "$product_row_id"
                                    }
                                }
                            }
                        },
                        { $project: { total_products: 1, product_ids: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$products_info", preserveNullAndEmptyArrays: true } },

            {
                $addFields: {
                    total_products: "$products_info.total_products",
                    product_ids: "$products_info.product_ids"
                }
            },
            {
                $lookup: {
                    from: "cln_company_holdings",
                    let: { companyId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$company_row_id", "$$companyId"] },
                                company_type: 1
                            }
                        },
                        {
                            $group: {
                                _id: "$company_row_id",
                                total_holdings: { $sum: "$purchased_value_in_usd" },
                                token_row_ids: {
                                    $addToSet: {
                                        $cond: [
                                            { $eq: ["$token_type", 1] },
                                            "$token_row_id",
                                            "$$REMOVE"
                                        ]
                                    }
                                },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { total_holdings: -1 } }
                    ],
                    as: "company_holdings"
                }
            },

            {
                $addFields: {
                    total_holdings: {
                        $ifNull: [{ $arrayElemAt: ["$company_holdings.total_holdings", 0] }, 0]
                    },
                    token_row_ids: {
                        $ifNull: [{ $arrayElemAt: ["$company_holdings.token_row_ids", 0] }, []]
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_jobs",
                    let: { companyId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$company_row_id", "$$companyId"] },
                                active_status: "active",
                                is_deleted: false
                            }
                        },
                        { $project: { job_title: 1 } },
                        { $sort: { createdAt: -1 } }
                    ],
                    as: "company_jobs"
                }
            },

            {
                $addFields: {
                    job_roles: {
                        $map: {
                            input: "$company_jobs",
                            as: "job",
                            in: "$$job.job_title"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    company_logo: 1,
                    established_in: 1,
                    describe_in_one_line: 1,
                    company_size_row_id: 1,
                    company_location: 1,
                    company_valuation: 1,

                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",

                    main_business_model_name: "$main_business_info.business_name",
                    business_name: "$business_info.business_name",

                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },

                    total_followers: {
                        $cond: {
                            if: { $gt: [{ $size: "$followers_info" }, 0] },
                            then: "$followers_info.count",
                            else: 0
                        }
                    },

                    total_events: 1,

                    // ⭐ MISSING EARLIER → NOW FIXED
                    total_sponsors: {
                        $ifNull: [
                            { $arrayElemAt: ["$info_sponsor.count", 0] },
                            0
                        ]
                    },

                    total_partners: {
                        $ifNull: [
                            { $arrayElemAt: ["$info_partner.count", 0] },
                            0
                        ]
                    },

                    total_funds_raised_companies: 1,
                    total_funds_raised_rounds: 1,
                    funds_raised_rounds: 1,
                    total_funds_raised_amount: 1,

                    total_invested_rounds: 1,
                    total_invested_amount: 1,

                    invested_rounds: {
                        $map: {
                            input: "$invested_rounds",
                            as: "r",
                            in: "$$r.category_name"
                        }
                    },

                    // 
                    total_revenue: "$revenue_info.total_revenue",
                    revenue_growth: "$revenue_info.revenue_growth",

                    // 
                    total_products: 1,
                    product_ids: 1,

                    // 
                    total_holdings: 1,
                    token_row_ids: 1,

                    job_roles: 1,

                    // Distance numeric conversion
                    lat_num: 1,
                    lon_num: 1,

                    latitude: 1,
                    longitude: 1
                }
            }

        ])


        const count_query = companyM.aggregate([
            { $match: { approval_status: 1, active_status: 1 } },
            { $match: query },
            { $count: "count" }
        ]);

        const [result1, result2] = await Promise.all([get_query, count_query]);

        const final_count = result2?.[0]?.count || 0;
        // =========================
        // 1. FETCH PRODUCTS
        // =========================
        const products_list: any[] = await getCompanyProducts(result1);

        // =========================
        // 2. ADD PRODUCTS TO result1 (PARALLEL)
        // =========================
        await Promise.all(
            result1.map(async (item: any) => {
                if (item.product_ids?.length) {
                    item.products = await getMatchedProducts(item.product_ids, products_list);
                }
            })
        );

        // =========================
        // 3. COLLECT TOKEN IDS
        // =========================
        const tokenIds: any[] = result1.flatMap((r: any) =>
            Array.isArray(r.token_row_ids) ? r.token_row_ids : []
        );

        // =========================
        // 4. FETCH TOKENS
        // =========================
        const token_list: any[] = await getTokenList({ token_ids: tokenIds });

        // =========================
        // 5. CREATE TOKEN MAP
        // =========================
        const tokenMap: Record<string, any> = Object.fromEntries(
            token_list.map((t: any) => [t._id?.toString(), t])
        );

        // =========================
        // 6. ADD TOKENS INTO result1
        // =========================
        result1.forEach((row: any) => {
            if (!row.token_row_ids) return;

            const tokens_list = row.token_row_ids
                .map((id: any) => tokenMap[id?.toString()])
                .filter(Boolean);

            const match = result1.find((r: any) => r._id == row._id);

            if (match) {
                match.tokens_list = tokens_list;
            }
        });
        return {
            list: result1,
            count: final_count
        };
    }

    else if (report_list_type === 2) {
        const basePipeline = [
            {
                $match: {
                    active_status: 1,
                    // end_date: { $gte: new Date(getPresentDateTime()) },
                    approval_status: 1,
                    company_row_id: { $gt: 0 },
                    ...match_query
                }
            },


            // : Early projection to reduce document size
            {
                $project: {
                    _id: 1,
                    company_row_id: 1,
                    // Only keep fields needed for grouping
                    event_id: '$_id'
                }
            },
            {
                $group: {
                    _id: "$company_row_id",
                    total_events: { $sum: 1 },
                    // Store sample event ID for potential later use
                    sample_event_id: { $first: '$_id' }
                }
            },
            sort_filter,
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                approval_status: 1,
                                active_status: 1
                            }
                        },
                        // : Early projection to reduce data transfer
                        {
                            $project: {
                                _id: 1,
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1,
                                latitude: 1,
                                longitude: 1,
                                user_row_id: 1
                            }
                        },
                        // : User lookup with minimal data
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: {
                                    $cond: {
                                        if: "$user_info",
                                        then: "$user_info.login_status",
                                        else: 1
                                    }
                                }
                            }
                        },
                        {
                            $match: {
                                login_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            // : Filter out companies without valid info
            {
                $match: {
                    company_info: { $ne: null }
                }
            },
            // : Use $addFields instead of multiple $set stages
            {
                $addFields: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude"
                }
            },

            // ✅ NEW: numeric lat/lon on company
            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$company_info.latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$company_info.longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },

            // : bounding box on company lat/lon
            ...(boundingBox
                ? [{
                    $match: {
                        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                    }
                }]
                : []),

            // 
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "_id",
                    foreignField: "user_company_row_id",
                    as: "info_sponsor",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 1,
                                account_type: 2,
                                registered_type: 1
                            }
                        },
                        // ✅ OPTIMIZED: Use $facet for parallel processing of event validation
                        {
                            $facet: {
                                valid_events: [
                                    {
                                        $lookup: {
                                            from: "cln_events",
                                            localField: "event_row_id",
                                            foreignField: "_id",
                                            as: "event_info",
                                            pipeline: [
                                                {
                                                    $match: {
                                                        active_status: 1,
                                                        approval_status: 1,
                                                        list_event_type: { $in: [1, 2, 3] }
                                                    }
                                                },
                                                // ✅ OPTIMIZED: Combined user and company lookups in single pipeline
                                                {
                                                    $lookup: {
                                                        from: "cln_professionals",
                                                        localField: "user_row_id",
                                                        foreignField: "_id",
                                                        as: "user_info",
                                                        pipeline: [
                                                            {
                                                                $match: { login_status: { $ne: 1 } }
                                                            },
                                                            {
                                                                $project: {
                                                                    _id: 1,
                                                                    login_status: 1
                                                                }
                                                            }
                                                        ]
                                                    }
                                                },
                                                {
                                                    $lookup: {
                                                        from: "cln_company_lists",
                                                        localField: "company_row_id",
                                                        foreignField: "_id",
                                                        as: "company_info",
                                                        pipeline: [
                                                            {
                                                                $match: { active_status: { $ne: 1 } }
                                                            },
                                                            {
                                                                $project: {
                                                                    _id: 1,
                                                                    active_status: 1
                                                                }
                                                            }
                                                        ]
                                                    }
                                                },
                                                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
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
                                                        _id: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: "$event_info" },
                                    {
                                        $match: {
                                            event_info: { $ne: null }
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                count: {
                                    $size: { $ifNull: ["$valid_events", []] }
                                }
                            }
                        }
                    ]
                }
            },
            // ✅ OPTIMIZED: Combined partner lookup with same optimization pattern
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "_id",
                    foreignField: "user_company_row_id",
                    as: "info_partner",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 2,
                                account_type: 2,
                                registered_type: 1
                            }
                        },
                        // ✅ OPTIMIZED: Reuse same facet pattern for consistency
                        {
                            $facet: {
                                valid_events: [
                                    {
                                        $lookup: {
                                            from: "cln_events",
                                            localField: "event_row_id",
                                            foreignField: "_id",
                                            as: "event_info",
                                            pipeline: [
                                                {
                                                    $match: {
                                                        active_status: 1,
                                                        approval_status: 1,
                                                        list_event_type: { $in: [1, 2, 3] }
                                                    }
                                                },
                                                {
                                                    $lookup: {
                                                        from: "cln_professionals",
                                                        localField: "user_row_id",
                                                        foreignField: "_id",
                                                        as: "user_info",
                                                        pipeline: [
                                                            {
                                                                $match: { login_status: { $ne: 1 } }
                                                            },
                                                            {
                                                                $project: {
                                                                    _id: 1,
                                                                    login_status: 1
                                                                }
                                                            }
                                                        ]
                                                    }
                                                },
                                                {
                                                    $lookup: {
                                                        from: "cln_company_lists",
                                                        localField: "company_row_id",
                                                        foreignField: "_id",
                                                        as: "company_info",
                                                        pipeline: [
                                                            {
                                                                $match: { active_status: { $ne: 1 } }
                                                            },
                                                            {
                                                                $project: {
                                                                    _id: 1,
                                                                    active_status: 1
                                                                }
                                                            }
                                                        ]
                                                    }
                                                },
                                                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
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
                                                        _id: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: "$event_info" },
                                    {
                                        $match: {
                                            event_info: { $ne: null }
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                count: {
                                    $size: { $ifNull: ["$valid_events", []] }
                                }
                            }
                        }
                    ]
                }
            },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            { $match: query },

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
                        { $count: "count" }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    latitude: 1,
                    longitude: 1,
                    lat_num: 1,
                    lon_num: 1,
                    total_events: 1,

                    // 
                    company_logo: { $ifNull: ["$company_info.company_logo", null] },
                    describe_in_one_line: { $ifNull: ["$company_info.describe_in_one_line", null] },
                    country_flag: { $ifNull: ["$country_info.country_flag", null] },
                    country_name: { $ifNull: ["$country_info.country_name", null] },
                    business_name: { $ifNull: ["$business_info.business_name", null] },
                    main_business_model_name: { $ifNull: ["$main_business_info.business_name", null] },

                    // 
                    total_sponsors: {
                        $ifNull: [
                            { $arrayElemAt: ["$info_sponsor.count", 0] },
                            0
                        ]
                    },
                    total_partners: {
                        $ifNull: [
                            { $arrayElemAt: ["$info_partner.count", 0] },
                            0
                        ]
                    },
                    total_followers: {
                        $ifNull: [
                            { $arrayElemAt: ["$followers_info.count", 0] },
                            0
                        ]
                    },

                    watchlist_status: {
                        $cond: {
                            if: {
                                $gt: [
                                    {
                                        $size: {
                                            $cond: [
                                                { $isArray: "$info_company_watchlist" },
                                                "$info_company_watchlist",
                                                []
                                            ]
                                        }
                                    },
                                    0
                                ]
                            },
                            then: 1,
                            else: 0
                        }
                    },

                    following_status: {
                        $cond: {
                            if: {
                                $gt: [
                                    {
                                        $size: {
                                            $cond: [
                                                { $isArray: "$info_user_following" },
                                                "$info_user_following",
                                                []
                                            ]
                                        }
                                    },
                                    0
                                ]
                            },
                            then: 1,
                            else: 0
                        }
                    }
                }
            }
        ]
        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

        ];
        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];



        const [result1, result2] = await Promise.all([
            eventM.aggregate(listPipeline),
            eventM.aggregate(countPipeline)
        ]);
        const final_count = result2?.[0]?.count || 0;

        return {
            list: result1,
            count: final_count
        };
    }


    else if (report_list_type === 3) {

        const basePipeline = [

            {
                $match: {
                    funds_raised_registered_type: 1,
                    verified_status: 1
                }
            },

            {
                $lookup: {
                    from: "cln_company_lists",
                    let: {
                        investor_type: "$investor_type",
                        investor_registered_type: "$investor_registered_type",
                        investor_row_id: "$investor_row_id"
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, "$$investor_type"] },
                                                { $eq: [1, "$$investor_registered_type"] },
                                                { $eq: ["$_id", "$$investor_row_id"] }
                                            ]
                                        }
                                    },
                                    { active_status: 1 }
                                ]
                            }
                        },
                        { $project: { _id: 1 } }
                    ]
                }
            },

            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

            {
                $set: {
                    investor_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ["$investor_type", 2] },
                                            { $eq: ["$investor_registered_type", 1] }
                                        ]
                                    },
                                    then: "$company_info._id"
                                },
                                {
                                    case: {
                                        $or: [
                                            {
                                                $and: [
                                                    { $eq: ["$investor_type", 1] },
                                                    { $eq: ["$investor_registered_type", 2] }
                                                ]
                                            },
                                            {
                                                $and: [
                                                    { $eq: ["$investor_type", 2] },
                                                    { $eq: ["$investor_registered_type", 2] }
                                                ]
                                            },
                                            {
                                                $and: [
                                                    { $eq: ["$investor_type", 1] },
                                                    { $eq: ["$investor_registered_type", 1] }
                                                ]
                                            }
                                        ]
                                    },
                                    then: "$investor_row_id"
                                }
                            ],
                            default: ""
                        }
                    }
                }
            },

            {
                $match: { investor_data: { $gt: 0 } }
            },

            // Collapse to one document per round_id BEFORE the company-level group,
            // so a multi-investor round's shared amount is counted once instead of
            // once per investor row — same rule as the funding_info lookup elsewhere
            // in this file. category_row_id is kept via $first since it's the same
            // across every row in a round.
            {
                $group: {
                    _id: "$round_id",
                    funds_raised_company_row_id: { $first: "$funds_raised_company_row_id" },
                    amount: { $first: "$amount" },
                    category_row_id: { $first: "$category_row_id" },
                    investor_identities: {
                        $push: {
                            investor_row_id: "$investor_row_id",
                            investor_type: "$investor_type",
                            investor_registered_type: "$investor_registered_type"
                        }
                    }
                }
            },

            // Final group back to one document per company. round_ids counts
            // distinct ROUNDS. category_ids is kept for the funding_rounds name
            // lookup below. funds_raised_ids flattens the per-round investor
            // identities collected above into one set, since
            // total_funds_raised_companies should still reflect every distinct
            // investor across all of this company's rounds.
            {
                $group: {
                    _id: "$funds_raised_company_row_id",
                    total_funds_raised_amount: { $sum: "$amount" },
                    round_ids: { $addToSet: "$_id" },
                    category_ids: { $addToSet: "$category_row_id" },
                    funds_raised_ids: { $push: "$investor_identities" }
                }
            },

            // Flatten the per-round investor-identity arrays into one set of
            // distinct investors across all rounds.
            {
                $addFields: {
                    funds_raised_ids: {
                        $reduce: {
                            input: "$funds_raised_ids",
                            initialValue: [],
                            in: { $setUnion: ["$$value", "$$this"] }
                        }
                    }
                }
            },

            { $sort: { total_funds_raised_amount: -1, _id: 1 } },

            {
                $lookup: {
                    from: "cln_static_company_funding_rounds",
                    localField: "category_ids",
                    foreignField: "_id",
                    as: "funding_rounds",
                    pipeline: [{ $project: { category_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: {
                                    $cond: {
                                        if: "$user_info",
                                        then: "$user_info.login_status",
                                        else: 1
                                    }
                                }
                            }
                        },
                        { $match: { login_status: 1 } },
                        {
                            $project: {
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
                                longitude: 1
                            }
                        }
                    ]
                }
            },

            { $unwind: { path: "$company_info" } },


            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude"
                }
            },


            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },


            ...(boundingBox
                ? [{
                    $match: {
                        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                    }
                }]
                : []),

            { $match: query },

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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

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
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$inner_user_info" },
                        { $count: "count" }
                    ]
                }
            },

            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    latitude: 1,
                    longitude: 1,
                    lat_num: 1,
                    lon_num: 1,

                    total_funds_raised_companies: { $size: "$funds_raised_ids" },
                    total_funds_raised_rounds: { $size: "$round_ids" },
                    funds_raised_rounds: "$funding_rounds.category_name",
                    total_funds_raised_amount: 1,

                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,

                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",

                    watchlist_status: {
                        $cond: { if: "$info_company_watchlist", then: 1, else: 0 }
                    },
                    following_status: {
                        $cond: { if: "$info_user_following", then: 1, else: 0 }
                    },
                    total_followers: {
                        $cond: {
                            if: { $gt: [{ $size: "$followers_info" }, 0] },
                            then: "$followers_info.count",
                            else: 0
                        }
                    }
                }
            }
        ]

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

        ];
        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        const [result1, result2] = await Promise.all([
            fundingM.aggregate(listPipeline),
            fundingM.aggregate(countPipeline)
        ]);

        let total_counts = Number(result2?.[0]?.count || 0);

        return { list: result1, count: total_counts };
    }

    else if (report_list_type === 4) {
        const basePipeline = [
            {
                $match: {
                    investor_type: 2, investor_registered_type: 1, verified_status: 1
                }
            },
            ...(boundingBox ? [{
                $match: {
                    $expr: {
                        $and: [
                            {
                                $gte: [
                                    { $convert: { input: "$latitude", to: "double", onError: null, onNull: null } },
                                    boundingBox.minLat
                                ]
                            },
                            {
                                $lte: [
                                    { $convert: { input: "$latitude", to: "double", onError: null, onNull: null } },
                                    boundingBox.maxLat
                                ]
                            },
                            {
                                $gte: [
                                    { $convert: { input: "$longitude", to: "double", onError: null, onNull: null } },
                                    boundingBox.minLon
                                ]
                            },
                            {
                                $lte: [
                                    { $convert: { input: "$longitude", to: "double", onError: null, onNull: null } },
                                    boundingBox.maxLon
                                ]
                            }
                        ]
                    }
                }
            }] : []),

            {
                $lookup:
                {
                    from: "cln_company_lists",
                    let: {
                        funds_raised_registered_type: '$funds_raised_registered_type',
                        funds_raised_company_row_id: '$funds_raised_company_row_id'
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    },
                                    {
                                        active_status: 1
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                company_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    investor_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$funds_raised_registered_type', 1] }
                                        ]
                                    },
                                    then: '$company_info._id'
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$funds_raised_registered_type', 2] }
                                        ]
                                    },
                                    then: '$funds_raised_company_row_id'
                                },
                            ],
                            default: 0
                        }
                    }
                }
            },
            {
                $match: { investor_data: { $gt: 0 } }
            },

            // Self-lookup: count how many total rows (across all investors) share
            // this row's round_id, to detect syndicate (multi-investor) rounds.
            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { round_id: "$round_id" },
                    as: "round_investor_rows",
                    pipeline: [
                        { $match: { $expr: { $eq: ["$round_id", "$$round_id"] } } },
                        { $project: { _id: 1 } }
                    ]
                }
            },

            // Exclude syndicate rounds (more than 1 investor sharing round_id) —
            // same rule applied to investor_overview and investment_graph: syndicate
            // amounts are excluded entirely from this investor's totals, since their
            // individual contribution to a shared round isn't known.
            {
                $match: {
                    $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                }
            },

            {
                $group: {
                    _id: "$investor_row_id",
                    total_invested_amount: { $sum: '$amount' },
                    round_ids: { $addToSet: '$round_id' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: { $addToSet: '$funds_raised_company_row_id' }
                }
            },
            {
                $sort: { total_invested_amount: -1 }
            },
            {
                $lookup:
                {
                    from: "cln_static_company_funding_rounds",
                    localField: "category_ids",
                    foreignField: "_id",
                    as: "invested_rounds",
                    pipeline: [
                        {
                            $project: {
                                category_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
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
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",
                }
            },
            { $match: query },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    latitude: 1,
                    longitude: 1,
                    total_invested_companies: { $size: '$funds_raised_ids' },
                    total_invested_rounds: { $size: '$round_ids' },
                    invested_rounds: '$invested_rounds.category_name',
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    total_invested_amount: 1,
                    business_name: "$business_info.business_name",
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }

        ]

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

        ];
        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        const [result1, result2] = await Promise.all([
            fundingM.aggregate(listPipeline),
            fundingM.aggregate(countPipeline)
        ]);

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: result1, count: total_counts }
    }
    else if (report_list_type === 5) {

        const basePipeline = [

            // ---------------------------------------------------
            // 1) Sort incoming revenue rows
            // ---------------------------------------------------
            {
                $sort: { year: -1, quarter: -1 }
            },

            // ---------------------------------------------------
            // 2) Group revenue by company
            // ---------------------------------------------------
            {
                $group: {
                    _id: "$company_row_id",
                    pushed_data: {
                        $push: {
                            $cond: [
                                { $lt: ["$quarter", 5] },
                                {
                                    _id: "$_id",
                                    year: "$year",
                                    quarter: "$quarter",
                                    revenue: "$revenue"
                                },
                                "$$REMOVE"
                            ]
                        }
                    },
                    total_revenue: { $sum: "$revenue" }
                }
            },

            // ---------------------------------------------------
            // 3) Company Lookup
            // ---------------------------------------------------
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },

                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                        {
                            $set: {
                                login_status: {
                                    $cond: {
                                        if: "$user_info",
                                        then: "$user_info.login_status",
                                        else: 1
                                    }
                                }
                            }
                        },
                        { $match: { login_status: 1 } },

                        {
                            $project: {
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
                                longitude: 1
                            }
                        }
                    ]
                }
            },

            { $unwind: "$company_info" },

            // ---------------------------------------------------
            // 4) Add numeric lat/lon AFTER company lookup
            // ---------------------------------------------------
            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$company_info.latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$company_info.longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },

            // ---------------------------------------------------
            // 5) Bounding Box Filter (Corrected)
            // ---------------------------------------------------
            ...(boundingBox
                ? [{
                    $match: {
                        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                    }
                }]
                : []),

            // ---------------------------------------------------
            // 6) Sort by total revenue
            // ---------------------------------------------------
            {
                $sort: { total_revenue: -1 }
            },

            // ---------------------------------------------------
            // 7) Merge company info
            // ---------------------------------------------------
            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",

                    // Revenue Growth Calculation
                    revenue_growth: {
                        $cond: [
                            {
                                $and: [
                                    { $gte: [{ $size: "$pushed_data" }, 2] },
                                    { $ne: [{ $arrayElemAt: ["$pushed_data.revenue", 1] }, 0] }
                                ]
                            },
                            {
                                $multiply: [
                                    {
                                        $divide: [
                                            {
                                                $subtract: [
                                                    { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                                    { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                ]
                                            },
                                            { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                        ]
                                    },
                                    100
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            { $match: query },

            // ---------------------------------------------------
            // 8) Lookups (Business Models / Country / Followers)
            // ---------------------------------------------------
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: "$country_info" },

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
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$inner_user_info" },
                        { $count: "count" }
                    ]
                }
            },

            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    total_revenue: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    revenue_growth: 1,
                    latitude: 1,
                    longitude: 1,
                    lat_num: 1,
                    lon_num: 1,
                    pushed_data: 1,

                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    business_name: "$business_info.business_name",
                    company_valuation: 1,
                    main_business_model_name: "$main_business_info.business_name",

                    watchlist_status: {
                        $cond: { if: "$info_company_watchlist", then: 1, else: 0 }
                    },
                    following_status: {
                        $cond: { if: "$info_user_following", then: 1, else: 0 }
                    },
                    total_followers: {
                        $cond: {
                            if: { $gt: [{ $size: "$followers_info" }, 0] },
                            then: "$followers_info.count",
                            else: 0
                        }
                    }
                }
            }

        ]

        // -------------------------------------------------------
        // COUNT QUERY (NO Changes Removed)
        // -------------------------------------------------------
        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

        ];
        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];
        const [result1, result2] = await Promise.all([
            company_revenue_growthM.aggregate(listPipeline),
            company_revenue_growthM.aggregate(countPipeline)
        ]);
        return {
            list: result1,
            count: result2?.[0]?.count || 0
        };
    }
    else if (report_list_type === 6) {

        const basePipeline = [

            { $match: { company_type: 1 } },
            {
                $group: {
                    _id: "$company_row_id",
                    total_products: { $sum: 1 },
                    product_ids: {
                        $addToSet: {
                            register_type: "$register_type",
                            product_type: "$product_type",
                            product_row_id: "$product_row_id"
                        }
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },

                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                        {
                            $set: {
                                login_status: {
                                    $cond: {
                                        if: "$user_info",
                                        then: "$user_info.login_status",
                                        else: 1
                                    }
                                }
                            }
                        },

                        { $match: { login_status: 1 } },

                        {
                            $project: {
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
                                longitude: 1
                            }
                        }
                    ]
                }
            },

            { $unwind: "$company_info" },

            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$company_info.latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$company_info.longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },

            ...(boundingBox
                ? [{
                    $match: {
                        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                    }
                }]
                : []),

            // ----------------------------------------------------
            // 6. Sort by total products
            // ----------------------------------------------------
            { $sort: { total_products: -1 } },

            // ----------------------------------------------------
            // 7. Flatten company fields
            // ----------------------------------------------------
            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude"
                }
            },

            { $match: query },

            // ----------------------------------------------------
            // 8. Business model lookups
            // ----------------------------------------------------
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },

            // ----------------------------------------------------
            // 9. Country lookup
            // ----------------------------------------------------
            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            // ----------------------------------------------------
            // 10. Followers list
            // ----------------------------------------------------
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
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$inner_user_info" },
                        { $count: "count" }
                    ]
                }
            },

            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            // ----------------------------------------------------
            // 11. Final projection
            // ----------------------------------------------------
            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    latitude: 1,
                    longitude: 1,
                    lat_num: 1,
                    lon_num: 1,
                    company_id: 1,
                    total_products: 1,
                    product_ids: 1,
                    company_location: 1,
                    business_model_id: 1,
                    main_business_model_id: 1,
                    country_id: 1,

                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",

                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    business_name: "$business_info.business_name",

                    company_valuation: 1,
                    main_business_model_name: "$main_business_info.business_name",

                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: {
                        $cond: {
                            if: { $gt: [{ $size: "$followers_info" }, 0] },
                            then: "$followers_info.count",
                            else: 0
                        }
                    }
                }
            }

        ]

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit }
        ];

        // 3) COUNT PIPELINE (base + $count)
        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        // 4) Run both in parallel
        const [rawList, countDocs] = await Promise.all([
            company_productsM.aggregate(listPipeline),
            company_productsM.aggregate(countPipeline)
        ]);

        const totalCount = countDocs?.[0]?.count || 0;

        const products_list = await getCompanyProducts(rawList);

        let finalList = [];
        for (let item of rawList) {
            if (item.product_ids) {
                item.products = await getMatchedProducts(item.product_ids, products_list);
            }
            finalList.push(item);
        }

        return {
            list: finalList,
            count: totalCount
        };
    }
    else if (report_list_type === 7) {

        const basePipeline = [
            { $match: { company_type: 1 } },

            {
                $group: {
                    _id: "$company_row_id",
                    total_holdings: { $sum: "$purchased_value_in_usd" },
                    token_row_ids: {
                        $addToSet: {
                            $cond: [
                                { $eq: ["$token_type", 1] },
                                "$token_row_id",
                                "$$REMOVE"
                            ]
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total_holdings: -1 } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },

                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                        {
                            $set: {
                                login_status: {
                                    $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
                                }
                            }
                        },

                        { $match: { login_status: 1 } },

                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                company_valuation: 1,
                                country_id: 1,
                                latitude: 1,
                                longitude: 1
                            }
                        }
                    ]
                }
            },

            { $unwind: "$company_info" },

            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$company_info.latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$company_info.longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },

            ...(boundingBox
                ? [{
                    $match: {
                        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                    }
                }]
                : []),

            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude"
                }
            },

            { $match: query },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

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
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$inner_user_info" },
                        { $count: "count" }
                    ]
                }
            },

            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    latitude: 1,
                    longitude: 1,
                    lat_num: 1,
                    lon_num: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    total_holdings: 1,
                    token_row_ids: 1,

                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    company_valuation: "$company_info.company_valuation",

                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",

                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",

                    watchlist_status: { $cond: [{ $ifNull: ["$info_company_watchlist", false] }, 1, 0] },
                    following_status: { $cond: [{ $ifNull: ["$info_user_following", false] }, 1, 0] },

                    total_followers: {
                        $cond: [
                            { $gt: [{ $size: "$followers_info" }, 0] },
                            "$followers_info.count",
                            0
                        ]
                    }
                }
            }

        ]

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit }
        ];

        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        const [rawList, countDocs] = await Promise.all([
            company_holdingM.aggregate(listPipeline),
            company_holdingM.aggregate(countPipeline)
        ]);

        const totalCount = countDocs?.[0]?.count || 0;

        // Attach tokens
        let tokenIds: any = [];
        rawList.forEach((r: { token_row_ids: any[] }) => {
            if (Array.isArray(r.token_row_ids)) {
                tokenIds.push(...r.token_row_ids);
            }
        });

        const token_list = await getTokenList({ token_ids: tokenIds });

        let finalList = [];
        for (let row of rawList) {
            if (row.token_row_ids) {
                row.tokens_list = await filterTokens({ token_ids: row.token_row_ids, token_list });
            }
            finalList.push(row);
        }

        return {
            list: finalList,
            count: totalCount,
            token_list
        };
    }
    else if (report_list_type === 8) {

        const get_query = await jobsM.aggregate([
            { $match: { active_status: "active", is_deleted: false } },

            { $sort: { createdAt: -1 } },

            {
                $group: {
                    _id: "$company_row_id",
                    job_roles: { $push: "$job_title" }
                }
            },
            { $match: { $expr: { $gt: [{ $size: "$job_roles" }, 0] } } },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },

                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                        {
                            $set: {
                                login_status: {
                                    $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
                                }
                            }
                        },

                        { $match: { login_status: 1 } },

                        {
                            $project: {
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
                                longitude: 1
                            }
                        }
                    ]
                }
            },

            { $unwind: "$company_info" },
            {
                $addFields: {
                    lat_num: {
                        $convert: {
                            input: "$company_info.latitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    },
                    lon_num: {
                        $convert: {
                            input: "$company_info.longitude",
                            to: "double",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            ...(boundingBox
                ? [{
                    $match: {
                        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
                    }
                }]
                : []),
            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude"
                }
            },

            { $match: query },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

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
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: "$inner_user_info" },
                        { $count: "count" }
                    ]
                }
            },

            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    job_roles: 1,
                    latitude: 1,
                    longitude: 1,

                    company_name: 1,
                    company_id: 1,
                    company_location: 1,
                    business_model_id: 1,
                    main_business_model_id: 1,

                    company_logo: 1,
                    describe_in_one_line: 1,
                    company_valuation: 1,

                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",

                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",

                    watchlist_status: {
                        $cond: [{ $ifNull: ["$info_company_watchlist", false] }, 1, 0]
                    },
                    following_status: {
                        $cond: [{ $ifNull: ["$info_user_following", false] }, 1, 0]
                    },

                    total_followers: {
                        $cond: [
                            { $gt: [{ $size: "$followers_info" }, 0] },
                            "$followers_info.count",
                            0
                        ]
                    }
                }
            }

        ]).skip(skip).limit(limit);


        const count_query = await jobsM.aggregate([

            { $match: { active_status: "active", is_deleted: false } },

            { $sort: { createdAt: -1 } },

            {
                $group: {
                    _id: "$company_row_id",
                    job_titles: {
                        $push: {
                            job_title: "$job_title",
                            country_id: "$country_id",
                            experience_level: "$experience_level",
                            job_type: "$job_type",
                            work_location_type: "$work_location_type",
                            location: "$location",
                            salary_from: "$salary_from",
                            salary_to: "$salary_to",
                            no_of_openings: "$no_of_openings",
                            application_deadline: "$application_deadline",
                            job_description: "$job_description",
                            createdAt: "$createdAt"
                        }
                    }
                }
            },

            { $match: { $expr: { $gt: [{ $size: "$job_titles" }, 0] } } },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },

                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                        {
                            $set: {
                                login_status: {
                                    $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
                                }
                            }
                        },

                        { $match: { login_status: 1 } },

                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                company_valuation: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },

            { $unwind: "$company_info" },

            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id"
                }
            },

            { $match: query },

            { $count: "count" }
        ]);

        const [result1, result2] = await Promise.all([get_query, count_query]);

        return {
            list: result1,
            count: result2?.[0]?.count || 0
        };
    }

};

const getCompanyListDetails = async (reqQuery: any, skip: number, limit: number, user_row_id: number = 0) => {
    try {
        let report_list_type = 1;
        if (reqQuery.report_list_type && reqQuery.report_list_type != 0) {
            report_list_type = Number.parseInt(reqQuery.report_list_type);
        }

        // --------------------------------------------
        // GEO INPUT
        // --------------------------------------------
        const userLat = reqQuery.user_latitude ? Number.parseFloat(reqQuery.user_latitude) : null;
        const userLon = reqQuery.user_longitude ? Number.parseFloat(reqQuery.user_longitude) : null;
        const isGeoActive = Number.isFinite(userLat) && Number.isFinite(userLon);
        const ALLOWED_SORTS = ['popular', 'name', 'recent'];
        const sortBy = ALLOWED_SORTS.includes(reqQuery.sort_by) ? reqQuery.sort_by : 'recent';
        const MAX_DISTANCE_KM = 500;

        let boundingBox = null;

        if (isGeoActive && userLat !== null && userLon !== null) {
            const latDelta = MAX_DISTANCE_KM / 111;
            const lonDelta = MAX_DISTANCE_KM / (111 * Math.cos(userLat * Math.PI / 180));

            boundingBox = {
                minLat: userLat - latDelta,
                maxLat: userLat + latDelta,
                minLon: userLon - lonDelta,
                maxLon: userLon + lonDelta
            };
        }

        // --------------------------------------------
        // GEO → FETCH ALL then FILTER
        // --------------------------------------------
        const querySkip = isGeoActive ? 0 : skip;
        const queryLimit = isGeoActive ? 6000 : limit;

        // --------------------------------------------
        // TOP COUNTRIES (unchanged)
        // --------------------------------------------
        const countryDetails = await countryM.find(
            {},
            { _id: 1, country_name: 1, country_flag: 1, sortname: 1, country_code: 1 }
        ).lean();

        // const countryRegexList = countryDetails.map((c: any) => ({
        //     name: c.country_name,
        //     regex: new RegExp(`\\b${c.country_name.replaceAll(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, "i")
        // }));

        const topCompanyCountriesAgg = await companyM.aggregate([
            {
                $match: {
                    $and: [
                        { active_status: 1 },
                        { approval_status: 1 },
                        // @ts-ignore
                        { company_location: { $exists: true, $ne: "", $ne: null } },
                        { country_id: { $exists: true, $ne: null } }
                    ]
                }
            },
            {
                $group: {
                    _id: "$country_id",      // <-- MATCH WITH countries._id
                    companyCount: { $sum: 1 }
                }
            },
            { $sort: { companyCount: -1 } },
            { $limit: 5 }
        ]);


        const topCountries = topCompanyCountriesAgg.map((c: any) => {
            const details = countryDetails.find((cnt: any) =>
                cnt._id.toString() === c._id.toString()
            );

            return {
                country_id: details?._id || 0,
                country_name: details?.country_name || "",
                country_flag: details?.country_flag || "",
                sortname: details?.sortname || "",
                country_code: details?.country_code || "",
                companyCount: c.companyCount
            };
        });


        // --------------------------------------------
        // FILTER LOGIC
        // --------------------------------------------
        let searchArray = [{}];

        if (reqQuery.search) {
            searchArray.push({
                $or: [
                    { company_name: { $regex: reqQuery.search, $options: 'i' } },
                    { company_id: { $regex: reqQuery.search, $options: 'i' } }
                ]
            });
        }

        if (reqQuery.business_model_id) {
            const business_model_id_array = await getIntValues(reqQuery.business_model_id);
            searchArray.push({ business_model_id: { $in: business_model_id_array } });
        }

        // if (reqQuery.location) {
        //     searchArray.push({
        //         company_location: { $regex: sanitize(reqQuery.location), $options: 'i' }
        //     });
        // }
        if (reqQuery.location) {
            const loc = sanitize(reqQuery.location).trim().toLowerCase();

            const matchedCountry = countryDetails.find((c: CountryDocument) =>
                c.country_name.toLowerCase() === loc
            );

            if (matchedCountry) {
                searchArray.push({ country_id: matchedCountry._id });

                searchArray.push({
                    // @ts-ignore
                    company_location: { $exists: true, $ne: "", $ne: null }
                });

            } else {

                searchArray.push({
                    company_location: {
                        $exists: true,
                        // @ts-ignore
                        $ne: "", $ne: null,
                        $regex: loc,
                        $options: "i"
                    }
                });
            }
        }

        if ((report_list_type === 4 || report_list_type === 3) && reqQuery.category_row_id) {
            searchArray.push({ category_ids: Number.parseInt(reqQuery.category_row_id) });
        }

        if (report_list_type === 5) {
            const r = Number.parseInt(reqQuery.revenue_growth_id);
            if (r === 1) searchArray.push({ revenue_growth: { $lt: 0 } });
            else if (r === 2) searchArray.push({ revenue_growth: { $gte: 0, $lte: 10 } });
            else if (r === 3) searchArray.push({ revenue_growth: { $gt: 10, $lte: 50 } });
            else if (r === 4) searchArray.push({ revenue_growth: { $gt: 50 } });
        }
        const SORT_MAP: any = {
            popular: { view_counts: -1 },
            name: { company_name: 1 },
            recent: { created_date_n_time: -1 }
        };
        const query = { $and: searchArray };
        let sort_filter: any = { $sort: SORT_MAP[sortBy] };
        let match_query: any = {};
        if (report_list_type === 2) {
            const et = Number.parseInt(reqQuery.event_type_id);
            if (et === 1) {
                const start = getMinusDates(7);
                if (start) {
                    match_query = { start_date: { $gte: new Date(start) } };
                }
            } else if (et === 2) {
                sort_filter = { $sort: { total_events: -1 } };
            } else if (et === 3) {
                sort_filter = { $sort: { total_events: 1 } };
            }
        }

        const shouldBypassCache =
            isGeoActive ||
            searchArray.length > 1;

        const cacheKey = `app_company_list_${skip}_${limit}_${report_list_type}_${JSON.stringify(reqQuery)}_${user_row_id}`;

        if (shouldBypassCache) {

            const data: any = await companyList({
                report_list_type,
                query,
                skip: querySkip,
                limit: queryLimit,
                user_row_id,
                sort_filter,
                match_query,
                boundingBox
            });

            let finalList: any = data.list;
            let finalCount = data.count;

            // --------------------------
            // FINAL DISTANCE FILTER
            // --------------------------
            if (isGeoActive) {
                const within = [];

                for (const company of finalList) {
                    const lat = Number(company.lat_num ?? company.latitude);
                    const lon = Number(company.lon_num ?? company.longitude);

                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

                    const dist = getDistanceFromLatLon(userLat!, userLon!, lat, lon);
                    if (dist !== null && dist <= MAX_DISTANCE_KM) {
                        within.push({ ...company, distance: dist });
                    }
                }

                within.sort((a, b) => a.distance - b.distance);
                finalCount = within.length;
                finalList = within.slice(skip, skip + limit);
            }

            return {
                status: true,
                message: finalList,
                count: finalCount,
                top_countries: topCountries,
                cache_reponse_status: false
            };
        }

        // --------------------------------------------
        // CACHE MODE
        // --------------------------------------------
        const cacheResponse = await redisCache.getCache({ key: cacheKey });

        // if (!cacheResponse.status) {
        const data: any = await companyList({
            report_list_type,
            query,
            skip,
            limit,
            user_row_id,
            sort_filter,
            match_query,
            boundingBox: null
        });

        await redisCache.setCache({
            key: cacheKey,
            value: { list: data.list, count: data.count },
            ttl: CacheDuration.TWELVE_HOURS
        });

        return {
            status: true,
            message: data.list,
            count: data.count,
            top_countries: topCountries,
            cache_reponse_status: false
        };
        // }

        return {
            status: true,
            message: cacheResponse.message.list,
            count: cacheResponse.message.count,
            top_countries: topCountries,
            cache_reponse_status: true
        };

    } catch (error) {
        console.error('Error in getCompanyListDetails:', error);
        return {
            status: false,
            message: 'An error occurred while fetching company details',
            count: 0,
            top_countries: [],
            cache_reponse_status: false
        };
    }
};


export const getPartnerListDetails = async (reqQuery: any, skip: number, limit: number, user_row_id: number): Promise<{
    status: boolean;
    list?: any[];
    count?: number;
    topCountries?: any[];
    message?: string;
    cache_reponse_status?: boolean;
}> => {
    try {
        let report_list_type = reqQuery.report_list_type ? Number.parseInt(reqQuery.report_list_type) : 1;

        const key = `app_front_page_partners_list_${skip}_${limit}_${report_list_type}_${JSON.stringify(reqQuery)}_${user_row_id}`;

        let searchArray = [{}];

        if (reqQuery.search?.trim()) {
            const searchTerm = sanitize(reqQuery.search.trim());
            searchArray.push({
                $or: [
                    { company_name: { $regex: `^${searchTerm}`, $options: 'i' } },
                    { company_id: { $regex: `^${searchTerm}`, $options: 'i' } }
                ]
            });
        }

        // Pre-process business model IDs
        if (reqQuery.business_model_id) {
            const businessIds = await getIntValues(reqQuery.business_model_id);
            searchArray.push({ business_model_id: { $in: businessIds } });
        }

        if (reqQuery.location) {
            searchArray.push({ company_location: { $regex: sanitize(reqQuery.location), $options: 'i' } });
        }

        if ([3, 4].includes(report_list_type) && reqQuery.category_row_id) {
            searchArray.push({ category_ids: Number.parseInt(reqQuery.category_row_id) });
        }

        // Revenue growth filtering
        if (report_list_type === 5) {
            const rg = Number.parseInt(reqQuery.revenue_growth_id);
            if (rg === 1) searchArray.push({ revenue_growth: { $lt: 0 } });
            if (rg === 2) searchArray.push({ revenue_growth: { $gte: 0, $lte: 10 } });
            if (rg === 3) searchArray.push({ revenue_growth: { $gt: 10, $lte: 50 } });
            if (rg === 4) searchArray.push({ revenue_growth: { $gt: 50 } });
        }

        let match_query = {};
        let sort_filter: any = { $sort: { _id: 1 } };

        if (report_list_type === 2) {
            const et = Number.parseInt(reqQuery.event_type_id);
            if (et === 1) {
                const start = getMinusDates(7);
                if (start) {
                    match_query = { start_date: { $gte: new Date(start) } };
                }
            } else if (et === 2) {
                sort_filter = { $sort: { total_events: -1 } };
            } else if (et === 3) {
                sort_filter = { $sort: { total_events: 1 } };
            }
        }

        const countryDetailsCache = await countryM.find(
            {},
            { _id: 1, country_name: 1, country_flag: 1, sortname: 1, country_code: 1 }
        ).lean()

        const countryMap = new Map();
        const countryRegexList = countryDetailsCache.map((c: any) => {
            const escapedName = c.country_name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedName}\\b`, "i");
            countryMap.set(c.country_name.toLowerCase(), c);
            return { name: c.country_name, regex };
        });

        // Optimize top countries aggregation with better pipeline
        const topPartnersAgg = await added_to_partnersM.aggregate([
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company",
                    pipeline: [
                        {
                            $match: {
                                approval_status: 1,
                                active_status: 1,
                                company_location: { $exists: true, $ne: "" }
                            }
                        },
                        { $project: { company_location: 1, _id: 0 } }
                    ]
                }
            },
            { $unwind: { path: "$company", preserveNullAndEmptyArrays: false } },
            { $match: { "company.company_location": { $exists: true, $ne: "" } } },
            {
                $addFields: {
                    matched_countries: {
                        $filter: {
                            input: countryRegexList,
                            as: "c",
                            cond: {
                                $regexMatch: {
                                    input: "$company.company_location",
                                    regex: "$$c.regex"
                                }
                            }
                        }
                    }
                }
            },
            { $unwind: "$matched_countries" },
            {
                $group: {
                    _id: "$matched_countries.name",
                    partner_count: { $sum: 1 }
                }
            },
            { $sort: { partner_count: -1 } },
            { $limit: 5 }
        ]);

        const topCountries = topPartnersAgg.map((c: any) => {
            const match = countryMap.get(c._id.toLowerCase());
            return {
                country_id: match?._id || 0,
                country_name: match?.country_name || c._id,
                country_flag: match?.country_flag || "",
                sortname: match?.sortname || "",
                country_code: match?.country_code || "",
                partner_count: c.partner_count
            };
        });

        // Determine if we should use cache
        const hasFilters = searchArray.length > 1;

        if (hasFilters) {
            // Skip cache for filtered queries
            const { list, count } = await partnersList({
                report_list_type,
                searchArray: searchArray,
                skip: skip,
                limit: limit,
                user_row_id,
                match_query,
                sort_filter
            });
            return { status: true, list, count, topCountries, cache_reponse_status: false };
        }

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                list: cache_response.message.list,
                count: cache_response.message.count,
                topCountries: cache_response.message.topCountries as any[],
                cache_reponse_status: true
            };
        }

        // Cache miss - fetch fresh data
        const { list, count } = await partnersList({
            report_list_type,
            searchArray: searchArray,
            skip: skip,
            limit: limit,
            user_row_id,
            match_query,
            sort_filter
        });

        // Set cache with optimized TTL
        await redisCache.setCache({
            key,
            value: { list, count, topCountries },
            ttl: CacheDuration.TWELVE_HOURS
        });

        return { status: true, list, count, topCountries, cache_reponse_status: false };

    } catch (error) {
        console.error('Error in partnerList:', error);
        return {
            status: false,
            message: 'An error occurred while fetching partner list',
            count: 0,
            topCountries: [],
            cache_reponse_status: false
        };
    }
}

const partnersList = async ({ report_list_type, searchArray, skip, limit, user_row_id, match_query, sort_filter }: { report_list_type: number; searchArray: any[]; skip: number; limit: number; user_row_id: number; match_query: any; sort_filter: any }) => {
    // Early validation and optimization
    const sanitizedSkip = Math.max(0, Number.parseInt(skip as any) || 0);
    const sanitizedLimit = Math.min(100, Math.max(1, Number.parseInt(limit as any) || 100));

    if (report_list_type === 1) {
        const get_query = added_to_partnersM.aggregate([
            { $sort: { _id: -1 } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company",
                    pipeline: [
                        {
                            $match: { active_status: 1, approval_status: 1 }
                        },
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: { $ne: 1 }
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } },
                            }
                        },
                        {
                            $match: {
                                login_status: 1
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_company_business_models",
                                localField: "business_model_id",
                                foreignField: "_id",
                                as: "business_info",
                                pipeline: [{ $project: { business_name: 1 } }]
                            }
                        },
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
                                from: "cln_static_countries",
                                localField: "country_id",
                                foreignField: "_id",
                                as: "country_info",
                                pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                            }
                        },
                        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
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
                                country_flag: "$country_info.country_flag",
                                country_name: "$country_info.country_name",
                                main_business_model_name: "$main_business_info.business_name",
                                business_name: "$business_info.business_name"
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company" } },
            {
                $set: {
                    company_name: "$company.company_name",
                    company_id: "$company.company_id",
                    company_location: { $cond: { if: "$company.company_location", then: "$company.company_location", else: "" } },
                    business_model_id: "$company.business_model_id"
                }
            },
            { $match: { $and: searchArray } },
            // Optimized followers lookup with count aggregation
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "company_row_id",
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
            // Batch user-specific lookups
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "company_row_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_user_following"
                }
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "company_row_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            // Optimized events lookup with simplified pipeline
            {
                $lookup: {
                    from: "cln_events",
                    let: { companyId: "$company_row_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$company_row_id", "$$companyId"] },
                                        { $eq: ["$active_status", 1] },
                                        { $eq: ["$approval_status", 1] },
                                        { $gt: ["$company_row_id", 0] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total_events: { $sum: 1 }
                            }
                        }
                    ],
                    as: "event_info"
                }
            },
            {
                $addFields: {
                    total_events: {
                        $ifNull: [{ $arrayElemAt: ["$event_info.total_events", 0] }, 0]
                    },
                }
            },
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "company_row_id",
                    foreignField: "user_company_row_id",
                    as: "info_sponsor",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 1, // 1. Sponsor
                                account_type: 2,         // 1. User  2. Company
                                registered_type: 1       // 1. Registered  2. Manual
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "info_event",
                                pipeline: [
                                    {
                                        $match: {
                                            active_status: 1,
                                            approval_status: 1,
                                            list_event_type: { $in: [1, 2, 3] }
                                        }
                                    },
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                { $match: { login_status: { $ne: 1 } } },
                                                { $project: { _id: 1, login_status: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup: {
                                            from: "cln_company_lists",
                                            localField: "company_row_id",
                                            foreignField: "_id",
                                            as: "company_info",
                                            pipeline: [
                                                { $match: { active_status: { $ne: 1 } } },
                                                { $project: { _id: 1, active_status: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $set: {
                                            company_active_status: {
                                                $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 }
                                            },
                                            login_status: {
                                                $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
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
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_event" } },
                        { $count: "count" }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "company_row_id",
                    foreignField: "user_company_row_id",
                    as: "info_partner",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 2, // 2. Partner
                                account_type: 2,
                                registered_type: 1
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "info_event",
                                pipeline: [
                                    {
                                        $match: {
                                            active_status: 1,
                                            approval_status: 1,
                                            list_event_type: { $in: [1, 2, 3] }
                                        }
                                    },
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                { $match: { login_status: { $ne: 1 } } },
                                                { $project: { _id: 1, login_status: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup: {
                                            from: "cln_company_lists",
                                            localField: "company_row_id",
                                            foreignField: "_id",
                                            as: "company_info",
                                            pipeline: [
                                                { $match: { active_status: { $ne: 1 } } },
                                                { $project: { _id: 1, active_status: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $set: {
                                            company_active_status: {
                                                $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 }
                                            },
                                            login_status: {
                                                $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
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
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_event" } },
                        { $count: "count" }
                    ]
                }
            },
            {
                $addFields: {
                    total_sponsors: {
                        $cond: {
                            if: { $gt: [{ $size: "$info_sponsor" }, 0] },
                            then: [{ $arrayElemAt: ["$info_sponsor.count", 0] }],
                            else: [0]
                        }
                    },
                    total_partners: {
                        $cond: {
                            if: { $gt: [{ $size: "$info_partner" }, 0] },
                            then: [{ $arrayElemAt: ["$info_partner.count", 0] }],
                            else: [0]
                        }
                    }
                }
            },
            // Events end
            // Funding start
            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { companyId: "$company_row_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$funds_raised_company_row_id", "$$companyId"] },
                                        { $eq: ["$funds_raised_registered_type", 1] },
                                        { $eq: ["$verified_status", 1] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    it: "$investor_type",
                                    irt: "$investor_registered_type",
                                    iid: "$investor_row_id"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [2, "$$it"] },
                                                            { $eq: [1, "$$irt"] },
                                                            { $eq: ["$_id", "$$iid"] }
                                                        ]
                                                    }
                                                },
                                                { active_status: 1 }
                                            ]
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ],
                                as: "company_info"
                            }
                        },
                        // if company investor (2,1), pull the active company _id; else 0
                        {
                            $set: {
                                company_investor_id: {
                                    $ifNull: [{ $arrayElemAt: ["$company_info._id", 0] }, 0]
                                }
                            }
                        },
                        {
                            $set: {
                                investor_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ["$investor_type", 2] },
                                                        { $eq: ["$investor_registered_type", 1] }
                                                    ]
                                                },
                                                then: "$company_investor_id"
                                            }
                                        ],
                                        // all other combos (users, manual entries, etc.) use investor_row_id directly
                                        default: "$investor_row_id"
                                    }
                                }
                            }
                        },
                        { $match: { investor_data: { $gt: 0 } } },
                        // Collapse to one document per round_id BEFORE the company-level group,
                        // so a multi-investor round's shared amount is counted once instead of
                        // once per investor row. category_row_id is kept via $first since it's
                        // the same across every row in a round.
                        {
                            $group: {
                                _id: "$round_id",
                                funds_raised_company_row_id: { $first: "$funds_raised_company_row_id" },
                                amount: { $first: "$amount" },
                                category_row_id: { $first: "$category_row_id" },
                                investor_identities: {
                                    $push: {
                                        investor_row_id: "$investor_row_id",
                                        investor_type: "$investor_type",
                                        investor_registered_type: "$investor_registered_type"
                                    }
                                }
                            }
                        },
                        // Final group back to one document per company. round_ids now counts
                        // distinct ROUNDS (not round types). category_ids is kept for the
                        // funding_rounds name lookup below. funds_raised_ids flattens the
                        // per-round investor identities collected above into one set, since
                        // total_funds_raised_companies should still reflect every distinct
                        // investor across all of this company's rounds.
                        {
                            $group: {
                                _id: "$funds_raised_company_row_id",
                                total_funds_raised_amount: { $sum: "$amount" },
                                round_ids: { $addToSet: "$_id" },
                                category_ids: { $addToSet: "$category_row_id" },
                                funds_raised_ids: { $push: "$investor_identities" }
                            }
                        },
                        // Flatten the per-round investor-identity arrays into one set of
                        // distinct investors across all rounds.
                        {
                            $addFields: {
                                funds_raised_ids: {
                                    $reduce: {
                                        input: "$funds_raised_ids",
                                        initialValue: [],
                                        in: { $setUnion: ["$$value", "$$this"] }
                                    }
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_company_funding_rounds",
                                localField: "category_ids",
                                foreignField: "_id",
                                as: "funding_rounds",
                                pipeline: [
                                    { $project: { _id: 0, category_name: 1 } }
                                ]
                            }
                        }
                    ],
                    as: "funding_info"
                }
            },
            // flatten the single grouped doc (or keep null if none)
            { $set: { funding_data: { $arrayElemAt: ["$funding_info", 0] } } },
            {
                $addFields: {
                    total_funds_raised_companies: {
                        $size: { $ifNull: ["$funding_data.funds_raised_ids", []] }
                    },
                    total_funds_raised_rounds: {
                        $size: { $ifNull: ["$funding_data.round_ids", []] }
                    },
                    funds_raised_rounds: {
                        $ifNull: ["$funding_data.funding_rounds.category_name", []]
                    },
                    total_funds_raised_amount: {
                        $ifNull: ["$funding_data.total_funds_raised_amount", 0]
                    }
                }
            },
            // Funding end
            // investment start 
            {
                $lookup: {
                    from: "cln_funding_investment_lists",              // <-- use your actual collection
                    let: { investorId: "$company_row_id" },           // company _id acts as investor_row_id
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$investor_row_id", "$$investorId"] },
                                investor_type: 2,                 // company investor
                                investor_registered_type: 1,      // registered investor
                                verified_status: 1
                            }
                        },
                        // For registered recipients, ensure the recipient company is active
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    fr_reg_type: "$funds_raised_registered_type",
                                    fr_company_id: "$funds_raised_company_row_id"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$$fr_reg_type", 1] },      // recipient is registered company
                                                            { $eq: ["$_id", "$$fr_company_id"] } // same recipient id
                                                        ]
                                                    }
                                                },
                                                { active_status: 1 }                       // recipient is active
                                            ]
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ],
                                as: "recipient_company"
                            }
                        },
                        // Keep only valid rows:
                        // - if recipient is registered (1) → we must have active recipient_company
                        // - if recipient is manual (2) → always keep
                        {
                            $addFields: {
                                recipient_ok: {
                                    $cond: [
                                        { $eq: ["$funds_raised_registered_type", 1] },
                                        { $gt: [{ $size: "$recipient_company" }, 0] },
                                        true
                                    ]
                                }
                            }
                        },
                        { $match: { recipient_ok: true } },
                        // Self-lookup: count how many total rows (across all investors) share
                        // this row's round_id, to detect syndicate (multi-investor) rounds.
                        {
                            $lookup: {
                                from: "cln_funding_investment_lists",
                                let: { round_id: "$round_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ["$round_id", "$$round_id"] }
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ],
                                as: "round_investor_rows"
                            }
                        },
                        // Exclude syndicate rounds (more than 1 investor sharing round_id) —
                        // same rule applied elsewhere on the investment side: syndicate
                        // amounts are excluded entirely, since this investor's individual
                        // contribution to a shared round isn't known.
                        {
                            $match: {
                                $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                            }
                        },
                        // Now aggregate the investor's totals & distinct sets
                        {
                            $group: {
                                _id: "$investor_row_id",
                                total_invested_amount: { $sum: "$amount" },
                                round_ids: { $addToSet: "$round_id" },
                                category_ids: { $addToSet: "$category_row_id" },
                                funds_raised_ids: { $addToSet: "$funds_raised_company_row_id" }
                            }
                        }
                    ],
                    as: "investments_agg"
                }
            },

            // Lookup invested_rounds (names) from the category_ids we just collected
            {
                $lookup: {
                    from: "cln_static_company_funding_rounds",
                    let: {
                        category_ids: {
                            $ifNull: [{ $arrayElemAt: ["$investments_agg.category_ids", 0] }, []]
                        }
                    },
                    pipeline: [
                        { $match: { $expr: { $in: ["$_id", "$$category_ids"] } } },
                        { $project: { category_name: 1 } }
                    ],
                    as: "invested_rounds"
                }
            },

            // Flatten computed fields at the root
            {
                $addFields: {
                    total_invested_amount: {
                        $ifNull: [{ $arrayElemAt: ["$investments_agg.total_invested_amount", 0] }, 0]
                    },
                    // count of distinct rounds (categories)
                    total_invested_rounds: {
                        $size: {
                            $ifNull: [{ $arrayElemAt: ["$investments_agg.category_ids", 0] }, []]
                        }
                    },
                    // OPTIONAL: number of distinct companies invested in
                    total_invested_companies: {
                        $size: {
                            $ifNull: [{ $arrayElemAt: ["$investments_agg.funds_raised_ids", 0] }, []]
                        }
                    }
                }
            },

            // (optional) tidy up
            {
                $project: {
                    investments_agg: 0
                }
            },
            // investment end 
            // revenue start 


            {
                $lookup: {
                    from: "cln_company_revenue_details", // collection name
                    localField: "company_row_id",
                    foreignField: "company_row_id",
                    as: "revenue_info",
                    pipeline: [
                        { $sort: { year: -1, quarter: -1 } },
                        {
                            $group: {
                                _id: "$company_row_id",
                                pushed_data: {
                                    $push: {
                                        $cond: [
                                            { $lt: ["$quarter", 5] }, // only valid quarters
                                            {
                                                year: "$year",
                                                quarter: "$quarter",
                                                revenue: "$revenue"
                                            },
                                            "$$REMOVE"
                                        ]
                                    }
                                },
                                total_revenue: { $sum: "$revenue" }
                            }
                        },
                        {
                            $project: {
                                total_revenue: 1,
                                revenue_growth: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: [{ $size: "$pushed_data" }, 2] }, // must have at least 2 quarters
                                                { $ne: [{ $arrayElemAt: ["$pushed_data.revenue", 1] }, 0] }
                                            ]
                                        },
                                        {
                                            $multiply: [
                                                {
                                                    $divide: [
                                                        {
                                                            $subtract: [
                                                                { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                                                { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                            ]
                                                        },
                                                        { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                    ]
                                                },
                                                100
                                            ]
                                        },
                                        0
                                    ]
                                }
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$revenue_info", preserveNullAndEmptyArrays: true } },
            // investment end 
            // products start 
            {
                $lookup: {
                    from: "cln_company_products", // <-- collection name
                    let: { companyId: "$company_row_id" },   // parent company id
                    as: "products_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$company_row_id", "$$companyId"] },
                                        { $eq: ["$company_type", 1] } // your filter
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$company_row_id",
                                total_products: { $sum: 1 },
                                product_ids: {
                                    $addToSet: {
                                        register_type: "$register_type",
                                        product_type: "$product_type",
                                        product_row_id: "$product_row_id"
                                    }
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                total_products: 1,
                                product_ids: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$products_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    total_products: "$products_info.total_products",
                    product_ids: "$products_info.product_ids"
                }
            },

            // crypto assets
            {
                $lookup: {
                    from: "cln_company_holdings",
                    let: { companyId: "$company_row_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$company_row_id", "$$companyId"] },
                                company_type: 1
                            }
                        },
                        {
                            $group: {
                                _id: "$company_row_id",
                                total_holdings: { $sum: "$purchased_value_in_usd" },
                                token_row_ids: {
                                    $addToSet: {
                                        $cond: {
                                            if: { $eq: ["$token_type", 1] },
                                            then: "$token_row_id",
                                            else: "$$REMOVE"
                                        }
                                    }
                                },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { total_holdings: -1 } }
                    ],
                    as: "company_holdings"
                }
            },
            {
                $addFields: {
                    total_holdings: { $ifNull: [{ $arrayElemAt: ["$company_holdings.total_holdings", 0] }, 0] },
                    token_row_ids: { $ifNull: [{ $arrayElemAt: ["$company_holdings.token_row_ids", 0] }, []] }
                }
            },

            // Job Role 
            {
                $lookup: {
                    from: "cln_jobs", // your jobs collection
                    let: { companyId: "$company_row_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$company_row_id", "$$companyId"] },
                                active_status: "active",
                                is_deleted: false
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                job_title: 1
                            }
                        },
                        { $sort: { createdAt: -1 } }
                    ],
                    as: "company_jobs"
                }
            },
            {
                $addFields: {
                    job_roles: {
                        $map: {
                            input: "$company_jobs",
                            as: "job",
                            in: "$$job.job_title"
                        }
                    },
                }
            },
            {
                $project: {
                    _id: 1,
                    user_row_id: 1,
                    company_size_row_id: "$company.company_size_row_id",
                    company_valuation: '$company.company_valuation',
                    country_name: "$company.country_name",
                    country_flag: "$company.country_flag",
                    active_status: "$company.active_status",
                    approval_status: "$company.approval_status",
                    company_row_id: "$company._id",
                    company_location: 1,
                    company_name: 1,
                    company_id: 1,
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    company_logo: "$company.company_logo",
                    established_in: "$company.established_in",
                    describe_in_one_line: "$company.describe_in_one_line",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                    main_business_model_name: "$company.main_business_model_name",
                    business_name: "$company.business_name",
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
                    total_revenue: "$revenue_info.total_revenue",
                    revenue_growth: "$revenue_info.revenue_growth",
                    product_ids: 1,
                    total_holdings: 1,
                    token_row_ids: 1,
                    job_roles: 1,
                }
            }
        ]).skip(sanitizedSkip).limit(sanitizedLimit)

        const count_query = added_to_partnersM.aggregate([
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company",
                    pipeline: [
                        { $match: { active_status: 1, approval_status: 1 } },
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } }
                            }
                        },
                        { $match: { login_status: 1 } },
                        {
                            $project: {
                                _id: 1,
                                business_model_id: 1,
                                company_name: 1,
                                company_id: 1,
                                company_location: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company" } },
            {
                $set: {
                    company_name: "$company.company_name",
                    company_id: "$company.company_id",
                    company_location: "$company.company_location",
                    business_model_id: "$company.business_model_id"
                }
            },
            { $match: { $and: searchArray } },
            { $count: "count" }
        ]);

        const [result1, result2] = await Promise.all([get_query, count_query])

        const token_row_ids = result1.flatMap((run: any) => run.token_row_ids || [])

        const token_list = await getTokenList({ token_ids: token_row_ids })

        const products_list = await getCompanyProducts(result1)

        const final_result = await Promise.all(
            result1.map(async (run: any) => {
                const enriched = { ...run }

                if (Array.isArray(run.token_row_ids) && run.token_row_ids.length > 0) {
                    enriched.tokens_list = await filterTokens({ token_ids: run.token_row_ids, token_list })
                }

                if (Array.isArray(run.product_ids) && run.product_ids.length > 0) {
                    enriched.products = await getMatchedProducts(run.product_ids, products_list)
                }

                return enriched
            })
        )
        const total_counts = result2?.[0]?.count || 0

        return { list: final_result, count: total_counts }
    }
    else if (report_list_type === 2) {
        const get_query = eventM.aggregate([
            {
                $match: {
                    active_status: 1,
                    // end_date: { $gte: new Date(getPresentDateTime()) },
                    approval_status: 1,
                    company_row_id: { $gt: 0 }
                }
            },
            {
                $match: match_query
            },
            {
                $group: {
                    _id: "$company_row_id",
                    total_events: { $sum: 1 }
                }
            },
            sort_filter,
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                latitude: 1,
                                longitude: 1,
                                company_location: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id"
                }
            },
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "_id",
                    foreignField: "user_company_row_id",
                    as: "info_sponsor",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 1, // 1. Sponsor  2. Partner 
                                account_type: 2, // 1. User  2. Company
                                registered_type: 1, // 1. Registerd  2. Manual
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "info_event",
                                pipeline: [
                                    {
                                        $match: {
                                            active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] }
                                        }
                                    },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                {
                                                    $match: { login_status: { $ne: 1 } }
                                                },
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        login_status: 1
                                                    }
                                                }]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_company_lists",
                                            localField: "company_row_id",
                                            foreignField: "_id",
                                            as: "company_info",
                                            pipeline: [
                                                {
                                                    $match: { active_status: { $ne: 1 } }
                                                },
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        active_status: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $set: {
                                            company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                                            login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
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
                                            _id: 1
                                        }
                                    }

                                ]
                            }
                        },
                        { $unwind: { path: "$info_event" } },
                        {

                            $count: 'count'
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_event_sponsor_partner_details",
                    localField: "_id",
                    foreignField: "user_company_row_id",
                    as: "info_partner",
                    pipeline: [
                        {
                            $match: {
                                sponsor_partner_type: 2, // 1. Sponsor  2. Partner 
                                account_type: 2, // 1. User  2. Company
                                registered_type: 1, // 1. Registerd  2. Manual
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "info_event",
                                pipeline: [
                                    {
                                        $match: {
                                            active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] }
                                        }
                                    },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                {
                                                    $match: { login_status: { $ne: 1 } }
                                                },
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        login_status: 1
                                                    }
                                                }]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_company_lists",
                                            localField: "company_row_id",
                                            foreignField: "_id",
                                            as: "company_info",
                                            pipeline: [
                                                {
                                                    $match: { active_status: { $ne: 1 } }
                                                },
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        active_status: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $set: {
                                            company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                                            login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
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
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_event" } },
                        {
                            $count: 'count'
                        }
                    ]
                }
            },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $match: { $and: searchArray }
            },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    company_row_id: "$_id",
                    company_name: 1,
                    company_id: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    total_events: 1,
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    business_name: "$business_info.business_name",
                    total_sponsors: { $cond: { if: { $gt: [{ $size: "$info_sponsor" }, 0] }, then: "$info_sponsor.count", else: 0 } },
                    total_partners: { $cond: { if: { $gt: [{ $size: "$info_partner" }, 0] }, then: "$info_partner.count", else: 0 } },
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = eventM.aggregate([
            {
                $match: {
                    active_status: 1,
                    // end_date: { $gte: new Date(getPresentDateTime()) },
                    approval_status: 1,
                    company_row_id: { $gt: 0 }
                }
            },
            {
                $match: match_query
            },
            {
                $group: {
                    _id: "$company_row_id",
                    count: { $sum: 1 }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                main_business_model_id: 1,
                                business_model_id: 1,
                                company_location: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {

                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                }
            },
            {
                $match: { $and: searchArray }
            },
            {
                $count: "count"
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])
        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }
        return { list: result1, count: total_counts }
    }
    else if (report_list_type === 3) {
        const get_query = fundingM.aggregate([
            {
                $match: {
                    funds_raised_registered_type: 1, verified_status: 1
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    let: {
                        investor_type: '$investor_type',
                        investor_registered_type: '$investor_registered_type',
                        investor_row_id: '$investor_row_id'
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$investor_type'] },
                                                { $eq: [1, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    },
                                    {
                                        active_status: 1
                                    }
                                ]
                            }

                        },
                        {
                            $project: {
                                _id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    investor_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$investor_type', 2] },
                                            { $eq: ['$investor_registered_type', 1] }
                                        ]
                                    },
                                    then: "$company_info._id"
                                },
                                {
                                    case: {
                                        $or: [
                                            {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            }
                                        ]
                                    },
                                    then: "$investor_row_id"
                                },
                            ],
                            default: ""
                        }
                    }
                }
            },
            {
                $match: { investor_data: { $gt: 0 } }
            },
            {
                $group: {
                    _id: "$funds_raised_company_row_id",
                    total_funds_raised_amount: { $sum: '$amount' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: {
                        $addToSet: {
                            investor_row_id: '$investor_row_id',
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type'
                        }
                    }
                }
            },
            {
                $sort: { total_funds_raised_amount: -1, _id: 1 }
            },
            {
                $lookup:
                {
                    from: "cln_static_company_funding_rounds",
                    localField: "category_ids",
                    foreignField: "_id",
                    as: "funding_rounds",
                    pipeline: [
                        {
                            $project: {
                                category_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                latitude: 1,
                                longitude: 1,
                                company_location: 1,
                                company_valuation: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation"
                }
            },
            {
                $match: { $and: searchArray }
            },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    company_row_id: "$_id",
                    company_name: 1,
                    company_id: 1,
                    total_funds_raised_companies: { $size: '$funds_raised_ids' },
                    total_funds_raised_rounds: { $size: '$category_ids' },
                    funds_raised_rounds: '$funding_rounds.category_name',
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    total_funds_raised_amount: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = fundingM.aggregate([
            {
                $match: {
                    funds_raised_registered_type: 1, verified_status: 1
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    let: {
                        investor_type: '$investor_type',
                        investor_registered_type: '$investor_registered_type',
                        investor_row_id: '$investor_row_id'
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$investor_type'] },
                                                { $eq: [1, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    },
                                    {
                                        active_status: 1
                                    }
                                ]
                            }

                        },
                        {
                            $project: {
                                _id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    investor_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$investor_type', 2] },
                                            { $eq: ['$investor_registered_type', 1] }
                                        ]
                                    },
                                    then: "$company_info._id"
                                },
                                {
                                    case: {
                                        $or: [
                                            {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            }
                                        ]
                                    },
                                    then: "$investor_row_id"
                                },
                            ],
                            default: ""
                        }
                    }
                }
            },
            {
                $match: { investor_data: { $gt: 0 } }
            },
            {
                $group: {
                    _id: "$funds_raised_company_row_id",
                    total_funds_raised_amount: { $sum: '$amount' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: {
                        $addToSet: {
                            investor_row_id: '$investor_row_id',
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type'
                        }
                    }
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_company_funding_rounds",
                    localField: "category_ids",
                    foreignField: "_id",
                    as: "funding_rounds",
                    pipeline: [
                        {
                            $project: {
                                category_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                company_valuation: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation"
                }
            },
            {
                $match: { $and: searchArray }
            },
            {
                $count: "count"
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: result1, count: total_counts }
    }
    else if (report_list_type === 4) {
        const get_query = fundingM.aggregate([
            {
                $match: {
                    investor_type: 2, investor_registered_type: 1, verified_status: 1
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    let: {
                        funds_raised_registered_type: '$funds_raised_registered_type',
                        funds_raised_company_row_id: '$funds_raised_company_row_id'
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    },
                                    {
                                        active_status: 1
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                company_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    investor_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$funds_raised_registered_type', 1] }
                                        ]
                                    },
                                    then: '$company_info._id'
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$funds_raised_registered_type', 2] }
                                        ]
                                    },
                                    then: '$funds_raised_company_row_id'
                                },
                            ],
                            default: 0
                        }
                    }
                }
            },
            {
                $match: { investor_data: { $gt: 0 } }
            },
            {
                $group: {
                    _id: "$investor_row_id",
                    total_invested_amount: { $sum: '$amount' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: { $addToSet: '$funds_raised_company_row_id' }
                }
            },
            {
                $sort: { total_invested_amount: -1 }
            },
            {
                $lookup:
                {
                    from: "cln_static_company_funding_rounds",
                    localField: "category_ids",
                    foreignField: "_id",
                    as: "invested_rounds",
                    pipeline: [
                        {
                            $project: {
                                category_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                company_valuation: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                latitude: 1,
                                longitude: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation"
                }
            },
            {
                $match: { $and: searchArray }
            },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    company_row_id: "$_id",
                    company_name: 1,
                    company_id: 1,
                    total_invested_companies: { $size: '$funds_raised_ids' },
                    total_invested_rounds: { $size: '$category_ids' },
                    invested_rounds: '$invested_rounds.category_name',
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    total_invested_amount: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).skip(skip).limit(limit)


        const count_query = fundingM.aggregate([
            {
                $match: {
                    investor_type: 2, investor_registered_type: 1, verified_status: 1
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    let: {
                        funds_raised_registered_type: '$funds_raised_registered_type',
                        funds_raised_company_row_id: '$funds_raised_company_row_id'
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    },
                                    {
                                        active_status: 1
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                company_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    investor_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$funds_raised_registered_type', 1] }
                                        ]
                                    },
                                    then: '$company_info._id'
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$funds_raised_registered_type', 2] }
                                        ]
                                    },
                                    then: '$funds_raised_company_row_id'
                                },
                            ],
                            default: 0
                        }
                    }
                }
            },
            {
                $match: { investor_data: { $gt: 0 } }
            },
            {
                $group: {
                    _id: "$investor_row_id",
                    category_ids: { $addToSet: '$category_row_id' },
                    total_amount: { $sum: '$amount' }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id"
                }
            },
            {
                $match: { $and: searchArray }
            },
            {
                $count: "count"
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query]);

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: result1, count: total_counts }
    }
    else if (report_list_type === 5) {

        const get_query = await company_revenue_growthM.aggregate([
            {
                $sort: {
                    year: -1,
                    quarter: -1
                }
            },
            {
                $group: {
                    _id: "$company_row_id",
                    pushed_data: {
                        $push: {
                            $cond: {
                                if: { $lt: ["$quarter", 5] }, // Condition: revenue > 1000
                                then: {
                                    _id: "$_id",
                                    year: "$year",
                                    quarter: "$quarter",
                                    revenue: "$revenue"
                                },
                                else: "$$REMOVE" // Removes entry if condition fails
                            }
                        }
                    },
                    total_revenue: { $sum: '$revenue' }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
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
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $sort: {
                    total_revenue: -1
                }
            },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    revenue_growth: {
                        $multiply: [
                            {
                                $divide: [
                                    {
                                        $subtract: [
                                            { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                            { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                        ]
                                    },
                                    { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                ]
                            },
                            100 // Multiply the percentage change by 100
                        ]
                    }
                }
            },
            {
                $match: { $and: searchArray }
            },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    company_row_id: "$_id",
                    company_name: 1,
                    company_id: 1,
                    total_revenue: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    pushed_data: 1,
                    revenue_growth: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = await company_revenue_growthM.aggregate([
            {
                $sort: {
                    year: -1,
                    quarter: -1
                }
            },
            {
                $group: {
                    _id: "$company_row_id",
                    pushed_data: {
                        $push: {
                            $cond: {
                                if: { $lt: ["$quarter", 5] }, // Condition: revenue > 1000
                                then: {
                                    _id: "$_id",
                                    year: "$year",
                                    quarter: "$quarter",
                                    revenue: "$revenue"
                                },
                                else: "$$REMOVE" // Removes entry if condition fails
                            }
                        }
                    },
                    total_revenue: { $sum: '$revenue' }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                company_valuation: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation",
                    revenue_growth: {
                        $multiply: [
                            {
                                $divide: [
                                    {
                                        $subtract: [
                                            { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                            { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                        ]
                                    },
                                    { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                ]
                            },
                            100 // Multiply the percentage change by 100
                        ]
                    }
                }
            },
            {
                $match: { $and: searchArray }
            },
            {
                $count: "count"
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: result1, count: total_counts }
    }
    else if (report_list_type === 6) {
        const get_query = company_productsM.aggregate([
            {
                $group: {
                    _id: "$company_row_id",
                    total_products: { $sum: 1 },
                    product_ids: {
                        $addToSet: {
                            register_type: '$register_type',
                            product_type: '$product_type',
                            product_row_id: '$product_row_id'
                        }
                    }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
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
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $sort: {
                    total_products: -1
                }
            },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation"
                }
            },
            {
                $match: { $and: searchArray }
            },
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    company_row_id: "$_id",
                    company_name: 1,
                    company_id: 1,
                    total_products: 1,
                    product_ids: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    company_valuation: 1,
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ])

        const count_query = company_productsM.aggregate([
            { $match: { company_type: 1 } },
            {
                $group: {
                    _id: "$company_row_id",
                    total_products: { $sum: 1 },
                    product_ids: {
                        $addToSet: {
                            register_type: '$register_type',
                            product_type: '$product_type',
                            product_row_id: '$product_row_id'
                        }
                    }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                company_valuation: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation"
                }
            },
            {
                $match: { $and: searchArray }
            },
            {
                $count: "count"
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])

        const products_list = await getCompanyProducts(result1)

        const final_result = []
        for (let run of result1) {
            if (run.product_ids) {
                run['products'] = await getMatchedProducts(run.product_ids, products_list)
            }
            final_result.push(run)
        }

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: final_result, count: total_counts }
    }
    else if (report_list_type === 7) {
        const get_query = company_holdingM.aggregate([
            {
                $group: {
                    _id: "$company_row_id",
                    total_holdings: { $sum: '$purchased_value_in_usd' },
                    token_row_ids: {
                        $addToSet: {
                            $cond: {
                                if: { $eq: ["$token_type", 1] }, // Condition: Only add if token_type is "premium"
                                then: "$token_row_id",
                                else: "$$REMOVE" // Do not add if condition fails
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_added_to_partners",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "info_parnters",
                    pipeline: [
                        {
                            $project: {
                                _id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_parnters" } },
            {
                $sort: {
                    total_holdings: -1
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,
                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                company_valuation: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id"
                }
            },
            {
                $match: { $and: searchArray }
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
                $lookup:
                {
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
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
                }
            },
            {
                $project:
                {
                    _id: 1,
                    company_row_id: "$_id",
                    company_name: 1,
                    company_id: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    company_valuation: "$company_info.company_valuation",
                    country_id: 1,
                    total_holdings: 1,
                    token_row_ids: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = company_holdingM.aggregate([
            {
                $match: {
                    company_type: 1
                }
            },
            {
                $group: {
                    _id: "$company_row_id",
                    total_holdings: { $sum: '$purchased_value_in_usd' },
                    token_row_ids: {
                        $addToSet: {
                            $cond: {
                                if: { $eq: ["$token_type", 1] }, // Condition: Only add if token_type is "premium"
                                then: "$token_row_id",
                                else: "$$REMOVE" // Do not add if condition fails
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_added_to_partners",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "info_parnters",
                    pipeline: [
                        {
                            $project: {
                                _id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_parnters" } },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            login_status: 1
                                        }
                                    }
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
                                login_status: 1
                            }
                        },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1,

                                business_model_id: 1,
                                describe_in_one_line: 1,
                                main_business_model_id: 1,
                                country_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $set:
                {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id"
                }
            },
            {
                $match: { $and: searchArray }
            },
            {
                $count: 'count'
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])

        let token_row_ids: any[] = []
        for (let run of result1) {
            if (Array.isArray((run as any).token_row_ids)) {
                token_row_ids = token_row_ids.concat((run as any).token_row_ids)
            }
        }
        const token_list = await getTokenList({ token_ids: token_row_ids })

        const final_result = []
        for (let run of result1) {
            if ((run as any).token_row_ids) {
                (run as any)['tokens_list'] = await filterTokens({ token_ids: (run as any).token_row_ids, token_list })
            }
            final_result.push(run)
        }

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: final_result, count: total_counts, token_list: token_list }
    } else if (report_list_type === 8) {
        const get_query = await jobsM.aggregate([
            // only companies that actually have (active, non-deleted) jobs
            { $match: { active_status: "active", is_deleted: false } },
            { $sort: { createdAt: -1 } },

            // group jobs per company
            {
                $group: {
                    _id: "$company_row_id",
                    job_roles: { $push: "$job_title" }  // flat array of job titles
                }
            },
            // ✅ defensive check (ensure at least one job)
            { $match: { $expr: { $gt: [{ $size: "$job_roles" }, 0] } } },

            // join with company info
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },
                        {
                            $lookup:
                            {
                                from: "cln_company_added_to_partners",
                                localField: "_id",
                                foreignField: "company_row_id",
                                as: "info_parnters",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_parnters" } },
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1, login_status: 1 } }],
                            },
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: {
                                    $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 },
                                },
                            },
                        },
                        { $match: { login_status: 1 } },
                        {
                            $project: {
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
                            },
                        },
                    ],
                },
            },
            { $unwind: { path: "$company_info" } },

            // promote company fields to top-level so query can match them
            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    company_valuation: "$company_info.company_valuation",
                },
            },

            // ✅ your dynamic filters here
            { $match: match_query },

            // lookups using the promoted (top-level) fields
            {
                $lookup: {
                    from: "cln_static_company_business_models",
                    localField: "main_business_model_id",
                    foreignField: "_id",
                    as: "main_business_info",
                    pipeline: [{ $project: { business_name: 1 } }],
                },
            },
            { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_static_company_business_models",
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }],
                },
            },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }],
                },
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            // followers count
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
                                pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }],
                            },
                        },
                        { $unwind: { path: "$inner_user_info" } },
                        { $count: "count" },
                    ],
                },
            },

            // following/watchlist flags for current user
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id } }],
                    as: "info_user_following",
                },
            },
            { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { user_row_id } }],
                    as: "info_company_watchlist",
                },
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },

            // final projection
            {
                $project: {
                    _id: 1,
                    job_roles: 1, // array of jobs for this company

                    company_name: 1,
                    company_id: 1,
                    company_location: 1,
                    business_model_id: 1,
                    main_business_model_id: 1,
                    company_logo: 1,
                    describe_in_one_line: 1,
                    company_valuation: 1,
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",

                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: {
                        $cond: [{ $gt: [{ $size: "$followers_info" }, 0] }, "$followers_info.count", 0],
                    },
                },
            },
        ]).skip(skip).limit(limit);





        // count companies that have jobs (matching `query`)
        const count_query = await jobsM.aggregate([
            // only active / non-deleted jobs
            { $match: { active_status: "active", is_deleted: false } },

            // sort (optional for grouping, keeps newest jobs at front of pushed array if needed)
            { $sort: { createdAt: -1 } },

            // group jobs per company
            {
                $group: {
                    _id: "$company_row_id",
                    job_titles: {
                        $push: {
                            job_title: "$job_title",
                            country_id: "$country_id",
                            experience_level: "$experience_level",
                            job_type: "$job_type",
                            work_location_type: "$work_location_type",
                            location: "$location",
                            salary_from: "$salary_from",
                            salary_to: "$salary_to",
                            no_of_openings: "$no_of_openings",
                            application_deadline: "$application_deadline",
                            job_description: "$job_description",
                            createdAt: "$createdAt",
                        },
                    },
                },
            },

            // ensure at least one job (defensive)
            { $match: { $expr: { $gt: [{ $size: "$job_titles" }, 0] } } },

            // join with company info and ensure company is approved/active + user login_status check
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1, login_status: 1 } },
                                ],
                            },
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: {
                                    $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 },
                                },
                            },
                        },
                        { $match: { login_status: 1 } },
                        {
                            $project: {
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
                            },
                        },
                    ],
                },
            },

            // remove companies that were not found / filtered out in the lookup
            { $unwind: { path: "$company_info" } },

            // promote company fields so `query` can match top-level fields
            {
                $set: {
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_location: "$company_info.company_location",
                    business_model_id: "$company_info.business_model_id",
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    company_valuation: "$company_info.company_valuation",
                    latitude: "$company.latitude",
                    longitude: "$company.longitude",
                },
            },

            // apply the dynamic filters (same `query` you use for the data pipeline)
            { $match: match_query },

            // finally count matching companies
            { $count: "count" },
        ]);



        const [result1, result2] = await Promise.all([get_query, count_query]);

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: result1, count: total_counts }
    }
    return { list: [], count: 0 }
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

        const { status, message }: any = await companyIndividualDetails({ user_row_id, company_id });
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
        console.error('Error in getCompanyIndividualDetails:', error);
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            cache_reponse_status: false
        };
    }
}

const companyIndividualDetails = async ({ user_row_id, company_id }: { user_row_id: number, company_id: string }) => {
    let result: any = {}
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
        companyM.updateOne({ _id: company_row_id }, { $inc: { view_counts: 1 } }).catch((err: any) => {
            console.error('Error updating view count:', err);
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

export const companyOtherDetails = async ({ user_row_id, company_row_id, req }: { user_row_id: number, company_row_id: number, req: any }) => {
    // Early validation
    if (!company_row_id || Number.isNaN(company_row_id) || company_row_id <= 0) {
        return { status: false, message: { alert_message: 'Invalid company row id' } };
    }

    // Generate cache key with stable query string
    const queryString = JSON.stringify(req.query || {});
    const key = `app_company_individual_other_details_${company_row_id}_${user_row_id}_${queryString}`;

    // Check cache first
    const cachedData = await redisCache.getCache({ key });
    // if (cachedData && cachedData.status) {
    //     return {
    //         status: true,
    //         message: cachedData.message,
    //         cache_response_status: true
    //     };
    // }
    const get_query = await companyM.findOne({ _id: company_row_id, approval_status: 1, active_status: 1 }, { _id: 1, main_business_model_id: 1 }).lean()
    if (get_query) {

        let result: any = {}
        result['login_user_company_created_status'] = false
        if (user_row_id != 0) {
            result['logged_in_user_row_id'] = user_row_id
            const get_company = await companyM.findOne({ user_row_id: user_row_id }, { _id: 1 }).lean()
            if (get_company) {
                result['login_user_company_created_status'] = true
            }
        }

        result['emp_approval_req_status'] = 0
        if ((user_row_id > 0) && (user_row_id != company_row_id)) {
            const employees_request_query = await employees_requestsM.findOne({ company_row_id: company_row_id, user_row_id: user_row_id }, { approval_status: 1 }).lean()
            if (employees_request_query) {
                result['emp_approval_req_status'] = employees_request_query.approval_status
            }
        }

        const faq_query = company_faqM.find({ company_row_id: company_row_id }, { _id: 1, faq_question: 1, faq_answer: 1 }).lean()


        const peoples_in_company_query = professionals_work_experienceM.aggregate([
            {
                $match: {
                    verified_status: true,
                    company_row_id: company_row_id,
                    company_type: 1,
                    till_date_status: 2
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_professionals_work_positions",
                    localField: "position_row_id",
                    foreignField: "_id",
                    as: "info_position",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                position_name: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_manual_user_positions",
                    let: {
                        position_type: '$position_type',
                        sub_position_row_id: '$sub_position_row_id'
                    },
                    as: "manual_position_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: [2, "$$position_type"] },
                                        { $eq: ["$_id", "$$sub_position_row_id"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                position_name: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_static_professionals_work_positions",
                    let: { positions: { $ifNull: ["$positions", []] } },
                    as: "resolved_static_positions",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.position_row_id" } }]
                                }
                            }
                        },
                        { $project: { _id: 1, position_name: 1 } }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_manual_user_positions",
                    let: { positions: { $ifNull: ["$positions", []] } },
                    as: "resolved_manual_positions",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.sub_position_row_id" } }]
                                }
                            }
                        },
                        { $project: { _id: 1, position_name: 1 } }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    let: {
                        user_row_id: '$user_row_id',
                        user_account_type: '$user_account_type'
                    },
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, "$$user_account_type"] },
                                                { $eq: ["$_id", "$$user_row_id"] }
                                            ]
                                        }
                                    },
                                    {
                                        login_status: 1
                                    },
                                ]
                            }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                                profile_image: "$img_info.profile_image",
                                pro_batch: 1,
                                approval_status: 1

                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_manual_retrievals",
                    let: {
                        user_row_id: '$user_row_id',
                        user_account_type: '$user_account_type'
                    },
                    as: "manual_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: [2, "$$user_account_type"] },
                                        { $eq: ["$_id", "$$user_row_id"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                email_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    user_data: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$user_account_type', 1] }
                                        ]
                                    },
                                    then: "$user_info"
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$user_account_type', 2] }
                                        ]
                                    },
                                    then: "$manual_info"
                                },
                            ],
                            default: ""
                        }
                    }

                }
            },
            {
                $set: {
                    user_name: "$user_data.user_name",
                    full_name: "$user_data.full_name",
                    position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
                    positions: {
                        $cond: {
                            if: { $gt: [{ $size: { $ifNull: ["$positions", []] } }, 0] },
                            then: {
                                $map: {
                                    input: { $ifNull: ["$positions", []] },
                                    as: "p",
                                    in: {
                                        position_type: "$$p.position_type",
                                        position_row_id: "$$p.position_row_id",
                                        sub_position_row_id: "$$p.sub_position_row_id",
                                        position_name: {
                                            $cond: {
                                                if: { $eq: ["$$p.position_type", 2] },
                                                then: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_manual_positions", cond: { $eq: ["$$this._id", "$$p.sub_position_row_id"] } } }, in: "$$this.position_name" } }, 0] },
                                                else: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_static_positions", cond: { $eq: ["$$this._id", "$$p.position_row_id"] } } }, in: "$$this.position_name" } }, 0] }
                                            }
                                        }
                                    }
                                }
                            },
                            else: [{
                                position_type: "$position_type",
                                position_row_id: "$position_row_id",
                                sub_position_row_id: "$sub_position_row_id",
                                position_name: {
                                    $cond: {
                                        if: { $eq: ["$position_type", 2] },
                                        then: "$manual_position_info.position_name",
                                        else: "$info_position.position_name"
                                    }
                                }
                            }]
                        }
                    },
                }
            },
            {
                $lookup:
                {
                    from: "cln_professionals_followers",
                    localField: "user_row_id",
                    foreignField: "following_user_row_id",
                    pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                    as: "user_followed"
                }
            },
            { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_social_links",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "social_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                website: 1,
                                facebook: 1,
                                twitter: 1,
                                linkedin: 1,
                                instagram: 1,
                                telegram: 1,
                                medium: 1,
                                reddit: 1,
                                feed_url: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    user_data: { $exists: true, $ne: "" }
                }
            },
            {
                $project: {
                    _id: 1,
                    user_account_type: 1,
                    user_row_id: 1,
                    user_name: 1,
                    full_name: 1,
                    email_id: "$user_data.email_id",
                    profile_image: "$user_data.profile_image",
                    pro_batch: "$user_data.pro_batch",
                    user_approval_status: "$user_data.approval_status",
                    verified_status: 1,
                    designation_type: 1,
                    employment_type: 1,
                    position_name: 1,
                    location_type: 1,
                    start_date: 1,
                    responsibilities: 1,
                    positions: 1,
                    social_links: "$social_info",
                    user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } },
                }
            }
        ])

        const profile_completed_percentage_data = company_profile_completed_percentage(result)


        const revenue_data = companyIndividualRevenue({ company_row_id, req })

        const event_data = companyIndividualEvents({ company_row_id, req })

        const main_business_model_id = get_query.main_business_model_id
        const similar_companies_query = companyM.aggregate([
            {
                $match: { _id: { $ne: company_row_id }, approval_status: 1, active_status: 1, main_business_model_id: main_business_model_id }
            },
            { $sort: { _id: -1 } },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                login_status: { $ne: 1 }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                login_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } },
                }
            },
            {
                $match: {
                    login_status: 1
                }
            },

            {
                $lookup: {
                    from: "cln_static_company_business_models",
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
                }
            },
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
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup:
                            {
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
                            $count: 'count'
                        }
                    ]
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
                $lookup:
                {
                    from: "cln_company_watchlists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "info_company_watchlist"
                }
            },
            { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_id: 1,
                    company_logo: 1,
                    established_in: 1,
                    describe_in_one_line: 1,
                    company_size_row_id: 1,
                    company_location: 1,
                    company_valuation: 1,
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).limit(4)

        const has_products_query = company_productsM.exists({
            company_row_id: company_row_id,
            company_type: 1
        });

        const hasHoldings_query = company_holdingM.exists({
            company_row_id,
            company_type: 1
        });

        const has_invested_query = fundingM.exists({
            investor_row_id: company_row_id,
            investor_type: 2,
            investor_registered_type: 1,
            verified_status: 1
        });

        const has_raised_query = fundingM.exists({
            funds_raised_company_row_id: company_row_id,
            funds_raised_registered_type: 1,
            verified_status: 1
        });

        const hasApplicants_query = jobsM.exists({ company_row_id, is_deleted: false });

        const [faq_list, peoples_in_company, profile_completed_percentage, revenue, event, similar_companies, has_products, hasHoldings, has_invested, has_raised, hasApplicants] = await Promise.all([faq_query, peoples_in_company_query, profile_completed_percentage_data, revenue_data, event_data, similar_companies_query, has_products_query, hasHoldings_query, has_invested_query, has_raised_query, hasApplicants_query])

        result['faq_list'] = faq_list
        result['peoples_in_company'] = peoples_in_company
        result['profile_completed_percentage'] = profile_completed_percentage
        result['revenue'] = revenue
        result['event'] = event
        result['similar_companies'] = similar_companies
        result['hasHoldings'] = !!hasHoldings;
        result['has_products'] = !!has_products;
        result['has_invested'] = !!has_invested;
        result['has_raised'] = !!has_raised;
        result['hasApplicants'] = !!hasApplicants;

        // Set cache asynchronously (non-blocking)
        redisCache.setCache({
            key,
            value: result,
            ttl: CacheDuration.THIRTY_MINUTES
        }).catch((err: Error) => console.error('Cache set error:', err));

        return { status: true, message: result, cache_response_status: false }
    }
    else {
        return { status: false, message: { alert_message: 'Invalid company row id' } }
    }
}

const companyIndividualRevenue = async ({ company_row_id, req }: { company_row_id: number, req: any }) => {
    let result: any = {}
    let matchFilter: any = { company_row_id };

    if (req?.query?.year && !Number.isNaN(Number.parseInt(req.query.year))) {
        matchFilter.year = Number.parseInt(req.query.year);
    }

    if (req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))) {
        matchFilter.quarter = Number.parseInt(req.query.quarter);
    }

    // let revenueStreamId = null;
    // if (req?.query?.revenue_streams && !Number.isNaN(Number.parseInt(req.query.revenue_streams))) {
    //     revenueStreamId = Number.parseInt(req.query.revenue_streams);
    // }

    result['recent'] = await company_revenue_growthM.findOne({ company_row_id: company_row_id }).sort({ _id: -1 }).lean()


    // Main yearly list with quarter details
    result['list'] = await company_revenue_growthM.aggregate([
        { $match: matchFilter },
        {
            $group: {
                _id: "$year",
                total_revenue: { $sum: "$revenue" }
            }
        },
        { $sort: { _id: -1 } },
        {
            $lookup: {
                from: "cln_company_revenue_details",
                localField: "_id",
                foreignField: "year",
                as: "info_quarter_list",
                pipeline: [
                    {
                        $match: {
                            company_row_id: company_row_id,
                            ...(req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))
                                ? { quarter: Number.parseInt(req.query.quarter) }
                                : {})
                        }
                    },
                    { $sort: { quarter: -1 } },
                    {
                        $lookup: {
                            from: "cln_static_company_revenue_streams",
                            localField: "revenue_streams.category_row_id",
                            foreignField: "_id",
                            as: "info_revenue_streams",
                            pipeline: [
                                {
                                    $project: {
                                        _id: 1,
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            revenue_streams_list: {
                                $map: {
                                    input: "$revenue_streams",
                                    as: "c",
                                    in: {
                                        category_row_id: "$$c.category_row_id",
                                        stream_amount: "$$c.stream_amount",
                                        category_name: {
                                            $arrayElemAt: [
                                                "$info_revenue_streams.category_name",
                                                {
                                                    $indexOfArray: [
                                                        "$info_revenue_streams._id",
                                                        "$$c.category_row_id"
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    },
                    ...(req.query.revenue_streams ? [{
                        $match: {
                            revenue_streams_list: {
                                $elemMatch: {
                                    category_row_id: Number.parseInt(req.query.revenue_streams)
                                }
                            }
                        }
                    }] : []),
                    {
                        $project: {
                            _id: 1,
                            quarter: 1,
                            revenue: 1,
                            revenue_streams_list: 1
                        }
                    }
                ]
            }
        },
        {
            $match: {
                info_quarter_list: { $ne: [] }
            }
        },
        {
            $project: {
                _id: 0,
                year: "$_id",
                total_revenue: 1,
                quarter_list: "$info_quarter_list"
            }
        }
    ])

    result['list2'] = await company_revenue_growthM.aggregate([
        { $match: matchFilter },
        { $sort: { year: -1, quarter: 1 } },
        {
            $group: {
                _id: "$year",
                quarters: { $push: "$quarter" },
                total_revenue: { $sum: "$revenue" }
            }
        },
        { $project: { _id: 0, year: "$_id", quarters: 1, total_revenue: 1 } },
        { $sort: { year: -1 } }
    ])


    const revenue_count_query = await company_revenue_growthM.aggregate([
        { $match: { company_row_id: company_row_id } },
        {
            $group: {
                _id: "$year",
            }
        },
        {
            $count: 'count'
        }
    ])

    result['count'] = revenue_count_query[0] ? revenue_count_query[0].count : 0
    result['list_by_year'] = await company_revenue_growthM.aggregate([
        { $match: { company_row_id: company_row_id } },
        { $group: { _id: "$year", total_revenue: { $sum: "$revenue" } } },
        { $sort: { _id: 1 } }
    ])

    const total_revenue_query = await company_revenue_growthM.aggregate([
        { $match: { company_row_id: company_row_id } },
        { $group: { _id: null, total_revenue: { $sum: "$revenue" } } }
    ])
    result['total_revenue'] = total_revenue_query[0] ? total_revenue_query[0].total_revenue : 0
    return result
}

const companyIndividualEvents = async ({ company_row_id, req }: { company_row_id: number, req: any }) => {
    let result: any = {}
    const filter_array = [{ active_status: 1, approval_status: 1, company_row_id: company_row_id, list_event_type: { $in: [2, 3] } }]
    const search_query = [{}]
    let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, sort: undefined, event_status: undefined })
    const sort_value = { end_date: -1 }

    const { list } = await getEventsData({
        sort_value: sort_value,
        top_filter_array: { $and: top_filter_array },
        search_query: { $and: search_array },
        req_query: undefined,
        req_params: undefined,
        req_headers: req.headers
    })
    result['hosts'] = list

    result['sponsors'] = []
    const check_sponsors = await event_sponsors_partner_detailsM.find({ account_type: 2, registered_type: 1, sponsor_partner_type: 1, user_company_row_id: company_row_id }, { event_row_id: 1 }).lean()
    if (check_sponsors) {
        const sponsor_array = await array_column(check_sponsors, 'event_row_id')
        if (sponsor_array.length) {
            const filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: sponsor_array }, list_event_type: { $in: [1, 2, 3] } }]
            let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, sort: undefined, event_status: undefined })
            const { list } = await getEventsData({
                sort_value: sort_value,
                top_filter_array: { $and: top_filter_array },
                search_query: { $and: search_array },
                req_query: undefined,
                req_params: undefined,
                req_headers: req.headers
            })
            result['sponsors'] = list
        }
    }

    result['partners'] = []
    const check_partners = await event_sponsors_partner_detailsM.find({ account_type: 2, registered_type: 1, sponsor_partner_type: 2, user_company_row_id: company_row_id }, { event_row_id: 1 }).lean()
    if (check_partners) {
        const partner_array = await array_column(check_partners, 'event_row_id')
        if (partner_array.length) {
            const filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: partner_array }, list_event_type: { $in: [1, 2, 3] } }]
            let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, sort: undefined, event_status: undefined })
            const { list } = await getEventsData({
                sort_value: sort_value,
                top_filter_array: { $and: top_filter_array },
                search_query: { $and: search_array },
                req_query: undefined,
                req_params: undefined,
                req_headers: req.headers
            })
            result['partners'] = list
        }
    }

    return result
}


const getPopularCompanies = async () => {
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
            .catch((err: Error) => console.error('Cache set error:', err));

        return {
            status: true,
            message: result,
            cache_response_status: false
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error('Error in getPopularCompanies:', {
            error: errorMessage,
            stack: errorStack,
            timestamp: new Date().toISOString()
        });

        // Return appropriate error response
        return {
            status: false,
            message: 'An error occurred while fetching popular companies',
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        };
    }
}

const getTrendingCompanies = async (user_row_id: number, skip: number, limit: number) => {
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
            .catch((err: Error) => console.error('Cache set error:', err));

        return {
            status: true,
            message: result,
            cache_response_status: false
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error('Error in getTrendingCompanies:', {
            error: errorMessage,
            stack: errorStack,
            timestamp: new Date().toISOString(),
            user_row_id,
            skip,
            limit
        });

        return {
            status: false,
            message: 'An error occurred while fetching trending companies',
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        };
    }
}

const searchCompanies = async (search: string, limit: number) => {
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
            .catch((err: Error) => console.error('Cache set error:', err));

        return {
            status: true,
            message: result,
            cache_response_status: false
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Enhanced error logging with context
        console.error('Error in searchCompanies:', {
            error: errorMessage,
            stack: errorStack,
            timestamp: new Date().toISOString(),
            search: search?.slice(0, 100), // Limit search term in logs
            limit,
            query_time: Date.now()
        });

        return {
            status: false,
            message: [],
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        };
    }
}

export { getPopularCompanies, getTrendingCompanies, searchCompanies, getCompanyListDetails };