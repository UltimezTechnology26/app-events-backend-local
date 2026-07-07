const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, checkCompanySubadminAccess } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const { sendEmail } = require('../../../../config/email')
const { updateNotification } = require('../../../../utils/helpers/notification_helper')
const company_created_by_adminM = require('../../../../models/app/company/company_created_by_adminM')
const companyM = require('../../../../models/app/company/companyM')
const company_requests_to_partnersM = require('../../../../models/app/company/company_requests_to_partnersM')
const added_to_partnersM = require('../../../../models/app/company/added_to_partnersM')
const { deleteKeysByPattern } = require('../../../../config/cache_helper')


// Company claimed requests list
router.get('/list/:approval_status/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50
            const approval_status = !Number.isNaN(Number.parseInt(req.params.approval_status)) ? Number.parseInt(req.params.approval_status) : 0

            let query = {}
            if (req.query.search) {
                query = {
                    $and: [
                        {
                            $or: [
                                { company_name: { '$regex': req.query.search, $options: 'i' } },
                                { company_id: { '$regex': req.query.search, $options: 'i' } },
                                { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                                { user_name: { '$regex': req.query.search, $options: 'i' } },
                                { full_name: { '$regex': req.query.search, $options: 'i' } },
                                { email_id: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                }
            }
            if (req.query.profile_score === "0-24") {
                query.profile_score = { $gte: 0, $lte: 24 };
            } else if (req.query.profile_score === "25-49") {
                query.profile_score = { $gte: 25, $lte: 49 };
            } else if (req.query.profile_score === "50-74") {
                query.profile_score = { $gte: 50, $lte: 74 };
            } else if (req.query.profile_score === "75-100") {
                query.profile_score = { $gte: 75, $lte: 100 };
            }

            const get_query = company_requests_to_partnersM.aggregate([
                {
                    $match: {
                        approval_status: approval_status
                    }
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
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1,
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
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        basic_details_score: "$company_info.basic_details_score",
                        seo_details_score: "$company_info.seo_details_score",
                        social_media_score: "$company_info.social_media_score",
                        owned_product_score: "$company_info.owned_product_score",
                        team_detail_score: "$company_info.team_detail_score",
                        job_opening_score: "$company_info.job_opening_score",
                        funding_score: "$company_info.funding_score",
                        revenue_score_score: "$company_info.revenue_score_score",
                        investment_score: "$company_info.investment_score",
                        faq_score: "$company_info.faq_score",
                        holding_crypto_score: "$company_info.holding_crypto_score",
                        profile_score: "$company_info.profile_score",
                    }
                },
                { $match: query },
                {
                    $project: {
                        _id: 1,
                        approval_status: 1,
                        date_n_time: 1,
                        rejected_reason: 1,
                        approval_date_n_time: 1,
                        company_name: 1,
                        company_id: 1,
                        company_email_id: 1,
                        website_link: 1,
                        contact_number: "$company_info.contact_number",
                        company_logo: "$company_info.company_logo",
                        user_name: 1,
                        full_name: 1,
                        email_id: 1,
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
            ]).skip(skip).limit(limit)

            const count_query = company_requests_to_partnersM.aggregate([
                {
                    $match: {
                        approval_status: approval_status
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
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1,
                                    profile_score: 1,

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
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        profile_score: "$company_info.profile_score",

                    }
                },
                { $match: query },
                {
                    $count: "count"
                }
            ])


            const [result1, result2] = await Promise.all([get_query, count_query])

            let total_counts = 0
            if (result2[0]?.count) {
                total_counts = result2[0]?.count
            }

            res.json({ status: true, message: result1, count: total_counts })
        }
        catch (err) {
            console.log('Company claim requests list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', error: err.message })
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
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const queryRun = await company_requests_to_partnersM.aggregate([
                    {
                        $match:
                        {
                            _id: request_row_id,
                            approval_status: 0
                        }
                    },
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
                        $project: {
                            _id: 1,
                            claim_type: 1,
                            user_row_id: 1,
                            company_row_id: 1,
                            date_n_time: 1,
                            approval_date_n_time: 1,
                            rejected_reason: 1,
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_email_id: "$company_info.company_email_id",
                            website_link: "$company_info.website_link",
                            contact_number: "$company_info.contact_number",
                            company_logo: "$company_info.company_logo",
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                            approval_status: "$company_info.approval_status",
                            active_status: "$company_info.active_status"
                        }
                    }
                ]).limit(1)

                if (queryRun[0]) {
                    const company_row_id = queryRun[0].company_row_id
                    const user_row_id = queryRun[0].user_row_id ? queryRun[0].user_row_id : 0
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: company_row_id
                    })

                    if (check_access.status) {
                        const date_n_time = getPresentDateTime()

                        const check_added_to_partner_query = await added_to_partnersM.findOne({ company_row_id: company_row_id })
                        if (!check_added_to_partner_query) {
                            await added_to_partnersM({ company_row_id: company_row_id, date_n_time }).save()
                        }

                        await company_requests_to_partnersM.updateOne({ _id: request_row_id },
                            {
                                $set:
                                {
                                    approval_status: 1,
                                    approval_date_n_time: date_n_time
                                }
                            })
                        await deleteKeysByPattern('app_front_page_partners_list_*')
                        await updateNotification({
                            user_row_id: user_row_id,
                            notify_type: 2,
                            notify_type_row_id: company_row_id,
                            message_row_id: 23,
                            action_row_id: request_row_id,
                            notify_image: queryRun[0].company_logo,
                            notify_name: queryRun[0].company_name,
                            notify_id: ((queryRun[0].approval_status == 1) && (queryRun[0].active_status == 1)) ? queryRun[0].company_id : ''
                        })

                        const user_full_name = queryRun[0].full_name
                        const user_email_id = queryRun[0].email_id
                        const company_name = queryRun[0].company_name

                        let pass_subject = `Welcome ${company_name} – Your Partnership is Confirmed !`
                        let pass_message = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${user_full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">We are delighted to inform you that your company has been successfully accepted as a valued partner of <b style="text-transform: capitalize;">Coinpedia</b>. Congratulations!</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">As our partner, you will have access to exclusive benefits, resources, and opportunities to grow together with us. We are excited to collaborate and achieve great success.</p>
                        `

                        await sendEmail(user_email_id, pass_subject, pass_message)

                        res.json({ status: true, message: { alert_message: 'Congratulations! This company is now approved and has been added to the partner list.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } })
            }

        }
        catch (err) {
            console.log('Company  requests Approve.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/reject_request/:request_row_id', [
    check('rejected_reason')
        .trim().not().isEmpty().withMessage('The Reason Rejected field is required')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }

        const request_row_id = Number.parseInt(req.params.request_row_id)

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {

            const get_query = await company_requests_to_partnersM.aggregate([
                {
                    $match:
                    {
                        _id: request_row_id,
                        approval_status: 0
                    }
                },
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
                    $project: {
                        _id: 1,
                        claim_type: 1,
                        user_row_id: 1,
                        company_row_id: 1,
                        date_n_time: 1,
                        approval_date_n_time: 1,
                        rejected_reason: 1,
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        contact_number: "$company_info.contact_number",
                        company_logo: "$company_info.company_logo",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        approval_status: "$company_info.approval_status",
                        active_status: "$company_info.active_status"
                    }
                }
            ]).limit(1)

            if (get_query[0]) {
                const company_row_id = get_query[0].company_row_id


                const check_access = await checkCompanySubadminAccess({
                    admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                    admin_manager_type: checkToken.message.admin_manager_type,
                    sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                    company_row_id: company_row_id
                })

                if (check_access.status) {
                    const date_n_time = getPresentDateTime()
                    const user_row_id = get_query[0].user_row_id ? get_query[0].user_row_id : 0
                    await company_requests_to_partnersM.updateOne({ _id: request_row_id },
                        {
                            $set:
                            {
                                approval_status: 2,
                                rejected_reason: req.body.rejected_reason,
                                approval_date_n_time: date_n_time
                            }
                        })
                    await deleteKeysByPattern('app_front_page_partners_list_*')
                    await updateNotification({
                        user_row_id: user_row_id,
                        notify_type: 2,
                        notify_type_row_id: company_row_id,
                        message_row_id: 28,
                        action_row_id: request_row_id,
                        notify_image: get_query[0].company_logo,
                        notify_name: get_query[0].company_name,
                        notify_id: ((get_query[0].approval_status == 1) && (get_query[0].active_status == 1)) ? get_query[0].company_id : ''
                    })


                    const user_full_name = get_query[0].full_name
                    const user_email_id = get_query[0].email_id
                    const company_name = get_query[0].company_name

                    let pass_subject = `${company_name} – Partnership Request Update`
                    let pass_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${user_full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Thank you for reaching out and expressing interest in partnering with Coinpedia. We truly appreciate your proposal and the opportunity to explore potential collaboration.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">After careful consideration, we regret to inform you that we are unable to proceed with a partnership at this time. This decision is based on our current strategic priorities and commitments.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We appreciate your understanding and wish you success in your endeavors. Please feel free to stay in touch for any future opportunities.</p>
                    `

                    await sendEmail(user_email_id, pass_subject, pass_message)

                    res.json({ status: true, message: { alert_message: 'The partnership request from this company has been rejected.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: check_access.message } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } })
            }
        }
    }
    catch (err) {
        console.log('Company Partner requests reject.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }

})

module.exports = router