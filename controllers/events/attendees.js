const express = require('express')

const router = express.Router()

const { check, validationResult } = require('express-validator')

const sanitize = require('mongo-sanitize')

const { getPresentDateTime, arrangeValidation } = require('../../utils/helpers/helper')

const { checkUserLoginToken, checkAllLoginToken, checkAdminLoginToken } = require('../../middleware/authorization')

const { sendEventsEmail, sendNewsEventsEmail } = require('../../config/email')

const { updateNotification, updateThreadNotification } = require('../../utils/helpers/notification_helper')

const { DateFormatter, updateAttendeesCount, checkEventRowID, shiftUserFromManualToRegister, checkSpeaker, checkSubadminAccess, deleteAttendees } = require('../../utils/helpers/events_helper')

const { getAttendeesList, saveUserAttendRequest } = require('../../services/events/attendees')

const { getPositionResolutionStages } = require('../../src/modules/work-experience/work-experience.queries')

const { joinPositionNamesExpr } = require('../../src/modules/funding/funding.queries')


const eventM = require('../../models/app/events/eventM')

const event_attendeesM = require('../../models/app/events/event_attendeesM')

const professionalsM = require('../../models/app/professionalsM')

const event_utc_datesM = require('../../models/app/events/event_utc_datesM')

const professionals_manual_retrievalsM = require('../../models/app/users/professionals_manual_retrievalsM')

const event_speakersM = require('../../models/app/events/event_speakersM')

const ticketM = require('../../models/app/events/ticketM')

const { setCache, getCache, deleteKeysByPattern } = require('../../config/cache_helper')

const couponM = require('../../models/app/events/couponM')

const event_link_display_detailsM = require('../../models/app/events/event_link_display_detailsM')

const { calculateEventScore } = require('../../utils/helpers/app_helper')

/**
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `outer_info_work` lookup inside GET /list/:event_row_id/:skip/:limit. Resolves
 * position name(s) via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions), joined
 * into a single display string via joinPositionNamesExpr, instead of the previous
 * static-only lookup. Downstream, the outer pipeline's final $project still reads
 * `position_name` from `$outer_info_work.position_name` — unchanged shape.
 * `{ $limit: 1 }` kept in its original position: after position resolution, before
 * the company lookups.
 */
function buildAttendeesListOuterInfoWorkPipeline() {
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
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `outer_info_work` lookup inside GET /previous_unique_attendees/:event_row_id.
 * Same resolution change as buildAttendeesListOuterInfoWorkPipeline above — kept
 * as a SEPARATE function (not merged) even though currently byte-identical, since
 * the two routes' surrounding pipelines are independent and may diverge later.
 */
function buildPreviousUniqueAttendeesOuterInfoWorkPipeline() {
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


router.post('/add_new_attendees', [

    check('user_row_id')

        .not().isEmpty().withMessage('The User Row ID field is required.')

        .isInt().withMessage('The User Row ID field must be contains only integers.'),

    check('user_type')

        .not().isEmpty().withMessage('The User type field is required.')

        .isInt().withMessage('The  User type field must be contains only integers.'),

    check('event_row_id')

        .not().isEmpty().withMessage('The Event Row ID field is required.')

        .isInt().withMessage('The Event Row ID field must be contains only integers.')

], async (req, res) => {

    try {

        const errors = validationResult(req)

        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [10])

        if (checkUserToken.status) {



            let user_row_id = 0

            if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {

                user_row_id = Number.parseInt(req.body.user_row_id)

            }



            let user_type = 0

            if (!Number.isNaN(Number.parseInt(req.body.user_type))) {

                user_type = Number.parseInt(req.body.user_type)

            }



            let event_row_id = 0

            if (!Number.isNaN(Number.parseInt(req.body.event_row_id))) {

                event_row_id = Number.parseInt(req.body.event_row_id)

            }



            let email_day_number = 0

            if (!Number.isNaN(Number.parseInt(req.body.email_day_number))) {

                if (Number.parseInt(req.body.email_day_number) <= 7) {

                    email_day_number = Number.parseInt(req.body.email_day_number)

                }

            }



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



            let host_user_row_id = 0

            let host_company_row_id = 0

            let list_event_type = 0

            let full_name = ""

            let email_id = ""

            let event_host_name = ""

            let start_date = ""

            let event_title = ""

            let event_url = ""

            let utc_row_id = ""

            let notification_object = {}





            if (event_row_id && user_type && user_row_id) {

                if (checkUserToken.message.user_type == 1) {

                    host_user_row_id = checkUserToken.message.user_row_id

                }



                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })

                if (check_event_res.status) {

                    start_date = check_event_res.message.start_date

                    event_title = check_event_res.message.event_title

                    event_url = check_event_res.message.event_url

                    utc_row_id = check_event_res.message.utc_row_id

                    event_host_name = check_event_res.message.event_host_name

                    list_event_type = check_event_res.message.list_event_type



                    if (check_event_res.message.user_row_id) {

                        host_user_row_id = check_event_res.message.user_row_id

                    }



                    if (check_event_res.message.company_row_id) {

                        host_company_row_id = check_event_res.message.company_row_id

                    }

                }

                else {

                    errObj['event_row_id'] = check_event_res.message.alert_message

                }



                if (user_type == 1) {

                    const get_user_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 })

                    if (!get_user_query) {

                        errObj['user_row_id'] = 'Sorry, Invalid Guest User row id.'

                    }

                    else {

                        full_name = get_user_query.full_name

                        email_id = get_user_query.email_id

                    }

                }

                else if (user_type == 2) {

                    const get_user_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })

                    if (!get_user_query) {

                        errObj['user_row_id'] = 'Sorry, Invalid Guest User row id.'

                    }

                    else {

                        full_name = get_user_query.full_name

                        email_id = get_user_query.email_id

                    }

                }

                else {

                    errObj['user_type'] = 'The Guest User Type field must be contain numbers 1 or 2.'

                }

            }



            const check_speaker = await checkSpeaker({ event_row_id, user_row_id, user_type })

            if (!check_speaker.status) {

                errObj['user_row_id'] = check_speaker.message



            }







            if (Object.keys(errObj).length) {

                res.json({ status: false, message: errObj })

            }

            else {

                const check_insert_query = await event_attendeesM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: user_type })

                if (!check_insert_query) {

                    let mesage_id = 0

                    const insertArr = {

                        user_type: user_type,

                        user_row_id: user_row_id,

                        event_row_id: event_row_id,

                        invitation_status: 0,

                        invitation_type: 2,

                        email_sent_status: email_day_number ? false : true,

                        email_day_number: email_day_number,

                        created_date_n_time: getPresentDateTime()

                    }



                    const guest_query = await event_attendeesM(insertArr).save()

                    await deleteKeysByPattern('event_attendees_list_*')

                    await deleteKeysByPattern('previous_unique_attendees_*')

                    await deleteKeysByPattern('individual_event_*')

                    await deleteKeysByPattern('app_company_individual_other_details_*')

                    await calculateEventScore(event_row_id, ['attendees'])
                    await deleteKeysByPattern('all_events_*')





                    if ((user_type == 1)) {

                        let notify_type = 0

                        let notify_type_row_id = 0



                        const check_in_array = [1, 3]

                        if (check_in_array.includes(list_event_type)) {

                            notify_type = 1

                            notify_type_row_id = host_user_row_id

                        }

                        else {

                            notify_type = 2

                            notify_type_row_id = host_company_row_id

                        }



                        if (notify_type && notify_type_row_id) {

                            notification_object = {

                                user_row_id: user_row_id,

                                notify_type: notify_type,

                                notify_type_row_id: notify_type_row_id,

                                message_row_id: 55,

                                action_row_id: notify_type_row_id,

                                event_row_id

                            }

                            await updateNotification(notification_object)

                        }

                    }



                    await updateAttendeesCount({ event_row_id })



                    //email

                    if (email_id && (email_day_number == 0)) {

                        const get_utc_time = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1 })

                        let start_date_formatted = DateFormatter(start_date)



                        let guest_pass_subject = "You’re Invited to attend " + event_title + " Event"

                        let invite_req_url = "https://events.coinpedia.org/" + event_url + "?invitation_id=" + guest_query._id



                        let guest_message_to_pass = `

                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>

                        <p style="color:#000;font-weight: 400;font-size:17px;">

                            You’ve been invited by <b style="text-transform: capitalize;">${event_host_name}</b> to attend the <b>${event_title}</b> event on <b>${start_date_formatted} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ""}</b>. 

                        </p>

                        <p style="color:#000;font-weight: 400;font-size:17px;">Be part of this exciting event which is going to be fun and very thoughtful. Packed with amazing speakers and industry experts.</p>

                        <p style="color:#000;font-weight: 400;font-size:17px;">Register yourself to this event, by accepting the invitation below.</p>

                        <p><a href="${invite_req_url}" style="color:#0029ff;font-weight: 400;font-size:17px;">Accept Invitation </a></p>

                        `

                        mesage_id = await sendEventsEmail(email_id, guest_pass_subject, guest_message_to_pass, guest_query._id, event_row_id)



                        if (mesage_id) {

                            await event_attendeesM.updateOne({ _id: guest_query._id }, { $set: { sg_message_id: mesage_id } })

                        }

                    }

                    //email code ends here





                    res.json({ status: true, mesage_id: mesage_id, message: { notification_object, host_company_row_id, alert_message: ' Your new attendee invitation request has been sent successfully. Invitation forwarded to the intended attendees.', checkUserToken }, guest_query: guest_query })



                }

                else {

                    res.json({ status: false, message: "This attendees details are already exist in this event." })

                }



            }

        }

        else {

            res.json(checkUserToken)

        }



    }

    catch (err) {

        console.log('Add new attendees.', err.message)

        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })

    }

})





router.get('/list/:event_row_id/:skip/:limit', async (req, res) => {

    const checkUserToken = await checkAllLoginToken(req.headers, [10])

    if (checkUserToken.status) {

        try {

            let errObj = {}

            let host_user_row_id = 0

            let event_row_id = 0

            if (checkUserToken.message.user_type == 1) {

                host_user_row_id = checkUserToken.message.user_row_id

            }



            if (Number.isNaN(Number.parseInt(req.params.event_row_id))) {

                errObj['event_row_id'] = 'The event row id field must be contain valid number.'

            }

            else {

                event_row_id = Number.parseInt(req.params.event_row_id)

            }



            if (Number.isNaN(Number.parseInt(req.params.skip))) {

                errObj['skip'] = 'The parameter skip field must be contain valid number'

            }



            if (Number.isNaN(Number.parseInt(req.params.limit))) {

                errObj['limit'] = 'The parameter limit field must be contain valid number.'

            }



            if (event_row_id) {

                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })

                if (!check_event_res.status) {

                    errObj['event_row_id'] = check_event_res.message.alert_message

                }

            }



            if (Object.keys(errObj).length) {

                res.json({ status: false, message: errObj })

            }

            else {

                const skip = Number.parseInt(req.params.skip)

                const limit = Number.parseInt(req.params.limit)

                const cacheKey = `event_attendees_list_${event_row_id}_${skip}_${limit}_${sanitize(req.query.search || '')}_${req.query.invitation_type || 'all'}_${req.query.invitation_status || 'all'}`;



                // ✅ Check cache first

                const cache_response = await getCache({ key: cacheKey });

                if (cache_response.status && cache_response.message) {

                    return res.json({

                        status: true,

                        message: cache_response.message,

                        cache_response_status: true

                    });

                }

                let query = [{}]



                if (req.query.search) {

                    query.push({ $or: [{ full_name: { $regex: sanitize(req.query.search), $options: 'i' } }, { user_name: { $regex: sanitize(req.query.search), $options: 'i' } }] })

                }



                if (Number.parseInt(req.query.invitation_type)) {

                    query.push({ invitation_type: Number.parseInt(req.query.invitation_type) })

                }



                //invitation_status-> 0:invitation pending, 1:Accepted

                if (Number.parseInt(req.query.invitation_status)) {

                    const invitation_status = Number.parseInt(req.query.invitation_status)

                    // invitation_status -> 1: pending, 2:approved (as zero in not working)

                    if (invitation_status == 1) {

                        query.push({ invitation_status: 0 })

                    }

                    else {

                        query.push({ invitation_status: 1 })

                    }

                }



                const get_query = await event_attendeesM.aggregate([

                    { $match: { event_row_id: event_row_id } },

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

                                    $project: {

                                        _id: 1,

                                        user_name: 1,

                                        profile_image: "$img_info.profile_image",

                                        full_name: 1,

                                        email_id: 1,

                                        approval_status: 1,

                                        pro_batch: 1,

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

                                        gender: 1,

                                        full_name: 1,

                                        email_id: 1,

                                        profile_image: 1

                                    }

                                }

                            ]

                        }

                    },

                    { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                    {

                        $set: {

                            full_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.full_name", else: "$user_manual_info.full_name" } },

                            pro_batch: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.pro_batch", else: "" } },

                            email_id: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.email_id", else: "$user_manual_info.email_id" } },

                            user_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.user_name", else: "" } },

                            userData: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info", else: "$user_manual_info" } }

                        }

                    },

                    {

                        $lookup:

                        {

                            from: "cln_professionals_work_experiences",

                            let: {

                                user_type: '$user_type',

                                user_row_id: '$user_row_id'

                            },

                            as: "outer_info_work",

                            pipeline: buildAttendeesListOuterInfoWorkPipeline(),

                        }

                    },

                    { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },

                    {

                        $match: { $and: query }

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

                                { $limit: 1 },

                            ]

                        }

                    },

                    { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },

                    {

                        $project:

                        {

                            invitation_status: 1,

                            email_sent_status: 1,

                            invitation_type: 1,

                            email_day_number: 1,

                            created_date_n_time: 1,

                            user_type: 1,

                            user_row_id: 1,

                            sg_message_id: 1,

                            full_name: 1,

                            pro_batch: 1,

                            email_id: 1,

                            user_name: 1,

                            email_event_type: "$email_info.event_type",

                            profile_image: "$userData.profile_image",

                            position_name: "$outer_info_work.position_name",

                            company_name: "$outer_info_work.company_name"

                        }

                    }

                ]).sort({ _id: -1 }).skip(skip).limit(limit)



                const email_count_query = await event_attendeesM.aggregate([

                    { $match: { event_row_id: event_row_id } },

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

                                    $project: {

                                        _id: 1,

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

                                }

                            ]

                        }

                    },

                    { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                    {

                        $lookup:

                        {

                            from: "cln_emails_events",

                            localField: "sg_message_id",

                            foreignField: "sg_message_id",

                            as: "email_info"

                        }

                    },

                    { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },

                    {

                        $group: {

                            _id: { sg_message_id: "$email_info.sg_message_id", event_type: "$email_info.event_type" },

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

                    { $match: { event_row_id: event_row_id } },

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

                                    $project: {

                                        _id: 1,

                                        user_name: 1,

                                        full_name: 1,

                                        email_id: 1,

                                        pro_batch: 1,

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

                                        gender: 1,

                                        full_name: 1,

                                        email_id: 1,

                                        profile_image: 1

                                    }

                                }

                            ]

                        }

                    },

                    { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                    {

                        $set: {

                            full_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.full_name", else: "$user_manual_info.full_name" } },

                            email_id: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.email_id", else: "$user_manual_info.email_id" } },

                            pro_batch: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.pro_batch", else: "" } },

                            user_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.user_name", else: "" } }

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

                if (count_query[0]) {

                    count = count_query[0].count

                }



                const response = {

                    data: get_query,

                    count,

                    email_counts: email_count_query[0] || []

                };



                await setCache({ key: cacheKey, value: response, ttl: 1800 });



                res.json({

                    status: true,

                    message: response,

                    cache_response_status: false

                });

                // res.json({ status: true, message: { data: get_query, count: count, email_counts: email_count_query[0] ? email_count_query[0] : [] } })

            }

        }

        catch (err) {

            console.log('Attendees list.', err.message)

            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })

        }

    }

    else {

        res.json(checkUserToken)

    }

})









router.get('/delete_attendee/:attendee_row_id', async (req, res) => {

    const checkUserToken = await checkAllLoginToken(req.headers, [10])

    if (checkUserToken.status) {

        try {

            let host_user_row_id = 0

            let attendee_row_id = 0

            let event_row_id = 0

            let errObj = {}

            if (checkUserToken.message.user_type == 1) {

                host_user_row_id = checkUserToken.message.user_row_id

            }



            if (Number.isNaN(Number.parseInt(req.params.attendee_row_id))) {

                errObj['attendee_row_id'] = 'The attendee row id field must be contain valid number.'

            }

            else {

                attendee_row_id = Number.parseInt(req.params.attendee_row_id)

                const check_query = await event_attendeesM.findOne({ _id: attendee_row_id })

                if (!check_query) {

                    errObj['attendee_row_id'] = 'Invalid attendee row id.'

                }

                else {

                    event_row_id = check_query.event_row_id

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



                    const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })

                    if (!check_event_res.status) {

                        errObj['event_row_id'] = check_event_res.message.alert_message

                    }

                }

            }





            if (Object.keys(errObj).length) {

                res.json({ status: false, message: errObj })

            }

            else {

                await deleteAttendees({ type: 1, event_row_id: event_row_id, attendee_row_id: attendee_row_id })

                await deleteKeysByPattern('event_attendees_list_*')

                await deleteKeysByPattern('previous_unique_attendees_*')

                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('all_events_*')



                await calculateEventScore(event_row_id, ['attendees'])



                res.json({ status: true, message: { alert_message: 'Guest details for this event have been deleted successfully. The guest information has now been permanently removed from our records.' } })

            }

        }

        catch (err) {

            console.log('Delete attendee.', err.message)

            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })

        }

    }

    else {

        res.json(checkUserToken)

    }

})







router.get('/search_previous_event/:event_row_id', async (req, res) => {

    const checkUserToken = await checkAllLoginToken(req.headers, [10])

    if (checkUserToken.status) {

        try {

            let event_row_id = 0

            let host_user_row_id = 0

            if (checkUserToken.message.user_type == 1) {

                host_user_row_id = checkUserToken.message.user_row_id

            }



            let user_row_id = 0

            let company_row_id = 0

            let reg_array = []

            let manual_array = []



            let errObj = {}

            if (Number.isNaN(Number.parseInt(req.params.event_row_id))) {

                errObj['event_row_id'] = 'The event row id field must be contain valid number.'

            }

            else {

                event_row_id = Number.parseInt(sanitize(req.params.event_row_id))

                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })

                if (!check_event_res.status) {

                    errObj['event_row_id'] = check_event_res.message.alert_message

                }

                else {

                    user_row_id = check_event_res.message.user_row_id

                    company_row_id = check_event_res.message.company_row_id



                    reg_array = await event_attendeesM.find({ event_row_id: event_row_id, user_type: 1 }, { user_row_id: 1 }).distinct("user_row_id")

                    manual_array = await event_attendeesM.find({ event_row_id: event_row_id, user_type: 2 }, { user_row_id: 1 }).distinct("user_row_id")

                }

            }



            if (Object.keys(errObj).length) {

                res.json({ status: false, message: errObj })

            }

            else {

                let query = [

                    { _id: { $ne: event_row_id }, active_status: 1 },

                    { $or: [{ user_row_id: user_row_id }, { company_row_id: { $eq: company_row_id, $gt: 0 } }] },

                ]



                if (req.query.event_title) {

                    query.push({ event_title: { '$regex': sanitize(req.query.event_title), $options: 'i' } })

                }







                const get_query = await eventM.aggregate([

                    {

                        $match: { $and: query }

                    },

                    {

                        $lookup:

                        {

                            from: "cln_events_attendees",

                            localField: "_id",

                            foreignField: "event_row_id",

                            as: "info_attendee",

                            pipeline: [

                                {

                                    $lookup: {

                                        from: "cln_events_speakers",

                                        let: {

                                            user_row_id: '$user_row_id',

                                            // event_row_id: '$event_row_id',

                                            user_type: '$user_type'

                                        },

                                        as: "speakers_info",

                                        pipeline: [

                                            {

                                                $match: {

                                                    $expr: {

                                                        $and: [

                                                            { $eq: ['$user_row_id', '$$user_row_id'] },

                                                            { $eq: ['$event_row_id', event_row_id] },

                                                            { $eq: ['$user_type', "$$user_type"] }

                                                        ]

                                                    }

                                                }

                                            }

                                        ]

                                    }

                                },

                                {

                                    $match: {

                                        $and: [

                                            {

                                                $or: [

                                                    { user_row_id: { $nin: reg_array }, user_type: 1 },

                                                    { user_row_id: { $nin: manual_array }, user_type: 2 }

                                                ]

                                            },

                                            {

                                                $expr: { $eq: [{ $size: "$speakers_info" }, 0] }

                                            }

                                        ]

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

                                                $project: {

                                                    _id: 1,

                                                    user_name: 1,

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

                                                    gender: 1,

                                                    full_name: 1,

                                                    email_id: 1,

                                                    profile_image: 1

                                                }

                                            }

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

                                                    }

                                                ],

                                                default: ""

                                            }

                                        }

                                    }

                                },

                                {

                                    $match: { user_data: { $exists: true, $ne: "" } }

                                },

                                {

                                    $count: "count"

                                }

                            ]

                        },

                    },

                    { $unwind: { path: "$info_attendee", preserveNullAndEmptyArrays: true } },

                    {

                        $set: {

                            attendees_count: { $cond: { if: "$info_attendee.count", then: "$info_attendee.count", else: 0 } }

                        }

                    },

                    {

                        $match: {

                            attendees_count: { $gte: 1 }

                        }

                    },

                    {

                        $project: {

                            _id: 1,

                            user_row_id: 1,

                            company_row_id: 1,

                            event_title: 1,

                            event_venue: 1,

                            event_type: 1,

                            list_event_type: 1,

                            event_image: 1,

                            event_url: 1,

                            start_date: 1,

                            end_date: 1,

                            attendees_count: { $cond: { if: "$info_attendee.count", then: "$info_attendee.count", else: 0 } }

                        }

                    }

                ]).sort({ event_title: 1 }).limit(10)



                res.json({ status: true, message: get_query })



            }

        }

        catch (err) {

            console.log('Search previous event.', err.message)

            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })

        }

    }

    else {

        res.json(checkUserToken)

    }

})



//unique attendees list

router.get('/previous_unique_attendees/:event_row_id', async (req, res) => {



    const checkUserToken = await checkAllLoginToken(req.headers, [10])

    if (checkUserToken.status) {

        try {

            let event_row_id = 0

            let host_user_row_id = 0

            if (checkUserToken.message.user_type == 1) {

                host_user_row_id = checkUserToken.message.user_row_id

            }



            let user_row_id = 0

            let company_row_id = 0

            let reg_array = []

            let manual_array = []



            let errObj = {}

            if (Number.isNaN(Number.parseInt(req.params.event_row_id))) {

                errObj['event_row_id'] = 'The event row id field must be contain valid number.'

            }

            else {

                event_row_id = Number.parseInt(req.params.event_row_id)

                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })

                if (!check_event_res.status) {

                    errObj['event_row_id'] = check_event_res.message.alert_message

                }

                else {

                    user_row_id = check_event_res.message.user_row_id

                    company_row_id = check_event_res.message.company_row_id



                    reg_array = await event_attendeesM.find({ event_row_id: event_row_id, user_type: 1 }, { user_row_id: 1 }).distinct("user_row_id")

                    manual_array = await event_attendeesM.find({ event_row_id: event_row_id, user_type: 2 }, { user_row_id: 1 }).distinct("user_row_id")



                }

            }



            if (Object.keys(errObj).length) {

                res.json({ status: false, message: errObj })

            }

            else {

                const cacheKey = `previous_unique_attendees_${event_row_id}_${sanitize(req.query.search || '')}`;



                // ✅ Check cache first

                const cache_response = await getCache({ key: cacheKey });

                if (cache_response.status && cache_response.message) {

                    return res.json({

                        status: true,

                        message: cache_response.message,

                        cache_response_status: true

                    });

                }





                const other_events_ids = await eventM.find({

                    $and: [

                        { _id: { $ne: event_row_id } },

                        { $or: [{ user_row_id: user_row_id }, { company_row_id: { $eq: company_row_id, $gt: 0 } }] }

                    ]

                }, { _id: 1 }).distinct("_id")





                if (other_events_ids.length) {

                    let user_search_query = [{ userData: { $exists: true, $ne: "" }, }]

                    if (req.query.search) {

                        user_search_query.push({ $or: [{ full_name: { $regex: req.query.search, $options: 'i' } }, { user_name: { $regex: req.query.search, $options: 'i' } }] })

                    }



                    if (!Number.isNaN(Number.parseInt(req.query.event_row_id))) {

                        user_search_query.push({ event_row_id: Number.parseInt(req.query.event_row_id) })

                    }



                    const get_query = await event_attendeesM.aggregate([

                        {

                            $lookup: {

                                from: "cln_events_speakers",

                                let: {

                                    user_row_id: '$user_row_id',

                                    event_row_id: '$event_row_id',

                                    user_type: '$user_type'

                                },

                                as: "speakers_info",

                                pipeline: [

                                    {

                                        $match: {

                                            $expr: {

                                                $and: [

                                                    { $eq: ['$user_row_id', '$$user_row_id'] },

                                                    { $eq: ['$event_row_id', event_row_id] },

                                                    { $eq: ['$user_type', "$$user_type"] }

                                                ]

                                            }

                                        }

                                    }

                                ]

                            }

                        },

                        {

                            $match: {

                                $and: [

                                    { event_row_id: { $in: other_events_ids } },

                                    {

                                        $or: [

                                            { user_row_id: { $nin: reg_array }, user_type: 1 },

                                            { user_row_id: { $nin: manual_array }, user_type: 2 }

                                        ]

                                    },

                                    {

                                        $expr: { $eq: [{ $size: "$speakers_info" }, 0] }

                                    }

                                ]

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

                                        $project: {

                                            _id: 1,

                                            user_name: 1,

                                            profile_image: "$img_info.profile_image",

                                            full_name: 1,

                                            email_id: 1,

                                            approval_status: 1,

                                            pro_batch: 1,

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

                                            gender: 1,

                                            full_name: 1,

                                            email_id: 1,

                                            profile_image: 1

                                        }

                                    }

                                ]

                            }

                        },

                        { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

                        {

                            $set: {

                                full_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.full_name", else: "$user_manual_info.full_name" } },

                                email_id: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.email_id", else: "$user_manual_info.email_id" } },

                                pro_batch: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.pro_batch", else: "" } },

                                user_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.user_name", else: "" } },

                                userData: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info", else: "$user_manual_info" } }

                            }

                        },

                        // // { $match: { userData : { $exists: true, $ne:"" }}},

                        {

                            $lookup:

                            {

                                from: "cln_professionals_work_experiences",

                                let: {

                                    user_type: '$user_type',

                                    user_row_id: '$user_row_id'

                                },

                                as: "outer_info_work",

                                pipeline: buildPreviousUniqueAttendeesOuterInfoWorkPipeline(),

                            }

                        },

                        { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },

                        {

                            $match: { $and: user_search_query }

                        },

                        {

                            $project:

                            {

                                invitation_status: 1,

                                invitation_type: 1,

                                created_date_n_time: 1,

                                user_type: 1,

                                user_row_id: 1,

                                full_name: 1,

                                pro_batch: 1,

                                email_id: 1,

                                event_row_id: 1,

                                user_name: 1,

                                profile_image: "$userData.profile_image",

                                position_name: "$outer_info_work.position_name",

                                company_name: "$outer_info_work.company_name",

                                speakers_info: "$speakers_info"

                            }

                        }

                    ])





                    // res.json({ status: true, message: get_query })

                    await setCache({ key: cacheKey, value: get_query, ttl: 1800 });



                    res.json({

                        status: true,

                        message: get_query,

                        cache_response_status: false

                    });

                }

                else {

                    res.json({ status: true, message: [] })

                }







            }

        }

        catch (err) {

            console.log('Previous unique attendees.', err.message)

            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })

        }

    }

    else {

        res.json(checkUserToken)

    }

})





router.get('/all_list/:skip/:limit', async (req, res) => {

    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (checkAdminToken.status) {
        try {
            let errObj = {}


            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)
                const result = await getAttendeesList(req, skip, limit)
                res.json(result)
            }
        }
        catch (err) {
            console.log('All attendees list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkAdminToken)
    }

})



router.get('/attendees_count', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10])
    if (!checkAdminToken.status) return res.json(checkAdminToken)

    try {
        // ─── Early filter: invitation_type if status=1 ────────────────────────
        const match_query = Number.parseInt(req.query.status) === 1
            ? { invitation_type: 2 }
            : {}

        const final_query = await event_attendeesM.aggregate([

            // ─── STAGE 1: Filter attendees early ─────────────────────────────
            { $match: match_query },

            // ─── STAGE 2: Lookup event — drop invalid events immediately ─────
            {
                $lookup: {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        { $match: { active_status: 1, approval_status: 1 } },
                        // ─── Host professional (inside event) ─────────────────
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1, approval_status: 1 } },
                                    { $project: { _id: 1, login_status: 1, approval_status: 1 } },
                                    { $limit: 1 }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                        // ─── Host company (inside event) ──────────────────────
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                localField: "company_row_id",
                                foreignField: "_id",
                                as: "company_info",
                                pipeline: [
                                    { $match: { active_status: 1, approval_status: 1 } },
                                    { $project: { _id: 1, active_status: 1, approval_status: 1 } },
                                    { $limit: 1 }
                                ]
                            }
                        },
                        { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                login_status: {
                                    $cond: { if: "$user_row_id", then: "$user_info.login_status", else: 1 }
                                },
                                company_active_status: {
                                    $cond: { if: "$company_row_id", then: "$company_info.active_status", else: 1 }
                                }
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
                        { $project: { _id: 1 } },
                        { $limit: 1 }
                    ]
                }
            },
            // ✅ Hard unwind — drops attendees with no valid event before
            // any attendee-level lookups fire
            { $unwind: { path: "$event_info" } },

            // ─── STAGE 3: Attendee lookup type=1 ─────────────────────────────
            // ✅ localField/foreignField — O(1) _id index hit
            // replaces $expr which caused full scan on lakh rows
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $project: { _id: 1, approval_status: 1, login_status: 1 } },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            // ─── STAGE 4: Attendee lookup type=2 (manual) ────────────────────
            // ✅ localField/foreignField — index hit, no $expr
            {
                $lookup: {
                    from: "cln_professionals_manual_retrievals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_manual_info",
                    pipeline: [
                        { $project: { _id: 1 } },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },

            // ─── STAGE 5: Resolve correct attendee by user_type ──────────────
            {
                $set: {
                    user_data: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$user_type", 1] }, then: "$user_info" },
                                { case: { $eq: ["$user_type", 2] }, then: "$user_manual_info" }
                            ],
                            default: ""
                        }
                    }
                }
            },
            // ✅ Drop unresolved attendees before $facet — both branches benefit
            { $match: { user_data: { $ne: "" } } },

            // ─── STAGE 6: $facet — email counts + attendee count ─────────────
            {
                $facet: {
                    // ✅ Email lookup scoped to matched attendees only
                    // sg_message_id grouped first to deduplicate before lookup
                    // so cln_emails_events is hit once per unique message, not per attendee
                    email_counts: [
                        // ✅ Deduplicate by sg_message_id before hitting email collection
                        // avoids N lookups when multiple attendees share a message_id
                        { $group: { _id: "$sg_message_id" } },
                        {
                            $lookup: {
                                from: "cln_emails_events",
                                localField: "_id",
                                foreignField: "sg_message_id",
                                as: "email_info",
                                pipeline: [
                                    { $sort: { _id: -1 } },
                                    { $limit: 1 },
                                    { $project: { event_type: 1, sg_message_id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
                        {
                            $group: {
                                _id: null,
                                totalProcessed: {
                                    $sum: { $cond: [{ $eq: ["$email_info.event_type", "processed"] }, 1, 0] }
                                },
                                totalDeferred: {
                                    $sum: { $cond: [{ $eq: ["$email_info.event_type", "deferred"] }, 1, 0] }
                                },
                                totalDelivered: {
                                    $sum: { $cond: [{ $eq: ["$email_info.event_type", "delivered"] }, 1, 0] }
                                },
                                totalOpen: {
                                    $sum: { $cond: [{ $eq: ["$email_info.event_type", "open"] }, 1, 0] }
                                },
                                totalBounceDrops: {
                                    $sum: { $cond: [{ $eq: ["$email_info.event_type", "drop"] }, 1, 0] }
                                },
                                totalBounce: {
                                    $sum: { $cond: [{ $eq: ["$email_info.event_type", "bounce"] }, 1, 0] }
                                }
                            }
                        }
                    ],

                    attendee_count: [
                        { $count: "count" }
                    ]
                }
            }

        ], { allowDiskUse: true })

        const email_counts = final_query[0]?.email_counts?.[0] || []
        const attendes_count = final_query[0]?.attendee_count?.[0]?.count || 0

        res.json({ status: true, email_counts, attendes_count })

    } catch (err) {
        console.log("All attendees list.", err.message)
        res.json({
            status: false,
            message: "An unexpected error occurred. Please try again later.",
            err: err.message
        })
    }
})





router.get('/save_user_attend_request/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const user_row_id = checkUserToken.message

                const result = await saveUserAttendRequest(event_row_id, user_row_id)
                res.json(result)
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
        console.log('Save user attend request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})





router.get('/remove_user_attend_request/:event_row_id', async (req, res) => {

    try {

        const checkUserToken = checkUserLoginToken(req.headers)

        if (checkUserToken.status) {

            const event_row_id = Number.parseInt(req.params.event_row_id)

            if (!Number.isNaN(event_row_id)) {
                const user_row_id = checkUserToken.message

                let start_date = "", event_title = ""

                let utc_row_id = 0



                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: 0 })

                if (check_event_res.status) {

                    start_date = check_event_res.message.start_date

                    event_title = check_event_res.message.event_title

                    utc_row_id = check_event_res.message.utc_row_id



                    const check_query = await event_attendeesM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: 1 })

                    if (check_query) {
                        await deleteAttendees({ type: 1, event_row_id: event_row_id, attendee_row_id: check_query._id })

                        await deleteKeysByPattern('all_events_*')

                        await deleteKeysByPattern('individual_event_*')

                        await deleteKeysByPattern('users_registered_list_*')

                        await deleteKeysByPattern('events_watchlist_*')

                        await deleteKeysByPattern('app_company_individual_other_details_*')

                        await deleteKeysByPattern('manage_events_list_*')

                        await deleteKeysByPattern('app_user_other_details_*')

                        await deleteKeysByPattern('event_attendees_list_*')





                        const user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1 })



                        const get_utc_time = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1 })

                        const start_date_formatted = DateFormatter(start_date)

                        const full_name = user_query.full_name

                        const email_id = user_query.email_id



                        if (check_event_res.message.user_row_id) {

                            const host_user_row_id = check_event_res.message.user_row_id



                            await updateThreadNotification({

                                user_row_id: host_user_row_id,

                                notify_type: 1,

                                notify_type_row_id: user_row_id,

                                message_row_id: 62,

                                action_row_id: user_row_id,

                                event_row_id: event_row_id

                            })

                        }





                        let pass_subject = 'Registration Cancellation - ' + event_title;

                        let message_to_pass = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>

                        <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that we have received notification of your unregistration for the <b>${event_title}</b> , scheduled to take place on <b>${start_date_formatted} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ""}</b>. 

                        </p>

                        <p style="color:#000;font-weight: 400;font-size:17px;">We appreciate your interest in attending the <b>${event_title}</b> event and apologize for any inconvenience caused by your cancellation. Should you wish to attend any future events, we would be delighted to have you join us.</p>

                        <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://events.coinpedia.org" style="color:#0029ff;">See more events  </a></p>

                        `

                        await sendEventsEmail(email_id, pass_subject, message_to_pass)

                        await deleteKeysByPattern('all_events_*')

                        res.json({ status: true, message: { alert_message: 'You have successfully unregistered from the event. Hope to see you at future events. Thank you for considering us!' } })



                    }

                    else {

                        res.json({

                            status: false,

                            message: { alert_message: 'Sorry, Your attend request for this event does not exist.' }

                        })

                    }



                }

                else {

                    res.json({

                        status: false,

                        message: { alert_message: 'Sorry, Invalid event row id.' }

                    })

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

        console.log('Remove user attend request.', err.message)

        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })

    }

})





router.get('/accept_invitation_request/:invitation_id', async (req, res) => {

    try {

        const checkUserToken = checkUserLoginToken(req.headers)

        if (checkUserToken.status) {

            const user_row_id = checkUserToken.message

            const invitation_id = Number.parseInt(req.params.invitation_id)

            if (!Number.isNaN(invitation_id)) {

                const get_query = await event_attendeesM.findOne({ _id: invitation_id, invitation_status: 0, invitation_type: 2 })

                if (get_query) {

                    let host_user_row_id = 0

                    const event_row_id = get_query.event_row_id

                    const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: 0 })

                    if (check_event_res.status) {

                        if (check_event_res.message.user_row_id) {

                            host_user_row_id = check_event_res.message.user_row_id

                        }

                    }



                    if ((get_query.user_type == 1) && (get_query.user_row_id == user_row_id)) {

                        await event_attendeesM.updateOne({ _id: invitation_id }, { $set: { invitation_status: 1 } })

                        await deleteKeysByPattern('event_attendees_list_*')

                        await deleteKeysByPattern('previous_unique_attendees_*')

                        await updateAttendeesCount({ event_row_id })
                        await deleteKeysByPattern('all_events_*')
                        await deleteKeysByPattern('users_registered_list_*')





                        if (host_user_row_id) {

                            await updateThreadNotification({

                                user_row_id: host_user_row_id,

                                notify_type: 1,

                                notify_type_row_id: user_row_id,

                                message_row_id: 67,

                                action_row_id: user_row_id,

                                event_row_id: event_row_id

                            })

                        }



                        res.json({ status: true, message: { alert_message: 'Your invitation request of event has been accepted successfully.' } })

                    }

                    else if (get_query.user_type == 2) {

                        const manual_user_query = await professionals_manual_retrievalsM.findOne({ _id: get_query.user_row_id })

                        if (manual_user_query) {

                            //, user_type:1, user_row_id:user_row_id, event_row_id:event_row_id, invitation_type:2

                            const manual_email_id = (manual_user_query.email_id).toLowerCase()

                            const register_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1 })

                            const register_email_id = (register_user_query.email_id).toLowerCase()



                            if (manual_email_id == register_email_id) {

                                await event_attendeesM.updateOne({ _id: invitation_id }, { $set: { invitation_status: 1, user_type: 1, user_row_id: user_row_id } })

                                await updateAttendeesCount({ event_row_id })



                                await shiftUserFromManualToRegister({ manual_user_row_id: get_query.user_row_id, register_user_row_id: user_row_id, sub_admin_row_id: 0 })



                                res.json({ status: true, message: { alert_message: 'Your invitation request of event has been accepted successfully.' } })

                            }

                            else {

                                res.json({ status: false, message: { alert_message: 'Sorry, Invalid invitation row id.' } })

                            }

                        }

                        else {

                            res.json({ status: false, message: { alert_message: 'Sorry, Invalid invitation row id.' } })

                        }

                    }

                    else {

                        res.json({ status: false, message: { alert_message: 'Sorry, Invalid invitation row id.' } })

                    }

                }

                else {

                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid invitation row id.' } })

                }

            }

            else {

                res.json({ status: false, message: { alert_message: 'Sorry, Invalid invitation row id.' } })

            }

        }

        else {

            res.json(checkUserToken)

        }



    }

    catch (err) {

        console.log('Accept Invitation request.', err.message)

        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })

    }

})







router.post('/add_multiple_attendees', [

    check('event_row_id')

        .not().isEmpty().withMessage('The Event Row ID field is required.'),

    check('attendees_row_ids')

        .not().isEmpty().withMessage('The Guest IDs field is required.')

        .isInt().withMessage('The Guest IDs field must be contains only integers.')

], async (req, res) => {

    try {

        const errors = validationResult(req)

        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [10])

        if (checkUserToken.status) {

            const attendees_row_ids = req.body.attendees_row_ids

            if (!Array.isArray(attendees_row_ids)) {

                errObj['attendees_row_ids'] = "The Guest ID's field must be contain only array with values."

            }

            else if (!attendees_row_ids.length) {

                errObj['attendees_row_ids'] = "The Attendee's ID's field must contain previous event attendee's ids."

            }



            let event_row_id = 0

            if (!Number.isNaN(Number.parseInt(req.body.event_row_id))) {

                event_row_id = Number.parseInt(req.body.event_row_id)

            }





            let email_day_number = 0

            if (!Number.isNaN(Number.parseInt(req.body.email_day_number))) {

                if (Number.parseInt(req.body.email_day_number) <= 7) {

                    email_day_number = Number.parseInt(req.body.email_day_number)

                }

            }



            let host_user_row_id = 0

            let event_host_name = ""

            let start_date = ""

            let event_title = ""

            let event_url = ""

            let utc_row_id = ""



            if (event_row_id) {

                if (checkUserToken.message.user_type == 1) {

                    host_user_row_id = checkUserToken.message.user_row_id

                }



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



                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })

                if (check_event_res.status) {

                    event_host_name = check_event_res.message.event_host_name

                    start_date = check_event_res.message.start_date

                    event_title = check_event_res.message.event_title

                    event_url = check_event_res.message.event_url

                    utc_row_id = check_event_res.message.utc_row_id

                }

                else {

                    errObj['event_row_id'] = check_event_res.message.alert_message

                }

            }





            if (!Object.keys(errObj).length) {

                let invalid_attendees = []

                let mesage_id = 0

                for (let key in attendees_row_ids) {

                    if (attendees_row_ids[key]) {

                        const check_prev_query = await event_attendeesM.findOne({ _id: sanitize(attendees_row_ids[key]) }) //, event_row_id:previous_event_row_id

                        if (check_prev_query) {

                            let user_type = check_prev_query.user_type

                            let user_row_id = check_prev_query.user_row_id

                            const check_speaker = await checkSpeaker({ event_row_id, user_row_id, user_type })

                            if (check_speaker.status) {

                                let full_name = ""

                                let email_id = ""

                                if (user_type == 1) {

                                    const get_user_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 })

                                    if (get_user_query) {

                                        full_name = get_user_query.full_name

                                        email_id = get_user_query.email_id

                                    }

                                }

                                else if (user_type == 2) {

                                    const get_user_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })

                                    if (get_user_query) {

                                        full_name = get_user_query.full_name

                                        email_id = get_user_query.email_id

                                    }

                                }



                                let attendee_row_id = 0

                                if (full_name) {

                                    const insertArr = {

                                        user_type: user_type,

                                        user_row_id: user_row_id,

                                        event_row_id: event_row_id,

                                        invitation_status: 0,

                                        invitation_type: 2,

                                        email_day_number: email_day_number,

                                        created_date_n_time: getPresentDateTime()

                                    }



                                    const guest_query = await event_attendeesM(insertArr).save()

                                    await deleteKeysByPattern('previous_unique_attendees_*')

                                    await deleteKeysByPattern('event_attendees_list_*')
                                    await deleteKeysByPattern('all_events_*')

                                    attendee_row_id = guest_query._id



                                    await updateAttendeesCount({ event_row_id })



                                    if (email_id) {

                                        mesage_id = await sendingEmailToAttendees({

                                            utc_row_id, event_title, event_url, start_date, event_host_name,

                                            attendee_row_id, event_row_id,

                                            email_id,

                                            full_name

                                        })



                                        if (mesage_id) {

                                            await event_attendeesM.updateOne({ _id: attendee_row_id }, { $set: { sg_message_id: mesage_id } })

                                        }

                                    }

                                }

                            }

                            else {

                                invalid_attendees.push(attendees_row_ids[key])

                            }

                        }

                    }

                }



                res.json({ status: true, message: { alert_message: "Your new attendee invitation request has been sent successfully. Invitation forwarded to the intended attendees." }, not_inserted_data: invalid_attendees })



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

        console.log('Add multiple attendees.', err.message)

        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })

    }

})



router.post('/event_attendees_bulk/:event_row_id', async (req, res) => {

    try {

        const checkToken = await checkAllLoginToken(req.headers, [10]);

        if (checkToken.status) {



            const event_row_id = Number.parseInt(req.params.event_row_id);



            if (Number.isNaN(event_row_id)) {

                return res.json({ status: false, message: { attendees: 'Invalid event_row_id.' } });

            }



            const check_event_res = await checkEventRowID({ event_row_id, user_row_id: 0 });

            if (!check_event_res.status) {

                return res.json({ status: false, message: { attendees: check_event_res.message.alert_message || 'Invalid event.' } });

            }

            const token_message = checkToken.token_message



            if (token_message.admin_row_id) {

                const check_access = await checkSubadminAccess({

                    admin_row_id: Number.parseInt(token_message.admin_row_id),

                    admin_manager_type: token_message.admin_manager_type,

                    sub_admin_type: Number.parseInt(token_message.sub_admin_type),

                    event_row_id: event_row_id

                })



                if (!check_access.status) {

                    return res.json({ status: false, message: { attendees: check_access.message } });

                }

            }



            if (!req.body.bulk_data || !Array.isArray(req.body.bulk_data)) {

                return res.json({ status: false, message: { attendees: 'The attendees field must contain a valid array format of data.' } });

            }



            const bulk_data = req.body.bulk_data;

            if (!bulk_data?.[0]?.full_name || !bulk_data?.[0]?.email_id) {

                return res.json({ status: false, message: { attendees: 'The attendees data fields such as full_name and email_id are required.' } });

            }



            const {

                user_row_id: host_user_row_id,

                company_row_id: host_company_row_id,

                list_event_type,

                start_date,

                event_title,

                event_link,

                utc_row_id

            } = check_event_res.message;



            let not_inserted_array = [];

            let inserted_count = 0;



            for (const row of bulk_data) {

                try {

                    let full_name = row.full_name?.trim();

                    let email_id = row.email_id?.trim().toLowerCase();

                    let email_day_number = 0;

                    const mail_type_list = [

                        { _id: 0, name: "Now" },

                        { _id: 1, name: "12 Hours" },

                        { _id: 2, name: "1 Day before" },

                        { _id: 3, name: "2 Days before" },

                        { _id: 4, name: "3 Days before" },

                    ];



                    if (row.scheduled_time && typeof row.scheduled_time === 'string') {

                        const matched = mail_type_list.find(mail => mail.name.toLowerCase() === row.scheduled_time.toLowerCase());

                        if (matched) {

                            email_day_number = matched._id;

                        }

                    }



                    if (!full_name || !email_id) {

                        not_inserted_array.push({ message: 'The full_name and email_id fields are required.', data: row });

                        continue;

                    }



                    let user_type = 1;

                    let user_row_id = null;





                    const user = await professionalsM

                        .findOne({ email_id: email_id, login_status: 1 })

                        .collation({ locale: "en", strength: 2 });



                    if (user) {

                        user_row_id = user._id;

                        full_name = user.full_name;

                        email_id = user.email_id;

                    } else {

                        let manual_user = await professionals_manual_retrievalsM

                            .findOne({ email_id: email_id })

                            .collation({ locale: "en", strength: 2 });



                        if (!manual_user) {

                            manual_user = await new professionals_manual_retrievalsM({

                                full_name,

                                email_id,

                                created_on: getPresentDateTime(),

                            }).save();

                        }



                        user_row_id = manual_user._id;

                        full_name = manual_user.full_name;

                        email_id = manual_user.email_id;

                        user_type = 2;

                    }





                    if (user_row_id === host_user_row_id) {

                        not_inserted_array.push({ message: 'User is the host of this event and cannot register as an attendee.', data: row });

                        continue;

                    }



                    const check_duplicate = await event_attendeesM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: user_type });

                    if (check_duplicate) {

                        not_inserted_array.push({ message: 'User is already added as an attendee.', data: row, check_access });

                        continue;

                    }



                    const check_speaker = await checkSpeaker({ event_row_id, user_row_id, user_type: user_type });

                    if (!check_speaker.status === true) {

                        not_inserted_array.push({ message: 'User is already a speaker in this event.', data: row });

                        continue;

                    }





                    // Insert attendee

                    const insertObj = {

                        event_row_id,

                        user_row_id,

                        user_type: user_type,

                        email_day_number: email_day_number,

                        email_sent_status: email_day_number ? false : true,

                        invitation_status: 0,

                        invitation_type: 2,

                        created_date_n_time: getPresentDateTime()

                    };



                    const inserted_attendee = await event_attendeesM(insertObj).save();

                    await deleteKeysByPattern('event_attendees_list_*')

                    await deleteKeysByPattern('previous_unique_attendees_*')
                    await deleteKeysByPattern('all_events_*')

                    await deleteKeysByPattern('individual_event_*')

                    inserted_count++;



                    await updateAttendeesCount({ event_row_id });



                    // Notify user

                    if (user_type === 1) {

                        const notify_type = [1, 3].includes(list_event_type) ? 1 : 2;

                        const notify_type_row_id = notify_type === 1 ? host_user_row_id : host_company_row_id;

                        if (notify_type_row_id) {

                            await updateNotification({

                                user_row_id,

                                notify_type,

                                notify_type_row_id,

                                message_row_id: 55,

                                action_row_id: notify_type_row_id,

                                event_row_id

                            });

                        }

                    }



                    // Send email only if scheduled for immediate send

                    if (email_id && (email_day_number == 0)) {

                        const get_utc_time = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1 });

                        const start_date_formatted = DateFormatter(start_date);

                        const invite_req_url = event_link

                        const guest_pass_subject = `You’re Invited to attend ${event_title} Event`;



                        const guest_message_to_pass = `

<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>

<p style="color:#000;font-weight: 400;font-size:17px;">

    You’ve been invited by <b style="text-transform: capitalize;">${check_event_res.message.event_host_name}</b> to attend the <b>${event_title}</b> event on <b>${start_date_formatted} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ""}</b>. 

</p>

<p style="color:#000;font-weight: 400;font-size:17px;">Be part of this exciting event which is going to be fun and very thoughtful. Packed with amazing speakers and industry experts.</p>

<p style="color:#000;font-weight: 400;font-size:17px;">Register yourself to this event, by accepting the invitation below.</p>

<p><a href="${invite_req_url}" style="color:#0029ff;font-weight: 400;font-size:17px;">Accept Invitation</a></p>

`;



                        const message_id = await sendEventsEmail(email_id, guest_pass_subject, guest_message_to_pass, inserted_attendee._id, event_row_id);



                        if (message_id) {

                            await event_attendeesM.updateOne(

                                { _id: inserted_attendee._id },

                                { $set: { sg_message_id: message_id } }

                            );

                        }

                    }





                } catch (err) {

                    not_inserted_array.push({ message: 'Error adding attendee: ' + err.message, data: row });

                }

            }

            // const token_messages = checkToken.message

            return res.json({

                status: inserted_count > 0,

                message: {

                    alert_message: inserted_count > 0 ? 'Event attendees have been submitted successfully.' : 'No attendees added. All entries failed.', checkToken,

                    total_submitted: bulk_data.length,

                    total_inserted: inserted_count,

                    total_failed: not_inserted_array.length,

                    not_inserted_array

                }

            });

        }

        else {

            res.json(checkToken)

        }







    } catch (err) {

        console.error('Event attendees bulk data error:', err.message);

        res.json({ status: false, message: err.message });

    }

});









const sendingEmailToAttendees = async ({

    utc_row_id, event_title, event_url, start_date, event_host_name,

    attendee_row_id, event_row_id,

    email_id, full_name }) => {

    const get_utc_time = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1 })

    let start_date_formatted = DateFormatter(start_date)



    let guest_pass_subject = "You’re Invited to attend " + event_title + " Event"

    let invite_req_url = "https://events.coinpedia.org/" + event_url + "?invitation_id=" + attendee_row_id



    let guest_message_to_pass = `

    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>

    <p style="color:#000;font-weight: 400;font-size:17px;">

        You’ve been invited by <b style="text-transform: capitalize;">${event_host_name}</b> to attend the <b>${event_title}</b> event on <b>${start_date_formatted} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ""}</b>. 

    </p>

    <p style="color:#000;font-weight: 400;font-size:17px;">Be part of this exciting event which is going to be fun and very thoughtful. Packed with amazing speakers and industry experts.</p>

    <p style="color:#000;font-weight: 400;font-size:17px;">Register yourself to this event, by accepting the invitation below.</p>

    <p><a href="${invite_req_url}" style="color:#0029ff;font-weight: 400;font-size:17px;">Accept Invitation </a></p>

    `

    const sg_message_id = await sendEventsEmail(email_id, guest_pass_subject, guest_message_to_pass, attendee_row_id, event_row_id)



    return sg_message_id

}



router.buildAttendeesListOuterInfoWorkPipeline = buildAttendeesListOuterInfoWorkPipeline
router.buildPreviousUniqueAttendeesOuterInfoWorkPipeline = buildPreviousUniqueAttendeesOuterInfoWorkPipeline

module.exports = router