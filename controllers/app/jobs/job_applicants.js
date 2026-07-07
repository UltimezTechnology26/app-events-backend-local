const express = require('express')
const { check, validationResult } = require('express-validator');
const sanitize = require('mongo-sanitize')
const { arrangeValidation, uploadDocumentFunc } = require('../../../utils/helpers/helper');
const { checkAllLoginToken, checkUserLoginToken } = require('../../../middleware/authorization');
const jobsM = require('../../../models/app/jobs/jobsM');
const companyM = require('../../../models/app/company/companyM');
const job_education_typeM = require('../../../models/app/jobs/job_education_typeM');
const job_skillM = require('../../../models/app/jobs/job_skillM');
const job_applied_listM = require('../../../models/app/jobs/job_applied_listM');
const { getUserProfileWithScore, sendJobApplicantEmail, sendJobAppliedEmail } = require('../../../utils/helpers/app_helper');
const community_postsM = require('../../../models/main/community/community_postsM');
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM');
const professionalsM = require('../../../models/app/professionalsM');
const router = express.Router()

router.post(
    "/add_n_update_details",
    [
        check("job_id").not().isEmpty().withMessage("Job ID is required."),
        check("salary_expectations")
            .not().isEmpty().withMessage("Salary expectation is required.")
            .isNumeric().withMessage("Salary expectation must be numeric."),
        check("highest_education")
            .not().isEmpty().withMessage("Highest Education is required.")
            .isNumeric().withMessage("Highest Education must be a valid ID."),
        check("key_skills")
            .isArray({ min: 1 })
            .withMessage("At least one skill is required."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);

        try {
            const checkToken = checkUserLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            const user_row_id = Number.parseInt(checkToken.message);

            const job_id = Number.parseInt(req.body.job_id);

            const checkJobQuery = await jobsM.findOne(
                { _id: job_id, is_deleted: false, active_status: "active" },
                { _id: 1, company_row_id: 1, job_title: 1 }
            );

            if (!checkJobQuery) {
                errObj["job_id"] = "Invalid Job ID or Job is inactive/deleted.";
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            const company_row_id = checkJobQuery.company_row_id;

            let resumeFile = null;
            if (req.body.resume) {
                const uploadedResume = await uploadDocumentFunc(req.body.resume, 1);
                if (uploadedResume.status) {
                    resumeFile = uploadedResume.path;
                } else {
                    return res.json({ status: false, message: "Resume upload failed" });
                }
            }

            // 🆕 Handle Certificate Upload
            let certificateFiles = [];

            if (Array.isArray(req.body.credentials) && req.body.credentials.length > 0) {
                for (const cert of req.body.credentials) {
                    const uploadedCertificate = await uploadDocumentFunc(cert, 2);
                    if (uploadedCertificate.status) {
                        certificateFiles.push(uploadedCertificate.path);
                    } else {
                        return res.json({ status: false, message: "Certificate upload failed" });
                    }
                }
            }

            const applyPayload = {
                company_row_id,
                job_id,
                user_row_id: user_row_id,
                linkedIn: req.body.linkedIn,
                salary_expectations: req.body.salary_expectations,
                highest_education: req.body.highest_education,
                key_skills: req.body.key_skills,
                resume: resumeFile,
                credentials: certificateFiles.length > 0 ? certificateFiles : null
            };

            const existingApplication = await job_applied_listM.findOne({
                user_row_id: user_row_id,
                job_id,
            });

            if (existingApplication) {
                const updatedApp = await job_applied_listM.findOneAndUpdate(
                    { _id: existingApplication._id },
                    { $set: applyPayload },
                    { new: true }
                );

                return res.json({
                    status: true,
                    message: "Job application updated successfully!",
                    data: updatedApp
                });
            } else {
                const newApplication = new job_applied_listM(applyPayload);
                await newApplication.save();
                const company = await companyM.findOne({ _id: company_row_id }, { company_name: 1, company_email_id: 1 })
                const user = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1, email_id: 1 })

                await sendJobApplicantEmail({ full_name: company?.company_name, email_id: company?.company_email_id }, {
                    name: user?.full_name,
                    job_date: new Date(),
                    job_role: checkJobQuery?.job_title
                },
                    'https://image.coinpedia.org/' + resumeFile)
                await sendJobAppliedEmail({ full_name: user?.full_name, email_id: user?.email_id }, {
                    resume: 'https://image.coinpedia.org/' + resumeFile,
                    company_name: company?.company_name,
                    job_role: checkJobQuery?.job_title
                })

                return res.json({
                    status: true,
                    message: "Job applied successfully!",
                    data: newApplication
                });
            }

        } catch (error) {
            console.error(error);
            return res.json({ status: false, message: "Server error while applying to job.", alert_message: error?.message });
        }
    }
);

// 📌 Get Applied Job List (with filters)
router.get("/user_applied_list/:skip/:limit", async (req, res) => {
    try {
        // 🔐 Auth check
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

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;

        const { company_row_id } = req.query;

        let matchStage = {
            user_row_id: user_row_id
        };

        if (company_row_id) {
            matchStage.company_row_id = Number(company_row_id);
        }
        const total_completion = await getUserProfileWithScore(user_row_id)


        const appliedJobs = await job_applied_listM.aggregate([
            { $match: matchStage },

            // 🔗 Join with jobs collection
            {
                $lookup: {
                    from: "cln_jobs",
                    localField: "job_id",
                    foreignField: "_id",
                    as: "job_info"
                }
            },
            { $unwind: { path: "$job_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_job_education_types",
                    localField: "highest_education",
                    foreignField: "_id",
                    as: "education_info"
                }
            },
            { $unwind: { path: "$education_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_job_skills",
                    localField: "key_skills",
                    foreignField: "_id",
                    as: "skills_info"
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "job_info.country_id",
                    foreignField: "_id",
                    as: "co_info"
                }
            },
            { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    job_id: 1,
                    user_row_id: 1,
                    salary_expectations: 1,
                    linkedIn: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    resume: 1,
                    status: 1,
                    rejected_reason: 1,
                    credentials: 1,
                    job_info: {
                        _id: "$job_info._id",
                        job_title: "$job_info.job_title",
                        job_type: "$job_info.job_type",
                        work_location_type: "$job_info.work_location_type",
                        salary_from: "$job_info.salary_from",
                        salary_to: "$job_info.salary_to",
                        active_status: "$job_info.active_status",
                        is_deleted: "$job_info.is_deleted",
                        country_name: "$co_info.country_name",
                        country_flag: "$co_info.country_flag",
                        job_description: "$job_info.job_description",
                        application_deadline: "$job_info.application_deadline",
                        experience_level: "$job_info.experience_level",
                        no_of_openings: "$job_info.no_of_openings",
                    },
                    company_info: {
                        _id: "$company_info._id",
                        company_name: "$company_info.company_name",
                        company_logo: "$company_info.company_logo"
                    },
                    highest_education: {
                        _id: "$education_info._id",
                        name: "$education_info.education_type"
                    },
                    skills: {
                        $map: {
                            input: "$skills_info",
                            as: "s",
                            in: { _id: "$$s._id", name: "$$s.skill_name" }
                        }
                    },
                }
            },

            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const totalCountResult = await job_applied_listM.aggregate([
            { $match: matchStage },
            { $count: "count" }
        ]);
        const totalCount = totalCountResult[0]?.count || 0;
        const hasposted = !!(await community_postsM.exists({ user_row_id, post_status: true }));
        const expert_tag = !!(await courses_certificatesM.exists({ user_row_id }));



        res.json({ status: true, data: appliedJobs, profile_score: total_completion, count: totalCount, has_posted: hasposted, course_completed: expert_tag });
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching applied jobs list.", error: error?.message });
    }
});

router.get("/list/:skip/:limit", async (req, res) => {
    try {
        // 🔐 Auth check
        const checkToken = await checkAllLoginToken(req.headers, [13]);
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;

        // ⬅️ add filter params
        const { company_row_id, job_id, salary_range, highest_education, skills, status, search } = req.query;

        // ✅ Initialize matchStage
        let matchStage = {};
        if (company_row_id) {
            matchStage.company_row_id = Number(company_row_id);
        }
        if (job_id) {
            matchStage.job_id = Number(job_id);
        }

        if (status) {
            matchStage.status = status;
        }
        if (search && search.trim() !== "") {
            matchStage.$or = [
                { "user_info.full_name": { $regex: search, $options: "i" } },
                { "user_info.user_name": { $regex: search, $options: "i" } },
            ];
        }

        if (salary_range) {
            switch (Number(salary_range)) {
                case 1: // Below $30,000
                    matchStage.salary_expectations = { $lt: 30000 };
                    break;
                case 2: // $30,000 – $50,000
                    matchStage.salary_expectations = { $gte: 30000, $lte: 50000 };
                    break;
                case 3: // $50,000 – $80,000
                    matchStage.salary_expectations = { $gte: 50000, $lte: 80000 };
                    break;
                case 4: // $80,000 – $120,000
                    matchStage.salary_expectations = { $gte: 80000, $lte: 120000 };
                    break;
                case 5: // Above $120,000
                    matchStage.salary_expectations = { $gt: 120000 };
                    break;
            }
        }

        if (highest_education) {
            matchStage.highest_education = Number(highest_education);
        }

        if (skills) {
            const skillsArr = skills.split(",").map(id => Number(id));
            matchStage.key_skills = { $in: skillsArr };
        }

        const appliedJobs = await job_applied_listM.aggregate([
            { $match: matchStage },

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
                    as: "profile_info"
                }
            },

            {
                $lookup: {
                    from: "cln_job_education_types",
                    localField: "highest_education",
                    foreignField: "_id",
                    as: "education_info"
                }
            },
            { $unwind: { path: "$education_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_job_skills",
                    localField: "key_skills",
                    foreignField: "_id",
                    as: "skills_info"
                }
            },

            {
                $project: {
                    _id: 1,
                    job_id: 1,
                    user_row_id: 1,
                    salary_expectations: 1,
                    linkedIn: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    resume: 1,
                    status: 1,
                    credentials: 1,
                    rejected_reason: 1,
                    user: {
                        _id: "$user_info._id",
                        name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        mobile_number: "$user_info.mobile_number",
                        country_id: "$user_info.country_mobile_id",
                        pro_batch: "$user_info.pro_batch",
                        email_id: "$user_info.email_id",
                        image: { $arrayElemAt: ["$profile_info.profile_image", 0] }
                    },
                    highest_education: {
                        _id: "$education_info._id",
                        name: "$education_info.education_type"
                    },
                    skills: {
                        $map: {
                            input: "$skills_info",
                            as: "s",
                            in: { _id: "$$s._id", name: "$$s.skill_name" }
                        }
                    }
                }
            },

            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        // 🔹 2. Total count
        const totalCountResult = await job_applied_listM.aggregate([
            { $match: matchStage },
            { $count: "count" }
        ]);
        const totalCount = totalCountResult[0]?.count || 0;

        res.json({ status: true, data: appliedJobs, count: totalCount });
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching applied jobs list.", error: error?.message });
    }
});




router.post("/status/:application_id", async (req, res) => {
    try {
        // 🔐 Auth check
        const checkToken = await checkAllLoginToken(req.headers, [13]);
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }

        const { status, rejected_reason } = req.body;
        const application_id = req.params.application_id;

        if (!["approved", "rejected", "scheduled"].includes(status)) {
            return res.json({ status: false, message: "Invalid status provided" });
        }

        // Build update object
        const updateObj = {
            status: status,
            updatedAt: new Date(),
        };

        // If rejected, add reason
        if (status === "rejected") {
            updateObj.rejected_reason = rejected_reason;
        } else {
            updateObj.rejected_reason = null;
        }

        const updated = await job_applied_listM.findOneAndUpdate(
            { _id: application_id },
            { $set: updateObj },
            { new: true }
        );

        if (!updated) {
            return res.json({ status: false, message: "Application not found" });
        }

        res.json({
            status: true,
            message: `Application ${status} successfully`,
            data: updated,
        });
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error updating application status." });
    }
});








module.exports = router