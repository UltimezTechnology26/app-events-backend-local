const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, checkCompanySubadminAccess } = require('../../../../utils/helpers/helper')
const { getUpdateTrackerFields } = require('../../../../utils/helpers/app_helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const { sendEmail } = require('../../../../config/email')
const { updateNotification } = require('../../../../utils/helpers/notification_helper')
const company_claim_requestsM = require('../../../../models/app/company/company_claim_requestsM')
const company_created_by_adminM = require('../../../../models/app/company/company_created_by_adminM')
const companyM = require('../../../../models/app/company/companyM')
const eventM = require('../../../../models/app/events/eventM')

// Company claimed requests list
router.get('/list/:claim_status/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const claim_status = !Number.isNaN(Number.parseInt(req.params.claim_status)) ? Number.parseInt(req.params.claim_status) : 0
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = { claim_status: claim_status }
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
                        },
                        {
                            claim_status: claim_status
                        }
                    ]
                }
            }

            const queryRun = await company_claim_requestsM.aggregate([
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
                                $match: { login_status: 1, }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    pro_batch: 1,
                                    email_id: 1,
                                    approval_status: 1
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
                                    website_link: 1
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
                        pro_batch: "$user_info.pro_batch",
                        approval_status: "$user_info.approval_status"
                    }
                },
                { $match: query },
                {
                    $project: {
                        _id: 1,
                        claim_type: 1,
                        date_n_time: 1,
                        claim_action_date_n_time: 1,
                        claim_rejected_reason: 1,
                        company_name: 1,
                        company_id: 1,
                        company_email_id: 1,
                        website_link: 1,
                        contact_number: "$company_info.contact_number",
                        company_logo: "$company_info.company_logo",
                        user_name: 1,
                        approval_status: 1,
                        full_name: 1,
                        email_id: 1,
                        pro_batch: 1,
                        // email_id: 1
                    }
                }
            ]).skip(skip).limit(limit)

            if (queryRun.length > 0) {
                const countsQuery = await company_claim_requestsM.aggregate([
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
                                        email_id: 1,
                                        pro_batch: 1,

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
                                        website_link: 1
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
                            pro_batch: "$user_info.pro_batch",
                        }
                    },
                    { $match: query },
                    {
                        $count: "count"
                    }
                ])

                res.json({ status: true, message: queryRun, count: countsQuery[0].count })
            }
            else {
                res.json({ status: true, message: [], count: 0 })
            }
        }
        catch (err) {
            console.log('Company claim requests list.', err.message)
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
            const request_row_id = Number.parseInt(req.params.request_row_id)

            const queryRun = await company_claim_requestsM.aggregate([
                {
                    $match:
                    {
                        _id: request_row_id,
                        claim_status: 1
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
                        claim_action_date_n_time: 1,
                        claim_rejected_reason: 1,
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        contact_number: "$company_info.contact_number",
                        company_logo: "$company_info.company_logo",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                }
            ]).limit(1)

            if (!Number.isNaN(request_row_id)) {

                if (queryRun[0]) {
                    const company_row_id = queryRun[0].company_row_id
                    const user_row_id = queryRun[0].user_row_id
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: company_row_id
                    })
                    if (check_access.status) {
                        const check_user_created_query = await companyM.findOne({ user_row_id: user_row_id })
                        if (!check_user_created_query) {
                            const check_company_query = await companyM.findOne({ _id: company_row_id, claim_status: 1 })
                            if (!check_company_query.user_row_id) {

                                const updateFields = getUpdateTrackerFields(checkToken)
                                await companyM.updateOne({ _id: company_row_id }, { $set: { user_row_id: user_row_id, claim_status: 2, ...updateFields } })
                                // insert_array['sub_admin_row_id'] = admin_row_id
                                await company_created_by_adminM.updateOne({ company_row_id: company_row_id }, { $set: { claim_status: 2 } })
                                await eventM.updateMany({ company_row_id: company_row_id }, { $set: { user_row_id: user_row_id } })
                                await company_claim_requestsM.updateOne({ _id: request_row_id },
                                    {
                                        $set:
                                        {
                                            claim_status: 2,
                                            claim_action_date_n_time: getPresentDateTime()
                                        }
                                    })

                                if (user_row_id) {
                                    await updateNotification({
                                        user_row_id: user_row_id,
                                        notify_type: 2,
                                        notify_type_row_id: company_row_id,
                                        message_row_id: 13,
                                        action_row_id: request_row_id
                                    })
                                }

                                const user_full_name = queryRun[0].full_name
                                const user_email_id = queryRun[0].email_id
                                const company_name = queryRun[0].company_name

                                let pass_subject = 'Your Claim Request for Company ' + company_name + ' was Approved by the Admin. '
                                let pass_message = `
                                <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${user_full_name},</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Good News.! Your claim request for the Company <b style="text-transform: capitalize;">${company_name}</b> was accepted and approved successfully by the admin. </p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">You are now eligible to access all the features of the Coinpedia Company Profile Account.</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">With this account you can:</p>
                                <ul style="color:#000;font-weight: 400;font-size:17px;">
                                    <li>Create, List and Manage events.</li>
                                    <li>Add Team Members.</li>
                                    <li>Add and Update Company Details.</li>
                                    <li>Add and update Funding and Revenue details</li>
                                    <li>Get Market Insights, Share News.</li>
                                    <li>Notify people about Jobs.</li>
                                </ul>
                                <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> and complete your company profile.</p>
                                `

                                await sendEmail(user_email_id, pass_subject, pass_message)



                                res.json({ status: true, message: { alert_message: 'This user, company claim request approved successfully.' } })
                            }
                            else {
                                res.json({ status: false, message: { alert_message: 'Sorry, This company has already owned by user ' } })
                            }
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, This user already owned by company ' + check_user_created_query.company_name } })
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
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } })
            }

        }
        catch (err) {
            console.log('Company claim requests Approve.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
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

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const queryRun = await company_claim_requestsM.aggregate([
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
                { $match: { _id: Number.parseInt(req.params.request_row_id), claim_status: 1 } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        claim_type: 1,
                        date_n_time: 1,
                        claim_action_date_n_time: 1,
                        claim_rejected_reason: 1,
                        company_row_id: 1,
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        contact_number: "$company_info.contact_number",
                        company_logo: "$company_info.company_logo",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                }
            ]).limit(1)
            // const queryRun = await company_claim_requestsM.findOne({_id:req.params.request_row_id, claim_status:0})
            if (queryRun[0]) {
                const check_access = await checkCompanySubadminAccess({
                    admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                    admin_manager_type: checkToken.message.admin_manager_type,
                    sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                    company_row_id: queryRun[0].company_row_id
                })
                if (check_access.status) {
                    let updateArray = {
                        claim_status: 3,
                        claim_rejected_reason: req.body.rejected_reason,
                        claim_action_date_n_time: getPresentDateTime()
                    }
                    await company_claim_requestsM.updateOne({ _id: req.params.request_row_id }, { $set: updateArray })

                    const user_full_name = queryRun[0].full_name
                    const user_email_id = queryRun[0].email_id
                    const company_name = queryRun[0].company_name
                    const user_row_id = queryRun[0].user_row_id
                    const company_row_id = queryRun[0].company_row_id

                    if (user_row_id) {
                        await updateNotification({
                            user_row_id: user_row_id,
                            notify_type: 2,
                            notify_type_row_id: company_row_id,
                            message_row_id: 14,
                            action_row_id: Number.parseInt(req.params.request_row_id)
                        })
                    }

                    let pass_subject = 'Your claim Request for the company ' + company_name + ' was declined'
                    let pass_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${user_full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are sorry to inform you that your claim request for the company <b style="text-transform: capitalize;">${company_name} </b> was rejected by our admin due to the reason mentioned below :</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reason: </b>${req.body.rejected_reason}</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">No worries, we suggest you submit a new claim request from the email id that matches the company’s domain name. </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Submit a new claim request <a href="https://app.coinpedia.org/login/" style="color:#0029ff;">here.</a></p>
                    `
                    await sendEmail(user_email_id, pass_subject, pass_message)

                    res.json({ status: true, message: { alert_message: 'This user, company claim request rejected successfully.' } })

                }
                else {
                    res.json({ status: false, message: { alert_message: check_access.message } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } })
            }
        }
    }
    catch (err) {
        console.log('Company claim requests reject.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }

})

module.exports = router