const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAllLoginToken } = require('../../../../middleware/authorization')
const lesson_faqM = require('../../../../models/main/academy/lesson_faqM')
const lessonsM = require('../../../../models/main/academy/lessonsM')
const { deleteKeysByPattern } = require('../../../../config/cache_helper')

const deleteFAQ = async ({ type, lesson_row_id, faq_row_id }) => {
    try {
        if (type == 1) {
            await lesson_faqM.deleteOne({ lesson_row_id: lesson_row_id, _id: faq_row_id })
        }
        else {
            await lesson_faqM.deleteMany({ lesson_row_id: lesson_row_id })
        }
    }
    catch {
        console.error('Delete Lesson Followers details', err.message)
        return false
    }
}

router.post('/update_faq_details', [
    check('lesson_row_id')
        .not().isEmpty().withMessage('The Lesson Row ID field is required.')
        .isInt().withMessage('The Lesson Row ID field must be contains only integers.'),
    check('faq_question')
        .not().isEmpty().withMessage('The Faq Question field is required.'),
    check('faq_answer')
        .not().isEmpty().withMessage('The Faq Answer field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            let lesson_row_id = 0
            let user_row_id = 0
            let faq_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.body.lesson_row_id))) {
                lesson_row_id = Number.parseInt(req.body.lesson_row_id)
                if (lesson_row_id) {
                    const lessonExists = await lessonsM.findOne({ _id: lesson_row_id }, { _id: 1 });
                    if (!lessonExists) {
                        errObj['lesson_row_id'] = 'Invalid Lesson Row ID.';
                    }
                }

                if (req.body.faq_row_id) {
                    if (!Number.isNaN(Number.parseInt(req.body.faq_row_id))) {
                        const check_valid_faq_query = await lesson_faqM.findOne({ _id: Number.parseInt(req.body.faq_row_id), lesson_row_id: lesson_row_id })
                        if (check_valid_faq_query) {
                            faq_row_id = Number.parseInt(req.body.faq_row_id)
                        }
                        else {
                            errObj['alert_message'] = 'Sorry, Invalid FAQ Row ID.'
                        }
                    }
                }
            }


            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                let update_object = {}
                update_object['faq_question'] = req.body.faq_question
                update_object['faq_answer'] = req.body.faq_answer

                if (faq_row_id) {
                    await lesson_faqM.updateOne({ _id: faq_row_id }, { $set: update_object })
                    await deleteKeysByPattern('individual_lesson_*')
                    res.json({ status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } })
                }
                else {
                    update_object['lesson_row_id'] = lesson_row_id

                    await lesson_faqM(update_object).save()
                    await deleteKeysByPattern('individual_lesson_*')
                    res.json({ status: true, message: { alert_message: 'New FAQ details has been listed successfully.' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Update FAQ Details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/list/:lesson_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            let lesson_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.params.lesson_row_id))) {
                lesson_row_id = Number.parseInt(req.params.lesson_row_id)
            }
            else {
                errObj['lesson_row_id'] = 'The Lesson row id field must be contain valid number.'
            }


            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (lesson_row_id && user_row_id) {
                const lessonExists = await lessonsM.findOne({ _id: lesson_row_id }, { _id: 1 });
                if (!lessonExists) {
                    errObj['lesson_row_id'] = 'Invalid Lesson Row ID.';
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)

                let query = [{ lesson_row_id: lesson_row_id }]
                if (req.query.search) {
                    query.push({ faq_question: { $regex: sanitize(req.query.search), $options: 'i' } })
                }

                let search_query = { $and: query }
                const get_query = await lesson_faqM.aggregate([
                    { $match: search_query },
                    { $sort: { _id: -1 } },
                    {
                        $project: {
                            _id: 1,
                            faq_question: 1,
                            faq_answer: 1
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await lesson_faqM.countDocuments(search_query)

                res.json({ status: true, message: get_query, count: count_query })
            }
        }
        catch (err) {
            console.log('FAQ list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.get('/delete_faq/:faq_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7])
    if (checkUserToken.status) {
        try {
            let user_row_id = 0
            let faq_row_id = 0
            let lesson_row_id = 0

            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (Number.isNaN(Number.parseInt(req.params.faq_row_id))) {
                errObj['faq_row_id'] = 'The faq row id field must be contain valid number.'
            }
            else {
                faq_row_id = Number.parseInt(req.params.faq_row_id)
                const check_query = await lesson_faqM.findOne({ _id: faq_row_id })
                if (!check_query) {
                    errObj['faq_row_id'] = 'Invalid faq row id.'
                }
                else {
                    lesson_row_id = check_query.lesson_row_id
                    if (lesson_row_id && user_row_id) {
                        const lessonExists = await lessonsM.findOne({ _id: lesson_row_id }, { _id: 1 });
                        if (!lessonExists) {
                            errObj['lesson_row_id'] = 'Invalid Lesson Row ID.';
                        }
                    }
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                await deleteFAQ({ type: 1, lesson_row_id, faq_row_id })
                await deleteKeysByPattern('individual_lesson_*')
                res.json({ status: true, message: { alert_message: 'This FAQ details for this lesson have been deleted successfully.' } })
            }
        }
        catch (err) {
            console.log('Delete FAQ Details.', err.message)
            res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


module.exports = router