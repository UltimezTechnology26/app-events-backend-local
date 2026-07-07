const express = require('express')
const router = express.Router()
const coursesM = require('../../../models/main/academy/coursesM')
const lessonsM = require('../../../models/main/academy/lessonsM')
const chaptersM = require('../../../models/main/academy/chaptersM')
const quiz_lesson_started_detailsM = require('../../../models/main/academy/quiz_lesson_started_detailsM')
const users_quiz_answersM = require('../../../models/main/academy/users_quiz_answersM')
const users_remainder_emailsM = require('../../../models/main/academy/users_remainder_emailsM')
const quiz_not_complete_remaindersM = require('../../../models/main/academy/quiz_not_complete_remaindersM')
const quiz_questionsM = require('../../../models/main/academy/quiz_questionsM')
const professionalsM = require('../../../models/app/professionalsM')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { sendAcademyEmail } = require('../../../config/email')
const { getScoreRanges, updateStreakDetails } = require('../../../utils/helpers/academy_helper')
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM')
const lesson_likeM = require('../../../models/main/academy/lesson_likeM')
const { check, validationResult } = require('express-validator')
const lesson_total_readerM = require('../../../models/main/academy/lesson_total_readerM')
const sanitize = require('mongo-sanitize')
const old_lessonsM = require('../../../models/main/academy/old_lessonsM')
const old_chaptersM = require('../../../models/main/academy/old_chaptersM')
const { getCache, setCache } = require('../../../config/cache_helper')
const { getLessonsList, getIndividualLessonDetails } = require('../../../services/main/lesson')


router.get('/chapter_overview/:course_row_id/:chapter_number', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        let user_row_id = 0
        if (checkToken.status) {
            user_row_id = checkToken.message

            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.course_row_id))) {
                errObj['course_row_id'] = 'The parameter course row id field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.chapter_number))) {
                errObj['chapter_number'] = 'The parameter chapter number field must be contain valid number.'
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const result = {}
                const course_row_id = Number.parseInt(req.params.course_row_id)
                const chapter_number = Number.parseInt(req.params.chapter_number)

                const get_query = await chaptersM.aggregate([
                    {
                        $match: { course_row_id: course_row_id, chapter_number: chapter_number }
                    },
                    {
                        $lookup: {
                            from: "cln_academy_courses_lessons",
                            localField: "_id",
                            foreignField: "chapter_row_id",
                            as: "lessons",
                            pipeline: [
                                {
                                    $lookup: {
                                        from: "cln_academy_quiz_lession_started_details",
                                        localField: "lesson_id",
                                        foreignField: "lesson_row_id",
                                        pipeline: [{ $match: { user_row_id: user_row_id } }],
                                        as: "lessonInfo"
                                    }
                                },
                                {
                                    $unwind: { path: "$lessonInfo", preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $set: {
                                        lesson_status: "$lessonInfo.lesson_status"
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        lesson_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $unwind: "$lessons"
                    },
                    {
                        $group: {
                            _id: null,
                            total_lessons: { $sum: 1 },
                            total_completed_lessons: {
                                $sum: {
                                    $cond: [{ $eq: ["$lessons.lesson_status", 1] }, 1, 0]
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            total_lessons: 1,
                            total_completed_lessons: 1
                        }
                    }
                ]);

                result['total_lessons'] = get_query[0] ? get_query[0].total_lessons : 0
                result['total_completed_lessons'] = get_query[0] ? get_query[0].total_completed_lessons : 0

                const chapterDetails = await chaptersM.aggregate([
                    {
                        $match: { course_row_id: course_row_id, chapter_number: chapter_number }
                    },
                    {
                        $lookup: {
                            from: "cln_academy_courses_lessons",
                            localField: "_id",
                            foreignField: "chapter_row_id",
                            as: "lessons",
                            pipeline: [
                                {
                                    $lookup: {
                                        from: "cln_academy_quiz_questions",
                                        localField: "lesson_id",
                                        foreignField: "lesson_row_id",
                                        as: "lessonInfo"
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "cln_academy_quiz_lession_started_details",
                                        localField: "lesson_id",
                                        foreignField: "lesson_row_id",
                                        pipeline: [{ $match: { user_row_id: user_row_id } }],
                                        as: "lessonStartedInfo"
                                    }
                                },
                                {
                                    $unwind: { path: "$lessonStartedInfo", preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $lookup: {
                                        from: "cln_academy_quiz_answers",
                                        localField: "lesson_id",
                                        foreignField: "lesson_row_id",
                                        pipeline: [{ $match: { user_row_id: user_row_id, answer_status: true } }],
                                        as: "lessonAns"
                                    }
                                },
                                {
                                    $project: {
                                        questionCount: { $size: "$lessonInfo" },
                                        total_correct_answers: { $size: "$lessonAns" }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $unwind: "$lessons"
                    },
                    {
                        $group: {
                            _id: null,
                            totalQuestionCount: { $sum: "$lessons.questionCount" },
                            total_correct_answers: { $sum: "$lessons.total_correct_answers" }
                        }
                    }
                ]);

                result['totalQuestionCount'] = chapterDetails[0] ? chapterDetails[0].totalQuestionCount : 0
                result['totalCorrectAnswers'] = chapterDetails[0] ? chapterDetails[0].total_correct_answers : 0

                res.json({ status: true, message: result })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Courses list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/chapters_list/:course_row_id', async (req, res) => {
    try {
        const course_row_id = Number.parseInt(req.params.course_row_id)
        if (!Number.isNaN(course_row_id)) {
            let user_row_id = ""
            let lesson_completed_query = 0
            let your_score_query = []
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message
                courseWelcomeEmail(user_row_id)
                lesson_completed_query = quiz_lesson_started_detailsM.countDocuments({ lesson_status: 1, user_row_id: user_row_id, course_row_id: course_row_id })
                your_score_query = users_quiz_answersM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_academy_quiz_questions",
                            localField: "question_row_id",
                            foreignField: "_id",
                            as: "questionInfo"
                        }
                    },
                    {
                        $set:
                        {
                            course_row_id: "$questionInfo.course_row_id"
                        },
                    },
                    { $match: { user_row_id: user_row_id, answer_status: true, course_row_id: course_row_id } },
                    {
                        $count: "count"
                    }
                ])


            }

            const total_lessons_query = lessonsM.countDocuments({ course_row_id: course_row_id })

            const get_chapters_query = chaptersM.aggregate([
                {
                    $sort: { chapter_number: 1 }
                },
                {
                    $match: { course_row_id: course_row_id }
                },
                {
                    $lookup:
                    {
                        from: "cln_academy_courses_lessons",
                        localField: "_id",
                        foreignField: "chapter_row_id",
                        as: "completed_lessons",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_academy_quiz_lession_started_details",
                                    localField: "lesson_id",
                                    foreignField: "lesson_row_id", //coinpedia article row id
                                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                                    as: "lessonInfo"
                                }
                            },
                            {
                                $unwind: { path: "$lessonInfo", preserveNullAndEmptyArrays: true }
                            },
                            {
                                $set: {
                                    lesson_status: '$lessonInfo.lesson_status'
                                }
                            },
                            {
                                $match: { lesson_status: 1 }
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
                    $project: {
                        _id: 1,
                        chapter_number: 1,
                        title: 1,
                        description: 1,
                        total_completed_lessons: { $size: "$completed_lessons" }
                    }
                }
            ])
            const get_certficate = lessonsM.aggregate([

                {
                    $match: { course_row_id: course_row_id, lesson_status: 1 }
                },
                {
                    $lookup: {
                        from: "cln_academy_courses_certificates",
                        localField: "course_row_id",
                        foreignField: "_id",
                        as: "certificate_info",
                    }
                },
                {
                    $unwind: { path: "$certificate_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $project: {
                        certificate_ids: "$certificate_info"
                    }
                }
            ])
            // console.log("get_certficate")
            const queries = [
                lesson_completed_query,
                your_score_query,
                total_lessons_query,
                get_chapters_query,
                get_certficate
            ].filter(query => query && typeof query.then === 'function'); // Filter only Promises

            const results = await Promise.all(queries);

            // Extract results safely, providing default values
            const lesson_completed = results[queries.indexOf(lesson_completed_query)] || 0;
            const total_score_data = results[queries.indexOf(your_score_query)] || [];
            const total_lessons = results[queries.indexOf(total_lessons_query)] || 0;
            const chapters_list = results[queries.indexOf(get_chapters_query)] || [];
            const certificate_id = results[queries.indexOf(get_certficate)] || [];

            let total_score = 0
            if (total_score_data[0]) {
                total_score = total_score_data[0].count
            }

            res.json({
                status: true,
                message: {
                    lesson_completed,
                    total_score,
                    total_lessons,
                    chapters_list,
                    certificate_row_id: certificate_id?.[0]?.certificate_ids?._id || ""

                }
            })
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
    catch (err) {
        console.log('Chapters list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/lessons_list/:course_slug/:skip/:limit', async (req, res) => {
    try {
        const course_slug = req.params.course_slug;

        if (course_slug) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;

            const result = await getLessonsList(
                course_slug,
                skip,
                limit,
                req.query.search,
                req.query.quiz_type,
                req.headers
            );

            if (result.status === false && result.message === "Course not found.") {
                return res.status(404).json(result);
            }

            res.json(result);
        } else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Course Row ID."
                },
                slug: req.params.course_slug
            });
        }
    } catch (err) {
        console.error('Lessons list error:', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});




router.get('/recommended_lessons/:course_row_id/:skip/:limit', async (req, res) => {
    try {
        const course_row_id = Number.parseInt(req.params.course_row_id)

        if (Number.isFinite(course_row_id)) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let user_row_id = ""
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message
            }

            const search_array = [{}]

            if (req.query.search) {
                search_array.push({
                    $or: [
                        { title: { '$regex': req.query.search, $options: 'i' } },
                        { author_name: { '$regex': req.query.search, $options: 'i' } },
                        { lesson_url: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            if (req.query.quiz_type) {
                const quiz_type = Number.parseInt(req.query.quiz_type)
                if (quiz_type > 0 && quiz_type <= 4) {
                    const quiz_type_object = getScoreRanges(quiz_type)
                    search_array.push(quiz_type_object)
                }
            }

            if (req.query.chapter_row_id) {
                const chapter_row_id = Number.parseInt(req.query.chapter_row_id)
                search_array.push({ chapter_row_id })
            }

            const search_query = { $and: search_array }

            const get_query = lessonsM.aggregate([
                { $match: { recommended_status: 1, course_row_id: course_row_id } },
                { $sort: { chapter_row_id: 1, lesson_number: 1 } },
                {
                    $lookup: {
                        from: "cln_academy_courses_lessons_bookmarks",
                        localField: "lesson_id",
                        foreignField: "lesson_id",
                        pipeline: [
                            { $match: { user_row_id: user_row_id } },
                            { $project: { _id: 1 } }
                        ],
                        as: "bookmark_info"
                    }
                },
                { $unwind: { path: "$bookmark_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_academy_quiz_questions",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id",
                        as: "lessonQues"
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_answers",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id",
                        pipeline: [
                            { $match: { user_row_id: user_row_id, answer_status: true } },
                            {
                                $group: {
                                    _id: null,
                                    total_correct_answers: { $sum: 1 }
                                }
                            }
                        ],
                        as: "lessonAns"
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_answers",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id",
                        pipeline: [
                            { $match: { user_row_id: user_row_id } },
                            { $project: { close_status: 1, answer_number: 1 } }
                        ],
                        as: "lessoncompleted"
                    }
                },
                {
                    $addFields: {
                        total_correct_answers: {
                            $ifNull: [{ $arrayElemAt: ['$lessonAns.total_correct_answers', 0] }, 0]
                        },
                        close_status_array: {
                            $reduce: {
                                input: {
                                    $map: {
                                        input: "$lessoncompleted.close_status",
                                        as: "cs",
                                        in: {
                                            $cond: {
                                                if: { $isArray: "$$cs" },
                                                then: "$$cs",
                                                else: ["$$cs"]
                                            }
                                        }
                                    }
                                },
                                initialValue: [],
                                in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] }
                            }
                        },
                        answer_number_array: {
                            $reduce: {
                                input: {
                                    $map: {
                                        input: "$lessoncompleted.answer_number",
                                        as: "an",
                                        in: {
                                            $cond: {
                                                if: { $isArray: "$$an" },
                                                then: "$$an",
                                                else: ["$$an"]
                                            }
                                        }
                                    }
                                },
                                initialValue: [],
                                in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] }
                            }
                        }
                    }
                },
                { $match: search_query },
                {
                    $project: {
                        _id: 1,
                        lesson_number: 1,
                        lesson_id: 1,
                        title: 1,
                        author_id: 1,
                        author_name: 1,
                        author_link: 1,
                        updated_on: 1,
                        lesson_image_url: 1,
                        lesson_url: 1,
                        chapter_row_id: 1,
                        // answer_number: "$answer_number_array",
                        // close_status: "$close_status_array",
                        bookmark_status: {
                            $cond: { if: "$bookmark_info._id", then: 1, else: 0 }
                        },
                        total_correct_answers: 1,
                        total_question_count: { $size: "$lessonQues" },
                        lesson_completed_status: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $gt: [{ $size: { $ifNull: ["$close_status_array", []] } }, 0] },
                                        { $in: [true, "$close_status_array"] }
                                    ]
                                },
                                then: {
                                    $cond: {
                                        if: { $gte: [{ $ifNull: ["$total_correct_answers", 0] }, 7] },
                                        then: 1,
                                        else: 2
                                    }
                                },
                                else: 0
                            }
                        }
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = lessonsM.aggregate([
                { $match: { recommended_status: 1, course_row_id: course_row_id } },
                {
                    $lookup: {
                        from: "cln_academy_quiz_answers",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id",
                        pipeline: [
                            { $match: { user_row_id: user_row_id, answer_status: true } },
                            {
                                $group: {
                                    _id: '',
                                    total_correct_answers: { $sum: 1 }
                                }
                            }
                        ],
                        as: "lessonAns"
                    }
                },
                {
                    $set: {
                        total_correct_answers: {
                            $ifNull: [{ $arrayElemAt: ['$lessonAns.total_correct_answers', 0] }, 0]
                        }
                    }
                },
                { $match: search_query },
                { $count: 'count' }
            ])

            const [result1, result2] = await Promise.all([get_query, count_query])

            let total_counts = 0
            if (result2[0]) {
                total_counts = result2[0].count
            }

            res.json({
                status: true,
                message: result1,
                count: total_counts
            })
        } else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Course Row ID."
                }
            })
        }
    } catch (err) {
        console.log('Recommended lessons error:', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/individual_details_old/:lesson_row_id', async (req, res) => {
    try {
        const lesson_row_id = Number.parseInt(req.params.lesson_row_id)
        if (!Number.isNaN(lesson_row_id)) {
            let user_row_id = ""
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message
            }

            const get_query = await old_lessonsM.aggregate([
                {
                    $sort: { lesson_number: 1 }
                },
                {
                    $match: { lesson_id: lesson_row_id }
                },

                {
                    $project: {
                        _id: 1,
                        course_row_id: 1,
                        lesson_number: 1,
                        lesson_id: 1,
                        title: 1,
                        description: 1,
                        lesson_image_url: 1,
                        chapter_row_id: 1,

                        lesson_url: 1
                    }
                }
            ]).limit(1)

            if (get_query[0]) {
                const lesson_number = Number.parseInt(get_query[0].lesson_number)
                const course_row_id = Number.parseInt(get_query[0].course_row_id)
                const chapter_row_id = Number.parseInt(get_query[0].chapter_row_id)

                let related_lessons = []
                related_lessons.push(lesson_number - 1)
                related_lessons.push(lesson_number + 1)

                const related_lesson_query = await old_lessonsM.aggregate([
                    {
                        $sort: { lesson_number: 1 }
                    },
                    {
                        $match: { course_row_id: course_row_id, chapter_row_id: chapter_row_id, lesson_number: { $in: related_lessons } }
                    },

                    {
                        $project: {
                            _id: 1,
                            course_row_id: 1,
                            lesson_number: 1,
                            lesson_id: 1,
                            title: 1,
                            description: 1,
                            lesson_image_url: 1,

                            lesson_url: 1
                        }
                    }
                ]).limit(2)

                if (user_row_id && course_row_id && lesson_row_id) {
                    await setRemainderEmail(user_row_id, course_row_id, lesson_row_id)
                }

                res.json({
                    status: true,
                    message: { details: get_query[0], related_lessons: related_lesson_query, }
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid lesson row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Lesson Row ID."
                }
            })
        }

    }
    catch (err) {
        console.log('Individual lesson details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/individual_details/:lesson_url', async (req, res) => {
    try {
        const lesson_url = req.params.lesson_url;
        if (lesson_url) {
            const result = await getIndividualLessonDetails(lesson_url, req.headers);

            if (result.status === false && result.message === "Lesson not found.") {
                return res.status(404).json(result);
            }

            res.json(result);
        } else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Lesson URL."
                }
            });
        }
    } catch (err) {
        console.error('Individual lesson details error:', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});


router.get('/get_count', async (req, res) => {

    const beginner_lessons = lessonsM.aggregate([
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

    const trader_lessons = lessonsM.aggregate([
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

    const developer_lessons = lessonsM.aggregate([
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
    ]);

    const [
        total_beginner_lesson_count,
        total_trader_lesson_count,
        total_developer_lesson_count,
    ] = await Promise.all([beginner_lessons, trader_lessons, developer_lessons]);

    let total_beginner_lesson = 0;
    if (total_beginner_lesson_count[0]) {
        total_beginner_lesson = total_beginner_lesson_count[0].count;
    }

    let total_trader_lesson = 0;
    if (total_trader_lesson_count[0]) {
        total_trader_lesson = total_trader_lesson_count[0].count;
    }

    let total_developer_lesson = 0;
    if (total_developer_lesson_count[0]) {
        total_developer_lesson = total_developer_lesson_count[0].count;
    }

    // Correcting the response: returning all the counts
    res.json({
        status: true,
        message: {
            total_beginner_lesson,
            total_trader_lesson,
            total_developer_lesson
        }
    });
});


const setRemainderEmail = async (user_row_id, course_row_id, lesson_row_id) => {
    let insert_array = {}
    insert_array['course_row_id'] = course_row_id
    insert_array['lesson_row_id'] = lesson_row_id
    const check_question_query = await quiz_questionsM.findOne(insert_array)
    if (check_question_query) {
        insert_array['user_row_id'] = user_row_id
        const check_query = await quiz_not_complete_remaindersM.findOne(insert_array)
        if (!check_query) {
            const lesson_started_query = await quiz_lesson_started_detailsM.findOne(insert_array)
            if (!lesson_started_query) {
                const quiz_not_complete_query = await quiz_not_complete_remaindersM.countDocuments({ user_row_id: user_row_id, email_sent_status: false })
                if (!quiz_not_complete_query) {
                    insert_array['date_n_time'] = getPresentDateTime()
                    insert_array['email_sent_status'] = false
                    await quiz_not_complete_remaindersM(insert_array).save()
                    return true
                }
                else {
                    return false
                }
            }
            else {
                return false
            }
        }
        else {
            return false
        }
    }
    else {
        return false
    }
}

router.get('/demo', async (req, res) => {
    try {
        const get_query = await coursesM.aggregate([
            {
                $sort: {
                    _id: 1
                }
            },
            {
                $lookup:
                {
                    from: "cln_academy_courses_lessons",
                    localField: "_id",
                    foreignField: "course_row_id",
                    as: "lesson_info",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_academy_courses_chapters",
                                localField: "chapter_row_id",
                                foreignField: "_id",
                                as: "chapter_info",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1,
                                            chapter_number: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$chapter_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                chapter_number: "$chapter_info.chapter_number"
                            }
                        },
                        {
                            $sort: {
                                chapter_number: 1, lesson_number: 1
                            }
                        },
                        {
                            $limit: 3
                        },
                        {
                            $project: {
                                _id: 1,
                                title: 1,
                                chapter_number: 1,
                                lesson_image_url: 1,
                                lesson_url: 1,
                                lesson_number: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    course_name: 1,
                    course_url: 1,
                    lesson_info: "$lesson_info"
                }
            }
        ]).limit(2)

        //await courseWelcomeEmail(5934)

        res.json({
            status: false,
            message: get_query
        })

    }
    catch (err) {
        console.log('Demo.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


const courseWelcomeEmail = async (user_row_id) => {
    const check_query = await users_remainder_emailsM.findOne({ user_row_id: user_row_id, email_type: 1 })
    if (!check_query) {
        const get_course_query = await coursesM.aggregate([
            {
                $sort: {
                    _id: 1
                }
            },
            {
                $lookup:
                {
                    from: "cln_academy_courses_lessons",
                    localField: "_id",
                    foreignField: "course_row_id",
                    as: "lesson_info",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_academy_courses_chapters",
                                localField: "chapter_row_id",
                                foreignField: "_id",
                                as: "chapter_info",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1,
                                            chapter_number: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$chapter_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                chapter_number: "$chapter_info.chapter_number"
                            }
                        },
                        {
                            $sort: {
                                chapter_number: 1, lesson_number: 1
                            }
                        },
                        {
                            $limit: 3
                        },
                        {
                            $project: {
                                _id: 1,
                                title: 1,
                                chapter_number: 1,
                                lesson_image_url: 1,
                                lesson_url: 1,
                                lesson_number: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    course_name: 1,
                    course_url: 1,
                    lesson_info: "$lesson_info"
                }
            }
        ]).limit(2)


        let course_over_section = ''
        if (get_course_query[0]) {
            for (let run of get_course_query) {
                if (run.lesson_info) {
                    if (run.lesson_info[0]) {
                        course_over_section += `<h4 style='padding: 15px 0; margin: 0; border-top: 1px solid #384860;'><b>Check Out Chapters On '` + run.course_name + `' Course</b></h4>`
                        let lesson_over_section = ''
                        for (let inner_run of run.lesson_info) {
                            lesson_over_section += ` 
                                <div style='width: 31.5%; margin: 0 0.5%; display: inline-block;vertical-align: top;'>
                                    <a href='https://coinpedia.org/${run.course_url + "/" + inner_run.lesson_url}'>
                                        <img src='${inner_run.lesson_image_url}' style='width: 100%;border-radius: 5px;' />
                                        <h5 style='margin: 5px 0; color: #000;font-size: 10px;'>`+ inner_run.title + `</h5>
                                    </a>
                                </div>
                            `
                        }
                        course_over_section += lesson_over_section
                    }
                }
            }
        }
        const insert_object = {
            user_row_id: user_row_id,
            email_type: 1,
            sent_status: true,
            date_n_time: getPresentDateTime()
        }
        await users_remainder_emailsM(insert_object).save()

        const user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, user_name: 1, email_id: 1 })
        if (user_query) {
            const full_name = user_query.full_name
            //const user_name = user_query.user_name
            const email_id = user_query.email_id
            const pass_subject = "Get started with Coinpedia Academy Courses!"
            const header_profile_section = "Get started with Coinpedia Academy Courses!"


            const pass_message = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                        <h3>Hello ${full_name},</h3>

                        <p style='color: #384860;line-height: 1.5;'>Learn all About Blockchain and Crypto on Coinpedia Academy. Whether you are a newbie trying to understand or an expert looking to enhance your trading strategies, we got you covered. !</p>

                        <p style='color: #384860;line-height: 1.5;'>We have the best courses available online. Get access to our unlimited content. </p>

                        <p><b>So why wait, begin with your first lesson today.</b></p>

                        <a href='https://coinpedia.org/beginners-guide/' style='text-decoration: none;background: #5ce181; border: 0; color: #000; padding: 10px 25px; font-weight: 600; border-radius: 3px; font-size: 14px; display: inline-block;'>Begin Course</a>

                        <h3 style='margin-bottom: 0;'>On Coinpedia Academy You Get:</h3>
                        <ul style='list-style: none; padding-left: 0; margin-top: 10px;'>
                            <li style='line-height:2;color: #384860;'><img src='https://image.coinpedia.org/wp-content/uploads/2022/10/01153436/check-box.png' style='vertical-align: sub;width: 16px;' /> Certified courses that are available for learning. </li>
                            <li style='line-height:2;color: #384860;'><img src='https://image.coinpedia.org/wp-content/uploads/2022/10/01153436/check-box.png' style='vertical-align: sub;width: 16px;' /> Insights from our top crypto and blockchain experts. </li>
                            <li style='line-height:2;color: #384860;'><img src='https://image.coinpedia.org/wp-content/uploads/2022/10/01153436/check-box.png' style='vertical-align: sub;width: 16px;' /> Exclusive access to online courses. </li>
                            <li style='line-height:2;color: #384860;'><img src='https://image.coinpedia.org/wp-content/uploads/2022/10/01153436/check-box.png' style='vertical-align: sub;width: 16px;' /> Unlimited content to our subscribers. </li>
                            <li style='line-height:2;color: #384860;'><img src='https://image.coinpedia.org/wp-content/uploads/2022/10/01153436/check-box.png' style='vertical-align: sub;width: 16px;' /> Weekly sessions with the leading experts, analysts, and traders from the crypto industry. </li>
                        </ul>
                        
                        ${course_over_section}
                        </div>`

            // <p style='margin-bottom: 0;padding-bottom: 5px;'>Happy Learning,</p>
            // <p style='margin-top: 0;padding-top: 0;'>Team Coinpedia</p>

            await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)
            return true
        }
    }
    else {
        return true
    }

}


router.get('/list/:course_row_id', async (req, res) => {
    try {
        const course_row_id = Number.parseInt(req.params.course_row_id)
        if (!Number.isNaN(course_row_id)) {
            let user_row_id = ""
            let lesson_completed = 0
            let total_score = 0
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message

                lesson_completed = await quiz_lesson_started_detailsM.countDocuments({ lesson_status: 1, user_row_id: user_row_id, course_row_id: course_row_id })

                total_score = await users_quiz_answersM.countDocuments({ course_row_id: course_row_id, answer_status: true, user_row_id: user_row_id })

            }


            const get_query = await lessonsM.aggregate([
                {
                    $sort: { lesson_number: 1 }
                },
                {
                    $match: { course_row_id: course_row_id }
                },
                {
                    $lookup:
                    {
                        from: "cln_academy_quiz_lession_started_details",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id", //coinpedia article row id
                        pipeline: [{ $match: { user_row_id: user_row_id } }],
                        as: "lessonInfo"
                    }
                },
                {
                    $unwind: { path: "$lessonInfo", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_academy_quiz_answers",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id", //coinpedia article row id
                        pipeline: [{ $match: { user_row_id: user_row_id, answer_status: true } }],
                        as: "lessonAns"
                    }
                },
                {
                    $project: {
                        _id: 1,
                        lesson_number: 1,
                        lesson_id: 1,
                        title: 1,
                        author_name: 1,
                        updated_on: 1,
                        description: 1,
                        lesson_image_url: 1,
                        lesson_completed_status: { $cond: { if: "$lessonInfo.lesson_status", then: "$lessonInfo.lesson_status", else: 0 } },
                        total_correct_answers: { $size: "$lessonAns" },
                        lesson_url: 1
                    }
                }
            ])

            res.json({
                status: true,
                message: {
                    lesson_completed: lesson_completed,
                    total_score: total_score,
                    lesson_list: get_query
                }
            })
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
    catch (err) {
        console.log('Courses list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save_like_details', [
    check('lesson_id')
        .trim().not().isEmpty().withMessage('The Lesson Row ID field is required.'),
    check('like_status')
        .trim().not().isEmpty().withMessage('The Like Status field is required.')
], async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
        try {
            const user_row_id = checkToken.message

            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)
            if (Number.parseInt(req.body.like_status) === 2) {
                if (!req.body.dislike_title) {
                    errObj['dislike_title'] = 'The Dislike Title field is required.'
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const checkQuery = await lessonsM.findOne({ _id: Number.parseInt(req.body.lesson_id) }, { _id: 1 })
                if (!checkQuery) {
                    res.json({ status: false, message: { alert_message: "Invalid lesson id" } })
                }
                let lesson_row_id = req.body.lesson_id

                if (lesson_row_id && user_row_id) {
                    const checkLinkQuery = await lesson_likeM.findOne({ lesson_row_id: lesson_row_id, user_row_id: user_row_id })
                    if (!checkLinkQuery) {
                        let insertArr = {}
                        insertArr['user_row_id'] = user_row_id
                        insertArr['lesson_row_id'] = lesson_row_id
                        insertArr['like_status'] = Number.parseInt(req.body.like_status)
                        insertArr['dislike_title'] = req.body.dislike_title
                        insertArr['dislike_comments'] = req.body.dislike_comments
                        insertArr['date_n_time'] = getPresentDateTime()

                        const queryRun = new lesson_likeM(insertArr)
                        await queryRun.save()

                        res.json({ status: true, message: { alert_message: "We appreciate your review." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry, Already submitted like or dislike details." } })
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

router.post('/save_user_reader', [
    check('lesson_id')
        .trim().not().isEmpty().withMessage('The Lesson Row ID field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj })
        }
        const extract_user_ip_address =
            req.headers['x-forwarded-for']?.split(',')[0].trim() ||
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.ip ||
            "IP_NOT_FOUND"


        const user_ip_address = sanitize(extract_user_ip_address)
        const lesson_row_id = Number.parseInt(req.body.lesson_id)

        const checkQuery = await lessonsM.findOne({ _id: lesson_row_id }, { _id: 1 })
        if (!checkQuery) {
            return res.json({ status: false, message: { alert_message: "Invalid lesson ID." } })
        }

        if (lesson_row_id && user_ip_address) {
            const checkLinkQuery = await lesson_total_readerM.findOne({ lesson_row_id, user_ip_address })
            if (!checkLinkQuery) {
                const insertArr = {
                    user_ip_address: user_ip_address,
                    lesson_row_id,
                    date_n_time: getPresentDateTime()
                }

                const queryRun = await lesson_total_readerM(insertArr)
                await queryRun.save()

                return res.json({ status: true, message: { alert_message: "Lesson read recorded successfully." } })
            } else {
                return res.json({ status: false, message: { alert_message: "This lesson has already been marked as read" } })
            }
        } else {
            return res.json({ status: false, message: { alert_message: "Missing or invalid inputs. Please provide lesson ID." } })
        }
    } catch (err) {
        console.log('Save lesson read error:', err.message)
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/chapters_list_old/:course_row_id', async (req, res) => {
    try {
        const course_row_id = Number.parseInt(req.params.course_row_id)
        if (!Number.isNaN(course_row_id)) {
            let user_row_id = ""
            let total_score = 0
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message
                await courseWelcomeEmail(user_row_id)

            }
            const total_lessons = await old_lessonsM.countDocuments({ course_row_id: course_row_id })


            const get_query = await old_chaptersM.aggregate([
                {
                    $sort: { chapter_number: 1 }
                },
                {
                    $match: { course_row_id: course_row_id }
                },
                {
                    $lookup:
                    {
                        from: "cln_academy_courses_lessons_olds",
                        localField: "_id",
                        foreignField: "chapter_row_id",
                        as: "lessons",
                        pipeline: [
                            {
                                $sort: { lesson_number: 1 }
                            },
                            // {
                            //     $lookup:
                            //     {
                            //         from: "cln_academy_quiz_lession_started_details",
                            //         localField: "lesson_id",
                            //         foreignField: "lesson_row_id", //coinpedia article row id
                            //         pipeline: [{ $match: { user_row_id: user_row_id } }],
                            //         as: "lessonInfo"
                            //     }
                            // },
                            // {
                            //     $unwind: { path: "$lessonInfo", preserveNullAndEmptyArrays: true }
                            // },
                            // {
                            //     $lookup: {
                            //         from: "cln_academy_quiz_questions",
                            //         localField: "lesson_id",
                            //         foreignField: "lesson_row_id",
                            //         as: "lessonQues"
                            //     }
                            // },
                            // {
                            //     $lookup:
                            //     {
                            //         from: "cln_academy_quiz_answers",
                            //         localField: "lesson_id",
                            //         foreignField: "lesson_row_id", //coinpedia article row id
                            //         pipeline: [{ $match: { user_row_id: user_row_id, answer_status: true } }],
                            //         as: "lessonAns"
                            //     }
                            // },
                            {
                                $project:
                                {
                                    _id: 1,
                                    lesson_number: 1,
                                    lesson_id: 1,
                                    title: 1,
                                    author_name: 1,
                                    updated_on: 1,
                                    lesson_image_url: 1,
                                    lesson_url: 1,
                                    // lesson_completed_status: { $cond: { if: "$lessonInfo.lesson_status", then: "$lessonInfo.lesson_status", else: 0 } },
                                    // total_correct_answers: { $size: "$lessonAns" },
                                    // total_question_count: { $size: "$lessonQues" },
                                }
                            },
                        ]
                    }
                },
                {
                    $project: {
                        _id: 1,
                        chapter_number: 1,
                        title: 1,
                        description: 1,
                        // total_completed_lessons: { $size: "$completed_lessons" },
                        lessons: "$lessons"
                    }
                }
            ])


            res.json({
                status: true,
                message: {
                    // lesson_completed: lesson_completed,
                    // total_score: total_score,
                    total_lessons: total_lessons,
                    lesson_list: get_query
                }
            })
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
    catch (err) {
        console.log('Chapters list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



module.exports = router