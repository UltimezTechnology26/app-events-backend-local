require('dotenv').config()
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require('node:path');
const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const quiz_questionsM = require('../../../models/main/academy/quiz_questionsM')
const quiz_lesson_started_detailsM = require('../../../models/main/academy/quiz_lesson_started_detailsM')
const users_quiz_answersM = require('../../../models/main/academy/users_quiz_answersM')
const lessonsM = require('../../../models/main/academy/lessonsM')
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM')
const quiz_not_complete_remaindersM = require('../../../models/main/academy/quiz_not_complete_remaindersM')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const { getUserProfileWithScore, sendJobEligibilityEmail, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { sendAcademyEmail } = require('../../../config/email')
const quiz_question_limit = Number.parseInt(process.env.QUIZ_QUESTION_LIMIT)
const { updateNotification } = require('../../../utils/helpers/notification_helper')
const { getNextLessonDetails, fillTemplate, formatCertificateDate, formatLongMonthYear } = require('../../../utils/helpers/academy_helper');
const professionalsM = require('../../../models/app/professionalsM');
const coursesM = require('../../../models/main/academy/coursesM');
const professionals_pointsM = require('../../../models/app/users/professionals_pointsM');
import { deleteKeysByPattern } from "../../../config/cache_helper";
import agenda from "../../../config/agenda"
const community_postsM = require('../../../models/main/community/community_postsM');
import s3 from '../../../config/s3'


router.get('/start_lesson_quiz/:course_row_id/:lesson_row_id', async (req, res) => {
    try {
        //check lesson, wheather the user start or not ? this lesson
        const lesson_row_id = Number.parseInt(req.params.lesson_row_id)
        const course_row_id = Number.parseInt(req.params.course_row_id)
        if (Number.isNaN(lesson_row_id) || Number.isNaN(course_row_id)) {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Lesson or Course Row ID."
                }
            })
        }
        else {
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                const user_row_id = checkToken.message
                const lesson_details = await getNextLessonDetails({ course_row_id, user_row_id })
                if (lesson_details._id === lesson_row_id) {
                    const get_query = await quiz_questionsM.findOne({ lesson_row_id: lesson_row_id, course_row_id: course_row_id })
                    if (get_query) {
                        await quiz_lesson_started_detailsM.deleteMany({ user_row_id: user_row_id, course_row_id: course_row_id, lesson_row_id: lesson_row_id })

                        await users_quiz_answersM.deleteMany({ lesson_row_id: lesson_row_id, user_row_id: user_row_id })

                        await quiz_not_complete_remaindersM.deleteOne({ lesson_row_id: lesson_row_id, user_row_id: user_row_id })

                        const insert_lesson_start_array = {
                            user_row_id: user_row_id,
                            course_row_id: course_row_id,
                            lesson_row_id: lesson_row_id,
                            lesson_status: 0,
                            date_n_time: getPresentDateTime()
                        }

                        const lesson_start_insert_query = await quiz_lesson_started_detailsM(insert_lesson_start_array).save()
                        const lesson_started_row_id = lesson_start_insert_query._id
                        const lesson_query = await lessonsM.findOne({ _id: lesson_row_id }, { _id: 1, lesson_number: 1 })
                        let lesson_number = 0
                        if (lesson_query) {
                            lesson_number = lesson_query.lesson_number
                        }
                        res.json({
                            status: true,
                            message: {
                                started_row_id: lesson_started_row_id,
                                lesson_number: lesson_number,
                                alert_message: "This lesson started successfully."
                            }
                        })
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
                        course_url: lesson_details.course_url,
                        lesson_url: lesson_details.lesson_url,
                        lesson_number: lesson_details.lesson_number,
                        lesson_image_url: lesson_details.lesson_image_url,
                        message: {
                            alert_message: `Please complete Lesson ${lesson_details.lesson_number} before proceeding.`,
                        }, lesson_details: lesson_details
                    })
                }
            }
            else {
                res.json(checkToken)
            }
        }
    }
    catch (err) {
        console.log('Start lesson.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})





router.get('/question_details/:lesson_started_row_id', async (req, res) => {
    try {
        const lesson_started_row_id = Number.parseInt(req.params.lesson_started_row_id)
        if (!Number.isNaN(lesson_started_row_id)) {
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                const user_row_id = checkToken.message
                const check_lesson_start_query = await quiz_lesson_started_detailsM.findOne({ _id: lesson_started_row_id, user_row_id: user_row_id })
                if (check_lesson_start_query) {
                    const lesson_row_id = check_lesson_start_query.lesson_row_id
                    const check_answers_count_query = await users_quiz_answersM.countDocuments({ lesson_row_id: lesson_row_id, user_row_id: user_row_id })
                    if (check_answers_count_query < quiz_question_limit) {
                        const get_query = await quiz_questionsM.aggregate([
                            { $match: { lesson_row_id: lesson_row_id } },
                            {
                                $lookup: {
                                    from: "cln_academy_quiz_answers",
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
                            await users_quiz_answersM.updateOne({ user_row_id: user_row_id, lesson_row_id: lesson_row_id, lesson_started_row_id: lesson_started_row_id },
                                {
                                    $set: { close_status: true }
                                })

                            const quiz_insert_array = {
                                user_row_id: user_row_id,
                                lesson_started_row_id: lesson_started_row_id,
                                lesson_row_id: lesson_row_id,
                                question_row_id: get_query[0]._id,
                                date_n_time: getPresentDateTime()
                            }

                            const quiz_insert_query = await users_quiz_answersM(quiz_insert_array).save()
                            let question_number = check_answers_count_query + 1

                            res.json({
                                status: true,
                                message: {
                                    total_questions: quiz_question_limit,
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
                                alert_message: "Sorry, This lesson quiz details has been completed successfully."
                            }
                        })
                    }
                }
                else {
                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, please start lesson then try to get the question." }
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
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Lesson Started Row ID."
                }
            })
        }

    }
    catch (err) {
        console.log('Question details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/question_expired/:lesson_started_row_id/:update_row_id', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const lesson_started_row_id = Number.parseInt(req.params.lesson_started_row_id)
            const update_row_id = Number.parseInt(req.params.update_row_id)
            const check_query = users_quiz_answersM.findOne({ user_row_id: user_row_id, _id: update_row_id, lesson_started_row_id: lesson_started_row_id })
            if (check_query) {
                await users_quiz_answersM.updateOne({ user_row_id: user_row_id, _id: update_row_id, lesson_started_row_id: lesson_started_row_id },
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

router.get('/certificate_download/:course_row_id', async (req, res) => {

    try {
        const course_row_id = Number.parseInt(req.params.course_row_id)
        if (Number.isNaN(course_row_id)) {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Course Row ID."
                }
            })
        }
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const user = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1 })
            const course_response = await courses_certificatesM.findOne({
                user_row_id: user_row_id, course_row_id: course_row_id
            })
            const course_details = await coursesM.findOne({ _id: course_row_id })
            let certificateFile
            const certificateData = {
                name: user?.full_name
                    ? user.full_name.charAt(0).toUpperCase() + user.full_name.slice(1)
                    : '',
                course_name: course_details?.course_name,
                score: course_response?.percentage_score,
                date: formatLongMonthYear(course_response?.date_n_time),
                certificate_id: 'CP/BGC/' + formatCertificateDate(new Date(course_response?.date_n_time)) + '/' + course_response._id
            }
            if (!course_response?.certificate_pdf_url) {
                certificateFile = await generateCertificateFile({
                    data: certificateData, certificate_row_id: course_response._id
                })
            } else {
                certificateFile = {
                    url: course_response?.certificate_pdf_url
                }
            }
            await courses_certificatesM.updateOne(
                { _id: course_response._id },
                {
                    $set: {
                        certificate_image_url: certificateFile.image_url,
                        certificate_pdf_url: certificateFile.pdf_url,
                    }
                }
            );



            res.json({
                status: true,
                message: {
                    alert_message: "Your answer details has been updated successfully.",
                    certificate_url: certificateFile
                }
            })
        }
        else {
            res.json({
                status: false,
                message: { alert_message: "Invalid Certificate details." }
            })
        }
    } catch (error) {
        res.json({
            status: false,
            message: {
                alert_message: error
            }
        })
    }
})

router.post('/save_answer_details', [
    check('lesson_started_row_id')
        .trim().not().isEmpty().withMessage('The Lesson Started Row ID field is required.')
        .isInt().withMessage('The Lesson Started Row ID field must be contain only numbers.'),
    check('update_row_id')
        .trim().not().isEmpty().withMessage('The Update Row ID field is required.')
        .isInt().withMessage('The Updated Row ID field must be contain only numbers.'),
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
            let lesson_started_row_id = ""
            let update_row_id = ""
            let answer_number = ""
            let duration = ""

            if (req.body.lesson_started_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.lesson_started_row_id))) {
                    lesson_started_row_id = Number.parseInt(req.body.lesson_started_row_id)
                }
                else {
                    errObj['lesson_started_row_id'] = 'Sorry, Invalid Lesson Started Row ID.'
                }
            }

            if (req.body.update_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.update_row_id))) {
                    update_row_id = Number.parseInt(req.body.update_row_id)
                }
                else {
                    errObj['update_row_id'] = 'Sorry, Invalid Updated Row ID.'
                }
            }
            if (req.body.duration) {
                if (!Number.isNaN(Number.parseInt(req.body.duration))) {
                    duration = Number.parseInt(req.body.duration)
                }
                else {
                    errObj['duration'] = 'Sorry, Invalid Duration.'
                }
            }


            if (req.body.answer_number) {
                if (!Number.isNaN(Number.parseInt(req.body.answer_number))) {
                    answer_number = Number.parseInt(req.body.answer_number)

                }
                else {
                    errObj['answer_number'] = 'Sorry, Invalid answer number.'
                }
            }

            const where_query = { _id: update_row_id, lesson_started_row_id: lesson_started_row_id, user_row_id: user_row_id }
            const check_quiz_query = await users_quiz_answersM.findOne(where_query)


            if (!check_quiz_query) {
                errObj['alert_message'] = 'Sorry, Invalid Question Row ID.'
            }


            if (!Object.keys(errObj).length) {
                const question_row_id = check_quiz_query.question_row_id
                const question_query = await quiz_questionsM.findOne({ _id: question_row_id })

                if (question_query.correct_answer) {
                    const question_correct_answer = question_query.correct_answer
                    const course_row_id = question_query.course_row_id
                    const lesson_row_id = question_query.lesson_row_id
                    let answer_status = false
                    if (Number.parseInt(question_correct_answer) === Number.parseInt(answer_number)) {
                        answer_status = true
                    }

                    await users_quiz_answersM.updateOne(where_query, {
                        $set: {
                            answer_number: answer_number, close_status: true,
                            answer_status: answer_status, duration: duration
                        }
                    })

                    const current_lesson_query = await lessonsM.aggregate([
                        {
                            $match: { _id: lesson_row_id },
                        },
                        {
                            $limit: 1
                        },
                        {
                            $lookup: {
                                from: "cln_academy_courses",
                                localField: "course_row_id",
                                foreignField: "_id",
                                as: "course",
                                pipeline: [
                                    {
                                        $project:
                                        {
                                            course_url: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                lesson_number: 1,
                            }
                        }
                    ])

                    let next_lesson = {}
                    if (current_lesson_query[0]) {
                        const next_lesson_query = await lessonsM.aggregate([
                            {
                                $sort: {
                                    lesson_number: 1,
                                }
                            },
                            {
                                $match: {
                                    course_row_id: course_row_id,
                                    lesson_number: { $gt: current_lesson_query[0].lesson_number }
                                }
                            },
                            {
                                $limit: 1
                            },
                            {
                                $lookup: {
                                    from: "cln_academy_courses",
                                    localField: "course_row_id",
                                    foreignField: "_id",
                                    as: "courses",

                                }
                            },
                            {
                                $unwind: "$courses"
                            },
                            {
                                $project: {
                                    _id: 1,
                                    lesson_number: 1,
                                    title: 1,
                                    author_name: 1,
                                    author_id: 1,
                                    author_link: 1,
                                    updated_on: 1,
                                    lesson_image_url: 1,
                                    lesson_url: 1,
                                    course_row_id: 1,
                                    course_slug: "$courses.course_slug"
                                }
                            }
                        ])

                        next_lesson = next_lesson_query[0] ? next_lesson_query[0] : {}
                    }

                    const get_answers_list_query = await users_quiz_answersM.aggregate([
                        {
                            $match: { lesson_started_row_id: lesson_started_row_id, user_row_id: user_row_id }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_academy_quiz_questions",
                                localField: "question_row_id",
                                foreignField: "_id",
                                as: "questions",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 1,
                                            question_title: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: { path: "$questions" }
                        },
                        {
                            $project: {
                                _id: 1,
                                answer_number: 1,
                                answer_status: 1,
                                close_status: 1,
                                duration: 1,
                                question_row_id: 1,
                                question_title: '$questions.question_title'
                            }
                        }
                    ]).limit(10)


                    let quiz_completed_status = false
                    let quiz_score_points = 0
                    let course_completed_status = false
                    let certificate_row_id = 0
                    let certificateFile
                    let certificateData
                    const check_answers_count_query = await users_quiz_answersM.countDocuments({ lesson_started_row_id: lesson_started_row_id, user_row_id: user_row_id })
                    if (check_answers_count_query >= quiz_question_limit) {
                        quiz_completed_status = true
                        quiz_score_points = await users_quiz_answersM.countDocuments({ lesson_started_row_id: lesson_started_row_id, answer_status: true, user_row_id: user_row_id })

                        let update_lesson_status = (quiz_score_points >= 7) ? 1 : 0
                        await quiz_lesson_started_detailsM.updateOne({ _id: lesson_started_row_id }, { $set: { lesson_status: update_lesson_status, lesson_score: quiz_score_points } })
                        const course_response = await sendLessonCompleteEmail({ where_query, scored_points: quiz_score_points, next_lesson })
                        if (course_response.status) {
                            course_completed_status = true
                            certificate_row_id = course_response.message._id;
                            console.log("generating certificate");

                            await agenda.now('generate certificate', {
                                user_row_id,
                                course_row_id,
                                certificate_row_id
                            });
                        }
                    }
                    await deleteKeysByPattern('academy_course_list_*')
                    await deleteKeysByPattern('lessons_list_*')
                    await deleteKeysByPattern('individual_lesson_*')

                    await deleteKeysByPattern('job_list_*')
                    const quizduration = get_answers_list_query.reduce((sum, quiz) => sum + (quiz?.duration || 0), 0)
                    await calculateUserProfileScore(user_row_id, ['academy'])

                    res.json({
                        status: true,
                        message: {
                            get_answers_list_query: get_answers_list_query,
                            quiz_completed_status: quiz_completed_status,
                            quiz_score_points: quiz_score_points,
                            get_answers_list: quiz_completed_status ? get_answers_list_query : [],
                            next_lesson: (quiz_score_points >= 7) ? next_lesson : {},
                            course_completed_status,
                            certificate_row_id,
                            total_duration: quizduration,
                            alert_message: "Your answer details has been updated successfully.",
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
        console.log('Save answer details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', error: err.message })
    }
})

const sendLessonCompleteEmail = async ({ where_query, scored_points, next_lesson }) => {
    const emailData = await users_quiz_answersM.aggregate([
        {
            $match: where_query
        },
        {
            $lookup:
            {
                from: "cln_academy_courses_lessons",
                localField: "lesson_row_id",
                foreignField: "_id",
                as: "lesson_info"
            }
        },
        {
            $unwind: { path: "$lesson_info", preserveNullAndEmptyArrays: true }
        },
        {
            $lookup:
            {
                from: "cln_academy_courses",
                localField: "lesson_info.course_row_id",
                foreignField: "_id",
                as: "course_info"
            }
        },
        {
            $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true }
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
                lesson_row_id: 1,
                user_row_id: 1,
                full_name: "$user_info.full_name",
                user_name: "$user_info.user_name",
                email_id: "$user_info.email_id",
                course_row_id: "$lesson_info.course_row_id",
                lesson_number: "$lesson_info.lesson_number",
                lesson_title: "$lesson_info.title",
                lesson_url: "$lesson_info.lesson_url",
                lesson_image_url: "$lesson_info.lesson_image_url",
                course_url: "$course_info.course_slug",
                course_name: "$course_info.course_name",
                expert_tag: "$course_info.expert_tag",
            }
        }
    ])

    if (emailData[0]) {
        const full_name = emailData[0].full_name
        const email_id = emailData[0].email_id
        const lesson_row_id = emailData[0].lesson_row_id
        const user_row_id = emailData[0].user_row_id

        const lesson_number = emailData[0].lesson_number
        const lesson_title = emailData[0].lesson_title
        const lesson_url = emailData[0].lesson_url
        const lesson_image_url = emailData[0].lesson_image_url
        const course_name = emailData[0].course_name
        const course_url = emailData[0].course_url
        const course_row_id = emailData[0].course_row_id


        let string_join_button = ""
        let header_profile_section = ""
        let pass_subject = ""
        if (scored_points < 7) {
            header_profile_section = `Oops! You have yet to learn more.`
            pass_subject = `Quiz Results for Course ${course_name} `

            const generated_lesson_url = "https://app.coinpedia.org/academy/" + course_url + "/" + emailData[0].lesson_url
            string_join_button = `
            <p>As per our eligibility scores, the maximum points for passing the quiz is 07 / 10. We are sorry to tell you that you couldn't clear the eligibility test in order to proceed with your next course.</p>
            <p>No worries, you can take this quiz again and get qualified for the next course.</p>
            <a href="${generated_lesson_url}" style='text-decoration: none; background: #0052CC; border: 0; color: #fff; padding: 10px 25px; font-weight: 600; border-radius: 6px; font-size: 14px; display: inline-block;'>Reattempt The Quiz</a>`
        }
        else {
            pass_subject = `Congratulations! You have Passed The Quiz of ${course_name}`
            if (scored_points < 8) {
                header_profile_section = `You have passed the Quiz.!`
            }
            else {
                header_profile_section = `Great Job, You have passed the Quiz.!`
            }


            if (next_lesson.lesson_number && next_lesson.lesson_url) {
                const next_lesson_number = next_lesson.lesson_number
                const next_lesson_url = next_lesson.lesson_url

                const generated_lesson_url = "https://app.coinpedia.org/academy/" + course_url + "/" + next_lesson_url
                string_join_button = `
                <p>Now that you have passed the quiz, proceed with Lesson Number ${next_lesson_number}. Get unlimited content and enjoy your learning on crypto and blockchain.</p>
                <a href="${generated_lesson_url}" style='text-decoration: none; background: #0052CC; border: 0; color: #fff; padding: 10px 25px; font-weight: 600; border-radius: 6px; font-size: 14px; display: inline-block;'>Start Next Lesson</a>`
            }

            await updateNotification({
                user_row_id: user_row_id,
                notify_type: 5,
                notify_type_row_id: lesson_row_id,
                message_row_id: 103,
                action_row_id: lesson_row_id,
                notify_image: lesson_image_url,
                notify_name: lesson_title,
                notify_id: course_url + "/" + lesson_url
            })
        }

        const pass_message = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
               <h3>Hello ${full_name},</h3>
               <p>Thank you for taking the quiz on <b>Course : ${course_name} </b></p>
               <p>Please find your quiz scores below :</p>
               <p><b>Lesson ${lesson_number}: ${lesson_title}</b></p>
               <p><b>Score : ${scored_points} / ${quiz_question_limit}</b></p>
               ${string_join_button}
               </div>`

        //    <p style='margin-bottom: 0;padding-bottom: 5px;'>Happy Learning,</p>
        //    <p style='margin-top: 0;padding-top: 0;'>Team Coinpedia</p>

        sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

        if ((scored_points >= 7) && where_query.user_row_id) {
            const course_response = await sendCourseCompleteEmail({ user_row_id: where_query.user_row_id, course_row_id, userData: emailData[0] })
            const points = await professionals_pointsM.findOne({ user_row_id: user_row_id, point_type: "job_apply_eligibility" })
            if (!points) {
                const postExists = await community_postsM.exists({ post_status: true });
                const total_completion = await getUserProfileWithScore(user_row_id)
                if (postExists && total_completion >= 70) {
                    const pointEntry = new professionals_pointsM({
                        user_row_id,
                        points: '40',
                        point_type: "job_apply_eligibility",
                        point_status: "credited"
                    });
                    await pointEntry.save();
                    sendJobEligibilityEmail({ email_id: email_id, full_name: full_name })
                }
            }

            if (course_response.status) {
                return course_response
            }
        }
    }

    return { status: false, message: '' }
}



async function generateCertificateFile({ data, certificate_row_id }) {
    const templatePath = path.join(__dirname, 'templates', 'certificate.html');
    const rawHtml = fs.readFileSync(templatePath, 'utf8');
    const filledHtml = fillTemplate(rawHtml, data);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(filledHtml, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        landscape: true,
        scale: 0.9,
        margin: {
            top: '0mm',
            right: '0mm',
            bottom: '0mm',
            left: '0mm',
        },
    });

    // Generate Image
    await page.setViewport({
        width: Math.floor(1500 * 0.9),
        height: Math.floor(800 * 0.9),
    });

    const imageBuffer = await page.screenshot({
        fullPage: true,
    });

    await browser.close();

    // Upload both files

    const uploadToS3 = async (key, buffer, contentType) => {
        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.DO_SPACES_NAME,
                Key: key,
                Body: buffer,
                ACL: "public-read",
                ContentType: contentType,
            })
        );

        return `https://${process.env.DO_SPACES_NAME}.${process.env.DO_SPACES_ENDPOINT.replace(
            /^https?:\/\//,
            ""
        )}/${key}`;
    };
    const pdfKey = `academy/certificate_${certificate_row_id}.pdf`;
    const imageKey = `academy/certificate_${certificate_row_id}.png`;

    const [pdfUrl, imageUrl] = await Promise.all([
        uploadToS3(pdfKey, pdfBuffer, 'application/pdf'),
        uploadToS3(imageKey, imageBuffer, 'image/png'),
    ]);

    return {
        message: 'PDF and image uploaded successfully',
        pdf_url: pdfUrl,
        image_url: imageUrl,
    };
}


const sendCourseCompleteEmail = async ({ user_row_id, course_row_id, userData }) => {

    const total_lessons = await lessonsM.countDocuments({ course_row_id: course_row_id })

    const course_complete_query = await quiz_lesson_started_detailsM.aggregate([
        {
            $match: {
                user_row_id: user_row_id,
                course_row_id: course_row_id,
                lesson_status: 1,
                // lesson_score: {$gte: 5}
            }
        },
        {
            $group: {
                _id: null,
                your_score: {
                    $sum: "$lesson_score"
                },
                count: { $sum: 1 }
            }
        }
    ])
    //return course_complete_query
    if (course_complete_query[0]) {
        const total_lesson_completed = course_complete_query[0].count
        const total_score = total_lessons * 10
        const your_score = course_complete_query[0].your_score
        const your_percentage = ((your_score / total_score) * 100).toFixed(2)
        const passing_score = ((total_score / 100) * 70).toFixed(0)
        const excellent_grade_score = (total_score * .8).toFixed(2)
        let pass_grade = "Good"
        if (your_score >= excellent_grade_score) {
            pass_grade = "Excellent"
        }

        if (total_lesson_completed == total_lessons) {
            await updateNotification({
                user_row_id: user_row_id,
                notify_type: 4,
                notify_type_row_id: course_row_id,
                message_row_id: 102,
                action_row_id: course_row_id
            })

            const present_date_n_time = getPresentDateTime()

            let inserted_query = ''
            const get_courses_certificate_query = await courses_certificatesM.findOne({ user_row_id, course_row_id })
            if (!get_courses_certificate_query) {
                inserted_query = await courses_certificatesM({
                    user_row_id,
                    course_row_id,
                    percentage_score: your_percentage,
                    download_status: 0,
                    date_n_time: present_date_n_time
                }).save()
            }
            else {
                inserted_query = get_courses_certificate_query
            }


            const full_name = userData.full_name
            const email_id = userData.email_id
            const course_name = userData.course_name
            const expert_tag = userData.expert_tag

            const pointsquery = await professionals_pointsM.findOne({ user_row_id: user_row_id, point_type: "Course - " + course_name })
            if (!pointsquery) {
                const pointEntry = new professionals_pointsM({
                    user_row_id,
                    points: '50',
                    point_type: "Course - " + course_name,
                    point_status: "credited"
                });
                await pointEntry.save();
            }

            const pass_subject = `Kudos ! Course Completed on ${course_name}`
            const header_profile_section = `Kudos ! Course Completed on ${course_name}`

            const pass_message = `
            <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                <h3>Hi ${full_name},</h3>
                <p>Great news! You’ve successfully completed the Coinpedia Academy ${course_name}'s course and earned your ${expert_tag} Tag and 50 CP. 🙌</p>
                <p style="margin: 0 0 8px">Your Course Summary:</p>
                <table>
                    <tr>
                    <td>Total lessons</td>
                    <td>:</td>
                    <td><b>${total_lessons}</b></td>
                    </tr>
                <tr>
                    <td>Total Score</td>
                    <td>:</td>
                    <td><b>${total_score}</b></td>
                </tr>
                <tr>
                <td>Your Score</td>
                <td>:</td>
                <td><b>${your_score} (${your_percentage}%)</b></td>
                </tr>
                <tr>
                <td>Passing Score</td>
                <td>:</td>
                <td><b>${passing_score} (70%)</b></td>
                </tr>
                <tr >
                <td style="padding-top: 15px;">Result</td>
                <td style="padding-top: 15px;">:</td>
                <td style="padding-top: 15px;"><b>${pass_grade}</b></td>
                </tr>
            </table>
            <p>Your expert status is now live on your profile — unlocking exclusive content and learning paths. Keep learning,</p>
            </div>`

            sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

            return { status: true, message: inserted_query }
        }
        else {
            return { status: false, message: 'course not completed' }
        }
    }
    else {
        return { status: false, message: 'course not completed' }
    }
}


module.exports = router