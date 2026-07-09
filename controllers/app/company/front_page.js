require('dotenv').config()
const jwt = require('jsonwebtoken')
const express = require('express')
const router = express.Router()
const randomstring = require("randomstring")
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { getIntValues, createEndDateOnly, createDateTime, getMinusDates, getPresentDateTime, arrangeValidation, company_profile_completed_percentage, array_column, getSocialURL, getDistanceFromLatLon } = require('../../../utils/helpers/helper')
const { sendEmail } = require('../../../config/email')
const { getCompanyListDetails, getPartnerListDetails, getCompanyIndividualDetails, companyOtherDetails, getPopularCompanies, getTrendingCompanies, searchCompanies } = require('../../../services/company/front_page')
const { setCache, getCache } = require('../../../config/cache_helper')
const { getTokenList, filterTokens, getCompanyProducts, getMatchedProducts, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const JWT_CLAIM_SECRET_KEY = process.env.JWT_CLAIM_SECRET_KEY



const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const companyBusinessModelsM = require('../../../models/app/static/company_business_modelsM')
const companyEmployeeRequestM = require('../../../models/app/company/employees_requestsM')
const companyFollowersM = require('../../../models/app/company/followersM')
const added_to_partnersM = require('../../../models/app/company/added_to_partnersM')
const company_created_by_adminM = require('../../../models/app/company/company_created_by_adminM')
const company_faqM = require('../../../models/app/company/company_faqM')
const eventM = require('../../../models/app/events/eventM')
const company_watchlistM = require('../../../models/app/watchlist/companyM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const company_claim_requestsM = require('../../../models/app/company/company_claim_requestsM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const company_productsM = require('../../../models/markets/products_n_holding/company_productsM')
const company_requests_to_partnersM = require('../../../models/app/company/company_requests_to_partnersM')
const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
const { getEventsData, filterQuery, professionalfilterQuery } = require('../../../utils/helpers/events_helper')
const company_exchanges_countriesM = require('../../../models/app/company/company_exchanges_countriesM')
const company_regulatory_typesM = require('../../../models/app/company/company_regulatory_typesM')
const countryM = require('../../../models/app/static/countryM')
const company_exchanges_bodiesM = require('../../../models/app/company/company_exchanges_bodiesM')
const jobsM = require('../../../models/app/jobs/jobsM')
const markets_company_productsM = require('../../../models/markets/products_n_holding/markets_company_productsM')
const markets_company_holdingM = require('../../../models/markets/products_n_holding/markets_company_holdingM')
const job_applied_listM = require('../../../models/app/jobs/job_applied_listM')


router.get('/twitter_list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

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




        res.json({ status: true, message: get_query, count: total_counts })
    }
    catch (err) {
        console.log('twitter list.', err.message)
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
    }
})

// integrated, difference between below api and this api is pagination and search,this can be used for large data
router.get('/overview', async (req, res) => {
    try {
        let result = {}
        let report_list_type = 1
        if (req.query.report_list_type) {
            report_list_type = Number.parseInt(req.query.report_list_type)
        }

        let valuation_type = 1
        if (req.query.valuation_type) {
            if (Number.parseInt(req.query.valuation_type) === 2) {
                valuation_type = 2
            }
            else if (Number.parseInt(req.query.valuation_type) === 3) {
                valuation_type = 3
            }
        }

        let search_array = [{}]
        if (req.query.search) {
            search_array.push({ $or: [{ company_name: { '$regex': req.query.search, $options: 'i' } }, { company_id: { '$regex': req.query.search, $options: 'i' } }] })
        }

        let business_model_id_array = []
        if (req.query.business_model_id) {
            business_model_id_array = await getIntValues(req.query.business_model_id)
            search_array.push({ business_model_id: { $in: business_model_id_array } })
        }

        if (req.query.location) {
            search_array.push({ company_location: { $regex: sanitize(req.query.location), $options: 'i' } })
        }

        if ((report_list_type === 4) || (report_list_type === 3)) {
            if (req.query.category_row_id) {
                search_array.push({ category_ids: Number.parseInt(req.query.category_row_id) })
            }
        }

        if (report_list_type === 5) {
            const growthId = Number.parseInt(req.query.revenue_growth_id);

            if (growthId === 1) search_array.push({ revenue_growth: { $lt: 0 } });
            else if (growthId === 2) search_array.push({ revenue_growth: { $gte: 0, $lte: 10 } });
            else if (growthId === 3) search_array.push({ revenue_growth: { $gt: 10, $lte: 50 } });
            else if (growthId === 4) search_array.push({ revenue_growth: { $gt: 50 } });
        }

        let match_query = {}
        if (report_list_type === 2) {
            if (Number.parseInt(req.query.event_type_id) === 1) {
                const start_date = getMinusDates(7)

                match_query = { start_date: { $gte: new Date(start_date) } }
            }
        }

        let search_query = { $and: search_array }



        if (valuation_type === 1) {
            let get_company_valuation_query = ""
            let event_organizers_query = ""
            let event_sponsor_query = ""
            let event_partner_query = ""
            let funds_raised_query = ''
            let funds_invested_query = ''
            let funds_invested_rounds_query = ''
            let total_revenue_query = ""
            let cryptocurrency_product_query = ""
            let blockchain_product_query = ""
            let exchange_product_query = ""
            let crypto_holding_query = ""
            if (report_list_type === 1) {
                get_company_valuation_query = companyM.aggregate([
                    {
                        $match: {
                            approval_status: 1, active_status: 1
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
                            login_status: {
                                $cond: {
                                    if: "$user_info.login_status",
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
                    },
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])
            }
            else if (report_list_type === 2) {

                get_company_valuation_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                                        company_valuation: 1,
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                event_organizers_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

                event_sponsor_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '$company_row_id',
                            count: { $sum: 1 }
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
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "",
                            total: {
                                $sum: {
                                    $add: { $ifNull: [{ $arrayElemAt: ["$info_sponsor.count", 0] }, 0] }
                                }
                            }
                        }
                    }
                ])

                event_partner_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '$company_row_id',
                            count: { $sum: 1 }
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
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "",
                            total: {
                                $sum: {
                                    $add: { $ifNull: [{ $arrayElemAt: ["$info_sponsor.count", 0] }, 0] }
                                }
                            }
                        }
                    }
                ])
            }
            else if (report_list_type === 3) {

                get_company_valuation_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                funds_raised_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '',
                            amount: {
                                $sum: '$total_funds_raised_amount'
                            }
                        }
                    }
                ])
            }
            else if (report_list_type === 4) {

                get_company_valuation_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                funds_invested_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '',
                            amount: {
                                $sum: '$total_amount'
                            }
                        }
                    }
                ])

                funds_invested_rounds_query = fundingInvestmentM.aggregate([
                    {
                        $match: {
                            investor_type: 1, investor_registered_type: 1, verified_status: 1
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
                            total_amount: { $sum: '$amount' },
                            category_ids: { $addToSet: '$category_row_id' },
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
                    { $match: search_query },
                    { $unwind: "$category_ids" },
                    {
                        $group: {
                            _id: null,
                            category_ids: { $addToSet: "$category_ids" }
                        }
                    },
                    {
                        $project: {
                            count: { $size: '$category_ids' }
                        }
                    }
                ])
            }
            else if (report_list_type === 5) {

                get_company_valuation_query = await company_revenue_growthM.aggregate([
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
                                            $ifNull: ["$user_info.login_status", 1]
                                        }
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])


                total_revenue_query = company_revenue_growthM.aggregate([
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
                    { $match: search_query },
                    { $group: { _id: null, total_revenue: { $sum: "$total_revenue" } } }
                ])
            }
            else if (report_list_type === 6) {
                get_company_valuation_query = company_productsM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                cryptocurrency_product_query = company_productsM.aggregate([
                    { $match: { company_type: 1, product_type: 1 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

                blockchain_product_query = company_productsM.aggregate([
                    { $match: { company_type: 1, product_type: 2 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

                exchange_product_query = company_productsM.aggregate([
                    { $match: { company_type: 1, product_type: 3 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

            }
            else if (report_list_type === 7) {

                get_company_valuation_query = company_holdingM.aggregate([
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
                        }
                    },
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_company_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                crypto_holding_query = company_holdingM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '',
                            total_holdings: {
                                $sum: '$total_holdings'
                            }
                        }
                    }
                ])
            }

            const queries = [
                get_company_valuation_query,
                total_revenue_query,
                event_organizers_query,
                event_sponsor_query,
                event_partner_query,
                funds_raised_query,
                funds_invested_query,
                cryptocurrency_product_query,
                blockchain_product_query,
                exchange_product_query,
                funds_invested_rounds_query,
                crypto_holding_query
            ].filter(query => query !== ""); // Filter out empty strings

            const results = await Promise.all(queries);

            // Extract results safely, providing default empty arrays
            const company_valuation_result = results[queries.indexOf(get_company_valuation_query)] || [];
            const total_revenue_result = results[queries.indexOf(total_revenue_query)] || [];
            const total_organizer_count = results[queries.indexOf(event_organizers_query)] || [];
            const total_event_sponsor_count = results[queries.indexOf(event_sponsor_query)] || [];
            const total_event_partner_count = results[queries.indexOf(event_partner_query)] || [];
            const total_funds_raised = results[queries.indexOf(funds_raised_query)] || [];
            const total_funds_invested = results[queries.indexOf(funds_invested_query)] || [];
            const total_cryptocurrency_product = results[queries.indexOf(cryptocurrency_product_query)] || [];
            const total_blockchain_product = results[queries.indexOf(blockchain_product_query)] || [];
            const total_exchange_product = results[queries.indexOf(exchange_product_query)] || [];
            const total_funds_invested_rounds = results[queries.indexOf(funds_invested_rounds_query)] || [];
            const total_crypto_holding = results[queries.indexOf(crypto_holding_query)] || [];

            result['total_company_valuation'] = company_valuation_result[0] ? company_valuation_result[0].total_company_valuation : 0
            result['total_organizer_count'] = total_organizer_count[0] ? total_organizer_count[0].count : 0
            result['total_event_sponsor_count'] = total_event_sponsor_count[0] ? total_event_sponsor_count[0].total : 0
            result['total_event_partner_count'] = total_event_partner_count[0] ? total_event_partner_count[0].total : 0
            result['total_funds_raised'] = total_funds_raised[0] ? total_funds_raised[0].amount : 0
            result['total_funds_invested'] = total_funds_invested[0] ? total_funds_invested[0].amount : 0
            result['total_revenue'] = total_revenue_result[0] ? total_revenue_result[0].total_revenue : 0
            result['total_cryptocurrency_product'] = total_cryptocurrency_product[0] ? total_cryptocurrency_product[0].count : 0
            result['total_blockchain_product'] = total_blockchain_product[0] ? total_blockchain_product[0].count : 0
            result['total_exchange_product'] = total_exchange_product[0] ? total_exchange_product[0].count : 0
            result['total_funds_invested_rounds'] = total_funds_invested_rounds[0] ? total_funds_invested_rounds[0].count : 0
            result['total_crypto_holding'] = total_crypto_holding[0] ? total_crypto_holding[0].total_holdings : 0

        }
        else if (valuation_type === 2) {


            let get_partner_valuation_query = ""
            let event_organizers_query = ""
            let event_sponsor_query = ""
            let event_partner_query = ""
            let funds_raised_query = ''
            let funds_invested_query = ''
            let total_revenue_query = ""
            let cryptocurrency_product_query = ""
            let blockchain_product_query = ""
            let exchange_product_query = ""
            let get_company_valuation_query = ""
            let crypto_holding_query = ""
            if (report_list_type === 1) {
                get_partner_valuation_query = companyM.aggregate([
                    {
                        $match: {
                            approval_status: 1, active_status: 1
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])
            }
            else if (report_list_type === 2) {

                get_partner_valuation_query = eventM.aggregate([
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
                                        company_valuation: 1,
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
                            company_valuation: "$company_info.company_valuation",
                            main_business_model_id: "$company_info.main_business_model_id",
                        }
                    },
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                event_organizers_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_added_to_partners",
                            localField: "company_row_id",
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
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

                event_sponsor_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_added_to_partners",
                            localField: "company_row_id",
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
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '$company_row_id',
                            count: { $sum: 1 }
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
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "",
                            total: {
                                $sum: {
                                    $add: { $ifNull: [{ $arrayElemAt: ["$info_sponsor.count", 0] }, 0] }
                                }
                            }
                        }
                    }
                ])

                event_partner_query = eventM.aggregate([
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
                        $lookup:
                        {
                            from: "cln_company_added_to_partners",
                            localField: "company_row_id",
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
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '$company_row_id',
                            count: { $sum: 1 }
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
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "",
                            total: {
                                $sum: {
                                    $add: { $ifNull: [{ $arrayElemAt: ["$info_sponsor.count", 0] }, 0] }
                                }
                            }
                        }
                    }
                ])
            }
            else if (report_list_type === 3) {
                get_partner_valuation_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                funds_raised_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '',
                            amount: {
                                $sum: '$total_funds_raised_amount'
                            }
                        }
                    }
                ])
            }
            else if (report_list_type === 4) {
                get_partner_valuation_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])


                funds_invested_query = fundingInvestmentM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '',
                            amount: {
                                $sum: '$total_amount'
                            }
                        }
                    }
                ])
            }
            else if (report_list_type === 5) {






                get_partner_valuation_query = await company_revenue_growthM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                total_revenue_query = company_revenue_growthM.aggregate([
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
                    { $match: search_query },
                    { $group: { _id: null, total_revenue: { $sum: "$total_revenue" } } }
                ])
            }
            else if (report_list_type === 6) {
                get_partner_valuation_query = company_productsM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                cryptocurrency_product_query = company_productsM.aggregate([
                    { $match: { company_type: 1, product_type: 1 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

                blockchain_product_query = company_productsM.aggregate([
                    { $match: { company_type: 1, product_type: 2 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])

                exchange_product_query = company_productsM.aggregate([
                    { $match: { company_type: 1, product_type: 3 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
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
                    { $match: search_query },
                    {
                        $count: 'count'
                    }
                ])
            }
            else if (report_list_type === 7) {
                get_partner_valuation_query = company_holdingM.aggregate([
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
                        }
                    },
                    { $match: search_query },
                    {
                        $group: {
                            _id: null,
                            total_partner_valuation: { $sum: "$company_valuation" }
                        }
                    }
                ])

                crypto_holding_query = company_holdingM.aggregate([
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
                    { $match: search_query },
                    {
                        $group: {
                            _id: '',
                            total_holdings: {
                                $sum: '$total_holdings'
                            }
                        }
                    }
                ])
            }


            const queries = [
                get_partner_valuation_query,
                event_organizers_query,
                event_sponsor_query,
                event_partner_query,
                funds_raised_query,
                funds_invested_query,
                total_revenue_query,
                cryptocurrency_product_query,
                blockchain_product_query,
                exchange_product_query,
                crypto_holding_query
            ].filter(query => query !== ""); // Filter out empty strings

            const results = await Promise.all(queries);

            // Extract results safely, providing default empty arrays
            const company_valuation_result = results[queries.indexOf(get_partner_valuation_query)] || [];
            const total_organizer_count = results[queries.indexOf(event_organizers_query)] || [];
            const total_event_sponsor_count = results[queries.indexOf(event_sponsor_query)] || [];
            const total_event_partner_count = results[queries.indexOf(event_partner_query)] || [];
            const total_funds_raised = results[queries.indexOf(funds_raised_query)] || [];
            const total_funds_invested = results[queries.indexOf(funds_invested_query)] || [];
            const total_revenue_result = results[queries.indexOf(total_revenue_query)] || [];
            const total_cryptocurrency_product = results[queries.indexOf(cryptocurrency_product_query)] || [];
            const total_blockchain_product = results[queries.indexOf(blockchain_product_query)] || [];
            const total_exchange_product = results[queries.indexOf(exchange_product_query)] || [];
            const total_crypto_holding = results[queries.indexOf(crypto_holding_query)] || [];

            result['total_company_valuation'] = company_valuation_result[0] ? company_valuation_result[0].total_partner_valuation : 0
            result['total_organizer_count'] = total_organizer_count[0] ? total_organizer_count[0].count : 0
            result['total_event_sponsor_count'] = total_event_sponsor_count[0] ? total_event_sponsor_count[0].total : 0
            result['total_event_partner_count'] = total_event_partner_count[0] ? total_event_partner_count[0].total : 0

            result['total_funds_raised'] = total_funds_raised[0] ? total_funds_raised[0].amount : 0
            result['total_funds_invested'] = total_funds_invested[0] ? total_funds_invested[0].amount : 0
            result['total_revenue'] = total_revenue_result[0] ? total_revenue_result[0].total_revenue : 0
            result['total_cryptocurrency_product'] = total_cryptocurrency_product[0] ? total_cryptocurrency_product[0].count : 0
            result['total_blockchain_product'] = total_blockchain_product[0] ? total_blockchain_product[0].count : 0
            result['total_exchange_product'] = total_exchange_product[0] ? total_exchange_product[0].count : 0
            result['total_crypto_holding'] = total_crypto_holding[0] ? total_crypto_holding[0].total_holdings : 0

        }
        else if (valuation_type === 3) {
            let user_row_id = 0
            const checkUserToken = checkUserLoginToken(req.headers)
            if (checkUserToken.status) {
                user_row_id = checkUserToken.message
            }

            const get_watchlist_valuation_query = await companyM.aggregate([
                {
                    $match: {
                        approval_status: 1, active_status: 1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_watchlists",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "info_watchlists",
                        pipeline: [
                            {
                                $match: {
                                    user_row_id: user_row_id
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
                { $unwind: { path: "$info_watchlists" } },
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
                { $match: search_query },
                {
                    $group: {
                        _id: null,
                        total_valuation: { $sum: "$company_valuation" }
                    }
                }
            ])

            result['total_watchlist_valuation'] = 0
            if (get_watchlist_valuation_query[0]) {
                result['total_watchlist_valuation'] = get_watchlist_valuation_query[0].total_valuation
            }

        }


        res.json({ status: true, message: result })

    }
    catch (err) {

        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
    }
})



router.get('/company_list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;

        // --------------------------------------------
        // USER LOGIN DETECTION
        // --------------------------------------------
        let user_row_id = 0;
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message;
        }

        // --------------------------------------------
        // CALL SERVICE FUNCTION
        // --------------------------------------------
        const result = await getCompanyListDetails(req.query, skip, limit, user_row_id);

        return res.json(result);

    } catch (err) {
        console.log("Companies list error:", err.message);
        return res.json({
            status: false,
            message: { alert_message: "An unexpected error occurred. Please try again later.", err: err.message }
        });
    }
});







const companyListold = async ({ report_list_type, query, skip, limit, user_row_id, sort_filter, match_query, boundingBox }) => {
    //1: Normal companies list , 2: Event Organizers, 3: Funding Raised list, 4: Funds Investments, 5: Revenue Reports , 6: Assets List
    if (report_list_type === 1) {
        const get_query = companyM.aggregate([
            {
                $match: { approval_status: 1, active_status: 1 }
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
            { $match: query },
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

            // Events start
            {
                $lookup: {
                    from: "cln_events", // collection name for events
                    let: { companyId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$company_row_id", "$$companyId"] },
                                        { $eq: ["$active_status", 1] },
                                        { $eq: ["$approval_status", 1] },
                                        { $gt: ["$company_row_id", 0] },
                                        // optional date condition:
                                        // { $gte: ["$end_date", new Date(getPresentDateTime())] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total_events: { $sum: 1 },
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
                    localField: "_id",
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
                    localField: "_id",
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
                    let: { companyId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    // cast left side to int to avoid type mismatch with outer numeric _id
                                    $eq: [{ $toInt: "$funds_raised_company_row_id" }, "$$companyId"]
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
                        {
                            $group: {
                                _id: "$funds_raised_company_row_id",
                                total_funds_raised_amount: { $sum: "$amount" },
                                category_ids: { $addToSet: "$category_row_id" },
                                funds_raised_ids: {
                                    $addToSet: {
                                        investor_row_id: "$investor_row_id",
                                        investor_type: "$investor_type",
                                        investor_registered_type: "$investor_registered_type"
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
                        $size: { $ifNull: ["$funding_data.category_ids", []] }
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
                    let: { investorId: "$_id" },           // company _id acts as investor_row_id
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

                        // Now aggregate the investor's totals & distinct sets
                        {
                            $group: {
                                _id: "$investor_row_id",
                                total_invested_amount: { $sum: "$amount" },
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
                    let: { companyId: "$_id" },   // parent company id
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

            // crypto assets end
            // Job Role
            {
                $lookup: {
                    from: "cln_jobs", // your jobs collection
                    let: { companyId: "$_id" },
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
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
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
                    latitude: 1,
                    longitude: 1,
                }
            }
        ]).skip(skip).limit(limit)


        const count_query = companyM.aggregate([
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
            { $match: query },
            {
                $count: "count"
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])

        const token_row_ids = result1.flatMap(run => run.token_row_ids || [])

        const token_list = await getTokenList({ token_ids: token_row_ids })

        const products_list = await getCompanyProducts(result1)

        const final_result = await Promise.all(
            result1.map(async run => {
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
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",
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
            { $match: query },
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
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    latitude: 1,
                    longitude: 1,
                    // events:1,
                    total_events: 1,
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
                                _id: 0,
                                login_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } }
                }
            },
            {
                $match: {
                    login_status: 1
                }
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
            { $match: query },
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
        const get_query = fundingInvestmentM.aggregate([
            {
                $match: {
                    funds_raised_registered_type: 1, verified_status: 1
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
                    total_funds_raised_companies: { $size: '$funds_raised_ids' },
                    total_funds_raised_rounds: { $size: '$category_ids' },
                    funds_raised_rounds: '$funding_rounds.category_name',
                    total_funds_raised_amount: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
                    business_name: "$business_info.business_name",
                    main_business_model_name: "$main_business_info.business_name",
                    watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
                    following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                    total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = fundingInvestmentM.aggregate([
            {
                $match: {
                    funds_raised_registered_type: 1, verified_status: 1
                }
            },
            //             }
            //         ]
            //     }
            // },
            // { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } }, 
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
            { $match: query },
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
        const get_query = fundingInvestmentM.aggregate([
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
                    total_invested_rounds: { $size: '$category_ids' },
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
        ]).skip(skip).limit(limit)


        const count_query = fundingInvestmentM.aggregate([
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
            { $match: query },
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
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",
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
                    localField: "main_business_model_id",
                    foreignField: "_id",
                    as: "main_business_info",
                    pipeline: [{ $project: { business_name: 1 } }]
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
                    total_revenue: 1,
                    company_location: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    revenue_growth: 1,
                    latitude: 1,
                    longitude: 1,
                    pushed_data: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    business_name: "$business_info.business_name",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
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
            { $match: query },
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
    else if (report_list_type === 6) {
        const get_query = company_productsM.aggregate([
            { $match: { company_type: 1 } },
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
                    company_name: { $cond: { if: "$company_info.company_name", then: "$company_info.company_name", else: [] } },
                    company_id: { $cond: { if: "$company_info.company_id", then: "$company_info.company_id", else: [] } },
                    company_location: "$company_info.company_location",
                    business_model_id: { $cond: { if: "$company_info.business_model_id", then: "$company_info.business_model_id", else: [] } },
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
                    latitude: 1,
                    longitude: 1,
                    company_id: 1,
                    total_products: 1,
                    product_ids: 1,
                    company_location: 1,
                    business_model_id: 1,
                    main_business_model_id: 1,
                    country_id: 1,
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: '$company_info.describe_in_one_line',
                    country_flag: "$country_info.country_flag",
                    business_name: "$business_info.business_name",
                    country_name: "$country_info.country_name",
                    company_valuation: 1,
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
                    company_name: { $cond: { if: "$company_info.company_name", then: "$company_info.company_name", else: [] } },
                    company_id: { $cond: { if: "$company_info.company_id", then: "$company_info.company_id", else: [] } },
                    company_location: "$company_info.company_location",
                    business_model_id: { $cond: { if: "$company_info.business_model_id", then: "$company_info.business_model_id", else: [] } },
                    main_business_model_id: "$company_info.main_business_model_id",
                    country_id: "$company_info.country_id",
                    company_valuation: "$company_info.company_valuation"
                }
            },
            { $match: query },
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
                $match: {
                    company_type: 1
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
                    country_id: "$company_info.country_id"
                }
            },
            { $match: query },
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
                    company_name: 1,
                    company_id: 1,
                    latitude: 1,
                    longitude: 1,
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
            { $match: query },
            {
                $count: 'count'
            }
        ])

        const [result1, result2] = await Promise.all([get_query, count_query])

        let token_row_ids = []
        for (let run of result1) {
            if (Array.isArray(run.token_row_ids)) {
                token_row_ids = token_row_ids.concat(run.token_row_ids)
            }
        }
        const token_list = await getTokenList({ token_ids: token_row_ids })

        const final_result = []
        for (let run of result1) {
            if (run.token_row_ids) {
                run['tokens_list'] = await filterTokens({ token_ids: run.token_row_ids, token_list })
            }
            final_result.push(run)
        }

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: final_result, count: total_counts, token_list: token_list }
    }
    else if (report_list_type === 8) {
        const get_query = await jobsM.aggregate([
            // only companies that actually have (active, non-deleted) jobs
            { $match: { active_status: "active", is_deleted: false } },
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
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",
                },
            },

            // ✅ your dynamic filters here
            { $match: query },

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
                            },
                        },
                    ],
                },
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
                    company_logo: "$company_info.company_logo",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    company_valuation: "$company_info.company_valuation",
                },
            },

            { $match: query },

            { $count: "count" },
        ]);



        const [result1, result2] = await Promise.all([get_query, count_query]);

        let total_counts = 0
        if (result2[0]) {
            total_counts = result2[0].count
        }

        return { list: result1, count: total_counts }
    }
    else {
        return { list: [], count: 0 }
    }
}

router.get('/partners_list/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = 0;
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message;
        }

        const skip = Number.parseInt(req.params.skip) || 0;
        const limit = Number.parseInt(req.params.limit) || 100;

        const result = await getPartnerListDetails(req.query, skip, limit, user_row_id);

        return res.json(result);

    } catch (err) {
        console.log('Partners list.', err.message);
        return res.json({
            status: false,
            message: 'Server error, try again later',
            error: err.message
        });
    }
});




router.get('/individual_details/:company_id', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const company_id = req.params.company_id

        const result = await getCompanyIndividualDetails({ user_row_id, company_id })

        res.json({
            status: result.status,
            message: result.message,
            cache_reponse_status: result.cache_reponse_status
        })

    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})
router.get('/get_ids', async (req, res) => {
    try {
        const get_details = await companyM.findOne({ _id: 4520 },
            { company_name: 1, regularities_details: 1 })
            .populate({
                path: 'regularities_details.regulatory_bodies_ids',
                model: 'cln_exchange_bodies'
            })
        res.json({ status: true, message: get_details })
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/get_regulatories_list/:company_row_id', async (req, res) => {
    try {


        const company_row_id = Number.parseInt(req.params.company_row_id || 0);
        const pipeline = [];

        if (company_row_id) {
            pipeline.push({ $match: { _id: company_row_id } });
        }

        pipeline.push(
            { $unwind: "$regularities_details" },
            {
                $lookup: {
                    from: "cln_exchange_bodies",
                    localField: "regularities_details.regulatory_bodies_ids",
                    foreignField: "_id",
                    as: "regulatory_bodies_info"
                }
            },
            {
                $unwind: { path: "$regulatory_bodies_info", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "regulatory_bodies_info.country_id",
                    foreignField: "_id",
                    as: "country_info"
                }
            },
            {
                $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: "cln_company_regulatory_types",
                    localField: "regulatory_bodies_info.regulatory_type_id",
                    foreignField: "_id",
                    as: "regulatory_type_info"
                }
            },
            {
                $unwind: { path: "$regulatory_type_info", preserveNullAndEmptyArrays: true }
            },

            {
                $group: {
                    _id: "$_id",
                    company_name: { $first: "$company_name" },
                    regularities_details: {
                        $push: {
                            country_id: "$regulatory_bodies_info.country_id",
                            regulatory_bodies_ids: "$regularities_details.regulatory_bodies_ids",
                            regulatory_types_id: "$regulatory_bodies_info.regulatory_type_id",
                            country_name: "$country_info.country_name",
                            country_flag: "$country_info.country_flag",
                            regulator_type_name: "$regulatory_type_info.regulator_type_name",
                            regulatory_body_name: "$regulatory_bodies_info.regulatory_bodies_name"
                        }
                    }
                }
            },

            { $sort: { _id: -1 } }
        );

        const get_query = await companyM.aggregate(pipeline);

        return res.json({
            status: true,
            message: get_query,

        });

    } catch (error) {
        return res.json({
            status: false,
            message: "Something went wrong",
            error: error.message
        });
    }
});









router.get('/individual_other_details/:company_row_id', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const company_row_id = Number.parseInt(req.params.company_row_id)

        // Validate company_row_id
        if (!company_row_id || Number.isNaN(company_row_id) || company_row_id <= 0) {
            return res.json({ status: false, message: { alert_message: 'Invalid company row id', company_row_id } })
        }

        const result = await companyOtherDetails({ user_row_id, company_row_id, req })
        return res.json(result)
    }
    catch (err) {
        console.log('Individual company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})



const companyIndividualEvents = async ({ company_row_id, req }) => {
    let result = {}
    const filter_array = [{ active_status: 1, approval_status: 1, company_row_id: company_row_id, list_event_type: { $in: [2, 3] } }]
    const search_query = [{}]
    let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query })
    const sort_value = { end_date: -1 }

    const { list } = await getEventsData({
        sort_value: sort_value,
        top_filter_array: { $and: top_filter_array },
        search_query: { $and: search_array },
        req_headers: req.headers
    })
    result['hosts'] = list

    result['sponsors'] = []
    const check_sponsors = await event_sponsors_partner_detailsM.find({ account_type: 2, registered_type: 1, sponsor_partner_type: 1, user_company_row_id: company_row_id }, { event_row_id: 1 })
    if (check_sponsors) {
        const sponsor_array = await array_column(check_sponsors, 'event_row_id')
        if (sponsor_array.length) {
            const filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: sponsor_array }, list_event_type: { $in: [1, 2, 3] } }]
            let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query })
            const { list } = await getEventsData({
                sort_value: sort_value,
                top_filter_array: { $and: top_filter_array },
                search_query: { $and: search_array },
                req_headers: req.headers
            })
            result['sponsors'] = list
        }
    }

    result['partners'] = []
    const check_partners = await event_sponsors_partner_detailsM.find({ account_type: 2, registered_type: 1, sponsor_partner_type: 2, user_company_row_id: company_row_id }, { event_row_id: 1 })
    if (check_partners) {
        const partner_array = await array_column(check_partners, 'event_row_id')
        if (partner_array.length) {
            const filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: partner_array }, list_event_type: { $in: [1, 2, 3] } }]
            let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query })
            const { list } = await getEventsData({
                sort_value: sort_value,
                top_filter_array: { $and: top_filter_array },
                search_query: { $and: search_array },
                req_headers: req.headers
            })
            result['partners'] = list
        }
    }

    return result
}


const companyIndividualRevenue = async ({ company_row_id, req }) => {
    let result = {}
    let matchFilter = { company_row_id };

    if (req?.query?.year && !Number.isNaN(Number.parseInt(req.query.year))) {
        matchFilter.year = Number.parseInt(req.query.year);
    }

    if (req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))) {
        matchFilter.quarter = Number.parseInt(req.query.quarter);
    }



    result['recent'] = await company_revenue_growthM.findOne({ company_row_id: company_row_id }).sort({ _id: -1 })


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
    ]);



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

const isJsonString = (str) => {
    try {
        JSON.parse(str)
    } catch (e) {
        return false
    }
    return true
}

router.get('/team_members', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        let company_row_id_array = []
        if (req.query.company_row_id) {
            if (isJsonString(req.query.company_row_id)) {
                company_row_id_array = JSON.parse(req.query.company_row_id)
            }
        }

        if (company_row_id_array) {
            const get_query = await professionals_work_experienceM.aggregate([
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
                                        }
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
                                    approval_status: 1,
                                    profile_image: "$img_info.profile_image",
                                    pro_batch: 1
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
                    $match: {
                        user_data: { $exists: true, $ne: "" },
                        company_type: 1,
                        company_row_id: { $in: company_row_id_array },
                        till_date_status: 2
                    }
                },
                {
                    $project: {
                        _id: 1,
                        user_account_type: 1,
                        user_row_id: 1,
                        user_name: "$user_data.user_name",
                        full_name: "$user_data.full_name",
                        pro_batch: "$user_data.pro_batch",
                        email_id: "$user_data.email_id",
                        profile_image: "$user_data.profile_image",
                        user_approval_status: "$user_data.approval_status",
                        verified_status: 1,
                        verified_on: 1,
                        employment_type: 1,
                        position_name: "$info_position.position_name",
                        location_type: 1,
                        designation_type: 1,
                        start_date: 1,
                        responsibilities: 1,
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } },
                    }
                }
            ])

            res.json({ status: true, message: get_query, company_row_id_array })
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id.', err: err.message } })
        }


    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/submit_request_as_working/:company_id', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const company_query = await companyM.findOne({ company_id: req.params.company_id }, { _id: 1, user_row_id: 1 })
        if (company_query) {
            let company_user_row_id = Number.parseInt(company_query.user_row_id)
            let company_row_id = Number.parseInt(company_query._id)

            if (user_row_id === company_user_row_id) {
                res.json({ status: false, message: { alert_message: 'Yeah! You are trying to do something which is not possible.' } })
            }
            else {
                const employees_request_query = await companyEmployeeRequestM.findOne({ company_row_id: company_row_id, user_row_id: user_row_id }, { _id: 1 })
                if (employees_request_query) {
                    res.json({ status: false, message: { alert_message: 'Your already employee of this company.' } })
                }
                else {
                    const saveData = new companyEmployeeRequestM({ company_row_id: company_row_id, user_row_id: user_row_id, approval_status: 1, date_n_time: getPresentDateTime() })
                    await saveData.save()

                    res.json({ status: true, message: { alert_message: 'Your request to this company submitted successfully.' } })
                }
            }
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company ID' } })
        }
    }
    catch (err) {
        console.log('Submit request as working.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/submit_request_to_become_partner', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message

            const user_company = await companyM.findOne({
                user_row_id: user_row_id
            }).select('_id approval_status active_status')

            if (!user_company) {
                return res.json({
                    status: false,
                    message: { alert_message: 'You do not have a registered company.' }
                })
            }

            // Step 2 — Check if company is active and approved
            if (
                user_company.active_status !== 1 ||
                user_company.approval_status !== 1
            ) {
                return res.json({
                    status: false,
                    message: { alert_message: 'Your company is not active or approved yet.' }
                })
            }

            const company_row_id = user_company._id

            // Step 3 — Check if company is already a partner
            const is_already_partner = await added_to_partnersM.findOne({
                company_row_id: company_row_id
            })

            if (is_already_partner) {
                return res.json({
                    status: false,
                    message: { alert_message: 'Your company is already a partner.' }
                })
            }

            // Step 4 — Check if a partnership request already exists
            const existing_request = await company_requests_to_partnersM.findOne({
                company_row_id: company_row_id
            })

            if (existing_request) {
                return res.json({
                    status: false,
                    message: { alert_message: 'Your partnership request has already been submitted.' }
                })
            }

            // Step 5 — All checks passed, create the request
            const insert_object = Object.create(null)
            insert_object.user_row_id = user_row_id
            insert_object.company_row_id = company_row_id
            insert_object.approval_status = 0
            insert_object.date_n_time = getPresentDateTime()

            await company_requests_to_partnersM(insert_object).save()
            await deleteKeysByPattern('app_front_page_partners_list_*')

            return res.json({
                status: true,
                message: { alert_message: 'Your request to become a partner has been submitted successfully.' }
            })
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Submit request as working.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/save_claim_request_details/:company_row_id', async (req, res) => {
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                const user_row_id = checkUserToken.message
                const user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, email_id: 1, full_name: 1 })
                const email_id = user_query.email_id

                const company_query = await companyM.findOne({ company_email_id: email_id, _id: company_row_id, approval_status: 1, active_status: 1 })
                if (company_query) {
                    if (!company_query.user_row_id) {
                        const claim_details = await add_new_claim_request(user_row_id, company_query._id, 1)
                        if (claim_details) {
                            await claim_request_email(email_id, company_query.company_name, company_query.company_id, email_id, user_query.full_name, claim_details.date_n_time)


                            await updateThreadNotification({
                                user_row_id: -1,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 25,
                                action_row_id: claim_details._id
                            })

                            res.json({ status: true, message: { alert_message: 'Your claim request will be processed within 24 hours and you will be notified via email. Please check your email for more updates. !' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, Your company claim request is already in queue, please wait admin will be process your request.' } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, This company owned some other registered coinpedia user' } })
                    }
                }
                else {
                    const email_id_array = (user_query.email_id).split("@")
                    const email_id_domain = email_id_array.slice(-1)
                    console.log("email_id_domain", email_id_domain[0])
                    const company_same_domain_query = await companyM.findOne({ website_link: { '$regex': email_id_domain[0], $options: 'i' }, _id: company_row_id, approval_status: 1, active_status: 1 })
                    if (company_same_domain_query) {
                        const claim_details = await add_new_claim_request(user_row_id, company_same_domain_query._id, 2)
                        if (claim_details) {
                            await updateThreadNotification({
                                user_row_id: -1,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 25,
                                action_row_id: claim_details._id
                            })

                            if (company_same_domain_query.company_email_id) {
                                await claim_request_email(company_same_domain_query.company_email_id, company_same_domain_query.company_name, company_same_domain_query.company_id, email_id, user_query.full_name, claim_details.date_n_time)
                            }
                            res.json({ status: true, message: { alert_message: 'Your claim request will be processed within 24 hours and you will be notified via email. Please check your email for more updates. !' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, Your company claim request is already in queue, please wait admin will be process your request.' } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, To claim this company, your registered email id must be same as company email id or else contains domain extension of this company website.' } })
                    }
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }

        }
        catch (err) {
            console.log('Save claim request details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})

const claim_request_email = async (pass_email_id, pass_company_name, pass_company_id, pass_user_email_id, pass_full_name, date_n_time) => {
    // let pass_email_id = company_query.company_email_id //'developerjory@gmail.com'
    let pass_subject = "Important Update on your Company Profile Claimed!"

    let pass_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${pass_company_name} Team,</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We hope this email finds you well. We are writing to inform you that your company <b style="text-transform: capitalize;">${pass_company_name}</b> was claimed by a user profile <b style="text-transform: capitalize;">${pass_full_name}</b> on <b>${date_n_time}</b>.The claim was made from the email id <span style="color:#0029ff">${pass_user_email_id}</span></p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Company profile link:<a href=${"https://app.coinpedia.org/company/" + pass_company_id} target="_blank" rel="nofollow" style="color:#0029ff">${"https://app.coinpedia.org/company/" + pass_company_id}</a> </p>
    <p style="color:#000;font-weight: 400;font-size:17px;">If you believe that this claim made was not appropriate, then you can reach out to us for further assistance.</p>
    `

    await sendEmail(pass_email_id, pass_subject, pass_message)
}




//pass_claim_type : same email id: 1, 2: same domain 
const add_new_claim_request = async (pass_user_row_id, pass_company_row_id, pass_claim_type) => {
    const company_query = await company_claim_requestsM.findOne({ user_row_id: pass_user_row_id, company_row_id: pass_company_row_id, claim_status: 1 })
    if (!company_query) {
        const save_query = await company_claim_requestsM({
            user_row_id: pass_user_row_id,
            company_row_id: pass_company_row_id,
            claim_type: pass_claim_type,
            claim_status: 1,
            date_n_time: getPresentDateTime()
        }).save()

        return save_query
    }
    else {
        return false
    }
}

router.post('/claim_company', [
    check('company_row_id')
        .trim().not().isEmpty().withMessage('The Company Row ID field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let company_row_id = Number.parseInt(req.body.company_row_id)
        const checkApprovedCompany = await companyM.findOne({ _id: company_row_id, approval_status: 1, active_status: 1 })
        if (!checkApprovedCompany) {
            errObj['company_row_id'] = 'Sorry, Invalid Company Row ID.'
        }

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkUserToken.message
                const checkUserListedCompany = await companyM.findOne({ user_row_id: user_row_id })
                if (!checkUserListedCompany) {
                    const checkCompanyAdCreated = await company_created_by_adminM.findOne({ company_row_id: company_row_id })
                    if (checkCompanyAdCreated) {
                        if (Number.parseInt(checkCompanyAdCreated.claim_status) === 1) {
                            let rndm_string = randomstring.generate(40)

                            let jwtObj = {
                                user_row_id: user_row_id,
                                company_row_id: company_row_id,
                                claim_verify_code: rndm_string,
                                issued_at: new Date().getTime()
                            }
                            let claim_token = jwt.sign(jwtObj, JWT_CLAIM_SECRET_KEY)

                            await company_created_by_adminM.updateOne({ company_row_id: company_row_id }, { $set: { claim_verify_code: rndm_string } })

                            let company_name = checkApprovedCompany.company_name
                            let pass_email_id = checkApprovedCompany.company_email_id



                            let pass_subject = "Welcome to CoinPedia Pro Account!"
                            let pass_message = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${company_name},</p>
                                <div style="color:#000">
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>WELCOME TO COINPEDIA PRO ACCOUNT</b></p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;">Having a Coinpedia account makes you a complete Fintech and Blockchain Professional. Get Price Insights, Read News of your Interest, Join the Crypto Professionals Network, Get the best of Crypto services and enjoy rewards.</p>
                                    <br>
                                    <a href=${"https://app.coinpedia.org/company/claim-account/" + claim_token} target="_blank" rel="nofollow" style="color:#0029ff;font-weight: 400;font-size:17px;">Verify</a>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Login Id :</b> ${pass_email_id}</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>So What do you Get in Account ?</b></p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy </b><br>Get our Free online tutorials and learn Blockchain -Fintech from scratch. Clear quiz and Claim authorized certificates.</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto. </b><br>Get a Blockchain Social networking platform to Post Trading Quotes, Share Ideas and make connections of your Interest.</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Predict & Win Cryptocurrency.</b><br>Participate free in the coin prediction contest and win $10 to $50 reward in crypto and earn 10 CBZ coins on participaction.</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Wallets & CBZ Coins</b><br>Get your own CoinPedia Crypto wallet to store your reward funds and native assets. Wallets also provide withdraw, transfer and pay options. </p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;">Thanks for the Support. We're counting on you for our mission of uniting Blockchain professionals worldwide!</p>
                                </div>
                            </div>`

                            await sendEmail(pass_email_id, pass_subject, pass_message)

                            res.json({ status: true, message: { alert_message: 'Verify Link is sent to company e-mail id' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Company Already Claimed' } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, This company is self created.' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'You already have a company' } })
                }

            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Claim company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/verify_claim/:claim_token', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const claim_token = jwt.verify(req.params.claim_token, JWT_CLAIM_SECRET_KEY)
            if (claim_token) {
                const company_row_id = Number.parseInt(claim_token.company_row_id)
                const user_row_id = Number.parseInt(claim_token.user_row_id)

                const checkUser = await professionalsM.findOne({ _id: user_row_id })
                if (checkUser) {
                    const checkCompany = await companyM.findOne({ _id: company_row_id })
                    if (checkCompany) {
                        const saveData = await company_created_by_adminM.findOne({ company_row_id: company_row_id, claim_verify_code: claim_token.claim_verify_code })
                        if (saveData) {
                            if (Number.parseInt(saveData.claim_status) === 1) {
                                // change claim status
                                await company_created_by_adminM.updateOne({ company_row_id: company_row_id }, { $set: { claim_status: 2 } })

                                // add user row id in company row id
                                const updateFields = getUpdateTrackerFields(checkUserToken)
                                await companyM.updateOne({ _id: company_row_id }, { $set: { user_row_id: user_row_id, ...updateFields } })

                                res.json({ status: true, message: { alert_message: 'Company claimed successfully' } })
                            }
                            else {
                                res.json({ status: false, message: { alert_message: 'Sorry! Company Already Claimed' } })
                            }
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Verify claim.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/follower_ids', async (req, res) => {
    try {

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)

            let followers_id = []
            const total_followers = await companyFollowersM.find({ user_row_id: user_row_id }, { company_row_id: 1 })
            if (total_followers) {
                followers_id = await array_column(total_followers, 'company_row_id')
            }

            res.json({ status: true, followers_id: followers_id })
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Follower ids.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/watchlist_ids', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)

            let watchlist = []
            const watchlistQuery = await company_watchlistM.find({ user_row_id: user_row_id }, { company_row_id: 1 })
            if (watchlistQuery) {
                watchlist = array_column(watchlistQuery, 'company_row_id')
            }

            res.json({ status: true, message: watchlist })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Watchlist ids.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/unique_business_models', async (req, res) => {
    try {
        const unique = await companyM.distinct("main_business_model_id");

        const businessModelPromises = unique.map(async (i) => {
            const checkActive = await companyBusinessModelsM.findOne({ _id: i, active_status: true }, { business_name: 1, _id: 0 });
            if (checkActive) {
                const count = await companyM.countDocuments({ main_business_model_id: i })
                return { main_business_id: i, main_business_name: checkActive.business_name, count }
            }
            return null
        })

        let myArr = (await Promise.all(businessModelPromises)).filter(item => item !== null)

        myArr.sort((a, b) => b.count - a.count)

        res.json({ status: true, message: myArr.slice(0, 4), other_array: myArr.slice(4) })
    }
    catch (err) {
        console.log('Unique business models.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/partners_unique_businesses', async (req, res) => {
    try {
        const listPartners = await added_to_partnersM.find({}, { company_row_id: 1 })
        let idList = []
        for (let eachPartner of listPartners) {
            idList.push(eachPartner.company_row_id)
        }
        const unique = await companyM.find({ _id: { $in: idList } }, { main_business_model_id: 1 }).distinct("main_business_model_id")
        let myArr = []
        for (let i of unique) {
            const checkActive = await companyBusinessModelsM.findOne({ _id: i, active_status: true }, { business_name: 1, _id: 0 })
            if (checkActive) {
                let innerObj = {}
                innerObj["main_business_id"] = i
                innerObj["main_business_name"] = checkActive.business_name
                innerObj["count"] = await companyM.countDocuments({ main_business_model_id: i })
                const new_object = await Promise.resolve(innerObj)
                myArr.push(new_object)
            }
        }

        myArr.sort(function (a, b) {
            return b.count - a.count
        })

        res.json({ status: true, message: myArr.slice(0, 4), other_array: myArr.slice(4, unique.length) })
    }
    catch (err) {
        console.log('Partners unique business.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/get_exchanges_countries', async (req, res) => {
    try {
        const get_query = await countryM.aggregate([

            {
                $lookup: {
                    from: "cln_exchanges_static_countries",
                    localField: "_id",
                    foreignField: "country_id",
                    as: "country_info"
                }
            },

            {
                $lookup: {
                    from: "cln_exchange_bodies",
                    localField: "_id",
                    foreignField: "country_id",
                    as: "regulatory_info"
                }
            },

            // ensure country exists in exchanges table
            { $match: { country_info: { $ne: [] } } },

            // optional: ensure country exists in regulatory bodies
            { $match: { regulatory_info: { $ne: [] } } },

            { $unwind: "$country_info" },

            { $sort: { "country_info._id": 1 } },

            {
                $project: {
                    _id: 1,
                    country_code: 1,
                    country_name: 1,
                    country_flag: 1,
                    currency_code: 1,
                    has_regulatory_body: {
                        $cond: [
                            { $gt: [{ $size: "$regulatory_info" }, 0] },
                            1,
                            0
                        ]
                    }
                }
            }
        ]);

        res.json({ status: true, message: get_query, });
    } catch (err) {
        console.error('Error fetching exchange countries:', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});




router.get('/get_regulatories_types_list', async (req, res) => {
    try {
        let matchStage = {};
        if (req.query.search?.trim()) {
            matchStage.regulator_type_name = {
                $regex: req.query.search.trim(),
                $options: "i"
            };
        }
        const result = await company_regulatory_typesM.aggregate([
            {
                $match: matchStage
            },
            {

                $lookup: {
                    from: "cln_exchange_bodies",
                    let: { type_id: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$regulatory_type_id", "$$type_id"]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: { body_id: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $in: [
                                                    "$$body_id",
                                                    { $ifNull: ["$regularities_details.regulatory_bodies_ids", []] }
                                                ]
                                            }
                                        }
                                    }
                                ],
                                as: "companies"
                            }
                        },
                        {
                            $unwind: "$companies"

                        }
                    ],
                    as: "companies"
                }
            },

            {
                $addFields: {
                    pending_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",

                                cond: {
                                    $and: [
                                        { $eq: ["$$c.approval_status", 0] },
                                        { $eq: ["$$c.active_status", 1] }
                                    ]
                                }
                            }
                        }
                    },
                    approved_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: {
                                    $and: [
                                        { $eq: ["$$c.approval_status", 1] },
                                        { $eq: ["$$c.active_status", 1] }
                                    ]
                                }
                            }
                        }
                    },
                    rejected_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.approval_status", 2] }
                            }
                        }
                    },
                    disabled_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.active_status", 0] }
                            }
                        }
                    },
                    deleted_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.active_status", 2] }
                            }
                        }
                    }
                }
            },

            {
                $project: {
                    companies: 0
                }
            },
            {
                $project: {
                    _id: 1,
                    regulator_type_name: 1,
                    date_n_time: 1,
                    pending_count: 1,
                    approved_count: 1,
                    rejected_count: 1,
                    disabled_count: 1,
                    deleted_count: 1
                }
            }

        ]);

        res.json({ status: true, message: result });

    } catch (err) {
        console.log('regulatories types error:', err.message);
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});


router.get('/get_body_type/:body_id', async (req, res) => {
    try {
        const bodyId = Number.parseInt(req.params.body_id);
        const bodyDoc = await company_exchanges_bodiesM.findOne({ _id: bodyId });

        if (!bodyDoc) {
            return res.json({ status: false, message: 'Body not found' });
        }

        const typeDoc = await company_regulatory_typesM.findOne({ _id: bodyDoc.regulatory_type_id });

        return res.json({
            status: true,
            message: {
                regulatory_type_id: bodyDoc.regulatory_type_id,
                regulator_type_name: typeDoc?.regulator_type_name || ''
            }
        });
    } catch (err) {
        console.error('Error fetching body type:', err.message);
        return res.json({ status: false, message: 'Internal server error' });
    }
});


router.get('/get_regulatories_body_list', async (req, res) => {
    try {


        let matchStage = {};
        const escapeRegex = (text = "") =>
            text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        if (req.query.search?.trim()) {
            const keyword = escapeRegex(req.query.search.trim());

            matchStage.regulatory_bodies_name = {
                $regex: keyword,
                $options: "i"
            };
        }


        const result = await company_exchanges_bodiesM.aggregate([
            {
                $match: matchStage
            },
            {
                $lookup: {
                    from: 'cln_static_countries',
                    localField: 'country_id',
                    foreignField: '_id',
                    as: 'country_info'
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: 'cln_company_regulatory_types',
                    localField: 'regulatory_type_id',
                    foreignField: '_id',
                    as: 'type_info'
                }
            },
            { $unwind: { path: "$type_info", preserveNullAndEmptyArrays: true } },

            // Find companies that contain this regulatory body
            {
                $lookup: {
                    from: "cln_company_lists",
                    let: { reg_body_id: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$reg_body_id",
                                        { $ifNull: ["$regularities_details.regulatory_bodies_ids", []] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "companies"
                }
            },

            // Add counts
            {
                $addFields: {
                    pending_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: {
                                    $and: [
                                        { $eq: ["$$c.approval_status", 0] },
                                        { $eq: ["$$c.active_status", 1] }
                                    ]
                                }

                            }
                        }
                    },
                    approved_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: {
                                    $and: [
                                        { $eq: ["$$c.approval_status", 1] },
                                        { $eq: ["$$c.active_status", 1] }
                                    ]
                                }

                            }
                        }
                    },
                    rejected_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.approval_status", 2] }
                            }
                        }
                    },
                    disabled_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.active_status", 0] }
                            }
                        }
                    },
                    deleted_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.active_status", 2] }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    companies: 0
                }
            },

            {
                $project: {
                    _id: 1,
                    country_id: 1,
                    regulatory_bodies_name: 1,
                    regulatory_type_id: 1,
                    date_n_time: 1,
                    country_name: '$country_info.country_name',
                    country_flag: '$country_info.country_flag',
                    currency_code: '$country_info.currency_code',
                    country_code: '$country_info.country_code',
                    regulator_type_name: "$type_info.regulator_type_name",
                    pending_count: 1,
                    approved_count: 1,
                    rejected_count: 1,
                    disabled_count: 1,
                    deleted_count: 1
                }
            }
        ]);

        res.json({ status: true, message: result });

    } catch (err) {
        console.log('exchanges countries error:', err.message);
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});

router.get("/trending_companies", async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }
        let { skip, limit } = req.query;
        skip = !Number.isNaN(Number.parseInt(skip)) ? Number.parseInt(skip) : 0;
        limit = !Number.isNaN(Number.parseInt(limit)) ? Number.parseInt(limit) : 10;

        const result = await getTrendingCompanies(user_row_id, skip, limit);

        if (result.status) {
            res.json({
                status: true,
                message: result.message,
                cache_response_status: result.cache_response_status || false
            });
        } else {
            res.json({
                status: false,
                message: result.message,
                error: result.error
            });
        }

    } catch (err) {
        console.error("Error in /trending_companies:", err);
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});


router.get("/search_companies", async (req, res) => {
    try {
        let limit = 10;
        if (req.query.limit && !Number.isNaN(Number.parseInt(req.query.limit))) {
            limit = Number.parseInt(req.query.limit);
        }

        let search = req.query.search || "";

        const result = await searchCompanies(search, limit);

        if (result.status) {
            res.json({
                status: true,
                message: result.message,
                cache_response_status: result.cache_response_status || false
            });
        } else {
            res.json({
                status: false,
                message: result.message,
                error: result.error
            });
        }

    } catch (err) {
        console.error("Error in /search_companies:", err);
        res.json({
            status: false,
            message: [],
            error: 'An unexpected error occurred. Please try again later.'
        });
    }
});


router.get("/compare_companies_by_ids", async (req, res) => {
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
    } catch (err) {
        res.json({ status: false, message: { alert_message: err.message } });
    }
});




router.get('/popular_companies', async (req, res) => {
    try {
        const result = await getPopularCompanies();
        return res.json(result);
    } catch (err) {
        console.error("Error fetching popular companies:", err);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});

module.exports = router