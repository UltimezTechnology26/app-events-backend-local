
require('dotenv').config()
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);
const professionalsM = require('../../models/app/professionalsM')
const event_faqM = require('../../models/app/events/event_faqM')
const event_attendeesM = require('../../models/app/events/event_attendeesM')
const event_speakersM = require('../../models/app/events/event_speakersM')
const events_countM = require('../../models/app/events/events_countM')
const eventM = require('../../models/app/events/eventM')
const event_seo_detailsM = require('../../models/app/events/event_seo_detailsM')

const companyM = require('../../models/app/company/companyM')
const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
const event_utc_datesM = require('../../models/app/events/event_utc_datesM')
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const professionals_manual_retrievalsM = require('../../models/app/users/professionals_manual_retrievalsM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')
const { hoursAddFromPresentTime, getPresentDateTime, startAndEndOfToday, startAndEndOfTomorrow, startAndEndOfWeek, monthStartEndDate, createEndDateOnly, createDateTime, getIntIdFromArray, getDistanceFromLatLon } = require('./helper')
const deleted_eventsM = require('../../models/app/events/deleted_eventsM')
const ticketM = require('../../models/app/events/ticketM')
const notify_userM = require('../../models/app/events/notify_userM')
const event_watchlistsM = require('../../models/app/watchlist/eventM')
const { deleteNotifications, updateNotification } = require('./notification_helper')
const { sendEventsEmail } = require('../../config/email')
const { checkUserLoginToken } = require('../../middleware/authorization')
const { setCache, getCache } = require('../../config/cache_helper')


export const sendAttendeesEmails = async () => {
    const present_date_n_time = new Date(getPresentDateTime())
    const hours_array = [
        {
            _id: 1,
            hours: 12
        },
        {
            _id: 2,
            hours: 24
        },
        {
            _id: 3,
            hours: 48
        },
        {
            _id: 4,
            hours: 72
        }
    ]
    const result = []

    for (let run of hours_array) {
        const run_id = run._id
        const run_hours = run.hours
        const hours_add_date_n_time = hoursAddFromPresentTime(run_hours)
        const formatted_date_time = new Date(hours_add_date_n_time)

        const get_query = await eventM.aggregate([
            {
                $sort: {
                    start_date: 1
                }
            },
            {
                $match: {
                    $and: [
                        { active_status: 1, approval_status: 1, start_date: { $lte: formatted_date_time, $gte: present_date_n_time } },
                        { $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_events_attendees",
                    localField: "_id",
                    foreignField: "event_row_id",
                    as: "info_attendees",
                    pipeline: [
                        {
                            $match: { email_day_number: run_id, email_sent_status: false }
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
                                            full_name: 1,
                                            email_id: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                email_day_number: 1,
                                email_sent_status: 1,
                                full_name: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.full_name", else: "$user_manual_info.full_name" } },
                                email_id: { $cond: { if: { $eq: [1, '$user_type'] }, then: "$user_info.email_id", else: "$user_manual_info.email_id" } }
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    total_attendees: { $size: "$info_attendees" }
                }
            },
            {
                $match: {
                    total_attendees: { $gte: 1 }
                }
            },
            {
                $project: {
                    _id: 1,
                    event_title: 1,
                    event_type: 1,
                    event_image_type: 1,
                    event_image: 1,
                    event_tags: 1,
                    event_city: 1,
                    event_state: 1,
                    event_venue: 1,
                    event_url: 1,
                    start_date: 1,
                    end_date: 1,
                    utc_row_id: 1,
                    event_price: 1,
                    total_attendees: 1,
                    attendees: "$info_attendees"
                }
            }
        ])

        if (get_query[0]) {
            for (let run of get_query) {
                const event_row_id = run._id
                const event_title = run.event_title
                const event_url = run.event_url
                const start_date_formatted = DateFormatter(run.start_date)
                const get_utc_time = await event_utc_datesM.findOne({ _id: run.utc_row_id }, { utc_time: 1 })
                const pass_subject = "You’re Invited to attend " + event_title + " Event"
                let event_host_name = ''
                const check_event_res = await checkEventRowID({ event_row_id })
                if (check_event_res.status) {
                    event_host_name = check_event_res.message.event_host_name
                }

                if (run.attendees[0]) {
                    for (let innerRun of run.attendees) {
                        if (innerRun.email_id && innerRun.full_name) {
                            const invitation_id = innerRun._id
                            const user_email_id = innerRun.email_id
                            const user_full_name = innerRun.full_name
                            const invite_req_url = "https://events.coinpedia.org/" + event_url + "?invitation_id=" + invitation_id

                            const message_to_pass = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${user_full_name},</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">
                                You’ve been invited by <b style="text-transform: capitalize;">${event_host_name}</b> to attend the <b>${event_title}</b> event on <b>${start_date_formatted} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ""}</b>. 
                            </p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Be part of this exciting event which is going to be fun and very thoughtful. Packed with amazing speakers and industry experts.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Register yourself to this event, by accepting the invitation below.</p>
                            <p><a href="${invite_req_url}" style="color:#0029ff;font-weight: 400;font-size:17px;">Accept Invitation </a></p>
                            `
                            let mesage_id = await sendEventsEmail(user_email_id, pass_subject, message_to_pass, invitation_id, event_row_id)

                            if (mesage_id) {
                                await event_attendeesM.updateOne({ _id: invitation_id }, { $set: { sg_message_id: mesage_id, email_sent_status: true } })
                            }
                        }
                    }
                }
            }
        }

        result.push({
            present_date_n_time: getPresentDateTime(),
            hours_add_date_n_time,
            _id: run_id,
            hours: run_hours,
            events: get_query
        })
    }

    return result
}





//professionas events filter

export const professionalfilterQuery = async ({ top_filter_array, sort, search_array, req_query, event_status }) => {
    try {
        const present_date_time = new Date(getPresentDateTime())

        let sort_value = sort ? sort : { start_date: 1 }
        // let top_filter = [{ active_status:1, approval_status:1 ,$or: [{ user_row_id: { $gt: 0 } },{ company_row_id: { $gt: 0 } }]}]

        if (req_query.search) {
            search_array.push({ $or: [{ event_title: { '$regex': req_query.search, $options: 'i' } }] })
        }

        if (!event_status) {
            if (!Number.isNaN(Number.parseInt(req_query.date_type))) {
                const date_type = Number.parseInt(req_query.date_type)
                if (date_type === 1) {
                    const start_end_date = startAndEndOfToday()
                    top_filter_array.push({ start_date: { $lte: new Date(start_end_date.end_date) }, end_date: { $gte: new Date(start_end_date.start_date) } })
                }
                else if (date_type === 2) {
                    const start_end_date = startAndEndOfTomorrow()
                    top_filter_array.push({ start_date: { $gte: new Date(start_end_date.start_date) }, end_date: { $lte: new Date(start_end_date.end_date) } })

                }
                else if (date_type === 3) {
                    const start_end_date = startAndEndOfWeek()
                    top_filter_array.push({ start_date: { $gte: new Date(start_end_date.start_date) }, end_date: { $gt: present_date_time, $lte: new Date(start_end_date.end_date) } })
                }
                else if (date_type === 4) {
                    sort_value = { end_date: 1 }
                    const start_end_date = monthStartEndDate()
                    top_filter_array.push({
                        start_date: { $gte: new Date(start_end_date.start_date) },
                        end_date: { $gt: present_date_time, $lte: new Date(start_end_date.end_date) }
                    });
                }
                else if (date_type === 5) {
                    if (req_query.start_date && req_query.end_date) {
                        const start_date = createEndDateOnly(req_query.start_date)
                        const end_date = createDateTime(req_query.end_date)
                        top_filter_array.push({ start_date: { $lte: new Date(end_date) }, end_date: { $gte: new Date(start_date) } })
                    }
                }
                // else {
                //     if (!req_query.event_status) {
                //         top_filter_array.push({ end_date: { $gte: present_date_time } })
                //     }
                // }
            }
            // else {
            //     if (!req_query.event_status) {
            //         top_filter_array.push({ end_date: { $gte: present_date_time } })
            //     }
            // }

        }

        //event_status=> 1.ongoing 2.upcoming 3.ended
        if (!Number.isNaN(Number.parseInt(req_query.event_status))) {

            if (Number.parseInt(req_query.event_status) === 1) {
                top_filter_array.push({ start_date: { $lte: new Date(present_date_time) }, end_date: { $gte: new Date(present_date_time) } })
            }
            else if (Number.parseInt(req_query.event_status) === 2) {
                top_filter_array.push({ start_date: { $gte: new Date(present_date_time) } })
            }
            else if (Number.parseInt(req_query.event_status) === 3) {
                top_filter_array.push({ end_date: { $lte: new Date(present_date_time) } })
            }
        }

        if (req_query.price_type) {
            const price_type = Number.parseInt(req_query.price_type)
            if (price_type === 1) {
                search_array.push({ event_price: 0 })
            }
            else if (price_type === 2) {
                search_array.push({ event_price: { $gte: 1 } })
            }
            else if (price_type === -1) {
                search_array.push({ event_price: -1 })
            }
        }

        if (req_query.location) {
            const locations = (req_query.location).split(',')
            if (locations.length === 1) {
                search_array.push({ event_venue: { '$regex': locations[0], $options: 'i' } })
            }
            else if (locations.length === 2) {
                search_array.push({ event_venue: { '$regex': locations[0], $options: 'i' } })
                search_array.push({ event_venue: { '$regex': locations[1], $options: 'i' } })
            }
            else if (locations.length === 3) {
                search_array.push({ event_venue: { '$regex': locations[0], $options: 'i' } })
                search_array.push({ event_venue: { '$regex': locations[1], $options: 'i' } })
                search_array.push({ event_venue: { '$regex': locations[2], $options: 'i' } })
            }
            else {
                search_array.push({ event_venue: { '$regex': req_query.location, $options: 'i' } })
            }
        }

        if (req_query.event_tag) {
            search_array.push({ event_tags: { $in: await getIntIdFromArray(req_query.event_tag) } })
        }

        if (req_query.event_type) {
            search_array.push({ event_type: Number.parseInt(req_query.event_type) })
        }

        if (req_query.list_event_type) {
            search_array.push({ list_event_type: Number.parseInt(req_query.list_event_type) })
        }

        return { top_filter_array: top_filter_array, search_array: search_array, sort_value: sort_value }
    }
    catch (err) {
        console.log('Filter function error.', err.message)
        return { top_filter_array: [], search_array: [], sort_value: [], err: err.message }
    }
}
const CITY_SPELLING_MAP = {
    'bengaluru': 'Bangalore',
    'Bangalore': 'bengaluru'

};
//Filter
export const filterQuery = async ({ top_filter_array, sort, search_array, req_query, event_status }) => {
    try {
        const present_date_time = new Date(getPresentDateTime())

        let sort_value = sort ? sort : { start_date: 1 }
        // let top_filter = [{ active_status:1, approval_status:1 ,$or: [{ user_row_id: { $gt: 0 } },{ company_row_id: { $gt: 0 } }]}]

        if (req_query.search) {
            search_array.push({ $or: [{ event_title: { '$regex': req_query.search, $options: 'i' } }] })
        }

        if (!event_status) {
            if (!Number.isNaN(Number.parseInt(req_query.date_type))) {
                const date_type = Number.parseInt(req_query.date_type)
                if (date_type === 1) {
                    const start_end_date = startAndEndOfToday()
                    top_filter_array.push({ start_date: { $lte: new Date(start_end_date.end_date) }, end_date: { $gte: new Date(start_end_date.start_date) } })
                }
                else if (date_type === 2) {
                    const start_end_date = startAndEndOfTomorrow()
                    top_filter_array.push({ start_date: { $gte: new Date(start_end_date.start_date) }, end_date: { $lte: new Date(start_end_date.end_date) } })

                }
                else if (date_type === 3) {
                    const start_end_date = startAndEndOfWeek()
                    top_filter_array.push({ start_date: { $gte: new Date(start_end_date.start_date) }, end_date: { $gt: present_date_time, $lte: new Date(start_end_date.end_date) } })
                }
                else if (date_type === 4) {
                    sort_value = { end_date: 1 }
                    const start_end_date = monthStartEndDate()
                    top_filter_array.push({
                        start_date: { $gte: new Date(start_end_date.start_date) },
                        end_date: { $gt: present_date_time, $lte: new Date(start_end_date.end_date) }
                    });
                }
                else if (date_type === 5) {
                    if (req_query.start_date && req_query.end_date) {
                        const start_date = createEndDateOnly(req_query.start_date)
                        const end_date = createDateTime(req_query.end_date)
                        top_filter_array.push({ start_date: { $lte: new Date(end_date) }, end_date: { $gte: new Date(start_date) } })
                    }
                }
                else if (!req_query.event_status) {
                    top_filter_array.push({ end_date: { $gte: present_date_time } })
                }
            }
            else if (!req_query.event_status) {
                top_filter_array.push({ end_date: { $gte: present_date_time } })
            }
        }

        //event_status=> 1.ongoing 2.upcoming 3.ended
        if (!Number.isNaN(Number.parseInt(req_query.event_status))) {

            if (Number.parseInt(req_query.event_status) === 1) {
                top_filter_array.push({ start_date: { $lte: new Date(present_date_time) }, end_date: { $gte: new Date(present_date_time) } })
            }
            else if (Number.parseInt(req_query.event_status) === 2) {
                top_filter_array.push({ start_date: { $gte: new Date(present_date_time) } })
            }
            else if (Number.parseInt(req_query.event_status) === 3) {
                top_filter_array.push({ end_date: { $lte: new Date(present_date_time) } })
            }
        }

        if (req_query.price_type) {
            const price_type = Number.parseInt(req_query.price_type)
            if (price_type === 1) {
                search_array.push({ event_price: 0 })
            }
            else if (price_type === 2) {
                search_array.push({ event_price: { $gte: 1 } })
            }
            else if (price_type === -1) {
                search_array.push({ event_price: -1 })
            }
        }


        if (req_query.location) {
            let locations = [];
            const raw_query = req_query.location.trim();

            if (raw_query.includes(',')) {

                locations = raw_query
                    .split(',')
                    .map(loc => loc.trim())
                    .filter(Boolean)
                    .slice(0, 3);
            } else {

                locations = raw_query.split(/\s+/).filter(Boolean);

            }

            if (locations.length > 0) {

                const final_query_conditions = [];

                locations.forEach(location_part => {
                    const lower_part = location_part.toLowerCase();
                    const part_or_conditions = [];
                    part_or_conditions.push({ event_venue: { '$regex': location_part, $options: 'i' } });
                    const alternative_spelling = CITY_SPELLING_MAP[lower_part];

                    if (alternative_spelling) {
                        part_or_conditions.push({ event_venue: { '$regex': alternative_spelling, $options: 'i' } });
                    }


                    final_query_conditions.push({ $or: part_or_conditions });
                });

                search_array.push({ $and: final_query_conditions });

            }
        }
        if (req_query.event_tag) {
            search_array.push({ event_tags: { $in: await getIntIdFromArray(req_query.event_tag) } })
        }

        if (req_query.event_type) {
            search_array.push({ event_type: Number.parseInt(req_query.event_type) })
        }

        if (req_query.list_event_type) {
            search_array.push({ list_event_type: Number.parseInt(req_query.list_event_type) })
        }

        return { top_filter_array: top_filter_array, search_array: search_array, sort_value: sort_value }
    }
    catch (err) {
        console.log('Filter function error.', err.message)
        return { top_filter_array: [], search_array: [], sort_value: [], err: err.message }
    }
}

const getTopCountriesCached = async (present_date_time) => {

    const topCountries = await eventM.aggregate([
        {
            $match: {
                approval_status: 1,
                active_status: 1,
                $or: [
                    { start_date: { $gte: present_date_time } },
                    { start_date: { $lte: present_date_time }, end_date: { $gte: present_date_time } }
                ]
            }
        },
        {
            $project: {
                event_venue: 1,
                country_name: {
                    $trim: {
                        input: { $arrayElemAt: [{ $split: ["$event_venue", ","] }, -1] }
                    }
                }
            }
        },
        {
            $lookup: {
                from: "cln_static_countries",
                localField: "country_name",
                foreignField: "country_name",
                as: "country_info"
            }
        },
        { $unwind: "$country_info" },
        {
            $group: {
                _id: "$country_info.country_name",
                country_flag: { $first: "$country_info.country_flag" },
                event_count: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                country_name: "$_id",
                country_flag: 1,
                event_count: 1
            }
        },
        { $sort: { event_count: -1 } },
        { $limit: 5 }
    ]);
    return topCountries;
};

export const getEventsData = async ({ sort_value, top_filter_array, search_query, req_query, req_params, req_headers }) => {
    try {
        let user_row_id = "";
        const checkUserToken = checkUserLoginToken(req_headers);
        if (checkUserToken.status) user_row_id = checkUserToken.message;

        let skip = 0;
        let limit = 100;

        if (req_params) {
            const skipParam = Number.parseInt(req_params.skip);
            const limitParam = Number.parseInt(req_params.limit);

            if (!Number.isNaN(skipParam)) {
                skip = skipParam;
            }

            if (!Number.isNaN(limitParam)) {
                limit = limitParam;
            }
        }

        const present_date_time = new Date(getPresentDateTime());

        if (!top_filter_array || typeof top_filter_array !== 'object') {
            top_filter_array = { $and: [] };
        }
        if (!Array.isArray(top_filter_array.$and)) {
            top_filter_array.$and = Array.isArray(top_filter_array.$and) ? top_filter_array.$and : [];
        }

        const userLat = req_query?.user_latitude ? parseFloat(req_query.user_latitude) : null;
        const userLon = req_query?.user_longitude ? parseFloat(req_query.user_longitude) : null;

        let minLat, maxLat, minLon, maxLon;
        if (userLat && userLon) {
            const maxDistance = 500;
            const KM = 111;
            const latDelta = maxDistance / KM;
            const lonDelta = maxDistance / (KM * Math.cos(userLat * Math.PI / 180));

            minLat = userLat - latDelta;
            maxLat = userLat + latDelta;
            minLon = userLon - lonDelta;
            maxLon = userLon + lonDelta;
        }

        // ---------------------------------------------------------------
        // STAGE GROUP 1 — cheap filtering + the minimum lookups needed to
        // decide which documents qualify (visibility), then paginate.
        // ---------------------------------------------------------------
        const pipeline = [];
        pipeline.push({ $match: top_filter_array });
        pipeline.push({
            $addFields: {
                lat_num: { $convert: { input: "$latitude", to: "double", onError: null, onNull: null } },
                lon_num: { $convert: { input: "$longitude", to: "double", onError: null, onNull: null } }
            }
        });

        if (userLat && userLon) {
            pipeline.push({
                $match: {
                    lat_num: { $gte: minLat, $lte: maxLat },
                    lon_num: { $gte: minLon, $lte: maxLon }
                }
            });
        }

        pipeline.push({
            $lookup: {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "user_info",
                pipeline: [
                    { $match: { login_status: { $ne: 1 } } },
                    { $project: { _id: 1, login_status: 1 } }
                ]
            }
        });
        pipeline.push({ $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } });

        // Guest registration — only join when there's an actual logged-in user.
        // For anonymous visitors (user_row_id === ""), this can never match a
        // real record, so skip the join and set the result directly.
        if (user_row_id) {
            pipeline.push({
                $lookup: {
                    from: "cln_events_attendees",
                    let: { eventId: "$_id", userRowId: user_row_id },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$event_row_id", "$$eventId"] },
                                        { $eq: ["$user_type", 1] },
                                        { $eq: ["$user_row_id", "$$userRowId"] },
                                        { $eq: ["$invitation_status", 1] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 1 } }
                    ],
                    as: "guest_registration"
                }
            });
            pipeline.push({
                $addFields: {
                    guest_register_status: { $gt: [{ $size: "$guest_registration" }, 0] }
                }
            });
        } else {
            pipeline.push({ $addFields: { guest_register_status: false } });
        }

        // Single unconditional company lookup — used for both the visibility
        // check below AND the partner-status calc later (see merge note above).
        pipeline.push({
            $lookup: {
                from: "cln_company_lists",
                localField: "company_row_id",
                foreignField: "_id",
                as: "company_info",
                pipeline: [
                    { $project: { _id: 1, active_status: 1, approval_status: 1 } }
                ]
            }
        });
        pipeline.push({ $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } });

        pipeline.push({
            $set: {
                company_active_status: { $ifNull: ["$company_info.active_status", 1] },
                login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
            }
        });

        pipeline.push({
            $match: {
                $or: [
                    { login_status: 1, list_event_type: 1 },
                    { company_active_status: 1, list_event_type: 2 },
                    { list_event_type: 3, login_status: 1, company_active_status: 1 }
                ]
            }
        });

        pipeline.push({ $sort: sort_value || { start_date: 1 } });
        pipeline.push({ $match: search_query });

        // ---------------------------------------------------------------
        // PAGINATE HERE — everything below only runs on the page of
        // documents actually being returned, not the full matching set.
        // ---------------------------------------------------------------
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        // ---------------------------------------------------------------
        // STAGE GROUP 2 — display-only enrichment, now scoped to `limit` docs.
        // ---------------------------------------------------------------
        pipeline.push({
            $lookup: {
                from: "cln_event_watchlists",
                localField: "_id",
                foreignField: "event_row_id",
                pipeline: [
                    { $match: { user_row_id: user_row_id } },
                    { $project: { _id: 1, user_row_id: 1 } }
                ],
                as: "user_watchlist"
            }
        });
        pipeline.push({ $addFields: { watchlist_count: { $size: "$user_watchlist" } } });
        pipeline.push({ $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } });

        pipeline.push({
            $lookup: {
                from: "cln_events_utc_dates",
                localField: "utc_row_id",
                foreignField: "_id",
                as: "utc_dates",
                pipeline: [{ $project: { _id: 0, utc_time: 1, timezone: 1 } }]
            }
        });
        pipeline.push({ $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } });

        pipeline.push({
            $addFields: {
                tagIds: {
                    $cond: [
                        { $isArray: "$event_tags" },
                        "$event_tags",
                        { $map: { input: { $objectToArray: "$event_tags" }, as: "t", in: "$$t.v" } }
                    ]
                }
            }
        });
        pipeline.push({
            $lookup: {
                from: "cln_events_tags",
                let: { tagIds: "$tagIds" },
                pipeline: [
                    { $match: { $expr: { $in: ["$_id", "$$tagIds"] }, active_status: true } },
                    { $project: { _id: 1, event_tag: 1 } }
                ],
                as: "eventTags"
            }
        });

        pipeline.push({
            $lookup: {
                from: "cln_event_tickets",
                localField: "_id",
                foreignField: "event_row_id",
                as: "event_tickets",
                pipeline: [
                    { $project: { _id: 1, event_row_id: 1, title: 1, ticket_type: 1, price: 1, active_status: 1 } }
                ]
            }
        });
        pipeline.push({
            $addFields: {
                ticket_count: {
                    $cond: {
                        if: { $gt: [{ $size: "$event_tickets" }, 1] },
                        then: { $subtract: [{ $size: "$event_tickets" }, 1] },
                        else: { $size: "$event_tickets" }
                    }
                }
            }
        });

        pipeline.push({
            $lookup: {
                from: "cln_event_coupons",
                localField: "_id",
                foreignField: "event_row_id",
                as: "coupons",
                pipeline: [{ $project: { _id: 1, event_row_id: 1, coupon_code: 1, discount: 1 } }]
            }
        });

        pipeline.push({
            $lookup: {
                from: "cln_events_speakers",
                let: { eventId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$event_row_id", "$$eventId"] },
                            $or: [{ requested_status: { $in: [1, 3] } }, { requested_status: null }]
                        }
                    },
                    { $project: { _id: 1, event_row_id: 1, user_type: 1, user_row_id: 1, requested_status: 1 } }
                ],
                as: "speakers_list"
            }
        });
        pipeline.push({
            $lookup: {
                from: "cln_professionals",
                localField: "speakers_list.user_row_id",
                foreignField: "_id",
                as: "speakers_user_details",
                pipeline: [{ $project: { _id: 1, user_name: 1, full_name: 1, profile_image: 1 } }]
            }
        });
        pipeline.push({
            $addFields: {
                speakers_list: {
                    $map: {
                        input: "$speakers_list",
                        as: "speaker",
                        in: {
                            $mergeObjects: [
                                "$$speaker",
                                {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: "$speakers_user_details",
                                                as: "user",
                                                cond: { $eq: ["$$user._id", "$$speaker.user_row_id"] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        });

        pipeline.push({
            $lookup: {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "user_details",
                pipeline: [{ $project: { _id: 1, user_name: 1, full_name: 1 } }]
            }
        });
        pipeline.push({ $unwind: { path: "$user_details", preserveNullAndEmptyArrays: true } });

        pipeline.push({
            $lookup: {
                from: "cln_company_added_to_partners",
                localField: "company_row_id",
                foreignField: "company_row_id",
                as: "partner_data",
                pipeline: [{ $project: { _id: 1, company_row_id: 1 } }]
            }
        });
        pipeline.push({
            $addFields: {
                company_partner_status: {
                    $cond: {
                        if: {
                            $and: [
                                { $gt: [{ $size: "$partner_data" }, 0] },
                                { $eq: ["$company_info.active_status", 1] },
                                { $eq: ["$company_info.approval_status", 1] }
                            ]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        });

        pipeline.push({
            $lookup: {
                from: "cln_event_sponsor_partner_details",
                localField: "_id",
                foreignField: "event_row_id",
                pipeline: [
                    { $match: { sponsor_partner_type: 2 } },
                    { $project: { _id: 1, event_row_id: 1, category_row_id: 1, user_company_row_id: 1 } }
                ],
                as: "partner_category_data"
            }
        });
        pipeline.push({
            $lookup: {
                from: "cln_static_event_partner_categories",
                localField: "partner_category_data.category_row_id",
                foreignField: "_id",
                pipeline: [{ $project: { _id: 1, partnership_name: 1 } }],
                as: "partner_category_name"
            }
        });
        pipeline.push({
            $addFields: {
                official_partner_status: {
                    $anyElementTrue: {
                        $map: {
                            input: "$partner_category_data",
                            as: "p",
                            in: {
                                $and: [
                                    {
                                        $in: [
                                            {
                                                $arrayElemAt: [
                                                    "$partner_category_name.partnership_name",
                                                    { $indexOfArray: ["$partner_category_data.category_row_id", "$$p.category_row_id"] }
                                                ]
                                            },
                                            ["Media Partner", "Official Media Partner"]
                                        ]
                                    },
                                    { $eq: ["$$p.user_company_row_id", 5011] }
                                ]
                            }
                        }
                    }
                }
            }
        });

        // Final shape — identical field list to the original.
        pipeline.push({
            $project: {
                _id: 1,
                event_title: 1,
                event_tags: 1,
                event_type: 1,
                event_image: 1,
                event_city: 1,
                event_state: 1,
                event_venue: 1,
                event_link: 1,
                event_image_type: 1,
                start_date: 1,
                end_date: 1,
                partner_category_data: "$partner_category_data",
                partner_category_name: "$partner_category_name",
                event_description: 1,
                contact_country_row_id: 1,
                event_price: 1,
                active_status: 1,
                approval_status: 1,
                list_event_type: 1,
                created_by_admin_status: 1,
                company_partner_status: 1,
                official_partner_status: 1,
                longitude: 1,
                latitude: 1,
                lat_num: 1,
                lon_num: 1,
                event_url: 1,
                view_counts: 1,
                event_card_image: 1,
                guest_register_status: 1,
                company_active_status: 1,
                login_status: 1,
                event_tickets: 1,
                ticket_count: 1,
                coupons: 1,
                speakers_list: 1,
                user_names: "$user_details.user_name",
                watchlist_count: 1,
                watchlist_status: { $cond: { if: "$user_watchlist._id", then: 1, else: 0 } },
                utc_time: "$utc_dates.utc_time",
                event_tag_array: "$eventTags.event_tag"
            }
        });

        // count pipeline unchanged — already cheap, no enrichment lookups
        const countPipeline = [];
        countPipeline.push({ $match: top_filter_array });
        countPipeline.push({
            $addFields: {
                lat_num: { $convert: { input: "$latitude", to: "double", onError: null, onNull: null } },
                lon_num: { $convert: { input: "$longitude", to: "double", onError: null, onNull: null } }
            }
        });
        if (userLat && userLon) {
            countPipeline.push({
                $match: {
                    lat_num: { $gte: minLat, $lte: maxLat },
                    lon_num: { $gte: minLon, $lte: maxLon }
                }
            });
        }
        countPipeline.push({ $match: search_query });
        countPipeline.push({ $count: "count" });

        const [eventsResult, countResult, topCountries] = await Promise.all([
            eventM.aggregate(pipeline),
            eventM.aggregate(countPipeline),
            getTopCountriesCached(present_date_time)
        ]);

        let total_counts = 0;
        if (countResult?.[0] && countResult?.[0].count) {
            total_counts = countResult?.[0].count;
        }

        let finalList = eventsResult;
        if (userLat && userLon) {
            finalList = eventsResult
                .map(ev => {
                    const formatLattitude = ev.latitude ? Number(ev.latitude) : NaN;
                    const formatLongitude = ev.longitude ? Number(ev.longitude) : NaN;
                    const latN = (ev.lat_num !== undefined && ev.lat_num !== null) ? ev.lat_num : formatLattitude;
                    const lonN = (ev.lon_num !== undefined && ev.lon_num !== null) ? ev.lon_num : formatLongitude;

                    if (isNaN(latN) || isNaN(lonN)) return { ...ev, distance: null };

                    const dist = getDistanceFromLatLon(userLat, userLon, latN, lonN);
                    return { ...ev, distance: dist };
                })
                .filter(e => e.distance !== null && e.distance <= 500);

            total_counts = finalList.length;
        }

        return {
            list: finalList,
            count: total_counts,
            topCountries
        };

    } catch (err) {
        console.log("Get events list error:", err?.message ? err?.message : err);
        return { list: [], count: 0, err: err ? err.message || err : 'unknown error' };
    }
};


// Find month start and end date
export const EventsstartAndEndOfMonth = function (month_year) {
    try {
        const [yearStr, monthStr] = month_year.split("-");
        const year = Number.parseInt(yearStr, 10);
        const month = Number.parseInt(monthStr, 10);

        // First day of month
        const month_start_date = dayjs(new Date(year, month - 1, 1))
            .format("YYYY-MM-DD") + "T00:00:00Z";

        // Last day of month
        const month_end_date = dayjs(new Date(year, month, 0))
            .format("YYYY-MM-DD") + "T23:59:59Z";

        return {
            start_date: month_start_date,
            end_date: month_end_date,
        };
    }
    catch (err) {
        console.error('Events start and end of month error', err)
        return false
    }
}

//start and end of week
export function EventstartAndEndOfWeek() {
    try {
        let now = new Date()
        now.setHours(0, 0, 0, 0);
        let startday = new Date(now);
        startday.setDate(startday.getDate() - 6)
        now.setHours(23, 59, 59, 999)
        let endday = new Date(now);
        return { start_date: startday, end_date: endday }

    }
    catch (err) {
        console.error('Events start and end of week error', err)
        return false
    }
}

//start and end of today
export function EventsstartAndEndOfToday(date_time) {

    try {
        // Convert input to Africa/Bamako time
        const bamakoDate = dayjs(date_time).tz("Africa/Bamako");

        const start_date =
            bamakoDate.format("YYYY-MM-DD") + "T00:00:00Z";

        const end_date =
            bamakoDate.format("YYYY-MM-DD") + "T23:59:59Z";

        return {
            start_date,
            end_date,
        };
    }
    catch (err) {
        console.error('Events start and end of day error', err)
        return false
    }
}

//Long date format
export function DateFormatter(start_date) {
    try {
        const dateObject = new Date(start_date)

        const options = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
            timeZone: 'UTC'
        }

        const start_date_formatted = new Intl.DateTimeFormat('en-US', options).format(dateObject)

        return start_date_formatted

    }
    catch (err) {
        console.error('Long date format error', err)
        return false
    }
}

// Update the counts of attendees 
export const updateAttendeesCount = async ({ event_row_id }) => {
    try {
        const total_attendees = await event_attendeesM.countDocuments({ event_row_id: event_row_id, invitation_status: 1 })
        const total_invitees = await event_attendeesM.countDocuments({ event_row_id: event_row_id, invitation_status: 0 })

        const check_event = await events_countM.findOne({ event_row_id: event_row_id })
        if (check_event) {
            await events_countM.updateOne({ event_row_id: event_row_id }, { $set: { total_attendees: total_attendees, total_invitees: total_invitees } })
        }
        else {
            await events_countM({
                event_row_id: event_row_id,
                total_attendees: total_attendees,
                total_invitees: total_invitees
            }).save()
        }

    }
    catch (err) {
        console.error('Update attendees error', err)
        return false
    }
}

//Check valid event row id of the user 
export const checkEventRowID = async ({ user_row_id, event_row_id }) => {
    try {
        const event_query = await eventM.findOne({ _id: event_row_id, approval_status: 1 })
        if (event_query) {
            const list_event_type = event_query.list_event_type //1:user, 2:company, 3:both
            const result = {}
            result['start_date'] = event_query.start_date
            result['event_title'] = event_query.event_title
            result['event_url'] = event_query.event_url
            result['event_link'] = event_query.event_link
            result['utc_row_id'] = event_query.utc_row_id
            result['list_event_type'] = event_query.list_event_type
            result['event_type'] = event_query.event_type
            result['event_venue'] = event_query.event_venue ? event_query.event_venue : ''
            result['ticket_link'] = event_query.ticket_link ? event_query.ticket_link : ''
            result['webinar_meeting_link'] = event_query.webinar_meeting_link ? event_query.webinar_meeting_link : ''




            const check_in_array = [1, 3]
            if (check_in_array.includes(list_event_type)) {
                const event_user_row_id = event_query.user_row_id
                if (user_row_id) {
                    if (user_row_id != event_user_row_id) {
                        return { status: false, message: { alert_message: "The event row id field is invalid." } }
                    }
                }

                const event_user_query = await professionalsM.aggregate([
                    {
                        $match: { _id: event_user_row_id, login_status: 1, approval_status: 1 }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { active_status: 1, approval_status: 1 }
                                },
                                {
                                    $project:
                                    {
                                        _id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            full_name: 1,
                            company_row_id: "$company_info._id"
                        }
                    }
                ]).limit(1)

                if (event_user_query[0]) {
                    result['user_row_id'] = event_user_query[0]._id
                    result['company_row_id'] = event_user_query[0].company_row_id ? event_user_query[0].company_row_id : 0
                    result['event_host_name'] = event_user_query[0].full_name

                    return { status: true, message: result }
                }
            }
            else {
                const event_company_row_id = event_query.company_row_id

                const company_query = await companyM.aggregate([
                    { $match: { _id: event_company_row_id, approval_status: 1, active_status: 1 } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "user_row_id",
                            foreignField: "_id",
                            as: "user_info",
                            pipeline: [
                                { $match: { login_status: 1, approval_status: 1 } },
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
                        $project: {
                            _id: 1,
                            user_row_id: "$user_info._id",
                            company_name: 1
                        }
                    }
                ]).limit(1)

                if (company_query[0]) {
                    if (user_row_id) {
                        if (user_row_id != company_query[0].user_row_id) {
                            return { status: false, message: { alert_message: "The event row id field is invalid.2" } }
                        }
                    }
                    result['company_row_id'] = event_company_row_id
                    result['user_row_id'] = company_query[0].user_row_id ? company_query[0].user_row_id : 0
                    result['event_host_name'] = company_query[0].company_name

                    return { status: true, message: result }
                }
            }
        }
        return { status: false, message: { alert_message: "The event row id field is invalid.1" } }

    }
    catch (err) {
        console.error('Check valid event row id of the user error', err)
        return false
    }
}



//Shift data from manual user to register
export const shiftUserFromManualToRegister = async ({ manual_user_row_id, register_user_row_id, sub_admin_row_id }) => {
    try {
        // user attendees - STARTS HERE
        const attendee_query = await event_attendeesM.findOne({ user_type: 2, user_row_id: manual_user_row_id })
        if (attendee_query) {
            await event_attendeesM.updateMany({ user_type: 2, user_row_id: manual_user_row_id }, { $set: { user_type: 1, user_row_id: register_user_row_id } })
        }

        // user speakers - STARTS HERE

        const speakers_query = await event_speakersM.findOne({ user_type: 2, user_row_id: manual_user_row_id })
        if (speakers_query) {
            await event_speakersM.updateMany({ user_type: 2, user_row_id: manual_user_row_id }, { $set: { user_type: 1, user_row_id: register_user_row_id } })
        }

        // sponsors and partners
        const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 1, registered_type: 2, user_company_row_id: manual_user_row_id })
        if (sp_query) {
            await event_sponsors_partner_detailsM.updateMany({ account_type: 1, registered_type: 2, user_company_row_id: manual_user_row_id }, { $set: { account_type: 1, registered_type: 1, user_company_row_id: register_user_row_id } })
        }

        // users funds - STARTS HERE

        const funds_query = await fundingInvestmentM.findOne({ investor_type: 1, investor_registered_type: 2, investor_row_id: manual_user_row_id })
        if (funds_query) {
            await fundingInvestmentM.updateMany({ investor_type: 1, investor_registered_type: 2, investor_row_id: manual_user_row_id }, { $set: { investor_type: 1, investor_registered_type: 1, investor_row_id: register_user_row_id } })
        }

        // work_experience - STARTS HERE

        const work_experience_query = await professionals_work_experienceM.findOne({ user_account_type: 2, user_row_id: manual_user_row_id })
        if (work_experience_query) {
            await professionals_work_experienceM.updateMany({ user_account_type: 2, user_row_id: manual_user_row_id }, { $set: { user_account_type: 1, user_row_id: register_user_row_id } })
        }

        // Update in Manual Retrievals - STARTS HERE

        // approval_sub_admin_row_id
        //sub_admin_row_id ? 1:3,
        const user_query = await professionals_manual_retrievalsM.findOne({ _id: manual_user_row_id })
        if (user_query) {
            await professionals_manual_retrievalsM.updateOne({ _id: manual_user_row_id }, {
                $set: {
                    main_user_row_id: register_user_row_id,
                    approval_sub_admin_row_id: sub_admin_row_id,
                    approval_status: 1,
                    approval_date: getPresentDateTime()
                }
            })
        }


        return true
    }
    catch (err) {
        console.error('Shift data from manual to register user error', err)
        return false
    }
}



export const shiftCompanyFromManualToRegister = async ({ manual_company_row_id, register_company_row_id, sub_admin_row_id }) => {
    try {
        // Investors Funds
        const funds_invested_query = await fundingInvestmentM.findOne({ investor_type: 2, investor_registered_type: 2, investor_row_id: manual_company_row_id })
        if (funds_invested_query) {
            await fundingInvestmentM.updateMany({ investor_type: 2, investor_registered_type: 2, investor_row_id: manual_company_row_id }, { $set: { investor_type: 2, investor_registered_type: 1, investor_row_id: register_company_row_id } })
        }

        // Funds Raised Investors Funds
        const funds_raised_query = await fundingInvestmentM.findOne({ funds_raised_registered_type: 2, funds_raised_company_row_id: manual_company_row_id })
        if (funds_raised_query) {
            await fundingInvestmentM.updateMany({ funds_raised_registered_type: 2, funds_raised_company_row_id: manual_company_row_id }, { $set: { funds_raised_registered_type: 1, funds_raised_company_row_id: register_company_row_id } })
        }

        // Sponsors and Partners
        const event_sponsors_partner_query = await event_sponsors_partner_detailsM.findOne({ account_type: 2, registered_type: 2, user_company_row_id: manual_company_row_id })
        if (event_sponsors_partner_query) {
            await event_sponsors_partner_detailsM.updateMany({ account_type: 2, registered_type: 2, user_company_row_id: manual_company_row_id }, { $set: { account_type: 2, registered_type: 1, user_company_row_id: register_company_row_id } })
        }

        // work_experience
        const work_experience_query = await professionals_work_experienceM.findOne({ company_type: 2, company_row_id: manual_company_row_id })
        if (work_experience_query) {
            await professionals_work_experienceM.updateMany({ company_type: 2, company_row_id: manual_company_row_id }, { $set: { company_type: 1, company_row_id: register_company_row_id } })
        }

        // approval_sub_admin_row_id
        const user_query = await company_manual_retrievalsM.findOne({ _id: manual_company_row_id })
        if (user_query) {
            await company_manual_retrievalsM.updateOne({ _id: manual_company_row_id }, {
                $set: {
                    main_company_row_id: register_company_row_id,
                    approval_sub_admin_row_id: sub_admin_row_id,
                    approval_status: 1,
                    approval_date: getPresentDateTime()
                }
            })
        }

        return true
    }
    catch (err) {
        console.error('Shift data from manual to register user error', err)
        return false
    }
}

//Check valid speaker
export const checkSpeaker = async ({ event_row_id, user_row_id, user_type }) => {
    try {
        const check_inserted_query = await event_attendeesM.findOne({ user_row_id: user_row_id, user_type: user_type, event_row_id: event_row_id }, { _id: 1 })
        if (check_inserted_query) {
            return { status: false, message: "Sorry, This user is already attending the event." }
        }

        const check_speaker = await event_speakersM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: user_type, requested_status: { $in: [1, 3] } }, { _id: 1 })
        if (check_speaker) {
            return { status: false, message: "Sorry, This user is already attending the event as a Speaker." }
        }

        return { status: true, message: "" }
    }
    catch (err) {
        console.error('Check speaker error', err)
        return { status: false }
    }
}

//Check valid attendee
export const checkAttendee = async (event_row_id, user_row_id, user_type) => {
    try {
        let status = false

        const check_attendee = await event_attendeesM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: user_type })
        if (check_attendee) {
            status = true
        }

        return { status: status, message: "" }
    }
    catch (err) {
        console.error('Check valid attendee error', err)
        return { status: false }
    }
}

export const checkSubadminAccess = async ({ admin_row_id, admin_manager_type, sub_admin_type, event_row_id }) => {
    try {
        if (admin_manager_type != 1) {
            const check_event = await eventM.findOne({ _id: event_row_id }, { created_by_sub_admin_id: 1 })
            if (check_event) {
                if (sub_admin_type == 2 && admin_row_id != check_event.created_by_sub_admin_id) {
                    return { status: false, message: "You do not have permission to perform this action" }
                }
                else {
                    return { status: true }
                }
            }
            else {
                return { status: false, message: "Invalid Event Row ID" }
            }
        }
        else {
            return { status: true }
        }

    }
    catch (err) {
        console.log('Check subadmin access type.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

//Delete Attendees
export const deleteAttendees = async ({ type, event_row_id, attendee_row_id }) => {
    try {
        if (type == 1) {
            await event_attendeesM.deleteOne({ _id: attendee_row_id })
            await updateAttendeesCount({ event_row_id })
        }
        else {
            await event_attendeesM.deleteMany({ event_row_id: event_row_id })
            await updateAttendeesCount({ event_row_id })
        }
    }
    catch (err) {
        console.log('Delete Attendee.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}


//Delete FAQ
export const deleteFAQ = async ({ type, event_row_id, faq_row_id }) => {
    try {
        if (type == 1) {
            await event_faqM.deleteOne({ _id: faq_row_id })
        }
        else {
            await event_faqM.deleteMany({ event_row_id: event_row_id })
        }
    }
    catch (err) {
        console.log('Delete FAQ.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

//Delete Tickets
export const deleteTickets = async ({ type, event_row_id, ticket_row_id }) => {
    try {
        if (type == 1) {
            await ticketM.deleteOne({ _id: ticket_row_id })

            const getLowestPrice = await ticketM.find({ event_row_id: event_row_id }, { price: 1 }).sort({ price: 1 }).limit(1)

            if (getLowestPrice.length > 0) {
                if (getLowestPrice[0].price > 0) {
                    await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: getLowestPrice[0].price } })
                }
                else {
                    await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: 0 } })
                }
            }
            else {
                await eventM.updateOne({ _id: event_row_id }, { $set: { event_price: -1 } })
                await notify_userM.updateMany({ event_row_id: event_row_id }, { $set: { notify_status: false } })

            }
        }
        else {
            await ticketM.deleteMany({ event_row_id: event_row_id })

        }

    }
    catch (err) {
        console.log('Delete Ticket.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

//Delete sponsors and partners
//Type->1.Delete One 2.Delete many, account_type->1.User 2.Company , registered_type->1.Registerd  2.Manual
export const deleteSponsorsPartners = async ({ type, event_row_id, sp_row_id, account_type, registered_type, user_company_row_id }) => {
    try {
        if (type == 1) {
            await event_sponsors_partner_detailsM.deleteOne({ _id: sp_row_id })
        }
        else {
            const query = event_row_id ? { event_row_id: event_row_id } : { account_type: account_type, registered_type: registered_type, user_company_row_id: user_company_row_id }
            await event_sponsors_partner_detailsM.deleteMany(query)
        }

    }
    catch (err) {
        console.log('Delete Sponsor and partners.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

//Delete watchlist
export const deleteEventWatchlist = async ({ type, event_row_id, watchlist_row_id }) => {
    try {
        if (type == 1) {
            await event_watchlistsM.deleteOne({ _id: watchlist_row_id })
            const total_watchlist = await event_watchlistsM.countDocuments({ event_row_id: event_row_id })
            const check_event = await events_countM.findOne({ event_row_id: event_row_id })
            if (check_event) {
                await events_countM.updateOne({ event_row_id: event_row_id }, { $set: { total_watchlist: total_watchlist } })
            }
        }
        else {
            await event_watchlistsM.deleteMany({ event_row_id: event_row_id })
        }

    }
    catch (err) {
        console.log('Delete Event watchlist.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

//Delete Event
export const deleteEvent = async ({ event_row_id, deleted_reason }) => {
    try {
        const query = await eventM.findOne({ _id: event_row_id })

        await deleted_eventsM({
            user_row_id: query.user_row_id,
            event_title: query.event_title,
            company_row_id: query.company_row_id,
            event_tags: query.event_tags,
            event_type: query.event_type,
            event_city: query.event_city,
            event_state: query.event_state,
            event_venue: query.event_venue,
            event_url: query.event_url,
            event_link: query.event_link,
            start_date: query.start_date,
            end_date: query.end_date,
            event_description: query.event_description,
            contact_user_name: query.contact_user_name,
            contact_mobile_number: query.contact_mobile_number,
            contact_country_row_id: query.contact_country_row_id,
            contact_email_id: query.contact_email_id,
            active_status: query.active_status,
            approval_status: query.approval_status,
            webinar_meeting_type: query.webinar_meeting_type,
            webinar_meeting_link: query.webinar_meeting_link,
            list_event_type: query.list_event_type,
            created_by_admin_status: query.created_by_admin_status,
            created_by_sub_admin_id: query.created_by_sub_admin_id,
            created_date_n_time: query.created_date_n_time,
            longitude: query.longitude,
            latitude: query.latitude,
            utc_row_id: query.utc_row_id,
            deleted_reason: deleted_reason ? deleted_reason : "",
            deleted_date_n_time: getPresentDateTime()
        }).save()

        await eventM.deleteOne({ _id: event_row_id })
        await event_seo_detailsM.deleteOne({ event_row_id: event_row_id })
        await event_speakersM.deleteMany({ event_row_id: event_row_id })

        const check_attendee = await event_attendeesM.findOne({ event_row_id: event_row_id })
        if (check_attendee) {
            await deleteAttendees({ type: 2, event_row_id: event_row_id })
        }

        const check_faq = await event_faqM.findOne({ event_row_id: event_row_id })
        if (check_faq) {
            await deleteFAQ({ type: 2, event_row_id: event_row_id })
        }




        const check_tickets = await ticketM.findOne({ event_row_id: event_row_id })
        if (check_tickets) {
            deleteTickets({ type: 2, event_row_id: event_row_id })
        }

        await notify_userM.deleteMany({ event_row_id: event_row_id })

        const check_sponsors_partners = await event_sponsors_partner_detailsM.findOne({ event_row_id: event_row_id })
        if (check_sponsors_partners) {
            await deleteSponsorsPartners({ type: 2, event_row_id: event_row_id })
        }

        const check_watchlist = await event_watchlistsM.findOne({ event_row_id: event_row_id })
        if (check_watchlist) {
            await deleteEventWatchlist({ type: 2, event_row_id: event_row_id })

        }

        await deleteNotifications({ notify_type: 3, notify_type_row_id: event_row_id })

        await events_countM.deleteOne({ event_row_id: event_row_id })
    }
    catch (err) {
        console.log('Delete Event.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }

}

export const speakers_email = async ({ event_row_id, user_type, user_row_id, host_user_row_id }) => {
    try {
        const get_event_details = await eventM.aggregate([
            {
                $match: { _id: event_row_id, user_row_id: host_user_row_id, approval_status: 1 }
            },
            { $limit: 1 },
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
                    user_name: "$user_info.user_name",
                    utc_time: "$utc_dates.utc_time",
                }
            }
        ])
        if (get_event_details[0]) {
            let start_date_formatted = DateFormatter(get_event_details[0].start_date)
            if (user_type == 1) {
                const speakers_query = await professionalsM.aggregate([
                    {
                        $match: { _id: user_row_id }
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
                            full_name: 1,
                            email_id: 1,
                            user_name: 1,
                            profile_image: "$img_info.profile_image"
                        }
                    }
                ]).limit(1)
                console.log("speakers_query", speakers_query)
                if (speakers_query[0]?.email_id) {
                    let full_name = speakers_query[0].full_name
                    let email_id = speakers_query[0].email_id

                    let email_subject = "You’re Invited as Speaker | " + get_event_details[0].event_title + " event"
                    let email_event_url = "https://events.coinpedia.org/" + get_event_details[0].event_url

                    let email_message = `
                       <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                       <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${get_event_details[0].full_name}</b> has invited you to join the <b>${get_event_details[0].event_title}</b> as a speaker on <b>${start_date_formatted} ${get_event_details[0].utc_time ? `(UTC${get_event_details[0].utc_time})` : ""}</b>.</p>
                       <p style="color:#000;font-weight: 400;font-size:17px;">Attend the event as a speaker and share your experience with the panel and attendees.</p>
                       <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">See event details </a></p>
                       <p style="color:#000;font-weight: 400;font-size:17px;">Or <a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login</a> to CoinPedia for more information. !</p>
                       `
                    const asd = await sendEventsEmail(email_id, email_subject, email_message)

                    await updateNotification({
                        user_row_id: user_row_id,
                        notify_type: 3,
                        notify_type_row_id: event_row_id,
                        message_row_id: 54,
                        action_row_id: event_row_id
                    })

                    return asd
                }
                // ?reg_type=1&name=${full_name}&email=${check_email_id}&invite_id=${invite_id}&comp=${insertArray.company_name}&desgn=${insertArray.work_position}&gender=${insertArray.gender}
            }
            else if (user_type == 2) {
                let invite_id = get_event_details[0].user_name
                let manual_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })

                if (manual_query?.email_id) {
                    let manual_full_name = manual_query.full_name
                    let manual_email_id = manual_query.email_id
                    let work_position = manual_query.work_position ? manual_query.work_position : ""
                    let gender = manual_query.work_position ? manual_query.gender : 0
                    let company_name = ""

                    if (manual_query.company_type && manual_query.company_type == 1) {
                        const reg_company = await companyM.findOne({ _id: manual_query.company_row_id })
                        if (reg_company) {
                            company_name = reg_company.company_name
                        }
                    }
                    else if (manual_query.company_type && manual_query.company_type == 2) {
                        const manual_company = await company_manual_retrievalsM.findOne({ _id: manual_query.company_row_id })
                        if (manual_company) {
                            company_name = manual_company.company_name
                        }
                    }

                    let email_subject = "You’re Invited as Speaker | " + get_event_details[0].event_title + " event"
                    let email_event_url = "https://events.coinpedia.org/" + get_event_details[0].event_url

                    let email_message = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${manual_full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${get_event_details[0].host_name}</b> has invited you to join the <b>${get_event_details[0].event_title}</b> as a speaker on <b>${start_date_formatted} ${get_event_details[0].utc_time ? `(UTC${get_event_details[0].utc_time})` : ""} </b> Attend the event and share your experience with the panel and attendees.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"> <a href="${email_event_url}" style="color:#0029ff;">See event details</a></p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Or <a href="https://app.coinpedia.org/confirm-details/?reg_type=1&name=${manual_full_name}&email=${manual_email_id}&invite_id=${invite_id}&comp=${company_name}&desgn=${work_position}&gender=${gender}" style="color:#0029ff;font-weight: 700;">Register</a> to Coinpedia for more information. !</p>
                        `

                    await sendEventsEmail(manual_email_id, email_subject, email_message)
                }

            }
        }


    }
    catch (err) {
        console.log('Update Event Speakers error .', err.message)
        return err
    }
}
