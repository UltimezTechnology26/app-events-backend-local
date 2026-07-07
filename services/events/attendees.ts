import { checkEventRowID, checkSpeaker, DateFormatter, updateAttendeesCount } from "../../utils/helpers/events_helper"
import event_attendeesM from "../../models/app/events/event_attendeesM"
import sanitize from "mongo-sanitize"
import { getPresentDateTime } from "../../utils/helpers/helper"
import { updateThreadNotification } from "../../utils/helpers/notification_helper"
import professionalsM from "../../models/app/professionalsM"
import event_link_display_detailsM from "../../models/app/events/event_link_display_detailsM"
import event_speakersM from "../../models/app/events/event_speakersM"
import couponM from "../../models/app/events/couponM"
import ticketM from "../../models/app/events/ticketM"
import { sendNewsEventsEmail } from "../../config/email"
import redisCache from "../../config/redis"

export const getAttendeesList = async (req: any, skip: number, limit: number) => {
    try {
        if (skip < 0 || limit <= 0 || limit > 100) {
            return { status: true, message: [], count: 0 }
        }

        const searchTerm = req.query.search ? sanitize(req.query.search).trim() : ''
        const search_query = searchTerm ? {
            $or: [
                { event_title: { $regex: searchTerm, $options: 'i' } },
                { attendee_full_name: { $regex: searchTerm, $options: 'i' } },
                { host_full_name: { $regex: searchTerm, $options: 'i' } },
                { host_company_name: { $regex: searchTerm, $options: 'i' } },
            ]
        } : {}

        const result = await event_attendeesM.aggregate([

            {
                $lookup: {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        { $match: { active_status: 1, approval_status: 1 } },
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1, approval_status: 1 } },
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
                                            user_name: 1, full_name: 1, email_id: 1,
                                            pro_batch: 1, login_status: 1,
                                            approval_status: 1,
                                            profile_image: "$img_info.profile_image"
                                        }
                                    },
                                    { $limit: 1 }
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
                                    { $match: { active_status: 1, approval_status: 1 } },
                                    {
                                        $project: {
                                            company_name: 1, company_id: 1,
                                            company_email_id: 1, approval_status: 1,
                                            active_status: 1, company_logo: 1
                                        }
                                    },
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
                        {
                            $project: {
                                event_title: 1, event_image: 1, event_url: 1,
                                alt_image_text: 1, list_event_type: 1,
                                user_name: "$user_info.user_name",
                                full_name: "$user_info.full_name",
                                pro_batch: "$user_info.pro_batch",
                                profile_image: "$user_info.profile_image",
                                email_id: "$user_info.email_id",
                                company_name: "$company_info.company_name",
                                company_id: "$company_info.company_id",
                                company_email_id: "$company_info.company_email_id",
                                company_logo: "$company_info.company_logo",
                                user_approval_status: "$user_info.approval_status",
                                user_login_status: "$user_info.login_status",
                                company_active_status: "$company_info.active_status",
                                company_approval_status: "$company_info.approval_status"
                            }
                        },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$event_info" } },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
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
                                _id: 1, user_name: 1, full_name: 1,
                                pro_batch: 1, email_id: 1,
                                approval_status: 1, login_status: 1,
                                profile_image: "$img_info.profile_image"
                            }
                        },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_manual_retrievals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_manual_info",
                    pipeline: [
                        {
                            $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 }
                        },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    user_data: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$user_type', 1] }, then: "$user_info" },
                                { case: { $eq: ['$user_type', 2] }, then: "$user_manual_info" }
                            ],
                            default: ""
                        }
                    }
                }
            },
            { $match: { user_data: { $ne: "" } } },

            {
                $set: {
                    event_title: "$event_info.event_title",
                    event_url: "$event_info.event_url",
                    attendee_user_name: "$user_data.user_name",
                    attendee_full_name: "$user_data.full_name",
                    attendee_pro_batch: "$user_data.pro_batch",
                    attendee_email_id: "$user_data.email_id",
                    host_user_name: "$event_info.user_name",
                    host_full_name: "$event_info.full_name",
                    host_company_name: "$event_info.company_name",
                    host_company_id: "$event_info.company_id"
                }
            },

            ...(searchTerm ? [{ $match: search_query }] : []),

            {
                $facet: {
                    count: [
                        { $count: "total" }
                    ],
                    data: [
                        { $sort: { _id: -1 } },
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
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
                            $project: {
                                event_row_id: 1,
                                user_type: 1,
                                user_row_id: 1,
                                invitation_status: 1,
                                invitation_type: 1,
                                created_date_n_time: 1,
                                event_title: 1,
                                sg_message_id: 1,
                                alt_image_text: "$event_info.alt_image_text",
                                event_image: "$event_info.event_image",
                                event_url: 1,
                                list_event_type: "$event_info.list_event_type",
                                host_user_name: 1,
                                host_full_name: 1,
                                host_profile_image: "$event_info.profile_image",
                                host_pro_batch: "$event_info.pro_batch",
                                host_email_id: "$event_info.email_id",
                                host_company_name: 1,
                                host_company_id: 1,
                                email_event_type: "$email_info.event_type",
                                host_company_email_id: "$event_info.company_email_id",
                                host_company_logo: "$event_info.company_logo",
                                user_approval_status: "$event_info.user_approval_status",
                                user_login_status: "$event_info.user_login_status",
                                company_active_status: "$event_info.company_active_status",
                                company_approval_status: "$event_info.company_approval_status",
                                attendee_user_name: 1,
                                attendee_full_name: 1,
                                attendee_pro_batch: 1,
                                attendee_email_id: 1,
                                attendee_profile_image: "$user_data.profile_image",
                                attendee_login_status: "$user_data.login_status",
                                attendee_approval_status: "$user_data.approval_status"
                            }
                        }
                    ]
                }
            }
        ], { allowDiskUse: true })

        const query = result[0]?.data || []
        const count = result[0]?.count[0]?.total || 0

        return { status: true, message: query, count: count }

    } catch (error) {
        console.error('Error in getAttendeesList:', error)
        return { status: false, message: [], count: 0 }
    }
}



export const saveUserAttendRequest = async (event_row_id: number, user_row_id: number) => {
    try {
        // Early validation and parallel execution
        const [check_event_res, check_query] = await Promise.all([
            checkEventRowID({ event_row_id: event_row_id, user_row_id: 0 }),
            event_attendeesM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: 1 })
        ])

        if (!check_event_res.status) {
            return { status: false, message: { alert_message: 'Sorry, Invalid event row id.' } }
        }

        // Destructure event data with defaults
        const {
            start_date = '',
            event_title = '',
            event_url = '',
            event_link = '',
            user_row_id: event_user_row_id = 0,
            event_venue = '',
            ticket_link = '',
            webinar_meeting_link = '',
            event_type = 0
        } = check_event_res.message

        // Early exit if user is event host
        if (user_row_id === event_user_row_id) {
            return { status: false, message: { alert_message: 'You are host of this particular event so you cannot register to this event' } }
        }

        // Early exit if already attending
        if (check_query) {
            if (!check_query.invitation_status) {
                await event_attendeesM.updateOne({ event_row_id: event_row_id, user_row_id: user_row_id, user_type: 1 }, { $set: { invitation_status: 1 } })
                await Promise.all([
                    redisCache.deleteKeysByPattern('all_events_*'),
                    redisCache.deleteKeysByPattern('individual_event_*'),
                    redisCache.deleteKeysByPattern('users_registered_list_*'),
                    redisCache.deleteKeysByPattern('events_watchlist_*'),
                    redisCache.deleteKeysByPattern('app_company_individual_other_details_*'),
                    redisCache.deleteKeysByPattern('manage_events_list_*'),
                    redisCache.deleteKeysByPattern('app_user_other_details_*'),
                    redisCache.deleteKeysByPattern('event_attendees_list_*')
                ])
                return { status: true, message: { alert_message: 'Your request to attend event has been accepted successfully.' } }
            } else if (check_query.invitation_status === 1) {
                return { status: false, message: { alert_message: 'Sorry, Your attend request for this event is already exist.' } }
            } else if (check_query.invitation_status === 2) {
                return { status: false, message: { alert_message: 'Sorry, Your attend request for this event has been rejected.' } }
            } else {
                return { status: false, message: { alert_message: 'Sorry, Your attend request for this event is in pending state.' } }
            }
        } else {
            // Check if user is already a speaker
            const check_speaker = await checkSpeaker({ event_row_id, user_row_id, user_type: 1 })
            if (!check_speaker.status) {
                return { status: false, message: { alert_message: 'Sorry, You are already attending this event as a Speaker.' } }
            }

            // Create attendance record
            const insertObject = {
                event_row_id: event_row_id,
                user_row_id: user_row_id,
                user_type: 1,
                invitation_status: 1,
                invitation_type: 1,
                created_date_n_time: getPresentDateTime()
            }
            const insert_query = await event_attendeesM(insertObject).save()

            // Parallel cache invalidation
            await Promise.all([
                redisCache.deleteKeysByPattern('all_events_*'),
                redisCache.deleteKeysByPattern('individual_event_*'),
                redisCache.deleteKeysByPattern('users_registered_list_*'),
                redisCache.deleteKeysByPattern('events_watchlist_*'),
                redisCache.deleteKeysByPattern('app_company_individual_other_details_*'),
                redisCache.deleteKeysByPattern('manage_events_list_*'),
                redisCache.deleteKeysByPattern('app_user_other_details_*'),
                redisCache.deleteKeysByPattern('event_attendees_list_*')
            ])

            // Send notification to event host if exists
            if (event_user_row_id) {
                await updateThreadNotification({
                    user_row_id: event_user_row_id,
                    notify_type: 1,
                    notify_type_row_id: user_row_id,
                    message_row_id: 57,
                    action_row_id: insert_query._id,
                    event_row_id: event_row_id
                })
            }

            await updateAttendeesCount({ event_row_id })

            // Parallel operations for email data and content generation
            const [user_query, event_link_display_details, speaker_list_count, coupon_details, hasPaidTicket] = await Promise.all([
                professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1 }),
                event_link_display_detailsM.findOne({ event_row_id: event_row_id }),
                event_speakersM.countDocuments({
                    event_row_id: event_row_id,
                    $or: [
                        { requested_status: { $in: [1, 3] } },
                        { requested_status: null }
                    ]
                }),
                couponM.findOne({ event_row_id: event_row_id }),
                ticketM.exists({ event_row_id, ticket_type: 1, active_status: 1 })
            ])

            // Prepare email data
            const full_name = user_query.full_name
            const email_id = user_query.email_id
            const start_date_formatted = DateFormatter(start_date)
            const link_speaker_status = event_link_display_details?.link_speaker_status ?? true

            // Email content generation
            const header_title = 'Thanks for your interest! Stay tuned for the latest event updates.'
            const venueHtml = event_type == 1 || event_type == 2 ? ` happening at <b>${event_venue}</b>` : `, taking place virtually`;
            const speakerText = speaker_list_count && link_speaker_status ? ` with ${speaker_list_count}+ Speakers.` : ''
            const virtual_link = event_type == 1 || event_type == 2 ? `` : `<a href="${webinar_meeting_link}" style="text-decoration:none;display:inline-block; margin-top: 20px">
        <button style="font-weight:700;border: none;float:right;font-size:14px;line-height:150%;color:#0052CC;background:transparent;white-space:nowrap;margin:20px 0 0 auto; font-family: 'Figtree', sans-serif !important;">
      Join
    </button>
     </a>`;
            const buyNowHtml = (ticket_link || event_link)
                ? `
                                    <a href="${ticket_link ? ticket_link : event_link}" style="text-decoration:none;display:inline-block; margin-left: auto">
        <button style="font-weight:700;border: none;font-size:14px;line-height:150%;color:#0052CC;background:transparent;white-space:nowrap;margin:8px 0 0 auto; font-family: 'Figtree', sans-serif !important;">
      Buy Ticket
    </button>
     </a>`
                : "";

            const invite_req_url = event_link
            let pass_subject = 'Thank you for registering to ' + event_title + " event"


            let message_to_pass = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                                <p style="margin: 24px 0;font-weight: 800;font-size:22px;text-transform: capitalize;color:#000; font-family: 'Figtree', sans-serif !important;">Hello ${full_name},</p>
                                <p style="color:#000;font-weight: 400;font-size:17px; font-family: 'Figtree', sans-serif !important;">
                                    We're thrilled to confirm your Interest for <b>${event_title}</b>${venueHtml} on <b>${start_date_formatted}</b>. 
                                     ${speakerText}
                                </p>
                                ${virtual_link}
                                  <div style="background:#0052CC0D;border-radius:16px;padding:24px; font-family: 'Figtree', sans-serif !important;">
  <h4 style="font-weight:700;font-size:18px;line-height:150%;color:#171717;text-align:center;margin:0 0 16px; font-family: 'Figtree', sans-serif !important;">
    Follow the next steps
  </h4>
  <div style="border-radius:8px;padding:12px;border: 1px solid #c8c8c8; display:flex;gap:8px;background:#FFFFFF;margin-top:16px;" class="what_next_item">
    <img style="width:36px;height:36px;min-width:36px;border-radius:10px;" src="https://image.coinpedia.org/static/common/calender-blue-icon_new.jpg" alt="date_blue"/>
    <h6 style="font-weight:600;font-size:14px;line-height:150%;color:#171717;margin:10px 8px 0px; font-family: 'Figtree', sans-serif !important;">
      Add this event to your calendar for reminders
    </h6>
    <a href="https://events.coinpedia.org/${event_url}" style="margin-left: auto">
      <button style="font-weight:700;border: none;font-size:14px;line-height:150%;color:#0052CC;background:transparent;white-space:nowrap;margin:8px 0 0 auto; font-family: 'Figtree', sans-serif !important;">
        View
      </button>
    </a>
  </div>

  <!-- Tickets Purchase -->
  ${hasPaidTicket ? `<div style="border-radius:8px;padding:12px;border: 1px solid #c8c8c8;background:#FFFFFF;margin-top:16px;gap:8px;">
    <div style="border-radius:0px;padding:0px;margin-top:0px;display:flex;gap:8px;" class="what_next_item">
      <img style="width:36px;height:36px;min-width:36px;border-radius:10px;" src="https://image.coinpedia.org/static/common/ticket-blue-icon_new.jpg" alt="price_ticker"/>
      <h6 style="font-weight:600;font-size:14px;line-height:150%;color:#171717;margin:10px 8px 0px; font-family: 'Figtree', sans-serif !important;">
        Book Event Tickets 
      </h6>
    </div>
    <p style="font-weight:500;font-size:11px;line-height:150%;color:#17171780;margin:8px 0 0; font-family: 'Figtree', sans-serif !important;">
      Visit the event website & purchase tickets.<a href="${ticket_link ? ticket_link : event_link}" style="text-decoration:none;display:inline-block;" ><span style="color:#0052cc">Click here</span></a>
    </p>
    ${coupon_details ?
                        `<p style="font-weight:500;font-size:10px;line-height:150%;color:#17171780;margin:0 0 8px; font-family: 'Figtree', sans-serif !important;">
                                            Use below Coupon While Booking Tickets
                                        </p>` : ''}
    ${coupon_details ?

                        `  <div style="cursor:pointer;display:flex;overflow:hidden;border-radius:8px; width: fit-content">
          <img style="width:36px;height:36px;border-right:1px dashed #fff;" src="https://image.coinpedia.org/static/common/coupon_discount-icon_new.jpg"/>
          <div style="padding:0 8px;background:#FD7E14;height:36px;display:flex;">
            <span style="font-weight:700;font-size:12px;color:#fff; margin-top: 10px; font-family: 'Figtree', sans-serif !important;" class="discount_copy">
              Get ${coupon_details.discount || ""}% Off - 
              <span style="font-size:12px;color:#17171780; font-family: 'Figtree', sans-serif !important;">${coupon_details.coupon_code}</span>
            </span>
          </div>
        </div>`: ''
                    }
</div>`: ''}

  <!-- Manage Event -->
  <div style="border-radius:8px;padding:12px;border: 1px solid #c8c8c8;background:#FFFFFF;margin-top:16px;gap:8px;">
    <div style="border-radius:0px;padding:0px;margin-top:0px;display:flex;gap:8px;" class="what_next_item">
      <img style="width:36px;height:36px;min-width:36px;border-radius:10px;" src="https://image.coinpedia.org/static/common/setting-blue-icon_new.jpg" alt="price_ticker"/>
      <h6 style="font-weight:600;font-size:14px;line-height:150%;color:#171717;margin:10px 8px 0px; font-family: 'Figtree', sans-serif !important;">
        Manage Events and Network
      </h6>
    </div>
    <p style="font-weight:500;font-size:11px;line-height:150%;color:#17171780;margin:8px 0 0; font-family: 'Figtree', sans-serif !important;">
      Visit <a href="https://events.coinpedia.org/my-events/" style="text-decoration:none;display:inline-block; color:#0052cc" ><span style="color:#0052cc; font-weight: 500;">Manage Events Page</span></a> to manage Events and Connect Coinpedia attendees
    </p>
  </div>
</div>
</div>

                                `

            // Send email and handle response
            const message_id = await sendNewsEventsEmail(email_id, pass_subject, message_to_pass, header_title, insert_query._id, event_row_id)

            if (message_id !== undefined && message_id !== null) {
                await event_attendeesM.updateOne({ _id: insert_query._id }, { $set: { sg_message_id: message_id } })
            }

            return { status: true, message: { alert_message: 'Your request to attend event has been accepted successfully.' } }
        }

    } catch (error) {
        console.error('Error in saveUserAttendRequest:', error)
        return { status: false, message: 'An unexpected error occurred. Please try again later.' }
    }
}