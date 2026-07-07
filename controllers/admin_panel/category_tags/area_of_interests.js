
const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const user_looking_forM = require('../../../models/app/static/user_looking_forM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')


router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) {
            return res.json(checkToken);
        }

        let filter_array = [];

        if (req.query.search) {
            filter_array.push({
                name: { $regex: req.query.search, $options: "i" }
            });
        }

        if (req.query.status !== undefined) {
            filter_array.push({
                active_status: req.query.status === "1"
            });
        }

        const matchStage = filter_array.length > 0 ? { $and: filter_array } : {};

        const queryRun = await user_looking_forM.aggregate([

            { $match: matchStage },

            {
                $lookup: {
                    from: "cln_professionals",
                    let: { lfId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$lfId",
                                        { $ifNull: ["$looking_for_id", []] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                approval_status: "$approval_status",
                                login_status: "$login_status"
                            }
                        }
                    ],
                    as: "users"
                }
            },
            {
                $addFields: {
                    pending_count: {
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
                    approved_count: {
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

                    rejected_count: {
                        $size: {
                            $filter: {
                                input: "$users",
                                as: "u",
                                cond: { $eq: ["$$u.approval_status", 2] }
                            }
                        }
                    },
                    disabled_count: {
                        $size: {
                            $filter: {
                                input: "$users",
                                as: "u",
                                cond: { $eq: ["$$u.login_status", 0] }
                            }
                        }
                    },
                    deleted_count: {
                        $size: {
                            $filter: {
                                input: "$users",
                                as: "u",
                                cond: { $eq: ["$$u.login_status", 2] }
                            }
                        }
                    }
                }
            },

            { $project: { users: 0 } },

            { $sort: { name: 1 } }
        ]);

        res.json({ status: true, message: queryRun });

    } catch (err) {
        console.log("Looking-for-job list error:", err.message);
        res.json({ status: false, message: err.message });
    }
});




router.post('/save_n_add_user_looking', [
    check('looking_for_name')
        .trim().not().isEmpty().withMessage('The Looking for Name field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj })
            }

            const normalizedName = req.body.looking_for_name.trim().toLowerCase()

            const checkExisting = await user_looking_forM.findOne({
                $expr: {
                    $eq: [
                        { $toLower: "$name" },
                        normalizedName
                    ]
                }
            })

            if (checkExisting) {
                return res.json({
                    status: false,
                    message: { looking_for_name: 'This Area of interest already exists.' }
                })
            }

            const insertArr = new user_looking_forM({
                name: req.body.looking_for_name.trim(),
                date_n_time: getPresentDateTime()
            })

            await insertArr.save()
            await deleteKeysByPattern('app_users_professional_details*')

            res.json({
                status: true,
                message: { alert_message: "New Area of interest details has been added successfully." }
            })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Add user looking for.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/update_looking/:looking_id', [
    check('looking_for_name')
        .trim().not().isEmpty().withMessage('The Looking for field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj })
            }

            const lookingId = Number.parseInt(req.params.looking_id)
            const normalizedName = req.body.looking_for_name.trim().toLowerCase()

            const checkExisting = await user_looking_forM.findOne({
                _id: { $ne: lookingId },
                $expr: {
                    $eq: [
                        { $toLower: "$name" },
                        normalizedName
                    ]
                }
            })

            if (checkExisting) {
                return res.json({
                    status: false,
                    message: { looking_for_name: 'This Area of interest already exists.' }
                })
            }

            await user_looking_forM.updateOne(
                { _id: lookingId },
                {
                    $set: {
                        name: req.body.looking_for_name,
                        date_n_time: getPresentDateTime()
                    }
                }
            )

            await deleteKeysByPattern('app_users_professional_details*')

            res.json({
                status: true,
                message: { alert_message: "This Area of interest details has been updated successfully." }
            })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Update user looking for.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/enable_looking/:looking_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const looking_row_id = Number.parseInt(req.params.looking_id)
            const checkQuery = await user_looking_forM.findOne({ _id: looking_row_id, active_status: false })
            if (checkQuery) {
                await user_looking_forM.updateOne({ _id: looking_row_id }, { $set: { active_status: true } })
                const delted_key = await deleteKeysByPattern('app_users_professional_details*')
                res.json({ status: true, message: { alert_message: "This Area of interest has been enabled successfully." }, delted_key: delted_key })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Area of interest id or already enabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable user looking for.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_looking/:looking_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const looking_row_id = Number.parseInt(req.params.looking_id)
            const checkQuery = await user_looking_forM.findOne({ _id: looking_row_id })
            if (checkQuery) {
                await user_looking_forM.updateOne({ _id: looking_row_id }, { $set: { active_status: false } })
                const delted_key = await deleteKeysByPattern('app_users_professional_details*')
                res.json({ status: true, message: { alert_message: "This Area of interest has been disabled successfully." }, delted_key: delted_key })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Area of interest id or already disabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable user looking for.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_looking_for/:looking_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const looking_row_id = Number.parseInt(req.params.looking_id)
            const checkQuery = await user_looking_forM.findOne({ _id: looking_row_id })
            if (checkQuery) {
                await user_looking_forM.deleteOne({ _id: looking_row_id })
                const delted_key = await deleteKeysByPattern('app_users_professional_details')
                res.json({ status: true, message: { alert_message: "This Area of interest has been deleted successfully." }, delted_key: delted_key })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Area of interest id" } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete user looking for.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router