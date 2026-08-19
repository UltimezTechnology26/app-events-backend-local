const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
const professionalsM = require('../../../models/app/professionalsM')
const { getPositionResolutionStages } = require('../../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../modules/funding/funding.queries')

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /list/:approval_status/:login_status/:skip/:limit. Resolves position name(s)
 * via getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr — upgraded from the previous location's combined
 * static-lookup + manual-lookup ($cond on position_type) to full positions[] array
 * support. Downstream, the outer pipeline's final $project still reads
 * position_name from `$info_work.position_name` — unchanged shape. The leading
 * commented-out dead static-lookup block is pre-existing and intentionally left
 * untouched (not part of this fix's scope). `{ $limit: 1 }` kept in its original
 * position: after position resolution, before the company lookups.
 */
function buildPendingListInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 1 } },
        // {
        //     $lookup:
        //     {
        //         from: "cln_static_professionals_work_positions",
        //         localField: "position_row_id",
        //         foreignField: "_id",
        //         as: "info_position",
        //         pipeline: [
        //             {
        //                 $project: {
        //                     _id: 1,
        //                     position_name: 1
        //                 }
        //             },
        //         ]
        //     }
        // },
        // { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                    { $limit: 1 },
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

router.get('/list/:approval_status/:login_status/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const approval_status = Number.parseInt(req.params.approval_status)
            const login_status = Number.parseInt(req.params.login_status)

            if ((approval_status == 0) || (approval_status == 1) || (approval_status == 2)) {
                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

                let query = [{ approval_status: approval_status, login_status: login_status }]

                if (req.query.search) {
                    query.push({
                        $and: [
                            {
                                $or: [
                                    { full_name: { '$regex': req.query.search, $options: 'i' } },
                                    { user_name: { '$regex': req.query.search, $options: 'i' } },
                                    { email_id: { '$regex': req.query.search, $options: 'i' } }
                                ]
                            },
                        ]
                    })
                }

                if (req.query.claim_status) {
                    query.push({ claim_status: Number.parseInt(req.query.claim_status) })
                }

                if (req.query.sub_admin_row_id) {
                    query.push({ sub_admin_row_id: Number.parseInt(req.query.sub_admin_row_id) })
                }

                if (req.query.profile_score) {
                    const range = req.query.profile_score;

                    const [min, max] = range.split("-").map(Number);

                    if (!Number.isNaN(min) && !Number.isNaN(max)) {
                        query.push({
                            profile_score: {
                                $gte: min,
                                $lte: max
                            }
                        });
                    }
                }
                let matchConditions = [];

                /* ---------------- DESIGNATION STATUS FILTER ---------------- */
                /* ---------------- DESIGNATION STATUS FILTER (FINAL & CORRECT) ---------------- */
                if (!Number.isNaN(Number.parseInt(req.query.designation_status))) {
                    const designationStatus = Number.parseInt(req.query.designation_status);

                    if (designationStatus === 1) {
                        // ✅ TAGGED (has at least one ACTIVE designation)
                        matchConditions.push({
                            designation_info: { $ne: null }
                        });
                    }
                    else if (designationStatus === 0) {
                        // ✅ NON-TAGGED (no ACTIVE designation)
                        matchConditions.push({
                            designation_info: null
                        });
                    }
                }




                /* ---------------- LOOKING FOR STATUS FILTER (FIXED) ---------------- */
                if (!Number.isNaN(Number.parseInt(req.query.looking_for_status))) {
                    const lookingForStatus = Number.parseInt(req.query.looking_for_status);

                    if (lookingForStatus === 1) {
                        // HAS looking_for
                        matchConditions.push({
                            $expr: {
                                $gt: [
                                    { $size: { $ifNull: ["$other_info", []] } },
                                    0
                                ]
                            }
                        });
                    } else if (lookingForStatus === 0) {
                        // NO looking_for
                        matchConditions.push({
                            $expr: {
                                $eq: [
                                    { $size: { $ifNull: ["$other_info", []] } },
                                    0
                                ]
                            }
                        });
                    }
                }

                // PERF FIX: $match now runs before $sort so Mongo can use the
                // { approval_status, login_status, _id } compound index (professionalsM.js)
                // to serve the filter and the sort in one index scan, instead of sorting the
                // entire collection by _id first and only filtering afterward. Output order is
                // unchanged — filtering doesn't reorder surviving documents either way.
                const queryRunPromise = professionalsM.aggregate([
                    { $match: { $and: query } },
                    { $sort: { _id: -1 } },
                    {
                        $lookup:
                        {
                            from: "cln_auth_verify_emails",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "email_info"
                        }
                    },
                    { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            email_verify_status: "$email_info.email_verify_status",
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_profile_images",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "userImage"
                        }
                    },
                    { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
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
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: buildPendingListInfoWorkPipeline(),
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "cln_static_user_looking_for_lists",
                            localField: "looking_for_id",
                            foreignField: "_id",
                            as: "other_info",
                            pipeline: [{ $match: { active_status: true } }, { $project: { _id: 1, name: 1 } }]
                        }
                    },
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



                    // 1️⃣ Lookup designation (ACTIVE ONLY)
                    {
                        $lookup: {
                            from: "cln_static_user_designations",
                            localField: "designation_id",
                            foreignField: "_id",
                            as: "designation_info",
                            pipeline: [
                                { $match: { active_status: true } },
                                { $project: { _id: 0, designation_name: 1 } }
                            ]
                        }
                    },

                    // 2️⃣ Normalize
                    {
                        $set: {
                            designation_info: {
                                $cond: [
                                    { $gt: [{ $size: "$designation_info" }, 0] },
                                    "$designation_info",
                                    null
                                ]
                            }
                        }
                    },

                    // 3️⃣ Apply tagged / non-tagged filter
                    ...(matchConditions.length
                        ? [{ $match: { $and: matchConditions } }]
                        : []),


                    {
                        $project: {
                            _id: 1,
                            login_status: 1,
                            approval_status: 1,
                            sub_admin_row_id: 1,
                            claim_status: 1,
                            created_date_n_time: 1,
                            full_name: 1,
                            pro_batch: 1,
                            user_name: 1,
                            // mobile_number:1, 
                            email_id: 1,
                            position_name: "$info_work.position_name",
                            company_name: "$info_work.company_name",
                            email_verify_status: 1,
                            sub_admin_name: "$sub_admin_info.full_name",
                            profile_image: "$userImage.profile_image",
                            referral_user_name: 1,
                            professional_profile_score: 1,
                            seo_details_score: 1,
                            social_media_score: 1,
                            academy_score: 1,
                            community_score: 1,
                            professional_detail_score: 1,
                            investment_score: 1,
                            award_score: 1,
                            faq_score: 1,
                            profile_score: 1,

                            designation_array: "$designation_info.designation_name",
                            looking_for_id: "$looking_for_id",
                            looking_for: '$other_info',
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
                            }
                        }
                    }
                ]).skip(skip).limit(limit)



                // const countQueryRun = await professionalsM.countDocuments({ $and: query })
                const countPipeline = [
                    { $match: { $and: query } },

                    // 🔹 looking_for (updated to use cln_professionals directly)
                    {
                        $lookup: {
                            from: "cln_static_user_looking_for_lists",
                            localField: "looking_for_id",
                            foreignField: "_id",
                            as: "other_info",
                            pipeline: [
                                { $match: { active_status: true } },
                                { $project: { _id: 1, name: 1 } }
                            ]
                        }
                    },

                    // 🔹 designation (NEW – SAME AS LIST)
                    {
                        $lookup: {
                            from: "cln_static_user_designations",
                            localField: "designation_id",
                            foreignField: "_id",
                            as: "designation_info",
                            pipeline: [
                                { $match: { active_status: true } },
                                { $project: { _id: 0, designation_name: 1 } }
                            ]
                        }
                    },

                    // 2️⃣ Normalize
                    {
                        $set: {
                            designation_info: {
                                $cond: [
                                    { $gt: [{ $size: "$designation_info" }, 0] },
                                    "$designation_info",
                                    null
                                ]
                            }
                        }
                    },

                    // 3️⃣ Apply tagged / non-tagged filter
                    ...(matchConditions.length
                        ? [{ $match: { $and: matchConditions } }]
                        : []),

                    { $count: "count" }
                ];


                // PERF FIX: list and count used to run as two sequential awaits — they're
                // independent of each other, so run them concurrently instead.
                const [queryRun, countResult] = await Promise.all([
                    queryRunPromise,
                    professionalsM.aggregate(countPipeline)
                ]);
                const countQueryRun = countResult[0]?.count || 0;

                res.json({ status: true, message: queryRun, count: countQueryRun })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Please enter according to  0:pending, 1:approved, 2:rejected' } })
            }

        }
        catch (err) {
            console.log('Users list.', err.message)
            res.json({ status: false, message: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/approve_request/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const user_query = await professionalsM.findOne({ _id: request_row_id }, { _id: 1, full_name: 1, user_name: 1, email_id: 1, approval_status: 1 })
                if (user_query) {
                    const check_access = await checkUserSubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        user_row_id: request_row_id
                    })
                    if (check_access.status) {
                        if (user_query.approval_status != 1) {
                            const updateFields = getUpdateTrackerFields(checkToken)
                            await professionalsM.updateOne({ _id: request_row_id }, { $set: { approval_status: 1, ...updateFields, updated_date_n_time: new Date() } })

                            const pass_email_id = user_query.email_id
                            const pass_full_name = user_query.full_name
                            const pass_subject = "Your Coinpedia User Account is Approved"
                            const pass_message = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${pass_full_name},</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">We are delighted to inform you that your user profile has been reviewed and approved by our admin.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">You are now able to access all the features of Coinpedia to manage your account, create and list your event, add wallet to track your portfolio, gain insights from the Crypto experts, learn from scratch the crypto industry, and stay updated with Coinpedia’s latest news on Fintech and Crypto.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Get started with your account by logging in.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Login Here</a></p>
                            `

                            await sendEmail(pass_email_id, pass_subject, pass_message)

                            await updateNotification({
                                user_row_id: request_row_id,
                                notify_type: 1,
                                notify_type_row_id: 0,
                                message_row_id: 4,
                                action_row_id: request_row_id
                            })

                            res.json({ status: true, message: { alert_message: 'This User account has been approved successfully.' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, this user cannot be approved' } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, invalid request row id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Approve user request.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/reject_request/:request_row_id', [
    check('reason_rejected')
        .trim().not().isEmpty().withMessage('The reason rejected field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [1])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const check_access = await checkUserSubadminAccess({
                admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                admin_manager_type: checkToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                user_row_id: request_row_id
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else if (!Number.isNaN(request_row_id)) {
                const queryRun = await professionalsM.findOne({ _id: request_row_id })
                if (queryRun) {

                    const checkApprovalQuery = await professionalsM.findOne({ _id: request_row_id, approval_status: 0 })
                    if (checkApprovalQuery) {
                        const updateArray = {
                            approval_status: 2,
                            reason_rejected: req.body.reason_rejected,
                            rejected_date_n_time: getPresentDateTime()
                        }
                        const pass_email_id = checkApprovalQuery.email_id
                        const pass_full_name = checkApprovalQuery.full_name
                        const pass_subject = "CoinPedia User Profile Request Denied "
                        const pass_message = `
                                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${pass_full_name},</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your CoinPedia user account application has been denied.</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${req.body.reason_rejected}</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;">Your interest is appreciated, and we invite you to <a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Register<a> to CoinPedia for more information!</p>
                                    `

                        await sendEmail(pass_email_id, pass_subject, pass_message)

                        await professionalsM.updateOne({ _id: request_row_id }, { $set: updateArray })

                        await updateNotification({
                            user_row_id: request_row_id,
                            notify_type: 1,
                            notify_type_row_id: 0,
                            message_row_id: 5,
                            action_row_id: request_row_id
                        })



                        res.json({ status: true, message: { alert_message: 'user rejected successfully' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, this user cannot be rejected' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, invalid request row id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Reject user request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.buildPendingListInfoWorkPipeline = buildPendingListInfoWorkPipeline

module.exports = router