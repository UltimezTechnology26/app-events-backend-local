const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, validateAndSaveImage, getIntIdFromArray, generateEventUrl, createDateTime, removeHtmltag } = require('../../../utils/helpers/helper')
const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
const { getManageEventsList, getViewDetails, getRegisteredUsers } = require('../../../services/events/events_listed')
const { sendEventsEmail, sendEmail } = require('../../../config/email')
const { DateFormatter, checkAttendee, deleteEvent, checkEventRowID, speakers_email, checkSubadminAccess, filterQuery, getEventsData, checkSpeaker, updateAttendeesCount, generateEventCard } = require('../../../utils/helpers/events_helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { updateThreadNotification, updateNotification } = require('../../../utils/helpers/notification_helper')
const { getPositionResolutionStages } = require('../../../src/modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../src/modules/funding/funding.queries')

/**
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `info_work` lookup inside GET /speakers_list/:event_row_id. This was one of 2
 * genuinely-broken locations in this file: it previously looked up positions from
 * a misnamed collection ("users" instead of "professionals" in the name) that DOES
 * NOT EXIST, so this lookup always returned empty and position_name was always
 * blank. Now resolves position name(s)
 * via getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr — fixing the typo/wrong-collection bug as a side effect of
 * reusing the shared resolver. Downstream, the outer pipeline's final $project
 * still reads `position_name` from `$info_work.position_name` — unchanged shape.
 * `{ $limit: 1 }` kept in its original position: after position resolution, before
 * company lookups.
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
                            company_name: 1,
                            company_email_id: 1,
                            company_logo: 1,
                            website_link: 1,
                            country_id: 1,
                            company_location: 1,
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
                            company_name: 1,
                            company_email_id: 1,
                            company_logo: 1,
                            website_link: 1,
                            country_id: 1,
                            company_location: 1,
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
                company_email_id: { $cond: { if: "$info_company.company_email_id", then: "$info_company.company_email_id", else: "$info_manual_company.company_email_id" } },
                company_logo: { $cond: { if: "$info_company.company_logo", then: "$info_company.company_logo", else: "$info_manual_company.company_logo" } },
                website_link: { $cond: { if: "$info_company.website_link", then: "$info_company.website_link", else: "$info_manual_company.website_link" } },
                country_id: { $cond: { if: "$info_company.country_id", then: "$info_company.country_id", else: "$info_manual_company.country_id" } },
                company_location: { $cond: { if: "$info_company.company_location", then: "$info_company.company_location", else: "$info_manual_company.company_location" } },
            }
        }
    ]
}

/**
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `info_work` lookup inside GET /events_tags' `user_query` sub-aggregate. This was
 * the 2nd genuinely-broken location in this file with the same misnamed/nonexistent
 * collection bug as buildSpeakersListInfoWorkPipeline above — fixed the same way, via
 * getPositionResolutionStages() + joinPositionNamesExpr. Downstream, the outer
 * pipeline's final $project still reads `position_name` from
 * `$info_work.position_name` — unchanged shape. Kept as a SEPARATE function (not
 * merged with buildSpeakersListInfoWorkPipeline) since the two routes' surrounding
 * pipelines are independent and may diverge later.
 */
function buildEventsTagsUserInfoWorkPipeline() {
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
import agenda from "../../../config/agenda"
const puppeteer = require("puppeteer");

const ticketM = require('../../../models/app/events/ticketM')
const eventM = require('../../../models/app/events/eventM')
const event_tagsM = require('../../../models/app/static/event_tagsM')
const event_default_imagesM = require('../../../models/app/static/event_default_imagesM')
const countryM = require('../../../models/app/static/countryM')
const event_seo_detailsM = require('../../../models/app/events/event_seo_detailsM')
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
const event_speakers_manualM = require('../../../models/app/events/event_speakers_manualM')
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const sub_admin_emailsM = require('../../../models/admin_panel/app/sub_admin_emailsM')
const event_utc_datesM = require('../../../models/app/events/event_utc_datesM')
const event_contactsM = require('../../../models/app/events/event_contactsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const event_link_display_detailsM = require('../../../models/app/events/event_link_display_detailsM')
const { calculateEventScore } = require('../../../utils/helpers/app_helper')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const event_faqM = require('../../../models/app/events/event_faqM')

//Speakers
router.post('/update_link_display_details', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required')
        .isInt().withMessage('The Event Row ID field must be a valid number .')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        let event_row_id = 0
        if (req.body.event_row_id) {
            if (!Number.isNaN(Number.parseInt(req.body.event_row_id))) {
                event_row_id = Number.parseInt(req.body.event_row_id)
            }
            else {
                errObj['event_row_id'] = "Invalid Event Row ID."
            }
        }

        let user_row_id = 0
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
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

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                let update_object = {}
                update_object['link_user_register_status'] = (req.body.link_user_register_status)
                update_object['link_attendee_list_status'] = (req.body.link_attendee_list_status)
                update_object['link_speaker_status'] = (req.body.link_speaker_status)
                update_object['link_partner_status'] = (req.body.link_partner_status)
                update_object['link_sponsor_status'] = (req.body.link_sponsor_status)
                update_object['link_ticket_status'] = (req.body.link_ticket_status)

                const get_query = await event_link_display_detailsM.findOne({ event_row_id: event_row_id }, { _id: 1 })
                const eventData = await eventM.findOne(
                    { _id: event_row_id },
                    { event_url: 1, approval_status: 1, event_title: 1, start_date: 1, event_venue: 1, created_date_n_time: 1, event_type: 1 }
                );
                if (eventData?.approval_status === 1) {
                    const cardData = {
                        event_title: eventData.event_title,
                        start_date: eventData.start_date,
                        event_venue: (eventData?.event_type == 1 || eventData?.event_type == 3 || eventData?.event_type == 4 || eventData?.event_type == 5 || eventData?.event_type == 6 || eventData?.event_type == 7 || eventData?.event_type == 8) ? eventData.event_venue : "Virtual",
                        event_url: eventData.event_url,
                        event_row_id,
                    };

                    await agenda.now("generate event card", cardData);
                }
                console.log(update_object, 'update_object');

                if (!get_query) {
                    update_object['event_row_id'] = event_row_id

                    await event_link_display_detailsM(update_object).save()
                    await deleteKeysByPattern('individual_event_*')


                    res.json({ status: true, message: { alert_message: 'This event link display setting details has been updated succssfully.' } })
                }
                else {
                    await event_link_display_detailsM.updateOne({ event_row_id: event_row_id }, { $set: update_object })
                    await deleteKeysByPattern('individual_event_*')


                    res.json({ status: true, message: { alert_message: 'This event link display setting details has been updated succssfully.' } })
                }

            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Add speaker error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/add_speaker', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required')
        .isInt().withMessage('The Event Row ID field must be a valid number .'),
    check('user_row_id')
        .not().isEmpty().withMessage('The User Row ID field is required')
        .isInt().withMessage('The User Row ID field must be a valid number.'),
    check('user_type')
        .not().isEmpty().withMessage('The User type field is required')
        .isInt({ min: 1, max: 2 }).withMessage('The type field must be contain 1 or 2.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let host_user_row_id = 0

            const event_row_id = Number.parseInt(req.body.event_row_id)
            const user_type = Number.parseInt(req.body.user_type)
            const user_row_id = Number.parseInt(req.body.user_row_id)

            if (event_row_id && user_type && user_row_id) {

                if (checkUserToken.message.user_type == 1) {
                    host_user_row_id = checkUserToken.message.user_row_id
                    const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id, active_status: 1, approval_status: { $in: [0, 1] } })
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

                if (user_type == 1) {
                    const userActiveStatus = await professionalsM.findOne({ _id: user_row_id, login_status: 1 }, { _id: 1 })
                    if (!userActiveStatus) {
                        errObj['user_row_id'] = 'Invalid User Row ID.'
                    }
                }
                else if (user_type == 2) {
                    const userActiveStatus = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })
                    if (!userActiveStatus) {
                        errObj['user_row_id'] = 'Invalid User Row ID.'
                    }
                }

                const check_speaker = await event_speakersM.findOne({ event_row_id: event_row_id, user_type: user_type, user_row_id: user_row_id })
                if (check_speaker) {
                    errObj['user_row_id'] = 'This Speaker is already present in the event.'
                }


                if (Object.keys(errObj).length > 0) {
                    res.json({ status: false, message: errObj })
                }
                else {
                    const insert_array = {
                        event_row_id: event_row_id,
                        user_type: user_type,
                        user_row_id: user_row_id,
                    }
                    await event_speakersM(insert_array).save()
                    await deleteKeysByPattern('event_speakers_list_*')
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('speakers_list*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('contacts_list_*')
                    const eventData = await eventM.findOne(
                        { _id: event_row_id },
                        { event_url: 1, approval_status: 1, event_title: 1, start_date: 1, event_venue: 1, created_date_n_time: 1, event_type: 1 }
                    );
                    await speakers_email({ event_row_id: event_row_id, user_type: user_type, user_row_id: user_row_id, host_user_row_id: host_user_row_id })
                    if (eventData?.approval_status === 1) {
                        const cardData = {
                            event_title: eventData.event_title,
                            start_date: eventData.start_date,
                            event_venue: (eventData?.event_type == 1 || eventData?.event_type == 3) ? eventData.event_venue : "Virtual",
                            event_url: eventData.event_url,
                            event_row_id,
                        };

                        await agenda.now("generate event card", cardData);
                    }
                    await calculateEventScore(event_row_id, ['speakers'])


                    res.json({ status: true, message: 'Speaker added successfully' })
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
        console.log('Add speaker error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/get_speakers', async (req, res) => {
    try {
        const gte_list = await event_speakersM.find()
        res.json({ status: true, message: gte_list })
    }
    catch (err) {
        res.json({ status: true, message: err.message })
    }
})



router.post('/submit_user_speaker_request', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.')
        .isInt().withMessage('The Event Row ID field must be an integer.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const errObj = arrangeValidation(errors);
            return res.json({ status: false, message: errObj });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status) {
            return res.json(checkUserToken);
        }

        const user_row_id = checkUserToken.message?.user_row_id;
        const event_row_id = Number.parseInt(req.body.event_row_id);

        const errObj = {};

        if (!event_row_id || Number.isNaN(event_row_id)) {
            errObj['event_row_id'] = 'Invalid Event Row ID.';
            return res.json({ status: false, message: errObj });
        }

        const check_event_query = await eventM.findOne({ _id: event_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 });
        if (!check_event_query) {
            errObj['event_row_id'] = 'Event not found or inactive.';
        } else if (check_event_query.user_row_id === user_row_id) {
            errObj['alert_message'] = 'You cannot request to be a speaker for your own event.';
        }

        // Check for duplicate request
        const existing = await event_speakersM.findOne({ event_row_id, user_row_id, user_type: 1 });
        if (existing) {
            errObj['alert_message'] = 'You have already submitted a speaker request for this event.';
        }

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        const newRequest = new event_speakersM({
            event_row_id,
            user_row_id,
            user_type: 1,
            date_n_time: getPresentDateTime(),
            requested_status: 0
        });

        await newRequest.save();
        await deleteKeysByPattern('event_speakers_list_*')
        await deleteKeysByPattern('all_events_*')
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('speakers_list*')
        await deleteKeysByPattern('app_user_other_details_*')

        return res.json({
            status: true,
            message: { alert_message: 'Your speaker request has been submitted successfully.' }
        });

    } catch (err) {
        console.error('Submit speaker request error:', err.message);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});



router.post('/accept_speaker_request', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.')
        .isInt().withMessage('The Event Row ID field must be a valid number.'),
    check('user_row_id')
        .not().isEmpty().withMessage('The User Row ID field is required.')
        .isInt().withMessage('The User Row ID field must be a valid number.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);
        if (!errors.isEmpty()) {
            return res.json({ status: false, message: errObj });
        }

        const { event_row_id, user_row_id } = req.body;
        const checkUserToken = await checkAllLoginToken(req.headers, [10]);

        if (!checkUserToken.status)
            return res.json(checkUserToken);

        const event = await eventM.findOne({ _id: event_row_id, active_status: 1 });
        if (!event) {
            res.json({ status: false, message: { alert_message: 'Invalid event or permission denied.' } });
        }

        const request = await event_speakersM.findOne({
            event_row_id,
            user_row_id,
            requested_status: 0
        });

        if (!request) {
            res.json({ status: false, message: { alert_message: 'Request not found or already handled.' } });
        }

        await event_speakersM.updateOne(
            { _id: request._id },
            { $set: { requested_status: 1 } }
        );
        await deleteKeysByPattern('event_speakers_list_*')
        await deleteKeysByPattern('speakers_list*')
        await deleteKeysByPattern('individual_event_*')
        const userInfo = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1, email_id: 1 });
        if (!userInfo) {
            res.json({ status: false, message: { alert_message: 'User not found.' } });
        }

        let email_event_url = "https://events.coinpedia.org/" + event.event_url
        const eventName = event.event_title || '[Event Name]';
        const eventAddress = event.event_venue || '[Event Address]';
        const eventDateTime = event.start_date ? DateFormatter(event.start_date) : '[Event Date and Time]';

        const eventTypeMap = { 1: 'Seminar', 2: 'Webinar', 3: 'Hybrid' };
        const eventType = eventTypeMap[event.event_type] || '[Event Type]';

        let event_host_name = ''
        const check_event_res = await checkEventRowID({ event_row_id })
        if (check_event_res.status) {
            event_host_name = check_event_res.message.event_host_name || '[Host Name]'
        }
        const pass_subject = 'Speaker Request Approved!';
        const pass_email_id = userInfo.email_id;

        const pass_message = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; color: #000;">
                <h2 style="color: #28a745;">Speaker Request Approved!</h2>
                

                <p style="font-size: 18px;">Hello ${userInfo.full_name},</p>

                <p>Congratulations! We're thrilled to inform you that your speaker request for the event <b>${eventName}</b>,
                happening at <b>${eventAddress}</b> on <b>${eventDateTime}</b> and <b>${eventType}</b> has been successfully approved by the host <b>${event_host_name}</b>.</p>

                <p>Your speaker request has been officially approved – we're thrilled to have you on board! Your insights and expertise will be a valuable addition to the event.</p>

                <p>Your speaker profile is now live and publicly visible on our website.</p>

                <p>Thank you for being part of this exciting journey.</p>

                <div style="margin: 20px 0;">
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">Visit Now </a></p>
                    <p style="font-size: 12px; margin-top: 8px;">This link will direct you to the events page where you have been added as a speaker.</p>
                </div>

                <p>Thank you for Trusting us.<br><b>Team CoinPedia</b></p>

                <p style="font-size: 13px;">
                    For any queries <a href="mailto:support@coinpedia.org" style="color: #007bff;">Contact Us</a>
                </p>
            </div>
        `;

        await sendEventsEmail(pass_email_id, pass_subject, pass_message);
        await deleteKeysByPattern('event_speakers_list_*')
        await deleteKeysByPattern('all_events_*')
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('speakers_list*')
        await deleteKeysByPattern('app_user_other_details_*')
        return res.json({
            status: true,
            message: { alert_message: 'Speaker request approved and confirmation email sent.' }
        });

    } catch (err) {
        console.error('Accept speaker request error:', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});


router.post('/reject_speakers_request', [
    check('event_row_id').isInt().withMessage('Invalid Event ID'),
    check('user_row_id').isInt().withMessage('Invalid User ID'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const errObj = arrangeValidation(errors);
            return res.json({ status: false, message: errObj });
        }

        const { event_row_id, user_row_id } = req.body;
        const checkUserToken = await checkAllLoginToken(req.headers, [10]);

        if (!checkUserToken.status) return res.json(checkUserToken);

        checkUserToken.message.user_row_id;

        const event = await eventM.findOne({ _id: event_row_id, active_status: 1 });
        if (!event) {
            res.json({ status: false, message: { alert_message: 'Invalid Event row id.' } });
        }

        const request = await event_speakersM.findOne({
            event_row_id,
            user_row_id,
            requested_status: 0
        });

        if (!request) {
            res.json({ status: false, message: { alert_message: 'Request not found or already handled.' } });
        }

        await event_speakersM.updateOne(
            { _id: request._id },
            {
                $set: {
                    requested_status: 2
                }
            }
        );
        await deleteKeysByPattern('speakers_list*')
        await deleteKeysByPattern('event_speakers_list_*')
        await deleteKeysByPattern('individual_event_*')
        const userInfo = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1, email_id: 1 });
        if (userInfo) {
            const pass_email_id = userInfo.email_id;
            const pass_subject = 'Speaker Request Rejected!';
            let email_event_url = "https://events.coinpedia.org/" + event.event_url
            const eventName = event.event_title || '[Event Name]';
            const eventAddress = event.event_venue || '[Event Address]';
            const eventDateTime = event.start_date ? DateFormatter(event.start_date) : '[Event Date and Time]';
            const eventTypeMap = { 1: 'Seminar', 2: 'Webinar', 3: 'Hybrid' };
            const eventType = eventTypeMap[event.event_type] || '[Event Type]';
            let event_host_name = ''
            const check_event_res = await checkEventRowID({ event_row_id })
            if (check_event_res.status) {
                event_host_name = check_event_res.message.event_host_name || '[Host Name]'
            }

            const pass_message = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #dc3545;"> Speaker Request Rejected!</h2>
                   

                    <p style="font-size: 17px;">Hello ${userInfo.full_name},</p>

                    <p style="font-size: 16px; line-height: 1.6;">
                        Unfortunately, your speaker request for the event <strong>${eventName}</strong>, happening at
                        <strong>${eventAddress}</strong> on <strong>${eventDateTime}</strong> and <strong>${eventType}</strong>
                        has been rejected by the host <strong>${event_host_name}</strong> due to not meeting the event criteria or missing essential information.
                    </p>

                    <p style="font-size: 16px; line-height: 1.6;">
                        Thank you for your interest in becoming a speaker on our website. After careful consideration, we regret to inform you that your request has not been approved at this time.
                        We truly appreciate the expertise and perspective you offered, and we encourage you to stay connected for future opportunities to collaborate.
                    </p>

                    <p style="font-size: 16px;">Meanwhile, we encourage you to explore our upcoming events.</p>

                    <div style="margin: 24px 0;">
                     <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">Visit Now </a></p>
                        <p style="font-size: 12px; margin-top: 8px; color: #666;">This link will direct you to all events page where you can explore the events.</p>
                    </div>

                    <p style="font-size: 15px;">Thank you for Trusting us.<br><strong>Team CoinPedia</strong></p>

                    <p style="font-size: 13px; color: #555;">For any queries <a href="mailto:support@coinpedia.org" style="color: #007bff;">Contact Us</a></p>
                </div>
            `;

            await sendEventsEmail(pass_email_id, pass_subject, pass_message);
        }

        return res.json({ status: true, message: { alert_message: 'Speaker request rejected and email sent.' } });

    } catch (err) {
        console.error('Reject speaker request error:', err.message);
        return res.json({ status: false, message: 'An error occurred.', err: err.message });
    }
});


router.get('/speakers_list/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (!checkUserToken.status) {
            return res.json(checkUserToken)
        }

        const event_row_id = Number.parseInt(req.params.event_row_id)
        if (Number.isNaN(event_row_id)) {
            return res.json({ status: false, message: { alert_message: 'Event row id should be a valid number.' } })
        }

        let errObj = {}
        const user_row_id = checkUserToken.message.user_row_id

        if (checkUserToken.message.user_type == 1) {
            const check_event_query = await eventM.findOne({ _id: event_row_id, user_row_id })
            if (!check_event_query) {
                errObj['event_row_id'] = "Invalid Event Row ID."
            }
        }

        if (Object.keys(errObj).length) {
            return res.json({ status: false, message: errObj })
        }

        const query = { event_row_id }
        if (req.query.requested_status) {
            query.requested_status = Number.parseInt(req.query.requested_status)
        }

        const key = `event_speakers_list_${event_row_id}_${req.query.requested_status || "all"}`

        const cache_response = await getCache({ key })
        if (cache_response.status && Array.isArray(cache_response.message)) {
            return res.json({
                status: true,
                message: cache_response.message,
                key: key,
                cache_response_status: true
            })
        }

        const get_query = await event_speakersM.aggregate([
            { $match: query },
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
                                location: 1,
                                full_name: 1,
                                email_id: 1,
                                pro_batch: 1,
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
                                location: 1,
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
                    pipeline: buildSpeakersListInfoWorkPipeline(),
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
                    // requested_status: { $ifNull: ["$requested_status", 3] },
                    requested_status: 1,
                    date_n_time: 1,
                    user_name: "$user_data.user_name",
                    location: "$user_data.location",
                    full_name: "$user_data.full_name",
                    pro_batch: "$user_data.pro_batch",
                    email_id: "$user_data.email_id",
                    profile_image: "$user_data.profile_image",
                    position_name: "$info_work.position_name",
                    company_name: "$info_work.company_name",
                    info_company: "$info_company",
                    info_manual_company: "$info_manual_company"
                }
            }
        ])

        await setCache({
            key,
            value: get_query,
            ttl: 1800
        })

        return res.json({
            status: true,
            message: get_query,
            cache_response_status: false
        })

    } catch (err) {
        console.log('Speakers list error.', err.message)
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        })
    }
})


router.get('/delete_speaker/:speaker_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let errObj = {}

            const speaker_row_id = Number.parseInt(req.params.speaker_row_id)
            if (!Number.isNaN(speaker_row_id)) {
                const check_speaker = await event_speakersM.findOne({ _id: speaker_row_id })
                if (check_speaker) {
                    if (checkUserToken.message.user_type == 1) {
                        const user_row_id = checkUserToken.message.user_row_id
                        const check_event = await eventM.findOne({ _id: check_speaker.event_row_id, user_row_id: user_row_id })
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
                                event_row_id: check_speaker.event_row_id
                            })

                            if (!check_access.status) {
                                errObj['alert_message'] = check_access.message
                            }
                        }
                    }

                    if (!Object.keys(errObj).length) {
                        await event_speakersM.deleteOne({ _id: speaker_row_id })
                        await deleteKeysByPattern('event_speakers_list_*')
                        await deleteKeysByPattern('individual_event_*')
                        await deleteKeysByPattern('speakers_list*')
                        const eventData = await eventM.findOne(
                            { _id: check_speaker.event_row_id },
                            { event_url: 1, approval_status: 1, event_title: 1, start_date: 1, event_venue: 1, created_date_n_time: 1, event_type: 1 }
                        );
                        if (eventData?.approval_status === 1) {
                            const cardData = {
                                event_title: eventData.event_title,
                                start_date: eventData.start_date,
                                event_venue: (eventData?.event_type == 1 || eventData?.event_type == 3 || eventData?.event_type == 4 || eventData?.event_type == 5 || eventData?.event_type == 6 || eventData?.event_type == 7 || eventData?.event_type == 8) ? eventData.event_venue : "Virtual",
                                event_url: eventData.event_url,
                                event_row_id: check_speaker.event_row_id,
                            };

                            await agenda.now("generate event card", cardData);
                        }
                        await calculateEventScore(check_speaker.event_row_id, ['speakers'])

                        res.json({ status: true, message: { alert_message: 'Speaker deleted sucessfully.' } })

                    }
                    else {
                        res.json({ status: false, message: errObj })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Speaker row id.' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Speaker row id should be a valid number.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Delete speaker error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

//Contact details

router.post('/add_edit_contact_details', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required')
        .isInt().withMessage('The Event Row ID field must be a valid number .'),
    // check('contact_username')
    //  .optional()
    // .not().isEmpty().withMessage('The Contact User name field is required')
    // .isLength({ min: 3 }).withMessage('The Contact User name field must be at least 3 characters in length.'),
    check('contact_type')
        .not().isEmpty().withMessage('The Contact type field is required'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);

        if (checkUserToken.status) {
            let host_user_row_id = 0

            const contact_row_id = Number.parseInt(req.body?.contact_row_id || 0)
            const event_row_id = Number.parseInt(req.body?.event_row_id || 0)
            const contact_type = Number.parseInt(req.body?.contact_type || 0)
            const country_id = Number.parseInt(req.body?.country_id || 0)
            const email_id = req.body?.email_id ? req.body.email_id.toLowerCase() : ""
            const contact_number = req.body?.contact_number || ""


            if (checkUserToken.message.user_type == 1) {
                host_user_row_id = checkUserToken.message.user_row_id
                const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id, active_status: 1, approval_status: { $in: [0, 1] } })
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

            if (contact_row_id) {
                const check_contact = await event_contactsM.findOne({ _id: contact_row_id })
                if (!check_contact) {
                    errObj['contact_row_id'] = 'Invalid Contact Row ID..'
                }
            }

            if (req.body.contact_number.match(/[^0-9\-(\)\s]/)) {

                errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.';
            }

            const check_existing = await event_contactsM.findOne({ _id: { $ne: contact_row_id }, contact_type: contact_type, event_row_id: event_row_id, email_id: email_id, contact_number: contact_number, })
            if (check_existing) {
                errObj['contact_details'] = 'This contact details already exist.'
            }

            if (req.body.email_id) {
                const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

                if (!emailRegex.test(req.body.email_id)) {
                    errObj['email_id'] = 'The Email ID field must contain a valid email.';
                }
            }

            // }

            if (contact_type && contact_type == 16) {
                if (!req.body.contact_reason) {
                    errObj['contact_reason'] = 'Contact reason field is necessary.'
                }
            }

            if (req.body.contact_number) {
                if (country_id) {
                    if (Number.isNaN(country_id)) {
                        errObj['country_id'] = 'Country ID must be valid number.'
                    }
                    else {
                        const check_country = await countryM.findOne({ _id: country_id })
                        if (!check_country) {
                            errObj['country_id'] = 'Invalid country id.'
                        }
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const insert_array = {
                    event_row_id: event_row_id,
                    country_id: country_id,
                    // contact_username : sanitize(req.body.contact_username),
                    contact_number: contact_number,
                    email_id: email_id,
                    contact_type: contact_type,
                    contact_reason: sanitize(req.body.contact_reason)
                }
                if (contact_row_id) {
                    await event_contactsM.updateOne({ _id: contact_row_id }, { $set: insert_array })
                    await deleteKeysByPattern('contacts_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    res.json({ status: true, message: 'Contact details updated successfully.' })
                }
                else {
                    await await event_contactsM(insert_array).save()
                    await deleteKeysByPattern('contacts_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await calculateEventScore(event_row_id, ['contact_details'])

                    res.json({ status: true, message: 'Contact details added successfully.' })

                }
            }

        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Add speaker error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/contacts_list/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (!checkUserToken.status) {
            return res.json(checkUserToken)
        }

        const event_row_id = Number.parseInt(req.params.event_row_id)
        if (Number.isNaN(event_row_id)) {
            return res.json({ status: false, message: { alert_message: 'Event row id should be a valid number.' } })
        }

        let errObj = {}
        let user_row_id = 0

        if (checkUserToken.message.user_type == 1) {
            user_row_id = checkUserToken.message.user_row_id
            const check_event = await eventM.findOne({ _id: event_row_id, user_row_id })
            if (!check_event) {
                errObj['event_row_id'] = "Invalid Event Row ID."
            }
        }

        if (Object.keys(errObj).length) {
            return res.json({ status: false, message: errObj })
        }

        const key = `contacts_list_${event_row_id}`

        const cache_response = await getCache({ key })
        if (cache_response.status && Array.isArray(cache_response.message)) {
            return res.json({
                status: true,
                message: cache_response.message,
                cache_response_status: true
            })
        }

        const contacts_list = await event_contactsM.aggregate([
            { $match: { event_row_id } },
            {
                $lookup: {
                    from: "cln_static_event_contact_types",
                    localField: "contact_type",
                    foreignField: "_id",
                    as: "contact_type_info"
                }
            },
            { $unwind: { path: "$contact_type_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info"
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            { $set: { contact_type: { $ifNull: ["$contact_type", 9] } } },
            {
                $project: {
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

        await setCache({
            key,
            value: contacts_list,
            ttl: 1800 // 30 mins
        })

        return res.json({
            status: true,
            message: contacts_list,
            cache_response_status: false
        })

    } catch (err) {
        console.log('Contact details list error.', err.message)
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        })
    }
})

router.get('/delete_contact/:contact_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let errObj = {}
            const contact_row_id = Number.parseInt(req.params.contact_row_id)
            if (!Number.isNaN(contact_row_id)) {
                let check_contact_query = await event_contactsM.findOne({ _id: contact_row_id })
                if (check_contact_query) {
                    if (checkUserToken.message.user_type == 1) {
                        const user_row_id = checkUserToken.message.user_row_id
                        const check_event = await eventM.findOne({ _id: check_contact_query.event_row_id, user_row_id: user_row_id })
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
                                event_row_id: check_contact_query.event_row_id
                            })

                            if (!check_access.status) {
                                errObj['alert_message'] = check_access.message
                            }
                        }
                    }

                    if (!Object.keys(errObj).length) {
                        await event_contactsM.deleteOne({ _id: contact_row_id })
                        await deleteKeysByPattern('contacts_list_*')
                        await deleteKeysByPattern('individual_event_*')

                        await calculateEventScore(check_contact_query.event_row_id, ['contact_details'])

                        res.json({ status: true, message: { alert_message: 'Contact details deleted sucessfully.' } })

                    }
                    else {
                        res.json({ status: false, message: errObj })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Contact row id.' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Contact row id should be a valid number.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Delete contact details error.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/check_email_id', [
    check('email_id')
        .trim()
        .not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
], async (req, res) => {
    try {

        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const email_id = (sanitize(req.body.email_id)).toLowerCase()
                const user_query = await professionalsM.aggregate([
                    { $match: { email_id: email_id, login_status: 1 } },
                    // { $sort : {_id:-1} }, 
                    {
                        $lookup:
                        {
                            from: "cln_professionals_profile_images",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "userImage"
                        }
                    },
                    { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            full_name: 1,
                            user_name: 1,
                            email_id: 1,
                            profile_image: "$userImage.profile_image"
                        }
                    }
                ]).limit(1)


                if (user_query[0]) {

                    res.json({
                        status: true,
                        message: {
                            alert_message: "This Email ID is avaliable.",
                            _id: user_query[0]._id,
                            full_name: user_query[0].full_name,
                            user_name: user_query[0].user_name,
                            email_id: user_query[0].email_id,
                            profile_image: user_query[0].profile_image
                        }
                    })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid Email ID." } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Check email id.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/events_tags', async (req, res) => {
    try {
        const event_tags_query = event_tagsM.find({ active_status: true }, { _id: 1, event_tag: 1, active_status: 1 }).sort({ event_tag: 1 })

        const picks_query = event_default_imagesM.find({ image_type: 1 })
        const gradient_query = event_default_imagesM.find({ image_type: 2 })
        const color_query = event_default_imagesM.find({ image_type: 3 })

        let previous_event_query = ""
        let company_query = ""
        let user_query = ""

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message

            previous_event_query = eventM.aggregate([
                { $match: { user_row_id: user_row_id, $or: [{ contact_email_id: { $ne: "" }, contact_mobile_number: { $ne: "" } }] } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_event_contacts",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "contact_info"
                    }
                },
                { $unwind: { path: "$contact_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_static_countries",
                        localField: "contact_info.country_id",
                        foreignField: "_id",
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
                { $set: { contact_id: "contact_info._id" } },
                {
                    $project:
                    {
                        event_row_id: "$contact_info.event_row_id",
                        country_id: "$contact_info.country_id",
                        contact_number: "$contact_info.contact_number",
                        email_id: "$contact_info.email_id",
                        contact_type: "$contact_info.contact_type",
                        contact_reason: "$contact_info.contact_reason",
                        // contact_mobile_number:1,
                        // contact_email_id:1,
                        country_code: "$co_info.country_code"

                    }
                },
                { $sort: { contact_id: 1 } },
            ]).limit(1)



            company_query = companyM.aggregate([
                {
                    $match: { user_row_id: user_row_id, approval_status: 1, active_status: 1 }
                },
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
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        company_id: 1,
                        company_name: 1,
                        company_email_id: 1,
                        company_logo: { $cond: { if: "$company_logo", then: "$company_logo", else: "company.png" } },
                        main_business_model_id: 1,
                        country_name: "$co_info.country_name",
                        main_business_model_name: "$main_business_info.business_name"
                    }
                }
            ]).limit(1)


            //, email_verify_status:1, login_status:1
            user_query = professionalsM.aggregate([
                { $match: { _id: user_row_id } },
                {
                    $lookup:
                    {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "user_image"
                    }
                },
                { $unwind: { path: "$user_image", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: buildEventsTagsUserInfoWorkPipeline(),
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        full_name: 1,
                        pro_batch: 1,
                        user_name: 1,
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        country_name: "$co_info.country_name",
                        user_bio: "$user_bio",
                        profile_image: "$user_image.profile_image"
                    }
                }
            ]).limit(1)

        }

        const queries = [
            event_tags_query,
            picks_query,
            gradient_query,
            color_query,
            previous_event_query,
            company_query,
            user_query
        ].filter(query => query !== ""); // Filter out empty strings

        const results = await Promise.all(queries);

        // Extract results safely, providing default empty arrays
        const event_tags = results[queries.indexOf(event_tags_query)] || [];
        const default_images_picks = results[queries.indexOf(picks_query)] || [];
        const default_images_gradient = results[queries.indexOf(gradient_query)] || [];
        const default_images_color = results[queries.indexOf(color_query)] || [];
        const previous_event = results[queries.indexOf(previous_event_query)] || [];
        const company_data = results[queries.indexOf(company_query)] || [];
        const user_data = results[queries.indexOf(user_query)] || [];

        const result = Object.create(null)
        result.tags = event_tags
        result.previous_event = previous_event[0] ? previous_event[0] : ""
        result.default_images = {
            picks: default_images_picks,
            gradient: default_images_gradient,
            color: default_images_color
        }
        result.company_data = company_data[0] ? company_data[0] : ""
        result.user_data = user_data[0] ? user_data[0] : ""


        res.json({ status: true, message: result })
    }
    catch (err) {
        console.log('Event tags.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.post('/submit_event', [
    check('event_title')
        .not().isEmpty().withMessage('The Event Title field is required')
        .isLength({ min: 4 }).withMessage('The Event Title field must be at least 4 characters in length.'),
    check('event_tags')
        .not().isEmpty().withMessage('The Event Tags field is required'),
    check('event_type')
        .not().isEmpty().withMessage('The Event Type field is required'),
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
        .not().isEmpty().withMessage('The List Event Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The List Event Type field must be contain 1, 2 or 3.'),
    check('utc_row_id')
        .not().isEmpty().withMessage('The UTC Time field is required'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let user_row_id = 0
            let company_row_id = 0
            let event_row_id = Number.parseInt(req.body?.event_row_id || 0)
            let admin_manager_type = 0
            let admin_row_id = 0
            let active_status = 1
            let approval_status = 0
            let date_n_time = getPresentDateTime()
            let defaultKeywords = ""

            if (checkUserToken.message.user_type == 1) {
                admin_manager_type = 0
                user_row_id = checkUserToken.message.user_row_id
                const checkUserQuery = await professionalsM.findOne({ _id: user_row_id, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
                if (checkUserQuery) {
                    defaultKeywords = checkUserQuery.full_name
                }
                if (Number.parseInt(req.body.event_row_id)) {
                    const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id })
                    if (!check_event) {
                        errObj['event_row_id'] = "Invalid Event Row ID."
                    }
                    active_status = check_event.active_status
                    approval_status = check_event.approval_status
                }

                if (Number.parseInt(req.body.list_event_type) >= 2) {
                    const companyQuery = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 }, { _id: 1, company_name: 1 })
                    if (!companyQuery) {
                        errObj['list_event_type'] = "Sorry, Your not listed company or your company in pending approval."
                    }
                    else {
                        if (Number.parseInt(req.body.list_event_type) == 2) {
                            defaultKeywords = companyQuery.company_name
                        } else {
                            defaultKeywords += ", " + companyQuery.company_name

                        }

                        company_row_id = companyQuery['_id']
                    }
                }
            }
            else {
                const token_message = checkUserToken.token_message
                if (token_message.admin_row_id) {
                    admin_manager_type = token_message.admin_manager_type
                    admin_row_id = token_message.admin_row_id
                    if (Number.parseInt(req.body.event_row_id)) {
                        const check_access = await checkSubadminAccess({
                            admin_row_id: admin_row_id,
                            admin_manager_type: admin_manager_type,
                            sub_admin_type: Number.parseInt(token_message.sub_admin_type),
                            event_row_id: event_row_id
                        })

                        if (!check_access.status) {
                            errObj['alert_message'] = check_access.message
                        }
                    }


                    if (req.body.event_list_id) {
                        let event_list_id = sanitize(req.body.event_list_id)
                        if (Number.parseInt(req.body.list_event_type) == 1) {
                            const checkUserQuery = await professionalsM.findOne({ user_name: event_list_id, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
                            if (!checkUserQuery) {
                                errObj['event_list_id'] = 'Invalid Username'
                            }
                            else {
                                defaultKeywords = checkUserQuery.full_name
                                user_row_id = checkUserQuery._id
                            }
                        }
                        else if (Number.parseInt(req.body.list_event_type) == 2) {
                            const checkCompanyQuery = await companyM.findOne({ company_id: event_list_id, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1, company_name: 1 })
                            if (!checkCompanyQuery) {
                                errObj['event_list_id'] = 'Invalid Company ID'
                            }
                            else {
                                defaultKeywords = checkCompanyQuery.company_name

                                company_row_id = checkCompanyQuery._id
                                user_row_id = checkCompanyQuery.user_row_id ? checkCompanyQuery.user_row_id : 0
                            }

                        }
                        else if (Number.parseInt(req.body.list_event_type) == 3) {
                            const checkUserQuery = await professionalsM.findOne({ user_name: event_list_id, login_status: 1 }, { _id: 1, full_name: 1 })
                            if (checkUserQuery) {
                                user_row_id = checkUserQuery._id
                                defaultKeywords = checkUserQuery.full_name

                                const checkCompanyQuery2 = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1, company_name: 1 })
                                if (!checkCompanyQuery2) {
                                    errObj['event_list_id'] = 'Invalid Company ID'
                                }
                                else {
                                    defaultKeywords += ", " + checkCompanyQuery2.company_name
                                    company_row_id = checkCompanyQuery2._id
                                }
                            }
                            else {
                                errObj['event_list_id'] = 'Invalid Username'
                            }
                        }
                    }
                    else {
                        errObj['event_list_id'] = 'Event list ID field is required.'
                    }
                }
            }

            if (event_row_id) {
                const get_event_date = await eventM.findOne({ _id: event_row_id }, { created_date_n_time: 1, created_by_admin_status: 1, created_by_sub_admin_id: 1 })
                if (get_event_date) {
                    date_n_time = get_event_date.created_date_n_time
                    admin_manager_type = get_event_date.created_by_admin_status
                    admin_row_id = get_event_date.created_by_sub_admin_id
                }
            }
            let event_host_query = {}
            let get_invite_id = {}
            if (user_row_id) {
                get_invite_id = await professionalsM.findOne({ _id: user_row_id }, { user_name: 1 })
                event_host_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1 })
                if (!event_host_query) {
                    errObj['alert_message'] = "Please request admin to approve your user account."
                }
            }


            if (req.body.event_type) {
                const check_seminar_array = [1, 3, 4, 5, 6, 7, 8]
                if (check_seminar_array.includes(Number.parseInt(req.body.event_type))) {
                    if (!req.body.event_venue) {
                        errObj['event_venue'] = "The Event Venue field is required."
                    }
                }

                const check_webinar_array = [2, 3, 6, 7]
                if (check_webinar_array.includes(Number.parseInt(req.body.event_type))) {
                    if (req.body.webinar_meeting_type) {
                        if (!req.body.webinar_meeting_link) {
                            errObj['webinar_meeting_link'] = "The Meeting Link field is required."
                        }
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
                    const imageQuery = await event_default_imagesM.findOne({ _id: Number.parseInt(sanitize(req.body.event_image_type)) }, { image_name: 1 })
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
                let insertArr = {}
                insertArr['user_row_id'] = user_row_id
                insertArr['company_row_id'] = company_row_id
                insertArr['event_title'] = sanitize(req.body.event_title)
                insertArr['event_tags'] = await getIntIdFromArray(req.body.event_tags)
                insertArr['event_image_type'] = req.body.event_image_type ? Number.parseInt(req.body.event_image_type) : 0
                insertArr['event_type'] = Number.parseInt(req.body.event_type)
                insertArr['alt_image_text'] = sanitize(req.body.alt_image_text)

                insertArr['event_image'] = event_image
                insertArr['list_event_type'] = Number.parseInt(req.body.list_event_type)
                insertArr['event_venue'] = (req.body.event_venue) ? sanitize(req.body.event_venue) : ""
                insertArr['event_city'] = (req.body.event_city) ? sanitize(req.body.event_city) : ""
                insertArr['event_state'] = (req.body.event_state) ? sanitize(req.body.event_state) : ""
                insertArr['webinar_meeting_link'] = (req.body.webinar_meeting_link) ? sanitize(req.body.webinar_meeting_link) : ""
                insertArr['webinar_meeting_type'] = (req.body.webinar_meeting_type) ? sanitize(req.body.webinar_meeting_type) : 0
                insertArr['event_link'] = sanitize(req.body.event_link)
                insertArr['start_date'] = createDateTime(req.body.start_date)

                insertArr['end_date'] = createDateTime(req.body.end_date)
                insertArr['event_description'] = sanitize(req.body.event_description)
                insertArr['ticket_link'] = sanitize(req.body.ticket_link)

                insertArr['contact_country_row_id'] = req.body.contact_country_row_id ? Number.parseInt(req.body.contact_country_row_id) : 0


                insertArr['longitude'] = longitude
                insertArr['latitude'] = latitude

                insertArr['utc_row_id'] = Number.parseInt(req.body.utc_row_id)

                const eventTags = await event_tagsM.find(
                    { _id: { $in: insertArr.event_tags } },
                    { _id: 1, event_tag: 1 }
                );
                const eventTagNames = eventTags.map(t => t.event_tag).filter(Boolean);
                if (eventTagNames.length > 0) {
                    defaultKeywords += ", " + eventTagNames.join(", ");
                }

                if (event_row_id) {
                    // Get event data (non-SEO fields)
                    const eventData = await eventM.findOne(
                        { _id: event_row_id },
                        {
                            event_url: 1, approval_status: 1
                        }
                    );

                    // Get SEO data separately
                    const seoData = await event_seo_detailsM.findOne(
                        { event_row_id: event_row_id },
                        {
                            meta_keywords: 1,
                            meta_description: 1,
                            meta_title: 1,
                            robots_index: 1,
                            robots_follow: 1,
                            og_title: 1,
                            og_description: 1,
                            twitter_title: 1,
                            twitter_description: 1,
                            twitter_creator: 1
                        }
                    );

                    // Merge event data and SEO data
                    const combinedData = { ...eventData?.toObject(), ...seoData?.toObject() };
                    if (insertArr?.event_description) {

                        // Sanitize input before using it
                        if (!combinedData?.meta_description) {
                            const cleanedBio = removeHtmltag(insertArr?.event_description).slice(0, 160);

                            insertArr.meta_description = cleanedBio;
                            insertArr.og_description = cleanedBio;
                            insertArr.twitter_description = cleanedBio;
                        } else if (!combinedData.og_description) {
                            insertArr.og_description = combinedData?.meta_description;
                            insertArr.twitter_description = combinedData?.meta_description;
                        }
                    }

                    // Auto-fill title and keywords from full_name
                    if (insertArr.event_title) {
                        const title = insertArr.event_title;
                        if (!combinedData?.meta_title) {
                            insertArr.meta_title = title;
                            insertArr.og_title = title;
                            insertArr.twitter_title = title;
                        } else if (!combinedData.og_title) {
                            insertArr.og_title = combinedData?.meta_title;
                            insertArr.twitter_title = combinedData?.meta_title;
                        }

                        if (!combinedData?.meta_keywords) {
                            insertArr.meta_keywords = defaultKeywords
                        }
                    }

                    // Separate SEO fields from event fields
                    const seoFields = {
                        meta_keywords: insertArr.meta_keywords,
                        meta_description: insertArr.meta_description,
                        meta_title: insertArr.meta_title,
                        robots_index: insertArr.robots_index,
                        robots_follow: insertArr.robots_follow,
                        og_title: insertArr.og_title,
                        og_description: insertArr.og_description,
                        twitter_title: insertArr.twitter_title,
                        twitter_description: insertArr.twitter_description,
                        twitter_creator: insertArr.twitter_creator,
                        header_structure: insertArr.header_structure
                    };

                    // Remove SEO fields from insertArr (event update)
                    const eventUpdateData = { ...insertArr };
                    delete eventUpdateData.meta_keywords;
                    delete eventUpdateData.meta_description;
                    delete eventUpdateData.meta_title;
                    delete eventUpdateData.robots_index;
                    delete eventUpdateData.robots_follow;
                    delete eventUpdateData.og_title;
                    delete eventUpdateData.og_description;
                    delete eventUpdateData.twitter_title;
                    delete eventUpdateData.twitter_description;
                    delete eventUpdateData.twitter_creator;
                    delete eventUpdateData.header_structure;
                    delete eventUpdateData.created_date_n_time;


                    // Update events table (non-SEO fields)
                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    Object.assign(eventUpdateData, updateFields, { updated_date_n_time: new Date() })
                    await eventM.updateOne({ _id: event_row_id }, { $set: eventUpdateData });

                    // Update SEO details table (only SEO fields)
                    await event_seo_detailsM.updateOne(
                        { event_row_id: event_row_id },
                        { $set: seoFields },
                        { upsert: true }
                    );
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('speakers_list*')
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')

                    const hasChanged = (oldVal, newVal) =>
                        (newVal ?? "").trim() !== "" &&
                        (oldVal ?? "").trim() !== (newVal ?? "").trim();

                    const changed =
                        hasChanged(combinedData?.meta_title, insertArr.meta_title) ||
                        hasChanged(combinedData?.meta_description, insertArr.meta_description) ||
                        hasChanged(combinedData?.meta_keywords, insertArr.meta_keywords) ||

                        hasChanged(combinedData?.og_title, insertArr.og_title) ||
                        hasChanged(combinedData?.og_description, insertArr.og_description) ||

                        hasChanged(combinedData?.twitter_title, insertArr.twitter_title) ||
                        hasChanged(combinedData?.twitter_description, insertArr.twitter_description);
                    if (changed) {
                        await seo_change_logsM.create({
                            module_key: "event",
                            module_id: event_row_id,

                            // ---------- META ----------
                            old_meta_title: combinedData?.meta_title || "",
                            new_meta_title: hasChanged(
                                combinedData?.meta_title,
                                insertArr.meta_title
                            ) ? insertArr.meta_title : "",

                            old_meta_description: combinedData?.meta_description || "",
                            new_meta_description: hasChanged(
                                combinedData?.meta_description,
                                insertArr.meta_description
                            ) ? insertArr.meta_description : "",

                            old_meta_keywords: combinedData?.meta_keywords || "",
                            new_meta_keywords: hasChanged(
                                combinedData?.meta_keywords,
                                insertArr.meta_keywords
                            ) ? insertArr.meta_keywords : "",

                            // ---------- OG ----------
                            old_og_title: combinedData?.og_title || "",
                            new_og_title: hasChanged(
                                combinedData?.og_title,
                                insertArr.og_title
                            ) ? insertArr.og_title : "",

                            old_og_description: combinedData?.og_description || "",
                            new_og_description: hasChanged(
                                combinedData?.og_description,
                                insertArr.og_description
                            ) ? insertArr.og_description : "",

                            // ---------- TWITTER ----------
                            old_twitter_title: combinedData?.twitter_title || "",
                            new_twitter_title: hasChanged(
                                combinedData?.twitter_title,
                                insertArr.twitter_title
                            ) ? insertArr.twitter_title : "",

                            old_twitter_description: combinedData?.twitter_description || "",
                            new_twitter_description: hasChanged(
                                combinedData?.twitter_description,
                                insertArr.twitter_description
                            ) ? insertArr.twitter_description : "",

                            // ---------- AUDIT ----------
                            user_type:
                                checkUserToken.message.user_type === 1 ? "user" : "admin",

                            updated_by:
                                checkUserToken.message.user_type === 1
                                    ? user_row_id
                                    : (checkUserToken.message.user_row_id ?? 0)
                        });
                    }


                    if (combinedData?.approval_status === 1) {
                        const cardData = {
                            event_title: insertArr.event_title,
                            start_date: insertArr.start_date,
                            event_venue: (insertArr?.event_type == 1 || insertArr?.event_type == 3 || insertArr?.event_type == 4 || insertArr?.event_type == 5 || insertArr?.event_type == 6 || insertArr?.event_type == 7 || insertArr?.event_type == 8) ? insertArr.event_venue : "Virtual",
                            event_url: combinedData.event_url,
                            event_row_id,
                        };

                        await agenda.now("generate event card", cardData);
                    }
                    await calculateEventScore(event_row_id, ['build_event_page'])
                    await deleteKeysByPattern('backend_event_tags_list*')
                    res.json({ status: true, message: { alert_message: 'Event updated successfully.', event_row_id: event_row_id } })
                }
                else {
                    insertArr['active_status'] = active_status
                    insertArr['approval_status'] = approval_status
                    insertArr['created_by_admin_status'] = admin_manager_type
                    insertArr['created_by_sub_admin_id'] = admin_row_id
                    insertArr['created_date_n_time'] = date_n_time

                    // Initialize SEO fields object
                    let seoFields = {};

                    if (insertArr?.event_description) {
                        // Sanitize input before using it
                        const cleanedBio = removeHtmltag(insertArr?.event_description).slice(0, 160);

                        seoFields.meta_description = cleanedBio;
                        seoFields.og_description = cleanedBio;
                        seoFields.twitter_description = cleanedBio;
                    }

                    // Auto-fill title and keywords from full_name
                    if (insertArr.event_title) {
                        const title = insertArr.event_title;
                        seoFields.meta_title = title;
                        seoFields.og_title = title;
                        seoFields.twitter_title = title;
                    }
                    if (defaultKeywords) {
                        seoFields.meta_keywords = defaultKeywords;
                    }

                    // Remove SEO fields from insertArr before saving to events collection
                    const eventInsertData = { ...insertArr };
                    delete eventInsertData.meta_description;
                    delete eventInsertData.og_description;
                    delete eventInsertData.twitter_description;
                    delete eventInsertData.meta_title;
                    delete eventInsertData.og_title;
                    delete eventInsertData.twitter_title;
                    delete eventInsertData.meta_keywords;

                    const dataSave = await eventM(eventInsertData).save();

                    //  SEO fields to separate collection
                    if (Object.keys(seoFields).length > 0) {
                        await event_seo_detailsM.updateOne(
                            { event_row_id: dataSave._id },
                            { $set: seoFields },
                            { upsert: true }
                        );
                    }

                    const hasChanged = (newVal) =>
                        (newVal ?? "").trim() !== ""

                    const changed =
                        hasChanged(insertArr.meta_title) ||
                        hasChanged(insertArr.meta_description) ||
                        hasChanged(insertArr.meta_keywords) ||

                        hasChanged(insertArr.og_title) ||
                        hasChanged(insertArr.og_description) ||

                        hasChanged(insertArr.twitter_title) ||
                        hasChanged(insertArr.twitter_description);
                    if (changed) {
                        await seo_change_logsM.create({
                            module_key: "event",
                            module_id: Number.parseInt(dataSave._id),

                            // ---------- META ----------
                            old_meta_title: "",
                            new_meta_title: hasChanged(
                                insertArr.meta_title
                            ) ? insertArr.meta_title : "",

                            old_meta_description: "",
                            new_meta_description: hasChanged(
                                insertArr.meta_description
                            ) ? insertArr.meta_description : "",

                            old_meta_keywords: "",
                            new_meta_keywords: hasChanged(
                                insertArr.meta_keywords
                            ) ? insertArr.meta_keywords : "",

                            // ---------- OG ----------
                            old_og_title: "",
                            new_og_title: hasChanged(
                                insertArr.og_title
                            ) ? insertArr.og_title : "",

                            old_og_description: "",
                            new_og_description: hasChanged(
                                insertArr.og_description
                            ) ? insertArr.og_description : "",

                            // ---------- TWITTER ----------
                            old_twitter_title: "",
                            new_twitter_title: hasChanged(
                                insertArr.twitter_title
                            ) ? insertArr.twitter_title : "",

                            old_twitter_description: "",
                            new_twitter_description: hasChanged(
                                insertArr.twitter_description
                            ) ? insertArr.twitter_description : "",

                            // ---------- AUDIT ----------
                            user_type:
                                checkUserToken.message.user_type === 1 ? "user" : "admin",

                            updated_by:
                                checkUserToken.message.user_type === 1
                                    ? user_row_id
                                    : (checkUserToken.message.user_row_id ?? 0)
                        });
                    }
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('speakers_list*')
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('backend_event_tags_list*')
                    event_row_id = Number.parseInt(dataSave._id)
                    if (user_row_id) {
                        if (admin_row_id) {
                            await updateNotification({
                                user_row_id: user_row_id,
                                notify_type: 3,
                                notify_type_row_id: event_row_id,
                                message_row_id: 65,
                                action_row_id: event_row_id
                            })
                        }
                        else {
                            await updateThreadNotification({
                                user_row_id: -1,
                                notify_type: 1,
                                notify_type_row_id: user_row_id,
                                message_row_id: 51,
                                action_row_id: event_row_id
                            })
                        }
                    }

                    if (admin_manager_type == 0 && admin_row_id == 0) {
                        const get_utc_time = await event_utc_datesM.findOne({ _id: dataSave.utc_row_id }, { utc_time: 1 })
                        let start_date_formatted = DateFormatter(dataSave.start_date)

                        let eventTitle = dataSave.event_title

                        const email_data = {
                            event_title: dataSave.event_title,
                            start_date: start_date_formatted,
                            event_venue: dataSave.event_venue,
                            event_link: dataSave.event_link,
                            name: event_host_query.full_name,
                            utc_time: get_utc_time.utc_time,
                            invite_id: get_invite_id.user_name
                        }

                        if (req.body.list_event_type === 1 || req.body.list_event_type === 3) {
                            email_data.host_name = event_host_query.full_name
                        }
                        else if (req.body.list_event_type === 2) {
                            const company_query = await companyM.findOne({ user_row_id: user_row_id }, { company_name: 1 })
                            email_data.host_name = company_query.company_name
                        }

                        const sub_admin_data = await sub_admin_emailsM.find({ type: { $in: [1, 3] } }, { full_name: 1, email_id: 1 })
                        await sub_admin_email(sub_admin_data, email_data)

                        //email code starts here
                        // const host_image_query = await professionals_profile_imagesM.findOne({user_row_id:user_row_id}, {_id:1, profile_image:1})
                        // const invite_req_url = "https://events.coinpedia.org/"+generateUrl
                        // const host_profile_image = host_image_query ? host_image_query.profile_image:"default.png"

                        let pass_subject = "Congratulations on successfully creating the event! " + eventTitle
                        let message_to_pass = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${event_host_query.full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">We hope this message finds you well. Thank You for listing your event on Coinpedia.! </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Your Event <b>${eventTitle}</b>  is currently under approval from the administrative team and will be approved within the next 24 hours, you will receive a confirmation email from our coinpedia administrator. </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">You can modify event details, include speakers, and manage tickets through your <a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Coinpedia account.</a></p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">All the best and we're at your side</p>`

                        await sendEventsEmail(event_host_query.email_id, pass_subject, message_to_pass)
                        //email code ends here   
                    }

                    await calculateEventScore(event_row_id, ['build_event_page'])

                    res.json({ status: true, message: { alert_message: 'New event created successfully.', event_row_id: event_row_id } })

                }

            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Submit event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

const sub_admin_email = async (subadmin_data, email_data) => {

    for (const subadmin of subadmin_data) {
        let pass_subject = " Event Approval Request "
        let message_to_pass = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear  ${subadmin.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">A new event has been created by <span style="text-transform: capitalize;font-weight: 500;">${email_data.name}</span> on your platform, and we kindly request your review and approval for this event.Upon approval, the user can engage in various activities such as inviting speakers, managing attendees, and increasing their audience’s registration.</p>
            <p style="color:#000;font-weight: 400;font-size:17px; text-decoration:underline"><b>Event Details</b> </p> 
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Event Name : </b>${email_data.event_title}</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Host / Event Organizer / Company name : </b> <span style="text-transform: capitalize;">${email_data.host_name}</span> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"> <b>Event / Website Link : </b><span style="color:#0029ff;">${email_data.event_link}</span> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"> <b>Event Date : </b>${email_data.start_date}  ${email_data.utc_time ? `(UTC${email_data.utc_time})` : ""}</p>
            ${email_data.event_venue ? `<p style="color:#000;font-weight: 400;font-size:17px;"><b>Event Location : </b>${email_data.event_venue}</p>` : ""}
            
            `
        await sendEmail(subadmin.email_id, pass_subject, message_to_pass)

    }

}

const add_contacts = async (event_row_id, contact_details) => {
    // const get_query = []
    for (let key in contact_details) {

        if (contact_details[key]) {
            let email_id = contact_details[key].email_id ? (contact_details[key].email_id).toLowerCase() : contact_details[key].email_id

            const check_query = await event_contactsM.findOne({
                event_row_id: event_row_id,
                email_id: sanitize(email_id),
                contact_number: sanitize(contact_details[key].contact_number),
                country_id: sanitize(contact_details[key].country_id),
                contact_type: sanitize(contact_details[key].contact_type)
            })
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
            }
            else if (check_query.contact_type == 16) {
                await event_contactsM.updateOne({ _id: check_query._id }, { $set: { contact_reason: contact_details[key].contact_reason } })
            }
        }
    }
}

const update_contact_details = async (event_row_id, contact_details) => {
    let valid_contact_details = []

    let contact_array = []
    if (contact_details.length > 0) {
        for (let key in contact_details) {
            if (contact_details[key]) {
                let email_id = contact_details[key].email_id ? (contact_details[key].email_id).toLowerCase() : contact_details[key].email_id
                const check_query = await event_contactsM.findOne({ event_row_id: sanitize(event_row_id), email_id: sanitize(email_id), contact_number: sanitize(contact_details[key].contact_number), country_id: sanitize(contact_details[key].country_id), contact_type: sanitize(contact_details[key].contact_type) })

                if (!check_query) {
                    const insertArray = {
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
        await event_contactsM.deleteMany({ event_row_id: event_row_id })
    }

    return contact_array
}


const add_event_speakers = async (event_row_id, speakers_data) => {
    let valid_speakers = []
    for (let key in speakers_data) {
        if (speakers_data[key]) {
            const check_query = await event_speakersM.findOne({ event_row_id: event_row_id, user_row_id: speakers_data[key].user_row_id, user_type: speakers_data[key].user_type }, { _id: 1 })
            if (!check_query) {
                const insertArray = {
                    event_row_id: event_row_id,
                    user_row_id: speakers_data[key].user_row_id,
                    user_type: speakers_data[key].user_type
                }

                await event_speakersM(insertArray).save()
                const new_value = await Promise.resolve(speakers_data[key])
                valid_speakers.push(new_value)
            }
        }
    }
    return valid_speakers
}



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
    check('list_event_type')
        .not().isEmpty().withMessage('The List Event Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The List Event Type field must be contain 1, 2 or 3.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let user_row_id = checkUserToken.message
            const get_invite_id = await professionalsM.findOne({ _id: user_row_id }, { user_name: 1 })
            const event_row_id = Number.parseInt(req.body.event_row_id)

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
                        }

                        if (!speakers_data[key].user_type) {
                            errObj['speakers'] = 'User type field is required'
                        }

                        if (speakers_data[key].user_row_id && speakers_data[key].user_type) {
                            if (speakers_data[key].user_type == 1) {
                                const userActiveStatus = await professionalsM.findOne({ _id: sanitize(speakers_data[key].user_row_id), login_status: 1 }, { _id: 1 })
                                if (!userActiveStatus) {
                                    errObj['speakers'] = 'Invalid speakers row id'
                                }
                            }
                            else if (speakers_data[key].user_type == 2) {
                                const userActiveStatus = await professionals_manual_retrievalsM.findOne({ _id: sanitize(speakers_data[key].user_row_id) })
                                if (!userActiveStatus) {
                                    errObj['speakers'] = 'Invalid speakers row id'
                                }
                            }
                            else {
                                errObj['speakers'] = 'Invalid Speaker User type.'
                            }
                        }
                    }

                }
            }


            // list_event_type 1:user, 2:company, 3:both
            let company_row_id = ""
            if (Number.parseInt(req.body.list_event_type) >= 2) {
                const companyQuery = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 })
                if (!companyQuery) {
                    errObj['list_event_type'] = "Sorry, Your not listed company or your company in pending approval."
                }
                else {
                    company_row_id = companyQuery['_id']
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
                    if (req.body.webinar_meeting_type) {
                        if (!req.body.webinar_meeting_link) {
                            errObj['webinar_meeting_link'] = "The Meeting Link field is required."
                        }
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
                const checkEvent = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id }, { _id: 1, event_image: 1, event_image_type: 1 })
                if (checkEvent) {
                    let ticket_status = 0
                    if (req.body.ticket_status) {
                        const check_ticket_status_array = [0, 1]
                        if (check_ticket_status_array.includes(Number.parseInt(req.body.ticket_status))) {
                            ticket_status = Number.parseInt(req.body.ticket_status)
                            const ticket_check_query = await ticketM.findOne({ event_row_id: event_row_id }, { _id: 1 })
                            if (ticket_check_query) {
                                ticket_status = 2
                            }
                        }
                    }



                    const updateArr = {}
                    updateArr['ticket_status'] = ticket_status
                    updateArr['event_title'] = req.body.event_title
                    updateArr['webinar_meeting_type'] = (req.body.webinar_meeting_type) ? req.body.webinar_meeting_type : 0
                    updateArr['webinar_meeting_link'] = req.body.webinar_meeting_link
                    updateArr['company_row_id'] = company_row_id
                    updateArr['list_event_type'] = req.body.list_event_type
                    updateArr['event_tags'] = await getIntIdFromArray(req.body.event_tags)
                    updateArr['event_image_type'] = req.body.event_image_type ? Number.parseInt(req.body.event_image_type) : 0
                    updateArr['event_type'] = req.body.event_type
                    updateArr['event_venue'] = (req.body.event_venue) ? req.body.event_venue : ""
                    updateArr['event_city'] = (req.body.event_city) ? req.body.event_city : ""
                    updateArr['event_state'] = (req.body.event_state) ? req.body.event_state : ""
                    updateArr['event_link'] = req.body.event_link
                    updateArr['start_date'] = createDateTime(req.body.start_date)
                    updateArr['end_date'] = createDateTime(req.body.end_date)
                    updateArr['event_description'] = req.body.event_description
                    updateArr['contact_country_row_id'] = (req.body.contact_country_row_id) ? req.body.contact_country_row_id : ""
                    updateArr['contact_mobile_number'] = (req.body.contact_mobile_number) ? req.body.contact_mobile_number : ""
                    updateArr['contact_email_id'] = (req.body.contact_email_id) ? req.body.contact_email_id : ""
                    updateArr['longitude'] = longitude
                    updateArr['latitude'] = latitude
                    updateArr['utc_row_id'] = req.body.utc_row_id

                    if (event_image) {
                        updateArr['event_image'] = event_image
                    }

                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    Object.assign(updateArr, updateFields, { updated_date_n_time: new Date() })

                    await eventM.updateOne({ _id: event_row_id, user_row_id: user_row_id }, { $set: updateArr })
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('backend_event_tags_list*')
                    const event_query = await eventM.aggregate([
                        {
                            $match: { _id: event_row_id, user_row_id: user_row_id }
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
                                start_date: 1,
                                event_url: 1,
                                approval_status: 1,
                                full_name: "$user_info.full_name",
                                utc_time: "$utc_dates.utc_time",
                            }
                        }
                    ])
                    let start_date_formatted = DateFormatter(event_query[0].start_date)
                    const speaker_email_data = {
                        event_title: event_query[0].event_title,
                        start_date: start_date_formatted,
                        event_url: event_query[0].event_url,
                        approval_status: event_query[0].approval_status,
                        host_name: event_query[0].full_name,
                        utc_time: event_query[0].utc_time,
                        invite_id: get_invite_id.user_name
                    }
                    let result = []
                    if (speakers_data) {
                        result = await update_event_speakers(event_row_id, speakers_data, speaker_email_data)
                    }

                    if (req.body.contact_details) {
                        await update_contact_details(event_row_id, req.body.contact_details)
                    }


                    res.json({ status: true, message: { alert_message: 'Your event details updated successfully' }, not_inserted_users: result })

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid request row Id' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Edit event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const result = await getManageEventsList(req, skip, limit, user_row_id);

            if (result.account_status === 0) {
                return res.json(result);
            }

            return res.json({
                status: result.status,
                message: result.message,
                countQueryRun: result.countQueryRun,
                cache_reponse_status: result.cache_reponse_status
            });
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Created events list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/enable_event/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const query = await eventM.findOne({ _id: request_row_id, user_row_id: user_row_id, active_status: 0 })
                if (query) {
                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    await eventM.updateOne({ _id: request_row_id, user_row_id: user_row_id }, { $set: { active_status: 1, ...updateFields, updated_date_n_time: new Date() } })
                    await deleteKeysByPattern('manage_events_list_*')
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    res.json({ status: true, message: { alert_message: 'This event details enabled successfully.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Enable event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_event/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const query = await eventM.findOne({ _id: request_row_id, user_row_id: user_row_id, active_status: 1 })
                if (query) {
                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    await eventM.updateOne({ _id: request_row_id, user_row_id: user_row_id }, { $set: { active_status: 0, ...updateFields, updated_date_n_time: new Date() } })
                    await deleteKeysByPattern('manage_events_list_*')
                    res.json({ status: true, message: { alert_message: 'This event details disabled successfully.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Disable event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/delete_event/:request_row_id', [
    check('deleted_reason')
        .not().isEmpty().withMessage('The Delete Reason field is required')
        .isLength({ min: 4 }).withMessage('The Delete Reason field must be at least 4 characters in length.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                const user_row_id = Number.parseInt(checkUserToken.message)
                const request_row_id = Number.parseInt(req.params.request_row_id)
                if (!Number.isNaN(request_row_id)) {
                    const query = await eventM.findOne({ _id: request_row_id, user_row_id: user_row_id, active_status: 1 })
                    if (query) {
                        await deleteEvent({ event_row_id: request_row_id, deleted_reason: req.body.deleted_reason })
                        await deleteKeysByPattern('manage_events_list_*')
                        res.json({ status: true, message: { alert_message: 'This event details deleted successfully.' } })
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
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Delete event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/check_username/:username', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const username = req.params.username
            const checkSpeakerQuery = await professionalsM.findOne({ user_name: username, login_status: 1 }, { _id: 1 })
            if (checkSpeakerQuery) {
                res.json({ status: true, message: { alert_message: "This username is available." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid username." } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Check username.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/view_event/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)

            // Validate request_row_id
            if (Number.isNaN(request_row_id)) {
                return res.json({ status: false, message: { alert_message: 'Invalid event ID' } })
            }

            // Call the optimized getViewDetails function
            const eventDetails = await getViewDetails(request_row_id, user_row_id)
            res.json(eventDetails)
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('View event.', err.message)
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

        result_array['total_guests'] = await event_attendeesM.countDocuments({ event_row_id: event_row_id })

        result_array['total_tickets'] = await ticketM.countDocuments({ event_row_id: event_row_id })

        result_array['total_watchlists'] = await event_watchlistsM.countDocuments({ event_row_id: event_row_id })

        let other_event_status = false
        const event_status_query = await eventM.findOne({ _id: { $ne: event_row_id }, user_row_id: user_row_id }, { _id: 1 })
        if (event_status_query) {
            other_event_status = true
        }

        result_array['other_event_status'] = other_event_status

        return result_array
    }
    return false
}



router.get('/unique_tags', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)
            const check_query = await eventM.find({ user_row_id: user_row_id }, { event_tags: 1 }).distinct("event_tags")
            if (check_query) {
                let myArr = []
                for (let i of check_query) {
                    const checkActive = await event_tagsM.findOne({ _id: i, active_status: true }, { event_tag: 1, _id: 0 })
                    if (checkActive) {
                        let innerObj = {}

                        innerObj["event_tag_row_id"] = i
                        innerObj["main_business_name"] = checkActive.event_tag
                        innerObj["count"] = await eventM.countDocuments({ user_row_id: user_row_id, event_tags: i })
                        myArr.push(innerObj)
                    }
                }

                myArr.sort(function (a, b) {
                    return b.count - a.count
                })

                res.json({ status: true, message: myArr })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Unique tags.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }


})


router.get('/users_registered_list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let errObj = {}
            let user_row_id = 0

            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (!req.query.user_row_id) {
                errObj['user_row_id'] = 'The User row id field is required'
            }
            else if (Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                errObj['user_row_id'] = 'The user row id field must be contain valid number'
            }
            else {
                const check_user = await professionalsM.findOne({ _id: Number.parseInt(req.query.user_row_id), login_status: 1 })
                if (!check_user) {
                    errObj['user_row_id'] = 'The user row id field is invalid.'
                }
                else {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const result = await getRegisteredUsers({ req, user_row_id })
                return res.json(result)
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Users registerd list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})
router.post('/update_seo', [
    check('module_id').not().isEmpty().withMessage('The Event Row ID field is required.'),
    check('meta_title').not().isEmpty().withMessage('The Meta Title field is required.'),
    check('meta_description').not().isEmpty().withMessage('The Meta Description field is required.'),
    check('meta_keywords').not().isEmpty().withMessage('The Meta Keywords field is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);
        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status) return res.json(checkUserToken);

        let {
            module_id,
            meta_title,
            meta_description,
            meta_keywords,
            robots_index,
            robots_follow,
            twitter_creator,

            og_title,
            og_description,
            twitter_title,
            twitter_description,

            updated_at
        } = req.body;

        let condition = { _id: module_id };
        if (checkUserToken.message.user_type == 1) {
            condition.user_row_id = checkUserToken.message.user_row_id;
        }

        const eventData = await eventM.findOne(condition);
        if (!eventData) {
            return res.json({ status: false, message: { alert_message: 'Invalid Event Row ID.' } });
        }

        // Get existing SEO data from the separated collection
        const seoData = await event_seo_detailsM.findOne({ event_row_id: module_id });

        // CHANGE LOG CHECK - Compare with SEO data from the separated collection
        const seoChanged =
            req.body.meta_title !== (seoData?.meta_title || '') ||
            req.body.meta_description !== (seoData?.meta_description || '') ||
            req.body.meta_keywords !== (seoData?.meta_keywords || '') ||
            req.body.og_title !== (seoData?.og_title || '') ||
            req.body.og_description !== (seoData?.og_description || '') ||
            req.body.twitter_title !== (seoData?.twitter_title || '') ||
            req.body.twitter_description !== (seoData?.twitter_description || '') ||
            req.body.robots_index !== (seoData?.robots_index || 'index') ||
            req.body.robots_follow !== (seoData?.robots_follow || 'follow') ||
            req.body.twitter_creator !== (seoData?.twitter_creator || '');

        if (seoChanged) {
            await seo_change_logsM.create({
                module_key: "event",
                module_id: module_id,

                old_meta_title: seoData?.meta_title || "",
                new_meta_title: req.body.meta_title === (seoData?.meta_title || '') ? "" : req.body.meta_title,

                old_meta_description: seoData?.meta_description || "",
                new_meta_description: req.body.meta_description === (seoData?.meta_description || '') ? "" : req.body.meta_description,

                old_meta_keywords: seoData?.meta_keywords || "",
                new_meta_keywords: req.body.meta_keywords === (seoData?.meta_keywords || '') ? "" : req.body.meta_keywords,

                old_og_title: seoData?.og_title || "",
                new_og_title: req.body.og_title === (seoData?.og_title || '') ? "" : req.body.og_title,

                old_og_description: seoData?.og_description || "",
                new_og_description: req.body.og_description === (seoData?.og_description || '') ? "" : req.body.og_description,

                old_twitter_title: seoData?.twitter_title || "",
                new_twitter_title: req.body.twitter_title === (seoData?.twitter_title || '') ? "" : req.body.twitter_title,

                old_twitter_description: seoData?.twitter_description || "",
                new_twitter_description: req.body.twitter_description === (seoData?.twitter_description || '') ? "" : req.body.twitter_description,

                old_robots_index: seoData?.robots_index || "index",
                new_robots_index: req.body.robots_index === (seoData?.robots_index || 'index') ? "" : req.body.robots_index,

                old_robots_follow: seoData?.robots_follow || "follow",
                new_robots_follow: req.body.robots_follow === (seoData?.robots_follow || 'follow') ? "" : req.body.robots_follow,

                old_twitter_creator: seoData?.twitter_creator || "",
                new_twitter_creator: req.body.twitter_creator === (seoData?.twitter_creator || '') ? "" : req.body.twitter_creator,

                user_type: checkUserToken.message.user_type == 1 ? 'user' : 'admin',
                updated_by: checkUserToken.message.user_type == 1
                    ? checkUserToken.message.user_row_id
                    : (checkUserToken.message.user_row_id ?? 0)
            });
        }

        let updateData = {
            meta_title,
            meta_description,
            meta_keywords,
            robots_index: robots_index || 'index',
            robots_follow: robots_follow || 'follow',
            twitter_creator: twitter_creator || '',
            og_title: og_title || '',
            og_description: og_description || '',
            twitter_title: twitter_title || '',
            twitter_description: twitter_description || ''
        };

        if (updated_at) updateData.updated_at = updated_at;

        // Update SEO details in the separated collection
        await event_seo_detailsM.updateOne(
            { event_row_id: module_id },
            { $set: updateData },
            { upsert: true }
        );
        await calculateEventScore(module_id, ['build_event_page']);
        await deleteKeysByPattern('all_events_*')
        await deleteKeysByPattern('individual_event_*')

        return res.json({
            status: true,
            message: { alert_message: 'Your SEO meta details updated successfully' }
        });

    } catch (err) {
        console.log('Update event seo error:', err.message);
        return res.json({
            status: false,
            message: { alert_message: 'An unexpected error occurred. Please try again later.' }
        });
    }
});



router.get('/get_event_seo/:event_row_id', async (req, res) => {
    try {
        const event_row_id = req.params.event_row_id;
        if (!event_row_id) {
            return res.json({
                status: false,
                message: { alert_message: "The Event Row ID field is required." }
            });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status) {
            return res.json(checkUserToken);
        }

        // ownership restriction for normal user
        let condition = { _id: Number(event_row_id) };
        if (checkUserToken.message.user_type == 1) {
            condition.user_row_id = checkUserToken.message.user_row_id;
        }

        const eventData = await eventM.aggregate([
            { $match: condition },

            // USER lookup
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $project: { _id: 1, full_name: 1, user_name: 1, profile_image: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "created_by_sub_admin_id",
                    foreignField: "_id",
                    as: "sub_admin_info",
                    pipeline: [
                        { $project: { _id: 1, full_name: 1, email_id: 1 } }
                    ]
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
                    from: "cln_static_countries",
                    localField: "contact_country_row_id",
                    foreignField: "_id",
                    as: "country_info"
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                }
            },

            // FAQ lookup
            {
                $lookup: {
                    from: "cln_events_faq_lists",
                    localField: "_id",
                    foreignField: "event_row_id",
                    as: "faq",
                    pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }]
                }
            },
            // SEO details lookup
            {
                $lookup: {
                    from: "cln_events_seo_details",
                    localField: "_id",
                    foreignField: "event_row_id",
                    as: "seo_info"
                }
            },
            { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    url: "$event_url",
                    tags: "$event_tags",
                    type: "$event_type",
                    start_date: 1,
                    end_date: 1,
                    utc_time: "$utc_dates.utc_time",
                    event_type: 1,
                    event_venue: 1,
                    sortname: "$country_info.sortname",
                    webinar_meeting_link: 1,
                    event_card_image: 1,
                    event_link: 1,
                    user_full_name: "$user_info.full_name",
                    user_username: "$user_info.user_name",
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    list_event_type: 1,

                    price: "$event_price",
                    title: "$event_title",
                    description: "$event_description",
                    image: "$event_image",
                    meta_title: { $ifNull: ["$seo_info.meta_title", ""] },
                    meta_description: { $ifNull: ["$seo_info.meta_description", ""] },
                    meta_keywords: { $ifNull: ["$seo_info.meta_keywords", ""] },
                    robots_index: { $ifNull: ["$seo_info.robots_index", "index"] },
                    robots_follow: { $ifNull: ["$seo_info.robots_follow", "follow"] },
                    og_title: { $ifNull: ["$seo_info.og_title", ""] },
                    og_description: { $ifNull: ["$seo_info.og_description", ""] },
                    twitter_title: { $ifNull: ["$seo_info.twitter_title", ""] },
                    twitter_description: { $ifNull: ["$seo_info.twitter_description", ""] },
                    twitter_creator: { $ifNull: ["$seo_info.twitter_creator", ""] },
                    updated_date_n_time: 1,
                    created_date_n_time: 1,
                    faq: 1,
                    created_by_status: "$created_by_admin_status",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    sub_admin_name: "$sub_admin_info.full_name",
                }
            }
        ]);

        if (!eventData || eventData.length == 0) {
            return res.json({
                status: false,
                message: { alert_message: "Invalid Event Row ID." }
            });
        }

        const data = eventData[0];

        data.attendees_list = await event_attendeesM.aggregate([
            {
                $match: {
                    event_row_id: Number(event_row_id),
                    invitation_status: 1
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    let: {
                        user_type: "$user_type",
                        user_row_id: "$user_row_id"
                    },
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$user_type", 1] },
                                        { $eq: ["$_id", "$$user_row_id"] }
                                    ]
                                },
                                login_status: 1
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        {
                            $unwind: {
                                path: "$img_info",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $project: {
                                user_name: 1,
                                pro_batch: 1,
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

            // 🔹 Manual users
            {
                $lookup: {
                    from: "cln_professionals_manual_retrievals",
                    let: {
                        user_type: "$user_type",
                        user_row_id: "$user_row_id"
                    },
                    as: "manual_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$user_type", 2] },
                                        { $eq: ["$user_row_id", "$$user_row_id"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                full_name: 1,
                                email_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },

            // 🔹 Normalize both user types
            {
                $set: {
                    user_data: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$user_type", 1] }, then: "$user_info" },
                                { case: { $eq: ["$user_type", 2] }, then: "$manual_info" }
                            ],
                            default: null
                        }
                    }
                }
            },

            // 🔹 Only accepted invitations
            {
                $match: {
                    user_data: { $ne: null }
                }
            },

            // 🔹 Final shape
            {
                $project: {
                    approval_status: { $ifNull: ["$user_data.approval_status", 0] },
                    user_name: "$user_data.user_name",
                    full_name: "$user_data.full_name",
                    pro_batch: "$user_data.pro_batch",
                    email_id: "$user_data.email_id",
                    profile_image: "$user_data.profile_image"
                }
            }
        ]).sort({ _id: -1 });


        const get_speakers_query = await event_speakersM.aggregate([
            {
                $match: {
                    event_row_id: Number(event_row_id),
                    $or: [
                        { requested_status: { $in: [1, 3] } },
                        { requested_status: null }
                    ]
                }
            },

            // 🔹 Platform users
            {
                $lookup: {
                    from: "cln_professionals",
                    let: {
                        user_row_id: "$user_row_id",
                        user_type: "$user_type"
                    },
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$user_type", 1] },
                                        { $eq: ["$_id", "$$user_row_id"] }
                                    ]
                                },
                                login_status: 1
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        {
                            $unwind: {
                                path: "$img_info",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $project: {
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                                pro_batch: 1,
                                approval_status: 1,
                                profile_image: "$img_info.profile_image"
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            // 🔹 Manual users
            {
                $lookup: {
                    from: "cln_professionals_manual_retrievals",
                    let: {
                        user_type: "$user_type",
                        user_row_id: "$user_row_id"
                    },
                    as: "manual_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$user_type", 2] },
                                        { $eq: ["$user_row_id", "$$user_row_id"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                full_name: 1,
                                email_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },

            // 🔹 Normalize user data
            {
                $set: {
                    user_data: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$user_type", 1] }, then: "$user_info" },
                                { case: { $eq: ["$user_type", 2] }, then: "$manual_info" }
                            ],
                            default: null
                        }
                    }
                }
            },

            { $match: { user_data: { $ne: null } } },

            // 🔹 Final shape
            {
                $project: {
                    _id: 1,
                    user_row_id: 1,
                    user_type: 1,
                    approval_status: { $ifNull: ["$user_data.approval_status", 0] },
                    user_name: "$user_data.user_name",
                    full_name: "$user_data.full_name",
                    pro_batch: "$user_data.pro_batch",
                    email_id: "$user_data.email_id",
                    profile_image: "$user_data.profile_image"
                }
            }
        ]);

        if (get_speakers_query) {
            data.speakers_list = get_speakers_query;
        }


        return res.json({
            status: true,
            message: { alert_message: "Event SEO fetched successfully" },
            data: data
        });

    } catch (err) {
        console.log('Get event seo error:', err.message);
        return res.json({
            status: false,
            message: { alert_message: 'An unexpected error occurred. Please try again later.' },
            err: err.message
        });
    }
});




router.buildSpeakersListInfoWorkPipeline = buildSpeakersListInfoWorkPipeline
router.buildEventsTagsUserInfoWorkPipeline = buildEventsTagsUserInfoWorkPipeline

module.exports = router