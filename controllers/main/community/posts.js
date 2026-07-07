const express = require('express')
import { getPostsList, getSinglePostDetails, getLeaderboard } from '../../../services/main/community/posts';
import { openai } from '../../../config/openai';
const router = express.Router()
const { getPresentDateTime, arrangeValidation, validateAndSaveImage } = require('../../../utils/helpers/helper')
const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
const { sendAcademyEmail, sendCommunityEmail } = require('../../../config/email')
const { check, validationResult } = require('express-validator')
const community_groupsM = require('../../../models/main/community/community_groupsM')
const community_postsM = require('../../../models/main/community/community_postsM')
const community_likesM = require('../../../models/main/community/community_likesM')
const community_commentsM = require('../../../models/main/community/community_commentsM')
const professionalsM = require('../../../models/app/professionalsM')
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM');
const { getUserProfileWithScore, sendJobEligibilityEmail, calculateUserProfileScore } = require('../../../utils/helpers/app_helper');
const professionals_pointsM = require('../../../models/app/users/professionals_pointsM');
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.get('/group_list', async (req, res) => {
    try {
        const groups = await community_groupsM.find(
            {},
            { _id: 1, name: 1, hashtag: 1, icon: 1, date: 1 }
        ).sort({ _id: 1 });
        return res.json({ status: true, message: groups });

    } catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/add_details', [
    check('content').trim().notEmpty().withMessage('Post content is required.')
        .isLength({ max: 200 }).withMessage('The Post content field must be less than 200 characters.'),
    check('group_id').notEmpty().withMessage('Group ID is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        // Token validation
        const checkToken = checkUserLoginToken(req.headers);
        if (checkToken.status) {

            let imageName = '';
            if (!Object.keys(errObj).length && req.body.image) {
                const validateImage = await validateAndSaveImage(req.body.image, 11);
                if (!validateImage.status) {
                    errObj['image'] = 'Invalid post image.';
                } else {
                    imageName = validateImage.webp_file_name;
                }
            }
            const groupExists = await community_groupsM.findOne({ _id: req.body.group_id })
            if (!groupExists) {
                errObj['group_id'] = 'Group ID does not exist';
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            // Create post object
            const postData = new community_postsM({
                content: req.body.content,
                user_row_id: checkToken.message,
                group_id: req.body.group_id,
                image: imageName,
                repost_user_row_id: null,
                is_repost: false,
                date: getPresentDateTime()
            });

            await postData.save();
            const points = await professionals_pointsM.findOne({ user_row_id: checkToken.message, point_type: "job_apply_eligibility" })
            if (!points) {
                const certificate_exists = await courses_certificatesM.exists({ user_row_id: checkToken.message });
                const total_completion = await getUserProfileWithScore(checkToken.message)
                if (certificate_exists && total_completion >= 70) {
                    const user = await professionalsM.findOne(
                        { _id: checkToken.message },
                        { full_name: 1, email_id: 1 }
                    );
                    const pointEntry = new professionals_pointsM({
                        user_row_id,
                        points: '40',
                        point_type: "job_apply_eligibility",
                        point_status: "credited"
                    });
                    await pointEntry.save();
                    sendJobEligibilityEmail({ email_id: user?.email_id, full_name: user?.full_name })
                }
            }
            await calculateUserProfileScore(checkToken.message, ['community'])

            await deleteKeysByPattern('job_list_*')

            return res.json({
                status: true,
                message: { alert_message: 'Post created successfully.' }
            });
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

router.post('/add_repost_details', [
    check('post_id').notEmpty().withMessage('Post content is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        // Token validation
        const checkToken = checkUserLoginToken(req.headers);
        if (checkToken.status) {
            const postDetails = await community_postsM.findOne({ _id: req.body.post_id })
            if (!postDetails) {
                errObj['post_id'] = 'Post ID does not exist';
            }
            const existingPost = await community_postsM.findOne({ repost_id: req.body.post_id, repost_user_row_id: checkToken.message })
            if (existingPost) {
                errObj['alert_message'] = 'You’ve already reposted this post.';
            }

            if (postDetails?.user_row_id == checkToken.message) {
                errObj['alert_message'] = 'You can only repost posts from other users.';
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            // Create post object
            const postData = new community_postsM({
                content: postDetails?.content,
                user_row_id: postDetails?.user_row_id,
                group_id: postDetails.group_id,
                image: postDetails.image,
                repost_user_row_id: checkToken.message,
                is_repost: true,
                date: postDetails?.date,
                reposted_date: getPresentDateTime(),
                repost_comment: req.body.repost_comment,
                repost_id: req.body.post_id
            });

            await postData.save();
            return res.json({
                status: true,
                message: { alert_message: "Repost created successfully." }
            });
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

router.get('/get_posts/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = ""
        const checkToken = await checkAllLoginToken(req.headers, [13])
        if (checkToken?.message?.user_type == 1) {
            user_row_id = checkToken?.message?.user_row_id;
        }
        const response = await getPostsList(req, user_row_id)
        return res.json(response)


    } catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err?.message })
    }
});

router.get('/get_single_post/:post_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers);
        let user_row_id = 0;

        if (checkToken.status) {
            user_row_id = checkToken.message;
        }
        const response = await getSinglePostDetails(req, user_row_id);
        return res.json(response);
    } catch (err) {
        console.error(err);
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});

router.get('/delete_post/:post_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers);
        let user_row_id = 0;

        if (checkToken.status) {
            user_row_id = checkToken.message;
            const postId = Number.parseInt(req.params.post_id);

            const post = await community_postsM.findOne({ _id: postId });

            if (!post) {
                return res.status(404).json({ status: false, message: 'Post not found.' });
            }
            const isOwner = post.is_repost
                ? post.repost_user_row_id === user_row_id
                : post.user_row_id === user_row_id;

            if (!isOwner) {
                return res.status(403).json({ status: false, message: 'Unauthorized to delete this post.' });
            }
            const now = new Date();
            let createdAt
            if (post?.is_repost) {
                createdAt = new Date(post.reposted_date);
            } else {
                createdAt = new Date(post.date);
            }
            const timeDiff = now.getTime() - createdAt.getTime();

            const oneDayInMs = 24 * 60 * 60 * 1000;

            if (timeDiff > oneDayInMs) {
                return res.status(200).json({
                    success: false,
                    message: "You can only delete a post within 24 hours of creation"
                });
            }


            // Soft delete
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


router.post('/save_like_details', [
    check('post_id')
        .trim().not().isEmpty().withMessage('The Post ID field is required.'),
    check('like_status')
        .trim().not().isEmpty().withMessage('The Like Status field is required.')
], async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
        try {
            const user_row_id = checkToken.message

            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const checkQuery = await community_postsM.findOne({ _id: Number.parseInt(req.body.post_id) }, { _id: 1 })
                if (!checkQuery) {
                    res.json({ status: false, message: { alert_message: "Invalid post id" } })
                }
                let post_id = req.body.post_id

                if (post_id && user_row_id) {
                    const checkLinkQuery = await community_likesM.findOne({ post_id: post_id, user_row_id: user_row_id })
                    if (!checkLinkQuery) {
                        let insertArr = {}
                        insertArr['user_row_id'] = user_row_id
                        insertArr['post_id'] = post_id
                        insertArr['like_status'] = Number.parseInt(req.body.like_status)
                        insertArr['date_n_time'] = getPresentDateTime()

                        const queryRun = new community_likesM(insertArr)
                        await queryRun.save()

                        res.json({ status: true, message: { alert_message: "We appreciate your review." } })
                    }
                    else {
                        checkLinkQuery.like_status = Number.parseInt(req.body.like_status);
                        checkLinkQuery.date_n_time = getPresentDateTime();
                        await checkLinkQuery.save();
                        res.json({ status: true, message: { alert_message: "Your review has been updated." } });
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Please try with valid inputs." } })
                }
            }
        }
        catch (err) {
            console.log('Save like details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    } else {
        res.json(checkToken)
    }
})


router.post('/rewrite', [
    check('content')
        .trim()
        .not()
        .isEmpty()
        .withMessage('The Content field is required.')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const checkToken = checkUserLoginToken(req.headers);
    if (!checkToken.status) {
        return res.json(checkToken);
    }

    try {
        const { content } = req.body;

        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            temperature: 0.5,
            max_output_tokens: 60,
            input: [
                {
                    role: "system",
                    content:
                        "Rewrite the following post with correct grammar, spelling, and punctuation. Improve clarity, sentence structure, and overall flow while preserving the original meaning and tone. Make it sound natural and professional, but still engaging. Ensure the result is under 200 characters."
                },
                {
                    role: "user",
                    content
                }
            ]
        });

        const rewrite = response.output_text?.trim();


        return res.status(200).json({
            content,
            rewrite
        });

    } catch (err) {
        console.error('Rewrite error:', err.message, 'openai');
        return res.status(500).json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});


router.post('/add_comment', [
    check('post_id')
        .trim().not().isEmpty().withMessage('The Post ID field is required.'),
    check('comment')
        .trim().not().isEmpty().withMessage('The Comment field is required.')
], async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
        try {
            const user_row_id = checkToken.message
            const { post_id, comment, parent_comment_id = null } = req.body;

            const postExists = await community_postsM.findOne({ _id: post_id, post_status: true });
            if (!postExists) return res.status(404).json({ status: false, message: 'Post not found.' });
            if (parent_comment_id) {
                const parent = await community_commentsM.findOne({ _id: parent_comment_id });
                if (!parent) return res.status(400).json({ status: false, message: 'Parent comment not found.' });
            }
            const newComment = new community_commentsM({
                post_id,
                user_row_id,
                comment,
                parent_comment_id
            });

            await newComment.save();
            return res.json({
                status: true,
                message: { alert_message: "Comment added successfully." }
            });
        }
        catch (err) {
            console.log('Save like details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    } else {
        res.json(checkToken)
    }
})

router.get('/leaderboard', async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    let user_row_id

    if (checkToken.status) {
        user_row_id = checkToken.message
    }
    try {
        const response = await getLeaderboard(req, user_row_id)
        return res.json(response)
    } catch (err) {
        console.log('Save like details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
});


router.get('/get_user_posts/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [13])
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 10
        let user_row_id
        if (checkUserToken.status) {
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            } else {
                user_row_id = Number.parseInt(req.query.user_row_id)
            }
            const groupId = req.query.group_id ? Number.parseInt(req.query.group_id) : null;

            const exprCondition = {
                $cond: [
                    { $eq: ["$is_repost", true] },
                    { $eq: ["$repost_user_row_id", user_row_id] },
                    { $eq: ["$user_row_id", user_row_id] }
                ]
            };

            const matchStage = {
                $and: [
                    { $expr: exprCondition },
                    { post_status: true },
                    ...(groupId ? [{ group_id: groupId }] : [])
                ]
            };
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
                            image: "$profile_info.profile_image",
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
                    }
                }
            ]);
            const totalCountDoc = await community_postsM.aggregate([
                { $match: matchStage },
                {
                    $count: "totalCount"
                }
            ]);

            const totalCount = totalCountDoc.length > 0 ? totalCountDoc[0].totalCount : 0;


            return res.json({ status: true, message: posts, count: totalCount });
        } else {
            res.json(checkUserToken)
        }
    } catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err?.message })
    }
});



module.exports = router