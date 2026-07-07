const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const funding_roundsM = require('../../../models/app/static/funding_roundsM')
const funding_investor_typesM = require('../../../models/app/static/funding_investor_typesM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) {
            return res.json(checkToken);
        }

        const filter = {};

        if (req.query.search) {
            filter.category_name = {
                $regex: req.query.search.trim(),
                $options: "i"
            };
        }

        const result = await funding_roundsM.aggregate([

            { $match: filter },

            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    localField: "_id",
                    foreignField: "category_row_id",
                    as: "fundings"
                }
            },

            {
                $addFields: {
                    user_ids: {
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
                    company_ids: {
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
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_ids",
                    foreignField: "_id",
                    as: "users"
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

                    /* 👤 USERS */
                    user_pending_count: {
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

                    user_approved_count: {
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

                    user_rejected_count: {
                        $size: {
                            $filter: {
                                input: "$users",
                                as: "u",
                                cond: {
                                    $and: [
                                        { $eq: ["$$u.approval_status", 2] },
                                        { $eq: ["$$u.login_status", 1] }
                                    ]
                                }
                            }
                        }
                    },

                    user_disabled_count: {
                        $size: {
                            $filter: {
                                input: "$users",
                                as: "u",
                                cond: { $eq: ["$$u.login_status", 0] }
                            }
                        }
                    },

                    user_deleted_count: {
                        $size: {
                            $filter: {
                                input: "$users",
                                as: "u",
                                cond: { $eq: ["$$u.login_status", 2] }
                            }
                        }
                    },

                    /* 🏢 COMPANIES */
                    company_pending_count: {
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

                    company_approved_count: {
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

                    company_rejected_count: {
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

                    company_disabled_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.active_status", 0] }
                            }
                        }
                    },

                }
            },

            {
                $project: {
                    fundings: 0,
                    users: 0,
                    companies: 0
                }
            },

            { $sort: { category_name: 1 } }
        ]);

        return res.json({ status: true, message: result });

    } catch (err) {
        console.log("Funding rounds error:", err.message);
        return res.json({ status: false, message: err.message });
    }
});




router.post('/save_n_edit', [
    check('category_name')
        .trim().not().isEmpty().withMessage('The category name field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let category_row_id = 0
        if (req.body.category_row_id) {
            category_row_id = Number.parseInt(req.body.category_row_id)

            const checkFunding = await funding_roundsM.findOne({ _id: category_row_id })
            if (!checkFunding) {
                errObj['category_row_id'] = "Invalid category row id"
            }
        }

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            const normalizedName = req.body.category_name.trim().toLowerCase()

            const checkExisting = await funding_roundsM.findOne({
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
                    message: { category_name: 'This category is  already exists.' }
                })
            }

            else if (category_row_id > 0) {
                await funding_roundsM.updateOne({ _id: category_row_id }, { $set: { category_name: req.body.category_name.trim() } })
                await deleteKeysByPattern('app_funding_category_list*')
                res.json({ status: true, message: { alert_message: "This funding rounds details has been updated successfully." }, tokenStatus: true })
            }
            else {
                await funding_roundsM({ category_name: req.body.category_name.trim(), active_status: true, date_n_time: getPresentDateTime() }).save()
                await deleteKeysByPattern('app_funding_category_list*')
                res.json({ status: true, message: { alert_message: "New funding rounds details has been added successfully." }, tokenStatus: true })
            }

        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save and edit Funding rounds.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router