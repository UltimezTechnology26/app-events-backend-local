

const express = require('express')
const router = express.Router()
const lessonsM = require('../../../models/main/academy/lessonsM')
const lessons_bookmarksM = require('../../../models/main/academy/lessons_bookmarksM')

const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { getScoreRanges } = require('../../../utils/helpers/academy_helper')


// lessons list
// recommend list
// lesson individual details

router.get('/overview', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message

            const beginner_lesson_query = lessons_bookmarksM.aggregate([
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
                                $limit: 1
                            },
                            {
                                $match: {
                                    course_row_id: 1
                                }
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
            ])

            const trader_lesson_query = lessons_bookmarksM.aggregate([
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
                                $limit: 1
                            },
                            {
                                $match: {
                                    course_row_id: 2
                                }
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
            ])

            const developer_lesson_query = lessons_bookmarksM.aggregate([
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
                                $limit: 1
                            },
                            {
                                $match: {
                                    course_row_id: 3
                                }
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
            ])

            const [total_beginner_lesson, total_trader_lesson, total_developer_lesson] = await Promise.all([beginner_lesson_query, trader_lesson_query, developer_lesson_query])

            res.json({
                status: true,
                message: {
                    total_beginner_lesson: total_beginner_lesson[0] ? total_beginner_lesson[0].count : 0,
                    total_trader_lesson: total_trader_lesson[0] ? total_trader_lesson[0].count : 0,
                    total_developer_lesson: total_developer_lesson[0] ? total_developer_lesson[0].count : 0
                }
            })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: err.message })
    }
})

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
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

            if (req.query.course_row_id) {
                if (Number.isFinite(Number.parseInt(req.query.course_row_id))) {
                    search_array.push({ course_row_id: Number.parseInt(req.query.course_row_id) })
                }
            }

            if (req.query.quiz_type) {
                const quiz_type = Number.parseInt(req.query.quiz_type)
                if (quiz_type > 0 && quiz_type <= 4) {
                    const quiz_type_object = getScoreRanges(quiz_type)
                    search_array.push(quiz_type_object)
                }
            }

            const search_query = { $and: search_array }

            const get_query = lessons_bookmarksM.aggregate([
                { $match: { user_row_id: user_row_id } },
                {
                    $lookup: {
                        from: 'cln_academy_courses_lessons',
                        localField: 'lesson_id',
                        foreignField: 'lesson_id',
                        as: 'lessons'
                    }
                },
                { $unwind: { path: "$lessons" } },
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
                        },
                        lesson_id: '$lessons.lesson_id',
                        title: '$lessons.title',
                        author_name: '$lessons.author_name',
                        lesson_url: '$lessons.lesson_url',
                        course_row_id: '$lessons.course_row_id',
                        recommended_status: '$lessons.recommended_status',
                        lesson_number: '$lessons.lesson_number',
                        updated_on: '$lessons.updated_on',
                        lesson_image_url: '$lessons.lesson_image_url'
                    }
                },
                { $match: search_query },
                {
                    $lookup: {
                        from: "cln_academy_quiz_questions",
                        localField: "lesson_id",
                        foreignField: "lesson_row_id",
                        as: "lessonQues",
                        pipeline: [
                            {
                                $group: {
                                    _id: '',
                                    total_question: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        _id: 1,
                        lesson_id: 1,
                        title: 1,
                        lesson_url: 1,
                        author_name: 1,
                        course_row_id: 1,
                        recommended_status: 1,
                        lesson_number: 1,
                        updated_on: 1,
                        lesson_image_url: 1,
                        total_correct_answers: 1,
                        total_question_count: { $ifNull: [{ $arrayElemAt: ['$lessonQues.total_question', 0] }, 0] },
                        bookmark_status: {
                            $cond: { if: "$bookmark_info._id", then: 1, else: 0 }
                        },
                        // answer_number: "$answer_number_array",
                        // close_status: "$close_status_array",
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

            const count_query = lessons_bookmarksM.aggregate([
                { $match: { user_row_id: user_row_id } },
                {
                    $lookup: {
                        from: 'cln_academy_courses_lessons',
                        localField: 'lesson_id',
                        foreignField: 'lesson_id',
                        as: 'lessons'
                    }
                },
                { $unwind: { path: "$lessons" } },
                {
                    $addFields: {
                        lesson_id: '$lessons.lesson_id',
                        title: '$lessons.title',
                        author_name: '$lessons.author_name',
                        lesson_url: '$lessons.lesson_url',
                        course_row_id: '$lessons.course_row_id',
                        recommended_status: '$lessons.recommended_status',
                        lesson_number: '$lessons.lesson_number',
                        updated_on: '$lessons.updated_on',
                        lesson_image_url: '$lessons.lesson_image_url'
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

            res.json({ status: true, message: result1, count: total_counts })
        } else {
            res.json(checkToken)
        }
    } catch (err) {
        console.log('Lessons bookmarks list error:', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/add_to_bookmark/:lesson_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const lesson_id = Number.parseInt(req.params.lesson_id)
            if (!Number.isNaN(lesson_id)) {
                const check_query = await lessonsM.findOne({ lesson_id: lesson_id, lesson_status: 1 })
                if (check_query) {
                    const check_bookmark_query = await lessons_bookmarksM.findOne({ lesson_id: lesson_id, user_row_id: user_row_id })
                    if (!check_bookmark_query) {
                        await lessons_bookmarksM({
                            lesson_id: lesson_id,
                            user_row_id: user_row_id,
                            date_n_time: getPresentDateTime()
                        }).save()

                        res.json({ status: true, message: { alert_message: 'This lesson is added to your bookmark successfully!' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, This lesson is already added to your bookmark.' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid lesson row id.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid lesson row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('lesson add to bookmark.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/remove_from_bookmark/:lesson_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const lesson_id = Number.parseInt(req.params.lesson_id)
            if (!Number.isNaN(lesson_id)) {
                const checkToken = await lessons_bookmarksM.findOne({ lesson_id: lesson_id, user_row_id: user_row_id })
                if (checkToken) {
                    await lessons_bookmarksM.deleteOne({ lesson_id: lesson_id, user_row_id: user_row_id })


                    res.json({ status: true, message: { alert_message: 'This lesson is removed from your bookmark successfully!' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'This lesson is not in your bookmark.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid lesson row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Remove from bookmark.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router