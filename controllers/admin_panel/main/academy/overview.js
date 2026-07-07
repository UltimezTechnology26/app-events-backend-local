const express = require('express')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const coursesM = require('../../../../models/main/academy/coursesM')
const courses_certificatesM = require('../../../../models/main/academy/courses_certificatesM')
const quiz_lesson_started_detailsM = require('../../../../models/main/academy/quiz_lesson_started_detailsM')
const lessonsM = require('../../../../models/main/academy/lessonsM')
const quiz_questionsM = require('../../../../models/main/academy/quiz_questionsM')
const users_quiz_answersM = require('../../../../models/main/academy/users_quiz_answersM')
const professionalsM = require('../../../../models/app/professionalsM')
const streaksM = require('../../../../models/main/academy/streaksM')
const community_article_requestsM = require('../../../../models/main/community/community_article_requestsM')
const community_21days_challengeM = require('../../../../models/main/community/community_21days_challengeM')
const router = express.Router()

router.get('/details/', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        try {
            const totalCourses = await coursesM.countDocuments();
            const uniqueUsers = await courses_certificatesM.countDocuments();

            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            const result = await quiz_lesson_started_detailsM.aggregate([
                {
                    $group: {
                        _id: "$user_row_id",
                        last_activity: { $max: "$date_n_time" }
                    }
                },
                {
                    $project: {
                        last_activity: 1,
                        isActive: { $gt: ["$last_activity", fifteenDaysAgo] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total_unique_users: { $sum: 1 },
                        active_users: {
                            $sum: {
                                $cond: [{ $eq: ["$isActive", true] }, 1, 0]
                            }
                        },
                        inactive_users: {
                            $sum: {
                                $cond: [{ $eq: ["$isActive", false] }, 1, 0]
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        total_unique_users: 1,
                        active_users: 1,
                        inactive_users: 1
                    }
                }
            ]);

            const topStreaks = await streaksM.aggregate([
                {
                    $addFields: {
                        last_date_str: { $arrayElemAt: ["$streak_dates", -1] } // Get last streak date as string
                    }
                },
                {
                    $addFields: {
                        last_date: { $toDate: "$last_date_str" }, // Convert last streak date to Date
                        today: new Date()
                    }
                },
                {
                    $addFields: {
                        days_diff: {
                            $divide: [
                                { $subtract: ["$today", "$last_date"] },
                                1000 * 60 * 60 * 24 // ms to days
                            ]
                        }
                    }
                },
                {
                    $match: {
                        days_diff: { $lte: 3 } // Inactive for more than 3 days
                    }
                },
                {
                    $addFields: {
                        max_streak: { $size: "$streak_dates" }
                    }
                },
                {
                    $sort: { max_streak: -1 }
                },
                {
                    $limit: 4
                },
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
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "profile_info"
                    }
                },
                { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        user_row_id: 1,
                        max_streak: 1,
                        full_name: "$user_info.full_name",
                        email: "$user_info.email",
                        profile_image: "$profile_info.profile_image"
                    }
                }
            ]);
            const streakStats = await streaksM.aggregate([
                {
                    $addFields: {
                        streakLength: { $size: "$streak_dates" }
                    }
                },
                {
                    $group: {
                        _id: null,
                        averageStreak: { $avg: "$streakLength" },
                        maxStreak: { $max: "$streakLength" },
                        totalUsersWithStreaks: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        averageStreak: { $round: ["$averageStreak", 2] }, // Rounded to 2 decimal places
                        maxStreak: 1,
                        totalUsersWithStreaks: 1
                    }
                }
            ]);

            return res.status(200).json({
                success: true,
                courses_completed_users: uniqueUsers,
                total_courses: totalCourses,
                user_details: result[0],
                pro_batch_count: 0,
                regular_batch_count: uniqueUsers,
                top_streaks: topStreaks,
                streak_stats: streakStats?.[0]
            });
        } catch (error) {
        }
    } else {
        return res.json({ status: false, message: { alert_message: checkToken.message } });
    }
})

router.get('/course_details/:course_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13]);

    if (!checkToken.status) {
        return res.json({ status: false, message: { alert_message: checkToken.message } });
    }

    try {
        const course_row_id = Number.parseInt(req.params.course_row_id);

        // 1) Total lessons in this course
        const totalLessons = await lessonsM.countDocuments({ course_row_id });

        // 2) Total users who completed this course (from certificates)
        const uniqueUsers = await courses_certificatesM.countDocuments({ course_row_id });

        // 3) Total quiz questions
        const totalQuizQuestions = await quiz_questionsM.aggregate([
            {
                $lookup: {
                    from: "cln_academy_courses_lessons",
                    localField: "lesson_row_id",
                    foreignField: "_id",
                    as: "lesson_info"
                }
            },
            {
                $match: {
                    course_row_id,
                    lesson_info: { $ne: [] }
                }
            },
            { $count: "total_quiz_questions" }
        ]);

        // 4) Ongoing users count (your existing logic)
        const get_ongoing_courses_count = await professionalsM.aggregate([
            {
                $lookup: {
                    from: "cln_academy_quiz_lession_started_details",
                    let: { userId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$user_row_id", "$$userId"] },
                                        { $eq: ["$course_row_id", course_row_id] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$course_row_id",
                                // ✅ any lesson started for this course
                                total_started_lessons: { $sum: 1 },
                                // ✅ only completed lessons
                                completed_lessons: {
                                    $sum: {
                                        $cond: [{ $eq: ["$lesson_status", 1] }, 1, 0]
                                    }
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_academy_courses_lessons",
                                localField: "_id",
                                foreignField: "course_row_id",
                                as: "all_lessons"
                            }
                        },
                        {
                            $addFields: {
                                total_lessons: { $size: "$all_lessons" }
                            }
                        },
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        // ✅ at least 1 lesson started
                                        { $gt: ["$total_started_lessons", 0] },
                                        // ✅ but not fully completed
                                        { $lt: ["$completed_lessons", "$total_lessons"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "ongoing_course"
                }
            },
            {
                $match: { "ongoing_course.0": { $exists: true } }
            },
            {
                $count: "ongoing_course_users"
            }
        ]);


        // ✅ 5) NEW: Total article requests
        const articleRequestCount = await community_article_requestsM.countDocuments();

        // ✅ 6) NEW: 21-day challenge total users
        // Use whichever is correct for your schema:
        const challengeUsersCount = await community_21days_challengeM.countDocuments();
        // OR:
        // const challengeUsersCount = (await community_21days_challengeM.distinct("user_row_id")).length;

        return res.status(200).json({
            success: true,
            course_completed_users: uniqueUsers,
            total_lessons: totalLessons,
            total_quiz_questions: totalQuizQuestions[0]?.total_quiz_questions || 0,
            ongoing_users_count: get_ongoing_courses_count?.[0]?.ongoing_course_users || 0,

            // ✅ New fields you asked for
            total_article_requests: articleRequestCount,
            total_challenge_users: challengeUsersCount
        });

    } catch (error) {
        res.json({ status: false, message: { error: error?.message } });
    }
});


module.exports = router
