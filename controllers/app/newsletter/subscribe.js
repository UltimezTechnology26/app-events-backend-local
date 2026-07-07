const express = require('express')
const router = express.Router()

const { checkUserLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const subscribe_categoryM = require('../../../models/app/newsletter/subscribe_categoryM')
const news_notifications_categoryM = require('../../../models/app/static/news_notifications_categoryM')

router.get('/subscribe_to_category/:subscribe_type/:category_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const subscribe_type = Number.parseInt(req.params.subscribe_type)
            const news_cp_category_row_id = Number.parseInt(req.params.category_row_id)

            if (!Number.isNaN(news_cp_category_row_id)) {

                const check_static_category_query = await news_notifications_categoryM.findOne({ news_cp_category_row_id: news_cp_category_row_id })
                if (check_static_category_query) {
                    const category_row_id = check_static_category_query._id
                    if (subscribe_type == 1) {
                        const check_query = await subscribe_categoryM.findOne({ user_row_id: user_row_id, category_row_id: category_row_id }, { _id: 1, subscribe_status: 1 })
                        if (!check_query) {
                            await subscribe_categoryM({
                                user_row_id: user_row_id,
                                category_row_id: category_row_id,
                                subscribe_status: 1,
                                date_n_time: getPresentDateTime()
                            }).save()


                            res.json({ status: true, message: { alert_message: "Congratulations! You have successfully subscribed to this category." } })
                        }
                        else if (check_query.subscribe_status == 2) {
                            await subscribe_categoryM.updateOne({ user_row_id: user_row_id, category_row_id: category_row_id },
                                {
                                    $set: { subscribe_status: 1 }
                                })
                            res.json({ status: true, message: { alert_message: "Congratulations! You have successfully subscribed to this category." } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: "Sorry, Your already subscribed to this category." } })
                        }
                    }
                    else if (subscribe_type == 2) {
                        const check_query = await subscribe_categoryM.findOne({ user_row_id: user_row_id, category_row_id: category_row_id, subscribe_status: 1 }, { _id: 1 })
                        if (check_query) {
                            await subscribe_categoryM.updateOne({ user_row_id: user_row_id, category_row_id: category_row_id }, {
                                $set: { subscribe_status: 2 }
                            })

                            res.json({ status: true, message: { alert_message: "Congratulations! You have successfully unsubscribed from this category." } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: "Sorry, you are not subscribed to this category, and therefore cannot unsubscribe from it." } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { subscribe_type: "The subscribe type field must be contain values 1 or 2." } })
                    }
                }
                else {
                    res.json({ status: false, message: { category_row_id: "The category row id field is invalid." } })
                }
            }
            else {
                res.json({ status: false, message: { category_row_id: "The category row id field is invalid." } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Subscribe to category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/subscribe_details/:news_cp_category_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const news_cp_category_row_id = Number.parseInt(req.params.news_cp_category_row_id)
            if (!Number.isNaN(news_cp_category_row_id)) {
                const check_static_category_query = await news_notifications_categoryM.findOne({ news_cp_category_row_id: news_cp_category_row_id })
                if (check_static_category_query) {
                    const category_row_id = check_static_category_query._id
                    let result = {}
                    result['category_subscribe_status'] = false
                    const get_query = await subscribe_categoryM.findOne({ user_row_id: user_row_id, category_row_id: category_row_id }, { _id: 1, subscribe_status: 1 })
                    if (get_query) {
                        if (get_query.subscribe_status == 1) {
                            result['category_subscribe_status'] = true
                        }
                    }

                    res.json({ status: true, message: result })
                }
                else {
                    res.json({ status: false, message: { category_row_id: "The category row id field is invalid." } })
                }
            }
            else {
                res.json({ status: false, message: { category_row_id: "The category row id field is invalid." } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Subscribe details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router