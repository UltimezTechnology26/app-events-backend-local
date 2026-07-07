require('dotenv').config()
const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../../middleware/authorization');
const community_21days_challengeM = require('../../../../models/main/community/community_21days_challengeM');
const community_postsM = require('../../../../models/main/community/community_postsM');

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
            const data = await community_21days_challengeM.aggregate([
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
                                    profile_image: "$img_info.profile_image",
                                    wallet_address: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: "$user_info" },
                {
                    $lookup: {
                        from: "cln_main_community_groups",
                        localField: "group_ids",
                        foreignField: "_id",
                        as: "group_info"
                    }
                },
                { $match: matchConditions },
                { $sort: { date_n_time: -1 } }, // newest first
                { $skip: skip },
                { $limit: limit }
            ]);
            res.json({
                status: true,
                message: data
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

router.get('/get_user_posts/:user_row_id', async (req, res) => {
    try {
        let user_row_id = ""
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            user_row_id = Number.parseInt(req.params.user_row_id);

            const posts = await community_postsM.aggregate([
                {
                    $match: {
                        $expr: {
                            $cond: [
                                { $eq: ["$is_repost", true] },      // If is_repost == true
                                { $eq: ["$repost_user_row_id", user_row_id] }, // match repost_user_row_id
                                { $eq: ["$user_row_id", user_row_id] }         // else match user_row_id
                            ]
                        }
                    }
                },
                {
                    $addFields: {
                        sortDate: {
                            $cond: {
                                if: "$is_repost",
                                then: "$reposted_date",
                                else: "$date"
                            }
                        }
                    }
                },
                { $sort: { sortDate: -1 } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "repost_user_row_id",
                        foreignField: "_id",
                        as: "repost_user_info"
                    }
                },
                { $unwind: { path: "$repost_user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_main_community_groups",
                        localField: "group_id",
                        foreignField: "_id",
                        as: "group_details"
                    }
                },
                { $unwind: { path: "$group_details", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "profile_info"
                    }
                },
                { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "repost_user_row_id",
                        foreignField: "user_row_id",
                        as: "repost_user_profile"
                    }
                },
                { $unwind: { path: "$repost_user_profile", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_main_community_posts",
                        localField: "_id",
                        foreignField: "repost_id",
                        as: "reposts"
                    }
                },
                {
                    $addFields: {
                        repost_count: { $size: "$reposts" }
                    }
                },
                {
                    $lookup: {
                        from: "cln_main_community_user_likes",
                        localField: "_id",
                        foreignField: "post_id",
                        as: "likes_data"
                    }
                },
                {
                    $addFields: {
                        like_count: {
                            $size: {
                                $filter: {
                                    input: "$likes_data",
                                    as: "item",
                                    cond: { $eq: ["$$item.like_status", 1] }
                                }
                            }
                        },
                        dislike_count: {
                            $size: {
                                $filter: {
                                    input: "$likes_data",
                                    as: "item",
                                    cond: { $eq: ["$$item.like_status", 2] }
                                }
                            }
                        },
                        user_like_status: {
                            $let: {
                                vars: {
                                    matched: {
                                        $filter: {
                                            input: "$likes_data",
                                            as: "item",
                                            cond: { $eq: ["$$item.user_row_id", user_row_id] }
                                        }
                                    }
                                },
                                in: {
                                    $cond: {
                                        if: { $gt: [{ $size: "$$matched" }, 0] },
                                        then: { $arrayElemAt: ["$$matched.like_status", 0] },
                                        else: 0 // 0 = no like/dislike
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $lookup: {
                        from: "cln_main_community_post_comments",
                        let: { postId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$post_id", "$$postId"] },
                                            { $eq: ["$parent_comment_id", null] }
                                        ]
                                    }
                                }
                            },
                            { $count: "count" }
                        ],
                        as: "commentCount"
                    }
                },
                {
                    $addFields: {
                        comment_count: {
                            $cond: {
                                if: { $gt: [{ $size: "$commentCount" }, 0] },
                                then: { $arrayElemAt: ["$commentCount.count", 0] },
                                else: 0
                            }
                        }
                    }
                },

                // Final post projection
                {
                    $project: {
                        _id: 1,
                        content: 1,
                        group: {
                            hastag: "$group_details.hashtag",
                            id: "$group_details._id",
                            name: "$group_details.name",
                        },
                        user_details: {
                            _id: "$user_info._id",
                            name: "$user_info.full_name",
                            pro_batch: "$user_info.pro_batch",
                            user_name: "$user_info.user_name",
                            image: "$profile_info.profile_image"
                        },
                        repost_user_details: {
                            _id: "$repost_user_info._id",
                            name: "$repost_user_info.full_name",
                            pro_batch: "$repost_user_info.pro_batch",
                            user_name: "$repost_user_info.user_name",
                            image: "$repost_user_profile.profile_image"
                        },
                        date: 1,
                        image: 1,
                        repost_count: 1,
                        repost_comment: 1,
                        is_repost: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        like_count: 1,
                        dislike_count: 1,
                        user_like_status: 1,
                        comment_count: 1,
                        repost_id: 1,
                        reposted_date: 1,
                        post_status: 1,
                    }
                }
            ]);


            return res.json({ status: true, message: posts });
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }
    } catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err?.message })
    }
});

router.post("/update_valid_status/:id", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const { id } = req.params;
            const { valid_status } = req.body;

            if (typeof valid_status !== "boolean") {
                return res.status(400).json({ status: false, message: "Valid status must be a boolean" });
            }

            const updatedDoc = await community_21days_challengeM.findOneAndUpdate(
                { _id: id },
                { $set: { valid_status } },
                { new: true }
            );

            if (!updatedDoc) {
                return res.status(404).json({ status: false, message: "Document not found" });
            }

            res.json({ status: true, message: "Valid status updated successfully" });
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
});

router.post("/update_released_status/:id", async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const { id } = req.params;
            const { released_status } = req.body;

            if (typeof released_status !== "boolean") {
                return res.status(400).json({ status: false, message: "Released status must be a boolean" });
            }

            const challenge = await community_21days_challengeM.findById(id);

            if (!challenge) {
                return res.status(404).json({ status: false, message: "Challenge not found" });
            }
            if (!challenge.valid_status) {
                return res.status(400).json({ status: false, message: "Cannot release before validating." });
            }

            challenge.released_status = released_status;
            await challenge.save();

            res.json({ status: true, message: "Release status changed successfully" });
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
});


module.exports = router
