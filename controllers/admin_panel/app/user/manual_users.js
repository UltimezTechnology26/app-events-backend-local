const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')

const professionals_manual_retrievalsM = require('../../../../models/app/users/professionals_manual_retrievalsM')
const eventM = require('../../../../models/app/events/eventM')
const event_attendeesM = require('../../../../models/app/events/event_attendeesM')
const event_speakersM = require('../../../../models/app/events/event_speakersM')
const fundingInvestmentM = require('../../../../models/app/funding/fundingInvestmentM')
const professionals_work_experienceM = require('../../../../models/app/professionals_work_experienceM')
const event_sponsors_partner_detailsM = require('../../../../models/app/events/event_sponsors_partner_detailsM')
const { deleteProfessionalDetails, deleteUserFunding } = require('../../../../utils/helpers/app_helper')
const { deleteSponsorsPartners } = require('../../../../utils/helpers/events_helper')


router.get('/pending_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            let errObj = {}

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
                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

                let query = [{ approval_status: 0 }]
                if (req.query.search) {
                    query.push({
                        $or: [
                            { full_name: { '$regex': req.query.search, $options: 'i' } },
                            { email_id: { '$regex': req.query.search, $options: 'i' } }]
                    })
                }

                const match_query = { $and: query }

                const get_query = await professionals_manual_retrievalsM.aggregate([
                    { $sort: { _id: -1 } },
                    { $match: match_query },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: [
                                { $match: { public_view: true, user_account_type: 2 } },
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
                                                    company_name: 1,
                                                    company_email_id: 1
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
                                                    company_name: 1,
                                                    company_email_id: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        position_name: '$info_position.position_name',
                                        company_email_id: { $cond: { if: "$info_company.company_email_id", then: "$info_company.company_email_id", else: "$info_manual_company.company_email_id" } },
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
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
                            mobile_number: 1,
                            profile_image: 1,
                            work_position: 1,
                            user_link: 1,
                            created_on: 1,
                            updated_on: 1,
                            used_counts: 1,
                            used_types: 1,
                            position_name: "$info_work.position_name",
                            company_email_id: "$info_work.company_email_id",
                            company_name: "$info_work.company_name"
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await professionals_manual_retrievalsM.countDocuments(match_query)

                res.json({ status: true, message: get_query, count: count_query })

            }
        }
        catch (err) {
            console.log('Manual users pending list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})




router.get('/rejected_ist/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            let errObj = {}

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
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)

                let query = [{ approval_status: 2 }]
                if (req.query.search) {
                    query.push({
                        $or: [
                            { full_name: { '$regex': req.query.search, $options: 'i' } },
                            { email_id: { '$regex': req.query.search, $options: 'i' } }
                        ]
                    })
                }

                if (req.query.reject_type) {
                    query.push({ reject_type: Number.parseInt(req.query.reject_type) })
                }

                const match_query = { $and: query }

                const get_query = await professionals_manual_retrievalsM.aggregate([
                    { $sort: { _id: -1 } },
                    { $match: match_query },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: [
                                { $match: { public_view: true, user_account_type: 2 } },
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
                                                    company_name: 1,
                                                    company_email_id: 1
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
                                                    company_name: 1,
                                                    company_email_id: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        position_name: '$info_position.position_name',
                                        company_email_id: { $cond: { if: "$info_company.company_email_id", then: "$info_company.company_email_id", else: "$info_manual_company.company_email_id" } },
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            localField: "approval_sub_admin_row_id",
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
                            gender: 1,
                            full_name: 1,
                            email_id: 1,
                            mobile_number: 1,
                            profile_image: 1,
                            work_position: 1,
                            user_link: 1,
                            created_on: 1,
                            updated_on: 1,
                            used_counts: 1,
                            used_types: 1,
                            approval_date: 1,
                            approval_sub_admin_row_id: 1,
                            reject_type: 1,
                            rejected_reason: 1,
                            position_name: "$info_work.position_name",
                            company_email_id: "$info_work.company_email_id",
                            company_name: "$info_work.company_name",
                            subadmin_name: "$info_subadmin.full_name"
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await professionals_manual_retrievalsM.countDocuments(match_query)

                res.json({ status: true, message: get_query, count: count_query })
            }

        }
        catch (err) {
            console.log('Manual user rejected list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/approved_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            let errObj = {}

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
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)

                let query = [{ approval_status: { $in: [1, 3] } }]
                if (req.query.search) {
                    query.push({
                        $or: [
                            { full_name: { '$regex': req.query.search, $options: 'i' } },
                            { email_id: { '$regex': req.query.search, $options: 'i' } }
                        ]
                    })
                }

                const match_query = { $and: query }

                const get_query = await professionals_manual_retrievalsM.aggregate([
                    { $sort: { _id: -1 } },
                    { $match: match_query },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "main_user_row_id",
                            foreignField: "user_row_id",
                            pipeline: [
                                { $match: { public_view: true, user_account_type: 1 } },
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
                                                    company_name: 1,
                                                    company_email_id: 1
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
                                                    company_name: 1,
                                                    company_email_id: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        position_name: '$info_position.position_name',
                                        company_email_id: { $cond: { if: "$info_company.company_email_id", then: "$info_company.company_email_id", else: "$info_manual_company.company_email_id" } },
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            localField: "approval_sub_admin_row_id",
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
                            gender: 1,
                            full_name: 1,
                            email_id: 1,
                            mobile_number: 1,
                            profile_image: 1,
                            work_position: 1,
                            user_link: 1,
                            created_on: 1,
                            updated_on: 1,
                            used_counts: 1,
                            used_types: 1,
                            approval_date: 1,
                            approval_sub_admin_row_id: 1,
                            reject_type: 1,
                            rejected_reason: 1,
                            position_name: "$info_work.position_name",
                            company_email_id: "$info_work.company_email_id",
                            company_name: "$info_work.company_name",
                            subadmin_name: "$info_subadmin.full_name"
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await professionals_manual_retrievalsM.countDocuments(match_query)

                res.json({ status: true, message: get_query, count: count_query })
            }

        }
        catch (err) {
            console.log('Manual user approved list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/individual_detail/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.user_row_id))) {
                errObj['user_row_id'] = 'The User row id field must be contain valid number.'
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = Number.parseInt(req.params.user_row_id)
                const get_query = await professionals_manual_retrievalsM.aggregate([
                    { $match: { _id: user_row_id } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: [
                                { $match: { public_view: true, user_account_type: 2 } },
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
                                                    company_name: 1,
                                                    company_email_id: 1
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
                                                    company_name: 1,
                                                    company_email_id: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        position_name: '$info_position.position_name',
                                        company_email_id: { $cond: { if: "$info_company.company_email_id", then: "$info_company.company_email_id", else: "$info_manual_company.company_email_id" } },
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            localField: "approval_sub_admin_row_id",
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
                                                { $eq: ['$_id', '$$company_row_id'] },
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project:
                                    {
                                        company_name: 1,
                                        company_id: 1,
                                        company_email_id: 1,
                                        company_logo: 1,
                                        active_status: 1
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
                                                { $eq: ['$_id', '$$company_row_id'] },
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project:
                                    {
                                        company_name: 1,
                                        company_email_id: 1,
                                        company_logo: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_events_speakers",
                            let: {
                                user_row_id: '$_id'
                            },
                            as: "speakers_count",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$user_type', 2] },
                                                { $eq: ['$user_row_id', '$$user_row_id'] },
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
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: [
                                { $match: { till_date_status: 2, user_account_type: 2 } },
                                {
                                    $project: {
                                        _id: 1
                                    }
                                }
                            ],
                            as: "team_members",
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_funding_investment_lists",
                            localField: "_id",
                            foreignField: "investor_row_id",
                            as: "funding_count",
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
                                        investor_type: 1,
                                        investor_registered_type: 2,
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $set:
                        {
                            company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: "$info_company.company_name", else: '$info_manual_company.company_name' } },
                            company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: "$info_company.company_email_id", else: '$info_manual_company.company_email_id' } },
                            company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: "$info_company.company_logo", else: '$info_manual_company.company_logo' } },
                            company_approval_status: { $cond: { if: { $eq: ['$company_type', 1] }, then: "$info_company.active_status", else: '$info_manual_company.approval_status' } },
                            company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: "$info_company.company_id", else: '' } },
                            speaker_counts: { $size: "$speakers_count" },
                            funding_count: { $size: "$funding_count" },
                            team_members_count: { $size: "$team_members" }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            gender: 1,
                            full_name: 1,
                            email_id: 1,
                            mobile_number: 1,
                            profile_image: 1,
                            work_position: 1,
                            user_link: 1,
                            created_on: 1,
                            updated_on: 1,
                            used_counts: 1,
                            used_types: 1,
                            approval_date: 1,
                            approval_status: 1,
                            main_user_row_id: 1,
                            approval_sub_admin_row_id: 1,
                            reject_type: 1,
                            rejected_reason: 1,
                            subadmin_name: "$info_subadmin.full_name",
                            company_name: 1,
                            company_email_id: 1,
                            company_logo: 1,
                            company_approval_status: 1,
                            speaker_counts: 1,
                            team_members_count: 1,
                            funding_count: 1,
                        }
                    }
                ]).limit(1)


                let result = {}
                result['_id'] = get_query[0]._id
                result['gender'] = get_query[0].gender
                result['full_name'] = get_query[0].full_name
                result['email_id'] = get_query[0].email_id
                result['mobile_number'] = get_query[0].mobile_number
                result['profile_image'] = get_query[0].profile_image
                result['work_position'] = get_query[0].work_position
                result['user_link'] = get_query[0].user_link
                result['created_on'] = get_query[0].created_on
                result['updated_on'] = get_query[0].updated_on
                result['used_counts'] = get_query[0].used_counts
                result['used_types'] = get_query[0].used_types
                result['approval_date'] = get_query[0].approval_date
                result['approval_status'] = get_query[0].approval_status
                result['main_user_row_id'] = get_query[0].main_user_row_id
                result['approval_sub_admin_row_id'] = get_query[0].approval_sub_admin_row_id
                result['reject_type'] = get_query[0].reject_type
                result['rejected_reason'] = get_query[0].rejected_reason
                result['subadmin_name'] = get_query[0].subadmin_name
                result['company_name'] = get_query[0].company_name
                result['company_email_id'] = get_query[0].company_email_id
                result['company_logo'] = get_query[0].company_logo
                result['company_approval_status'] = get_query[0].company_approval_status
                result['speaker_counts'] = get_query[0].speaker_counts
                result['funding_count'] = get_query[0].funding_count
                result['team_members_count'] = get_query[0].team_members_count

                res.json({ status: true, message: result })

            }
        }
        catch (err) {
            console.log('Manual user individual details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.post('/reject_manual_user/:user_row_id', [
    check('rejected_reason')
        .trim().not().isEmpty().withMessage('The User reject reason field required.')
        .isLength({ min: 4 }).withMessage('The User reject reason field at least contain 5 characters in length.')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    const checkAdminToken = checkAdminLoginToken(req.headers, [1])
    if (checkAdminToken.status) {
        let admin_row_id = 0
        const check_token_message = checkAdminToken.message
        if (check_token_message.admin_manager_type === 2) {
            admin_row_id = check_token_message.admin_row_id
        }

        if (Number.parseInt(checkAdminToken.message.sub_admin_type) == 2) {
            errObj['alert_message'] = "You do not have permission to perform this action"
        }

        const user_row_id = Number.parseInt(req.params.user_row_id)
        if (Number.isNaN(user_row_id)) {
            errObj['user_row_id'] = "The User row ID field should be a number"
        }

        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj })
        }
        else {
            try {
                const present_date_n_time = getPresentDateTime()
                const check_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id, approval_status: 0 })
                if (check_query) {

                    await professionals_manual_retrievalsM.updateOne({ _id: user_row_id },
                        {
                            $set: {
                                approval_status: 2,
                                approval_date: present_date_n_time,
                                reject_type: req.body.reject_type,
                                approval_sub_admin_row_id: admin_row_id,
                                rejected_reason: req.body.rejected_reason
                            }
                        })

                    res.json({ status: true, message: { alert_message: "This manual user details has been rejected successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Manual User Row ID." } })
                }
            }
            catch (err) {
                console.log('Reject Manual user.', err.message)
                res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
            }
        }
    }
    else {
        res.json(checkAdminToken)
    }
})



router.get('/speakers_attendees_events_list/:user_row_id/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.user_row_id))) {
                errObj['user_row_id'] = 'The User row id field must be contain valid number.'
            }

            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number.'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }


            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = Number.parseInt(req.params.user_row_id)

                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)

                let searchArray = [{
                    active_status: 1, approval_status: 1, $or: [
                        { login_status: 1, list_event_type: 1 },
                        { company_active_status: 1, list_event_type: 2 },
                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                    ]
                }]

                if (req.query.search) {
                    searchArray.push({ event_title: { '$regex': req.query.search, $options: 'i' } })
                }
                if (req.query.type) {
                    if (Number.parseInt(req.query.type) === 1) {
                        searchArray.push({ speaker_user_row_id: user_row_id })
                    }
                    else if (Number.parseInt(req.query.type) === 2) {
                        searchArray.push({ attendee_user_row_id: user_row_id })
                    }
                }
                else {
                    searchArray.push({ $or: [{ speaker_user_row_id: user_row_id }, { attendee_user_row_id: user_row_id }] })
                }

                const get_query = await eventM.aggregate([
                    { $sort: { end_date: -1 } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "user_row_id",
                            foreignField: "_id",
                            as: "user_info"
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info"
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {

                            from: "cln_events_speakers",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id, user_type: 2 } }],
                            as: "event_speaker"
                        }
                    },
                    { $unwind: { path: "$event_speaker", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {

                            from: "cln_events_attendees",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { user_row_id: user_row_id, user_type: 2 } }],
                            as: "event_guest"
                        }
                    },
                    { $unwind: { path: "$event_guest", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            login_status: "$user_info.login_status",
                            company_active_status: "$company_info.active_status",
                            speaker_user_row_id: { $cond: { if: "$event_speaker.user_row_id", then: "$event_speaker.user_row_id", else: 0 } },
                            attendee_user_row_id: { $cond: { if: "$event_guest.user_row_id", then: "$event_guest.user_row_id", else: 0 } }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_events_utc_dates",
                            localField: "utc_row_id",
                            foreignField: "_id",
                            as: "utc_dates"
                        }
                    },
                    { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                    { $match: { $and: searchArray } },
                    {
                        $project:
                        {
                            _id: 1,
                            event_title: 1,
                            event_type: 1,
                            event_image: 1,
                            event_city: 1,
                            event_state: 1,
                            event_venue: 1,
                            event_url: 1,
                            event_link: 1,
                            start_date: 1,
                            end_date: 1,
                            event_price: 1,
                            speaker_user_row_id: 1,
                            attendee_user_row_id: 1,
                            invitation_status: { $cond: { if: "$event_guest.invitation_status", then: "$event_guest.invitation_status", else: 0 } },
                            login_status: 1,
                            list_event_type: 1,
                            registered_type: { $cond: { if: { $eq: ["$speaker_user_row_id", user_row_id] }, then: 1, else: 2 } },
                            utc_time: "$utc_dates.utc_time",
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await eventM.aggregate([
                    { $sort: { end_date: -1 } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "user_row_id",
                            foreignField: "_id",
                            as: "user_info"
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info"

                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {

                            from: "cln_events_speakers",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id, user_type: 2 } }],
                            as: "event_speaker"
                        }
                    },
                    { $unwind: { path: "$event_speaker", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {

                            from: "cln_events_attendees",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { user_row_id: user_row_id, user_type: 2 } }],
                            as: "event_guest"
                        }
                    },
                    { $unwind: { path: "$event_guest", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            login_status: "$user_info.login_status",
                            company_active_status: "$company_info.active_status",
                            speaker_user_row_id: { $cond: { if: "$event_speaker.user_row_id", then: "$event_speaker.user_row_id", else: 0 } },
                            attendee_user_row_id: { $cond: { if: "$event_guest.user_row_id", then: "$event_guest.user_row_id", else: 0 } }
                        }
                    },
                    { $match: { $and: searchArray } },
                    {
                        $count: "count"
                    }

                ])

                const count = count_query[0] ? count_query[0].count : 0

                res.json({ status: true, message: get_query, count: count })

            }

        }
        catch (err) {
            console.log('Manual user speaker and attendee events list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/revoke_manual_user/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            if (Number.parseInt(checkToken.message.sub_admin_type) == 2) {
                res.json({ status: false, message: { alert_message: "You do not have permission to perform this action" } })
            }
            else {
                const user_row_id = Number.parseInt(req.params.user_row_id)
                if (!Number.isNaN(user_row_id)) {
                    const check_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id, approval_status: 2 })
                    if (check_query) {
                        await professionals_manual_retrievalsM.updateOne({ _id: user_row_id, approval_status: 2 },
                            { $set: { approval_status: 0 } })

                        res.json({ status: true, message: { alert_message: "This Manual User details has been revoked sucessfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Invalid Manual User Row ID" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Manual User Row ID" } })
                }

            }

        }
        catch (err) {
            console.log('Revoke Manual user.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/delete_manual_user/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                if (Number.parseInt(checkToken.message.sub_admin_type) == 2) {
                    res.json({ status: false, message: { alert_message: "You do not have permission to perform this action" } })
                }
                else {
                    const check_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id, approval_status: { $in: [0, 2] } })
                    if (check_query) {
                        // user attendees - STARTS HERE
                        const attendee_query = await event_attendeesM.findOne({ user_type: 2, user_row_id: user_row_id })
                        if (attendee_query) {
                            await event_attendeesM.deleteMany({ user_type: 2, user_row_id: user_row_id })
                        }

                        // user speakers - STARTS HERE

                        const speakers_query = await event_speakersM.findOne({ user_type: 2, user_row_id: user_row_id })
                        if (speakers_query) {
                            await event_speakersM.deleteMany({ user_type: 2, user_row_id: user_row_id })

                        }

                        // sponsors and partners
                        const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 1, registered_type: 2, user_company_row_id: user_row_id })
                        if (sp_query) {
                            await deleteSponsorsPartners({ type: 2, account_type: 1, registered_type: 2, user_company_row_id: user_row_id })

                        }

                        // users funds - STARTS HERE

                        const funds_query = await fundingInvestmentM.findOne({ investor_type: 1, investor_registered_type: 2, investor_row_id: user_row_id })
                        if (funds_query) {
                            await deleteUserFunding({ type: 2, investor_type: 1, registered_type: 2, funding_row_id: user_row_id, investment_type: 1 })

                        }

                        // work_experience - STARTS HERE

                        const work_experience_query = await professionals_work_experienceM.findOne({ user_account_type: 2, user_row_id: user_row_id })
                        if (work_experience_query) {
                            await deleteProfessionalDetails({ type: 2, user_company_row_id: user_row_id, user_type: 1, reqistered_type: 2 })

                        }

                        await professionals_manual_retrievalsM.deleteOne({ _id: user_row_id })

                        res.json({ status: true, message: { alert_message: "This Manual User details has been deleted sucessfully." } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Invalid Manual User Row ID" } })
                    }

                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Invalid Manual User Row ID" } })
            }

        }
        catch (err) {
            console.log('Delete Manual user.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


module.exports = router