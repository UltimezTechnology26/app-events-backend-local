const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAllLoginToken } = require('../../middleware/authorization')
const { getPresentDateTime, arrangeValidation, createDateTime, createEndDateOnly } = require('../../utils/helpers/helper')
const { updateNotification } = require('../../utils/helpers/notification_helper')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
const funding_roundsM = require('../../models/app/static/funding_roundsM')
const funding_investor_typesM = require('../../models/app/static/funding_investor_typesM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const professionals_manual_retrievalsM = require('../../models/app/users/professionals_manual_retrievalsM')
const { deleteUserFunding, calculateUserProfileScore, calculateCompanyProfileScore } = require('../../utils/helpers/app_helper')
const { getCache, setCache, deleteKeysByPattern } = require('../../config/cache_helper')
const dayjs = require("dayjs");
const { getCollectionID } = require('../../utils/helpers/database_helper')

async function getCompanyByRowId(user_row_id) {
    try {
        const companyQuery = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 }, { _id: 1 })
        if (companyQuery) {
            return { status: true, message: Number.parseInt(companyQuery._id) }
        }
        else {
            return { status: false, message: { alert_message: 'Sorry, Company not listed.' } }
        }

    }
    catch (err) {
        console.log('Get company by row id.', err.message)
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
    }
}



router.get('/funding_graph/:company_row_id', async (req, res) => {
    try {
        let errObj = {}
        const company_row_id = Number.parseInt(sanitize(req.params.company_row_id))
        if (!Number.isNaN(company_row_id)) {
            let matchStage = {
                verified_status: 1,
                funds_raised_company_row_id: company_row_id
            };

            let filterYears = 0;
            if (req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter))) {
                filterYears = Number.parseInt(req.query.year_filter);
            }

            if (filterYears > 0) {
                const latestDateDoc = await fundingInvestmentM.findOne(matchStage)
                    .sort({ announcement_date: -1 })
                    .select({ announcement_date: 1 })
                    .lean();

                if (latestDateDoc?.announcement_date) {
                    const latestYear = new Date(latestDateDoc.announcement_date).getUTCFullYear();
                    const cutoffYear = latestYear - filterYears + 1;
                    const cutoffDate = new Date(`${cutoffYear}-01-01T00:00:00.000Z`);

                    matchStage = {
                        ...matchStage,
                        announcement_date: { $gte: cutoffDate }
                    };
                }
            }

            if (Object.keys(errObj).length) {
                return res.json({ status: false, message: errObj });
            }
            const key = `funding_graph_${company_row_id}_${filterYears}`;

            const cache_response = await getCache({ key });
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message.list,
                    cache_response_status: true
                });
            }
            else {
                let result = {}

                // Purely round-based: validates each row has a resolvable investor
                // (registered/manual user or company), then collapses to one row per
                // (month, round_id) so a multi-investor round's shared amount is counted
                // exactly once. Investor NAMES are collected per round for hover display,
                // but no dollar amount is attributed per investor — there is no valid way
                // to split a round's shared amount across its investors.
                const monthly_rounds_query = await fundingInvestmentM.aggregate([
                    { $match: matchStage },
                    {
                        $set: {
                            yearMonth: {
                                $dateToString: { format: "%Y-%m", date: "$announcement_date" }
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_professionals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$investor_type'] },
                                                        { $eq: [1, '$$investor_registered_type'] },
                                                        { $eq: ['$_id', '$$investor_row_id'] }
                                                    ]
                                                }
                                            },
                                            { login_status: 1 }
                                        ]
                                    }
                                },
                                { $project: { _id: 1, full_name: 1 } }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                },
                                { $project: { _id: 1, full_name: 1 } }
                            ]
                        }
                    },
                    {
                        $lookup: {
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
                                                active_status: 1,
                                                approval_status: 1
                                            }
                                        ]
                                    }
                                },
                                { $project: { _id: 1, company_name: 1 } }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_company_manual_retrievals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                },
                                { $project: { _id: 1, company_name: 1 } }
                            ]
                        }
                    },
                    // Resolve investor_name for this row (used for hover display only —
                    // never used to attribute a dollar amount per investor)
                    {
                        $set: {
                            investor_name: {
                                $ifNull: [
                                    { $arrayElemAt: ["$user_info.full_name", 0] },
                                    {
                                        $ifNull: [
                                            { $arrayElemAt: ["$user_manual_info.full_name", 0] },
                                            {
                                                $ifNull: [
                                                    { $arrayElemAt: ["$company_info.company_name", 0] },
                                                    { $arrayElemAt: ["$company_manual_info.company_name", 0] }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    // Validate at least one resolvable investor exists for this row
                    {
                        $match: {
                            $or: [
                                { "user_info.0": { $exists: true } },
                                { "user_manual_info.0": { $exists: true } },
                                { "company_info.0": { $exists: true } },
                                { "company_manual_info.0": { $exists: true } }
                            ]
                        }
                    },
                    // Collapse to one row per (month, round_id) — the round's shared
                    // amount is taken once via $first, regardless of how many investor
                    // rows exist for that round. investor_names collects every distinct
                    // investor in the round (for hover display, no amounts attached).
                    {
                        $group: {
                            _id: { yearMonth: "$yearMonth", round_id: "$round_id" },
                            amount: { $first: "$amount" },
                            investor_names: { $addToSet: "$investor_name" }
                        }
                    },
                    // Sum across rounds within each month, count how many rounds landed
                    // in that month, and collect investor names across all of that
                    // month's rounds (flattened — hover shows "who funded this month",
                    // not a per-round breakdown).
                    {
                        $group: {
                            _id: "$_id.yearMonth",
                            total_fund: { $sum: "$amount" },
                            round_count: { $sum: 1 },
                            investor_name_groups: { $push: "$investor_names" }
                        }
                    },
                    {
                        $set: {
                            investor_names: {
                                $reduce: {
                                    input: "$investor_name_groups",
                                    initialValue: [],
                                    in: { $setUnion: ["$$value", "$$this"] }
                                }
                            }
                        }
                    },
                    { $sort: { _id: 1 } },
                    {
                        $project: {
                            _id: 0,
                            month: "$_id",
                            total_fund: 1,
                            round_count: 1,
                            investor_names: 1
                        }
                    }
                ]);

                result['unique_investors_list'] = monthly_rounds_query
                await setCache({
                    key,
                    value: { list: result }, // cache format
                    ttl: 1800
                })

                return res.json({
                    status: true,
                    message: result,
                    cache_response_status: false
                })
            }
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, Invalid company  row id' } })
        }

    }
    catch (err) {
        console.log('Revenue Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})



router.get('/investment_graph/:investor_type/:investor_row_id', async (req, res) => {
    try {
        let errObj = {};

        const investor_type = Number.parseInt(req.params.investor_type);
        const investor_row_id = Number.parseInt(req.params.investor_row_id);

        if (!Number.isNaN(investor_type) && !Number.isNaN(investor_row_id)) {

            let filterYears = 0;
            let cutoffDate = null;

            if (req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter))) {
                filterYears = Number.parseInt(req.query.year_filter);

                // Find the latest investment for this investor
                const latestDateDoc = await fundingInvestmentM.findOne({
                    verified_status: 1,
                    investor_registered_type: 1,
                    investor_type: investor_type,
                    investor_row_id: investor_row_id
                })
                    .sort({ announcement_date: -1 })
                    .select({ announcement_date: 1 });

                if (latestDateDoc?.announcement_date) {
                    const latestYear = new Date(latestDateDoc.announcement_date).getFullYear();
                    const cutoffYear = latestYear - filterYears + 1;
                    cutoffDate = new Date(`${cutoffYear}-01-01`);
                }
            }

            const matchStage = {
                verified_status: 1,
                investor_registered_type: 1,
                investor_type: investor_type,
                investor_row_id: investor_row_id
            };

            if (cutoffDate) {
                matchStage.announcement_date = { $gte: cutoffDate };
            }

            if (Object.keys(errObj).length) {
                return res.json({ status: false, message: errObj });
            }
            let result = {};
            const key = `investment_graph_${investor_row_id}_${filterYears}_${investor_type}`;
            const cache_response = await getCache({ key });
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message.list,

                    cache_response_status: true
                });
            }

            // Excludes syndicate investments (rounds with more than one investor)
            // entirely, same rule as investor_overview's total_funds_invested. A
            // self-lookup on round_id counts how many total investor rows share each
            // round; only solo investments (count <= 1) are included in the graph.
            const unique_invested_companies_query = await fundingInvestmentM.aggregate([
                { $match: matchStage },
                {
                    $set: {
                        yearMonth: {
                            $dateToString: { format: "%Y-%m", date: "$announcement_date" }
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
                                    _id: 0,
                                    company_name: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_company_manual_retrievals",
                        let: {
                            funds_raised_registered_type: "$funds_raised_registered_type",
                            funds_raised_company_row_id: "$funds_raised_company_row_id"
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, "$$funds_raised_registered_type"] },
                                            { $eq: ["$_id", "$$funds_raised_company_row_id"] }
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
                {
                    $set: {
                        company_name: {
                            $ifNull: [
                                { $arrayElemAt: ["$company_info.company_name", 0] },
                                { $arrayElemAt: ["$manual_info.company_name", 0] }
                            ]
                        }
                    }
                },
                {
                    $match: {
                        $and: [
                            { company_name: { $ne: null } },
                            { company_name: { $ne: "" } }
                        ]
                    }
                },
                // Self-lookup: count how many total rows (across all investors) share
                // this row's round_id, to detect syndicate (multi-investor) rounds.
                {
                    $lookup: {
                        from: "cln_funding_investment_lists",
                        let: { round_id: "$round_id" },
                        as: "round_investor_rows",
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$round_id", "$$round_id"] }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                // Exclude syndicate rounds (more than 1 investor sharing round_id)
                {
                    $match: {
                        $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                    }
                },
                {
                    $group: {
                        _id: {
                            yearMonth: "$yearMonth",
                            company_name: "$company_name"
                        },
                        amount: { $sum: "$amount" }
                    }
                },
                {
                    $group: {
                        _id: "$_id.yearMonth",
                        total_fund: { $sum: "$amount" },
                        companies: {
                            $push: {
                                company_name: "$_id.company_name",
                                amount: "$amount"
                            }
                        }
                    }
                },
                { $sort: { _id: 1 } },
                {
                    $project: {
                        _id: 0,
                        month: "$_id",
                        total_fund: 1,
                        companies: 1
                    }
                }
            ]);

            result['investment_graph'] = unique_invested_companies_query;
            await setCache({
                key,
                value: { list: result }, // cache format
                ttl: 1800
            })

            return res.json({
                status: true,
                message: result,
                cache_response_status: false
            })
        } else {
            res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } });
        }
    } catch (err) {
        console.log('Investment Graph Error:', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});




router.get('/delete_funding_details/:funding_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const round_id = Number.parseInt(sanitize(req.params.funding_row_id))
            if (!Number.isNaN(round_id)) {
                const round_rows = await fundingInvestmentM.find({ round_id: round_id })
                console.log('DEBUG delete: round_id=', round_id, 'found rows=', round_rows.length, 'ids=', round_rows.map(r => r._id))

                if (round_rows.length > 0) {
                    const delete_result = await fundingInvestmentM.deleteMany({ round_id: round_id })
                    const totalDeleted = delete_result.deletedCount
                    console.log('DEBUG delete: totalDeleted=', totalDeleted, 'expected=', round_rows.length)

                    await deleteKeysByPattern('funding_graph_*')
                    await deleteKeysByPattern('funds_raised_individual_details*')
                    await deleteKeysByPattern('company_fund_raised_overview_*')
                    await deleteKeysByPattern('funds_raised_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('investor_list_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('investor_overview_*')
                    await deleteKeysByPattern('investment_graph_*')
                    await deleteKeysByPattern('investor_overview_with_row_id_*')

                    for (const row of round_rows) {
                        if (row?.investor_type == 1) {
                            await calculateUserProfileScore(row?.investor_row_id, ['funding', 'investment'])
                        } else {
                            await calculateCompanyProfileScore(row?.investor_row_id, ['funding', 'investment'])
                        }
                    }
                    await calculateCompanyProfileScore(round_rows[0]?.funds_raised_company_row_id, ['funding', 'investment'])

                    if (totalDeleted === 0) {
                        return res.json({ status: false, message: { alert_message: 'Nothing was deleted. Please contact support.' } })
                    }

                    res.json({ status: true, message: { alert_message: 'Your investment funding  details have been successfully deleted from your profile.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Funding Row ID' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Delete Funding details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



//user as investor starts here
router.post('/investor_user_update_details', [
    check('category_row_id')
        .trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
    check('announcement_date')
        .trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
    // check('amount')
    // .trim().not().isEmpty().withMessage('The Funding Amount field is required.')
    // .isFloat({min:1}).withMessage('The Funding Amount field must be contains greater than or equal to 1.'),
    check('funds_raised_registered_type')
        .trim().not().isEmpty().withMessage('The Investor row id field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Investor Registered Type field must be contains only integers.'),
    check('funds_raised_company_row_id')
        .trim().not().isEmpty().withMessage('The Investor Registered Type field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const funds_raised_registered_type = Number.parseInt(sanitize(req.body.funds_raised_registered_type)) //1:registered, 2:manual
            const funds_raised_company_row_id = Number.parseInt(sanitize(req.body.funds_raised_company_row_id))
            const investor_type = !Number.isNaN(Number.parseInt(req.body.investor_type)) ? Number.parseInt(sanitize(req.body.investor_type)) : 1 //1:user, 2:company
            const investor_registered_type = 1 //1:registered, 2:manual
            const user_row_id = Number.parseInt(checkUserToken.message) // investor_row_id   
            let funds_raised_user_row_id = 0
            let investor_row_id = 0
            if (investor_type == 1) {
                investor_row_id = user_row_id
            }
            else {
                let check_company_query = await getCompanyByRowId(user_row_id)
                if (check_company_query.status) {
                    investor_row_id = check_company_query.message
                }
                else {
                    errObj['alert_message'] = 'Sorry!, This user does not any company or its not approved.'
                }
            }

            let category_row_id = 0
            if (req.body.category_row_id) {
                category_row_id = Number.parseInt(sanitize(req.body.category_row_id))
                const check_funding_round_query = await funding_roundsM.findOne({ _id: category_row_id }, { _id: 1 })
                if (!check_funding_round_query) {
                    errObj['category_row_id'] = 'The category row id field is invalid.'
                }
            }


            let investor_category_row_id = 0
            if (req.body.investor_category_row_id) {
                investor_category_row_id = Number.parseInt(sanitize(req.body.investor_category_row_id))
                const check_funding_round_query = await funding_investor_typesM.findOne({ _id: investor_category_row_id }, { _id: 1 })
                if (!check_funding_round_query) {
                    errObj['investor_category_row_id'] = 'The investor category row id field is invalid.'
                }
            }





            if (funds_raised_registered_type == 1) {
                const company_reg_query = await companyM.findOne({ _id: funds_raised_company_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
                if (!company_reg_query) {
                    errObj['investor_row_id'] = 'Sorry, Invalid registered company row id'
                }
                else if (company_reg_query.user_row_id) {
                    funds_raised_user_row_id = company_reg_query.user_row_id
                }

            }
            else {
                const company_manual_query = await company_manual_retrievalsM.findOne({ _id: funds_raised_company_row_id }, { _id: 1 })
                if (!company_manual_query) {
                    errObj['investor_row_id'] = 'Sorry, Invalid manual company row id'
                }
            }

            let funding_row_id = ""
            if (req.body.funding_row_id) {
                funding_row_id = Number.parseInt(sanitize(req.body.funding_row_id))
                if (!Number.isNaN(funding_row_id)) {
                    const check_funding_query = await fundingInvestmentM.findOne({ _id: funding_row_id })
                    if (!check_funding_query) {
                        errObj['funding_row_id'] = 'Invalid funding row id.'
                    }
                }
                else {
                    errObj['funding_row_id'] = 'Invalid funding row id.'
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const insertArray = {}
                insertArray['category_row_id'] = category_row_id
                insertArray['investor_category_row_id'] = investor_category_row_id
                insertArray['announcement_date'] = req.body.announcement_date
                insertArray['amount'] = req.body.amount ? Number.parseInt(req.body.amount) : 0

                if (!funding_row_id) {
                    insertArray['investor_type'] = investor_type
                    insertArray['investor_registered_type'] = investor_registered_type
                    insertArray['investor_row_id'] = investor_row_id
                    insertArray['funds_raised_registered_type'] = funds_raised_registered_type
                    insertArray['funds_raised_company_row_id'] = funds_raised_company_row_id
                    insertArray['verified_status'] = 0
                    insertArray['date_n_time'] = getPresentDateTime()
                    const existing_round_query = await fundingInvestmentM.findOne(
                        {
                            funds_raised_registered_type: funds_raised_registered_type,
                            funds_raised_company_row_id: funds_raised_company_row_id,
                            announcement_date: req.body.announcement_date,
                            category_row_id: category_row_id
                        },
                        { round_id: 1 }
                    )

                    if (existing_round_query && existing_round_query.round_id) {
                        insertArray['round_id'] = existing_round_query.round_id
                    }
                    else {
                        const new_round_id = await getCollectionID('funding_round_id')
                        insertArray['round_id'] = new_round_id
                    }



                    let save_query = await fundingInvestmentM(insertArray).save()
                    await deleteKeysByPattern('investment_graph_*')

                    await deleteKeysByPattern('investor_overview_with_row_id_*')
                    await deleteKeysByPattern('investor_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('company_fund_raised_overview_*')
                    await deleteKeysByPattern('investor_overview_*')
                    await deleteKeysByPattern('funding_graph_*')
                    await deleteKeysByPattern('funds_raised_individual_details*')
                    await deleteKeysByPattern('funds_raised_list*')


                    if ((funds_raised_registered_type == 1) && funds_raised_user_row_id) {
                        await updateNotification({
                            user_row_id: funds_raised_user_row_id,
                            notify_type: investor_type,
                            notify_type_row_id: investor_row_id,
                            message_row_id: 20,
                            action_row_id: save_query._id
                        })
                    }
                    if (investor_type == 1) {
                        await calculateUserProfileScore(investor_row_id, ['investment', 'funding'])
                    } else {
                        await calculateCompanyProfileScore(investor_row_id, ['investment', 'funding'])
                    }
                    await calculateCompanyProfileScore(funds_raised_company_row_id, ['funding', 'investment'])
                    res.json({ status: true, message: { alert_message: 'Congratulations! Your investment funding details have been successfully added', save_query } })
                }
                else {
                    await fundingInvestmentM.updateOne(
                        { _id: funding_row_id },
                        { $set: insertArray }
                    )
                    await deleteKeysByPattern('company_fund_raised_overview_*')
                    await deleteKeysByPattern('funding_graph_*')
                    await deleteKeysByPattern('funds_raised_individual_details*')
                    await deleteKeysByPattern('funds_raised_list_*')
                    await deleteKeysByPattern('investor_overview_with_row_id_*')
                    await deleteKeysByPattern('investor_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('investor_overview_*')
                    await deleteKeysByPattern('investment_graph_*')
                    res.json({ status: true, message: { alert_message: 'Great job! Your investment funding  details have been successfully updated.' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Investor user update details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/investor_individual_details/:investor_type/:funding_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const investor_type = !Number.isNaN(Number.parseInt(req.params.investor_type)) ? Number.parseInt(req.params.investor_type) : 1
            let investor_row_id = 0
            if (investor_type == 1) {
                investor_row_id = user_row_id
            }
            else if (investor_type == 2) {
                const check_company_query = await getCompanyByRowId(user_row_id)
                if (check_company_query.status) {
                    investor_row_id = check_company_query.message
                }
            }


            if (investor_row_id) {
                const funding_row_id = Number.parseInt(req.params.funding_row_id)
                const get_query = await fundingInvestmentM.aggregate([

                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "category_info",
                            pipeline: [
                                {
                                    $project: {
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_funding_investor_types",
                            localField: "investor_category_row_id",
                            foreignField: "_id",
                            as: "investor_category_info",
                            pipeline: [
                                {
                                    $project: {
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$investor_category_info", preserveNullAndEmptyArrays: true } },
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
                                        company_id: 1,
                                        company_logo: 1,
                                        company_name: 1,
                                        company_email_id: 1,
                                        website_link: 1,
                                        active_status: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_manual_retrievals",
                            let: {
                                funds_raised_registered_type: '$funds_raised_registered_type',
                                funds_raised_company_row_id: '$funds_raised_company_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                        }
                    },
                    {
                        $match: {
                            company_data: { $nin: ["", null] },
                            _id: funding_row_id,
                            investor_type: investor_type,
                            investor_registered_type: 1,
                            investor_row_id: investor_row_id
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            funds_raised_registered_type: 1,
                            funds_raised_company_row_id: 1,
                            company_approval_status: "$company_data.approval_status",
                            company_active_status: "$company_data.active_status",
                            company_row_id: "$company_data._id",
                            company_name: "$company_data.company_name",
                            company_id: "$company_data.company_id",
                            company_email_id: "$company_data.company_email_id",
                            website_link: "$company_data.website_link",
                            company_logo: "$company_data.company_logo",
                            announcement_date: 1,
                            category_row_id: 1,
                            amount: 1,
                            verified_status: 1,
                            verified_on: 1,
                            reject_type: 1,
                            reject_reason: 1,
                            investor_category_row_id: 1,
                            investor_category_name: "$investor_category_info.category_name",
                            category_name: "$category_info.category_name"
                        }
                    }
                ]).limit(1)

                if (get_query[0]) {
                    res.json({ status: true, message: get_query[0] })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid funding row id." } })
                }
            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid input are supplied.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Investor individual details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/investor_list/:investor_type/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const investor_type = !Number.isNaN(Number.parseInt(req.params.investor_type)) ? Number.parseInt(req.params.investor_type) : 1
            let investor_row_id = 0
            if (investor_type == 1) {
                investor_row_id = user_row_id
            }
            else if (investor_type == 2) {
                const check_company_query = await getCompanyByRowId(user_row_id)
                if (check_company_query.status) {
                    investor_row_id = check_company_query.message
                }
            }

            if (investor_row_id) {
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)
                const resultArray = {}

                let search_query = [{ company_data: { $nin: ["", null] }, investor_type: investor_type, investor_registered_type: 1, investor_row_id: investor_row_id }]
                if (req.query.search) {
                    search_query.push({
                        $or: [
                            { company_name: { '$regex': req.query.search, $options: 'i' } },
                            { company_id: { '$regex': req.query.search, $options: 'i' } },
                            { category_name: { '$regex': req.query.search, $options: 'i' } }
                        ]
                    })
                }
                if (req.query.start_date) {
                    const start_date = createDateTime(req.query.start_date);
                    search_query.push({ announcement_date: { $gte: new Date(start_date) } });
                }

                if (req.query.end_date) {
                    const end_date = createEndDateOnly(req.query.end_date);
                    search_query.push({ announcement_date: { $lte: new Date(end_date) } });
                }

                if (!Number.isNaN(Number.parseInt(req.query.investment_type))) {
                    search_query.push({ investor_type: Number.parseInt(req.query.investment_type) })
                }

                if (req.query.category_row_id) {
                    search_query.push({ category_row_id: Number.parseInt(req.query.category_row_id) });
                }
                if (req.query.investor_category_row_id) {
                    search_query.push({ investor_category_row_id: Number.parseInt(req.query.investor_category_row_id) });
                }
                const key =
                    'investor_list_' +
                    investor_type +
                    '_' +
                    investor_row_id +
                    '_' +
                    skip +
                    '_' +
                    limit +
                    '_' +
                    JSON.stringify(req.query || {})

                // Check Redis cache
                const cache_response = await getCache({ key })
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message,
                        cache_response_status: true
                    })
                }


                resultArray['list'] = await fundingInvestmentM.aggregate([
                    {
                        $sort: { announcement_date: -1 }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "category_info"
                        }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_funding_investor_types",
                            localField: "investor_category_row_id",
                            foreignField: "_id",
                            as: "investor_category_info",
                            pipeline: [
                                {
                                    $project: {
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$investor_category_info", preserveNullAndEmptyArrays: true } },
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
                                        company_id: 1,
                                        company_logo: 1,
                                        company_name: 1,
                                        company_email_id: 1,
                                        website_link: 1,
                                        active_status: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_manual_retrievals",
                            let: {
                                funds_raised_registered_type: '$funds_raised_registered_type',
                                funds_raised_company_row_id: '$funds_raised_company_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            company_name: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info.company_name", else: '$manual_info.company_name' } },
                            company_id: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info.company_id", else: '' } },
                            category_name: "$category_info.category_name",
                            company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                        }
                    },
                    {
                        $match: { $and: search_query }
                    },
                    // Self-lookup: count how many total rows (across all investors) share
                    // this row's round_id. More than 1 means this round had multiple
                    // co-investors (a syndicate) — used by the frontend to hide Edit/Delete
                    // and show the "co-invested as part of a syndicate" disclosure, since
                    // an individual investor should not be able to edit or delete a shared
                    // round record that belongs to multiple investors.
                    {
                        $lookup: {
                            from: "cln_funding_investment_lists",
                            let: { round_id: "$round_id" },
                            as: "round_investor_rows",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: ["$round_id", "$$round_id"] }
                                    }
                                },
                                { $project: { _id: 1 } }
                            ]
                        }
                    },
                    {
                        $set: {
                            round_investor_count: { $size: "$round_investor_rows" },
                            is_syndicate: { $gt: [{ $size: "$round_investor_rows" }, 1] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            round_id: 1,
                            funds_raised_registered_type: 1,
                            funds_raised_company_row_id: 1,
                            company_row_id: "$company_data._id",
                            company_name: 1,
                            company_id: 1,
                            company_approval_status: "$company_data.approval_status",
                            company_active_status: "$company_data.active_status",
                            company_email_id: "$company_data.company_email_id",
                            website_link: "$company_data.website_link",
                            company_logo: "$company_data.company_logo",
                            investor_category_name: "$investor_category_info.category_name",
                            announcement_date: 1,
                            category_row_id: 1,
                            amount: 1,
                            verified_status: 1,
                            verified_on: 1,
                            reject_type: 1,
                            reject_reason: 1,
                            category_name: 1,
                            round_investor_count: 1,
                            is_syndicate: 1
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await fundingInvestmentM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "category_info"
                        }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
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
                                        company_id: 1,
                                        company_logo: 1,
                                        company_name: 1,
                                        company_email_id: 1,
                                        website_link: 1,
                                        active_status: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_manual_retrievals",
                            let: {
                                funds_raised_registered_type: '$funds_raised_registered_type',
                                funds_raised_company_row_id: '$funds_raised_company_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            company_name: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info.company_name", else: '$manual_info.company_name' } },
                            company_id: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info.company_id", else: '' } },
                            category_name: "$category_info.category_name",
                            company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                        }
                    },
                    {
                        $match: { $and: search_query }
                    },
                    {
                        $count: "count"
                    }
                ])

                resultArray['count'] = 0
                if (count_query[0]) {
                    if (count_query[0].count) {
                        resultArray['count'] = count_query[0].count
                    }
                }

                // res.json({ status: true, message: resultArray })
                await setCache({
                    key,
                    value: resultArray,
                    ttl: 1800 // 30 minutes
                })

                return res.json({
                    status: true,
                    message: resultArray,
                    cache_response_status: false
                })
            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid input are supplied.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Investors list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/investor_overview/:investor_type', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const investor_type = !Number.isNaN(Number.parseInt(req.params.investor_type)) ? Number.parseInt(req.params.investor_type) : 1
            let investor_row_id = 0
            if (investor_type == 1) {
                investor_row_id = user_row_id
            }
            else if (investor_type == 2) {
                const check_company_query = await getCompanyByRowId(user_row_id)
                if (check_company_query.status) {
                    investor_row_id = check_company_query.message
                }
            }

            if (investor_row_id) {
                const key = `investor_overview_${investor_type}_${investor_row_id}`;
                const cache_response = await getCache({ key });
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message,
                        cache_response_status: true
                    });
                }
                const sum_query = await fundingInvestmentM.aggregate([
                    {
                        $match: { investor_type: investor_type, investor_registered_type: 1, investor_row_id: investor_row_id }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "category_info"
                        }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
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
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_manual_retrievals",
                            let: {
                                funds_raised_registered_type: '$funds_raised_registered_type',
                                funds_raised_company_row_id: '$funds_raised_company_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $match: {
                            $or: [
                                { "company_info._id": { $ne: null } },
                                { "manual_info._id": { $ne: null } }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: "$amount"
                            }
                        }
                    }
                ])

                let resultArray = {}
                resultArray['total_amount'] = 0
                if (sum_query[0]) {
                    if (sum_query[0].total) {
                        resultArray['total_amount'] = sum_query[0].total
                    }
                }


                await setCache({
                    key: key,
                    value: resultArray,
                    ttl: 1800
                });

                return res.json({ status: true, message: resultArray, cache_response_status: false });
                // res.json({ status: true, message: resultArray })
            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid input are supplied.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Individual Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})
//user as investor ends here


//company funds raised starts here
router.post('/funds_raised_update_details', [
    check('category_row_id')
        .trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
    check('announcement_date')
        .trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
    // check('amount')
    // .trim().not().isEmpty().withMessage('The Funding Amount field is required.')
    // .isFloat({min:1}).withMessage('The Funding Amount field must be contains greater than or equal to 1.'),
    check('investors')
        .isArray({ min: 1 }).withMessage('The Investors field must contain at least one investor.')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
        const user_row_id = checkUserToken.message
        let funds_raised_company_row_id = 0
        let check_company_query = await getCompanyByRowId(user_row_id)
        if (!check_company_query.status) {
            errObj['investor_row_id'] = 'Sorry!, This user does not any company or its not approved.'
        }
        else {
            funds_raised_company_row_id = check_company_query.message
        }
        const funds_raised_registered_type = 1

        let category_row_id = 0
        if (req.body.category_row_id) {
            category_row_id = Number.parseInt(sanitize(req.body.category_row_id))
            const check_funding_round_query = await funding_roundsM.findOne({ _id: category_row_id }, { _id: 1 })
            if (!check_funding_round_query) {
                errObj['category_row_id'] = 'The category row id field is invalid.'
            }
        }

        // funding_row_id now represents the round_id shared across all investor
        // rows in this round, not a single row's _id.
        let funding_row_id = ""
        if (req.body.funding_row_id) {
            funding_row_id = Number.parseInt(req.body.funding_row_id)
            if (!Number.isNaN(funding_row_id)) {
                const check_funding_query = await fundingInvestmentM.findOne({ round_id: funding_row_id })
                if (!check_funding_query) {
                    errObj['funding_row_id'] = 'Invalid funding row id.'
                }
            }
            else {
                errObj['funding_row_id'] = 'Invalid funding row id.'
            }
        }

        // Per-investor validation. Same checks as before (investor_type,
        // investor_registered_type, investor_row_id, investor_category_row_id),
        // now run once per entry in the investors array. All-or-nothing:
        // a single invalid investor rejects the whole request, nothing is saved.
        const investorsInput = Array.isArray(req.body.investors) ? req.body.investors : []
        const validatedInvestors = []

        for (let i = 0; i < investorsInput.length; i++) {
            const investorRaw = investorsInput[i]
            const errPrefix = `investors[${i}]`

            const investor_type = Number.parseInt(investorRaw.investor_type)
            const investor_registered_type = Number.parseInt(investorRaw.investor_registered_type)
            const investor_row_id = Number.parseInt(investorRaw.investor_row_id)

            if (!investor_type || ![1, 2].includes(investor_type)) {
                errObj[`${errPrefix}.investor_type`] = 'The Investor Type field is required and must be 1 or 2.'
                continue
            }
            if (!investor_registered_type || ![1, 2].includes(investor_registered_type)) {
                errObj[`${errPrefix}.investor_registered_type`] = 'The Investor Registered Type field is required and must be 1 or 2.'
                continue
            }
            if (!investorRaw.investor_row_id || Number.isNaN(investor_row_id)) {
                errObj[`${errPrefix}.investor_row_id`] = 'The Investor Row ID field is required.'
                continue
            }

            let investor_user_row_id = 0
            if (investor_type == 1) {
                if (investor_registered_type == 1) {
                    const user_reg_query = await professionalsM.findOne({ _id: investor_row_id, login_status: 1 })
                    if (!user_reg_query) {
                        errObj[`${errPrefix}.investor_row_id`] = 'Sorry, Invalid registered user row id'
                        continue
                    }
                    else {
                        investor_user_row_id = investor_row_id
                    }
                }
                else if (investor_registered_type == 2) {
                    const user_manual_query = await professionals_manual_retrievalsM.findOne({ _id: investor_row_id }, { _id: 1 })
                    if (!user_manual_query) {
                        errObj[`${errPrefix}.investor_row_id`] = 'Sorry, Invalid manual user row id'
                        continue
                    }
                }
            }
            else if (investor_type == 2) {
                if (investor_registered_type == 1) {
                    const company_reg_query = await companyM.findOne({ _id: investor_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
                    if (!company_reg_query) {
                        errObj[`${errPrefix}.investor_row_id`] = 'Sorry, Invalid registered company row id'
                        continue
                    }
                    else if (company_reg_query.user_row_id) {
                        investor_user_row_id = company_reg_query.user_row_id
                    }
                }
                else {
                    const company_manual_query = await company_manual_retrievalsM.findOne({ _id: investor_row_id }, { _id: 1 })
                    if (!company_manual_query) {
                        errObj[`${errPrefix}.investor_row_id`] = 'Sorry, Invalid manual company row id'
                        continue
                    }
                }
            }

            let investor_category_row_id = 0
            if (investorRaw.investor_category_row_id) {
                investor_category_row_id = Number.parseInt(sanitize(String(investorRaw.investor_category_row_id)))
                const check_investor_category_query = await funding_investor_typesM.findOne({ _id: investor_category_row_id }, { _id: 1 })
                if (!check_investor_category_query) {
                    errObj[`${errPrefix}.investor_category_row_id`] = 'The investor category row id field is invalid.'
                    continue
                }
            }

            validatedInvestors.push({
                investor_type,
                investor_registered_type,
                investor_row_id,
                investor_category_row_id,
                investor_user_row_id
            })
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            try {
                const sharedFields = {}
                sharedFields['category_row_id'] = category_row_id
                sharedFields['announcement_date'] = req.body.announcement_date
                sharedFields['amount'] = req.body.amount ? req.body.amount : 0

                if (!funding_row_id) {
                    // INSERT: one new round_id shared across every investor row in this round.
                    const present_date_n_time = getPresentDateTime()

                    // Uses the existing getCollectionID counter helper with a dedicated
                    // counter name ('funding_round_id'), independent of the cln_funding_investment_lists
                    // _id sequence. This keeps round_id and row _id as separate number spaces.
                    const new_round_id = await getCollectionID('funding_round_id')

                    const save_query = []
                    for (const inv of validatedInvestors) {
                        const doc = new fundingInvestmentM({
                            ...sharedFields,
                            round_id: new_round_id,
                            investor_type: inv.investor_type,
                            investor_registered_type: inv.investor_registered_type,
                            investor_row_id: inv.investor_row_id,
                            investor_category_row_id: inv.investor_category_row_id,
                            funds_raised_registered_type: funds_raised_registered_type,
                            funds_raised_company_row_id: funds_raised_company_row_id,
                            verified_status: 1,
                            verified_on: present_date_n_time,
                            date_n_time: present_date_n_time
                        })
                        const saved_doc = await doc.save()
                        save_query.push(saved_doc)
                    }

                    await deleteKeysByPattern('funding_graph_*')
                    await deleteKeysByPattern('funds_raised_individual_details*')
                    await deleteKeysByPattern('company_fund_raised_overview_*')
                    await deleteKeysByPattern('funds_raised_list*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_user_other_details_*')

                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('investment_graph_*')
                    await deleteKeysByPattern('investor_overview_*')
                    await deleteKeysByPattern('investor_overview_with_row_id_*')
                    await deleteKeysByPattern('investor_list_*')

                    // Side effects run once per investor, same logic as before, just looped.
                    for (let i = 0; i < validatedInvestors.length; i++) {
                        const inv = validatedInvestors[i]
                        const saved_row = save_query[i]

                        if ((inv.investor_registered_type == 1) && inv.investor_user_row_id) {
                            await updateNotification({
                                user_row_id: inv.investor_user_row_id,
                                notify_type: 2,
                                notify_type_row_id: funds_raised_company_row_id,
                                message_row_id: 21,
                                action_row_id: saved_row._id
                            })
                        }
                        if (inv.investor_type == 1) {
                            await calculateUserProfileScore(inv.investor_row_id, ['investment', 'funding'])
                        } else {
                            await calculateCompanyProfileScore(inv.investor_row_id, ['investment', 'funding'])
                        }
                    }
                    await calculateCompanyProfileScore(funds_raised_company_row_id, ['funding', 'funding'])

                    res.json({ status: true, message: { alert_message: 'Congratulations! Your  funding details have been successfully added', save_query } })
                }
                else {
                    // UPDATE: round-level fields update across every row sharing this round_id.
                    // Investor list is fully replaced — old investor rows for this round_id are
                    // deleted and the new array is inserted fresh, per the "edit-as-a-whole" rule.
                    //
                    // verified_status / verified_on / reject_type / reject_reason must NOT reset
                    // on edit. Since the old rows are deleted, we read these fields from the
                    // existing round BEFORE deleting, then carry them onto the freshly inserted
                    // rows. All rows in a round share these values (edit-as-a-whole), so reading
                    // from any one existing row in the round is sufficient.
                    const existing_round_row = await fundingInvestmentM.findOne(
                        { round_id: funding_row_id },
                        { verified_status: 1, verified_on: 1, reject_type: 1, reject_reason: 1 }
                    )

                    const carriedFields = {
                        verified_status: existing_round_row ? existing_round_row.verified_status : 0,
                        verified_on: existing_round_row ? existing_round_row.verified_on : undefined,
                        reject_type: existing_round_row ? existing_round_row.reject_type : undefined,
                        reject_reason: existing_round_row ? existing_round_row.reject_reason : undefined
                    }

                    await fundingInvestmentM.deleteMany({ round_id: funding_row_id })

                    for (const inv of validatedInvestors) {
                        const doc = new fundingInvestmentM({
                            ...sharedFields,
                            ...carriedFields,
                            round_id: funding_row_id,
                            investor_type: inv.investor_type,
                            investor_registered_type: inv.investor_registered_type,
                            investor_row_id: inv.investor_row_id,
                            investor_category_row_id: inv.investor_category_row_id,
                            funds_raised_registered_type: funds_raised_registered_type,
                            funds_raised_company_row_id: funds_raised_company_row_id
                        })
                        await doc.save()
                    }

                    await deleteKeysByPattern('company_fund_raised_overview_*')
                    await deleteKeysByPattern('funding_graph_*')
                    await deleteKeysByPattern('funds_raised_individual_details*')
                    await deleteKeysByPattern('funds_raised_list_*')
                    await deleteKeysByPattern('investor_overview_with_row_id_*')
                    await deleteKeysByPattern('investor_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('investor_overview_*')
                    await deleteKeysByPattern('investment_graph_*')

                    res.json({ status: true, message: { alert_message: 'Great job! Your  funding  details have been successfully updated.' } })
                }
            }
            catch (err) {
                console.log('Update funds raised details.', err.message)
                res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
            }
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.get('/funds_raised_list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            let check_company_query = await getCompanyByRowId(user_row_id)
            if (check_company_query.status) {
                const funds_raised_company_row_id = check_company_query.message
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)
                const resultArray = {}

                let search_query = [{ investor_data: { $nin: ["", null] }, funds_raised_registered_type: 1, funds_raised_company_row_id: funds_raised_company_row_id }]
                if (req.query.search) {
                    search_query.push({
                        $or: [
                            { investor_name: { '$regex': req.query.search, $options: 'i' } },
                            { category_name: { '$regex': req.query.search, $options: 'i' } }
                        ]
                    })
                }

                let date_filter = {};

                if (req.query.start_date) {
                    date_filter.$gte = dayjs(req.query.start_date)
                        .tz("Asia/Kolkata")
                        .startOf("day")
                        .toDate();
                }

                if (req.query.end_date) {
                    date_filter.$lte = dayjs(req.query.end_date)
                        .tz("Asia/Kolkata")
                        .endOf("day")
                        .toDate();
                }

                if (Object.keys(date_filter).length) {
                    search_query.push({ announcement_date: date_filter });
                }

                if (!Number.isNaN(Number.parseInt(req.query.investment_type))) {
                    search_query.push({ investor_type: Number.parseInt(req.query.investment_type) })
                }

                if (req.query.category_row_id) {
                    search_query.push({ category_row_id: Number.parseInt(req.query.category_row_id) });
                }
                const earlyMatchStage = {
                    $match: {
                        funds_raised_registered_type: 1,
                        funds_raised_company_row_id: funds_raised_company_row_id
                    }
                }
                // NOTE: cache key kept on the same skip/limit/query shape as before. Since
                // pagination now operates on rounds (round_id groups) instead of raw rows,
                // skip/limit here mean "skip/limit rounds" — same key fields, different
                // underlying unit. No change needed to the key building itself.
                const key =
                    'funds_raised_list_' +
                    funds_raised_company_row_id +
                    '_' +
                    skip +
                    '_' +
                    limit +
                    '_' +
                    JSON.stringify(req.query || {})

                // Check cache
                const cache_response = await getCache({ key })
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message,
                        cache_response_status: true
                    })
                }

                // Shared lookup/resolution stages reused by both the list and count pipelines.
                // These resolve investor_data/investor_name/category_name per row, exactly as
                // before — unchanged from the original per-row pipeline.
                const resolveInvestorStages = [
                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "category_info"
                        }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_funding_investor_types",
                            localField: "investor_category_row_id",
                            foreignField: "_id",
                            as: "investor_category_info",
                            pipeline: [
                                {
                                    $project: {
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$investor_category_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$investor_type'] },
                                                        { $eq: [1, '$$investor_registered_type'] },
                                                        { $eq: ['$_id', '$$investor_row_id'] }
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
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        email_id: 1,
                                        approval_status: 1,
                                        login_status: 1,
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
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        gender: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        profile_image: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            user_row_id: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$user_info._id"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            then: "$user_manual_info._id"
                                        }
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                user_row_id: '$user_row_id'
                            },
                            as: "outer_info_work",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            { user_row_id: { $nin: ["", null] } },
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: ['$user_row_id', '$$user_row_id'] },
                                                        { $eq: [1, '$$investor_type'] },
                                                        { $eq: ['$public_view', true] },
                                                        { $eq: ['$user_account_type', '$$investor_registered_type'] }
                                                    ]
                                                }
                                            }
                                        ]
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
                                { $limit: 1 },
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
                                                    _id: 1,
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
                                                    _id: 1,
                                                    company_name: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        position_name: '$info_position.position_name',
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                        }
                    },
                    { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },
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
                                        _id: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_name: 1,
                                        company_email_id: 1,
                                        website_link: 1,
                                        active_status: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_manual_retrievals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            then: "$user_manual_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            then: "$company_manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $set: {
                            investor_name: { $cond: { if: "$investor_data.full_name", then: "$investor_data.full_name", else: "$investor_data.company_name" } },
                            category_name: "$category_info.category_name"
                        }
                    }
                ]

                // Per-row stage that tags whether THIS row matches the search/filter criteria.
                // We don't $match-filter rows out here, because doing so would drop sibling
                // investors from a round where only one investor matched. Instead we carry a
                // boolean (row_matches) forward into the $group stage and decide round-level
                // inclusion there via $max (true if ANY row in the round matched).
                //
                // The original search_query array is a plain Mongo match filter (regex,
                // equality, range). Since it's applied post-$lookup/$set here (after
                // investor_name/category_name are computed), we translate each supported
                // filter into its $expr equivalent below, scoped to the filters this endpoint
                // actually supports (investor_name/category_name regex search, announcement_date
                // range, investor_type equality, category_row_id equality).
                const matchExprStages = []
                if (req.query.search) {
                    matchExprStages.push({
                        $or: [
                            { $regexMatch: { input: { $ifNull: ["$investor_name", ""] }, regex: req.query.search, options: "i" } },
                            { $regexMatch: { input: { $ifNull: ["$category_name", ""] }, regex: req.query.search, options: "i" } }
                        ]
                    })
                }
                if (Object.keys(date_filter).length) {
                    if (date_filter.$gte) {
                        matchExprStages.push({ $gte: ["$announcement_date", date_filter.$gte] })
                    }
                    if (date_filter.$lte) {
                        matchExprStages.push({ $lte: ["$announcement_date", date_filter.$lte] })
                    }
                }
                if (!Number.isNaN(Number.parseInt(req.query.investment_type))) {
                    matchExprStages.push({ $eq: ["$investor_type", Number.parseInt(req.query.investment_type)] })
                }
                if (req.query.category_row_id) {
                    matchExprStages.push({ $eq: ["$category_row_id", Number.parseInt(req.query.category_row_id)] })
                }

                const rowMatchStage = {
                    $set: {
                        row_matches: {
                            $and: [
                                { $not: [{ $in: ["$investor_data", ["", null]] }] },
                                { $eq: ["$funds_raised_registered_type", 1] },
                                { $eq: ["$funds_raised_company_row_id", funds_raised_company_row_id] },
                                ...matchExprStages
                            ]
                        }
                    }
                }

                // Group rows into rounds by round_id. Pulls in every investor belonging to
                // the round (not just matching ones), and round_matches is true if ANY
                // investor row in the round satisfied the filters (confirmed behavior).
                const groupByRoundStage = {
                    $group: {
                        _id: "$round_id",
                        round_id: { $first: "$round_id" },
                        announcement_date: { $first: "$announcement_date" },
                        amount: { $first: "$amount" },
                        category_row_id: { $first: "$category_row_id" },
                        category_name: { $first: "$category_name" },
                        round_matches: { $max: "$row_matches" },
                        investors: {
                            $push: {
                                _id: "$_id",
                                verified_status: "$verified_status",
                                verified_on: "$verified_on",
                                investor_type: "$investor_type",
                                investor_registered_type: "$investor_registered_type",
                                reject_type: "$reject_type",
                                reject_reason: "$reject_reason",
                                investor_position_name: { $cond: { if: "$outer_info_work.position_name", then: "$outer_info_work.position_name", else: "" } },
                                investor_company_name: { $cond: { if: "$outer_info_work.company_name", then: "$outer_info_work.company_name", else: "" } },
                                investor_image: { $cond: { if: "$investor_data.profile_image", then: "$investor_data.profile_image", else: "$investor_data.company_logo" } },
                                investor_name: { $cond: { if: "$investor_data.full_name", then: "$investor_data.full_name", else: "$investor_data.company_name" } },
                                investor_email_id: { $cond: { if: "$investor_data.email_id", then: "$investor_data.email_id", else: "$investor_data.company_email_id" } },
                                investor_category_name: "$investor_category_info.category_name",
                                investor_category_row_id: "$investor_category_row_id"
                            }
                        }
                    }
                }

                resultArray['list'] = await fundingInvestmentM.aggregate([
                    earlyMatchStage,
                    ...resolveInvestorStages,
                    rowMatchStage,
                    groupByRoundStage,
                    { $match: { round_matches: true } },
                    { $sort: { amount: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            _id: 0,
                            round_id: 1,
                            announcement_date: 1,
                            amount: 1,
                            category_row_id: 1,
                            category_name: 1,
                            investors: 1
                        }
                    }
                ])

                const count_query = await fundingInvestmentM.aggregate([
                    earlyMatchStage,
                    ...resolveInvestorStages,
                    rowMatchStage,
                    groupByRoundStage,
                    { $match: { round_matches: true } },
                    { $count: "count" }
                ])

                resultArray['count'] = 0
                if (count_query[0]) {
                    if (count_query[0].count) {
                        resultArray['count'] = count_query[0].count
                    }
                }

                // res.json({ status: true, message: resultArray })
                await setCache({
                    key,
                    value: resultArray,
                    ttl: 1800 // 30 min
                })

                return res.json({
                    status: true,
                    message: resultArray,
                    cache_response_status: false
                })
            }
            else {
                res.json({ status: true, message: { alert_message: 'Sorry!, This user does not any company or its not approved.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Funds raised list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/funds_raised_overview/:company_row_id', async (req, res) => {
    try {
        const company_row_id = Number.parseInt(req.params.company_row_id)

        if (!Number.isNaN(company_row_id)) {
            let result = {}
            result['total_usd_value'] = 0
            result['total_unique_investors'] = 0
            result['total_unique_funding_rounds'] = 0
            result['unique_investors_list'] = []

            const key = `company_fund_raised_overview_${company_row_id}`
            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message.list,
                    cache_response_status: true
                })
            }

            // Counts distinct ROUNDS (round_id), not round TYPES (category_row_id).
            // A round with multiple investors shares one round_id across its rows, so
            // grouping by round_id first collapses those rows to one before counting.
            const get_funds_raised_rounds_query = await fundingInvestmentM.aggregate([
                {
                    $match: {
                        verified_status: 1,
                        funds_raised_registered_type: 1,
                        funds_raised_company_row_id: company_row_id
                    }
                },

                // ✅ USER (registered)
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$investor_type'] },
                                                    { $eq: [1, '$$investor_registered_type'] },
                                                    { $eq: ['$_id', '$$investor_row_id'] }
                                                ]
                                            }
                                        },
                                        { login_status: 1 }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                // ✅ USER (manual)
                {
                    $lookup: {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                // ✅ COMPANY (registered)
                {
                    $lookup: {
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
                                            active_status: 1,
                                            approval_status: 1
                                        }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                // ✅ COMPANY (manual)
                {
                    $lookup: {
                        from: "cln_company_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "company_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },

                // ✅ VALIDATION (CRITICAL)
                {
                    $match: {
                        $or: [
                            { "user_info._id": { $ne: null } },
                            { "user_manual_info._id": { $ne: null } },
                            { "company_info._id": { $ne: null } },
                            { "company_manual_info._id": { $ne: null } }
                        ]
                    }
                },

                // ✅ COUNT UNIQUE ROUNDS (by round_id, not category_row_id)
                {
                    $group: {
                        _id: "$round_id"
                    }
                },
                {
                    $count: "count"
                }
            ])

            if (get_funds_raised_rounds_query[0]) {
                result['total_unique_funding_rounds'] = get_funds_raised_rounds_query[0].count
            }


            // Sums the round's shared amount ONCE per round, not once per investor row.
            // A multi-investor round repeats the same `amount` on every row, so this
            // collapses to one representative row per round_id ($first) before summing.
            const funds_raised_query = await fundingInvestmentM.aggregate([
                {
                    $match: {
                        verified_status: 1,
                        funds_raised_registered_type: 1,
                        funds_raised_company_row_id: company_row_id
                    }
                },

                // USER (registered)
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$investor_type'] },
                                                    { $eq: [1, '$$investor_registered_type'] },
                                                    { $eq: ['$_id', '$$investor_row_id'] }
                                                ]
                                            }
                                        },
                                        { login_status: 1 }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                // USER (manual)
                {
                    $lookup: {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                // COMPANY (registered)
                {
                    $lookup: {
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
                                            active_status: 1,
                                            approval_status: 1
                                        }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                // COMPANY (manual)
                {
                    $lookup: {
                        from: "cln_company_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "company_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },

                // VALIDATION (already correct)
                {
                    $match: {
                        $or: [
                            { "user_info._id": { $ne: null } },
                            { "user_manual_info._id": { $ne: null } },
                            { "company_info._id": { $ne: null } },
                            { "company_manual_info._id": { $ne: null } }
                        ]
                    }
                },

                // ✅ Collapse to one row per round_id BEFORE summing, so the round's shared
                // amount is counted once, regardless of how many investors are in it.
                {
                    $group: {
                        _id: "$round_id",
                        amount: { $first: "$amount" }
                    }
                },

                // SUM (now summing one amount per round, not per investor row)
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$amount" }
                    }
                }
            ])


            if (funds_raised_query[0]) {
                if (funds_raised_query[0].total) {
                    result['total_usd_value'] = funds_raised_query[0].total
                }
            }


            // Unique investors — correct as-is. Grouping by investor identity is
            // unaffected by multiple investors sharing a round_id, since each investor
            // still only contributes one group entry regardless of round size.
            const funds_raised_investors_query = await fundingInvestmentM.aggregate([
                {
                    $match: {
                        verified_status: 1,
                        funds_raised_registered_type: 1,
                        funds_raised_company_row_id: company_row_id
                    }
                },

                // ✅ USER (registered)
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$investor_type'] },
                                                    { $eq: [1, '$$investor_registered_type'] },
                                                    { $eq: ['$_id', '$$investor_row_id'] }
                                                ]
                                            }
                                        },
                                        { login_status: 1 }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                // ✅ USER (manual)
                {
                    $lookup: {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                // ✅ COMPANY (registered)
                {
                    $lookup: {
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
                                            active_status: 1,
                                            approval_status: 1
                                        }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                // ✅ COMPANY (manual)
                {
                    $lookup: {
                        from: "cln_company_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "company_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },

                // ✅ REAL VALIDATION (same as list query)
                {
                    $match: {
                        $or: [
                            { "user_info._id": { $ne: null } },
                            { "user_manual_info._id": { $ne: null } },
                            { "company_info._id": { $ne: null } },
                            { "company_manual_info._id": { $ne: null } }
                        ]
                    }
                },

                // ✅ UNIQUE INVESTORS
                {
                    $group: {
                        _id: {
                            investor_type: "$investor_type",
                            investor_registered_type: "$investor_registered_type",
                            investor_row_id: "$investor_row_id"
                        }
                    }
                },

                {
                    $count: "count"
                }
            ])

            if (funds_raised_investors_query[0]) {
                result['total_unique_investors'] = funds_raised_investors_query[0].count
            }


            // Funding split by ROUND TYPE (category_row_id), using each round's real
            // amount exactly once. Replaces the earlier per-investor split — there is
            // no valid way to attribute a fractional dollar amount to each investor in
            // a shared round, so this shows the split across round types instead
            // (e.g. Series A: 40%, Seed: 35%, IDO: 25%), which uses only real numbers.
            const funding_split_query = await fundingInvestmentM.aggregate([
                {
                    $match: { verified_status: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: company_row_id }
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$investor_type'] },
                                                    { $eq: [1, '$$investor_registered_type'] },
                                                    { $eq: ['$_id', '$$investor_row_id'] }
                                                ]
                                            }
                                        },
                                        { login_status: 1 }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "user_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                {
                    $lookup: {
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
                                            active_status: 1,
                                            approval_status: 1
                                        }
                                    ]
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_company_manual_retrievals",
                        let: {
                            investor_type: '$investor_type',
                            investor_registered_type: '$investor_registered_type',
                            investor_row_id: '$investor_row_id'
                        },
                        as: "company_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$investor_type'] },
                                            { $eq: [2, '$$investor_registered_type'] },
                                            { $eq: ['$_id', '$$investor_row_id'] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                {
                    $match: {
                        $or: [
                            { "user_info.0": { $exists: true } },
                            { "user_manual_info.0": { $exists: true } },
                            { "company_info.0": { $exists: true } },
                            { "company_manual_info.0": { $exists: true } }
                        ]
                    }
                },
                // Collapse to one row per round_id, keeping its category_row_id and
                // real amount — counted once regardless of investor count.
                {
                    $group: {
                        _id: "$round_id",
                        category_row_id: { $first: "$category_row_id" },
                        amount: { $first: "$amount" }
                    }
                },
                // Sum real amounts per round type
                {
                    $group: {
                        _id: "$category_row_id",
                        total: { $sum: "$amount" }
                    }
                },
                {
                    $sort: { total: -1 }
                },
                {
                    $lookup: {
                        from: "cln_static_company_funding_rounds",
                        localField: "_id",
                        foreignField: "_id",
                        as: "category_info",
                        pipeline: [
                            { $project: { category_name: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        total: 1,
                        investor_name: "$category_info.category_name"
                    }
                }
            ])
            result['unique_investors_list'] = funding_split_query
            await setCache({
                key,
                value: { list: result }, // cache format
                ttl: 1800
            })

            return res.json({
                status: true,
                message: result,
                cache_response_status: false
            })
            // res.json({ status: true, message: result })
        }
        else {
            res.json({ status: false, message: { alert_message: 'Invalid company row id' } })
        }
    }
    catch (err) {
        console.log('Funds raised list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})



router.get('/investor_overview/:investor_type/:investor_row_id', async (req, res) => {
    try {

        const investor_type = Number.parseInt(req.params.investor_type)
        const investor_row_id = Number.parseInt(req.params.investor_row_id)
        if (!Number.isNaN(investor_type) && !Number.isNaN(investor_row_id)) {
            let result = {}
            result['total_funds_invested'] = 0
            result['total_unique_funding_rounds'] = 0
            result['total_unique_invested_companies'] = 0
            result['unique_invested_companies_list'] = []

            const key = `investor_overview_with_row_id_${investor_type}_${investor_row_id}`;
            const cache_response = await getCache({ key });
            // if (cache_response.status) {
            //     return res.json({
            //         status: true,
            //         message: cache_response.message,
            //         cache_response_status: true
            //     });
            // }
            // total_funds_invested EXCLUDES syndicate investments (rounds with more
            // than one investor) entirely. A self-lookup on round_id counts how many
            // total investor rows share each round; only rows where that count is 1
            // (solo investments) are summed. This avoids showing a total that includes
            // amounts we cannot accurately attribute to this specific investor.
            const funds_invested_query = await fundingInvestmentM.aggregate([
                {
                    $match: { verified_status: 1, investor_registered_type: 1, investor_type: investor_type, investor_row_id: investor_row_id }
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
                                    company_id: 1,
                                    company_logo: 1,
                                    company_name: 1,
                                    company_email_id: 1,
                                    website_link: 1,
                                    active_status: 1,
                                    approval_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_manual_retrievals",
                        let: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$funds_raised_registered_type'] },
                                            { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                    }
                },
                {
                    $match: {
                        company_data: { $nin: ["", null] }
                    }
                },
                // Self-lookup: count how many total rows (across all investors) share
                // this row's round_id, to detect syndicate (multi-investor) rounds.
                {
                    $lookup: {
                        from: "cln_funding_investment_lists",
                        let: { round_id: "$round_id" },
                        as: "round_investor_rows",
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$round_id", "$$round_id"] }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                // Exclude syndicate rounds (more than 1 investor sharing round_id)
                // before summing.
                {
                    $match: {
                        $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: "$amount"
                        }
                    }
                }
            ])

            if (funds_invested_query[0]) {
                if (funds_invested_query[0].total) {
                    result['total_funds_invested'] = funds_invested_query[0].total
                }
            }


            const get_investments_funding_rounds_query = await fundingInvestmentM.aggregate([
                {
                    $match: { verified_status: 1, investor_registered_type: 1, investor_type: investor_type, investor_row_id: investor_row_id }
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
                        _id: '$category_row_id',
                        total: { $sum: 1 },
                    }
                },
                {
                    $count: 'count'
                }
            ])

            const get_investments_funding_rounds_query3 = await fundingInvestmentM.aggregate([
                {
                    $match: { verified_status: 1, investor_registered_type: 1, investor_type: investor_type, investor_row_id: investor_row_id }
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
                        _id: '$category_row_id',
                        total: { $sum: 1 },
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_static_company_funding_rounds",
                        localField: "_id",
                        foreignField: "_id",
                        as: "category_info"
                    }
                },
                { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        total: 1,
                        investor_data: 1,
                        category_name: "$category_info.category_name",
                    }
                }
            ])
            result['get_investments_funding_rounds_query3'] = get_investments_funding_rounds_query3

            if (get_investments_funding_rounds_query[0]) {
                result['total_unique_funding_rounds'] = get_investments_funding_rounds_query[0].count
            }

            const funds_investments_invested_companies_query = await fundingInvestmentM.aggregate([
                {
                    $match: { verified_status: 1, investor_registered_type: 1, investor_type: investor_type, investor_row_id: investor_row_id }
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
                        _id: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        }
                    }
                },
                {
                    $count: 'count'
                }
            ])

            if (funds_investments_invested_companies_query[0]) {
                if (funds_investments_invested_companies_query[0].count) {
                    result['total_unique_invested_companies'] = funds_investments_invested_companies_query[0].count
                }
            }

            // unique_invested_companies_list now EXCLUDES syndicate investments
            // (rounds with more than one investor) entirely, same rule as
            // total_funds_invested above. A self-lookup on round_id counts how many
            // total investor rows share each round; only solo-investment rows are
            // grouped into the per-company totals below.
            const unique_invested_companies_query = await fundingInvestmentM.aggregate([
                {
                    $match: { verified_status: 1, investor_registered_type: 1, investor_type: investor_type, investor_row_id: investor_row_id }
                },
                {
                    $lookup: {
                        from: "cln_funding_investment_lists",
                        let: { round_id: "$round_id" },
                        as: "round_investor_rows",
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$round_id", "$$round_id"] }
                                }
                            },
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                {
                    $match: {
                        $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                    }
                },
                {
                    $group: {
                        _id: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        total: {
                            $sum: "$amount"
                        }
                    }
                },
                {
                    $sort: {
                        total: -1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        let: {
                            funds_raised_registered_type: '$_id.funds_raised_registered_type',
                            funds_raised_company_row_id: '$_id.funds_raised_company_row_id'
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
                                    company_id: 1,
                                    company_logo: 1,
                                    company_name: 1,
                                    company_email_id: 1,
                                    website_link: 1,
                                    active_status: 1,
                                    approval_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_manual_retrievals",
                        let: {
                            funds_raised_registered_type: '$_id.funds_raised_registered_type',
                            funds_raised_company_row_id: '$_id.funds_raised_company_row_id'
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$funds_raised_registered_type'] },
                                            { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        company_data: { $cond: { if: { $eq: ['$_id.funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                    }
                },
                {
                    $match: {
                        company_data: { $nin: ["", null] }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        total: 1,
                        company_name: "$company_data.company_name",
                        company_id: "$company_data.company_id",
                    }
                }
            ])

            result['unique_invested_companies_list'] = unique_invested_companies_query


            await setCache({
                key: key,
                value: result,
                ttl: 1800
            });

            return res.json({ status: true, message: result, cache_response_status: false });


            // res.json({ status: true, message: result })

        }
        else {
            res.json({ status: false, message: { alert_message: 'Invalid company row id' } })
        }
    }
    catch (err) {
        console.log('Funds raised list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/funds_raised_individual_details/:funding_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const check_company_query = await getCompanyByRowId(user_row_id)
            if (check_company_query.status) {
                const company_row_id = check_company_query.message
                // NOTE: funding_row_id (route param, kept as-is for compatibility with the
                // existing frontend call signature) now represents round_id — the shared
                // grouping key across all investor rows in a funding round, not a single
                // row's _id.
                const round_id = Number.parseInt(req.params.funding_row_id)
                const key = `funds_raised_individual_details${round_id}`
                const cache_response = await getCache({ key })
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message.list,
                        cache_response_status: true
                    })
                }
                const get_query = await fundingInvestmentM.aggregate([
                    // Filter to this round + this company's ownership FIRST, before running
                    // the expensive per-row $lookups below. Filtering early avoids resolving
                    // investor data for documents outside this round.
                    {
                        $match: {
                            round_id: round_id,
                            funds_raised_registered_type: 1,
                            funds_raised_company_row_id: company_row_id
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "category_info"
                        }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_funding_investor_types",
                            localField: "investor_category_row_id",
                            foreignField: "_id",
                            as: "investor_category_info",
                            pipeline: [
                                {
                                    $project: {
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$investor_category_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$investor_type'] },
                                                        { $eq: [1, '$$investor_registered_type'] },
                                                        { $eq: ['$_id', '$$investor_row_id'] }
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
                                    $lookup:
                                    {
                                        from: "cln_professionals_work_experiences",
                                        localField: "_id",
                                        foreignField: "user_row_id",
                                        pipeline: [
                                            { $match: { public_view: true, user_account_type: 1 } },//,public_view:true
                                            { $sort: { start_date: -1 } },
                                            { $limit: 1 },
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
                                                    from: "cln_company_lists",
                                                    let: {
                                                        company_type: '$company_type',
                                                        company_row_id: '$company_row_id'
                                                    },
                                                    as: "info_company",
                                                    pipeline: [
                                                        {
                                                            $match: {
                                                                $and: [
                                                                    {
                                                                        $expr: {
                                                                            $and: [
                                                                                { $eq: [1, '$$company_type'] },
                                                                                { $eq: ['$_id', "$$company_row_id"] }
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
                                                                _id: 1,
                                                                company_name: 1
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                            {
                                                $project: {
                                                    position_name: "$info_position.position_name",
                                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                                                }
                                            },
                                            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                            {
                                                $project: {
                                                    position_name: 1,
                                                    company_name: 1
                                                }
                                            }
                                        ],
                                        as: "info_work",
                                    }
                                },
                                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        _id: 1,
                                        user_name: 1,
                                        position_name: "$info_work.position_name",
                                        company_name: "$info_work.company_name",
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        pro_batch: 1,
                                        email_id: 1,
                                        approval_status: 1,
                                        login_status: 1
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
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup:
                                    {
                                        from: "cln_professionals_work_experiences",
                                        localField: "_id",
                                        foreignField: "user_row_id",
                                        pipeline: [
                                            { $match: { public_view: true, user_account_type: 2 } },
                                            { $sort: { start_date: -1 } },
                                            { $limit: 1 },
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
                                                    from: "cln_company_lists",
                                                    let: {
                                                        company_type: '$company_type',
                                                        company_row_id: '$company_row_id'
                                                    },
                                                    as: "info_company",
                                                    pipeline: [
                                                        {
                                                            $match: {
                                                                $and: [
                                                                    {
                                                                        $expr: {
                                                                            $and: [
                                                                                { $eq: [1, '$$company_type'] },
                                                                                { $eq: ['$_id', "$$company_row_id"] }
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
                                                                _id: 1,
                                                                company_name: 1
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                            {
                                                $project: {
                                                    position_name: "$info_position.position_name",
                                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                                                }
                                            }
                                        ],
                                        as: "info_work",
                                    }
                                },
                                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        _id: 1,
                                        gender: 1,
                                        full_name: 1,
                                        pro_batch: 1,
                                        email_id: 1,
                                        profile_image: 1,
                                        position_name: "$info_work.position_name",
                                        company_name: "$info_work.company_name"
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
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
                                        _id: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_name: 1,
                                        company_email_id: 1,
                                        website_link: 1,
                                        active_status: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_manual_retrievals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 1] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            then: "$user_manual_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 2] }
                                                ]
                                            },
                                            then: "$company_manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match:
                        {
                            investor_data: { $nin: ["", null] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            round_id: 1,
                            verified_status: 1,
                            verified_on: 1,
                            investor_row_id: 1,
                            investor_type: 1,
                            investor_registered_type: 1,
                            investor_data: 1,
                            announcement_date: 1,
                            category_row_id: 1,
                            reject_type: 1,
                            reject_reason: 1,
                            investor_image: { $cond: { if: "$investor_data.profile_image", then: "$investor_data.profile_image", else: "$investor_data.company_logo" } },
                            investor_name: { $cond: { if: "$investor_data.full_name", then: "$investor_data.full_name", else: "$investor_data.company_name" } },
                            investor_email_id: { $cond: { if: "$investor_data.email_id", then: "$investor_data.email_id", else: "$investor_data.company_email_id" } },
                            investor_position_name: { $cond: { if: "$investor_data.position_name", then: "$investor_data.position_name", else: "" } },
                            investor_company_name: { $cond: { if: "$investor_data.company_name", then: "$investor_data.company_name", else: "" } },
                            amount: 1,
                            investor_category_row_id: 1,
                            investor_category_name: "$investor_category_info.category_name",
                            category_name: "$category_info.category_name"
                        }
                    },
                    // Group all investors in this round into a single document. Round-level
                    // fields (announcement_date, amount, category_row_id, category_name) are
                    // identical across every row in the round (edit-as-a-whole), so $first is
                    // safe here. Per-investor fields go into the investors array.
                    {
                        $group: {
                            _id: "$round_id",
                            round_id: { $first: "$round_id" },
                            announcement_date: { $first: "$announcement_date" },
                            amount: { $first: "$amount" },
                            category_row_id: { $first: "$category_row_id" },
                            category_name: { $first: "$category_name" },
                            investors: {
                                $push: {
                                    _id: "$_id",
                                    verified_status: "$verified_status",
                                    verified_on: "$verified_on",
                                    investor_row_id: "$investor_row_id",
                                    investor_type: "$investor_type",
                                    investor_registered_type: "$investor_registered_type",
                                    reject_type: "$reject_type",
                                    reject_reason: "$reject_reason",
                                    investor_image: "$investor_image",
                                    investor_name: "$investor_name",
                                    investor_email_id: "$investor_email_id",
                                    investor_position_name: "$investor_position_name",
                                    investor_company_name: "$investor_company_name",
                                    investor_category_row_id: "$investor_category_row_id",
                                    investor_category_name: "$investor_category_name"
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            round_id: 1,
                            announcement_date: 1,
                            amount: 1,
                            category_row_id: 1,
                            category_name: 1,
                            investors: 1
                        }
                    }
                ])

                if (get_query[0]) {
                    await setCache({
                        key,
                        value: { list: get_query }, // cache format
                        ttl: 1800
                    })

                    return res.json({
                        status: true,
                        message: get_query,
                        cache_response_status: false
                    })
                    // res.json({ status: true, message: get_query[0] })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid funding row id." } })
                }
            }
            else {
                res.json({ status: true, message: { alert_message: 'Sorry!, This user does not any company or its not approved.' } })
            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Funds raised individual details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/verify_funds_raised_details/:funding_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const check_company_query = await getCompanyByRowId(user_row_id)
            if (check_company_query.status) {
                const company_row_id = check_company_query.message
                // NOTE: funding_row_id (route param, kept as-is for compatibility with the
                // existing frontend call signature) now represents round_id — verifying a
                // round verifies every investor row sharing it, per the
                // edit/verify/reject/delete-as-a-whole rule.
                const round_id = Number.parseInt(sanitize(req.params.funding_row_id))
                if (!Number.isNaN(round_id)) {
                    const round_rows = await fundingInvestmentM.find({
                        round_id: round_id,
                        funds_raised_registered_type: 1,
                        funds_raised_company_row_id: company_row_id,
                        verified_status: 0
                    })

                    if (round_rows.length > 0) {
                        const verified_on_date = getPresentDateTime()
                        const update_query = {
                            verified_status: 1,
                            verified_on: verified_on_date
                        }

                        await fundingInvestmentM.updateMany(
                            { round_id: round_id, verified_status: 0 },
                            { $set: update_query }
                        )

                        // Notification resolution runs once per investor row, same logic as
                        // before, just looped — each investor may resolve to a different
                        // investor_user_row_id.
                        for (const row of round_rows) {
                            const investor_type = row.investor_type
                            const investor_registered_type = row.investor_registered_type
                            const investor_row_id = row.investor_row_id

                            if (investor_registered_type == 1) {
                                let investor_user_row_id = 0
                                if (investor_type == 1) {
                                    investor_user_row_id = investor_row_id
                                }
                                else {
                                    const get_company_query = await companyM.findOne({ _id: investor_row_id }, { _id: 1, user_row_id: 1 })
                                    if (get_company_query.user_row_id) {
                                        investor_user_row_id = get_company_query.user_row_id
                                    }
                                }

                                if (investor_user_row_id) {
                                    await updateNotification({
                                        user_row_id: investor_user_row_id,
                                        notify_type: 2,
                                        notify_type_row_id: company_row_id,
                                        message_row_id: 22,
                                        action_row_id: row._id
                                    })
                                }
                            }
                        }

                        await deleteKeysByPattern('company_fund_raised_overview_*')
                        await deleteKeysByPattern('funding_graph_*')
                        await deleteKeysByPattern('funds_raised_individual_details*')
                        await deleteKeysByPattern('funds_raised_list_*')
                        await deleteKeysByPattern('investor_overview_with_row_id_*')
                        await deleteKeysByPattern('investor_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('company_investment_funding_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        await deleteKeysByPattern('app_company_list_*')
                        await deleteKeysByPattern('investor_overview_*')
                        await deleteKeysByPattern('investment_graph_*')
                        res.json({ status: true, message: { alert_message: 'This funds raised details has been verified successfully.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, Invalid Funding Row ID' } })
                    }
                }
                else {
                    res.json({ status: true, message: { alert_message: 'Sorry, Invalid Funding Row ID' } })
                }
            }
            else {
                res.json({ status: true, message: { alert_message: 'Sorry!, This user does not any company or its not approved.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Verify funds raised details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/reject_funds_raised_details', [
    check('funding_row_id')
        .trim().not().isEmpty().withMessage('The Funding row id field required.'),
    check('reject_type')
        .trim().not().isEmpty().withMessage('The Reject type field required.')
        .isInt({ min: 1, max: 10 }).withMessage('The Reject type field must be contains only integers.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkUserToken.message
                const check_company_query = await getCompanyByRowId(user_row_id)
                if (check_company_query.status) {
                    const company_row_id = check_company_query.message
                    // NOTE: funding_row_id (request field, kept as-is for compatibility with
                    // the existing frontend call signature) now represents round_id —
                    // rejecting a round rejects every investor row sharing it, per the
                    // edit/verify/reject/delete-as-a-whole rule.
                    const round_id = Number.parseInt(sanitize(req.body.funding_row_id))
                    if (!Number.isNaN(round_id)) {
                        const round_rows = await fundingInvestmentM.find({
                            round_id: round_id,
                            funds_raised_registered_type: 1,
                            funds_raised_company_row_id: company_row_id,
                            verified_status: 0
                        })

                        if (round_rows.length > 0) {
                            const verified_on_date = getPresentDateTime()
                            const update_query = {
                                verified_status: 2,
                                verified_on: verified_on_date,
                                reject_type: Number.parseInt(req.body.reject_type),
                                reject_reason: req.body.reject_reason
                            }

                            // Notification resolution runs once per investor row, same logic
                            // as before, just looped — each investor may resolve to a
                            // different investor_user_row_id.
                            for (const row of round_rows) {
                                const investor_type = row.investor_type
                                const investor_registered_type = row.investor_registered_type
                                const investor_row_id = row.investor_row_id

                                if (investor_registered_type == 1) {
                                    let investor_user_row_id = 0
                                    if (investor_type == 1) {
                                        investor_user_row_id = investor_row_id
                                    }
                                    else {
                                        const get_company_query = await companyM.findOne({ _id: investor_row_id }, { _id: 1, user_row_id: 1 })
                                        if (get_company_query.user_row_id) {
                                            investor_user_row_id = get_company_query.user_row_id
                                        }
                                    }

                                    if (investor_user_row_id) {
                                        await updateNotification({
                                            user_row_id: investor_user_row_id,
                                            notify_type: 2,
                                            notify_type_row_id: company_row_id,
                                            message_row_id: 27,
                                            action_row_id: row._id
                                        })
                                    }
                                }
                            }

                            await fundingInvestmentM.updateMany(
                                { round_id: round_id, verified_status: 0 },
                                { $set: update_query }
                            )

                            await deleteKeysByPattern('company_fund_raised_overview_*')
                            await deleteKeysByPattern('funding_graph_*')
                            await deleteKeysByPattern('funds_raised_individual_details*')
                            await deleteKeysByPattern('funds_raised_list_*')
                            await deleteKeysByPattern('investor_overview_with_row_id_*')
                            await deleteKeysByPattern('investor_list_*')
                            await deleteKeysByPattern('app_company_individual_other_details_*')
                            await deleteKeysByPattern('company_investment_funding_*')
                            await deleteKeysByPattern('app_user_other_details_*')
                            await deleteKeysByPattern('app_company_list_*')
                            await deleteKeysByPattern('investor_overview_*')
                            await deleteKeysByPattern('investment_graph_*')
                            res.json({ status: true, message: { alert_message: 'This funds raised details has been rejected successfully.' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, Invalid Funding Row ID' } })
                        }
                    }
                    else {
                        res.json({ status: true, message: { alert_message: 'Sorry, Invalid Funding Row ID' } })
                    }
                }
                else {
                    res.json({ status: true, message: { alert_message: 'Sorry!, This user does not any company or its not approved.' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Reject funds raised details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//company funds raised ends here


module.exports = router