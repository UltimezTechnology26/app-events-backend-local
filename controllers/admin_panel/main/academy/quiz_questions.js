const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const quiz_questionsM = require('../../../../models/main/academy/quiz_questionsM')
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const coursesM = require('../../../../models/main/academy/coursesM')
const lessonsM = require('../../../../models/main/academy/lessonsM')


router.post('/add_n_update_details', [
    check('course_row_id')
        .trim().not().isEmpty().withMessage('The Course Row ID field is required.'),
    check('lesson_row_id')
        .trim().not().isEmpty().withMessage('The Lesson Row ID is required.')
        .isInt().withMessage('The Lesson Row ID field must be contain only numbers.'),
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
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {

        let course_row_id = 0
        if (req.body.course_row_id) {
            course_row_id = Number.parseInt(req.body.course_row_id)
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

        const check_lesson_query = await quiz_questionsM.countDocuments({ lesson_row_id: req.body.lesson_row_id })

        let lesson_row_id = 0
        if (req.body.lesson_row_id) {
            lesson_row_id = Number.parseInt(req.body.lesson_row_id)
            if (Number.isNaN(lesson_row_id)) {
                errObj['lesson_row_id'] = 'Sorry, Invalid Lesson Row ID.'
            }
            else {
                const check_query = await lessonsM.findOne({ _id: lesson_row_id })
                if (!check_query) {
                    errObj['lesson_row_id'] = 'Sorry, Invalid Lesson Row ID.'
                }
            }
        }



        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else if (req.body.question_row_id) {
            const question_row_id = Number.parseInt(req.body.question_row_id)

            const check_query = await quiz_questionsM.findOne({ _id: question_row_id })
            if (check_query) {
                const update_array = {
                    lesson_row_id: req.body.lesson_row_id,
                    question_title: req.body.question_title,
                    option_a: req.body.option_a,
                    option_b: req.body.option_b,
                    option_c: req.body.option_c,
                    option_d: req.body.option_d,
                    correct_answer: req.body.correct_answer
                }

                await quiz_questionsM.updateOne({ _id: question_row_id }, { $set: update_array })

                res.json({
                    status: true,
                    count: check_lesson_query,
                    message: { alert_message: "This quiz question details has been updated successfully." }
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
                course_row_id: Number.parseInt(req.body.course_row_id),
                lesson_row_id: req.body.lesson_row_id,
                question_title: req.body.question_title,
                option_a: req.body.option_a,
                option_b: req.body.option_b,
                option_c: req.body.option_c,
                option_d: req.body.option_d,
                correct_answer: Number.parseInt(req.body.correct_answer),
                date_n_time: getPresentDateTime()
            }

            await quiz_questionsM(saveObject).save()

            res.json({
                status: true,
                message: { alert_message: "This quiz question details has been added successfully." }
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


router.get('/list/:lesson_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const lesson_row_id = Number.parseInt(req.params.lesson_row_id)
        if (!Number.isNaN(lesson_row_id)) {
            const search_query = [{ lesson_row_id: lesson_row_id }];

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
            const get_query = await quiz_questionsM.find(filter_query);

            res.json({
                status: true,
                message: get_query
            });
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
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})



router.get('/details/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const request_row_id = Number.parseInt(req.params.request_row_id)
        if (!Number.isNaN(request_row_id)) {
            const get_query = await quiz_questionsM.findOne({ _id: request_row_id })
            if (get_query) {
                res.json({
                    status: true,
                    message: get_query
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid request row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Request Row ID."
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



router.get('/delete/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const request_row_id = Number.parseInt(req.params.request_row_id)
        if (!Number.isNaN(request_row_id)) {
            const get_query = await quiz_questionsM.findOne({ _id: request_row_id })
            if (get_query) {
                await quiz_questionsM.deleteOne({ _id: request_row_id })

                res.json({
                    status: true,
                    message: { alert_message: "This quiz question details has been deleted successfully." }
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid request row id." }
                })
            }
        }

        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Request Row ID."
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