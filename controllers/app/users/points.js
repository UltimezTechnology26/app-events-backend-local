const express = require('express')
const router = express.Router()

const { checkUserLoginToken } = require('../../../middleware/authorization')
const professionalsM = require('../../../models/app/professionalsM')
const professionals_pointsM = require('../../../models/app/users/professionals_pointsM')

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers);
        const skip = Number.isNaN(Number.parseInt(req.params.skip)) ? 0 : Number.parseInt(req.params.skip);
        const limit = Number.isNaN(Number.parseInt(req.params.limit)) ? 100 : Number.parseInt(req.params.limit);

        if (!checkUserToken.status) return res.json(checkUserToken);

        const user_row_id = checkUserToken.message;

        // Optional date-range filter (YYYY-MM-DD), applied against created_at.
        // Built directly rather than via helper.js's createDateOnly/createEndDateOnly,
        // which have a confirmed server-local-timezone day-shift bug (see the
        // Company Module engagement's Phase H.4 write-up).
        const matchQuery = { user_row_id: user_row_id };
        if (req.query.start_date || req.query.end_date) {
            matchQuery.created_at = {};
            if (req.query.start_date) {
                matchQuery.created_at.$gte = new Date(`${req.query.start_date}T00:00:00.000Z`);
            }
            if (req.query.end_date) {
                matchQuery.created_at.$lte = new Date(`${req.query.end_date}T23:59:59.999Z`);
            }
        }

        const data = await professionals_pointsM.aggregate([
            { $match: matchQuery },
            {
                $addFields: {
                    numeric_points: { $toDouble: "$points" }
                }
            },
            {
                $facet: {
                    all_points: [
                        { $sort: { _id: -1 } },
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                point_type: 1,
                                point_status: 1,
                                points: 1,
                                created_at: 1
                            }
                        }
                    ],
                    totals: [
                        {
                            $group: {
                                _id: null,
                                total_credited: {
                                    $sum: {
                                        $cond: [
                                            { $eq: ["$point_status", "credited"] },
                                            "$numeric_points",
                                            0
                                        ]
                                    }
                                },
                                total_debited: {
                                    $sum: {
                                        $cond: [
                                            { $eq: ["$point_status", "debited"] },
                                            "$numeric_points",
                                            0
                                        ]
                                    }
                                }
                            }
                        },
                        {
                            $addFields: {
                                total_balance: { $subtract: ["$total_credited", "$total_debited"] }
                            }
                        }
                    ],
                    // CONFIRMED BUG FIX: total_entries used to be all_points.length, but
                    // all_points is the $skip/$limit'd page — that caps the reported total at
                    // the page size instead of the real match count. This branch counts the
                    // unpaginated match set, matching the pattern referrals.js and
                    // modules/common/common.pagination.ts already use elsewhere.
                    total_count: [
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const result = data[0];
        const totals = result.totals[0] || {
            total_credited: 0,
            total_debited: 0,
            total_balance: 0
        };

        res.json({
            status: true,
            total_entries: result?.total_count?.[0]?.count || 0,
            ...totals,
            points: result.all_points
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});


module.exports = router