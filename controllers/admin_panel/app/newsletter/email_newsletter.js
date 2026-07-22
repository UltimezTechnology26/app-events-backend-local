const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, addDaysToPresentDate } = require('../../../../utils/helpers/helper')
const { getNextScheduledWeekDay, getNextScheduledMonthDay } = require('../../../../utils/helpers/newsletter_helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const subscribe_categoryM = require('../../../../models/app/newsletter/subscribe_categoryM')
const news_notifications_categoryM = require('../../../../models/app/static/news_notifications_categoryM')
const email_newslettersM = require('../../../../models/app/newsletter/email_newslettersM')
const email_newsletters_sent_usersM = require('../../../../models/app/newsletter/email_newsletters_sent_usersM')
const email_newsletters_sent_reportsM = require('../../../../models/app/newsletter/email_newsletters_sent_reportsM')
const { sendAcademyEmail } = require('../../../../config/email')
const { getPositionResolutionStages } = require('../../../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../../modules/funding/funding.queries')


router.post('/update_save_details', [
    check('notification_type')
        .trim().not().isEmpty().withMessage('The Notification type field is required.')
        .isInt({ min: 1, max: 3 }).withMessage('The Notification type field must be contain ranges 1 to 3.'),
    check('title')
        .trim().not().isEmpty().withMessage('The Title field is required.')
        .isLength({ min: 4 }).withMessage('The Title field must be at least 4 characters.')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkAdminToken = checkAdminLoginToken(req.headers, [7])
    if (checkAdminToken.status) {
        try {
            let admin_row_id = 0
            const check_token_message = checkAdminToken.message
            if (check_token_message.admin_manager_type === 2) {
                admin_row_id = check_token_message.admin_row_id
            }

            let newsletter_row_id = 0
            if (req.body.newsletter_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.newsletter_row_id))) {
                    newsletter_row_id = Number.parseInt(req.body.newsletter_row_id)
                }
            }


            let category_row_id = 0
            if (req.body.category_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.category_row_id))) {
                    category_row_id = Number.parseInt(req.body.category_row_id)

                    const check_category_query = await news_notifications_categoryM.findOne({ _id: category_row_id })
                    if (!check_category_query) {
                        errObj['category_row_id'] = "Sorry, Invalid category row id."
                    }
                }
            }

            let notification_type = 0
            let day_number = 0
            if (req.body.notification_type) {
                notification_type = Number.parseInt(req.body.notification_type)
                const check_in_array = [2, 3]
                if (check_in_array.includes(notification_type)) {
                    if (!req.body.day_number) {
                        errObj['day_number'] = "The day number field is required."
                    }
                    else if (!Number.isNaN(Number.parseInt(req.body.day_number))) {
                        day_number = Number.parseInt(req.body.day_number)
                    }
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                const insert_array = {}
                const date_n_time = getPresentDateTime()

                insert_array['category_row_id'] = category_row_id
                insert_array['notification_type'] = Number.parseInt(req.body.notification_type)
                insert_array['day_number'] = day_number
                insert_array['title'] = req.body.title
                insert_array['description'] = req.body.description
                insert_array['update_on'] = date_n_time

                if (!newsletter_row_id) {
                    insert_array['sub_admin_row_id'] = admin_row_id
                    insert_array['active_status'] = 1
                    insert_array['created_on'] = date_n_time

                    const insert_query = await email_newslettersM(insert_array).save()
                    const insert_newsletter_row_id = insert_query._id

                    res.json({
                        status: true, message: {
                            newsletter_row_id: insert_newsletter_row_id,
                            alert_message: 'Your email newsletter details has been inserted successfully.'
                        }
                    })
                }
                else {
                    await email_newslettersM.updateOne({ _id: newsletter_row_id }, { $set: insert_array })

                    res.json({
                        status: true, message: {
                            alert_message: 'This email newsletter details has been updated successfully.'
                        }
                    })
                }

            }

        }
        catch (err) {
            console.log('Email newsletter save details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
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
                                { title: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }

            if (!Number.isNaN(Number.parseInt(req.query.notification_type))) {
                query.push({ notification_type: Number.parseInt(req.query.notification_type) })
            }

            if (!Number.isNaN(Number.parseInt(req.query.active_status))) {
                let active_status = Number.parseInt(req.query.active_status)
                if (active_status === 2) {
                    active_status = 0
                }

                query.push({ active_status: active_status })
            }

            const get_query = await email_newslettersM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_subscribe_to_categories",
                        localField: "_id",
                        foreignField: "category_row_id",
                        as: "info_subscribe_users",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "info_users",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: 1
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_users" } },
                            {
                                $match: {
                                    subscribe_status: 1
                                }
                            },
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_subscribe_users", preserveNullAndEmptyArrays: true } },
                { $match: { $and: query } },
                {
                    $project: {
                        _id: 1,
                        notification_type: 1,
                        day_number: 1,
                        title: 1,
                        active_status: 1,
                        created_on: 1,
                        update_on: 1,
                        pause_on: 1,
                        pause_type: 1,
                        pause_reason: 1,
                        total_subscribers: "$info_subscribe_users.count"
                    }
                }
            ]).skip(skip).limit(limit)


            const counts_query = await email_newslettersM.aggregate([
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



router.get('/individual_details/:newsletter_row_id', async (req, res) => {
    const newsletter_row_id = Number.parseInt(req.params.newsletter_row_id)
    if (!Number.isNaN(newsletter_row_id)) {
        try {
            const checkAdminToken = checkAdminLoginToken(req.headers, [7])
            if (checkAdminToken.status) {
                const get_query = await email_newslettersM.aggregate([
                    {
                        $match:
                        {
                            _id: newsletter_row_id
                        }
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
                                        category_name: 1
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
                                    $lookup:
                                    {
                                        from: "cln_professionals",
                                        localField: "user_row_id",
                                        foreignField: "_id",
                                        as: "info_users",
                                        pipeline: [
                                            {
                                                $match: {
                                                    login_status: 1
                                                }
                                            },
                                            {
                                                $project: {
                                                    _id: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_users" } },
                                {
                                    $match: {
                                        subscribe_status: 1
                                    }
                                },
                                {
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_subscribe_users", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_subscribe_to_categories",
                            localField: "_id",
                            foreignField: "category_row_id",
                            as: "info_unsubscribe_users",
                            pipeline: [
                                {
                                    $lookup:
                                    {
                                        from: "cln_professionals",
                                        localField: "user_row_id",
                                        foreignField: "_id",
                                        as: "info_users",
                                        pipeline: [
                                            {
                                                $match: {
                                                    login_status: 1
                                                }
                                            },
                                            {
                                                $project: {
                                                    _id: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_users" } },
                                {
                                    $match: {
                                        subscribe_status: 2
                                    }
                                },
                                {
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_unsubscribe_users", preserveNullAndEmptyArrays: true } },
                    {
                        $project:
                        {
                            _id: 1,
                            category_row_id: 1,
                            notification_type: 1,
                            day_number: 1,
                            title: 1,
                            description: 1,
                            active_status: 1,
                            created_on: 1,
                            update_on: 1,
                            pause_on: 1,
                            pause_type: 1,
                            pause_reason: 1,
                            sub_admin_row_id: 1,
                            total_unsubscribers: "$info_unsubscribe_users.count",
                            total_subscribers: "$info_subscribe_users.count",
                            category_name: "$info_category.category_name"
                        }
                    }
                ]).limit(1)

                let result = {}
                if (get_query[0]) {
                    result['category_row_id'] = get_query[0].category_row_id
                    result['notification_type'] = get_query[0].notification_type
                    result['day_number'] = get_query[0].day_number
                    result['title'] = get_query[0].title
                    result['description'] = get_query[0].description
                    result['active_status'] = get_query[0].active_status
                    result['created_on'] = get_query[0].created_on
                    result['update_on'] = get_query[0].update_on
                    result['pause_on'] = get_query[0].pause_on
                    result['pause_type'] = get_query[0].pause_type
                    result['pause_reason'] = get_query[0].pause_reason
                    result['sub_admin_row_id'] = get_query[0].sub_admin_row_id
                    result['category_name'] = get_query[0].category_name
                    result['total_unsubscribers'] = get_query[0].total_unsubscribers
                    result['total_subscribers'] = get_query[0].total_subscribers

                    result['total_sent_reports'] = await email_newsletters_sent_reportsM.countDocuments({ newsletter_row_id: get_query[0]._id })

                    const last_sent_query = await email_newsletters_sent_reportsM.find({ newsletter_row_id: get_query[0]._id }, { created_on: 1 }).sort({ _id: -1 }).limit(1)
                    if (last_sent_query) {
                        if (last_sent_query[0]) {
                            if (last_sent_query[0].created_on) {
                                result['last_sent_date_n_time'] = last_sent_query[0].created_on
                            }
                        }
                    }

                    let day_number = get_query[0].day_number
                    if (get_query[0].notification_type === 1) {
                        result['next_scheduled_date'] = addDaysToPresentDate(1)
                    }
                    else if (get_query[0].notification_type === 2) {
                        if (day_number) {
                            day_number = day_number - 1
                        }
                        result['next_scheduled_date'] = getNextScheduledWeekDay(day_number)
                    }
                    else if (get_query[0].notification_type === 3) {
                        result['next_scheduled_date'] = getNextScheduledMonthDay(day_number)
                    }

                    res.json({ status: true, message: result })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid Newsletter row id." } })
                }
            }
            else {
                res.json(checkAdminToken)
            }

        }
        catch (err) {
            console.log('Email newsletter individual details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json({ status: false, message: { alert_message: "Sorry, Invalid Newsletter row id." } })
    }
})


router.post('/disable_newsletter', [
    check('newsletter_row_id')
        .not().isEmpty().withMessage('The Newsletter Row ID field is required.'),
    check('pause_type')
        .trim().not().isEmpty().withMessage('The pause type field required.')
        .isInt().withMessage('The pause type field must be contain integer number.'),
    check('pause_reason')
        .trim().not().isEmpty().withMessage('The pause reason field is required.')
        .isLength({ min: 4 }).withMessage('The pause reason field must be at least 4 characters.')
], async (req, res) => {

    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkAdminToken = checkAdminLoginToken(req.headers, [7])
    if (checkAdminToken.status) {
        try {
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                const present_date_n_time = getPresentDateTime()
                const newsletter_row_id = Number.parseInt(req.body.newsletter_row_id)
                const check_query = await email_newslettersM.findOne({ _id: newsletter_row_id, active_status: 1 })
                if (check_query) {
                    await email_newslettersM.updateOne({ _id: newsletter_row_id, active_status: 1 },
                        {
                            $set: {
                                active_status: 0,
                                pause_on: present_date_n_time,
                                pause_type: Number.parseInt(req.body.pause_type),
                                pause_reason: req.body.pause_reason
                            }
                        })

                    res.json({ status: true, message: { alert_message: "This Newsletter details has been paused successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Newsletter Id or it is disabled." } })
                }

            }

        }
        catch (err) {
            console.log('Disable newsletter.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


router.get('/enable_newsletter/:newsletter_row_id', async (req, res) => {
    try {
        const newsletter_row_id = Number.parseInt(req.params.newsletter_row_id)
        if (!Number.isNaN(newsletter_row_id)) {
            const checkAdminToken = checkAdminLoginToken(req.headers, [7])
            if (checkAdminToken.status) {
                const check_query = await email_newslettersM.findOne({ _id: newsletter_row_id, active_status: 0 })
                if (check_query) {
                    await email_newslettersM.updateOne({ _id: newsletter_row_id, active_status: 0 }, { $set: { active_status: 1 } })

                    res.json({ status: true, message: { alert_message: "This Newsletter details has been enabled successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Newsletter Row ID or it is enabled" } })
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
        console.log('Enable newsletter.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/delete_newsletter/:newsletter_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [4])
    if (checkAdminToken.status) {
        try {
            const newsletter_row_id = Number.parseInt(req.params.newsletter_row_id)
            if (!Number.isNaN(newsletter_row_id)) {
                const get_query = await email_newslettersM.findOne({ _id: newsletter_row_id })
                if (get_query) {
                    const check_user_subscribed_query = await subscribe_categoryM.findOne({ category_row_id: newsletter_row_id })
                    if (!check_user_subscribed_query) {
                        await email_newslettersM.deleteOne({ _id: newsletter_row_id })

                        res.json({ status: true, message: { alert_message: 'This Newsletter details has been deleted successfully.' } })
                    }
                    else {
                        res.json({ status: true, message: { alert_message: 'This newsletter contain subscribed users.' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Row Newsletter ID' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Invalid Newsletter Row ID" } })
            }

        }
        catch (err) {
            console.log('Delete newsletter.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


router.get('/users_list/:category_row_id/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const category_row_id = Number.parseInt(req.params.category_row_id)

            let query = [{}]
            if (req.query.search) {
                query.push({
                    $and: [
                        {
                            $or: [
                                { user_name: { '$regex': req.query.search, $options: 'i' } },
                                { full_name: { '$regex': req.query.search, $options: 'i' } },
                                { email_id: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }

            const get_query = await subscribe_categoryM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { category_row_id: category_row_id, subscribe_status: 1 }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "info_users",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals_profile_images",
                                    localField: "_id",
                                    foreignField: "user_row_id",
                                    as: "info_image"
                                }
                            },
                            { $unwind: { path: "$info_image", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "info_country"
                                }
                            },
                            { $unwind: { path: "$info_country", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    mobile_number: 1,
                                    email_id: 1,
                                    country_name: "$info_country.country_name",
                                    country_flag: "$info_country.country_flag",
                                    profile_image: "$info_image.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_users" } },
                {
                    $set: {
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        email_id: "$info_users.email_id"
                    }
                },
                {
                    $match: { $and: query }
                },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },
                            ...getPositionResolutionStages(),
                            { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
                            { $limit: 1 },
                            {
                                $lookup: {
                                    from: "cln_company_lists",
                                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                    as: "info_company",
                                    pipeline: [
                                        { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                        { $project: { _id: 1, company_name: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_company_manual_retrievals",
                                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                    as: "info_manual_company",
                                    pipeline: [
                                        { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                        { $project: { _id: 1, company_name: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    position_name: '$resolved_position_name',
                                    positions: 1,
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                                }
                            }
                        ],
                        as: "info_work"
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project:
                    {
                        _id: 1,
                        user_row_id: 1,
                        date_n_time: 1,
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        mobile_number: "$info_users.mobile_number",
                        email_id: "$info_users.email_id",
                        country_name: "$info_users.country_name",
                        country_flag: "$info_users.country_flag",
                        profile_image: "$info_users.profile_image",
                        position_name: "$info_work.position_name",
                        positions: "$info_work.positions",
                        company_name: "$info_work.company_name"
                    }
                }
            ]).skip(skip).limit(limit)

            const counts_query = await subscribe_categoryM.aggregate([
                {
                    $match: { category_row_id: category_row_id, subscribe_status: 1 }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "info_users",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    email_id: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_users" } },
                {
                    $set: {
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        email_id: "$info_users.email_id"
                    }
                },
                {
                    $match: { $and: query }
                },
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
            console.log('Email newsletter users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})




router.get('/sent_reports_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{}]
            if (req.query.search) {
                query.push({
                    $and: [
                        {
                            $or: [
                                { title: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }

            if (!Number.isNaN(Number.parseInt(req.query.notification_type))) {
                query.push({ notification_type: Number.parseInt(req.query.notification_type) })
            }


            const get_query = await email_newsletters_sent_reportsM.aggregate([
                { $sort: { _id: -1 } },

                {
                    $lookup:
                    {
                        from: "cln_email_newsletters",
                        localField: "newsletter_row_id",
                        foreignField: "_id",
                        as: "info_newsletter",
                        pipeline: [

                            {
                                $project:
                                {
                                    category_row_id: 1,
                                    notification_type: 1,
                                    day_number: 1,
                                    title: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_newsletter" } },
                {
                    $lookup:
                    {
                        from: "cln_email_newsletters_sent_professionals",
                        localField: "_id",
                        foreignField: "sent_report_row_id",
                        as: "info_sent_users",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "info_users",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: 1
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_users" } },
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_sent_users", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        notification_type: "$info_newsletter.notification_type",
                        title: "$info_newsletter.title",
                    }
                },
                {
                    $match: { $and: query }
                },
                {
                    $project:
                    {
                        _id: 1,
                        newsletter_row_id: 1,
                        notification_type: 1,
                        title: 1,
                        day_number: "$info_newsletter.day_number",
                        category_name: "$info_newsletter.category_name",
                        total_subscribers: "$info_sent_users.count",
                        created_on: 1
                    }
                }
            ]).skip(skip).limit(limit)


            const counts_query = await email_newsletters_sent_reportsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_email_newsletters",
                        localField: "newsletter_row_id",
                        foreignField: "_id",
                        as: "info_newsletter",
                        pipeline: [
                            {
                                $project:
                                {
                                    _id: 1,
                                    category_row_id: 1,
                                    notification_type: 1,
                                    title: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_newsletter" } },
                {
                    $set: {
                        category_row_id: "$info_newsletter.category_row_id",
                        notification_type: "$info_newsletter.notification_type",
                        title: "$info_newsletter.title",
                    }
                },
                {
                    $match: { $and: query }
                },
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
            console.log('Email newsletter sent reports list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/sent_report_individual_details/:sent_report_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const sent_report_row_id = Number.parseInt(req.params.sent_report_row_id)

            const get_query = await email_newsletters_sent_reportsM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_email_newsletters",
                        localField: "newsletter_row_id",
                        foreignField: "_id",
                        as: "info_newsletter",
                        pipeline: [
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
                                                category_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_category", preserveNullAndEmptyArrays: true } },
                            {
                                $project:
                                {
                                    category_row_id: 1,
                                    notification_type: 1,
                                    day_number: 1,
                                    title: 1,
                                    category_name: "$info_category.category_name"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_newsletter" } },
                {
                    $lookup:
                    {
                        from: "cln_email_newsletters_sent_professionals",
                        localField: "_id",
                        foreignField: "sent_report_row_id",
                        as: "info_sent_users",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "info_users",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: 1
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_users" } },
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_sent_users", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        category_row_id: "$info_newsletter.category_row_id",
                        notification_type: "$info_newsletter.notification_type",
                        title: "$info_newsletter.title",
                    }
                },
                {
                    $match: { _id: sent_report_row_id }
                },
                {
                    $project:
                    {
                        _id: 1,
                        newsletter_row_id: 1,
                        category_row_id: 1,
                        notification_type: 1,
                        title: 1,
                        day_number: "$info_newsletter.day_number",
                        category_name: "$info_newsletter.category_name",
                        total_subscribers: "$info_sent_users.count",
                        created_on: 1
                    }
                }
            ]).limit(1)

            if (get_query[0]) {
                res.json({ status: true, message: get_query[0] })
            }
            else {
                res.json({ status: true, message: { alert_message: "Invalid sent report row id." } })
            }
        }
        catch (err) {
            console.log('Email newsletter sent reports individual details .', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/sent_report_users_list/:sent_report_row_id/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const sent_report_row_id = Number.parseInt(req.params.sent_report_row_id)


            let query = [{}]

            if (req.query.search) {
                query.push({
                    $and: [
                        {
                            $or: [
                                { user_name: { '$regex': req.query.search, $options: 'i' } },
                                { full_name: { '$regex': req.query.search, $options: 'i' } },
                                { email_id: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }

            const get_query = await email_newsletters_sent_usersM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: {
                        sent_report_row_id: sent_report_row_id
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "info_users",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals_profile_images",
                                    localField: "_id",
                                    foreignField: "user_row_id",
                                    as: "info_image"
                                }
                            },
                            { $unwind: { path: "$info_image", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "info_country"
                                }
                            },
                            { $unwind: { path: "$info_country", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    mobile_number: 1,
                                    email_id: 1,
                                    country_name: "$info_country.country_name",
                                    country_flag: "$info_country.country_flag",
                                    profile_image: "$info_image.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_users" } },
                {
                    $set: {
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        email_id: "$info_users.email_id"
                    }
                },
                {
                    $match: { $and: query }
                },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },
                            ...getPositionResolutionStages(),
                            { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
                            { $limit: 1 },
                            {
                                $lookup: {
                                    from: "cln_company_lists",
                                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                    as: "info_company",
                                    pipeline: [
                                        { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                        { $project: { _id: 1, company_name: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_company_manual_retrievals",
                                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                    as: "info_manual_company",
                                    pipeline: [
                                        { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                        { $project: { _id: 1, company_name: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    position_name: '$resolved_position_name',
                                    positions: 1,
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                                }
                            }
                        ],
                        as: "info_work"
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project:
                    {
                        _id: 1,
                        user_row_id: 1,
                        date_n_time: 1,
                        full_name: 1,
                        user_name: 1,
                        email_id: 1,
                        country_name: "$info_users.country_name",
                        country_flag: "$info_users.country_flag",
                        profile_image: "$info_users.profile_image",
                        position_name: "$info_work.position_name",
                        positions: "$info_work.positions",
                        company_name: "$info_work.company_name"
                    }
                }
            ]).skip(skip).limit(limit)


            const counts_query = await email_newsletters_sent_usersM.aggregate([
                {
                    $match: {
                        sent_report_row_id: sent_report_row_id
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "info_users",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    mobile_number: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_users" } },
                {
                    $set: {
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        email_id: "$info_users.email_id"
                    }
                },
                {
                    $match: { $and: query }
                },
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
            console.log('Email newsletter sent reports users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/scheduled_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{ total_subscribers: { $gte: 1 } }]
            if (req.query.search) {
                query.push({
                    $and: [
                        {
                            $or: [
                                { title: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }

            if (!Number.isNaN(Number.parseInt(req.query.notification_type))) {
                query.push({ notification_type: Number.parseInt(req.query.notification_type) })
            }


            const get_query = await email_newslettersM.aggregate([
                {
                    $match: {
                        active_status: 1
                    }
                },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_email_newsletters_sent_reports",
                        localField: "_id",
                        foreignField: "newsletter_row_id",
                        as: "info_sent_reports",
                        pipeline: [
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $limit: 1
                            },
                            {
                                $project:
                                {
                                    created_on: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_sent_reports", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_subscribe_to_categories",
                        localField: "_id",
                        foreignField: "category_row_id",
                        as: "info_subscribe_users",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "info_users",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: 1
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_users" } },
                            {
                                $match: {
                                    subscribe_status: 1
                                }
                            },
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_subscribe_users", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        total_subscribers: "$info_subscribe_users.count"
                    }
                },
                { $match: { $and: query } },
                {
                    $project: {
                        _id: 1,
                        category_row_id: 1,
                        notification_type: 1,
                        day_number: 1,
                        title: 1,
                        created_on: 1,
                        update_on: 1,
                        total_subscribers: 1,
                        last_sent_date: "$info_sent_reports.created_on"
                    }
                }
            ]).skip(skip).limit(limit)


            let result = []
            if (get_query[0]) {
                for (let run of get_query) {
                    let day_number = run.day_number
                    let next_scheduled_date = ""
                    if (run.notification_type === 1) {
                        next_scheduled_date = addDaysToPresentDate(1)
                    }
                    else if (run.notification_type === 2) {
                        if (day_number) {
                            day_number = day_number - 1
                        }
                        next_scheduled_date = getNextScheduledWeekDay(day_number)
                    }
                    else if (run.notification_type === 3) {
                        next_scheduled_date = getNextScheduledMonthDay(day_number)
                    }

                    let create_obj = {
                        _id: run._id,
                        category_row_id: run.category_row_id,
                        category_name: run.category_name,
                        notification_type: run.notification_type,
                        day_number: run.day_number,
                        title: run.title,
                        total_subscribers: run.total_subscribers,
                        last_sent_date: run.last_sent_date,
                        next_scheduled_date: next_scheduled_date
                    }

                    result.push(create_obj)
                }
            }

            const counts_query = await email_newslettersM.aggregate([
                {
                    $match: {
                        active_status: 1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_subscribe_to_categories",
                        localField: "_id",
                        foreignField: "category_row_id",
                        as: "info_subscribe_users",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "info_users",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: 1
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_users" } },
                            {
                                $match: {
                                    subscribe_status: 1
                                }
                            },
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_subscribe_users", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        total_subscribers: "$info_subscribe_users.count"
                    }
                },
                { $match: { $and: query } },
                {
                    $count: "count"
                },
            ])

            let count = 0
            if (counts_query[0]) {
                count = counts_query[0].count
            }


            res.json({ status: true, message: result, count: count })
        }
        catch (err) {
            console.log('Email newsletter scheduled list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



module.exports = router