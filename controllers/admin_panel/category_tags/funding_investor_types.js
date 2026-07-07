const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const funding_investor_typesM = require('../../../models/app/static/funding_investor_typesM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
router.get('/list', async (req, res) => {
    try {

        const matchQuery = {};

        if (req.query.search) {
            matchQuery.category_name = {
                $regex: req.query.search.trim(),
                $options: "i"
            };
        }

        if (req.query.investor_type && !Number.isNaN(Number.parseInt(req.query.investor_type))) {
            matchQuery.investor_type = Number.parseInt(req.query.investor_type);
        }

        const result = await funding_investor_typesM.aggregate([

            { $match: matchQuery },

            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { type_id: "$_id", inv_type: "$investor_type" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$investor_category_row_id", "$$type_id"] },
                                        { $eq: ["$investor_type", "$$inv_type"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "fundings"
                }
            },

            {
                $addFields: {
                    user_ids: {
                        $setUnion: [
                            {
                                $map: {
                                    input: {
                                        $filter: {
                                            input: "$fundings",
                                            as: "f",
                                            cond: { $eq: ["$$f.investor_type", 1] }
                                        }
                                    },
                                    as: "u",
                                    in: "$$u.investor_row_id"
                                }
                            },
                            []
                        ]
                    },
                    company_ids: {
                        $setUnion: [
                            {
                                $map: {
                                    input: {
                                        $filter: {
                                            input: "$fundings",
                                            as: "f",
                                            cond: { $eq: ["$$f.investor_type", 2] }
                                        }
                                    },
                                    as: "c",
                                    in: "$$c.investor_row_id"
                                }
                            },
                            []
                        ]
                    }
                }
            }
            ,

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_ids",
                    foreignField: "_id",
                    as: "users"
                }
            },

            // 5️⃣ LOOKUP COMPANIES (ALWAYS)
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_ids",
                    foreignField: "_id",
                    as: "companies"
                }
            },

            // 6️⃣ SINGLE SET OF COUNTS (BASED ON investor_type)
            {
                $addFields: {

                    pending_count: {
                        $cond: [
                            { $eq: ["$investor_type", 1] },
                            // 👤 USERS
                            {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "u",
                                        cond: {
                                            $and: [
                                                { $eq: ["$$u.approval_status", 0] },
                                                { $eq: ["$$u.login_status", 1] }
                                            ]
                                        }
                                    }
                                }
                            },
                            // 🏢 COMPANIES
                            {
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
                            }
                        ]
                    },

                    approved_count: {
                        $cond: [
                            { $eq: ["$investor_type", 1] },
                            {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "u",
                                        cond: {
                                            $and: [
                                                { $eq: ["$$u.approval_status", 1] },
                                                { $eq: ["$$u.login_status", 1] }
                                            ]
                                        }
                                    }
                                }
                            },
                            {
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
                            }
                        ]
                    },

                    disabled_count: {
                        $cond: [
                            { $eq: ["$investor_type", 1] },
                            {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "u",
                                        cond: { $eq: ["$$u.login_status", 0] }
                                    }
                                }
                            },
                            {
                                $size: {
                                    $filter: {
                                        input: "$companies",
                                        as: "c",
                                        cond: { $eq: ["$$c.active_status", 0] }
                                    }
                                }
                            }
                        ]
                    },

                    rejected_count: {
                        $cond: [
                            { $eq: ["$investor_type", 1] },
                            {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "u",
                                        cond: { $eq: ["$$u.approval_status", 2] }
                                    }
                                }
                            },
                            {
                                $size: {
                                    $filter: {
                                        input: "$companies",
                                        as: "c",
                                        cond: { $eq: ["$$c.approval_status", 2] }
                                    }
                                }
                            }
                        ]
                    }
                }
            },

            // 7️⃣ CLEANUP
            {
                $project: {
                    fundings: 0,
                    users: 0,
                    companies: 0,
                    user_ids: 0,
                    company_ids: 0
                }
            }
        ]);

        return res.json({ status: true, message: result });

    } catch (err) {
        console.log("Investor Type Count Error:", err.message);
        return res.json({ status: false, message: err.message });
    }
});








router.post('/save_n_edit', [
    check('category_name')
        .trim().not().isEmpty().withMessage('The investor category name field is required.'),
    check('investor_type')
        .trim().not().isEmpty().withMessage('The investor type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The investor type field contains only 1 or 2.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let category_row_id = 0
        if (req.body.category_row_id) {
            category_row_id = Number.parseInt(req.body.category_row_id)

            const checkFunding = await funding_investor_typesM.findOne({ _id: category_row_id })
            if (!checkFunding) {
                errObj['category_row_id'] = "Invalid funding investor type row id"
            }
        }

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            const normalizedName = req.body.category_name.trim().toLowerCase()

            const checkExisting = await funding_investor_typesM.findOne({
                $expr: {
                    $eq: [
                        { $toLower: "$category_name" },
                        normalizedName
                    ]
                }
            })

            if (checkExisting) {
                return res.json({
                    status: false,
                    message: { category_name: 'This category is already exists.' }
                })
            }

            else {
                let update_object = {}
                update_object['investor_type'] = Number.parseInt(req.body.investor_type)
                update_object['category_name'] = req.body.category_name.trim()

                if (category_row_id) {
                    await funding_investor_typesM.updateOne({ _id: category_row_id },
                        {
                            $set: update_object
                        })
                    await deleteKeysByPattern('app_funding_investor_types_*')
                    res.json({ status: true, message: { alert_message: "This funding investor type details has been updated successfully." } })
                }
                else {
                    update_object['date_n_time'] = getPresentDateTime()

                    await funding_investor_typesM(update_object).save()
                    await deleteKeysByPattern('app_funding_investor_types_*')
                    res.json({ status: true, message: { alert_message: "New funding investor type details has been added successfully." } })
                }
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save and edit funding investor type.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)

            const checkQuery = await funding_investor_typesM.findOne({ _id: category_row_id })
            if (checkQuery) {
                const checkCategoryPresent = await fundingInvestmentM.findOne({ investor_category_row_id: category_row_id })
                if (checkCategoryPresent) {
                    res.json({ status: false, message: { alert_message: "Sorry, funding investor type in use, cannot delete." } })
                }
                else {
                    await funding_investor_typesM.deleteOne({ _id: category_row_id })
                    await deleteKeysByPattern('app_funding_investor_types_*')
                    res.json({ status: true, message: { alert_message: "This funding investor type details has been deleted successfully." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid funding investor type round id " } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete funding investor type.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



module.exports = router