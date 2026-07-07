const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const questionsM = require('../../../models/main/onboarding/questionsM')
const anwsersM = require('../../../models/main/onboarding/anwsersM')
const started_detailsM = require('../../../models/main/onboarding/started_detailsM')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')


router.get('/list', async (req, res) => {
    const get_query = await questionsM.find()

    res.json({ status: true, message: get_query })
})

router.get('/anwsers', async (req, res) => {
    const get_query = await anwsersM.find()

    res.json({ status: true, message: get_query })
})


router.get('/started', async (req, res) => {
    const get_query = await started_detailsM.find()

    res.json({ status: true, message: get_query })
})


router.get('/overview', async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
        const user_row_id = checkToken.message
        const get_query = await started_detailsM.findOne({ user_row_id, status: 1 }, { _id: 1, status: 1, score: 1, date_n_time: 1, path_type: 1, recommended_course_row_id: 1, })
        if (get_query) {

            res.json({
                status: true,
                message: get_query
            })
        }
        else {
            res.json({
                status: false,
                message: { alert_message: "Sorry, Your onboarding quiz is not completed." }
            })
        }
    }
    else {
        res.json(checkToken)
    }
})
router.get('/start_n_update_details', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const check_query = await started_detailsM.findOne({ user_row_id, status: 1 })
            if (!check_query) {
                await started_detailsM.deleteMany({ user_row_id: user_row_id })
                await anwsersM.deleteMany({ user_row_id: user_row_id })

                const insert_object = new Object()
                insert_object.user_row_id = user_row_id
                insert_object.status = false
                insert_object.score = 0
                insert_object.date_n_time = getPresentDateTime()


                const insert_query = await started_detailsM(insert_object).save()

                res.json({
                    status: true,
                    message: {
                        started_row_id: insert_query._id,
                        insert_query,
                        alert_message: "Your onboarding initialized successfully."
                    }
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Your onboarding quiz is already completed." }
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
        console.log('Start lesson.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.post('/save_answer_details', [
    check('started_row_id')
        .trim().not().isEmpty().withMessage('The Started Row ID field is required.')
        .isInt().withMessage('The Started Row ID field must be contain only numbers.'),
    check('question_row_id')
        .trim().not().isEmpty().withMessage('The Question Row ID field is required.')
        .isInt().withMessage('The Question Row ID field must be contain only numbers.'),
    check('answer_number')
        .trim().not().isEmpty().withMessage('The Answer field is required.')
        .isInt({ min: 1, max: 4 }).withMessage('The Answer field must be contain only 1, 2, 3 or 4.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            let started_row_id = ""
            let question_row_id = ""
            let answer_number = Number.parseInt(req.body.answer_number)
            if (req.body.started_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.started_row_id))) {
                    started_row_id = Number.parseInt(req.body.started_row_id)

                    const get_query = await started_detailsM.findOne({ _id: started_row_id, user_row_id })
                    if (!get_query) {
                        errObj['started_row_id'] = 'Sorry, Invalid Started Row ID.'
                    }
                }
                else {
                    errObj['started_row_id'] = 'Sorry, Invalid Started Row ID.'
                }
            }

            if (req.body.question_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.question_row_id))) {
                    question_row_id = Number.parseInt(req.body.question_row_id)
                    if ((question_row_id >= 1) && (question_row_id <= 10)) {
                        const last_answer_query = await anwsersM.find({ user_row_id, started_row_id }).sort({ _id: -1 }).limit(1)
                        if (last_answer_query[0]) {
                            const last_question_row_id = Number.parseInt(last_answer_query[0].question_row_id) + 1
                            if (last_question_row_id != question_row_id) {
                                errObj['question_row_id'] = 'Sorry, Invalid Question Row ID.4'
                            }
                        }
                        else if (question_row_id != 1) {
                            errObj['question_row_id'] = 'Sorry, Invalid Question Row ID.3'
                        }
                    }
                    else {
                        errObj['question_row_id'] = 'Sorry, Invalid Question Row ID.2'
                    }
                }
                else {
                    errObj['question_row_id'] = 'Sorry, Invalid Question Row ID.1'
                }
            }


            if (!Object.keys(errObj).length) {
                const check_question = await questionsM.findOne({ _id: question_row_id }, { _id: 1, a_points: 1, b_points: 1, c_points: 1, d_points: 1 })
                if (check_question) {
                    let score = 0
                    let total_score = 0
                    if (answer_number == 1) {
                        score = check_question.a_points
                    }
                    else if (answer_number == 2) {
                        score = check_question.b_points
                    }
                    else if (answer_number == 3) {
                        score = check_question.c_points
                    }
                    else if (answer_number == 4) {
                        score = check_question.d_points
                    }

                    const insert_object = Object.create(null)
                    insert_object.user_row_id = user_row_id
                    insert_object.started_row_id = started_row_id
                    insert_object.question_row_id = question_row_id
                    insert_object.answer_number = answer_number
                    insert_object.score = score
                    insert_object.date_n_time = getPresentDateTime()

                    await anwsersM(insert_object).save()

                    const totalScoreAgg = await anwsersM.aggregate([
                        {
                            $match: {
                                user_row_id: user_row_id,
                                started_row_id: started_row_id
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: "$score" }
                            }
                        }
                    ])

                    total_score = totalScoreAgg.length > 0 ? totalScoreAgg[0].total : 0
                    res.json({
                        status: true,
                        message: {

                            total_score: total_score,
                            alert_message: "Your answer details has been updated successfully."
                        }
                    })
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Invalid question row id.5" }
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
        console.log('Save answer details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', error: err.message })
    }
})

router.post('/update_path_details', [
    check('started_row_id')
        .trim().not().isEmpty().withMessage('The Started Row ID field is required.')
        .isInt().withMessage('The Started Row ID field must be contain only numbers.'),
    check('path_type')
        .trim().not().isEmpty().withMessage('The Path Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Path Type field must be contain only 1 or 2.'),

], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const path_type = Number.parseInt(req.body.path_type)
            const course_row_id = Number.parseInt(req.body.course_row_id)
            let started_row_id = 0
            if (req.body.started_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.started_row_id))) {
                    started_row_id = Number.parseInt(req.body.started_row_id)

                    const get_query = await started_detailsM.findOne({ _id: started_row_id, user_row_id })
                    if (!get_query) {
                        errObj['started_row_id'] = 'Sorry, Invalid Started Row ID.'
                    }
                }
                else {
                    errObj['started_row_id'] = 'Sorry, Invalid Started Row ID.'
                }
            }

            if (!Object.keys(errObj).length) {

                const last_answer_query = await anwsersM.find({ user_row_id, started_row_id }).sort({ _id: -1 }).limit(1)
                if (last_answer_query[0]) {
                    const last_question_row_id = Number.parseInt(last_answer_query[0].question_row_id)
                    if (last_question_row_id === 10) {
                        const get_sum_query = await anwsersM.aggregate([
                            {
                                $match: { user_row_id: user_row_id }
                            },
                            {
                                $group: {
                                    _id: '',
                                    total_score: { $sum: '$score' }
                                }
                            }
                        ])

                        let score = 0
                        if (get_sum_query[0]) {
                            score = get_sum_query[0].total_score
                        }

                        let recommended_course_row_id = 1 // Beginner Path (0-15 points)

                        // Trader Path (16-30 points) - 2
                        if ((score >= 16) && (score <= 30)) {
                            recommended_course_row_id = 2
                        }
                        // Developer Path (31-45 points) - 3
                        else if ((score >= 31) && (score <= 45)) {
                            recommended_course_row_id = 3
                        }
                        // Job Seeker Path (46+ points) - 4
                        else if (score >= 46) {
                            recommended_course_row_id = 4
                        }

                        await started_detailsM.updateOne({ _id: started_row_id }, { $set: { score, status: 1, recommended_course_row_id, path_type, course_row_id } })

                        res.json({
                            status: true,
                            message: {
                                score,
                                course_row_id: recommended_course_row_id,
                                alert_message: "Your selected onboarding path details have been updated successfully."
                            }
                        })
                    }
                    else {
                        res.json({
                            status: false,
                            message: { alert_message: "Sorry, your onboarding quiz is incomplete." }
                        })
                    }
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, your onboarding quiz is incomplete." }
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
        console.log('Save answer details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', error: err.message })
    }
})




router.post('/save_details', async (req, res) => {
    if (req.body.category_row_id && req.body.question_title) {
        const date_n_time = getPresentDateTime()

        const insert_query = await questionsM({
            question_title: req.body.question_title,
            category_row_id: Number.parseInt(req.body.category_row_id),
            option_a: req.body.option_a,
            option_b: req.body.option_b,
            option_c: req.body.option_c,
            option_d: req.body.option_d,
            a_points: Number.parseInt(req.body.a_points),
            b_points: Number.parseInt(req.body.b_points),
            c_points: Number.parseInt(req.body.c_points),
            d_points: Number.parseInt(req.body.d_points),
            question_status: 1,
            date_n_time: date_n_time
        }).save()

        res.json({ status: true, message: 'Insert successful.', insert_query })
    }
    else {
        res.json({ status: false, message: 'Not Inserted.' })
    }
})


router.get('/update_details', async (req, res) => {
    const insert_query = await questionsM.updateOne({ _id: 6 }, { $set: { category_row_id: 3 } })
    res.json({ status: true, message: 'Insert successful.', insert_query })
})


module.exports = router