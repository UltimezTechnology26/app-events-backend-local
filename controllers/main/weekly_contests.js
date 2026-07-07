const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, requestIPAddress, getPresentDateOnly, createEndDateOnly, createDateOnly } = require('../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../middleware/authorization')
const { sendAcademyEmail } = require('../../config/email')
const contest_question_limit = 10

const weekly_contestsM = require('../../models/main/contest/weekly_contestsM')
const weekly_contests_questionsM = require('../../models/main/contest/weekly_contests_questionsM')
const started_detailsM = require('../../models/main/contest/started_detailsM')
const onboard_startedM = require('../../models/main/onboarding/started_detailsM')
const users_answersM = require('../../models/main/contest/users_answersM')
const winnersM = require('../../models/main/contest/winnersM')
const streaks_lostM = require('../../models/main/academy/streaks_lostM')
const coursesM = require('../../models/main/academy/coursesM')
const chaptersM = require('../../models/main/academy/chaptersM')
const lessonsM = require('../../models/main/academy/lessonsM')
const quiz_questionsM = require('../../models/main/academy/quiz_questionsM')
const quiz_lesson_started_detailsM = require('../../models/main/academy/quiz_lesson_started_detailsM')
const users_quiz_answersM = require('../../models/main/academy/users_quiz_answersM')



router.get('/pending/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = 0
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            user_row_id = checkToken.message
        }
        const present_time = getPresentDateOnly()
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const search_array = [{ start_date: { $lte: new Date(present_time) }, end_date: { $gte: new Date(present_time) } }]
        if (req.query.search) {
            search_array.push({
                $or: [
                    { title: { '$regex': req.query.search, $options: 'i' } }
                ]
            })
        }

        if (req.query.date) {
            const date = createDateOnly(req.query.date)
            search_array.push({ start_date: { $lte: new Date(date) }, end_date: { $gte: new Date(date) } })
        }

        const get_query = weekly_contestsM.aggregate([
            {
                $match: { $and: search_array }
            },
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_started_details",
                    localField: "_id",
                    foreignField: "contest_row_id",
                    as: "user_started",
                    pipeline: [
                        {
                            $match: { user_row_id: user_row_id }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                    contest_status: { $cond: { if: "$user_started.contest_status", then: "$user_started.contest_status", else: 0 } },
                    total_questions: { $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0] },
                }
            },
            {
                $match: {
                    total_questions: { $gte: 10 }
                }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    contest_image: 1,
                    start_date: 1,
                    end_date: 1,
                    description: 1,
                    contest_status: 1,
                    total_questions: 1,
                    date_n_time: 1
                }
            }
        ]).skip(skip).limit(limit)


        const count_query = weekly_contestsM.aggregate([
            {
                $match: { $and: search_array }
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
                    total_questions: { $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0] },
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


        const [message, result2] = await Promise.all([get_query, count_query])

        let count = 0
        if (result2[0]) {
            count = result2[0].count
        }


        res.json({ status: true, message, count })

    }
    catch (err) {
        console.log('Contest list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/upcoming/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = 0
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            user_row_id = checkToken.message
        }
        const present_time = getPresentDateOnly()
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const search_array = [{ start_date: { $gt: new Date(present_time) } }]
        if (req.query.search) {
            search_array.push({
                $or: [
                    { title: { '$regex': req.query.search, $options: 'i' } }
                ]
            })
        }

        if (req.query.date) {
            const date = createDateOnly(req.query.date)
            search_array.push({ start_date: { $lte: new Date(date) }, end_date: { $gte: new Date(date) } })
        }

        const get_query = weekly_contestsM.aggregate([
            {
                $match: { $and: search_array }
            },
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_started_details",
                    localField: "_id",
                    foreignField: "contest_row_id",
                    as: "user_started",
                    pipeline: [
                        {
                            $match: { user_row_id: user_row_id }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                    contest_status: { $cond: { if: "$user_started.contest_status", then: "$user_started.contest_status", else: 0 } },
                    total_questions: { $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0] },
                }
            },
            {
                $match: {
                    total_questions: { $gte: 10 }
                }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    contest_image: 1,
                    start_date: 1,
                    end_date: 1,
                    description: 1,
                    contest_status: 1,
                    total_questions: 1,
                    date_n_time: 1
                }
            }
        ]).skip(skip).limit(limit)


        const count_query = weekly_contestsM.aggregate([
            {
                $match: { $and: search_array }
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
                    total_questions: { $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0] },
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


        const [message, result2] = await Promise.all([get_query, count_query])

        let count = 0
        if (result2[0]) {
            count = result2[0].count
        }

        res.json({ status: true, message, count })

    }
    catch (err) {
        console.log('Contest list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/past/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const search_array = [{}]
        if (req.query.search) {
            search_array.push({
                $or: [
                    { title: { '$regex': req.query.search, $options: 'i' } }
                ]
            })
        }

        if (req.query.date) {
            const date = createDateOnly(req.query.date)
            search_array.push({ start_date: { $lte: new Date(date) }, end_date: { $gte: new Date(date) } })
        }

        const get_query = weekly_contestsM.aggregate([
            {
                $sort: { end_date: -1 }
            },
            {
                $match: { $and: search_array }
            },
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_winners",
                    localField: "_id",
                    foreignField: "contest_row_id",
                    as: "winner_users",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_main_weekly_contests_started_details",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_started"
                            }
                        },
                        {
                            $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                                        $lookup:
                                        {
                                            from: "cln_professionals_profile_images",
                                            localField: "_id",
                                            foreignField: "user_row_id",
                                            as: "img_info"
                                        }
                                    },
                                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            user_name: 1,
                                            email_id: 1,
                                            wallet_address: 1,
                                            approval_status: 1,
                                            profile_image: "$img_info.profile_image",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                        },
                        {
                            $sort: { winning_position: 1 }
                        },
                        {
                            $project: {
                                winning_position: 1,
                                deposited_address: 1,
                                reward_value: 1,
                                date_n_time: 1,
                                trans_hash: 1,
                                contest_score: "$user_started.contest_score",
                                time_duration: "$user_started.time_duration",
                                full_name: "$user_info.full_name",
                                user_name: "$user_info.user_name",
                                // email_id:"$user_info.email_id",
                                profile_image: "$user_info.profile_image",
                                user_approval_status: "$user_info.approval_status"
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    total_winners: { $size: "$winner_users" }
                }
            },
            // {
            //     $match:{total_winners:{$gte:3}}
            // },
            { $match: { total_winners: { $gte: 1 } } },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    contest_image: 1,
                    start_date: 1,
                    end_date: 1,
                    description: 1,
                    total_winners: 1,
                    winner_users: "$winner_users",
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = weekly_contestsM.aggregate([
            {
                $match: { $and: search_array }
            },
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_winners",
                    localField: "_id",
                    foreignField: "contest_row_id",
                    as: "winner_users",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_main_weekly_contests_started_details",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_started"
                            }
                        },
                        {
                            $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                                        $lookup:
                                        {
                                            from: "cln_professionals_profile_images",
                                            localField: "_id",
                                            foreignField: "user_row_id",
                                            as: "img_info"
                                        }
                                    },
                                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            user_name: 1,
                                            email_id: 1,
                                            wallet_address: 1,
                                            approval_status: 1,
                                            profile_image: "$img_info.profile_image",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                        },
                        {
                            $sort: { winning_position: 1 }
                        },
                        {
                            $project: {
                                winning_position: 1,
                                deposited_address: 1,
                                reward_value: 1,
                                date_n_time: 1,
                                trans_hash: 1,
                                contest_score: "$user_started.contest_score",
                                time_duration: "$user_started.time_duration",
                                full_name: "$user_info.full_name",
                                user_name: "$user_info.user_name",
                                // email_id:"$user_info.email_id",
                                profile_image: "$user_info.profile_image",
                                user_approval_status: "$user_info.approval_status"
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    total_winners: { $size: "$winner_users" }
                }
            },
            // {
            //     $match:{total_winners:{$gte:3}}
            // },
            { $match: { total_winners: { $gte: 1 } } },
            {
                $count: 'count'
            }
        ])


        const [message, result2] = await Promise.all([get_query, count_query])

        let count = 0
        if (result2[0]) {
            count = result2[0].count
        }


        res.json({ status: true, message, count })

    }
    catch (err) {
        console.log('Contest list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/thedata', async (req, res) => {
    const ans = await weekly_contestsM.find({})
    res.json({ status: true, message: ans })
})
router.get('/overview', async (req, res) => {
    try {
        let my_contests_query = ''
        let winner_contests_query = ''
        let user_row_id = 0
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            user_row_id = checkToken.message
            my_contests_query = started_detailsM.aggregate([
                {
                    $match: { user_row_id: user_row_id }
                },
                {
                    $lookup: {
                        from: 'cln_main_weekly_contests_questions',
                        localField: 'contest_row_id',
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
                    $lookup: {
                        from: 'cln_main_weekly_contests',
                        localField: 'contest_row_id',
                        foreignField: '_id',
                        as: 'contest_details'
                    }
                },
                {
                    $match: {
                        contest_details: { $ne: [] }
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


            winner_contests_query = winnersM.aggregate([
                {
                    $match: {
                        user_row_id: user_row_id
                    }
                },
                {
                    $lookup: {
                        from: 'cln_main_weekly_contests_questions',
                        localField: 'contest_row_id',
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
                        total_questions: {
                            $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0]
                        }
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

        }

        const total_contests_query = weekly_contestsM.aggregate([
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
                    total_questions: { $ifNull: [{ $arrayElemAt: ['$questions.count', 0] }, 0] },
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


        const queries = [
            my_contests_query,
            winner_contests_query,
            total_contests_query
        ].filter(query => query && typeof query.then === 'function'); // Filter only Promises

        const results = await Promise.all(queries);

        // Extract results safely, providing default empty arrays
        const my_contests = results[queries.indexOf(my_contests_query)] || [];
        const my_winned_contests = results[queries.indexOf(winner_contests_query)] || [];
        const total_contests = results[queries.indexOf(total_contests_query)] || [];



        const result = {}
        result['my_contests'] = my_contests[0] ? my_contests[0].count : 0
        result['my_winned_contests'] = my_winned_contests[0] ? my_winned_contests[0].count : 0
        result['total_contests'] = total_contests[0] ? total_contests[0].count : 0


        res.json({ status: true, message: result })

    }
    catch (err) {
        console.log('Contest list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/start_contest/:contest_row_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_ip_address = await requestIPAddress(req)
            if (user_ip_address) {
                const present_time = getPresentDateOnly()
                const user_row_id = checkToken.message
                const contest_row_id = Number.parseInt(req.params.contest_row_id)

                if (!Number.isNaN(contest_row_id)) {
                    const get_query = await weekly_contestsM.findOne({ _id: contest_row_id, start_date: { $lte: new Date(present_time) }, end_date: { $gte: new Date(present_time) } })
                    if (get_query) {
                        const check_ip_addr_query = await started_detailsM.findOne({ contest_row_id: contest_row_id, ip_address: user_ip_address, contest_status: 1 })
                        if (!check_ip_addr_query) {
                            const check_participated_query = await started_detailsM.findOne({ user_row_id: user_row_id, contest_row_id: contest_row_id, contest_status: 1 })
                            if (!check_participated_query) {
                                await started_detailsM.deleteMany({ user_row_id: user_row_id, contest_row_id: contest_row_id })
                                await users_answersM.deleteMany({ contest_row_id: contest_row_id, user_row_id: user_row_id })

                                const insert_array = {
                                    user_row_id: user_row_id,
                                    contest_row_id: contest_row_id,
                                    contest_status: 0,
                                    ip_address: user_ip_address,
                                    date_n_time: getPresentDateTime()
                                }
                                // const get_weekly_contest_details = await weekly_contestsM({_id:contest_row_id, start_date:{ $lte: new Date(present_time)}, end_date: { $gte: new Date(present_time)}})
                                const insert_query = await started_detailsM(insert_array).save()
                                const contest_started_row_id = insert_query._id


                                res.json({
                                    status: true,
                                    message: {
                                        started_row_id: contest_started_row_id,
                                        alert_message: "This contest started successfully."
                                    }
                                })
                            }
                            else {
                                res.json({
                                    status: false,
                                    message: {
                                        alert_message: "Sorry, Invalid Contest Row ID."
                                    }
                                })

                            }
                        }
                        else {
                            res.json({
                                status: false,
                                user_ip_address,
                                contest_title: get_query.title,
                                date_n_time: get_query.date_n_time,
                                message: {
                                    alert_message: "We are currently experiencing high levels of traffic. Please consider trying again at a later time."
                                }
                            })
                        }
                    }
                    else {
                        res.json({
                            status: false,
                            message: {
                                alert_message: "Sorry, Invalid Contest Row ID."
                            }
                        })
                    }
                }
                else {
                    res.json({
                        status: false,
                        message: {
                            alert_message: "Sorry, Invalid Contest Row ID."
                        }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: {
                        alert_message: "Your submission for the weekly contest has already been recorded."
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

    }
    catch (err) {
        console.log('Start contest.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/question_details/:contest_started_row_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const contest_started_row_id = Number.parseInt(req.params.contest_started_row_id)
            if (!Number.isNaN(contest_started_row_id)) {
                const check_start_query = await started_detailsM.findOne({ _id: contest_started_row_id, user_row_id: user_row_id })
                if (check_start_query) {
                    const contest_row_id = check_start_query.contest_row_id
                    const check_answers_count_query = await users_answersM.countDocuments({ contest_row_id: contest_row_id, user_row_id: user_row_id })
                    if (check_answers_count_query < contest_question_limit) {
                        const get_query = await weekly_contests_questionsM.aggregate([
                            { $match: { contest_row_id: contest_row_id } },
                            {
                                $lookup: {
                                    from: "cln_main_weekly_contests_answers",
                                    localField: "_id",
                                    foreignField: "question_row_id",
                                    pipeline: [{ $match: { user_row_id: user_row_id } }],
                                    as: "matched_docs"
                                }
                            },
                            {
                                $match: {
                                    "matched_docs.question_row_id": {
                                        $exists: false
                                    }
                                }
                            },
                            { $sample: { size: 1 } }
                        ])

                        if (get_query[0]) {
                            await users_answersM.updateOne({ user_row_id: user_row_id, contest_row_id: contest_row_id, contest_started_row_id: contest_started_row_id },
                                {
                                    $set: { close_status: true, answer_number: 0 }
                                })

                            const quiz_insert_array = {
                                user_row_id: user_row_id,
                                contest_started_row_id: contest_started_row_id,
                                contest_row_id: contest_row_id,
                                question_row_id: get_query[0]._id,
                                date_n_time: getPresentDateTime()
                            }


                            const quiz_insert_query = await users_answersM(quiz_insert_array).save()
                            let question_number = check_answers_count_query + 1

                            res.json({
                                status: true,
                                message: {
                                    total_questions: contest_question_limit,
                                    question_number: question_number,
                                    question_title: get_query[0].question_title,
                                    option_a: get_query[0].option_a,
                                    option_b: get_query[0].option_b,
                                    option_c: get_query[0].option_c,
                                    option_d: get_query[0].option_d,
                                    update_row_id: quiz_insert_query._id
                                }
                            })
                        }
                        else {
                            res.json({
                                status: false,
                                message: {
                                    alert_message: "Sorry, We did not any question for you."
                                }
                            })
                        }
                    }
                    else {
                        res.json({
                            status: false,
                            message: {
                                alert_message: "Sorry, This Contest quiz details has been completed successfully."
                            }
                        })
                    }
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, please start Contest then try to get the question." }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: {
                        alert_message: "Sorry, Invalid Contest Started Row ID."
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

    }
    catch (err) {
        console.log('Question details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/question_expired/:contest_started_row_id/:update_row_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const contest_started_row_id = Number.parseInt(req.params.contest_started_row_id)
            const update_row_id = Number.parseInt(req.params.update_row_id)
            const check_query = users_answersM.findOne({ user_row_id: user_row_id, _id: update_row_id, contest_started_row_id: contest_started_row_id })
            if (check_query) {
                await users_answersM.updateOne({ user_row_id: user_row_id, _id: update_row_id, contest_started_row_id: contest_started_row_id },
                    {
                        $set: { close_status: true, answer_number: 0 }
                    })


                res.json({
                    status: true,
                    message: {
                        alert_message: "This question expired details has been updated successfully."
                    }
                })

            }
            else {
                res.json({
                    status: false,
                    message: {
                        alert_message: "Sorry, Invalid Question Row ID."
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

    }
    catch (err) {
        console.log('Question expired.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/save_answer_details', [
    check('contest_started_row_id')
        .trim().not().isEmpty().withMessage('The Contest Started Row ID field is required.')
        .isInt().withMessage('The Contest Started Row ID field must be contain only numbers.'),
    check('update_row_id')
        .trim().not().isEmpty().withMessage('The Update Row ID field is required.')
        .isInt().withMessage('The Updated Row ID field must be contain only numbers.'),
    check('time_duration')
        .trim().not().isEmpty().withMessage('The Time Duration field is required.')
    // check('answer_number')
    // .trim().not().isEmpty().withMessage('The Answer field is required.')
    // .isInt({ min: 1, max:4 }).withMessage('The Answer field must be contain only 1, 2, 3 or 4.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            let contest_started_row_id = ""
            let update_row_id = ""
            let answer_number = ""
            if (req.body.contest_started_row_id) {
                contest_started_row_id = Number.parseInt(req.body.contest_started_row_id)
                if (Number.isNaN(contest_started_row_id)) {
                    errObj['contest_started_row_id'] = 'Sorry, Invalid Contest Started Row ID.'
                }
            }
            if (req.body.update_row_id) {
                update_row_id = Number.parseInt(req.body.update_row_id)
                if (Number.isNaN(update_row_id)) {
                    errObj['update_row_id'] = 'Sorry, Invalid Updated Row ID.'
                }
            }

            if (req.body.answer_number) {
                answer_number = Number.parseInt(req.body.answer_number)
                if (Number.isNaN(answer_number)) {
                    errObj['answer_number'] = 'Sorry, Invalid Updated Row ID.'
                }
            }

            const where_query = { _id: update_row_id, contest_started_row_id: contest_started_row_id, user_row_id: user_row_id }
            const check_quiz_query = await users_answersM.findOne(where_query)
            if (!check_quiz_query) {
                errObj['alert_message'] = 'Sorry, Invalid Question Row ID.'
            }

            if (!Object.keys(errObj).length) {
                const question_row_id = check_quiz_query.question_row_id

                const question_query = await weekly_contests_questionsM.findOne({ _id: question_row_id })
                if (question_query.correct_answer) {
                    const question_correct_answer = question_query.correct_answer
                    let answer_status = false
                    if (Number.parseInt(question_correct_answer) === Number.parseInt(answer_number)) {
                        answer_status = true
                    }

                    await users_answersM.updateOne(where_query,
                        {
                            $set: {
                                answer_number: answer_number,
                                close_status: true,
                                answer_status: answer_status,
                                time_duration: req.body.time_duration
                            }
                        })


                    let quiz_completed_status = false
                    let quiz_score_points = 0
                    let total_time_duration = 0
                    const check_answers_count_query = await users_answersM.countDocuments({ contest_started_row_id: contest_started_row_id, user_row_id: user_row_id })
                    if (check_answers_count_query >= contest_question_limit) {
                        quiz_completed_status = true

                        quiz_score_points = await users_answersM.countDocuments({ contest_started_row_id: contest_started_row_id, answer_status: true, user_row_id: user_row_id })

                        const get_result_query = await users_answersM.aggregate([
                            {
                                $match: {
                                    contest_started_row_id: contest_started_row_id, user_row_id: user_row_id
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    total: {
                                        $sum: "$time_duration"
                                    }
                                }
                            }
                        ])


                        if (get_result_query[0]) {
                            if (get_result_query[0].total !== undefined) {
                                total_time_duration = get_result_query[0].total
                            }
                        }

                        await started_detailsM.updateOne({ _id: contest_started_row_id }, { $set: { contest_status: 1, time_duration: total_time_duration, contest_score: quiz_score_points } })

                        await sendContestCompleteEmail({ contest_started_row_id, correct_answers: quiz_score_points, time_duration: total_time_duration })


                    }

                    res.json({
                        status: true,
                        message: {
                            quiz_completed_status: quiz_completed_status,
                            quiz_score_points: quiz_score_points,
                            total_time_duration: total_time_duration,

                            alert_message: "Your answer details has been updated successfully."
                        }
                    })
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Invalid Question your answered." }
                    })
                }
            }
            else {
                res.json({ status: false, message: errObj })
            }
        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Save and answer details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

const sendContestCompleteEmail = async ({ contest_started_row_id, correct_answers, time_duration }) => {

    const emailData = await started_detailsM.aggregate([
        {
            $match: { _id: contest_started_row_id }
        },
        {
            $lookup:
            {
                from: "cln_main_weekly_contests",
                localField: "contest_row_id",
                foreignField: "_id",
                as: "contest_info"
            }
        },
        {
            $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
        },
        {
            $lookup:
            {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "user_info"
            }
        },
        {
            $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
        },
        {
            $project: {
                _id: 1,
                contest_row_id: 1,
                full_name: "$user_info.full_name",
                user_name: "$user_info.user_name",
                email_id: "$user_info.email_id",
                contest_title: "$contest_info.title",
                start_date: "$contest_info.start_date",
                end_date: "$contest_info.end_date"
            }
        }
    ])

    if (emailData[0]) {
        const full_name = emailData[0].full_name
        const email_id = emailData[0].email_id
        //const profile_image = user_image_query ? user_image_query.profile_image:"default.png"
        const contest_title = emailData[0].contest_title

        let header_profile_section = `Your weekly contest has been completed.`
        let pass_subject = `Your weekly ${contest_title} contest has been successfully completed.`

        const pass_message = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
               <h3 style="text-transform: capitalize;">Hello ${full_name},</h3>
               <p>Thank you for participating in the Coinpedia weekly contests.</p>
               <p>Results for the weekly <b>${contest_title}</b> contest are as follows:</p>
               <p><b>Score : ${correct_answers} / ${contest_question_limit}</b></p>
               <p><b>Time Taken : ${time_duration} seconds</b> </p>
               <p>Please note that winners are selected based on the highest score achieved in the shortest amount of time.</p>
               <p>Stay tuned, as we will announce the winners via email shortly.</p>
               <br/>
               <br/>
               <p style='margin-bottom: 0;padding-bottom: 5px;'>Best regards,</p>
               <p style='margin-top: 0;padding-top: 0;'>Team Coinpedia</p>
        </div>`

        await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)
        return emailData[0]
    }
    else {
        return false
    }
}


router.get('/winners_list_old/:skip/:limit', async (req, res) => {
    try {
        const skip = Number.parseInt(req.params.skip)
        const limit = Number.parseInt(req.params.limit)

        const get_query = await winnersM.aggregate([
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_started_details",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_started"
                }
            },
            {
                $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                            $lookup:
                            {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                email_id: 1,
                                wallet_address: 1,
                                profile_image: "$img_info.profile_image",
                            }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests",
                    localField: "contest_row_id",
                    foreignField: "_id",
                    as: "contest_info"
                }
            },
            {
                $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
            },
            {
                $sort: { winning_position: 1, _id: -1 }
            },
            {
                $project: {
                    _id: 1,
                    winning_position: 1,
                    deposited_address: 1,
                    reward_value: 1,
                    date_n_time: 1,
                    trans_hash: 1,
                    contest_score: "$user_started.contest_score",
                    time_duration: "$user_started.time_duration",
                    full_name: "$user_info.full_name",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    profile_image: "$user_info.profile_image",
                    title: "$contest_info.title",
                    contest_image: "$contest_info.contest_image",
                    start_date: "$contest_info.start_date",
                    end_date: "$contest_info.end_date",
                    description: "$contest_info.description"
                }
            }
        ]).skip(skip).limit(limit)

        res.json({ status: true, message: get_query })

    }
    catch (err) {
        console.log('Winners list old.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/winners_list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        let match_query = { total_winners: { $gt: 0 } }
        const get_query = await weekly_contestsM.aggregate([
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_winners",
                    localField: "_id",
                    foreignField: "contest_row_id",
                    as: "winner_users",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_main_weekly_contests_started_details",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_started"
                            }
                        },
                        {
                            $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                                        $lookup:
                                        {
                                            from: "cln_professionals_profile_images",
                                            localField: "_id",
                                            foreignField: "user_row_id",
                                            as: "img_info"
                                        }
                                    },
                                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            user_name: 1,
                                            email_id: 1,
                                            wallet_address: 1,
                                            approval_status: 1,
                                            profile_image: "$img_info.profile_image",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                        },
                        {
                            $sort: { winning_position: 1 }
                        },
                        {
                            $project: {
                                winning_position: 1,
                                deposited_address: 1,
                                reward_value: 1,
                                date_n_time: 1,
                                trans_hash: 1,
                                contest_score: "$user_started.contest_score",
                                time_duration: "$user_started.time_duration",
                                full_name: "$user_info.full_name",
                                user_name: "$user_info.user_name",
                                // email_id:"$user_info.email_id",
                                profile_image: "$user_info.profile_image",
                                user_approval_status: "$user_info.approval_status"
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    total_winners: { $size: "$winner_users" }
                }
            },
            {
                $match: match_query
            },
            {
                $sort: { end_date: -1 }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    contest_image: 1,
                    start_date: 1,
                    end_date: 1,
                    description: 1,
                    total_winners: 1,
                    winner_users: "$winner_users",
                }
            }
        ]).skip(skip).limit(limit)

        res.json({ status: true, message: get_query })

    }
    catch (err) {
        console.log('Winners list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/winners_individual_details/:contest_row_id', async (req, res) => {
    try {
        const contest_row_id = Number.parseInt(req.params.contest_row_id)

        const get_query = await weekly_contestsM.aggregate([
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_winners",
                    localField: "_id",
                    foreignField: "contest_row_id",
                    as: "winner_users",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_main_weekly_contests_started_details",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_started"
                            }
                        },
                        {
                            $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                                        $lookup:
                                        {
                                            from: "cln_professionals_profile_images",
                                            localField: "_id",
                                            foreignField: "user_row_id",
                                            as: "img_info"
                                        }
                                    },
                                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            user_name: 1,
                                            email_id: 1,
                                            wallet_address: 1,
                                            approval_status: 1,
                                            profile_image: "$img_info.profile_image",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                        },
                        {
                            $sort: { winning_position: 1 }
                        },
                        {
                            $project: {
                                winning_position: 1,
                                deposited_address: 1,
                                reward_value: 1,
                                date_n_time: 1,
                                trans_hash: 1,
                                contest_score: "$user_started.contest_score",
                                time_duration: "$user_started.time_duration",
                                full_name: "$user_info.full_name",
                                user_name: "$user_info.user_name",
                                // email_id:"$user_info.email_id",
                                profile_image: "$user_info.profile_image",
                                user_approval_status: "$user_info.approval_status"
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    total_winners: { $size: "$winner_users" }
                }
            },
            {
                $match: { total_winners: { $gt: 0 }, _id: contest_row_id }
            },
            {
                $sort: { end_date: -1 }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    contest_image: 1,
                    start_date: 1,
                    end_date: 1,
                    description: 1,
                    total_winners: 1,
                    winner_users: "$winner_users",
                }
            }
        ]).limit(1)

        if (get_query[0]) {
            res.json({ status: true, message: get_query[0] })
        }
        else {
            res.json({ status: false, message: { alert_message: "Sorry, Invalid Contest Row ID." } })
        }

    }
    catch (err) {
        console.log('Winners individual details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.get('/winners_individual_details_old/:winner_row_id', async (req, res) => {
    try {
        const winner_row_id = Number.parseInt(req.params.winner_row_id)

        const get_query = await winnersM.aggregate([
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests_started_details",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_started"
                }
            },
            {
                $unwind: { path: "$user_started", preserveNullAndEmptyArrays: true }
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
                            $lookup:
                            {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                email_id: 1,
                                wallet_address: 1,
                                profile_image: "$img_info.profile_image",
                            }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup:
                {
                    from: "cln_main_weekly_contests",
                    localField: "contest_row_id",
                    foreignField: "_id",
                    as: "contest_info"
                }
            },
            {
                $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
            },

            {
                $match: { _id: winner_row_id }
            },
            {
                $project: {
                    _id: 1,
                    winning_position: 1,
                    deposited_address: 1,
                    reward_value: 1,
                    date_n_time: 1,
                    trans_hash: 1,
                    contest_score: "$user_started.contest_score",
                    time_duration: "$user_started.time_duration",
                    full_name: "$user_info.full_name",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    profile_image: "$user_info.profile_image",
                    title: "$contest_info.title",
                    contest_image: "$contest_info.contest_image",
                    start_date: "$contest_info.start_date",
                    end_date: "$contest_info.end_date",
                    description: "$contest_info.description"
                }
            }
        ]).limit(1)

        if (get_query[0]) {
            res.json({ status: true, message: get_query[0] })
        }
        else {
            res.json({ status: false, message: { alert_message: "Sorry, Invalid Winner Row ID." } })
        }

    }
    catch (err) {
        console.log('Winners individual details old.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/participated_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers);
        if (checkToken.status) {
            const user_row_id = checkToken.message;
            const skip = Number.parseInt(req.params.skip);
            const limit = Number.parseInt(req.params.limit);
            const now = new Date();

            const get_query = started_detailsM.aggregate([
                {
                    $match: { user_row_id: user_row_id }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: false }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_questions",
                        let: { contestId: "$contest_row_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$contest_row_id", "$$contestId"] }
                                }
                            },
                            {
                                $count: "question_count"
                            }
                        ],
                        as: "question_meta"
                    }
                },
                {
                    $addFields: {
                        question_count: {
                            $ifNull: [{ $arrayElemAt: ["$question_meta.question_count", 0] }, 0]
                        }
                    }
                },
                {
                    $match: {
                        question_count: { $gte: 10 }
                    }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_winners",
                        let: { contestId: "$contest_row_id", userId: "$user_row_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$contest_row_id", "$$contestId"] },
                                            { $eq: ["$user_row_id", "$$userId"] }
                                        ]
                                    }
                                }
                            },
                            { $limit: 1 }
                        ],
                        as: "winner_info"
                    }
                },
                {
                    $unwind: { path: "$winner_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $addFields: {
                        active_status: {
                            $cond: [
                                {
                                    $and: [
                                        { $lte: ["$contest_info.start_date", now] },
                                        { $gte: ["$contest_info.end_date", now] }
                                    ]
                                },
                                1,
                                0
                            ]
                        },
                        completed_status: {
                            $cond: [
                                { $lt: ["$contest_info.end_date", now] },
                                1,
                                0
                            ]
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        contest_score: 1,
                        contest_status: 1,
                        time_duration: 1,
                        date_n_time: 1,
                        contest_row_id: 1,
                        winning_position: "$winner_info.winning_position",
                        reward_value: "$winner_info.reward_value",
                        winner_deposited_address: "$winner_info.deposited_address",
                        winner_reward_value: "$winner_info.reward_value",
                        winner_announced_on: "$winner_info.date_n_time",
                        winner_trans_hash: "$winner_info.trans_hash",
                        winner_status: {
                            $cond: {
                                if: { $gt: [{ $ifNull: ["$winner_info._id", null] }, null] },
                                then: 1,
                                else: 0
                            }
                        },
                        contest_title: "$contest_info.title",
                        contest_image: "$contest_info.contest_image",
                        contest_start_date: "$contest_info.start_date",
                        contest_end_date: "$contest_info.end_date",
                        contest_description: "$contest_info.description",
                        question_count: 1,
                        active_status: 1,
                        completed_status: 1
                    }
                },
                { $skip: skip },
                { $limit: limit }
            ]);

            const count_query = started_detailsM.aggregate([
                {
                    $match: { user_row_id: user_row_id }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: false }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_questions",
                        let: { contestId: "$contest_row_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$contest_row_id", "$$contestId"] }
                                }
                            },
                            {
                                $count: "question_count"
                            }
                        ],
                        as: "question_meta"
                    }
                },
                {
                    $addFields: {
                        question_count: {
                            $ifNull: [{ $arrayElemAt: ["$question_meta.question_count", 0] }, 0]
                        }
                    }
                },
                {
                    $match: {
                        question_count: { $gte: 10 }
                    }
                },
                {
                    $count: "count"
                }
            ]);

            const [message, result2] = await Promise.all([get_query, count_query]);

            let count = 0;
            if (result2[0]) {
                count = result2[0].count;
            }

            res.json({ status: true, message, count });
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            });
        }
    } catch (err) {
        console.log('Participated list.', err.message);
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});


router.get('/winners', async (req, res) => {
    const winners = await quiz_lesson_started_detailsM.find()
    res.json({ status: true, message: winners })
})


router.get('/participated_individual_details/:participated_row_id', async (req, res) => {
    try {
        const participated_row_id = Number.parseInt(req.params.participated_row_id);
        const checkToken = checkUserLoginToken(req.headers);
        if (checkToken.status) {
            const user_row_id = checkToken.message;

            const get_query = await started_detailsM.aggregate([
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_winners",
                        localField: "_id",
                        foreignField: "participated_row_id",
                        as: "winner_info"
                    }
                },
                {
                    $unwind: { path: "$winner_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $match: { _id: participated_row_id, user_row_id: user_row_id }
                },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        contest_score: 1,
                        contest_status: 1,
                        time_duration: 1,
                        date_n_time: 1,
                        contest_row_id: 1,
                        winner_position: "$winner_info.winning_position",
                        winner_deposited_address: "$winner_info.deposited_address",
                        winner_reward_value: "$winner_info.reward_value",
                        winner_announced_on: "$winner_info.date_n_time",
                        winner_trans_hash: "$winner_info.trans_hash",
                        winner_status: {
                            $cond: {
                                if: { $in: ["$winner_info.winning_position", [1, 2, 3]] },
                                then: 1,
                                else: 0
                            }
                        },
                        contest_title: "$contest_info.title",
                        contest_image: "$contest_info.contest_image",
                        contest_start_date: "$contest_info.start_date",
                        contest_end_date: "$contest_info.end_date",
                        contest_description: "$contest_info.description"
                    }
                }

            ]).limit(1);

            if (get_query[0]) {
                res.json({ status: true, message: get_query[0] });
            } else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Participated Row ID." } });
            }
        } else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            });
        }
    } catch (err) {
        console.log('Participated individual details.', err.message);
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});




module.exports = router