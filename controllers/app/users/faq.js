const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { arrangeValidation } = require('../../../utils/helpers/helper')
const { checkAllLoginToken } = require('../../../middleware/authorization')
const { deleteUserFAQ, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')
const professionals_faqM = require('../../../models/app/users/professionals_faqM')
const { deleteKeysByPattern, getCache, setCache } = require('../../../config/cache_helper')


router.post('/update_faq_details', [
    check('faq_question')
        .not().isEmpty().withMessage('The Faq Question field is required.'),
    check('faq_answer')
        .not().isEmpty().withMessage('The Faq Answer field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {

            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.body.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                    user_row_id = Number.parseInt(req.body.user_row_id)
                }
            }

            let faq_row_id = 0
            if (req.body.faq_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.faq_row_id))) {
                    const check_valid_faq_query = await professionals_faqM.findOne({ _id: Number.parseInt(req.body.faq_row_id), user_row_id: user_row_id })
                    if (check_valid_faq_query) {
                        faq_row_id = Number.parseInt(req.body.faq_row_id)
                    }
                    else {
                        errObj['alert_message'] = 'Sorry, Invalid FAQ Row ID.'
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
                    await professionals_faqM.updateOne({ _id: faq_row_id }, { $set: update_object })
                    await deleteKeysByPattern('user_faq_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    res.json({ status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } })
                }
                else {
                    update_object['user_row_id'] = user_row_id

                    await professionals_faqM(update_object).save()
                    await deleteKeysByPattern('user_faq_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await calculateUserProfileScore(user_row_id, ['faq'])

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

router.get('/list/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [1])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)

                let query = [{ user_row_id: user_row_id }]
                if (req.query.search) {
                    query.push({ faq_question: { $regex: sanitize(req.query.search), $options: 'i' } })
                }

                let search_query = { $and: query }
                const key = 'user_faq_list_' + user_row_id + '_' + (req.query.search || '') + '_' + skip + '_' + limit

                const cache_response = await getCache({ key })
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message.list,
                        count: cache_response.message.count,
                        cache_reponse_status: true
                    })
                }
                const get_query = await professionals_faqM.aggregate([
                    { $match: search_query },
                    { $sort: { _id: -1 } },
                    {
                        $project: {
                            _id: 1,
                            user_row_id: 1,
                            faq_question: 1,
                            faq_answer: 1
                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await professionals_faqM.countDocuments(search_query)
                await setCache({
                    key,
                    value: { list: get_query, count: count_query },
                    ttl: 1800
                })

                return res.json({
                    status: true,
                    message: get_query,
                    count: count_query,
                    cache_reponse_status: false
                })
                // res.json({status:true, message:get_query, count:count_query})
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
    const checkUserToken = await checkAllLoginToken(req.headers, [1])
    if (checkUserToken.status) {
        try {
            let user_row_id = 0
            let faq_row_id = 0

            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            if (Number.isNaN(Number.parseInt(req.params.faq_row_id))) {
                errObj['faq_row_id'] = 'The faq row id field must be contain valid number.'
            }
            else {
                faq_row_id = Number.parseInt(req.params.faq_row_id)
                const check_query = await professionals_faqM.findOne({ _id: faq_row_id, user_row_id: user_row_id })
                if (!check_query) {
                    errObj['faq_row_id'] = 'Invalid faq row id.'
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                await deleteUserFAQ({ type: 1, user_row_id, faq_row_id })
                await deleteKeysByPattern('user_faq_list_*')
                await deleteKeysByPattern('app_user_other_details_*')
                await calculateUserProfileScore(user_row_id, ['faq'])

                res.json({ status: true, message: { alert_message: 'This FAQ details for this user have been deleted successfully.' } })
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