const express = require('express')
const { check, validationResult } = require('express-validator');
const sanitize = require('mongo-sanitize')
const { arrangeValidation } = require('../../../utils/helpers/helper');
const { checkAllLoginToken, checkUserLoginToken } = require('../../../middleware/authorization');
const jobsM = require('../../../models/app/jobs/jobsM');
const companyM = require('../../../models/app/company/companyM');
const job_education_typeM = require('../../../models/app/jobs/job_education_typeM');
const job_skillM = require('../../../models/app/jobs/job_skillM');
const job_applied_listM = require('../../../models/app/jobs/job_applied_listM');
const { getUserProfileWithScore, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper');
const community_postsM = require('../../../models/main/community/community_postsM');
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM');
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper');
const router = express.Router()

router.post(
    "/add_n_update_details",
    [
        check("company_row_id").trim().not().isEmpty().withMessage("Company ID is required."),
        check("country_id").trim().not().isEmpty().withMessage("Country ID is required."),
        check("job_title").trim().not().isEmpty().withMessage("Job Title is required."),
        check("experience_level").trim().not().isEmpty().withMessage("Experience Level is required."),
        check("highest_education")
            .not()
            .isEmpty()
            .withMessage("Highest Education is required.")
            .isNumeric()
            .withMessage("Highest Education must be a valid ID."),
        check("key_skills")
            .isArray({ min: 1 })
            .withMessage("At least one skill is required."),
        check("job_description")
            .trim()
            .not()
            .isEmpty()
            .withMessage("Job Description is required."),
        check("salary_from")
            .optional()
            .isNumeric()
            .withMessage("Salary From must be a number."),
        check("salary_to")
            .optional()
            .isNumeric()
            .withMessage("Salary To must be a number."),
        check("no_of_openings")
            .optional()
            .isInt({ min: 1 })
            .withMessage("Number of openings must be at least 1."),
        check("application_deadline")
            .optional()
            .isISO8601()
            .toDate()
            .withMessage("Application deadline must be a valid date."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);

        try {
            const checkToken = await checkAllLoginToken(req.headers, [7]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            const company_row_id = Number.parseInt(req.body.company_row_id)
            const checkCompanyQuery = await companyM.findOne(
                {
                    _id: company_row_id,
                    approval_status: 1,
                    active_status: 1,
                },
                { _id: 1, user_row_id: 1 }
            );

            if (!checkCompanyQuery) {
                errObj["company_row_id"] = "Invalid Company ID";
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }
            const jobPayload = {
                company_row_id: Number(company_row_id),
                job_title: sanitize(req.body.job_title),
                experience_level: req.body.experience_level,
                job_type: req.body.job_type,
                work_location_type: req.body.work_location_type,
                country_id: req.body.country_id,
                location: req.body.location,
                salary_from: req.body.salary_from,
                salary_to: req.body.salary_to,
                no_of_openings: req.body.no_of_openings,
                application_deadline: req.body.application_deadline,
                highest_education: req.body.highest_education,
                key_skills: req.body.key_skills,
                job_description: sanitize(req.body.job_description),

            };

            let result;
            if (req.body.job_id) {
                result = await jobsM.findOneAndUpdate(
                    { _id: Number.parseInt(req.body.job_id) }, // using numeric _id
                    { $set: { ...jobPayload } },
                    { new: true }
                );
                await deleteKeysByPattern('job_list_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('app_company_list_*')
                if (!result) {
                    return res.json({ status: false, message: "Job not found for update." });
                }

                res.json({ status: true, message: "Job updated successfully!" });
            } else {
                const newJob = new jobsM({ ...jobPayload, active_status: "active" });
                result = await newJob.save();
                await deleteKeysByPattern('job_list_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('app_company_list_*')
                await calculateCompanyProfileScore(company_row_id, ['job_opening'])

                res.json({ status: true, message: "Job created successfully!", data: result });
            }
        } catch (error) {
            console.error(error);
            res.json({ status: false, message: "Server error while saving job.", alert_message: error?.message });
        }
    }
);

router.get("/delete/:job_id", async (req, res) => {
    try {
        const checkToken = await checkAllLoginToken(req.headers, [7]);
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }
        const job_id = Number.parseInt(req.params.job_id);
        const company_row_id = req.query.company_row_id ? Number.parseInt(req.query.company_row_id) : null;


        const job = await jobsM.findOne({ _id: job_id, is_deleted: false });
        if (!job) {
            return res.json({ status: false, message: "Job not found or already deleted." });
        }

        const company = await companyM.findOne({ _id: job.company_row_id });
        if (!company) {
            return res.json({ status: false, message: "Company not found." });
        }

        if (checkToken.message.user_type == 1) {
            if (company._id !== company_row_id) {
                return res.json({ status: false, message: "You are not authorized to update this job." });
            }
        }

        await jobsM.updateOne({ _id: job_id }, { $set: { is_deleted: true } });
        await deleteKeysByPattern('job_list_*')
        await deleteKeysByPattern('app_company_individual_other_details_*')
        await deleteKeysByPattern('app_company_list_*')
        await calculateCompanyProfileScore(company_row_id, ['job_opening'])
        return res.json({ status: true, message: "Job deleted successfully" });
    } catch (error) {
        console.error(error);
        res.json({
            status: false,
            message: "Server error while deleting job.",
            alert_message: error?.message,
        });
    }
});

router.post("/job_status/:job_id", async (req, res) => {
    try {
        const checkToken = await checkAllLoginToken(req.headers, [7]);
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }
        const job_id = Number.parseInt(req.params.job_id);
        const { active_status } = req.body;
        const company_row_id = req.query.company_row_id ? Number.parseInt(req.query.company_row_id) : null;

        if (!["active", "inactive"].includes(active_status)) {
            return res.json({ status: false, message: "Invalid active_status value" });
        }

        const job = await jobsM.findOne({ _id: job_id, is_deleted: false });
        if (!job) {
            return res.json({ status: false, message: "Job not found or deleted." });
        }

        const company = await companyM.findOne({ _id: job.company_row_id });
        if (!company) {
            return res.json({ status: false, message: "Company not found." });
        }
        if (checkToken.message.user_type == 1) {
            if (company._id !== company_row_id) {
                return res.json({ status: false, message: "You are not authorized to update this job." });
            }
        }

        await jobsM.updateOne(
            { _id: job_id },
            { $set: { active_status } }
        );
        await deleteKeysByPattern('job_list_*')
        await deleteKeysByPattern('app_company_individual_other_details_*')
        await deleteKeysByPattern('app_company_list_*')

        return res.json({
            status: true,
            message: `Job status updated to ${active_status}`,
        });

    } catch (error) {
        console.error(error);
        res.json({
            status: false,
            message: "Server error while updating job status.",
            alert_message: error?.message,
        });
    }
});


router.get("/list/:skip/:limit", async (req, res) => {
    try {

        const checkToken = await checkAllLoginToken(req.headers, [7]);

        let user_row_id;
        if (checkToken.status) {
            if (checkToken.message.user_type == 1) {
                user_row_id = Number.parseInt(checkToken.message.user_row_id);
            } else {
                user_row_id = req.query.user_row_id ? Number.parseInt(req.query.user_row_id) : null;
            }
        }

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;

        const { search, company_row_id, active_status } = req.query;

        let matchStage = { is_deleted: false };

        if (search) {
            matchStage.job_title = { $regex: search, $options: "i" };
        }

        if (company_row_id) {
            matchStage.company_row_id = Number(company_row_id);
        }

        if (active_status !== undefined) {
            const finalActiveStatus = active_status;
            matchStage.active_status = finalActiveStatus;
        }
        const cacheKey = `job_list_${user_row_id || 0}_${search || 'all'}_${company_row_id || 0}_${active_status || 'all'}_${skip}_${limit}`;
        const cache_response = await getCache({ key: cacheKey });
        if (cache_response.status && cache_response.message) {
            return res.json({
                ...cache_response.message,
                cache_response_status: true
            });
        }

        // PERF FIX: $sort/$skip/$limit now run immediately after $match, before any of the
        // 5 $lookups below (one with its own $group sub-pipeline) - previously every lookup
        // ran across every matching job in the whole company before the page was trimmed
        // down to `limit` rows, so a company with hundreds of jobs paid for hundreds of
        // joins to render one 10-row page. Semantically identical (createdAt isn't touched
        // by any lookup below), just far less work for the same result. The count query -
        // previously awaited sequentially after the list query - now runs in parallel with
        // it via Promise.all, since the two are independent of each other.
        const [job_list, totalCountResult] = await Promise.all([
            jobsM.aggregate([
                { $match: matchStage },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
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
                        from: "cln_job_applied_lists",
                        let: { jobId: "$_id" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$job_id", "$$jobId"] } } },
                            {
                                $group: {
                                    _id: null,
                                    total_applicants: { $sum: 1 },
                                    applied_users: { $push: "$user_row_id" }
                                }
                            }
                        ],
                        as: "applicants_info"
                    }
                },
                {
                    $addFields: {
                        total_applicants: {
                            $ifNull: [{ $arrayElemAt: ["$applicants_info.total_applicants", 0] }, 0]
                        },
                        has_applied: {
                            $in: [
                                user_row_id,
                                { $ifNull: [{ $arrayElemAt: ["$applicants_info.applied_users", 0] }, []] }
                            ]
                        }
                    }
                },
                {
                    $lookup: {
                        from: "cln_job_skills",
                        localField: "key_skills",
                        foreignField: "_id",
                        as: "skills_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
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
                    $project: {
                        _id: 1,
                        job_title: 1,
                        experience_level: 1,
                        job_type: 1,
                        country_name: "$co_info.country_name",
                        country_flag: "$co_info.country_flag",
                        work_location_type: 1,
                        location: 1,
                        salary_from: 1,
                        salary_to: 1,
                        has_applied: 1,
                        no_of_openings: 1,
                        application_deadline: 1,
                        job_description: 1,
                        active_status: 1,
                        total_applicants: 1,
                        createdAt: 1,
                        country_id: 1,
                        company_name: "$company_info.company_name",
                        company_logo: "$company_info.company_logo",
                        company_row_id: 1,
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
                }
            ]),
            jobsM.aggregate([
                { $match: matchStage },
                { $count: "count" }
            ])
        ]);
        const totalCount = totalCountResult[0]?.count || 0;

        let responseData = {
            status: true,
            data: job_list,
            count: totalCount
        };

        if (user_row_id) {
            const [total_completion, hasPostedDoc, expertTagDoc] = await Promise.all([
                getUserProfileWithScore(user_row_id),
                community_postsM.exists({ user_row_id, post_status: true }),
                courses_certificatesM.exists({ user_row_id })
            ]);

            responseData.profile_score = total_completion;
            responseData.has_posted = !!hasPostedDoc;
            responseData.course_completed = !!expertTagDoc;
            responseData.user_row_id = user_row_id;
        }

        // ✅ Set cache for 30 mins
        await setCache({
            key: cacheKey,
            value: responseData,
            ttl: 1800
        });

        return res.json(responseData);

    } catch (error) {
        console.error(error);
        return res.json({ status: false, message: "Error fetching Job List." });
    }
});



router.get("/education_type_list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (!checkToken.status) {
            return res.status(401).json({ status: false, message: { alert_message: checkToken.message } });
        }
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50
        const { search } = req.query;
        const cacheKey = `education_type_list_${search || 'all'}_${skip}_${limit}`;
        const cache_response = await getCache({ key: cacheKey });
        if (cache_response.status && cache_response.message) {
            return res.json({
                ...cache_response.message,
                cache_response_status: true
            });
        }

        let filter = {};
        if (search) {
            filter.education_type = { $regex: search, $options: "i" }; // case-insensitive search
        }

        const education_types = await job_education_typeM
            .find(filter)
            .select({ _id: 1, createdAt: 1, education_type: 1 })
            .sort({ createdAt: 1 })
            .skip(skip).limit(limit);

        const total_count = await job_education_typeM.countDocuments(filter)

        const responseData = { status: true, data: education_types, count: total_count };

        await setCache({
            key: cacheKey,
            value: responseData,
            ttl: 1800
        });

        return res.json(responseData);
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching Education Types." });
    }
});


router.get("/skill_list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (!checkToken.status) {
            return res.status(401).json({ status: false, message: { alert_message: checkToken.message } });
        }
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

        const { search } = req.query;
        const cacheKey = `skill_list_${search || 'all'}_${skip}_${limit}`;
        const cache_response = await getCache({ key: cacheKey });
        if (cache_response.status && cache_response.message) {
            return res.json({
                ...cache_response.message,
                cache_response_status: true
            });
        }

        let filter = {};
        if (search) {
            filter.skill_name = { $regex: search, $options: "i" }; // case-insensitive search
        }

        const skills = await job_skillM
            .find(filter)
            .select({ _id: 1, createdAt: 1, skill_name: 1 })
            .sort({ createdAt: 1 })
            .skip(skip).limit(limit);

        const total_count = await job_skillM.countDocuments(filter)

        const responseData = { status: true, data: skills, count: total_count };
        await setCache({
            key: cacheKey,
            value: responseData,
            ttl: 1800
        });

        return res.json(responseData);
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching Skill." });
    }
});










module.exports = router