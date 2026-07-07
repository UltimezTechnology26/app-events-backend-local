const express = require('express')
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const coursesM = require('../../../../models/main/academy/coursesM')
const chaptersM = require('../../../../models/main/academy/chaptersM')
const lessonsM = require('../../../../models/main/academy/lessonsM')
const quiz_questionsM = require('../../../../models/main/academy/quiz_questionsM')

const { getPresentDateTime, arrangeValidation, getPresentDateOnly, createDateOnly, validateAndSaveImage } = require('../../../../utils/helpers/helper.js')
const { checkAdminLoginToken } = require('../../../../middleware/authorization.js')
const started_detailsM = require('../../../../models/main/onboarding/started_detailsM')
const contest_startedM = require("../../../../models/main/contest/started_detailsM.js")
const professionalsM = require('../../../../models/app/professionalsM')
const weekly_contestsM = require('../../../../models/main/contest/weekly_contestsM')
const quiz_lesson_started_detailsM = require('../../../../models/main/academy/quiz_lesson_started_detailsM')
const users_quiz_answersM = require('../../../../models/main/academy/users_quiz_answersM')
const answersM = require('../../../../models/main/onboarding/anwsersM')
const anwsersM = require('../../../../models/main/onboarding/anwsersM')
const streaksM = require('../../../../models/main/academy/streaksM')
const { deleteKeysByPattern } = require('../../../../config/cache_helper.js')
router.get('/overview', async (req, res) => {
    const present_time = getPresentDateOnly()
    const checkToken = checkAdminLoginToken(req.headers, [4])
    if (checkToken.status) {
        let result = {}

        const getCompletedCourseUsersCount = async () => {
            const result = await chaptersM.aggregate([
                {
                    $lookup: {
                        from: "cln_academy_courses_lessons",
                        localField: "_id",
                        foreignField: "chapter_row_id",
                        as: "lessons"
                    }
                },
                { $unwind: "$lessons" },
                {
                    $group: {
                        _id: "$course_row_id",
                        all_lessons: { $addToSet: "$lessons.lesson_id" }
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_lession_started_details",
                        let: { lessonIds: "$all_lessons" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ["$lesson_row_id", "$$lessonIds"] },
                                            { $eq: ["$lesson_status", 1] }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: "$user_row_id",
                                    completed_lessons: { $addToSet: "$lesson_row_id" }
                                }
                            }
                        ],
                        as: "completed_data"
                    }
                },
                { $unwind: "$completed_data" },
                {
                    $project: {
                        user_row_id: "$completed_data._id",
                        completed_lessons_count: { $size: "$completed_data.completed_lessons" },
                        total_lessons_count: { $size: "$all_lessons" }
                    }
                },
                {
                    $match: {
                        $expr: {
                            $eq: ["$completed_lessons_count", "$total_lessons_count"]
                        }
                    }
                },
                {
                    $group: {
                        _id: "$user_row_id"
                    }
                },
                {
                    $count: "completed_users_count"
                }
            ]);

            return result[0]?.completed_users_count || 0;
        };

        const getCompletedCourseUsersCountByCourseRowId = async (courseRowId) => {
            const result = await chaptersM.aggregate([
                {
                    $match: { course_row_id: courseRowId }
                },
                {
                    $lookup: {
                        from: "cln_academy_courses_lessons",
                        localField: "_id",
                        foreignField: "chapter_row_id",
                        as: "lessons"
                    }
                },
                { $unwind: "$lessons" },
                {
                    $group: {
                        _id: "$course_row_id",
                        all_lessons: { $addToSet: "$lessons.lesson_id" }
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_lession_started_details",
                        let: { lessonIds: "$all_lessons" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ["$lesson_row_id", "$$lessonIds"] },
                                            { $eq: ["$lesson_status", 1] }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: "$user_row_id",
                                    completed_lessons: { $addToSet: "$lesson_row_id" }
                                }
                            }
                        ],
                        as: "completed_data"
                    }
                },
                { $unwind: "$completed_data" },
                {
                    $project: {
                        user_row_id: "$completed_data._id",
                        completed_lessons_count: { $size: "$completed_data.completed_lessons" },
                        total_lessons_count: { $size: "$all_lessons" }
                    }
                },
                {
                    $match: {
                        $expr: {
                            $eq: ["$completed_lessons_count", "$total_lessons_count"]
                        }
                    }
                },
                {
                    $group: {
                        _id: "$user_row_id"
                    }
                },
                {
                    $count: "completed_users_count"
                }
            ]);

            return result[0]?.completed_users_count || 0;
        };

        const getStartedCourseUsersCountByCourseRowId = async (courseRowId) => {
            const result = await chaptersM.aggregate([
                {
                    $match: { course_row_id: courseRowId }
                },
                {
                    $lookup: {
                        from: "cln_academy_courses_lessons",
                        localField: "_id",
                        foreignField: "chapter_row_id",
                        as: "lessons"
                    }
                },
                { $unwind: "$lessons" },
                {
                    $group: {
                        _id: "$course_row_id",
                        all_lessons: { $addToSet: "$lessons.lesson_id" }
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_lession_started_details",
                        let: { lessonIds: "$all_lessons" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $in: ["$lesson_row_id", "$$lessonIds"]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: "$user_row_id"
                                }
                            }
                        ],
                        as: "started_data"
                    }
                },
                { $unwind: "$started_data" },
                {
                    $group: {
                        _id: "$started_data._id"
                    }
                },
                {
                    $count: "started_users_count"
                }
            ]);

            return result[0]?.started_users_count || 0;
        };

        const calculateCompletionRate = async (courseRowId) => {
            const startedCount = await getStartedCourseUsersCountByCourseRowId(courseRowId);
            const completedCount = await getCompletedCourseUsersCountByCourseRowId(courseRowId);


            return (completedCount / startedCount) * 100;
        };

        const countContestsByTimeStatus = async (present_time) => {
            const now = new Date(present_time);

            const counts = await weekly_contestsM.aggregate([
                {
                    $lookup: {
                        from: 'cln_main_weekly_contests_questions',
                        localField: '_id',
                        foreignField: 'contest_row_id',
                        as: 'questions',
                        pipeline: [
                            {
                                $group: {
                                    _id: '$contest_row_id',
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        total_questions: { $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0] }
                    }
                },
                {
                    $match: {
                        total_questions: { $gte: 10 }
                    }
                },
                {
                    $addFields: {
                        time_status: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $and: [{ $lte: ['$start_date', now] }, { $gte: ['$end_date', now] }] },
                                        then: 'ongoing'
                                    },
                                    {
                                        case: { $gt: ['$start_date', now] },
                                        then: 'upcoming'
                                    },
                                    {
                                        case: { $lt: ['$end_date', now] },
                                        then: 'past'
                                    }
                                ],
                                default: 'unknown'
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$time_status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Build final structured result
            const result = {
                upcoming: 0,
                ongoing: 0,
                past: 0,
                total: 0
            };

            counts.forEach(c => {
                if (result.hasOwnProperty(c._id)) {
                    result[c._id] = c.count;
                    result.total += c.count;
                }
            });

            return result;
        };

        const getQuizPassRateByCourseRowId = async (courseRowId) => {

            const chapters = await chaptersM.aggregate([
                { $match: { course_row_id: courseRowId } },
                {
                    $lookup: {
                        from: "cln_academy_courses_lessons",
                        localField: "_id",
                        foreignField: "chapter_row_id",
                        as: "lessons"
                    }
                },
                { $unwind: "$lessons" },
                {
                    $group: {
                        _id: null,
                        lessonIds: { $addToSet: "$lessons.lesson_id" }
                    }
                }
            ]);

            const lessonIds = chapters[0]?.lessonIds || [];

            if (!lessonIds.length) return 0;


            const startedUsers = await quiz_lesson_started_detailsM.aggregate([
                {
                    $match: { lesson_row_id: { $in: lessonIds } }
                },
                {
                    $group: {
                        _id: "$user_row_id"
                    }
                }
            ]);

            const totalStarted = startedUsers.length;

            if (totalStarted === 0) return 0;


            const passedUsers = await users_quiz_answersM.aggregate([
                {
                    $match: {
                        lesson_row_id: { $in: lessonIds },
                        answer_status: true
                    }
                },
                {
                    $group: {
                        _id: { user: "$user_row_id", lesson: "$lesson_row_id" },
                        correctAnswers: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        correctAnswers: { $gte: 7 }
                    }
                },
                {
                    $group: {
                        _id: "$_id.user"
                    }
                }
            ]);

            const totalCompleted = passedUsers.length;


            return (totalCompleted / totalStarted) * 100;
        };

        let getAverageCourseProgress = async (course_row_id) => {
            const total_lessons = await lessonsM.countDocuments({ course_row_id });

            if (total_lessons === 0) return 0;

            const result = await quiz_lesson_started_detailsM.aggregate([
                { $match: { course_row_id, lesson_status: 1 } },
                {
                    $group: {
                        _id: "$user_row_id",
                        completed_lessons: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        progress: {
                            $multiply: [
                                { $divide: ["$completed_lessons", total_lessons] },
                                100
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        averageProgress: { $avg: "$progress" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        averageProgress: { $round: ["$averageProgress", 2] }
                    }
                }
            ]);

            return result[0]?.averageProgress || 0;
        }

        const getQuizCompletionRate = async () => {
            const result = await started_detailsM.aggregate([
                {
                    $match: {
                        status: { $in: [0, 1] },
                        course_row_id: { $in: [1, 2, 3] } // Adjust based on your actual course IDs
                    }
                },
                {
                    $lookup: {
                        from: 'cln_academy_onboarding_answers',
                        localField: '_id',
                        foreignField: 'started_row_id',
                        as: 'answers'
                    }
                },
                { $unwind: '$answers' },
                {
                    $group: {
                        _id: null,
                        totalAnswers: { $sum: 1 },
                        completedAnswers: {
                            $sum: {
                                $cond: [{ $gt: ['$answers.score', 0] }, 1, 0]
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        totalAnswers: 1,
                        completedAnswers: 1,
                        completionRate: {
                            $cond: [
                                { $eq: ['$totalAnswers', 0] },
                                0,
                                { $multiply: [{ $divide: ['$completedAnswers', '$totalAnswers'] }, 100] }
                            ]
                        }
                    }
                }
            ]);

            return result[0]?.completionRate || 0;
        };

        const getQuizCompletionRateByCourseRowID = async (courseRowId) => {
            const result = await started_detailsM.aggregate([
                {
                    $match: {
                        course_row_id: courseRowId,
                        status: { $in: [0, 1] }
                    }
                },
                {
                    $lookup: {
                        from: 'cln_academy_onboarding_answers',
                        localField: '_id',
                        foreignField: 'started_row_id',
                        as: 'answers'
                    }
                },
                { $unwind: '$answers' },
                {
                    $lookup: {
                        from: 'cln_academy_onboarding_questions',
                        localField: 'answers.question_row_id',
                        foreignField: '_id',
                        as: 'question'
                    }
                },
                { $unwind: '$question' },
                {
                    $group: {
                        _id: null,
                        totalAnswers: { $sum: 1 },
                        completedAnswers: {
                            $sum: {
                                $cond: [{ $gt: ['$answers.score', 0] }, 1, 0]
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        completionRate: {
                            $cond: [
                                { $eq: ['$totalAnswers', 0] },
                                0,
                                { $multiply: [{ $divide: ['$completedAnswers', '$totalAnswers'] }, 100] }
                            ]
                        }
                    }
                }
            ]);

            return result.length > 0 ? result[0].completionRate : 0;
        };

        const getTotalUsersAttendedQuiz = async () => {
            const result = await anwsersM.aggregate([
                {
                    $group: {
                        _id: "$user_row_id"
                    }
                },
                {
                    $count: "totalUsers"
                }
            ]);

            return result[0]?.totalUsers || 0;
        };

        const getAverageQuizTime = async () => {
            const result = await answersM.aggregate([
                {
                    $group: {
                        _id: { user: "$user_row_id", quiz: "$started_row_id" },
                        startTime: { $min: "$date_n_time" },
                        endTime: { $max: "$date_n_time" }
                    }
                },
                {
                    $project: {
                        timeSpentSeconds: {
                            $divide: [
                                { $subtract: ["$endTime", "$startTime"] },
                                1000
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgTimeSeconds: { $avg: "$timeSpentSeconds" }
                    }
                }
            ]);

            return result[0]?.avgTimeSeconds || 0;
        };

        const getTopStreakers = async () => {
            const result = await streaksM.aggregate([
                {
                    $group: {
                        _id: "$user_row_id",
                        currentStreakLength: { $sum: 1 }
                    }
                },
                {
                    $sort: { currentStreakLength: -1 }
                },
                {
                    $limit: 4
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "_id",
                        foreignField: "_id",
                        as: "user"
                    }
                },
                {
                    $unwind: "$user"
                },
                {
                    $project: {
                        user_row_id: "$_id",
                        streak_length: "$currentStreakLength",
                        full_name: "$user.full_name"
                    }
                }
            ])

            return result
        }

        const getAverageResult = async () => {
            const result = await streaksM.aggregate([
                {
                    $group: {
                        _id: "$user_row_id",
                        totalStreakLength: { $sum: 1 },
                        usersSet: { $addToSet: "$user_row_id" }
                    }
                },
                {
                    $addFields: {
                        totalUsers: { $size: "$usersSet" },
                        averageStreakLength: {
                            $cond: {
                                if: { $eq: ["$totalUsers", 0] },
                                then: 0,
                                else: { $divide: ["$totalStreakLength", "$totalUsers"] }
                            }
                        }
                    }
                },
                {
                    $sort: { totalStreakLength: -1 }
                },
                {
                    $project: {
                        _id: 0,
                        user_row_id: "$_id",
                        totalStreakLength: 1,
                        totalUsers: 1,
                        averageStreakLength: 1
                    }
                }
            ]);

            let totalStreakLengthSum = 0;
            let totalUsersSum = 0;

            result.forEach(item => {
                totalStreakLengthSum += item.totalStreakLength;
                totalUsersSum += item.totalUsers;
            });


            return totalStreakLengthSum / totalUsersSum;
        };

        const getPathTypePercentages = async () => {
            try {
                const totalUsers = await started_detailsM.countDocuments({});
                const pathTypeCounts = await started_detailsM.aggregate([
                    {
                        $match: {
                            path_type: { $in: [1, 2] }
                        }
                    },
                    {
                        $group: {
                            _id: "$path_type",
                            count: { $sum: 1 }
                        }
                    }
                ]);

                const pathTypeCourseCounts = await started_detailsM.aggregate([
                    {
                        $match: {
                            path_type: { $in: [1, 2] },
                            course_row_id: { $in: [1, 2, 3] }
                        }
                    },
                    {
                        $group: {
                            _id: { path_type: "$path_type", course_row_id: "$course_row_id" },
                            count: { $sum: 1 }
                        }
                    }
                ]);

                let result = {
                    path_type_1: {
                        percentage: 0,
                        courses: {
                            beginner: 0,
                            trader: 0,
                            blockchain: 0
                        }
                    },
                    path_type_2: {
                        percentage: 0,
                        courses: {
                            beginner: 0,
                            trader: 0,
                            blockchain: 0
                        }
                    }
                };

                pathTypeCounts.forEach(item => {
                    const percentage = ((item.count / totalUsers) * 100).toFixed(2);
                    if (item._id === 1) {
                        result.path_type_1.percentage = percentage;
                    } else if (item._id === 2) {
                        result.path_type_2.percentage = percentage;
                    }
                });

                pathTypeCourseCounts.forEach(item => {
                    const { path_type, course_row_id } = item._id;
                    const percentage = ((item.count / totalUsers) * 100).toFixed(2);

                    if (path_type === 1) {
                        if (course_row_id === 1) result.path_type_1.courses.beginner = percentage;
                        if (course_row_id === 2) result.path_type_1.courses.trader = percentage;
                        if (course_row_id === 3) result.path_type_1.courses.blockchain = percentage;
                    } else if (path_type === 2) {
                        if (course_row_id === 1) result.path_type_2.courses.beginner = percentage;
                        if (course_row_id === 2) result.path_type_2.courses.trader = percentage;
                        if (course_row_id === 3) result.path_type_2.courses.blockchain = percentage;
                    }
                });


                return result;
            } catch (error) {
                console.error('Error calculating path type percentages:', error);
            }
        }



        const [
            totalCourses,

            beginner_chapterCounts,
            trader_chapterCounts,
            blockchain_chapterCounts,
            chapterCounts,

            beginner_lessonsCounts,
            trader_lessonsCounts,
            blockchain_lessonsCounts,
            lessonCounts,

            beginner_recommendedCount,
            trader_recommendedCount,
            blockchain_recommendedCount,
            recommendedCount,

            beginner_quizQuestionCount,
            trader_quizQuestionCount,
            blockchain_quizQuestionCount,
            quizQuestionCount,

            totalContests,

            new_usersByStatus,
            active_usersByStatus,
            inactive_usersByStatus,
            // usersByStatus,

            userByCourse,

            beginnerCourseCompletionRate,
            traderCourseCompletionRate,
            blockchainCourseCompletionRate,

            beginnerPassRate,
            traderPassRate,
            blockchainPassRate,

            beginnerAverageProgressRate,
            traderAverageProgressRate,
            blockchainAverageProgressRate,

            totalQuizCompletionRate,

            beginnerQuizCompletionRate,
            traderQuizCompletionRate,
            blockchainQuizCompletionRate,

            totalUsersAttendedQuiz,

            averageQuizTime,

            averageStreakLengthData,
            topFourStrekers,
            // streak_lost_count,
            // strak_rest_count
            // contestParticipated,
            path_type_percentage,

            referedUersCount,

            // totalEmailCount,
            // toalUsersMailCount

        ] = await Promise.all([
            coursesM.countDocuments(),
            // countByCourseRowId(chaptersM),
            chaptersM.countDocuments({ course_row_id: 1 }),
            chaptersM.countDocuments({ course_row_id: 2 }),
            chaptersM.countDocuments({ course_row_id: 3 }),
            chaptersM.countDocuments(),

            lessonsM.countDocuments({ course_row_id: 1 }),
            lessonsM.countDocuments({ course_row_id: 2 }),
            lessonsM.countDocuments({ course_row_id: 3 }),
            lessonsM.countDocuments(),

            lessonsM.countDocuments({ recommended_status: 1, course_row_id: 1 }),
            lessonsM.countDocuments({ recommended_status: 1, course_row_id: 2 }),
            lessonsM.countDocuments({ recommended_status: 1, course_row_id: 3 }),
            lessonsM.countDocuments({ recommended_status: 1 }),

            quiz_questionsM.countDocuments({ course_row_id: 1 }),
            quiz_questionsM.countDocuments({ course_row_id: 2 }),
            quiz_questionsM.countDocuments({ course_row_id: 3 }),
            quiz_questionsM.countDocuments(),

            countContestsByTimeStatus(present_time),

            professionalsM.countDocuments({ approval_status: 0 }),
            professionalsM.countDocuments({ approval_status: 1 }),
            professionalsM.countDocuments({ approval_status: 2 }),

            // professionalsM.countDocuments(),

            getCompletedCourseUsersCount(),

            // getStartedCourseUsersCountByCourseRowId()
            calculateCompletionRate(1),
            calculateCompletionRate(2),
            calculateCompletionRate(3),
            // getCourseCompletionRates()

            getQuizPassRateByCourseRowId(1),
            getQuizPassRateByCourseRowId(2),
            getQuizPassRateByCourseRowId(3),

            await getAverageCourseProgress(1),
            await getAverageCourseProgress(2),
            await getAverageCourseProgress(3),

            await getQuizCompletionRate(),

            await getQuizCompletionRateByCourseRowID(1),
            await getQuizCompletionRateByCourseRowID(2),
            await getQuizCompletionRateByCourseRowID(3),

            await getTotalUsersAttendedQuiz(),

            await getAverageQuizTime(),

            getAverageResult(),
            await getTopStreakers(),

            getPathTypePercentages(),

            professionalsM.countDocuments({ referral_row_id: { $gt: 0 } }),


            // quiz_not_complete_remaindersM.countDocuments({email_sent_status: true}),
            // users_remainder_emailsM.countDocuments({ sent_status: true})

        ]);

        result['courses'] = totalCourses;

        result['chapters_beginner'] = beginner_chapterCounts;
        result['chapters_trader'] = trader_chapterCounts;
        result['chapters_blockchain'] = blockchain_chapterCounts;
        result['chapters'] = chapterCounts;

        result['lessons_beginner'] = beginner_lessonsCounts;
        result['lessons_trader'] = trader_lessonsCounts;
        result['lessons_blockchain'] = blockchain_lessonsCounts;
        result['lessons'] = lessonCounts;

        result['recommended_lessons_beginner'] = beginner_recommendedCount;
        result['recommended_lessons_trader'] = trader_recommendedCount;
        result['recommended_lessons_blockchain'] = blockchain_recommendedCount;
        result['recommended_lessons'] = recommendedCount;

        result['quiz_questions_beginner'] = beginner_quizQuestionCount;
        result['quiz_questions_trader'] = trader_quizQuestionCount;
        result['quiz_questions_blockchain'] = blockchain_quizQuestionCount;
        result['quiz_questions'] = quizQuestionCount;

        result['contests'] = totalContests;

        result['users_new'] = new_usersByStatus;
        result['users_active'] = active_usersByStatus;
        result['users_inactive'] = inactive_usersByStatus;

        result['count_of_course_completed_users'] = userByCourse;

        result['beginner_course_completion_rate'] = beginnerCourseCompletionRate;
        result['trader_course_completion_rate'] = traderCourseCompletionRate;
        result['blockchain_course_completion_rate'] = blockchainCourseCompletionRate;

        result['beginner_pass_rate'] = beginnerPassRate;
        result['trader_pass_rate'] = traderPassRate;
        result['blockchain_pass_rate'] = blockchainPassRate;

        result['beginner_average_rate'] = beginnerAverageProgressRate;
        result['trader_average_rate'] = traderAverageProgressRate;
        result['blockchain_average_rate'] = blockchainAverageProgressRate;

        result['onboarding_quiz_completion_rate'] = totalQuizCompletionRate

        result['onboarding_beginner_quiz_completion_rate'] = beginnerQuizCompletionRate
        result['onboarding_trader_quiz_completion_rate'] = traderQuizCompletionRate
        result['onboarding_blockchain_quiz_completion_rate'] = blockchainQuizCompletionRate

        result['total_users_attened_quiz'] = totalUsersAttendedQuiz

        result['onboarding_average_quiz_time'] = averageQuizTime

        result['average_streak_length'] = averageStreakLengthData
        result['top_4_streak_user'] = topFourStrekers

        result['path_type_percentages'] = path_type_percentage
        //   result['contest_participated'] = contestParticipated

        result['refered_users_email_count'] = referedUersCount

        // result['remainder_total_count'] = totalEmailCount
        // result['users_remainder'] = toalUsersMailCount
        res.json({ status: true, message: result })
    }
    else {
        res.json(checkToken)
    }
})

router.get("/testing", async (req, res) => {
    const debugCheck = await quiz_questionsM.find({ course_row_id: 3 });
    res.json({
        status: true, messgae: debugCheck
    })
})

router.get('/participatedcounts', async (req, res) => {
    const { year, month } = req.query;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const yearInt = year ? Number.parseFloat(year) : currentYear;
    let monthInt = month ? Number.parseFloat(month) - 1 : currentMonth;

    if (monthInt < 0 || monthInt > 11) {
        return res.status(400).json({ message: 'Invalid month. Month must be between 1 (January) and 12 (December)' });
    }

    try {

        const startOfMonth = new Date(yearInt, monthInt, 1);
        const endOfMonth = new Date(yearInt, monthInt + 1, 0, 23, 59, 59, 999);

        const getParticipatedCounts = async (startOfMonth, endOfMonth) => {

            const result = await contest_startedM.aggregate([
                {
                    $addFields: {
                        date_n_time: { $toDate: "$date_n_time" }
                    }
                },
                {
                    $match: {
                        contest_status: 1,
                        date_n_time: {
                            $gte: startOfMonth,
                            $lte: endOfMonth
                        }
                    }
                },
                {
                    $group: {
                        _id: "$contest_row_id",
                        participated_count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests",
                        localField: "_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: "$contest_info"
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            start: "$contest_info.start_date",
                            end: "$contest_info.end_date"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $gte: ["$date_n_time", "$$start"] },
                                            { $lte: ["$date_n_time", "$$end"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $count: "registration_count"
                            }
                        ],
                        as: "registrations"
                    }
                },
                {
                    $addFields: {
                        registration_count: {
                            $ifNull: [{ $arrayElemAt: ["$registrations.registration_count", 0] }, 0]
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        contest_row_id: "$_id",
                        title: "$contest_info.title",
                        participated_count: 1,
                        registration_count: 1
                    }
                },
                {
                    $sort: { contest_row_id: 1 }
                }
            ]);


            return result;
        };

        const result = await getParticipatedCounts(startOfMonth, endOfMonth);


        res.json(result);
    } catch (error) {
        console.error('Error fetching participated counts:', error);
        res.status(500).json({ message: 'Error fetching data' });
    }
});


router.get('/lessonscompleted', async (req, res) => {
    const { year, month } = req.query;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const yearInt = year ? Number.parseFloat(year) : currentYear;
    const monthInt = month ? Number.parseFloat(month) - 1 : currentMonth;

    if (monthInt < 0 || monthInt > 11) {
        return res.status(400).json({
            message: 'Invalid month. Month must be between 1 (January) and 12 (December)'
        });
    }

    try {
        const startOfMonth = new Date(yearInt, monthInt, 1);
        const endOfMonth = new Date(yearInt, monthInt + 1, 0);

        const weeks = [];
        let currentStartDate = new Date(startOfMonth);

        while (currentStartDate <= endOfMonth) {
            let currentEndDate = new Date(currentStartDate);
            currentEndDate.setDate(currentStartDate.getDate() + 6);
            if (currentEndDate > endOfMonth) currentEndDate = endOfMonth;

            weeks.push([new Date(currentStartDate), new Date(currentEndDate)]);

            currentStartDate = new Date(currentEndDate);
            currentStartDate.setDate(currentStartDate.getDate() + 1);
        }

        const allWeeklyData = [];

        for (const [weekStart, weekEnd] of weeks) {
            const weeklyData = {
                week: `${weekStart.toDateString()} - ${weekEnd.toDateString()}`,
                totalStarted: 0,
                totalCompleted: 0,
            };

            // Users who started any lesson in this week
            const startedUsers = await quiz_lesson_started_detailsM.aggregate([
                {
                    $match: {
                        date_n_time: { $gte: weekStart, $lte: weekEnd }
                    }
                },
                {
                    $group: {
                        _id: "$user_row_id"
                    }
                }
            ]);
            weeklyData.totalStarted = startedUsers.length;

            const completedUsers = await users_quiz_answersM.aggregate([
                {
                    $match: {
                        close_status: true,
                        answer_status: true,
                        date_n_time: { $gte: weekStart, $lte: weekEnd }
                    }
                },
                {
                    $group: {
                        _id: "$user_row_id",
                        correctAnswers: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        correctAnswers: { $gte: 7 }
                    }
                }
            ]);
            weeklyData.totalCompleted = completedUsers.length;



            allWeeklyData.push(weeklyData);
        }

        res.json(allWeeklyData);

    } catch (error) {
        console.error('🔥 Error in /lessonscompleted route:', error);
        res.status(500).json({ message: 'Error fetching data', error: error.message });
    }
});

module.exports = router;

const generateCourseUrl = async function (string) {
    try {
        let trimStr = string.trim().toLowerCase();
        let normalized = trimStr.replace(/\s+/g, ' ');
        let hyphenated = normalized.replace(/\s/g, '-');
        let cleaned = hyphenated.replace(/[&/#\\,+()$~%.'":*?<>{}|^]/g, '');

        if (cleaned.endsWith('-')) {
            cleaned = cleaned.slice(0, -1);
        }

        return cleaned;
    } catch (err) {
        console.error('Generate course URL error:', err);
        return false;
    }
};


router.post('/add_n_update_details', [
    check('course_name')
        .trim().not().isEmpty().withMessage('The Course Name field is required.'),
    check('course_image')
        .trim().not().isEmpty().withMessage('The Course Image is required.'),
    check('expert_tag')
        .trim().not().isEmpty().withMessage('The Expert Tag is required.'),
    check('course_description')
        .trim().not().isEmpty().withMessage('The Course Description field is required.')
        .isLength({ max: 100 }).withMessage('The Course Description field must be less than 100 characters.'),
    check('meta_keywords')
        .trim().not().isEmpty().withMessage('The Meta Keywords field is required.'),
    check('meta_description')
        .trim().not().isEmpty().withMessage('The Meta Description field is required.'),
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        let course_row_id = ""
        if (req.body.course_row_id) {
            course_row_id = Number.parseFloat(req.body.course_row_id)
            if (Number.isNaN(course_row_id)) {
                errObj['course_row_id'] = 'Sorry, Invalid Course Row ID.'
            }
            else {
                const check_query = await coursesM.findOne({ _id: course_row_id })
                if (!check_query) {
                    errObj['course_row_id'] = 'Sorry, Invalid Course Row ID.'
                }
            }
        }

        if (req.body.course_name) {
            let where_course_name = { course_name: sanitize(req.body.course_name) }
            if (course_row_id) {
                where_course_name = { course_name: sanitize(req.body.course_name), _id: { $ne: course_row_id } }
            }

            const check_course_name_query = await coursesM.findOne(where_course_name, { _id: 1 })
            if (check_course_name_query) {
                errObj['course_name'] = 'Sorry, This Course Name already exists.'
            }
        }

        let course_image = ""
        if (!Object.keys(errObj).length) {
            if (req.body.course_image) {
                const validate_n_save_image = await validateAndSaveImage(req.body.course_image, 9)
                if (!validate_n_save_image.status) {
                    errObj['course_image'] = 'Sorry, Invalid course image.'
                }
                else {
                    course_image = validate_n_save_image.webp_file_name
                }
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let generateUrl = await generateCourseUrl(req.body.course_name)

            if (course_row_id) {
                const update_array = {
                    course_name: req.body.course_name,
                    course_description: req.body.course_description,
                    date_n_time: getPresentDateTime(),
                    course_slug: generateUrl,
                    course_image: course_image,
                    expert_tag: req.body.expert_tag,
                    meta_keywords: req.body.meta_keywords,
                    meta_description: req.body.meta_description,
                }
                await coursesM.updateOne({ _id: course_row_id }, { $set: update_array })
                await deleteKeysByPattern('lessons_list_*')
                await deleteKeysByPattern('academy_course_list_*')
                await deleteKeysByPattern('individual_lesson_*')



                res.json({
                    status: true,
                    message: { alert_message: "This Course details has been updated successfully." }
                })
            }
            else {
                const saveObject = {
                    course_name: req.body.course_name,
                    course_description: req.body.course_description,
                    date_n_time: getPresentDateTime(),
                    course_slug: generateUrl,
                    course_image: course_image,
                    expert_tag: req.body.expert_tag,
                    meta_keywords: req.body.meta_keywords,
                    meta_description: req.body.meta_description,
                }
                try {
                    await coursesM(saveObject).save()
                    await deleteKeysByPattern('academy_course_list_*')
                    await deleteKeysByPattern('lessons_list_*')
                    await deleteKeysByPattern('individual_lesson_*')

                    res.json({
                        status: true,
                        message: { alert_message: "This Course details has been added successfully." }
                    })

                } catch (error) {
                    res.json({
                        status: false,
                        message: { error: error }
                    })
                }



            }
        }

    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message, error: errors }
        })
    }

})


router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const search_array = [];

        // Handle date filter
        if (req.query.date) {
            const inputDate = new Date(req.query.date);
            const start_date = new Date(inputDate.setHours(0, 0, 0, 0));
            const end_date = new Date(inputDate.setHours(23, 59, 59, 999));
            search_array.push({ date_n_time: { $gte: start_date, $lte: end_date } });
        }

        // Handle search filter
        if (req.query.search) {
            search_array.push({
                $or: [
                    { course_name: { $regex: req.query.search, $options: 'i' } }
                ]
            });
        }

        const search_query = search_array.length > 0 ? { $and: search_array } : {};
        const skip = !Number.isNaN(Number.parseFloat(req.params.skip)) ? Number.parseFloat(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseFloat(req.params.limit)) ? Number.parseFloat(req.params.limit) : 100;

        const get_query = await coursesM.aggregate([
            { $sort: { _id: -1 } },
            {
                $lookup: {
                    from: "cln_academy_courses_lessons",
                    localField: "_id",
                    foreignField: "course_row_id",
                    as: "lesson_info"
                }
            },
            { $match: search_query },
            {
                $project: {
                    _id: 1,
                    course_name: 1,
                    course_slug: 1,
                    date_n_time: 1,
                    course_description: 1,
                    course_image: 1,
                    total_lessons: { $size: "$lesson_info" },
                    expert_tag: 1,
                    meta_keywords: 1,
                    meta_description: 1,
                }
            }
        ]).skip(skip).limit(limit);

        res.json({
            status: true,
            message: get_query
        });

    } catch (err) {
        console.error('course list error:', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});


router.get('/details/:course_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const course_row_id = Number.parseFloat(sanitize(req.params.course_row_id))
        if (!Number.isNaN(course_row_id)) {
            const get_query = await coursesM.findOne({ _id: course_row_id })
            if (get_query) {
                res.json({
                    status: true,
                    message: get_query
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid Course row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Course Row ID."
                }
            })
        }
    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})



router.get('/delete/:course_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const course_row_id = Number.parseFloat(req.params.course_row_id)
        if (!Number.isNaN(course_row_id)) {
            const get_query = await coursesM.findOne({ _id: course_row_id })
            if (get_query) {
                const get_lessons_query = await lessonsM.findOne({ course_row_id: course_row_id })
                if (!get_lessons_query) {
                    await coursesM.deleteOne({ _id: course_row_id })
                    await deleteKeysByPattern('academy_course_list_*')

                    res.json({
                        status: true,
                        message: { alert_message: "This course details has been deleted successfully." }
                    })
                }
                else {

                    res.json({
                        status: false,
                        message: { alert_message: "You’ll need to remove this course from all lessons before deleting it." }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid course row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid course Row ID."
                }
            })
        }

    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})

module.exports = router