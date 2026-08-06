const express = require('express')
const router = express.Router()

const { checkUserLoginToken } = require('../../../middleware/authorization')
const professionalsM = require('../../../models/app/professionalsM')

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const user_row_id = checkUserToken.message

            // Optional date-range filter (YYYY-MM-DD), applied against created_date_n_time
            // on BOTH the list and count queries so they can't drift apart (the same
            // list/count-filter-mismatch bug class already fixed elsewhere in this
            // codebase). Built directly rather than via helper.js's createDateOnly/
            // createEndDateOnly, which have a confirmed server-local-timezone day-shift bug.
            const matchQuery = { referral_row_id: user_row_id, login_status: 1 }
            if (req.query.start_date || req.query.end_date) {
                matchQuery.created_date_n_time = {}
                if (req.query.start_date) {
                    matchQuery.created_date_n_time.$gte = new Date(`${req.query.start_date}T00:00:00.000Z`)
                }
                if (req.query.end_date) {
                    matchQuery.created_date_n_time.$lte = new Date(`${req.query.end_date}T23:59:59.999Z`)
                }
            }

            const queryRun = await professionalsM.aggregate([
                { $match: matchQuery },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "cln_co"
                    }
                },
                { $unwind: { path: "$cln_co", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_auth_verify_emails",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "verify_email"
                    }
                },
                { $unwind: { path: "$verify_email", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },//,public_view:true
                            { $sort: { start_date: -1 } },
                            { $limit: 1 },
                            {
                                $lookup:
                                {
                                    from: "cln_static_professionals_work_positions",
                                    localField: "position_row_id",
                                    foreignField: "_id",
                                    as: "info_position",
                                    pipeline: [
                                        {
                                            $project: {
                                                _id: 1,
                                                position_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_static_professionals_work_positions",
                                    let: { positions: { $ifNull: ["$positions", []] } },
                                    as: "resolved_static_positions",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.position_row_id" } }]
                                                }
                                            }
                                        },
                                        { $project: { _id: 1, position_name: 1 } }
                                    ]
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_manual_user_positions",
                                    let: { positions: { $ifNull: ["$positions", []] } },
                                    as: "resolved_manual_positions",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.sub_position_row_id" } }]
                                                }
                                            }
                                        },
                                        { $project: { _id: 1, position_name: 1 } }
                                    ]
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_company_lists",
                                    let: {
                                        company_type: '$company_type',
                                        company_row_id: '$company_row_id'
                                    },
                                    as: "info_company",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$company_type'] },
                                                        { $eq: ['$_id', "$$company_row_id"] }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                company_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_company_manual_retrievals",
                                    let: {
                                        company_type: '$company_type',
                                        company_row_id: '$company_row_id'
                                    },
                                    as: "info_manual_company",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, '$$company_type'] },
                                                        { $eq: ['$_id', "$$company_row_id"] }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                company_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    position_name: "$info_position.position_name",
                                    positions: {
                                        $cond: {
                                            if: { $gt: [{ $size: { $ifNull: ["$positions", []] } }, 0] },
                                            then: {
                                                $map: {
                                                    input: { $ifNull: ["$positions", []] },
                                                    as: "p",
                                                    in: {
                                                        position_type: "$$p.position_type",
                                                        position_row_id: "$$p.position_row_id",
                                                        sub_position_row_id: "$$p.sub_position_row_id",
                                                        position_name: {
                                                            $cond: {
                                                                if: { $eq: ["$$p.position_type", 2] },
                                                                then: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_manual_positions", cond: { $eq: ["$$this._id", "$$p.sub_position_row_id"] } } }, in: "$$this.position_name" } }, 0] },
                                                                else: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_static_positions", cond: { $eq: ["$$this._id", "$$p.position_row_id"] } } }, in: "$$this.position_name" } }, 0] }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            else: [{
                                                position_type: "$position_type",
                                                position_row_id: "$position_row_id",
                                                sub_position_row_id: "$sub_position_row_id",
                                                position_name: "$info_position.position_name"
                                            }]
                                        }
                                    },
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                                }
                            },
                            {
                                $project: {
                                    position_name: 1,
                                    company_name: 1,
                                    positions: 1,
                                }
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        id: 1,
                        email_id: 1,
                        full_name: 1,
                        pro_batch: 1,
                        email_verify_status: "$verify_email.email_verify_status",
                        user_name: 1,
                        // CONFIRMED BUG FIX: older professionals predate created_date_n_time being
                        // populated, so fall back to updated_date_n_time (backend-only fix, same
                        // response field name, no frontend change needed).
                        created_date_n_time: { $ifNull: ['$created_date_n_time', '$updated_date_n_time'] },
                        login_status: 1,
                        approval_status: 1,
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        country_name: "$cln_co.country_name",
                        country_flag: "$cln_co.country_flag",
                        profile_image: "$img_info.profile_image",
                        positions: "$info_work.positions",
                    }
                }
            ]).skip(skip).limit(limit)



            const countQuery = await professionalsM.countDocuments(matchQuery)

            res.json({ status: true, message: queryRun, count: countQuery })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Referrals list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router