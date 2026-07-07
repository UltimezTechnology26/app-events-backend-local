require('dotenv').config()
const express = require('express')
const sanitize = require('mongo-sanitize')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, arrangeValidation, checkCompanySubadminAccess, checkUserSubadminAccess, getMinusDates, getPresentDateOnly, yesterDayStartNEndDate, createDateTime, createEndDateOnly } = require('../../../utils/helpers/helper')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const funding_roundsM = require('../../../models/app/static/funding_roundsM')
const funding_investor_typesM = require('../../../models/app/static/funding_investor_typesM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const { deleteUserFunding, calculateUserProfileScore, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
const { getCollectionID } = require('../../../utils/helpers/database_helper')




router.get('/delete_funding_details/:funding_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            // NOTE: funding_row_id (route param, kept as-is for compatibility with
            // the existing admin frontend call signature) now represents round_id —
            // the shared grouping key across all investor rows in a funding round,
            // not a single row's _id. Same change already applied on the app side.
            const round_id = Number.parseInt(req.params.funding_row_id)
            if (!Number.isNaN(round_id)) {
                // Fetch all rows in this round, not just one — access checks below
                // need to validate against every investor in the round, and the
                // actual delete needs the whole set.
                const round_rows = await fundingInvestmentM.find({ round_id: round_id })
                const get_query = round_rows[0]
                if (get_query) {
                    if (Number.parseInt(req.query.type) == 1) {
                        const check_access = await checkUserSubadminAccess({
                            admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                            admin_manager_type: checkAdminToken.message.admin_manager_type,
                            sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                            user_row_id: get_query.investor_row_id
                        })

                        if (check_access.status) {
                            await deleteUserFunding({ funding_row_id: round_id, type: 1 })
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

                            // Profile score recalculated once per investor in the round,
                            // same logic as before, just looped.
                            for (const row of round_rows) {
                                if (row?.investor_type == 1) {
                                    await calculateUserProfileScore(row?.investor_row_id, ['funding', 'investment'])
                                } else {
                                    await calculateCompanyProfileScore(row?.investor_row_id, ['funding', 'investment'])
                                }
                            }
                            await calculateCompanyProfileScore(get_query?.funds_raised_company_row_id, ['funding', 'investment'])

                            res.json({ status: true, message: { alert_message: 'Your investment funding  details have been successfully deleted from your profile.', get_query } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: check_access.message } })
                        }

                    }
                    else {
                        const company_row_id = Number.parseInt(req.query.type) == 2 ? get_query.investor_row_id : get_query.funds_raised_company_row_id
                        if (company_row_id) {
                            const check_access = await checkCompanySubadminAccess({
                                admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                                admin_manager_type: checkAdminToken.message.admin_manager_type,
                                sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                                company_row_id: company_row_id
                            })

                            if (check_access.status) {
                                // Deletes every investor row sharing this round_id, not just
                                // one row by _id — same edit-as-a-whole rule used everywhere
                                // else for syndicate rounds.
                                await fundingInvestmentM.deleteMany({ round_id: round_id })

                                for (const row of round_rows) {
                                    if (row?.investor_type == 1) {
                                        await calculateUserProfileScore(row?.investor_row_id, ['funding', 'investment'])
                                    } else {
                                        await calculateCompanyProfileScore(row?.investor_row_id, ['funding', 'investment'])
                                    }
                                }
                                await calculateCompanyProfileScore(get_query?.funds_raised_company_row_id, ['funding', 'investment'])
                                await deleteUserFunding({ funding_row_id: round_id, type: 1 })
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

                                res.json({ status: true, message: { alert_message: 'Your investment funding  details have been successfully deleted from your profile.s', get_query } })
                            }
                            else {
                                res.json({ status: false, message: { alert_message: check_access.message } })
                            }
                        }

                    }
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
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Delete funding details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err?.message })
    }
})
//user as investor starts here
router.post('/investor_update_details', [
    check('investor_row_id')
        .trim().not().isEmpty().withMessage('The User Row ID field is required.'),
    check('category_row_id')
        .trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
    check('announcement_date')
        .trim().not().isEmpty().withMessage('The Announcement Date field is required.'),

    check('funds_raised_registered_type')
        .trim().not().isEmpty().withMessage('The Investor row id field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Investor Registered Type field must be contains only integers.'),
    check('funds_raised_company_row_id')
        .trim().not().isEmpty().withMessage('The Investor Registered Type field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const funds_raised_registered_type = Number.parseInt(req.body.funds_raised_registered_type) //1:registered, 2:manual
            const funds_raised_company_row_id = Number.parseInt(req.body.funds_raised_company_row_id)
            const investor_type = !Number.isNaN(Number.parseInt(req.body.investor_type)) ? Number.parseInt(req.body.investor_type) : 1 //1:user, 2:company
            const investor_registered_type = 1 //1:registered, 2:manual
            const investor_row_id = Number.parseInt(req.body.investor_row_id) // investor_row_id   
            let funds_raised_user_row_id = 0
            if (investor_row_id) {
                if (investor_type == 1) {
                    const check_users_query = await professionalsM.findOne({ _id: investor_row_id, login_status: 1 }, { _id: 1 })
                    if (!check_users_query) {
                        errObj['investor_row_id'] = 'Sorry, Invalid User Row ID or Its Disabled'
                    }

                    const check_access = await checkUserSubadminAccess({
                        admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                        admin_manager_type: checkAdminToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                        user_row_id: investor_row_id
                    })

                    if (!check_access.status) {
                        errObj['alert_message'] = check_access.message
                    }
                }
                else {
                    const check_company_query = await companyM.findOne({ _id: investor_row_id, active_status: 1 }, { _id: 1 })
                    if (!check_company_query) {
                        errObj['investor_row_id'] = 'Sorry, Invalid Company Row ID or Its Disabled'
                    }

                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                        admin_manager_type: checkAdminToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                        company_row_id: investor_row_id
                    })

                    if (!check_access.status) {
                        errObj['alert_message'] = check_access.message
                    }
                }


            }


            let category_row_id = 0
            if (req.body.category_row_id) {
                category_row_id = Number.parseInt(req.body.category_row_id)
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

            if (funds_raised_company_row_id) {
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
            }


            let funding_row_id = ""
            if (req.body.funding_row_id) {
                funding_row_id = Number.parseInt(req.body.funding_row_id)
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
                insertArray['amount'] = req.body.amount ? req.body.amount : 0

                if (!funding_row_id) {
                    const date_n_time = getPresentDateTime()

                    insertArray['investor_type'] = investor_type
                    insertArray['investor_registered_type'] = investor_registered_type
                    insertArray['investor_row_id'] = investor_row_id
                    insertArray['funds_raised_registered_type'] = funds_raised_registered_type
                    insertArray['funds_raised_company_row_id'] = funds_raised_company_row_id
                    insertArray['verified_status'] = 1
                    insertArray['verified_on'] = date_n_time
                    insertArray['date_n_time'] = date_n_time

                    const new_round_id = await getCollectionID('funding_round_id')
                    insertArray['round_id'] = new_round_id

                    const save_query = await fundingInvestmentM(insertArray).save()
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


                    res.json({ status: true, message: { alert_message: 'Congratulations! Your investment details have been successfully added', save_query } })
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
                    res.json({ status: true, message: { alert_message: 'Great job! Your investment  details have been successfully updated.' } })
                }
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Investor update details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/investor_individual_details/:funding_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const funding_row_id = Number.parseInt(req.params.funding_row_id)
            const get_query = await fundingInvestmentM.aggregate([

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
                        company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                    }
                },
                {
                    $match: {
                        company_data: { $nin: ["", null] },
                        _id: funding_row_id,
                        investor_registered_type: 1
                    }
                },
                {
                    $project: {
                        _id: 1,
                        verified_status: 1,
                        verified_on: 1,
                        reject_type: 1,
                        reject_reason: 1,
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
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Investor individual details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/investor_list/:investor_type/:investor_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const investor_row_id = Number.parseInt(req.params.investor_row_id)
            const investor_type = !Number.isNaN(Number.parseInt(req.params.investor_type)) ? Number.parseInt(req.params.investor_type) : 1
            if (investor_row_id) {
                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
                const resultArray = {}

                // COMMON search query
                let search_query = [
                    { company_data: { $nin: ["", null] } },
                    { investor_type: investor_type },
                    { investor_registered_type: 1 },
                    { investor_row_id: investor_row_id }
                ]

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

                // DATA LIST
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

                // COUNT QUERY with SAME FILTERS
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

                res.json({ status: true, message: resultArray })
            } else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid input are supplied.' } })
            }
        } else {
            res.json(checkAdminToken)
        }
    } catch (err) {
        console.log('Investor list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', message1: err.message })
    }
})



router.get('/investor_overview/:investor_type/:investor_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const investor_row_id = Number.parseInt(req.params.investor_row_id)
            const investor_type = !Number.isNaN(Number.parseInt(req.params.investor_type)) ? Number.parseInt(req.params.investor_type) : 1

            if (investor_row_id) {
                let check_query = ""
                if (investor_type == 1) {
                    check_query = await professionalsM.findOne({ login_status: 1, _id: investor_row_id })
                }
                else if (investor_type == 2) {
                    check_query = await companyM.findOne({ active_status: 1, _id: investor_row_id })
                }

                if (check_query) {
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

                    res.json({ status: true, message: resultArray })

                }
                else {
                    res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid investor id.' } })
                }
            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid input are supplied.' } })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Investor overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.get('/manual_investor_list/:investor_type/:investor_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const investor_row_id = Number.parseInt(req.params.investor_row_id)
            const investor_type = !Number.isNaN(Number.parseInt(req.params.investor_type)) ? Number.parseInt(req.params.investor_type) : 1
            if (investor_row_id) {
                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
                const resultArray = {}

                resultArray['list'] = await fundingInvestmentM.aggregate([
                    {
                        $sort: { _id: -1 }
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
                            company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                        }
                    },
                    {
                        $match: {
                            company_data: { $nin: ["", null] },
                            investor_type: investor_type,
                            investor_registered_type: 2,
                            investor_row_id: investor_row_id
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            verified_status: 1,
                            verified_on: 1,
                            funds_raised_registered_type: 1,
                            funds_raised_company_row_id: 1,
                            reject_type: 1,
                            reject_reason: 1,
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
                            investor_category_name: "$investor_category_info.category_name",
                            category_name: "$category_info.category_name"
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await fundingInvestmentM.aggregate([
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
                                        _id: 1
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
                            investor_type: investor_type,
                            investor_registered_type: 2,
                            investor_row_id: investor_row_id
                        }
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

                res.json({ status: true, message: resultArray })
            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid input are supplied.' } })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Manual investor list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/funds_raised_update_details', [
    check('funds_raised_company_row_id')
        .trim().not().isEmpty().withMessage('The Funds Raised Company Row ID field is required.'),
    check('category_row_id')
        .trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
    check('announcement_date')
        .trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
    check('investors')
        .isArray({ min: 1 }).withMessage('The Investors field must contain at least one investor.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const funds_raised_company_row_id = Number.parseInt(req.body.funds_raised_company_row_id)
            const funds_raised_registered_type = 1

            // Admin access-control check — unchanged, runs once per request
            // regardless of investor count, since it's scoped to "can this admin
            // touch this company's data at all," not per-investor.
            const check_access = await checkCompanySubadminAccess({
                admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                admin_manager_type: checkAdminToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                company_row_id: funds_raised_company_row_id
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }

            if (funds_raised_company_row_id) {
                const check_company_query = await companyM.findOne({ _id: funds_raised_company_row_id, active_status: 1 }, { _id: 1 })
                if (!check_company_query) {
                    errObj['alert_message'] = 'Sorry, Invalid Funds Raised Company Row ID or Its Disabled'
                }
            }

            let category_row_id = 0
            if (req.body.category_row_id) {
                category_row_id = Number.parseInt(req.body.category_row_id)
                const check_funding_round_query = await funding_roundsM.findOne({ _id: category_row_id }, { _id: 1 })
                if (!check_funding_round_query) {
                    errObj['category_row_id'] = 'The category row id field is invalid.'
                }
            }

            // funding_row_id now represents round_id — the shared grouping key
            // across all investor rows in a funding round, not a single row's _id.
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

            // Per-investor validation. Same checks as the original single-investor
            // code, now run once per entry in the investors array. All-or-nothing:
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
                const sharedFields = {}
                sharedFields['category_row_id'] = category_row_id
                sharedFields['announcement_date'] = req.body.announcement_date
                sharedFields['amount'] = req.body.amount ? req.body.amount : 0

                if (!funding_row_id) {
                    // INSERT: one new round_id shared across every investor row in
                    // this round. Same counter helper used on the app side, so
                    // round_id stays unique across both admin and app inserts.
                    const present_date_n_time = getPresentDateTime()
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

                    // Side effects run once per investor, same logic as before,
                    // just looped.
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
                    await calculateCompanyProfileScore(funds_raised_company_row_id, ['funding', 'investment'])

                    res.json({ status: true, message: { alert_message: 'Congratulations! Your funding details have been successfully added' } })
                }
                else {
                    // UPDATE: round-level fields update across every row sharing
                    // this round_id. Investor list is fully replaced — old investor
                    // rows for this round_id are deleted and the new array is
                    // inserted fresh, per the edit-as-a-whole rule. verified_status /
                    // verified_on / reject_type / reject_reason are read from the
                    // existing round BEFORE deleting, then carried onto the freshly
                    // inserted rows, so they are not reset on edit.
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

                    // _id is assigned correctly via getCollectionID.
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

                    res.json({ status: true, message: { alert_message: 'Great job! Your funding  details have been successfully updated.' } })
                }
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Update funds raised details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})
router.get('/funds_raised_list/:funds_raised_company_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const funds_raised_company_row_id = Number.parseInt(req.params.funds_raised_company_row_id)
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const resultArray = {}

            const check_query = await companyM.findOne({ active_status: 1, _id: funds_raised_company_row_id })
            if (check_query) {
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
                    const start_date = createDateTime(req.query.start_date);
                    date_filter.$gte = new Date(start_date);
                }

                if (req.query.end_date) {
                    const end_date = createEndDateOnly(req.query.end_date);
                    date_filter.$lte = new Date(end_date);
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

                // Filter to this company's rows FIRST, before the expensive $lookup chain
                // runs — same early-filter performance fix applied to the app version.
                const earlyMatchStage = {
                    $match: {
                        funds_raised_registered_type: 1,
                        funds_raised_company_row_id: funds_raised_company_row_id
                    }
                }

                // Shared lookup/resolution stages reused by both the list and count
                // pipelines. Identical to the app version's resolveInvestorStages.
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
                                    $lookup:
                                    {
                                        from: "cln_professionals_work_experiences",
                                        localField: "_id",
                                        foreignField: "user_row_id",
                                        pipeline: [
                                            { $match: { public_view: true, user_account_type: 1 } },
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
                                        user_name: 1,
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        pro_batch: 1,
                                        email_id: 1,
                                        approval_status: 1,
                                        login_status: 1,
                                        position_name: "$info_work.position_name",
                                        company_name: "$info_work.company_name"
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
                        $set: {
                            investor_name: { $cond: { if: "$investor_data.full_name", then: "$investor_data.full_name", else: "$investor_data.company_name" } },
                            category_name: "$category_info.category_name"
                        }
                    }
                ]

                // Per-row stage that tags whether THIS row matches the search/filter
                // criteria, without dropping sibling investors from a matching round —
                // identical approach to the app version. Translates search_query's plain
                // Mongo filters into their $expr equivalents so they survive into the
                // $group stage.
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

                // Group rows into rounds by round_id, same as the app version. Pulls in
                // every investor belonging to the round, and round_matches is true if ANY
                // investor row in the round satisfied the filters. is_syndicate/
                // round_investor_count let the admin panel show the same info icon used
                // in the app.
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

                resultArray['list'] = []
                resultArray['count'] = 0

                // Run the expensive lookup + grouping pipeline ONCE, then branch into
                // list (paged) and count via $facet, instead of running the full
                // pipeline twice (once for results, once just for the count) as the
                // original code did. Both facets share the same resolved/grouped input.
                const facet_query = await fundingInvestmentM.aggregate([
                    earlyMatchStage,
                    ...resolveInvestorStages,
                    rowMatchStage,
                    groupByRoundStage,
                    { $match: { round_matches: true } },
                    {
                        $facet: {
                            list: [
                                { $sort: { amount: -1 } },
                                { $skip: skip },
                                { $limit: limit },
                                {
                                    $set: {
                                        round_investor_count: { $size: "$investors" },
                                        is_syndicate: { $gt: [{ $size: "$investors" }, 1] }
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
                                        investors: 1,
                                        round_investor_count: 1,
                                        is_syndicate: 1
                                    }
                                }
                            ],
                            count: [
                                { $count: "count" }
                            ]
                        }
                    }
                ])

                if (facet_query[0]) {
                    resultArray['list'] = facet_query[0].list || []
                    resultArray['count'] = facet_query[0].count?.[0]?.count || 0
                }

                res.json({ status: true, message: resultArray })
            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid company row id.' } })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Funds raised list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/manual_funds_raised_list/:funds_raised_company_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const funds_raised_company_row_id = Number.parseInt(req.params.funds_raised_company_row_id)
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const resultArray = {}

            const check_query = await company_manual_retrievalsM.findOne({ _id: funds_raised_company_row_id })

            if (check_query) {
                resultArray['list'] = await fundingInvestmentM.aggregate([
                    {
                        $sort: { _id: -1 }
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
                                            { $match: { public_view: true, user_account_type: 1 } },
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
                                        user_name: 1,
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        email_id: 1,
                                        approval_status: 1,
                                        login_status: 1,
                                        position_name: "$info_work.position_name",
                                        company_name: "$info_work.company_name"
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
                        $match: {
                            investor_data: { $nin: ["", null] },
                            funds_raised_registered_type: 2,
                            funds_raised_company_row_id: funds_raised_company_row_id
                        }
                    },

                    {
                        $project: {
                            _id: 1,
                            verified_status: 1,
                            verified_on: 1,
                            investor_type: 1,
                            investor_registered_type: 1,
                            investor_data: 1,
                            announcement_date: 1,
                            category_row_id: 1,
                            reject_type: 1,
                            reject_reason: 1,
                            investor_position_name: { $cond: { if: "$investor_data.position_name", then: "$investor_data.position_name", else: "" } },
                            investor_company_name: { $cond: { if: "$investor_data.company_name", then: "$investor_data.company_name", else: "" } },
                            investor_image: { $cond: { if: "$investor_data.profile_image", then: "$investor_data.profile_image", else: "$investor_data.company_logo" } },
                            investor_name: { $cond: { if: "$investor_data.full_name", then: "$investor_data.full_name", else: "$investor_data.company_name" } },
                            investor_email_id: { $cond: { if: "$investor_data.email_id", then: "$investor_data.email_id", else: "$investor_data.company_email_id" } },
                            amount: 1,
                            investor_category_name: "$investor_category_info.category_name",
                            category_name: "$category_info.category_name"
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await fundingInvestmentM.aggregate([
                    {
                        $sort: { _id: -1 }
                    },
                    { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
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
                                    $project: {
                                        _id: 1
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
                                        _id: 1
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
                                        _id: 1
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
                        $match: {
                            investor_data: { $nin: ["", null] },
                            funds_raised_registered_type: 2,
                            funds_raised_company_row_id: funds_raised_company_row_id
                        }
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

                res.json({ status: true, message: resultArray })

            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid investor id.' } })
            }

        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Manual funds raised list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/funds_raised_overview/:company_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            const result = {}
            result['total_funds_raised'] = 0
            result['total_funds_invested'] = 0

            const check_query = await companyM.findOne({ active_status: 1, _id: company_row_id })

            if (check_query) {
                const funds_raised_query = await fundingInvestmentM.aggregate([
                    {
                        $match: { funds_raised_registered_type: 1, funds_raised_company_row_id: company_row_id }
                    },
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
                                    $project: {
                                        _id: 1,
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
                                        _id: 1
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
                        $match: {
                            $or: [
                                { "user_info._id": { $ne: null } },
                                { "user_manual_info._id": { $ne: null } },
                                { "company_info._id": { $ne: null } },
                                { "company_manual_info._id": { $ne: null } }
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


                if (funds_raised_query[0]) {
                    if (funds_raised_query[0].total) {
                        result['total_funds_raised'] = funds_raised_query[0].total
                    }
                }

                res.json({ status: true, message: result })

            }
            else {
                res.json({ status: false, message: { 'alert_message': 'Sorry, Invalid company row id.' } })
            }

        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Funds raised overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/verify_funds_raised_details/:funding_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            // NOTE: funding_row_id (route param, kept as-is for compatibility with
            // the existing admin frontend call signature) now represents round_id —
            // verifying a round verifies every investor row sharing it, per the
            // edit/verify/reject/delete-as-a-whole rule. Same change already applied
            // on the app side.
            const round_id = Number.parseInt(req.params.funding_row_id)
            if (!Number.isNaN(round_id)) {
                const round_rows = await fundingInvestmentM.find({
                    round_id: round_id,
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

                    // Notification resolution runs once per investor row, same logic
                    // as before, just looped — each investor may resolve to a
                    // different investor_user_row_id.
                    for (const row of round_rows) {
                        const investor_type = row.investor_type
                        const investor_registered_type = row.investor_registered_type
                        const investor_row_id = row.investor_row_id
                        const funds_raised_company_row_id = row.funds_raised_company_row_id

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
                                    notify_type_row_id: funds_raised_company_row_id,
                                    message_row_id: 22,
                                    action_row_id: row._id
                                })
                            }
                        }
                    }

                    res.json({ status: true, message: { alert_message: 'This funds raised details has been verified successfully.' } })
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
            res.json(checkAdminToken)
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
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                // NOTE: funding_row_id (request field, kept as-is for compatibility
                // with the existing admin frontend call signature) now represents
                // round_id — rejecting a round rejects every investor row sharing
                // it, per the edit/verify/reject/delete-as-a-whole rule. Same
                // change already applied on the app side.
                const round_id = Number.parseInt(req.body.funding_row_id)
                if (!Number.isNaN(round_id)) {
                    const round_rows = await fundingInvestmentM.find({
                        round_id: round_id,
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
                            const funds_raised_company_row_id = row.funds_raised_company_row_id

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
                                        notify_type_row_id: funds_raised_company_row_id,
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
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
                }
            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Reject funds raised details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/funds_raised_individual_details/:funding_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            // NOTE: funding_row_id (route param, kept as-is for compatibility with the
            // existing admin frontend call signature) now represents round_id — the
            // shared grouping key across all investor rows in a funding round, not a
            // single row's _id. Same change already applied on the app side.
            const round_id = Number.parseInt(req.params.funding_row_id)

            const get_query = await fundingInvestmentM.aggregate([
                // Filter to this round FIRST, before the expensive $lookup chain runs.
                // Previously this $match ran last and matched a single unique _id, so
                // running lookups on the whole collection first was harmless. Now that
                // round_id can match multiple rows, filtering early avoids resolving
                // investor data for documents outside this round.
                {
                    $match: { round_id: round_id, funds_raised_registered_type: 1 }
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
                                        { $match: { public_view: true, user_account_type: 1 } },
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
                                    user_name: 1,
                                    profile_image: "$img_info.profile_image",
                                    full_name: 1,
                                    pro_batch: 1,
                                    email_id: 1,
                                    approval_status: 1,
                                    login_status: 1,
                                    position_name: "$info_work.position_name",
                                    company_name: "$info_work.company_name"
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
                        investor_position_name: { $cond: { if: "$investor_data.position_name", then: "$investor_data.position_name", else: "" } },
                        investor_company_name: { $cond: { if: "$investor_data.company_name", then: "$investor_data.company_name", else: "" } },
                        investor_image: { $cond: { if: "$investor_data.profile_image", then: "$investor_data.profile_image", else: "$investor_data.company_logo" } },
                        investor_name: { $cond: { if: "$investor_data.full_name", then: "$investor_data.full_name", else: "$investor_data.company_name" } },
                        investor_email_id: { $cond: { if: "$investor_data.email_id", then: "$investor_data.email_id", else: "$investor_data.company_email_id" } },
                        amount: 1,
                        investor_category_row_id: 1,
                        investor_category_name: "$investor_category_info.category_name",
                        category_name: "$category_info.category_name"
                    }
                },
                // Group all investors in this round into a single document. Round-level
                // fields (announcement_date, amount, category_row_id, category_name) are
                // identical across every row in the round (edit-as-a-whole), so $first is
                // safe here. Per-investor fields go into the investors array — same shape
                // used by the app's equivalent route.
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
                res.json({ status: true, message: get_query })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid funding row id." } })
            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Funds raised individual details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/funds_raised_overview', async (req, res) => {
    try {
        const today_date = getPresentDateOnly()
        const { start_date, end_date } = yesterDayStartNEndDate(1)
        const week_date = getMinusDates(7)
        const one_month_date = getMinusDates(30)

        const today_funding_query = fundingInvestmentM.countDocuments({ date_n_time: { $gte: new Date(today_date) } })
        const yesterday_funding_query = fundingInvestmentM.countDocuments({ date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
        const week_total_funding_query = fundingInvestmentM.countDocuments({ date_n_time: { $gte: new Date(week_date) } })
        const month_total_funding_query = fundingInvestmentM.countDocuments({ date_n_time: { $gte: new Date(one_month_date) } })

        const [today_funding, yesterday_funding, week_total_funding, month_total_funding] = await Promise.all([today_funding_query, yesterday_funding_query, week_total_funding_query, month_total_funding_query])

        let result = {}
        result['today_funding'] = today_funding
        result['yesterday_funding'] = yesterday_funding
        result['week_total_funding'] = week_total_funding
        result['month_total_funding'] = month_total_funding

        res.json({ status: false, message: result })
    }
    catch (err) {
        console.log('Funds raised individual details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.get('/all_funds_raised_list/:skip/:limit', async (req, res) => {

    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7])
        if (checkAdminToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const resultArray = {}

            const search_filter = [{}]
            if (req.query.investor_type) {
                if ([1, 2].includes(Number.parseInt(req.query.investor_type))) {
                    search_filter.push({ investor_type: Number.parseInt(req.query.investor_type) })
                }
            }

            if (req.query.search) {
                search_filter.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            const get_query = fundingInvestmentM.aggregate([
                {
                    $sort: { date_n_time: -1 }
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
                        as: "funds_comp_info",
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
                                    website_link: 1,
                                    active_status: 1,
                                    approval_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$funds_comp_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_manual_retrievals",
                        let: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        as: "funds_manual_comp_info",
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
                { $unwind: { path: "$funds_manual_comp_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        company_id: { $cond: { if: "$funds_comp_info.company_id", then: "$funds_comp_info.company_id", else: "" } },
                        company_name: { $cond: { if: "$funds_comp_info.company_name", then: "$funds_comp_info.company_name", else: "$funds_manual_comp_info.company_name" } }
                    }
                },
                {
                    $match: {
                        $and: search_filter
                    }
                },
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
                                    approval_status: 1,
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
                        },
                        funds_raised_data: { $cond: { if: "$funds_comp_info", then: "$funds_comp_info", else: "$funds_manual_comp_info" } }
                    }
                },
                {
                    $match: {
                        investor_data: { $nin: ["", null] },
                        funds_raised_data: { $nin: ["", null] }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        funds_raised_data: 1,
                        verified_status: 1,
                        verified_on: 1,
                        investor_type: 1,
                        investor_registered_type: 1,
                        investor_data: 1,
                        announcement_date: 1,
                        category_row_id: 1,
                        amount: 1,
                        reject_type: 1,
                        reject_reason: 1,
                        date_n_time: 1,
                        investor_category_row_id: 1,
                        investor_category_name: "$investor_category_info.category_name",
                        category_name: "$category_info.category_name"
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = fundingInvestmentM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        let: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        as: "funds_comp_info",
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
                                    company_name: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$funds_comp_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_manual_retrievals",
                        let: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        as: "funds_manual_comp_info",
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
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$funds_manual_comp_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        company_id: { $cond: { if: "$funds_comp_info.company_id", then: "$funds_comp_info.company_id", else: "" } },
                        company_name: { $cond: { if: "$funds_comp_info.company_name", then: "$funds_comp_info.company_name", else: "$funds_manual_comp_info.company_name" } }
                    }
                },
                {
                    $match: {
                        $and: search_filter
                    }
                },
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
                                $project: {
                                    _id: 1
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
                                    _id: 1
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
                                    _id: 1
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
                        },
                        funds_raised_data: { $cond: { if: "$funds_comp_info", then: "$funds_comp_info", else: "$funds_manual_comp_info" } }
                    }
                },
                {
                    $match: {
                        investor_data: { $nin: ["", null] },
                        funds_raised_data: { $nin: ["", null] }
                    }
                },
                {
                    $count: "count"
                }
            ])

            const [result1, result2] = await Promise.all([get_query, count_query])



            resultArray['list'] = result1
            resultArray['count'] = 0
            if (result2[0]) {
                if (result2[0].count) {
                    resultArray['count'] = result2[0].count
                }
            }

            res.json({ status: true, message: resultArray })
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('All funds raised list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


module.exports = router