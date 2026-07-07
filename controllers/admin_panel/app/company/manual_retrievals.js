const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')

const company_manual_retrievalsM = require('../../../../models/app/company/company_manual_retrievalsM')
const professionals_work_experienceM = require('../../../../models/app/professionals_work_experienceM')
const event_sponsors_partner_detailsM = require('../../../../models/app/events/event_sponsors_partner_detailsM')
const fundingInvestmentM = require('../../../../models/app/funding/fundingInvestmentM')
const { deleteUserFunding, deleteProfessionalDetails } = require('../../../../utils/helpers/app_helper')
const { deleteSponsorsPartners } = require('../../../../utils/helpers/events_helper')
const { deleteKeysByPattern } = require('../../../../config/cache_helper')



router.get('/pending_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = [{ approval_status: 0 }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                        { website_link: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            if (req.query.created_from_type) {
                if ([1, 2, 3].includes(Number.parseInt(req.query.created_from_type))) {
                    query.push({ created_from_type: Number.parseInt(req.query.created_from_type) })
                }
            }

            const match_query = { $and: query }

            const get_query = await company_manual_retrievalsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: match_query },
                {
                    $project: {
                        _id: 1,
                        company_name: 1,
                        company_email_id: 1,
                        company_logo: 1,
                        website_link: 1,
                        used_counts: 1,
                        used_types: 1,
                        created_on: 1,
                        created_from_type: 1,
                        updated_on: 1
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await company_manual_retrievalsM.countDocuments(match_query)

            res.json({ status: true, message: get_query, count: count_query })
        }
        catch (err) {
            console.log('Company manual retievals pending list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/rejected_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = [{ approval_status: 2 }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                        { website_link: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            if (req.query.reject_type) {
                if (!Number.isNaN(Number.parseInt(req.query.reject_type))) {
                    query.push({ reject_type: Number.parseInt(req.query.reject_type) })
                }
            }

            if (req.query.created_from_type) {
                if ([1, 2, 3].includes(Number.parseInt(req.query.created_from_type))) {
                    query.push({ created_from_type: Number.parseInt(req.query.created_from_type) })
                }
            }

            const match_query = { $and: query }

            const get_query = await company_manual_retrievalsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: match_query },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "sub_admin_row_id",
                        foreignField: "_id",
                        as: "info_subadmin",
                        pipeline: [
                            {
                                $project:
                                {
                                    full_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_subadmin", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        company_name: 1,
                        company_email_id: 1,
                        company_logo: 1,
                        website_link: 1,
                        used_counts: 1,
                        used_types: 1,
                        created_on: 1,
                        updated_on: 1,
                        created_from_type: 1,
                        approval_status: 1,
                        approval_date: 1,
                        approval_sub_admin_row_id: 1,
                        reject_type: 1,
                        reject_reason: 1,
                        subadmin_name: "$info_subadmin.full_name",
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await company_manual_retrievalsM.countDocuments(match_query)
            await deleteKeysByPattern('app_company_list_*')
            res.json({ status: true, message: get_query, count: count_query })
        }
        catch (err) {
            console.log('Company manual retrievals rejected list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/approved_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = [{ approval_status: 1 }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                        { website_link: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            if (req.query.created_from_type) {
                if ([1, 2, 3].includes(Number.parseInt(req.query.created_from_type))) {
                    query.push({ created_from_type: Number.parseInt(req.query.created_from_type) })
                }
            }

            const match_query = { $and: query }

            const get_query = await company_manual_retrievalsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: match_query },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "sub_admin_row_id",
                        foreignField: "_id",
                        as: "info_subadmin",
                        pipeline: [
                            {
                                $project:
                                {
                                    full_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_subadmin", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "main_company_row_id",
                        foreignField: "_id",
                        as: "info_main_company",
                        pipeline: [
                            {
                                $project:
                                {
                                    company_name: 1,
                                    company_id: 1,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_main_company", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        company_name: 1,
                        company_email_id: 1,
                        company_logo: 1,
                        website_link: 1,
                        used_counts: 1,
                        used_types: 1,
                        created_on: 1,
                        updated_on: 1,
                        approval_status: 1,
                        approval_date: 1,
                        approval_sub_admin_row_id: 1,
                        reject_type: 1,
                        reject_reason: 1,
                        created_from_type: 1,
                        main_company_row_id: 1,
                        subadmin_name: "$info_subadmin.full_name",
                        main_company_name: "$info_main_company.company_name",
                        main_company_id: "$info_main_company.company_id",
                        main_company_active_status: "$info_main_company.active_status"
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await company_manual_retrievalsM.countDocuments(match_query)

            res.json({ status: true, message: get_query, count: count_query, match_query })
        }
        catch (err) {
            console.log('Company manual retrievals approved list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/individual_detail/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            const get_query = await company_manual_retrievalsM.aggregate([
                { $match: { _id: company_row_id } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "sub_admin_row_id",
                        foreignField: "_id",
                        as: "info_subadmin",
                        pipeline: [
                            {
                                $project:
                                {
                                    full_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_subadmin", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_funding_investment_lists",
                        localField: "_id",
                        foreignField: "funds_raised_company_row_id",
                        as: "fund_raised_count",
                        pipeline: [
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
                                }
                            },
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_funding_investment_lists",
                        localField: "_id",
                        foreignField: "investor_row_id",
                        as: "fund_invested_count",
                        pipeline: [
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
                                    investor_type: 2,
                                    investor_registered_type: 2,
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "team_members_count",
                        pipeline: [
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
                                $match: {
                                    user_data: { $exists: true, $ne: "" },
                                    company_type: 2,
                                    company_row_id: company_row_id,
                                    till_date_status: 2
                                }
                            },
                        ]
                    }
                },
                {
                    $set:
                    {
                        fund_raised_count: { $size: "$fund_raised_count" },
                        fund_invested_count: { $size: "$fund_invested_count" },
                        team_members_count: { $size: "$team_members_count" },
                    }
                },
                {
                    $project: {
                        _id: 1,
                        company_name: 1,
                        company_email_id: 1,
                        company_logo: 1,
                        website_link: 1,
                        used_counts: 1,
                        used_types: 1,
                        created_on: 1,
                        updated_on: 1,
                        approval_status: 1,
                        approval_date: 1,
                        approval_sub_admin_row_id: 1,
                        reject_type: 1,
                        reject_reason: 1,
                        subadmin_name: "$info_subadmin.full_name",
                        fund_raised_count: 1,
                        fund_invested_count: 1,
                        team_members_count: 1,
                    }
                }
            ]).limit(1)

            let result = {}
            result['_id'] = get_query[0]._id
            result['company_name'] = get_query[0].company_name
            result['company_email_id'] = get_query[0].company_email_id
            result['company_logo'] = get_query[0].company_logo
            result['website_link'] = get_query[0].website_link
            result['used_counts'] = get_query[0].used_counts
            result['used_types'] = get_query[0].used_types
            result['created_on'] = get_query[0].created_on
            result['updated_on'] = get_query[0].updated_on
            result['approval_status'] = get_query[0].approval_status
            result['approval_date'] = get_query[0].approval_date
            result['approval_sub_admin_row_id'] = get_query[0].approval_sub_admin_row_id
            result['reject_type'] = get_query[0].reject_type
            result['reject_reason'] = get_query[0].reject_reason
            result['subadmin_name'] = get_query[0].subadmin_name
            result['fund_raised_count'] = get_query[0].fund_raised_count
            result['fund_invested_count'] = get_query[0].fund_invested_count
            result['team_members_count'] = get_query[0].team_members_count


            res.json({ status: true, message: result })
        }
        catch (err) {
            console.log('Individual manual company', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.post('/reject_manual_company/:company_row_id', [
    check('reject_reason')
        .trim().not().isEmpty().withMessage('The Company reject reason field required.')
        .isLength({ min: 4 }).withMessage('The Company reject reason field at least contain 5 characters in length.')
], async (req, res) => {
    try {

        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkAdminToken = checkAdminLoginToken(req.headers, [7])
        if (checkAdminToken.status) {
            let admin_row_id = 0
            const check_token_message = checkAdminToken.message
            if (check_token_message.admin_manager_type === 2) {
                admin_row_id = check_token_message.admin_row_id
            }

            if (Number.parseInt(checkAdminToken.message.sub_admin_type) == 2) {
                errObj['alert_message'] = "You do not have permission to perform this action"
            }

            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (Number.isNaN(company_row_id)) {
                errObj['company_row_id'] = "The not fetched token row id field is Invalid."
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                const present_date_n_time = getPresentDateTime()
                const check_query = await company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: 0 })
                if (check_query) {
                    await company_manual_retrievalsM.updateOne({ _id: company_row_id },
                        {
                            $set: {
                                approval_status: 2,
                                approval_date: present_date_n_time,
                                reject_type: req.body.reject_type,
                                approval_sub_admin_row_id: admin_row_id,
                                reject_reason: req.body.reject_reason
                            }
                        })

                    res.json({ status: true, message: { alert_message: "This manual company details has been rejected successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Manual Company Row ID." } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Reject Manual company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/revoke_manual_company/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                if (Number.parseInt(checkToken.message.sub_admin_type) == 2) {
                    res.json({ status: false, message: { alert_message: "You do not have permission to perform this action" } })
                }
                else {
                    const check_query = await company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: 2 })
                    if (check_query) {
                        await company_manual_retrievalsM.updateOne({ _id: company_row_id, approval_status: 2 },
                            { $set: { approval_status: 0 } })
                        await deleteKeysByPattern('app_company_list_*')
                        res.json({ status: true, message: { alert_message: "This Manual Company details has been revoked sucessfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Invalid Manual Company Row ID" } })
                    }
                }

            }
            else {
                res.json({ status: false, message: { alert_message: "Invalid Manual Company Row ID" } })
            }

        }
        catch (err) {
            console.log('Revoke manual company.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }
})


router.get('/manual_company_employee_list/:company_row_id/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        let company_row_id = Number.parseInt(req.params.company_row_id)
        try {

            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.company_row_id))) {
                errObj['company_row_id'] = 'The company row id field must be contain valid number.'
            }
            else {
                company_row_id = Number.parseInt(req.params.company_row_id)
            }

            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const limit = Number.parseInt(req.params.limit)
                const skip = Number.parseInt(req.params.skip)
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
                                        profile_image: "$img_info.profile_image"
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
                        $match: {
                            user_data: { $exists: true, $ne: "" },
                            company_type: 2,
                            company_row_id: company_row_id,
                            till_date_status: 2
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            user_account_type: 1,
                            user_row_id: 1,
                            position_row_id: 1,
                            position_name: "$info_position.position_name",
                            user_name: "$user_data.user_name",
                            full_name: "$user_data.full_name",
                            email_id: "$user_data.email_id",
                            profile_image: "$user_data.profile_image",
                            user_approval_status: "$user_data.approval_status",
                            verified_status: 1,
                            verified_on: 1,
                            employment_type: 1,
                            location_type: 1,
                            start_date: 1,
                            responsibilities: 1
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await professionals_work_experienceM.aggregate([
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
                                        profile_image: "$img_info.profile_image"
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
                        $match: {
                            user_data: { $ne: "" },
                            company_type: 2,
                            company_row_id: company_row_id,
                            till_date_status: 2
                        }
                    },
                    {
                        $count: "count"
                    }
                ])

                let counts = 0
                if (count_query[0]) {
                    counts = count_query[0].count
                }

                res.json({ status: true, message: get_query, counts: counts })
            }
        }
        catch (err) {
            console.log('Manual company employee list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/delete_manual_company/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                if (Number.parseInt(checkToken.message.sub_admin_type) == 2) {
                    res.json({ status: false, message: { alert_message: "You do not have permission to perform this action" } })
                }
                else {
                    const check_query = await company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: { $in: [0, 2] } })
                    if (check_query) {
                        //funds
                        const funds_invested_query = await fundingInvestmentM.findOne({ investor_type: 2, investor_registered_type: 2, investor_row_id: company_row_id })
                        if (funds_invested_query) {
                            await deleteUserFunding({ type: 2, investor_type: 2, registered_type: 2, funding_row_id: company_row_id, investment_type: 1 })

                        }
                        const funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 2, funds_raised_registered_type: 2, funds_raised_company_row_id: company_row_id })
                        if (funds_raised_query) {
                            await deleteUserFunding({ type: 2, investor_type: 2, registered_type: 2, funding_row_id: company_row_id, investment_type: 2 })

                        }
                        const user_funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 1, funds_raised_registered_type: 2, funds_raised_company_row_id: company_row_id })
                        if (user_funds_raised_query) {
                            await deleteUserFunding({ type: 2, investor_type: 1, registered_type: 2, funding_row_id: company_row_id, investment_type: 2 })

                        }

                        // sponsors and partners
                        const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 2, registered_type: 2, user_company_row_id: company_row_id })
                        if (sp_query) {
                            await deleteSponsorsPartners({ type: 2, account_type: 2, registered_type: 2, user_company_row_id: company_row_id })
                        }

                        // work_experience - STARTS HERE

                        const work_experience_query = await professionals_work_experienceM.findOne({ company_type: 2, company_row_id: company_row_id })
                        if (work_experience_query) {
                            await deleteProfessionalDetails({ type: 2, user_company_row_id: company_row_id, user_type: 2, reqistered_type: 2 })

                        }

                        await company_manual_retrievalsM.deleteOne({ _id: company_row_id })
                        await deleteKeysByPattern('app_company_list_*')
                        res.json({ status: true, message: { alert_message: "This company details has been deleted completely." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Invalid Manual Company Row ID" } })
                    }

                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Invalid Manual Company Row ID" } })
            }
        }
        catch (err) {
            console.log('Manual company delete.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

module.exports = router