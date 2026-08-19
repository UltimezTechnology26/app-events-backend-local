import { getEventsData, filterQuery } from '../../utils/helpers/events_helper';
import redisCache, { CacheDuration } from '../../config/redis';
import eventM from '../../models/app/events/eventM';
import { getDistanceFromLatLon, getIntIdFromArray, getPresentDateTime } from '../../utils/helpers/helper';
import event_link_display_detailsM from '../../models/app/events/event_link_display_detailsM';
import event_faqM from '../../models/app/events/event_faqM';
import event_collaborationM from '../../models/app/events/event_collaborationM';
import event_guestsM from '../../models/app/events/event_guestsM';
import ticketM from '../../models/app/events/ticketM';
import couponM from '../../models/app/events/couponM';
import event_tagsM from '../../models/app/static/event_tagsM';
import notify_userM from '../../models/app/events/notify_userM';
import event_contactsM from '../../models/app/events/event_contactsM';
import event_attendeesM from '../../models/app/events/event_attendeesM';
import collaboration_users_requestsM from '../../models/app/events/collaboration_users_requestsM';
import event_speakersM from '../../models/app/events/event_speakersM';
import event_sponsors_partner_detailsM from '../../models/app/events/event_sponsors_partner_detailsM';
import deleted_eventsM from '../../models/app/events/deleted_eventsM';
import countryM from '../../models/app/static/countryM';
import sanitize from 'mongo-sanitize';
import event_watchlistsM from '../../models/app/watchlist/eventM';
import { getPositionResolutionStages } from '../../modules/work-experience/work-experience.queries';
import { joinPositionNamesExpr } from '../../modules/funding/funding.queries';
import professionals_followersM from '../../models/app/professionals_followersM';
import company_followersM from '../../models/app/company/followersM';

interface EventParams {
    skip: number;
    limit: number;
    req: any;
}

interface EventResponse {
    status: boolean;
    message?: any;
    count?: number;
    topCountries?: any;
    cache_reponse_status?: boolean;
    err?: string;
}

interface EventsDataResult {
    list: any;
    count: number;
    ongoingCount?: number;
    upcomingCount?: number;
    endedCount?: number;
    topCountries?: any;
}

export const getAllEvents = async (params: EventParams): Promise<EventResponse> => {
    try {
        const { skip, limit, req } = params;

        let filter_array = [{ active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] }];
        let search_query = [{}];
        let { top_filter_array, search_array, sort_value } = await filterQuery({
            top_filter_array: filter_array,
            sort: undefined,
            search_array: search_query,
            req_query: req.query,
            event_status: undefined
        });

        const key = `all_events_${skip}_${limit}_${JSON.stringify(req.query)}`;

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message.list,
                count: cache_response.message.count,
                topCountries: cache_response.message.topCountries,
                cache_reponse_status: true
            };
        }

        const result: EventsDataResult = await getEventsData({
            sort_value: sort_value,
            top_filter_array: { $and: top_filter_array },
            search_query: { $and: search_array },
            req_params: req.params,
            req_headers: req.headers,
            req_query: req.query
        });

        const { list, count, ongoingCount, upcomingCount, endedCount, topCountries } = result;

        await redisCache.setCache({
            key,
            value: { list, count, ongoingCount, upcomingCount, endedCount, topCountries },
            ttl: CacheDuration.THIRTY_MINUTES
        });

        return {
            status: true,
            message: list,
            count,
            topCountries,
            cache_reponse_status: false
        };

    } catch (err: any) {
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        };
    }
};

export const getEventIndividualDetails = async (req: any, user_row_id: number) => {
    try {
        const event_url = req.params.event_url
        const key = `individual_event_${event_url}_${user_row_id}`

        const cache_response = await redisCache.getCache({ key })
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_reponse_status: true
            }
        }
        const eventsList = await eventM.aggregate([
            {
                $match: { event_url: event_url, active_status: 1, approval_status: 1 }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $lookup: {
                                from: "cln_static_company_business_models",
                                localField: "main_business_model_id",
                                foreignField: "_id",
                                as: "main_business_info"
                            }
                        },
                        // { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_static_company_business_models",
                                localField: "business_model_id",
                                foreignField: "_id",
                                as: "business_model_info"
                            }
                        },
                        // { $unwind: { path: "$business_model_info", preserveNullAndEmptyArrays: true } },
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
                            $project: {
                                company_name: 1,
                                main_business_model_name: "$main_business_info.business_name",
                                business_model_name: "$business_model_info.business_name",
                                // _id:1,
                                company_id: 1,
                                company_logo: 1,
                                logo: 1,
                                describe_in_one_line: 1,
                                facebook: 1,
                                twitter: 1,
                                linkedin: 1,
                                instagram: 1,
                                video_link: 1,
                                telegram: 1,
                                medium: 1,
                                reddit: 1,
                                country_id: 1,
                                active_status: 1,
                                approval_status: 1,
                                country_code: "$country_info.country_code",
                                country_name: "$country_info.country_name",

                            }
                        },

                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {

                $lookup:
                {
                    from: "cln_company_added_to_partners",
                    localField: "company_row_id",
                    foreignField: "company_row_id",
                    as: "partner_data"
                }
            },

            {
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
                                from: "cln_static_user_designations",
                                localField: "designation_id",
                                foreignField: "_id",
                                as: "user_tags"
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_professionals_work_experiences",
                                localField: "_id",
                                foreignField: "user_row_id",
                                pipeline: [
                                    {
                                        $match: {
                                            public_view: true,
                                            user_account_type: 1
                                        }
                                    },

                                    // Position (static + manual, full positions[] array)
                                    ...getPositionResolutionStages(),
                                    { $set: { resolved_position_name: joinPositionNamesExpr("$positions") } },

                                    // Static Company
                                    {
                                        $lookup: {
                                            from: "cln_company_lists",
                                            let: {
                                                company_type: "$company_type",
                                                company_row_id: "$company_row_id"
                                            },
                                            as: "info_company",
                                            pipeline: [
                                                {
                                                    $match: {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: [1, "$$company_type"] },
                                                                { $eq: ["$_id", "$$company_row_id"] }
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
                                    {
                                        $unwind: {
                                            path: "$info_company",
                                            preserveNullAndEmptyArrays: true
                                        }
                                    },

                                    // Manual Company
                                    {
                                        $lookup: {
                                            from: "cln_company_manual_retrievals",
                                            let: {
                                                company_type: "$company_type",
                                                company_row_id: "$company_row_id"
                                            },
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
                                                {
                                                    $project: {
                                                        _id: 1,
                                                        company_name: 1
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        $unwind: {
                                            path: "$info_manual_company",
                                            preserveNullAndEmptyArrays: true
                                        }
                                    },

                                    {
                                        $project: {
                                            position_name: "$resolved_position_name",
                                            positions: 1,
                                            company_name: {
                                                $cond: {
                                                    if: { $eq: ["$company_type", 1] },
                                                    then: "$info_company.company_name",
                                                    else: "$info_manual_company.company_name"
                                                }
                                            }
                                        }
                                    },

                                    { $limit: 1 }
                                ],
                                as: "info_work"
                            }
                        },
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                user_name: 1,
                                login_status: 1,
                                full_name: 1,
                                pro_batch: 1,
                                position_name: "$info_work.position_name",
                                positions: "$info_work.positions",
                                company_name: "$info_work.company_name",
                                user_tags: "$user_tags.designation_name",
                                email_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_social_links",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "social_info"
                }
            },
            { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_followers",
                    let: { userId: "$user_info._id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$following_user_row_id", "$$userId"] },
                                        { $eq: ["$confirm_request_status", 2] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "user_followers_list"
                }
            },
            {
                $addFields: {
                    user_follower_count: { $size: "$user_followers_list" }
                }
            },
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
                    from: "cln_events_seo_details",
                    localField: "_id",
                    foreignField: "event_row_id",
                    as: "seo_info"
                }
            },
            { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
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
                    login_status: "$user_info.login_status",
                    company_active_status: "$company_info.active_status"
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
                    company_row_id: 1,
                    list_event_type: 1,
                    user_row_id: 1,
                    event_title: 1,
                    event_tags: 1,
                    event_type: 1,
                    event_image: 1,
                    event_image_type: 1,
                    event_venue: 1,
                    event_state: 1,
                    event_city: 1,
                    event_url: 1,
                    event_link: 1,
                    start_date: 1,
                    end_date: 1,
                    ticket_link: 1,
                    partner_data: "$partner_data",
                    profile_scores: {
                        build_event_page_score: "$build_event_page_score",
                        seo_details_score: "$seo_details_score",
                        contact_details_score: "$contact_details_score",
                        tickets_coupons_score: "$tickets_coupons_score",
                        speakers_score: "$speakers_score",
                        sponsors_partners_score: "$sponsors_partners_score",
                        attendees_score: "$attendees_score",
                        faq_score: "$faq_score",
                        profile_score: "$profile_score",
                    },
                    event_card_image: 1,
                    alt_image_text: 1,
                    approval_status: 1,
                    event_description: 1,
                    describe_in_one_line: 1,
                    contact_mobile_number: 1,
                    contact_email_id: 1,
                    reason_for_reject: 1,
                    rejected_date_n_time: 1,
                    disable_reason: 1,
                    created_by_admin_status: 1,
                    created_by_sub_admin_id: 1,
                    event_price: 1,
                    speakers: 1,
                    webinar_meeting_type: 1,
                    webinar_meeting_link: 1,
                    created_date_n_time: 1,
                    seo_details: {
                        meta_keywords: { $ifNull: ["$seo_info.meta_keywords", ""] },
                        meta_description: { $ifNull: ["$seo_info.meta_description", ""] },
                        meta_title: { $ifNull: ["$seo_info.meta_title", ""] },
                        robots_index: { $ifNull: ["$seo_info.robots_index", "index"] },
                        robots_follow: { $ifNull: ["$seo_info.robots_follow", "follow"] },
                        og_title: { $ifNull: ["$seo_info.og_title", ""] },
                        og_description: { $ifNull: ["$seo_info.og_description", ""] },
                        twitter_title: { $ifNull: ["$seo_info.twitter_title", ""] },
                        twitter_description: { $ifNull: ["$seo_info.twitter_description", ""] },
                        twitter_creator: { $ifNull: ["$seo_info.twitter_creator", ""] },
                    },
                    longitude: 1,
                    latitude: 1,
                    login_status: 1,
                    view_counts: 1,
                    user_follower_count: "$user_follower_count",
                    user_full_name: "$user_info.full_name",
                    user_pro_batch: "$user_info.pro_batch",
                    user_profile_image: "$img_info.profile_image",
                    user_position_name: "$user_info.position_name",
                    user_positions: "$user_info.positions",
                    user_company_name: "$user_info.company_name",
                    user_username: "$user_info.user_name",
                    designation_id: "$user_info.designation_id",
                    user_tags: "$user_info.user_tags",
                    user_email_id: "$user_info.email_id",
                    user_facebook: "$social_info.facebook",
                    user_twitter: "$social_info.twitter",
                    user_linkedin: "$social_info.linkedin",
                    user_instagram: "$social_info.instagram",
                    user_video_link: "$social_info.video_link",
                    user_telegram: "$social_info.telegram",
                    user_medium: "$social_info.medium",
                    user_reddit: "$social_info.reddit",
                    company_id: "$company_info.company_id",
                    company_name: "$company_info.company_name",
                    company_logo: "$company_info.company_logo",
                    company_partner_status: 1,
                    company_describe_in_one_line: "$company_info.describe_in_one_line",
                    main_business_model_name: "$company_info.main_business_model_name",
                    business_model_name: "$company_info.business_model_name",
                    company_facebook: "$company_info.facebook",
                    company_twitter: "$company_info.twitter",
                    company_linkedin: "$company_info.linkedin",
                    company_instagram: "$company_info.instagram",
                    company_video_link: "$company_info.video_link",
                    company_telegram: "$company_info.telegram",
                    company_medium: "$company_info.medium",
                    company_reddit: "$company_info.reddit",
                    company_country_name: "$company_info.country_name",
                    country_code: "$country_info.country_code",
                    country_name: "$country_info.country_name",
                    sortname: "$country_info.sortname",
                    utc_row_id: 1,
                    utc_time: "$utc_dates.utc_time",
                    timezone: "$utc_dates.timezone",
                    company_active_status: 1,
                }
            }
        ]).limit(1)


        let myArr: any = {}
        if (eventsList[0]) {
            await eventM.findOneAndUpdate({ _id: eventsList[0]._id }, { $inc: { view_counts: 1 } })
            let eventDetails = eventsList[0]
            myArr['_id'] = eventDetails._id
            myArr['invitation_id'] = 0
            myArr['un_registered_guest_full_name'] = ""
            myArr['un_registered_guest_email_id'] = ""

            myArr['country_code'] = eventDetails.country_code ? eventDetails.country_code : ""
            myArr['country_name'] = eventDetails.country_name ? eventDetails.country_name : ""
            myArr['sortname'] = eventDetails.sortname ? eventDetails.sortname : ""
            myArr['user_follower_count'] = eventDetails.user_follower_count ?? 0;
            myArr['event_title'] = eventDetails.event_title
            myArr['partner_data'] = eventDetails.partner_data
            myArr['event_tags'] = eventDetails.event_tags
            myArr['event_type'] = eventDetails.event_type
            myArr['event_image'] = eventDetails.event_image
            myArr['event_image_type'] = eventDetails.event_image_type
            myArr['event_venue'] = eventDetails.event_venue
            myArr['event_state'] = eventDetails.event_state
            myArr['event_city'] = eventDetails.event_city
            myArr['event_url'] = eventDetails.event_url
            myArr['event_link'] = eventDetails.event_link
            myArr['start_date'] = eventDetails.start_date
            myArr['end_date'] = eventDetails.end_date
            myArr['approval_status'] = eventDetails.approval_status
            myArr['event_description'] = eventDetails.event_description
            myArr['webinar_meeting_type'] = eventDetails.webinar_meeting_type
            myArr['webinar_meeting_link'] = eventDetails.webinar_meeting_link
            myArr['alt_image_text'] = eventDetails.alt_image_text

            myArr['contact_mobile_number'] = eventDetails.contact_mobile_number
            myArr['contact_email_id'] = eventDetails.contact_email_id
            myArr['active_status'] = eventDetails.active_status
            myArr['reason_for_reject'] = eventDetails.reason_for_reject
            myArr['rejected_date_n_time'] = eventDetails.rejected_date_n_time
            myArr['disable_reason'] = eventDetails.disable_reason
            myArr['created_by_admin_status'] = eventDetails.created_by_admin_status
            myArr['created_by_sub_admin_id'] = eventDetails.created_by_sub_admin_id
            myArr['longitude'] = eventDetails.longitude
            myArr['latitude'] = eventDetails.latitude
            myArr['utc_row_id'] = eventDetails.utc_row_id
            myArr['utc_time'] = eventDetails.utc_time
            myArr['timezone'] = eventDetails.timezone
            myArr['login_status'] = eventDetails.login_status
            myArr['company_active_status'] = eventDetails.company_active_status
            myArr['view_counts'] = eventDetails.view_counts
            myArr['ticket_link'] = eventDetails.ticket_link
            myArr['event_card_image'] = eventDetails.event_card_image



            // myArr['ticket_status'] = eventDetails.ticket_status

            myArr['created_date_n_time'] = eventDetails.created_date_n_time
            myArr['event_price'] = eventDetails.event_price

            // Return SEO details as nested object
            myArr['seo_details'] = eventDetails?.seo_details || {}

            // Return profile scores as nested object
            myArr['profile_scores'] = eventDetails?.profile_scores || {}

            myArr['list_event_type'] = eventDetails.list_event_type
            myArr['present_time'] = getPresentDateTime()

            //Host Details
            myArr['user_full_name'] = eventDetails.user_full_name
            myArr['user_pro_batch'] = eventDetails.user_pro_batch
            myArr['user_row_id'] = eventDetails.user_row_id
            myArr['user_profile_image'] = eventDetails.user_profile_image
            myArr['user_position_name'] = eventDetails.user_position_name
            myArr['user_positions'] = eventDetails.user_positions
            myArr['user_company_name'] = eventDetails.user_company_name
            myArr['user_username'] = eventDetails.user_username
            myArr['user_tags'] = eventDetails.user_tags
            myArr['user_followed'] = eventDetails.user_followed
            myArr['user_email_id'] = eventDetails.user_email_id
            myArr['user_facebook'] = eventDetails.user_facebook
            myArr['user_twitter'] = eventDetails.user_twitter
            myArr['user_linkedin'] = eventDetails.user_linkedin
            myArr['user_instagram'] = eventDetails.user_instagram
            myArr['user_video_link'] = eventDetails.user_video_link
            myArr['user_telegram'] = eventDetails.user_telegram
            myArr['user_medium'] = eventDetails.user_medium
            myArr['user_reddit'] = eventDetails.user_reddit

            //Company Details || Organizer Details
            myArr['company_name'] = eventDetails.company_name
            myArr['company_partner_status'] = eventDetails.company_partner_status


            myArr['company_row_id'] = eventDetails.company_row_id
            myArr['company_id'] = eventDetails.company_id
            myArr['company_logo'] = eventDetails.company_logo
            myArr['company_describe_in_one_line'] = eventDetails.company_describe_in_one_line
            myArr['main_business_model_name'] = eventDetails.main_business_model_name
            myArr['business_model_name'] = eventDetails.business_model_name
            myArr['company_facebook'] = eventDetails.company_facebook
            myArr['company_twitter'] = eventDetails.company_twitter
            myArr['company_linkedin'] = eventDetails.company_linkedin
            myArr['company_instagram'] = eventDetails.company_instagram
            myArr['company_video_link'] = eventDetails.company_video_link
            myArr['company_telegram'] = eventDetails.company_telegram
            myArr['company_medium'] = eventDetails.company_medium
            myArr['company_reddit'] = eventDetails.company_reddit
            myArr['company_country_name'] = eventDetails.company_country_name

            let link_user_register_status = true
            let link_attendee_list_status = true
            let link_speaker_status = true
            let link_partner_status = true
            let link_sponsor_status = true
            let link_ticket_status = true
            // PERF FIX: fired here without an await so it runs concurrently with the
            // flag-independent queries below, instead of blocking every downstream query
            // behind one extra round trip. Resolved (and the flags extracted) just before
            // the first flag-dependent query needs them — see further down.
            const get_event_link_display_details_promise = event_link_display_detailsM.findOne({ event_row_id: eventsList[0]._id })

            const event_faqs_query = event_faqM.find({ event_row_id: eventsList[0]._id })

            const get_collaboration_query = event_collaborationM.aggregate([
                {
                    $match: { event_row_id: eventsList[0]._id }
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

            let event_guest_query = Promise.resolve([])
            if (req.query.invitation_id) {
                const invitation_id = Number.parseInt(req.query.invitation_id)
                myArr['invitation_id'] = invitation_id
                event_guest_query = event_guestsM.aggregate([
                    {
                        $match: { _id: invitation_id }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_events_guests_emails",
                            localField: "guest_email_row_id",
                            foreignField: "_id",
                            as: "guest_info"
                        }
                    },
                    { $unwind: { path: "$guest_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            full_name: "$guest_info.full_name",
                            email_id: "$guest_info.email_id"
                        }
                    }
                ]).limit(1)
            }

            // The remaining flag-independent queries below all fire immediately (still
            // concurrent with get_event_link_display_details_promise above). Only once we
            // reach the flag-dependent queries (tickets/coupon onward) do we need the
            // resolved link_* flags, so the await is placed right there instead of at the
            // top of this function — see the PERF FIX comment above.
            const event_tags_query = event_tagsM.find({ _id: { $in: eventDetails.event_tags }, active_status: true }, { _id: 1, event_tag: 1 })

            const watchlist_count_query = event_watchlistsM.countDocuments({ event_row_id: eventDetails._id })

            const user_notify_query = notify_userM.findOne({ user_row_id: user_row_id, event_row_id: eventDetails._id })

            const contact_details_query = event_contactsM.aggregate([
                { $match: { event_row_id: eventDetails._id } },
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
                    $project:
                    {
                        contact_number: 1,
                        contact_type: 1,
                        contact_reason: 1,
                        email_id: 1,
                        country_id: 1,
                        contact_username: 1,
                        contact_type_name: "$contact_type_info.contact_type_name",
                        country_code: "$country_info.country_code",
                        country_name: "$country_info.country_name"
                    }
                }
            ])

            let event_guests_query = Promise.resolve(null)
            let event_user_attendee_query = Promise.resolve(null)
            let collaboration_users_requests_query = Promise.resolve(null)
            // PERF FIX (cache split): these two used to be $lookup stages inside the main
            // aggregate, filtered on user_row_id — which made the whole aggregate result
            // viewer-specific and un-cacheable across users. Extracted here as standalone
            // queries so the main aggregate can be cached once per event_url; see the cache
            // key change further down.
            let user_followed_status_query: Promise<any> = Promise.resolve(null)
            let company_followed_status_query: Promise<any> = Promise.resolve(null)

            if (user_row_id) {
                event_guests_query = event_attendeesM.findOne({ event_row_id: eventDetails._id, user_type: 1, user_row_id: user_row_id, invitation_status: 1 })

                event_user_attendee_query = event_watchlistsM.findOne({ event_row_id: eventDetails._id, user_row_id: user_row_id }, { _id: 1 })

                collaboration_users_requests_query = collaboration_users_requestsM.findOne({ event_row_id: eventDetails._id, user_row_id: user_row_id }, { _id: 1 })

                user_followed_status_query = professionals_followersM.findOne(
                    { following_user_row_id: eventDetails.user_row_id, follower_user_row_id: user_row_id, confirm_request_status: 2 },
                    { _id: 1 }
                ).lean()

                company_followed_status_query = company_followersM.findOne(
                    { company_row_id: eventDetails.company_row_id, user_row_id: user_row_id },
                    { _id: 1 }
                ).lean()
            }

            // Resolve the link-display flags now — every flag-independent query above is
            // already in flight, so this await no longer blocks them. Only the queries
            // below (tickets, coupons, speakers, attendees, sponsors, partners) need it.
            const get_event_link_display_details = await get_event_link_display_details_promise
            if (get_event_link_display_details) {
                link_user_register_status = get_event_link_display_details.link_user_register_status
                link_attendee_list_status = get_event_link_display_details.link_attendee_list_status
                link_speaker_status = get_event_link_display_details.link_speaker_status
                link_partner_status = get_event_link_display_details.link_partner_status
                link_sponsor_status = get_event_link_display_details.link_sponsor_status
                link_ticket_status = get_event_link_display_details.link_ticket_status
            }

            myArr['link_user_register_status'] = link_user_register_status
            myArr['link_attendee_list_status'] = link_attendee_list_status
            myArr['link_speaker_status'] = link_speaker_status
            myArr['link_partner_status'] = link_partner_status
            myArr['link_sponsor_status'] = link_sponsor_status
            myArr['link_ticket_status'] = link_ticket_status

            let tickets_query = Promise.resolve([])
            if (link_ticket_status) {
                tickets_query = ticketM.find({ event_row_id: eventDetails._id }).sort({ price: 1 })
            }
            let coupon_query = Promise.resolve([]);
            if (link_ticket_status) {
                coupon_query = couponM.find({ event_row_id: eventDetails._id })
            }

            const speakers_query_promise = link_speaker_status
                ? event_speakersM.aggregate([
                    {
                        $match: {
                            event_row_id: eventDetails._id,

                            $or: [
                                { requested_status: { $in: [1, 3] } },
                                { requested_status: null }
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
                                    $project:
                                    {
                                        _id: 1,
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
                        $lookup: {
                            from: "cln_professionals_work_experiences",
                            let: {
                                user_type: "$user_type",
                                user_row_id: "$user_data._id"
                            },
                            pipeline: [
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

                                // Position (static + manual, full positions[] array)
                                ...getPositionResolutionStages(),
                                { $set: { resolved_position_name: joinPositionNamesExpr("$positions") } },

                                // Static Company
                                {
                                    $lookup: {
                                        from: "cln_company_lists",
                                        let: {
                                            company_type: "$company_type",
                                            company_row_id: "$company_row_id"
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
                                                                    { $eq: ["$$company_type", 1] },
                                                                    { $eq: ["$_id", "$$company_row_id"] }
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
                                {
                                    $unwind: {
                                        path: "$info_company",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },

                                // Manual Company
                                {
                                    $lookup: {
                                        from: "cln_company_manual_retrievals",
                                        let: {
                                            company_type: "$company_type",
                                            company_row_id: "$company_row_id"
                                        },
                                        as: "info_manual_company",
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$$company_type", 2] },
                                                            { $eq: ["$_id", "$$company_row_id"] }
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
                                {
                                    $unwind: {
                                        path: "$info_manual_company",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },

                                {
                                    $project: {
                                        position_name: "$resolved_position_name",
                                        positions: 1,
                                        company_name: {
                                            $cond: {
                                                if: { $eq: ["$company_type", 1] },
                                                then: "$info_company.company_name",
                                                else: "$info_manual_company.company_name"
                                            }
                                        }
                                    }
                                },

                                { $limit: 1 }
                            ],
                            as: "info_work"
                        }
                    },
                    {
                        $unwind: {
                            path: "$info_work",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    { $match: { user_data: { $exists: true, $ne: "" } } },
                    {
                        $project:
                        {
                            _id: 1,
                            user_row_id: 1,
                            user_type: 1,
                            approval_status: { $cond: { if: "$user_data.approval_status", then: "$user_data.approval_status", else: 0 } },
                            user_name: "$user_data.user_name",
                            full_name: "$user_data.full_name",
                            pro_batch: "$user_data.pro_batch",
                            email_id: "$user_data.email_id",
                            profile_image: "$user_data.profile_image",
                            work_position: "$info_work.position_name",
                            positions: "$info_work.positions",
                            company_name: "$info_work.company_name"
                        }
                    }
                ])
                : Promise.resolve([])



            let related_events_promise = Promise.resolve({ list: [] })
            let related_events_past_promise = Promise.resolve({ list: [] })
            let related_events_check_in_array = []
            if (eventDetails.company_row_id) related_events_check_in_array.push({ company_row_id: eventDetails.company_row_id })
            if (eventDetails.user_row_id) related_events_check_in_array.push({ user_row_id: eventDetails.user_row_id })

            if (related_events_check_in_array.length) {
                const search_query = [{}]
                const sort_value = { start_date: 1 }

                related_events_promise = getEventsData({
                    sort_value,
                    top_filter_array: { $and: [{ _id: { $ne: eventDetails._id }, active_status: 1, approval_status: 1, end_date: { $gte: new Date(getPresentDateTime() as any) }, $or: related_events_check_in_array }] },
                    search_query: { $and: search_query },
                    req_headers: req.headers,
                    req_params: { skip: 0, limit: 5 },
                    req_query: undefined
                })

                related_events_past_promise = getEventsData({
                    sort_value,
                    top_filter_array: { $and: [{ _id: { $ne: eventDetails._id }, active_status: 1, approval_status: 1, end_date: { $lt: new Date(getPresentDateTime() as any) }, $or: related_events_check_in_array }] },
                    search_query: { $and: search_query },
                    req_headers: req.headers,
                    req_params: { skip: 0, limit: 5 },
                    req_query: undefined
                })
            }

            const attendees_query_promise = link_attendee_list_status
                ? event_attendeesM.aggregate([
                    // Filter to this event's accepted attendees FIRST (uses the
                    // {event_row_id:1, invitation_status:1} index) — previously this
                    // ran after every lookup below, so the professionals/manual/work-
                    // experience lookups executed for every attendee of every event.
                    { $match: { event_row_id: eventDetails._id, invitation_status: 1 } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "user_row_id",
                            foreignField: "_id",
                            let: {
                                user_type: '$user_type'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: { $eq: [1, '$$user_type'] }
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
                                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } }, {
                                    $project:
                                    {
                                        user_name: 1,
                                        pro_batch: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        approval_status: 1,
                                        profile_image: "$img_info.profile_image",
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
                            localField: "user_row_id",
                            foreignField: "_id",
                            let: {
                                user_type: '$user_type'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: [2, '$$user_type'] }
                                    }
                                },

                                {
                                    $project:
                                    {
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
                            localField: "user_row_id",
                            foreignField: "user_row_id",
                            let: {
                                user_type: '$user_type'
                            },
                            as: "outer_info_work",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            { public_view: true },
                                            {
                                                $expr: { $eq: ['$user_account_type', '$$user_type'] }
                                            }
                                        ]
                                    }
                                },
                                // Position (static + manual, full positions[] array)
                                ...getPositionResolutionStages(),
                                { $set: { resolved_position_name: joinPositionNamesExpr("$positions") } },
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
                                        position_name: "$resolved_position_name",
                                        positions: 1,
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                        }
                    },
                    { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },
                    // event_row_id/invitation_status already filtered at the top of the
                    // pipeline — only the lookup-derived user_data check remains here.
                    {
                        $match: { user_data: { $exists: true, $ne: "" } }
                    },
                    {
                        $project: {
                            approval_status: "$user_info.approval_status",
                            user_row_id: 1,
                            user_type: 1,
                            invitation_status: 1,
                            position_name: "$outer_info_work.position_name",
                            positions: "$outer_info_work.positions",
                            company_name: "$outer_info_work.company_name",
                            user_name: "$user_data.user_name",
                            full_name: "$user_data.full_name",
                            pro_batch: "$user_data.pro_batch",
                            email_id: "$user_data.email_id",
                            profile_image: "$user_data.profile_image"
                        }
                    }
                ]).sort({ _id: -1 })
                : Promise.resolve([])


            const sponsors_query_promise = link_sponsor_status
                ? event_sponsors_partner_detailsM.aggregate([
                    {
                        $match: {
                            event_row_id: eventDetails._id,
                            sponsor_partner_type: 1,
                            $or: [
                                { requested_status: { $in: [1, 3] } },
                                { requested_status: null }
                            ]
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_sponsor_categories",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "info_sponsor_category",
                            pipeline: [
                                {
                                    $project: {
                                        sponsorship_name: 1,
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_sponsor_category", preserveNullAndEmptyArrays: true } },
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
                                    $project: {
                                        _id: 1,
                                        user_name: 1,
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        pro_batch: 1,
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
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "outer_info_work",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            { user_row_id: { $nin: ["", null] } },
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$account_type'] },
                                                        { $eq: ['$user_account_type', '$$registered_type'] },
                                                        { $eq: ['$user_row_id', '$$user_company_row_id'] },
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                },
                                // Position (static + manual, full positions[] array)
                                ...getPositionResolutionStages(),
                                { $set: { resolved_position_name: joinPositionNamesExpr("$positions") } },
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
                                        position_name: "$resolved_position_name",
                                        positions: 1,
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                        }
                    },
                    { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },
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
                            category_row_id: 1,
                            sponsor_partner_type: 1,
                            account_type: 1,
                            registered_type: 1,
                            user_company_row_id: 1,
                            sponsorship_type_title: 1,
                            sponsor_category_name: "$info_sponsor_category.sponsorship_name",
                            manual_type: 1,
                            created_date_n_time: 1,
                            sp_user_position_name: { $cond: { if: "$outer_info_work.position_name", then: "$outer_info_work.position_name", else: "" } },
                            sp_user_positions: "$outer_info_work.positions",
                            sp_user_company_name: { $cond: { if: "$outer_info_work.company_name", then: "$outer_info_work.company_name", else: "" } },
                            sp_image: { $cond: { if: "$sp_data.profile_image", then: "$sp_data.profile_image", else: "$sp_data.company_logo" } },
                            sp_name: { $cond: { if: "$sp_data.full_name", then: "$sp_data.full_name", else: "$sp_data.company_name" } },
                            sp_pro_batch: { $cond: { if: "$sp_data.pro_batch", then: "$sp_data.pro_batch", else: "$sp_data.pro_batch" } },
                            sp_email_id: { $cond: { if: "$sp_data.email_id", then: "$sp_data.email_id", else: "$sp_data.company_email_id" } },
                            sp_link: { $cond: { if: "$sp_data.website_link", then: "$sp_data.website_link", else: "$sp_data.user_name" } },
                            sp_approval_status: { $cond: { if: "$sp_data.approval_status", then: "$sp_data.approval_status", else: 0 } },

                        }
                    }
                ])
                : Promise.resolve([])


            const partners_query_promise = link_partner_status
                ? event_sponsors_partner_detailsM.aggregate([
                    { $match: { event_row_id: eventDetails._id, sponsor_partner_type: 2 } },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_partner_categories",
                            localField: "category_row_id",
                            foreignField: "_id",
                            as: "info_partner_category",
                            pipeline: [
                                {
                                    $project: {
                                        partnership_name: 1,
                                    }
                                }
                            ]
                        }

                    },
                    { $unwind: { path: "$info_partner_category", preserveNullAndEmptyArrays: true } },


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
                                    $project: {
                                        _id: 1,
                                        user_name: 1,
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        pro_batch: 1,
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
                        $addFields: {
                            official_partner_status: {
                                $cond: {
                                    if: {
                                        $and: [
                                            { $in: ["$info_partner_category.partnership_name", ["Media Partner", "Official Media Partner"]] },
                                            { $eq: ["$user_company_row_id", 5011] }
                                        ]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },

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
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "outer_info_work",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            { user_row_id: { $nin: ["", null] } },
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$account_type'] },
                                                        { $eq: ['$user_account_type', '$$registered_type'] },
                                                        { $eq: ['$user_row_id', '$$user_company_row_id'] },
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                },
                                // Position (static + manual, full positions[] array)
                                ...getPositionResolutionStages(),
                                { $set: { resolved_position_name: joinPositionNamesExpr("$positions") } },
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
                                        position_name: "$resolved_position_name",
                                        positions: 1,
                                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                    }
                                }
                            ],
                        }
                    },
                    { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },
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
                            company_info: "$company_info",
                            manual_type: 1,
                            created_date_n_time: 1,
                            official_partner_status: 1,
                            partner_category_name: "$info_partner_category.partnership_name",
                            sp_user_position_name: { $cond: { if: "$outer_info_work.position_name", then: "$outer_info_work.position_name", else: "" } },
                            sp_user_positions: "$outer_info_work.positions",
                            sp_user_company_name: { $cond: { if: "$outer_info_work.company_name", then: "$outer_info_work.company_name", else: "" } },
                            sp_image: { $cond: { if: "$sp_data.profile_image", then: "$sp_data.profile_image", else: "$sp_data.company_logo" } },
                            sp_name: { $cond: { if: "$sp_data.full_name", then: "$sp_data.full_name", else: "$sp_data.company_name" } },
                            sp_pro_batch: { $cond: { if: "$sp_data.pro_batch", then: "$sp_data.pro_batch", else: "" } },
                            sp_email_id: { $cond: { if: "$sp_data.email_id", then: "$sp_data.email_id", else: "$sp_data.company_email_id" } },
                            sp_link: { $cond: { if: "$sp_data.website_link", then: "$sp_data.website_link", else: "$sp_data.user_name" } },
                            sp_approval_status: { $cond: { if: "$sp_data.approval_status", then: "$sp_data.approval_status", else: 0 } },
                        }
                    }
                ])
                : Promise.resolve([])



            const [
                event_faqs, collaborations_list, event_guest_detail, tickets, coupon, event_tags_array,
                watchlist_count, user_notify, contact_details, event_guests, event_user_attendee, collaboration_users_requests,
                speakers_result, related_events_result, related_events_past_result, attendees_result, sponsors_result, partners_result,
                user_followed_status_doc, company_followed_status_doc
            ] = await Promise.all([
                event_faqs_query, get_collaboration_query, event_guest_query, tickets_query, coupon_query, event_tags_query,
                watchlist_count_query, user_notify_query, contact_details_query, event_guests_query, event_user_attendee_query, collaboration_users_requests_query,
                speakers_query_promise, related_events_promise, related_events_past_promise, attendees_query_promise, sponsors_query_promise, partners_query_promise,
                user_followed_status_query, company_followed_status_query
            ])


            myArr['speakers_list'] = speakers_result
            myArr['related_events'] = related_events_result.list.slice(0, 5)
            myArr['related_events_past'] = related_events_past_result.list.slice(0, 5)
            myArr['attendees_list'] = attendees_result
            myArr['sponsors'] = sponsors_result.length > 0 ? sponsors_result : []
            myArr['partners'] = partners_result.length > 0 ? partners_result : []

            myArr['event_faqs'] = event_faqs
            myArr['collaborations_ids_list'] = collaborations_list[0] ? collaborations_list[0].collaborations_ids_list : []
            if (event_guest_detail[0]) {
                myArr['un_registered_guest_full_name'] = event_guest_detail[0].full_name
                myArr['un_registered_guest_email_id'] = event_guest_detail[0].email_id
            }
            myArr['tickets'] = tickets
            myArr['coupons'] = coupon
            myArr['event_tags_array'] = event_tags_array
            myArr['watchlist_count'] = watchlist_count
            if (user_notify) {
                myArr['user_notify_status'] = true
            }
            myArr['guest_register_status'] = !!event_guests
            myArr['watchlist_status'] = !!event_user_attendee
            myArr['collaboration_requested_status'] = !!collaboration_users_requests
            myArr['user_followed_status'] = user_followed_status_doc ? 2 : 0
            myArr['company_followed_status'] = company_followed_status_doc ? 1 : 0
            myArr['contact_details'] = contact_details[0] ? contact_details : []

            // res.json({ status: true, message: myArr })
            await redisCache.setCache({
                key,
                value: myArr,
                ttl: 1800
            })

            return { status: true, message: myArr, cache_reponse_status: false }



        }
        else {
            let result: any = {}
            result['alert_message'] = 'This event url is not valid.'
            result['event_status'] = 0

            const get_event_active_status = await eventM.findOne({ event_url: event_url, active_status: 0 }).collation({ locale: 'en', strength: 2 })
            if (get_event_active_status) {
                result['event_status'] = 1
                result['alert_message'] = 'This event is disabled.'
            }

            const get_event_deleted_status = await deleted_eventsM.findOne({ event_url: event_url }).collation({ locale: 'en', strength: 2 })
            if (get_event_deleted_status) {
                result['event_status'] = 2
                result['alert_message'] = 'This event is deleted.'
            }

            return { status: false, message: result }
            // return res.json({ status: false, message: result, cache_reponse_status: false })



        }
    } catch (error) {
        console.error("❌ Error in getEventIndividualDetails:", error);
        return {
            status: false,
            message: "Something went wrong while fetching event details."
        };
    }
}


export const getSpeakerList = async (req: any, skip: number, limit: number, user_row_id: string) => {
    try {
        let searchArray = [{}]
        if (req.query.search) {
            searchArray.push({ $or: [{ user_name: { '$regex': req.query.search, $options: 'i' } }, { company_name: { '$regex': req.query.search, $options: 'i' } }, { full_name: { '$regex': req.query.search, $options: 'i' } }, { work_position: { '$regex': req.query.search, $options: 'i' } }] })
        }

        // if (req.query.tags) {
        //     searchArray.push({ designation_id: { $in: await getIntIdFromArray(req.query.tags) } })
        // }
        if (req.query.tags) {
            let tagsArray = [];
            if (Array.isArray(req.query.tags)) {
                tagsArray = req.query.tags;
            } else {
                tagsArray = String(req.query.tags).split(',').map(x => x.trim()).filter(Boolean);
            }
            const ids = await getIntIdFromArray(tagsArray);
            if (ids && ids.length > 0) {
                searchArray.push({ designation_id: { $in: ids } });
            }
        }

        let query = { $and: searchArray }
        const cachePrefix = `speakers_list`;
        const cacheKey = `${cachePrefix}_${skip}_${limit}_${req.query.search || req.query.tags || ""}_${user_row_id}`;

        // const cacheKey = `speakers_list_${skip}_${limit}_${req.query.search || ""}_${req.query.user_type || ""}_${req.query.active_type || ""}`

        const cache_response = await redisCache.getCache({ key: cacheKey })
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message.list,
                count: cache_response.message.count,
                cache_response_status: true,

            }
        }


        const eventsList = await event_speakersM.aggregate([
            { $match: { user_type: 1 } },
            {
                $lookup:
                {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        {
                            $match: {
                                active_status: 1,
                                approval_status: 1
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
            { $unwind: { path: "$event_info" } },
            {
                $group: {
                    _id: "$user_row_id",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1, _id: 1 }
            },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                login_status: 1, approval_status: 1
                            }
                        },
                        { $limit: 1 },
                        {
                            $lookup:
                            {
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
                                from: "cln_static_user_designations",
                                localField: "designation_id",
                                foreignField: "_id",
                                as: "designation_info",
                                pipeline: [
                                    {
                                        $project: {
                                            _id: 0,
                                            designation_name: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                pro_batch: 1,
                                designation_id: 1,
                                designation_array: "$designation_info.designation_name",
                                approval_status: 1,
                                profile_image: "$img_info.profile_image"
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info" } },
            {
                $lookup:
                {
                    from: "cln_professionals_work_experiences",
                    localField: "_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$public_view', true] },
                                        { $eq: ['$user_account_type', 1] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 },
                        // {
                        //     $lookup:
                        //     {
                        //         from: "cln_static_professionals_work_positions",
                        //         localField: "position_row_id",
                        //         foreignField: "_id",
                        //         as: "info_position",
                        //         pipeline: [
                        //             { $limit: 1 },
                        //             {
                        //                 $project: {
                        //                     _id: 1,
                        //                     position_name: 1
                        //                 }
                        //             }
                        //         ]
                        //     }
                        // },
                        // { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
                        // {
                        //     $project: {
                        //         position_name: '$info_position.position_name'
                        //     }
                        // }
                        // Position (static + manual, full positions[] array)
                        ...getPositionResolutionStages(),
                        {
                            $set: {

                                position_name: joinPositionNamesExpr("$positions"),
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                as: "info_company",
                                pipeline: [
                                    { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                    { $project: { _id: 1, company_name: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_company_manual_retrievals",
                                let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                as: "info_manual_company",
                                pipeline: [
                                    { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                    { $project: { _id: 1, company_name: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                            }
                        },
                    ],
                    as: "info_work",
                }
            },
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_followers",
                    localField: "user_info._id",
                    foreignField: "following_user_row_id",
                    pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                    as: "user_followed"
                }
            },
            { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
            {
                $set:
                {
                    user_name: "$user_info.user_name",
                    designation_id: "$user_info.designation_id",
                    full_name: "$user_info.full_name",
                    pro_batch: "$user_info.pro_batch",
                    position_name: "$info_work.position_name",
                    positions: "$info_work.positions",
                    company_name: "$info_work.company_name"
                }
            },
            { $match: query },
            {
                $project:
                {
                    _id: 1,
                    user_profile_image: "$user_info.profile_image",
                    designation_array: "$user_info.designation_array",
                    full_name: 1,
                    pro_batch: 1,
                    user_name: 1,
                    company_name: 1,
                    position_name: 1,
                    positions: 1,
                    count: 1,
                    user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }

                }
            }
        ]).skip(skip).limit(limit)


        const count_speakers_query = await event_speakersM.aggregate([
            { $match: { user_type: 1 } },
            {
                $lookup:
                {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        {
                            $match: {
                                active_status: 1,
                                approval_status: 1
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
            { $unwind: { path: "$event_info" } },
            {
                $group: {
                    _id: "$user_row_id",
                    count: { $sum: 1 }
                }
            },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                login_status: 1, approval_status: 1
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                designation_id: 1,
                                full_name: 1,
                                user_tags: 1,
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info" } },
            {
                $set:
                {

                    user_name: "$user_info.user_name",
                    designation_id: "$user_info.designation_id",
                    full_name: "$user_info.full_name"
                }
            },
            { $match: query },
            {
                $count: "count"
            }
        ])

        let total_speakers = 0
        if (count_speakers_query[0]) {
            total_speakers = count_speakers_query[0].count
        }


        // res.json({ status: true, message: eventsList, count: total_speakers })
        //  const finalResult = {
        //     data: eventsList,
        //     count: speakers_counts
        // }


        await redisCache.setCache({ key: cacheKey, value: { list: eventsList, count: total_speakers }, ttl: CacheDuration.TWELVE_HOURS })

        return { status: true, message: eventsList, count: total_speakers, cache_response_status: false }

    } catch (error) {
        console.log(error)
        return { status: false, message: error }
    }
}




export const getOrganizersList = async (req: any, skip: number, limit: number, user_row_id: number) => {
    try {
        const userLat = req.query.user_latitude ? Number.parseFloat(req.query.user_latitude) : null;
        const userLon = req.query.user_longitude ? Number.parseFloat(req.query.user_longitude) : null;
        const useDistanceSearch = userLat && userLon && !Number.isNaN(userLat) && !Number.isNaN(userLon);
        const presentDateTime = getPresentDateTime() as string;

        let searchArray = [{}];
        if (req.query.search) {
            const searchTerm = req.query.search;
            searchArray.push({
                $or: [
                    { company_name: { '$regex': searchTerm, $options: 'i' } },
                    { company_id: { '$regex': searchTerm, $options: 'i' } }
                ]
            });
        }

        let countryMatch = null;
        if (req.query.location) {
            const loc = sanitize(req.query.location).trim().toLowerCase();

            const countryDetails = await countryM.find(
                {},
                { _id: 1, country_name: 1, country_flag: 1, sortname: 1, country_code: 1 }
            ).lean();

            countryMatch = countryDetails.find((c: any) =>
                c.country_name.trim().toLowerCase() === loc
            );

            if (countryMatch) {
                searchArray.push({ country_id: countryMatch._id });
                searchArray.push({
                    company_location: { $exists: true, $nin: ["", null] }
                });
            } else {
                searchArray.push({ country_id: null });
            }
        }

        const query = { $and: searchArray };
        const key = `organizers_list_${skip}_${limit}_${JSON.stringify(req.query)}_${useDistanceSearch ? `${userLat},${userLon}` : ''}_${user_row_id}`;

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            const count_to_return = cache_response.message.count || 0;
            return {
                status: true,
                message: cache_response.message.list,
                count: count_to_return,
                topCountries: cache_response.message.topCountries,
                cache_reponse_status: true
            };
        }
        const baseMatch = {
            active_status: 1,
            end_date: { $gte: new Date(presentDateTime) },
            approval_status: 1,
            company_row_id: { $gt: 0 }
        };

        const aggregationPipeline = [
            { $match: baseMatch },
            { $group: { _id: "$company_row_id", events_count: { $sum: 1 } } },
            { $sort: { events_count: -1, _id: 1 } },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        { $match: { approval_status: 1, active_status: 1 } },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                country_id: 1,
                                company_location: 1,
                                latitude: 1,
                                longitude: 1,
                                describe_in_one_line: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info",
                    pipeline: [{ $count: "count" }]
                }
            },
            {
                $set: {
                    total_followers: { $ifNull: ["$followers_info[0].count", 0] },
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    describe_in_one_line: "$company_info.describe_in_one_line",
                    company_location: "$company_info.company_location",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",
                    country_id: "$company_info.country_id"
                }
            },
            { $match: query },
            {
                $facet: {
                    data: [
                        {
                            $lookup: {
                                from: "cln_company_followers",
                                localField: "_id",
                                foreignField: "company_row_id",
                                pipeline: [{ $match: { "user_row_id": user_row_id } }],
                                as: "user_followed"
                            }
                        },
                        { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_company_watchlists",
                                localField: "_id",
                                foreignField: "company_row_id",
                                pipeline: [{ $match: { "user_row_id": user_row_id } }],
                                as: "company_watchlisted"
                            }
                        },
                        { $unwind: { path: "$company_watchlisted", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                events_count: 1,
                                total_followers: 1,
                                company_name: 1,
                                company_id: 1,
                                country_name: 1,
                                company_location: 1,
                                latitude: 1,
                                longitude: 1,
                                company_logo: "$company_info.company_logo",
                                describe_in_one_line: 1,
                                country_id: 1,
                                user_followed_status: { $cond: { if: "$user_followed.user_row_id", then: 1, else: 0 } },
                                watchlist_status: { $cond: { if: "$company_watchlisted.user_row_id", then: 1, else: 0 } },
                            }
                        }
                    ],
                    count: [{ $count: "count" }]
                }
            }
        ];

        const [aggregationResult, topCountriesAgg] = await Promise.all([
            eventM.aggregate(aggregationPipeline),
            eventM.aggregate([
                { $match: baseMatch },
                { $group: { _id: "$company_row_id" } },
                {
                    $lookup: {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    approval_status: 1,
                                    active_status: 1,
                                    company_location: {
                                        $exists: true,
                                        $ne: "",
                                        $nin: ["", null]
                                    }
                                }
                            },
                            {
                                $project: {
                                    country_id: 1,
                                    company_location: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: "$company_info" },
                {
                    $lookup: {
                        from: "cln_static_countries",
                        localField: "company_info.country_id",
                        foreignField: "_id",
                        as: "country_info"
                    }
                },
                { $unwind: "$country_info" },
                {
                    $group: {
                        _id: "$country_info._id",
                        country_name: { $first: "$country_info.country_name" },
                        country_flag: { $first: "$country_info.country_flag" },
                        organizers_count: { $sum: 1 }
                    }
                },
                { $sort: { organizers_count: -1 } },
                { $limit: 5 },
                {
                    $project: {
                        _id: 0,
                        country_id: "$_id",
                        country_name: 1,
                        country_flag: 1,
                        organizers_count: 1
                    }
                }
            ])
        ]);

        const resultData = aggregationResult[0];
        let organizersList = resultData?.data || [];
        let total_organizers = resultData?.count[0]?.count || 0;

        let finalList;
        let total_counts = total_organizers;

        if (useDistanceSearch) {
            const eventsWithDistance = organizersList.map((event: any) => {
                const rawLat = event.latitude;
                const rawLon = event.longitude;

                if (!rawLat || !rawLon) {
                    return { ...event, distance: null };
                }

                const lat = Number.parseFloat(String(rawLat).trim());
                const lon = Number.parseFloat(String(rawLon).trim());

                if (Number.isNaN(lat) || Number.isNaN(lon) || lat === 0 || lon === 0) {
                    return { ...event, distance: null };
                }

                return {
                    ...event,
                    distance: getDistanceFromLatLon(userLat, userLon, lat, lon)
                };
            });

            const filteredAndSortedList = eventsWithDistance
                .filter((event: { distance: number }) => event.distance !== null && event.distance <= 500)
                .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance);

            total_counts = filteredAndSortedList.length;
            finalList = filteredAndSortedList.slice(skip, skip + limit);
        } else {
            finalList = organizersList.slice(skip, skip + limit);
        }

        await redisCache.setCache({
            key,
            value: { list: finalList, count: total_counts, topCountries: topCountriesAgg },
            ttl: CacheDuration.TWELVE_HOURS
        });

        return {
            status: true,
            message: finalList,
            count: total_counts,
            topCountries: topCountriesAgg,
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