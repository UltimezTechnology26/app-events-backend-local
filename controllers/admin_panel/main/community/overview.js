require('dotenv').config()
const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../../middleware/authorization');
const community_postsM = require('../../../../models/main/community/community_postsM');
const community_commentsM = require('../../../../models/main/community/community_commentsM');
const community_likesM = require('../../../../models/main/community/community_likesM');

function getDateRangeFilter(rangeType) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (rangeType) {
        case "today":
            return { $gte: startOfToday };
        case "7days":
            return { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) };
        case "1month":
            return { $gte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()) };
        case "3months":
            return { $gte: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()) };
        case "6months":
            return { $gte: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()) };
        default:
            return null;
    }
}

router.get('/details', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const date = req?.query.date
            const allposts = await community_postsM.countDocuments(
                { post_status: true }
            ).lean();
            const allDeletedPosts = await community_postsM.countDocuments(
                { post_status: false }
            ).lean();
            const dateFilter = getDateRangeFilter(date);
            const likedMatchCondition = {
                ...(dateFilter ? { date: dateFilter } : {}), // add date only if filter exists
                like_status: 1,
            };
            const topLikedPosts = await community_likesM.aggregate([
                {
                    $match: likedMatchCondition
                },
                {
                    $group: {
                        _id: "$post_id",
                        likeCount: { $sum: 1 }
                    }
                },
                { $sort: { likeCount: -1 } },
                {
                    $lookup: {
                        from: "cln_main_community_posts",
                        let: { postId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$postId"] },
                                            { $eq: ["$post_status", true] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "post"
                    }
                },
                { $unwind: "$post" },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "post.user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "post.repost_user_row_id",
                        foreignField: "_id",
                        as: "repost_user_info"
                    }
                },
                { $unwind: { path: "$repost_user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "post.user_row_id",
                        foreignField: "user_row_id",
                        as: "profile_info"
                    }
                },
                { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "post.repost_user_row_id",
                        foreignField: "user_row_id",
                        as: "repost_user_profile"
                    }
                },
                { $unwind: { path: "$repost_user_profile", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_main_community_groups",
                        localField: "post.group_id",
                        foreignField: "_id",
                        as: "group_details"
                    }
                },
                { $unwind: { path: "$group_details", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: "$post._id",
                        likeCount: 1,
                        post_content: "$post.content",
                        post_images: "$post.images",
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        user_pro_batch: "$user_info.pro_batch",
                        user_email: "$user_info.email",
                        user_profile_image: "$profile_info.profile_image",
                        repost_full_name: "$repost_user_info.full_name",
                        repost_user_name: "$repost_user_info.user_name",
                        repost_pro_batch: "$repost_user_info.pro_batch",
                        repost_user_email: "$repost_user_info.email",
                        repost_user_profile_image: "$repost_user_profile.profile_image",
                        group_name: "$group_details.name",
                        group_hastag: "$group_details.hashtag",
                        date: "$post.date",
                        reposted_date: "$post.reposted_date",
                        is_repost: "$post.is_repost",
                        repost_id: "$user_info.repost_id",
                    }
                }
            ]);
            const commentedmatchCondition = {
                ...(dateFilter ? { date: dateFilter } : {}), // add date only if filter exists
                parent_comment_id: null,
            };
            const topCommentedPosts = await community_commentsM.aggregate([
                {
                    $match: commentedmatchCondition
                },
                {
                    $group: {
                        _id: "$post_id",
                        commentCount: { $sum: 1 }
                    }
                },
                { $sort: { commentCount: -1 } },
                {
                    $lookup: {
                        from: "cln_main_community_posts",
                        let: { postId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$postId"] },
                                            { $eq: ["$post_status", true] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "post"
                    }
                },
                { $unwind: "$post" },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "post.user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "post.repost_user_row_id",
                        foreignField: "_id",
                        as: "repost_user_info"
                    }
                },
                { $unwind: { path: "$repost_user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "post.user_row_id",
                        foreignField: "user_row_id",
                        as: "profile_info"
                    }
                },
                { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "post.repost_user_row_id",
                        foreignField: "user_row_id",
                        as: "repost_user_profile"
                    }
                },
                { $unwind: { path: "$repost_user_profile", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_main_community_groups",
                        localField: "post.group_id",
                        foreignField: "_id",
                        as: "group_details"
                    }
                },
                { $unwind: { path: "$group_details", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: "$post._id",
                        commentCount: 1,
                        post_content: "$post.content",
                        post_images: "$post.images",
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        user_pro_batch: "$user_info.pro_batch",
                        user_email: "$user_info.email",
                        user_profile_image: "$profile_info.profile_image",
                        repost_full_name: "$repost_user_info.full_name",
                        repost_user_name: "$repost_user_info.user_name",
                        repost_pro_batch: "$repost_user_info.pro_batch",
                        repost_user_email: "$repost_user_info.email",
                        repost_user_profile_image: "$repost_user_profile.profile_image",
                        group_name: "$group_details.name",
                        group_hastag: "$group_details.hashtag",
                        date: "$post.date",
                        reposted_date: "$post.reposted_date",
                        is_repost: "$post.is_repost",
                        repost_id: "$user_info.repost_id"
                    }
                }
            ]);
            const repostedmatchCondition = {
                ...(dateFilter ? { date: dateFilter } : {}), // add date only if filter exists
                is_repost: true,
                post_status: true,
                repost_id: { $ne: null },
            };
            const topRepostedPosts = await community_postsM.aggregate([
                {
                    $match: repostedmatchCondition
                },
                {
                    $group: {
                        _id: "$repost_id",
                        repostCount: { $sum: 1 }
                    }
                },
                { $sort: { repostCount: -1 } },
                {
                    $lookup: {
                        from: "cln_main_community_posts",
                        let: { postId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$postId"] },
                                            { $eq: ["$post_status", true] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "post"
                    }
                },
                { $unwind: "$post" },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "post.user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "post.repost_user_row_id",
                        foreignField: "_id",
                        as: "repost_user_info"
                    }
                },
                { $unwind: { path: "$repost_user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "post.user_row_id",
                        foreignField: "user_row_id",
                        as: "profile_info"
                    }
                },
                { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "post.repost_user_row_id",
                        foreignField: "user_row_id",
                        as: "repost_user_profile"
                    }
                },
                { $unwind: { path: "$repost_user_profile", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_main_community_groups",
                        localField: "post.group_id",
                        foreignField: "_id",
                        as: "group_details"
                    }
                },
                { $unwind: { path: "$group_details", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: "$post._id",
                        repostCount: 1,
                        post_content: "$post.content",
                        post_images: "$post.images",
                        is_repost: "$post.is_repost",
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        user_pro_batch: "$user_info.pro_batch",
                        user_email: "$user_info.email",
                        user_profile_image: "$profile_info.profile_image",
                        repost_full_name: "$repost_user_info.full_name",
                        repost_user_name: "$repost_user_info.user_name",
                        repost_pro_batch: "$repost_user_info.pro_batch",
                        repost_user_email: "$repost_user_info.email",
                        repost_user_profile_image: "$repost_user_profile.profile_image",
                        group_name: "$group_details.name",
                        group_hastag: "$group_details.hashtag",
                        date: "$post.date",
                        reposted_date: "$post.reposted_date",
                        repost_id: "$user_info.repost_id"
                    }
                }
            ]);



            return res.json({
                status: true, message: {
                    total_posts: allposts,
                    total_deleted_posts: allDeletedPosts,
                    top_liked_posts: topLikedPosts,
                    top_commented_posts: topCommentedPosts,
                    top_reposted_posts: topRepostedPosts
                }
            });
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

async function getConditionalPostCount(start, end, group_id) {
    const result = await community_postsM.aggregate([
        {
            $match: {
                group_id: group_id,
                post_status: true,
                $expr: {
                    $and: [
                        {
                            $gte: [
                                {
                                    $cond: {
                                        if: "$is_repost",
                                        then: "$reposted_date",
                                        else: "$date"
                                    }
                                },
                                start
                            ]
                        },
                        {
                            $lt: [
                                {
                                    $cond: {
                                        if: "$is_repost",
                                        then: "$reposted_date",
                                        else: "$date"
                                    }
                                },
                                end
                            ]
                        }
                    ]
                }
            }
        },
        { $count: "count" }
    ]);
    return result[0]?.count || 0;
}

router.get('/group_details/:group_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const group_id = Number.parseInt(req.params.group_id)
            const posts = await community_postsM.find(
                { group_id: group_id, post_status: true },
                { _id: 1, is_repost: 1 }
            ).lean();

            const allPostIds = posts.map(p => p._id);
            const [totalComments, totalLikes, totalDislikes, totalReposts] = await Promise.all([
                community_commentsM.countDocuments({ post_id: { $in: allPostIds } }),

                community_likesM.countDocuments({
                    post_id: { $in: allPostIds },
                    like_status: 1
                }),

                community_likesM.countDocuments({
                    post_id: { $in: allPostIds },
                    like_status: 2
                }),

                community_postsM.countDocuments({
                    repost_id: { $in: allPostIds },
                    is_repost: true,
                    post_status: true
                })
            ]);

            const totalGroupPosts = allPostIds.length;

            const now = new Date();
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(todayStart.getDate() - 1);
            const [
                todayLikeCount, yesterdayLikeCount,
                todayDislikeCount, yesterdayDislikeCount,
                todayCommentCount, yesterdayCommentCount,
                todayRepostCount, yesterdayRepostCount
            ] = await Promise.all([
                community_likesM.countDocuments({
                    post_id: { $in: allPostIds },
                    like_status: 1,
                    date_n_time: { $gte: todayStart, $lt: tomorrowStart }
                }),
                community_likesM.countDocuments({
                    post_id: { $in: allPostIds },
                    like_status: 1,
                    date_n_time: { $gte: yesterdayStart, $lt: todayStart }
                }),

                community_likesM.countDocuments({
                    post_id: { $in: allPostIds },
                    like_status: 2,
                    date_n_time: { $gte: todayStart, $lt: tomorrowStart }
                }),
                community_likesM.countDocuments({
                    post_id: { $in: allPostIds },
                    like_status: 2,
                    date_n_time: { $gte: yesterdayStart, $lt: todayStart }
                }),

                community_commentsM.countDocuments({
                    post_id: { $in: allPostIds },
                    date: { $gte: todayStart, $lt: tomorrowStart }
                }),
                community_commentsM.countDocuments({
                    post_id: { $in: allPostIds },
                    date: { $gte: yesterdayStart, $lt: todayStart }
                }),

                community_postsM.countDocuments({
                    group_id: group_id,
                    is_repost: true,
                    post_status: true,
                    reposted_date: { $gte: todayStart, $lt: tomorrowStart }
                }),
                community_postsM.countDocuments({
                    group_id: group_id,
                    is_repost: true,
                    post_status: true,
                    reposted_date: { $gte: yesterdayStart, $lt: todayStart }
                }),
            ]);
            const todayPostCount = await getConditionalPostCount(todayStart, tomorrowStart, group_id);
            const yesterdayPostCount = await getConditionalPostCount(yesterdayStart, todayStart, group_id);

            // Helper function to calculate % change
            function getPercentageChange(today, yesterday) {
                if (yesterday === 0) return today > 0 ? 100 : 0;
                return ((today - yesterday) / yesterday) * 100;
            }

            return res.json({
                status: true, message: {
                    total_group_posts: totalGroupPosts,
                    total_comments: totalComments,
                    total_likes: totalLikes,
                    total_dislikes: totalDislikes,
                    total_reposts: totalReposts,
                    post_change_percentage: Math.round(getPercentageChange(todayPostCount, yesterdayPostCount) * 100) / 100,
                    like_change_percentage: Math.round(getPercentageChange(todayLikeCount, yesterdayLikeCount) * 100) / 100,
                    dislike_change_percentage: Math.round(getPercentageChange(todayDislikeCount, yesterdayDislikeCount) * 100) / 100,
                    comment_change_percentage: Math.round(getPercentageChange(todayCommentCount, yesterdayCommentCount) * 100) / 100,
                    repost_change_percentage: Math.round(getPercentageChange(todayRepostCount, yesterdayRepostCount) * 100) / 100
                }
            });
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




module.exports = router