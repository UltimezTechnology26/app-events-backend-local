const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator');
const { checkAdminLoginToken } = require('../../../../middleware/authorization');
const job_skillM = require('../../../../models/app/jobs/job_skillM');
const { arrangeValidation } = require('../../../../utils/helpers/helper');
const { deleteKeysByPattern } = require('../../../../config/cache_helper');
const jobsM = require('../../../../models/app/jobs/jobsM');
const companyM = require('../../../../models/app/company/companyM');

router.post(
    "/add_n_update_details",
    [
        check("skill_name")
            .trim()
            .not()
            .isEmpty()
            .withMessage("Skill name is required.")
            .isString()
            .withMessage("Skill name must be a string."),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);
        let skill_id = ""


        try {
            const checkToken = checkAdminLoginToken(req.headers, [13]);
            if (!checkToken.status) {
                return res.json({ status: false, message: checkToken?.message });
            }
            if (req.body.skill_id && !Number.isNaN(Number.parseInt(req.body.skill_id))) {
                skill_id = Number.parseInt(sanitize(req.body.skill_id));

                const checkSkill = await job_skillM.findOne(
                    { _id: skill_id },
                    { _id: 1 }
                );

                if (!checkSkill) {
                    errObj["skill_id"] = "Invalid skill id.";
                }
            }

            let skill_name = "";
            if (req.body.skill_name) {
                skill_name = sanitize(req.body.skill_name);

                const duplicateSkill = await job_skillM
                    .findOne(
                        {
                            _id: { $ne: skill_id },
                            skill_name: skill_name
                        },
                        { _id: 1 }
                    )
                    .collation({ locale: "en", strength: 2 });
                if (duplicateSkill) {
                    errObj["skill_name"] = "Sorry, this skill name already exists.";
                }
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }



            let skillData;
            if (skill_id) {
                skillData = await job_skillM.findByIdAndUpdate(
                    skill_id,
                    { skill_name: skill_name },
                    { new: true }
                );
                if (!skillData) {
                    return res.json({ status: false, message: "Skill not found." });
                }
            } else {
                skillData = new job_skillM({
                    skill_name: skill_name,
                });
                await skillData.save();
            }
            await deleteKeysByPattern('skill_list_*')
            await deleteKeysByPattern('job_list_*')
            res.json({ status: true, message: `Skill ${skill_id ? "updated" : "added"} successfully!` });
        } catch (error) {
            console.error(error);
            res.json({ status: false, message: "Server error while saving skill.", alert_message: error?.message });
        }
    }
);

router.get("/list/:skip/:limit", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7]);
        if (!checkToken.status) return res.json(checkToken);

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;

        const { search } = req.query;

        let searchFilter = {};
        const escapeRegex = (text) => {
            return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        };
        if (search) {
            const safeSearch = escapeRegex(search.trim());
            searchFilter.skill_name = { $regex: safeSearch, $options: "i" };
        }

        const skills = await job_skillM
            .find(searchFilter)
            .select({ _id: 1, createdAt: 1, skill_name: 1 })
            .sort({ createdAt: 1 })
            .skip(skip).limit(limit);

        const total_count = await job_skillM.countDocuments(searchFilter);

        let skillIds = skills.map(s => s._id);

        const jobs = await jobsM.aggregate([
            {
                $match: {
                    key_skills: { $in: skillIds },
                    is_deleted: false
                }
            },
            {
                $project: {
                    company_row_id: 1,
                    key_skills: 1
                }
            }
        ]);

        let skillCompaniesMap = {};
        skills.forEach(s => {
            skillCompaniesMap[s._id] = [];
        });

        jobs.forEach(job => {
            job.key_skills.forEach(skillId => {
                if (skillCompaniesMap[skillId]) {
                    skillCompaniesMap[skillId].push(job.company_row_id);
                }
            });
        });
        const allCompanyIds = [...new Set(jobs.map(j => j.company_row_id))];

        const companies = await companyM.find(
            { _id: { $in: allCompanyIds } },
            { _id: 1, approval_status: 1, active_status: 1 }
        );

        let companyStatusMap = {};
        companies.forEach(c => {
            companyStatusMap[c._id] = c;
        });

        const finalData = skills.map(skill => {
            const companyIds = skillCompaniesMap[skill._id] || [];

            let counts = {
                pending_company_count: 0,
                approved_company_count: 0,
                rejected_company_count: 0,
                disabled_company_count: 0,
                deleted_company_count: 0
            };

            companyIds.forEach(cid => {
                let comp = companyStatusMap[cid];
                if (!comp) return;

                if (comp.approval_status === 0) counts.pending_company_count++;
                if (comp.approval_status === 1) counts.approved_company_count++;
                if (comp.approval_status === 2) counts.rejected_company_count++;

                if (comp.active_status === 0) counts.disabled_company_count++;
                if (comp.active_status === 2) counts.deleted_company_count++;
            });

            return {
                ...skill.toObject(),
                ...counts
            };
        });

        return res.json({
            status: true,
            data: finalData,
            count: total_count
        });

    } catch (error) {
        console.error(error);
        res.json({ status: false, message: err.message });
    }
});



router.get("/delete/:id", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (!checkToken.status) {
            return res.json({ status: false, message: checkToken?.message });
        }
        const skill = await job_skillM.findByIdAndDelete(req.params.id);

        if (!skill) {
            return res.json({ status: false, message: "Skill not found." });
        }
        await deleteKeysByPattern('skill_list_*')
        await deleteKeysByPattern('job_list_*')
        res.json({ status: true, message: "Skill deleted successfully." });
    } catch (error) {
        console.error(error);
        res.json({ status: false, message: "Error deleting skill." });
    }
});

module.exports = router