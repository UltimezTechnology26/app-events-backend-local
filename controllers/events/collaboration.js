const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { arrangeValidation, getIntIdFromArray } = require('../../utils/helpers/helper')
const { checkAllLoginToken, checkUserLoginToken } = require('../../middleware/authorization')
const { checkEventRowID, checkSubadminAccess, deleteFAQ, DateFormatter } = require('../../utils/helpers/events_helper')

const event_collaborationM = require('../../models/app/events/event_collaborationM')
const eventM = require('../../models/app/events/eventM')
const collaboration_users_requestsM = require('../../models/app/events/collaboration_users_requestsM')
const event_collaboration_typesM = require('../../models/app/static/event_collaboration_typesM')
const event_sponsor_categoriesM = require('../../models/app/static/event_sponsor_categoriesM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')
const professionalsM = require('../../models/app/professionalsM')
const { sendEventsEmail } = require('../../config/email')
const { setCache, getCache, deleteKeysByPattern } = require('../../config/cache_helper')

router.post('/update_collaboration_details', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.')
        .isInt().withMessage('The Event Row ID field must be contains only integers.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            let event_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.body.event_row_id))) {
                event_row_id = Number.parseInt(req.body.event_row_id)

                const check_event_query = await eventM.findOne({ _id: event_row_id }, { _id: 1 })
                if (!check_event_query) {
                    errObj['event_row_id'] = 'Invalid event row id is supplied.'
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
                if (checkUserToken.message.user_type == 1) {
                    host_user_row_id = checkUserToken.message.user_row_id
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
                let update_object = {}
                let collaborations_ids = []
                if (req.body.collaborations_ids) {
                    collaborations_ids = await getIntIdFromArray(req.body.collaborations_ids)
                }
                update_object['collaborations_ids'] = collaborations_ids

                const check_query = await event_collaborationM.findOne({ event_row_id: event_row_id })
                if (check_query) {
                    await event_collaborationM.updateOne({ event_row_id: event_row_id }, { $set: update_object })
                    await deleteKeysByPattern('users_requested_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    res.json({ asdf: req.body.collaborations_ids, status: true, message: { alert_message: 'This Collaboration details has been updated successfully.', collaborations_ids } })
                }
                else {
                    update_object['event_row_id'] = req.body.event_row_id
                    await event_collaborationM(update_object).save()
                    await deleteKeysByPattern('users_requested_list_*')
                    await deleteKeysByPattern('individual_event_*')

                    res.json({ status: true, message: { alert_message: 'New Collaboration details has been listed successfully.' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Add new Collaboration.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/event_sponsors_categories', async (req, res) => {
    try {
        const get_list = await event_sponsor_categoriesM.find()
        res.json({ status: true, message: get_list })

    } catch (err) {
        res.json({ status: false, message: err.message })
    }
})
router.get('/event_collaboration_categories', async (req, res) => {
    try {
        const get_list = await event_collaboration_typesM.find()
        res.json({ status: true, message: get_list })

    } catch (err) {
        res.json({ status: false, message: err.message })
    }
})
router.get('/individual_details/:event_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            if (!Number.isNaN(Number.parseInt(req.params.event_row_id))) {
                let result = {}
                result['collaborations_ids'] = []
                result['collaborations_ids_list'] = []

                const event_row_id = Number.parseInt(req.params.event_row_id)
                const get_query = await event_collaborationM.aggregate([
                    {
                        $match: { event_row_id: event_row_id }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_collaborations_types",
                            localField: "collaborations_ids",
                            foreignField: "_id",
                            as: "info_types",
                            pipeline: [
                                {
                                    $project: {
                                        _id: 1,
                                        collaboration_name: 1,
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $project: {
                            collaborations_ids: 1,
                            collaborations_ids_list: "$info_types"
                        }
                    }
                ]).limit(1)


                if (get_query) {
                    if (get_query[0]) {
                        result['collaborations_ids'] = get_query[0].collaborations_ids
                        result['collaborations_ids_list'] = get_query[0].collaborations_ids_list
                    }
                }

                res.json({ status: true, message: result, get_query: get_query })
            }
            else {
                res.json({ status: false, message: { alert_message: 'The event row id field must be contain valid number.' } })
            }
        }
        catch (err) {
            console.log('Collaboration Individual Details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.post('/update_user_collaboration_request', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row ID field is required.')
        .isInt().withMessage('The Event Row ID field must be contains only integers.'),
    check('collaborations_ids')
        .not().isEmpty().withMessage('The Collaborations IDs field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            let event_row_id = 0
            // let event_collaborations_ids = []
            // let event_sponsors_ids = []
            if (!Number.isNaN(Number.parseInt(req.body.event_row_id))) {
                event_row_id = Number.parseInt(req.body.event_row_id)

                const check_event_query = await eventM.findOne({ _id: event_row_id, active_status: 1 }, { _id: 1 })
                if (!check_event_query) {
                    errObj['event_row_id'] = 'Invalid event row id is supplied.'
                }
                // else {
                //     const get_event_collaboration_query = await event_collaborationM.findOne({ event_row_id: event_row_id }).limit(1)
                //     if (get_event_collaboration_query) {
                //         event_collaborations_ids = get_event_collaboration_query.collaborations_ids
                //     }
                //     else {
                //         errObj['alert_message'] = 'Apologies, but there are no collaboration categories available for this event at the moment.'
                //     }
                // }
            }




            let collaborations_ids = [];
            if (req.body.collaborations_ids) {
                if (Array.isArray(req.body.collaborations_ids)) {
                    collaborations_ids = req.body.collaborations_ids.map(id => Number.parseInt(id));
                } else if (typeof req.body.collaborations_ids === 'string') {
                    // Handle comma-separated string: "1,2,3"
                    collaborations_ids = req.body.collaborations_ids.split(',').map(id => Number.parseInt(id));
                } else {
                    collaborations_ids = [Number.parseInt(req.body.collaborations_ids)];
                }

                collaborations_ids = collaborations_ids.filter(id => !Number.isNaN(id));

                if (collaborations_ids.length === 0) {
                    errObj['collaborations_ids'] = 'Invalid collaborations Ids are supplied.';
                }

            }

            let sponsors_ids = [];
            const sponsor_id_selected = collaborations_ids.includes(12);
            if (sponsor_id_selected) {

                if (Array.isArray(req.body.sponsors_ids)) {
                    sponsors_ids = req.body.sponsors_ids.map(id => Number.parseInt(id));
                } else if (typeof req.body.sponsors_ids === 'string') {

                    sponsors_ids = req.body.sponsors_ids.split(',').map(id => Number.parseInt(id));
                } else {
                    sponsors_ids = [Number.parseInt(req.body.sponsors_ids)];
                }

                sponsors_ids = sponsors_ids.filter(id => !Number.isNaN(id));

                if (sponsors_ids.length === 0) {
                    errObj['sponsors_ids'] = 'Invalid Sponsor Ids are supplied.';
                }
                // }
            }
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }

            else if (sponsor_id_selected) {
                // Save in sponsor table
                const check_sponsors_query = await event_sponsors_partner_detailsM.findOne({
                    event_row_id: event_row_id,
                    user_company_row_id: user_row_id
                });

                if (!check_sponsors_query) {
                    const sponsorPartnerObj = {
                        event_row_id: event_row_id,
                        sponsor_partner_type: 1,
                        account_type: 1,
                        registered_type: 1,
                        user_company_row_id: user_row_id,
                        category_row_id: sponsors_ids[0],
                        requested_status: 0,
                        created_date_n_time: new Date()
                    };

                    await event_sponsors_partner_detailsM(sponsorPartnerObj).save();
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_requested_list_*')

                    return res.json({
                        status: true,
                        message: { alert_message: 'Your sponsor request has been sent for approval.' }
                    });
                } else {
                    return res.json({
                        status: false,
                        message: { alert_message: 'Sorry, Sponsor request already exists.' }
                    });
                }
            }
            else {


                const check_query = await collaboration_users_requestsM.findOne({
                    event_row_id: event_row_id,
                    user_row_id: user_row_id,
                    collaborations_ids: { $in: collaborations_ids }
                });
                if (!check_query) {
                    let insert_object = {}
                    insert_object['event_row_id'] = event_row_id
                    insert_object['user_row_id'] = user_row_id
                    insert_object['collaborations_ids'] = collaborations_ids
                    insert_object['requested_status'] = 0



                    await collaboration_users_requestsM(insert_object).save()

                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_requested_list_*')
                    res.json({ status: true, message: { alert_message: 'Your Collaboration request has been sent for approval.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Collaboration request is already exist.' } })
                }
            }

        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Add new Collaboration.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/get_types', async (req, res) => {
    try {
        const get_query = await collaboration_users_requestsM.aggregate([

            {
                $lookup:
                {
                    from: "cln_static_event_collaborations_types",
                    localField: "collaborations_ids",
                    foreignField: "_id",
                    as: "info_types",

                }
            },
        ])
        res.json({ status: true, message: get_query, })
    } catch (err) {
        res.json({ status: true, message: err.message })

    }
})
router.get('/users_requested_list/:event_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            let event_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.params.event_row_id))) {
                event_row_id = Number.parseInt(req.params.event_row_id)
            }
            else {
                errObj['event_row_id'] = 'The event row id field must be contain valid number.'
            }

            let errObj = {}
            let host_user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                host_user_row_id = checkUserToken.message.user_row_id
            }

            if (event_row_id && host_user_row_id) {
                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })
                if (!check_event_res.status) {
                    errObj['event_row_id'] = check_event_res.message.alert_message
                }
            }
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
                const query = [
                    { event_row_id: event_row_id }
                ];


                if (req.query.requested_status) {
                    query.push({ requested_status: Number.parseInt(req.query.requested_status) })
                }
                const cacheKey = `users_requested_list_${event_row_id}_${skip}_${limit}_${req.query.requested_status || 'all'}`;

                // ✅ Check cache first
                const cache_response = await getCache({ key: cacheKey });
                if (cache_response.status && cache_response.message) {
                    return res.json({
                        status: true,
                        message: cache_response.message.data,
                        count: cache_response.message.count,
                        cache_response_status: true
                    });
                }
                const get_query = await collaboration_users_requestsM.aggregate([
                    {
                        $sort: {
                            _id: -1
                        }
                    },
                    { $match: { $and: query } },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_collaborations_types",
                            localField: "collaborations_ids",
                            foreignField: "_id",
                            as: "info_types",
                            pipeline: [
                                {
                                    $project: {
                                        collobration_name: 1
                                    }
                                }
                            ]

                        }
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
                                        from: "cln_static_countries",
                                        localField: "country_id",
                                        foreignField: "_id",
                                        as: "co_info",
                                        pipeline: [
                                            {
                                                $project: {
                                                    country_code: 1
                                                }
                                            }
                                        ]
                                    }
                                },
                                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        profile_image: "$img_info.profile_image",
                                        country_code: "$co_info.country_code",
                                        user_name: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        mobile_number: 1,
                                        approval_status: 1,
                                        login_status: 1,
                                        pro_batch: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            user_name: "$user_info.user_name",
                            email_id: "$user_info.email_id",
                            full_name: "$user_info.full_name",
                            pro_batch: "$user_info.pro_batch",

                        }
                    },

                    {
                        $project: {
                            _id: 1,
                            user_name: 1,
                            full_name: 1,
                            pro_batch: 1,
                            email_id: 1,
                            updated_on: 1,
                            requested_status: { $ifNull: ["$requested_status", 3] },
                            login_status: "$user_info.login_status",
                            approval_status: "$user_info.approval_status",
                            mobile_number: "$user_info.mobile_number",
                            country_code: "$user_info.country_code",
                            collaborations_ids: 1,
                            profile_image: "$user_info.profile_image",
                            collaborations_ids_list: "$info_types",

                        }
                    }
                ]).skip(skip).limit(limit)

                const count_query = await collaboration_users_requestsM.countDocuments({ event_row_id: event_row_id })

                // res.json({ status: true, message: get_query, count: count_query })
                await setCache({ key: cacheKey, value: { data: get_query, count: count_query }, ttl: 1800 });

                res.json({ status: true, message: get_query, count: count_query, cache_response_status: false });
            }
        }
        catch (err) {
            console.log('Collaboration Users Requests.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.post('/accept_user_collaboration_request', [
    check('request_id')
        .not().isEmpty().withMessage('The Request ID field is required.')
        .isInt().withMessage('The Request ID must contain only integers.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        if (!errors.isEmpty()) {
            return res.json({ status: false, message: errObj });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status) return res.json(checkUserToken);

        const request_id = Number.parseInt(req.body.request_id);
        if (Number.isNaN(request_id)) {
            return res.json({ status: false, message: { request_id: 'Invalid Request ID.' } });
        }

        const requestData = await collaboration_users_requestsM.findOne({ _id: request_id });
        if (!requestData) {
            return res.json({ status: false, message: { request_id: 'Collaboration request not found.' } });
        }

        if (requestData.requested_status === 1) {
            return res.json({ status: false, message: { alert_message: 'This request is already approved.' } });
        }

        await collaboration_users_requestsM.updateOne(
            { _id: request_id },
            { $set: { requested_status: 1, updated_on: new Date() } }
        );
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('users_requested_list_*')
        // ===== Send Email =====
        const userInfo = await professionalsM.findOne({ _id: requestData.user_row_id }, { full_name: 1, email_id: 1 });
        const eventInfo = await eventM.findOne({ _id: requestData.event_row_id }, {
            event_title: 1,
            event_url: 1,
            event_venue: 1,
            start_date: 1,
            event_type: 1,
            user_row_id: 1
        });

        const hostInfo = await professionalsM.findOne({ _id: eventInfo.user_row_id }, { full_name: 1 });

        let email_event_url = "https://events.coinpedia.org/" + eventInfo.event_url
        const eventName = eventInfo.event_title || '[Event Name]';
        const eventAddress = eventInfo.event_venue || '';
        const eventDateTime = eventInfo.start_date ? DateFormatter(eventInfo.start_date) : '[Event Date and Time]';
        const eventTypeMap = { 1: 'Seminar', 2: 'Webinar', 3: 'Hybrid' };
        const eventType = eventTypeMap[eventInfo.event_type] || '[Event Type]';
        let event_host_name = ''
        const check_event_res = await checkEventRowID({ event_row_id: requestData.event_row_id })
        if (check_event_res.status) {
            event_host_name = check_event_res.message.event_host_name || '[Host Name]'
        }

        const pass_subject = 'Collaboration Request Approved!';
        const pass_email_id = userInfo?.email_id || '';
        const speakerName = userInfo?.full_name || 'User';

        const pass_message = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #28a745;"> Collaboration Request Approved!</h2>
              

                <p style="font-size: 17px;">Hello ${speakerName},</p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Congratulations! We're thrilled to inform you that your collaboration request for the event
                    <strong>${eventName}</strong>, happening ${eventAddress ? 'at' : ''} <strong>${eventAddress}</strong> on <strong>${eventDateTime}</strong>
                    and <strong>${eventType}</strong> has been successfully approved by the host <strong>${event_host_name}</strong>.
                </p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Your collaboration request has been officially accepted – we're excited to move forward together!
                    Your expertise will undoubtedly contribute greatly to the success of this initiative.
                </p>

                <p style="font-size: 16px;">Thank you for being part of this exciting journey.</p>

                <div style="margin: 24px 0;">
                  <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">Visit Now</a></p>
                    <p style="font-size: 12px; margin-top: 8px; color: #666;">This link will direct you to the collaborated events page.</p>
                </div>

                <p style="font-size: 15px;">Thank you for Trusting us.<br><strong>Team CoinPedia</strong></p>
                <p style="font-size: 13px; color: #555;">For any queries <a href="mailto:support@coinpedia.org" style="color: #007bff;">Contact Us</a></p>
            </div>
        `;

        if (pass_email_id) {
            await sendEventsEmail(pass_email_id, pass_subject, pass_message);
        }

        return res.json({ status: true, message: { alert_message: 'Request accepted and email sent successfully.' } });
    } catch (err) {
        console.log('Accept request error:', err.message);
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message });
    }
});



router.post('/reject_user_collaboration_request', [
    check('request_id')
        .not().isEmpty().withMessage('The Request ID field is required.')
        .isInt().withMessage('The Request ID must contain only integers.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);
        if (!errors.isEmpty()) {
            return res.json({ status: false, message: errObj });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status) return res.json(checkUserToken);

        const request_id = Number.parseInt(req.body.request_id);

        if (Number.isNaN(request_id)) {
            return res.json({ status: false, message: { request_id: 'Invalid Request ID.' } });
        }

        const requestData = await collaboration_users_requestsM.findOne({ _id: request_id });
        if (!requestData) {
            return res.json({ status: false, message: { request_id: 'Collaboration request not found.' } });
        }

        if (requestData.requested_status === 2) {
            return res.json({ status: false, message: { alert_message: 'This collaboration request is already rejected.' } });
        }

        // Update the request as rejected
        await collaboration_users_requestsM.updateOne(
            { _id: request_id },
            {
                $set: {
                    requested_status: 2,
                    updated_on: new Date()
                }
            }
        );
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('users_requested_list_*')
        // Send rejection email
        const userInfo = await professionalsM.findOne({ _id: requestData.user_row_id }, { full_name: 1, email_id: 1 });
        const eventInfo = await eventM.findOne({ _id: requestData.event_row_id }, {
            event_title: 1,
            event_venue: 1,
            event_url: 1,
            start_date: 1,
            event_type: 1,
            user_row_id: 1
        });

        const hostInfo = await professionalsM.findOne({ _id: eventInfo.user_row_id }, { full_name: 1 });

        const pass_email_id = userInfo?.email_id;
        const userName = userInfo?.full_name || 'User';
        const eventName = eventInfo?.event_title || '[Event Name]';
        const eventAddress = eventInfo?.event_venue || '[Event Address]';
        const eventDateTime = eventInfo?.start_date ? DateFormatter(eventInfo.start_date) : '[Event Date and Time]';
        const eventTypeMap = { 1: 'Seminar', 2: 'Webinar', 3: 'Hybrid' };
        const eventType = eventTypeMap[eventInfo?.event_type] || '[Event Type]';
        let event_host_name = ''
        const check_event_res = await checkEventRowID({ event_row_id: requestData.event_row_id })
        if (check_event_res.status) {
            event_host_name = check_event_res.message.event_host_name || '[Host Name]'
        }
        let email_event_url = "https://events.coinpedia.org/" + eventInfo.event_url

        const subject = 'Collaboration Request Rejected!';
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #dc3545;"> Collaboration Request Rejected!</h2>
             

                <p style="font-size: 17px;">Hello ${userName},</p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Unfortunately, your collaboration request for the event <strong>${eventName}</strong>,
                    happening at <strong>${eventAddress}</strong> on <strong>${eventDateTime}</strong> and
                    <strong>${eventType}</strong> has been rejected by the host <strong>${event_host_name}</strong> due to
                    not meeting the event criteria or missing essential information.
                </p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Thank you for your interest in collaborating with this event. After thoughtful consideration,
                    we regret to inform you that your collaboration request has not been approved at this time.
                    We genuinely value the effort and perspective you shared and hope to explore potential opportunities together in the future.
                </p>

                <p style="font-size: 16px;">However, we encourage you to explore our upcoming events.</p>

                <div style="margin: 24px 0;">
                   <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">Visit Now</a></p>
                    <p style="font-size: 12px; margin-top: 8px; color: #666;">
                        This link will direct you to all events page where you can explore the events.
                    </p>
                </div>

                <p style="font-size: 15px;">Thank you for Trusting us.<br><strong>Team CoinPedia</strong></p>

                <p style="font-size: 13px; color: #555;">For any queries <a href="mailto:support@coinpedia.org" style="color: #007bff;">Contact Us</a></p>
            </div>
        `;

        if (pass_email_id) {
            await sendEventsEmail(pass_email_id, subject, htmlContent);
        }

        return res.json({ status: true, message: { alert_message: 'Collaboration request has been rejected and email sent.' } });

    } catch (err) {
        console.log('Reject Collaboration Request Error:', err.message);
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message });
    }
});





module.exports = router