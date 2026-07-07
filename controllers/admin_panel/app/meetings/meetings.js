const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator');
const { checkAdminLoginToken, checkAllLoginToken } = require('../../../../middleware/authorization');
const { arrangeValidation } = require('../../../../utils/helpers/helper');
const meetingM = require('../../../../models/app/meetings/meetingM');
const { deleteKeysByPattern } = require('../../../../config/cache_helper');


router.get("/journalist_interview/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;

        if (checkToken.status) {
            const { search, status, start_date, end_date } = req.query;

            let filter = { meeting_type: "journalist_interview" };


            // ✅ status filter
            if (status && ["scheduled", "pending", "rejected"].includes(status)) {
                filter.status = status;
            }

            // ✅ date filter (meeting_datetime between start and end)
            if (start_date || end_date) {
                filter.meeting_datetime = {};
                if (start_date) {
                    filter.meeting_datetime.$gte = new Date(start_date);
                }
                if (end_date) {
                    // make end_date inclusive till end of day
                    const end = new Date(end_date);
                    end.setHours(23, 59, 59, 999);
                    filter.meeting_datetime.$lte = end;
                }
            }

            // ✅ total count for pagination

            const meetingDetails = await meetingM.aggregate([
                { $match: filter },

                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                ...(search
                    ? [
                        {
                            $match: {
                                $or: [
                                    { meeting_title: { $regex: search, $options: "i" } },
                                    { "user_info.full_name": { $regex: search, $options: "i" } },
                                ],
                            },
                        },
                    ]
                    : []),

                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "user_profile"
                    }
                },
                { $unwind: { path: "$user_profile", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "status_update_by",
                        foreignField: "_id",
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                { $sort: { meeting_datetime: 1 } },
                { $skip: skip },
                { $limit: limit },

                {
                    $project: {
                        meeting_type: 1,
                        meeting_title: 1,
                        meeting_datetime: 1,
                        meeting_timezone: 1,
                        meeting_link: 1,
                        status: 1,
                        job_role: 1,
                        upload_document: 1,
                        user_row_id: 1,
                        company_row_id: 1,
                        rejected_comment: 1,
                        rescheduled_by: 1,
                        rescheduled_count: 1,
                        status_update_by: 1,
                        status_update_date: 1,
                        status_update_admin_user_type: 1,
                        sub_admin_name: "$sub_admin_info.full_name",
                        created_on: "$createdAt",
                        // main user info
                        user_name: "$user_info.full_name",
                        user_profile_image: "$user_profile.profile_image",
                        email_id: "$user_info.email_id",
                        mobile_number: "$user_info.mobile_number",
                        country_mobile_id: "$user_info.country_mobile_id",
                        approval_status: "$user_info.login_status",
                        pro_batch: "$user_info.pro_batch",

                    }
                }
            ]);
            const countPipeline = [
                { $match: filter },

                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                    },
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                // ✅ apply search filter here also
                ...(search
                    ? [
                        {
                            $match: {
                                $or: [
                                    { meeting_title: { $regex: search, $options: "i" } },
                                    { "user_info.full_name": { $regex: search, $options: "i" } },
                                ],
                            },
                        },
                    ]
                    : []),

                { $count: "total" },
            ];

            const countResult = await meetingM.aggregate(countPipeline);
            const total_count = countResult.length > 0 ? countResult[0].total : 0;

            res.json({ status: true, data: meetingDetails, count: total_count });
        } else {
            res.json({ status: false, message: checkToken?.message });
        }
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching Meetings." });
    }
});

router.get("/journalist_overview", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);

        if (!checkToken.status) {
            return res.json(checkToken);
        }

        // base filter
        let baseFilter = { meeting_type: "journalist_interview" };

        // get today's date boundaries
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // yesterday
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);
        const yesterdayEnd = new Date(todayEnd);
        yesterdayEnd.setDate(todayEnd.getDate() - 1);

        // last 7 days (excluding today)
        const lastWeekStart = new Date(todayStart);
        lastWeekStart.setDate(todayStart.getDate() - 7);

        // last 30 days (excluding today)
        const lastMonthStart = new Date(todayStart);
        lastMonthStart.setDate(todayStart.getDate() - 30);

        // aggregation
        const [result] = await meetingM.aggregate([
            { $match: baseFilter },
            {
                $facet: {
                    today: [
                        { $match: { meeting_datetime: { $gte: todayStart, $lte: todayEnd } } },
                        { $count: "count" }
                    ],
                    yesterday: [
                        { $match: { meeting_datetime: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
                        { $count: "count" }
                    ],
                    last_week: [
                        { $match: { meeting_datetime: { $gte: lastWeekStart, $lt: todayStart } } },
                        { $count: "count" }
                    ],
                    last_month: [
                        { $match: { meeting_datetime: { $gte: lastMonthStart, $lt: todayStart } } },
                        { $count: "count" }
                    ]
                }
            },
            {
                $project: {
                    today: { $ifNull: [{ $arrayElemAt: ["$today.count", 0] }, 0] },
                    yesterday: { $ifNull: [{ $arrayElemAt: ["$yesterday.count", 0] }, 0] },
                    last_week: { $ifNull: [{ $arrayElemAt: ["$last_week.count", 0] }, 0] },
                    last_month: { $ifNull: [{ $arrayElemAt: ["$last_month.count", 0] }, 0] }
                }
            }
        ]);

        res.json({ status: true, data: result || {} });

    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching journalist interview stats." });
    }
});




router.get("/list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);

        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }
        const { search, start_date, end_date } = req.query;

        const meetingType = req.query.meeting_type ? req.query.meeting_type.toLowerCase() : null;

        let statusFilter = {};

        if (search) {
            statusFilter.$or = [
                { meeting_title: { $regex: search, $options: "i" } },
                { job_role: { $regex: search, $options: "i" } },
                { "user_info.full_name": { $regex: search, $options: "i" } } // optional
            ];
        }
        if (start_date || end_date) {
            statusFilter.meeting_datetime = {};
            if (start_date) {
                statusFilter.meeting_datetime.$gte = new Date(start_date);
            }
            if (end_date) {
                // make end_date inclusive till end of day
                const end = new Date(end_date);
                end.setHours(23, 59, 59, 999);
                statusFilter.meeting_datetime.$lte = end;
            }
        }

        if (meetingType) {
            statusFilter.meeting_type = meetingType;
        } else {
            statusFilter.meeting_type = { $in: ["1on1", "business_meeting", "job_interview"] };
        }
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;

        const meetingDetails = await meetingM.aggregate([
            { $match: statusFilter },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_details"
                }
            },
            {
                $unwind: {
                    path: "$company_details",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "user_profile"
                }
            },
            { $unwind: { path: "$user_profile", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "requested_user_row_id",
                    foreignField: "_id",
                    as: "requested_users"
                }
            },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "requested_user_row_id",
                    foreignField: "user_row_id",
                    as: "requested_user_profiles"
                }
            },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "requested_company_row_id",
                    foreignField: "_id",
                    as: "requested_companies"
                }
            },
            {
                $lookup:
                {
                    from: "cln_sub_admins",
                    localField: "status_update_by",
                    foreignField: "_id",
                    as: "sub_admin_info"
                }
            },
            { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },

            { $sort: { meeting_datetime: 1 } },
            { $skip: skip },
            { $limit: limit },

            // ✅ Final projection
            {
                $project: {
                    meeting_type: 1,
                    meeting_title: 1,
                    meeting_datetime: 1,
                    meeting_timezone: 1,
                    meeting_link: 1,
                    status: 1,
                    job_role: 1,
                    upload_document: 1,
                    user_row_id: 1,
                    company_row_id: 1,
                    rejected_comment: 1,
                    rescheduled_by: 1,
                    rescheduled_count: 1,
                    status_update_by: 1,
                    status_update_date: 1,
                    status_update_admin_user_type: 1, //0: user created 1: admin created, 2:sub admin
                    sub_admin_name: "$sub_admin_info.full_name",
                    created_on: "$createdAt",

                    // main user info
                    user_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    mobile_number: "$user_info.mobile_number",
                    country_mobile_id: "$user_info.country_mobile_id",
                    approval_status: "$user_info.login_status",
                    pro_batch: "$user_info.pro_batch",
                    user_profile_image: "$user_profile.profile_image",
                    requested_users: {
                        $map: {
                            input: "$requested_users",
                            as: "ru",
                            in: {
                                name: "$$ru.full_name",
                                id: "$$ru._id",
                                // join profile by matching
                                profile_image: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$requested_user_profiles",
                                                        as: "rup",
                                                        cond: { $eq: ["$$rup.user_row_id", "$$ru._id"] }
                                                    }
                                                },
                                                as: "match",
                                                in: "$$match.profile_image"
                                            }
                                        },
                                        0
                                    ]
                                }
                            }
                        }
                    },

                    requested_companies: {
                        $map: {
                            input: "$requested_companies",
                            as: "rc",
                            in: {
                                id: "$$rc._id",
                                name: "$$rc.company_name",
                                logo: "$$rc.company_logo"
                            }
                        }
                    },
                    company_name: "$company_details.company_name",
                    company_logo: "$company_details.company_logo"
                }
            }
        ]);


        const countQueryAgg = await meetingM.aggregate([
            { $match: statusFilter },
            { $count: "total" }
        ]);

        const countQuery = countQueryAgg.length ? countQueryAgg[0].total : 0;

        if (!meetingDetails.length) {
            return res.json({ status: false, data: [], message: "No interview meetings found." });
        }

        return res.json({
            status: true,
            message: "Job interview details fetched successfully!",
            data: meetingDetails,
            count: countQuery
        });

    } catch (error) {
        console.error(error);
        return res.json({
            status: false,
            message: "Server error while fetching job interview meetings.",
            alert_message: error?.message,
        });
    }
});


router.post(
    "/status/:meeting_id",
    [
        check("status")
            .trim()
            .isIn(["scheduled", "rejected", "rescheduled"])
            .withMessage("Invalid meeting status."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        try {
            // ✅ Check token
            const checkToken = checkAdminLoginToken(req.headers, [13]);


            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type) // 1 = admin 2 = subadmin
            let admin_row_id = 0
            if (admin_manager_type === 2) {
                admin_row_id = checkToken.message.admin_row_id
            }



            const meeting_id = Number.parseInt(req.params.meeting_id)
                ? Number.parseInt(req.params.meeting_id)
                : null;

            if (!meeting_id) {
                return res.json({ status: false, message: "Meeting ID is required." });
            }

            const meetingDoc = await meetingM.findOne({ _id: meeting_id });
            if (!meetingDoc) {
                return res.json({ status: false, message: "Meeting not found." });
            }

            if (!["journalist_interview"].includes(meetingDoc.meeting_type)) {
                return res.json({
                    status: false,
                    message: "This meeting type cannot be rescheduled."
                });
            }


            // ✅ Conditional validation
            if (req.body.status === "rejected") {
                if (!req.body.rejected_comment?.trim()) {
                    return res.json({
                        status: false,
                        message: "Rejected comment is required when rejecting a meeting."
                    });
                }
            }

            if (req.body.status === "rescheduled") {
                // Check required fields
                if (!req.body.meeting_timezone || !req.body.meeting_datetime) {
                    return res.json({
                        status: false,
                        message: "Meeting timezone and datetime are required when rescheduling."
                    });
                }



                // Max 3 reschedules allowed
                const currentRescheduledCount = Number.parseInt(meetingDoc.rescheduled_count || "0");
                if (currentRescheduledCount >= 3) {
                    return res.json({
                        status: false,
                        message: "Reschedule meeting limit exceeded."
                    });
                }
            }

            let updateFields = {
                status: req.body.status,
                status_update_admin_user_type: admin_manager_type,
                status_update_by: admin_row_id,
                status_update_date: new Date().toISOString()
            };

            if (req.body.status === "scheduled") {
                updateFields.meeting_link = req.body.meeting_link;
            }

            if (req.body.status === "rejected") {
                updateFields.rejected_comment = req.body.rejected_comment;
            }

            if (req.body.status === "rescheduled") {
                updateFields.meeting_timezone = req.body.meeting_timezone;
                updateFields.meeting_datetime = new Date(req.body.meeting_datetime);
                updateFields.rescheduled_count = (Number.parseInt(meetingDoc.rescheduled_count || "0") + 1).toString();
                updateFields.rescheduled_by = 0
                updateFields.status = "pending";

            }

            // ✅ Update meeting status
            await meetingM.updateOne(
                { _id: meeting_id },
                { $set: updateFields }
            );
            await deleteKeysByPattern('interview_list_*')
            return res.json({
                status: true,
                message: "Meeting status updated successfully!",
            });
        } catch (error) {
            console.error(error);
            return res.json({
                status: false,
                message: "Server error while updating meeting status.",
                alert_message: error?.message,
            });
        }
    }
);



module.exports = router