const express = require('express')
const router = express.Router()
const randomstring = require("randomstring")
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const crypto_categoryM = require('../../../models/app/static/crypto_categoryM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) {
            return res.json(checkToken);
        }

        const result = await crypto_categoryM.aggregate([

            {
                $project: {
                    _id: 1,
                    category_name: 1,
                    description: 1,
                    title: 1,
                    date_n_time: 1,
                    active_status: 1
                }
            },

            {
                $lookup: {
                    from: "cln_company_lists",
                    let: { categoryId: "$_id" },
                    pipeline: [
                        // Convert business_model_id to ARRAY safely
                        {
                            $addFields: {
                                safe_business_model_id: {
                                    $cond: {
                                        if: { $isArray: "$business_model_id" },
                                        then: "$business_model_id",
                                        else: []
                                    }
                                }
                            }
                        },
                        {
                            $match: {
                                $expr: {
                                    $in: ["$$categoryId", "$safe_business_model_id"]
                                }
                            }
                        }
                    ],
                    as: "companies"
                }
            },

            {
                $addFields: {
                    pending_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.approval_status", 0] }
                            }
                        }
                    },
                    approved_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.approval_status", 1] }
                            }
                        }
                    },
                    rejected_count: {
                        $size: {
                            $filter: {
                                input: "$companies",
                                as: "c",
                                cond: { $eq: ["$$c.approval_status", 2] }
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

            { $project: { companies: 0 } },

            { $sort: { category_name: 1 } }
        ]);

        res.json({ status: true, message: result });

    } catch (err) {
        console.log("Crypto category error:", err);
        res.json({ status: false, message: err.message });
    }
});





router.post('/add_n_update_details', [
    check('category_name')
        .trim().not().isEmpty().withMessage('The Category Name field is required'),
    check('category_id')
        .trim().not().isEmpty().withMessage('The Category ID field is required'),
    check('title')
        .trim().not().isEmpty().withMessage('The Title field is required')
], async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            let category_row_id = ""
            if (!Number.isNaN(Number.parseInt(req.body.category_row_id))) {
                category_row_id = Number.parseInt(req.body.category_row_id)
            }


            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const update_array = {}
                update_array['category_name'] = req.body.category_name
                update_array['title'] = req.body.title
                update_array['description'] = req.body.description

                if (!category_row_id) {
                    update_array['category_id'] = await getCategoryID(req.body.category_id)
                    update_array['date_n_time'] = getPresentDateTime()
                    update_array['active_status'] = true

                    await crypto_categoryM(update_array).save()
                    await deleteKeysByPattern('app_company_business_models*')

                    res.json({ status: true, message: { alert_message: "New crypto category details has been added successfulyyyyyyyyyyyyuuuu." } })
                }
                else {
                    const check_category = await crypto_categoryM.findOne({ _id: category_row_id })
                    if (check_category) {
                        await crypto_categoryM.updateOne({ _id: category_row_id }, { $set: update_array })
                        await deleteKeysByPattern('app_company_business_models*')
                        res.json({ status: true, message: { alert_message: "This crypto category details has been updated successfullyyyyyyyyyyy." }, update_array: update_array })
                    }
                    else {
                        res.json({ status: true, message: { alert_message: "Sorry, Invalid category row id." } })
                    }
                }

            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Add and update Crypto category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



const getCategoryID = async function (pass_category_id) {
    try {
        let category_id = pass_category_id.toLowerCase()
        category_id = category_id.replace(/\s/g, '-')
        category_id = category_id.replace(/[^A-Za-z0-9-]/g, '')
        const checkQuery = await crypto_categoryM.findOne({ category_id: { '$regex': category_id, $options: 'i' } }, { _id: 1 })
        if (!checkQuery) {
            return category_id
        }
        else {
            const count_category_query = await crypto_categoryM.countDocuments({ category_id: { '$regex': category_id, $options: 'i' } })
            let new_category_id = category_id + count_category_query

            const check_query = await crypto_categoryM.findOne({ category_id: new_category_id }, { _id: 1 })
            if (check_query) {
                let random_string = randomstring.generate({ length: 2, charset: '0123456789' })
                new_category_id = category_id + count_category_query + random_string
            }
            return new_category_id
        }

    }
    catch (err) {
        console.log('Get category ID.', err.message)
        return ""
    }
}


router.get('/individual_details/:request_row_id', async (req, res) => {

    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await crypto_categoryM.findOne({ _id: request_row_id, active_status: false })
                if (get_query) {
                    res.json({ status: true, message: get_query })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid category row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid category row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Individual Crypto details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await crypto_categoryM.findOne({ _id: request_row_id })
                if (get_query) {
                    await crypto_categoryM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })
                    const delted_key = await deleteKeysByPattern('app_company_business_models*')

                    res.json({ status: true, delted_key: delted_key, message: { alert_message: "This  crypto category details has been enabled successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid category row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid category row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Crypto category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})





router.get('/disable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await crypto_categoryM.findOne({ _id: request_row_id })
                if (get_query) {
                    await crypto_categoryM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })
                    await deleteKeysByPattern('app_company_business_models*')

                    res.json({ status: true, message: { alert_message: "This crypto category details has been disabled successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid category row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid category row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable Crypto category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await crypto_categoryM.findOne({ _id: request_row_id })
            if (checkQuery) {
                await crypto_categoryM.deleteOne({ _id: request_row_id })
                await deleteKeysByPattern('app_company_business_models*')
                res.json({ status: true, message: { alert_message: "This crypto category has been deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid crypto category id " } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Crypto category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router