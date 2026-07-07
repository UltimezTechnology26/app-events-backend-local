const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
const poll_questionsM = require('../../../models/main/polling/poll_questionsM')
const poll_votingsM = require('../../../models/main/polling/poll_votingsM')
const poll_emailsM = require('../../../models/main/polling/poll_emailsM')


router.post('/create_new_question', [
    check('article_id')
        .not().isEmpty().withMessage('The article id field is required.')
        .isNumeric().withMessage('The article id field should be a number.'),
    check('article_title')
        .not().isEmpty().withMessage('The article title field is required.'),
    check('article_slug')
        .not().isEmpty().withMessage('The article slug field is required.'),
    check('question_title')
        .not().isEmpty().withMessage('The question title field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const article_id = Number.parseInt(req.body.article_id)
            if (req.body.article_id) {
                let where_query = { article_id: article_id }
                if (req.body.question_row_id) {
                    where_query = { article_id: article_id, _id: { $ne: sanitize(req.body.question_row_id) } }
                }

                const checkArticleId = await poll_questionsM.findOne(where_query)
                if (checkArticleId) {
                    errObj['article_id'] = 'Sorry, This article id  already exists.'
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let insert_array = {}
                insert_array['article_id'] = req.body.article_id
                insert_array['article_title'] = req.body.article_title
                insert_array['article_slug'] = req.body.article_slug
                insert_array['question_title'] = req.body.question_title


                if (req.body.question_row_id) {
                    const question_row_id = sanitize(req.body.question_row_id)
                    const check_query = await poll_questionsM.findOne({ _id: question_row_id })
                    if (check_query) {
                        await poll_questionsM.updateOne({ _id: question_row_id }, { $set: insert_array })

                        res.json({ status: true, message: { alert_message: "This polling question for article has been updated successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry, Invalid article question row id." } })
                    }
                }
                else {

                    insert_array['date_n_time'] = getPresentDateTime()
                    insert_array['question_status'] = 1

                    await poll_questionsM(insert_array).save()
                    res.json({ status: true, message: { alert_message: "New polling question for article has been added successfully." } })
                }

            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Created new question.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/question_details/:question_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        try {
            const question_row_id = Number.parseInt(req.params.question_row_id)
            if (Number.isNaN(question_row_id)) {
                res.json({ status: false, message: { alert_message: "Invalid question row id. It should be a number." } })

            }
            else {
                const queryRun = await poll_questionsM.findOne({ _id: question_row_id })
                if (queryRun) {
                    res.json({ status: true, message: queryRun })

                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid question row id." } })
                }
            }
        }
        catch (err) {
            console.log('Winners individual details old.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/question_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                const searchQuery = Number.parseInt(req.query.search)
                if (Number.isNaN(searchQuery)) {
                    query = {
                        $or: [
                            { article_title: { '$regex': req.query.search, $options: 'i' } },
                            { article_slug: { '$regex': req.query.search, $options: 'i' } },
                            { question_title: { '$regex': req.query.search, $options: 'i' } }
                        ]
                    }
                }
                else {
                    query = { article_id: searchQuery }
                }
            }
            if (req.query.date) {
                const inputDate = new Date(req.query.date);
                const start_date = new Date(inputDate.setHours(0, 0, 0, 0));
                const end_date = new Date(inputDate.setHours(23, 59, 59, 999));

                query.date_n_time = { $gte: start_date, $lte: end_date };
            }
            const queryRun = await poll_questionsM.aggregate([
                { $match: query },
                { $sort: { _id: -1 } },
                {
                    $lookup: {
                        from: "cln_article_polling_votes",
                        localField: "article_id",
                        foreignField: "article_id",
                        pipeline: [{ $match: { "user_vote_type": 1 } }],
                        as: "yes_vote_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_article_polling_votes",
                        localField: "article_id",
                        foreignField: "article_id",
                        pipeline: [{ $match: { "user_vote_type": 2 } }],
                        as: "no_vote_info"
                    }
                },
                {
                    $project: {
                        _id: 1,
                        article_id: 1,
                        article_title: 1,
                        article_slug: 1,
                        question_title: 1,
                        date_n_time: 1,
                        yes_votes: { $size: "$yes_vote_info" },
                        no_votes: { $size: "$no_vote_info" },
                        question_status: 1
                    }
                }
            ]).skip(skip).limit(limit)

            const countQueryRun = await poll_questionsM.countDocuments(query)

            res.json({ status: true, message: queryRun, count: countQueryRun })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Question list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/enable/:question_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [2])
    if (checkToken.status) {
        try {
            let question_row_id = Number.parseInt(req.params.question_row_id)
            if (Number.isNaN(question_row_id)) {
                res.json({ status: false, message: { alert_message: "Invalid question row id. It should be a number." } })

            }
            else {
                const queryRunCheck = await poll_questionsM.findOne({ _id: question_row_id })
                if (queryRunCheck) {
                    const checkStatus = await poll_questionsM.findOne({ _id: question_row_id, question_status: 0 })
                    if (checkStatus) {
                        await poll_questionsM.updateOne({ _id: question_row_id }, { $set: { question_status: 1 } })
                        res.json({ status: true, message: { alert_message: "This article polling question is enabled successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "This Question Row ID is already Enabled" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Question Row ID Row Id" } })
                }
            }
        }
        catch (err) {
            console.log('Enable question.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/disable/:question_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [2])
    if (checkToken.status) {
        try {
            let question_row_id = Number.parseInt(req.params.question_row_id)
            if (Number.isNaN(question_row_id)) {
                res.json({ status: false, message: { alert_message: "Invalid question row id. It should be a number." } })

            }
            else {
                const queryRunCheck = await poll_questionsM.findOne({ _id: question_row_id })
                if (queryRunCheck) {
                    const checkStatus = await poll_questionsM.findOne({ _id: question_row_id, question_status: 1 })
                    if (checkStatus) {
                        await poll_questionsM.updateOne({ _id: question_row_id }, { $set: { question_status: 0 } })
                        res.json({ status: true, message: { alert_message: "This article polling question is disabled successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "This Question Row ID is already disabled" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Question Row ID Row Id" } })
                }
            }
        }
        catch (err) {
            console.log('disable question.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/delete_question/:question_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [2])
    if (checkToken.status) {
        try {
            let question_row_id = Number.parseInt(req.params.question_row_id)
            if (Number.isNaN(question_row_id)) {
                res.json({ status: false, message: { alert_message: "Invalid question row id. It should be a number." } })

            }
            else {
                const queryRunCheck = await poll_questionsM.findOne({ _id: question_row_id })
                const article_id = queryRunCheck.article_id
                if (queryRunCheck) {

                    await poll_questionsM.deleteOne({ _id: question_row_id })
                    await poll_votingsM.deleteMany({ article_id: article_id })
                    res.json({ status: true, message: { alert_message: "This Question is deleted successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid question row id" } })
                }

            }
        }
        catch (err) {
            console.log('Delete Question.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }

})




router.get('/article_voting_list/:article_id/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const article_id = Number.parseInt(req.params.article_id)

            let query = [{ article_id: article_id }]

            if (req.query.search) {
                query.push({
                    $or: [
                        { ip_address: { $regex: req.query.search, $options: "i" } },
                        { full_name: { $regex: req.query.search, $options: "i" } },
                        { email_id: { $regex: req.query.search, $options: "i" } }
                    ]
                })
            }
            if (req.query.date) {
                const inputDate = new Date(req.query.date);
                const start_date = new Date(inputDate.setHours(0, 0, 0, 0));
                const end_date = new Date(inputDate.setHours(23, 59, 59, 999));

                query.date_n_time = { $gte: start_date, $lte: end_date };
            }
            if (req.query.user_vote_type) {
                let user_vote_type = Number.parseInt(req.query.user_vote_type)
                if (!Number.isNaN(user_vote_type)) {
                    query.push({ user_vote_type: user_vote_type })
                }
            }
            //user_vote_type 1//yes 2:no
            const queryRun = await poll_votingsM.aggregate([
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "users_data"
                    }
                },
                { $unwind: { path: "$users_data", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        full_name: "$users_data.full_name",
                        email_id: "$users_data.email_id"

                    }
                },
                {
                    $unwind: {
                        path: "$user_info",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "profile_info"
                    }
                },
                {
                    $unwind: {
                        path: "$profile_info",
                        preserveNullAndEmptyArrays: true
                    }
                },
                { $match: { $and: query } },
                {
                    $project: {
                        _id: 1,
                        user_type: 1,
                        article_id: 1,
                        ip_address: 1,
                        user_vote_type: 1,
                        date_n_time: 1,
                        full_name: 1,
                        email_id: 1,
                        profile_image: "$profile_info.profile_image"

                    }
                },
                { $sort: { date_n_time: -1 } }

            ]).skip(skip).limit(limit)


            const countQueryRun = await poll_votingsM.aggregate([
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "users_data"
                    }
                },
                { $unwind: { path: "$users_data", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        full_name: "$users_data.full_name",
                        email_id: "$users_data.email_id"
                    }
                },
                { $match: { $and: query } },
                {
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (countQueryRun[0]) {
                total_counts = countQueryRun[0].count
            }

            res.json({ status: true, message: queryRun, count: total_counts })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Article voting list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/requested_emails/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { ip_address: { '$regex': req.query.search, $options: 'i' } },
                        { article_title: { '$regex': req.query.search, $options: 'i' } },
                        { question_title: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }
            if (req.query.date) {
                const inputDate = new Date(req.query.date);
                const start_date = new Date(inputDate.setHours(0, 0, 0, 0));
                const end_date = new Date(inputDate.setHours(23, 59, 59, 999));

                query.date_n_time = { $gte: start_date, $lte: end_date };
            }
            const queryRun = await poll_emailsM.aggregate([
                {
                    $lookup: {
                        from: "cln_article_polling_questions",
                        localField: "article_id",
                        foreignField: "article_id",
                        as: "question_info"
                    }
                },
                { $unwind: { path: "$question_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        article_title: "$question_info.article_title",
                        question_title: "$question_info.question_title",
                    }
                },
                { $match: query },
                {
                    $project: {
                        _id: 1,
                        article_id: 1,
                        email_id: 1,
                        ip_address: 1,
                        article_title: 1,
                        question_title: 1,
                        date_n_time: 1
                    }
                },
                { $sort: { date_n_time: -1 } }
            ]).skip(skip).limit(limit)

            let total_counts = 0
            const countQueryRun = await poll_emailsM.aggregate([
                {
                    $lookup: {
                        from: "cln_article_polling_questions",
                        localField: "article_id",
                        foreignField: "article_id",
                        as: "question_info"
                    }
                },
                { $unwind: { path: "$question_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        article_title: "$question_info.article_title",
                        question_title: "$question_info.question_title",
                    }
                },
                { $match: query },
                {
                    $count: "count"
                }
            ])

            if (countQueryRun[0]) {
                total_counts = countQueryRun[0].count
            }

            res.json({ status: true, message: queryRun, count: total_counts })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Requested emails.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router