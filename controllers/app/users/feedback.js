const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const professionals_feedbackM = require('../../../models/app/professionals_feedbackM')
const report_feedback_issues_optionsM = require('../../../models/app/static/report_feedback_issues_optionsM')
const report_issues_user_detailsM = require('../../../models/report_issues_user_detailsM')
const { setCache, getCache } = require('../../../config/cache_helper')

router.post('/save_details', [
    check('feedback_type')
        .not().isEmpty().withMessage('The Feedback Type field is required'),
    check('message')
        .not().isEmpty().withMessage('The Message field is required')
        .isLength({ min: 4 }).withMessage('The Message field must be at least 6 characters in length.'),
    check('website_rating')
        .not().isEmpty().withMessage('The Website Rating field is required'),
    check('speed_rating')
        .not().isEmpty().withMessage('The Speed Rating field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = checkUserLoginToken(req.headers)
        let user_row_id = 0
        let date_n_time = getPresentDateTime()
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
            const checkQuery1 = await professionals_feedbackM.findOne({ user_row_id: user_row_id }, { date_n_time: 1 })
            if (checkQuery1) {
                let last_date_time = checkQuery1.date_n_time
                let added_one_minute_time = (60 * 1000) + (new Date(last_date_time).getTime())
                if (date_n_time < added_one_minute_time) {
                    errObj['alert_message'] = 'Sorry for inconvenience, submit your feedback in next one minute.'
                }
            }
        }
        else if (req.body.email_id) {
            const checkQuery2 = await professionals_feedbackM.findOne({ email_id: sanitize(req.body.email_id) }, { date_n_time: 1 })
            if (checkQuery2) {
                let last_date_time = checkQuery2.date_n_time
                let added_one_minute_time = (60 * 1000) + (new Date(last_date_time).getTime())
                if (date_n_time < added_one_minute_time) {
                    errObj['alert_message'] = 'Sorry for inconvenience, submit your feedback in next one minute.'
                }
            }
        }
        else {
            errObj['email_id'] = 'The Valid Email ID field is required.'
        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const feedbackSave = new professionals_feedbackM({
                user_row_id: user_row_id,
                email_id: req.body.email_id,
                feedback_type: req.body.feedback_type,
                message: req.body.message,
                website_rating: req.body.website_rating,
                speed_rating: req.body.speed_rating,
                date_n_time: date_n_time
            })
            await feedbackSave.save()
            res.json({ status: true, message: { alert_message: 'Your feedback details submitted successfully.' } })
        }
    }
    catch (err) {
        console.log('Save feedback details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


//feedback issues options 
router.get('/list', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (!checkToken.status) {
            return res.json(checkToken)
        }

        const search = req.query.search
            ? req.query.search.trim()
            : ""

        const module_type = !isNaN(parseInt(req.query.module_type))
            ? parseInt(req.query.module_type)
            : null

        const tab_key = req.query.tab_key
            ? req.query.tab_key.trim()
            : null

        const sub_tab_key = req.query.sub_tab_key
            ? req.query.sub_tab_key.trim()
            : null
        let matchQuery = {
            active_status: true,
        }

        if (module_type !== null) {
            matchQuery.module_type = module_type
        }

        if (tab_key) {
            matchQuery.tab_key = tab_key
        }

        if (sub_tab_key) {
            matchQuery.sub_tab_key = sub_tab_key
        }

        if (search) {
            matchQuery.$or = [
                { tab_name: { $regex: search, $options: "i" } },
                { tab_key: { $regex: search, $options: "i" } },
                { "report_issues.option": { $regex: search, $options: "i" } },
            ]
        }
        const shouldBypassCache =
            search || module_type !== null || tab_key || sub_tab_key

        const cacheKey = `report_issue_options_list_${JSON.stringify(req.query)}`

        if (!shouldBypassCache) {
            const cacheResponse = await getCache({ key: cacheKey })
            if (cacheResponse.status) {
                return res.json({
                    status: true,
                    data: cacheResponse.message.list,
                    count: cacheResponse.message.count,
                    cache_response_status: true
                })
            }
        }

        const list = await report_feedback_issues_optionsM.aggregate([
            { $match: matchQuery },

            {
                $project: {
                    _id: 1,
                    module_type: 1,
                    tab_key: 1,
                    tab_name: 1,
                    sub_tab_key: 1,
                    report_issues: 1,
                },
            },

            { $sort: { date_n_time: -1 } },
        ])

        if (!shouldBypassCache) {
            await setCache({
                key: cacheKey,
                value: { list, count: list.length },
                ttl: 300
            })
        }

        return res.json({
            status: true,
            data: list,
            count: list.length,
            cache_response_status: false
        })
    } catch (err) {
        console.log("List report issue options error:", err.message)
        return res.json({
            status: false,
            message: "An unexpected error occurred. Please try again later.",
        })
    }
})


router.post(
    "/submite_issues",
    [
        check("module_type")
            .isInt()
            .withMessage("Module type is required"),

        check("module_row_id")
            .isInt()
            .withMessage("Module row id is required"),

        check("tab_key")
            .trim()
            .notEmpty()
            .withMessage("Tab key is required"),

        check("tab_name")
            .trim()
            .notEmpty()
            .withMessage("Tab name is required"),

        check("option_id")
            .isInt()
            .withMessage("Issue option is required"),

        check("description")
            .optional()
            .isLength({ max: 500 })
            .withMessage("Description must be under 500 characters"),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)
            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj })
            }

            const checkToken = checkUserLoginToken(req.headers)

            if (!checkToken.status) {
                return res.json({
                    status: false,
                    message: checkToken.message
                })
            }

            const user_row_id = checkToken.message


            const {
                module_type,
                module_row_id,
                tab_key,
                tab_name,
                sub_tab_key = null,
                option_id,
                description = null,
            } = req.body

            const optionMaster = await report_feedback_issues_optionsM.findOne(
                {
                    module_type,
                    tab_key,
                    sub_tab_key,
                    active_status: true,
                    "report_issues._id": option_id,
                },
                {
                    report_issues: 1,
                }
            )

            if (!optionMaster) {
                return res.json({
                    status: false,
                    message: {
                        alert_message: "Invalid issue option selected.",
                    },
                })
            }

            const optionObj = optionMaster.report_issues.find(
                (o) => o._id === option_id
            )

            if (!optionObj) {
                return res.json({
                    status: false,
                    message: {
                        alert_message: "Issue option not found.",
                    },
                })
            }


            const existingIssue = await report_issues_user_detailsM.findOne({
                user_row_id,
                module_type,
                module_row_id,
                tab_key,
                sub_tab_key: sub_tab_key ?? null,
                option_id,
                tab_name,
                approved_status: 0
            })


            if (existingIssue) {
                return res.json({
                    status: false,
                    message: {
                        alert_message:
                            "This issue is already under review",
                    },
                })
            }

            const saveObj = new report_issues_user_detailsM({
                module_type,
                module_row_id,
                tab_key,
                tab_name,
                sub_tab_key,
                option_id,
                option_text: optionObj.option, // snapshot
                description,
                user_row_id,
                requested_on: getPresentDateTime(),
            })

            await saveObj.save()

            return res.json({
                status: true,
                message: {
                    alert_message:
                        "The issue has been reported successfully.",
                },
            })
        } catch (err) {
            console.log("Submit issue error:", err.message)
            return res.json({
                status: false,
                message:
                    err.message,
            })
        }
    }
)




module.exports = router