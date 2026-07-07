const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const professional_positionsM = require('../../../models/app/static/professional_positionsM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) {
            return res.json(checkToken);
        }

        let filter = {};

        if (req.query.search) {
            filter.position_name = { $regex: req.query.search.trim(), $options: "i" };
        }

        if (req.query.active_status === "1") {
            filter.active_status = true;
        } else if (req.query.active_status === "0") {
            filter.active_status = false;
        }

        const result = await professional_positionsM.aggregate([

            { $match: filter },

            {
                $lookup: {
                    from: "cln_professionals_work_experiences",
                    localField: "_id",
                    foreignField: "position_row_id",
                    as: "work_experience"
                }
            },
            {
                $addFields: {
                    user_ids: {
                        $setUnion: [
                            {
                                $map: {
                                    input: "$work_experience",
                                    as: "we",
                                    in: "$$we.user_row_id"
                                }
                            },
                            []
                        ]
                    },
                    company_ids: {
                        $setUnion: [
                            {
                                $map: {
                                    input: "$work_experience",
                                    as: "we",
                                    in: "$$we.company_row_id"
                                }
                            },
                            []
                        ]
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
                $lookup: {
                    from: "cln_company_deleted_history_lists",
                    let: { companyIds: "$company_ids" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ["$company_row_id", "$$companyIds"]
                                }
                            }
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
                    },



                }
            },
            {
                $addFields: {
                    company_deleted_count: {
                        $size: "$deleted_companies"
                    }
                }
            },

            {
                $project: {
                    work_experience: 0,
                    users: 0,
                    companies: 0
                }
            },

            { $sort: { position_name: 1 } }
        ]);

        res.json({ status: true, message: result });

    } catch (err) {
        console.log("Work positions list error:", err.message);
        res.json({ status: false, message: err.message });
    }
});




router.post('/update_position_details', [
    check('position_name')
        .trim().not().isEmpty().withMessage('The position name  field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            let position_row_id = ""
            if (req.body.position_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.position_row_id))) {
                    position_row_id = Number.parseInt(sanitize(req.body.position_row_id))
                    const check_query = await professional_positionsM.findOne({ _id: position_row_id }, { _id: 1 })
                    if (!check_query) {
                        errObj['position_row_id'] = 'Sorry, Invalid position row id'
                    }
                }
            }
            let position_name = ""
            if (req.body.position_name) {
                position_name = sanitize(req.body.position_name)
                const check_query = await professional_positionsM.findOne({ _id: { $ne: position_row_id }, position_name: position_name }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
                if (check_query) {
                    errObj['position_name'] = 'Sorry, This position name is already exist.'
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }


            else {

                let update_array = {}
                update_array['position_name'] = sanitize(req.body.position_name)
                if (position_row_id) {
                    await professional_positionsM.updateOne({ _id: position_row_id }, { $set: update_array })
                    const delted_key = await deleteKeysByPattern('app_positions_list*')
                    res.json({ status: true, delted_key: delted_key, message: { alert_message: "The users work position details has been updated successfully." } })
                }
                else {
                    update_array['date_n_time'] = getPresentDateTime()
                    update_array['active_status'] = true

                    await professional_positionsM(update_array).save()
                    await deleteKeysByPattern('app_positions_list*')
                    res.json({ status: true, message: { alert_message: "This users work position details has been added successfully." } })
                }

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update User positions.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable_position/:position_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const position_row_id = Number.parseInt(sanitize(req.params.position_row_id))
            const checkQuery = await professional_positionsM.findOne({ _id: position_row_id, active_status: false })
            if (checkQuery) {
                await professional_positionsM.updateOne({ _id: position_row_id }, { $set: { active_status: true } })
                await deleteKeysByPattern('app_positions_list*')
                res.json({ status: true, message: { alert_message: "This position details has been enabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid position row id or already enabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable User positions.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_position/:position_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const position_row_id = Number.parseInt(sanitize(req.params.position_row_id))
            const checkQuery = await professional_positionsM.findOne({ _id: position_row_id, active_status: true })
            if (checkQuery) {
                await professional_positionsM.updateOne({ _id: position_row_id }, { $set: { active_status: false } })
                await deleteKeysByPattern('app_positions_list*')
                res.json({ status: true, message: { alert_message: "This position details has been disabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid position row id or already disabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable User positions.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_position/:position_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const position_row_id = Number.parseInt(sanitize(req.params.position_row_id))
            const checkQuery = await professional_positionsM.findOne({ _id: position_row_id })
            if (checkQuery) {
                await professional_positionsM.deleteOne({ _id: position_row_id })
                await deleteKeysByPattern('app_positions_list*')
                res.json({ status: true, message: { alert_message: "This position details has been deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid position row id" } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete User positions.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router
