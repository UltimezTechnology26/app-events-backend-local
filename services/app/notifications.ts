import { getNotificationsStartRowID } from '../../utils/helpers/notification_helper';
import notificationsM from '../../models/app/notifications/notificationsM';
import logger from '../../config/logger';

interface NotificationData {
    _id?: number;
    user_row_id?: number;
    thread_type?: number;
    notify_type?: number;
    message_row_id?: number;
    notify_type_row_id?: number;
    view_status?: number;
    new_view_status?: number;
    notify_image?: string;
    notify_name?: string;
    notify_id?: string;
    notify_data?: any;
    title?: string;
    notification_message?: string;
    user_detail?: any;
    company_detail?: any;
    date_n_time?: Date;
}

interface NotificationResponse {
    status: boolean;
    message: {
        data: NotificationData[];
        count: number;
        skip: number;
        limit: number;
    };
    cache_response_status?: boolean;
    response_time?: number;
}

const listNotificationService = async (user_row_id: number, skip: number = 0, limit: number = 500): Promise<NotificationResponse> => {
    const startTime = Date.now();

    try {
        const start_notification_row_id = await getNotificationsStartRowID({ user_row_id });

        const get_query = notificationsM.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { user_row_id: user_row_id },
                                { user_row_id: 0 },
                            ]
                        },
                        {
                            _id: { $gte: start_notification_row_id }, thread_type: { $gte: 1 }, notify_type: { $gte: 1 }
                        },
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
                $sort: {
                    _id: -1
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
                                pro_batch: 1,
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
                    view_status: { $cond: { if: "$info_globals._id", then: 1, else: '$view_status' } }
                }
            },
            {
                $set:
                {
                    notify_data: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: ['$notify_type_row_id', 0] },
                                    then: {
                                        _id: '$_id'
                                    }
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$thread_type', 1] },
                                            { $eq: ['$notify_type', 1] }
                                        ]
                                    },
                                    then: "$info_user"
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$thread_type', 1] },
                                            { $not: { $in: ['$notify_name', ["", null]] } },
                                            { $ifNull: ['$notify_name', false] },
                                            { $eq: ['$notify_type', 2] }
                                        ]
                                    },
                                    then: {
                                        _id: '$notify_type_row_id',
                                        company_logo: '$notify_image',
                                        company_name: '$notify_name',
                                        company_id: '$notify_id',
                                        approval_status: { $literal: 1 },
                                        active_status: { $literal: 1 },
                                    }

                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$thread_type', 1] },
                                            { $not: { $in: ['$notify_name', ["", null]] } },
                                            { $ifNull: ['$notify_name', false] },
                                            { $eq: ['$notify_type', 5] }
                                        ]
                                    },
                                    then: {
                                        _id: '$notify_type_row_id',
                                        lesson_image_url: '$notify_image',
                                        title: '$notify_name',
                                        lesson_url: '$notify_id',
                                        course_url: { $literal: "" },
                                        lesson_status: { $literal: 1 }
                                    }
                                },
                            ],
                            default: ""
                        }
                    }
                }
            },

            {
                $set: {
                    present_notify_id: { $cond: { if: "$notify_data._id", then: "$notify_data._id", else: 0 } }
                }
            },
            {
                $match: {
                    present_notify_id: { $gt: 0 }
                }
            },
            {
                $project: {
                    _id: 1,
                    user_row_id: 1,
                    thread_type: 1,
                    notify_type: 1,
                    message_row_id: 1,
                    notify_type_row_id: 1,
                    view_status: 1,
                    new_view_status: 1,
                    notify_image: 1,
                    notify_name: 1,
                    notify_id: 1,
                    notify_data: "$notify_data",
                    title: "$info_message.title",
                    notification_message: "$info_message.notification_message",
                    user_detail: "$info_user",
                    company_detail: { $cond: { if: { $eq: ['$notify_type', 2] }, then: "$notify_data", else: null } },
                    date_n_time: 1
                }
            }
        ]).skip(skip).limit(limit);


        const count_query = notificationsM.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { user_row_id: user_row_id },
                                { user_row_id: 0 },
                            ]
                        },
                        {
                            _id: { $gte: start_notification_row_id }, thread_type: { $gte: 1 }, notify_type: { $gte: 1 }
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
                            $project: {
                                _id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_user", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    notify_data: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: ['$notify_type_row_id', 0] },
                                    then: {
                                        _id: '$_id'
                                    }
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$thread_type', 1] },
                                            { $eq: ['$notify_type', 1] }
                                        ]
                                    },
                                    then: "$info_user"
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$thread_type', 1] },
                                            { $not: { $in: ['$notify_name', ["", null]] } },
                                            { $ifNull: ['$notify_name', false] },
                                            { $eq: ['$notify_type', 2] }
                                        ]
                                    },
                                    then: {
                                        _id: '$notify_type_row_id'
                                    }

                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$thread_type', 1] },
                                            { $not: { $in: ['$notify_name', ["", null]] } },
                                            { $ifNull: ['$notify_name', false] },
                                            { $eq: ['$notify_type', 5] }
                                        ]
                                    },
                                    then: {
                                        _id: '$notify_type_row_id',
                                        lesson_image_url: '$notify_image',
                                        title: '$notify_name',
                                        lesson_url: '$notify_id',
                                        course_url: { $literal: "" },
                                        lesson_status: { $literal: 1 }
                                    }
                                },
                            ],
                            default: ""
                        }
                    }
                }
            },
            {
                $set: {
                    present_notify_id: { $cond: { if: "$notify_data._id", then: "$notify_data._id", else: 0 } }
                }
            },
            {
                $match: {
                    present_notify_id: { $gt: 0 }
                }
            },
            {
                $count: 'count'
            }
        ]);
        const [result1, result2] = await Promise.all([get_query, count_query])

        let count = 0
        if (result2[0]) {
            count = result2[0].count
        }

        const responseTime = Date.now() - startTime;
        logger.info(`Notifications list fetched: ${count} records in ${responseTime}ms`);

        return {
            status: true,
            message: {
                data: result1,
                count: count,
                skip: skip,
                limit: limit
            },
            response_time: responseTime
        };

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`Error in listNotificationService: ${error instanceof Error ? error.message : String(error)}, Response time: ${responseTime}ms`);

        return {
            status: false,
            message: {
                data: [],
                count: 0,
                skip: skip,
                limit: limit
            },
            response_time: responseTime
        };
    }
};

// CommonJS export for compatibility with JavaScript controller
module.exports = { listNotificationService };