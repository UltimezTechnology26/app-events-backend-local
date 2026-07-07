const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const push_notificationM = require('../../../../models/app/notifications/push_notificationM')
const push_notifications_sent_detailsM = require('../../../../models/app/notifications/push_notifications_sent_detailsM')
const { getPresentDateTime, arrangeValidation, addDaysToPresentDate } = require('../../../../utils/helpers/helper')
const { getNextScheduledWeekDay, getNextScheduledMonthDay } = require('../../../../utils/helpers/newsletter_helper')


router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [-1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = [{}]
            if (req.query.search) {
                query.push({
                    $and: [
                        {
                            $or: [
                                { timezone: { '$regex': req.query.search, $options: 'i' } },
                                { country: { '$regex': req.query.search, $options: 'i' } },
                                { platform: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }

            if (!Number.isNaN(Number.parseInt(req.query.notification_status))) {
                query.push({ notification_status: Number.parseInt(req.query.notification_status) })
            }

            if (!Number.isNaN(Number.parseInt(req.query.device_type))) {
                query.push({ device_type: Number.parseInt(req.query.device_type) })
            }


            if (!Number.isNaN(Number.parseInt(req.query.active_status))) {
                let active_status = Number.parseInt(req.query.active_status)
                if (active_status === 2) {
                    active_status = 0
                }

                query.push({ active_status: active_status })
            }

            const get_query = await push_notificationM.aggregate([
                { $match: { $and: query } },
                { $sort: { _id: -1 } },
                {
                    $project: {
                        _id: 1,
                        device_type: 1,
                        device_id: 1,
                        os_version: 1,
                        device_model: 1,
                        app_version: 1,
                        platform: 1,
                        app_installed_date: 1,
                        fcm_token: 1,
                        timezone: 1,
                        notification_status: 1,
                        country: 1,
                        language: 1,
                        updated_on: 1,
                        date_n_time: 1
                    }
                }
            ]).skip(skip).limit(limit).collation({ locale: 'en', strength: 2 })


            const counts_query = await push_notificationM.aggregate([
                { $match: { $and: query } },
                {
                    $count: "count"
                }
            ])

            let count = 0
            if (counts_query[0]) {
                count = counts_query[0].count
            }

            res.json({ status: true, message: get_query, count: count })
        }
        catch (err) {
            console.log('Email newsletter list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/individual_details/:request_row_id', async (req, res) => {
    const request_row_id = Number.parseInt(req.params.request_row_id)
    if (!Number.isNaN(request_row_id)) {
        try {
            const checkAdminToken = checkAdminLoginToken(req.headers, [-1])
            if (checkAdminToken.status) {
                const get_query = await push_notificationM.aggregate([
                    { $match: { _id: request_row_id } },
                    { $sort: { _id: -1 } },
                    {
                        $project: {
                            _id: 1,
                            device_type: 1,
                            device_id: 1,
                            os_version: 1,
                            device_model: 1,
                            app_version: 1,
                            platform: 1,
                            app_installed_date: 1,
                            fcm_token: 1,
                            timezone: 1,
                            notification_status: 1,
                            country: 1,
                            language: 1,
                            updated_on: 1,
                            date_n_time: 1
                        }
                    }
                ]).limit(1)


                if (get_query[0]) {

                    res.json({ status: true, message: get_query[0] })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid push notification device row id." } })
                }
            }
            else {
                res.json(checkAdminToken)
            }
        }
        catch (err) {
            console.log('Email newsletter individual details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json({ status: false, message: { alert_message: "Sorry, Invalid Newsletter row id." } })
    }
})



router.get('/enable_notification/:request_row_id', async (req, res) => {
    try {
        const request_row_id = Number.parseInt(req.params.request_row_id)
        if (!Number.isNaN(request_row_id)) {
            const checkAdminToken = checkAdminLoginToken(req.headers, [-1])
            if (checkAdminToken.status) {
                const check_query = await push_notificationM.findOne({ _id: request_row_id, notification_status: 0 })
                if (check_query) {
                    await push_notificationM.updateOne({ _id: request_row_id, notification_status: 0 }, { $set: { notification_status: 1 } })

                    res.json({ status: true, message: { alert_message: "This Device push notification details has been enabled successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Device push notification Row ID or it is enabled" } })
                }
            }
            else {
                res.json(checkAdminToken)
            }
        }
        else {
            res.json({ status: false, message: { alert_message: "Sorry, Invalid Newsletter row id." } })
        }

    }
    catch (err) {
        console.log('Enable notification.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_notification/:request_row_id', async (req, res) => {
    try {
        const request_row_id = Number.parseInt(req.params.request_row_id)
        if (!Number.isNaN(request_row_id)) {
            const checkAdminToken = checkAdminLoginToken(req.headers, [-1])
            if (checkAdminToken.status) {
                const check_query = await push_notificationM.findOne({ _id: request_row_id, notification_status: 1 })
                if (check_query) {
                    await push_notificationM.updateOne({ _id: request_row_id, notification_status: 1 }, { $set: { notification_status: 0 } })

                    res.json({ status: true, message: { alert_message: "This Device push notification details has been disabled successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Device push notification Row ID or it is disabled" } })
                }
            }
            else {
                res.json(checkAdminToken)
            }
        }
        else {
            res.json({ status: false, message: { alert_message: "Sorry, Invalid Newsletter row id." } })
        }

    }
    catch (err) {
        console.log('Enable notification.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})



module.exports = router