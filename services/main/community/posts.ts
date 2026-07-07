import community_postsM from "../../../models/main/community/community_postsM";
import users from "../../../models/app/professionalsM";
import users_profile_images from "../../../models/app/professionals_profile_imagesM";

export const getPostsList = async (req: any, user_row_id: number) => {
    try {
        const searchTerm = req.query.search?.trim() || "";
        const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
        const endDate = req.query.end_date ? new Date(req.query.end_date) : null;

        const matchStage: any = { post_status: true };

        // Date range filter - optimized
        if (startDate && endDate) {
            matchStage.date = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            matchStage.date = { $gte: startDate };
        } else if (endDate) {
            matchStage.date = { $lte: endDate };
        }

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
        const groupId = Number.parseInt(req.query.group_id);

        if (!Number.isNaN(groupId)) {
            matchStage.group_id = groupId;
        }

        const posts = await community_postsM.aggregate([
            { $match: matchStage },
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
                    as: "user_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                pro_batch: 1,
                                email_id: 1,
                                mobile_number: 1,
                                country_mobile_id: 1,
                                login_status: 1,
                                approval_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "repost_user_row_id",
                    foreignField: "_id",
                    as: "repost_user_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                pro_batch: 1,
                                email_id: 1,
                                mobile_number: 1,
                                country_mobile_id: 1,
                                login_status: 1,
                                approval_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$repost_user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_main_community_groups",
                    localField: "group_id",
                    foreignField: "_id",
                    as: "group_details",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                hashtag: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$group_details", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "profile_info",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "repost_user_row_id",
                    foreignField: "user_row_id",
                    as: "repost_user_profile",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$repost_user_profile", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_main_community_posts",
                    localField: "_id",
                    foreignField: "repost_id",
                    as: "reposts",
                    pipeline: [
                        { $project: { _id: 1 } }
                    ]
                }
            },

            // Early search filtering to reduce dataset
            ...(searchTerm ? [{
                $match: {
                    $or: [
                        { "repost_user_info.full_name": { $regex: searchTerm, $options: "i" } },
                        { "user_info.full_name": { $regex: searchTerm, $options: "i" } }
                    ]
                }
            }] : []),

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
                    as: "likes_data",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                like_status: 1
                            }
                        }
                    ]
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
                $lookup: {
                    from: "cln_professionals_followers",
                    let: {
                        targetUserId: {
                            $cond: {
                                if: "$is_repost",
                                then: "$repost_user_info._id",
                                else: "$user_info._id"
                            }
                        },
                        currentUserId: user_row_id
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$following_user_row_id", "$$targetUserId"] },
                                        { $eq: ["$follower_user_row_id", "$$currentUserId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: { confirm_request_status: 1, _id: 0 }
                        }
                    ],
                    as: "follow_status"
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
                    },
                    user_following_status: {
                        $cond: {
                            if: { $gt: [{ $size: "$follow_status" }, 0] },
                            then: { $arrayElemAt: ["$follow_status.confirm_request_status", 0] },
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
                        image: "$profile_info.profile_image",
                        user_name: "$user_info.user_name",
                        login_status: "$user_info.login_status",
                        approval_status: "$user_info.approval_status",
                    },
                    repost_user_details: {
                        _id: "$repost_user_info._id",
                        name: "$repost_user_info.full_name",
                        pro_batch: "$repost_user_info.pro_batch",
                        user_name: "$repost_user_info.user_name",
                        image: "$repost_user_profile.profile_image",
                        login_status: "$repost_user_info.login_status",
                        approval_status: "$repost_user_info.approval_status",
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
                    user_following_status: 1,
                }
            }
        ]);

        const total_posts = await community_postsM.countDocuments(matchStage);

        return { status: true, message: posts, total_posts: total_posts };
    } catch (error: any) {
        return { status: false, message: 'An unexpected error occurred. Please try again later.', err: error?.message }
    }
};

export const getLeaderboard = async (req: any, user_row_id: number) => {
    try {
        const limit = 8;

        // Aggregate post count per user
        const leaderboard = await community_postsM.aggregate([
            { $match: { post_status: true } },
            {
                $group: {
                    _id: "$user_row_id",
                    total_posts: { $sum: 1 }
                }
            },
            { $sort: { total_posts: -1, _id: 1 } }
        ]);

        // Get list of user_row_ids in order
        const userIds = leaderboard.map(item => item._id);

        // Map user_row_id to rank
        const rankMap: { [key: number]: number } = {};
        userIds.forEach((id, index) => { rankMap[id] = index + 1 });

        // Get top users info
        const topUserIds = userIds.slice(0, limit);
        const usersList = await users.find({ _id: { $in: topUserIds } }, {
            full_name: 1, pro_batch: 1, user_name: 1,
            login_status: 1,
            approval_status: 1
        });
        const images = await users_profile_images.find({ user_row_id: { $in: topUserIds } }, { user_row_id: 1, profile_image: 1 });

        const topUsers = topUserIds.map(id => {
            const user = usersList.find((u: any) => u._id === id);
            const img = images.find((i: any) => i.user_row_id === id);
            const postData = leaderboard.find(p => p._id === id);
            return {
                rank: rankMap[id],
                name: user?.full_name || 'Unknown',
                pro_batch: user?.pro_batch || false,
                image_url: img?.profile_image || '',
                user_name: user?.user_name || '',
                total_posts: postData.total_posts,
                login_status: user?.login_status,
                approval_status: user?.approval_status
            };
        });

        // Current user info
        let your_rank_info = null;
        if (user_row_id) {
            const user = await users.findOne({ _id: user_row_id }, {
                full_name: 1, pro_batch: 1, user_name: 1,
                login_status: 1,
                approval_status: 1
            });
            const img = await users_profile_images.findOne({ user_row_id }, { profile_image: 1 });
            if (rankMap[user_row_id]) {
                const total_posts = leaderboard.find(p => p._id === user_row_id)?.total_posts || 0;

                your_rank_info = {
                    rank: rankMap[user_row_id],
                    name: user?.full_name || 'Unknown',
                    pro_batch: user?.pro_batch || false,
                    user_name: user?.user_name || '',
                    image_url: img?.profile_image || '',
                    total_posts,
                    login_status: user?.login_status,
                    approval_status: user?.approval_status
                };
            } else {
                your_rank_info = {
                    rank: userIds?.length + 1,
                    name: user?.full_name || 'Unknown',
                    user_name: user?.user_name || '',
                    pro_batch: user?.pro_batch || false,
                    image_url: img?.profile_image || '',
                    total_posts: 0,
                    login_status: user?.login_status,
                    approval_status: user?.approval_status
                };
            }
        }

        return {
            status: true,
            message: 'Leaderboard fetched',
            leaders: topUsers,
            your_rank: your_rank_info
        };
    } catch (error: any) {
        return { status: false, message: 'An unexpected error occurred. Please try again later.', err: error?.message }
    }
};

export const getSinglePostDetails = async (req: any, user_row_id: number) => {
    try {
        const postId = Number.parseInt(req.params.post_id);

        const existPost = await community_postsM.findOne({ _id: postId, post_status: true }, { _id: 1 })
        if (!existPost) {
            return { status: false, message: 'Post not found.' };
        }

        const posts = await community_postsM.aggregate([
            { $match: { _id: postId } },

            // Optimized user lookup with projection
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                pro_batch: 1,
                                email_id: 1,
                                mobile_number: 1,
                                country_mobile_id: 1,
                                login_status: 1,
                                approval_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            // Optimized repost user lookup with projection
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "repost_user_row_id",
                    foreignField: "_id",
                    as: "repost_user_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                pro_batch: 1,
                                email_id: 1,
                                mobile_number: 1,
                                country_mobile_id: 1,
                                login_status: 1,
                                approval_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$repost_user_info", preserveNullAndEmptyArrays: true } },

            // Optimized group lookup with projection
            {
                $lookup: {
                    from: "cln_main_community_groups",
                    localField: "group_id",
                    foreignField: "_id",
                    as: "group_details",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                hashtag: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$group_details", preserveNullAndEmptyArrays: true } },

            // Optimized profile image lookups with projection
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "profile_info",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "repost_user_row_id",
                    foreignField: "user_row_id",
                    as: "repost_user_profile",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$repost_user_profile", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_main_community_posts",
                    localField: "_id",
                    foreignField: "repost_id",
                    as: "reposts",
                    pipeline: [
                        { $project: { _id: 1 } }
                    ]
                }
            },
            {
                $addFields: {
                    repost_count: { $size: "$reposts" }
                }
            },

            // Likes
            {
                $lookup: {
                    from: "cln_main_community_user_likes",
                    localField: "_id",
                    foreignField: "post_id",
                    as: "likes_data",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                like_status: 1
                            }
                        }
                    ]
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

            // Top-level comments with replies
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
                        { $sort: { date: -1 } },
                        {
                            $lookup: {
                                from: "cln_main_community_post_comments",
                                let: { parentId: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ["$parent_comment_id", "$$parentId"] }
                                        }
                                    },
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        full_name: 1,
                                                        user_name: 1,
                                                        pro_batch: 1,
                                                        login_status: 1,
                                                        approval_status: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup: {
                                            from: "cln_professionals_profile_images",
                                            localField: "user_row_id",
                                            foreignField: "user_row_id",
                                            as: "profile_info",
                                            pipeline: [
                                                {
                                                    $project: {
                                                        user_row_id: 1,
                                                        profile_image: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            comment: 1,
                                            date: 1,
                                            user: {
                                                _id: "$user_info._id",
                                                name: "$user_info.full_name",
                                                user_name: "$user_info.user_name",
                                                pro_batch: "$user_info.pro_batch",
                                                image: "$profile_info.profile_image",
                                                login_status: "$user_info.login_status",
                                                approval_status: "$user_info.approval_status",
                                            }
                                        }
                                    }
                                ],
                                as: "replies"
                            }
                        },

                        // Add user info for top-level comment
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            user_name: 1,
                                            pro_batch: 1,
                                            login_status: 1,
                                            approval_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "user_row_id",
                                foreignField: "user_row_id",
                                as: "profile_info",
                                pipeline: [
                                    {
                                        $project: {
                                            user_row_id: 1,
                                            profile_image: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                comment: 1,
                                date: 1,
                                user: {
                                    _id: "$user_info._id",
                                    name: "$user_info.full_name",
                                    user_name: "$user_info.user_name",
                                    pro_batch: "$user_info.pro_batch",
                                    image: "$profile_info.profile_image",
                                    login_status: "$user_info.login_status",
                                    approval_status: "$user_info.approval_status",
                                },
                                replies: 1
                            }
                        }
                    ],
                    as: "comments"
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
                $lookup: {
                    from: "cln_professionals_followers",
                    let: {
                        targetUserId: {
                            $cond: {
                                if: "$is_repost",
                                then: "$repost_user_info._id",
                                else: "$user_info._id"
                            }
                        },
                        currentUserId: user_row_id
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$following_user_row_id", "$$targetUserId"] },
                                        { $eq: ["$follower_user_row_id", "$$currentUserId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: { confirm_request_status: 1, _id: 0 }
                        }
                    ],
                    as: "follow_status"
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
                    },
                    user_following_status: {
                        $cond: {
                            if: { $gt: [{ $size: "$follow_status" }, 0] },
                            then: { $arrayElemAt: ["$follow_status.confirm_request_status", 0] },
                            else: 0
                        }
                    }
                }
            },

            // Optimized final projection - only required fields
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
                        image: "$profile_info.profile_image",
                        user_name: "$user_info.user_name",
                        login_status: "$user_info.login_status",
                        approval_status: "$user_info.approval_status",
                    },
                    repost_user_details: {
                        _id: "$repost_user_info._id",
                        name: "$repost_user_info.full_name",
                        user_name: "$repost_user_info.user_name",
                        pro_batch: "$repost_user_info.pro_batch",
                        image: "$repost_user_profile.profile_image",
                        login_status: "$repost_user_info.login_status",
                        approval_status: "$repost_user_info.approval_status",
                    },
                    date: 1,
                    image: 1,
                    repost_comment: 1,
                    is_repost: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    like_count: 1,
                    dislike_count: 1,
                    comments: 1,
                    user_like_status: 1,
                    repost_id: 1,
                    repost_count: 1,
                    comment_count: 1,
                    reposted_date: 1,
                    user_following_status: 1
                }
            }
        ]);

        return { status: true, message: posts[0] || null };
    } catch (error) {
        console.error("❌ Error in getSinglePostDetails:", error);
        return {
            status: false,
            message: "Something went wrong while fetching post details."
        }
    }
}