const express = require('express')
const router = express.Router()

const { checkUserLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const push_notificationM = require('../../../models/app/notifications/push_notificationM')
const push_notifications_sent_detailsM = require('../../../models/app/notifications/push_notifications_sent_detailsM')
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')

router.post('/save_n_update', [
    check('fcm_token')
        .trim().not().isEmpty().withMessage('The fcm token field is required.'),
    check('device_type')
        .trim().not().isEmpty().withMessage('The device type field is required.')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length > 0) {
        res.json({ status: false, message: errObj })
    }
    else {
        try {
            let user_row_id = 0
            const checkUserToken = checkUserLoginToken(req.headers)
            if (checkUserToken.status) {
                user_row_id = checkUserToken.message
            }
            const date_n_time = getPresentDateTime()
            const fcm_token = req.body.fcm_token

            let update_object = {}
            update_object['app_version'] = req.body.app_version
            update_object['app_installed_date'] = req.body.app_installed_date ? req.body.app_installed_date : null
            update_object['notification_status'] = 1
            update_object['updated_on'] = date_n_time

            const get_query = await push_notificationM.findOne({ fcm_token: fcm_token }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
            if (get_query) {
                await push_notificationM.updateOne({ _id: get_query._id }, { $set: update_object })

                res.json({ status: true, message: { alert_message: "New push notifications details has been updated successfully." } })
            }
            else {
                update_object['user_row_id'] = user_row_id
                update_object['device_type'] = req.body.device_type
                update_object['device_model'] = req.body.device_model
                update_object['platform'] = req.body.platform
                update_object['os_version'] = req.body.os_version
                update_object['country'] = req.body.country
                update_object['timezone'] = req.body.timezone
                update_object['fcm_token'] = fcm_token
                update_object['language'] = req.body.language
                update_object['date_n_time'] = date_n_time
                await push_notificationM(update_object).save()

                res.json({ status: true, message: { alert_message: "This push notifications details has been added successfully." } })
            }
        }
        catch (err) {
            console.log('Update profile basic details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
})

router.get('/individual_details/:fcm_token', async (req, res) => {
    try {
        let fcm_token = req.params.fcm_token
        const get_query = await push_notificationM.findOne({ fcm_token: fcm_token }).collation({ locale: 'en', strength: 2 })
        if (get_query) {
            res.json({ status: true, message: get_query })
        }
        else {
            res.json({ status: true, message: { alert_message: "Invalid fcm token" } })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router