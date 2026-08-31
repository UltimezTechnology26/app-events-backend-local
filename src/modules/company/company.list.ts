// modules/company/company.list.ts
//
// The company listing endpoint (getCompanyListDetails) and its legacy
// per-report-type dispatcher, relocated verbatim from services/company/front_page.ts
// (Part 3 §7 Phase H step 13). No behavior change.
//
// IMPORTANT — companyList() below is NOT fully dead despite report_list_type
// 1/3/4 being fully bypassed by runCompanyListBranch (those 3 branches inside
// companyList are unreachable leftovers from before this dispatcher existed).
// report_list_type 2 (event organizers) and 8 (hiring/jobs) are still live,
// still fully inline here — never migrated to their own module functions the
// way 1/3/4/5/6/7 were. Confirmed via direct trace before this move (a prior
// Build Order note incorrectly listed this whole function as dead — see
// docs/company-module/requirements.md's Phase H.13 write-up for the
// correction). Re-migrating those 2 remaining branches into clean module
// functions (matching modules/company_overview/'s REPORT_TYPE_CONFIG pattern)
// is tracked as separate future work, not done in this move.
﻿import { buildProfessionalEnrichmentStages } from '../../modules/common/common.enrichment';
import logger from '../../../config/logger';
import { PARTNER_FILTER_STAGE } from '../../modules/company_overview/company_overview.stages';
import { getOverviewAggregatePromise } from '../../modules/company_overview/company_overview.service';
import { buildType3ValuationPipeline, buildType3FundsRaisedPipeline } from '../../modules/company_overview/company_overview.config';
import { buildType5ValuationPipeline, buildType5RevenuePipeline } from '../../modules/company_overview/company_overview.config';
import { buildType7ValuationPipeline, buildType7HoldingPipeline } from '../../modules/company_overview/company_overview.config';
import { buildType4ValuationPipeline, buildType4InvestedPipeline, buildType4RoundsPipeline } from '../../modules/company_overview/company_overview.config';
import { buildType6ValuationPipeline, buildType6ProductCountPipeline } from '../../modules/company_overview/company_overview.config';
import { buildType2ValuationPipeline, buildType2OrganizersPipeline, buildType2SponsorPartnerPipeline } from '../../modules/company_overview/company_overview.config';
import { getWatchlistValuation } from '../../modules/company_overview/company_overview.watchlist';
import { getCompanyRevenueReportList, getPartnerRevenueReportList } from '../../modules/company_revenue/company_revenue.queries';
import { getCompanyProductsReportList, getPartnerProductsReportList } from '../../modules/company_products/company_products.queries';
import { getCompanyHoldingsReportList, getPartnerHoldingsReportList } from '../../modules/company_holdings/company_holdings.queries';
const company_revenue_growthM = require("../../../models/app/company/company_revenue_growthM");
const eventM = require("../../../models/app/events/eventM");
const fundingM = require("../../../models/app/funding/fundingInvestmentM");
const jobsM = require("../../../models/app/jobs/jobsM");
import { getCompanyProducts, getMatchedProducts, getTokenList } from "../../../utils/helpers/app_helper";
import { array_column, company_profile_completed_percentage, getMinusDates } from "../../../utils/helpers/helper";
import redisCache, { CacheDuration } from "../../../config/redis";
import company_deleted_historyM from "../../../models/app/company/company_deleted_historyM";
import company_faqM from "../../../models/app/company/company_faqM";
import professionals_work_experienceM from "../../../models/app/professionals_work_experienceM";
import employees_requestsM from "../../../models/app/company/employees_requestsM";
import company_productsM from "../../../models/markets/products_n_holding/company_productsM";
import company_holdingM from "../../../models/markets/products_n_holding/company_holdingM";
import { getEventsData, professionalfilterQuery } from "../../../utils/helpers/events_helper";
import event_sponsors_partner_detailsM from "../../../models/app/events/event_sponsors_partner_detailsM";
import { getCompanyListType1Result } from "../../modules/company/company.service";
import { getCompanyListFundsRaisedResult, getCompanyListFundsInvestedResult, getPartnersListFundsRaisedResult, getPartnersListFundsInvestedResult } from "../../modules/funding/funding.service";

// Import required dependencies
const { getDistanceFromLatLon } = require('../../../utils/helpers/helper');
import { getIntValues } from '@ultimez-interview/coinpedia-backend-library/validation';
const countryM = require('../../../models/app/static/countryM');
const companyM = require('../../../models/app/company/companyM');
const sanitize = require('mongo-sanitize');
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM');
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
                        ...buildProfessionalEnrichmentStages()
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
                        ...buildProfessionalEnrichmentStages(),
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
                        ...buildProfessionalEnrichmentStages(),
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
        // Moved to modules/company_revenue/company_revenue.queries.ts's
        // getCompanyRevenueReportList (Part 3 §7 Phase D step 2) — same pipeline,
        // now ending in a single $facet instead of two separately-run
        // list/count aggregates.
        return getCompanyRevenueReportList({ query, skip, limit, user_row_id, boundingBox })
    }
    else if (report_list_type === 6) {
        // Moved to modules/company_products/company_products.queries.ts's
        // getCompanyProductsReportList (Part 3 §7 Phase E step 5) — same pipeline,
        // now ending in a single $facet instead of two separately-run
        // list/count aggregates.
        return getCompanyProductsReportList({ query, skip, limit, user_row_id, boundingBox })
    }
    else if (report_list_type === 7) {
        // Moved to modules/company_holdings/company_holdings.queries.ts's
        // getCompanyHoldingsReportList (Part 3 §7 Phase E step 5) — same pipeline,
        // now ending in a single $facet instead of two separately-run
        // list/count aggregates.
        return getCompanyHoldingsReportList({ query, skip, limit, user_row_id, boundingBox })
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

                        ...buildProfessionalEnrichmentStages(),

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

                        ...buildProfessionalEnrichmentStages(),

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

/**
 * Dispatches to the migrated modules/company/ or modules/funding/ implementation
 * for the report_list_types extracted so far (1, 3, 4 — Part 3 §7 Phase B steps
 * 3/4); everything else still runs through the legacy companyList() until its
 * own phase migrates it (Phase D for revenue, Phase E for products/holdings,
 * Events stays out of scope).
 */
const runCompanyListBranch = async (params: {
    report_list_type: number
    query: any
    skip: number
    limit: number
    user_row_id: any
    sort_filter: any
    match_query: any
    boundingBox: any
}) => {
    if (params.report_list_type === 1) {
        return getCompanyListType1Result({ query: params.query, skip: params.skip, limit: params.limit, user_row_id: params.user_row_id, sort_filter: params.sort_filter, boundingBox: params.boundingBox });
    }
    if (params.report_list_type === 3) {
        return getCompanyListFundsRaisedResult({ query: params.query, skip: params.skip, limit: params.limit, user_row_id: params.user_row_id, boundingBox: params.boundingBox });
    }
    if (params.report_list_type === 4) {
        return getCompanyListFundsInvestedResult({ query: params.query, skip: params.skip, limit: params.limit, user_row_id: params.user_row_id, boundingBox: params.boundingBox });
    }
    return companyList(params as CompanyListParams);
};

export const getCompanyListDetails = async (reqQuery: any, skip: number, limit: number, user_row_id: number = 0) => {
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

            const data: any = await runCompanyListBranch({
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

        // Cache READ re-enabled (Part 3 §7 Phase B step 3, confirmed with the user
        // before implementing): this was dead code (getCache called but its result
        // never checked), so every "cache mode" list request recomputed from scratch
        // even with a valid 12-hour cache entry. Invalidation for app_company_list_*
        // is already wired into ~15 write-path files, confirmed before enabling this.
        if (cacheResponse.status) {
            return {
                status: true,
                message: cacheResponse.message.list,
                count: cacheResponse.message.count,
                top_countries: topCountries,
                cache_reponse_status: true
            };
        }

        const data: any = await runCompanyListBranch({
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

    } catch (error) {
        logger.error(`Company list details. ${(error as Error).message}`);
        return {
            status: false,
            message: 'An error occurred while fetching company details',
            count: 0,
            top_countries: [],
            cache_reponse_status: false
        };
    }
};
