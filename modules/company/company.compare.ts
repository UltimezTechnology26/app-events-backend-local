// modules/company/company.compare.ts
//
// The company comparison-page backend (compare_companies_by_ids), relocated
// verbatim from controllers/app/company/front_page.js (Part 3 §7 Phase H
// step 14). No behavior change — exported as a plain Express handler
// (req, res) => {...} since nothing else in the codebase calls this outside
// an HTTP request (unlike the Phase H.13 moves, which needed a callable
// (req) => result shape for the characterization harness). Confirmed live:
// frontend-appcp-typescript's /compare/companies page.
const companyM = require('../../models/app/company/companyM')
const { checkUserLoginToken } = require('../../middleware/authorization')

export const compareCompaniesByIds = async (req: any, res: any) => {
    try {
        let user_row_id = "";
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message;
        }

        let company_row_ids = [];
        if (req.query.company_row_ids) {
            try {
                company_row_ids = JSON.parse(req.query.company_row_ids);
            } catch (e) {
                return res.json({
                    status: false,
                    message: { alert_message: "Invalid company_row_ids format" },
                });
            }
        }

        if (!Array.isArray(company_row_ids) || !company_row_ids.length) {
            return res.json({
                status: false,
                message: { alert_message: "company_row_ids field is required" },
            });
        }

        const get_query = await companyM
            .aggregate([
                {
                    $match: {
                        _id: { $in: company_row_ids },
                        approval_status: 1,
                        active_status: 1,
                    },
                },

                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        let: { companyId: "$_id" },
                        as: "employee_count_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$company_row_id", "$$companyId"] },
                                            { $eq: ["$company_type", 1] },
                                            { $eq: ["$till_date_status", 2] }
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_professionals",
                                    let: { user_row_id: "$user_row_id", user_account_type: "$user_account_type" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, "$$user_account_type"] },
                                                        { $eq: ["$_id", "$$user_row_id"] }
                                                    ]
                                                },
                                                login_status: 1
                                            }
                                        },
                                        { $project: { _id: 1 } }
                                    ],
                                    as: "valid_user"
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_professionals_manual_retrievals",
                                    let: { user_row_id: "$user_row_id", user_account_type: "$user_account_type" },
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
                                        { $project: { _id: 1 } }
                                    ],
                                    as: "valid_manual"
                                }
                            },
                            {
                                $match: {
                                    $or: [
                                        { $expr: { $gt: [{ $size: "$valid_user" }, 0] } },
                                        { $expr: { $gt: [{ $size: "$valid_manual" }, 0] } }
                                    ]
                                }
                            },
                            { $count: "total_employees" }
                        ]
                    }
                }
                ,
                { $unwind: { path: "$employee_count_info", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        total_employees: { $ifNull: ["$employee_count_info.total_employees", 0] }
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
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,

                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_company_watchlists",
                        localField: "_id",
                        foreignField: "company_row_id",
                        pipeline: [{ $match: { user_row_id: user_row_id } }],
                        as: "info_watchlist",
                    },
                },
                {
                    $unwind: {
                        path: "$info_watchlist",
                        preserveNullAndEmptyArrays: true,
                    },
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
                    $lookup: {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "country_info",
                        pipeline: [{ $project: { country_name: 1, country_flag: 1 } }],
                    },
                },
                { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_company_revenue_details",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "revenue_info",
                        pipeline: [
                            { $group: { _id: "$year", year_revenue: { $sum: "$revenue" } } },
                            { $sort: { _id: 1 } }
                        ]
                    }
                },
                {
                    $addFields: {
                        total_revenue: { $sum: "$revenue_info.year_revenue" },
                        total_years: {
                            $cond: [
                                { $gt: [{ $size: "$revenue_info" }, 1] },
                                {
                                    $subtract: [
                                        { $arrayElemAt: ["$revenue_info._id", -1] },
                                        { $arrayElemAt: ["$revenue_info._id", 0] }
                                    ]
                                },
                                0
                            ]
                        },
                        latest_revenue: {
                            $cond: [
                                { $gt: [{ $size: "$revenue_info" }, 0] },
                                { $arrayElemAt: ["$revenue_info.year_revenue", -1] },
                                0
                            ]
                        }
                    }
                },

                {
                    $lookup: {
                        from: "cln_funding_investment_lists",
                        localField: "_id",
                        foreignField: "funds_raised_company_row_id",
                        as: "funding_info",
                        pipeline: [
                            {
                                $match: { verified_status: 1, funds_raised_registered_type: 1 }
                            },
                            // Normalize investor validation
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
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, "$$investor_type"] },
                                                        { $eq: [1, "$$investor_registered_type"] },
                                                        { $eq: ["$_id", "$$investor_row_id"] }
                                                    ]
                                                }
                                            }
                                        },
                                        { $match: { active_status: 1 } },
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
                            { $match: { investor_data: { $gt: 0 } } },

                            // Collapse to one document per round_id BEFORE the facet, so a
                            // multi-investor round's shared amount is counted once instead of
                            // once per investor row, and uniqueRounds counts actual rounds
                            // instead of round types. investor_identities preserves per-row
                            // investor info so uniqueInvestors still sees every distinct
                            // investor across the round.
                            {
                                $group: {
                                    _id: "$round_id",
                                    amount: { $first: "$amount" },
                                    category_row_id: { $first: "$category_row_id" },
                                    investor_identities: {
                                        $push: {
                                            investor_type: "$investor_type",
                                            investor_registered_type: "$investor_registered_type",
                                            investor_row_id: "$investor_row_id"
                                        }
                                    }
                                }
                            },
                            { $unwind: "$investor_identities" },

                            // ---- Final facet counts after proper filtering ----
                            {
                                $facet: {
                                    totalRaised: [
                                        { $group: { _id: "$_id", amount: { $first: "$amount" } } },
                                        { $group: { _id: null, total: { $sum: "$amount" } } }
                                    ],
                                    uniqueRounds: [
                                        { $group: { _id: "$_id" } },
                                        { $count: "count" }
                                    ],
                                    uniqueInvestors: [
                                        {
                                            $group: {
                                                _id: {
                                                    investor_type: "$investor_identities.investor_type",
                                                    investor_registered_type: "$investor_identities.investor_registered_type",
                                                    investor_row_id: "$investor_identities.investor_row_id"
                                                }
                                            }
                                        },
                                        { $count: "count" }
                                    ]
                                }
                            },
                            {
                                $project: {
                                    total_usd_value: {
                                        $ifNull: [{ $arrayElemAt: ["$totalRaised.total", 0] }, 0]
                                    },
                                    total_unique_funding_rounds: {
                                        $ifNull: [{ $arrayElemAt: ["$uniqueRounds.count", 0] }, 0]
                                    },
                                    total_unique_investors: {
                                        $ifNull: [{ $arrayElemAt: ["$uniqueInvestors.count", 0] }, 0]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$funding_info", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        total_funds_raised_amount: { $ifNull: ["$funding_info.total_usd_value", 0] },
                        total_unique_funding_rounds: { $ifNull: ["$funding_info.total_unique_funding_rounds", 0] },
                        total_unique_investors: { $ifNull: ["$funding_info.total_unique_investors", 0] }
                    }
                },
                {
                    $lookup: {
                        from: "cln_funding_investment_lists",
                        let: { companyId: "$_id" },
                        as: "investment_info",
                        pipeline: [
                            {
                                $match: {
                                    verified_status: 1,
                                    investor_registered_type: 1,
                                    $expr: {
                                        $and: [
                                            { $eq: ["$investor_type", 2] },
                                            { $eq: ["$investor_row_id", "$$companyId"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_company_lists",
                                    let: {
                                        funds_raised_registered_type: "$funds_raised_registered_type",
                                        funds_raised_company_row_id: "$funds_raised_company_row_id"
                                    },
                                    as: "company_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, "$$funds_raised_registered_type"] },
                                                        { $eq: ["$_id", "$$funds_raised_company_row_id"] }
                                                    ]
                                                }
                                            }
                                        },
                                        { $match: { active_status: 1 } },
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
                                                    case: { $eq: ["$funds_raised_registered_type", 1] },
                                                    then: "$company_info._id"
                                                },
                                                {
                                                    case: { $eq: ["$funds_raised_registered_type", 2] },
                                                    then: "$funds_raised_company_row_id"
                                                }
                                            ],
                                            default: 0
                                        }
                                    }
                                }
                            },
                            { $match: { investor_data: { $gt: 0 } } },

                            // Self-lookup: count how many total rows (across all investors)
                            // share this row's round_id, to detect syndicate (multi-investor)
                            // rounds.
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
                            // Exclude syndicate rounds (more than 1 investor sharing round_id)
                            // entirely — this investor's individual contribution to a shared
                            // round isn't known, so it's left out rather than deduped-and-kept.
                            {
                                $match: {
                                    $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                                }
                            },

                            {
                                $facet: {
                                    totalInvested: [
                                        { $group: { _id: null, total: { $sum: "$amount" } } }
                                    ],
                                    uniqueRounds: [
                                        { $group: { _id: "$round_id" } },
                                        { $count: "count" }
                                    ],
                                    uniqueCompanies: [
                                        {
                                            $group: {
                                                _id: {
                                                    funds_raised_registered_type: "$funds_raised_registered_type",
                                                    funds_raised_company_row_id: "$funds_raised_company_row_id"
                                                }
                                            }
                                        },
                                        { $count: "count" }
                                    ]
                                }
                            },
                            {
                                $project: {
                                    total_invested_amount: {
                                        $ifNull: [{ $arrayElemAt: ["$totalInvested.total", 0] }, 0]
                                    },
                                    total_invested_rounds: {
                                        $ifNull: [{ $arrayElemAt: ["$uniqueRounds.count", 0] }, 0]
                                    },
                                    total_invested_companies: {
                                        $ifNull: [{ $arrayElemAt: ["$uniqueCompanies.count", 0] }, 0]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$investment_info", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        total_invested_amount: { $ifNull: ["$investment_info.total_invested_amount", 0] },
                        total_invested_rounds: { $ifNull: ["$investment_info.total_invested_rounds", 0] },
                        total_invested_companies: { $ifNull: ["$investment_info.total_invested_companies", 0] }
                    }
                },
                {
                    $lookup: {
                        from: "cln_event_sponsor_partner_details",
                        let: { companyId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$user_company_row_id", "$$companyId"] },
                                            { $eq: ["$sponsor_partner_type", 1] },
                                            { $eq: ["$account_type", 2] },
                                            { $eq: ["$registered_type", 1] }
                                        ]
                                    }
                                }
                            },
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
                                        { $project: { _id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: false } },
                            { $project: { _id: 1, event_row_id: 1 } }
                        ],
                        as: "sponsors_info"
                    }
                },
                {
                    $addFields: {
                        sponsor_count: { $size: "$sponsors_info" }
                    }
                },
                {
                    $lookup: {
                        from: "cln_event_sponsor_partner_details",
                        let: { companyId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$user_company_row_id", "$$companyId"] },
                                            { $eq: ["$sponsor_partner_type", 2] },
                                            { $eq: ["$account_type", 2] },
                                            { $eq: ["$registered_type", 1] }
                                        ]
                                    }
                                }
                            },
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
                                        { $project: { _id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: false } },
                            { $project: { _id: 1, event_row_id: 1 } }
                        ],
                        as: "partners_info"
                    }
                },
                {
                    $addFields: {
                        partner_count: { $size: "$partners_info" }
                    }
                },


                {
                    $lookup: {
                        from: "cln_events",
                        let: { companyId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$company_row_id", "$$companyId"] },
                                    active_status: 1,
                                    approval_status: 1,
                                    list_event_type: { $in: [2, 3] }
                                }
                            },
                            {
                                $count: "host_count"
                            }
                        ],
                        as: "event_counts"
                    }
                },
                {
                    $addFields: {
                        host_count: {
                            $ifNull: [{ $arrayElemAt: ["$event_counts.host_count", 0] }, 0]
                        }
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
                { $set: { index: { $indexOfArray: [company_row_ids, "$_id"] } } },
                { $sort: { index: 1 } },
                { $unset: "index" },

                {
                    $project: {
                        _id: 1,
                        company_id: 1,
                        company_name: 1,
                        company_logo: 1,
                        describe_in_one_line: 1,
                        company_valuation: 1,
                        established_in: 1,
                        company_location: 1,
                        company_size_row_id: 1,
                        website_link: 1,

                        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                        country_flag: "$country_info.country_flag",
                        country_name: "$country_info.country_name",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        main_business_model_name: "$main_business_info.business_name",
                        business_name: "$business_info.business_name",
                        total_revenue: 1,
                        total_years: 1,
                        latest_revenue: 1,
                        watchlist_status: {
                            $cond: {
                                if: "$info_watchlist.company_row_id",
                                then: true,
                                else: false,
                            },
                        },
                        followers_count: {
                            $cond: {
                                if: { $gt: [{ $size: "$followers_info" }, 0] },
                                then: { $arrayElemAt: ["$followers_info.count", 0] },
                                else: 0,
                            },
                        },
                        total_employees: "$employee_count_info.total_employees",
                        total_funds_raised_amount: 1,
                        total_unique_funding_rounds: 1,
                        total_unique_investors: 1,
                        total_invested_amount: 1,
                        total_invested_rounds: 1,
                        total_invested_companies: 1,
                        sponsor_count: 1,
                        partner_count: 1,
                        host_count: 1

                    },
                },
            ])
            .limit(4);

        res.json({ status: true, message: get_query, checkUserToken: checkUserToken });
    } catch (err: any) {
        console.log('Compare companies by ids.', err.message)
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } });
    }
}
