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

        const data = await professionals_pointsM.aggregate([
            { $match: { user_row_id: user_row_id } },
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
                                createdAt: 1
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
            total_entries: result?.all_points?.length || 0,
            ...totals,
            points: result.all_points
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});


module.exports = router