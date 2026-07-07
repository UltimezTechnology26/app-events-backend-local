require('dotenv').config()
const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../../middleware/authorization');
const community_article_requestsM = require('../../../../models/main/community/community_article_requestsM');

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 10;
            const searchTerm = req.query.search?.trim() || "";
            const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
            const endDate = req.query.end_date ? new Date(req.query.end_date) : null;
            const matchConditions = {};
            if (searchTerm) {
                matchConditions.$or = [
                    { "user_info.full_name": { $regex: searchTerm, $options: "i" } },
                    { "user_info.user_name": { $regex: searchTerm, $options: "i" } },
                    { "user_info.email_id": { $regex: searchTerm, $options: "i" } }
                ];
            }

            if (startDate && endDate) {
                matchConditions.date_n_time = { $gte: startDate, $lte: endDate };
            } else if (startDate) {
                matchConditions.date_n_time = { $gte: startDate };
            } else if (endDate) {
                matchConditions.date_n_time = { $lte: endDate };
            }
            const data = await community_article_requestsM.aggregate([
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "cln_professionals_profile_images",
                                    localField: "_id",
                                    foreignField: "user_row_id",
                                    as: "img_info"
                                }
                            },
                            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    full_name: 1,
                                    pro_batch: 1,
                                    approval_status: 1,
                                    email_id: 1,
                                    profile_image: "$img_info.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: "$user_info" },
                { $match: matchConditions },
                { $sort: { date_n_time: -1 } }, // newest first
                { $skip: skip },
                { $limit: limit }
            ]);
            const countResult = await community_article_requestsM.aggregate([
                { $count: "total" }
            ]);

            const totalCount = countResult[0]?.total || 0;
            res.json({
                status: true,
                message: data,
                count: totalCount
            })
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }
    } catch (error) {
        res.json({
            status: false,
            message: { alert_message: "Server Error" },
            error: error?.message
        })
    }
});

router.post("/change_status/:id", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const { id } = req.params;
            const { status, comment } = req.body;

            // Validate status
            if (!["published", "unpublished"].includes(status)) {
                return res.status(400).json({ status: false, message: "Invalid status value" });
            }

            // Update the article
            const updatedArticle = await community_article_requestsM.findOneAndUpdate(
                { _id: id, status: "pending" },
                { status: status, unpublished_comment: status == "unpublished" ? comment : '' },
                { new: true },
            );

            if (!updatedArticle) {
                return res.status(404).json({ status: false, message: "Article request not found" });
            }

            res.json({
                status: true,
                message: `Article status updated to ${status}`,
                data: updatedArticle
            });
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    } catch (error) {
        console.error("Error updating article status:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
});
module.exports = router
