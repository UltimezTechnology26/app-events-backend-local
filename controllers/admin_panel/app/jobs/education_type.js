const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator');
const { checkAdminLoginToken } = require('../../../../middleware/authorization');
const job_education_typeM = require('../../../../models/app/jobs/job_education_typeM');
const { arrangeValidation } = require('../../../../utils/helpers/helper');
const { deleteKeysByPattern } = require('../../../../config/cache_helper');

router.post(
    "/add_n_update_details",
    [
        check("education_type")
            .trim()
            .not()
            .isEmpty()
            .withMessage("Education type is required.")
            .isString()
            .withMessage("Education type name must be a string."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);
        let education_type = ""
        let id


        try {
            const checkToken = checkAdminLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            if (req.body.id && !Number.isNaN(Number.parseInt(req.body.id))) {
                id = Number.parseInt(sanitize(req.body.id));

                const checkEducation = await job_education_typeM.findOne(
                    { _id: id },
                    { _id: 1 }
                );

                if (!checkEducation) {
                    errObj["id"] = "Invalid education type id.";
                }
            }

            if (req.body.education_type) {
                education_type = sanitize(req.body.education_type);

                const duplicateEducationType = await job_education_typeM
                    .findOne(
                        {
                            _id: { $ne: id },
                            education_type: education_type
                        },
                        { _id: 1 }
                    )
                    .collation({ locale: "en", strength: 2 });

                if (duplicateEducationType) {
                    errObj["education_type"] =
                        "Sorry, this education type already exists.";
                }
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            let education_type_data;
            if (id) {
                education_type_data = await job_education_typeM.findByIdAndUpdate(
                    id,
                    { education_type: education_type },
                    { new: true }
                );
                if (!education_type_data) {
                    return res.json({ status: false, message: "Education Type not found." });
                }
            } else {
                education_type_data = new job_education_typeM({
                    education_type: education_type,
                });
                await education_type_data.save();
                await deleteKeysByPattern('education_type_*')
                await deleteKeysByPattern('job_list_*')
            }
            const key = await deleteKeysByPattern('education_type_*')
            res.json({ status: true, key: key, message: `Education Type ${education_type ? "updated" : "added"} successfully!` });
        } catch (error) {
            console.error(error);
            res.json({ status: false, message: "Server error while saving Education Type.", alert_message: error?.message });
        }
    }
);

router.get("/list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50
        if (checkToken.status) {
            const { search } = req.query;

            let filter = {};
            const escapeRegex = (text = "") =>
                text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (search) {
                const safeSearch = escapeRegex(search.trim());
                filter.education_type = { $regex: safeSearch, $options: "i" };
            }

            const education_types = await job_education_typeM.aggregate([

                { $match: filter },

                {
                    $lookup: {
                        from: "cln_jobs",
                        localField: "_id",
                        foreignField: "highest_education",
                        as: "jobs"
                    }
                },
                {
                    $addFields: {
                        company_ids: {
                            $map: {
                                input: "$jobs",
                                as: "j",
                                in: "$$j.company_row_id"
                            }
                        }
                    }
                },
                {
                    $lookup: {
                        from: "cln_company_lists",
                        localField: "company_ids",
                        foreignField: "_id",
                        as: "companies"
                    }
                },

                {
                    $addFields: {
                        pending_company_count: {
                            $size: {
                                $filter: {
                                    input: "$companies",
                                    as: "c",
                                    cond: {
                                        $and: [
                                            { $eq: ["$$c.approval_status", 0] },
                                            { $eq: ["$$c.active_status", 1] }
                                        ]
                                    }
                                }
                            }
                        },

                        approved_company_count: {
                            $size: {
                                $filter: {
                                    input: "$companies",
                                    as: "c",
                                    cond: {
                                        $and: [
                                            { $eq: ["$$c.approval_status", 1] },
                                            { $eq: ["$$c.active_status", 1] }
                                        ]
                                    }
                                }
                            }
                        },

                        rejected_company_count: {
                            $size: {
                                $filter: {
                                    input: "$companies",
                                    as: "c",
                                    cond: { $eq: ["$$c.approval_status", 2] }
                                }
                            }
                        },

                        disabled_company_count: {
                            $size: {
                                $filter: {
                                    input: "$companies",
                                    as: "c",
                                    cond: { $eq: ["$$c.active_status", 0] }
                                }
                            }
                        },

                        deleted_company_count: {
                            $size: {
                                $filter: {
                                    input: "$companies",
                                    as: "c",
                                    cond: { $eq: ["$$c.active_status", 2] }
                                }
                            }
                        }
                    }
                },

                {
                    $project: {
                        jobs: 0,
                        company_ids: 0,
                        companies: 0
                    }
                },

                { $sort: { createdAt: 1 } },
                { $skip: skip },
                { $limit: limit }
            ]);

            const total_count = await job_education_typeM.countDocuments(filter)


            res.json({ status: true, data: education_types, count: total_count });
        }
        else {
            res.json(checkToken)
        }
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error fetching Education Types." });
    }
});

router.get("/delete/:id", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }
        const education_type = await job_education_typeM.findByIdAndDelete(req.params.id);
        await deleteKeysByPattern('education_type_*')
        if (!education_type) {
            return res.json({ status: false, message: "Education type not found." });
        }
        await deleteKeysByPattern('job_list_*')
        res.json({ status: true, message: "Education type deleted successfully." });
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error deleting Education type." });
    }
});

module.exports = router