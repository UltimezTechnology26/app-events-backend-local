import { checkUserLoginToken } from '../../middleware/authorization';
const community_postsM = require('../../models/main/community/community_postsM');
const courses_certificatesM = require('../../models/main/academy/courses_certificatesM');
const professionals_pointsM = require('../../models/app/users/professionals_pointsM');
const { getUserProfileWithScore } = require('../../utils/helpers/app_helper');

interface LeaderboardItem {
    _id: number;
    total_posts: number;
}

interface UserPostDate {
    _id: string;
}

interface PointBalance {
    total_balance?: number;
}

interface Rewards {
    dollar_reward: boolean;
    expert_tag: boolean;
    job_apply_eligibility: boolean;
    direct_messsage: boolean;
    team_interviewed: boolean;
    news_coverage_eligability: boolean;
    pro_influencer: boolean;
    applied_as_speaker: boolean;
    hosted_live_events: boolean;
    top_contributer: boolean;
    posted_on_home_page: boolean;
}

interface BenefitsResponse {
    status: boolean;
    message: {
        profile_score?: any;
        total_points?: number;
        rewards?: Rewards;
        total_count?: number;
        alert_message?: string;
    } | string;
    err?: string;
}

export const getBenefitsDetails = async (headers?: any): Promise<BenefitsResponse> => {
    try {
        const checkToken = checkUserLoginToken(headers);
        if (!checkToken.status) {
            return {
                status: false,
                message: { alert_message: checkToken.message }
            };
        }
        const user_row_id = Number.parseInt(checkToken.message);
        if (Number.isNaN(user_row_id)) {
            return {
                status: false,
                message: "Invalid user ID"
            };
        }

        const total_completion = await getUserProfileWithScore(user_row_id);

        const userPosts: UserPostDate[] = await community_postsM.aggregate([
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
        ]).allowDiskUse(true);

        // Execute queries in parallel for better performance
        const [leaderboard, expert_tag, job_apply_eligibility, team_interviewed, news_coverage] = await Promise.all([
            community_postsM.aggregate([
                { $match: { post_status: true } },
                {
                    $group: {
                        _id: "$user_row_id",
                        total_posts: { $sum: 1 }
                    }
                },
                { $sort: { total_posts: -1 } },
                { $limit: 1000 }
            ]).allowDiskUse(true),
            Promise.resolve(courses_certificatesM.exists({ user_row_id: user_row_id }) !== null),
            professionals_pointsM.exists({
                user_row_id,
                point_type: 'job_apply_eligibility'
            }),
            professionals_pointsM.exists({
                user_row_id,
                point_type: 'team_interviewed'
            }),
            professionals_pointsM.exists({
                user_row_id,
                point_type: 'news_coverage'
            })
        ]);

        const limit = 50;

        const userIds = leaderboard.map((item: LeaderboardItem) => item._id);

        const rankMap: { [key: number]: number } = {};
        userIds.forEach((id: number, index: number) => { rankMap[id] = index + 1 });

        const topUserIds = userIds.slice(0, limit);

        const isUserInTop50 = topUserIds.includes(user_row_id);

        const dates = userPosts.map((p: UserPostDate) => new Date(p._id));
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

        const total_balance: PointBalance[] = await professionals_pointsM.aggregate([
            { $match: { user_row_id: user_row_id } },
            {
                $addFields: {
                    numeric_points: { $toDouble: "$points" }
                }
            },
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
                $project: {
                    _id: 0,
                    total_balance: { $subtract: ["$total_credited", "$total_debited"] }
                }
            }
        ]).allowDiskUse(true);

        const balance = total_balance[0]?.total_balance || 0;

        const rewards: Rewards = {
            dollar_reward: maxStreak >= 21 && isUserInTop50,
            expert_tag: expert_tag,
            job_apply_eligibility: Boolean(job_apply_eligibility),
            direct_messsage: false,
            team_interviewed: Boolean(team_interviewed),
            news_coverage_eligability: Boolean(news_coverage),
            pro_influencer: false,
            applied_as_speaker: false,
            hosted_live_events: false,
            top_contributer: false,
            posted_on_home_page: false
        };

        const totalCount = Object.values(rewards).filter(Boolean).length;

        return {
            status: true,
            message: {
                profile_score: total_completion,
                total_points: balance,
                rewards,
                total_count: totalCount
            }
        };

    } catch (error: any) {
        console.error("❌ Error in getBenefitsDetails:", error);
        return {
            status: false,
            message: "Something went wrong while fetching user details.",
            err: error?.message
        };
    }
};