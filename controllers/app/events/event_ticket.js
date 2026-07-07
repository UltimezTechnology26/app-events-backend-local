const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
const { sendEventsEmail } = require('../../../config/email')
const { updateNotification } = require('../../../utils/helpers/notification_helper')

const professionalsM = require('../../../models/app/professionalsM')
const ticketM = require('../../../models/app/events/ticketM')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
const event_guestsM = require('../../../models/app/events/event_guestsM')
const eventM = require('../../../models/app/events/eventM')
const notify_userM = require('../../../models/app/events/notify_userM')
const { deleteTickets, checkSubadminAccess } = require('../../../utils/helpers/events_helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { calculateEventScore } = require('../../../utils/helpers/app_helper')

router.post('/create_edit_ticket', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row Id field is required'),
    check('title')
        .not().isEmpty().withMessage('The Ticket Title field is required')
        .isLength({ min: 4 }).withMessage('The Ticket Title field must be at least 4 characters in length.'),
    check('ticket_type')
        .not().isEmpty().withMessage('The Ticket type field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let user_row_id = 0
            const event_row_id = Number.parseInt(req.body.event_row_id)
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
                const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id })
                if (!check_event) {
                    errObj['event_row_id'] = "Invalid Event Row ID."
                }
            }
            else {
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
            }

            if (req.body.benefits) {
                if (!Array.isArray(req.body.benefits)) {
                    errObj['benefits'] = "The benefits field contains only an array."
                }
            }
            else {
                errObj['benefits'] = "The benefits field is required."
            }
            let ticket_row_id = ""

            if (req.body.event_row_id) {

                if (req.body.ticket_row_id) {
                    const ticket_check_query = await ticketM.findOne({ event_row_id: event_row_id, _id: sanitize(req.body.ticket_row_id) })
                    if (!ticket_check_query) {
                        errObj['ticket_row_id'] = "Invalid Event Ticket Row ID"
                    }
                    else {
                        ticket_row_id = sanitize(req.body.ticket_row_id)
                    }
                }

                let title_where_query = { title: sanitize(req.body.title), event_row_id: sanitize(req.body.event_row_id) }
                if (ticket_row_id) {
                    title_where_query = { _id: { $ne: ticket_row_id }, title: sanitize(req.body.title), event_row_id: sanitize(req.body.event_row_id) }
                }

                const check_event_title = await ticketM.findOne(title_where_query)
                if (check_event_title) {
                    errObj['title'] = "This event title is already exist. try new"
                }

                if ((req.body.ticket_type) == 1) {
                    if (req.body.price) {
                        if (Number.isNaN(Number.parseInt(req.body.price))) {
                            errObj['price'] = "The ticket price can be only integer."
                        }
                    }
                    else {
                        errObj['price'] = "The ticket price is required."
                    }
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let price = ((req.body.ticket_type) == 1) ? (req.body.price) : 0

                const insertArr = {}
                insertArr['event_row_id'] = event_row_id
                insertArr['title'] = req.body.title
                insertArr['benefits'] = req.body.benefits
                insertArr['ticket_type'] = req.body.ticket_type
                insertArr['price'] = price
                insertArr['updated_date_n_time'] = getPresentDateTime()
                insertArr['sell_status'] = Number.parseInt(req.body.sell_status) === 1 ? 1 : 0

                let alert_message = ""
                if (ticket_row_id) {
                    await ticketM.updateOne({ _id: sanitize(req.body.ticket_row_id) }, { $set: insertArr })
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('event_attendees_list_*')
                    await deleteKeysByPattern('ticket_list_*')

                    alert_message = "Congratulations! We're pleased to inform you that your ticket has been updated successfully with the latest information."

                }
                else {
                    insertArr['active_status'] = 1
                    await ticketM(insertArr).save()
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('event_attendees_list_*')
                    await deleteKeysByPattern('ticket_list_*')
                    await calculateEventScore(event_row_id, ['tickets_coupons'])


                    alert_message = 'Congratulations! We are delighted to inform you that your ticket has been created successfully.'
                }

                let event_price = 0
                const lowest_price_query = await ticketM.findOne({ event_row_id: event_row_id, price: { $gt: 0 } }, { price: 1 }).sort({ price: 1 }).limit(1)
                if (lowest_price_query) {
                    event_price = lowest_price_query.price
                }
                const updateFields = getUpdateTrackerFields(checkUserToken)
                await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: event_price, ...updateFields, updated_date_n_time: new Date() } })
                await deleteKeysByPattern('all_events_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('users_registered_list_*')
                await deleteKeysByPattern('events_watchlist_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('manage_events_list_*')
                await deleteKeysByPattern('app_user_other_details_*')
                await deleteKeysByPattern('event_attendees_list_*')
                await deleteKeysByPattern('ticket_list_*')
                res.json({ status: true, message: { alert_message: alert_message } })

            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Create edit Ticket.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/ticket_list/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (!checkUserToken.status) {
            return res.json(checkUserToken)
        }

        let errObj = {}
        let user_row_id = 0
        const event_row_id = Number.parseInt(req.params.event_row_id)

        if (Number.isNaN(event_row_id)) {
            errObj['event_row_id'] = "Invalid Event Row ID."
        }

        const check_event = await eventM.findOne({ _id: event_row_id })
        if (!check_event) {
            errObj['event_row_id'] = "Invalid Event Row ID."
        }

        if (checkUserToken.message.user_type == 1) {
            user_row_id = checkUserToken.message.user_row_id
            const check_event_query = await eventM.findOne({ _id: event_row_id, user_row_id })
            if (!check_event_query) {
                errObj['event_row_id'] = "Invalid Event Row ID."
            }
        }

        if (Object.keys(errObj).length) {
            return res.json({ status: false, message: errObj })
        }

        const key = `ticket_list_${event_row_id}_${user_row_id}`

        // ✅ Check Redis cache
        const cache_response = await getCache({ key })
        if (cache_response.status && Array.isArray(cache_response.message)) {
            return res.json({
                status: true,
                message: { ticket_list: cache_response.message }, // return as array
                cache_response_status: true
            })
        }

        // ✅ DB query
        const ticket_list = await ticketM.aggregate([
            { $match: { event_row_id } },
            {
                $lookup: {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info"
                }
            },
            { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    event_row_id: 1,
                    title: 1,
                    benefits: 1,
                    ticket_type: 1,
                    sell_status: 1,
                    price: 1,
                    active_status: 1,
                    updated_date_n_time: 1,
                    event_title: "$event_info.event_title",
                    event_image: "$event_info.event_image",
                    event_url: "$event_info.event_url"
                }
            }
        ])

        // ✅ Save into cache
        await setCache({
            key,
            value: ticket_list, // store array directly
            ttl: 1800 // 30 minutes
        })

        return res.json({
            status: true,
            message: { ticket_list },
            cache_response_status: false
        })

    } catch (err) {
        console.log('Ticket list.', err.message)
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        })
    }
})

router.get('/view_ticket/:ticket_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let errObj = {}

            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)

            if (Number.isNaN(ticket_row_id)) {
                errObj['ticket_row_id'] = "Invalid Ticket Row ID."
            }
            else {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id }, { _id: 1, event_row_id: 1 })

                const check_event = await eventM.findOne({ _id: checkTicket.event_row_id })
                if (!check_event) {
                    errObj['event_row_id'] = "Invalid Event Row ID."
                }
                if (checkUserToken.message.user_type == 1) {
                    const user_row_id = checkUserToken.message.user_row_id
                    const check_event_qauery = await eventM.findOne({ _id: checkTicket.event_row_id, user_row_id: user_row_id })
                    if (!check_event_qauery) {
                        errObj['event_row_id'] = "Invalid Event Row ID."
                    }
                }
            }

            if (!Object.keys(errObj).length) {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id }, {
                    sell_status: 1, _id: 1, event_row_id: 1, title: 1, benefits: 1, ticket_type: 1, price: 1, active_status: 1, updated_date_n_time: 1,
                })

                res.json({ status: true, message: checkTicket })
            }
            else {
                res.json({ status: false, message: errObj })
            }

        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('View Ticket.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/delete_ticket/:ticket_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let errObj = {}
            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)
            let event_row_id = 0

            if (Number.isNaN(ticket_row_id)) {
                errObj['ticket_row_id'] = "Invalid Ticket Row ID."
            }
            else {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id }, { _id: 1, event_row_id: 1 })
                event_row_id = checkTicket.event_row_id
                if (!checkTicket) {
                    errObj['ticket_row_id'] = "Invalid Ticket Row ID."
                }

                const check_event = await eventM.findOne({ _id: event_row_id })
                if (!check_event) {
                    errObj['event_row_id'] = "Invalid Event Row ID."
                }

                if (checkUserToken.message.user_type == 1) {
                    const user_row_id = checkUserToken.message.user_row_id
                    const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id })
                    if (!check_event) {
                        errObj['alert_message'] = "Invalid Event Row ID."
                    }
                }
                else {
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
                }
            }

            if (!Object.keys(errObj).length) {

                deleteTickets({ type: 1, event_row_id: event_row_id, ticket_row_id: ticket_row_id })
                await deleteKeysByPattern('ticket_list_*')
                await deleteKeysByPattern('individual_event_*')

                await calculateEventScore(event_row_id, ['tickets_coupons'])

                res.json({ status: true, message: { alert_message: "Your event ticket details have been successfully deleted. The ticket information is now removed from our records." } })
            }
            else {
                res.json({ status: false, message: errObj })
            }

        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Delete Ticket.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable_ticket/:ticket_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)
            if (!Number.isNaN(ticket_row_id)) {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id })
                if (checkTicket) {
                    if (Number.parseInt(checkTicket.active_status) === 0) {
                        await ticketM.updateOne({ _id: ticket_row_id }, { $set: { active_status: 1 } })
                        await deleteKeysByPattern('ticket_list_*')
                        await deleteKeysByPattern('individual_event_*')
                        res.json({ status: true, message: { alert_message: "Enabled Ticket Successfully" } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry, Ticket already enabled" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid Ticket Row Id" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Ticket row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Enable Ticket.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_ticket/:ticket_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)
            const checkTicket = await ticketM.findOne({ _id: ticket_row_id })
            if (checkTicket) {
                if (Number.parseInt(checkTicket.active_status) === 1) {
                    await ticketM.updateOne({ _id: ticket_row_id }, { $set: { active_status: 0 } })
                    await deleteKeysByPattern('ticket_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    res.json({ status: true, message: { alert_message: "Disabled Ticket Successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Ticket already disabled" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Ticket Row Id" } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Disable Ticket.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

const event_overview_data = async (event_row_id, user_row_id) => {

    const event_query = await eventM.aggregate([
        {
            $match: { _id: event_row_id, user_row_id: user_row_id, active_status: 1 }
        },
        {
            $lookup:
            {
                from: "cln_events_tags",
                localField: "event_tags",
                foreignField: "_id",
                as: "eventTags"
            }
        },
        {
            $project: {
                _id: 1,
                event_title: 1,
                event_image_type: 1,
                list_event_type: 1,
                event_tags: 1,
                event_type: 1,
                event_image: 1,
                event_city: 1,
                event_state: 1,
                event_venue: 1,
                event_description: 1,
                event_url: 1,
                event_link: 1,
                start_date: 1,
                end_date: 1,
                approval_status: 1,
                company_row_id: 1,
                active_status: 1,
                event_tag_array: "$eventTags.event_tag"
            }
        }
    ]).limit(1)

    if (event_query[0]) {
        let result_array = {}
        result_array['_id'] = event_query[0]._id
        result_array['event_title'] = event_query[0].event_title
        result_array['event_image_type'] = event_query[0].event_image_type
        result_array['list_event_type'] = event_query[0].list_event_type
        result_array['event_tags'] = event_query[0].event_tags
        result_array['event_type'] = event_query[0].event_type
        result_array['event_image'] = event_query[0].event_image
        result_array['event_city'] = event_query[0].event_city
        result_array['event_state'] = event_query[0].event_state
        result_array['event_venue'] = event_query[0].event_venue
        result_array['event_description'] = event_query[0].event_description
        result_array['event_url'] = event_query[0].event_url
        result_array['event_link'] = event_query[0].event_link
        result_array['start_date'] = event_query[0].start_date
        result_array['end_date'] = event_query[0].end_date
        result_array['approval_status'] = event_query[0].approval_status
        result_array['company_row_id'] = event_query[0].company_row_id
        result_array['active_status'] = event_query[0].active_status
        result_array['event_tag_array'] = event_query[0].event_tag_array

        let ticket_notify_button_status = false
        const total_tickets = await ticketM.countDocuments({ event_row_id: event_row_id })
        result_array['total_tickets'] = total_tickets
        if (total_tickets) {
            const notify_query = await notify_userM.findOne({ event_row_id: event_query[0]._id, notify_status: false })
            if (notify_query) {
                ticket_notify_button_status = true
            }
        }
        result_array['ticket_notify_button_status'] = ticket_notify_button_status

        result_array['total_guests'] = await event_guestsM.countDocuments({ event_row_id: event_row_id })

        result_array['total_watchlists'] = await event_watchlistsM.countDocuments({ event_row_id: event_row_id })

        return result_array
    }
    return false

}

router.get('/notify_users_list/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)
            const event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const event_query = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id }, { _id: 1 })
                if (event_query) {
                    const key = `notify_users_list_${event_row_id}_${user_row_id}`

                    // 🔹 Check cache first
                    const cache_response = await getCache(key)
                    if (cache_response && Array.isArray(cache_response)) {
                        return res.json({
                            status: true,
                            message: cache_response,
                            cache_response_status: true
                        })
                    }
                    const queryRun = await notify_userM.aggregate([
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info"
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_work_experiences",
                                localField: "user_row_id",
                                foreignField: "user_row_id",
                                pipeline: [
                                    { $match: { public_view: true, user_account_type: 1 } },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_static_professionals_work_positions",
                                            localField: "position_row_id",
                                            foreignField: "_id",
                                            as: "info_position",
                                            pipeline: [
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        position_name: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
                                    { $limit: 1 },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_company_lists",
                                            let: {
                                                company_type: '$company_type',
                                                company_row_id: '$company_row_id'
                                            },
                                            as: "info_company",
                                            pipeline: [
                                                {
                                                    $match: {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: [1, '$$company_type'] },
                                                                { $eq: ['$_id', "$$company_row_id"] }
                                                            ]
                                                        }
                                                    }
                                                },
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        company_name: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_company_manual_retrievals",
                                            let: {
                                                company_type: '$company_type',
                                                company_row_id: '$company_row_id'
                                            },
                                            as: "info_manual_company",
                                            pipeline: [
                                                {
                                                    $match: {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: [2, '$$company_type'] },
                                                                { $eq: ['$_id', "$$company_row_id"] }
                                                            ]
                                                        }
                                                    }
                                                },
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        company_name: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            position_name: '$info_position.position_name',
                                            company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                        }
                                    }
                                ],
                                as: "info_work",
                            }
                        },
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: "$user_info.login_status"
                            }
                        },
                        { $match: { event_row_id: event_row_id, login_status: 1 } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_profile_images",
                                localField: "user_row_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                date_n_time: 1,
                                login_status: 1,
                                notify_status: 1,
                                user_name: "$user_info.user_name",
                                email_id: "$user_info.email_id",
                                full_name: "$user_info.full_name",
                                work_position: "$info_work.position_name",
                                company_name: "$info_work.company_name",
                                profile_image: "$img_info.profile_image"

                            }
                        }
                    ])

                    // res.json({ status: true, message: queryRun })
                    if (Array.isArray(queryRun)) {
                        await setCache({ key, value: queryRun, ttl: 1800 }) // 30 minutes
                    }

                    return res.json({
                        status: true,
                        message: queryRun,
                        cache_response_status: false
                    })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Event Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Notify users list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/send_notifications/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)
            const event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const event_host_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1 })
                const checkEvent = await event_overview_data(event_row_id, user_row_id)
                if (checkEvent) {
                    const getLowestPrice = await ticketM.findOne({ event_row_id: event_row_id }, { _id: 1 })
                    if (getLowestPrice) {
                        const queryRun = await notify_userM.aggregate([
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "user_info"
                                }
                            },
                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set: {
                                    login_status: "$user_info.login_status"
                                }
                            },
                            { $match: { event_row_id: event_row_id, notify_status: false, login_status: 1 } },
                            {
                                $project: {
                                    _id: 1,
                                    user_row_id: 1,
                                    email_id: "$user_info.email_id",
                                    full_name: "$user_info.full_name",
                                }
                            }
                        ])

                        if (queryRun.length) {
                            for (let run of queryRun) {
                                if (run.user_row_id) {
                                    await updateNotification({
                                        user_row_id: run.user_row_id,
                                        notify_type: 3,
                                        notify_type_row_id: checkEvent._id,
                                        message_row_id: 56,
                                        action_row_id: checkEvent._id
                                    })
                                }

                                let pass_email_id = run.email_id
                                let invite_req_url = "https://events.coinpedia.org/" + checkEvent.event_url
                                let pass_subject = "The wait is over! Tickets Updated for the " + checkEvent.event_title + " event."
                                let pass_message = `
                                <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${run.full_name},</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Yay.!! The wait is over. Tickets for the  
                                <b>${checkEvent.event_title}</b> event have been updated by the 
                                <b style="text-transform: capitalize;">${event_host_query.full_name}</b> host. 
                                </p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Hurry up and Book your slot for the event before the tickets are sold out.</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${invite_req_url}" style="color:#0029ff;">See event details </a></p>
                            
                                `
                                await sendEventsEmail(pass_email_id, pass_subject, pass_message)


                            }

                            await notify_userM.updateMany({ event_row_id: event_row_id }, { $set: { notify_status: true } })
                            await deleteKeysByPattern('notify_users_list_*')
                            await deleteKeysByPattern('ticket_list_*')
                            await deleteKeysByPattern('individual_event_*')

                            res.json({ status: true, message: { alert_message: 'Event ticket notification details have been sent successfully to notify requested users.' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, No users requests found to send notification.' } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, Please update ticket details, then you can place notification request.' } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Event Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Send notifications.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/notify_user/:notify_row_id/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        let host_full_name = ""
        if (checkUserToken.status) {
            let user_row_id = 0
            let errObj = {}
            const notify_row_id = Number.parseInt(req.params.notify_row_id)
            const event_row_id = Number.parseInt(req.params.event_row_id)

            if (Number.isNaN(notify_row_id)) {
                errObj['notify_row_id'] = "Invalid Notify Row ID."
            }

            const checkEvent = await eventM.findOne({ _id: event_row_id }, { _id: 1, user_row_id: 1, company_row_id: 1, event_url: 1, event_title: 1, list_event_type: 1 })
            if (checkEvent) {
                if (checkUserToken.message.user_type == 1) {
                    user_row_id = checkUserToken.message.user_row_id
                    const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id })
                    if (!check_event) {
                        errObj['event_row_id'] = "Invalid Event Row ID."
                    }
                    else {
                        const event_host_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1 })
                        const check_user_event = await event_overview_data(event_row_id, user_row_id)
                        if (check_user_event) {
                            host_full_name = event_host_query.full_name
                        }
                        else {
                            errObj['event_row_id'] = 'Sorry! Invalid Event Row Id.'

                        }
                    }
                }
                else {
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
                        else if (checkEvent.list_event_type == 2) {
                            const event_company_query = await companyM.findOne({ _id: checkEvent.company_row_id }, { _id: 1, company_name: 1 })
                            host_full_name = event_company_query.company_name
                        }
                        else {
                            const event_host_query = await professionalsM.findOne({ _id: checkEvent.user_row_id }, { _id: 1, full_name: 1 })
                            host_full_name = event_host_query.full_name
                        }
                    }
                }

            }
            else {
                errObj['event_row_id'] = "Invalid Event Row ID."
            }

            if (!Object.keys(errObj).length) {

                const getLowestPrice = await ticketM.findOne({ event_row_id: event_row_id }, { _id: 1 })
                if (getLowestPrice) {
                    const queryRun = await notify_userM.aggregate([
                        { $match: { _id: notify_row_id, event_row_id: event_row_id, notify_status: false, } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: { login_status: 1 }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: "$user_info.login_status"
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                email_id: "$user_info.email_id",
                                full_name: "$user_info.full_name",
                            }
                        }
                    ])

                    if (queryRun[0]) {
                        if (queryRun[0].user_row_id) {
                            await updateNotification({
                                user_row_id: queryRun[0].user_row_id,
                                notify_type: 3,
                                notify_type_row_id: checkEvent._id,
                                message_row_id: 56,
                                action_row_id: checkEvent._id
                            })
                        }

                        //email code starts here
                        let pass_email_id = queryRun[0].email_id
                        let invite_req_url = "https://events.coinpedia.org/" + checkEvent.event_url
                        let pass_subject = "The wait is over! Tickets Updated for the " + checkEvent.event_title + " event."
                        let pass_message = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${queryRun[0].full_name},</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Yay.!! The wait is over. Tickets for the  
                            <b>${checkEvent.event_title}</b> event have been updated by the 
                            <b style="text-transform: capitalize;">${host_full_name}</b> host. 
                            </p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Hurry up and Book your slot for the event before the tickets are sold out.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${invite_req_url}" style="color:#0029ff;">See event details </a></p>
                        
                            `
                        await sendEventsEmail(pass_email_id, pass_subject, pass_message)

                        await notify_userM.updateOne({ _id: notify_row_id }, { $set: { notify_status: true } })
                        await deleteKeysByPattern('notify_users_list_*')
                        await deleteKeysByPattern('individual_event_*')
                        res.json({ status: true, message: { alert_message: 'This user is notified sucessfully.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Notify row id.' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Please update ticket details, then you can place notification request.' } })
                }
            }
            else {
                res.json({ status: false, message: errObj })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Notify User error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})



module.exports = router