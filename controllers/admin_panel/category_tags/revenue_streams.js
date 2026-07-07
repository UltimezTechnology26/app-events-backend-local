const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const revenue_streamsM = require('../../../models/app/static/revenue_streams_categoryM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const sanitize = require('mongo-sanitize')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.get('/list', async (req, res) => {
    try {
        let matchStage = {};
        if (req.query?.search?.trim()) {
            matchStage.category_name = {
                $regex: req.query.search.trim(),
                $options: "i"
            };
        }
        const result = await revenue_streamsM.aggregate([
            {
                $match: matchStage
            },
            {
                $lookup: {
                    from: "cln_company_revenue_details",
                    let: { category_id: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$category_id",
                                        {
                                            $map: {
                                                input: { $ifNull: ["$revenue_streams", []] },
                                                as: "r",
                                                in: "$$r.category_row_id"
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "revenues"
                }
            },
            {
                $addFields: {
                    company_ids: {
                        $setUnion: [
                            {
                                $map: {
                                    input: "$revenues",
                                    as: "r",
                                    in: "$$r.company_row_id"
                                }
                            },
                            []
                        ]
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
                $lookup: {
                    from: "cln_company_deleted_history_lists",
                    localField: "company_ids",
                    foreignField: "_id",
                    as: "deleted_companies"
                }
            },

            {

                $addFields: {
                    approved_count: {
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

                    pending_count: {
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

                    rejected_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: {
                                    $and: [
                                        { $eq: ["$$c.approval_status", 2] },
                                        { $eq: ["$$c.active_status", 1] }
                                    ]
                                }
                            }
                        }
                    },

                    disabled_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.active_status", 0] }
                            }
                        }
                    },
                    deleted_count: {
                        $size: "$deleted_companies"
                    }
                }
            }
            ,

            {
                $project: {
                    revenues: 0,
                    companies: 0,
                    company_ids: 0
                }
            }
        ])

        res.json({ status: true, message: result })

    } catch (err) {
        console.log("Revenue category list error:", err)
        res.json({ status: false, message: "Internal error" })
    }
})



router.post('/save_n_edit', [
    check('category_name')
        .trim().not().isEmpty().withMessage('The revenue stream name field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let category_row_id = 0
        if (req.body.category_row_id) {
            category_row_id = Number.parseInt(sanitize(req.body.category_row_id))


            const checkFunding = await revenue_streamsM.findOne({ _id: category_row_id })
            if (!checkFunding) {
                errObj['category_row_id'] = "Invalid category row id"
            }
        }
        let category_name = ""
        if (req.body.category_name) {
            category_name = sanitize(req.body.category_name)

            const duplicateQuery = await revenue_streamsM
                .findOne(
                    {
                        _id: { $ne: category_row_id },
                        category_name: category_name
                    },
                    { _id: 1 }
                )
                .collation({ locale: 'en', strength: 2 })

            if (duplicateQuery) {
                errObj['category_name'] = 'Sorry, This revenue stream name already exists.'
            }
        }
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else if (category_row_id) {
                await revenue_streamsM.updateOne({ _id: category_row_id }, { $set: { category_name: category_name } })
                await deleteKeysByPattern('company_revenue_list_*')
                res.json({ status: true, message: { alert_message: "This revenue stream details has been updated successfully." } })
            }
            else {
                await revenue_streamsM({ category_name: category_name, active_status: true, date_n_time: getPresentDateTime() }).save()

                res.json({ status: true, message: { alert_message: "New revenue stream details has been added successfully." } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save and edit revenue streams.', err.message)
        res.json({ status: false, message: err.message })
    }
})

router.get('/delete/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)

            const checkQuery = await revenue_streamsM.findOne({ _id: category_row_id })
            if (checkQuery) {
                const checkCategoryPresent = await company_revenue_growthM.findOne({ "revenue_streams.category_row_id": category_row_id })
                if (checkCategoryPresent) {
                    res.json({ status: false, message: { alert_message: "Sorry, revenue stream in use, cannot delete." } })
                }
                else {
                    await revenue_streamsM.deleteOne({ _id: category_row_id })
                    await deleteKeysByPattern('company_revenue_list_*')
                    res.json({ status: true, message: { alert_message: "This revenue stream details has been deleted successfully." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid revenue stream round id " } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete revenue stream.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



module.exports = router