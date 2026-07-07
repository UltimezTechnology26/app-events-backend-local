const express = require('express')
const router = express.Router()
const { checkAdminLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
const professionals_feedbackM = require('../../../models/app/professionals_feedbackM')
const report_issues_user_detailsM = require('../../../models/report_issues_user_detailsM')
const { getPresentDateTime, createDateTime, getMinusDates, yesterDayStartNEndDate, getPresentDateOnly } = require('../../../utils/helpers/helper')

router.get('/users_feedback_list/:skip/:limit', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = { $or: [{ email_id: { '$regex': req.query.search, $options: 'i' } }, { full_name: { '$regex': req.query.search, $options: 'i' } }] }
            }

            const queryRun = await professionals_feedbackM.aggregate([
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
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        email_id: 1,
                        feedback_type: 1,
                        date_n_time: 1,
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        user_email_id: "$user_info.email_id"
                    }
                }
            ]).skip(skip).limit(limit)


            const queryCount = await professionals_feedbackM.aggregate([
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
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (queryCount[0]) {
                total_counts = queryCount[0].count
            }


            res.json({ status: true, message: queryRun, queryCount: total_counts })
        }
        catch (err) {
            console.log('User Feedback list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/individual_details/:feedback_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            const feedback_row_id = Number.parseInt(req.params.feedback_row_id)

            const queryRun = await professionals_feedbackM.aggregate([
                { $match: { _id: feedback_row_id } },
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
                    $project: {
                        _id: 1,
                        website_rating: 1,
                        speed_rating: 1,
                        user_row_id: 1,
                        email_id: 1,
                        feedback_type: 1,
                        date_n_time: 1,
                        message: 1,
                        full_name: "$user_info.full_name",
                        user_email_id: "$user_info.email_id"
                    }
                }
            ])

            const resultArr = {}
            if (queryRun[0]) {
                resultArr['_id'] = queryRun[0]._id
                resultArr['website_rating'] = queryRun[0].website_rating
                resultArr['speed_rating'] = queryRun[0].speed_rating
                resultArr['user_row_id'] = queryRun[0].user_row_id
                resultArr['email_id'] = queryRun[0].email_id
                resultArr['feedback_type'] = queryRun[0].feedback_type
                resultArr['date_n_time'] = queryRun[0].date_n_time
                resultArr['message'] = queryRun[0].message
                resultArr['full_name'] = queryRun[0].full_name
                resultArr['user_email_id'] = queryRun[0].user_email_id

            }

            res.json({ status: true, message: resultArr })
        }
        catch (err) {
            console.log('Individual feedback details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get("/report_users_issues_list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])


        const skip = !Number.isNaN(Number.parseInt(req.params.skip))
            ? Number.parseInt(req.params.skip)
            : 0

        const limit = !Number.isNaN(Number.parseInt(req.params.limit))
            ? Number.parseInt(req.params.limit)
            : 20

        const { module_type, search, approved_by_row_id, approved_by_type, start_date,
            end_date } = req.query

        let matchQuery = {}

        if (!Number.isNaN(Number.parseInt(module_type))) {
            matchQuery.module_type = Number.parseInt(module_type)
        }

        if (!Number.isNaN(Number.parseInt(approved_by_type))) {
            matchQuery.approved_by = Number.parseInt(approved_by_type)

            if (
                Number.parseInt(approved_by_type) === 2 &&
                !Number.isNaN(Number.parseInt(approved_by_row_id))
            ) {
                matchQuery.approved_row_id = Number.parseInt(approved_by_row_id)
            }
        }
        if (start_date) {
            const start = new Date(start_date)
            start.setHours(0, 0, 0, 0)

            const end = new Date(start_date)
            end.setHours(23, 59, 59, 999)

            matchQuery.requested_on = {
                $gte: start,
                $lte: end
            }
        }
        if (start_date || end_date) {
            matchQuery.requested_on = {}
        }

        if (start_date) {
            const startDate = createDateTime(start_date)
            matchQuery.requested_on.$gte = new Date(startDate)
        }

        if (end_date) {
            const endDate = createDateTime(end_date)
            matchQuery.requested_on.$lte = new Date(endDate)
        }


        const pipeline = [
            { $match: matchQuery },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "module_row_id",
                    foreignField: "_id",
                    as: "company_info",
                },
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                },
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "module_row_id",
                    foreignField: "_id",
                    as: "professional_info",
                },
            },
            { $unwind: { path: "$professional_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_profile_images",
                    localField: "module_row_id",
                    foreignField: "_id",
                    as: "userImage"
                }
            },
            { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_markets_tokens",
                    let: { moduleRowId: "$module_row_id", moduleType: "$module_type" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$moduleType", 3] },
                                        { $eq: ["$_id", "$$moduleRowId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                token_name: 1,
                                symbol: 1,
                                token_id: 1
                            }
                        }
                    ],
                    as: "token_info"
                }
            },
            { $unwind: { path: "$token_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_exchanges",
                    let: { moduleRowId: "$module_row_id", moduleType: "$module_type" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$moduleType", 4] },
                                        { $eq: ["$_id", "$$moduleRowId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                exchange_name: 1,
                                exchange_slug: 1,
                                // token_id: 1
                            }
                        }
                    ],
                    as: "exchange_info"
                }
            },
            { $unwind: { path: "$exchange_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_chains",
                    let: { moduleRowId: "$module_row_id", moduleType: "$module_type" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$moduleType", 5] },
                                        { $eq: ["$_id", "$$moduleRowId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                chain_name: 1,
                                chain_slug: 1,
                                // token_id: 1
                            }
                        }
                    ],
                    as: "chain_info"
                }
            },
            { $unwind: { path: "$chain_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "approved_row_id",
                    foreignField: "_id",
                    as: "sub_admin_info"
                }
            },
            { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },


            {
                $lookup: {
                    from: "cln_static_report_issue",
                    let: {
                        tabKey: "$tab_key",
                        subTabKey: "$sub_tab_key",
                        optionId: "$option_id",
                        moduleType: "$module_type",
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$module_type", "$$moduleType"] },
                                        { $eq: ["$tab_key", "$$tabKey"] },
                                        {
                                            $cond: [
                                                { $ifNull: ["$$subTabKey", false] },
                                                { $eq: ["$sub_tab_key", "$$subTabKey"] },
                                                true,
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                        { $unwind: "$report_issues" },
                        {
                            $match: {
                                $expr: { $eq: ["$report_issues._id", "$$optionId"] },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                option_id: "$report_issues._id",
                                option_name: "$report_issues.option",
                            },
                        },
                    ],
                    as: "issue_option_info",
                },
            },
            { $unwind: { path: "$issue_option_info", preserveNullAndEmptyArrays: true } },
        ]

        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { "company_info.company_name": { $regex: search, $options: "i" } },
                        { "token_info.token_name": { $regex: search, $options: "i" } },
                        { "exchange_info.exchange_name": { $regex: search, $options: "i" } },
                        { "chain_info.chain_name": { $regex: search, $options: "i" } },
                        { "user_info.full_name": { $regex: search, $onameptions: "i" } },
                        { "user_info.user_name": { $regex: search, $options: "i" } },
                        { "user_info.email_id": { $regex: search, $options: "i" } },
                        { "issue_option_info.option_name": { $regex: search, $options: "i" } },
                    ],
                },
            })
        }

        pipeline.push(
            {
                $project: {
                    _id: 1,
                    requested_on: 1,
                    approved_status: 1,
                    approved_by: 1,
                    approved_date_n_time: 1,
                    approved_row_id: 1,
                    profile_image: "$userImage.profile_image",
                    approved_name: {
                        $cond: [
                            { $eq: ["$approved_by", 1] },
                            "Admin",
                            "$sub_admin_info.full_name",
                        ],
                    },
                    company_name: "$company_info.company_name",
                    company_logo: "$company_info.company_logo",
                    company_id: "$company_info.company_id",
                    user_name: {
                        $cond: [
                            { $ifNull: ["$user_info.full_name", false] },
                            "$user_info.full_name",
                            "$user_info.user_name",
                        ],
                    },
                    professional_name: "$professional_info.user_name",
                    professional_full_name: "$professional_info.full_name",
                    option_name: "$issue_option_info.option_name",
                    description: 1,
                    tab_name: 1,
                    tab_key: 1,
                    module_type: 1,
                    token_name: "$token_info.token_name",
                    token_id: "$token_id",
                    exchange_name: "$exchange_info.exchange_name",
                    exchange_slug: "$exchange_info.exchange_slug",
                    chain_name: "$chain_info.chain_name",
                    chain_slug: "$chain_info.chain_slug",
                    issue_rejected_reason: 1
                },
            },
            { $sort: { requested_on: -1 } },
            { $skip: skip },
            { $limit: limit }
        )

        const list = await report_issues_user_detailsM.aggregate(pipeline)

        const countPipeline = [...pipeline]
        countPipeline.splice(countPipeline.length - 3)
        countPipeline.push({ $count: "total" })

        const countResult = await report_issues_user_detailsM.aggregate(countPipeline)
        const count = countResult[0]?.total || 0

        return res.json({
            status: true,
            message: list,
            count,
            checkToken: checkToken
        })

    }
    catch (err) {
        console.error("Issues list error:", err)
        return res.json({
            status: false,
            message: err.message,
        })
    }
})

router.get('/individual_report_details/:issue_row_id', async (req, res) => {
    try {
        const issue_row_id = Number.parseInt(req.params.issue_row_id)

        const result = await report_issues_user_detailsM.aggregate([
            { $match: { _id: issue_row_id } },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                },
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "module_row_id",
                    foreignField: "_id",
                    as: "company_info",
                },
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "module_row_id",
                    foreignField: "_id",
                    as: "professional_info",
                },
            },
            { $unwind: { path: "$professional_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_static_report_issue",
                    let: {
                        tabKey: "$tab_key",
                        subTabKey: "$sub_tab_key",
                        optionId: "$option_id",
                        moduleType: "$module_type",
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$module_type", "$$moduleType"] },
                                        { $eq: ["$tab_key", "$$tabKey"] },
                                        {
                                            $cond: [
                                                { $ifNull: ["$$subTabKey", false] },
                                                { $eq: ["$sub_tab_key", "$$subTabKey"] },
                                                true,
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                        { $unwind: "$report_issues" },
                        {
                            $match: {
                                $expr: { $eq: ["$report_issues._id", "$$optionId"] },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                option_id: "$report_issues._id",
                                option_name: "$report_issues.option",
                            },
                        },
                    ],
                    as: "issue_option_info",
                },
            },
            { $unwind: { path: "$issue_option_info", preserveNullAndEmptyArrays: true } },



            {
                $project: {
                    _id: 1,
                    user_row_id: 1,
                    full_name: "$user_info.full_name",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    user_status: "$user_info.login_status",
                    professional_info: "$professional_info",
                    login_status: "$user_info.login_status",
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_email: "$company_info.company_email_id",
                    professional_name: "$professional_info.user_name",

                    tab_key: 1,
                    tab_name: 1,
                    sub_tab_key: 1,
                    option_name: "$issue_option_info.option_name",
                    description: 1,
                    module_type: 1,
                    approved_status: 1,
                    approved_by: 1,
                    approved_row_id: 1,
                    approved_date_n_time: 1,
                    requested_on: 1,
                },
            },
        ])

        if (!result.length) {
            return res.json({
                status: false,
                message: "Report not found",
            })
        }

        return res.json({
            status: true,
            message: result[0],
        })
    } catch (err) {
        console.log("Individual issue details error:", err.message)
        return res.json({
            status: false,
            message: "An unexpected error occurred. Please try again later.",
        })
    }
})

router.get("/approved_by_filter_list", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (!checkToken.status) {
            return res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

        const subAdmins = await report_issues_user_detailsM.aggregate([
            { $match: { approved_by: 2, approved_row_id: { $ne: null } } },

            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "approved_row_id",
                    foreignField: "_id",
                    as: "sub_admin_info"
                }
            },
            { $unwind: "$sub_admin_info" },

            {
                $group: {
                    _id: "$approved_row_id",
                    full_name: { $first: "$sub_admin_info.full_name" }
                }
            },

            {
                $project: {
                    _id: 0,
                    value: "$_id",
                    label: "$full_name",
                    approved_by: 2
                }
            }
        ])

        const response = [
            { value: "admin", label: "Admin", approved_by: 1 },
            ...subAdmins
        ]

        return res.json({
            status: true,
            message: response
        })

    } catch (err) {
        console.error("Approved by filter list error:", err)
        return res.json({
            status: false,
            message: { alert_message: "Something went wrong" }
        })
    }
})

router.post('/approve_reject_issue', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])

        if (!checkToken.status) {
            return res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

        const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)
        const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)

        const issue_row_id = Number(req.body.issue_row_id)
        const approved_status = Number(req.body.approved_status)
        const rejected_reason = req.body.rejected_reason || null

        if (Number.isNaN(issue_row_id) || ![1, 2].includes(approved_status)) {
            return res.json({
                status: false,
                message: { alert_message: "Invalid request data." }
            })
        }

        if (![1, 2].includes(admin_manager_type) || Number.isNaN(admin_row_id)) {
            return res.json({
                status: false,
                message: { alert_message: "Invalid admin session." }
            })
        }

        if (approved_status === 2 && (!rejected_reason || rejected_reason.length < 5)) {
            return res.json({
                status: false,
                message: { alert_message: "Reject reason is required (min 5 characters)." }
            })
        }

        const issueData = await report_issues_user_detailsM.findOne(
            { _id: issue_row_id },
            { approved_status: 1 }
        )

        if (!issueData) {
            return res.json({
                status: false,
                message: { alert_message: "Invalid issue record." }
            })
        }

        if (issueData.approved_status !== 0) {
            return res.json({
                status: false,
                message: { alert_message: "Issue already processed." }
            })
        }

        await report_issues_user_detailsM.updateOne(
            { _id: issue_row_id },
            {
                $set: {
                    approved_status,
                    approved_by: admin_manager_type,   // 1=admin, 2=sub-admin
                    approved_row_id: admin_row_id,
                    issue_rejected_reason: approved_status === 2 ? rejected_reason : null,
                    approved_date_n_time: getPresentDateTime()
                }
            }
        )

        return res.json({
            status: true,
            message: {
                alert_message:
                    approved_status === 1
                        ? "Issue approved successfully."
                        : "Issue rejected successfully."
            }
        })

    } catch (err) {
        console.error("Approve/reject issue error:", err)
        return res.json({
            status: false,
            message: { alert_message: "An unexpected error occurred. Please try again later." }
        })
    }
})

router.get('/report_issues_overview_counts', async (req, res) => {
    try {
        const today_date = getPresentDateOnly()
        const { start_date, end_date } = yesterDayStartNEndDate(1)
        const week_date = getMinusDates(7)
        const one_month_date = getMinusDates(30)

        /* ================= TOTAL REQUESTS ================= */
        const today_requests_query = report_issues_user_detailsM.countDocuments({
            requested_on: { $gte: new Date(today_date) }
        })

        const yesterday_requests_query = report_issues_user_detailsM.countDocuments({
            requested_on: {
                $gte: new Date(start_date),
                $lte: new Date(end_date)
            }
        })

        const week_requests_query = report_issues_user_detailsM.countDocuments({
            requested_on: { $gte: new Date(week_date) }
        })

        const month_requests_query = report_issues_user_detailsM.countDocuments({
            requested_on: { $gte: new Date(one_month_date) }
        })

        /* ================= STATUS COUNTS ================= */
        const pending_query = report_issues_user_detailsM.countDocuments({
            approved_status: 0
        })

        const approved_query = report_issues_user_detailsM.countDocuments({
            approved_status: 1
        })

        const rejected_query = report_issues_user_detailsM.countDocuments({
            approved_status: 2
        })

        const [
            today_requests,
            yesterday_requests,
            week_requests,
            month_requests,
            pending,
            approved,
            rejected
        ] = await Promise.all([
            today_requests_query,
            yesterday_requests_query,
            week_requests_query,
            month_requests_query,
            pending_query,
            approved_query,
            rejected_query
        ])

        let result = {}

        result['total_requests'] = {
            today: today_requests,
            yesterday: yesterday_requests,
            last_7_days: week_requests,
            last_30_days: month_requests
        }

        result['request_status'] = {
            pending,
            approved,
            rejected
        }

        return res.json({
            status: true,
            message: result
        })
    }
    catch (err) {
        console.log('Issue overview error:', err.message)
        return res.json({
            status: false,
            message: err.message
        })
    }
})


module.exports = router