const sanitize = require('mongo-sanitize')
const axios = require('axios')
const notificationsM = require('../../models/app/notifications/notificationsM')
const notifications_threadsM = require('../../models/app/notifications/notifications_threadsM')

const { getPresentDateTime, daysMinusFromPresentTime } = require('./helper')

const MARKET_API_BASE_URL = process.env.MARKET_API_BASE_URL
const MARKET_API_KEY = process.env.MARKET_API_KEY

export const deleteOldNotifications = async () => {
    const before_date = daysMinusFromPresentTime(30)
    await notificationsM.deleteMany({ date_n_time: { $lt: new Date(before_date) } })
    await notifications_threadsM.deleteMany({ date_n_time: { $lt: new Date(before_date) } })
}

export const updateNotification = async ({ user_row_id, notify_type, notify_type_row_id, message_row_id, action_row_id, event_row_id, notify_image, notify_name, notify_id }) => {
    try {
        const date_n_time = getPresentDateTime()

        const check_query = await notificationsM.findOne({
            thread_type: 1,
            user_row_id: user_row_id,
            notify_type: notify_type,
            notify_type_row_id: notify_type_row_id,
            message_row_id: message_row_id,
            action_row_id: action_row_id,
            date_n_time: date_n_time
        }, { _id: 1 })

        if (!check_query) {
            const insert_query = await notificationsM({
                thread_type: 1,
                user_row_id: user_row_id,
                notify_type: notify_type,
                notify_type_row_id: notify_type_row_id,
                message_row_id: message_row_id,
                action_row_id: action_row_id,
                view_status: 0,
                event_row_id: event_row_id,
                notify_image: notify_image ? notify_image : "",
                notify_name: notify_name ? notify_name : "",
                notify_id: notify_id ? notify_id : "",
                date_n_time: date_n_time
            }).save()


            return { status: true, message: insert_query }
        }
        else {
            return { status: true, message: check_query }
        }

    }
    catch (err) {
        console.log('Notification error.', err.message)
        return { status: false, message: err }
    }
}

export const getTokenList = async (token_row_ids) => {
    try {
        let url = "";
        for (let i = 0; i < token_row_ids.length; i++) {
            if (url.indexOf("?") === -1) {
                url = `${url}?token_row_ids[]=${token_row_ids[i]}`;
            } else {
                url = `${url}&token_row_ids[]=${token_row_ids[i]}`;
            }
        }
        const get_response = await axios.get(
            `${MARKET_API_BASE_URL}markets/cryptocurrency/list_by_ids${url}`,
            {
                headers: {
                    api_key: MARKET_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        );
        if (get_response) {
            const get_response_out = {
                statusCode: get_response.status,
                body: get_response.data,
            };
            if (get_response_out.statusCode == 200) {
                if (get_response_out.body.status) {
                    return get_response_out.body.message;
                }
            }
        }
        return { token_row_ids, get_response };
    }
    catch (err) {
        console.log("notifications tokens ids are not fetching", err)
        return err
    }
}


export const arrangeNotificationsResult = ({ notification_list, token_list }) => {
    const new_array = []
    try {
        for (let row of notification_list) {
            if (row.notify_type == 11) {
                const filter_data = token_list.filter(function (el) { return el._id == row.notify_type_row_id })
                if (filter_data.length) {
                    row['token_detail'] = filter_data[0]
                }
            }
            new_array.push(row)
        }
        return new_array
    }
    catch (err) {

        return new_array
    }
}



//for admin notification type -> -1
export const updateThreadNotification = async ({ user_row_id, notify_type, notify_type_row_id, message_row_id, action_row_id, event_row_id }) => {
    try {
        const date_n_time = getPresentDateTime()

        let view_status = 1
        let notification_row_id = 0
        const check_query = await notificationsM.find({
            user_row_id: user_row_id,
            thread_type: 2,
            notify_type: notify_type,
            message_row_id: message_row_id,
            event_row_id: event_row_id
        }, { _id: 1, view_status: 1 }).sort({ _id: -1 }).limit(1)
        if (check_query[0]) {
            view_status = check_query[0].view_status
            notification_row_id = check_query[0]._id
        }

        if (view_status) {
            const insert_query = await notificationsM({
                thread_type: 2,
                user_row_id: user_row_id,
                notify_type: notify_type,
                message_row_id: message_row_id,
                event_row_id: event_row_id,
                view_status: 0,
                date_n_time: date_n_time
            }).save()

            notification_row_id = insert_query._id

            const thread_insert_query = await notifications_threadsM({
                notify_type: notify_type,
                notification_row_id: notification_row_id,
                notify_type_row_id: notify_type_row_id,
                action_row_id: action_row_id,
                date_n_time: date_n_time
            }).save()

            return { status: true, message: thread_insert_query }
        }
        else if (notification_row_id) {
            await notificationsM.updateOne({ _id: check_query._id }, {
                $set: {
                    date_n_time: date_n_time
                }
            })

            const thread_query = await notifications_threadsM.findOne({
                notify_type: notify_type,
                notification_row_id: notification_row_id,
                notify_type_row_id: notify_type_row_id,
                action_row_id: action_row_id
            })

            if (!thread_query) {
                const thread_insert_query = await notifications_threadsM({
                    notify_type: notify_type,
                    notification_row_id: notification_row_id,
                    notify_type_row_id: notify_type_row_id,
                    action_row_id: action_row_id,
                    date_n_time: date_n_time
                }).save()

                return { status: true, message: thread_insert_query }
            }
            else {
                return { status: true, message: thread_query }
            }
        }
        else {
            return { status: false, message: "" }
        }
    }
    catch (err) {
        console.log('Notification error.', err.message)
        return { status: false, message: err }
    }
}



export const deleteNotifications = async ({ notify_type, notify_type_row_id }) => {
    try {
        if (notify_type_row_id) {
            if (notify_type >= 1 && notify_type <= 6) {
                if (notify_type == 1) {
                    await notificationsM.deleteMany({ user_row_id: notify_type_row_id })
                }

                if ((notify_type == 1) || (notify_type == 2)) {
                    await notificationsM.deleteMany({ thread_type: 1, notify_type: notify_type, notify_type_row_id: notify_type_row_id })
                    await notifications_threadsM.deleteMany({ notify_type: notify_type, notify_type_row_id: notify_type_row_id })
                }
            }
        }
        return { status: true, message: 'Deleting successfull.' }
    }
    catch (err) {
        console.log('Notification deleteNotifications err.', err)
        return { status: false, message: err }
    }
}



export const getNotificationsStartRowID = async ({ user_row_id }) => {
    try {
        const get_query = await notificationsM.findOne({ message_row_id: 1, user_row_id: user_row_id }, { _id: 1 })
        if (get_query) {
            return get_query._id
        }
        else {
            return 0
        }
    }
    catch (err) {
        console.log('Notification getNotificationsStartRowID err', err)
        return 0
    }
}