const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const weekly_contests_questionsM = require('../../../../models/main/contest/weekly_contests_questionsM')
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')


router.post('/add_n_update_details', [
    check('contest_row_id')
        .trim().not().isEmpty().withMessage('The Contest Row ID field is required.'),
    check('question_title')
        .trim().not().isEmpty().withMessage('The Question Title  field is required.'),
    check('option_a')
        .trim().not().isEmpty().withMessage('The Option A field is required.'),
    check('option_b')
        .trim().not().isEmpty().withMessage('The Option B field is required.'),
    check('option_c')
        .trim().not().isEmpty().withMessage('The Option C field is required.'),
    check('option_d')
        .trim().not().isEmpty().withMessage('The Option D field is required.'),
    check('correct_answer')
        .trim().not().isEmpty().withMessage('The Correct Answer field is required.')
        .isInt({ min: 1, max: 4 }).withMessage('The Correct Answer field must be contain only integer values.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else if (req.body.question_row_id) {
                const question_row_id = Number.parseInt(req.body.question_row_id)

                const check_query = await weekly_contests_questionsM.findOne({ _id: question_row_id })
                if (check_query) {
                    const update_array = {
                        contest_row_id: req.body.contest_row_id,
                        question_title: req.body.question_title,
                        option_a: req.body.option_a,
                        option_b: req.body.option_b,
                        option_c: req.body.option_c,
                        option_d: req.body.option_d,
                        correct_answer: req.body.correct_answer
                    }

                    await weekly_contests_questionsM.updateOne({ _id: question_row_id }, { $set: update_array })

                    res.json({
                        status: true,
                        message: { alert_message: "This contest question details has been updated successfully." }
                    })
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, This question row id is invalid." }
                    })
                }
            }
            else {
                const saveObject = {
                    contest_row_id: Number.parseInt(req.body.contest_row_id),
                    question_title: req.body.question_title,
                    option_a: req.body.option_a,
                    option_b: req.body.option_b,
                    option_c: req.body.option_c,
                    option_d: req.body.option_d,
                    correct_answer: Number.parseInt(req.body.correct_answer),
                    date_n_time: getPresentDateTime()
                }

                await weekly_contests_questionsM(saveObject).save()

                res.json({
                    status: true,
                    message: { alert_message: "This contest question details has been added successfully." }
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
        console.log('Add and update details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/list/:contest_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const contest_row_id = Number.parseInt(req.params.contest_row_id)
            if (!Number.isNaN(contest_row_id)) {

                const search_query = [{ contest_row_id: contest_row_id }];

                if (req.query.search) {
                    search_query.push({
                        $or: [
                            { question_title: { '$regex': req.query.search, $options: 'i' } },

                        ]
                    })
                }

                if (req.query.date) {
                    const inputDate = new Date(req.query.date);
                    const start_date = new Date(inputDate);
                    start_date.setHours(0, 0, 0, 0);

                    const end_date = new Date(inputDate);
                    end_date.setHours(23, 59, 59, 999);

                    search_query.push({ date_n_time: { $gte: start_date, $lte: end_date } });
                }
                const filter_query = search_query.length > 0 ? { $and: search_query } : search_query[0];

                const get_query = await weekly_contests_questionsM.find(filter_query)

                res.json({
                    status: true,
                    message: get_query
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
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Questions list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/individual_details/:contest_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const contest_row_id = Number.parseInt(req.params.contest_row_id)
            if (!Number.isNaN(contest_row_id)) {
                const get_query = await weekly_contests_questionsM.findOne({ _id: contest_row_id })
                if (get_query) {
                    res.json({
                        status: true,
                        message: get_query
                    })
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, Invalid Contest Question row id." }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: {
                        alert_message: "Sorry, Invalid Contest Question Row ID."
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
        console.log('Individual question details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/delete/:contest_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const contest_row_id = Number.parseInt(req.params.contest_row_id)
            if (!Number.isNaN(contest_row_id)) {
                const get_query = await weekly_contests_questionsM.findOne({ _id: contest_row_id })
                if (get_query) {
                    await weekly_contests_questionsM.deleteOne({ _id: contest_row_id })

                    res.json({
                        status: true,
                        message: { alert_message: "This contest question details has been deleted successfully." }
                    })
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, Invalid Contest Question row id." }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: {
                        alert_message: "Sorry, Invalid Contest Question Row ID."
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
        console.log('Delete contest.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router