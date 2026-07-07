const express = require('express')
const { check, validationResult } = require('express-validator');
const sanitize = require('mongo-sanitize')
const { arrangeValidation, uploadDocumentFunc } = require('../../../utils/helpers/helper');
const { checkAllLoginToken, checkUserLoginToken } = require('../../../middleware/authorization');
const meetingM = require('../../../models/app/meetings/meetingM');
const job_applied_listM = require('../../../models/app/jobs/job_applied_listM');
const professionalsM = require('../../../models/app/professionalsM');
const { sendJobScheduledEmail, sendJournalistInterviewEmail, sendMeetingRequestEmail, sendConfirmedMeetingEmail } = require('../../../utils/helpers/app_helper');
const companyM = require('../../../models/app/company/companyM');
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper');
const { getMeetingList } = require('../../../services/main/meetings');
const router = express.Router()

router.post(
    "/schedule_job_interview/:applicant_id",
    [
        check("job_role").trim().not().isEmpty().withMessage("Job Role is required."),
        check("company_row_id")
            .customSanitizer((val) => String(val))
            .trim()
            .not().isEmpty().withMessage("Company row id is required.")
            .isInt({ min: 1 }).withMessage("Company row id must be a valid number."),
        check("meeting_datetime").not().isEmpty().withMessage("Meeting datetime is required."),
        check("meeting_timezone").not().isEmpty().withMessage("Meeting timezone is required."),
        check("meeting_link").trim().not().isEmpty().withMessage("Meeting link is required."),
        check("upload_document").optional().isString().withMessage("Upload document must be a string."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);



        try {
            const checkToken = await checkAllLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            let user_row_id
            if (checkToken.message.user_type == 1) {
                user_row_id = Number.parseInt(checkToken.message.user_row_id)
            } else {
                user_row_id = Number.parseInt(req.query.user_row_id) ? Number.parseInt(req.query.user_row_id) : 0;
            }

            const applicant_id = Number.parseInt(req.params.applicant_id) ? Number.parseInt(req.params.applicant_id) : null;
            const applicationDetails = await job_applied_listM.findOne({
                _id: applicant_id,
                status: "approved"
            });
            let company_row_id = Number.parseInt(req.body.company_row_id) ? Number.parseInt(req.body.company_row_id) : 0;

            if (!applicationDetails) {
                return res.json({ status: false, message: "Failed to schedule meet" });
            }

            if (!company_row_id) {
                return res.json({ status: false, message: "Failed to schedule meet" });
            }
            let upload_document = null;
            if (req.body.upload_document) {
                const uploaded_document = await uploadDocumentFunc(req.body.upload_document, 3);
                if (uploaded_document.status) {
                    upload_document = uploaded_document.path;
                } else {
                    return res.json({ status: false, message: "Document upload failed" });
                }
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }
            const meeting_datetime = req.body.meeting_datetime;
            const meeting_timezone = req.body.meeting_timezone;

            const utcDate = new Date(`${meeting_datetime}${meeting_timezone}`);
            if (Number.isNaN(utcDate.getTime())) {
                return res.json({ status: false, message: "Invalid meeting datetime or timezone" });
            }
            // ✅ Prepare payload
            const meetingPayload = {
                meeting_type: "job_interview",
                requested_user_row_id: [applicationDetails?.user_row_id],
                company_row_id: company_row_id,
                user_row_id: user_row_id,
                rescheduled_by: company_row_id,
                job_title: sanitize(req.body.job_role),
                job_role: sanitize(req.body.job_role),
                upload_document: upload_document,
                meeting_title: req.body.job_role,
                meeting_datetime: utcDate,
                meeting_timezone: meeting_timezone,
                meeting_link: req.body.meeting_link,
                status: "pending",
            };

            // ✅ Save meeting
            const newMeeting = new meetingM(meetingPayload);
            await newMeeting.save();

            await job_applied_listM.updateOne(
                { _id: applicant_id },
                { $set: { status: "scheduled" } }
            );
            await deleteKeysByPattern('interview_list_*')
            const user = await professionalsM.findOne({ _id: applicationDetails?.user_row_id }, { full_name: 1, email_id: 1 })
            const company = await companyM.findOne({ _id: company_row_id }, { company_name: 1, company_email_id: 1 })

            await sendJobScheduledEmail({ full_name: user?.full_name, email_id: user?.email_id }, {
                resume: 'https://image.coinpedia.org/' + applicationDetails?.resume,
                meeting_datetime: utcDate,
                meeting_link: req.body.meeting_link,
                company_name: company?.company_name
            })

            return res.json({
                status: true,
                message: "Job Interview Meeting created successfully!",
            });
        } catch (error) {
            console.error(error);
            return res.json({
                status: false,
                message: "Server error while creating job interview meeting.",
                alert_message: error?.message,
            });
        }
    }
);


router.post(
    "/schedule_1on1_meeting",
    [
        check("meeting_datetime").not().isEmpty().withMessage("Meeting datetime is required."),
        check("meeting_title").not().isEmpty().withMessage("Meeting Title is required."),
        check("meeting_timezone").not().isEmpty().withMessage("Meeting timezone is required."),
        check("meeting_link").trim().not().isEmpty().withMessage("Meeting link is required."),
        check("professional_id").trim().not().isEmpty().withMessage("Professional Id is required."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);



        try {
            const checkToken = await checkAllLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            let user_row_id
            if (checkToken.message.user_type == 1) {
                user_row_id = Number.parseInt(checkToken.message.user_row_id)
            } else {
                user_row_id = Number.parseInt(req.query.user_row_id) ? Number.parseInt(req.query.user_row_id) : 0;
            }

            if (!user_row_id) {
                return res.json({ status: false, message: "Failed to schedule meet" });
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }
            const meeting_datetime = req.body.meeting_datetime;
            const meeting_timezone = req.body.meeting_timezone;

            const utcDate = new Date(`${meeting_datetime}${meeting_timezone}`);
            if (Number.isNaN(utcDate.getTime())) {
                return res.json({ status: false, message: "Invalid meeting datetime or timezone" });
            }

            // ✅ Prepare payload
            const meetingPayload = {
                meeting_type: "1on1",
                requested_user_row_id: [Number.parseInt(req.body.professional_id)],
                user_row_id: user_row_id,
                rescheduled_by: user_row_id,
                meeting_title: req.body.meeting_title,
                meeting_datetime: utcDate,
                meeting_timezone: meeting_timezone,
                meeting_link: req.body.meeting_link,
                status: "pending",
            };

            // ✅ Save meeting
            const newMeeting = new meetingM(meetingPayload);
            await newMeeting.save();
            await deleteKeysByPattern('interview_list_*')
            const user = await professionalsM.findOne({ _id: req.body.professional_id }, { full_name: 1, email_id: 1 })
            const requested_user = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1, email_id: 1 })

            await sendMeetingRequestEmail({ full_name: user?.full_name, email_id: user?.email_id },
                {
                    meeting_title: req.body.meeting_title,
                    meeting_datetime: utcDate
                },
                "1:1",
                requested_user?.full_name
            )

            return res.json({
                status: true,
                message: "Job Interview Meeting created successfully!",
            });
        } catch (error) {
            console.error(error);
            return res.json({
                status: false,
                message: "Server error while creating job interview meeting.",
                alert_message: error?.message,
            });
        }
    }
);

router.post(
    "/schedule_journalist_interview",
    [
        check("meeting_datetime").not().isEmpty().withMessage("Meeting datetime is required."),
        check("meeting_title").not().isEmpty().withMessage("Meeting Title is required."),
        check("meeting_timezone").not().isEmpty().withMessage("Meeting timezone is required."),
        check("meeting_link").trim().not().isEmpty().withMessage("Meeting link is required."),
        check("upload_document").optional().isString().withMessage("Upload document must be a string."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);



        try {
            const checkToken = await checkAllLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            let user_row_id
            if (checkToken.message.user_type == 1) {
                user_row_id = Number.parseInt(checkToken.message.user_row_id)
            } else {
                user_row_id = Number.parseInt(req.query.user_row_id) ? Number.parseInt(req.query.user_row_id) : 0;
            }

            if (!user_row_id) {
                return res.json({ status: false, message: "Failed to schedule meet", here: 'true' });
            }

            const followerCheck = await professionalsM.aggregate([
                { $match: { _id: user_row_id } },
                {
                    $lookup: {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        as: "followers_info",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "cln_professionals",
                                    localField: "follower_user_row_id",
                                    foreignField: "_id",
                                    as: "user_info",
                                    pipeline: [
                                        { $match: { login_status: 1 } },
                                        { $project: { _id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$user_info" } },
                            { $group: { _id: null, count: { $sum: 1 } } }
                        ]
                    }
                },
                {
                    $set: {
                        total_followers: {
                            $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0]
                        }
                    }
                }
            ]);

            const totalFollowers = followerCheck?.[0]?.total_followers || 0;
            if (totalFollowers < 5) {
                return res.json({
                    status: false,
                    message: "You must have at least 2000 followers to schedule a journalist interview.",
                    followers: totalFollowers
                });
            }

            let upload_document = null;
            if (req.body.upload_document) {
                const uploaded_document = await uploadDocumentFunc(req.body.upload_document, 3);
                if (uploaded_document.status) {
                    upload_document = uploaded_document.path;
                } else {
                    return res.json({ status: false, message: "Document upload failed" });
                }
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }
            const meeting_datetime = req.body.meeting_datetime;
            const meeting_timezone = req.body.meeting_timezone;

            const utcDate = new Date(`${meeting_datetime}${meeting_timezone}`);
            if (Number.isNaN(utcDate.getTime())) {
                return res.json({ status: false, message: "Invalid meeting datetime or timezone" });
            }

            // ✅ Prepare payload
            const meetingPayload = {
                meeting_type: "journalist_interview",
                user_row_id: user_row_id,
                upload_document: upload_document,
                rescheduled_by: user_row_id,
                meeting_title: req.body.meeting_title,
                meeting_datetime: utcDate,
                meeting_timezone: meeting_timezone,
                meeting_link: req.body.meeting_link,
                status: "pending",
            };

            // ✅ Save meeting
            const newMeeting = new meetingM(meetingPayload);
            await newMeeting.save();
            await deleteKeysByPattern('interview_list_*')
            const user = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1, email_id: 1 })
            await sendJournalistInterviewEmail({ full_name: user?.full_name, email_id: user?.email_id },
                {
                    meeting_title: req.body.meeting_title,
                    upload_document: upload_document,
                    meeting_datetime: utcDate
                }
            )

            return res.json({
                status: true,
                message: "Job Interview Meeting created successfully!",
            });
        } catch (error) {
            console.error(error);
            return res.json({
                status: false,
                message: "Server error while creating job interview meeting.",
                alert_message: error?.message,
            });
        }
    }
);

router.post(
    "/schedule_business_meeting",
    [
        check("meeting_datetime").not().isEmpty().withMessage("Meeting datetime is required."),
        check("meeting_title").not().isEmpty().withMessage("Meeting Title is required."),
        check("meeting_timezone").not().isEmpty().withMessage("Meeting timezone is required."),
        check("meeting_link").trim().not().isEmpty().withMessage("Meeting link is required.")
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        try {
            const checkToken = await checkAllLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }

            let user_row_id;
            if (checkToken.message.user_type == 1) {
                user_row_id = Number.parseInt(checkToken.message.user_row_id);
            } else {
                user_row_id = Number.parseInt(req.query.user_row_id) || 0;
            }
            const professional_ids = (req.body.professional_ids || []).map((id) => Number.parseInt(id));
            const company_ids = (req.body.company_ids || []).map((id) => Number.parseInt(id));
            if (
                (!professional_ids || professional_ids.length === 0) &&
                (!company_ids || company_ids.length === 0)
            ) {
                return res.json({ status: false, message: "At least one of professional or company must be provided." });
            }

            if (!user_row_id) {
                return res.json({ status: false, message: "Failed to schedule meet" });
            }


            let company_row_id = Number.parseInt(req.body.company_row_id) || 0;

            // normalize IDs into integer arrays

            // parse datetime safely
            const utcDate = new Date(`${req.body.meeting_datetime}${req.body.meeting_timezone}`);
            if (Number.isNaN(utcDate.getTime())) {
                return res.json({ status: false, message: "Invalid meeting datetime or timezone" });
            }

            // ✅ Prepare payload
            let meetingPayload = {
                meeting_type: "business_meeting",
                requested_company_row_id: company_ids,
                requested_user_row_id: professional_ids,
                meeting_title: req.body.meeting_title,
                meeting_datetime: utcDate,
                meeting_timezone: req.body.meeting_timezone,
                meeting_link: req.body.meeting_link,
                status: "scheduled",
            };

            if (company_row_id) {

                meetingPayload = {
                    ...meetingPayload,
                    company_row_id: company_row_id,
                };
            } else {
                meetingPayload = {
                    ...meetingPayload,
                    user_row_id: user_row_id,
                };
            }

            // ✅ Save meeting
            const newMeeting = new meetingM(meetingPayload);
            await newMeeting.save();
            await deleteKeysByPattern('interview_list_*')
            let requested_user;

            if (company_row_id) {
                const company = await companyM.findOne(
                    { _id: company_row_id },
                    { company_name: 1, company_email_id: 1 }
                );
                requested_user = company?.company_name;
            } else {
                const user = await professionalsM.findOne(
                    { _id: user_row_id },
                    { full_name: 1, email_id: 1 }
                );
                requested_user = user?.full_name;
            }

            // Loop through company_ids
            if (company_ids && company_ids.length > 0) {
                for (const item of company_ids) {
                    const company = await companyM.findOne(
                        { _id: item },
                        { company_name: 1, company_email_id: 1 }
                    );

                    await sendConfirmedMeetingEmail(
                        {
                            full_name: company?.company_name,
                            email_id: company?.company_email_id
                        },
                        {
                            meeting_title: req.body.meeting_title,
                            meeting_datetime: utcDate,
                            meeting_link: req.body.meeting_link
                        },
                        "Business",
                        requested_user
                    );
                }
            }

            // Loop through professional_ids
            if (professional_ids && professional_ids.length > 0) {
                for (const item of professional_ids) {
                    const professional = await professionalsM.findOne(
                        { _id: item },
                        { full_name: 1, email_id: 1 }
                    );

                    await sendConfirmedMeetingEmail(
                        {
                            full_name: professional?.full_name,
                            email_id: professional?.email_id
                        },
                        {
                            meeting_title: req.body.meeting_title,
                            meeting_datetime: utcDate,
                            meeting_link: req.body.meeting_link
                        },
                        "Business",
                        requested_user
                    );
                }
            }

            return res.json({
                status: true,
                message: "Business Meeting created successfully!",
            });
        } catch (error) {
            console.error(error);
            return res.json({
                status: false,
                message: "Server error while creating business meeting.",
                alert_message: error?.message,
            });
        }
    }
);


router.get("/list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = await checkAllLoginToken(req.headers, [13]);
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }

        let user_row_id;
        if (checkToken.message.user_type == 1) {
            user_row_id = Number.parseInt(checkToken.message.user_row_id);
        } else {
            user_row_id = Number.parseInt(req.query.user_row_id) ? Number.parseInt(req.query.user_row_id) : 0;
        }
        let company_row_id = Number.parseInt(req.query.company_row_id) ? Number.parseInt(req.query.company_row_id) : 0;

        const meetingList = await getMeetingList(req, company_row_id, user_row_id);
        return res.json(meetingList);

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
            const checkToken = await checkAllLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }

            const user_row_id = Number.parseInt(checkToken.message.user_row_id);


            const meeting_id = Number.parseInt(req.params.meeting_id)
                ? Number.parseInt(req.params.meeting_id)
                : null;

            if (!meeting_id) {
                return res.json({ status: false, message: "Meeting ID is required." });
            }

            const meetingDoc = await meetingM.findOne({ _id: meeting_id, meeting_type: { $in: ["journalist_interview", "1on1", "job_interview"] } });
            if (!meetingDoc) {
                return res.json({ status: false, message: "Meeting not found." });
            }
            if (req.body.status === "rescheduled") {
                if (!["1on1", "journalist_interview"].includes(meetingDoc.meeting_type)) {
                    return res.json({
                        status: false,
                        message: "This meeting type cannot be rescheduled."
                    });
                }
            }
            // ✅ Check ownership

            if (
                meetingDoc.requested_user_row_id?.[0]?.toString() !== user_row_id.toString() &&
                meetingDoc.user_row_id?.toString() !== user_row_id.toString() &&
                meetingDoc.rescheduled_by?.toString() !== user_row_id.toString()
            ) {
                return res.json({ status: false, message: "Unauthorized to update this meeting." });
            }

            if (meetingDoc.rescheduled_by?.toString() == user_row_id.toString()) {
                return res.json({ status: false, message: "Unauthorized to update this meeting." });
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
                status_update_by: user_row_id,
                status_update_date: new Date().toISOString()
            };

            if (req.body.status === "rejected") {
                updateFields.rejected_comment = req.body.rejected_comment;
            }

            if (req.body.status === "rescheduled") {
                updateFields.meeting_timezone = req.body.meeting_timezone;
                updateFields.meeting_datetime = new Date(req.body.meeting_datetime);
                updateFields.rescheduled_count = (Number.parseInt(meetingDoc.rescheduled_count || "0") + 1).toString();
                updateFields.rescheduled_by = user_row_id
                updateFields.status = "pending";

            }

            // ✅ Update meeting status
            await meetingM.updateOne(
                { _id: meeting_id },
                { $set: updateFields }
            );
            await deleteKeysByPattern('interview_list_*')
            if (req.body.status === "scheduled") {
                let userData
                if (meetingDoc?.company_row_id) {

                    const company = await companyM.findOne(
                        { _id: meetingDoc?.company_row_id },
                        { company_name: 1, company_email_id: 1 }
                    );
                    userData = {
                        full_name: company?.company_name,
                        email_id: company?.company_email_id
                    }
                } else {
                    const user = await professionalsM.findOne(
                        { _id: meetingDoc?.user_row_id },
                        { full_name: 1, email_id: 1 }
                    );
                    userData = {
                        full_name: user?.full_name,
                        email_id: user?.email_id
                    }
                }
                const requested_user = await professionalsM.findOne(
                    { _id: meetingDoc?.requested_user_row_id[0] },
                    { full_name: 1, email_id: 1 }
                );
                let meetingTypeLabel;
                if (meetingDoc.meeting_type == "journalist_interview") {
                    meetingTypeLabel = "Journalist Interview";
                } else if (meetingDoc.meeting_type == "1on1") {
                    meetingTypeLabel = "1:1";
                } else if (meetingDoc.meeting_type == "job_interview") {
                    meetingTypeLabel = "Job Interview";
                } else {
                    meetingTypeLabel = '';
                }
                await sendConfirmedMeetingEmail(
                    userData,
                    {
                        meeting_title: meetingDoc.meeting_title,
                        meeting_datetime: meetingDoc?.meeting_datetime,
                        meeting_link: meetingDoc.meeting_link
                    },
                    meetingTypeLabel,
                    meetingDoc.meeting_type == "journalist_interview" ? "Coinpedia Team" : requested_user?.full_name
                );
            }
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






module.exports = router;