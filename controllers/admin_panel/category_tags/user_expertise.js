const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const user_designationsM = require('../../../models/app/static/user_designationsM')
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
                designation_name: { $regex: req.query.search, $options: "i" }
            });
        }

        if (req.query.status !== undefined) {
            filter_array.push({
                active_status: req.query.status === "1"
            });
        }

        let matchStage = filter_array.length > 0 ? { $and: filter_array } : {};

        const queryRun = await user_designationsM.aggregate([

            { $match: matchStage },

            {
                $lookup: {
                    from: "cln_professionals",
                    let: { designationId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$designationId",
                                        { $ifNull: ["$designation_id", []] }  // SAFE ARRAY
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                approval_status: 1,
                                login_status: 1
                            }
                        }
                    ],
                    as: "users"
                }
            },

            // COUNT USERS BY STATUS
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
                                cond: {
                                    $and: [
                                        { $eq: ["$$u.approval_status", 2] },
                                        { $eq: ["$$u.login_status", 1] }
                                    ]
                                }
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
                    },
                    total_users: { $size: "$users" }
                }
            },

            { $project: { users: 0 } },
            { $sort: { designation_name: 1 } }
        ]);

        res.json({ status: true, message: queryRun });

    } catch (err) {
        console.log('User designation list error:', err.message);
        res.json({ status: false, message: err.message });
    }
});





router.post('/save_n_add_position', [
    check('designation_name')
        .trim().not().isEmpty().withMessage('The expertise  field is required')

], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            const normalizedName = req.body.designation_name.trim().toLowerCase()

            const checkExisting = await user_designationsM.findOne({
                $expr: {
                    $eq: [
                        { $toLower: "$designation_name" },
                        normalizedName
                    ]
                }
            })

            if (checkExisting) {
                return res.json({
                    status: false,
                    message: { designation_name: 'This Expertise  is already exists.' }
                })
            }

            else {
                const insertArr = new user_designationsM({ designation_name: req.body.designation_name.trim(), show_in_job_status: req.body.show_in_job_status, date_n_time: getPresentDateTime() })
                await insertArr.save()

                await deleteKeysByPattern('app_users_professional_details*')

                res.json({ status: true, message: { alert_message: "New user expertise has been added successfully." } })

            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save User expertise.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_position/:designation_id', [
    check('designation_name')
        .trim().not().isEmpty().withMessage('The Designation Name field is required')
], async (req, res) => {
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

        const designation_id = Number.parseInt(sanitize(req.params.designation_id));
        const normalizedName = req.body.designation_name.trim().toLowerCase();

        /* ✅ DUPLICATE CHECK (EXCLUDE CURRENT RECORD) */
        const checkExisting = await user_designationsM.findOne({
            _id: { $ne: designation_id },
            $expr: {
                $eq: [
                    { $toLower: "$designation_name" },
                    normalizedName
                ]
            }
        });

        if (checkExisting) {
            return res.json({
                status: false,
                message: { designation_name: 'This expertise tag already exists.' }
            });
        }

        /* UPDATE */
        await user_designationsM.updateOne(
            { _id: designation_id },
            {
                $set: {
                    designation_name: req.body.designation_name.trim(),
                    show_in_job_status: req.body.show_in_job_status,
                    date_n_time: getPresentDateTime()
                }
            }
        );
        await deleteKeysByPattern('app_users_professional_details*')
        res.json({
            status: true,
            message: { alert_message: "This user expertise has been updated successfully." }
        });

    } catch (err) {
        console.log('Update User expertise.', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});


router.get('/enable_position/:designation_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const designation_row_id = Number.parseInt(sanitize(req.params.designation_id))
            const checkQuery = await user_designationsM.findOne({ _id: designation_row_id, active_status: false })
            if (checkQuery) {
                await user_designationsM.updateOne({ _id: designation_row_id }, { $set: { active_status: true } })


                await deleteKeysByPattern('app_users_professional_details')
                res.json({ status: true, message: { alert_message: "This expertise enabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid expertise id or already enabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable User expertise.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_position/:designation_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const designation_row_id = Number.parseInt(sanitize(req.params.designation_id))
            const checkQuery = await user_designationsM.findOne({ _id: designation_row_id })
            if (checkQuery) {
                await user_designationsM.updateOne({ _id: designation_row_id }, { $set: { active_status: false } })

                const delted_key = await deleteKeysByPattern('app_users_professional_details')
                res.json({ status: true, message: { alert_message: "This expertise disabled successfully." }, delted_key: delted_key })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid expertise id or already disabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable User expertise.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_position/:designation_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const designation_row_id = Number.parseInt(sanitize(req.params.designation_id))
            const checkQuery = await user_designationsM.findOne({ _id: designation_row_id })
            if (checkQuery) {
                await user_designationsM.deleteOne({ _id: designation_row_id })

                await deleteKeysByPattern('app_users_professional_details')
                res.json({ status: true, message: { alert_message: "This expertise has been deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid expertise id" } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete User expertise.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router
