const express = require('express')
const router = express.Router()
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { startAndEndOfWeek, getPresentDateTime, arrangeValidation, startAndEndOfToday, startAndEndOfTomorrow, getIntIdFromArray, monthStartEndDate, createDateTime, createEndDateOnly, getDistanceFromLatLon } = require('../../../utils/helpers/helper')
const { DateFormatter, deleteEventWatchlist, filterQuery, getEventsData, } = require('../../../utils/helpers/events_helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { sendEventsEmail } = require('../../../config/email')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const { getAllEvents, getEventIndividualDetails, getSpeakerList, getOrganizersList } = require('../../../services/events/front_page')
const { getPositionResolutionStages } = require('../../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../modules/funding/funding.queries')

const event_faqM = require('../../../models/app/events/event_faqM')
const ticketM = require('../../../models/app/events/ticketM')
const companyM = require('../../../models/app/company/companyM')
const eventM = require('../../../models/app/events/eventM')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
const event_tagsM = require('../../../models/app/static/event_tagsM')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')
const professionalsM = require('../../../models/app/professionalsM')
const event_attendeesM = require('../../../models/app/events/event_attendeesM')

const notify_userM = require('../../../models/app/events/notify_userM')
const event_guestsM = require('../../../models/app/events/event_guestsM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const event_speakers_manualM = require('../../../models/app/events/event_speakers_manualM')
const events_countM = require('../../../models/app/events/events_countM')
const event_utc_datesM = require('../../../models/app/events/event_utc_datesM')
const event_search_locationM = require('../../../models/app/events/event_search_locationM')
const professionals_location_searchM = require('../../../models/app/events/professionals_location_searchM')
const event_contactsM = require('../../../models/app/events/event_contactsM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const countryM = require('../../../models/app/static/countryM')
const event_link_display_detailsM = require('../../../models/app/events/event_link_display_detailsM')
const event_collaborationM = require('../../../models/app/events/event_collaborationM')
const collaboration_users_requestsM = require('../../../models/app/events/collaboration_users_requestsM')
const couponM = require('../../../models/app/events/couponM')
const events_attendeesM = require('../../../models/app/events/event_attendeesM')

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /global_search_users/:skip/:limit. Resolves position name(s) via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions and
 * cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads position_name from
 * `$info_work.position_name` — unchanged shape. `{ $limit: 1 }` kept in its
 * original position: after position resolution, before the company lookups.
 */
function buildGlobalSearchUsersInfoWorkPipeline() {
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
 * GET /global_search_page/:event_row_id (most-frequent-attendee users section).
 * Resolves position name(s) via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions), joined
 * into a single display string via joinPositionNamesExpr, instead of the previous
 * static-only lookup. Downstream, the outer pipeline's final $project still reads
 * `position_name: "$info_work.position_name"` — unchanged shape. `{ $limit: 1 }`
 * kept in its original position: after position resolution, before the company
 * lookups.
 */
function buildGlobalSearchPageInfoWorkPipeline() {
    return [
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

/**
 * Extracted `cln_professionals_work_experiences` nested pipeline (`info_work`) for
 * GET /global_search_page/:event_row_id (all-matching-users list section,
 * professionalsM.aggregate branch). Resolves position name(s) via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions and
 * cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads `position_name:
 * "$info_work.position_name"` — unchanged shape. `{ $limit: 1 }` kept in its
 * original position: after position resolution, before the company lookups.
 */
function buildGlobalSearchAllInfoWorkPipeline() {
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
 * GET /trending (most-frequent-attendee users section). Resolves position name(s)
 * via getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions), joined into a single display string via
 * joinPositionNamesExpr, instead of the previous static-only lookup. Downstream,
 * the outer pipeline's final $project still reads `position_name:
 * "$info_work.position_name"` — unchanged shape. `{ $limit: 1 }` kept in its
 * original position: after position resolution, before the company lookups.
 */
function buildTrendingInfoWorkPipeline() {
    return [
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



router.get('/all_events/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const result = await getAllEvents({
            skip,
            limit,
            req
        });

        res.json(result);
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/upcoming_events/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = 0
        let login_token_status = true
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
            if (!user_row_id) {
                login_token_status = false
            }
        }

        if (login_token_status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const present_date_time = new Date(getPresentDateTime())

            let start_date_sort = { start_date: 1 }
            let top_filter = [{ active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] }]
            if (!Number.isNaN(Number.parseInt(req.query.date_type))) {
                const date_type = Number.parseInt(req.query.date_type)
                if (date_type === 1) {
                    const start_end_date = startAndEndOfToday()
                    top_filter.push({ start_date: { $lte: new Date(start_end_date.end_date) }, end_date: { $gte: new Date(start_end_date.start_date) } })
                }
                else if (date_type === 2) {
                    const start_end_date = startAndEndOfTomorrow()
                    top_filter.push({ start_date: { $gte: new Date(start_end_date.start_date) }, end_date: { $lte: new Date(start_end_date.end_date) } })

                }
                else if (date_type === 3) {
                    const start_end_date = startAndEndOfWeek()
                    top_filter.push({ start_date: { $gte: new Date(start_end_date.start_date) }, end_date: { $gt: present_date_time, $lte: new Date(start_end_date.end_date) } })
                }
                else if (date_type === 4) {
                    start_date_sort = { end_date: 1 }
                    const start_end_date = monthStartEndDate()
                    top_filter.push({
                        start_date: { $gte: new Date(start_end_date.start_date) },
                        end_date: { $gt: present_date_time, $lte: new Date(start_end_date.end_date) }
                    });
                }
                else if (date_type === 5) {
                    if (req.query.start_date && req.query.end_date) {
                        const start_date = createEndDateOnly(req.query.start_date)
                        const end_date = createDateTime(req.query.end_date)
                        top_filter.push({ start_date: { $lte: new Date(end_date) }, end_date: { $gte: new Date(start_date) } })
                    }
                }
                else {
                    top_filter.push({ end_date: { $gte: present_date_time } })
                }
            }
            else {
                top_filter.push({ end_date: { $gte: present_date_time } })
            }

            let searchArray = [{}]
            if (req.query.price_type) {
                if (req.query.price_type == 2) {
                    searchArray.push({ event_price: { $gt: 0 } })
                }
                else {
                    searchArray.push({ $or: [{ event_price: { $exists: false } }, { event_price: 0 }] })
                }
            }

            let location_filter = []

            let cityRegex = req.query.event_city ? sanitize(req.query.event_city) : null
            let stateRegex = req.query.event_state ? sanitize(req.query.event_state) : null
            let countryRegex = 0
            if (req.query.country && req.query.country_shortname) {
                const get_country = await countryM.findOne({ sortname: { $regex: req.query.country_shortname, $options: 'i' } }, { _id: 1 })
                if (get_country) {
                    countryRegex = get_country._id
                    location_filter.push({ contact_country_row_id: countryRegex })
                }
            }

            if (cityRegex) {
                location_filter.push({ event_city: { $regex: cityRegex, $options: 'i' } })
            }

            if (stateRegex) {
                location_filter.push({ event_state: { $regex: stateRegex, $options: 'i' } })
            }

            if (location_filter.length > 0) {
                searchArray.push({ $and: [{ event_type: { $in: [1, 3] } }, { $or: location_filter }] })
                start_date_sort = { priority: -1, event_city: -1, event_state: -1, start_date: 1 }
            }

            if (req.query.event_tag) {
                searchArray.push({ event_tags: { $in: await getIntIdFromArray(req.query.event_tag) } })
            }

            if (req.query.event_type) {
                searchArray.push({ event_type: Number.parseInt(req.query.event_type) })
            }

            if (req.query.search) {
                searchArray.push({ $or: [{ event_title: { '$regex': req.query.search, $options: 'i' } }] })
            }

            let query = { $and: searchArray }


            const eventsList = await eventM.aggregate([
                {
                    $match: { $and: top_filter }
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
                                $match: { login_status: { $ne: 1 } }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    login_status: 1
                                }
                            }]
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
                                $match: { active_status: { $ne: 1 } }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                        login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } },
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
                    $addFields: {
                        priority: {
                            $add: [
                                { $cond: [{ $regexMatch: { input: "$event_city", regex: cityRegex, options: 'i' } }, 1, 0] },
                                { $cond: [{ $regexMatch: { input: "$event_state", regex: stateRegex, options: 'i' } }, 1, 0] },
                                { $cond: [{ $eq: ["$contact_country_row_id", countryRegex] }, 1, 0] }
                            ]
                        }
                    }
                },
                { $sort: start_date_sort },
                { $match: query },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup:
                    {
                        from: "cln_event_watchlists",
                        localField: "_id",
                        foreignField: "event_row_id",
                        pipeline: [{ $match: { "user_row_id": user_row_id } }, { $project: { _id: 1 } }],
                        as: "user_watchlist",

                    }
                },
                { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_events_utc_dates",
                        localField: "utc_row_id",
                        foreignField: "_id",
                        as: "utc_dates",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    utc_time: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_static_countries",
                        localField: "contact_country_row_id",
                        foreignField: "_id",
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
                {
                    $project:
                    {
                        _id: 1,
                        login_status: 1,
                        company_active_status: 1,
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
                        event_price: 1,
                        list_event_type: 1,
                        view_counts: 1,
                        contact_country_row_id: 1,
                        country_name: "$co_info.country_name",
                        priority: 1,
                        watchlist_status: { $cond: { if: "$user_watchlist._id", then: 1, else: 0 } },
                        utc_time: "$utc_dates.utc_time"
                    }
                }

            ])


            const countQuery = await eventM.aggregate([
                {
                    $match: { $and: top_filter }
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
                                $match: { login_status: { $ne: 1 } }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    login_status: 1
                                }
                            }]
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
                                $match: { active_status: { $ne: 1 } }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                        login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
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
                { $match: query },
                {
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (countQuery[0]) {
                total_counts = countQuery[0].count
            }

            res.json({ status: true, message: eventsList, count: total_counts, top_filter, query: query, country: countryRegex })
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, Your login token is expired.' } })
        }
    }
    catch (err) {
        console.log('All events list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }
})

router.get('/global_search_events/:skip/:limit', async (req, res) => {
    try {
        let search_value = sanitize(req.query.search)
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 24

        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        if (search_value) {
            const event_query = await eventM.aggregate([
                {
                    $match: {
                        $and: [
                            { active_status: 1, approval_status: 1 },
                            { $or: [{ user_row_id: { $exists: true } }, { company_row_id: { $exists: true } }] },
                            {
                                $or: [
                                    { event_title: { $regex: search_value, $options: 'i' } },
                                    { event_tag: { $regex: search_value, $options: 'i' } }
                                ]
                            }
                        ]
                    }
                },
                { $sort: { _id: -1 } },
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
                                    _id: 0,
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
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        company_active_status: "$company_info.active_status",
                        login_status: "$user_info.login_status"
                    }
                },
                {
                    $match: {
                        $or: [
                            { login_status: 1, list_event_type: 1 },
                            { company_active_status: 1, list_event_type: 2 },
                            { list_event_type: 3, login_status: 1, company_active_status: 1 }]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_event_watchlists",
                        localField: "_id",
                        foreignField: "event_row_id",
                        pipeline: [{ $match: { "user_row_id": user_row_id } }],
                        as: "user_watchlist"
                    }
                },
                { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
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
                },
                {
                    $addFields: {
                        guest_register_status: {
                            $cond: {
                                if: { $gt: [{ $size: "$guest_registration" }, 0] },
                                then: true,
                                else: false
                            }
                        }
                    }
                },


                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_list",

                    }
                },
                // { $unwind: { path: "$speakers_list", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "speakers_list.user_row_id",
                        foreignField: "_id",
                        as: "speakers_user_details"
                    }
                },
                {
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
                },
                { $skip: skip },
                { $limit: limit },
                {
                    $project:
                    {
                        event_title: 1,
                        speakers_list: 1,
                        event_image: 1,
                        event_url: 1,
                        event_type: 1,
                        event_city: 1,
                        event_state: 1,
                        event_venue: 1,
                        start_date: 1,
                        end_date: 1,
                        event_price: 1,
                        guest_registration: 1,
                        event_tag_array: "$eventTags.event_tag",
                        watchlist_status: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } },
                    }
                }
            ])

            const event_count = await eventM.aggregate([
                {
                    $match: {
                        $and: [
                            { active_status: 1, approval_status: 1 },
                            {
                                $or: [
                                    { event_title: { $regex: search_value, $options: 'i' } },
                                    { event_tag: { $regex: search_value, $options: 'i' } }
                                ]
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
                                $project: {
                                    _id: 0,
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
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_events_tags",
                        localField: "event_tags",
                        foreignField: "_id",
                        as: "eventTags",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    event_tag: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $set:
                    {
                        event_tag: "$eventTags.event_tag",
                        company_active_status: "$company_info.active_status",
                        login_status: "$user_info.login_status"
                    }
                },
                {
                    $match: {
                        $or: [
                            { login_status: 1, list_event_type: 1 },
                            { company_active_status: 1, list_event_type: 2 },
                            { list_event_type: 3, login_status: 1, company_active_status: 1 }]
                    }
                },
                {
                    $count: "count"
                }
            ])

            let count = event_count[0] ? event_count[0].count : 0

            res.json({ status: true, message: { events: event_query, event_count: count } })
        }
        else {
            const event_query = await eventM.aggregate([
                {
                    $match: { active_status: 1, approval_status: 1, end_date: { $gte: new Date(getPresentDateTime()) } }
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
                                $match: { login_status: { $ne: 1 } }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    login_status: 1
                                }
                            }]
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
                                $match: { active_status: { $ne: 1 } }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
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
                    $set: {
                        company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                        login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                    }
                },
                { $sort: { start_date: 1 } },
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
                        from: "cln_event_watchlists",
                        localField: "_id",
                        foreignField: "event_row_id",
                        pipeline: [{ $match: { "user_row_id": user_row_id } }],
                        as: "user_watchlist"
                    }
                },
                { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
                {
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
                },
                {
                    $addFields: {
                        guest_register_status: {
                            $cond: {
                                if: { $gt: [{ $size: "$guest_registration" }, 0] },
                                then: true,
                                else: false
                            }
                        }
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "event_row_id",
                        as: "speakers_list",

                    }
                },
                // { $unwind: { path: "$speakers_list", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "speakers_list.user_row_id",
                        foreignField: "_id",
                        as: "speakers_user_details"
                    }
                },
                {
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
                },

                {
                    $project:
                    {
                        event_title: 1,
                        event_image: 1,
                        speakers_list: 1,
                        event_url: 1,
                        event_type: 1,
                        event_city: 1,
                        event_state: 1,
                        event_venue: 1,
                        start_date: 1,
                        end_date: 1,
                        event_price: 1,
                        event_tag_array: "$eventTags.event_tag",
                        guest_register_status: 1,
                        watchlist_status: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } },
                    }
                }
            ]).limit(8)
            res.json({ status: true, message: { events: event_query, event_count: 8 } })
        }
    }
    catch (err) {
        console.log('Global serach events.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/global_search_users/:skip/:limit', async (req, res) => {
    try {
        let search_value = sanitize(req.query.search)
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 24
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        if (search_value) {
            const users_query = await professionalsM.aggregate([
                {
                    $match: {
                        $and: [
                            { login_status: 1, approval_status: 1 },
                            {
                                $or: [
                                    { full_name: { '$regex': search_value, $options: 'i' } },
                                    { user_name: { '$regex': search_value, $options: 'i' } },
                                ]
                            }
                        ]
                    }
                },
                { $sort: { _id: -1 } },
                { $skip: skip },
                { $limit: limit },
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
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        as: "designation_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    designation_name: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: buildGlobalSearchUsersInfoWorkPipeline(),
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                        as: "user_followed"
                    }
                },
                { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        user_name: 1,
                        full_name: 1,
                        profile_image: "$img_info.profile_image",
                        designation_name: "$designation_info.designation_name",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }
                    }
                },
            ])

            const users_count = await professionalsM.countDocuments({
                $and: [
                    { login_status: 1, approval_status: 1 },
                    {
                        $or: [
                            { full_name: { '$regex': search_value, $options: 'i' } },
                            { user_name: { '$regex': search_value, $options: 'i' } },
                        ]
                    }
                ]
            })

            res.json({ status: true, message: { users: users_query, users_count: users_count } })

        }
        else {
            const users_query = await event_speakersM.aggregate([
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
                    $sort: { count: -1 }
                },
                { $limit: 8 },
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
                                    as: "img_info"
                                }
                            },
                            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
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
                        pipeline: buildGlobalSearchPageInfoWorkPipeline(),
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                        as: "user_followed"
                    }
                },
                { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                {
                    $project:
                    {
                        _id: 1,
                        count: 1,
                        profile_image: "$user_info.profile_image",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        company_name: "$info_work.company_name",
                        position_name: "$info_work.position_name",
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }
                    }
                }
            ])
            res.json({ status: true, message: { users: users_query, users_count: 8 } })
        }

    }
    catch (err) {
        console.log('Global serach users.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/global_search_companies/:skip/:limit', async (req, res) => {
    try {
        let search_value = sanitize(req.query.search)
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 24
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        if (search_value) {
            const company_query = await companyM.aggregate([
                {
                    $match: {
                        $and: [
                            { approval_status: 1, active_status: 1 },
                            {
                                $or: [
                                    { company_name: { '$regex': search_value, $options: 'i' } },
                                    { company_id: { '$regex': search_value, $options: 'i' } },
                                ]
                            }
                        ]
                    }
                },
                { $sort: { _id: -1 } },
                { $skip: skip },
                { $limit: limit },
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
                        from: "cln_company_followers",
                        localField: "_id",
                        foreignField: "company_row_id",
                        pipeline: [{ $match: { "user_row_id": user_row_id } }],
                        as: "user_followed"
                    }
                },
                { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        company_name: 1,
                        company_id: 1,
                        company_logo: 1,
                        company_location: 1,
                        country_name: "$co_info.country_name",
                        user_followed_status: { $cond: { if: "$user_followed.user_row_id", then: 1, else: 0 } }
                    }
                },
            ])

            const company_count = await companyM.countDocuments({
                $and: [
                    { approval_status: 1, active_status: 1 },
                    {
                        $or: [
                            { company_name: { '$regex': search_value, $options: 'i' } },
                            { company_id: { '$regex': search_value, $options: 'i' } },
                        ]
                    }
                ]
            })

            res.json({ status: true, message: { company: company_query, company_count: company_count } })

        }
        else {
            const company_query = await eventM.aggregate([
                {
                    $match: {
                        active_status: 1,
                        end_date: { $gte: new Date(getPresentDateTime()) },
                        approval_status: 1,
                        company_row_id: { $gt: 0 }
                    }
                },
                {
                    $group: {
                        _id: "$company_row_id",
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { count: -1 }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { approval_status: 1, active_status: 1 }
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
                                            $match: {
                                                login_status: 1
                                            }
                                        },
                                        {
                                            $limit: 1
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
                            { $unwind: { path: "$user_info" } },
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
                                    from: "cln_company_followers",
                                    localField: "_id",
                                    foreignField: "company_row_id",
                                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                                    as: "user_followed"
                                }
                            },
                            { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    company_name: 1,
                                    company_id: 1,
                                    company_logo: 1,
                                    company_location: 1,
                                    country_name: "$co_info.country_name",
                                    user_followed_status: { $cond: { if: "$user_followed.user_row_id", then: 1, else: 0 } }

                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $project:
                    {
                        _id: 1,
                        count: 1,
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_logo: "$company_info.company_logo",
                        company_location: "$company_info.company_location",
                        country_name: "$company_info.country_name",
                        user_followed_status: "$company_info.user_followed_status",

                    }
                }
            ]).limit(8)
            res.json({ status: true, message: { company: company_query, company_count: 8 } })
        }

    }
    catch (err) {
        console.log('Global serach companies.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/global_search_page', async (req, res) => {
    try {
        let search_value = req.query.search


        let events_search = [{
            $or: [
                { login_status: 1, list_event_type: 1 },
                { company_active_status: 1, list_event_type: 2 },
                { list_event_type: 3, login_status: 1, company_active_status: 1 }
            ]
        }]
        let users_search = [{ login_status: 1, approval_status: 1 }]
        let organizers_search = [{ approval_status: 1, active_status: 1 }]

        if (search_value) {
            events_search.push({
                $or: [
                    { event_title: { $regex: search_value, $options: 'i' } },
                    { event_tag: { $regex: search_value, $options: 'i' } }
                ]
            })

            users_search.push({
                $or: [
                    { full_name: { '$regex': search_value, $options: 'i' } },
                    { user_name: { '$regex': search_value, $options: 'i' } },
                ]
            })

            organizers_search.push({
                $or: [
                    { company_name: { '$regex': search_value, $options: 'i' } },
                    { company_id: { '$regex': search_value, $options: 'i' } },
                ]
            })

        }

        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const event_query = await eventM.aggregate([
            { $match: { active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] } },
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
                                _id: 0,
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
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_events_tags",
                    localField: "event_tags",
                    foreignField: "_id",
                    as: "eventTags",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                event_tag: 1
                            }
                        }
                    ]
                }
            },
            {
                $set:
                {
                    event_tag: "$eventTags.event_tag",
                    company_active_status: "$company_info.active_status",
                    login_status: "$user_info.login_status"
                }
            },
            { $match: { $and: events_search } },
            {
                $lookup:
                {
                    from: "cln_event_watchlists",
                    localField: "_id",
                    foreignField: "event_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "user_watchlist"
                }
            },
            { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },

            {
                $project:
                {
                    event_title: 1,
                    event_image: 1,
                    event_url: 1,
                    event_tag: 1,
                    event_type: 1,
                    event_city: 1,
                    event_state: 1,
                    event_venue: 1,
                    start_date: 1,
                    end_date: 1,
                    event_price: 1,
                    watchlist_status: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } },
                }
            },
            { $sort: { _id: -1 } }
        ])
        // .skip(skip).limit(limit)

        const event_count = await eventM.aggregate([
            { $match: { active_status: 1, approval_status: 1 } },
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
                                _id: 0,
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
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_events_tags",
                    localField: "event_tags",
                    foreignField: "_id",
                    as: "eventTags",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                event_tag: 1
                            }
                        }
                    ]
                }
            },
            {
                $set:
                {
                    event_tag: "$eventTags.event_tag",
                    company_active_status: "$company_info.active_status",
                    login_status: "$user_info.login_status"
                }
            },
            { $match: { $and: events_search } },
            {
                $count: "count"
            }
        ])

        const users_query = await professionalsM.aggregate([
            {
                $match: { $and: users_search }
            },
            { $sort: { _id: -1 } },
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
                    from: "cln_static_user_designations",
                    localField: "designation_id",
                    foreignField: "_id",
                    as: "designation_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                designation_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_professionals_work_experiences",
                    localField: "_id",
                    foreignField: "user_row_id",
                    pipeline: buildGlobalSearchAllInfoWorkPipeline(),
                    as: "info_work",
                }
            },
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                    as: "user_followed"
                }
            },
            { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    user_name: 1,
                    full_name: 1,
                    profile_image: "$img_info.profile_image",
                    designation_name: "$designation_info.designation_name",
                    position_name: "$info_work.position_name",
                    company_name: "$info_work.company_name",
                    user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }
                }
            },
        ])
        // .skip(skip).limit(limit)

        const users_count = await professionalsM.countDocuments({ $and: users_search })

        const company_query = await companyM.aggregate([
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
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }],
                    as: "user_followed"
                }
            },
            { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
            {
                $set: { business_name: "$business_info.business_name" }
            },
            {
                $match: { $and: organizers_search }
            },
            {
                $project: {
                    company_name: 1,
                    company_id: 1,
                    company_logo: 1,
                    company_location: 1,
                    country_name: "$co_info.country_name",

                    user_followed_status: { $cond: { if: "$user_followed.user_row_id", then: 1, else: 0 } }
                }
            },
            { $sort: { _id: -1 } }
        ])
        // .skip(skip).limit(limit)

        const company_count = await companyM.countDocuments({ $and: organizers_search })

        res.json({
            status: true, message: {
                events: event_query, event_count: (event_count.length > 0 && event_count[0].count) ? event_count[0].count : 0,
                speakers: users_query, users_count: users_count,
                organizers: company_query, company_count: company_count,
            }
        })

    }
    catch (err) {
        console.log('Global serach page.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})
router.get('/trending', async (req, res) => {
    try {
        const present_time = getPresentDateTime()
        const event_query = await eventM.aggregate([
            {
                $match: { active_status: 1, approval_status: 1, end_date: { $gte: new Date(present_time) }, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] }
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
                            $match: { login_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                login_status: 1
                            }
                        }]
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
                            $match: { active_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                }
            },
            { $sort: { start_date: 1 } },
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
                    event_title: 1,
                    event_image: 1,
                    event_url: 1,
                    start_date: 1,
                    end_date: 1
                }
            }
        ]).limit(5)

        const live_speakers_list_query = await event_speakersM.aggregate([
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
                $sort: { count: -1 }
            },
            { $limit: 5 },
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
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
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
                    pipeline: buildTrendingInfoWorkPipeline(),
                    as: "info_work",
                }
            },
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
            {
                $project:
                {
                    _id: 1,
                    count: 1,
                    profile_image: "$user_info.profile_image",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    company_name: "$info_work.company_name",
                    position_name: "$info_work.position_name"
                }
            }
        ])

        const organizers_list_guery = await eventM.aggregate([
            {
                $match: {
                    active_status: 1,
                    end_date: { $gte: new Date(present_time) },
                    approval_status: 1,
                    company_row_id: { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: "$company_row_id",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { approval_status: 1, active_status: 1 }
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
                                        $match: {
                                            login_status: 1
                                        }
                                    },
                                    {
                                        $limit: 1
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
                        { $unwind: { path: "$user_info" } },
                        {
                            $project: {
                                company_name: 1,
                                company_id: 1,
                                company_logo: 1,
                                company_location: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info" } },
            {
                $project:
                {
                    _id: 1,
                    count: 1,
                    company_name: "$company_info.company_name",
                    company_id: "$company_info.company_id",
                    company_logo: "$company_info.company_logo",
                    latitude: "$company_info.latitude",
                    longitude: "$company_info.longitude",

                }
            }
        ]).limit(5)


        res.json({ status: true, message: { events: event_query, speakers: live_speakers_list_query, organizers: organizers_list_guery } })

    }
    catch (err) {
        console.log('Trending.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/overview', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const events_list_query = await eventM.aggregate([
            {
                $match: {
                    end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1, approval_status: 1
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
                            $match: { login_status: { $ne: 1 } }
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
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                        {
                            $match: { active_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
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
            { $sort: { start_date: 1 } },
            {
                $lookup:
                {
                    from: "cln_event_watchlists",
                    localField: "_id",
                    foreignField: "event_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }, { $project: { _id: 1, user_row_id: 1 } }],
                    as: "user_watchlist",

                }
            },
            { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
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
                    event_title: 1,
                    event_type: 1,
                    event_image_type: 1,
                    event_image: 1,
                    event_tags: 1,
                    event_venue: 1,
                    event_url: 1,
                    event_link: 1,
                    start_date: 1,
                    end_date: 1,
                    describe_in_one_line: 1,
                    event_price: 1,
                    view_counts: 1,
                    watchlist_status: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } },
                    utc_time: "$utc_dates.utc_time",
                    // event_tag_array:"$eventTags.event_tag"
                }
            }
        ]).limit(8)

        res.json({ status: true, message: { events_list: events_list_query } })

    }
    catch (err) {
        console.log('Events Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/speakers_list/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const result = await getSpeakerList(req, skip, limit, user_row_id)
        return res.json(result)

    }
    catch (err) {
        console.log('Speakers list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/organizers_list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 24

        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }



        const result = await getOrganizersList(req, skip, limit, user_row_id)

        res.json({
            status: result.status,
            message: result.message,
            count: result.count,
            topCountries: result.topCountries,
            cache_reponse_status: result.cache_reponse_status
        })

    }
    catch (err) {
        console.log('Organizers List Error:', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})
router.get('/completed_list/:skip/:limit', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
            if (!user_row_id) {
                res.json({ status: false, message: { alert_message: 'Sorry, Your login token is expired.' } })
            }
        }

        let skip = Number.parseInt(req.params.skip)
        let limit = Number.parseInt(req.params.limit)
        let searchArray = [{}]


        if (req.query.price_type) {
            if (req.query.price_type == 2) {
                searchArray.push({ event_price: { $gt: 0 } })
            }
            else {
                searchArray.push({ $or: [{ event_price: { $exists: false } }, { event_price: 0 }] })
            }
        }

        if (req.query.location) {
            searchArray.push({ event_venue: { '$regex': req.query.location, $options: 'i' } })

        }

        if (req.query.event_tag) {
            searchArray.push({ event_tags: { $in: await getIntIdFromArray(req.query.event_tag) } })
        }

        if (req.query.event_type) {
            searchArray.push({ event_type: Number.parseInt(req.query.event_type) })
        }

        if (req.query.search) {
            searchArray.push({ $or: [{ event_title: { '$regex': req.query.search, $options: 'i' } }] })
        }
        let query = { $and: searchArray }


        const eventsList = await eventM.aggregate([
            {
                $match: { end_date: { $lt: new Date(getPresentDateTime()) }, active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] }
            },
            { $sort: { start_date: -1 } },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $match: { login_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                login_status: 1
                            }
                        }]
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
                            $match: { active_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
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
                    from: "cln_event_watchlists",
                    localField: "_id",
                    foreignField: "event_row_id",
                    pipeline: [{ $match: { "user_row_id": user_row_id } }, { $project: { _id: 1 } }],
                    as: "user_watchlist",

                }
            },
            { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_events_utc_dates",
                    localField: "utc_row_id",
                    foreignField: "_id",
                    as: "utc_dates",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                utc_time: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
            { $match: query },
            {
                $project:
                {
                    _id: 1,
                    event_title: 1,
                    event_type: 1,
                    event_image: 1,
                    event_image_type: 1,
                    event_city: 1,
                    event_state: 1,
                    event_venue: 1,
                    event_url: 1,
                    start_date: 1,
                    end_date: 1,
                    event_price: 1,
                    view_counts: 1,
                    watchlist_status: { $cond: { if: "$user_watchlist._id", then: 1, else: 0 } },
                    utc_time: "$utc_dates.utc_time"
                }
            }
        ]).skip(skip).limit(limit)

        const countQuery = await eventM.aggregate([
            {
                $match: { end_date: { $lt: new Date(getPresentDateTime()) }, active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] }
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
                            $match: { login_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                login_status: 1
                            }
                        }]
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
                            $match: { active_status: { $ne: 1 } }
                        },
                        {
                            $project: {
                                _id: 1,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
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
            { $match: query },
            {
                $count: "count"
            }
        ])

        let total_counts = 0
        if (countQuery[0]) {
            total_counts = countQuery[0].count
        }

        res.json({ status: true, message: eventsList, count: total_counts })

    }
    catch (err) {
        console.log('Completed events list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


router.get('/event_other_details/:event_url', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const event_url = req.params.event_url
        const eventsList = await eventM.findOne({ event_url: event_url, active_status: 1, approval_status: 1 })
        let myArr = {}
        if (eventsList) {
            const contact_details = await event_contactsM.aggregate([
                { $match: { event_row_id: eventsList._id } },
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
                        contact_type_name: "$contact_type_info.contact_type_name",
                        country_code: "$country_info.country_code",
                        country_name: "$country_info.country_name"
                    }
                }
            ])

            myArr['contact_details'] = contact_details.length > 0 ? contact_details : []

            const speakersQuery = await event_speakersM.aggregate([
                {
                    $match: { event_row_id: eventsList._id }
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
                                $lookup:
                                {
                                    from: "cln_professionals_work_experiences",
                                    localField: "_id",
                                    foreignField: "user_row_id",
                                    pipeline: [
                                        { $match: { public_view: true } },
                                        { $limit: 1 },
                                        {
                                            $project: {
                                                position: 1,
                                                company_type: 1,
                                                company_row_id: 1,
                                                till_date_status: 1
                                            }
                                        }
                                    ],
                                    as: "info_work",
                                }
                            },
                            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                            {
                                $project:
                                {
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1,
                                    approval_status: 1,
                                    profile_image: "$img_info.profile_image",
                                    work_position: "$info_work.position",
                                    company_type: "$info_work.company_type",
                                    company_row_id: "$info_work.company_row_id"
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
                                    full_name: 1,
                                    email_id: 1,
                                    profile_image: 1,
                                    work_position: 1,
                                    company_type: 1,
                                    company_row_id: 1,
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
                    $set: {
                        company_type: "$user_data.company_type",
                        company_row_id: "$user_data.company_row_id",
                    }
                },
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
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$company_type'] },
                                                    { $eq: ['$_id', '$$company_row_id'] }
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
                    $set:
                    {
                        company_data: {
                            $switch: {
                                branches: [
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$company_type', 1] }
                                            ]
                                        },
                                        then: "$info_company"
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$company_type', 2] }
                                            ]
                                        },
                                        then: "$info_manual_company"
                                    },
                                ],
                                default: ""
                            }
                        }
                    }
                },
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
                        user_approval_status: "$user_data.approval_status",
                        work_position: "$user_data.work_position",
                        company_type: 1,
                        company_row_id: 1,
                        company_name: "$company_data.company_name"
                    }
                }
            ])

            if (speakersQuery) {
                myArr['speakers_list'] = speakersQuery
            }

            const manual_speakers_query = await event_speakers_manualM.find({ event_row_id: eventsList._id })
            if (manual_speakers_query) {
                myArr['manual_speakers'] = manual_speakers_query
            }

            let related_events_check_in_array = []

            if (eventsList.company_row_id) {
                related_events_check_in_array.push({ company_row_id: eventsList.company_row_id })
            }

            if (eventsList.user_row_id) {
                related_events_check_in_array.push({ user_row_id: eventsList.user_row_id })
            }


            if (related_events_check_in_array.length) {
                let filter_array = [{
                    $and: [
                        { _id: { $ne: eventsList._id } },
                        { active_status: 1 },
                        { approval_status: 1 },
                        { end_date: { $gte: new Date(getPresentDateTime()) } },
                        {
                            $or: related_events_check_in_array
                        }
                    ]
                }]
                let search_query = [{}]
                let { top_filter_array, search_array, sort_value } = filterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, event_status: 1 })
                const { list } = await getEventsData({
                    sort_value: sort_value,
                    top_filter_array: { $and: top_filter_array },
                    search_query: { $and: search_array },
                    req_headers: req.headers
                })

                myArr['related_events'] = list



                myArr['related_events_past'] = await eventM.aggregate([
                    {
                        $match: {
                            $and: [
                                { _id: { $ne: eventsList._id } },
                                { end_date: { $lt: new Date(getPresentDateTime()) } },
                                { active_status: 1 },
                                { approval_status: 1 },
                                {
                                    $or: related_events_check_in_array
                                }
                            ]
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_user",
                            localField: "user_row_id",
                            foreignField: "_id",
                            as: "users_info"
                        }
                    },
                    { $unwind: { path: "$users_info", preserveNullAndEmptyArrays: true } },
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
                        $set: {
                            login_status: "users_info.login_status",
                            company_active_status: "$company_info.active_status"
                        }
                    },
                    { $match: { $or: [{ login_status: 1 }, { company_active_status: 1 }] } },
                    {
                        $lookup:
                        {
                            from: "cln_event_watchlists",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id } }],
                            as: "applied_data"
                        }
                    },
                    { $unwind: { path: "$applied_data", preserveNullAndEmptyArrays: true } },
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
                        $lookup:
                        {
                            from: "cln_events_utc_dates",
                            localField: "utc_row_id",
                            foreignField: "_id",
                            as: "utc_dates"
                        }
                    },
                    { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                    { $sort: { end_date: -1 } },
                    {
                        $project: {
                            _id: 1,
                            company_row_id: 1,
                            event_title: 1,
                            event_tags: 1,
                            event_type: 1,
                            event_image: 1,
                            event_city: 1,
                            event_state: 1,
                            event_card_image: 1,
                            event_venue: 1,
                            event_url: 1,
                            event_link: 1,
                            start_date: 1,
                            end_date: 1,
                            event_price: 1,
                            created_date_n_time: 1,
                            event_description: 1,
                            watchlist_status: { $cond: { if: "$applied_data", then: true, else: false } },
                            utc_time: "$utc_dates.utc_time",
                            event_tag_array: "$eventTags.event_tag"

                        }
                    }
                ]).limit(6)


            }
            else {
                myArr['related_events'] = []
                myArr['related_events_past'] = []
            }

            myArr['event_guest_list'] = await event_guestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_events_attendees_emails",
                        localField: "guest_email_row_id",
                        foreignField: "_id",
                        as: "evnetsEmails"
                    }
                },
                { $unwind: { path: "$eventsEmails", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "guest_user_row_id",
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
                                $project: {
                                    full_name: 1,
                                    email_id: 1,
                                    user_name: 1,
                                    profile_image: "$img_info.profile_image",
                                    login_status: 1,
                                    approval_status: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } }
                    }
                },
                {
                    $match: { event_row_id: eventsList._id, login_status: 1, invitation_request_status: 1 }
                },
                {
                    $project: {
                        login_status: 1,
                        approval_status: "$user_info.approval_status",
                        guest_user_row_id: 1,
                        guest_user_type: 1,
                        invitation_request_status: 1,
                        guest_full_name: "$eventsEmails.full_name",
                        full_name: { $cond: { if: "$user_info.full_name", then: "$user_info.full_name", else: "$eventsEmails.full_name" } },
                        email_id: { $cond: { if: "$user_info.email_id", then: "$user_info.email_id", else: "$eventsEmails.email_id" } },
                        user_name: "$user_info.user_name",
                        profile_image: "$user_info.profile_image",
                        invite_status: 1,
                    }
                }
            ]).sort({ _id: -1 })

            const sponsors_query = await event_sponsors_partner_detailsM.aggregate([
                { $match: { event_row_id: eventsList._id, sponsor_partner_type: 1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            account_type: '$account_type',
                            registered_type: '$registered_type',
                            sponsor_partner_row_id: '$sponsor_partner_row_id'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$account_type'] },
                                            { $eq: [1, '$$registered_type'] },
                                            { $eq: ['$_id', '$$sponsor_partner_row_id'] },
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
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    profile_image: "$img_info.profile_image",
                                    full_name: 1,
                                    email_id: 1,
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
                        let: {
                            account_type: '$account_type',
                            registered_type: '$registered_type',
                            sponsor_partner_row_id: '$sponsor_partner_row_id'
                        },
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$account_type'] },
                                            { $eq: [1, "$$registered_type"] },
                                            { $eq: ['$_id', "$$sponsor_partner_row_id"] }
                                        ]
                                    }
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
                                    approval_status: 1,
                                    active_status: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_events_manual_user_companies",
                        let: {
                            account_type: '$account_type',
                            registered_type: '$registered_type',
                            sponsor_partner_row_id: '$sponsor_partner_row_id'
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$manual_account_type', '$$account_type'] },
                                            { $eq: [2, "$$registered_type"] },
                                            { $eq: ['$_id', "$$sponsor_partner_row_id"] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        name: {
                            $switch: {
                                branches: [
                                    {
                                        case: "$user_info.full_name",
                                        then: "$user_info.full_name"
                                    },
                                    {
                                        case: "$company_info.company_name",
                                        then: "$company_info.company_name"
                                    },
                                    {
                                        case: "$manual_info.name",
                                        then: "$manual_info.name"
                                    },
                                ],
                                default: ""
                            }
                        },
                        image: {
                            $switch: {
                                branches: [
                                    {
                                        case: "$user_info.profile_image",
                                        then: "$user_info.profile_image"
                                    },
                                    {
                                        case: "$company_info.company_logo",
                                        then: "$company_info.company_logo"
                                    },
                                    {
                                        case: "$manual_info.image",
                                        then: "$manual_info.image"
                                    },
                                ],
                                default: ""
                            }
                        },
                        link: {
                            $switch: {
                                branches: [
                                    {
                                        case: "$user_info.user_name",
                                        then: "$user_info.user_name"
                                    },
                                    {
                                        case: "$company_info.company_id",
                                        then: "$company_info.company_id"
                                    },
                                    {
                                        case: "$manual_info.link",
                                        then: "$manual_info.link"
                                    },
                                ],
                                default: ""
                            }
                        },

                    }
                },
                {
                    $project:
                    {
                        event_row_id: 1,
                        sponsor_partner_type: 1,
                        account_type: 1,
                        registered_type: 1,
                        sponsor_partner_row_id: 1,
                        manual_type: 1,
                        created_date_n_time: 1,
                        name: 1,
                        image: 1,
                        link: 1
                    }
                }
            ])

            myArr['sponsors'] = sponsors_query.length > 0 ? sponsors_query : []

            const partners_query = await event_sponsors_partner_detailsM.aggregate([
                { $match: { event_row_id: eventsList._id, sponsor_partner_type: 2 } },
                // {
                //     $lookup:
                //     {
                //         from: "cln_static_event_partner_types",
                //         let:{
                //             sponsor_partner_type: '$sponsor_partner_type',
                //             type_row_id: '$type_row_id'
                //         },
                //         as: "partner_types",
                //         pipeline: [
                //             {
                //                 $match: {
                //                     $expr: {
                //                         $and: [
                //                             { $eq: [2,"$$sponsor_partner_type"]},
                //                             { $eq: ['$_id','$$type_row_id']}
                //                         ]
                //                     }
                //                 }
                //             }
                //         ]
                //     }
                // },
                // { $unwind: { path: "$partner_types", preserveNullAndEmptyArrays: true}},
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            account_type: '$account_type',
                            registered_type: '$registered_type',
                            sponsor_partner_row_id: '$sponsor_partner_row_id'
                        },
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, '$$account_type'] },
                                            { $eq: [1, '$$registered_type'] },
                                            { $eq: ['$_id', '$$sponsor_partner_row_id'] },
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
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    profile_image: "$img_info.profile_image",
                                    full_name: 1,
                                    email_id: 1,
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
                        let: {
                            account_type: '$account_type',
                            registered_type: '$registered_type',
                            sponsor_partner_row_id: '$sponsor_partner_row_id'
                        },
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, '$$account_type'] },
                                            { $eq: [1, "$$registered_type"] },
                                            { $eq: ['$_id', "$$sponsor_partner_row_id"] }
                                        ]
                                    }
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
                                    approval_status: 1,
                                    active_status: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_events_manual_user_companies",
                        let: {
                            account_type: '$account_type',
                            registered_type: '$registered_type',
                            sponsor_partner_row_id: '$sponsor_partner_row_id'
                        },
                        as: "manual_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$manual_account_type', '$$account_type'] },
                                            { $eq: [2, "$$registered_type"] },
                                            { $eq: ['$_id', "$$sponsor_partner_row_id"] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        name: {
                            $switch: {
                                branches: [
                                    {
                                        case: "$user_info.full_name",
                                        then: "$user_info.full_name"
                                    },
                                    {
                                        case: "$company_info.company_name",
                                        then: "$company_info.company_name"
                                    },
                                    {
                                        case: "$manual_info.name",
                                        then: "$manual_info.name"
                                    },
                                ],
                                default: ""
                            }
                        },
                        image: {
                            $switch: {
                                branches: [
                                    {
                                        case: "$user_info.profile_image",
                                        then: "$user_info.profile_image"
                                    },
                                    {
                                        case: "$company_info.company_logo",
                                        then: "$company_info.company_logo"
                                    },
                                    {
                                        case: "$manual_info.image",
                                        then: "$manual_info.image"
                                    },
                                ],
                                default: ""
                            }
                        },
                        link: {
                            $switch: {
                                branches: [
                                    {
                                        case: "$user_info.user_name",
                                        then: "$user_info.user_name"
                                    },
                                    {
                                        case: "$company_info.company_id",
                                        then: "$company_info.company_id"
                                    },
                                    {
                                        case: "$manual_info.link",
                                        then: "$manual_info.link"
                                    },
                                ],
                                default: ""
                            }
                        },

                    }
                },
                {
                    $project:
                    {
                        event_row_id: 1,
                        sponsor_partner_type: 1,
                        account_type: 1,
                        registered_type: 1,
                        sponsor_partner_row_id: 1,
                        manual_type: 1,
                        created_date_n_time: 1,
                        name: 1,
                        image: 1,
                        link: 1
                    }
                }
            ])

            myArr['partners'] = partners_query.length > 0 ? partners_query : []

            res.json({ status: true, message: myArr })

        }
        else {
            res.json({ status: false, message: "Sorry, Invalid event url" })
        }

    }
    catch (err) {
        console.log('Event other details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/individual_event/:event_url', async (req, res) => {
    try {
        let user_row_id = 0
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const result = await getEventIndividualDetails(req, user_row_id)

        if (result.status) {
            res.json({
                status: true,
                message: result.message,
                cache_reponse_status: result.cache_reponse_status || false
            })
        } else {
            res.json({
                status: false,
                message: result.message || "Sorry, Invalid event url"
            })
        }
    }
    catch (err) {
        console.log('Individual event.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }

})


router.get('/add_to_watchlist/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const event_row_id = Number.parseInt(req.params.event_row_id)
            if (!Number.isNaN(event_row_id)) {
                const check_query = await eventM.findOne({ _id: event_row_id, active_status: 1 })
                if (check_query) {
                    const checkAttendee = await event_watchlistsM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id })
                    if (!checkAttendee) {
                        const insertArr = {
                            event_row_id: event_row_id,
                            user_row_id: user_row_id,
                            date_n_time: getPresentDateTime()
                        }

                        await event_watchlistsM(insertArr).save()
                        const total_watchlist = await event_watchlistsM.countDocuments({ event_row_id: event_row_id })

                        const check_event = await events_countM.findOne({ event_row_id: event_row_id })
                        if (check_event) {
                            await events_countM.updateOne({ event_row_id: event_row_id }, { $set: { total_watchlist: total_watchlist } })
                        }
                        else {
                            await events_countM({
                                event_row_id: event_row_id,
                                total_watchlist: total_watchlist
                            }).save()
                        }
                        await deleteKeysByPattern('all_events_*')
                        await deleteKeysByPattern('individual_event_*')
                        await deleteKeysByPattern('events_watchlist_*')
                        await deleteKeysByPattern('users_registered_list_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')

                        res.json({ status: true, message: { alert_message: 'This event has been added to your wishlist.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, You cannot apply for same Event again' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Event row id' } })
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
        console.log('Add to watchlist.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.post('/set_event_watchlist_reminder', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers);
        if (!checkToken.status) return res.json(checkToken);

        const user_row_id = checkToken.message;
        const { event_row_id, reminder_type, from_source } = req.body;

        if (![1, 2].includes(from_source)) {
            return res.json({
                status: false,
                message: { alert_message: "Invalid source. Use 1 (Attendee) or 2 (Watchlist)." }
            });
        }

        if (!event_row_id || Number.isNaN(event_row_id)) {
            return res.json({ status: false, message: { alert_message: "Invalid event ID." } });
        }

        if (![0, 1, 2, 3, 4].includes(reminder_type)) {
            return res.json({ status: false, message: { alert_message: "Invalid reminder type." } });
        }

        const event = await eventM.findOne({ _id: event_row_id, active_status: 1 }).lean();
        if (!event?.start_date) {
            return res.json({ status: false, message: { alert_message: "Event not found." } });
        }

        // -- Fetch records
        const watchlist = await event_watchlistsM.findOne({ event_row_id, user_row_id }).lean();
        const attendee = await events_attendeesM.findOne({ event_row_id, user_row_id }).lean();

        if (from_source === 2 && !watchlist) {
            return res.json({ status: false, message: { alert_message: "Add to watchlist first." } });
        }

        if (from_source === 1 && !attendee) {
            return res.json({ status: false, message: { alert_message: "Register first." } });
        }

        const existingWatchlist = await event_watchlistsM.findOne({
            event_row_id,
            user_row_id,
            reminder_type
        }).lean();

        const existingAttendee = await events_attendeesM.findOne({
            event_row_id,
            user_row_id,
            reminder_type
        }).lean();
        if ((existingWatchlist || existingAttendee)) {
            return res.json({
                status: false,
                message: { alert_message: "This reminder already exists. Please pick a new time." }
            });
        }

        if (reminder_type !== 0 && (existingWatchlist || existingAttendee)) {
            return res.json({
                status: false,
                message: { alert_message: "This reminder type already exists. Choose another option." }
            });
        }

        const reminder_map = { 0: 0, 1: 60, 2: 360, 3: 1440, 4: 10080 };
        const reminder_minutes = reminder_map[reminder_type];
        const now = new Date();

        let reminder_time = reminder_type === 0
            ? now
            : new Date(new Date(event.start_date).getTime() - reminder_minutes * 60000);

        if (reminder_type !== 0 && reminder_time <= now) {
            return res.json({
                status: false,
                message: { alert_message: "Reminder time already passed." }
            });
        }

        // ---- UPDATE RECORD BASED ON SOURCE ----
        if (from_source === 2) {
            await event_watchlistsM.updateOne(
                { _id: watchlist._id },
                {
                    $set: {
                        reminder_type,
                        reminder_time,
                        email_sent_status: false,
                        date_n_time: getPresentDateTime(),
                        reminder_locked: true   // prevents future overwrite
                    }
                }
            );
            await deleteKeysByPattern('events_watchlist_*')
        }

        if (from_source === 1) {
            await events_attendeesM.updateOne(
                { _id: attendee._id },
                {
                    $set: {
                        reminder_type,
                        reminder_time,
                        reminder_email_sent_status: false,
                        created_date_n_time: getPresentDateTime(),
                        reminder_locked: true // lock the entry
                    }
                }
            );
            await deleteKeysByPattern('events_watchlist_*')
        }
        await deleteKeysByPattern('events_watchlist_*')
        return res.json({
            status: true,
            message: { alert_message: "Reminder set successfully." }
        });

    } catch (err) {
        console.log("Error in set reminder:", err);
        return res.json({ status: false, message: err.message });
    }
});







router.get('/remove_from_watchlist/:event_row_id', async (req, res) => {

    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let user_row_id = checkUserToken.message
            let event_row_id = Number.parseInt(req.params.event_row_id)

            if (!Number.isNaN(event_row_id)) {
                const check_watchlist = await event_watchlistsM.findOne({ event_row_id: event_row_id, user_row_id: user_row_id })
                if (check_watchlist) {
                    await event_watchlistsM.updateOne(
                        { _id: check_watchlist._id },
                        {
                            $set: {
                                reminder_type: 0,
                                reminder_time: null,
                                email_sent_status: false
                            }
                        }
                    );
                    await deleteEventWatchlist({ type: 1, event_row_id: event_row_id, watchlist_row_id: check_watchlist._id })
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('events_watchlist_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    const deleted = await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('users_registered_list_*')
                    res.json({ status: true, deleted: deleted, message: { alert_message: 'The event has been successfully removed from your wishlist.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid attendee' } })
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
        console.log('Remove from.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/applied_list_by_me/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let user_row_id = checkUserToken.message
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = { event_title: { '$regex': req.query.search, $options: 'i' } }
            }

            const checkList = await event_watchlistsM.aggregate([
                { $match: { user_row_id: user_row_id } },
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
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info"
                    }
                },
                { $match: { "event_info": { $elemMatch: query } } },
                { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        event_row_id: 1,
                        company_row_id: 1,
                        user_row_id: 1,
                        date_n_time: 1,
                        company_name: "$company_info.company_name",
                        company_logo: "$company_info.company_logo",
                        company_email_id: "$company_info.company_email_id",
                        company_location: "$company_info.company_location",
                        event_title: "$event_info.event_title",
                        event_type: "$event_info.event_type",
                        event_image: "$event_info.event_image",
                        event_city: "$event_info.event_city",
                        event_state: "$event_info.event_state",
                        event_venue: "$event_info.event_venue",
                        event_url: "$event_info.event_url",
                        start_date: "$event_info.start_date",
                        end_date: "$event_info.end_date",
                        active_status: "$event_info.active_status",
                        approval_status: "$event_info.approval_status",
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
                    innerObj['user_row_id'] = i.user_row_id
                    innerObj['date_n_time'] = i.date_n_time
                    innerObj['company_name'] = i.company_name
                    innerObj['company_logo'] = i.company_logo
                    innerObj['company_email_id'] = i.company_email_id
                    innerObj['company_location'] = i.company_location
                    innerObj['event_title'] = i.event_title
                    innerObj['event_type'] = i.event_type
                    innerObj['event_image'] = i.event_image
                    innerObj['event_city'] = i.event_city
                    innerObj['event_state'] = i.event_state
                    innerObj['event_venue'] = i.event_venue
                    innerObj['event_url'] = i.event_url
                    innerObj['start_date'] = i.start_date
                    innerObj['end_date'] = i.end_date
                    innerObj['active_status'] = i.active_status
                    innerObj['approval_status'] = i.approval_status

                    const new_object = await Promise.resolve(innerObj)
                    myArr.push(new_object)
                }
                res.json({ status: true, message: myArr })
            }
            else {
                res.json({ status: true, message: [] })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Applied list by me.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/event_tags_list', async (req, res) => {
    try {
        const event_tags_type = req.query.type ? req.query.type : "";
        const key = 'backend_event_tags_list_' + event_tags_type;

        // GET CACHE
        const cache_response = await getCache({ key });

        // Cache condition FIXED
        if (
            cache_response.status &&
            cache_response.message &&
            cache_response.message.length > 0
        ) {
            return res.json({
                status: true,
                message: cache_response.message,
                cache_reponse_status: true
            });
        }

        // ---------------------------
        // CACHE MISS → FETCH FROM DB
        // ---------------------------

        let search_query = [
            { active_status: 1 },
            { approval_status: 1 }
        ];

        const now = new Date(getPresentDateTime());

        // Upcoming
        if (event_tags_type == "upcoming") {
            search_query.push({ end_date: { $gte: now } });
        }

        // Past
        if (event_tags_type == "past") {
            search_query.push({ end_date: { $lt: now } });
        }

        const tagsList = await eventM.aggregate([
            { $match: { $and: search_query } },

            // Convert event_tags object into array
            {
                $addFields: {
                    tagArray: {
                        $cond: [
                            { $isArray: "$event_tags" },
                            "$event_tags",
                            {
                                $map: {
                                    input: { $objectToArray: "$event_tags" },
                                    as: "t",
                                    in: "$$t.v" // extract values
                                }
                            }
                        ]
                    }
                }
            },

            { $unwind: "$tagArray" },

            {
                $lookup: {
                    from: "cln_events_tags",
                    localField: "tagArray",
                    foreignField: "_id",
                    as: "tagDetails"
                }
            },

            { $unwind: "$tagDetails" },

            // Only active tags
            { $match: { "tagDetails.active_status": true } },

            {
                $group: {
                    _id: "$tagDetails._id",
                    label: { $first: "$tagDetails.event_tag" }
                }
            },

            {
                $project: {
                    _id: 0,
                    value: "$_id",
                    label: "$label"
                }
            },

            { $sort: { label: 1 } }
        ]);

        // SET CACHE
        await setCache({
            key,
            value: tagsList,
            ttl: 1800 // 30 minutes
        });

        return res.json({
            status: true,
            message: tagsList,
            cache_reponse_status: false
        });

    } catch (err) {
        console.log("Event tags list error:", err.message);
        return res.json({
            status: false,
            message: "An unexpected error occurred. Please try again later."
        });
    }
});


router.get('/company_category_list', async (req, res) => {
    try {
        const getQuery = await company_business_modelsM.aggregate([
            {
                $sort: { business_name: 1 }
            },
            {
                $project: {
                    _id: 0,
                    value: "$_id",
                    label: "$business_name"
                }
            }
        ])

        res.json({ status: true, message: getQuery })

    }
    catch (err) {
        console.log('Company category list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/most_used_event_tags', async (req, res) => {
    try {
        const checkEvents = await eventM.distinct('event_tags', { end_date: { $gte: new Date(getPresentDateTime()) }, active_status: 1 }) // , approval_status:1 
        const getQuery = await event_tagsM.find({ _id: { $in: checkEvents } }, { event_tag: 1, _id: 1 })

        res.json({ status: true, message: getQuery.slice(0, 4), other_array: getQuery.slice(4, getQuery.length) })

    }
    catch (err) {
        console.log('Most used event tags.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


router.get('/events_counts_info/:type', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let user_row_id = checkUserToken.message

            const user_approval_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, approval_status: 1, user_name: 1 })

            let user_name_status = false
            if (user_approval_query?.user_name) {
                user_name_status = true
            }

            if (Number.parseInt(req.params.type) === 0)//created events counts
            {

                const created_count = await eventM.countDocuments({ user_row_id: user_row_id }) // even disable events are counted
                const ongoing_events = await eventM.countDocuments({ user_row_id: user_row_id, start_date: { $lte: new Date(getPresentDateTime()) }, end_date: { $gte: new Date(getPresentDateTime()) } })
                const upcoming_events = await eventM.countDocuments({ user_row_id: user_row_id, start_date: { $gt: new Date(getPresentDateTime()) } })
                const completed_events = await eventM.countDocuments({ user_row_id: user_row_id, end_date: { $lt: new Date(getPresentDateTime()) } }) // even disable events are counted
                const approved_events = await eventM.countDocuments({ user_row_id: user_row_id, approval_status: 1 })
                const rejected_events = await eventM.countDocuments({ user_row_id: user_row_id, approval_status: 2 })
                const pending_events = await eventM.countDocuments({ user_row_id: user_row_id, approval_status: 0 })

                res.json({
                    status: true, message: {
                        user_approval_status: user_approval_query ? user_approval_query.approval_status : 0,
                        user_name_status: user_name_status,
                        created_count: created_count > 0 ? created_count : 0,
                        completed_events: completed_events,
                        upcoming_events: upcoming_events,
                        ongoing_events: ongoing_events,
                        approved_events: approved_events,
                        rejected_events: rejected_events,
                        pending_events: pending_events,
                    }
                })
            }
            else if (Number.parseInt(req.params.type) === 1) //registered
            {
                const registered_count = await eventM.aggregate([
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
                            from: "cln_events_attendees",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id, user_type: 1 } }],
                            as: "event_guest"
                        }
                    },
                    { $unwind: { path: "$event_guest", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_event_watchlists",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id } }],
                            as: "user_watchlist"
                        }
                    },
                    { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            login_status: "$user_info.login_status",
                            company_active_status: "$company_info.active_status",
                            guest_user_row_id: "$event_guest.user_row_id"
                        }
                    },
                    {
                        $match: {
                            $and: [
                                { active_status: 1, approval_status: 1, guest_user_row_id: user_row_id },
                                {
                                    $or: [
                                        { login_status: 1, list_event_type: 1 },
                                        { company_active_status: 1, list_event_type: 2 },
                                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total_registered: { $sum: 1 },
                            ongoing_registered:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$approval_status", 1] }, { $lte: ["$start_date", new Date(getPresentDateTime())] }, { $gte: ["$end_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            upcoming_registered:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$approval_status", 1] }, { $gt: ["$start_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            completed_registered:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$approval_status", 1] }, { $lt: ["$end_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            watchlist_count: { $sum: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } } }

                        }
                    }
                ])

                let total_registered = 0
                let ongoing_registered = 0
                let upcoming_registered = 0
                let completed_registered = 0
                let reg_watchlist_countasd = 0
                if (registered_count[0]) {
                    total_registered = registered_count[0].total_registered
                    ongoing_registered = registered_count[0].ongoing_registered
                    upcoming_registered = registered_count[0].upcoming_registered
                    completed_registered = registered_count[0].completed_registered
                    reg_watchlist_countasd = registered_count[0].watchlist_count
                }

                res.json({
                    status: true, message: {
                        user_approval_status: user_approval_query ? user_approval_query.approval_status : 0,
                        user_name_status: user_name_status,
                        total_registered: total_registered,
                        ongoing_registered: ongoing_registered,
                        upcoming_registered: upcoming_registered,
                        completed_registered: completed_registered,
                        reg_watchlist_countasd: reg_watchlist_countasd
                    }
                })
            }
            else if (Number.parseInt(req.params.type) === 2)  //watchlist
            {
                const watchlist_count = await event_watchlistsM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_events",
                            localField: "event_row_id",
                            foreignField: "_id",
                            as: "event_info"
                        }
                    },
                    { $unwind: { path: "$event_info" } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "event_info.user_row_id",
                            foreignField: "_id",
                            as: "user_info"
                        }
                    },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "event_info.company_row_id",
                            foreignField: "_id",
                            as: "company_info"
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            login_status: "$user_info.login_status",
                            company_active_status: "$company_info.active_status",
                            event_title: "$event_info.event_title",
                            active_status: "$event_info.active_status",
                            approval_status: "$event_info.approval_status",
                            list_event_type: "$event_info.list_event_type"
                        }
                    },
                    {
                        $match: {
                            user_row_id: user_row_id, active_status: 1, approval_status: 1, $or: [
                                { login_status: 1, list_event_type: 1 },
                                { company_active_status: 1, list_event_type: 2 },
                                { list_event_type: 3, login_status: 1, company_active_status: 1 }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total_watchlist: { $sum: 1 },
                            ongoing_watchlist:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$event_info.approval_status", 1] }, { $lte: ["$event_info.start_date", new Date(getPresentDateTime())] }, { $gte: ["$event_info.end_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            upcoming_watchlist:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$event_info.approval_status", 1] }, { $gt: ["$event_info.start_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            completed_watchlist:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$event_info.approval_status", 1] }, { $lt: ["$event_info.end_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            reminder_scheduled_count: {
                                $sum: {
                                    $cond: [
                                        { $gt: ["$reminder_type", 0] },
                                        1,
                                        0
                                    ]
                                }
                            }
                        }

                    },


                ])
                let total_watchlist = 0
                let ongoing_watchlist = 0
                let upcoming_watchlist = 0
                let completed_watchlist = 0
                let reminder_scheduled_count = 0;
                if (watchlist_count[0]) {
                    total_watchlist = watchlist_count[0].total_watchlist
                    ongoing_watchlist = watchlist_count[0].ongoing_watchlist
                    upcoming_watchlist = watchlist_count[0].upcoming_watchlist
                    completed_watchlist = watchlist_count[0].completed_watchlist
                    reminder_scheduled_count = watchlist_count[0].reminder_scheduled_count;
                }


                const reg_watchlist_count = await event_watchlistsM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_events",
                            localField: "event_row_id",
                            foreignField: "_id",
                            as: "event_info"
                        }
                    },
                    { $unwind: { path: "$event_info" } },
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
                            localField: "event_info.company_row_id",
                            foreignField: "_id",
                            as: "company_info"
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_events_attendees",
                            localField: "event_row_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id, user_type: 1 } }],
                            as: "event_guest"
                        }
                    },
                    { $unwind: { path: "$event_guest", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            login_status: "$user_info.login_status",
                            company_active_status: "$company_info.active_status",
                            event_title: "$event_info.event_title",
                            list_event_type: "$event_info.list_event_type",
                            guest_user_row_id: { $cond: { if: "$event_guest.user_row_id", then: "$event_guest.user_row_id", else: 0 } }

                        }
                    },
                    {
                        $match: {
                            user_row_id: user_row_id, guest_user_row_id: user_row_id, $or: [
                                { login_status: 1, list_event_type: 1 },
                                { company_active_status: 1, list_event_type: 2 },
                                { list_event_type: 3, login_status: 1, company_active_status: 1 }
                            ]
                        }
                    },
                    {
                        $count: "count"
                    }
                ])

                res.json({
                    status: true, message: {
                        user_approval_status: user_approval_query ? user_approval_query.approval_status : 0,
                        user_name_status: user_name_status,
                        total_watchlist: total_watchlist,
                        ongoing_watchlist: ongoing_watchlist,
                        upcoming_watchlist: upcoming_watchlist,
                        completed_watchlist: completed_watchlist,
                        reminder_scheduled_count: reminder_scheduled_count,

                        watchlist_registered_count: reg_watchlist_count.length > 0 ? reg_watchlist_count[0].count : 0,
                    }
                })
            }
            else if (Number.parseInt(req.params.type) === 3) //Speaker
            {
                const speaker_count = await eventM.aggregate([
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
                            from: "cln_events_speakers",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id } }],
                            as: "event_speaker"
                        }
                    },
                    { $unwind: { path: "$event_speaker", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_event_watchlists",
                            localField: "_id",
                            foreignField: "event_row_id",
                            pipeline: [{ $match: { "user_row_id": user_row_id } }],
                            as: "user_watchlist"
                        }
                    },
                    { $unwind: { path: "$user_watchlist", preserveNullAndEmptyArrays: true } },
                    {
                        $set: {
                            login_status: "$user_info.login_status",
                            company_active_status: "$company_info.active_status",
                            speaker_user_row_id: "$event_speaker.user_row_id",
                        }
                    },
                    {
                        $match: {
                            $and: [
                                { active_status: 1, approval_status: 1, speaker_user_row_id: user_row_id },
                                {
                                    $or: [
                                        { login_status: 1, list_event_type: 1 },
                                        { company_active_status: 1, list_event_type: 2 },
                                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total_registered: { $sum: 1 },
                            ongoing_registered:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$approval_status", 1] }, { $lte: ["$start_date", new Date(getPresentDateTime())] }, { $gte: ["$end_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            upcoming_registered:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$approval_status", 1] }, { $gt: ["$start_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            completed_registered:
                            {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$approval_status", 1] }, { $lt: ["$end_date", new Date(getPresentDateTime())] }] }, 1, 0]
                                }
                            },
                            watchlist_count: { $sum: { $cond: { if: "$user_watchlist.user_row_id", then: 1, else: 0 } } }

                        }
                    }
                ])

                let total_speaker = 0
                let ongoing_speaker = 0
                let upcoming_speaker = 0
                let completed_speaker = 0
                let speaker_watchlist_count = 0
                if (speaker_count[0]) {
                    total_speaker = speaker_count[0].total_registered
                    ongoing_speaker = speaker_count[0].ongoing_registered
                    upcoming_speaker = speaker_count[0].upcoming_registered
                    completed_speaker = speaker_count[0].completed_registered
                    speaker_watchlist_count = speaker_count[0].watchlist_count
                }

                res.json({
                    status: true, message: {
                        user_approval_status: user_approval_query ? user_approval_query.approval_status : 0,
                        user_name_status: user_name_status,
                        total_speaker: total_speaker,
                        ongoing_speaker: ongoing_speaker,
                        upcoming_speaker: upcoming_speaker,
                        completed_speaker: completed_speaker,
                        speaker_watchlist_count: speaker_watchlist_count
                    }
                })
            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Event counts info.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/location_search', async (req, res) => {
    try {
        let search_query = [{ _id: { $nin: ["", null] }, event_type: { $in: [1, 3] }, active_status: 1, approval_status: 1 }]
        if (req.query.type) {
            if (req.query.type == 'upcoming') {
                search_query.push({ end_date: { $gte: new Date(getPresentDateTime()) } })
            }
            else if (req.query.type == 'past') {
                search_query.push({ end_date: { $lt: new Date(getPresentDateTime()) } })
            }
        }

        if (req.query.search) {
            search_query.push({ event_venue: { $regex: req.query.search, $options: 'i' } })
        }

        let query = { $and: search_query }
        const query_run = await eventM.aggregate([
            { $match: query },
            { $group: { _id: '$event_venue', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            {
                $limit: 20
            }
        ])

        const count_query = await eventM.countDocuments(query)

        res.json({ status: true, message: query_run, count: count_query })

    }
    catch (err) {
        console.log('Location Search.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/organizers_location_search', async (req, res) => {
    try {
        const search_query = [{ "_id.country_name": { $nin: ["", null] } }]
        if (req.query.search) {
            search_query.push({ $or: [{ country_name: { '$regex': req.query.search, $options: 'i' } }, { company_location: { '$regex': req.query.search, $options: 'i' } }] })
        }
        const organizersList = await eventM.aggregate([
            { $match: { active_status: 1, approval_status: 1, company_row_id: { $gt: 0 }, end_date: { $gte: new Date(getPresentDateTime()) } } },
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
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
                                country_name: "$co_info.country_name",
                                company_location: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        country_name: "$company_info.country_name",
                        company_location: "$company_info.company_location"
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $set:
                {
                    country_name: "$_id.country_name",
                    company_location: "$_id.company_location"
                }
            },
            { $match: { $and: search_query } },
            {
                $sort: { company_location: 1, country_name: 1 }
            },
            {
                $project:
                {
                    _id: 0,
                    count: 1,
                    country_name: 1,
                    company_location: 1
                }
            }
        ])

        res.json({ status: true, message: organizersList })

    }
    catch (err) {
        console.log('Organizers location search.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/submit_notify_me/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const event_row_id = req.params.event_row_id
            if (!Number.isNaN(event_row_id)) {
                const event_query = await eventM.findOne({ _id: event_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
                if (event_query) {
                    const check_ticket_query = await ticketM.findOne({ event_row_id: event_row_id })
                    if (!check_ticket_query) {
                        const check_list = await notify_userM.findOne({ user_row_id: user_row_id, event_row_id: event_row_id })
                        if (!check_list) {
                            if (event_query.user_row_id == user_row_id) {
                                res.json({
                                    status: false,
                                    message: { alert_message: 'Sorry, you are unable to perform the "notify tickets" action because this event was created using your own account.' }
                                })

                            }
                            else {
                                await notify_userM({
                                    user_row_id: user_row_id,
                                    event_row_id: event_row_id,
                                    date_n_time: getPresentDateTime()
                                }).save()

                                if (event_query.user_row_id) {
                                    await updateThreadNotification({
                                        user_row_id: event_query.user_row_id,
                                        notify_type: 1,
                                        notify_type_row_id: user_row_id,
                                        message_row_id: 66,
                                        action_row_id: user_row_id,
                                        event_row_id: event_row_id
                                    })
                                }


                                await deleteKeysByPattern('individual_event_*')
                                res.json({
                                    status: true,
                                    message: { alert_message: "We will notify you promptly as event tickets become available. You won't miss out on this opportunity." }
                                })
                            }
                        }
                        else {
                            res.json({
                                status: false,
                                message: { alert_message: 'You are already a part of notify me list.' }
                            })
                        }
                    }
                    else {
                        res.json({
                            status: false,
                            message: { alert_message: 'Sorry, This event has already some tickets.' }
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
        console.log('Submit notify me.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/cancel_notify_me/:event_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const event_row_id = req.params.event_row_id
            if (!Number.isNaN(event_row_id)) {
                const event_query = await eventM.findOne({ _id: event_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
                if (event_query) {

                    const check_list = await notify_userM.findOne({ user_row_id: user_row_id, event_row_id: event_row_id, })
                    if (check_list) {
                        await notify_userM.deleteOne({ user_row_id: user_row_id, event_row_id: event_row_id })
                        await deleteKeysByPattern('individual_event_*')
                        res.json({
                            status: true,
                            message: { alert_message: 'You have been successfully removed from the Notify Me list.You will no longer receive updates on ticket availability or any exciting offers related to this event. ' }
                        })
                    }
                    else {
                        res.json({
                            status: false,
                            message: { alert_message: 'You are not part of the notify me list.' }
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
        console.log('Cancel notify me.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/utc_time_list', async (req, res) => {
    try {
        const search = req.query.search ? req.query.search : ""
        const country_row_id = req.query.country_row_id ? req.query.country_row_id : ""

        const key = 'backend_events_utc_time_list_' + country_row_id + search
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            let searchQuery = [{}]
            if (req.query.search) {
                searchQuery.push({ $or: [{ timezone: { $regex: req.query.search, $options: 'i' } }, { country: { $regex: req.query.search, $options: 'i' } }] })
            }

            if (req.query.country_row_id) {
                const get_country = await event_utc_datesM.find({ country_row_id: sanitize(req.query.country_row_id) })
                if (get_country.length > 0) {
                    searchQuery.push({ country_row_id: (req.query.country_row_id) })
                }
            }

            let query = { $and: searchQuery }

            const get_query = await event_utc_datesM.find(query, { _id: 1, utc_time: 1, timezone: 1, country: 1, country_row_id: 1 })


            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('UTC time list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/save_location', [
    check('country')
        .trim().not().isEmpty().withMessage('The country field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = checkUserLoginToken(req.headers)
        let user_row_id = ""
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {

            const insertArray = {}
            insertArray['city'] = req.body.city
            insertArray['state'] = req.body.state
            insertArray['country'] = req.body.country
            const check_query = await event_search_locationM.findOne({ city: sanitize(req.body.city), state: sanitize(req.body.state), country: sanitize(req.body.country) })
            if (user_row_id && user_row_id !== "") {
                if (check_query) {
                    const check_users_query = await professionals_location_searchM.findOne({ user_row_id: user_row_id, location_row_id: check_query._id })
                    if (!check_users_query) {
                        insertArray['registered_users_count'] = check_query ? (check_query.registered_users_count) + 1 : 1
                    }
                }
                else {
                    insertArray['registered_users_count'] = check_query ? (check_query.registered_users_count) + 1 : 1
                }

            }
            else {
                insertArray['non_registered_users_count'] = check_query ? (check_query.non_registered_users_count) + 1 : 1
            }

            if (!check_query) {

                const save_query = await event_search_locationM(insertArray).save()
                if (user_row_id) {
                    const check_users_query = await professionals_location_searchM.findOne({ user_row_id: user_row_id, location_row_id: save_query._id })
                    if (!check_users_query) {
                        await professionals_location_searchM({
                            user_row_id: user_row_id,
                            location_row_id: save_query._id,
                            updated_date_n_time: getPresentDateTime()
                        }).save()
                    }
                    else {
                        await professionals_location_searchM.updateOne({ _id: check_users_query._id }, { $set: { count: (check_users_query.count) + 1, updated_date_n_time: getPresentDateTime() } })
                    }
                }


                res.json({ status: true, message: "User's search location added successfully" })
            }
            else {
                await event_search_locationM.updateOne({ _id: check_query._id }, { $set: insertArray })
                if (user_row_id) {
                    const check_users_query = await professionals_location_searchM.findOne({ user_row_id: user_row_id, location_row_id: check_query._id })
                    if (!check_users_query) {
                        await professionals_location_searchM({
                            user_row_id: user_row_id,
                            location_row_id: check_query._id,
                            updated_date_n_time: getPresentDateTime()
                        }).save()
                    }
                    else {
                        await professionals_location_searchM.updateOne({ _id: check_users_query._id }, { $set: { count: (check_users_query.count) + 1, updated_date_n_time: getPresentDateTime() } })
                    }
                }
                res.json({ status: true, message: "User's search location updated successfully" })

            }

        }
    }
    catch (err) {
        console.log('Save locatoin.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post(
    "/image_proxy",
    [
        check("url")
            .trim()
            .not()
            .isEmpty()
            .withMessage("The image URL field is required."),
    ],
    async (req, res) => {
        try {
            // 🔍 Validate request fields
            const errors = validationResult(req);
            const errObj = arrangeValidation(errors);

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }
            // 🖼️ Get and sanitize URL
            const imageUrl = req.body.url;
            if (!imageUrl.startsWith("http")) {
                return res.json({
                    status: false,
                    message: "Invalid image URL.",
                });
            }

            // 🌐 Fetch image from remote server
            const response = await fetch(imageUrl);
            if (!response.ok) {
                return res.json({
                    status: false,
                    message: "Failed to fetch image from remote server.",
                });
            }

            const buffer = await response.arrayBuffer();

            // ✅ Send back image data with CORS headers
            res.setHeader(
                "Content-Type",
                response.headers.get("Content-Type") || "image/jpeg"
            );
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.send(Buffer.from(buffer));
        } catch (err) {
            console.log("Image Proxy Error:", err.message);
            res.json({
                status: false,
                message: "An unexpected error occurred. Please try again later.",
            });
        }
    }
);

router.buildGlobalSearchUsersInfoWorkPipeline = buildGlobalSearchUsersInfoWorkPipeline
router.buildGlobalSearchPageInfoWorkPipeline = buildGlobalSearchPageInfoWorkPipeline
router.buildGlobalSearchAllInfoWorkPipeline = buildGlobalSearchAllInfoWorkPipeline
router.buildTrendingInfoWorkPipeline = buildTrendingInfoWorkPipeline

module.exports = router