const express = require('express')
const router = express.Router()

const { checkUserLoginToken } = require('../../middleware/authorization')
const { daysMinusFromPresentTime, getPresentDateTime, arrayUniqueValues } = require('../../utils/helpers/helper')
const { getTokenList, arrangeNotificationsResult, getNotificationsStartRowID } = require('../../utils/helpers/notification_helper')

const notificationsM = require('../../models/app/notifications/notificationsM')
const notifications_messagesM = require('../../models/app/notifications/notifications_messagesM')
const notifications_globalsM = require('../../models/app/notifications/notifications_globalsM')
const { listNotificationService } = require('../../services/app/notifications')


router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 500
            const user_row_id = checkUserToken.message

            const result = await listNotificationService(user_row_id, skip, limit)

            res.json({ status: result.status, message: result.message.data, count: result.message.count })
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Notification list.', err)
        res.json({ status: false, message: { alert_message: err } })
    }
})



router.get('/info', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const start_notification_row_id = await getNotificationsStartRowID({ user_row_id })

            const count_query = await notificationsM.aggregate([
                {
                    $match: {
                        $and: [
                            {
                                $or: [
                                    { user_row_id: user_row_id, view_status: 0 },
                                    { user_row_id: 0 }
                                ]
                            },
                            {
                                _id: { $gte: start_notification_row_id }
                            }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_notifications_globals",
                        let: {
                            notify_user_row_id: '$user_row_id',
                            notification_row_id: '$_id'
                        },
                        as: "info_globals",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [0, '$$notify_user_row_id'] },
                                                    { $eq: ['$user_row_id', user_row_id] },
                                                    { $eq: ['$notification_row_id', '$$notification_row_id'] }
                                                ]
                                            }
                                        }
                                    ]
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
                { $unwind: { path: "$info_globals", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        new_view_status: { $cond: { if: "$info_globals._id", then: 1, else: 0 } }
                    }
                },
                {
                    $match: {
                        new_view_status: 0
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
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Notification messages list.', err)
        res.json({ status: false, message: err })
    }
})



router.get('/update_viewed_status', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const start_notification_row_id = await getNotificationsStartRowID({ user_row_id })

            await notificationsM.updateMany({ user_row_id: user_row_id, view_status: 0 }, {
                $set: {
                    view_status: 1
                }
            })

            const get_query = await notificationsM.aggregate([
                {
                    $match: {
                        $and: [
                            { user_row_id: 0 },
                            {
                                _id: { $gte: start_notification_row_id }
                            }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_notifications_globals",
                        let: {
                            notify_user_row_id: '$user_row_id',
                            notification_row_id: '$_id'
                        },
                        as: "info_globals",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [0, '$$notify_user_row_id'] },
                                                    { $eq: ['$user_row_id', user_row_id] },
                                                    { $eq: ['$notification_row_id', '$$notification_row_id'] }
                                                ]
                                            }
                                        }
                                    ]
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
                { $unwind: { path: "$info_globals", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        new_view_status: { $cond: { if: "$info_globals._id", then: 1, else: 0 } }
                    }
                },
                {
                    $match: {
                        new_view_status: 0
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
                        _id: 1
                    }
                }
            ])

            if (get_query[0]) {
                for (let run of get_query) {
                    await notifications_globalsM({
                        notification_row_id: run._id,
                        user_row_id: user_row_id
                    }).save()
                }
            }


            res.json({ status: true, message: { alert_message: 'Notification viewed succesfully.' } })
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
    }
})




router.get('/messages', async (req, res) => {
    try {
        const get_query = await notifications_messagesM.find()


        res.json({ status: true, message: get_query })
    }
    catch (err) {
        console.log('Notification messages list.', err)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


//const get_tokens_list = await getTokenList()
// {
//     case: { 
//         $and: [
//             { $eq: ['$user_row_id', 0] }
//         ]
//         },
//     then: "$info_globals"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 1] }
//         ]
//       },
//     then: "$info_user"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 6] }
//         ]
//       },
//     then: "$info_contest"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 5] }
//         ]
//       },
//     then: "$info_lesson"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1 ] },
//             { $eq: ['$notify_type',4] }
//         ]
//       },
//     then: "$info_course"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 2] }
//         ]
//       },
//     then: "$info_company"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 11] }
//         ]
//       },
//     then: {
//         _id:1
//     }
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 2] },
//             { $eq: ['$notify_type', 1] }
//         ]
//       },
//     then: "$info_threads"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 3] }
//         ]
//       },
//     then: "$info_events"
// },
// {
//     case: { $gt: ['$event_row_id', 0] },
//     then: "$info_events"
// }
// {
//     $lookup: 
//     {
//         from: "cln_professionals",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_user",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [1, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $lookup:
//                     {
//                     from: "cln_professionals_profile_images",
//                     localField: "_id",
//                     foreignField: "user_row_id",
//                     as: "img_info"
//                 }
//             }, 
//             { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
//             {
//                 $project:{
//                     profile_image : "$img_info.profile_image",
//                     login_status : 1,
//                     user_name : 1,
//                     full_name : 1,
//                     approval_status : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_user", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_main_weekly_contests",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_contest",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [6, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     title : 1,
//                     contest_image : 1,
//                     start_date : 1,
//                     end_date : 1,
//                     active_status : 1,
//                     completed_status : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_contest", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_academy_courses_lessons",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_lesson",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [5, '$$notify_type'] },
//                                     { $eq: ['$lesson_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $lookup: 
//                 {
//                     from:"cln_academy_courses",
//                     localField:"course_row_id",
//                     foreignField:"_id",
//                     as:"course_info",
//                     pipeline:[
//                         {
//                             $project:{
//                                 course_url :1
//                             }
//                         }
//                     ]
//                 }
//             },
//             { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
//             {
//                 $project:{
//                     course_url:"$course_info.course_url",
//                     lesson_number : 1,
//                     title : 1,
//                     lesson_image_url : 1,
//                     lesson_url : 1,
//                     lesson_status : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_lesson", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_academy_courses",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_course",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [4, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     course_name : 1,
//                     course_url : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_course", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_company_lists",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_company",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [2, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     company_name : 1,
//                     company_id : 1,
//                     company_email_id : 1,
//                     company_logo : 1,
//                     website_link : 1,
//                     approval_status : 1,
//                     active_status : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_events",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type',
//             event_row_id:'$event_row_id',
//         },
//         as: "info_events",
//         pipeline:[
//             {
//                 $match: {
//                     $or : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [3, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         },
//                         {
//                             $expr: {
//                                 $and: [
//                                     { $eq: ['$_id', '$$event_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     event_title : 1,
//                     event_image : 1,
//                     event_url : 1,
//                     active_status : 1,
//                     approval_status : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_events", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_notifications_threads",
//         let: {
//             notify_type: '$notify_type',
//             notifications_id : '$_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_threads",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [2, '$$thread_type'] },
//                                     { $eq: [1, '$$notify_type'] },
//                                     { $eq: ['$notification_row_id', '$$notifications_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $lookup: 
//                 {
//                     from: "cln_professionals",
//                     localField: "notify_type_row_id",
//                     foreignField: "_id",
//                     as: "info_user",
//                     pipeline:[
//                         {
//                             $lookup:
//                                 {
//                                 from: "cln_professionals_profile_images",
//                                 localField: "_id",
//                                 foreignField: "user_row_id",
//                                 as: "img_info"
//                             }
//                         }, 
//                         { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
//                         {
//                             $project:{
//                                 profile_image : "$img_info.profile_image",
//                                 login_status : 1,
//                                 user_name : 1,
//                                 full_name : 1,
//                                 approval_status : 1
//                             }
//                         }
//                     ]
//                 }
//             },
//             { $unwind: { path: "$info_user", preserveNullAndEmptyArrays: true } },
//             {
//                 $project:{
//                     _id:1,
//                     profile_image:"$info_user.profile_image",
//                     login_status:"$info_user.login_status",
//                     user_name:"$info_user.user_name",
//                     full_name:"$info_user.full_name",
//                     approval_status:"$info_user.approval_status"
//                 }
//             }
//         ]
//     }
// },
// {
//     $lookup: 
//     {
//         from: "cln_professionals",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_user",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [1, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     _id:1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_user", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_main_weekly_contests",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_contest",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [6, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     _id:1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_contest", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_academy_courses_lessons",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_lesson",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [5, '$$notify_type'] },
//                                     { $eq: ['$lesson_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     _id:1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_lesson", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_academy_courses",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_course",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [4, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     _id:1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_course", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_company_lists",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_company",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [2, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     company_name : 1,
//                     company_id : 1,
//                     company_email_id : 1,
//                     company_logo : 1,
//                     website_link : 1,
//                     approval_status : 1,
//                     active_status : 1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_events",
//         let: {
//             notify_type:'$notify_type',
//             notify_type_row_id:'$notify_type_row_id',
//             thread_type:'$thread_type',
//             event_row_id:'$event_row_id',
//         },
//         as: "info_events",
//         pipeline:[
//             {
//                 $match: {
//                     $or : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [1, '$$thread_type'] },
//                                     { $eq: [3, '$$notify_type'] },
//                                     { $eq: ['$_id', '$$notify_type_row_id'] }
//                                 ]
//                             }
//                         },
//                         {
//                             $expr: {
//                                 $and: [
//                                     { $eq: ['$_id', '$$event_row_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $project:{
//                     _id:1
//                 }
//             }
//         ]
//     }
// },
// { $unwind: { path: "$info_events", preserveNullAndEmptyArrays: true } },
// {
//     $lookup: 
//     {
//         from: "cln_notifications_threads",
//         let: {
//             notify_type: '$notify_type',
//             notifications_id : '$_id',
//             thread_type:'$thread_type'
//         },
//         as: "info_threads",
//         pipeline:[
//             {
//                 $match: {
//                     $and : [
//                         {
//                             $expr: {
//                                     $and: [
//                                     { $eq: [2, '$$thread_type'] },
//                                     { $eq: [1, '$$notify_type'] },
//                                     { $eq: ['$notification_row_id', '$$notifications_id'] }
//                                 ]
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $lookup: 
//                 {
//                     from: "cln_professionals",
//                     localField: "notify_type_row_id",
//                     foreignField: "_id",
//                     as: "info_user",
//                     pipeline:[
//                         {
//                             $project:{
//                                 _id:1
//                             }
//                         }
//                     ]
//                 }
//             },
//             { $unwind: { path: "$info_user", preserveNullAndEmptyArrays: true } },
//             {
//                 $project:{
//                     _id:1,
//                 }
//             }
//         ]
//     }
// },

// {
//     case: { 
//         $and: [
//             { $eq: ['$user_row_id', 0] }
//         ]
//         },
//     then: "$info_globals"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 1] }
//         ]
//       },
//     then: "$info_user"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 6] }
//         ]
//       },
//     then: "$info_contest"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 5] }
//         ]
//       },
//     then: "$info_lesson"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1 ] },
//             { $eq: ['$notify_type',4] }
//         ]
//       },
//     then: "$info_course"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 2] }
//         ]
//       },
//     then: "$info_company"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 2] },
//             { $eq: ['$notify_type', 1] }
//         ]
//       },
//     then: "$info_threads"
// },
// {
//     case: { 
//         $and: [
//             { $eq: ['$thread_type', 1] },
//             { $eq: ['$notify_type', 3] }
//         ]
//       },
//     then: "$info_events"
// },
// {
//     case: { $gt: ['$event_row_id', 0] },
//     then: "$info_events"
// }


module.exports = router