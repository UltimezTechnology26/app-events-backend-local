require('dotenv').config()
const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, startAndEndOfToday, arrangeValidation, getPresentDateOnly, validateAndSaveImage, getIntIdFromArray, generateEventUrl, createDateTime, createEndDateOnly, startAndEndOfWeek, monthStartEndDate, yesterDayStartNEndDate, lastWeekStartEndDate, lastMonthStartEndDate } = require('../../../utils/helpers/helper')
const { EventsstartAndEndOfToday, EventstartAndEndOfWeek, checkAttendee, checkSubadminAccess, deleteTickets, deleteEvent } = require('../../../utils/helpers/events_helper')
const { DateFormatter } = require('../../../utils/helpers/events_helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { checkAdminLoginToken, checkApiKey, checkAllLoginToken } = require('../../../middleware/authorization')
const { sendEmail, sendEventsEmail } = require('../../../config/email')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
const { eventsList } = require('../../../services/admin_panel/events')
const { getPositionResolutionStages } = require('../../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../modules/funding/funding.queries')

const event_faqM = require('../../../models/app/events/event_faqM')
const countryM = require('../../../models/app/static/countryM')
const ticketM = require('../../../models/app/events/ticketM')
const eventM = require('../../../models/app/events/eventM')
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
const companyM = require('../../../models/app/company/companyM')
const attend_eventM = require('../../../models/app/events/attend_eventM')
const professionalsM = require('../../../models/app/professionalsM')
const event_default_imagesM = require('../../../models/app/static/event_default_imagesM')
const event_guestsM = require('../../../models/app/events/event_guestsM')
const event_guests_emailsM = require('../../../models/app/events/event_guests_emailsM')
const event_speakers_manualM = require('../../../models/app/events/event_speakers_manualM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const notify_userM = require('../../../models/app/events/notify_userM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const professionals_seo_detailsM = require('../../../models/app/professionals_seo_detailsM')
const professionals_followersM = require('../../../models/app/professionals_followersM')
const professionals_disabledM = require('../../../models/app/professionals_disabledM')
const user_designationsM = require('../../../models/app/static/user_designationsM')
const professionals_delete_actionsM = require('../../../models/app/professionals_delete_actionsM')
const professionals_profile_imagesM = require('../../../models/app/professionals_profile_imagesM')
const default_profile_imgM = require('../../../models/app/static/default_profile_imgM')
const professionals_created_by_adminM = require('../../../models/app/professionals_created_by_adminM')
const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
const company_created_by_adminM = require('../../../models/app/company/company_created_by_adminM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
const event_utc_datesM = require('../../../models/app/events/event_utc_datesM')
const event_search_locationM = require('../../../models/app/events/event_search_locationM')
const professionals_location_searchM = require('../../../models/app/events/professionals_location_searchM')
const event_contactsM = require('../../../models/app/events/event_contactsM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const professionals_ip_addressM = require('../../../models/app/professionals_ip_addressM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const followersM = require('../../../models/app/company/followersM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const event_link_display_detailsM = require('../../../models/app/events/event_link_display_detailsM')
import professionals_social_linksM from '../../../models/app/professionals_social_linksM'
import agenda from '../../../config/agenda'
import event_seo_detailsM from '../../../models/app/events/event_seo_detailsM'
const { calculateEventScore } = require('../../../utils/helpers/app_helper')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const seo_static_urlsM = require('../../../models/seo_static_urlsM')

const eventFilterQuery = async ({ top_filter_array, req_query, }) => {
    try {
        const present_date_time = new Date(getPresentDateTime())

        if (req_query.search && req_query.search.trim() !== "") {
            const searchText = req_query.search.trim();

            top_filter_array.push({
                $or: [
                    { event_title: { $regex: searchText, $options: 'i' } },
                    { user_name: { $regex: searchText, $options: 'i' } }
                ]
            });
        }

        //ticket - 1:Events without ticket, 2:Events with ticket
        if (req_query.ticket) {
            const ticket_query = await ticketM.distinct('event_row_id')
            if (req_query.ticket == 1) {
                query.push({ end_date: { $gte: present_date_time }, _id: { $nin: ticket_query } })
            }
            else {
                query.push({ end_date: { $gte: present_date_time }, _id: { $in: ticket_query } })
            }
        }

        if (!Number.isNaN(Number.parseInt(req_query.employee_id))) {
            top_filter_array.push({ created_by_admin_status: 2, created_by_sub_admin_id: Number.parseInt(req_query.employee_id) })
        }

        //1:Seminar, 2:Webinar, 3:Hybrid
        if (!Number.isNaN(Number.parseInt(req_query.event_type))) {
            top_filter_array.push({ event_type: Number.parseInt(req_query.event_type) })
        }

        //0: Disabled, 1: Enabled
        if (!Number.isNaN(Number.parseInt(req_query.active_status))) {
            top_filter_array.push({ active_status: Number.parseInt(req_query.active_status) })
        }

        //0:pending, 1:approved, 2:rejected
        if (!Number.isNaN(Number.parseInt(req_query.approval_status))) {
            top_filter_array.push({ approval_status: Number.parseInt(req_query.approval_status) })
        }

        if (req_query.start_date) {
            const start_date = createDateTime(req_query.start_date)
            top_filter_array.push({ start_date: { $gte: new Date(start_date) } })
        }

        if (req_query.end_date) {
            const end_date = createDateTime(req_query.end_date)
            top_filter_array.push({ end_date: { $lte: new Date(end_date) } })
        }

        //event_status=> 1.ongoing 2.upcoming 3.ended
        if (!Number.isNaN(Number.parseInt(req_query.event_status))) {

            if (Number.parseInt(req_query.event_status) === 1) {
                top_filter_array.push({ start_date: { $lte: present_date_time }, end_date: { $gte: present_date_time } })
            }
            else if (Number.parseInt(req_query.event_status) === 2) {
                top_filter_array.push({ start_date: { $gte: present_date_time } })
            }
            else if (Number.parseInt(req_query.event_status) === 3) {
                top_filter_array.push({ end_date: { $lt: present_date_time } })
            }
        }

        if (req_query.event_tag) {
            top_filter_array.push({ event_tags: { $in: await getIntIdFromArray(req_query.event_tag) } })
        }

        if (req_query.location) {
            top_filter_array.push({ event_venue: { '$regex': req_query.location, $options: 'i' } })
        }


        // created_type=>1.user 2.Admin/Subadmin
        if (req_query.created_type) {
            if (req_query.created_type == 1) {
                top_filter_array.push({ created_by_admin_status: 0 })
            }
            if (req_query.created_type == 2) {
                top_filter_array.push({ created_by_admin_status: { $in: [1, 2] } })
            }
        }

        const sortBy = req_query.sortBy
        const sortOrder = req_query.sortOrder ? Number.parseInt(req_query.sortOrder) : -1

        const sortStage = {}

        if (sortBy && sortOrder != "") {
            sortStage[sortBy] = sortOrder
        }

        return { top_filter_array: top_filter_array, sort_value: sortStage }
    }
    catch (err) {
        console.log('Events Filter function error.', err.message)
        return { top_filter_array: [], sort_value: [], err: err.message }
    }
}

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        let filter_array = [{}]
        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken) {

            const { top_filter_array, sort_value } = await eventFilterQuery({ top_filter_array: filter_array, req_query: req.query })
            const result = await eventsList({ sort_value: sort_value, top_filter_array: top_filter_array, req_query: req.query, req_params: req.params, req_headers: req.headers })

            if (result.err) {
                return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: result.err })
            }

            res.json({ status: true, message: result.message || result.list, count: result.count })
        }
        else {
            return checkAdminToken
        }
    }
    catch (err) {
        console.log('Events List api error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }

})


//global search
router.get('/global_search/:search', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [1, 7, 10])
    if (checkAdminToken) {
        try {
            let search = req.params.search
            if (search) {
                const event_query = await eventM.aggregate([
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
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info"
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $match: {
                            $or: [
                                { event_title: { '$regex': search, $options: 'i' } },
                                { event_url: { '$regex': search, $options: 'i' } }
                            ]
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            localField: "created_by_sub_admin_id",
                            foreignField: "_id",
                            as: "subadmin_info"
                        }
                    },
                    { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project:
                        {
                            event_title: 1,
                            event_image: 1,
                            event_url: 1,
                            start_date: 1,
                            end_date: 1,
                            active_status: 1,
                            approval_status: 1,
                            list_event_type: 1,
                            created_by_admin_status: 1,
                            created_by_sub_admin_id: 1,
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            sub_admin_name: "$subadmin_info.full_name"
                        }
                    },
                    { $sort: { _id: 1 } }
                ]).limit(50)

                const users_query = await professionalsM.aggregate([
                    {
                        $match: {
                            $or: [
                                { full_name: { '$regex': search, $options: 'i' } },
                                { user_name: { '$regex': search, $options: 'i' } }
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
                        $lookup:
                        {
                            from: "cln_professionals_created_by_admins",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "created_by_admin"
                        }
                    },
                    { $unwind: { path: "$created_by_admin", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            let: { created_admin_row_id: "$created_by_admin.sub_admin_row_id" },
                            pipeline: [
                                {
                                    $match:
                                    {
                                        $expr:
                                        {
                                            $eq: ["$$created_admin_row_id", "$_id"]
                                        },
                                    }
                                },
                            ],
                            as: "sub_admin_info"
                        }
                    },
                    { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            user_name: 1,
                            full_name: 1,
                            email_id: 1,
                            login_status: 1,
                            approval_status: 1,
                            claim_status: "$created_by_admin.claim_status",
                            sub_admin_name: "$sub_admin_info.full_name",
                            created_by_sub_admin_id: "$created_by_admin.sub_admin_row_id",
                            admin_sub_admin_type: "$created_by_admin.admin_sub_admin_type",
                            profile_image: "$img_info.profile_image"
                        }
                    },
                    { $sort: { _id: -1 } }
                ]).limit(50)


                const company_query = await companyM.aggregate([
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
                            from: "cln_company_created_by_admins",
                            localField: "_id",
                            foreignField: "company_row_id",
                            as: "admin_info"
                        }
                    },
                    { $unwind: { path: "$admin_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            let: { created_admin_row_id: "$admin_info.sub_admin_row_id" },
                            pipeline: [
                                {
                                    $match:
                                    {
                                        $expr:
                                        {
                                            $eq: ["$$created_admin_row_id", "$_id"]
                                        },
                                    }
                                },
                            ],
                            as: "sub_admin"
                        }
                    },
                    { $unwind: { path: "$sub_admin", preserveNullAndEmptyArrays: true } },
                    {
                        $match: {
                            $or: [
                                { company_name: { '$regex': search, $options: 'i' } },
                                { company_id: { '$regex': search, $options: 'i' } }
                            ]
                        }
                    },
                    {
                        $project:
                        {
                            company_name: 1,
                            company_id: 1,
                            company_logo: 1,
                            approval_status: 1,
                            active_status: 1,
                            company_email_id: 1,
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            sub_admin_name: "$sub_admin.full_name",
                            created_by_admin_row_id: "$admin_info.sub_admin_row_id",
                            claim_status: "$admin_info.claim_status"
                        }
                    },
                    { $sort: { _id: 1 } }
                ]).limit(50)

                res.json({
                    status: true,
                    message: {
                        events: event_query,
                        users: users_query,
                        company: company_query
                    }
                })
            }
            else {
                res.json({ status: false, message: 'Search field is required' })
            }

        }
        catch (err) {
            console.log('Admin panel global search.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


router.get('/invited_attendees_view/:event_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.event_row_id))) {
                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

                const event_row_id = Number.parseInt(req.params.event_row_id)

                const check_event = await eventM.findOne({ _id: event_row_id, approval_status: 1, active_status: 1 })
                if (check_event) {
                    let query = [{}]
                    if (req.query.search) {
                        query.push({
                            $or: [
                                { event_title: { '$regex': sanitize(req.query.search), $options: 'i' } },
                                { event_url: { '$regex': sanitize(req.query.search), $options: 'i' } },
                                { user_name: { '$regex': sanitize(req.query.search), $options: 'i' } },
                                { full_name: { '$regex': sanitize(req.query.search), $options: 'i' } },
                            ]
                        })
                    }

                    if (req.query.email_event_type) {
                        query.push({ email_event_type: { '$regex': sanitize(req.query.email_event_type), $options: 'i' } })
                    }

                    const get_query = await event_attendeesM.aggregate([
                        { $match: { event_row_id: event_row_id, invitation_type: 2 } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                let: {
                                    user_row_id: '$user_row_id',
                                    user_type: '$user_type'
                                },
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$user_type'] },
                                                    { $eq: ['$_id', '$$user_row_id'] }
                                                ]
                                            },
                                            // login_status: 1
                                        }
                                    },
                                    { $limit: 1 },
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
                                            _id: 1,
                                            user_name: 1,
                                            profile_image: "$img_info.profile_image",
                                            full_name: 1,
                                            email_id: 1,
                                            approval_status: 1,
                                            login_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_manual_retrievals",
                                let: {
                                    user_row_id: '$user_row_id',
                                    user_type: '$user_type'
                                },
                                as: "user_manual_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$user_type'] },
                                                    { $eq: ['$_id', '$$user_row_id'] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            email_id: 1,
                                            profile_image: 1
                                        }
                                    },
                                    { $limit: 1 },
                                ]
                            }
                        },
                        { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set:
                            {
                                user_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$user_type', 1] }
                                                    ]
                                                },
                                                then: "$user_info"
                                            },
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$user_type', 2] }
                                                    ]
                                                },
                                                then: "$user_manual_info"
                                            },
                                        ],
                                        default: ""
                                    }
                                },
                            }
                        },
                        {
                            $match: {
                                user_data: { $ne: "" }
                            }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_emails_events",
                                localField: "sg_message_id",
                                foreignField: "sg_message_id",
                                as: "email_info",
                                pipeline: [
                                    { $sort: { _id: -1 } },
                                    { $limit: 1 }
                                ]
                            }
                        },
                        { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                user_name: "$user_data.user_name",
                                profile_image: "$user_data.profile_image",
                                full_name: "$user_data.full_name",
                                email_event_type: "$email_info.event_type",
                            }
                        },
                        {
                            $match: { $and: query }
                        },
                        {
                            $project: {
                                event_row_id: 1,
                                user_type: 1,
                                user_row_id: 1,
                                invitation_status: 1,
                                invitation_type: 1,
                                created_date_n_time: 1,
                                user_name: "$user_data.user_name",
                                profile_image: "$user_data.profile_image",
                                full_name: "$user_data.full_name",
                                email_id: "$user_data.email_id",
                                email_event_type: "$email_info.event_type",
                            }
                        }
                    ]).skip(skip).limit(limit)

                    const count_query = await event_attendeesM.aggregate([
                        { $match: { event_row_id: event_row_id, invitation_type: 2 } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                let: {
                                    user_row_id: '$user_row_id',
                                    user_type: '$user_type'
                                },
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$user_type'] },
                                                    { $eq: ['$_id', '$$user_row_id'] }
                                                ]
                                            },
                                            // login_status: 1
                                        }
                                    },
                                    { $limit: 1 },
                                    {
                                        $project: {
                                            _id: 1,
                                            user_name: 1,
                                            profile_image: "$img_info.profile_image",
                                            full_name: 1,
                                            approval_status: 1,
                                            login_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_manual_retrievals",
                                let: {
                                    user_row_id: '$user_row_id',
                                    user_type: '$user_type'
                                },
                                as: "user_manual_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$user_type'] },
                                                    { $eq: ['$_id', '$$user_row_id'] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            full_name: 1,
                                            email_id: 1,
                                        }
                                    },
                                    { $limit: 1 },
                                ]
                            }
                        },
                        { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set:
                            {
                                user_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$user_type', 1] }
                                                    ]
                                                },
                                                then: "$user_info"
                                            },
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$user_type', 2] }
                                                    ]
                                                },
                                                then: "$user_manual_info"
                                            },
                                        ],
                                        default: ""
                                    }
                                },
                            }
                        },
                        {
                            $match: {
                                user_data: { $ne: "" }
                            }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_emails_events",
                                localField: "sg_message_id",
                                foreignField: "sg_message_id",
                                as: "email_info",
                                pipeline: [
                                    { $sort: { _id: -1 } },
                                    { $limit: 1 }
                                ]
                            }
                        },
                        { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                user_name: "$user_data.user_name",
                                profile_image: "$user_data.profile_image",
                                full_name: "$user_data.full_name",
                                email_event_type: "$email_info.event_type",
                            }
                        },
                        {
                            $match: { $and: query }
                        },
                        {
                            $count: "count"
                        }
                    ])

                    const count = count_query[0] ? count_query[0].count : 0

                    res.json({ status: true, message: get_query, count: count })

                }
                else {
                    res.json({ status: false, message: 'Invalid Event row id' })
                }
            }
            else {
                res.json({ status: false, message: 'Invalid Event row id' })
            }

        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Ticket notifications list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/ticket_notifications/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{}]
            if (req.query.search) {
                query.push({
                    $or: [
                        { event_title: { '$regex': sanitize(req.query.search), $options: 'i' } },
                        { event_url: { '$regex': sanitize(req.query.search), $options: 'i' } },
                    ]
                })
            }

            if (Number.parseInt(req.query.notify_status)) {
                const notify_status = Number.parseInt(req.query.notify_status)
                if (notify_status === 1) {
                    query.push({ notify_status: true })
                }
                else {
                    query.push({ notify_status: false })
                }
            }

            const list_query = await eventM.aggregate([
                {
                    $sort: {
                        _id: -1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_info",
                        pipeline: [
                            {
                                $sort: { _id: -1 }
                            },
                            {
                                $limit: 1
                            },
                            {
                                $project: {
                                    _id: 1,
                                    notify_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$notify_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: { notify_status: "$notify_info.notify_status" }
                },
                {
                    $match: { $and: query }
                },
                {
                    $lookup:
                    {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_count",
                        pipeline: [
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$notify_count", preserveNullAndEmptyArrays: false } },
                {
                    $lookup:
                    {
                        from: "cln_event_tickets",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "tickets",
                        pipeline: [
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$tickets", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        event_title: 1,
                        event_url: 1,
                        total_tickets: { $cond: { if: "$tickets.count", then: "$tickets.count", else: 0 } },
                        total_subscribers: "$notify_count.count",
                        notify_status: 1,
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await eventM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_info",
                        pipeline: [
                            {
                                $sort: { _id: -1 }
                            },
                            {
                                $limit: 1
                            },
                            {
                                $project: {
                                    _id: 1,
                                    notify_status: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$notify_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: { notify_status: "$notify_info.notify_status" }
                },
                {
                    $match: { $and: query }
                },
                {
                    $lookup:
                    {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_count",
                        pipeline: [
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$notify_count", preserveNullAndEmptyArrays: false } },
                {
                    $lookup:
                    {
                        from: "cln_event_tickets",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "tickets",
                        pipeline: [
                            {
                                $count: "count"
                            }
                        ]
                    }
                },
                { $unwind: { path: "$tickets", preserveNullAndEmptyArrays: true } },
                {
                    $count: "total_events"
                }
            ])

            let count = 0
            if (count_query[0]) {
                count = count_query[0].total_events
            }

            res.json({ status: true, message: list_query, count: count })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Ticket notifications list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})




router.get('/organisers_count', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const claimed_organizers_query = await professionalsM.aggregate([
                {
                    $match: {
                        login_status: 1, approval_status: 1
                    }
                },
                {
                    $lookup: {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: {
                                    // approval_status:1,
                                    // active_status:1
                                }
                            },
                            { $group: { _id: null, count: { $sum: 1 } } },
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "company_info",

                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ]).collation({ locale: 'en', strength: 2 })

            let claimed_organizers = 0
            if (claimed_organizers_query[0]) {
                claimed_organizers = claimed_organizers_query[0].count
            }



            const unclaimed_organizers_query = await companyM.aggregate([
                {
                    $match: {
                        $or: [
                            { user_row_id: null },
                            { user_row_id: 0 }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { _id: { $exists: true } }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }]
                    }
                },
                {
                    $set: {
                        total_events: { $size: "$event_info" }
                    }
                },
                { $match: { active_status: 1, total_events: { $gt: 0 } } },
                {
                    $count: "count"
                }
            ])
            let unclaimed_organizers = 0
            if (unclaimed_organizers_query[0]) {
                unclaimed_organizers = unclaimed_organizers_query[0].count
            }

            res.json({
                status: true, message: {
                    claimed_organizers: claimed_organizers,
                    unclaimed_organizers: unclaimed_organizers
                }
            })

        }
        catch (err) {
            console.log('Organizers count.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/new_organisers_count', checkApiKey, async (req, res) => {
    try {
        let key = "new_organisers_count"
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const claimed_organizers_query = await professionalsM.aggregate([
                {
                    $match: {
                        login_status: 1, approval_status: 1
                    }
                },
                {
                    $lookup: {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: {
                                    // approval_status:1,
                                    // active_status:1
                                }
                            },
                            { $group: { _id: null, count: { $sum: 1 } } },
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "company_info",

                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ]).collation({ locale: 'en', strength: 2 })
            let claimed_organizers = 0
            if (claimed_organizers_query[0]) {
                claimed_organizers = claimed_organizers_query[0].count
            }


            const unclaimed_organizers_query = await companyM.aggregate([
                {
                    $match: {
                        $or: [
                            { user_row_id: null },
                            { user_row_id: 0 }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { _id: { $exists: true } }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }]
                    }
                },
                {
                    $set: {
                        total_events: { $size: "$event_info" }
                    }
                },
                { $match: { active_status: 1, total_events: { $gt: 0 } } },
                {
                    $count: "count"
                }
            ])
            let unclaimed_organizers = 0
            if (unclaimed_organizers_query[0]) {
                unclaimed_organizers = unclaimed_organizers_query[0].count
            }

            const result = {
                claimed_organizers: claimed_organizers,
                unclaimed_organizers: unclaimed_organizers
            };

            await setCache({ key: key, value: result, ttl: 60 });

            res.json({ status: true, message: result, cache_response_status: false });
        }
        else {

            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Organizers count.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})



router.get('/tags_data', async (req, res) => {
    try {
        let events_organizers = {}

        events_organizers['events_tags_pending'] = await companyM.countDocuments({ business_model_id: 8, approval_status: 0, active_status: 1 })

        const listed_upcoming_organizers_query = await eventM.aggregate([
            {
                $match: {
                    start_date: { $gte: new Date(getPresentDateTime()) },
                    company_row_id: { $gt: 0 },
                    active_status: 1,
                    list_event_type: { $in: [2, 3] }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { business_model_id: 8 } } } },
            {
                $group: { _id: "$company_row_id", count: { $sum: 1 } }
            },
            {
                $count: 'count'
            }
        ])

        events_organizers['events_tags_listed_upcoming'] = listed_upcoming_organizers_query[0] ? listed_upcoming_organizers_query[0].count : 0

        const completed_organizers_query = await eventM.aggregate([
            {
                $match: {
                    end_date: { $lt: new Date(getPresentDateTime()) },
                    company_row_id: { $gt: 0 },
                    active_status: 1,
                    list_event_type: { $in: [2, 3] }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { business_model_id: 8 } } } },
            {
                $group: { _id: "$company_row_id", count: { $sum: 1 } }
            },
            {
                $count: 'count'
            }
        ])

        events_organizers['events_tags_listed_completed'] = completed_organizers_query[0] ? completed_organizers_query[0].count : 0

        const listed_ongoing_organizers_query = await eventM.aggregate([
            {
                $match: {
                    end_date: { $gte: new Date(getPresentDateTime()) },
                    company_row_id: { $gt: 0 },
                    active_status: 1,
                    list_event_type: { $in: [2, 3] }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { business_model_id: 8 } } } },
            {
                $group: { _id: "$company_row_id", count: { $sum: 1 } }
            },
            {
                $count: 'count'
            }
        ])

        events_organizers['events_tags_listed_ongoing'] = listed_ongoing_organizers_query[0] ? listed_ongoing_organizers_query[0].count : 0

        const approved_not_listed_organizers_query = await companyM.aggregate([
            {
                $lookup:
                {
                    from: "cln_events",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "event_info"
                }
            },
            {
                $match: {
                    "event_info.company_row_id": {
                        "$exists": false
                    },
                    business_model_id: 8,
                    approval_status: 1
                }
            },
            {
                $count: 'count'
            }
        ])
        events_organizers['events_tags_approved_not_listed'] = approved_not_listed_organizers_query[0] ? approved_not_listed_organizers_query[0].count : 0

        events_organizers['events_tags_total_organizers'] = await companyM.countDocuments({ business_model_id: 8, active_status: 1 })
        events_organizers['events_other_tags_total_organizers'] = await companyM.countDocuments({ business_model_id: { $ne: 8 }, active_status: 1 })

        const other_tag_listed_upcoming_organizers_query = await eventM.aggregate([
            {
                $match: {
                    start_date: { $gte: new Date(getPresentDateTime()) },
                    company_row_id: { $gt: 0 },
                    active_status: 1,
                    list_event_type: { $in: [2, 3] }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { business_model_id: { $ne: 8 } } } } },
            {
                $group: { _id: "$company_row_id", count: { $sum: 1 } }
            },
            {
                $count: 'count'
            }
        ])

        events_organizers['other_tag_listed_upcoming_organizers'] = other_tag_listed_upcoming_organizers_query[0] ? other_tag_listed_upcoming_organizers_query[0].count : 0


        const other_tag_listed_completed_organizers_query = await eventM.aggregate([
            {
                $match: {
                    end_date: { $lt: new Date(getPresentDateTime()) },
                    company_row_id: { $gt: 0 },
                    active_status: 1,
                    list_event_type: { $in: [2, 3] }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { business_model_id: { $ne: 8 } } } } },
            {
                $group: { _id: "$company_row_id", count: { $sum: 1 } }
            },
            {
                $count: 'count'
            }
        ])

        events_organizers['other_tags_listed_completed'] = other_tag_listed_completed_organizers_query[0] ? other_tag_listed_completed_organizers_query[0].count : 0

        const other_tag_listed_ongoing_organizers_query = await eventM.aggregate([
            {
                $match: {
                    end_date: { $gte: new Date(getPresentDateTime()) },
                    company_row_id: { $gt: 0 },
                    active_status: 1,
                    list_event_type: { $in: [2, 3] }
                }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { business_model_id: { $ne: 8 } } } } },
            {
                $group: { _id: "$company_row_id", count: { $sum: 1 } }
            },
            {
                $count: 'count'
            }
        ])

        let other_tag_listed_ongoing_organizers = 0
        if (other_tag_listed_ongoing_organizers_query[0]) {
            other_tag_listed_ongoing_organizers = other_tag_listed_ongoing_organizers_query[0].count
        }
        events_organizers['other_tag_listed_ongoing_organizers'] = other_tag_listed_ongoing_organizers

        //Company claim status

        const event_tag_claim_pending = await companyM.aggregate([
            {
                $lookup:
                {
                    from: "cln_company_created_by_admins",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "claim_info"
                }
            },
            { $match: { "claim_info": { $elemMatch: { claim_status: 1 } }, business_model_id: 8 } },
            {
                $count: 'count'
            }
        ])

        const event_tag_claim_approved = await companyM.aggregate([
            {
                $lookup:
                {
                    from: "cln_company_created_by_admins",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "claim_info"
                }
            },
            { $match: { "claim_info": { $elemMatch: { claim_status: 2 } }, business_model_id: 8 } },
            {
                $count: 'count'
            }
        ])
        events_organizers['event_tag_claim_approved'] = event_tag_claim_approved[0] ? event_tag_claim_approved[0].count : 0
        events_organizers['event_tag_claim_pending'] = event_tag_claim_pending[0] ? event_tag_claim_pending[0].count : 0

        const event_other_tag_claim_pending = await companyM.aggregate([
            {
                $lookup:
                {
                    from: "cln_company_created_by_admins",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "claim_info"
                }
            },
            { $match: { "claim_info": { $elemMatch: { claim_status: 1 } }, business_model_id: { $ne: 8 } } },
            {
                $count: 'count'
            }
        ])
        const event_other_tag_claim_approved = await companyM.aggregate([
            {
                $lookup:
                {
                    from: "cln_company_created_by_admins",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "claim_info"
                }
            },
            { $match: { "claim_info": { $elemMatch: { claim_status: 1 } }, business_model_id: { $ne: 8 } } },
            {
                $count: 'count'
            }
        ])
        events_organizers['event_other_tag_claim_pending'] = event_other_tag_claim_pending[0] ? event_other_tag_claim_pending[0].count : 0
        events_organizers['event_other_tag_claim_approved'] = event_other_tag_claim_approved[0] ? event_other_tag_claim_approved[0].count : 0

        //pending organizers

        events_organizers['events_tags_pending_organizers'] = await companyM.countDocuments({ business_model_id: 8, approval_status: 0, active_status: 1 })
        events_organizers['events_other_tags_pending_organizers'] = await companyM.countDocuments({ business_model_id: { $ne: 8 }, approval_status: 0, active_status: 1 })


        let result = { events_organizers: events_organizers };

        res.json({ status: true, message: result, cache_response_status: false });
    }
    catch (err) {
        console.log('Tags data.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


router.get('/overview_other_details', checkApiKey, async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let query = {}
            let result = {}
            if (req.query.status) {
                let approval_status = Number.parseInt(req.query.status)
                if (approval_status == 0) {
                    query.approval_status = 0
                }
                else if (approval_status == 1) {
                    query.approval_status = 1
                }
                else if (approval_status == 2) {
                    query.approval_status = 2
                }
            }

            result['upcomings_events'] = await eventM.countDocuments({ $and: [{ start_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }, query] })
            result['completed_events'] = await eventM.countDocuments({ $and: [{ end_date: { $lt: new Date(getPresentDateTime()) }, active_status: 1 }, query] })
            result['ongoing_events'] = await eventM.countDocuments({ $and: [{ start_date: { $lte: new Date(getPresentDateTime()) }, end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }, query] })


            //based on created by
            result['events_created_by_users'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, active_status: 1 }, query] })
            result['events_created_by_users_host'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, list_event_type: 1, active_status: 1 }, query] })
            result['events_created_by_users_company'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, list_event_type: 2, active_status: 1 }, query] })
            result['events_created_by_users_host_company'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, list_event_type: 3, active_status: 1 }, query] })

            result['events_created_by_team'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, active_status: 1 }, query] })
            result['events_created_by_team_host'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, list_event_type: 1, active_status: 1 }, query] })
            result['events_created_by_team_company'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, list_event_type: 2, active_status: 1 }, query] })
            result['events_created_by_team_host_company'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, list_event_type: 3, active_status: 1 }, query] })


            //based on date( event running) 
            result['events_created_by_users_upcoming'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, start_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }, query] })
            result['events_created_by_users_ended'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, end_date: { $lt: new Date(getPresentDateTime()) }, active_status: 1 }, query] })
            result['events_created_by_users_ongoing'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, start_date: { $lte: new Date(getPresentDateTime()) }, end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }, query] })

            result['events_created_by_team_upcoming'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, start_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }, query] })
            result['events_created_by_team_ended'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, end_date: { $lt: new Date(getPresentDateTime()) }, active_status: 1 }, query] })
            result['events_created_by_team_ongoing'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, start_date: { $lte: new Date(getPresentDateTime()) }, end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }, query] })

            //based on list in
            result['events_created_by_host'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, active_status: 1 }, query] })
            result['events_created_by_company'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, active_status: 1 }, query] })
            result['events_created_by_host_company'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, active_status: 1 }, query] })

            //based on time

            const today_date = startAndEndOfToday()
            const yesterday_date = yesterDayStartNEndDate()
            const lastWeek_date = lastWeekStartEndDate()
            const lastMonth_date = lastMonthStartEndDate()

            //based on time users 
            result['users_today_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, created_date_n_time: { $gt: new Date(today_date.start_date) }, active_status: 1 }, query] })
            result['users_yesterday_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, created_date_n_time: { $gte: new Date(yesterday_date.start_date), $lte: new Date(yesterday_date.end_date) }, active_status: 1 }, query] })
            result['users_LastWeek_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, created_date_n_time: { $gte: new Date(lastWeek_date.start_date), $lte: new Date(lastWeek_date.end_date) }, active_status: 1 }, query] })
            result['users_LastMonth_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0, created_date_n_time: { $gte: new Date(lastMonth_date.start_date), $lte: new Date(lastMonth_date.end_date) }, active_status: 1 }, query] })

            //based on time admin
            result['admin_today_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, created_date_n_time: { $gt: new Date(today_date.start_date) }, active_status: 1 }, query] })
            result['admin_yesterday_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, created_date_n_time: { $gte: new Date(yesterday_date.start_date), $lte: new Date(yesterday_date.end_date) }, active_status: 1 }, query] })
            result['admin_LastWeek_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, created_date_n_time: { $gte: new Date(lastWeek_date.start_date), $lte: new Date(lastWeek_date.end_date) }, active_status: 1 }, query] })
            result['admin_LastMonth_events'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, created_date_n_time: { $gte: new Date(lastMonth_date.start_date), $lte: new Date(lastMonth_date.end_date) }, active_status: 1 }, query] })

            res.json({ status: true, message: result })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Overview other details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/overview_details', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10]);
        if (checkUserToken.status) {
            const result = {};

            const filter = req.query.filter || 'all';
            const now = new Date();
            const ranges = {
                '1w': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                '1m': new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
                '6m': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
                '1y': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            };

            const dateFilter = {};
            if (filter !== 'all' && ranges[filter]) {
                dateFilter.created_date_n_time = { $gte: ranges[filter] };
            }

            const buildQuery = (conditions = {}) => {
                return { ...conditions, ...dateFilter };
            };

            result['pending_events'] = await eventM.countDocuments(buildQuery({ approval_status: 0, active_status: 1 }));
            result['approved_events'] = await eventM.countDocuments(buildQuery({ approval_status: 1, active_status: 1 }));
            result['rejected_events'] = await eventM.countDocuments(buildQuery({ approval_status: 2, active_status: 1 }));
            result['disabled_events'] = await eventM.countDocuments({
                $and: [
                    { active_status: 0 },
                    { approval_status: 1 },
                    {
                        $or: [
                            { created_by_admin_status: { $ne: 0 } }, // Admin/Subadmin
                            {
                                $and: [
                                    { created_by_admin_status: 0 },
                                    { list_event_type: { $in: [1, 2, 3] } }
                                ]
                            }
                        ]
                    }
                ]
            });



            result['deleted_events'] = await deleted_eventsM.countDocuments(buildQuery());
            result['total_events'] =
                result['pending_events'] +
                result['approved_events'] +
                result['rejected_events'] +
                result['disabled_events']
            result['upcomings_events'] = await eventM.countDocuments({
                start_date: { $gte: now },
                $or: [{ active_status: 1, approval_status: 1 }],
                ...dateFilter
            });
            result['completed_events'] = await eventM.countDocuments({
                end_date: { $lt: now },
                $or: [{ active_status: 1, approval_status: 1 }],
                ...dateFilter
            });
            result['ongoing_events'] = await eventM.countDocuments({
                start_date: { $lte: now },
                end_date: { $gte: now },
                $or: [{ active_status: 1, approval_status: 1 }],
                ...dateFilter
            });
            // HOST EVENTS
            const hostFilter = { list_event_type: 1, created_by_admin_status: 0 };


            result['events_created_by_host_pending'] = await eventM.countDocuments(buildQuery({ ...hostFilter, approval_status: 0, active_status: 1 }));
            result['events_created_by_host_approved'] = await eventM.countDocuments(buildQuery({ ...hostFilter, approval_status: 1, active_status: 1 }));
            result['events_created_by_host_rejected'] = await eventM.countDocuments(buildQuery({ ...hostFilter, approval_status: 2, active_status: 1 }));
            result['events_created_by_host_disabled'] = await eventM.countDocuments(buildQuery({ ...hostFilter, approval_status: 1, active_status: 0 }));
            result['events_created_by_host_deleted'] = await deleted_eventsM.countDocuments(buildQuery(hostFilter));
            result['events_created_by_host'] =
                result['events_created_by_host_pending'] +
                result['events_created_by_host_approved'] +
                result['events_created_by_host_rejected'] +
                result['events_created_by_host_disabled']




            //HOST ORGANIZERS
            const orgFilter = { list_event_type: 2, created_by_admin_status: 0 };
            result['events_created_by_organizer_pending'] = await eventM.countDocuments(buildQuery({ ...orgFilter, approval_status: 0, active_status: 1 }));
            result['events_created_by_organizer_approved'] = await eventM.countDocuments(buildQuery({ ...orgFilter, approval_status: 1, active_status: 1 }));
            result['events_created_by_organizer_rejected'] = await eventM.countDocuments(buildQuery({ ...orgFilter, approval_status: 2, active_status: 1 }));
            result['events_created_by_organizer_disabled'] = await eventM.countDocuments(buildQuery({ ...orgFilter, approval_status: 1, active_status: 0 }));
            result['events_created_by_organizer_deleted'] = await deleted_eventsM.countDocuments(buildQuery(orgFilter));
            result['events_created_by_organizer'] =
                result['events_created_by_organizer_pending'] +
                result['events_created_by_organizer_approved'] +
                result['events_created_by_organizer_rejected'] +
                result['events_created_by_organizer_disabled']

            result['events_created_by_organizer_ongoing'] = await eventM.countDocuments({
                ...orgFilter, start_date: { $lte: now }, end_date: { $gte: now }, active_status: 1, approval_status: 1, ...dateFilter
            });
            result['events_created_by_organizer_upcoming'] = await eventM.countDocuments({
                ...orgFilter, start_date: { $gte: now }, active_status: 1, approval_status: 1, ...dateFilter
            });
            result['events_created_by_organizer_ended'] = await eventM.countDocuments({
                ...orgFilter, end_date: { $lt: now }, active_status: 1, approval_status: 1, ...dateFilter
            });
            // HOST + ORGANIZER EVENTS
            const bothFilter = { list_event_type: 3, created_by_admin_status: 0 };
            result['events_created_by_host_n_organizer_pending'] = await eventM.countDocuments(buildQuery({ ...bothFilter, approval_status: 0, active_status: 1 }));
            result['events_created_by_host_n_organizer_approved'] = await eventM.countDocuments(buildQuery({ ...bothFilter, approval_status: 1, active_status: 1 }));
            result['events_created_by_host_n_organizer_rejected'] = await eventM.countDocuments(buildQuery({ ...bothFilter, approval_status: 2, active_status: 1 }));
            result['events_created_by_host_n_organizer_disabled'] = await eventM.countDocuments(buildQuery({ ...bothFilter, approval_status: 1, active_status: 0 }));
            result['events_created_by_host_n_organizer_deleted'] = await deleted_eventsM.countDocuments(buildQuery(bothFilter));
            result['events_created_by_host_n_organizer'] =
                result['events_created_by_host_n_organizer_pending'] +
                result['events_created_by_host_n_organizer_approved'] +
                result['events_created_by_host_n_organizer_rejected'] +
                result['events_created_by_host_n_organizer_disabled']
            result['events_created_by_host_n_organizer_ongoing'] = await eventM.countDocuments({
                ...bothFilter, start_date: { $lte: now }, end_date: { $gte: now }, active_status: 1, approval_status: 1, ...dateFilter
            });
            result['events_created_by_host_n_organizer_upcoming'] = await eventM.countDocuments({
                ...bothFilter, start_date: { $gte: now }, active_status: 1, approval_status: 1, ...dateFilter
            });
            result['events_created_by_host_n_organizer_ended'] = await eventM.countDocuments({
                ...bothFilter, end_date: { $lt: now }, active_status: 1, approval_status: 1, ...dateFilter
            });


            // TEAM EVENTS
            const teamFilter = { created_by_admin_status: { $in: [1, 2] } };
            result['events_created_by_team_pending'] = await eventM.countDocuments(buildQuery({ ...teamFilter, approval_status: 0, active_status: 1 }));
            result['events_created_by_team_approved'] = await eventM.countDocuments(buildQuery({ ...teamFilter, approval_status: 1, active_status: 1 }));
            result['events_created_by_team_rejected'] = await eventM.countDocuments(buildQuery({ ...teamFilter, approval_status: 2, active_status: 1 }));
            result['events_created_by_team_disabled'] = await eventM.countDocuments(buildQuery({ ...teamFilter, approval_status: 1, active_status: 0 }));
            result['events_created_by_team_deleted'] = await deleted_eventsM.countDocuments(buildQuery(teamFilter));
            result['events_created_by_team'] =
                result['events_created_by_team_pending'] +
                result['events_created_by_team_approved'] +
                result['events_created_by_team_rejected'] +
                result['events_created_by_team_disabled']

            // Host Created Events
            const hostCreatedCounts = await eventM.aggregate([
                {
                    $match: {
                        created_by_admin_status: 0,
                        active_status: 1,
                        approval_status: 1,
                        ...dateFilter
                    }
                },
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        ongoing: [
                            {
                                $match: {
                                    start_date: { $lte: new Date(now) },
                                    end_date: { $gte: new Date(now) }
                                }
                            },
                            { $count: "count" }
                        ],
                        upcoming: [
                            {
                                $match: {
                                    start_date: { $gt: new Date(now) }
                                }
                            },
                            { $count: "count" }
                        ],
                        ended: [
                            {
                                $match: {
                                    end_date: { $lt: new Date(now) }
                                }
                            },
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            const hostData = hostCreatedCounts[0] || {};

            result['events_created_by_host_total'] = hostData.total?.[0]?.count || 0;
            result['events_created_by_host_ongoing'] = hostData.ongoing?.[0]?.count || 0;
            result['events_created_by_host_upcoming'] = hostData.upcoming?.[0]?.count || 0;
            result['events_created_by_host_ended'] = hostData.ended?.[0]?.count || 0;

            // Team Created Events
            const teamCreatedCounts = await eventM.aggregate([
                {
                    $match: {
                        created_by_admin_status: { $in: [1, 2] },
                        active_status: 1,
                        approval_status: 1,

                        ...dateFilter
                    }
                },
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        ongoing: [
                            {
                                $match: {
                                    start_date: { $lte: new Date(now) },
                                    end_date: { $gte: new Date(now) }
                                }
                            },
                            { $count: "count" }
                        ],
                        upcoming: [
                            {
                                $match: {
                                    start_date: { $gt: new Date(now) }
                                }
                            },
                            { $count: "count" }
                        ],
                        ended: [
                            {
                                $match: {
                                    end_date: { $lt: new Date(now) }
                                }
                            },
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            const teamData = teamCreatedCounts[0] || {};

            result['events_created_by_team_total'] = teamData.total?.[0]?.count || 0;
            result['events_created_by_team_ongoing'] = teamData.ongoing?.[0]?.count || 0;
            result['events_created_by_team_upcoming'] = teamData.upcoming?.[0]?.count || 0;
            result['events_created_by_team_ended'] = teamData.ended?.[0]?.count || 0;


            res.json({ status: true, message: result });
        }
        else {
            res.json(checkUserToken)

        }


    } catch (err) {
        res.json({ status: false, message: err.message });
    }
});

router.get('/deleted_overview', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let result = {}
            result['pending_events'] = await eventM.countDocuments({ approval_status: 0, active_status: 1 })
            result['approved_events'] = await eventM.countDocuments({ approval_status: 1, active_status: 1 })
            result['rejected_events'] = await eventM.countDocuments({ approval_status: 2, active_status: 1 })
            // result['disabled_events'] = await eventM.countDocuments({ active_status: 0, approval_status: 1 })
            result['disabled_events'] = await eventM.countDocuments({
                $and: [
                    { active_status: 0 },
                    { approval_status: 1 },
                    {
                        $or: [
                            { created_by_admin_status: { $ne: 0 } }, // Admin/Subadmin
                            {
                                $and: [
                                    { created_by_admin_status: 0 },
                                    { list_event_type: { $in: [1, 2, 3] } }
                                ]
                            }
                        ]
                    }
                ]
            });
            result['deleted_events'] = await deleted_eventsM.countDocuments()
            result['total_events'] = result['pending_events'] + result['approved_events'] + result['rejected_events'] + result['disabled_events']
            res.json({ status: true, message: result })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Events Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/overview', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let result = {}

            //employee list
            // result['employees_events_reports'] = await eventM.aggregate([
            //     {
            //         $match: { $and: [{ created_by_admin_status: 2 }, { created_by_sub_admin_id: { $gt: 0 } }, { active_status: 1 }] }
            //     },
            //     {
            //         $group: {
            //             _id: "$created_by_sub_admin_id",
            //             events_created: {
            //                 $sum: 1
            //             }
            //         }
            //     },
            //     {
            //         $lookup:
            //         {
            //             from: "cln_sub_admins",
            //             localField: "_id",
            //             foreignField: "_id",
            //             as: "subadmin_info",
            //             pipeline: [
            //                 {
            //                     $lookup:
            //                     {
            //                         from: "cln_company_lists",
            //                         localField: "_id",
            //                         foreignField: "sub_admin_row_id",
            //                         as: "company_info",
            //                         pipeline: [{
            //                             $project: { _id: 1 }
            //                         }]
            //                     }
            //                 },
            //                 {
            //                     $lookup:
            //                     {
            //                         from: "cln_professionals",
            //                         localField: "_id",
            //                         foreignField: "sub_admin_row_id",
            //                         as: "user_info",
            //                         pipeline: [{
            //                             $project: { _id: 1 }
            //                         }]
            //                     }
            //                 },
            //                 {
            //                     $project: {
            //                         full_name: 1,
            //                         email_id: 1,
            //                         total_company: { $size: "$company_info" },
            //                         total_user: { $size: "$user_info" }
            //                     }
            //                 }
            //             ]
            //         }
            //     },
            //     { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $set: {
            //             full_name: "$subadmin_info.full_name"
            //         }
            //     },
            //     // {
            //     //     $match:{full_name:{ "$nin": [ null, "" ] }}
            //     // },
            //     {
            //         $sort: { events_created: -1 }
            //     },
            //     {
            //         $project: {
            //             _id: 1,
            //             events_created: 1,
            //             full_name: 1,
            //             email_id: "$subadmin_info.email_id",
            //             total_user: "$subadmin_info.total_user",
            //             total_company: "$subadmin_info.total_company"
            //         }
            //     }

            // ])
            const present_time = getPresentDateTime()
            const filter = req.query.filter || 'all';
            const now = new Date();
            const ranges = {
                '1w': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                '1m': new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
                '6m': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
                '1y': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            };

            const dateFilter = {};
            if (filter !== 'all' && ranges[filter]) {
                dateFilter.created_date_n_time = { $gte: ranges[filter] };
            }

            const buildQuery = (conditions = {}) => {
                return { ...conditions, ...dateFilter };
            };

            result['employees_events_reports'] = await eventM.aggregate([
                {
                    $match: buildQuery({
                        created_by_admin_status: 2,
                        created_by_sub_admin_id: { $gt: 0 },
                        active_status: 1
                    })
                },
                {
                    $group: {
                        _id: "$created_by_sub_admin_id",
                        events_created: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "_id",
                        foreignField: "_id",
                        as: "subadmin_info",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "cln_company_lists",
                                    localField: "_id",
                                    foreignField: "sub_admin_row_id",
                                    as: "company_info",
                                    pipeline: [{ $project: { _id: 1 } }]
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_professionals",
                                    localField: "_id",
                                    foreignField: "sub_admin_row_id",
                                    as: "user_info",
                                    pipeline: [{ $project: { _id: 1 } }]
                                }
                            },
                            {
                                $project: {
                                    full_name: 1,
                                    email_id: 1,
                                    total_company: { $size: "$company_info" },
                                    total_user: { $size: "$user_info" }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        full_name: "$subadmin_info.full_name"
                    }
                },
                {
                    $sort: { events_created: -1 }
                },
                {
                    $project: {
                        _id: 1,
                        events_created: 1,
                        full_name: 1,
                        email_id: "$subadmin_info.email_id",
                        total_user: "$subadmin_info.total_user",
                        total_company: "$subadmin_info.total_company"
                    }
                }
            ]);


            //Total events 

            const date_n_time = new Date(getPresentDateTime())
            // result['total_events']  = await eventM.countDocuments()
            result['pending_events'] = await eventM.countDocuments({ approval_status: 0, active_status: 1 })
            result['approved_events'] = await eventM.countDocuments({ approval_status: 1, active_status: 1 })
            result['rejected_events'] = await eventM.countDocuments({ approval_status: 2, active_status: 1 })
            // result['disabled_events'] = await eventM.countDocuments({ active_status: 0, approval_status: 1 })
            result['disabled_events'] = await eventM.countDocuments({
                $and: [
                    { active_status: 0 },
                    { approval_status: 1 },
                    {
                        $or: [
                            { created_by_admin_status: { $ne: 0 } }, // Admin/Subadmin
                            {
                                $and: [
                                    { created_by_admin_status: 0 },
                                    { list_event_type: { $in: [1, 2, 3] } }
                                ]
                            }
                        ]
                    }
                ]
            });
            result['deleted_events'] = await deleted_eventsM.countDocuments()
            result['total_events'] = result['pending_events'] + result['approved_events'] + result['rejected_events'] + result['disabled_events']
            result['upcomings_events'] = await eventM.countDocuments({ $and: [{ start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['completed_events'] = await eventM.countDocuments({ $and: [{ end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['ongoing_events'] = await eventM.countDocuments({ $and: [{ start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })

            //events created by host 
            result['events_created_by_host'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0 }] })
            // result['events_created_by_host_published']  = await eventM.countDocuments({  list_event_type:1, created_by_admin_status:0, active_status:1, approval_status:1})
            result['events_created_by_host_pending'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, approval_status: 0, active_status: 1 })
            result['events_created_by_host_approved'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, active_status: 1, approval_status: 1 })
            result['events_created_by_host_rejected'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, approval_status: 2, active_status: 1 })
            result['events_created_by_host_disabled'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_host_deleted'] = await deleted_eventsM.countDocuments({ list_event_type: 1, created_by_admin_status: 0 })
            result['events_created_by_host_ongoing'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_upcoming'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_ended'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })


            //events created by host organizer 
            result['events_created_by_host_n_organizer'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0 }] })
            // result['events_created_by_host_n_organizer_published']  = await eventM.countDocuments({ list_event_type:3, created_by_admin_status:0, approval_status:1})
            result['events_created_by_host_n_organizer_pending'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, approval_status: 0, active_status: 1 })
            result['events_created_by_host_n_organizer_approved'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, active_status: 1, approval_status: 1 })
            result['events_created_by_host_n_organizer_rejected'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, approval_status: 2, active_status: 1 })
            result['events_created_by_host_n_organizer_disabled'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_host_n_organizer_deleted'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0 })


            result['events_created_by_host_n_organizer_ongoing'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_n_organizer_upcoming'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_n_organizer_ended'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })

            //events created by organizer 
            result['events_created_by_organizer'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0 }] })
            // result['events_created_by_organizer_published']  = await eventM.countDocuments({ list_event_type:2, created_by_admin_status:0, active_status:1, approval_status:1 })
            result['events_created_by_organizer_pending'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, approval_status: 0, active_status: 1 })
            result['events_created_by_organizer_approved'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, active_status: 1, approval_status: 1 })
            result['events_created_by_organizer_rejected'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, approval_status: 2, active_status: 1 })
            result['events_created_by_organizer_disabled'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_organizer_deleted'] = await deleted_eventsM.countDocuments({ list_event_type: 2, created_by_admin_status: 0 })
            result['events_created_by_organizer_ongoing'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_organizer_upcoming'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_organizer_ended'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })

            // events created by admin/ subadmin
            // result['events_created_by_team'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] } })

            // result['events_created_by_team_published']  = await eventM.countDocuments({ created_by_admin_status:{$in:[1,2]}, active_status:1, approval_status:1 })
            result['events_created_by_team_disabled'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, approval_status: 1, active_status: 0 })
            result['events_created_by_team_pending'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, approval_status: 0, active_status: 1 })
            result['events_created_by_team_approved'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, active_status: 1, approval_status: 1 })
            result['events_created_by_team_rejected'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, approval_status: 2, active_status: 1 })
            result['events_created_by_team_deleted'] = await deleted_eventsM.countDocuments({ created_by_admin_status: { $in: [1, 2] } })
            result['events_created_by_team_ongoing'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_team_upcoming'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_team_ended'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_team'] =
                result['events_created_by_team_ongoing'] +
                result['events_created_by_team_upcoming'] +
                result['events_created_by_team_ended']


            // result['total_ongoing_created_by_user'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0 }, { start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            // result['total_upcoming_created_by_user'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0 }, { start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            // result['total_ended_created_by_user'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0 }, { end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            // result['top_users'] = await eventM.aggregate([
            //     {
            //         $match:{ $and:[{ created_by_admin_status:0},{ user_row_id:{$gt:0}},{active_status:1},{approval_status:1}]}
            //     },
            //     {
            //         $group: {
            //             _id: "$user_row_id",
            //             events_created: { 
            //                  $sum: 1 
            //             }
            //         } 
            //     },
            //     {
            //         $lookup:
            //             {
            //             from: "cln_professionals",
            //             localField: "_id",
            //             foreignField: "_id",
            //             as: "user_info"
            //             }
            //     },
            //     { $unwind: {  path: "$user_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $lookup: 
            //         {
            //             from: "cln_professionals_profile_images",
            //             localField: "_id",
            //             foreignField: "user_row_id", 
            //             as: "img_info"
            //         }
            //     },
            //     { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $lookup: 
            //         {
            //             from: "cln_company_lists",
            //             localField: "_id",
            //             foreignField: "user_row_id", 
            //             as: "company_info",

            //         }
            //     },
            //     { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $project:
            //         {
            //             events_created: 1,
            //             user_name: "$user_info.user_name",
            //             full_name: "$user_info.full_name",
            //             email_id: "$user_info.email_id",
            //             profile_image: "$img_info.profile_image",
            //             company_name: "$company_info.company_name",
            //             company_id: "$company_info.company_id",
            //             company_logo: "$company_info.company_logo",
            //         }
            //     },
            //     { $sort: { events_created:-1 }},
            // ]).limit(10)

            //Ticket Notification Starts Here

            const notifications_query = await eventM.aggregate([
                {
                    $lookup: {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_info",
                        pipeline: [
                            { $sort: { _id: -1 } },
                            { $limit: 1 },
                            { $project: { _id: 1, notify_status: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$notify_info", preserveNullAndEmptyArrays: true } },
                { $set: { notify_status: "$notify_info.notify_status" } },
                {
                    $lookup: {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_count",
                        pipeline: [{ $count: "count" }]
                    }
                },
                { $unwind: { path: "$notify_count", preserveNullAndEmptyArrays: false } },
                {
                    $lookup: {
                        from: "cln_event_tickets",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "tickets",
                        pipeline: [{ $count: "count" }]
                    }
                },
                { $unwind: { path: "$tickets", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: null,
                        total_events: { $sum: 1 },
                        notifications_sent: {
                            $sum: { $cond: [{ $eq: ["$notify_status", true] }, 1, 0] }
                        },
                        notifications_pending: {
                            $sum: { $cond: [{ $eq: ["$notify_status", false] }, 1, 0] }
                        }
                    }
                }
            ]);

            const published_counts = await eventM.aggregate([
                { $match: { active_status: 1, approval_status: 1 } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                {
                    $set: {
                        user_name: "$user_info.user_name"
                    }
                },

                {
                    $facet: {
                        total: [{ $count: "count" }],
                        ongoing: [
                            {
                                $match: {
                                    start_date: { $lte: new Date(present_time) },
                                    end_date: { $gte: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        upcoming: [
                            {
                                $match: {
                                    start_date: { $gt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        ended: [
                            {
                                $match: {
                                    end_date: { $lt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ]
                    }
                }
            ]);
            const publishedData = published_counts[0] || {}

            result['published_total'] = publishedData.total?.[0]?.count || 0
            result['published_ongoing'] = publishedData.ongoing?.[0]?.count || 0
            result['published_upcoming'] = publishedData.upcoming?.[0]?.count || 0
            result['published_ended'] = publishedData.ended?.[0]?.count || 0
            const baseMatch = {
                active_status: 1,
                approval_status: 1
            }

            // 1️⃣ USER-CREATED EVENTS (created_by_admin_status = 0)
            const userCreatedCounts = await eventM.aggregate([
                {
                    $match: {
                        ...baseMatch,
                        created_by_admin_status: 0
                    }
                },
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        ongoing: [
                            {
                                $match: {
                                    start_date: { $lte: new Date(present_time) },
                                    end_date: { $gte: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        upcoming: [
                            {
                                $match: {
                                    start_date: { $gt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        ended: [
                            {
                                $match: {
                                    end_date: { $lt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            const userData = userCreatedCounts[0] || {}

            result['user_events_published_total'] = userData.total?.[0]?.count || 0
            result['user_events_published_ongoing'] = userData.ongoing?.[0]?.count || 0
            result['user_events_published_upcoming'] = userData.upcoming?.[0]?.count || 0
            result['user_events_published_ended'] = userData.ended?.[0]?.count || 0

            const adminCreatedCounts = await eventM.aggregate([
                {
                    $match: {
                        ...baseMatch,
                        created_by_admin_status: { $in: [1, 2] }
                    }
                },
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        ongoing: [
                            {
                                $match: {
                                    start_date: { $lte: new Date(present_time) },
                                    end_date: { $gte: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        upcoming: [
                            {
                                $match: {
                                    start_date: { $gt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        ended: [
                            {
                                $match: {
                                    end_date: { $lt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            const adminData = adminCreatedCounts[0] || {}

            result['admin_published_total'] = adminData.total?.[0]?.count || 0
            result['admin_published_ongoing'] = adminData.ongoing?.[0]?.count || 0
            result['admin_published_upcoming'] = adminData.upcoming?.[0]?.count || 0
            result['admin_published_ended'] = adminData.ended?.[0]?.count || 0

            result['notifications_pending'] = notifications_query[0] ? notifications_query[0].notifications_pending : 0
            result['notifications_sent'] = notifications_query[0] ? notifications_query[0].notifications_sent : 0
            result['total_notifications_events'] = notifications_query[0] ? notifications_query[0].total_events : 0

            const ticket_query = await ticketM.distinct('event_row_id')
            result['events_without_ticket'] = await eventM.countDocuments({ end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1, _id: { $nin: ticket_query } })

            //Ticket Notification Ends Here

            //Attendees Invitation Starts Here
            const total_attendees_query = await event_attendeesM.aggregate([
                {
                    $match: { user_type: { $nin: ["", null] } }
                },
                {
                    $lookup: {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            user_row_id: '$user_row_id',
                            user_type: '$user_type'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, "$$user_type"] },
                                            { $eq: ['$_id', '$$user_row_id'] },
                                            { $eq: ["$login_status", 1] }
                                        ]
                                    }
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
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            user_type: '$user_type',
                            user_row_id: '$user_row_id'
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, "$$user_type"] },
                                            { $eq: ['$_id', "$$user_row_id"] }
                                        ]
                                    }
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
                { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $facet: {
                        total: [
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        accepted: [
                            {
                                $match: { invitation_status: 1 }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        pending: [
                            {
                                $match: { invitation_status: 0 }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                }
            ]);

            result['total_invitation_attendees'] = total_attendees_query[0].total[0] ? total_attendees_query[0].total[0].count : 0

            result['accepted_invitation_attendees'] = total_attendees_query[0].accepted[0] ? total_attendees_query[0].accepted[0].count : 0

            result['pending_invitation_attendees'] = total_attendees_query[0].pending[0] ? total_attendees_query[0].pending[0].count : 0

            // result['added_to_watchlist'] = await event_watchlistsM.countDocuments()

            //user login through events
            result['event_login_users'] = await professionals_ip_addressM.countDocuments({ domain_row_id: 3 })

            result['total_attendees_query'] = total_attendees_query

            res.json({ status: true, message: result })

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Events Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/new_events_overview', checkApiKey, async (req, res) => {
    try {
        let result = {}
        let key = "new_events_overview"
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            //employee list
            result['employees_events_reports'] = await eventM.aggregate([
                {
                    $match: { $and: [{ created_by_admin_status: 2 }, { created_by_sub_admin_id: { $gt: 0 } }, { active_status: 1 }] }
                },
                {
                    $group: {
                        _id: "$created_by_sub_admin_id",
                        events_created: {
                            $sum: 1
                        }
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "_id",
                        foreignField: "_id",
                        as: "subadmin_info",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_company_lists",
                                    localField: "_id",
                                    foreignField: "sub_admin_row_id",
                                    as: "company_info",
                                    pipeline: [{
                                        $project: { _id: 1 }
                                    }]
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "_id",
                                    foreignField: "sub_admin_row_id",
                                    as: "user_info",
                                    pipeline: [{
                                        $project: { _id: 1 }
                                    }]
                                }
                            },
                            {
                                $project: {
                                    full_name: 1,
                                    email_id: 1,
                                    total_company: { $size: "$company_info" },
                                    total_user: { $size: "$user_info" }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        full_name: "$subadmin_info.full_name"
                    }
                },
                // {
                //     $match:{full_name:{ "$nin": [ null, "" ] }}
                // },
                {
                    $sort: { events_created: -1 }
                },
                {
                    $project: {
                        _id: 1,
                        events_created: 1,
                        full_name: 1,
                        email_id: "$subadmin_info.email_id",
                        total_user: "$subadmin_info.total_user",
                        total_company: "$subadmin_info.total_company"
                    }
                }

            ])

            //Total events 

            const date_n_time = new Date(getPresentDateTime())
            // result['total_events']  = await eventM.countDocuments()
            result['pending_events'] = await eventM.countDocuments({ approval_status: 0, active_status: 1 })
            result['approved_events'] = await eventM.countDocuments({ approval_status: 1, active_status: 1 })
            result['rejected_events'] = await eventM.countDocuments({ approval_status: 2, active_status: 1 })
            result['disabled_events'] = await eventM.countDocuments({ active_status: 0, approval_status: 1 })
            result['deleted_events'] = await deleted_eventsM.countDocuments()
            result['total_events'] = result['pending_events'] + result['approved_events'] + result['rejected_events'] + result['disabled_events'] + result[deleted_events]

            result['upcomings_events'] = await eventM.countDocuments({ $and: [{ start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['completed_events'] = await eventM.countDocuments({ $and: [{ end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['ongoing_events'] = await eventM.countDocuments({ $and: [{ start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })

            //events created by host 
            result['events_created_by_host'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0 }] })
            // result['events_created_by_host_published']  = await eventM.countDocuments({  list_event_type:1, created_by_admin_status:0, active_status:1, approval_status:1})
            result['events_created_by_host_pending'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, approval_status: 0, active_status: 1 })
            result['events_created_by_host_approved'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, active_status: 1, approval_status: 1 })
            result['events_created_by_host_rejected'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, approval_status: 2, active_status: 1 })
            result['events_created_by_host_disabled'] = await eventM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_host_deleted'] = await deleted_eventsM.countDocuments({ list_event_type: 1, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_host_ongoing'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_upcoming'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_ended'] = await eventM.countDocuments({ $and: [{ list_event_type: 1, created_by_admin_status: 0, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })

            //events created by host organizer 
            result['events_created_by_host_n_organizer'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0 }] })
            // result['events_created_by_host_n_organizer_published']  = await eventM.countDocuments({ list_event_type:3, created_by_admin_status:0, approval_status:1})
            result['events_created_by_host_n_organizer_pending'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, approval_status: 0, active_status: 1 })
            result['events_created_by_host_n_organizer_approved'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, active_status: 1, approval_status: 1 })
            result['events_created_by_host_n_organizer_rejected'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, approval_status: 2, active_status: 1 })
            result['events_created_by_host_n_organizer_disabled'] = await eventM.countDocuments({ list_event_type: 3, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_host_n_organizer_ongoing'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_n_organizer_upcoming'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_host_n_organizer_ended'] = await eventM.countDocuments({ $and: [{ list_event_type: 3, created_by_admin_status: 0, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })

            //events created by organizer 
            result['events_created_by_organizer'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0 }] })
            // result['events_created_by_organizer_published']  = await eventM.countDocuments({ list_event_type:2, created_by_admin_status:0, active_status:1, approval_status:1 })
            result['events_created_by_organizer_pending'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, approval_status: 0, active_status: 1 })
            result['events_created_by_organizer_approved'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, active_status: 1, approval_status: 1 })
            result['events_created_by_organizer_rejected'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, approval_status: 2, active_status: 1 })
            result['events_created_by_organizer_disabled'] = await eventM.countDocuments({ list_event_type: 2, created_by_admin_status: 0, active_status: 0 })
            result['events_created_by_organizer_ongoing'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_organizer_upcoming'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_organizer_ended'] = await eventM.countDocuments({ $and: [{ list_event_type: 2, created_by_admin_status: 0, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })

            // events created by admin/ subadmin
            result['events_created_by_team'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] } })
            // result['events_created_by_team_published']  = await eventM.countDocuments({ created_by_admin_status:{$in:[1,2]}, active_status:1, approval_status:1 })
            result['events_created_by_team_disabled'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, active_status: 0 })
            result['events_created_by_team_pending'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, approval_status: 0, active_status: 1 })
            result['events_created_by_team_approved'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, active_status: 1, approval_status: 1 })
            result['events_created_by_team_rejected'] = await eventM.countDocuments({ created_by_admin_status: { $in: [1, 2] }, approval_status: 2, active_status: 1 })
            result['events_created_by_team_ongoing'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_team_upcoming'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, start_date: { $gte: date_n_time }, active_status: 1, approval_status: 1 }] })
            result['events_created_by_team_ended'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] }, end_date: { $lt: date_n_time }, active_status: 1, approval_status: 1 }] })

            // result['top_users'] = await eventM.aggregate([
            //     {
            //         $match:{ $and:[{ created_by_admin_status:0},{ user_row_id:{$gt:0}},{active_status:1},{approval_status:1}]}
            //     },
            //     {
            //         $group: {
            //             _id: "$user_row_id",
            //             events_created: { 
            //                  $sum: 1 
            //             }
            //         } 
            //     },
            //     {
            //         $lookup:
            //             {
            //             from: "cln_professionals",
            //             localField: "_id",
            //             foreignField: "_id",
            //             as: "user_info"
            //             }
            //     },
            //     { $unwind: {  path: "$user_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $lookup: 
            //         {
            //             from: "cln_professionals_profile_images",
            //             localField: "_id",
            //             foreignField: "user_row_id", 
            //             as: "img_info"
            //         }
            //     },
            //     { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $lookup: 
            //         {
            //             from: "cln_company_lists",
            //             localField: "_id",
            //             foreignField: "user_row_id", 
            //             as: "company_info",

            //         }
            //     },
            //     { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            //     {
            //         $project:
            //         {
            //             events_created: 1,
            //             user_name: "$user_info.user_name",
            //             full_name: "$user_info.full_name",
            //             email_id: "$user_info.email_id",
            //             profile_image: "$img_info.profile_image",
            //             company_name: "$company_info.company_name",
            //             company_id: "$company_info.company_id",
            //             company_logo: "$company_info.company_logo",
            //         }
            //     },
            //     { $sort: { events_created:-1 }},
            // ]).limit(10)

            //Ticket Notification Starts Here

            const notifications_query = await eventM.aggregate([
                {
                    $lookup: {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_info",
                        pipeline: [
                            { $sort: { _id: -1 } },
                            { $limit: 1 },
                            { $project: { _id: 1, notify_status: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$notify_info", preserveNullAndEmptyArrays: true } },
                { $set: { notify_status: "$notify_info.notify_status" } },
                {
                    $lookup: {
                        from: "cln_event_notify_professionals",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "notify_count",
                        pipeline: [{ $count: "count" }]
                    }
                },
                { $unwind: { path: "$notify_count", preserveNullAndEmptyArrays: false } },
                {
                    $lookup: {
                        from: "cln_event_tickets",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "tickets",
                        pipeline: [{ $count: "count" }]
                    }
                },
                { $unwind: { path: "$tickets", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: null,
                        total_events: { $sum: 1 },
                        notifications_sent: {
                            $sum: { $cond: [{ $eq: ["$notify_status", true] }, 1, 0] }
                        },
                        notifications_pending: {
                            $sum: { $cond: [{ $eq: ["$notify_status", false] }, 1, 0] }
                        }
                    }
                }
            ]);

            result['notifications_pending'] = notifications_query[0] ? notifications_query[0].notifications_pending : 0
            result['notifications_sent'] = notifications_query[0] ? notifications_query[0].notifications_sent : 0
            result['total_notifications_events'] = notifications_query[0] ? notifications_query[0].total_events : 0

            const ticket_query = await ticketM.distinct('event_row_id')
            result['events_without_ticket'] = await eventM.countDocuments({ end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1, _id: { $nin: ticket_query } })

            //Ticket Notification Ends Here

            //Attendees Invitation Starts Here
            const total_attendees_query = await event_attendeesM.aggregate([
                {
                    $match: { user_type: { $nin: ["", null] } }
                },
                {
                    $lookup: {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: {
                            user_row_id: '$user_row_id',
                            user_type: '$user_type'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, "$$user_type"] },
                                            { $eq: ['$_id', '$$user_row_id'] },
                                            { $eq: ["$login_status", 1] }
                                        ]
                                    }
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
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            user_type: '$user_type',
                            user_row_id: '$user_row_id'
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, "$$user_type"] },
                                            { $eq: ['$_id', "$$user_row_id"] }
                                        ]
                                    }
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
                { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $facet: {
                        total: [
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        accepted: [
                            {
                                $match: { invitation_status: 1 }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        pending: [
                            {
                                $match: { invitation_status: 0 }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                }
            ]);

            result['total_invitation_attendees'] = total_attendees_query[0].total[0] ? total_attendees_query[0].total[0].count : 0

            result['accepted_invitation_attendees'] = total_attendees_query[0].accepted[0] ? total_attendees_query[0].accepted[0].count : 0

            result['pending_invitation_attendees'] = total_attendees_query[0].pending[0] ? total_attendees_query[0].pending[0].count : 0

            result['added to watchlist'] = await event_watchlistsM.countDocuments()

            //user login through events
            result['event_login_users'] = await professionals_ip_addressM.countDocuments({ domain_row_id: 3 })

            result['total_attendees_query'] = total_attendees_query

            await setCache({ key: key, value: result, ttl: 120 })

            res.json({ status: true, message: result, cache_reponse_status: false })

            // }
            // else
            // {
            //     res.json(checkUserToken)
            // }

        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Events Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/new_other_details', checkApiKey, async (req, res) => {
    try {
        const date_n_time = new Date(getPresentDateTime())

        let result = {}
        let key = "new_other_details"
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            result['total_ongoing_created_by_admin'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] } }, { start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['total_ongoing_created_by_user'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0 }, { start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['total_upcoming_created_by_admin'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] } }, { start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['total_upcoming_created_by_user'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0 }, { start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['total_ended_created_by_admin'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: { $in: [1, 2] } }, { end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            result['total_ended_created_by_user'] = await eventM.countDocuments({ $and: [{ created_by_admin_status: 0 }, { end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })
            await setCache({ key: key, value: result, ttl: 60 })

            res.json({ status: true, message: result, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
        // }
        // else
        // {
        //     res.json(checkUserToken)
        // }
    }
    catch (err) {
        console.log('Events Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/other_details', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            const date_n_time = new Date(getPresentDateTime())

            let result = {}

            const filter = req.query.filter || 'all';
            const now = new Date();
            const ranges = {
                '1w': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                '1m': new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
                '6m': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
                '1y': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            };

            const dateFilter = {};
            if (filter !== 'all' && ranges[filter]) {
                dateFilter.date_n_time = { $gte: ranges[filter] };
            }

            const buildQuery = (conditions = {}) => {
                return { ...conditions, ...dateFilter };
            };
            // (buildQuery({ approval_status: 0, active_status: 1 }))
            result['total_ongoing_created_by_admin'] = await eventM.countDocuments(buildQuery({ $and: [{ created_by_admin_status: { $in: [1, 2] } }, { start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] }))
            result['total_ongoing_created_by_user'] = await eventM.countDocuments(buildQuery({ $and: [{ created_by_admin_status: 0 }, { start_date: { $lte: date_n_time }, end_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] }))
            result['total_upcoming_created_by_admin'] = await eventM.countDocuments(buildQuery({ $and: [{ created_by_admin_status: { $in: [1, 2] } }, { start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] }))
            result['total_upcoming_created_by_user'] = await eventM.countDocuments(buildQuery(({ $and: [{ created_by_admin_status: 0 }, { start_date: { $gte: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] })))
            result['total_ended_created_by_admin'] = await eventM.countDocuments(buildQuery({ $and: [{ created_by_admin_status: { $in: [1, 2] } }, { end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] }))
            result['total_ended_created_by_user'] = await eventM.countDocuments(buildQuery({ $and: [{ created_by_admin_status: 0 }, { end_date: { $lt: date_n_time } }, { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }] }))

            res.json({ status: true, message: result })
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Events Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/event_attendees_count', checkApiKey, async (req, res) => {

    try {
        let key = "event_attendees_count"
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            let query = Number.parseInt(req.query.status) == 1 ? {
                $and: [
                    { invitation_type: 2 },
                ],
            } : {}
            const email_count_query = await event_attendeesM.aggregate([
                { $match: query },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { active_status: 1, approval_status: 1 }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "user_info",
                                    pipeline: [
                                        {
                                            $match: { login_status: 1, approval_status: 1 }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                login_status: 1,
                                                approval_status: 1,
                                            }
                                        },
                                        { $limit: 1 },
                                    ]
                                }
                            },
                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_company_lists",
                                    localField: "company_row_id",
                                    foreignField: "_id",
                                    as: "company_info",
                                    pipeline: [
                                        { $match: { active_status: 1, approval_status: 1 } },
                                        {
                                            $project: {
                                                _id: 1,
                                                approval_status: 1,
                                                active_status: 1,
                                            }
                                        },
                                        { $limit: 1 },
                                    ]
                                }
                            },
                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set:
                                {
                                    login_status: { $cond: { if: "$user_row_id", then: "$user_info.login_status", else: 1 } },
                                    company_active_status: { $cond: { if: "$company_row_id", then: "$company_info.active_status", else: 1 } },
                                }
                            },
                            {
                                $match: {
                                    $or: [
                                        { login_status: 1, list_event_type: 1 },
                                        { company_active_status: 1, list_event_type: 2 },
                                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                                    ]
                                }
                            },
                            {
                                $project:
                                {
                                    user_approval_status: "$user_info.approval_status",
                                    user_login_status: "$user_info.login_status",
                                    company_active_status: "$company_info.active_status",
                                    company_approval_status: "$company_info.approval_status",
                                }
                            },
                            { $limit: 1 },
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            user_row_id: '$user_row_id',
                            user_type: '$user_type'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$user_type'] },
                                            { $eq: ['$_id', '$$user_row_id'] }
                                        ]
                                    },
                                    // login_status: 1
                                }
                            },
                            { $limit: 1 },
                            {
                                $project: {
                                    _id: 1,
                                    approval_status: 1,
                                    login_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            user_row_id: '$user_row_id',
                            user_type: '$user_type'
                        },
                        as: "user_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$user_type'] },
                                            { $eq: ['$_id', '$$user_row_id'] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                }
                            },
                            { $limit: 1 },
                        ]
                    }
                },
                { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        user_data: {
                            $switch: {
                                branches: [
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$user_type', 1] }
                                            ]
                                        },
                                        then: "$user_info"
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$user_type', 2] }
                                            ]
                                        },
                                        then: "$user_manual_info"
                                    },
                                ],
                                default: ""
                            }
                        },
                    }
                },
                {
                    $match: {
                        user_data: { $ne: "" }
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_emails_events",
                        localField: "sg_message_id",
                        foreignField: "sg_message_id",
                        as: "email_info",
                        pipeline: [
                            {
                                $sort: { _id: -1 },
                            },
                            { $limit: 1 },
                            {
                                $project: {
                                    event_type: 1,
                                    sg_message_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: { sg_message_id: "$email_info.sg_message_id", event_type: "$email_info.event_type", attendee_row_id: "$email_info.attendee_row_id" },
                        unique_event: { $first: "$email_info" }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalProcessed: { $sum: { $cond: [{ $eq: ["$_id.event_type", "processed"] }, 1, 0] } },
                        totalDeferred: { $sum: { $cond: [{ $eq: ["$_id.event_type", "deferred"] }, 1, 0] } },
                        totalDelivered: { $sum: { $cond: [{ $eq: ["$_id.event_type", "delivered"] }, 1, 0] } },
                        totalOpen: { $sum: { $cond: [{ $eq: ["$_id.event_type", "open"] }, 1, 0] } },
                        totalBounceDrops: { $sum: { $cond: [{ $eq: ["$_id.event_type", "drop"] }, 1, 0] } },
                        totalBounce: { $sum: { $cond: [{ $eq: ["$_id.event_type", "bounce"] }, 1, 0] } }
                    }
                },
                {
                    $project:
                    {
                        _id: 1,
                        email_info: "$email_info",
                        totalProcessed: 1,
                        totalDeferred: 1,
                        totalDelivered: 1,
                        totalOpen: 1,
                        totalBounceDrops: 1,
                        totalBounce: 1,

                    }
                }
            ])

            const count_query = await event_attendeesM.aggregate([
                { $match: query },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { active_status: 1, approval_status: 1 }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "user_info",
                                    pipeline: [
                                        {
                                            $match: { login_status: 1, approval_status: 1 }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                login_status: 1,
                                                approval_status: 1,
                                            }
                                        },
                                        { $limit: 1 },
                                    ]
                                }
                            },
                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_company_lists",
                                    localField: "company_row_id",
                                    foreignField: "_id",
                                    as: "company_info",
                                    pipeline: [
                                        { $match: { active_status: 1, approval_status: 1 } },
                                        {
                                            $project: {
                                                _id: 1,
                                                approval_status: 1,
                                                active_status: 1,
                                            }
                                        },
                                        { $limit: 1 },
                                    ]
                                }
                            },
                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set:
                                {
                                    login_status: { $cond: { if: "$user_row_id", then: "$user_info.login_status", else: 1 } },
                                    company_active_status: { $cond: { if: "$company_row_id", then: "$company_info.active_status", else: 1 } },
                                }
                            },
                            {
                                $match: {
                                    $or: [
                                        { login_status: 1, list_event_type: 1 },
                                        { company_active_status: 1, list_event_type: 2 },
                                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                                    ]
                                }
                            },
                            {
                                $project:
                                {
                                    _id: 1,
                                }
                            },
                            { $limit: 1 },
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            user_row_id: '$user_row_id',
                            user_type: '$user_type'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$user_type'] },
                                            { $eq: ['$_id', '$$user_row_id'] },
                                            { $eq: ['$login_status', 1] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                }
                            },
                            { $limit: 1 },
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_manual_retrievals",
                        let: {
                            user_row_id: '$user_row_id',
                            user_type: '$user_type'
                        },
                        as: "user_manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$user_type'] },
                                            { $eq: ['$_id', '$$user_row_id'] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                }
                            },
                            { $limit: 1 },
                        ]
                    }
                },
                { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        user_data: {
                            $switch: {
                                branches: [
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$user_type', 1] }
                                            ]
                                        },
                                        then: "$user_info"
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$user_type', 2] }
                                            ]
                                        },
                                        then: "$user_manual_info"
                                    },
                                ],
                                default: ""
                            }
                        },
                    }
                },
                {
                    $match: {
                        user_data: { $ne: "" }
                    }
                },
                {
                    $count: "count"
                }
            ])

            const attendes_count = count_query[0] ? count_query[0].count : 0
            const result = { email_counts: email_count_query[0] ? email_count_query[0] : [], attendes_count: attendes_count };

            await setCache({ key: key, value: result, ttl: 120 });

            res.json({ status: true, ...result, cache_response_status: false });

        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('All attendees list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }

})

//Claimed orgaization and users created organizations list
router.get('/host_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{}]
            if (req.query.search) {
                const search_value = (req.query.search).trim()
                query.push({
                    $or: [
                        { user_name: { '$regex': search_value, $options: 'i' } },
                        { full_name: { '$regex': search_value, $options: 'i' } },
                        { email_id: { '$regex': search_value, $options: 'i' } },
                        { company_name: { '$regex': search_value, $options: 'i' } },
                        { company_email_id: { '$regex': search_value, $options: 'i' } },
                        { company_id: { '$regex': search_value, $options: 'i' } }
                    ]
                })
            }

            let search_query = { $and: query }
            const check_query = await professionalsM.aggregate([
                {
                    $match: {
                        login_status: 1, approval_status: 1
                    }
                },
                {
                    $lookup: {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: {
                                    // approval_status:1,
                                    // active_status:1
                                }
                            },
                            { $group: { _id: null, count: { $sum: 1 } } },
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $set: {
                        total_events: "$event_info.count"
                    }
                },
                {
                    $sort: {
                        total_events: -1
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
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "company_info",

                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        company_name: "$company_info.company_name",
                        company_email_id: "$company_info.company_email_id",
                        company_id: "$company_info.company_id",
                        company_active_status: "$company_info.active_status"
                    }
                },
                { $match: search_query },
                {
                    $project:
                    {
                        _id: 1,
                        user_name: 1,
                        full_name: 1,
                        email_id: 1,
                        profile_image: "$img_info.profile_image",
                        company_logo: "$company_info.company_logo",
                        company_name: 1,
                        company_email_id: 1,
                        company_id: 1,
                        company_active_status: 1,
                        pro_batch: 1,
                        total_events: 1
                    }
                }
            ]).skip(skip).limit(limit).collation({ locale: 'en', strength: 2 })


            const count_query = await professionalsM.aggregate([
                {
                    $match: {
                        login_status: 1, approval_status: 1
                    }
                },
                {
                    $lookup: {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: {
                                    // approval_status:1,
                                    // active_status:1
                                }
                            },
                            { $group: { _id: null, count: { $sum: 1 } } },
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "company_info",

                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_email_id: "$company_info.company_email_id",
                        company_id: "$company_info.company_id"
                    }
                },
                { $match: search_query },
                {
                    $count: "count"
                }
            ]).collation({ locale: 'en', strength: 2 })

            let organizers_count = 0
            if (count_query[0]) {
                organizers_count = count_query[0].count
            }

            res.json({ status: true, message: check_query, count: organizers_count })

        }
        catch (err) {
            console.log('Hosts list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }
})

//Host individual view
router.get('/host_view/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            let user_row_id = Number.parseInt(req.params.user_row_id)
            let query = [{ user_row_id: user_row_id }]

            if (req.query.search) {
                query.push({ event_title: { '$regex': req.query.search, $options: 'i' } })
            }

            if (req.query.list_event_type) {
                query.push({ list_event_type: Number.parseInt(req.query.list_event_type) })
            }

            //1. Pending, 2.Approved, 3. Rejected, 4.Disabled
            if (req.query.status) {
                const status = Number.parseInt(req.query.status)
                if (status === 1) {
                    query.push({ active_status: 1, approval_status: 0 })
                }
                else if (status === 2) {
                    query.push({ active_status: 1, approval_status: 1 })
                }
                else if (status === 3) {
                    query.push({ active_status: 1, approval_status: 2 })
                }
                else if (status === 4) {
                    query.push({ active_status: 0 })
                }
            }


            if (req.query.approval_status) {
                query.push({ approval_status: Number.parseInt(req.query.approval_status) })
            }

            if (!Number.isNaN(user_row_id)) {

                const company_query = await eventM.aggregate([
                    {
                        $match: { $and: query }

                    },
                    {
                        $sort: { start_date: -1 }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_events_utc_dates",
                            localField: "utc_row_id",
                            foreignField: "_id",
                            as: "utc_dates"
                        }
                    },
                    { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            event_title: 1,
                            event_url: 1,
                            list_event_type: 1,
                            active_status: 1,
                            start_date: 1,
                            end_date: 1,
                            event_type: 1,
                            event_image: 1,
                            event_price: 1,
                            approval_status: 1,
                            utc_time: "$utc_dates.utc_time",
                        }
                    }
                ])



                res.json({ status: true, message: { events_list: company_query, counts: company_query.length }, query })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }


        }
        catch (err) {
            console.log('Host individual view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }
})


router.get('/unclaimed_users/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{ claim_status: 1, total_events: { $gt: 0 } }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                        { company_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            let search_query = { $and: query }
            const queryRun = await professionals_created_by_adminM.aggregate([
                { $sort: { _id: -1 } },
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
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "company_info",

                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }]
                    }
                },
                {
                    $addFields: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        profile_image: "$img_info.profile_image",
                        company_logo: "$company_info.company_logo",
                        company_name: "$company_info.company_name",
                        company_email_id: "$company_info.company_email_id",
                        company_id: "$company_info.company_id",
                        total_events: { $size: "$event_info" }
                    }
                },
                { $match: search_query },
                {
                    $sort: {
                        total_events: -1
                    }
                },
                {
                    $project:
                    {
                        _id: 1,
                        user_row_id: 1,
                        user_name: 1,
                        full_name: 1,
                        email_id: 1,
                        profile_image: 1,
                        company_logo: 1,
                        company_name: 1,
                        company_email_id: 1,
                        company_id: 1,
                        total_events: 1
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await professionals_created_by_adminM.aggregate([
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
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "company_info",

                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }]
                    }
                },
                {
                    $addFields: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        profile_image: "$img_info.profile_image",
                        company_logo: "$company_info.company_logo",
                        company_name: "$company_info.company_name",
                        company_email_id: "$company_info.company_email_id",
                        company_id: "$company_info.company_id",
                        total_events: { $size: "$event_info" }
                    }
                },
                { $match: search_query },
                {
                    $count: "count"
                }
            ])

            let unclaimed_users_count = 0
            if (count_query[0]) {
                unclaimed_users_count = count_query[0].count
            }

            res.json({ status: true, message: queryRun, count: unclaimed_users_count })
        }
        catch (err) {
            console.log('Unclaimed users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }
})

router.get('/admin_organizers_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            let query = [{ active_status: 1, total_events: { $gt: 0 } }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                        { company_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            let search_query = { $and: query }


            const check_query = await companyM.aggregate([
                {
                    $match: {
                        $or: [
                            { user_row_id: null },
                            { user_row_id: 0 }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { _id: { $exists: true } }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }]
                    }
                },
                {
                    $set: {
                        total_events: { $size: "$event_info" }
                    }
                },
                {
                    $sort: {
                        total_events: -1
                    }
                },
                { $match: search_query },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        company_name: 1,
                        company_id: 1,
                        company_email_id: 1,
                        company_logo: 1,
                        total_events: 1
                    }
                }

            ]).skip(skip).limit(limit)

            const count_query = await companyM.aggregate([
                {
                    $match: {
                        $or: [
                            { user_row_id: null },
                            { user_row_id: 0 }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { _id: { $exists: true } }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }]
                    }
                },
                {
                    $set: {
                        total_events: { $size: "$event_info" }
                    }
                },
                { $match: search_query },
                {
                    $count: "count"
                }
            ])
            let organizers_count = 0
            if (count_query[0]) {
                organizers_count = count_query[0].count
            }


            res.json({ status: true, message: check_query, count: organizers_count })
        }
        catch (err) {
            console.log('Admin organizers list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }
})

router.get('/admin_organizers_view/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            let company_row_id = Number.parseInt(req.params.company_row_id)
            let query = [{ _id: { $exists: true } }]
            if (req.query.search) {
                query.push({ event_title: { '$regex': req.query.search, $options: 'i' } })
            }
            if (req.query.status) {
                const status = Number.parseInt(req.query.status)
                if (status === 1) {
                    query.push({ active_status: 1, approval_status: 0 })
                }
                else if (status === 2) {
                    query.push({ active_status: 1, approval_status: 1 })
                }
                else if (status === 3) {
                    query.push({ active_status: 1, approval_status: 2 })
                }
                else if (status === 4) {
                    query.push({ active_status: 0 })
                }
            }
            if (req.query.approval_status) {
                query.push({ approval_status: Number.parseInt(req.query.approval_status) })
            }
            if (!Number.isNaN(company_row_id)) {
                const company_query = await companyM.aggregate([
                    { $match: { _id: company_row_id } },
                    {
                        $lookup: {
                            from: "cln_static_company_business_models",
                            localField: "main_business_model_id",
                            foreignField: "_id",
                            as: "main_business_info"
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_static_company_business_models",
                            localField: "business_model_id",
                            foreignField: "_id",
                            as: "business_model_info"
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_events",
                            localField: "_id",
                            foreignField: "company_row_id",
                            as: "event_info",
                            pipeline: [
                                {
                                    $match: { $and: query }
                                },
                                {
                                    $lookup:
                                    {
                                        from: "cln_events_utc_dates",
                                        localField: "utc_row_id",
                                        foreignField: "_id",
                                        as: "utc_dates"
                                    }
                                },
                                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        event_title: 1,
                                        event_url: 1,
                                        list_event_type: 1,
                                        active_status: 1,
                                        start_date: 1,
                                        end_date: 1,
                                        event_type: 1,
                                        event_image: 1,
                                        event_price: 1,
                                        approval_status: 1,
                                        utc_time: "$utc_dates.utc_time",
                                    }
                                },
                                {
                                    $sort: { start_date: -1 }
                                }
                            ]
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            company_id: 1,
                            company_name: 1,
                            company_email_id: 1,
                            company_location: 1,
                            established_in: 1,
                            website_link: 1,
                            event_info: "$event_info",
                            main_business_model_name: "$main_business_info.business_name",
                            business_model_name: "$business_model_info.business_name",
                            count: { $size: '$event_info' }
                        }
                    }

                ])


                res.json({ status: true, message: company_query })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }


        }
        catch (err) {
            console.log('Admin organizers individual view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }
})

router.get('/subadmin_overview', async (req, res) => {

    const checkUserToken = checkAdminLoginToken(req.headers, [1, 7, 10])
    if (checkUserToken.status) {
        try {
            let admin_row_id = Number.parseInt(checkUserToken.message.admin_row_id)

            const total_events = await eventM.countDocuments({ created_by_admin_status: 2, created_by_sub_admin_id: admin_row_id })
            const subadmin_data = await sub_adminM.findOne({ _id: admin_row_id }, { full_name: 1, email_id: 1 })
            const total_companies = await companyM.countDocuments({ sub_admin_row_id: admin_row_id })
            const total_users = await professionalsM.countDocuments({ sub_admin_row_id: admin_row_id })
            const total_speakers_query = await eventM.aggregate([
                {
                    $match: { created_by_sub_admin_id: admin_row_id }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]

                    }
                },
                {
                    $set: {
                        count: { $size: "$speakers_info" }
                    }
                }
            ])
            const total_speakers = total_speakers_query.reduce((total, event) => total + event.count, 0)

            const date = EventsstartAndEndOfToday(getPresentDateOnly())
            const today_events = await eventM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(date.start_date) } }, { created_date_n_time: { $lte: new Date(date.end_date) } }]
            })

            const today_organizers_query = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                $and: [
                    { updated_date_n_time: { $gte: new Date(date.start_date) } },
                    { updated_date_n_time: { $lte: new Date(date.end_date) } }
                ]
            })

            const today_speakers_query = await eventM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]

                    }
                },
                {
                    $match: {
                        created_by_sub_admin_id: admin_row_id,
                        $and: [{ created_date_n_time: { $gte: new Date(date.start_date) } }, { created_date_n_time: { $lte: new Date(date.end_date) } }]
                    }
                },
                {
                    $set: {
                        count: { $size: "$speakers_info" }
                    }
                }
            ])
            const today_speakers = today_speakers_query.reduce((total, event) => total + event.count, 0)


            const today_users_query = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                $and: [
                    { created_date_n_time: { $gte: new Date(date.start_date) } },
                    { created_date_n_time: { $lte: new Date(date.end_date) } }
                ]
            })

            res.json({
                status: true, message: {
                    today_events: today_events,
                    today_organizers: today_organizers_query,
                    today_speakers: today_speakers,
                    total_speakers: total_speakers,
                    today_users: today_users_query,
                    total_events: total_events,
                    subadmin_data: subadmin_data,
                    total_companies: total_companies,
                    total_users: total_users

                }
            })

        }
        catch (err) {
            console.log('Subadmin Overview.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
})


router.get('/subadmin_all', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1, 7, 10])
    if (checkToken.status) {
        try {
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const day = startAndEndOfToday()
            const week = EventstartAndEndOfWeek()
            const month_start_date = EventsstartAndEndOfToday(req.query.start_date)
            const month_end_date = EventsstartAndEndOfToday(req.query.end_date)
            const start_date = month_start_date.start_date
            const end_date = month_end_date.end_date
            let resultArray = {}
            //   events

            resultArray['days_pending_events'] = await eventM.countDocuments({
                approval_status: 0, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(day.start_date) } }, { created_date_n_time: { $lte: new Date(day.end_date) } }], active_status: 1
            })

            resultArray['days_approved_events'] = await eventM.countDocuments({
                approval_status: 1, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(day.start_date) } }, { created_date_n_time: { $lte: new Date(day.end_date) } }], active_status: 1
            })

            resultArray['days_rejected_events'] = await eventM.countDocuments({
                approval_status: 2, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(day.start_date) } }, { created_date_n_time: { $lte: new Date(day.end_date) } }], active_status: 1
            })

            resultArray['days_disabled_events'] = await eventM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(day.start_date) } }, { created_date_n_time: { $lte: new Date(day.end_date) } }], active_status: 0
            })

            resultArray['days_deleted_events'] = await deleted_eventsM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ date_n_time: { $gte: new Date(day.start_date) } }, { date_n_time: { $lte: new Date(day.end_date) } }]
            })

            resultArray['month_pending_events'] = await eventM.countDocuments({
                approval_status: 0, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(start_date) } }, { created_date_n_time: { $lte: new Date(end_date) } }], active_status: 1
            })

            resultArray['month_approved_events'] = await eventM.countDocuments({
                approval_status: 1, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(start_date) } }, { created_date_n_time: { $lte: new Date(end_date) } }], active_status: 1
            })

            resultArray['month_rejected_events'] = await eventM.countDocuments({
                approval_status: 2, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(start_date) } }, { created_date_n_time: { $lte: new Date(end_date) } }], active_status: 1
            })

            resultArray['month_disabled_events'] = await eventM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(start_date) } }, { created_date_n_time: { $lte: new Date(end_date) } }], active_status: 0
            })

            resultArray['month_deleted_events'] = await deleted_eventsM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ date_n_time: { $gte: new Date(start_date) } }, { date_n_time: { $lte: new Date(end_date) } }]
            })

            resultArray['week_pending_events'] = await eventM.countDocuments({
                approval_status: 0, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(week.start_date) } }, { created_date_n_time: { $lte: new Date(week.end_date) } }], active_status: 1
            })

            resultArray['week_approved_events'] = await eventM.countDocuments({
                approval_status: 1, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(week.start_date) } }, { created_date_n_time: { $lte: new Date(week.end_date) } }], active_status: 1
            })

            resultArray['week_rejected_events'] = await eventM.countDocuments({
                approval_status: 2, created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(week.start_date) } }, { created_date_n_time: { $lte: new Date(week.end_date) } }], active_status: 1
            })

            resultArray['week_disabled_events'] = await eventM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ created_date_n_time: { $gte: new Date(week.start_date) } }, { created_date_n_time: { $lte: new Date(week.end_date) } }], active_status: 0
            })

            resultArray['week_deleted_events'] = await deleted_eventsM.countDocuments({
                created_by_sub_admin_id: admin_row_id,
                $and: [{ date_n_time: { $gte: new Date(week.start_date) } }, { date_n_time: { $lte: new Date(week.end_date) } }]
            })

            // speakers
            const day_speakers_query = await eventM.aggregate([
                {
                    $match: {
                        created_by_sub_admin_id: admin_row_id,
                        $and: [{ created_date_n_time: { $gte: new Date(day.start_date) } }, { created_date_n_time: { $lte: new Date(day.end_date) } }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]

                    }
                },
                {
                    $set: {
                        count: { $size: "$speakers_info" }
                    }
                }
            ])
            resultArray['day_speakers'] = day_speakers_query.reduce((total, event) => total + event.count, 0)

            const week_speakers_query = await eventM.aggregate([
                {
                    $match: {
                        created_by_sub_admin_id: admin_row_id,
                        $and: [{ created_date_n_time: { $gte: new Date(week.start_date) } }, { created_date_n_time: { $lte: new Date(week.end_date) } }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]

                    }
                },
                {
                    $set: {
                        count: { $size: "$speakers_info" }
                    }
                }
            ])
            resultArray['week_speakers'] = week_speakers_query.reduce((total, event) => total + event.count, 0)

            const month_speakers_query = await eventM.aggregate([
                {
                    $match: {
                        created_by_sub_admin_id: admin_row_id,
                        $and: [{ created_date_n_time: { $gte: new Date(start_date) } }, { created_date_n_time: { $lte: new Date(end_date) } }]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]

                    }
                },
                {
                    $set: {
                        count: { $size: "$speakers_info" }
                    }
                }
            ])
            resultArray['month_speakers'] = month_speakers_query.reduce((total, event) => total + event.count, 0)


            // organizers

            resultArray['day_pending_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 0,
                active_status: 1,
                $and: [{ updated_date_n_time: { $gte: new Date(day.start_date) } }, { updated_date_n_time: { $lte: new Date(day.end_date) } }]
            })

            resultArray['day_approved_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                active_status: 1,
                $and: [{ updated_date_n_time: { $gte: new Date(day.start_date) } },
                { updated_date_n_time: { $lte: new Date(day.end_date) } }]
            })

            resultArray['day_rejected_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 2,
                $and: [{ updated_date_n_time: { $gte: new Date(day.start_date) } },
                { updated_date_n_time: { $lte: new Date(day.end_date) } }]
            })

            resultArray['day_disabled_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                active_status: 0,
                $and: [{ updated_date_n_time: { $gte: new Date(day.start_date) } },
                { updated_date_n_time: { $lte: new Date(day.end_date) } }]
            })

            resultArray['day_claimed_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                active_status: 1,
                claim_status: 2,
                $and: [{ updated_date_n_time: { $gte: new Date(day.start_date) } },
                { updated_date_n_time: { $lte: new Date(day.end_date) } }]
            })

            resultArray['day_deleted_organizers'] = await company_deleted_historyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                $and: [{ date_n_time: { $gte: new Date(day.start_date) } },
                { date_n_time: { $lte: new Date(day.end_date) } }]
            })

            // week

            resultArray['week_pending_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 0,
                active_status: 1,
                $and: [{ updated_date_n_time: { $gte: new Date(week.start_date) } },
                { updated_date_n_time: { $lte: new Date(week.end_date) } }]
            })

            resultArray['week_approved_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                active_status: 1,
                $and: [{ updated_date_n_time: { $gte: new Date(week.start_date) } },
                { updated_date_n_time: { $lte: new Date(week.end_date) } }]
            })

            resultArray['week_rejected_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 2,
                $and: [{ updated_date_n_time: { $gte: new Date(week.start_date) } },
                { updated_date_n_time: { $lte: new Date(week.end_date) } }]
            })

            resultArray['week_disabled_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                active_status: 0,
                $and: [{ updated_date_n_time: { $gte: new Date(week.start_date) } },
                { updated_date_n_time: { $lte: new Date(week.end_date) } }]
            })

            resultArray['week_claimed_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                active_status: 1,
                claim_status: 2,
                $and: [{ updated_date_n_time: { $gte: new Date(week.start_date) } },
                { updated_date_n_time: { $lte: new Date(week.end_date) } }]
            })
            resultArray['week_deleted_organizers'] = await company_deleted_historyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                $and: [{ date_n_time: { $gte: new Date(week.start_date) } },
                { date_n_time: { $lte: new Date(week.end_date) } }]
            })

            // month

            resultArray['month_pending_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 0,
                active_status: 1,
                $and: [{ updated_date_n_time: { $gte: new Date(start_date) } },
                { updated_date_n_time: { $lte: new Date(end_date) } }]
            })

            resultArray['month_approved_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                active_status: 1,
                $and: [{ updated_date_n_time: { $gte: new Date(start_date) } },
                { updated_date_n_time: { $lte: new Date(end_date) } }]
            })

            resultArray['month_rejected_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 2,
                $and: [{ updated_date_n_time: { $gte: new Date(start_date) } },
                { updated_date_n_time: { $lte: new Date(end_date) } }]
            })

            resultArray['month_disabled_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                active_status: 0,
                $and: [{ updated_date_n_time: { $gte: new Date(start_date) } },
                { updated_date_n_time: { $lte: new Date(end_date) } }]
            })

            resultArray['month_claimed_organizers'] = await companyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                active_status: 1,
                claim_status: 2,
                $and: [{ updated_date_n_time: { $gte: new Date(start_date) } },
                { updated_date_n_time: { $lte: new Date(end_date) } }]
            })
            resultArray['month_deleted_organizers'] = await company_deleted_historyM.countDocuments({
                sub_admin_row_id: admin_row_id,
                $and: [{ date_n_time: { $gte: new Date(start_date) } },
                { date_n_time: { $lte: new Date(end_date) } }]
            })

            // users

            resultArray['day_pending_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 0,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(day.start_date) } },
                    { created_date_n_time: { $lte: new Date(day.end_date) } }
                ]
            })

            resultArray['day_approved_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(day.start_date) } },
                    { created_date_n_time: { $lte: new Date(day.end_date) } }
                ]
            })

            resultArray['day_rejected_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 2,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(day.start_date) } },
                    { created_date_n_time: { $lte: new Date(day.end_date) } }
                ]
            })

            resultArray['day_disabled_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                login_status: 0,
                $and: [
                    { created_date_n_time: { $gte: new Date(day.start_date) } },
                    { created_date_n_time: { $lte: new Date(day.end_date) } }
                ]
            })
            resultArray['day_claimed_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                login_status: 1,
                claim_status: 2,
                $and: [
                    { created_date_n_time: { $gte: new Date(day.start_date) } },
                    { created_date_n_time: { $lte: new Date(day.end_date) } }
                ]
            })

            // week

            resultArray['week_pending_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 0,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(week.start_date) } },
                    { created_date_n_time: { $lte: new Date(week.end_date) } }
                ]
            })

            resultArray['week_approved_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(week.start_date) } },
                    { created_date_n_time: { $lte: new Date(week.end_date) } }
                ]
            })

            resultArray['week_rejected_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 2,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(week.start_date) } },
                    { created_date_n_time: { $lte: new Date(week.end_date) } }
                ]
            })

            resultArray['week_disabled_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                login_status: 0,
                $and: [
                    { created_date_n_time: { $gte: new Date(week.start_date) } },
                    { created_date_n_time: { $lte: new Date(week.end_date) } }
                ]
            })

            resultArray['week_claimed_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                login_status: 1,
                claim_status: 2,
                $and: [
                    { created_date_n_time: { $gte: new Date(week.start_date) } },
                    { created_date_n_time: { $lte: new Date(week.end_date) } }
                ]
            })

            // month

            resultArray['month_pending_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 0,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(start_date) } },
                    { created_date_n_time: { $lte: new Date(end_date) } }
                ]
            })

            resultArray['month_approved_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(start_date) } },
                    { created_date_n_time: { $lte: new Date(end_date) } }
                ]
            })

            resultArray['month_rejected_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 2,
                login_status: 1,
                $and: [
                    { created_date_n_time: { $gte: new Date(start_date) } },
                    { created_date_n_time: { $lte: new Date(end_date) } }
                ]
            })

            resultArray['month_disabled_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                login_status: 0,
                $and: [
                    { created_date_n_time: { $gte: new Date(start_date) } },
                    { created_date_n_time: { $lte: new Date(end_date) } }
                ]
            })

            resultArray['month_claimed_users'] = await professionalsM.countDocuments({
                sub_admin_row_id: admin_row_id,
                approval_status: 1,
                login_status: 1,
                claim_status: 2,
                $and: [
                    { created_date_n_time: { $gte: new Date(start_date) } },
                    { created_date_n_time: { $lte: new Date(end_date) } }
                ]
            })

            res.json({ status: true, message: resultArray })

        }
        catch (err) {
            console.log('Subadmin all overview.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkToken)
    }

})

router.get('/admin_location_search', async (req, res) => {
    try {
        let search_query = [{ _id: { $nin: ["", null] }, event_type: { $in: [1, 3] }, active_status: 1 }]

        if (req.query.search) {
            search_query.push({ event_venue: { $regex: req.query.search, $options: 'i' } })
        }
        const query_run = await eventM.aggregate([
            {
                $match: { $and: search_query }
            },
            { $group: { _id: '$event_venue', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            {
                $limit: 20
            }
        ])

        res.json({ status: true, message: query_run })

    }
    catch (err) {
        console.log('Admin location search.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/organizers_view/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            let user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const queryRun = await professionalsM.findOne({ _id: user_row_id })
                let resObject = {}
                if (queryRun) {
                    resObject['_id'] = queryRun._id
                    resObject['user_name'] = queryRun.user_name
                    resObject['full_name'] = queryRun.full_name
                    resObject['email_id'] = queryRun.email_id
                    resObject['login_status'] = queryRun.login_status
                    resObject['mobile_number'] = queryRun.mobile_number
                    resObject['designation_id_array'] = queryRun.designation_id
                    resObject['designation_name_list'] = []
                    if (queryRun.designation_id) {
                        resObject['designation_name_list'] = await user_designationsM.find({ _id: { $in: queryRun.designation_id }, active_status: true }, { designation_name: 1 })
                    }
                    const user_designation_head = await professionals_work_experienceM.find({ user_row_id: queryRun._id, till_date_status: 2 }, { position: 1, company_name: 1, till_date_status: 1 }).sort({ start_date: -1 }).limit(1)
                    if (user_designation_head && user_designation_head.length > 0) {
                        resObject['work_position'] = user_designation_head[0].position
                        resObject['company_name'] = user_designation_head[0].company_name
                    }
                    else {
                        resObject['work_position'] = queryRun.work_position
                        resObject['company_name'] = queryRun.company_name
                    }

                    const event_query = await eventM.find({ user_row_id: user_row_id, active_status: 1 }, { event_title: 1, event_url: 1, list_event_type: 1, active_status: 1, start_date: 1, end_date: 1 }).sort({ start_date: -1 })
                    resObject['events_list'] = []
                    if (event_query) {
                        resObject['events_list'] = event_query
                    }

                    const company_query = await companyM.aggregate([
                        { $match: { user_row_id: user_row_id } },
                        {
                            $lookup: {
                                from: "cln_static_company_business_models",
                                localField: "main_business_model_id",
                                foreignField: "_id",
                                as: "main_business_info"
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_company_business_models",
                                localField: "business_model_id",
                                foreignField: "_id",
                                as: "business_model_info"
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                company_id: 1,
                                company_name: 1,
                                company_email_id: 1,
                                company_location: 1,
                                established_in: 1,
                                website_link: 1,
                                // main_business_model_id:1,
                                // business_model_id:1,
                                main_business_model_name: "$main_business_info.business_name",
                                business_model_name: "$business_model_info.business_name",
                            }
                        }

                    ])
                    resObject['company_details'] = []
                    if (company_query) {
                        resObject['company_details'] = company_query
                    }


                }
                res.json({ status: true, message: resObject })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }

        }
        catch (err) {
            console.log('Organizers view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /check_username/:username (list_type 1/0 branch). Resolves position name(s)
 * via getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads position_name from
 * `$info_work.position_name` (as `user_position_name`) — unchanged shape.
 * `{ $limit: 1 }` kept in its original position: after position resolution,
 * before the company lookups.
 */
function buildCheckUsernameInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 1 } },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

//Check valid user and company name
router.get('/check_username/:username', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            const username = req.params.username
            let list_type = 0
            if (req.query.list_type) {
                list_type = Number.parseInt(req.query.list_type)
            }

            if (list_type === 1 || list_type == 0) {
                const get_data = await professionalsM.aggregate([
                    { $match: { user_name: username, login_status: 1, approval_status: 1 } },
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
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: buildCheckUsernameInfoWorkPipeline(),
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "company_info",
                            pipeline: [
                                { $match: { approval_status: 1, active_status: 1 } }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "cln_static_company_business_models",
                            localField: "company_info.main_business_model_id",
                            foreignField: "_id",
                            as: "main_business_info"
                        }
                    },
                    { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_countries",
                            localField: "company_info.country_id",
                            foreignField: "_id",
                            as: "country_info"
                        }
                    },
                    { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project:
                        {
                            _id: 1,
                            full_name: 1,
                            user_name: 1,
                            pro_batch: 1,
                            user_position_name: "$info_work.position_name",
                            user_company_name: "$info_work.company_name",
                            user_profile_image: "$img_info.profile_image",
                            about_company: "$company_info.about_company",
                            company_id: "$company_info.company_id" ? "$company_info.company_id" : "",
                            company_listed_status: { $cond: { if: { $ne: [{ $ifNull: ["$company_info.company_id", null] }, null] }, then: true, else: false } },
                            company_name: "$company_info.company_name" ? "$company_info.company_name" : "",
                            company_logo: "$company_info.company_logo" ? "$company_info.company_logo" : "",
                            company_category_name: "$main_business_info.business_name" ? "$main_business_info.business_name" : "",
                            country_name: "$country_info.country_name" ? "$country_info.country_name" : ""
                        }
                    }
                ])

                if (get_data[0]) {
                    res.json({ status: true, message: get_data[0] })
                }
                else {
                    res.json({ status: false, message: 'Inavalid User name' })
                }
            }
            else if (list_type === 2) {
                const get_data = await companyM.aggregate([
                    { $match: { company_id: username, approval_status: 1, active_status: 1 } },
                    {
                        $lookup: {
                            from: "cln_static_company_business_models",
                            localField: "main_business_model_id",
                            foreignField: "_id",
                            as: "main_business_info"
                        }
                    },
                    { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_countries",
                            localField: "country_id",
                            foreignField: "_id",
                            as: "country_info"
                        }
                    },
                    { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project:
                        {
                            company_name: 1,
                            company_id: 1,
                            company_logo: 1,
                            company_email_id: 1,
                            about_company: 1,
                            main_business_model_name: "$main_business_info.business_name" ? "$main_business_info.business_name" : "",
                            country_code: "$country_info.country_code" ? "$country_info.country_code" : "",
                            country_name: "$country_info.country_name" ? "$country_info.country_name" : ""
                        }
                    }
                ])

                if (get_data[0]) {
                    res.json({ status: true, message: get_data[0] })
                }
                else {
                    res.json({ status: false, message: 'Inavalid company ID' })
                }
            }
            else {
                res.json({ status: false, message: 'List type is required', tokenStatus: true })
            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Check valid user name.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Sub admin list
router.get('/employees', async (req, res) => {
    try {
        const checkUserToken = checkAdminLoginToken(req.headers, [10])
        if (checkUserToken.status) {

            const sub_admins_query = await eventM.aggregate([
                {
                    $match: { created_by_admin_status: 2, created_by_sub_admin_id: { $gt: 0 } }
                },
                {
                    $group: {
                        _id: "$created_by_sub_admin_id",
                        events_created: {
                            $sum: 1
                        }
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "_id",
                        foreignField: "_id",
                        as: "subadmin_info",
                        pipeline: [
                            {
                                $project: {
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        full_name: "$subadmin_info.full_name"
                    }
                },
                {
                    $match: { full_name: { "$nin": [null, ""] } }
                },
                {
                    $sort: { full_name: 1 }
                },
                {
                    $project: {
                        _id: 1,
                        events_created: 1,
                        full_name: 1,
                        email_id: "$subadmin_info.email_id"
                    }
                }

            ])

            if (sub_admins_query.length) {
                res.json({ status: true, message: sub_admins_query })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, No related employees found." } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Subadmins list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



//Create event
router.post('/submit_event', [
    check('event_title')
        .not().isEmpty().withMessage('The Event Title field is required')
        .isLength({ min: 4 }).withMessage('The Event Title field must be at least 4 characters in length.'),
    check('event_tags')
        .not().isEmpty().withMessage('The Event Tags field is required'),
    check('event_type')
        .not().isEmpty().withMessage('The Event Image field is required'),
    check('event_link')
        .not().isEmpty().withMessage('The Event Link field is required')
        .isLength({ min: 4 }).withMessage('The Event Link field must be at least 4 characters in length.'),
    check('start_date')
        .not().isEmpty().withMessage('The Start Date field is required'),
    check('end_date')
        .not().isEmpty().withMessage('The End Date field is required'),
    check('event_description')
        .not().isEmpty().withMessage('The Event Description field is required')
        .isLength({ min: 4 }).withMessage('The Event Description field must be at least 4 characters in length.'),
    check('list_event_type')
        .not().isEmpty().withMessage('The Event List Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The Event List Type field must be contain 1, 2 or 3.'),
    check('event_list_id')
        .not().isEmpty().withMessage('The Event List Type field is required'),

    // check('event_brief')
    // .not().isEmpty().withMessage('The Event Brief field is required')
    // .isLength({ min: 20 }).withMessage('The Event Brief field must be at least 20 characters in length.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken.status) {
            let speakers_data = []
            if (req.body.speakers) {
                if (!Array.isArray(req.body.speakers)) {
                    errObj['speakers'] = "The speakers field contains only an array."
                }
                else {
                    speakers_data = req.body.speakers
                    for (let key in speakers_data) {
                        if (!speakers_data[key].user_row_id) {
                            errObj['speakers'] = 'User row id field is required for speakers'
                            break
                        }

                        if (!speakers_data[key].user_type) {
                            errObj['speakers'] = 'User type field is required'
                            break
                        }

                        if (speakers_data[key].user_row_id && speakers_data[key].user_type) {
                            if (speakers_data[key].user_type == 1) {
                                const userActiveStatus = await professionalsM.findOne({ _id: sanitize(speakers_data[key].user_row_id), login_status: 1 }, { _id: 1 })
                                if (!userActiveStatus) {
                                    errObj['speakers'] = 'Invalid speakers row id'
                                    break
                                }
                            }
                            else if (speakers_data[key].user_type == 2) {
                                const userActiveStatus = await professionals_manual_retrievalsM.findOne({ _id: sanitize(speakers_data[key].user_row_id) })
                                if (!userActiveStatus) {
                                    errObj['speakers'] = 'Invalid speakers row id'
                                    break
                                }
                            }
                            else {
                                errObj['speakers'] = 'Invalid Speaker User type.'
                                break
                            }
                        }
                    }

                }
            }

            if (req.body.contact_details) {
                if (!Array.isArray(req.body.contact_details)) {
                    errObj['contact_details'] = "The contact details field contains on an array"
                }
                else {
                    let contact_details = req.body.contact_details
                    for (let key in contact_details) {
                        if ((!contact_details[key].contact_number || contact_details[key].contact_number === undefined || contact_details[key].contact_number === "") && !contact_details[key].email_id) {
                            errObj['contact_number'] = 'The contact number or email id field is required'
                            break
                        }
                        else if (!contact_details[key].contact_type && !contact_details[key].contact_reason) {
                            errObj['contact_reason'] = 'Select the contact reason or provide a reason for the contact'
                            break
                        }

                        if (contact_details[key].contact_number) {
                            if (!contact_details[key].country_id) {
                                errObj['country_id'] = 'Country ID field is required'
                                break
                            }

                        }
                    }
                }
            }

            if (req.body.event_type) {
                const check_seminar_array = [1, 3, 4, 5, 6, 7, 8]
                if (check_seminar_array.includes(Number.parseInt(req.body.event_type))) {
                    if (!req.body.event_venue) {
                        errObj['event_venue'] = "The Event Venue field is required."
                    }
                }


                const check_webinar_array = [2, 3, 4, 5, 6, 7, 8]
                if (check_webinar_array.includes(Number.parseInt(req.body.event_type))) {
                    //errObj['webinar_meeting_type'] = "The Meeting Type field is required."
                    if (req.body.webinar_meeting_type) {
                        if (!req.body.webinar_meeting_link) {
                            errObj['webinar_meeting_link'] = "The Meeting Link field is required."
                        }
                    }
                }

            }

            const admin_manager_type = Number.parseInt(checkAdminToken.message.admin_manager_type) // 1 = admin 2 = subadmin
            let admin_row_id = 0
            if (admin_manager_type === 2) {
                admin_row_id = checkAdminToken.message.admin_row_id
            }

            let event_list_id = sanitize(req.body.event_list_id)
            let user_row_id = 0
            let company_row_id = ""
            if (req.body.event_list_id) {
                if (Number.parseInt(req.body.list_event_type) == 1) {
                    const checkUserQuery = await professionalsM.findOne({ user_name: event_list_id, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
                    if (!checkUserQuery) {
                        errObj['event_list_id'] = 'Invalid Username'
                    }
                    else {
                        user_row_id = checkUserQuery._id

                    }
                }
                else if (Number.parseInt(req.body.list_event_type) == 2) {
                    const checkCompanyQuery = await companyM.findOne({ company_id: event_list_id, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
                    if (!checkCompanyQuery) {
                        errObj['event_list_id'] = 'Invalid Company ID'
                    }
                    else {
                        company_row_id = checkCompanyQuery._id
                        user_row_id = checkCompanyQuery.user_row_id ? checkCompanyQuery.user_row_id : 0

                    }

                }
                else if (Number.parseInt(req.body.list_event_type) == 3) {
                    const checkUserQuery = await professionalsM.findOne({ user_name: event_list_id, login_status: 1, approval_status: 1 }, { _id: 1 })
                    if (checkUserQuery) {
                        user_row_id = checkUserQuery._id
                        const checkCompanyQuery2 = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
                        if (!checkCompanyQuery2) {
                            errObj['event_list_id'] = 'Invalid Company ID'
                        }
                        else {
                            company_row_id = checkCompanyQuery2._id
                        }
                    }
                    else {
                        errObj['event_list_id'] = 'Invalid Username'

                    }

                }
            }

            let event_image = ""
            if (!Object.keys(errObj).length) {
                if (!req.body.event_image_type) {
                    if (req.body.event_image) {
                        const validate_n_save_image = await validateAndSaveImage(req.body.event_image, 3)
                        if (!validate_n_save_image.status) {
                            errObj['event_image'] = 'Sorry, Invalid event image.'
                        }
                        else {
                            event_image = validate_n_save_image.webp_file_name
                        }
                    }
                }
                else {
                    const imageQuery = await event_default_imagesM.findOne({ _id: Number.parseInt(req.body.event_image_type) }, { image_name: 1 })
                    if (imageQuery) {
                        event_image = imageQuery['image_name']
                    }
                }
            }
            let longitude = ''
            let latitude = ''

            if (req.body.longitude && req.body.latitude) {
                longitude = req.body.longitude
                latitude = req.body.latitude
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                // event_brief:req.body.event_brief,
                const insertArr = {
                    user_row_id: user_row_id,
                    company_row_id: company_row_id,
                    event_title: req.body.event_title,
                    event_tags: await getIntIdFromArray(req.body.event_tags),
                    event_image_type: req.body.event_image_type ? Number.parseInt(req.body.event_image_type) : 0,
                    event_type: req.body.event_type,
                    webinar_meeting_link: (req.body.webinar_meeting_link) ? req.body.webinar_meeting_link : "",
                    webinar_meeting_type: (req.body.webinar_meeting_type) ? req.body.webinar_meeting_type : 0,
                    list_event_type: req.body.list_event_type,
                    event_image: event_image,
                    event_venue: (req.body.event_venue) ? req.body.event_venue : "",
                    event_city: (req.body.event_city) ? req.body.event_city : "",
                    event_state: (req.body.event_state) ? req.body.event_state : "",
                    event_link: req.body.event_link,
                    start_date: createDateTime(req.body.start_date),
                    end_date: createDateTime(req.body.end_date),
                    event_description: req.body.event_description,
                    contact_mobile_number: (req.body.contact_mobile_number) ? req.body.contact_mobile_number : "",
                    contact_country_row_id: (req.body.contact_country_row_id) ? req.body.contact_country_row_id : "",
                    contact_email_id: (req.body.contact_email_id) ? req.body.contact_email_id : "",
                    active_status: 1,
                    approval_status: 0,
                    created_by_admin_status: admin_manager_type,
                    created_by_sub_admin_id: admin_row_id,
                    // speakers: speakersData,
                    created_date_n_time: getPresentDateTime(),
                    latitude: latitude,
                    longitude: longitude,
                    utc_row_id: req.body.utc_row_id,
                    ticket_link: req.body.ticket_link,
                }

                const dataSave = await eventM(insertArr).save()
                const seoArr = {
                    event_row_id: dataSave?._id,
                    meta_keywords: req.body.meta_keywords,
                    meta_description: req.body.meta_description,
                    meta_title: req.body.meta_title,
                }
                await event_seo_detailsM(seoArr).save()

                await deleteKeysByPattern('all_events_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('users_registered_list_*')
                await deleteKeysByPattern('events_watchlist_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('manage_events_list_*')
                await deleteKeysByPattern('app_user_other_details_*')


                let event_row_id = dataSave._id
                // let eventTitle = dataSave.event_title
                // let generateUrl = await generateEventUrl(eventTitle, event_row_id)

                await event_utc_datesM.findOne({ _id: dataSave.utc_row_id }, { utc_time: 1 })

                if (user_row_id) {
                    await updateNotification({
                        user_row_id: user_row_id,
                        notify_type: 3,
                        notify_type_row_id: event_row_id,
                        message_row_id: 65,
                        action_row_id: event_row_id
                    })
                }

                if (speakers_data) {
                    await add_event_speakers(event_row_id, speakers_data)
                }

                if (req.body.contact_details) {
                    await add_contacts(event_row_id, req.body.contact_details)
                }
                await calculateEventScore(event_row_id, ['build_event_page'])

                // await eventM.updateOne({_id:event_row_id}, {$set:{event_url:generateUrl}})
                res.json({ status: true, message: { alert_message: 'Event created successfully' }, event_row_id: event_row_id })

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Admin panel create event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Add speakers
const add_event_speakers = async (event_row_id, speakers_data) => {
    try {
        let valid_speakers = []
        for (let key in speakers_data) {
            if (speakers_data[key]) {
                const check_query = await event_speakersM.findOne({ event_row_id: event_row_id, user_row_id: speakers_data[key].user_row_id, user_type: speakers_data[key].user_type }, { _id: 1 })
                if (!check_query) {
                    let insertArray = {
                        event_row_id: event_row_id,
                        user_row_id: speakers_data[key].user_row_id,
                        user_type: speakers_data[key].user_type

                    }

                    await event_speakersM(insertArray).save()

                    valid_speakers.push(speakers_data[key])
                }
            }
        }

        return valid_speakers

    }
    catch (err) {
        console.log('valid speakers.', err.message)
        return []
    }
}

//Add contacts
const add_contacts = async (event_row_id, contact_details) => {
    try {
        // const get_query = []
        for (let key in contact_details) {

            if (contact_details[key]) {
                let email_id = contact_details[key].email_id ? (contact_details[key].email_id).toLowerCase() : contact_details[key].email_id

                const check_query = await event_contactsM.findOne({ event_row_id: event_row_id, email_id, contact_number: contact_details[key].contact_number, country_id: contact_details[key].country_id, contact_type: contact_details[key].contact_type })
                if (!check_query) {
                    console.log(contact_details[key])
                    let insertArray = {
                        event_row_id: event_row_id,
                        contact_number: contact_details[key].contact_number,
                        country_id: Number.parseInt(contact_details[key].country_id),
                        email_id: email_id,
                        contact_type: contact_details[key].contact_type,
                        contact_reason: contact_details[key].contact_reason
                    }
                    await event_contactsM(insertArray).save()
                    // get_query.push(push_array)
                }
                else if (check_query.contact_type == 16) {
                    await event_contactsM.updateOne({ _id: check_query._id }, { $set: { contact_reason: contact_details[key].contact_reason } })

                }
            }
        }

    }
    catch (err) {
        console.log('Add contacts.', err.message)
    }
}

//Edit event
router.post('/edit_event', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.'),
    check('event_title')
        .not().isEmpty().withMessage('The Event Title field is required.')
        .isLength({ min: 4 }).withMessage('The Event Title field must be at least 4 characters in length.'),
    check('event_tags')
        .not().isEmpty().withMessage('The Event Tags field is required.'),
    check('event_type')
        .not().isEmpty().withMessage('The Event Type field is required.'),
    check('event_link')
        .not().isEmpty().withMessage('The Event Link field is required.')
        .isLength({ min: 4 }).withMessage('The Event Link field must be at least 4 characters in length.'),
    check('start_date')
        .not().isEmpty().withMessage('The Start Date field is required.'),
    check('end_date')
        .not().isEmpty().withMessage('The End Date field is required.'),
    check('event_description')
        .not().isEmpty().withMessage('The Event Description field is required.')
        .isLength({ min: 4 }).withMessage('The Event Description field must be at least 4 characters in length.'),
    // check('event_brief')
    // .not().isEmpty().withMessage('The Event Brief field is required')
    // .isLength({ min: 20 }).withMessage('The Event Brief field must be at least 20 characters in length.'),
    check('list_event_type')
        .not().isEmpty().withMessage('The Event List Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The Event List Type field must be contain 1, 2 or 3.'),
    check('event_list_id')
        .not().isEmpty().withMessage('The Event List Type field is required')


], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken.status) {
            let admin_row_id = Number.parseInt(checkAdminToken.message.admin_row_id)
            if (checkAdminToken.message.admin_manager_type != 1) {
                if (admin_row_id) {
                    if (checkAdminToken.message.sub_admin_type != 3) {
                        const check_event = await eventM.findOne({ _id: sanitize(req.body.event_row_id) })
                        if (check_event?.created_by_sub_admin_id) {
                            if (admin_row_id != check_event.created_by_sub_admin_id) {
                                errObj['created_by_sub_admin_id'] = "You do not have access to edit this event"
                            }
                        }

                        if ((Number.parseInt(checkAdminToken.message.sub_admin_type) == 2) || (Number.parseInt(checkAdminToken.message.sub_admin_type) == 1)) {
                            if (check_event.created_by_admin_status != 2 && admin_row_id != check_event.created_by_sub_admin_id) {
                                errObj['created_by_sub_admin_id'] = "You do not have access to edit this event"
                            }
                        }
                    }

                }
            }
            let speakers_data = []
            if (req.body.speakers) {
                if (!Array.isArray(req.body.speakers)) {
                    errObj['speakers'] = "The speakers field contains only an array."
                }
                else {
                    speakers_data = req.body.speakers
                    for (let key in speakers_data) {
                        if (!speakers_data[key].user_row_id) {
                            errObj['speakers'] = 'User row id field is required for speakers'
                            break
                        }

                        if (!speakers_data[key].user_type) {
                            errObj['speakers'] = 'User type field is required'
                            break
                        }

                        if (speakers_data[key].user_row_id && speakers_data[key].user_type) {
                            if (speakers_data[key].user_type == 1) {
                                const userActiveStatus = await professionalsM.findOne({ _id: sanitize(speakers_data[key].user_row_id), login_status: 1 }, { _id: 1 })
                                if (!userActiveStatus) {
                                    errObj['speakers'] = 'Invalid speakers row id'
                                    break
                                }
                            }
                            else if (speakers_data[key].user_type == 2) {
                                const userActiveStatus = await professionals_manual_retrievalsM.findOne({ _id: sanitize(speakers_data[key].user_row_id) })
                                if (!userActiveStatus) {
                                    errObj['speakers'] = 'Invalid speakers row id'
                                    break
                                }
                            }
                            else {
                                errObj['speakers'] = 'Invalid Speaker User type.'
                                break
                            }
                        }
                    }

                }
            }

            if (req.body.contact_details) {
                if (!Array.isArray(req.body.contact_details)) {
                    errObj['contact_details'] = "The contact details field contains on an array"
                }
                else {
                    let contact_details = req.body.contact_details
                    for (let key in contact_details) {
                        if ((!contact_details[key].contact_number || contact_details[key].contact_number === undefined || contact_details[key].contact_number === "") && !contact_details[key].email_id) {
                            errObj['contact_number'] = 'The contact number or email id field is required'
                            break
                        }
                        else if (!contact_details[key].contact_type && !contact_details[key].contact_reason) {
                            errObj['contact_reason'] = 'Select the contact reason or provide a reason for the contact'
                            break
                        }

                        if (contact_details[key].contact_number) {
                            if (!contact_details[key].country_id) {
                                errObj['country_id'] = 'Country ID field is required'
                                break
                            }
                        }
                    }
                }
            }

            if (req.body.event_type) {
                const check_seminar_array = [1, 3]
                if (check_seminar_array.includes(Number.parseInt(req.body.event_type))) {
                    if (!req.body.event_venue) {
                        errObj['event_venue'] = "The Event Venue field is required."
                    }
                }

                const check_webinar_array = [2, 3]
                if (check_webinar_array.includes(Number.parseInt(req.body.event_type))) {
                    //errObj['webinar_meeting_type'] = "The Meeting Type field is required."
                    if (req.body.webinar_meeting_type) {
                        if (!req.body.webinar_meeting_link) {
                            errObj['webinar_meeting_link'] = "The Meeting Link field is required."
                        }
                    }
                }
            }


            // else
            // {
            //     errObj['speakers'] = "The speakers field is required."
            // }

            const event_row_id = Number.parseInt(req.body.event_row_id)


            let user_row_id = 0
            let company_row_id = 0
            // let host_name = ""
            if (req.body.event_list_id) {
                let event_list_id = sanitize(req.body.event_list_id)
                if (Number.parseInt(req.body.list_event_type) == 1) {
                    const checkUserQuery = await professionalsM.findOne({ user_name: event_list_id, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
                    if (!checkUserQuery) {
                        errObj['event_list_id'] = 'Invalid Username'
                    }
                    else {
                        user_row_id = checkUserQuery._id
                        // host_name = checkUserQuery.full_name
                    }
                }
                else if (Number.parseInt(req.body.list_event_type) == 2) {
                    const checkCompanyQuery = await companyM.findOne({ company_id: event_list_id, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
                    if (!checkCompanyQuery) {
                        errObj['event_list_id'] = 'Invalid Company ID'
                    }
                    else {
                        company_row_id = checkCompanyQuery._id
                        user_row_id = checkCompanyQuery.user_row_id ? checkCompanyQuery.user_row_id : 0
                        // host_name = checkCompanyQuery.company_name
                    }

                }
                else if (Number.parseInt(req.body.list_event_type) == 3) {
                    const checkUserQuery = await professionalsM.findOne({ user_name: event_list_id, login_status: 1, approval_status: 1 }, { _id: 1 })
                    if (checkUserQuery) {
                        // host_name = checkUserQuery.full_name

                        user_row_id = checkUserQuery._id
                        const checkCompanyQuery2 = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
                        if (!checkCompanyQuery2) {
                            errObj['event_list_id'] = 'Invalid Company ID'
                        }
                        else {
                            company_row_id = checkCompanyQuery2._id
                        }
                    }
                    else {
                        errObj['event_list_id'] = 'Invalid Username'

                    }

                }
            }

            let event_image = ""
            if (!Object.keys(errObj).length) {
                if (!req.body.event_image_type) {
                    if (req.body.event_image) {
                        const validate_n_save_image = await validateAndSaveImage(req.body.event_image, 3)
                        if (!validate_n_save_image.status) {
                            errObj['event_image'] = 'Sorry, Invalid event image.'
                        }
                        else {
                            event_image = validate_n_save_image.webp_file_name
                        }
                    }
                }
                else {
                    const imageQuery = await event_default_imagesM.findOne({ _id: Number.parseInt(req.body.event_image_type) }, { image_name: 1 })
                    if (imageQuery) {
                        event_image = imageQuery['image_name']
                    }
                }
            }
            let longitude = ''
            let latitude = ''

            if (req.body.longitude && req.body.latitude) {
                longitude = req.body.longitude
                latitude = req.body.latitude
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: { alert_message: errObj } })
            }
            else {
                const checkEvent = await eventM.findOne({ _id: event_row_id }, {
                    _id: 1, event_image: 1, event_image_type: 1, approval_status: 1,
                })
                const checkEventSeo = await event_seo_detailsM.findOne({ event_row_id: event_row_id }, {
                    meta_keywords: 1,
                    meta_description: 1,
                    meta_title: 1,
                    _id: 1
                })
                if (checkEvent) {
                    const updateArr = {}
                    updateArr['user_row_id'] = user_row_id
                    updateArr['company_row_id'] = company_row_id
                    updateArr['event_title'] = req.body.event_title
                    updateArr['webinar_meeting_type'] = (req.body.webinar_meeting_type) ? req.body.webinar_meeting_type : 0
                    updateArr['webinar_meeting_link'] = req.body.webinar_meeting_link
                    updateArr['event_tags'] = await getIntIdFromArray(req.body.event_tags)
                    updateArr['event_type'] = req.body.event_type
                    updateArr['event_image_type'] = req.body.event_image_type ? Number.parseInt(req.body.event_image_type) : 0
                    updateArr['event_city'] = (req.body.event_city) ? req.body.event_city : ""
                    updateArr['event_state'] = (req.body.event_state) ? req.body.event_state : ""
                    updateArr['event_venue'] = (req.body.event_venue) ? req.body.event_venue : ""
                    updateArr['event_link'] = req.body.event_link
                    updateArr['start_date'] = createDateTime(req.body.start_date)
                    updateArr['end_date'] = createDateTime(req.body.end_date)
                    updateArr['event_description'] = req.body.event_description
                    // updateArr['event_brief'] = req.body.event_brief
                    updateArr['contact_mobile_number'] = (req.body.contact_mobile_number) ? req.body.contact_mobile_number : ""
                    updateArr['contact_country_row_id'] = (req.body.contact_country_row_id) ? req.body.contact_country_row_id : ""
                    updateArr['contact_email_id'] = (req.body.contact_email_id) ? req.body.contact_email_id : ""
                    updateArr['longitude'] = longitude
                    updateArr['latitude'] = latitude
                    // updateArr['speakers'] = await speakersData

                    updateArr['utc_row_id'] = req.body.utc_row_id
                    updateArr['ticket_link'] = req.body.ticket_link
                    if (req.body.list_event_type) {
                        updateArr['list_event_type'] = req.body.list_event_type
                    }

                    if (event_image) {
                        if (checkEvent.event_image && !checkEvent.event_image_type) {
                            // await deleteImageDigitalOcean(checkEvent.event_image, 3)
                        }

                        updateArr['event_image'] = event_image
                    }
                    const updateSeoArr = {}

                    updateSeoArr['meta_keywords'] = req.body.meta_keywords
                    updateSeoArr['meta_description'] = req.body.meta_description
                    updateSeoArr['meta_title'] = req.body.meta_title

                    const updateFields = getUpdateTrackerFields(checkAdminToken)
                    Object.assign(updateArr, updateFields, { updated_date_n_time: new Date() })

                    await eventM.updateOne({ _id: event_row_id }, { $set: updateArr })
                    await event_seo_detailsM.updateOne({ event_row_id: event_row_id }, { $set: updateSeoArr })


                    const changed =
                        req.body.meta_title !== checkEventSeo?.meta_title ||
                        req.body.meta_description !== checkEventSeo?.meta_description ||
                        req.body.meta_keywords !== checkEventSeo?.meta_keywords;

                    if (changed) {

                        await seo_change_logsM.create({
                            module_key: "event",
                            module_id: event_row_id,

                            old_meta_title: checkEventSeo?.meta_title || "",
                            new_meta_title: req.body.meta_title === checkEventSeo?.meta_title ? "" : req.body.meta_title,

                            old_meta_description: checkEventSeo?.meta_description || "",
                            new_meta_description: req.body.meta_description === checkEventSeo?.meta_description ? "" : req.body.meta_description,

                            old_meta_keywords: checkEventSeo?.meta_keywords || "",
                            new_meta_keywords: req.body.meta_keywords === checkEventSeo?.meta_keywords ? "" : req.body.meta_keywords,
                            user_type: 'admin',

                            updated_by: admin_row_id
                        });
                    }

                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    if (speakers_data.length) {
                        const email_data = {
                            approval_status: checkEvent.approval_status,
                        }
                        await update_event_speakers(event_row_id, speakers_data, email_data)
                    }
                    else {
                        await event_speakersM.deleteMany({ event_row_id: event_row_id })
                    }

                    if (req.body.contact_details) {
                        await update_contact_details(event_row_id, req.body.contact_details)
                    }

                    res.json({ status: true, message: { alert_message: 'Event updated successfully' } })

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid request row Id' } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Admin panel edit event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Update contact details added
const update_contact_details = async (event_row_id, contact_details) => {
    try {
        let valid_contact_details = []

        let contact_array = []
        if (contact_details.length > 0) {
            for (let key in contact_details) {
                if (contact_details[key]) {
                    let email_id = contact_details[key].email_id ? (contact_details[key].email_id).toLowerCase() : contact_details[key].email_id
                    const check_query = await event_contactsM.findOne({ event_row_id: event_row_id, email_id: email_id, contact_number: contact_details[key].contact_number, country_id: contact_details[key].country_id, contact_type: contact_details[key].contact_type })

                    if (!check_query) {
                        let insertArray = {
                            event_row_id: event_row_id,
                            contact_number: contact_details[key].contact_number,
                            email_id: email_id,
                            country_id: Number.parseInt(contact_details[key].country_id),
                            contact_type: contact_details[key].contact_type,
                            contact_reason: contact_details[key].contact_reason
                        }
                        await event_contactsM(insertArray).save()

                        const new_object = await Promise.resolve(insertArray)

                        contact_array.push(new_object)
                    }
                    else if (check_query.contact_type == 16) {
                        await event_contactsM.updateOne({ _id: check_query._id }, { $set: { contact_reason: contact_details[key].contact_reason } })
                    }

                }

                let check_contact_query = await event_contactsM.findOne({ event_row_id: sanitize(event_row_id), email_id: sanitize(contact_details[key].email_id), contact_number: sanitize(contact_details[key].contact_number), country_id: sanitize(contact_details[key].country_id), contact_type: sanitize(contact_details[key].contact_type) })
                const new_valid_value = await Promise.resolve(check_contact_query._id)
                valid_contact_details.push(new_valid_value)


            }
            if (valid_contact_details.length > 0) {
                await event_contactsM.deleteMany({ $and: [{ event_row_id: event_row_id, _id: { $nin: valid_contact_details } }] })
            }
        }
        else {
            // const delete_query = await event_contactsM.find({event_row_id:event_row_id}).limit(5)
            await event_contactsM.deleteMany({ event_row_id: event_row_id })
        }

        return contact_array

    }
    catch (err) {
        console.log('Update contact details.', err.message)
        return []
    }
}

//Update event speakers

const update_event_speakers = async (event_row_id, speakers_data, email_data) => {
    try {
        let speakerIDs = []
        let invalid_speakers = []
        if (speakers_data.length > 0) {
            for (let key in speakers_data) {
                if (speakers_data[key]) {
                    if (speakers_data[key].user_row_id && speakers_data[key].user_type) {
                        const user_row_id = speakers_data[key].user_row_id
                        const user_type = speakers_data[key].user_type
                        let speaker_id = 0
                        const check_query = await event_speakersM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: user_type }, { _id: 1 })
                        if (!check_query) {
                            const check_attendee = await checkAttendee(event_row_id, user_row_id, user_type)
                            if (!check_attendee.status) {
                                let insertArray = {
                                    event_row_id: event_row_id,
                                    user_row_id: user_row_id,
                                    user_type: user_type
                                }

                                const insert_query = await event_speakersM(insertArray).save()
                                speaker_id = insert_query._id

                                if ((email_data.approval_status == 1) && (user_type == 1)) {
                                    await updateNotification({
                                        user_row_id: user_row_id,
                                        notify_type: 3,
                                        notify_type_row_id: event_row_id,
                                        message_row_id: 54,
                                        action_row_id: event_row_id
                                    })
                                }
                            }
                            else {
                                const new_object_invalid = await Promise.resolve({ user_row_id, user_type })
                                invalid_speakers.push(new_object_invalid)
                            }
                        }
                        else {
                            speaker_id = check_query._id
                        }
                        speakerIDs.push(speaker_id)
                    }
                }

            }

            if (speakerIDs.length) {
                await event_speakersM.deleteMany({ event_row_id: event_row_id, _id: { $nin: speakerIDs } })
            }

            return invalid_speakers
        }

    }
    catch (err) {
        console.log('Update event speakers.', err.message)
        return []
    }
}


//PEnding and rejected events list
router.get('/pending_events/:approval_status/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //, 8,9
    if (checkAdminToken.status) {
        try {
            const approval_status = Number.parseInt(req.params.approval_status)

            let query = [{ active_status: 1, approval_status: approval_status }]
            if (req.query.search) {
                query.push({
                    $or: [{ event_title: { '$regex': req.query.search, $options: 'i' } },
                    { user_name: { '$regex': req.query.search, $options: 'i' } }]
                })
            }
            if (req.query.created_type) {
                if (req.query.created_type == 1) {
                    query.push({ created_by_admin_status: 0 })
                }
                if (req.query.created_type == 2) {
                    query.push({ created_by_admin_status: { $in: [1, 2] } })
                }
            }

            if (req.query.employee_id) {
                query.push({ created_by_admin_status: 2, created_by_sub_admin_id: Number.parseInt(req.query.employee_id) })
            }

            //1:Seminar, 2:Webinar, 3:Hybrid
            if (req.query.event_type) {
                query.push({ event_type: Number.parseInt(req.query.event_type) })
            }

            if (req.query.start_date) {
                const start_date = createDateTime(req.query.start_date)
                query.push({ start_date: { $gte: new Date(start_date) } })

            }

            if (req.query.start_date && req.query.end_date) {
                const start_date = createDateTime(req.query.start_date)
                const end_date = createDateTime(req.query.end_date)
                query.push({ start_date: { $gte: new Date(start_date) }, end_date: { $lte: new Date(end_date) } })

            }

            if (req.query.date_time) {
                const date_n_time = Number.parseInt(req.query.date_time)
                if (date_n_time == 1) {
                    const today_date = startAndEndOfToday()
                    query.push({ created_date_n_time: { $gt: new Date(today_date.start_date) } })
                }
                else if (date_n_time == 2) {
                    const yesterday_date = yesterDayStartNEndDate()
                    query.push({ created_date_n_time: { $gte: new Date(yesterday_date.start_date), $lte: new Date(yesterday_date.end_date) } })

                }
                else if (date_n_time == 3) {
                    const lastWeek_date = lastWeekStartEndDate()
                    query.push({ created_date_n_time: { $gte: new Date(lastWeek_date.start_date), $lte: new Date(lastWeek_date.end_date) } })
                }
                else if (date_n_time == 4) {
                    const lastMonth_date = lastMonthStartEndDate()
                    query.push({ created_date_n_time: { $gte: new Date(lastMonth_date.start_date), $lte: new Date(lastMonth_date.end_date) } })
                }
            }

            // event_status=>1.ongoing 2.upcoming 3.ended
            if (req.query.event_status) {
                if (req.query.event_status == 1) {
                    query.push({ start_date: { $lte: new Date(getPresentDateTime()) }, end_date: { $gte: new Date(getPresentDateTime()) } })
                }
                if (req.query.event_status == 2) {
                    query.push({ start_date: { $gte: new Date(getPresentDateTime()) } })
                }
                if (req.query.event_status == 3) {
                    query.push({ end_date: { $lt: new Date(getPresentDateTime()) } })
                }
            }
            if (req.query.profile_score) {
                const range = req.query.profile_score;

                const [min, max] = range.split("-").map(Number);

                if (!Number.isNaN(min) && !Number.isNaN(max)) {
                    query.push({
                        profile_score: {
                            $gte: min,
                            $lte: max
                        }
                    });
                }
            }

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let pipeline = [
                { $sort: { _id: -1 } },

                {
                    $lookup: {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                {
                    $addFields: {
                        tagIds: {
                            $cond: [
                                { $isArray: "$event_tags" },
                                "$event_tags",
                                {
                                    $cond: [
                                        { $gt: [{ $size: { $ifNull: [{ $objectToArray: "$event_tags" }, []] } }, 0] },
                                        {
                                            $map: {
                                                input: { $objectToArray: "$event_tags" },
                                                as: "t",
                                                in: "$$t.v"
                                            }
                                        },
                                        []
                                    ]
                                }
                            ]
                        }
                    }
                },

                {
                    $lookup: {
                        from: "cln_events_tags",
                        let: { tagIds: "$tagIds" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$tagIds"] } } },
                            { $match: { active_status: true } }
                        ],
                        as: "eventTags"
                    }
                },

                {
                    $lookup: {
                        from: "cln_events_utc_dates",
                        localField: "utc_row_id",
                        foreignField: "_id",
                        as: "utc_dates"
                    }
                },
                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "created_by_sub_admin_id",
                        foreignField: "_id",
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "updated_by_row_id",
                        foreignField: "_id",
                        as: "updated_by_user_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "updated_by_row_id",
                        foreignField: "_id",
                        as: "updated_by_admin_info"
                    }
                },

                { $match: { $and: query } }
            ];

            // Tag Status Filter
            if (req.query.tag_status) {
                const tagStatus = Number.parseInt(req.query.tag_status);

                if (tagStatus === 1) pipeline.push({ $match: { eventTags: { $ne: [] } } });
                if (tagStatus === 0) pipeline.push({ $match: { eventTags: { $eq: [] } } });
            }

            // Final Projection
            pipeline.push({
                $project: {
                    _id: 1,
                    company_row_id: 1,
                    user_row_id: 1,
                    event_type: 1,
                    event_url: 1,
                    event_title: 1,
                    event_tags: 1,
                    start_date: 1,
                    event_image: 1,
                    event_image_type: 1,
                    end_date: 1,
                    event_venue: 1,
                    active_status: 1,
                    approval_status: 1,
                    claim_status: 1,
                    created_date_n_time: 1,
                    list_event_type: 1,
                    created_by_admin_status: 1,
                    created_by_sub_admin_id: 1,
                    sub_admin_name: "$sub_admin_info.full_name",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    created_user_name: "$user_info.full_name",
                    company_id: "$company_info.company_id",
                    company_name: "$company_info.company_name",
                    event_tag_array: "$eventTags.event_tag",
                    utc_time: "$utc_dates.utc_time",
                    user_approval_status: "$user_info.approval_status",
                    user_login_status: "$user_info.login_status",
                    build_event_page_score: 1,
                    seo_details_score: 1,
                    contact_details_score: 1,
                    tickets_coupons_score: 1,
                    speakers_score: 1,
                    sponsors_partners_score: 1,
                    attendees_score: 1,
                    faq_score: 1,
                    profile_score: 1,
                    updated_by: "$updated_by",
                    updated_by_row_id: "$updated_by_row_id",
                    updated_date_n_time: "$updated_date_n_time",
                    updated_by_full_name: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: ["$updated_by", "user"] },
                                    then: {
                                        $let: {
                                            vars: { userInfo: { $arrayElemAt: ["$updated_by_user_info", 0] } },
                                            in: { $ifNull: ["$$userInfo.full_name", ""] }
                                        }
                                    }
                                },
                                {
                                    case: { $eq: ["$updated_by", "admin"] },
                                    then: {
                                        $let: {
                                            vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                            in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                        }
                                    }
                                },
                                {
                                    case: { $eq: ["$updated_by", "subadmin"] },
                                    then: {
                                        $let: {
                                            vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                            in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                        }
                                    }
                                }
                            ],
                            default: ""
                        }
                    }
                }
            });


            /** ---------------- QUERY EXECUTION ---------------- **/

            const finalQuery = await eventM.aggregate([
                ...pipeline,
                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit }
                        ],
                        totalCount: [
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            res.json({
                status: true,
                message: finalQuery[0].data,
                countQueryRun: finalQuery[0].totalCount.length ? finalQuery[0].totalCount[0].count : 0
            });

        }
        catch (err) {
            console.log('Pending Events list.', err.message)
            res.json({ status: false, message: err.message })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//only for published events
router.get('/list/:active_status/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //, 8,9
    if (checkAdminToken.status) {
        try {
            const present_time = getPresentDateTime()
            let query = [{}]
            if (req.query.ticket) {
                const ticket_query = await ticketM.distinct('event_row_id')
                if (req.query.ticket == 1) {
                    query.push({ end_date: { $gte: new Date(present_time) }, active_status: 1, _id: { $nin: ticket_query } })
                }
                else {
                    query.push({ end_date: { $gte: new Date(present_time) }, active_status: 1, _id: { $in: ticket_query } })
                }
            }
            else {
                query.push({ active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] })
            }

            if (req.query.search) {
                query.push({
                    $or: [{ event_title: { '$regex': req.query.search, $options: 'i' } },
                    { user_name: { '$regex': req.query.search, $options: 'i' } }]
                })
            }

            if (!Number.isNaN(Number.parseInt(req.query.employee_id))) {
                query.push({ created_by_admin_status: 2, created_by_sub_admin_id: Number.parseInt(req.query.employee_id) })
            }

            //1:Seminar, 2:Webinar, 3:Hybrid
            if (!Number.isNaN(Number.parseInt(req.query.event_type))) {
                query.push({ event_type: Number.parseInt(req.query.event_type) })
            }

            if (req.query.start_date) {
                const start_date = createDateTime(req.query.start_date)
                query.push({ start_date: { $gte: new Date(start_date) } })
            }

            if (req.query.end_date) {
                const end_date = createDateTime(req.query.end_date)
                query.push({ end_date: { $lte: new Date(end_date) } })
            }

            //event_status=> 1.ongoing 2.upcoming 3.ended
            if (!Number.isNaN(Number.parseInt(req.query.event_status))) {

                if (Number.parseInt(req.query.event_status) === 1) {
                    query.push({ start_date: { $lte: new Date(present_time) }, end_date: { $gte: new Date(present_time) } })
                }
                else if (Number.parseInt(req.query.event_status) === 2) {
                    query.push({ start_date: { $gte: new Date(present_time) } })
                }
                else if (Number.parseInt(req.query.event_status) === 3) {
                    query.push({ end_date: { $lt: new Date(present_time) } })
                }
            }

            if (req.query.event_tag) {
                query.push({ event_tags: { $in: await getIntIdFromArray(req.query.event_tag) } })
            }
            if (req.query.location) {
                const locations = req.query.location
                    .split(',')
                    .map(loc => loc.trim())
                    .filter(Boolean);

                if (locations.length > 0) {
                    query.push({
                        $and: locations.map(loc => ({
                            event_venue: { $regex: new RegExp(loc, "i") }
                        }))
                    });
                }
            }
            if (req.query.created_type) {
                if (req.query.created_type == 1) {
                    query.push({ created_by_admin_status: 0 })
                }
                if (req.query.created_type == 2) {
                    query.push({ created_by_admin_status: { $in: [1, 2] } })
                }
            }
            if (req.query.profile_score) {
                const range = req.query.profile_score;

                const [min, max] = range.split("-").map(Number);

                if (!Number.isNaN(min) && !Number.isNaN(max)) {
                    query.push({
                        profile_score: {
                            $gte: min,
                            $lte: max
                        }
                    });
                }
            }



            const sortBy = req.query.sortBy
            const sortOrder = req.query.sortOrder ? Number.parseInt(req.query.sortOrder) : -1

            const sortStage = {}

            if (sortBy && sortOrder != "") {
                sortStage[sortBy] = sortOrder
            }

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const query_pipeline = [
                // ✅ 1. FILTER FIRST (BIGGEST IMPROVEMENT)
                { $match: { $and: query } },

                // ✅ 2. SORT AFTER FILTER
                { $sort: { _id: -1 } },

                // ✅ 3. COMPANY LOOKUP (ONLY REQUIRED FIELDS)
                {
                    $lookup: {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        pipeline: [
                            { $project: { company_id: 1, company_name: 1 } }
                        ],
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                // ✅ 4. USER LOOKUP (LIMIT FIELDS)
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        pipeline: [
                            { $project: { user_name: 1, full_name: 1, email_id: 1 } }
                        ],
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

                // ✅ 5. UPDATED BY (KEEP BOTH BUT LIGHTWEIGHT)
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "updated_by_row_id",
                        foreignField: "_id",
                        pipeline: [{ $project: { full_name: 1 } }],
                        as: "updated_by_user_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "updated_by_row_id",
                        foreignField: "_id",
                        pipeline: [{ $project: { full_name: 1 } }],
                        as: "updated_by_admin_info"
                    }
                },

                // ✅ 6. TAG NORMALIZATION (KEEP SAME BUT CLEAN)
                {
                    $addFields: {
                        tagIds: {
                            $cond: [
                                { $isArray: "$event_tags" },
                                "$event_tags",
                                {
                                    $map: {
                                        input: { $objectToArray: { $ifNull: ["$event_tags", {}] } },
                                        as: "t",
                                        in: "$$t.v"
                                    }
                                }
                            ]
                        }
                    }
                },

                // ✅ 7. TAG LOOKUP (REMOVE $expr → USE DIRECT MATCH)
                {
                    $lookup: {
                        from: "cln_events_tags",
                        localField: "tagIds",
                        foreignField: "_id",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { event_tag: 1 } }
                        ],
                        as: "eventTags"
                    }
                },

                // ✅ 8. EVENT COUNTS (NO UNWIND)
                {
                    $lookup: {
                        from: "cln_event_counts",
                        localField: "_id",
                        foreignField: "event_row_id",
                        pipeline: [
                            {
                                $project: {
                                    total_attendees: 1,
                                    total_watchlist: 1,
                                    total_invitees: 1
                                }
                            }
                        ],
                        as: "events_count"
                    }
                },

                // ✅ 9. UTC DATES (NO UNWIND)
                {
                    $lookup: {
                        from: "cln_events_utc_dates",
                        localField: "utc_row_id",
                        foreignField: "_id",
                        pipeline: [{ $project: { utc_time: 1 } }],
                        as: "utc_dates"
                    }
                },

                // ✅ 10. SUB ADMIN
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "created_by_sub_admin_id",
                        foreignField: "_id",
                        pipeline: [{ $project: { full_name: 1 } }],
                        as: "sub_admin_info"
                    }
                },

                // ✅ 11. FLATTEN WITHOUT UNWIND
                {
                    $set: {
                        total_attendees: {
                            $ifNull: [{ $arrayElemAt: ["$events_count.total_attendees", 0] }, 0]
                        },
                        total_watchlist: {
                            $ifNull: [{ $arrayElemAt: ["$events_count.total_watchlist", 0] }, 0]
                        },
                        total_invitees: {
                            $ifNull: [{ $arrayElemAt: ["$events_count.total_invitees", 0] }, 0]
                        },
                        utc_time: { $arrayElemAt: ["$utc_dates.utc_time", 0] },
                        sub_admin_name: { $arrayElemAt: ["$sub_admin_info.full_name", 0] }
                    }
                },

                // ✅ 12. UPDATED BY NAME (SIMPLIFIED)
                {
                    $addFields: {
                        updated_by_full_name: {
                            $cond: [
                                { $eq: ["$updated_by", "user"] },
                                { $ifNull: [{ $arrayElemAt: ["$updated_by_user_info.full_name", 0] }, ""] },
                                { $ifNull: [{ $arrayElemAt: ["$updated_by_admin_info.full_name", 0] }, ""] }
                            ]
                        }
                    }
                },

                // ✅ 13. FINAL PROJECTION
                {
                    $project: {
                        _id: 1,
                        company_row_id: 1,
                        user_row_id: 1,
                        event_type: 1,
                        event_url: 1,
                        event_title: 1,
                        event_tags: 1,
                        start_date: 1,
                        event_image: 1,
                        event_image_type: 1,
                        end_date: 1,
                        event_venue: 1,
                        active_status: 1,
                        approval_status: 1,
                        created_date_n_time: 1,
                        updated_date_n_time: 1,
                        list_event_type: 1,
                        sub_admin_name: "$sub_admin_info.full_name",
                        created_by_admin_status: 1, //0: user created 1: admin created, 2:sub admin
                        created_by_sub_admin_id: 1,
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        company_id: "$company_info.company_id",
                        company_name: "$company_info.company_name",
                        event_tag_array: "$eventTags.event_tag",
                        total_attendees: 1,
                        total_watchlist: 1,
                        total_invitees: 1,
                        utc_time: "$utc_dates.utc_time",
                        build_event_page_score: 1,
                        seo_details_score: 1,
                        contact_details_score: 1,
                        tickets_coupons_score: 1,
                        speakers_score: 1,
                        sponsors_partners_score: 1,
                        attendees_score: 1,
                        faq_score: 1,
                        profile_score: 1,
                        updated_by: "$updated_by",
                        updated_by_row_id: "$updated_by_row_id",
                        updated_by_full_name: 1
                    }
                }
            ];
            if (!Number.isNaN(Number.parseInt(req.query.tag_status))) {
                const tagStatus = Number.parseInt(req.query.tag_status);

                if (tagStatus === 1) {
                    query_pipeline.push({ $match: { event_tag_array: { $ne: [] } } });
                } else if (tagStatus === 0) {
                    query_pipeline.push({ $match: { event_tag_array: { $size: 0 } } });
                }
            }
            if (Object.keys(sortStage).length > 0) {
                query_pipeline.push({ $sort: sortStage })
            }


            const queryRun = await eventM.aggregate(query_pipeline).skip(skip).limit(limit)



            const eventCounts = await eventM.aggregate([
                // 1) Lookup users (same as list)
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                {
                    $set: {
                        user_name: { $arrayElemAt: ["$user_info.user_name", 0] }
                    }
                },

                { $match: { $and: query } },


                {
                    $addFields: {
                        tagIds: {
                            $cond: [
                                { $isArray: "$event_tags" },
                                "$event_tags",
                                {
                                    $cond: [
                                        { $gt: [{ $size: { $ifNull: [{ $objectToArray: "$event_tags" }, []] } }, 0] },
                                        {
                                            $map: {
                                                input: { $objectToArray: "$event_tags" },
                                                as: "t",
                                                in: "$$t.v"
                                            }
                                        },
                                        []
                                    ]
                                }
                            ]
                        }
                    }
                },

                {
                    $lookup: {
                        from: "cln_events_tags",
                        let: { tagIds: "$tagIds" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$tagIds"] } } },
                            { $match: { active_status: true } }
                        ],
                        as: "eventTags"
                    }
                },

                // 5) Project minimal fields for counting (dates + tag names) and ensure event_tag_array is always an array
                {
                    $project: {
                        start_date: 1,
                        end_date: 1,
                        event_tag_array: { $ifNull: ["$eventTags.event_tag", []] }
                    }
                },

                // 6) Apply tag_status filter exactly as list (robustly using $size)
                ...(req.query.tag_status === "1"
                    ? [
                        {
                            $match: {
                                $expr: { $gt: [{ $size: "$event_tag_array" }, 0] } // tagged
                            }
                        }
                    ]
                    : req.query.tag_status === "0"
                        ? [
                            {
                                $match: {
                                    $expr: { $eq: [{ $size: "$event_tag_array" }, 0] } // untagged
                                }
                            }
                        ]
                        : []
                ),

                // 7) Finally facet counts (total / ongoing / upcoming / ended)
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        ongoing: [
                            {
                                $match: {
                                    start_date: { $lte: new Date(present_time) },
                                    end_date: { $gte: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        upcoming: [
                            {
                                $match: {
                                    start_date: { $gt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ],
                        ended: [
                            {
                                $match: {
                                    end_date: { $lt: new Date(present_time) }
                                }
                            },
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            // extract counts
            const counts = eventCounts[0] || {};
            const totalCount = counts.total?.[0]?.count || 0;
            const ongoingCount = counts.ongoing?.[0]?.count || 0;
            const upcomingCount = counts.upcoming?.[0]?.count || 0;
            const endedCount = counts.ended?.[0]?.count || 0;



            res.json({
                status: true,
                message: queryRun,
                // invalidcount: invalidcount,
                countQueryRun: totalCount,
                ongoingCount,
                upcomingCount,
                endedCount
            })


        }
        catch (err) {
            console.log('Published events list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


router.get('/attendees_invitees_list/:event_row_id/:status', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let event_row_id = Number.parseInt(req.params.event_row_id)
            let invitation_request_status = Number.parseInt(req.params.status)
            if (!Number.isNaN(event_row_id)) {
                let query = [{}]
                if (req.query.search) {
                    query.push({
                        $or: [{ full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } }]
                    })
                }

                const list_query = await event_attendeesM.aggregate([
                    {
                        $sort: {
                            _id: -1
                        }
                    },
                    {
                        $match: {
                            event_row_id: event_row_id, invitation_status: invitation_request_status
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                user_row_id: '$user_row_id',
                                user_type: '$user_type'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, "$$user_type"] },
                                                { $eq: ['$_id', '$$user_row_id'] },
                                                { $eq: ["$login_status", 1] }
                                            ]
                                        }
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
                                    $project:
                                    {
                                        _id: 1,
                                        user_name: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        approval_status: 1,
                                        profile_image: "$img_info.profile_image"
                                    }
                                },
                                { $limit: 1 },
                            ]
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                user_type: '$user_type',
                                user_row_id: '$user_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$user_type'] },
                                                { $eq: ['$_id', '$$user_row_id'] }
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project:
                                    {
                                        _id: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        profile_image: 1
                                    }
                                },
                                { $limit: 1 },
                            ]
                        }
                    },
                    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            user_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_type', 2] }
                                                ]
                                            },
                                            then: "$manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            },
                        }
                    },
                    {
                        $set: {
                            user_name: { $cond: { if: "$user_data.user_name", then: "$user_data.user_name", else: "" } },
                            full_name: "$user_data.full_name",
                            profile_image: "$user_data.profile_image",
                            email_id: "$user_data.email_id"
                        }
                    },
                    { $match: { $and: query } },
                    {
                        $project: {
                            _id: 1,
                            event_row_id: 1,
                            user_type: 1,
                            user_row_id: 1,
                            invitation_status: 1,
                            invitation_type: 1,
                            created_date_n_time: 1,
                            user_name: 1,
                            full_name: 1,
                            email_id: 1,
                            profile_image: 1
                        }
                    }
                ])

                const count_query = await event_attendeesM.aggregate([
                    {
                        $match: {
                            event_row_id: event_row_id, invitation_status: invitation_request_status
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                user_row_id: '$user_row_id',
                                user_type: '$user_type'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, "$$user_type"] },
                                                { $eq: ['$_id', '$$user_row_id'] },
                                                { $eq: ["$login_status", 1] }
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project:
                                    {
                                        _id: 1,
                                        user_name: 1,
                                        full_name: 1,
                                        email_id: 1,
                                    }
                                },
                                { $limit: 1 },
                            ]
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                user_type: '$_user_type',
                                user_row_id: '$user_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$user_type'] },
                                                { $eq: ['$_id', '$$user_row_id'] }
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project:
                                    {
                                        _id: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        profile_image: 1
                                    }
                                },
                                { $limit: 1 },
                            ]
                        }
                    },
                    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            user_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_type', 2] }
                                                ]
                                            },
                                            then: "$manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            },
                        }
                    },
                    {
                        $set: {
                            user_name: { $cond: { if: "$user_data.user_name", then: "$user_data.user_name", else: "" } },
                            full_name: "$user_data.full_name",
                            email_id: { $cond: { if: "$user_data.email_id", then: "$user_data.email_id", else: "" } },
                        }
                    },
                    { $match: { $and: query } },
                    {
                        $count: "count"
                    }
                ])

                let total_count = 0
                if (count_query[0]) {
                    total_count = count_query[0].count
                }

                res.json({ status: true, message: list_query, count: total_count })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        catch (err) {
            console.log('Attendees invitees list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//List of users added an event to watchlist
router.get('/event_watchlist/:event_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                let query = [{ event_row_id: event_row_id }]
                if (req.query.search) {
                    query.push({
                        $or: [{ full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } }]
                    })
                }

                const queryRun = await event_watchlistsM.aggregate([
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
                            from: "cln_professionals_profile_images",
                            localField: "user_row_id",
                            foreignField: "user_row_id",
                            as: "img_info"
                        }
                    },
                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                            profile_image: "$img_info.profile_image"
                        }
                    },
                    { $match: { $and: query } },
                    {
                        $project:
                        {
                            user_name: 1,
                            full_name: 1,
                            email_id: 1,
                            profile_image: 1,
                            date_n_time: 1
                        }
                    },
                    {
                        $sort: { _id: -1 }
                    }

                ])

                const count_query = await event_watchlistsM.aggregate([
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
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                        }
                    },
                    { $match: { $and: query } },
                    {
                        $count: "count"
                    }
                ])

                let total_count = 0
                if (count_query[0]) {
                    total_count = count_query[0].count
                }

                res.json({ status: true, message: queryRun, count: total_count })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        catch (err) {
            console.log('Event watchlist.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

router.get('/user_suggestion', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [3])
    if (checkAdminToken.status) {
        try {
            const active_status = 1
            let query = [{ login_status: 1 }]
            if (req.query.search) {
                query.push({ user_name: { '$regex': req.query.search, $options: 'i' } })
            }


            const userquery = await eventM.aggregate([
                { $match: { active_status: active_status } },
                {
                    $group: {
                        _id: "$user_row_id",
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: "$user_info" },
                {
                    $set: {
                        login_status: "$user_info.login_status",
                        user_name: "$user_info.user_name"
                    }
                },
                { $match: { $and: query } },
                {
                    $project:
                    {
                        _id: 1,
                        user_name: 1
                    }
                }
            ])

            const countQueryRun = await eventM.aggregate([
                { $match: { active_status: active_status } },
                {
                    $group: {
                        _id: "$user_row_id",
                        count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: "$user_info" },
                {
                    $set: {
                        login_status: "$user_info.login_status",
                        user_name: "$user_info.user_name"
                    }
                },
                { $match: { $and: query } },
                { $count: "count" }
            ])
            let total_counts = 0
            if (countQueryRun[0]) {
                total_counts = countQueryRun[0].count
            }

            res.json({ status: true, message: userquery, count: total_counts })
        }
        catch (err) {
            console.log('Users suggestion.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//Disabled events list



router.get('/disabled_list/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) // ,8,9
    if (checkAdminToken.status) {
        try {
            let query = {
                $and: [
                    { active_status: 0 },
                    { approval_status: 1 },
                    {
                        $or: [
                            { created_by_admin_status: { $ne: 0 } }, // Admin or Subadmin
                            {
                                $and: [
                                    { created_by_admin_status: 0 },
                                    { list_event_type: { $in: [1, 2, 3] } } // Must be defined
                                ]
                            }
                        ]
                    }
                ]
            };


            if (req.query.search) {
                query = {
                    $and: [
                        { event_title: { $regex: req.query.search, $options: 'i' } },
                        { active_status: 0, approval_status: 1 }
                    ]
                };
            }

            if (req.query.list_event_type) {
                const listEventType = Number.parseInt(req.query.list_event_type);

                const typeConditions = [
                    { list_event_type: listEventType },
                    { created_by_admin_status: 0 }
                ];

                if (query.$and) {
                    query.$and.push(...typeConditions);
                } else {
                    query = {
                        $and: [query, ...typeConditions]
                    };
                }
            }
            if (req.query.created_by_admin_status) {
                const adminCreated = Number.parseInt(req.query.created_by_admin_status);

                const adminCreatedCondition = {
                    created_by_admin_status: adminCreated
                };

                if (query.$and) {
                    query.$and.push(adminCreatedCondition);
                } else {
                    query = { $and: [query, adminCreatedCondition] };
                }
            }
            if (req.query.profile_score === "0-24") {
                query.profile_score = { $gte: 0, $lte: 24 };
            } else if (req.query.profile_score === "25-49") {
                query.profile_score = { $gte: 25, $lte: 49 };
            } else if (req.query.profile_score === "50-74") {
                query.profile_score = { $gte: 50, $lte: 74 };
            } else if (req.query.profile_score === "75-100") {
                query.profile_score = { $gte: 75, $lte: 100 };
            }




            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const pipeline = [
                { $match: query },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
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
                    $lookup: {
                        from: "cln_professionals",
                        localField: "updated_by_row_id",
                        foreignField: "_id",
                        as: "updated_by_user_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "updated_by_row_id",
                        foreignField: "_id",
                        as: "updated_by_admin_info"
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_utc_dates",
                        localField: "utc_row_id",
                        foreignField: "_id",
                        as: "utc_dates"
                    }
                },
                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "created_by_sub_admin_id",
                        foreignField: "_id",
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        tagIds: {
                            $cond: [
                                { $isArray: "$event_tags" },
                                "$event_tags",
                                {
                                    $cond: [
                                        { $gt: [{ $size: { $ifNull: [{ $objectToArray: "$event_tags" }, []] } }, 0] },
                                        {
                                            $map: {
                                                input: { $objectToArray: "$event_tags" },
                                                as: "t",
                                                in: "$$t.v"
                                            }
                                        },
                                        []
                                    ]
                                }
                            ]
                        }
                    }
                },

                {
                    $lookup: {
                        from: "cln_events_tags",
                        let: { tagIds: "$tagIds" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$tagIds"] } } },
                            { $match: { active_status: true } }
                        ],
                        as: "eventTags"
                    }
                },

            ]
            if (req.query.tag_status) {
                const tagStatus = Number.parseInt(req.query.tag_status);

                if (tagStatus === 1) pipeline.push({ $match: { eventTags: { $ne: [] } } });
                if (tagStatus === 0) pipeline.push({ $match: { eventTags: { $eq: [] } } });
            }
            pipeline.push({

                $project: {
                    _id: 1,
                    company_row_id: 1,
                    user_row_id: 1,
                    event_type: 1,
                    event_tags: 1,
                    start_date: 1,
                    event_image: 1,
                    event_title: 1,
                    event_image_type: 1,
                    end_date: 1,
                    event_venue: 1,
                    active_status: 1,
                    approval_status: 1,
                    created_date_n_time: 1,
                    event_tag_array: "$eventTags.event_tag",
                    list_event_type: {
                        $cond: {
                            if: { $gt: ["$list_event_type", 0] },
                            then: "$list_event_type",
                            else: ""
                        }
                    },

                    event_url: 1,
                    disabled_date_n_time: 1,
                    created_by_admin_status: 1, //0: user created 1: admin created, 2:sub admin
                    created_by_sub_admin_id: 1,
                    build_event_page_score: 1,
                    seo_details_score: 1,
                    contact_details_score: 1,
                    tickets_coupons_score: 1,
                    speakers_score: 1,
                    sponsors_partners_score: 1,
                    attendees_score: 1,
                    faq_score: 1,
                    profile_score: 1,
                    sub_admin_name: "$sub_admin_info.full_name",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    utc_time: "$utc_dates.utc_time",
                    updated_by: "$updated_by",
                    updated_by_row_id: "$updated_by_row_id",
                    updated_date_n_time: "$updated_date_n_time",
                    updated_by_full_name: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: ["$updated_by", "user"] },
                                    then: {
                                        $let: {
                                            vars: { userInfo: { $arrayElemAt: ["$updated_by_user_info", 0] } },
                                            in: { $ifNull: ["$$userInfo.full_name", ""] }
                                        }
                                    }
                                },
                                {
                                    case: { $eq: ["$updated_by", "admin"] },
                                    then: {
                                        $let: {
                                            vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                            in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                        }
                                    }
                                },
                                {
                                    case: { $eq: ["$updated_by", "subadmin"] },
                                    then: {
                                        $let: {
                                            vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                            in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                        }
                                    }
                                }
                            ],
                            default: ""
                        }
                    }
                }

            })
            const result = await eventM.aggregate([
                ...pipeline,
                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit }
                        ],
                        totalCount: [
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            const finalData = result[0].data;
            const totalCount = result[0].totalCount.length ? result[0].totalCount[0].count : 0;
            // const queryRunCount = await eventM.countDocuments(query)
            const get_query1 = await eventM.countDocuments({ active_status: 0, approval_status: 1, list_event_type: 1, created_by_admin_status: 0 })
            const get_query2 = await eventM.countDocuments({ active_status: 0, approval_status: 1, list_event_type: 2, created_by_admin_status: 0 })
            const get_query3 = await eventM.countDocuments({ active_status: 0, approval_status: 1, list_event_type: 3, created_by_admin_status: 0 })
            const get_query5 = await eventM.countDocuments({ active_status: 0, approval_status: 1, created_by_admin_status: 1 })
            const get_query6 = await eventM.countDocuments({ active_status: 0, approval_status: 1, created_by_admin_status: 2 })
            res.json({
                status: true, message: finalData, countQueryRun: totalCount, host_created: get_query1,
                organizers_count: get_query2,
                host_and_organizers_count: get_query3,
                admin_and_subadmin_created: get_query5 + get_query6,
                // get_query6: get_query6,
            })
        }
        catch (err) {
            console.log('Disabled events list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//Enable event
router.get('/enable_event/:request_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,8
    if (checkAdminToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const check_query = await eventM.aggregate([
                    {
                        $match: { _id: request_row_id, active_status: 0 }
                    },
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
                        $project: {
                            _id: 1,
                            event_title: 1,
                            user_row_id: 1,
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                        }
                    }
                ])

                // const checkPending = await eventM.findOne({ _id: request_row_id, active_status: 0 })
                if (check_query[0]) {
                    const check_access = await checkSubadminAccess({
                        admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                        admin_manager_type: checkAdminToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                        event_row_id: check_query[0]._id
                    })

                    if (check_access.status) {
                        const updateFields = getUpdateTrackerFields(checkAdminToken)
                        await eventM.updateOne({ _id: request_row_id }, { $set: { active_status: 1, ...updateFields, updated_date_n_time: new Date() } })
                        await deleteKeysByPattern('all_events_*')
                        await deleteKeysByPattern('users_registered_list_*')
                        await deleteKeysByPattern('manage_events_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')

                        let event_title = check_query[0].event_title
                        let full_name = check_query[0].full_name
                        let email_id = check_query[0].email_id

                        let email_subject = "Activation Confirmation: " + event_title + " for Your Event is Now Active!"
                        let email_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are pleased to inform you that the <b>${event_title}</b> for your event has been unlocked, and all its features are now active. You can now resume using your account and take full advantage of the networking opportunities available to you.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">To make the most of this dynamic event, we invite you to login to your Coinpedia account and proceed with submitting your request. Our team is eagerly awaiting your participation and looks forward to facilitating connections and collaborations among like-minded professionals.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login" style="color:#0029ff;">Login</a> to your Coinpedia account.</p>
                    `
                        if (check_query[0].user_row_id) {
                            await updateNotification({
                                user_row_id: check_query[0].user_row_id,
                                notify_type: 3,
                                notify_type_row_id: request_row_id,
                                message_row_id: 63,
                                action_row_id: request_row_id
                            })
                        }
                        const eventData = await eventM.findOne(
                            { _id: request_row_id },
                            { event_url: 1, approval_status: 1, event_title: 1, start_date: 1, event_venue: 1, created_date_n_time: 1, event_type: 1 }
                        );
                        const cardData = {
                            event_title: eventData.event_title,
                            start_date: eventData.start_date,
                            event_venue: (eventData?.event_type == 1 || eventData?.event_type == 3 || eventData?.event_type == 4 || eventData?.event_type == 5 || eventData?.event_type == 6 || eventData?.event_type == 7 || eventData?.event_type == 8) ? eventData.event_venue : "Virtual",
                            event_url: eventData.event_url,
                            event_row_id: request_row_id,
                        };

                        await agenda.now("generate event card", cardData);



                        await sendEventsEmail(email_id, email_subject, email_message)


                        res.json({ status: true, message: { alert_message: 'Event Enabled Successfully' }, tokenStatus: true })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message }, tokenStatus: true })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' }, tokenStatus: true })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            res.json({ status: false, message: err.message, tokenStatus: true })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//Disable event
router.post('/disable_event/:request_row_id', [
    check('disable_reason')
        .not().isEmpty().withMessage('The Disable Reason field is required')
        .isLength({ min: 4 }).withMessage('The Disable Reason field must be at least 4 characters in length.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,8
        if (checkAdminToken.status) {
            const check_access = await checkSubadminAccess({
                admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                admin_manager_type: checkAdminToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                event_row_id: Number.parseInt(req.params.request_row_id)
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const request_row_id = Number.parseInt(req.params.request_row_id)
                if (!Number.isNaN(request_row_id)) {
                    const check_query = await eventM.aggregate([
                        {
                            $match: { _id: request_row_id, active_status: 1 }
                        },
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
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                event_title: 1,
                                full_name: "$user_info.full_name",
                                email_id: "$user_info.email_id",
                            }
                        }
                    ])

                    if (check_query[0]) {
                        let event_title = check_query[0].event_title
                        let full_name = check_query[0].full_name
                        let email_id = check_query[0].email_id

                        if (check_query[0].user_row_id) {
                            await updateNotification({
                                user_row_id: check_query[0].user_row_id,
                                notify_type: 3,
                                notify_type_row_id: request_row_id,
                                message_row_id: 61,
                                action_row_id: request_row_id
                            })
                        }

                        let email_subject = " Heads Up! " + event_title + " Event Disabled, Needs Changes !"
                        let email_message = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Sorry to say this, your event <b>${event_title}</b> listing request has been denied  by our team.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reason:</b> ${req.body.disable_reason}</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login" style="color:#0029ff;">Login</a> to your Coinpedia account to submit the request again.</p>
                        `
                        await sendEventsEmail(email_id, email_subject, email_message)

                        let insArr = {}
                        insArr['active_status'] = 0
                        insArr['disable_reason'] = req.body.disable_reason
                        insArr['disabled_date_n_time'] = getPresentDateTime()

                        const updateFields = getUpdateTrackerFields(checkAdminToken)
                        Object.assign(insArr, updateFields, { updated_date_n_time: new Date() })

                        await eventM.updateOne({ _id: request_row_id }, { $set: insArr })
                        await deleteKeysByPattern('users_registered_list_*')
                        await deleteKeysByPattern('manage_events_list_*')
                        await deleteKeysByPattern('all_events_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')


                        res.json({ status: true, message: { alert_message: "This event details has been disabled successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Disable event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Delete event
router.post('/delete_event/:request_row_id', [
    check('deleted_reason')
        .not().isEmpty().withMessage('The Delete Reason field is required')
        .isLength({ min: 4 }).withMessage('The Delete Reason field must be at least 4 characters in length.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,8, 9
        if (checkAdminToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const request_row_id = Number.parseInt(req.params.request_row_id)
                if (!Number.isNaN(request_row_id)) {
                    const query = await eventM.findOne({ _id: request_row_id })
                    if (query) {

                        await deleteEvent({ event_row_id: request_row_id, deleted_reason: req.body.deleted_reason })
                        await deleteKeysByPattern('users_registered_list_*')
                        await deleteKeysByPattern('all_events_*')
                        await deleteKeysByPattern('manage_events_list_*')
                        res.json({ status: true, message: { alert_message: 'Event Deleted Successfully' } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Delete event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /view_event/:request_row_id's speakers sub-query. Resolves position name(s)
 * via getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads position_name from
 * `$info_work.position_name` — unchanged shape. `{ $limit: 1 }` kept in its
 * original position: after position resolution, before the company lookups.
 */
function buildViewEventSpeakersInfoWorkPipeline() {
    return [
        {
            $match: {
                $and: [
                    { user_row_id: { $nin: ["", null] } },
                    {
                        $expr: {
                            $and: [
                                { $eq: ['$user_row_id', '$$user_row_id'] },
                                { $eq: ['$public_view', true] },
                                { $eq: ['$user_account_type', '$$user_type'] }
                            ]
                        }
                    }
                ]
            }
        },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                            $and: [
                                { active_status: 1 },
                                {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$company_type'] },
                                            { $eq: ['$_id', "$$company_row_id"] }
                                        ]
                                    }
                                }
                            ]
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /view_event/:request_row_id's sponsors/partners sub-query, registered-user
 * branch (`user_info`). Resolves position name(s) via getPositionResolutionStages()
 * (both cln_static_professionals_work_positions and cln_manual_user_positions),
 * joined into a single display string via joinPositionNamesExpr, instead of the
 * previous static-only lookup. Downstream, the outer pipeline's final $project
 * still reads position_name from `$info_work.position_name` — unchanged shape.
 * `{ $limit: 1 }` kept in its original position: after position resolution,
 * before the company lookups.
 */
function buildSponsorsPartnersUserInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 1 } },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /view_event/:request_row_id's sponsors/partners sub-query, manually-entered
 * user branch (`user_manual_info`). Resolves position name(s) via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions and
 * cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads position_name from
 * `$info_work.position_name` — unchanged shape. Unlike the registered-user branch
 * above, this branch's original `{ $limit: 1 }` runs BEFORE position resolution
 * (not after) — preserved exactly as-is, not unified with the other branch.
 */
function buildSponsorsPartnersManualUserInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 2 } },
        { $limit: 1 },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

//Event individual view
router.get('/view_event/:request_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,8, 9
    if (checkAdminToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const checkEvent = await eventM.aggregate([
                    { $match: { _id: request_row_id } },
                    {
                        $lookup:
                        {
                            from: "cln_events_seo_details",
                            localField: "_id",
                            foreignField: "event_row_id",
                            as: "event_seo"
                        }
                    },
                    { $unwind: { path: "$event_seo", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info"
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
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
                            from: "cln_sub_admins",
                            localField: "created_by_sub_admin_id",
                            foreignField: "_id",
                            as: "sub_admin"
                        }
                    },
                    { $unwind: { path: "$sub_admin", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "cln_professionals",
                            localField: "updated_by_row_id",
                            foreignField: "_id",
                            as: "updated_by_user_info"
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_sub_admins",
                            localField: "updated_by_row_id",
                            foreignField: "_id",
                            as: "updated_by_admin_info"
                        }
                    },
                    // {
                    //     $lookup:
                    //     {
                    //         from: "cln_events_tags",
                    //         localField: "event_tags",
                    //         foreignField: "_id",
                    //         as: "eventTags"
                    //     }
                    // },
                    {
                        $addFields: {
                            tagIds: {
                                $cond: [
                                    { $isArray: "$event_tags" },
                                    "$event_tags",
                                    {
                                        $cond: [
                                            { $gt: [{ $size: { $ifNull: [{ $objectToArray: "$event_tags" }, []] } }, 0] },
                                            {
                                                $map: {
                                                    input: { $objectToArray: "$event_tags" },
                                                    as: "t",
                                                    in: "$$t.v"
                                                }
                                            },
                                            []
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_events_tags",
                            let: { tagIds: "$tagIds" },
                            pipeline: [
                                { $match: { $expr: { $in: ["$_id", "$$tagIds"] } } },
                                { $match: { active_status: true } }
                            ],
                            as: "eventTags"
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_events_utc_dates",
                            localField: "utc_row_id",
                            foreignField: "_id",
                            as: "utc_dates"
                        }
                    },
                    { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            user_row_id: 1,
                            company_row_id: 1,
                            list_event_type: 1,
                            event_title: 1,
                            event_tags: 1,
                            event_type: 1,
                            event_image: 1,
                            event_city: 1,
                            event_state: 1,
                            event_venue: 1,
                            event_url: 1,
                            event_link: 1,
                            event_card_image: 1,
                            start_date: 1,
                            end_date: 1,
                            event_price: 1,
                            event_description: 1,
                            event_brief: 1,
                            describe_in_one_line: 1,
                            event_image_type: 1,
                            ticket_link: 1,
                            contact_mobile_number: 1,
                            contact_email_id: 1,
                            active_status: 1,
                            approval_status: 1,
                            reason_for_reject: 1,
                            rejected_date_n_time: 1,
                            disable_reason: 1,
                            disabled_date_n_time: 1,
                            created_by_admin_status: 1,
                            created_by_sub_admin_id: 1,
                            created_date_n_time: 1,
                            speakers: 1,
                            meta_keywords: "$event_seo.meta_keywords",
                            meta_description: "$event_seo.meta_description",
                            meta_title: "$event_seo.meta_title",
                            contact_country_row_id: 1,
                            webinar_meeting_type: 1,
                            webinar_meeting_link: 1,
                            utc_row_id: 1,
                            latitude: 1,
                            longitude: 1,
                            alt_image_text: 1,
                            company_id: "$company_info.company_id",
                            company_name: "$company_info.company_name",
                            company_email_id: "$company_info.company_email_id",
                            about_company: "$company_info.about_company",
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                            user_bio: "$user_info.user_bio",
                            event_tags_array: "$eventTags",
                            sub_admin_full_name: "$sub_admin.full_name",
                            sub_admin_email_id: "$sub_admin.email_id",
                            sub_admin_name: {
                                $cond: [{ $eq: ["$created_by_admin_status", 2] }, "$sub_admin.full_name", null]
                            },
                            utc_time: "$utc_dates.utc_time",
                            country: "$utc_dates.country",
                            timezone: "$utc_dates.timezone",
                            build_event_page_score: 1,
                            seo_details_score: 1,
                            contact_details_score: 1,
                            tickets_coupons_score: 1,
                            speakers_score: 1,
                            sponsors_partners_score: 1,
                            attendees_score: 1,
                            faq_score: 1,
                            profile_score: 1,
                            updated_by: "$updated_by",
                            updated_by_row_id: "$updated_by_row_id",
                            updated_date_n_time: "$updated_date_n_time",
                            updated_by_full_name: {
                                $switch: {
                                    branches: [
                                        {
                                            case: { $eq: ["$updated_by", "user"] },
                                            then: {
                                                $let: {
                                                    vars: { userInfo: { $arrayElemAt: ["$updated_by_user_info", 0] } },
                                                    in: { $ifNull: ["$$userInfo.full_name", ""] }
                                                }
                                            }
                                        },
                                        {
                                            case: { $eq: ["$updated_by", "admin"] },
                                            then: {
                                                $let: {
                                                    vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                    in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                                }
                                            }
                                        },
                                        {
                                            case: { $eq: ["$updated_by", "subadmin"] },
                                            then: {
                                                $let: {
                                                    vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                    in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                                }
                                            }
                                        }
                                    ],
                                    default: ""
                                }
                            }
                        }
                    }
                ])


                let myArr = {}
                if (checkEvent[0]) {
                    myArr['_id'] = checkEvent[0]._id
                    myArr['user_row_id'] = checkEvent[0].user_row_id
                    myArr['company_row_id'] = checkEvent[0].company_row_id
                    myArr['event_tag_array'] = checkEvent[0].event_tag_array
                    myArr['list_event_type'] = checkEvent[0].list_event_type
                    myArr['event_title'] = checkEvent[0].event_title
                    myArr['event_tags'] = checkEvent[0].event_tags
                    myArr['event_type'] = checkEvent[0].event_type
                    myArr['event_image'] = checkEvent[0].event_image
                    myArr['event_image_type'] = checkEvent[0].event_image_type
                    myArr['event_city'] = checkEvent[0].event_city
                    myArr['ticket_link'] = checkEvent[0].ticket_link
                    myArr['event_state'] = checkEvent[0].event_state
                    myArr['event_venue'] = checkEvent[0].event_venue
                    myArr['event_url'] = checkEvent[0].event_url
                    myArr['event_link'] = checkEvent[0].event_link
                    myArr['start_date'] = checkEvent[0].start_date
                    myArr['end_date'] = checkEvent[0].end_date
                    myArr['event_price'] = checkEvent[0].event_price
                    myArr['event_description'] = checkEvent[0].event_description
                    myArr['event_brief'] = checkEvent[0].event_brief
                    myArr['contact_mobile_number'] = checkEvent[0].contact_mobile_number
                    myArr['contact_email_id'] = checkEvent[0].contact_email_id
                    myArr['active_status'] = checkEvent[0].active_status
                    myArr['approval_status'] = checkEvent[0].approval_status
                    myArr['reason_for_reject'] = checkEvent[0].reason_for_reject
                    myArr['rejected_date_n_time'] = checkEvent[0].rejected_date_n_time
                    myArr['disable_reason'] = checkEvent[0].disable_reason
                    myArr['disabled_date_n_time'] = checkEvent[0].disabled_date_n_time
                    myArr['created_by_admin_status'] = checkEvent[0].created_by_admin_status
                    myArr['created_by_sub_admin_id'] = checkEvent[0].created_by_sub_admin_id
                    myArr['created_date_n_time'] = checkEvent[0].created_date_n_time
                    myArr['sub_admin_name'] = checkEvent[0].sub_admin_name
                    myArr['meta_keywords'] = checkEvent[0].meta_keywords
                    myArr['meta_description'] = checkEvent[0].meta_description
                    myArr['meta_title'] = checkEvent[0].meta_title
                    myArr['user_name'] = checkEvent[0].user_name
                    myArr['full_name'] = checkEvent[0].full_name
                    myArr['email_id'] = checkEvent[0].email_id
                    myArr['company_id'] = checkEvent[0].company_id
                    myArr['company_name'] = checkEvent[0].company_name
                    myArr['webinar_meeting_type'] = checkEvent[0].webinar_meeting_type
                    myArr['webinar_meeting_link'] = checkEvent[0].webinar_meeting_link
                    myArr['longitude'] = checkEvent[0].longitude
                    myArr['latitude'] = checkEvent[0].latitude
                    myArr['company_email_id'] = checkEvent[0].company_email_id
                    myArr['about_company'] = checkEvent[0].about_company
                    myArr['user_bio'] = checkEvent[0].user_bio
                    myArr['utc_time'] = checkEvent[0].utc_time
                    myArr['timezone'] = checkEvent[0].timezone
                    myArr['utc_row_id'] = checkEvent[0].utc_row_id
                    myArr['country'] = checkEvent[0].country
                    myArr['alt_image_text'] = checkEvent[0].alt_image_text
                    myArr['event_faqs'] = await event_faqM.find({ event_row_id: checkEvent[0]._id })
                    myArr['contact_country_row_id'] = checkEvent[0].contact_country_row_id
                    myArr['build_event_page_score'] = checkEvent[0]?.build_event_page_score
                    myArr['seo_details_score'] = checkEvent[0]?.seo_details_score
                    myArr['contact_details_score'] = checkEvent[0]?.contact_details_score
                    myArr['tickets_coupons_score'] = checkEvent[0]?.tickets_coupons_score
                    myArr['speakers_score'] = checkEvent[0]?.speakers_score
                    myArr['sponsors_partners_score'] = checkEvent[0]?.sponsors_partners_score
                    myArr['attendees_score'] = checkEvent[0]?.attendees_score
                    myArr['faq_score'] = checkEvent[0]?.faq_score
                    myArr['profile_score'] = checkEvent[0]?.profile_score
                    myArr['updated_by'] = checkEvent[0]?.updated_by
                    myArr['updated_by_row_id'] = checkEvent[0]?.updated_by_row_id

                    myArr['updated_by_full_name'] = checkEvent[0]?.updated_by_full_name
                    myArr['updated_date_n_time'] = checkEvent[0]?.updated_date_n_time

                    if (checkEvent[0].contact_country_row_id) {
                        const countryQuery = await countryM.findOne({ _id: checkEvent[0].contact_country_row_id })
                        if (countryQuery) {
                            myArr['country_data'] = countryQuery
                        }
                    }


                    myArr['link_user_register_status'] = true
                    myArr['link_attendee_list_status'] = true
                    myArr['link_speaker_status'] = true
                    myArr['link_partner_status'] = true
                    myArr['link_sponsor_status'] = true
                    myArr['link_ticket_status'] = true
                    myArr['link_contact_status'] = true
                    const get_event_link_display_details = await event_link_display_detailsM.findOne({ event_row_id: checkEvent[0]._id })
                    if (get_event_link_display_details) {
                        myArr['link_user_register_status'] = get_event_link_display_details.link_user_register_status
                        myArr['link_attendee_list_status'] = get_event_link_display_details.link_attendee_list_status
                        myArr['link_speaker_status'] = get_event_link_display_details.link_speaker_status
                        myArr['link_partner_status'] = get_event_link_display_details.link_partner_status
                        myArr['link_sponsor_status'] = get_event_link_display_details.link_sponsor_status
                        myArr['link_ticket_status'] = get_event_link_display_details.link_ticket_status
                        myArr['link_contact_status'] = get_event_link_display_details.link_contact_status
                    }

                    myArr['tickets'] = await ticketM.find({ event_row_id: checkEvent[0]._id })
                    myArr['event_tags_array'] = checkEvent[0].event_tags_array

                    const contact_details = await event_contactsM.aggregate([
                        { $match: { event_row_id: checkEvent[0]._id } },
                        {
                            $lookup:
                            {
                                from: "cln_static_event_contact_types",
                                localField: "contact_type",
                                foreignField: "_id",
                                as: "contact_type_info"
                            }
                        },
                        { $unwind: { path: "$contact_type_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_static_countries",
                                localField: "country_id",
                                foreignField: "_id",
                                as: "country_info"
                            }
                        },
                        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: { contact_type: { $ifNull: ["$contact_type", 9] } }
                        },
                        {
                            $project:
                            {
                                contact_number: 1,
                                contact_type: 1,
                                contact_reason: 1,
                                email_id: 1,
                                country_id: 1,
                                contact_type_name: "$contact_type_info.contact_type_name",
                                country_code: "$country_info.country_code",
                                country_name: "$country_info.country_name"
                            }
                        }
                    ])

                    myArr['contact_details'] = contact_details.length > 0 ? contact_details : []

                    const get_speakers_query = await event_speakersM.aggregate([
                        {
                            $match: { event_row_id: checkEvent[0]._id }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                let: {
                                    user_row_id: '$user_row_id',
                                    user_type: '$user_type'
                                },
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [1, '$$user_type'] },
                                                            { $eq: ['$_id', '$$user_row_id'] }
                                                        ]
                                                    }
                                                },
                                                {
                                                    login_status: 1
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
                                        $project:
                                        {
                                            _id: 1,
                                            user_name: 1,
                                            full_name: 1,
                                            email_id: 1,
                                            approval_status: 1,
                                            profile_image: "$img_info.profile_image"
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_manual_retrievals",
                                let: {
                                    user_type: '$user_type',
                                    user_row_id: '$user_row_id'
                                },
                                as: "manual_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$user_type'] },
                                                    { $eq: ['$_id', '$$user_row_id'] }
                                                ]
                                            }
                                        }
                                    },

                                    {
                                        $project:
                                        {
                                            _id: 1,
                                            full_name: 1,
                                            email_id: 1,
                                            profile_image: 1,
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set:
                            {
                                user_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$user_type', 1] }
                                                    ]
                                                },
                                                then: "$user_info"
                                            },
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$user_type', 2] }
                                                    ]
                                                },
                                                then: "$manual_info"
                                            },
                                        ],
                                        default: ""
                                    }
                                },
                            }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_work_experiences",
                                let: {
                                    user_type: '$user_type',
                                    user_row_id: '$user_data._id'
                                },
                                pipeline: buildViewEventSpeakersInfoWorkPipeline(),
                                as: "info_work",
                            }
                        },
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                        { $match: { user_data: { $exists: true, $ne: "" } } },
                        {
                            $project:
                            {
                                _id: 1,
                                user_row_id: 1,
                                user_type: 1,
                                user_name: "$user_data.user_name",
                                full_name: "$user_data.full_name",
                                email_id: "$user_data.email_id",
                                profile_image: "$user_data.profile_image",
                                position_name: "$info_work.position_name",
                                company_name: "$info_work.company_name"
                            }
                        }
                    ])



                    if (get_speakers_query) {
                        myArr['speakers_usernames'] = await get_speakers_query.map(({ user_row_id, user_type }) => ({
                            user_row_id: user_row_id,
                            user_type: user_type,
                        }))
                        myArr['speakers_array'] = await get_speakers_query
                    }
                    else {
                        myArr['speakers_usernames'] = []
                        myArr['speakers_array'] = []
                    }


                    const sponsors_partners_query = await event_sponsors_partner_detailsM.aggregate([
                        {
                            $sort: {
                                _id: -1
                            }
                        },
                        { $match: { event_row_id: checkEvent[0]._id } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                let: {
                                    account_type: '$account_type',
                                    registered_type: '$registered_type',
                                    user_company_row_id: '$user_company_row_id'
                                },
                                as: "user_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [1, '$$account_type'] },
                                                            { $eq: [1, '$$registered_type'] },
                                                            { $eq: ['$_id', '$$user_company_row_id'] },
                                                        ]
                                                    }
                                                },
                                                {
                                                    login_status: 1
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
                                        $lookup:
                                        {
                                            from: "cln_professionals_work_experiences",
                                            localField: "_id",
                                            foreignField: "user_row_id",
                                            pipeline: buildSponsorsPartnersUserInfoWorkPipeline(),
                                            as: "info_work",
                                        }
                                    },
                                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            user_name: 1,
                                            profile_image: "$img_info.profile_image",
                                            position_name: "$info_work.position_name",
                                            company_name: "$info_work.company_name",
                                            full_name: 1,
                                            email_id: 1,
                                            approval_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_manual_retrievals",
                                let: {
                                    account_type: '$account_type',
                                    registered_type: '$registered_type',
                                    user_company_row_id: '$user_company_row_id'
                                },
                                as: "user_manual_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$account_type'] },
                                                    { $eq: [2, '$$registered_type'] },
                                                    { $eq: ['$_id', '$$user_company_row_id'] },
                                                ]
                                            }
                                        },
                                    },
                                    {
                                        $lookup:
                                        {
                                            from: "cln_professionals_work_experiences",
                                            localField: "_id",
                                            foreignField: "user_row_id",
                                            as: "info_work",
                                            pipeline: buildSponsorsPartnersManualUserInfoWorkPipeline(),

                                        }
                                    },
                                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            gender: 1,
                                            full_name: 1,
                                            email_id: 1,
                                            profile_image: 1,
                                            position_name: "$info_work.position_name",
                                            company_name: "$info_work.company_name"
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_company_lists",
                                let: {
                                    account_type: '$account_type',
                                    registered_type: '$registered_type',
                                    user_company_row_id: '$user_company_row_id'
                                },
                                as: "company_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [2, '$$account_type'] },
                                                            { $eq: [1, "$$registered_type"] },
                                                            { $eq: ['$_id', "$$user_company_row_id"] }
                                                        ]
                                                    }
                                                },
                                                {
                                                    active_status: 1
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            company_id: 1,
                                            company_logo: 1,
                                            company_name: 1,
                                            company_email_id: 1,
                                            website_link: 1,
                                            active_status: 1,
                                            approval_status: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_company_manual_retrievals",
                                let: {
                                    account_type: '$account_type',
                                    registered_type: '$registered_type',
                                    user_company_row_id: '$user_company_row_id'
                                },
                                as: "company_manual_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$account_type'] },
                                                    { $eq: [2, "$$registered_type"] },
                                                    { $eq: ['$_id', "$$user_company_row_id"] }
                                                ]
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set:
                            {
                                sp_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$account_type', 1] },
                                                        { $eq: ['$registered_type', 1] }
                                                    ]
                                                },
                                                then: "$user_info"
                                            },
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$account_type', 1] },
                                                        { $eq: ['$registered_type', 2] }
                                                    ]
                                                },
                                                then: "$user_manual_info"
                                            },
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$account_type', 2] },
                                                        { $eq: ['$registered_type', 1] }
                                                    ]
                                                },
                                                then: "$company_info"
                                            },
                                            {
                                                case: {
                                                    $and: [
                                                        { $eq: ['$account_type', 2] },
                                                        { $eq: ['$registered_type', 2] }
                                                    ]
                                                },
                                                then: "$company_manual_info"
                                            },
                                        ],
                                        default: ""
                                    }
                                }
                            }
                        },
                        {
                            $match:
                            {
                                sp_data: { $nin: ["", null] },
                            }
                        },
                        {
                            $project:
                            {
                                event_row_id: 1,
                                sponsor_partner_type: 1,
                                account_type: 1,
                                registered_type: 1,
                                user_company_row_id: 1,
                                sponsorship_type_title: 1,
                                manual_type: 1,
                                created_date_n_time: 1,
                                sp_user_position_name: { $cond: { if: "$user_info.position_name", then: "$user_info.position_name", else: "$user_manual_info.position_name" } },
                                sp_user_company_name: { $cond: { if: "$user_info.company_name", then: "$user_info.company_name", else: "$user_manual_info.company_name" } },
                                sp_image: { $cond: { if: "$sp_data.profile_image", then: "$sp_data.profile_image", else: "$sp_data.company_logo" } },
                                sp_name: { $cond: { if: "$sp_data.full_name", then: "$sp_data.full_name", else: "$sp_data.company_name" } },
                                sp_email_id: { $cond: { if: "$sp_data.email_id", then: "$sp_data.email_id", else: "$sp_data.company_email_id" } },
                                sp_link: { $cond: { if: "$sp_data.website_link", then: "$sp_data.website_link", else: "" } },
                            }
                        }
                    ])

                    myArr['sponsors_partners'] = sponsors_partners_query.length > 0 ? sponsors_partners_query : []

                    res.json({ status: true, message: myArr })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }

        }
        catch (err) {
            console.log('Event individual view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})



router.get('/user_view/:user_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            let user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const queryRun = await professionalsM.findOne({ _id: user_row_id })
                let resObject = {}
                if (queryRun) {
                    resObject['_id'] = queryRun._id
                    resObject['account_visible_type'] = queryRun.account_visible_type
                    resObject['wallet_address'] = queryRun.wallet_address
                    resObject['user_name'] = queryRun.user_name
                    resObject['full_name'] = queryRun.full_name
                    resObject['email_id'] = queryRun.email_id
                    resObject['mobile_number'] = queryRun.mobile_number
                    resObject['country_id'] = queryRun.country_id
                    resObject['login_status'] = queryRun.login_status
                    resObject['approval_status'] = queryRun.approval_status
                    resObject['reason_rejected'] = queryRun.reason_rejected
                    resObject['rejected_date_n_time'] = queryRun.rejected_date_n_time
                    resObject['gender'] = queryRun.gender
                    resObject['created_date_n_time'] = queryRun.created_date_n_time
                    resObject['email_verify_status'] = queryRun.email_verify_status
                    resObject['referral_user_name'] = queryRun.referral_user_name
                    resObject['designation_id_array'] = queryRun.designation_id
                    resObject['location'] = queryRun.location
                    resObject['user_bio'] = queryRun.user_bio

                    const user_designation_head = await professionals_work_experienceM.find({ user_row_id: queryRun._id, till_date_status: 2 }, { position: 1, company_name: 1, till_date_status: 1 }).sort({ start_date: -1 }).limit(1)
                    if (user_designation_head && user_designation_head.length > 0) {
                        resObject['work_position'] = user_designation_head[0].position
                        resObject['company_name'] = user_designation_head[0].company_name
                    }
                    else {
                        resObject['work_position'] = queryRun.work_position
                        resObject['company_name'] = queryRun.company_name
                    }
                    const socialQueryRun = await professionals_social_linksM.findOne({ user_row_id: user_row_id })
                    if (socialQueryRun) {
                        resObject['facebook'] = socialQueryRun.facebook
                        resObject['twitter'] = socialQueryRun.twitter
                        resObject['linkedin'] = socialQueryRun.linkedin
                        resObject['instagram'] = socialQueryRun.instagram
                        resObject['video_link'] = socialQueryRun.video_link
                        resObject['telegram'] = socialQueryRun.telegram
                        resObject['medium'] = socialQueryRun.medium
                        resObject['reddit'] = socialQueryRun.reddit
                    }
                    const seoQueryRun = await professionals_seo_detailsM.findOne({ user_row_id: user_row_id })
                    if (seoQueryRun) {
                        resObject['meta_keywords'] = seoQueryRun.meta_keywords
                        resObject['meta_description'] = seoQueryRun.meta_description
                        resObject['meta_title'] = seoQueryRun.meta_title
                    }

                    resObject['total_followers'] = await professionals_followersM.countDocuments({ following_user_row_id: user_row_id, confirm_request_status: 2 })
                    resObject['total_following'] = await professionals_followersM.countDocuments({ follower_user_row_id: user_row_id, confirm_request_status: 2 })

                    resObject['country_name'] = ''

                    resObject['disabled_history'] = await professionals_disabledM.find({ user_row_id: Number.parseInt(queryRun._id) })
                    resObject['recovery_history'] = await professionals_delete_actionsM.find({ user_row_id: Number.parseInt(queryRun._id) })


                    if (queryRun.country_id) {
                        const countryQuery = await countryM.findOne({ _id: Number.parseInt(queryRun.country_id) }, { country_name: 1 })
                        if (countryQuery) {
                            resObject['country_name'] = countryQuery.country_name
                        }
                    }

                    resObject['designation_name_list'] = []
                    if (queryRun.designation_id) {
                        resObject['designation_name_list'] = await user_designationsM.find({ _id: { $in: queryRun.designation_id }, active_status: true }, { designation_name: 1 })
                    }

                    resObject['set_password_status'] = Boolean(queryRun.password)
                    const imageQueryRun = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id })
                    if (imageQueryRun) {
                        if (imageQueryRun.profile_image_type == 0) {
                            resObject['profile_image'] = imageQueryRun.profile_image
                        }
                        else {
                            const default_image_query = await default_profile_imgM.findOne({ _id: imageQueryRun.profile_image_type })
                            if (default_image_query) {
                                resObject['profile_image'] = default_image_query['image_name']
                            }
                        }
                    }

                    let query = [{ event_row_id: { $exists: true } }]
                    if (req.query.search) {
                        query.push({ event_title: { '$regex': req.query.search, $options: 'i' } })
                    }
                    if (req.query.status) {
                        const status = Number.parseInt(req.query.status)
                        if (status === 1) {
                            query.push({ active_status: 1, approval_status: 0 })
                        }
                        else if (status === 2) {
                            query.push({ active_status: 1, approval_status: 1 })
                        }
                        else if (status === 3) {
                            query.push({ active_status: 1, approval_status: 2 })
                        }
                        else if (status === 4) {
                            query.push({ active_status: 0 })
                        }
                    }
                    if (Number.parseInt(req.query.end_date) === 1) {
                        query.push({ end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 })
                    }


                    const eventDetails = await event_speakersM.aggregate([
                        {
                            $match: { user_row_id: user_row_id }
                        },
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
                            $lookup:
                            {
                                from: "cln_company_lists",
                                localField: "event_info.company_row_id",
                                foreignField: "_id",
                                as: "company_info",

                            }
                        },
                        { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "event_info.user_row_id",
                                foreignField: "_id",
                                as: "host_info",

                            }
                        },
                        { $unwind: { path: "$host_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_events_utc_dates",
                                localField: "event_info.utc_row_id",
                                foreignField: "_id",
                                as: "utc_dates"
                            }
                        },
                        { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                event_title: "$event_info.event_title",
                                event_row_id: "$event_info._id",
                                active_status: "$event_info.active_status",
                                approval_status: "$event_info.approval_status",
                                end_date: "$event_info.end_date",
                            }
                        },
                        { $match: { $and: query } },
                        {
                            $project: {
                                list_event_type: "$event_info.list_event_type",
                                active_status: "$event_info.active_status",
                                event_title: "$event_info.event_title",
                                event_url: "$event_info.event_url",
                                start_date: "$event_info.start_date",
                                end_date: "$event_info.end_date",
                                event_type: "$event_info.event_type",
                                event_image: "$event_info.event_image",
                                event_price: "$event_info.event_price",
                                approval_status: "$event_info.approval_status",
                                user_name: "$host_info.user_name",
                                full_name: "$host_info.full_name",
                                company_id: "$company_info.company_id",
                                company_name: "$company_info.company_name",
                                utc_time: "$utc_dates.utc_time",
                                // events_count:{ $size:"$event_info"}
                            }
                        },
                        { $sort: { start_date: -1 } }
                    ])
                    resObject['eventDetails'] = eventDetails
                    resObject['count'] = eventDetails ? eventDetails.length : 0
                    res.json({ status: true, message: resObject, tokenStatus: true })
                }
                else {
                    res.json({ status: false, message: { alert_message: "No data Found" } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        catch (err) {
            console.log('User View.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

//Approve event
router.get('/approve_event/:request_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) // ,9
    if (checkAdminToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)

            if (!Number.isNaN(request_row_id)) {
                const check_event = await eventM.findOne({ _id: request_row_id, approval_status: { $ne: 1 } }, { event_title: 1 })
                if (check_event) {
                    const check_access = await checkSubadminAccess({
                        admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                        admin_manager_type: checkAdminToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                        event_row_id: check_event._id
                    })

                    if (check_access.status) {
                        let eventTitle = check_event.event_title
                        let generateUrl = await generateEventUrl(eventTitle, request_row_id)
                        const updateFields = getUpdateTrackerFields(checkAdminToken)
                        await eventM.updateOne({ _id: request_row_id }, { $set: { approval_status: 1, event_url: generateUrl, ...updateFields, updated_date_n_time: new Date() } })

                        const check_query = await eventM.aggregate([
                            {
                                $match: { _id: request_row_id }
                            },
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
                                    from: "cln_company_lists",
                                    localField: "company_row_id",
                                    foreignField: "_id",
                                    as: "company_info",

                                }
                            },
                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_professionals",
                                    localField: "updated_by_row_id",
                                    foreignField: "_id",
                                    as: "updated_by_user_info"
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_sub_admins",
                                    localField: "updated_by_row_id",
                                    foreignField: "_id",
                                    as: "updated_by_admin_info"
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_sub_admins",
                                    localField: "created_by_sub_admin_id",
                                    foreignField: "_id",
                                    as: "sub_admin_info",

                                }
                            },
                            { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_events_utc_dates",
                                    localField: "utc_row_id",
                                    foreignField: "_id",
                                    as: "utc_dates"
                                }
                            },
                            { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    event_title: 1,
                                    event_url: 1,
                                    start_date: 1,
                                    user_row_id: 1,
                                    company_row_id: 1,
                                    list_event_type: 1,
                                    event_venue: 1,
                                    event_type: 1,
                                    created_date_n_time: 1,
                                    full_name: "$user_info.full_name",
                                    user_name: "$user_info.user_name",
                                    email_id: "$user_info.email_id",
                                    company_email_id: "$company_info.company_email_id",
                                    company_name: "$company_info.company_name",
                                    sub_admin_full_name: "$sub_admin_info.full_name",
                                    sub_admin_email_id: "$sub_admin_info.email_id",
                                    utc_time: "$utc_dates.utc_time",
                                    updated_by: "$updated_by",
                                    updated_by_row_id: "$updated_by_row_id",
                                    updated_date_n_time: "$updated_date_n_time",
                                    updated_by_full_name: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: { $eq: ["$updated_by", "user"] },
                                                    then: {
                                                        $let: {
                                                            vars: { userInfo: { $arrayElemAt: ["$updated_by_user_info", 0] } },
                                                            in: { $ifNull: ["$$userInfo.full_name", ""] }
                                                        }
                                                    }
                                                },
                                                {
                                                    case: { $eq: ["$updated_by", "admin"] },
                                                    then: {
                                                        $let: {
                                                            vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                            in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                                        }
                                                    }
                                                },
                                                {
                                                    case: { $eq: ["$updated_by", "subadmin"] },
                                                    then: {
                                                        $let: {
                                                            vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                            in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                                        }
                                                    }
                                                }
                                            ],
                                            default: ""
                                        }
                                    }
                                }
                            }
                        ]).limit(1)
                        let start_date_formatted = DateFormatter(check_query[0].start_date)
                        const speaker_email_data = {
                            event_row_id: request_row_id,
                            event_title: check_query[0].event_title,
                            start_date: start_date_formatted,
                            event_url: check_query[0].event_url,
                            event_venue: check_query[0].event_venue,
                            list_event_type: check_query[0].list_event_type,
                            host_user_row_id: check_query[0].user_row_id,
                            host_name: check_query[0].full_name,
                            utc_time: check_query[0].utc_time,
                            invite_id: check_query[0].user_name ? check_query[0].user_name : ""
                        }
                        const check_speakers = await event_speakersM.find({ event_row_id: request_row_id }, { user_row_id: 1, user_type: 1 })
                        if (check_speakers.length > 0) {
                            await speakers_email(check_speakers, speaker_email_data)
                        }

                        let check_manual_speakers = await event_speakers_manualM.find({ event_row_id: request_row_id }, { email_id: 1, full_name: 1, gender: 1, company_name: 1 })
                        if (check_manual_speakers.length > 0) {
                            await manual_speakers_email(check_manual_speakers, speaker_email_data, check_query[0].user_row_id)
                        }

                        await followers_email({ event_row_id: request_row_id, event_data: speaker_email_data });

                        if (check_query[0].user_row_id) {
                            await updateNotification({
                                user_row_id: check_query[0].user_row_id,
                                notify_type: 3,
                                notify_type_row_id: check_query[0]._id,
                                message_row_id: 52,
                                action_row_id: check_query[0]._id
                            })
                        }


                        if (check_query[0]) {

                            if (check_query[0].email_id) {
                                await approve_event_email(check_query[0].event_title, check_query[0].event_url, check_query[0].full_name, check_query[0].email_id)
                            }
                            else if (check_query[0].company_email_id) {
                                await approve_event_email(check_query[0].event_title, check_query[0].event_url, check_query[0].company_name, check_query[0].company_email_id)
                            }
                            else if (check_query[0].sub_admin_email_id) {
                                await approve_event_email(check_query[0].event_title, check_query[0].event_url, check_query[0].sub_admin_full_name, check_query[0].sub_admin_email_id)
                            }
                            await deleteKeysByPattern('users_registered_list_*')
                            await deleteKeysByPattern('all_events_*')
                            await deleteKeysByPattern('manage_events_list_*')
                            const cardData = {
                                event_title: check_query[0].event_title,
                                start_date: start_date_formatted,
                                event_venue: (check_query[0]?.event_type == 1 || check_query[0]?.event_type == 3 || check_query[0]?.event_type == 4 || check_query[0]?.event_type == 5 || check_query[0]?.event_type == 6 || check_query[0]?.event_type == 7 || check_query[0]?.event_type == 8) ? check_query[0].event_venue : "Virtual",
                                event_url: check_query[0].event_url,
                                event_row_id: request_row_id,
                            };

                            await agenda.now("generate event card", cardData)
                            res.json({ status: true, message: { alert_message: "This event has been approved and published successfully.." } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message }, tokenStatus: true })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Approve event.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

const followers_email = async ({ event_row_id, event_data }) => {

    const get_event = await eventM.findOne({ _id: event_row_id })

    let unique_followers = []
    let follower_user_row_ids = {}

    if (get_event.list_event_type == 1 || get_event.list_event_type == 3 || get_event.list_event_type == 4 || get_event.list_event_type == 5 || get_event.list_event_type == 6 || get_event.list_event_type == 7 || get_event.list_event_type == 8) {
        let check_followers = await professionals_followersM.aggregate([
            { $match: { following_user_row_id: get_event.user_row_id, confirm_request_status: 2 } },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "follower_user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1 } },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            { $match: { user_info: { $exists: true } } },
            {
                $project: {
                    user_row_id: "$user_info._id",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                }
            }
        ])

        for (let follower of check_followers) {
            if (!follower_user_row_ids[follower.user_row_id]) {
                unique_followers.push({
                    user_row_id: follower.user_row_id,
                    user_name: follower.user_name,
                    full_name: follower.full_name,
                    email_id: follower.email_id,
                    notify_type: 1
                })
                follower_user_row_ids[follower.user_row_id] = true
            }
        }
    }

    if (get_event.list_event_type == 2 || get_event.list_event_type == 3 || get_event.list_event_type == 4 || get_event.list_event_type == 5 || get_event.list_event_type == 6 || get_event.list_event_type == 7 || get_event.list_event_type == 8) {
        const check_company_followers = await followersM.aggregate([
            { $match: { company_row_id: get_event.company_row_id } },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1 } },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            { $match: { user_info: { $exists: true } } },
            {
                $project: {
                    user_row_id: 1,
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                }
            }
        ])

        for (let follower of check_company_followers) {
            if (!follower_user_row_ids[follower.user_row_id]) {
                unique_followers.push({
                    user_row_id: follower.user_row_id,
                    user_name: follower.user_name,
                    full_name: follower.full_name,
                    email_id: follower.email_id,
                    notify_type: 2
                })
                follower_user_row_ids[follower.user_row_id] = true
            }
        }
    }

    if (unique_followers.length > 0) {
        for (let run of unique_followers) {
            if ((run.notify_type == 1) && (get_event.user_row_id)) {

                await updateNotification({
                    user_row_id: run.user_row_id,
                    notify_type: run.notify_type,
                    notify_type_row_id: get_event.user_row_id,
                    message_row_id: 64,
                    action_row_id: event_row_id,
                    event_row_id
                })
            }
            else if ((run.notify_type == 2) && (get_event.company_row_id)) {

                await updateNotification({
                    user_row_id: run.user_row_id,
                    notify_type: run.notify_type,
                    notify_type_row_id: get_event.company_row_id,
                    message_row_id: 64,
                    action_row_id: event_row_id,
                    event_row_id
                })
            }

            let email_subject = "🎉 Exciting New Event Just Launched! Join Us! 🎉"

            let email_message = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${run.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">We are thrilled to announce that a new event you might be interested in has just been approved! 🎉</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">As one of our valued followers, we wanted to give you the first look at what’s in store.</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">Event Details:</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Event Name: </b><a href=${"https://events.coinpedia.org/" + event_data.event_url} target="_blank" rel="nofollow" style="color:#0029ff; text-decoration: none;">${event_data.event_title}</a></p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Date: </b>${event_data.start_date}(${event_data.utc_time})</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Location: </b>${event_data.event_venue}</p>
            <a href=${"https://events.coinpedia.org/" + event_data.event_url} target="_blank" rel="nofollow" style="color:#0029ff">View event details </a>
            <p style="color:#000;font-weight: 400;font-size:17px;">We're eager to see you there and make this event a memorable experience for everyone! If you have any questions or need more information, please don't hesitate to reach out.
            Thank you for being a valued member of our community. Your participation makes our events even more special!</p>
            `

            await sendEmail(run.email_id, email_subject, email_message)

        }
    }
    return true
}

//Event approved email to host
const approve_event_email = async (event_title, event_url, full_name, email_id) => {
    let email_subject = "Congratulations! Your Event " + event_title + " Has Been Approved! 🎉"

    let email_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Exciting news! We're thrilled to inform you that your event, <b>${event_title}</b>, has been approved by our administrative team.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Now you can also manage the event details, tickets, speakers and invite attendees from your  <a href="https://app.coinpedia.org/login/" style="color:#0029ff">Coinpedia account. </a></p>
    <p style="color:#000;font-weight: 400;font-size:17px;">To view and share your approved event with your friends and colleagues, simply click on the following link:</p>
     <a href=${"https://events.coinpedia.org/" + event_url} target="_blank" rel="nofollow" style="color:#0029ff">See event details</a>
    <p style="color:#000;font-weight: 400;font-size:17px;">This link will take you directly to your event page, where you can find all the details and information about your event.</p>
    `

    await sendEmail(email_id, email_subject, email_message)
}

//Email to registered speakers after event approval
const speakers_email = async (speakers_data, email_data) => {

    if (speakers_data.length > 0) {
        for (let key in speakers_data) {
            if (speakers_data[key]?.user_type == 1) {
                let user_row_id = speakers_data[key].user_row_id
                const speakers_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1, user_name: 1, })


                let full_name = speakers_query['full_name']
                let email_id = speakers_query['email_id']

                let email_subject = "You’re Invited as Speaker | " + email_data.event_title + " event"
                let email_event_url = "https://events.coinpedia.org/" + email_data.event_url
                let email_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${email_data.host_name}</b> has invited you to join the <b>${email_data.event_title}</b> as a speaker on <b>${email_data.start_date} ${email_data.utc_time ? `(UTC${email_data.utc_time})` : ""}</b>.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Attend the event as a speaker and share your experience with the panel and attendees.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">See event details</a></p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Or <a href="https://app.coinpedia.org/login" style="color:#0029ff;">Login</a> to Coinpedia for more information. !</p>
                    `

                await updateNotification({
                    user_row_id: user_row_id,
                    notify_type: 3,
                    notify_type_row_id: email_data.event_row_id,
                    message_row_id: 54,
                    action_row_id: email_data.event_row_id
                })

                await sendEventsEmail(email_id, email_subject, email_message)
            }
            else if (speakers_data[key]?.user_type == 2) {
                let invite_id = email_data.invite_id
                let manual_query = await professionals_manual_retrievalsM.findOne({ _id: speakers_data[key].user_row_id })

                if (manual_query?.email_id) {
                    let manual_full_name = manual_query.full_name
                    let manual_email_id = manual_query.email_id
                    let work_position = manual_query.work_position ? manual_query.work_position : ""
                    let gender = manual_query.work_position ? manual_query.gender : 0
                    let company_name = ""

                    if (manual_query.company_type && manual_query.company_type == 1) {
                        let reg_company = await companyM.findOne({ _id: manual_query.company_row_id })
                        if (reg_company) {
                            company_name = reg_company.company_name
                        }
                    }
                    else if (manual_query.company_type && manual_query.company_type == 2) {
                        let manual_company = await company_manual_retrievalsM.findOne({ _id: manual_query.company_row_id })
                        if (manual_company) {
                            company_name = manual_company.company_name
                        }
                    }

                    let email_subject = "You’re Invited as Speaker | " + email_data.event_title + " event"
                    let email_event_url = "https://events.coinpedia.org/" + email_data.event_url

                    let email_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${manual_full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${email_data.host_name}</b> has invited you to join the <b>${email_data.event_title}</b> as a speaker on <b>${email_data.start_date} ${email_data.utc_time ? `(UTC${email_data.utc_time})` : ""} </b> Attend the event and share your experience with the panel and attendees.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"> <a href="${email_event_url}" style="color:#0029ff;">See event details</a></p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Or <a href="https://app.coinpedia.org/confirm-details/?reg_type=1&name=${manual_full_name}&email=${manual_email_id}&invite_id=${invite_id}&comp=${company_name}&desgn=${work_position}&gender=${gender}" style="color:#0029ff;font-weight: 700;">Register</a> to Coinpedia for more information. !</p>
                    `

                    await sendEventsEmail(manual_email_id, email_subject, email_message)
                }
            }
        }
    }
}

//Email to registered speakers after event approval
const manual_speakers_email = async (speakers_data, email_data, invite_id) => {
    if (speakers_data.length > 0) {
        for (let key in speakers_data) {
            let check_email_id = (speakers_data[key].email_id).toLowerCase()
            let full_name = speakers_data[key].full_name
            let email_subject = "You’re Invited as Speaker | " + email_data.event_title + " event"
            let email_event_url = "https://events.coinpedia.org/" + email_data.event_url
            let email_message = `
                           <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${email_data.host_name}</b> has invited you to join the <b>${email_data.event_title}</b> as a speaker on <b>${email_data.start_date}  ${email_data.utc_time ? `(UTC${email_data.utc_time})` : ""}</b> Attend the event and share your experience with the panel and attendees.</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color: #0029ff;">See event details </a></p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Or <a href="https://app.coinpedia.org/confirm-details/?reg_type=1&name=${full_name}&email=${check_email_id}&invite_id=${invite_id}&comp=${speakers_data[key].company_name}&desgn=${speakers_data[key].work_position}&gender=${speakers_data[key].gender}" style="color: #0029ff;">Register</a> to Coinpedia for more information. !</p>
                            `

            await sendEventsEmail(check_email_id, email_subject, email_message)
        }
    }
}

//Reject event
router.post('/reject_event/:request_row_id', [
    check('reason_for_reject')
        .not().isEmpty().withMessage('The Reason for Reject field is required')
        .isLength({ min: 4 }).withMessage('The Reason for Reject field must be at least 4 characters in length.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,9
        if (checkAdminToken.status) {
            const check_access = await checkSubadminAccess({
                admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                admin_manager_type: checkAdminToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                event_row_id: Number.parseInt(req.params.request_row_id)
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const request_row_id = Number.parseInt(req.params.request_row_id)
                if (!Number.isNaN(request_row_id)) {
                    const check_query = await eventM.aggregate([
                        {
                            $match: { _id: request_row_id, approval_status: 0 }
                        },
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
                                from: "cln_company_lists",
                                localField: "company_row_id",
                                foreignField: "_id",
                                as: "company_info",

                            }
                        },
                        { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_sub_admins",
                                localField: "created_by_sub_admin_id",
                                foreignField: "_id",
                                as: "sub_admin_info",

                            }
                        },
                        { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                event_title: 1,
                                event_url: 1,
                                user_row_id: 1,
                                full_name: "$user_info.full_name",
                                email_id: "$user_info.email_id",
                                company_email_id: "$company_info.company_email_id",
                                company_name: "$company_info.company_name",
                                sub_admin_full_name: "$sub_admin_info.full_name",
                                sub_admin_email_id: "$sub_admin_info.email_id",

                            }
                        }
                    ])

                    if (check_query[0]) {
                        if (check_query[0].user_row_id) {
                            await updateNotification({
                                user_row_id: check_query[0].user_row_id,
                                notify_type: 3,
                                notify_type_row_id: check_query[0]._id,
                                message_row_id: 53,
                                action_row_id: check_query[0]._id
                            })
                        }

                        let reject_reason = req.body.reason_for_reject
                        if (check_query[0].email_id) {
                            await reject_event_email(
                                check_query[0].event_title,
                                reject_reason,
                                check_query[0].full_name,
                                check_query[0].email_id
                            )
                        }
                        else if (check_query[0].company_email_id) {
                            await reject_event_email(
                                check_query[0].event_title,
                                reject_reason,
                                check_query[0].company_name,
                                check_query[0].company_email_id
                            )
                        }
                        else if (check_query[0].sub_admin_email_id) {
                            await reject_event_email(
                                check_query[0].event_title,
                                reject_reason,
                                check_query[0].sub_admin_full_name,
                                check_query[0].sub_admin_email_id
                            )
                        }
                        const updateFields = getUpdateTrackerFields(checkAdminToken)
                        await eventM.updateOne({ _id: request_row_id }, { $set: { approval_status: 2, reason_for_reject: req.body.reason_for_reject, rejected_date_n_time: getPresentDateTime(), ...updateFields, updated_date_n_time: new Date() } })

                        await deleteKeysByPattern('all_events_*')
                        await deleteKeysByPattern('users_registered_list_*')
                        await deleteKeysByPattern('manage_events_list_*')
                        res.json({ status: true, message: { alert_message: "This event details has been rejected successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Reject event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Email to host after event rejected
const reject_event_email = async (event_title, reject_reason, full_name, email_id) => {
    let email_subject = "Important Update on Your Event Listing Submission"

    let email_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We wanted to provide you with an update regarding your event listing submission for <b>${event_title}</b> After careful consideration, we regret to inform you that your event listing did not meet our current criteria and, unfortunately, could not be approved at this time.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Rejected reason : </b>${reject_reason}</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We encourage you to revisit the details of your event, making any necessary adjustments to improve its appeal and alignment with our platform's guidelines.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">You can login to your profile and make the desired changes in your event listing.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff">Login Now </a>to your profile . </p>
    `

    await sendEmail(email_id, email_subject, email_message)
}

router.get('/applied_list/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,8, 9
    if (checkAdminToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = { full_name: { '$regex': req.query.search, $options: 'i' } }
            }

            const checkList = await attend_eventM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "applied_user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
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
                        company_row_id: 1,
                        applied_user_row_id: 1,
                        date_n_time: 1,
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        gender: "$user_info.gender",
                        user_bio: "$user_info.user_bio",
                        event_title: "$event_info.event_title",
                        event_active_status: "$event_info.active_status"
                    }
                }
            ]).skip(skip).limit(limit)


            let myArr = []
            if (checkList) {
                for (let i of checkList) {
                    let innerObj = {}

                    innerObj['_id'] = i._id
                    innerObj['event_row_id'] = i.event_row_id
                    innerObj['company_row_id'] = i.company_row_id
                    innerObj['applied_user_row_id'] = i.applied_user_row_id
                    innerObj['date_n_time'] = i.date_n_time
                    innerObj['full_name'] = i.full_name
                    innerObj['user_name'] = i.user_name
                    innerObj['gender'] = i.gender
                    innerObj['user_bio'] = i.user_bio
                    innerObj['event_title'] = i.event_title
                    innerObj['event_active_status'] = i.event_active_status

                    const new_object = await Promise.resolve(innerObj)
                    myArr.push(new_object)
                }
                res.json({ status: true, message: myArr })
            }
            else {
                res.json({ status: true, message: [] })
            }
        }
        catch (err) {
            console.log('Applied list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})

//Update event tickets details
router.post('/update_ticket', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row Id field is required'),
    check('title')
        .not().isEmpty().withMessage('The Ticket Title field is required')
        .isLength({ min: 4 }).withMessage('The Ticket Title field must be at least 4 characters in length.'),
    check('benefits')
        .not().isEmpty().withMessage('The Benefits field is required'),
    check('ticket_type')
        .not().isEmpty().withMessage('The Ticket type field is required')
], async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken.status) {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)


            let admin_row_id = Number.parseInt(checkAdminToken.message.admin_row_id)
            const check_access = await checkSubadminAccess({
                admin_row_id: admin_row_id,
                admin_manager_type: checkAdminToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                event_row_id: Number.parseInt(sanitize(req.body.event_row_id))
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }

            if (req.body.benefits) {
                if (!Array.isArray(req.body.benefits)) {
                    errObj['benefits'] = "The benefits field contains only an array."
                }
            }
            else {
                errObj['benefits'] = "The benefits field is required."
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const event_row_id = Number.parseInt(sanitize(req.body.event_row_id))
                const checkEvent = await eventM.findOne({ _id: event_row_id })
                if (checkEvent) {
                    let price = ((req.body.ticket_type) == 1) ? (req.body.price) : 0
                    const insertArr = {}
                    insertArr['event_row_id'] = event_row_id
                    insertArr['title'] = req.body.title
                    insertArr['benefits'] = req.body.benefits
                    insertArr['ticket_type'] = req.body.ticket_type
                    insertArr['price'] = price
                    insertArr['updated_date_n_time'] = getPresentDateTime()
                    insertArr['sell_status'] = Number.parseInt(req.body.sell_status) === 1 ? 1 : 0

                    if (req.body.ticket_row_id) {
                        let ticket_row_id = Number.parseInt(req.body.ticket_row_id)
                        const findTicket = await ticketM.findOne({ _id: ticket_row_id })
                        if (findTicket) {
                            await ticketM.updateOne({ _id: ticket_row_id }, { $set: insertArr })

                            //save Lowest Price in Event
                            const getLowestPrice = await ticketM.find({ event_row_id: event_row_id, price: { $gt: 0 } }, { price: 1 }).sort({ price: 1 }).limit(1)
                            if (getLowestPrice.length > 0) {
                                if (getLowestPrice[0].price > 0) {
                                    const updateFields = getUpdateTrackerFields(checkAdminToken)
                                    await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: getLowestPrice[0].price, ...updateFields, updated_date_n_time: new Date() } })

                                }
                                else {
                                    const updateFields = getUpdateTrackerFields(checkAdminToken)
                                    await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: 0, ...updateFields, updated_date_n_time: new Date() } })
                                }
                            }
                            else {
                                const updateFields = getUpdateTrackerFields(checkAdminToken)
                                await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: 0, ...updateFields, updated_date_n_time: new Date() } })

                            }
                            await deleteKeysByPattern('individual_event_*')
                            await deleteKeysByPattern('ticket_list_*')

                            res.json({ status: true, message: { alert_message: 'Ticket updated successfully.' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry! Invalid Ticket Row Id.' } })
                        }
                    }
                    else {
                        insertArr['active_status'] = 1

                        await ticketM(insertArr).save()

                        //save Lowest Price in Event
                        const getLowestPrice = await ticketM.find({ event_row_id: event_row_id }, { price: 1 }).sort({ price: 1 }).limit(1)

                        if (getLowestPrice.length > 0) {
                            if (getLowestPrice[0].price > 0) {
                                const updateFields = getUpdateTrackerFields(checkAdminToken)
                                await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: getLowestPrice[0].price, ...updateFields, updated_date_n_time: new Date() } })
                            }
                            else {
                                const updateFields = getUpdateTrackerFields(checkAdminToken)
                                await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: 0, ...updateFields, updated_date_n_time: new Date() } })
                            }
                        }
                        else {
                            const updateFields = getUpdateTrackerFields(checkAdminToken)
                            await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: 0, ...updateFields, updated_date_n_time: new Date() } })

                        }
                        await deleteKeysByPattern('individual_event_*')
                        await deleteKeysByPattern('ticket_list_*')
                        await calculateEventScore(event_row_id, ['tickets_coupons'])

                        res.json({ status: true, message: { alert_message: 'New ticket created successfully.' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Event Row Id' } })
                }
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Update event ticket.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Tickets list
router.get('/ticket_list/:event_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let event_row_id = Number.parseInt(req.params.event_row_id)
            // , approval_status:1
            if (!Number.isNaN(event_row_id)) {
                const checkEvent = await eventM.findOne({ _id: event_row_id }, { _id: 1, active_status: 1 })
                if (checkEvent) {
                    const queryRun = await ticketM.aggregate([
                        { $match: { event_row_id: event_row_id } },
                        {
                            $lookup:
                            {
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
                                price: 1,
                                sell_status: 1,
                                active_status: 1,
                                updated_date_n_time: 1,
                                event_title: "$event_info.event_title",
                                event_image: "$event_info.event_image",
                                event_url: "$event_info.event_url",
                            }
                        }
                    ])

                    res.json({ status: true, message: { ticket_list: queryRun, eventData: checkEvent } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Event Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        catch (err) {
            console.log('Tickets list', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//View Individual ticket
router.get('/view_ticket/:ticket_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)
            if (!Number.isNaN(ticket_row_id)) {

                const checkTicket = await ticketM.findOne({ _id: ticket_row_id }, { _id: 1, event_row_id: 1, title: 1, benefits: 1, ticket_type: 1, price: 1, active_status: 1, updated_date_n_time: 1, sell_status: 1 })
                if (checkTicket) {
                    res.json({ status: true, message: checkTicket })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Ticket Row Id' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Ticket row id' } })
            }

        }
        catch (err) {
            console.log('View individual event ticket.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//Delete Ticket
router.get('/delete_ticket/:ticket_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)
            if (!Number.isNaN(ticket_row_id)) {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id })
                if (checkTicket) {
                    const event_row_id = checkTicket.event_row_id
                    const check_access = await checkSubadminAccess({
                        admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                        admin_manager_type: checkAdminToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                        event_row_id: event_row_id
                    })

                    if (check_access.status) {

                        deleteTickets({ type: 1, event_row_id: event_row_id, ticket_row_id: ticket_row_id })
                        await deleteKeysByPattern('individual_event_*')
                        await deleteKeysByPattern('ticket_list_*')
                        await calculateEventScore(event_row_id, ['tickets_coupons'])

                        res.json({ status: true, message: { alert_message: "This ticket details has been deleted successfully" } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
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
        catch (err) {
            console.log('Delete event ticket.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//Enable ticket
router.get('/enable_ticket/:ticket_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let ticket_row_id = Number.parseInt(req.params.ticket_row_id)
            if (!Number.isNaN(ticket_row_id)) {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id })
                if (checkTicket) {
                    if (Number.parseInt(checkTicket.active_status) === 0) {
                        await ticketM.updateOne({ _id: ticket_row_id }, { $set: { active_status: 1 } })
                        await deleteKeysByPattern('individual_event_*')
                        await deleteKeysByPattern('ticket_list_*')
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
        catch (err) {
            console.log('Enable event ticket.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

//Disable Ticket
router.get('/disable_ticket/:ticket_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let ticket_row_id = req.params.ticket_row_id
            if (!Number.isNaN(ticket_row_id)) {
                const checkTicket = await ticketM.findOne({ _id: ticket_row_id })
                if (checkTicket) {
                    if (Number.parseInt(checkTicket.active_status) === 1) {
                        await ticketM.updateOne({ _id: ticket_row_id }, { $set: { active_status: 0 } })
                        await deleteKeysByPattern('individual_event_*')
                        await deleteKeysByPattern('ticket_list_*')
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
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Ticket row id' } })
            }
        }
        catch (err) {
            console.log('Disable event ticket.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


//guest api starts here
router.post('/add_new_guest', [
    check('email_id')
        .not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.'),
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.'),
    check('guest_type')
        .not().isEmpty().withMessage('The Guest Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Guest Type field must be contain 1 or 2.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken.status) {
            const event_row_id = Number.parseInt(req.body.event_row_id)
            const event_query = await eventM.findOne({ _id: event_row_id, active_status: 1 }) // , approval_status:1
            if (!event_query) {
                errObj['event_row_id'] = 'Sorry, Invalid event row id.'
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let guest_email_row_id = ""
                const email_id = (req.body.email_id).toLowerCase()
                const guests_emails_query = await event_guests_emailsM.findOne({ email_id: email_id })
                if (guests_emails_query) {
                    guest_email_row_id = guests_emails_query._id
                }
                else {
                    const guests_emails_insert_query = await event_guests_emailsM({ email_id: email_id }).save()
                    guest_email_row_id = guests_emails_insert_query._id
                }

                let invite_status = 1
                if (Number.parseInt(req.body.guest_type) == 1) {
                    invite_status = 0
                }

                const check_insert_query = await event_guestsM.findOne({ guest_email_row_id: guest_email_row_id, event_row_id: event_row_id })
                if (!check_insert_query) {
                    const insertArr = {
                        guest_email_row_id: guest_email_row_id,
                        event_row_id: req.body.event_row_id,
                        invite_status: invite_status,
                        created_date_n_time: getPresentDateTime()
                    }
                    const guestData = await event_guestsM(insertArr).save()


                    //email code starts here
                    let guest_message_to_pass = ""
                    let guest_pass_subject = ""
                    let alert_message = 'New guest invitation request has been sent successfully.'
                    if (Number.parseInt(req.body.guest_type) == 1) {
                        let guest_message = ""
                        if (req.body.guest_message) {
                            guest_message = req.body.guest_message
                        }
                        const invite_req_url = "https://app.coinpedia.org/events/" + event_query.event_url + "?invitation_id=" + guestData._id

                        guest_pass_subject = "You are invited to " + event_query.event_title
                        guest_message_to_pass = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
                        <div style="color:#000">
                            <p style="text-align:center;font-size: 17px;margin-top: 30px;font-weight: 400;"><b>Please join me at ${event_query.event_title}</b></p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${invite_req_url}"  style="color:#0029ff;">Accept Invite<a></p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">${guest_message}</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Can't make it? Decline the invite to stop receiving event communications.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Share with friends</p>
                        </div>
                        </div>`


                    }
                    else {
                        alert_message = 'This guest details has been added successfully guest list.'
                        const invite_req_url = "https://app.coinpedia.org/events/" + event_query.event_url
                        guest_pass_subject = "You've been added to " + event_query.event_title
                        guest_message_to_pass = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
                        <div style="color:#000">
                            <p style="text-align:center;font-size: 17px;margin-top: 30px;font-weight: 400;"><b>You've been added to ${event_query.event_title}</b></p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${invite_req_url}" style="color:#0029ff;">Attend Event<a></p>
                        </div>
                        </div>`
                    }

                    await sendEventsEmail(email_id, guest_pass_subject, guest_message_to_pass)
                    //email code ends here


                    res.json({ status: true, message: { alert_message: alert_message } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, This Email ID is already added to event guest list.' } })
                }



            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Add new guest.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/guest_list/:event_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const checkEvent = await eventM.findOne({ _id: event_row_id }, { _id: 1, event_title: 1 })
                const queryRun = await event_guestsM.aggregate([
                    {
                        $match: { event_row_id: event_row_id }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_events_guests_emails",
                            localField: "guest_email_row_id",
                            foreignField: "_id",
                            as: "eventsEmails"
                        }
                    },
                    { $unwind: { path: "$eventsEmails", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_events",
                            localField: "event_row_id",
                            foreignField: "_id",
                            as: "events"
                        }
                    },
                    { $unwind: { path: "$events", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            event_row_id: 1,
                            full_name: "$eventsEmails.full_name",
                            email_id: "$eventsEmails.email_id",
                            invite_status: 1,
                            created_date_n_time: 1
                        }
                    }
                ]).sort({ _id: -1 })

                res.json({ status: true, message: { guest_list: queryRun, eventData: checkEvent } })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        catch (err) {
            console.log('Guest list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.get('/delete_guest/:guest_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            const guest_row_id = Number.parseInt(req.params.guest_row_id)
            if (!Number.isNaN(guest_row_id)) {
                const check_query = await event_guestsM.findOne({ _id: guest_row_id })
                if (check_query) {
                    const guest_email_row_id = check_query.guest_email_row_id
                    await event_guestsM.deleteOne({ _id: guest_row_id })
                    const check_query2 = await event_guestsM.findOne({ guest_email_row_id: guest_email_row_id })
                    if (!check_query2) {
                        await event_guestsM.deleteOne({ _id: guest_email_row_id })
                    }

                    res.json({ status: true, message: { alert_message: 'This event guest details has been deleted successfully.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Event Row ID' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Guest row id' } })
            }
        }
        catch (err) {
            console.log('Delete guest.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})
//guest api end here



router.get('/attendee_list/:event_row_id/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
        let event_row_id = Number.parseInt(req.params.event_row_id)
        try {
            if (!Number.isNaN(event_row_id)) {
                const event_query = await eventM.aggregate([
                    {
                        $match: { _id: event_row_id }
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
                            active_status: 1,
                            event_tag_array: "$eventTags.event_tag"
                        }
                    }
                ]).limit(1)
                if (event_query) {

                    let query = {}
                    if (req.query.search) {
                        query = { full_name: { '$regex': req.query.search, $options: 'i' } }
                    }
                    // user_row_id:user_row_id, 
                    const attendee_list_query = await attend_eventM.aggregate([
                        { $match: { event_row_id: event_row_id } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "applied_user_row_id",
                                foreignField: "_id",
                                as: "user_info"
                            }
                        },
                        { $match: { "user_info": { $elemMatch: query } } },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_profile_images",
                                localField: "applied_user_row_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                applied_user_row_id: 1,
                                date_n_time: 1,
                                full_name: "$user_info.full_name",
                                user_name: "$user_info.user_name",
                                work_position: "$user_info.work_position",
                                company_name: "$user_info.company_name",
                                gender: "$user_info.gender",
                                user_bio: "$user_info.user_bio",
                                profile_image: "$img_info.profile_image"
                            }
                        }
                    ]).sort({ _id: -1 }).skip(skip).limit(limit)

                    // user_row_id:user_row_id,
                    const queryCount = await attend_eventM.aggregate([
                        { $match: { event_row_id: event_row_id } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "applied_user_row_id",
                                foreignField: "_id",
                                as: "user_info"
                            }
                        },
                        { $match: { "user_info": { $elemMatch: query } } },
                        {
                            $count: "count"
                        }
                    ])

                    let totalCount = 0
                    if (queryCount[0]) {
                        totalCount = queryCount[0].count
                    }

                    res.json({ status: true, message: { overview: event_query[0], attendee_list: attendee_list_query, count: totalCount } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid Event Row ID" } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        catch (err) {
            res.json({ status: false, message: err })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /speakers_list/:skip/:limit. This location already had BOTH a static-only
 * (cln_static_professionals_work_positions) and a manual (cln_manual_user_positions)
 * lookup before this fix — unlike the other 7 locations in this file, which were
 * static-only. Upgraded from that dual-but-singular (position_type $cond) approach
 * to full getPositionResolutionStages() + joinPositionNamesExpr support for the
 * complete positions[] array, matching the other 7 locations. Downstream, the outer
 * pipeline's final $project still reads `work_position` from
 * `$info_work.position_name` — unchanged shape. `{ $limit: 1 }` kept in its
 * original position: after the initial $match, before position resolution (this
 * location's pre-existing order, differs from most other locations where $limit
 * comes after position resolution).
 */
function buildSpeakersListInfoWorkPipeline() {
    return [
        {
            $match: {
                $and: [
                    { user_row_id: { $nin: ["", null] } },
                    {
                        $expr: {
                            $and: [
                                { $eq: ["$user_row_id", "$$user_row_id"] },
                                { $eq: ["$public_view", true] },
                                { $eq: ["$user_account_type", "$$user_type"] }
                            ]
                        }
                    }
                ]
            }
        },
        { $limit: 1 },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
        {
            $lookup: {
                from: "cln_company_lists",
                let: { company_type: "$company_type", company_row_id: "$company_row_id" },
                as: "info_company",
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: [1, "$$company_type"] },
                                    { $eq: ["$_id", "$$company_row_id"] },
                                    { $eq: ["$active_status", 1] }
                                ]
                            }
                        }
                    },
                    { $project: { _id: 1, company_name: 1 } }
                ]
            }
        },
        { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "cln_company_manual_retrievals",
                let: { company_type: "$company_type", company_row_id: "$company_row_id" },
                as: "info_manual_company",
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: [2, "$$company_type"] },
                                    { $eq: ["$_id", "$$company_row_id"] }
                                ]
                            }
                        }
                    },
                    { $project: { _id: 1, company_name: 1 } }
                ]
            }
        },
        { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                position_name: "$resolved_position_name",
                company_name: {
                    $cond: {
                        if: "$info_company.company_name",
                        then: "$info_company.company_name",
                        else: "$info_manual_company.company_name"
                    }
                }
            }
        }
    ]
}

router.get('/speakers_list/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (!checkAdminToken.status)
        return res.json(checkAdminToken)

    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100


        let query = [{}]
        if (req.query.search) {
            query.push({
                $or: [
                    { full_name: { '$regex': req.query.search, $options: 'i' } },
                    { user_name: { '$regex': req.query.search, $options: 'i' } },
                    { email_id: { '$regex': req.query.search, $options: 'i' } }
                ]
            })
        }

        if (req.query.user_type) {
            const user_type_array = [1, 2]
            if (user_type_array.includes(Number.parseInt(req.query.user_type))) {
                query.push({ user_type: Number.parseInt(req.query.user_type) })
            }
        }

        let match_event_query = [{}]
        if (req.query.active_type && Number.parseInt(req.query.active_type) === 1) {
            const present_date_n_time = getPresentDateTime()
            match_event_query.push({ end_date: { $gte: new Date(present_date_n_time) } })
        }

        const result = await event_speakersM.aggregate([
            {
                $match: { user_type: { $nin: ["", null] } }
            },
            {
                $lookup: {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        { $match: { $and: match_event_query } },
                        { $project: { _id: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$event_info" } },

            {
                $group: {
                    _id: { user_type: "$user_type", user_row_id: "$user_row_id" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "_id.user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1 } },
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info",
                                pipeline: [
                                    { $limit: 1 },
                                    { $project: { _id: 0, profile_image: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                                pro_batch: 1,
                                approval_status: 1,
                                login_status: 1,
                                profile_image: "$img_info.profile_image"
                            }
                        },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    login_status: {
                        $cond: {
                            if: { $eq: ["$_id.user_type", 1] },
                            then: "$user_info.login_status",
                            else: 1
                        }
                    }
                }
            },
            { $match: { login_status: 1 } },
            {
                $lookup: {
                    from: "cln_professionals_manual_retrievals",
                    localField: "_id.user_row_id",
                    foreignField: "_id",
                    as: "manual_info",
                    pipeline: [
                        {
                            $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 }
                        },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    user_data: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$_id.user_type", 1] }, then: "$user_info" },
                                { case: { $eq: ["$_id.user_type", 2] }, then: "$manual_info" }
                            ],
                            default: ""
                        }
                    }
                }
            },
            {
                $set: {
                    user_name: { $ifNull: ["$user_data.user_name", ""] },
                    full_name: "$user_data.full_name",
                    email_id: { $ifNull: ["$user_data.email_id", ""] },
                    pro_batch: { $ifNull: ["$user_data.pro_batch", ""] },
                    user_type: "$_id.user_type"
                }
            },
            { $match: { $and: query } },
            {
                $facet: {
                    totalCount: [
                        { $count: "count" }
                    ],
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: "cln_professionals_work_experiences",
                                let: { user_type: "$_id.user_type", user_row_id: "$user_data._id" },
                                as: "info_work",
                                pipeline: buildSpeakersListInfoWorkPipeline()
                            }
                        },
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                count: 1,
                                user_row_id: "$_id.user_row_id",
                                user_type: 1,
                                user_name: 1,
                                full_name: 1,
                                pro_batch: 1,
                                email_id: 1,
                                approval_status: "$user_data.approval_status",
                                login_status: "$user_data.login_status",
                                profile_image: "$user_data.profile_image",
                                work_position: "$info_work.position_name",
                                company_name: "$info_work.company_name"
                            }
                        }
                    ]
                }
            }
        ], { allowDiskUse: true })

        const get_speakers_query = result[0]?.data || []
        const speakers_counts = result[0]?.totalCount[0]?.count || 0

        const finalResult = {
            data: get_speakers_query,
            count: speakers_counts
        }


        res.json({ status: true, message: finalResult, cache_response_status: false })

    } catch (err) {
        console.log('Speakers list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /speaker_basic_details/:user_type/:user_row_id, user_type===1 (registered)
 * branch. Resolves position name(s) via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions), joined
 * into a single display string via joinPositionNamesExpr, instead of the previous
 * static-only lookup. Downstream, the outer pipeline's final $project still reads
 * position_name from `$info_work.position_name` — unchanged shape. `{ $limit: 1 }`
 * kept in its original position: after position resolution, before the company
 * lookups.
 */
function buildSpeakerBasicDetailsRegisteredInfoWorkPipeline() {
    return [
        {
            $match: {
                $and: [
                    { user_row_id: { $nin: ["", null] } },
                    {
                        $expr: {
                            $and: [
                                { $eq: ['$user_row_id', '$$user_row_id'] },
                                { $eq: ['$public_view', true] },
                                { $eq: ['$user_account_type', 1] }
                            ]
                        }
                    }
                ]
            }
        },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                            $and: [
                                { active_status: 1 },
                                {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$company_type'] },
                                            { $eq: ['$_id', "$$company_row_id"] }
                                        ]
                                    }
                                }
                            ]
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /speaker_basic_details/:user_type/:user_row_id, user_type===2 (manually
 * entered) branch. Structurally near-identical to
 * buildSpeakerBasicDetailsRegisteredInfoWorkPipeline above (only the
 * user_account_type match value differs: 2 vs 1) but kept as its own,
 * separately-named function per this task's process instructions (never merge
 * near-identical locations). Resolves position name(s) via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions and
 * cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads position_name from
 * `$info_work.position_name` — unchanged shape.
 */
function buildSpeakerBasicDetailsManualInfoWorkPipeline() {
    return [
        {
            $match: {
                $and: [
                    { user_row_id: { $nin: ["", null] } },
                    {
                        $expr: {
                            $and: [
                                { $eq: ['$user_row_id', '$$user_row_id'] },
                                { $eq: ['$public_view', true] },
                                { $eq: ['$user_account_type', 2] }
                            ]
                        }
                    }
                ]
            }
        },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                            $and: [
                                { active_status: 1 },
                                {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$company_type'] },
                                            { $eq: ['$_id', "$$company_row_id"] }
                                        ]
                                    }
                                }
                            ]
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

//Individual speakers view
router.get('/speaker_basic_details/:user_type/:user_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const user_type = Number.parseInt(req.params.user_type)
            const user_row_id = Number.parseInt(req.params.user_row_id)

            if (user_type == 1) {
                const get_query = await professionalsM.aggregate([
                    {
                        $match: {
                            _id: user_row_id
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_professionals_profile_images",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "img_info",
                            pipeline: [
                                {
                                    $project: {
                                        profile_image: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            let: {
                                user_row_id: '$_id'
                            },
                            pipeline: buildSpeakerBasicDetailsRegisteredInfoWorkPipeline(),
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            user_name: 1,
                            full_name: 1,
                            pro_batch: 1,
                            email_id: 1,
                            position_name: "$info_work.position_name",
                            company_name: "$info_work.company_name",
                            profile_image: "$img_info.profile_image",
                            approval_status: 1
                        }
                    }
                ]).limit(1)

                if (get_query[0]) {
                    res.json({ status: true, message: get_query[0] })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid user type or user row id" } })
                }
            }
            else if (user_type == 2) {
                const get_query = await professionals_manual_retrievalsM.aggregate([
                    {
                        $match: {
                            _id: user_row_id
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            let: {
                                user_row_id: '$_id'
                            },
                            pipeline: buildSpeakerBasicDetailsManualInfoWorkPipeline(),
                            as: "info_work",
                        }
                    },
                    { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            full_name: 1,
                            pro_batch: 1,
                            email_id: 1,
                            profile_image: 1,
                            position_name: "$info_work.position_name",
                            company_name: "$info_work.company_name"
                        }
                    }
                ]).limit(1)


                if (get_query[0]) {
                    res.json({ status: true, message: get_query[0] })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid user type or user row id" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid user type or user row id' } })
            }
        }
        catch (err) {
            console.log('Speaker basic details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


//List of events of the speaker
router.get('/speaker_events/:user_type/:user_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const user_type = Number.parseInt(req.params.user_type)
            const user_row_id = Number.parseInt(req.params.user_row_id)

            let query = [{}]
            if (req.query.search) {
                query.push({ event_title: { '$regex': req.query.search, $options: 'i' } })
            }

            if (req.query.status) {
                const status = Number.parseInt(req.query.status)
                if (status === 1) {
                    query.push({ active_status: 1, approval_status: 0 })
                }
                else if (status === 2) {
                    query.push({ active_status: 1, approval_status: 1 })
                }
                else if (status === 3) {
                    query.push({ active_status: 1, approval_status: 2 })
                }
                else if (status === 4) {
                    query.push({ active_status: 0 })
                }
            }

            const get_speakers_events_query = await event_speakersM.aggregate([
                {
                    $match: {
                        user_type: user_type, user_row_id: user_row_id
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "host_info"
                                }
                            },
                            { $unwind: { path: "$host_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_company_lists",
                                    localField: "company_row_id",
                                    foreignField: "_id",
                                    as: "company_info",
                                }
                            },
                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup:
                                {
                                    from: "cln_events_utc_dates",
                                    localField: "utc_row_id",
                                    foreignField: "_id",
                                    as: "utc_dates"
                                }
                            },
                            { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                            {
                                $match: { $and: query }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    list_event_type: 1,
                                    active_status: 1,
                                    event_title: 1,
                                    event_url: 1,
                                    start_date: 1,
                                    end_date: 1,
                                    event_type: 1,
                                    event_image: 1,
                                    event_price: 1,
                                    approval_status: 1,
                                    user_name: "$host_info.user_name",
                                    full_name: "$host_info.full_name",
                                    company_id: "$company_info.company_id",
                                    company_name: "$company_info.company_name",
                                    utc_time: "$utc_dates.utc_time"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $project: {
                        event_row_id: 1,
                        list_event_type: "$event_info.list_event_type",
                        active_status: "$event_info.active_status",
                        event_title: "$event_info.event_title",
                        event_url: "$event_info.event_url",
                        start_date: "$event_info.start_date",
                        end_date: "$event_info.end_date",
                        event_type: "$event_info.event_type",
                        event_image: "$event_info.event_image",
                        event_price: "$event_info.event_price",
                        approval_status: "$event_info.approval_status",
                        user_name: "$event_info.user_name",
                        full_name: "$event_info.full_name",
                        company_id: "$event_info.company_id",
                        company_name: "$event_info.company_name",
                        utc_time: "$event_info.utc_time"
                    }
                }
            ])

            res.json({ status: true, message: get_speakers_events_query })
        }
        catch (err) {
            console.log("Speaker's events list", err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



//Speakers count overview
const speakersCountOverview = async ({ active_type, user_type }) => {

    let query = [{}]
    if (active_type) {
        if (active_type == 1) {
            const present_date_n_time = getPresentDateTime()
            query.push({ end_date: { $gte: new Date(present_date_n_time) } })
        }
    }

    let user_query = [{ user_type: { $nin: ["", null] } }]
    if (user_type) {
        user_query.push({ user_type: user_type })
    }

    const get_query = await event_speakersM.aggregate([
        {
            $match: { $and: user_query }
        },
        {
            $lookup:
            {
                from: "cln_events",
                localField: "event_row_id",
                foreignField: "_id",
                as: "event_info",
                pipeline: [
                    {
                        $match: { $and: query }
                    },
                    {
                        $project: {
                            _id: 1
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$event_info" } },
        {
            $group: {
                _id: { user_row_id: "$user_row_id", user_type: "$user_type" }
            }
        },
        {
            $lookup:
            {
                from: "cln_professionals",
                let: {
                    user_row_id: '$_id.user_row_id',
                    user_type: '$_id.user_type'
                },
                as: "user_info",
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: [1, "$$user_type"] },
                                    { $eq: ['$_id', '$$user_row_id'] },
                                    { $eq: ["$login_status", 1] }
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            login_status: 1
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
        {
            $set: {
                login_status: { $cond: { if: { $eq: ["$_id.user_type", 1] }, then: "$user_info.login_status", else: 1 } }
            }
        },
        {
            $match: {
                login_status: 1
            }
        },
        {
            $count: 'count'
        }
    ])

    let counts = 0
    if (get_query[0]) {
        counts = get_query[0].count
    }
    return counts
}


router.get('/new_speakers_overview', checkApiKey, async (req, res) => {

    try {
        let result = {}
        let key = "new_speakers_overview"
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            // total Speakers & Active speakers
            // result['all_count'] = await speakersCountOverview({active_type:0, user_type:0})
            // result['active_count'] = await speakersCountOverview({active_type:1, user_type:0})


            // // Registered Speakers & Active Speakers
            result['register_count'] = await speakersCountOverview({ active_type: 0, user_type: 1 })
            result['register_active_count'] = await speakersCountOverview({ active_type: 1, user_type: 1 })

            // // Manual Speakers & Active Speakers
            result['manual_count'] = await speakersCountOverview({ active_type: 0, user_type: 2 })
            result['manual_active_count'] = await speakersCountOverview({ active_type: 1, user_type: 2 })

            await setCache({ key: key, value: result, ttl: 120 })

            res.json({ status: true, message: result, cache_reponse_status: false })
        }
        else {

            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Speakers Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
    // }
    // else
    // {
    //     res.json(checkToken)
    // }
})

router.get('/speakers_overview', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (!checkToken.status) return res.json(checkToken)

    try {
        const present_date_n_time = getPresentDateTime()
        const activeEventFilter = { end_date: { $gte: new Date(present_date_n_time) } }

        const result = await event_speakersM.aggregate([

            { $match: { user_type: { $nin: ["", null] } } },

            {
                $lookup: {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        { $project: { _id: 1, end_date: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$event_info" } },

            {
                $group: {
                    _id: { user_row_id: "$user_row_id", user_type: "$user_type" },
                    max_end_date: { $max: "$event_info.end_date" }
                }
            },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "_id.user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1 } },
                        { $project: { _id: 1, login_status: 1 } },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    login_status: {
                        $cond: {
                            if: { $eq: ["$_id.user_type", 1] },
                            then: "$user_info.login_status",
                            else: 1
                        }
                    }
                }
            },
            { $match: { login_status: 1 } },
            {
                $facet: {
                    register_count: [
                        { $match: { "_id.user_type": 1 } },
                        { $count: "count" }
                    ],
                    register_active_count: [
                        {
                            $match: {
                                "_id.user_type": 1,
                                max_end_date: { $gte: new Date(present_date_n_time) }
                            }
                        },
                        { $count: "count" }
                    ],
                    manual_count: [
                        { $match: { "_id.user_type": 2 } },
                        { $count: "count" }
                    ],
                    manual_active_count: [
                        {
                            $match: {
                                "_id.user_type": 2,
                                max_end_date: { $gte: new Date(present_date_n_time) }
                            }
                        },
                        { $count: "count" }
                    ]
                }
            }
        ], { allowDiskUse: true })
        const facet = result[0] || {}
        const finalResult = {
            register_count: facet.register_count?.[0]?.count || 0,
            register_active_count: facet.register_active_count?.[0]?.count || 0,
            manual_count: facet.manual_count?.[0]?.count || 0,
            manual_active_count: facet.manual_active_count?.[0]?.count || 0,
        }

        res.json({ status: true, message: finalResult })

    } catch (err) {
        console.log('Speakers Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /notify_users_list/:event_row_id. Resolves position name(s) via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions and
 * cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads position_name from
 * `$info_work.position_name` — unchanged shape. `{ $limit: 1 }` kept in its
 * original position: after position resolution, before the company lookups.
 * The manual-company sub-lookup's own pre-existing `{ $limit: 1 }` (before its
 * $project) is preserved exactly as-is — a real, existing quirk not present in
 * the other 7 locations, not something to "fix" here.
 */
function buildNotifyUsersListInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 1 } },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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
                    { $limit: 1 },
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
                position_name: '$resolved_position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
            }
        }
    ]
}

//Notify users list
router.get('/notify_users_list/:event_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            const event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const event_query = await eventM.findOne({ _id: event_row_id }, { _id: 1 })
                if (event_query) {
                    const queryRun = await notify_userM.aggregate([
                        { $match: { event_row_id: event_row_id } },
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
                                from: "cln_professionals_profile_images",
                                localField: "user_row_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_work_experiences",
                                localField: "user_row_id",
                                foreignField: "user_row_id",
                                pipeline: buildNotifyUsersListInfoWorkPipeline(),
                                as: "info_work",
                            }
                        },
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                date_n_time: 1,
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

                    res.json({ status: true, message: queryRun })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Event Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
            }
        }
        catch (err) {
            console.log('Notify users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})


//Send notification to the user who have added event to notify
router.get('/send_notifications/:event_row_id', async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [10])
        if (checkAdminToken.status) {
            const event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const checkEvent = await eventM.findOne({ _id: event_row_id }, { _id: 1, user_row_id: 1, company_row_id: 1, event_url: 1, event_title: 1, list_event_type: 1 })
                if (checkEvent) {
                    const check_access = await checkSubadminAccess({
                        admin_row_id: Number.parseInt(checkAdminToken.message.admin_row_id),
                        admin_manager_type: checkAdminToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkAdminToken.message.sub_admin_type),
                        event_row_id: checkEvent._id
                    })

                    if (check_access.status) {
                        const ticket_query = await ticketM.find({ event_row_id: event_row_id })
                        if (ticket_query.length > 0) {
                            let host_full_name = ""
                            if (checkEvent.list_event_type == 2) {
                                const event_company_query = await companyM.findOne({ _id: checkEvent.company_row_id }, { _id: 1, company_name: 1 })
                                host_full_name = event_company_query.company_name
                            }
                            else {
                                const event_host_query = await professionalsM.findOne({ _id: checkEvent.user_row_id }, { _id: 1, full_name: 1 })
                                host_full_name = event_host_query.full_name
                            }

                            const queryRun = await notify_userM.aggregate([
                                { $match: { event_row_id: event_row_id, notify_status: false } },
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
                                    $project: {
                                        _id: 1,
                                        user_row_id: 1,
                                        notify_status: 1,
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

                                    //email code starts here
                                    let pass_email_id = run.email_id
                                    let invite_req_url = "https://events.coinpedia.org/" + checkEvent.event_url
                                    let pass_subject = "The wait is over! Tickets Updated for the " + checkEvent.event_title + " event."
                                    let pass_message = `
                                     <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${run.full_name},</p>
                                     <p style="color:#000;font-weight: 400;font-size:17px;">Yay.!! The wait is over. Tickets for the  
                                     <b>${checkEvent.event_title}</b> event have been updated by the 
                                     <b style="text-transform: capitalize;">${host_full_name}</b> host. 
                                     </p>
                                     <p style="color:#000;font-weight: 400;font-size:17px;">Hurry up and Book your slot for the event before the tickets are sold out.</p>
                                     <p style="color:#000;font-weight: 400;font-size:17px;">View event details <a href="${invite_req_url}" style="color:#0029ff;">here.</a></p>
                                     `



                                    await sendEventsEmail(pass_email_id, pass_subject, pass_message)
                                }

                                await notify_userM.updateMany({ event_row_id: event_row_id }, { $set: { notify_status: true } })


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
                        res.json({ status: false, message: { alert_message: check_access.message } })
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

//Deleted events list
router.get('/deleted_events_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [10])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100


            const filter_array = [{}]
            const { top_filter_array } = await eventFilterQuery({ top_filter_array: filter_array, req_query: req.query })

            const pipeline = [
                { $sort: { _id: -1 } },
                { $match: { $and: top_filter_array } },
                {
                    $lookup:
                    {
                        from: "cln_events_seo_details",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "event_seo"
                    }
                },
                { $unwind: { path: "$event_seo", preserveNullAndEmptyArrays: true } },
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
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_events_utc_dates",
                        localField: "utc_row_id",
                        foreignField: "_id",
                        as: "utc_dates"
                    }
                },
                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "created_by_sub_admin_id",
                        foreignField: "_id",
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },

                {
                    $addFields: {
                        tagIds: {
                            $cond: [
                                { $isArray: "$event_tags" },
                                "$event_tags",
                                {
                                    $cond: [
                                        {
                                            $gt: [
                                                { $size: { $ifNull: [{ $objectToArray: "$event_tags" }, []] } },
                                                0
                                            ]
                                        },
                                        {
                                            $map: {
                                                input: { $objectToArray: "$event_tags" },
                                                as: "t",
                                                in: "$$t.v"
                                            }
                                        },
                                        []
                                    ]
                                }
                            ]
                        }
                    }
                },

                // -------- Fetch active tags --------
                {
                    $lookup: {
                        from: "cln_events_tags",
                        let: { tagIds: "$tagIds" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$tagIds"] } } },
                            { $match: { active_status: true } }
                        ],
                        as: "eventTags"
                    }
                },

            ]
            if (req.query.tag_status !== undefined) {
                const tagStatus = Number.parseInt(req.query.tag_status);

                if (tagStatus === 1)
                    pipeline.push({ $match: { eventTags: { $ne: [] } } }); // Only events WITH tags

                if (tagStatus === 0)
                    pipeline.push({ $match: { eventTags: { $eq: [] } } }); // Only events WITHOUT tags
            }

            pipeline.push({
                $project: {
                    _id: 1,
                    user_row_id: 1,
                    event_title: 1,
                    company_row_id: 1,
                    event_tags: 1,
                    event_type: 1,
                    event_city: 1,
                    event_state: 1,
                    event_venue: 1,
                    event_url: 1,
                    event_link: 1,
                    start_date: 1,
                    end_date: 1,
                    event_description: 1,
                    describe_in_one_line: 1,
                    contact_user_name: 1,
                    contact_mobile_number: 1,
                    contact_country_row_id: 1,
                    contact_email_id: 1,
                    active_status: 1,
                    approval_status: 1,
                    webinar_meeting_type: 1,
                    webinar_meeting_link: 1,
                    list_event_type: 1,
                    reason_for_reject: 1,
                    rejected_date_n_time: 1,
                    disable_reason: 1,
                    disabled_date_n_time: 1,
                    deleted_reason: 1,
                    deleted_date_n_time: 1,
                    created_by_admin_status: 1,
                    created_by_sub_admin_id: 1,
                    date_n_time: 1,
                    meta_keywords: "$event_seo.meta_keywords",
                    meta_description: "$event_seo.meta_description",
                    meta_title: "$event_seo.meta_title",
                    longitude: 1,
                    latitude: 1,
                    sub_admin_name: "$sub_admin_info.full_name",
                    utc_time: "$utc_dates.utc_time",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                }
            });
            const result = await deleted_eventsM.aggregate([
                ...pipeline,
                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit }
                        ],
                        totalCount: [
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            const finalData = result[0].data;
            const totalCount = result[0].totalCount.length ? result[0].totalCount[0].count : 0;
            res.json({ status: true, message: finalData, count: totalCount })
        }
        catch (err) {
            console.log('Deleted events list.', err.message)
            res.json({ status: false, message: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})

//Deleted events individual view
router.get('/deleted_events_view/:request_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //,8, 9
    if (checkAdminToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            // let checkEvent = await deleted_eventsM.findOne({_id:request_row_id})
            if (!Number.isNaN(request_row_id)) {
                const checkEvent = await deleted_eventsM.aggregate([
                    { $match: { _id: request_row_id } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "user_row_id",
                            foreignField: "_id",
                            as: "user_info",
                            pipeline: [
                                {
                                    $project: {
                                        user_name: 1,
                                        full_name: 1,
                                        login_status: 1,
                                        approval_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        active_status: 1,
                                        approval_status: 1,
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_events_utc_dates",
                            localField: "utc_row_id",
                            foreignField: "_id",
                            as: "utc_dates"
                        }
                    },
                    { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_events_seo_details",
                            localField: "_id",
                            foreignField: "event_row_id",
                            as: "event_seo"
                        }
                    },
                    { $unwind: { path: "$event_seo", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_sub_admins",
                            localField: "created_by_sub_admin_id",
                            foreignField: "_id",
                            as: "sub_admin_info"
                        }
                    },
                    { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            user_row_id: 1,
                            event_title: 1,
                            company_row_id: 1,
                            event_tags: 1,
                            event_type: 1,
                            event_city: 1,
                            event_state: 1,
                            event_venue: 1,
                            event_url: 1,
                            event_link: 1,
                            start_date: 1,
                            end_date: 1,
                            event_description: 1,
                            describe_in_one_line: 1,
                            contact_user_name: 1,
                            contact_mobile_number: 1,
                            contact_country_row_id: 1,
                            contact_email_id: 1,
                            active_status: 1,
                            approval_status: 1,
                            webinar_meeting_type: 1,
                            webinar_meeting_link: 1,
                            list_event_type: 1,
                            reason_for_reject: 1,
                            rejected_date_n_time: 1,
                            disable_reason: 1,
                            disabled_date_n_time: 1,
                            deleted_reason: 1,
                            deleted_date_n_time: 1,
                            created_by_admin_status: 1,
                            created_by_sub_admin_id: 1,
                            date_n_time: 1,
                            meta_keywords: "$event_seo.meta_keywords",
                            meta_description: "$event_seo.meta_description",
                            meta_title: "$event_seo.meta_title",
                            longitude: 1,
                            latitude: 1,
                            utc_time: "$utc_dates.utc_time",
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            user_login_status: "$user_info.login_status",
                            user_approval_status: "$user_info.approval_status",
                            sub_admin_name: "$sub_admin_info.full_name",
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_active_status: "$company_info.active_status",
                            company_approval_status: "$company_info.approval_status",

                        }
                    }

                ])
                let resultArray = {}
                if (checkEvent[0]) {
                    resultArray['_id'] = checkEvent[0]._id
                    resultArray['user_row_id'] = checkEvent[0].user_row_id
                    resultArray['user_name'] = checkEvent[0].user_name
                    resultArray['full_name'] = checkEvent[0].full_name
                    resultArray['user_login_status'] = checkEvent[0].user_login_status
                    resultArray['user_approval_status'] = checkEvent[0].user_approval_status
                    resultArray['company_name'] = checkEvent[0].company_name
                    resultArray['company_id'] = checkEvent[0].company_id
                    resultArray['company_active_status'] = checkEvent[0].company_active_status
                    resultArray['company_approval_status'] = checkEvent[0].company_approval_status
                    resultArray['event_title'] = checkEvent[0].event_title
                    resultArray['company_row_id'] = checkEvent[0].company_row_id
                    resultArray['event_tags'] = checkEvent[0].event_tags
                    resultArray['event_type'] = checkEvent[0].event_type
                    resultArray['event_city'] = checkEvent[0].event_city
                    resultArray['event_state'] = checkEvent[0].event_state
                    resultArray['event_venue'] = checkEvent[0].event_venue
                    resultArray['event_url'] = checkEvent[0].event_url
                    resultArray['event_link'] = checkEvent[0].event_link
                    resultArray['start_date'] = checkEvent[0].start_date
                    resultArray['end_date'] = checkEvent[0].end_date
                    resultArray['event_description'] = checkEvent[0].event_description
                    resultArray['describe_in_one_line'] = checkEvent[0].describe_in_one_line
                    resultArray['contact_user_name'] = checkEvent[0].contact_user_name
                    resultArray['contact_mobile_number'] = checkEvent[0].contact_mobile_number
                    resultArray['contact_country_row_id'] = checkEvent[0].contact_country_row_id
                    resultArray['contact_email_id'] = checkEvent[0].contact_email_id
                    resultArray['active_status'] = checkEvent[0].active_status
                    resultArray['approval_status'] = checkEvent[0].approval_status
                    resultArray['webinar_meeting_type'] = checkEvent[0].webinar_meeting_type
                    resultArray['webinar_meeting_link'] = checkEvent[0].webinar_meeting_link
                    resultArray['list_event_type'] = checkEvent[0].list_event_type
                    resultArray['reason_for_reject'] = checkEvent[0].reason_for_reject
                    resultArray['rejected_date_n_time'] = checkEvent[0].rejected_date_n_time
                    resultArray['disable_reason'] = checkEvent[0].disable_reason
                    resultArray['disabled_date_n_time'] = checkEvent[0].disabled_date_n_time
                    resultArray['deleted_reason'] = checkEvent[0].deleted_reason
                    resultArray['deleted_date_n_time'] = checkEvent[0].deleted_date_n_time
                    resultArray['created_by_admin_status'] = checkEvent[0].created_by_admin_status
                    resultArray['created_by_sub_admin_id'] = checkEvent[0].created_by_sub_admin_id
                    resultArray['date_n_time'] = checkEvent[0].date_n_time
                    resultArray['meta_keywords'] = checkEvent[0].meta_keywords
                    resultArray['meta_description'] = checkEvent[0].meta_description
                    resultArray['meta_title'] = checkEvent[0].meta_title
                    resultArray['longitude'] = checkEvent[0].longitude
                    resultArray['latitude'] = checkEvent[0].latitude
                    resultArray['utc_time'] = checkEvent[0].utc_time
                    resultArray['sub_admin_name'] = checkEvent[0].sub_admin_name

                    res.json({ status: true, message: resultArray })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Request Row ID' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Deleted events view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

//Add utc time
router.post('/add_utc_time', [
    check('utc_time')
        .trim().not().isEmpty().withMessage('The UTC time field is required.'),
    check('timezone')
        .trim().not().isEmpty().withMessage('The Timezone field is required.'),
    check('country_row_id')
        .trim().not().isEmpty().withMessage('The Country ID field is required.')
        .isInt().withMessage('The Country id field must be contains only integers.'),
], async (req, res) => {

    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [0]) //,8, 9
        if (checkAdminToken.status) {
            let check_country = ''
            if (Number.isNaN(Number.parseInt(req.body.country_row_id))) {
                errObj['country_row_id'] = "Invalid Country ID."
            }
            else {
                check_country = await countryM.findOne({ _id: Number.parseInt(req.body.country_row_id) }, { _id: 1, country_name: 1 })
                if (!check_country) {
                    errObj['country_row_id'] = "Invalid Country ID."
                }
            }


            let utc_row_id = ""
            if (req.body.utc_row_id) {
                utc_row_id = Number.parseInt(req.body.utc_row_id)
                const check_utc_query = await event_utc_datesM.findOne({ _id: utc_row_id })
                if (!check_utc_query) {
                    errObj['utc_row_id'] = 'Invalid UTC row id.'
                }
            }

            const existing_timezone_query = { timezone: req.body.timezone }
            if (utc_row_id) {
                existing_timezone_query._id = { $ne: utc_row_id }
            }

            const check_timezone = await event_utc_datesM.findOne(existing_timezone_query)
            if (check_timezone) {
                errObj['timezone'] = "This timezone already exists."
            }



            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let insertArray = {}
                insertArray['utc_time'] = req.body.utc_time
                insertArray['timezone'] = req.body.timezone
                insertArray['country_row_id'] = check_country._id
                insertArray['country'] = check_country.country_name

                if (!utc_row_id) {
                    await event_utc_datesM(insertArray).save()
                    res.json({ status: true, message: 'Country UTC timezone added successfully' })
                }
                else {
                    await event_utc_datesM.updateOne({ _id: utc_row_id }, { $set: insertArray })
                    res.json({ status: true, message: 'Country UTC timezone updated successfully' })

                }
            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Add UTC time.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Individual UTC time view
router.get('/view_utc/:utc_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [0]) //,8, 9
    if (checkAdminToken.status) {
        try {
            const utc_row_id = Number.parseInt(req.params.utc_row_id)
            if (!Number.isNaN(utc_row_id)) {
                const get_query = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1, timezone: 1, country_row_id: 1, country: 1 })

                if (get_query) {
                    res.json({ status: true, message: get_query })

                }
                else {
                    res.json({ status: false, message: 'Invalid UTC row id ' })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid UTC row id' } })
            }

        }
        catch (err) {
            console.log('View individual utc.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }

})

//UTC list
router.get('/utc_list/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [0]) //,8, 9
    if (checkAdminToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const search = req.query.search

            const search_query = search ? {
                $or: [
                    { country: { $regex: search, $options: 'i' } },
                    { timezone: { $regex: search, $options: 'i' } },
                    { utc_time: { $regex: search, $options: 'i' } },
                ],
            } : {}

            const get_query = await event_utc_datesM.find(search_query, { utc_time: 1, timezone: 1, country_row_id: 1, country: 1 }).sort({ _id: -1 }).skip(skip).limit(limit)

            const count = await event_utc_datesM.countDocuments(search_query)

            res.json({ status: true, message: get_query, count: count })

        }
        catch (err) {
            console.log('UTC list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }

})

//Delete UTC
router.get('/delete_utc/:utc_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [0]) //,8, 9
    if (checkAdminToken.status) {
        try {
            const utc_row_id = Number.parseInt(req.params.utc_row_id)
            if (!Number.isNaN(utc_row_id)) {
                const get_query = await event_utc_datesM.findOne({ _id: utc_row_id })

                if (get_query) {
                    await event_utc_datesM.deleteOne({ _id: utc_row_id })

                    res.json({ status: true, message: 'Country UTC timezone deleted successfully.' })

                }
                else {
                    res.json({ status: false, message: 'Invalid UTC row id ' })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid UTC row id' } })
            }

        }
        catch (err) {
            console.log('Delete UTC.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }

})

//user searched location
router.get('/searched_locations/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //, 8,9
    if (checkAdminToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let search_query = req.query.search ? {
                $or: [
                    { city: { $regex: req.query.search, $options: 'i' } },
                    { state: { $regex: req.query.search, $options: 'i' } },
                    { country: { $regex: req.query.search, $options: 'i' } },
                ],
            } : {}



            const query = await event_search_locationM.aggregate([
                {
                    $lookup: {
                        from: "cln_events",
                        let: {
                            city: "$city",
                            state: "$state",
                            country: "$country"
                        },
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_static_countries",
                                    localField: "contact_country_row_id",
                                    foreignField: "_id",
                                    as: "country_info"
                                }
                            },
                            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set: {
                                    country_name: "$country_info.country_name",
                                    country_code: "$country_info.country_code",
                                    country_flag: "$country_info.country_flag"
                                }
                            },
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$event_city", "$$city"] },
                                            { $eq: ["$event_state", "$$state"] },
                                            { $eq: ["$country_info.country_name", "$$country"] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "event_info"
                    }
                },
                {
                    $set: {
                        event_count: { $size: "$event_info" }
                    }
                },
                {
                    $match: search_query
                },
                {
                    $project: {
                        city: 1,
                        state: 1,
                        country: 1,
                        registered_users_count: 1,
                        non_registered_users_count: 1,
                        event_count: 1,
                        country_name: { $arrayElemAt: ["$event_info.country_name", 0] }, // Get the first country info
                        country_code: { $arrayElemAt: ["$event_info.country_code", 0] }, // Get the first country code
                        country_flag: { $arrayElemAt: ["$event_info.country_flag", 0] }
                    }
                },
                {
                    $sort: { registered_users_count: -1, non_registered_users_count: -1, _id: -1 }
                }
            ]).skip(skip).limit(limit)

            const count_query = await event_search_locationM.countDocuments(search_query)


            res.json({ status: true, message: query, count: count_query })

        }
        catch (err) {
            console.log('Searched locations list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

router.get('/searched_users_list/:type/:location_row_id/:skip/:limit', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]) //, 8,9
    if (checkAdminToken.status) {
        try {

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const location_row_id = Number.parseInt(req.params.location_row_id)
            const type = Number.parseInt(req.params.type)
            const date_range = Number.parseInt(req.query.date_range)
            let search_query = type === 1 ? [{ location_row_id: location_row_id }] : [{ _id: location_row_id }]

            if (date_range === 1) {
                if (req.query.start_date && req.query.end_date) {
                    const start_date = createDateTime(req.query.start_date)
                    const end_date = createEndDateOnly(req.query.end_date)
                    search_query.push({ updated_date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
                }

            }
            else if (date_range === 2) {
                const start_end_date = startAndEndOfWeek()
                search_query.push({ updated_date_n_time: { $gte: new Date(start_end_date.start_date), $lte: new Date(start_end_date.end_date) } })
            }
            else if (date_range === 3) {
                const start_end_date = monthStartEndDate()
                search_query.push({ updated_date_n_time: { $gte: new Date(start_end_date.start_date), $lte: new Date(start_end_date.end_date) } })
            }

            if (type === 1) {
                const query = await professionals_location_searchM.aggregate([
                    { $match: { $and: search_query } },
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
                        $project: {
                            count: 1,
                            updated_date_n_time: 1,
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                            login_status: "$user_info.login_status",
                            approval_status: "$user_info.approval_status"

                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await professionals_location_searchM.countDocuments({ $and: search_query })

                res.json({ status: true, message: query, count: count_query })
            }
            else {
                const query = await event_search_locationM.aggregate([
                    {
                        $lookup: {
                            from: "cln_events",
                            let: {
                                city: "$city",
                                state: "$state",
                                country: "$country"
                            },
                            pipeline: [
                                {
                                    $lookup:
                                    {
                                        from: "cln_static_countries",
                                        localField: "contact_country_row_id",
                                        foreignField: "_id",
                                        as: "country_info"
                                    }
                                },
                                { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                                {
                                    $set: {
                                        country_name: "$country_info.country_name"
                                    }
                                },
                                {
                                    $lookup:
                                    {
                                        from: "cln_events_utc_dates",
                                        localField: "utc_row_id",
                                        foreignField: "_id",
                                        as: "utc_dates"
                                    }
                                },
                                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$event_city", "$$city"] },
                                                { $eq: ["$event_state", "$$state"] },
                                                { $eq: ["$country_info.country_name", "$$country"] }
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup:
                                    {
                                        from: "cln_company_lists",
                                        localField: "company_row_id",
                                        foreignField: "_id",
                                        as: "company_info"
                                    }
                                },
                                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
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
                                    $project:
                                    {
                                        event_title: 1,
                                        event_image: 1,
                                        event_city: 1,
                                        event_venue: 1,
                                        event_url: 1,
                                        start_date: 1,
                                        end_date: 1,
                                        active_status: 1,
                                        approval_status: 1,
                                        list_event_type: 1,
                                        created_date_n_time: 1,
                                        created_by_admin_status: 1,
                                        created_by_sub_admin_id: 1,
                                        utc_time: "$utc_dates.utc_time",
                                        full_name: "$user_info.full_name",
                                        email_id: "$user_info.email_id",
                                        company_id: "$company_info.company_id",
                                        company_name: "$company_info.company_name",
                                    }
                                }
                            ],
                            as: "event_info"
                        }
                    },
                    { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            updated_date_n_time: "$event_info.created_date_n_time"
                        }
                    },
                    {
                        $match: {
                            $and: [
                                { event_info: { $exists: true, $ne: [] } },
                                { $and: search_query },
                            ],
                        },
                    },
                    {
                        $project: {
                            event_title: "$event_info.event_title",
                            event_image: "$event_info.event_image",
                            event_city: "$event_info.event_city",
                            event_state: "$event_info.event_state",
                            event_venue: "$event_info.event_venue",
                            event_url: "$event_info.event_url",
                            start_date: "$event_info.start_date",
                            end_date: "$event_info.end_date",
                            list_event_type: "$event_info.list_event_type",
                            active_status: "$event_info.active_status",
                            approval_status: "$event_info.approval_status",
                            created_date_n_time: "$event_info.created_date_n_time",
                            created_by_admin_status: "$event_info.created_by_admin_status",
                            created_by_sub_admin_id: "$event_info.created_by_sub_admin_id",
                            utc_time: "$event_info.utc_time",
                            full_name: "$event_info.full_name",
                            email_id: "$event_info.email_id",
                            company_id: "$event_info.company_id",
                            company_name: "$event_info.company_name"
                        }
                    },
                    {
                        $sort: { created_date_n_time: -1 }
                    }
                ]).skip(skip).limit(limit)
                const count_query = await event_search_locationM.aggregate([
                    {
                        $lookup: {
                            from: "cln_events",
                            let: {
                                city: "$city",
                                state: "$state",
                                country: "$country"
                            },
                            pipeline: [
                                {
                                    $lookup:
                                    {
                                        from: "cln_static_countries",
                                        localField: "contact_country_row_id",
                                        foreignField: "_id",
                                        as: "country_info"
                                    }
                                },
                                { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                                {
                                    $set: {
                                        country_name: "$country_info.country_name"
                                    }
                                },
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$event_city", "$$city"] },
                                                { $eq: ["$event_state", "$$state"] },
                                                { $eq: ["$country_info.country_name", "$$country"] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "event_info"
                        }
                    },
                    { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            updated_date_n_time: "$event_info.created_date_n_time"
                        }
                    },
                    {
                        $match: {
                            $and: [
                                { event_info: { $exists: true, $ne: [] } },
                                { $and: search_query },
                            ],
                        },
                    },
                    {
                        $count: "count"
                    }
                ])

                let totalCount = 0
                if (count_query[0]) {
                    totalCount = count_query[0].count
                }

                res.json({ status: true, message: query, count: totalCount })
            }

        }
        catch (err) {
            console.log('Searched users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }
})

router.get('/seo_overview', checkApiKey, async (req, res) => {
    try {


        const recentLogsPromise = seo_change_logsM.aggregate([
            {
                $match: { module_key: "event" }
            },

            {
                $sort: { updated_at: -1 }
            },

            // keep latest log per event
            {
                $group: {
                    _id: "$module_id",
                    doc: { $first: "$$ROOT" }
                }
            },

            {
                $replaceRoot: { newRoot: "$doc" }
            },

            {
                $addFields: {
                    module_id_num: { $toInt: "$module_id" }
                }
            },

            {
                $lookup: {
                    from: "cln_events",
                    let: { eid: "$module_id_num" },
                    pipeline: [
                        {
                            $match: { $expr: { $eq: ["$_id", "$$eid"] } }
                        },
                        {
                            $project: {
                                event_url: 1,
                                event_title: 1,
                                active_status: 1,
                                approval_status: 1,

                            }
                        }
                    ],
                    as: "event"
                }
            },
            {
                $match: {
                    "event.0": { $exists: true }
                }
            },
            {
                $addFields: {
                    event_url: { $arrayElemAt: ["$event.event_url", 0] },
                    event_title: { $arrayElemAt: ["$event.event_title", 0] },
                    active_status: { $arrayElemAt: ["$event.active_status", 0] },
                    approval_status: { $arrayElemAt: ["$event.approval_status", 0] }
                }
            },
            {
                $match: {
                    event_url: { $exists: true, $ne: "" }
                }
            },
            {
                $project: {
                    event: 0,
                    module_id_num: 0
                }
            },
            {
                $sort: { updated_at: -1 }
            },
            { $limit: 10 }
        ]);





        const eventStatsPromise = eventM.aggregate([
            {
                $match: {
                    event_url: { $exists: true, $ne: "" },
                    approval_status: 1,
                    active_status: 1,
                }
            },
            {
                $lookup: {
                    from: "cln_events_seo_details",
                    localField: "_id",
                    foreignField: "event_row_id",
                    as: "event_seo"
                }
            },
            { $unwind: { path: "$event_seo", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    title_len: { $strLenCP: { $ifNull: ["$event_seo.meta_title", ""] } },
                    tags: {
                        $map: {
                            input: { $ifNull: ["$event_seo.header_structure", []] },
                            as: "h",
                            in: "$$h.tag"
                        }
                    }
                }
            },
            {
                $addFields: {
                    h1_count: {
                        $size: { $filter: { input: "$tags", cond: { $eq: ["$$this", "H1"] } } }
                    },
                    h2_count: {
                        $size: { $filter: { input: "$tags", cond: { $eq: ["$$this", "H2"] } } }
                    },
                    h1_index: { $indexOfArray: ["$tags", "H1"] },
                    h2_index: { $indexOfArray: ["$tags", "H2"] },
                    h3_index: { $indexOfArray: ["$tags", "H3"] }
                }
            },
            {
                $facet: {
                    total: [{ $count: "count" }],
                    title_warn: [{ $match: { title_len: { $gt: 60, $lte: 70 } } }, { $count: "count" }],
                    title_err: [{ $match: { title_len: { $gt: 70 } } }, { $count: "count" }],
                    h1_missing: [{ $match: { h1_count: 0 } }, { $count: "count" }],
                    h1_multi: [{ $match: { h1_count: { $gt: 1 } } }, { $count: "count" }],
                    h2_missing: [{ $match: { h2_count: 0 } }, { $count: "count" }],
                    bad_seq: [{
                        $match: {
                            $or: [
                                { $and: [{ h2_index: { $gte: 0 } }, { h1_index: -1 }] },
                                { $and: [{ h2_index: { $gte: 0 } }, { $expr: { $lt: ["$h2_index", "$h1_index"] } }] },
                                { $and: [{ h3_index: { $gte: 0 } }, { h2_index: -1 }] },
                                { $and: [{ h3_index: { $gte: 0 } }, { $expr: { $lt: ["$h3_index", "$h2_index"] } }] }
                            ]
                        }
                    }, { $count: "count" }]
                }
            }
        ]);

        /* -------------------------------------------------
           3️⃣ STATIC URL SEO STATS (ONE SCAN)
        ------------------------------------------------- */
        const staticStatsPromise = seo_static_urlsM.aggregate([
            {
                $match: {
                    module: "event",
                }
            },
            {
                $addFields: {
                    title_len: { $strLenCP: { $ifNull: ["$meta_title", ""] } },
                    tags: {
                        $map: {
                            input: { $ifNull: ["$header_structure", []] },
                            as: "h",
                            in: "$$h.tag"
                        }
                    }
                }
            },
            {
                $addFields: {
                    h1_count: {
                        $size: { $filter: { input: "$tags", cond: { $eq: ["$$this", "H1"] } } }
                    },
                    h2_count: {
                        $size: { $filter: { input: "$tags", cond: { $eq: ["$$this", "H2"] } } }
                    },
                    h1_index: { $indexOfArray: ["$tags", "H1"] },
                    h2_index: { $indexOfArray: ["$tags", "H2"] },
                    h3_index: { $indexOfArray: ["$tags", "H3"] }
                }
            },
            {
                $facet: {
                    total: [{ $count: "count" }],
                    title_warn: [{ $match: { title_len: { $gt: 60, $lte: 70 } } }, { $count: "count" }],
                    title_err: [{ $match: { title_len: { $gt: 70 } } }, { $count: "count" }],
                    h1_missing: [{ $match: { h1_count: 0 } }, { $count: "count" }],
                    h1_multi: [{ $match: { h1_count: { $gt: 1 } } }, { $count: "count" }],
                    h2_missing: [{ $match: { h2_count: 0 } }, { $count: "count" }],
                    bad_seq: [{
                        $match: {
                            $or: [
                                { $and: [{ h2_index: { $gte: 0 } }, { h1_index: -1 }] },
                                { $and: [{ h2_index: { $gte: 0 } }, { $expr: { $lt: ["$h2_index", "$h1_index"] } }] },
                                { $and: [{ h3_index: { $gte: 0 } }, { h2_index: -1 }] },
                                { $and: [{ h3_index: { $gte: 0 } }, { $expr: { $lt: ["$h3_index", "$h2_index"] } }] }
                            ]
                        }
                    }, { $count: "count" }]
                }
            }
        ]);

        const staticUrlsPromise = seo_static_urlsM.aggregate([
            {
                $match: {
                    module: "event",
                }
            }
        ]);

        /* -------------------------------------------------
           EXECUTE ALL IN PARALLEL
        ------------------------------------------------- */
        const [recentLogs, eventStats, staticStats, staticUrls] = await Promise.all([
            recentLogsPromise,
            eventStatsPromise,
            staticStatsPromise,
            staticUrlsPromise
        ]);

        const val = (obj, key) => obj?.[0]?.[key]?.[0]?.count || 0;

        const response = {
            static_urls: staticUrls,
            recent_changes: recentLogs,
            total_urls: val(eventStats, "total") + val(staticStats, "total"),
            h1_missing: val(eventStats, "h1_missing") + val(staticStats, "h1_missing"),
            h2_missing: val(eventStats, "h2_missing") + val(staticStats, "h2_missing"),
            multiple_h1: val(eventStats, "h1_multi") + val(staticStats, "h1_multi"),
            bad_heading_sequence: val(eventStats, "bad_seq") + val(staticStats, "bad_seq"),
            title_length_issues: {
                title_above_60_to_70: val(eventStats, "title_warn") + val(staticStats, "title_warn"),
                title_above_70: val(eventStats, "title_err") + val(staticStats, "title_err")
            }
        };

        return res.json({ status: true, message: response });

    } catch (error) {
        console.error("SEO Overview Error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
});






router.buildCheckUsernameInfoWorkPipeline = buildCheckUsernameInfoWorkPipeline
router.buildViewEventSpeakersInfoWorkPipeline = buildViewEventSpeakersInfoWorkPipeline
router.buildSponsorsPartnersUserInfoWorkPipeline = buildSponsorsPartnersUserInfoWorkPipeline
router.buildSponsorsPartnersManualUserInfoWorkPipeline = buildSponsorsPartnersManualUserInfoWorkPipeline
router.buildSpeakersListInfoWorkPipeline = buildSpeakersListInfoWorkPipeline
router.buildSpeakerBasicDetailsRegisteredInfoWorkPipeline = buildSpeakerBasicDetailsRegisteredInfoWorkPipeline
router.buildSpeakerBasicDetailsManualInfoWorkPipeline = buildSpeakerBasicDetailsManualInfoWorkPipeline
router.buildNotifyUsersListInfoWorkPipeline = buildNotifyUsersListInfoWorkPipeline

module.exports = router