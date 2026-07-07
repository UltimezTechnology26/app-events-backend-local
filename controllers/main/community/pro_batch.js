const express = require('express')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const professionalsM = require('../../../models/app/professionalsM')
const { calculateProfileScore, basic_details_points, social_details_points, sendDollarrewardEmail, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const professionals_faqM = require('../../../models/app/users/professionals_faqM')
const community_groupsM = require('../../../models/main/community/community_groupsM')
const community_postsM = require('../../../models/main/community/community_postsM')
const community_likesM = require('../../../models/main/community/community_likesM')
const community_commentsM = require('../../../models/main/community/community_commentsM')
const professionals_pointsM = require('../../../models/app/users/professionals_pointsM')
const community_21days_challengeM = require('../../../models/main/community/community_21days_challengeM')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { sendCommunityEmail } = require('../../../config/email')
const { sendWeeklyReportEmail } = require('../../../utils/helpers/academy_helper')
const router = express.Router()


async function getUserPostEngagementStats(user_row_id) {
    const userPosts = await community_postsM.find(
        {
            post_status: true,
            $or: [
                { user_row_id: user_row_id },
                { repost_user_row_id: user_row_id }
            ]
        },
        { _id: 1 }
    ).lean();

    const postIds = userPosts.map(p => p._id);

    if (postIds.length === 0) {
        return {
            total_likes: 0,
            total_comments: 0,
            total_reposts: 0,
            high_engagement: false
        };
    }

    // Step 2: Count likes on those posts
    const [likeAgg, commentAgg, repostAgg] = await Promise.all([
        community_likesM.aggregate([
            {
                $match: {
                    post_id: { $in: postIds },
                    like_status: 1
                }
            },
            {
                $count: "total_likes"
            }
        ]),
        community_commentsM.aggregate([
            {
                $match: {
                    post_id: { $in: postIds },
                    parent_comment_id: null
                }
            },
            {
                $count: "total_comments"
            }
        ]),

        community_postsM.aggregate([
            {
                $match: {
                    is_repost: true,
                    repost_id: { $in: postIds },
                    post_status: true
                }
            },
            {
                $count: "total_reposts"
            }
        ])
    ]);
    const totalLikes = likeAgg[0]?.total_likes || 0
    const totalComments = commentAgg[0]?.total_comments || 0
    const totalReposts = repostAgg[0]?.total_reposts || 0

    const hasHighEngagement = totalLikes > 500 && totalComments > 300 && totalReposts > 100;

    return {
        total_likes: totalLikes,
        total_comments: totalComments,
        total_reposts: totalReposts,
        high_engagement: hasHighEngagement
    };
}


router.get('/details', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers);
        if (!checkToken.status) {
            return res.status(401).json({ status: false, message: { alert_message: checkToken.message } });
        }

        const user_row_id = Number.parseInt(checkToken.message);

        const userMain = await professionalsM.findOne(
            { _id: user_row_id },
            {
                professional_profile_score: 1,
                seo_details_score: 1,
                social_media_score: 1,
                academy_score: 1,
                community_score: 1,
                professional_detail_score: 1,
                investment_score: 1,
                award_score: 1,
                faq_score: 1,
                profile_score: 1,
            }
        );

        if (!userMain) {
            return res.status(404).json({ status: false, message: "User not found." });
        }

        // ⭐ Total completion should be the stored profile_score
        const total_completion = userMain.profile_score || 0;

        const [hasIntroduced, hasFirstFeed] = await Promise.all([
            community_postsM.exists({ user_row_id, group_id: 1, post_status: true }),
            community_postsM.exists({ user_row_id, group_id: { $ne: 1 }, post_status: true })
        ]);



        const userPosts = await community_postsM.aggregate([
            {
                $match: {
                    user_row_id,
                    post_status: true,
                }
            },
            {
                $project: {
                    dateOnly: {
                        $dateToString: { format: "%Y-%m-%d", date: "$date" }
                    }
                }
            },
            {
                $group: {
                    _id: "$dateOnly"
                }
            },
            {
                $sort: {
                    _id: 1
                }
            }
        ]);

        const dates = userPosts.map(p => new Date(p._id));
        let maxStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            prev.setHours(0, 0, 0, 0);
            curr.setHours(0, 0, 0, 0);

            const diffInTime = curr.getTime() - prev.getTime();
            const diffInDays = diffInTime / (1000 * 60 * 60 * 24);

            if (diffInDays === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else if (diffInDays > 1) {
                currentStreak = 1;
            }
        }
        const stats = await getUserPostEngagementStats(user_row_id);
        if (maxStreak >= 21) {
            const groups = await community_postsM.aggregate([
                {
                    $match: {
                        user_row_id,
                        post_status: true,
                    }
                },
                {
                    $group: {
                        _id: null,
                        group_ids: { $addToSet: "$group_id" }
                    }
                }
            ]);

            const group_ids = groups.length > 0 ? groups[0].group_ids : [];
            const exists = await community_21days_challengeM.findOne({ user_row_id });

            if (!exists) {

                const newChallenge = new community_21days_challengeM({
                    user_row_id,
                    group_ids,
                    valid_status: false,
                    released_status: false,
                    date_n_time: getPresentDateTime()
                });

                await newChallenge.save();
            }
        }
        if (
            stats?.high_engagement &&
            !!hasFirstFeed &&
            !!hasIntroduced &&
            total_completion >= 70 &&
            maxStreak >= 21
        ) {
            const user = await professionalsM.findOne({ _id: user_row_id, pro_batch: false });

            if (user) {
                await sendProBadgeEmail(userMain)
                await professionalsM.updateOne(
                    { _id: user_row_id },
                    { $set: { pro_batch: true } }
                );

            }
            const points = await professionals_pointsM.findOne({ user_row_id: user_row_id, point_type: "pro_batch" })
            if (!points) {
                const pointEntry = new professionals_pointsM({
                    user_row_id,
                    points: '100',
                    point_type: "pro_batch",
                    point_status: "credited"
                });
                await pointEntry.save();
                sendDollarrewardEmail({ full_name: user?.full_name, email_id: user?.email_id })
            }
        }

        return res.json({
            status: true,
            message: {
                profile_completed_status: total_completion >= 70,
                has_introduced: !!hasIntroduced,
                has_first_feed: !!hasFirstFeed,
                current_streak: currentStreak,
                has_21_day_streak: maxStreak >= 21,
                stats: stats,
                high_engagement: stats?.high_engagement,
                requested_team: false,
                userPosts: userPosts
            }
        });

    } catch (err) {
        console.error("❌ Error in /details route:", err);
        return res.status(500).json({
            status: false,
            message: "Something went wrong while fetching user details.",
            err: err?.message
        });
    }
});

const sendProBadgeEmail = async (userData) => {
    const full_name = userData?.full_name
    const email_id = userData?.email_id
    const pass_subject = `Big Win! Your Pro Badge is Here!`
    const header_profile_section = `Big Win! Your Pro Badge is Here!`
    const pass_message = `
            <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                <h3>Hello  ${full_name},</h3>

                <p>Huge congratulations - you’ve officially completed all tasks and earned your Pro Badge on Coinpedia! </p>
                <p style="margin: 0px; font-weight: bold">🎉 What does this mean for you?</p>
                <p style="margin: 0 0 8px">
                    You now have the exclusive ability to submit your article to the Coinpedia team for publishing!
                    It’s your time to shine and share your voice with a wider audience.</p>

                <p>We’re excited to feature your work - let’s make it happen! 🚀,</p>
            </div>`

    sendCommunityEmail(email_id, pass_subject, pass_message, header_profile_section)
}






module.exports = router
