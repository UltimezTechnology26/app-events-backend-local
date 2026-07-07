require('dotenv').config()
const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../../middleware/authorization');
const community_postsM = require('../../../../models/main/community/community_postsM');

router.get('/deleted_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]); // Admin role check
        if (!checkToken.status) {
            return res.json({
                status: false,
                message: { alert_message: checkToken.message }
            });
        }
        const searchTerm = req.query.search?.trim() || "";
        const groupId = req.query.group_id ? Number.parseInt(req.query.group_id) : null;
        const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
        const endDate = req.query.end_date ? new Date(req.query.end_date) : null;

        const matchStage = {};

        // Group filter
        if (groupId) {
            matchStage.group_id = groupId;
        }

        // Date range filter
        if (startDate && endDate) {
            matchStage.date = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            matchStage.date = { $gte: startDate };
        } else if (endDate) {
            matchStage.date = { $lte: endDate };
        }

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 10;

        // Your user_row_id if you need like status check
        const user_row_id = checkToken.user_row_id || null;

        const filter = { post_status: false }; // Deleted posts

        const posts = await community_postsM.aggregate([
            { $match: { ...filter, ...matchStage } },
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
            { $skip: skip },
            { $limit: limit },

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
                $match: {
                    ...(searchTerm
                        ? {
                            $or: [
                                { "repost_user_info.full_name": { $regex: searchTerm, $options: "i" } },
                                { "user_info.full_name": { $regex: searchTerm, $options: "i" } }
                            ]
                        }
                        : {})
                }
            },
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
            { $addFields: { repost_count: { $size: "$reposts" } } },

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
                                    else: 0
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

            {
                $project: {
                    _id: 1,
                    content: 1,
                    group: {
                        hashtag: "$group_details.hashtag",
                        id: "$group_details._id",
                        name: "$group_details.name",
                    },
                    user_details: {
                        _id: "$user_info._id",
                        name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        pro_batch: "$user_info.pro_batch",
                        image: "$profile_info.profile_image"
                    },
                    repost_user_details: {
                        _id: "$repost_user_info._id",
                        name: "$repost_user_info.full_name",
                        user_name: "$repost_user_info.user_name",
                        pro_batch: "$repost_user_info.pro_batch",
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

    } catch (error) {
        res.json({
            status: false,
            message: { alert_message: "Server Error" },
            error: error?.message
        });
    }
});

router.get('/delete_post/:post_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);

        if (checkToken.status) {
            const postId = Number.parseInt(req.params.post_id);

            const post = await community_postsM.findOne({ _id: postId, post_status: true });

            if (!post) {
                return res.status(404).json({ status: false, message: 'Post not found.' });
            }
            post.post_status = false;
            await post.save();

            return res.json({
                status: true,
                message: 'Post status set to deleted successfully.',
            });
        } else {
            return res.json({ status: false, message: { alert_message: checkToken.message } });
        }
    } catch (err) {
        console.error("Error in delete_post:", err);
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});

router.get('/overview', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);

        if (!checkToken.status) {
            return res.json({ status: false, message: { alert_message: checkToken.message } });
        }

        // -----------------------------
        // DATE BOUNDARIES
        // -----------------------------
        const now = new Date();

        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const tomorrowStart = new Date(startOfToday);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const last7Days = new Date(startOfToday);
        last7Days.setDate(last7Days.getDate() - 7);

        const last30Days = new Date(startOfToday);
        last30Days.setDate(last30Days.getDate() - 30);

        // -----------------------------
        // AGGREGATION
        // -----------------------------
        const postCounts = await community_postsM.aggregate([
            {
                $match: { post_status: true }
            },
            {
                $group: {
                    _id: null,

                    // TODAY
                    today: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$date", startOfToday] },
                                        { $lt: ["$date", tomorrowStart] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // YESTERDAY
                    yesterday: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$date", startOfYesterday] },
                                        { $lt: ["$date", startOfToday] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // LAST 7 DAYS
                    last7days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$date", last7Days] },
                                        { $lt: ["$date", startOfToday] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // LAST 30 DAYS
                    last30days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$date", last30Days] },
                                        { $lt: ["$date", startOfToday] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const finalData = postCounts[0] || {
            today: 0,
            yesterday: 0,
            last7days: 0,
            last30days: 0
        };

        return res.json({
            status: true,
            message: finalData
        });

    } catch (err) {
        console.error("Error in /overview:", err);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});





module.exports = router