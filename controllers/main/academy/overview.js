const express = require('express')
const router = express.Router()
const lessonsM = require('../../../models/main/academy/lessonsM')
const lessons_bookmarksM = require('../../../models/main/academy/lessons_bookmarksM')
const chaptersM = require('../../../models/main/academy/chaptersM')
const quiz_lesson_started_detailsM = require('../../../models/main/academy/quiz_lesson_started_detailsM')
const weekly_contestsM = require('../../../models/main/contest/weekly_contestsM')
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM')
const streaksM = require('../../../models/main/academy/streaksM')
const streaks_lostM = require('../../../models/main/academy/streaks_lostM')
const { getPresentDateTime, getPresentDateOnly } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { sendAcademyEmail } = require('../../../config/email')
const { pipeline } = require('supertest/lib/test')
const users_quiz_answersM = require('../../../models/main/academy/users_quiz_answersM')
const user_page_trackM = require('../../../models/main/academy/user_page_trackM')



// streak steps
// Days count when user visit continueously visiting 
// if Day count

function isSameDay(d1, d2) {
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}
function startOfDay(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Get date N days ago at start of day
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return startOfDay(d);
}
router.get("/user_streak", async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1]);
        if (!checkUserToken.status) {
            return res.json({ status: false, message: "Unauthorized" });
        }

        const user_row_id = checkUserToken.message.user_row_id;
        const today = startOfDay();
        const threeDaysAgo = daysAgo(3);


        let currentStreak = await streaksM.findOne({ user_row_id });

        // If streak exists but last activity is over 3 days ago, delete it
        if (currentStreak && currentStreak.last_streak_date < threeDaysAgo) {
            await streaksM.deleteOne({ user_row_id });
            return res.json({
                status: true,
                message: "Streak reset due to inactivity",
                streak_days: 0,
                streak_active: false,
            });
        }

        // Already marked today
        if (currentStreak && isSameDay(currentStreak.last_streak_date, today)) {
            return res.json({
                status: true,
                streak_days: currentStreak.streak_days,
                streak_active: true,
            });
        }

        // User qualifies for today's streak
        // if (streakEarned) {
        //     if (!currentStreak) {
        //         await Streak.create({
        //             user_row_id,
        //             streak_days: 1,
        //             streak_active: true,
        //             last_streak_date: today,
        //         });
        //         return res.json({
        //             status: true,
        //             streak_days: 1,
        //             streak_active: true,
        //         });
        //     } else {
        //         currentStreak.streak_days += 1;
        //         currentStreak.streak_active = true;
        //         currentStreak.last_streak_date = today;
        //         await currentStreak.save();
        //         return res.json({
        //             status: true,
        //             streak_days: currentStreak.streak_days,
        //             streak_active: true,
        //         });
        //     }
        // }

        // No activity, no new streak today
        return res.json({
            status: true,
            // streak_days: currentStreak?.streak_days || 0,
            // streak_active: !!currentStreak,
        });
    } catch (err) {
        console.error("User Streak Error:", err);
        res.status(500).json({ status: false, message: "Server error" });
    }
});



const getCompletedLessons = async ({ course_row_id, user_row_id }) => {
    return await quiz_lesson_started_detailsM.countDocuments({ lesson_status: 1, user_row_id: user_row_id, course_row_id: course_row_id })
}

router.get('/', async (req, res) => {
    try {
        const present_time = getPresentDateOnly()
        // const beginner_lesson_query = lessonsM.countDocuments({ course_row_id: 1 })

        // const trader_lesson_query = lessonsM.countDocuments({ course_row_id: 2 })
        // const developer_lesson_query = lessonsM.countDocuments({ course_row_id: 3 })

        const beginner_lesson_query = lessonsM.aggregate([
            {
                $match: { course_row_id: 1 }
            },
            {
                $lookup: {
                    from: 'cln_academy_quiz_questions',
                    localField: 'lesson_id',
                    foreignField: 'lesson_row_id',
                    as: 'questions',
                    pipeline: [
                        {
                            $group: {
                                _id: '$lesson_row_id',
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
                $count: 'count'
            }
        ]);

        const trader_lesson_query = lessonsM.aggregate([
            {
                $match: { course_row_id: 2 }
            },
            {
                $lookup: {
                    from: 'cln_academy_quiz_questions',
                    localField: 'lesson_id',
                    foreignField: 'lesson_row_id',
                    as: 'questions',
                    pipeline: [
                        {
                            $group: {
                                _id: '$lesson_row_id',
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
                $count: 'count'
            }
        ]);

        const developer_lesson_query = lessonsM.aggregate([
            {
                $match: { course_row_id: 3 }
            },
            {
                $lookup: {
                    from: 'cln_academy_quiz_questions',
                    localField: 'lesson_id',
                    foreignField: 'lesson_row_id',
                    as: 'questions',
                    pipeline: [
                        {
                            $group: {
                                _id: '$lesson_row_id',
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
                $count: 'count'
            }
        ])

        const beginner_chapter_query = chaptersM.countDocuments({ course_row_id: 1 })
        const trader_chapter_query = chaptersM.countDocuments({ course_row_id: 2 })
        const developer_chapter_query = chaptersM.countDocuments({ course_row_id: 3 })

        const upcoming_contests_query = weekly_contestsM.aggregate([
            {
                $match: {
                    start_date: { $gt: new Date(present_time) }
                }
            },
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
                $count: 'count'
            }
        ])

        const ongoing_contests_query = weekly_contestsM.aggregate([
            {
                $match: {
                    start_date: { $lte: new Date(present_time) },
                    end_date: { $gte: new Date(present_time) }
                }
            },
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
                $count: 'count'
            }
        ])


        let my_contests_query = ''
        let lessons_bookmarks_query = ''
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message

            my_contests_query = weekly_contestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests_started_details",
                        localField: "_id",
                        foreignField: "contest_row_id",
                        as: "user_started",
                        pipeline: [
                            {
                                $match: { user_row_id: user_row_id, contest_status: 1 }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$user_started" }
                },
                {
                    $group: {
                        _id: '',
                        count: { $sum: 1 }
                    }
                }
            ])

            // lessons_bookmabrks_query = lessons_bookmarksM.countDocuments({ user_row_id: user_row_id, })
            lessons_bookmarks_query = lessons_bookmarksM.aggregate([
                {
                    $match: {
                        user_row_id: user_row_id
                    }
                },
                {
                    $lookup: {
                        from: 'cln_academy_courses_lessons',
                        localField: 'lesson_id',
                        foreignField: 'lesson_id',
                        as: 'lessons',
                        pipeline: [
                            {
                                $match: {
                                    course_row_id: { $in: [1, 2, 3] }
                                }
                            },
                            {
                                $limit: 1
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$lessons" }
                },
                {
                    $count: 'count'
                }
            ]);

        }

        const queries = [
            beginner_lesson_query,
            trader_lesson_query,
            developer_lesson_query,
            beginner_chapter_query,
            trader_chapter_query,
            developer_chapter_query,
            upcoming_contests_query,
            ongoing_contests_query,
            my_contests_query,
            lessons_bookmarks_query
        ].filter(query => query && typeof query.then === 'function'); // Filter only Promises

        const results = await Promise.all(queries);

        // Extract results safely, providing default empty arrays
        const total_beginner_lesson_count = results[queries.indexOf(beginner_lesson_query)] || [];
        const total_trader_lesson_count = results[queries.indexOf(trader_lesson_query)] || [];
        const total_developer_lesson_count = results[queries.indexOf(developer_lesson_query)] || [];
        const total_beginner_chapter = results[queries.indexOf(beginner_chapter_query)] || [];
        const total_trader_chapter = results[queries.indexOf(trader_chapter_query)] || [];
        const total_developer_chapter = results[queries.indexOf(developer_chapter_query)] || [];
        const total_upcoming_contests_query = results[queries.indexOf(upcoming_contests_query)] || [];
        const total_ongoing_contests_data = results[queries.indexOf(ongoing_contests_query)] || [];
        const total_my_contests_data = results[queries.indexOf(my_contests_query)] || [];
        const total_lessons_bookmarks_count = results[queries.indexOf(lessons_bookmarks_query)] || [];


        let total_beginner_lesson = 0
        if (total_beginner_lesson_count[0]) {
            total_beginner_lesson = total_beginner_lesson_count[0].count
        }
        let total_trader_lesson = 0
        if (total_trader_lesson_count[0]) {
            total_trader_lesson = total_trader_lesson_count[0].count
        }

        let total_developer_lesson = 0
        if (total_developer_lesson_count[0]) {
            total_developer_lesson = total_developer_lesson_count[0].count
        }
        let total_my_contests = 0
        if (total_my_contests_data[0]) {
            total_my_contests = total_my_contests_data[0].count
        }
        let total_ongoing_contests = 0
        if (total_ongoing_contests_data[0]) {
            total_ongoing_contests = total_ongoing_contests_data[0].count
        }

        let total_upcoming_contests = 0
        if (total_upcoming_contests_query[0]) {
            total_upcoming_contests = total_upcoming_contests_query[0].count
        }
        let total_lessons_bookmarks = 0
        if (total_lessons_bookmarks_count[0]) {
            total_lessons_bookmarks = total_lessons_bookmarks_count[0].count
        }

        res.json({
            status: true,
            message: {
                present_time,
                total_beginner_lesson: total_beginner_lesson,
                total_trader_lesson: total_trader_lesson,
                total_developer_lesson: total_developer_lesson,
                total_beginner_chapter: total_beginner_chapter,
                total_trader_chapter: total_trader_chapter,
                total_developer_chapter: total_developer_chapter,
                total_upcoming_contests,
                total_my_contests,
                total_lessons_bookmarks,
                total_ongoing_contests
            }
        })
    }
    catch (err) {
        res.json({ status: false, message: err.message })
    }
})

router.get('/course_overview/:course_row_id', async (req, res) => {
    try {
        const course_row_id = Number.parseInt(req.params.course_row_id)
        if (!Number.isNaN(course_row_id)) {
            // const total_lessons_query = lessonsM.countDocuments({ course_row_id: course_row_id })
            const total_lessons_query = lessonsM.aggregate([
                { $match: { course_row_id: course_row_id } },
                {
                    $lookup: {
                        from: "cln_academy_quiz_questions",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id",
                        pipeline: [
                            { $group: { _id: "$lesson_row_id", count: { $sum: 1 } } }
                        ],
                        as: "lessonQues"
                    }
                },
                {
                    $addFields: {
                        total_questions_count: {
                            $ifNull: [{ $arrayElemAt: ["$lessonQues.count", 0] }, 0]
                        }
                    }
                },
                { $match: { total_questions_count: { $gte: 10 } } },
                { $count: "count" }
            ]).then(res => res[0]?.count || 0)

            let completed_lessons_query = ''
            let next_lesson_query = ''
            let user_row_id = ''
            let streaks_count_query = ''
            let streak_risk_query = ''
            let streaks_lost_query = ''

            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message

                completed_lessons_query = quiz_lesson_started_detailsM.countDocuments({
                    lesson_status: 1,
                    user_row_id: user_row_id,
                    course_row_id: course_row_id
                })

                next_lesson_query = lessonsM.aggregate([
                    {
                        $match: { course_row_id: course_row_id }
                    },
                    {
                        $lookup: {
                            from: "cln_academy_quiz_questions",
                            localField: "lesson_id",
                            foreignField: "lesson_row_id",
                            pipeline: [
                                {
                                    $group: {
                                        _id: '$lesson_row_id',
                                        count: { $sum: 1 }
                                    }
                                }
                            ],
                            as: "lessonQues"
                        }
                    },
                    {
                        $addFields: {
                            total_questions_count: {
                                $ifNull: [{ $arrayElemAt: ["$lessonQues.count", 0] }, 0]
                            }
                        }
                    },
                    {
                        $match: {
                            total_questions_count: { $gte: 10 }
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_academy_quiz_lession_started_details",
                            let: { lessonId: "$lesson_id" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$lesson_row_id", "$$lessonId"] },
                                                { $eq: ["$user_row_id", user_row_id] },
                                                { $eq: ["$lesson_status", 1] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "completionStatus"
                        }
                    },
                    {
                        $match: { completionStatus: { $eq: [] } }
                    },
                    {
                        $lookup: {
                            from: "cln_academy_courses_chapters",
                            localField: "chapter_row_id",
                            foreignField: "_id",
                            pipeline: [
                                { $project: { chapter_number: 1 } }
                            ],
                            as: "chapters"
                        }
                    },
                    { $unwind: "$chapters" },
                    {
                        $set: {
                            chapter_number: "$chapters.chapter_number"
                        }
                    },
                    { $sort: { chapter_number: 1, lesson_number: 1 } },
                    { $limit: 1 },
                    {
                        $project: {
                            _id: 1,
                            lesson_number: 1,
                            chapter_number: 1,
                            lesson_id: 1,
                            title: 1,
                            author_name: 1,
                            updated_on: 1,
                            lesson_image_url: 1,
                            chapter_row_id: 1,
                            lesson_url: 1
                        }
                    }
                ])

                streaks_count_query = streaksM.countDocuments({ user_row_id })

                streaks_lost_query = streaks_lostM.findOne({ user_row_id: user_row_id }, { _id: 1 })

                streak_risk_query = streaksM.aggregate([
                    { $match: { user_row_id: user_row_id } },
                    { $sort: { date_only: -1 } },
                    { $limit: 2 },
                    {
                        $group: {
                            _id: null,
                            dates: { $push: "$date_only" }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            days: {
                                $dateDiff: {
                                    startDate: { $arrayElemAt: ["$dates", 1] },
                                    endDate: { $arrayElemAt: ["$dates", 0] },
                                    unit: "day"
                                }
                            }
                        }
                    }
                ])
            }

            const queries = [
                total_lessons_query,
                completed_lessons_query,
                next_lesson_query,
                streaks_count_query,
                streak_risk_query,
                streaks_lost_query
            ].filter(query => query && typeof query.then === 'function'); // Filter only Promises

            const results = await Promise.all(queries);

            // Extract results safely, providing default values
            const total_lessons = results[queries.indexOf(total_lessons_query)] || 0;
            const total_completed_lessons = results[queries.indexOf(completed_lessons_query)] || 0;
            const next_lesson_array = results[queries.indexOf(next_lesson_query)] || [];
            const streaks_count = results[queries.indexOf(streaks_count_query)] || 0;
            const streak_risk_obj = results[queries.indexOf(streak_risk_query)] || [];
            const streaks_lost_obj = results[queries.indexOf(streaks_lost_query)] || [];

            let result = {}
            result['completed_lessons'] = total_completed_lessons
            result['total_lessons'] = total_lessons
            result['course_progress'] = ((total_completed_lessons / total_lessons) * 100).toFixed(2)
            result['course_completed_status'] = false

            if (total_completed_lessons === total_lessons && total_lessons > 0) {
                const certificate = await courses_certificatesM.findOne({
                    user_row_id: user_row_id,
                    course_row_id: course_row_id
                }, { _id: 1 })

                if (certificate) {
                    result['certificate_row_id'] = certificate._id
                    result['course_completed_status'] = true
                }
            }

            const next_lesson = next_lesson_array[0] ? next_lesson_array[0] : ''
            result['next_lesson'] = next_lesson

            result['streaks_count'] = streaks_count > 0 ? streaks_count - 1 : 0

            let streak_risk_days = 0
            if (streak_risk_obj[0]) {
                streak_risk_days = streak_risk_obj[0].days ? (streak_risk_obj[0].days - 1) : 0
            }
            result['streak_risk_days'] = streak_risk_days
            const streak_lost_status = streaks_lost_obj ? 2 : 0

            result['streak_risk_status'] = streak_risk_days ? 1 : streak_lost_status
            // 1: at risk, 2:lost, 0:nothing

            if (next_lesson) {
                const chapter_row_id = next_lesson.chapter_row_id
                result['chapter_number'] = next_lesson.chapter_number

                const completed_chapter_lessons_query = lessonsM.aggregate([
                    { $match: { course_row_id, chapter_row_id } },
                    {
                        $lookup: {
                            from: "cln_academy_quiz_lession_started_details",
                            localField: "lesson_id",
                            foreignField: "lesson_row_id",
                            pipeline: [{ $match: { user_row_id: user_row_id, lesson_status: 1 } }],
                            as: "started_info"
                        }
                    },
                    { $unwind: '$started_info' },
                    { $count: 'count' }
                ])

                const total_chapter_lessons_query = lessonsM.countDocuments({ course_row_id, chapter_row_id })

                const next_lesson_status_query = quiz_lesson_started_detailsM.countDocuments({
                    lesson_id: next_lesson.lesson_id,
                    lesson_status: 0,
                    user_row_id: user_row_id,
                    course_row_id: course_row_id
                })

                const [
                    completed_chapter_lessons,
                    total_chapter_lessons,
                    next_lesson_status_obj
                ] = await Promise.all([
                    completed_chapter_lessons_query,
                    total_chapter_lessons_query,
                    next_lesson_status_query
                ])

                result['total_chapter_lessons'] = total_chapter_lessons
                result['completed_chapter_lessons'] = completed_chapter_lessons[0] ? completed_chapter_lessons[0].count : 0
                result['next_lesson_status'] = next_lesson_status_obj > 0
            }

            res.json({ status: true, message: result })

        } else {
            res.json({ status: false, message: { alert_message: 'Sorry, invalid course row id.' } })
        }

    } catch (err) {
        console.error('Error in course overview:', err.message)
        res.json({ status: false, message: err.message })
    }
})


router.get('/certificate_list', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message

            const get_query = await courses_certificatesM.aggregate([
                {
                    $match: {
                        user_row_id
                    }
                },
                {
                    $lookup: {
                        from: 'cln_academy_courses',
                        localField: 'course_row_id',
                        foreignField: '_id',
                        as: 'courses',
                        pipeline: [
                            {
                                $project: {
                                    course_name: 1,
                                    course_url: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: '$courses'
                },
                {
                    $project: {
                        course_name: '$courses.course_name',
                        course_url: '$courses.course_url',
                        course_row_id: 1,
                        percentage_score: 1,
                        download_status: 1,
                        date_n_time: 1
                    }
                }
            ])

            res.json({ status: true, message: get_query })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: err.message })
    }
})



router.get('/individual_certificate_details/:certificate_row_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message

            const certificate_row_id = Number.parseInt(req.params.certificate_row_id)

            const get_query = await courses_certificatesM.aggregate([
                {
                    $match: {
                        _id: certificate_row_id,
                        user_row_id
                    }
                },
                {
                    $lookup: {
                        from: 'cln_academy_courses',
                        localField: 'course_row_id',
                        foreignField: '_id',
                        as: 'courses',
                        pipeline: [
                            {
                                $project: {
                                    course_name: 1,
                                    course_url: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: '$courses'
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $project: {
                                    full_name: 1,
                                    pro_batch: 1,

                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $project: {
                        full_name: "$user_info.full_name",
                        pro_batch: "$user_info.pro_batch",
                        course_name: '$courses.course_name',
                        course_url: '$courses.course_url',
                        course_row_id: 1,
                        percentage_score: 1,
                        download_status: 1,
                        date_n_time: 1
                    }
                }
            ])

            if (get_query[0]) {
                res.json({ status: true, message: get_query[0] })
            }
            else {
                res.json({ status: true, message: { alert_message: 'Invalid certificate row id' } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: err.message })
    }
})


router.get('/update_certificate_download_status/:certificate_row_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message

            const certificate_row_id = Number.parseInt(req.params.certificate_row_id)

            const get_query = await courses_certificatesM.findOne({ user_row_id, _id: certificate_row_id, download_status: { $ne: 1 } })
            if (get_query) {
                await courses_certificatesM.updateOne({ _id: get_query._id }, { $set: { download_status: 1 } })

                res.json({ status: true, message: { alert_message: 'Your certificate download status details is updated successfully.' } })
            }
            else {
                res.json({ status: true, message: { alert_message: 'Invalid certificate row id' } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: err.message })
    }
})



module.exports = router