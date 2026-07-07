const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../middleware/authorization')
const notificationsM = require('../../../models/app/notifications/notificationsM')

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 500

            const get_query = notificationsM.aggregate([
                {
                    $match: {
                        user_row_id: -1
                    }
                },
                {
                    $sort: {
                        date_n_time: -1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            notify_type: '$notify_type',
                            notify_type_row_id: '$notify_type_row_id',
                            thread_type: '$thread_type'
                        },
                        as: "info_user",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$thread_type'] },
                                                    { $eq: [1, '$$notify_type'] },
                                                    { $eq: ['$_id', '$$notify_type_row_id'] }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals_profile_images",
                                    localField: "_id",
                                    foreignField: "user_row_id",
                                    as: "img_info"
                                }
                            },
                            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    profile_image: "$img_info.profile_image",
                                    login_status: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    approval_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_user", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        let: {
                            notify_type: '$notify_type',
                            notify_type_row_id: '$notify_type_row_id',
                            thread_type: '$thread_type'
                        },
                        as: "info_company",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$thread_type'] },
                                                    { $eq: [2, '$$notify_type'] },
                                                    { $eq: ['$_id', '$$notify_type_row_id'] }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                $project: {
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    company_logo: 1,
                                    website_link: 1,
                                    approval_status: 1,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_notifications_threads",
                        let: {
                            main_notify_type: '$notify_type',
                            main_notifications_id: '$_id',
                            thread_type: '$thread_type'
                        },
                        as: "info_threads",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$thread_type'] },
                                                    { $eq: ['$notify_type', '$$main_notify_type'] },
                                                    { $eq: ['$notification_row_id', '$$main_notifications_id'] }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                $sort: { _id: -1 }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    let: {
                                        inner_notify_type: '$notify_type',
                                        inner_notify_type_row_id: '$notify_type_row_id',
                                    },
                                    as: "info_inner_user",
                                    pipeline: [
                                        {
                                            $match: {
                                                $and: [
                                                    {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: [1, '$$inner_notify_type'] },
                                                                { $eq: ['$_id', '$$inner_notify_type_row_id'] }
                                                            ]
                                                        }
                                                    }
                                                ]
                                            }
                                        },
                                        {
                                            $lookup:
                                            {
                                                from: "cln_professionals_profile_images",
                                                localField: "_id",
                                                foreignField: "user_row_id",
                                                as: "img_info"
                                            }
                                        },
                                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                                        {
                                            $project: {
                                                profile_image: "$img_info.profile_image",
                                                login_status: 1,
                                                user_name: 1,
                                                full_name: 1,
                                                approval_status: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_inner_user", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_company_lists",
                                    let: {
                                        notify_type: '$notify_type',
                                        notify_type_row_id: '$notify_type_row_id',
                                        thread_type: '$thread_type'
                                    },
                                    as: "info_inner_company",
                                    pipeline: [
                                        {
                                            $match: {
                                                $and: [
                                                    {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: [2, '$$notify_type'] },
                                                                { $eq: ['$_id', '$$notify_type_row_id'] }
                                                            ]
                                                        }
                                                    }
                                                ]
                                            }
                                        },
                                        {
                                            $project: {
                                                company_name: 1,
                                                company_id: 1,
                                                company_email_id: 1,
                                                company_logo: 1,
                                                website_link: 1,
                                                approval_status: 1,
                                                active_status: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_inner_company", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    notify_type: 1,
                                    notify_type_row_id: 1,
                                    user_detail: "$info_inner_user",
                                    company_detail: "$info_inner_company"
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_notifications_messages",
                        localField: "message_row_id",
                        foreignField: "_id",
                        as: "info_message"
                    }
                },
                { $unwind: { path: "$info_message" } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        thread_type: 1,
                        notify_type: 1,
                        message_row_id: 1,
                        notify_type_row_id: 1,
                        view_status: 1,
                        notify_image: 1,
                        notify_name: 1,
                        notify_id: 1,
                        title: "$info_message.title",
                        notification_message: "$info_message.notification_message",
                        threads_list: "$info_threads",
                        company_detail: "$info_company",
                        user_detail: "$info_user",
                        date_n_time: 1
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = notificationsM.aggregate([
                {
                    $match: {
                        user_row_id: -1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_notifications_messages",
                        localField: "message_row_id",
                        foreignField: "_id",
                        as: "info_message"
                    }
                },
                { $unwind: { path: "$info_message" } },
                {
                    $count: 'count'
                }
            ])

            const [result1, result2] = await Promise.all([get_query, count_query])
            let count = 0
            if (result2[0]) {
                count = result2[0].count
            }

            res.json({ status: true, message: result1, count: count })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Notification list.', err)
        res.json({ status: false, message: err })
    }
})



router.get('/info', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (checkToken.status) {
            const user_row_id = -1

            const count_query = await notificationsM.aggregate([
                {
                    $match: {
                        user_row_id: user_row_id, view_status: 0
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_notifications_messages",
                        localField: "message_row_id",
                        foreignField: "_id",
                        as: "info_message"
                    }
                },
                { $unwind: { path: "$info_message" } },
                {
                    $count: "count"
                }
            ])

            let pending_count = 0
            if (count_query[0]) {
                pending_count = count_query[0].count
            }

            res.json({ status: true, message: { pending_count: pending_count } })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Notification messages list.', err)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/update_viewed_status', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (checkToken.status) {
            const user_row_id = -1

            await notificationsM.updateMany({ user_row_id: user_row_id, view_status: 0 }, {
                $set: {
                    view_status: 1
                }
            })

            res.json({ status: true, message: { alert_message: 'Notification viewed succesfully.' } })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
    }
})



module.exports = router