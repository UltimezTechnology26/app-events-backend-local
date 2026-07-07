const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { deleteNotifications } = require('../../../utils/helpers/notification_helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
const companyM = require('../../../models/app/company/companyM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const company_created_by_adminM = require('../../../models/app/company/company_created_by_adminM')
const added_to_partnersM = require('../../../models/app/company/added_to_partnersM')
const eventM = require('../../../models/app/events/eventM')
const company_watchlistM = require('../../../models/app/watchlist/companyM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const { deleteProfessionalDetails, deleteCompanyRevenue, deleteCompanyFollowers, deleteCompanyWatchlist, deleteUserFunding, deleteCompanyDetails } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')



router.get('/companies_list/:approval_status/:active_status/:skip/:limit', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [7])

    if (checkToken.status) {
        try {
            const approval_status = Number.parseInt(req.params.approval_status)
            const active_status = Number.parseInt(req.params.active_status)

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50
            let status_apply = {}
            if (approval_status == 1) {
                status_apply = { approval_status: approval_status }
            }
            else {
                status_apply = { approval_status: approval_status, active_status: active_status }
            }

            let query = {
                $and: [
                    status_apply
                ]
            };

            if (req.query.search) {
                query.$and.push({
                    $or: [
                        { company_name: { $regex: req.query.search, $options: 'i' } },
                        { company_id: { $regex: req.query.search, $options: 'i' } },
                        { company_email_id: { $regex: req.query.search, $options: 'i' } }
                    ]
                });
            }

            if (req.query.profile_score === "0-24") {
                query.$and.push({ profile_score: { $gte: 0, $lte: 24 } });
            }
            else if (req.query.profile_score === "25-49") {
                query.$and.push({ profile_score: { $gte: 25, $lte: 49 } });
            }
            else if (req.query.profile_score === "50-74") {
                query.$and.push({ profile_score: { $gte: 50, $lte: 74 } });
            }
            else if (req.query.profile_score === "75-100") {
                query.$and.push({ profile_score: { $gte: 75, $lte: 100 } });
            }

            if ((approval_status == 0) || (approval_status == 1) || (approval_status == 2)) {

                const queryRun = await companyM.aggregate([
                    { $match: query },
                    { $sort: { _id: -1 } },
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
                        $lookup: {
                            from: "cln_professionals",
                            let: { updated_by_id: "$updated_by_row_id", updated_by_type: "$updated_by" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$_id", "$$updated_by_id"] },
                                                { $eq: ["$$updated_by_type", "user"] }
                                            ]
                                        }
                                    }
                                },
                                { $project: { full_name: 1 } }
                            ],
                            as: "updated_by_user_info"
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_sub_admins",
                            let: { updated_by_id: "$updated_by_row_id", updated_by_type: "$updated_by" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$_id", "$$updated_by_id"] },
                                                { $in: ["$$updated_by_type", ["admin", "subadmin"]] }
                                            ]
                                        }
                                    }
                                },
                                { $project: { full_name: 1 } }
                            ],
                            as: "updated_by_admin_info"
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_added_to_partners",
                            localField: "_id",
                            foreignField: "company_row_id",
                            as: "partner"
                        }
                    },
                    { $unwind: { path: "$partner", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            localField: "sub_admin_row_id",
                            foreignField: "_id",
                            as: "sub_admin_info"
                        }
                    },
                    { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "cln_static_company_business_models",
                            localField: "business_model_id",
                            foreignField: "_id",

                            pipeline: [{ $match: { active_status: true } }, { $project: { business_name: 1 } }],
                            as: "business_info",
                        }
                    },
                    ...(
                        !Number.isNaN(Number.parseInt(req.query.category_status)) &&
                            [0, 1].includes(Number.parseInt(req.query.category_status))
                            ? [
                                Number.parseInt(req.query.category_status) === 1
                                    ? {
                                        $match: {
                                            $expr: {
                                                $gt: [
                                                    { $size: { $ifNull: ["$business_info", []] } },
                                                    0
                                                ]
                                            }
                                        }
                                    }
                                    : {
                                        $match: {
                                            $expr: {
                                                $eq: [
                                                    { $size: { $ifNull: ["$business_info", []] } },
                                                    0
                                                ]
                                            }
                                        }
                                    }
                            ]
                            : []
                    ),
                    {
                        $project: {
                            _id: 1,
                            created_date_n_time: 1,
                            company_name: 1,
                            company_id: 1,
                            company_email_id: 1,
                            contact_number: 1,
                            website_link: 1,
                            company_logo: 1,
                            business_model_id: 1,
                            active_status: 1,
                            sub_admin_row_id: 1,
                            claim_status: 1,
                            created_user_name: "$user_info.full_name",
                            partner_added_id: "$partner._id",
                            sub_admin_name: "$sub_admin_info.full_name",
                            sub_admin_username: "$sub_admin_info.user_name",
                            business_name: "$business_info.business_name",
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
                            updated_by: 1,
                            updated_by_row_id: 1,
                            updated_date_n_time: 1,
                            updated_by_full_name: {
                                $switch: {
                                    branches: [
                                        {
                                            case: { $eq: ["$updated_by", "user"] },
                                            then: {
                                                $let: {
                                                    vars: { userInfo: { $arrayElemAt: ["$updated_by_user_info", 0] } },
                                                    in: { $ifNull: ["$$userInfo.full_name", ""] }
                                                }
                                            }
                                        },
                                        {
                                            case: { $eq: ["$updated_by", "admin"] },
                                            then: {
                                                $let: {
                                                    vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                    in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                                }
                                            }
                                        },
                                        {
                                            case: { $eq: ["$updated_by", "subadmin"] },
                                            then: {
                                                $let: {
                                                    vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                    in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                                }
                                            }
                                        }
                                    ],
                                    default: ""
                                }
                            },
                        }
                    }
                ]).skip(skip).limit(limit)

                // const queryRunCount = await companyM.countDocuments(query)
                const countPipeline = [
                    { $match: query },
                    {
                        $lookup: {
                            from: "cln_static_company_business_models",
                            localField: "business_model_id",
                            foreignField: "_id",
                            pipeline: [{ $match: { active_status: true } }],
                            as: "business_info"
                        }
                    },
                    ...(
                        !Number.isNaN(Number.parseInt(req.query.category_status)) &&
                            [0, 1].includes(Number.parseInt(req.query.category_status))
                            ? [
                                Number.parseInt(req.query.category_status) === 1
                                    ? {
                                        $match: {
                                            $expr: {
                                                $gt: [
                                                    { $size: { $ifNull: ["$business_info", []] } },
                                                    0
                                                ]
                                            }
                                        }
                                    }
                                    : {
                                        $match: {
                                            $expr: {
                                                $eq: [
                                                    { $size: { $ifNull: ["$business_info", []] } },
                                                    0
                                                ]
                                            }
                                        }
                                    }
                            ]
                            : []
                    ),
                    { $count: "count" }
                ]

                const countResult = await companyM.aggregate(countPipeline)
                const queryRunCount = countResult[0]?.count || 0

                res.json({ status: true, message: queryRun, count: queryRunCount })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Please enter according to  0:pending, 1:approved, 2:rejected' } })
            }
        }
        catch (err) {
            console.log('Companies list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/approve_request/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const queryRun = await companyM.findOne({ _id: req.params.request_row_id })
            if (queryRun) {
                const company_row_id = Number.parseInt(req.params.request_row_id)
                const check_access = await checkCompanySubadminAccess({
                    admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                    admin_manager_type: checkToken.message.admin_manager_type,
                    sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                    company_row_id: Number.parseInt(req.params.request_row_id)
                })
                if (check_access.status) {
                    const checkApprovalQuery = await companyM.findOne({ _id: req.params.request_row_id, approval_status: 0 })
                    if (checkApprovalQuery) {
                        const updateFields = getUpdateTrackerFields(checkToken)

                        await companyM.updateOne({ _id: req.params.request_row_id }, { $set: { approval_status: 1, ...updateFields, updated_date_n_time: new Date() } })
                        await deleteKeysByPattern('app_company_individual_details_*')
                        await deleteKeysByPattern('app_company_list_*')
                        const company_name = checkApprovalQuery.company_name
                        const company_email_id = checkApprovalQuery.company_email_id

                        if (queryRun.user_row_id) {
                            await updateNotification({
                                user_row_id: queryRun.user_row_id,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 10,
                                action_row_id: company_row_id
                            })
                        }

                        let pass_subject = 'Your company ' + company_name + ' was Approved by the Admin. '
                        let pass_message = `
                        <p style="text-transform: capitalize;color:#000;font-weight: 500;font-size:22px;">Hello ${company_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Your Company <b style="text-transform: capitalize;">${company_name}</b> is reviewed and approved successfully by the admin. </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"> You can now list and manage your events, update company details, add tokens, and access all the exciting features on Coinpedia.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login Now</a> </p>
                        `
                        await sendEmail(company_email_id, pass_subject, pass_message)

                        res.json({ status: true, message: { alert_message: 'Company approved successfully' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, This Company cannot be approved' } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: check_access.message } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } })
            }
        }
        catch (err) {
            console.log('Approve company request.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/reject_request/:request_row_id', [
    check('reason_rejected')
        .trim().not().isEmpty().withMessage('The Reason Rejected field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }
        else {
            const check_access = await checkCompanySubadminAccess({
                admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                admin_manager_type: checkToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                company_row_id: Number.parseInt(req.params.request_row_id)
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {

            let admin_row_id = 0
            const check_token_message = checkToken.message
            if (check_token_message.admin_manager_type == 2) {
                admin_row_id = check_token_message.admin_row_id
            }
            const company_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(company_row_id)) {
                const queryRun = await companyM.findOne({ _id: company_row_id })
                if (queryRun) {
                    const checkApprovalQuery = await companyM.findOne({ _id: company_row_id, approval_status: 0 })
                    if (checkApprovalQuery) {
                        let updateArray = {}

                        updateArray['approval_status'] = 2
                        updateArray['approval_sub_admin_row_id'] = admin_row_id
                        updateArray['reason_rejected'] = req.body.reason_rejected
                        updateArray['rejected_date_n_time'] = getPresentDateTime()


                        const company_name = checkApprovalQuery.company_name
                        const company_email_id = checkApprovalQuery.company_email_id

                        let pass_subject = 'CoinPedia Company Profile Request Denied'
                        let pass_message = `
                            <p style="text-transform: capitalize;color:#000;font-weight: 500;font-size:22px;">Dear  ${company_name},</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your CoinPedia Company Profile account application has been denied.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${req.body.reason_rejected}</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Your interest is appreciated, and we invite you to <a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Register<a> to CoinPedia for more information!</p>
                            `
                        await sendEmail(company_email_id, pass_subject, pass_message)

                        const updateFields = getUpdateTrackerFields(checkToken)
                        Object.assign(updateArray, updateFields)

                        await companyM.updateOne({ _id: company_row_id }, { $set: updateArray })
                        await deleteKeysByPattern('app_company_individual_details_*')
                        await deleteKeysByPattern('app_company_list_*')
                        if (queryRun.user_row_id) {
                            await updateNotification({
                                user_row_id: queryRun.user_row_id,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 11,
                                action_row_id: company_row_id
                            })
                        }

                        res.json({ status: true, message: { alert_message: 'Company rejected successfully' }, updateArray: updateArray })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry! This Company cannot be rejected' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: "Oops! Invalid Company Row Id" } })
            }
        }
    }
    catch (err) {
        console.log('Reject company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_company/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const queryRun = await companyM.findOne({ _id: request_row_id })
                if (queryRun) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: request_row_id
                    })

                    if (check_access.status) {
                        await deleteCompanyDetails({ company_row_id: queryRun._id })

                        res.json({ status: true, message: { alert_message: 'Company Deleted successfully' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Delete company.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/deleted_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            let query = {}
            if (req.query.search) {
                query = {
                    $or: [{ company_name: { '$regex': req.query.search, $options: 'i' } },
                    { company_id: { '$regex': req.query.search, $options: 'i' } },
                    { company_email_id: { '$regex': req.query.search, $options: 'i' } }]
                }
            }

            const queryRun = await company_deleted_historyM.aggregate([
                { $sort: { _id: -1 } },
                { $match: query },
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
                    $project: {
                        _id: 1,
                        company_name: 1,
                        company_id: 1,
                        company_email_id: 1,
                        company_logo: 1,
                        website_link: 1,
                        contact_number: 1,
                        established_in: 1,
                        country_id: 1,
                        company_location: 1,
                        describe_in_one_line: 1,
                        date_n_time: 1,
                        approval_status: 1,
                        main_business_model_name: "$main_business_info.business_name",
                        business_name: "$business_info.business_name",
                    }
                }
            ]).skip(skip).limit(limit)

            const queryCount = await company_deleted_historyM.countDocuments(query)

            res.json({ status: true, message: queryRun, count: queryCount })
        }
        catch (err) {
            console.log('Deleted companies list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})




module.exports = router