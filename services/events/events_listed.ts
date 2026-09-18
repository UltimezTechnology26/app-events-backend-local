import professionalsM from "../../models/app/professionalsM";
import { filterQuery, getEventsData } from "../../utils/helpers/events_helper";
import redisCache, { CacheDuration } from '../../config/redis';
import event_speakersM from "../../models/app/events/event_speakersM";
import event_contactsM from "../../models/app/events/event_contactsM";
import event_link_display_detailsM from "../../models/app/events/event_link_display_detailsM";
import eventM from "../../models/app/events/eventM";
import event_utc_datesM from "../../models/app/events/event_utc_datesM";
import event_tagsM from "../../models/app/static/event_tagsM";
import ticketM from "../../models/app/events/ticketM";
import countryM from "../../models/app/static/countryM";
import event_attendeesM from "../../models/app/events/event_attendeesM";
import event_watchlistsM from "../../models/app/watchlist/eventM";
import { getIntIdFromArray, getPresentDateTime } from "../../utils/helpers/helper";
import event_seo_detailsM from "../../models/app/events/event_seo_detailsM";
import { getPositionResolutionStages } from "../../src/modules/work-experience/work-experience.queries";
import { joinPositionNamesExpr } from "../../src/modules/funding/funding.queries";

export const getManageEventsList = async (req: any, skip: number, limit: number, user_row_id: number) => {
    try {
        const checkUser = await professionalsM.findOne({ _id: user_row_id });
        if (!checkUser) {
            return {
                status: false,
                message: { alert_message: 'Sorry, your account is not approved' },
                account_status: 0
            };
        }

        let filter_array = [{ user_row_id: user_row_id }];
        let search_query = [{}];
        let sort = { _id: -1 };
        let { top_filter_array, search_array, sort_value } = await filterQuery({
            top_filter_array: filter_array,
            search_array: search_query,
            sort: sort,
            req_query: req.query,
            event_status: 1
        });

        const key = `manage_events_list_${user_row_id}_${skip}_${limit}_${JSON.stringify(req.query)}`;

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message.list,
                count: cache_response.message.count,
                cache_reponse_status: true
            };
        }

        const { list, count } = await getEventsData({
            sort_value: sort_value,
            top_filter_array: { $and: top_filter_array },
            search_query: { $and: search_array },
            req_query: req.query,
            req_params: req.params,
            req_headers: req.headers
        });

        await redisCache.setCache({
            key,
            value: { list, countQueryRun: count, time: new Date(), account_status: 1 },
            ttl: CacheDuration.THIRTY_MINUTES
        });

        return {
            status: true,
            message: list,
            countQueryRun: count,
            cache_reponse_status: false
        };

    } catch (error: any) {
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: error?.message || 'Unknown error'
        };
    }
};


export const getViewDetails = async (request_row_id: number, user_row_id: number) => {
    try {
        if (!Number.isNaN(request_row_id)) {
            // Optimized: Only select required fields for event lookup
            const checkEvent = await eventM.findOne(
                { _id: request_row_id, user_row_id: user_row_id },
                {
                    _id: 1,
                    user_row_id: 1,
                    list_event_type: 1,
                    event_title: 1,
                    event_image_type: 1,
                    event_tags: 1,
                    company_row_id: 1,
                    event_type: 1,
                    event_image: 1,
                    event_city: 1,
                    event_state: 1,
                    event_venue: 1,
                    event_url: 1,
                    event_link: 1,
                    event_card_image: 1,
                    ticket_link: 1,
                    start_date: 1,
                    end_date: 1,
                    event_price: 1,
                    event_description: 1,
                    describe_in_one_line: 1,
                    contact_user_name: 1,
                    contact_mobile_number: 1,
                    contact_country_row_id: 1,
                    contact_email_id: 1,
                    active_status: 1,
                    approval_status: 1,
                    created_date_n_time: 1,
                    webinar_meeting_type: 1,
                    webinar_meeting_link: 1,
                    longitude: 1,
                    latitude: 1,
                    utc_row_id: 1,
                    alt_image_text: 1,
                    build_event_page_score: 1,
                    seo_details_score: 1,
                    contact_details_score: 1,
                    tickets_coupons_score: 1,
                    speakers_score: 1,
                    sponsors_partners_score: 1,
                    attendees_score: 1,
                    faq_score: 1,
                    profile_score: 1,
                    speakers: 1
                }
            )

            if (!checkEvent) {
                return { status: false, message: { alert_message: 'Invalid Request Row ID' } }
            }

            // Optimized: Use destructuring and parallel execution for independent queries
            const {
                _id: eventId,
                event_tags,
                contact_country_row_id,
                utc_row_id,
                speakers
            } = checkEvent

            // Execute independent queries in parallel for better performance
            const [
                utcTimeData,
                eventData,
                countryData,
                [totalGuests, totalWatchlists],
                linkDisplayDetails,
                contactDetails,
                speakersData,
                seoDetails
            ] = await Promise.all([
                // UTC timezone lookup (only if needed)
                utc_row_id ?
                    event_utc_datesM.findOne(
                        { _id: utc_row_id },
                        { _id: 1, timezone: 1, country: 1, utc_time: 1 }
                    ) :
                    Promise.resolve(null),

                // Event tags and tickets lookup
                Promise.all([
                    event_tags && event_tags.length > 0 ?
                        event_tagsM.find(
                            { _id: { $in: event_tags }, active_status: true },
                            { _id: 1, event_tag: 1 }
                        ) :
                        Promise.resolve([]),
                    ticketM.find(
                        { event_row_id: eventId },
                        { _id: 1, title: 1, benefits: 1, ticket_type: 1, price: 1, sell_status: 1, active_status: 1 }
                    )
                ]),

                // Country lookup (only if needed)
                contact_country_row_id ?
                    countryM.findOne(
                        { _id: contact_country_row_id },
                        { _id: 1, country_name: 1, country_flag: 1, country_code: 1 }
                    ) :
                    Promise.resolve(null),

                // Count operations in parallel
                Promise.all([
                    event_attendeesM.countDocuments({ event_row_id: eventId }),
                    event_watchlistsM.countDocuments({ event_row_id: eventId })
                ]),

                // Link display details lookup
                event_link_display_detailsM.findOne(
                    { event_row_id: eventId },
                    { _id: 0, link_user_register_status: 1, link_attendee_list_status: 1, link_speaker_status: 1, link_partner_status: 1, link_sponsor_status: 1, link_ticket_status: 1, link_contact_status: 1 }
                ).lean(),

                // Contact details aggregation
                event_contactsM.aggregate([
                    { $match: { event_row_id: eventId } },
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
                    {
                        $set: { contact_type: { $ifNull: ["$contact_type", 9] } }
                    },
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
                ]),

                // Speakers aggregation (only if speakers exist)
                speakers && speakers.length > 0 ?
                    event_speakersM.aggregate([
                        { $match: { event_row_id: eventId } },
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
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [1, '$$user_type'] },
                                                            { $eq: ['$_id', '$$user_row_id'] }
                                                        ]
                                                    }
                                                },
                                                { login_status: 1 }
                                            ]
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
                                    { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            _id: 1,
                                            user_name: 1,
                                            full_name: 1,
                                            pro_batch: 1,
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
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                user_data: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: { $eq: ['$user_type', 1] },
                                                then: "$user_info"
                                            },
                                            {
                                                case: { $eq: ['$user_type', 2] },
                                                then: "$manual_info"
                                            }
                                        ],
                                        default: ""
                                    }
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_professionals_work_experiences",
                                let: {
                                    user_type: '$user_type',
                                    user_row_id: '$user_data._id'
                                },
                                pipeline: [
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
                                        $lookup: {
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
                                                { $project: { _id: 1, company_name: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                                    {
                                        $lookup: {
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
                                                { $project: { _id: 1, company_name: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                                    {
                                        $project: {
                                            position_name: '$resolved_position_name',
                                            company_name: {
                                                $cond: {
                                                    if: "$info_company.company_name",
                                                    then: "$info_company.company_name",
                                                    else: "$info_manual_company.company_name"
                                                }
                                            }
                                        }
                                    }
                                ],
                                as: "info_work"
                            }
                        },
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                        { $match: { user_data: { $exists: true, $ne: "" } } },
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                user_type: 1,
                                user_name: "$user_data.user_name",
                                full_name: "$user_data.full_name",
                                pro_batch: "$user_data.pro_batch",
                                email_id: "$user_data.email_id",
                                profile_image: "$user_data.profile_image",
                                position_name: "$info_work.position_name",
                                company_name: "$info_work.company_name"
                            }
                        }
                    ]) :
                    Promise.resolve([]),
                event_seo_detailsM.findOne(
                    { event_row_id: eventId },
                    { _id: 1, meta_keywords: 1, meta_description: 1, meta_title: 1 }
                ).lean()
            ])

            // Optimized: Construct response efficiently
            const [eventTagsArray, tickets] = eventData

            const eventObject = checkEvent.toObject()

            const resultArray = {
                ...eventObject,
                // Construct nested objects
                seo_details: {
                    meta_keywords: seoDetails?.meta_keywords || "",
                    meta_description: seoDetails?.meta_description || "",
                    meta_title: seoDetails?.meta_title || "",
                },
                profile_scores: {
                    build_event_page_score: eventObject.build_event_page_score,
                    seo_details_score: eventObject.seo_details_score,
                    contact_details_score: eventObject.contact_details_score,
                    tickets_coupons_score: eventObject.tickets_coupons_score,
                    speakers_score: eventObject.speakers_score,
                    sponsors_partners_score: eventObject.sponsors_partners_score,
                    attendees_score: eventObject.attendees_score,
                    faq_score: eventObject.faq_score,
                    profile_score: eventObject.profile_score
                },
                // Remove individual fields from root level
                meta_keywords: undefined,
                meta_description: undefined,
                meta_title: undefined,
                build_event_page_score: undefined,
                seo_details_score: undefined,
                contact_details_score: undefined,
                tickets_coupons_score: undefined,
                speakers_score: undefined,
                sponsors_partners_score: undefined,
                attendees_score: undefined,
                faq_score: undefined,
                profile_score: undefined,
                // Add conditional data
                ...(utcTimeData && {
                    timezone: utcTimeData.timezone,
                    country: utcTimeData.country,
                    utc_time: utcTimeData.utc_time
                }),
                event_tags_array: eventTagsArray,
                tickets,
                speakers,
                country_data: countryData || '',
                total_guests: totalGuests,
                total_tickets: tickets.length,
                total_watchlists: totalWatchlists,
                contact_details: contactDetails.length > 0 ? contactDetails : [],
                speakers_usernames: speakersData?.map(({ user_row_id, user_type }: { user_row_id: number; user_type: number }) => ({
                    user_row_id,
                    user_type
                })) || [],
                speakers_array: speakersData || [],
                // Link display statuses - use database values if available, otherwise defaults
                ...(linkDisplayDetails || {
                    link_user_register_status: true,
                    link_attendee_list_status: true,
                    link_speaker_status: true,
                    link_partner_status: true,
                    link_sponsor_status: true,
                    link_ticket_status: true,
                    link_contact_status: true
                })
            }

            return { status: true, message: resultArray }
        }
        else {
            return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
        }
    } catch (error) {
        console.error('Error in getViewDetails:', error)
        return { status: false, message: { alert_message: 'Internal server error' } }
    }
}

export const getRegisteredUsers = async ({ req, user_row_id }: { req: any, user_row_id: number }) => {
    try {
        const skip = Number.parseInt(req.params.skip)
        const limit = Number.parseInt(req.params.limit)

        // ─── Early match to reduce collection scan ───────────────────────────
        const earlyMatch: any = {
            active_status: 1,
            approval_status: 1,
        }

        if (req.query.search) {
            earlyMatch.event_title = { $regex: req.query.search, $options: 'i' }
        }
        if (req.query.location) {
            earlyMatch.event_venue = { $regex: req.query.location, $options: 'i' }
        }
        if (req.query.event_tag) {
            earlyMatch.event_tags = { $in: await getIntIdFromArray(req.query.event_tag) }
        }
        if (req.query.list_event_type) {
            earlyMatch.list_event_type = Number.parseInt(req.query.list_event_type)
        }
        if (!Number.isNaN(Number.parseInt(req.query.event_status))) {
            const presentDateTime = getPresentDateTime()
            if (presentDateTime) {
                const present_date_time = new Date(presentDateTime)
                const status = Number.parseInt(req.query.event_status)
                if (status === 1) {
                    earlyMatch.start_date = { $lte: present_date_time }
                    earlyMatch.end_date = { $gte: present_date_time }
                } else if (status === 2) {
                    earlyMatch.start_date = { $gte: present_date_time }
                } else if (status === 3) {
                    earlyMatch.end_date = { $lte: present_date_time }
                }
            }
        }

        // ─── Late match (post-lookup filters) ────────────────────────────────
        const lateMatchArray: any[] = [
            {
                $or: [
                    { login_status: 1, list_event_type: 1 },
                    { company_active_status: 1, list_event_type: 2 },
                    { list_event_type: 3, login_status: 1, company_active_status: 1 }
                ]
            }
        ]

        if (req.query.registered_type) {
            if (req.query.registered_type == 1) {
                lateMatchArray.push({ speaker_user_row_id: user_row_id })
            } else {
                lateMatchArray.push({ attendee_user_row_id: user_row_id })
            }
        } else {
            lateMatchArray.push({
                $or: [
                    { speaker_user_row_id: user_row_id },
                    { attendee_user_row_id: user_row_id }
                ]
            })
        }

        const lateMatch = { $and: lateMatchArray }

        const key = `users_registered_list_${user_row_id}_${skip}_${limit}_${JSON.stringify(req.query)}`
        const cache_response = await redisCache.getCache({ key })
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message.list,
                count: cache_response.message.count,
                cache_response_status: true
            }
        }

        // ─── Shared base pipeline (used for both data + count) ───────────────
        const basePipeline: any[] = [
            { $match: earlyMatch },  // ← filter early, before any lookups
            { $sort: { end_date: -1 } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1 } },
                        { $limit: 1 },
                        { $project: { _id: 1, login_status: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $limit: 1 },
                        { $project: { _id: 1, active_status: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_events_speakers",
                    localField: "_id",
                    foreignField: "event_row_id",
                    let: { userId: user_row_id },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$user_row_id", "$$userId"] }, { $eq: ["$user_type", 1] }] } } },
                        { $limit: 1 },
                        { $project: { user_row_id: 1 } }
                    ],
                    as: "event_speaker"
                }
            },
            { $unwind: { path: "$event_speaker", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_events_attendees",
                    localField: "_id",
                    foreignField: "event_row_id",
                    let: { userId: user_row_id },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$user_row_id", "$$userId"] }, { $eq: ["$user_type", 1] }] } } },
                        { $limit: 1 },
                        { $project: { user_row_id: 1, invitation_status: 1, _id: 1 } }
                    ],
                    as: "event_guest"
                }
            },
            { $unwind: { path: "$event_guest", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    login_status: "$user_info.login_status",
                    company_active_status: "$company_info.active_status",
                    speaker_user_row_id: { $ifNull: ["$event_speaker.user_row_id", 0] },
                    attendee_user_row_id: { $ifNull: ["$event_guest.user_row_id", 0] },
                    invitation_status: { $ifNull: ["$event_guest.invitation_status", 0] },
                    invitation_id: { $ifNull: ["$event_guest._id", 0] },
                    registered_type: {
                        $cond: {
                            if: { $eq: [{ $ifNull: ["$event_speaker.user_row_id", 0] }, user_row_id] },
                            then: 1,
                            else: 2
                        }
                    }
                }
            },
            { $match: lateMatch },  // ← late match after computed fields
        ]

        // ─── Run data + count in parallel ────────────────────────────────────
        const [get_query, count_query] = await Promise.all([
            eventM.aggregate([
                ...basePipeline,
                {
                    $lookup: {
                        from: "cln_event_watchlists",
                        localField: "_id",
                        foreignField: "event_row_id",
                        let: { userId: user_row_id },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$user_row_id", "$$userId"] } } },
                            { $limit: 1 },
                            { $project: { user_row_id: 1 } }
                        ],
                        as: "user_watchlist"
                    }
                },
                { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_events_utc_dates",
                        localField: "utc_row_id",
                        foreignField: "_id",
                        pipeline: [
                            { $limit: 1 },
                            { $project: { utc_time: 1 } }
                        ],
                        as: "utc_dates"
                    }
                },
                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                {
                    // CONFIRMED BUG FIX: this list supports filtering by event_tag but never
                    // returned the resolved tag names, unlike every other list-style event
                    // query in this codebase (e.g. controllers/admin_panel/events/event.js,
                    // front_page_events.js), which all $lookup cln_events_tags and project it
                    // as event_tags_array.
                    $lookup: {
                        from: "cln_events_tags",
                        localField: "event_tags",
                        foreignField: "_id",
                        as: "eventTags"
                    }
                },
                {
                    $set: {
                        watchlist_status: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } },
                        utc_time: "$utc_dates.utc_time",
                    }
                },
                {
                    $project: {
                        _id: 1,
                        event_title: 1,
                        event_type: 1,
                        event_image_type: 1,
                        event_image: 1,
                        alt_image_text: 1,
                        event_venue: 1,
                        event_url: 1,
                        start_date: 1,
                        end_date: 1,
                        event_price: 1,
                        speaker_user_row_id: 1,
                        attendee_user_row_id: 1,
                        invitation_status: 1,
                        invitation_id: 1,
                        list_event_type: 1,
                        registered_type: 1,
                        watchlist_status: 1,
                        utc_time: 1,
                        event_tags_array: "$eventTags"
                    }
                },
                { $skip: skip },
                { $limit: limit }
            ]),
            eventM.aggregate([
                ...basePipeline,
                { $count: "count" }
            ])
        ])

        const total_counts = count_query[0]?.count ?? 0

        await redisCache.setCache({
            key,
            value: { list: get_query, count: total_counts },
            ttl: CacheDuration.SIX_HOURS
        })

        return { status: true, message: get_query, count: total_counts, cache_response_status: false }
    } catch (error) {
        console.error('Error in getRegisteredUsers:', error)
        return { status: false, message: { alert_message: 'Internal server error' } }
    }
}