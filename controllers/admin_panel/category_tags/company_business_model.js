const express = require('express')
const router = express.Router()
const randomstring = require("randomstring")
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const crypto_categoryM = require('../../../models/app/static/crypto_categoryM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')
const sanitize = require('mongo-sanitize')


router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) {
            return res.json(checkToken);
        }

        let filter_array = [];

        if (req.query.search) {
            filter_array.push({
                business_name: { $regex: req.query.search, $options: "i" }
            });
        }

        if (req.query.status !== undefined && req.query.status !== "") {
            if (req.query.status == "1" || req.query.status == 1) {
                filter_array.push({ active_status: true });
            } else if (req.query.status == "0" || req.query.status == 0) {
                filter_array.push({ active_status: false });
            }
        }

        const matchStage =
            filter_array.length > 0 ? { $and: filter_array } : {};

        const result = await company_business_modelsM.aggregate([

            { $match: matchStage },
            { $sort: { _id: -1 } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    let: { businessModelId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$businessModelId",
                                        { $ifNull: ["$business_model_id", []] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                approval_status: 1,
                                active_status: 1
                            }
                        }
                    ],
                    as: "companies"
                }
            },
            {
                $lookup: {
                    from: "cln_company_deleted_history_lists",
                    let: { businessModelId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$businessModelId",
                                        { $ifNull: ["$business_model_id", []] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: { _id: 1 }
                        }
                    ],
                    as: "deleted_companies"
                }
            },

            {
                $addFields: {

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
                        $size: "$deleted_companies"
                    }




                }
            },

            { $project: { companies: 0 } },

        ]);

        return res.json({
            status: true,
            message: result
        });

    } catch (err) {
        console.error("Business model company count error:", err);
        return res.json({
            status: false,
            message: err.message
        });
    }
});


router.post('/add_n_update_details', [
    check('business_name')
        .trim().not().isEmpty().withMessage('The Business Name field is required'),
    check('business_id')
        .trim().not().isEmpty().withMessage('The Business ID field is required'),

], async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            let business_row_id = ""
            if (!Number.isNaN(Number.parseInt(req.body.business_row_id))) {
                business_row_id = Number.parseInt(req.body.business_row_id)
            }

            let business_name = "";
            let business_id = "";

            if (req.body.business_name) {
                business_name = sanitize(req.body.business_name).trim();

                const duplicateName = await company_business_modelsM.findOne({
                    _id: { $ne: business_row_id },
                    business_name
                }).collation({ locale: 'en', strength: 2 });

                if (duplicateName) {
                    errObj['business_name'] = 'This Category Name already exists.';
                }
            }

            if (req.body.business_id) {
                business_id = sanitize(req.body.business_id).trim();

                const duplicateId = await company_business_modelsM.findOne({
                    _id: { $ne: business_row_id },
                    business_id
                }).collation({ locale: 'en', strength: 2 });

                if (duplicateId) {
                    errObj['business_id'] = 'This Category  ID already exists.';
                }
            }

            if (Object.keys(errObj).length) {
                return res.json({ status: false, message: errObj });
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const update_array = {}
                update_array['business_name'] = business_name



                if (!business_row_id) {
                    update_array['business_id'] = business_id
                    update_array['date_n_time'] = getPresentDateTime()
                    update_array['active_status'] = true

                    await company_business_modelsM(update_array).save()
                    await deleteKeysByPattern('app_company_business_models*')

                    res.json({ status: true, message: { alert_message: "New Company category details has been added successfuly." } })
                }
                else {
                    const check_category = await company_business_modelsM.findOne({ _id: business_row_id })
                    if (check_category) {
                        await company_business_modelsM.updateOne({ _id: business_row_id }, { $set: update_array })
                        await deleteKeysByPattern('app_company_business_models*')
                        res.json({ status: true, message: { alert_message: "This Company category details has been updated successfully." }, update_array: update_array })
                    }
                    else {
                        res.json({ status: true, message: { alert_message: "Sorry, Invalid business row id." } })
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
        res.json({ status: false, message: err.message })
    }
})

router.post(
    '/add_n_update_details',
    [
        check('business_name')
            .trim()
            .not()
            .isEmpty()
            .withMessage('The Business Name field is required'),

        check('business_id')
            .trim()
            .not()
            .isEmpty()
            .withMessage('The Business ID field is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const errObj = arrangeValidation(errors);

            const checkToken = checkAdminLoginToken(req.headers, [0]);
            if (!checkToken.status) {
                return res.json(checkToken);
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            const categoryRowId = req.body.category_row_id
                ? Number.parseInt(sanitize(req.body.category_row_id))
                : null;

            const businessName = req.body.business_name.trim();
            const businessId = req.body.business_id.trim().toLowerCase();

            const duplicateCheck = await company_business_modelsM.findOne({
                ...(categoryRowId && { _id: { $ne: categoryRowId } }),
                $or: [
                    {
                        $expr: {
                            $eq: [
                                { $toLower: "$business_name" },
                                businessName.toLowerCase()
                            ]
                        }
                    },
                    {
                        $expr: {
                            $eq: [
                                { $toLower: "$business_id" },
                                businessId
                            ]
                        }
                    }
                ]
            });

            if (duplicateCheck) {
                let errorMsg = {};

                if (
                    duplicateCheck.business_name.toLowerCase() ===
                    businessName.toLowerCase()
                ) {
                    errorMsg.business_name =
                        'This Business Name already exists.';
                }

                if (
                    duplicateCheck.business_id.toLowerCase() === businessId
                ) {
                    errorMsg.business_id =
                        'This Business ID already exists.';
                }

                return res.json({
                    status: false,
                    message: errorMsg
                });
            }

            if (categoryRowId) {

                await company_business_modelsM.updateOne(
                    { _id: categoryRowId },
                    {
                        $set: {
                            business_name: businessName,
                            business_id: businessId,
                            date_n_time: getPresentDateTime()
                        }
                    }
                );

                await deleteKeysByPattern('app_company_business_models*');

                return res.json({
                    status: true,
                    message: {
                        alert_message:
                            'Business category updated successfully.'
                    }
                });
            } else {

                const insertArr = new company_business_modelsM({
                    business_name: businessName,
                    business_id: businessId,
                    date_n_time: getPresentDateTime()
                });

                await insertArr.save();

                await deleteKeysByPattern('app_company_business_models*');

                return res.json({
                    status: true,
                    message: {
                        alert_message:
                            'Business category added successfully.'
                    }
                });
            }
        } catch (err) {
            console.log('Add/Update Business Category Error:', err.message);
            return res.json({
                status: false,
                message:
                    'An unexpected error occurred. Please try again later.'
            });
        }
    }
);

router.post(
    '/update_categories/:category_id',
    [
        check('business_name')
            .trim()
            .not()
            .isEmpty()
            .withMessage('The Business Name field is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const errObj = arrangeValidation(errors);

            const checkToken = checkAdminLoginToken(req.headers, [0]);
            if (!checkToken.status) {
                return res.json(checkToken);
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            const categoryId = Number.parseInt(sanitize(req.params.category_id));
            if (!categoryId) {
                return res.json({
                    status: false,
                    message: { alert_message: 'Invalid category id' }
                });
            }

            const businessName = req.body.business_name.trim();
            const businessId = req.body.business_id
                ? req.body.business_id.trim().toLowerCase()
                : "";


            const duplicateName = await company_business_modelsM.findOne({
                _id: { $ne: categoryId },
                $expr: {
                    $eq: [
                        { $toLower: "$business_name" },
                        businessName.toLowerCase()
                    ]
                }
            });

            if (duplicateName) {
                return res.json({
                    status: false,
                    message: {
                        business_name: 'This Business Name already exists.'
                    }
                });
            }

            const updateResult = await company_business_modelsM.updateOne(
                { _id: categoryId },
                {
                    $set: {
                        business_name: businessName,
                        ...(businessId && { business_id: businessId }),
                        date_n_time: getPresentDateTime()
                    }
                }
            );

            if (updateResult.matchedCount === 0) {
                return res.json({
                    status: false,
                    message: { alert_message: 'Category not found' }
                });
            }
            await deleteKeysByPattern('app_company_business_models*')
            return res.json({
                status: true,
                message: {
                    alert_message: 'This Category has been updated successfully.'
                }
            });

        } catch (err) {
            console.error('Update Category Error:', err.message);
            return res.json({
                status: false,
                message: 'An unexpected error occurred. Please try again later.'
            });
        }
    }
);



router.get('/enable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await company_business_modelsM.findOne({ _id: request_row_id })
                if (get_query) {
                    await company_business_modelsM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })
                    const delted_key = await deleteKeysByPattern('app_company_business_models*')

                    res.json({ status: true, delted_key: delted_key, message: { alert_message: "This  Company category details has been enabled successfully." } })
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

                const get_query = await company_business_modelsM.findOne({ _id: request_row_id })
                if (get_query) {
                    await company_business_modelsM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })
                    await deleteKeysByPattern('app_company_business_models*')

                    res.json({ status: true, message: { alert_message: "This Company category details has been disabled successfully." } })
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
            const checkQuery = await company_business_modelsM.findOne({ _id: request_row_id })
            if (checkQuery) {
                await company_business_modelsM.deleteOne({ _id: request_row_id })
                await deleteKeysByPattern('app_company_business_models*')
                res.json({ status: true, message: { alert_message: "This Company category has been deleted successfully." } })
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