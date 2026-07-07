const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { arrangeValidation } = require('../../utils/helpers/helper')
const { checkAllLoginToken } = require('../../middleware/authorization')
const { checkEventRowID, checkSubadminAccess, deleteFAQ } = require('../../utils/helpers/events_helper')

const event_faqM = require('../../models/app/events/event_faqM')
const eventM = require('../../models/app/events/eventM')
const { setCache, getCache, deleteKeysByPattern } = require('../../config/cache_helper')
const { calculateEventScore } = require('../../utils/helpers/app_helper')

router.post('/update_faq_details', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.')
        .isInt().withMessage('The Event Row ID field must be contains only integers.'),
    check('faq_question')
        .not().isEmpty().withMessage('The Faq Question field is required.'),
    check('faq_answer')
        .not().isEmpty().withMessage('The Faq Answer field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let event_row_id = 0
            if (!Number.isNaN(Number.parseFloat(req.body.event_row_id))) {
                event_row_id = Number.parseInt(req.body.event_row_id)

                const check_event_query = await eventM.findOne({ _id: event_row_id }, { _id: 1 })
                if (!check_event_query) {
                    errObj['event_row_id'] = 'Invalid event row id is supplied.'
                }

                const token_message = checkUserToken.token_message
                if (token_message.admin_row_id) {
                    const check_access = await checkSubadminAccess({
                        admin_row_id: Number.parseInt(token_message.admin_row_id),
                        admin_manager_type: token_message.admin_manager_type,
                        sub_admin_type: Number.parseInt(token_message.sub_admin_type),
                        event_row_id: event_row_id
                    })

                    if (!check_access.status) {
                        errObj['alert_message'] = check_access.message
                    }
                }

                let host_user_row_id = 0
                if (checkUserToken.message.user_type == 1) {
                    host_user_row_id = checkUserToken.message.user_row_id
                    // const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })
                    const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
                    if (!check_event_res) {
                        errObj['event_row_id'] = "Invalid Event Row ID."
                    }
                }
            }

            let faq_row_id = 0
            if (req.body.faq_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.faq_row_id))) {
                    const check_valid_faq_query = await event_faqM.findOne({ _id: Number.parseInt(req.body.faq_row_id), event_row_id: event_row_id })
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
                    await event_faqM.updateOne({ _id: faq_row_id }, { $set: update_object })
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('event_faq_list_*')

                    res.json({ status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } })
                }
                else {
                    update_object['event_row_id'] = req.body.event_row_id

                    await event_faqM(update_object).save()
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('event_faq_list_*')
                    await calculateEventScore(event_row_id, ['faq'])


                    res.json({ status: true, message: { alert_message: 'New FAQ details has been listed successfully.' }, })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Add new attendees.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/list/:event_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            let event_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.params.event_row_id))) {
                event_row_id = Number.parseInt(req.params.event_row_id)
            }
            else {
                errObj['event_row_id'] = 'The event row id field must be contain valid number.'
            }

            let host_user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                host_user_row_id = checkUserToken.message.user_row_id
            }

            if (event_row_id && host_user_row_id) {
                const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
                if (!check_event_res) {
                    errObj['event_row_id'] = "Invalid Event Row ID."
                }
            }

            if (Object.keys(errObj).length) {
                return res.json({ status: false, message: errObj })
            }

            const skip = Number.parseInt(req.params.skip)
            const limit = Number.parseInt(req.params.limit)

            let query = [{ event_row_id: event_row_id }]
            if (req.query.search) {
                query.push({ faq_question: { $regex: sanitize(req.query.search), $options: 'i' } })
            }

            let search_query = { $and: query }

            const key = `event_faq_list_${event_row_id}_${skip}_${limit}_${JSON.stringify(req.query)}`

            // 🔹 Check cache first
            const cache_response = await getCache(key)
            if (cache_response?.list && cache_response?.count !== undefined) {
                return res.json({
                    status: true,
                    message: cache_response.list,
                    count: cache_response.count,
                    cache_response_status: true
                })
            }

            const get_query = await event_faqM.aggregate([
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

            const count_query = await event_faqM.countDocuments(search_query)

            // 🔹 Save to cache
            await setCache({
                key,
                value: { list: get_query, count: count_query },
                ttl: 1800
            })

            // 🔹 Check cache first


            res.json({
                status: true,
                message: get_query,
                count: count_query,
                cache_response_status: false
            })
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
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            let host_user_row_id = 0
            let faq_row_id = 0
            let event_row_id = 0

            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                host_user_row_id = checkUserToken.message.user_row_id
            }

            if (Number.isNaN(Number.parseInt(req.params.faq_row_id))) {
                errObj['faq_row_id'] = 'The faq row id field must be contain valid number.'
            }
            else {
                faq_row_id = Number.parseInt(req.params.faq_row_id)
                const check_query = await event_faqM.findOne({ _id: faq_row_id })
                if (!check_query) {
                    errObj['faq_row_id'] = 'Invalid faq row id.'
                }
                else {
                    event_row_id = check_query.event_row_id
                    const token_message = checkUserToken.token_message
                    if (token_message.admin_row_id) {
                        const check_access = await checkSubadminAccess({
                            admin_row_id: Number.parseInt(token_message.admin_row_id),
                            admin_manager_type: token_message.admin_manager_type,
                            sub_admin_type: Number.parseInt(token_message.sub_admin_type),
                            event_row_id: event_row_id
                        })

                        if (!check_access.status) {
                            errObj['alert_message'] = check_access.message
                        }
                    }

                    if (event_row_id && host_user_row_id) {

                        const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
                        if (!check_event_res) {
                            errObj['event_row_id'] = "Invalid Event Row ID."
                        }
                    }
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                await deleteFAQ({ type: 1, event_row_id: event_row_id, faq_row_id: faq_row_id })

                await deleteKeysByPattern('event_faq_list_*')
                await deleteKeysByPattern('individual_event_*')
                await calculateEventScore(event_row_id, ['faq'])

                res.json({ status: true, message: { alert_message: 'This FAQ details for this event have been deleted successfully.' } })
            }
        }
        catch (err) {
            console.log('Delete attendee.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})

module.exports = router