const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const report_feedback_issues_optionsM = require('../../../models/app/static/report_feedback_issues_optionsM')
router.post(
    "/add_update",
    [
        check("module_type")
            .not()
            .isEmpty()
            .withMessage("Module type is required"),

        check("tab_key")
            .trim()
            .not()
            .isEmpty()
            .withMessage("Tab key is required"),

        check("tab_name")
            .trim()
            .not()
            .isEmpty()
            .withMessage("Tab name is required"),

        check("report_issues")
            .isArray({ min: 1 })
            .withMessage("At least one issue option is required"),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            const checkToken = checkAdminLoginToken(req.headers, [0])
            if (!checkToken.status) {
                return res.json(checkToken)
            }

            const {
                module_type,
                tab_key,
                tab_name,
                sub_tab_key = null,
                report_issues,
                active_status = true,
            } = req.body


            if (!Array.isArray(report_issues)) {
                errObj["report_issues"] = "Report issues must be an array"
            } else {
                report_issues.forEach((item, index) => {
                    if (!item._id || !item.option) {
                        errObj[`report_issues_${index}`] =
                            "Each issue must have option id and text"
                    }
                })
            }


            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj })
            }

            /* ---------- CHECK EXISTING ---------- */
            const checkQuery = await report_feedback_issues_optionsM.findOne({
                module_type,
                tab_key,
                sub_tab_key,
            })

            if (checkQuery) {
                /* ---------- UPDATE ---------- */
                await report_feedback_issues_optionsM.updateOne(
                    { _id: checkQuery._id },
                    {
                        $set: {
                            tab_name,
                            report_issues,
                            active_status,
                            date_n_time: getPresentDateTime(),
                        },
                    }
                )

                return res.json({
                    status: true,
                    message: {
                        alert_message: "Report issue options updated successfully.",
                    },
                })
            } else {
                /* ---------- INSERT ---------- */
                const saveObj = new report_feedback_issues_optionsM({
                    module_type,
                    tab_key,
                    tab_name,
                    sub_tab_key,
                    report_issues,
                    active_status,
                    date_n_time: getPresentDateTime(),
                })

                await saveObj.save()

                return res.json({
                    status: true,
                    message: {
                        alert_message: "Report issue options added successfully.",
                    },
                })
            }
        } catch (err) {
            console.log("Save/update report issue options", err.message)
            res.json({
                status: false,
                message: err.message,
            })
        }
    }
)

module.exports = router