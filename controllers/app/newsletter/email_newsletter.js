const express = require('express')
const router = express.Router()
const { validationResult } = require('express-validator')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { arrangeValidation, getPresentDateTime, getIntIdFromArray } = require('../../../utils/helpers/helper')
const subscribe_categoryM = require('../../../models/app/newsletter/subscribe_categoryM')
const email_newslettersM = require('../../../models/app/newsletter/email_newslettersM')

router.get('/list', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        let query = [{ active_status: 1 }]

        if (req.query.newsletter_row_id) {
            if (Array.isArray(req.query.newsletter_row_id)) {
                const newsletter_ids_array = await getIntIdFromArray(req.body.newsletter_row_id)
                if (newsletter_ids_array.length) {
                    query.push({ _id: { $in: newsletter_ids_array } })
                }
            }
        }

        if (!Number.isNaN(Number.parseInt(req.query.category_row_id))) {
            query.push({ news_cp_category_row_id: Number.parseInt(req.query.category_row_id) })
        }

        const get_query = await email_newslettersM.aggregate([
            { $sort: { _id: -1 } },
            {
                $lookup:
                {
                    from: "cln_static_news_notifications_categories",
                    localField: "category_row_id",
                    foreignField: "_id",
                    as: "info_category",
                    pipeline: [
                        {
                            $project:
                            {
                                news_cp_category_row_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_category", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_subscribe_to_categories",
                    localField: "_id",
                    foreignField: "category_row_id",
                    as: "info_subscribe_users",
                    pipeline: [
                        {
                            $match: { user_row_id: user_row_id }
                        },
                        {
                            $project: {
                                _id: 1,
                                subscribe_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_subscribe_users", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    news_cp_category_row_id: "$info_category.news_cp_category_row_id",
                    subscribe_status: { $cond: { if: "$info_subscribe_users.subscribe_status", then: "$info_subscribe_users.subscribe_status", else: 2 } }
                }
            },
            { $match: { $and: query } },
            {
                $project: {
                    _id: 1,
                    notification_type: 1,
                    day_number: 1,
                    title: 1,
                    subscribe_status: 1,
                    news_cp_category_row_id: 1,
                    category_row_id: 1
                }
            }
        ])

        const get_subscribed_status = await email_newslettersM.aggregate([
            {
                $match: { active_status: 1 }
            },
            {
                $lookup:
                {
                    from: "cln_static_news_notifications_categories",
                    localField: "category_row_id",
                    foreignField: "_id",
                    as: "info_category",
                    pipeline: [
                        {
                            $project:
                            {
                                news_cp_category_row_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_category", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_subscribe_to_categories",
                    localField: "_id",
                    foreignField: "category_row_id",
                    as: "info_subscribe_users",
                    pipeline: [
                        {
                            $match: { user_row_id: user_row_id, subscribe_status: 1 }
                        },
                        {
                            $project: {
                                _id: 1,
                                subscribe_status: 1
                            }
                        }
                    ]
                }
            },
            {
                $group: {
                    _id: "$category_row_id",
                    totalNewsletters: { $sum: 1 },
                    subscribedNewsletters: { $sum: { $size: "$info_subscribe_users" } },
                    news_cp_category_row_id: { $first: "$info_category.news_cp_category_row_id" }

                }
            },
            {
                $addFields: {
                    all_subscribed_status: {
                        $cond: {
                            if: { $eq: ["$totalNewsletters", "$subscribedNewsletters"] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    category_row_id: "$_id",
                    all_subscribed_status: 1,
                    news_cp_category_row_id: 1
                }
            },
            { $sort: { category_row_id: -1 } }
        ]);

        if (get_query.length > 0) {
            res.json({ status: true, message: get_query, get_subscribed_status: get_subscribed_status })
        }
        else {
            res.json({ status: false, message: get_query, get_subscribed_status: get_subscribed_status })
        }

    }
    catch (err) {
        console.log('categories list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


// 1:subscribed , 2:unsubscribed
router.get('/single_newsletter_category_details/:newsletter_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const newsletter_row_id = Number.parseInt(req.params.newsletter_row_id)
            if (!Number.isNaN(newsletter_row_id)) {
                let subscribe_status = 2
                const get_query = await subscribe_categoryM.findOne({ category_row_id: newsletter_row_id, user_row_id: user_row_id })
                if (get_query) {
                    if (get_query.subscribe_status) {
                        subscribe_status = get_query.subscribe_status
                    }
                }
                res.json({ status: true, message: { subscribe_status: subscribe_status } })
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
        console.log('categories list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/update_categories', async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            let categories = []
            if ((req.body.subscribed_categories) && (req.body.subscribed_categories.length > 0)) {
                let subscribed_categories = await getIntIdFromArray(req.body.subscribed_categories)
                if (subscribed_categories.length > 0) {
                    categories = subscribed_categories
                }
                else {
                    errObj['subscribed_categories'] = 'The update subscribers categories field is invalid'
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkToken.message
                const date_n_time = getPresentDateTime()
                if (categories.length) {
                    for (let run of categories) {
                        const category_row_id = Number.parseInt(run)
                        const check_category_query = await email_newslettersM.findOne({ _id: category_row_id, active_status: 1 })
                        if (check_category_query) {
                            const check_query = await subscribe_categoryM.findOne({ user_row_id: user_row_id, category_row_id: category_row_id }, { _id: 1, subscribe_status: 1 })
                            if (!check_query) {
                                const insert_array = {
                                    user_row_id: user_row_id,
                                    category_row_id: run,
                                    subscribe_status: 1,
                                    date_n_time: date_n_time
                                }

                                await subscribe_categoryM(insert_array).save()
                            }
                            else if (check_query.subscribe_status == 2) {
                                await subscribe_categoryM.updateOne({ user_row_id: user_row_id, category_row_id: category_row_id },
                                    {
                                        $set: { subscribe_status: 1 }
                                    })
                            }
                        }
                    }
                    await subscribe_categoryM.updateMany({ user_row_id: user_row_id, category_row_id: { $nin: categories } },
                        {
                            $set: {
                                subscribe_status: 2
                            }
                        })
                }
                else {
                    await subscribe_categoryM.updateMany({ user_row_id: user_row_id },
                        {
                            $set: {
                                subscribe_status: 2
                            }
                        })
                }

                res.json({ status: true, message: { categories: categories, alert_message: "The details for your selected newsletter category have been successfully submitted." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/subscribe_single_category/:subscribe_type/:newsletter_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)
            const subscribe_type = Number.parseInt(req.params.subscribe_type)
            const newsletter_row_id = Number.parseInt(req.params.newsletter_row_id)

            if (!Number.isNaN(newsletter_row_id)) {

                const check_email_newsletter_query = await email_newslettersM.findOne({ _id: newsletter_row_id })
                if (check_email_newsletter_query) {
                    if (subscribe_type == 1) {
                        const check_query = await subscribe_categoryM.findOne({ user_row_id: user_row_id, category_row_id: newsletter_row_id }, { _id: 1, subscribe_status: 1 })
                        if (!check_query) {
                            await subscribe_categoryM({
                                user_row_id: user_row_id,
                                category_row_id: newsletter_row_id,
                                subscribe_status: 1,
                                date_n_time: getPresentDateTime()
                            }).save()
                            //inserted_data: insert_query, 
                            res.json({ status: true, message: { alert_message: "Congratulations! You have successfully subscribed to this category." } })
                        }
                        else if (check_query.subscribe_status == 2) {
                            await subscribe_categoryM.updateOne({ user_row_id: user_row_id, category_row_id: newsletter_row_id },
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
                        const check_query = await subscribe_categoryM.findOne({ user_row_id: user_row_id, category_row_id: newsletter_row_id, subscribe_status: 1 }, { _id: 1 })
                        if (check_query) {
                            await subscribe_categoryM.updateOne({ user_row_id: user_row_id, category_row_id: newsletter_row_id }, {
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
        console.log('Unsubscribe single category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



module.exports = router