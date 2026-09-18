require('dotenv').config()
const jwt = require('jsonwebtoken')
const express = require('express')
const sanitize = require('mongo-sanitize')
const router = express.Router()
const JWT_CLAIM_SECRET_KEY = process.env.JWT_CLAIM_SECRET_KEY
import professionals_social_linksM from '../../models/app/professionals_social_linksM'
import logger from '../../config/logger';

const { check, validationResult } = require('express-validator')
const { getMinusDates, arrangeValidation, user_profile_completed_percentage, getPresentDateTime, getSocialURL, array_column, getIntIdFromArray, createDateTime, createEndDateOnly, getIntValues, getDistanceFromLatLon } = require('../../utils/helpers/helper')
const { getUpdateTrackerFields } = require('../../utils/helpers/app_helper')
const { checkUserLoginToken } = require('../../middleware/authorization')
const { sendEmail } = require('../../config/email')
const { updateThreadNotification } = require('../../utils/helpers/notification_helper')
const { getEventsData, filterQuery, professionalfilterQuery } = require('../../utils/helpers/events_helper')
const { setCache, getCache } = require('../../config/cache_helper')
const { getUserDetails, getUserOtherDetails, getUserListDetails, getPopularProfessionalsDetails, getTrendingUsersDetails, getSearchUsersDetails } = require('../../services/app/linkPageServices');

const professionalsM = require('../../models/app/professionalsM')
const professionals_followersM = require('../../models/app/professionals_followersM')
const professionals_delete_actionsM = require('../../models/app/professionals_delete_actionsM')
const professionals_seo_detailsM = require('../../models/app/professionals_seo_detailsM')
const userDesignationM = require('../../models/app/static/user_designationsM')
const userLookingForM = require('../../models/app/static/user_looking_forM')
const companyFollowersM = require('../../models/app/company/followersM')
const default_profile_imgM = require('../../models/app/static/default_profile_imgM')
const professionals_created_by_adminM = require('../../models/app/professionals_created_by_adminM')
const professionals_claimed_requestM = require('../../models/app/professionals_claimed_requestM')
const professionals_faqM = require('../../models/app/users/professionals_faqM')
const professionals_awardsM = require('../../models/app/users/professionals_awardsM')


const eventM = require('../../models/app/events/eventM')
const event_speakersM = require('../../models/app/events/event_speakersM')
const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')
const app_exchangeM = require('../../models/markets/app_exchangeM')
const courses_certificatesM = require('../../models/main/academy/courses_certificatesM')
const countryM = require('../../models/app/static/countryM')

router.get('/twitter_list/:skip/:limit', async (req, res) => {
    try {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        // PERF FIX: list and count used to run as two sequential awaits — they're
        // independent of each other, so run them concurrently instead.
        const [get_query, count_query] = await Promise.all([
            professionals_social_linksM.aggregate([
                {
                    $match: {
                        $or: [
                            { twitter: { $exists: true, $ne: "" } },
                            { facebook: { $exists: true, $ne: "" } },
                            { linkedin: { $exists: true, $ne: "" } },
                            { instagram: { $exists: true, $ne: "" } },
                            { telegram: { $exists: true, $ne: "" } },
                            { medium: { $exists: true, $ne: "" } },
                            { reddit: { $exists: true, $ne: "" } },
                            { feed_url: { $exists: true, $ne: "" } }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "info_user",
                        pipeline: [
                            {
                                $match: { login_status: 1, approval_status: 1, user_name: { $exists: true, $ne: "" } }
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
                                    _id: 0,
                                    user_name: 1,
                                    profile_image: "$img_info.profile_image",
                                    full_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_user" } },
                {
                    $project: {
                        _id: 0,
                        user_name: "$info_user.user_name",
                        profile_image: "$info_user.profile_image",
                        full_name: "$info_user.full_name",
                        user_row_id: 1,
                        twitter: 1,
                        facebook: 1,
                        linkedin: 1,
                        instagram: 1,
                        telegram: 1,
                        medium: 1,
                        reddit: 1,
                        feed_url: 1,
                    }
                }
            ]).skip(skip).limit(limit),
            professionals_social_linksM.aggregate([
                {
                    $match: {
                        $or: [
                            { twitter: { $exists: true, $ne: "" } },
                            { facebook: { $exists: true, $ne: "" } },
                            { linkedin: { $exists: true, $ne: "" } },
                            { instagram: { $exists: true, $ne: "" } },
                            { telegram: { $exists: true, $ne: "" } },
                            { medium: { $exists: true, $ne: "" } },
                            { reddit: { $exists: true, $ne: "" } },
                            { feed_url: { $exists: true, $ne: "" } }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "info_user",
                        pipeline: [
                            {
                                $match: { login_status: 1, approval_status: 1, user_name: { $exists: true, $ne: "" } }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_user" } },
                {
                    $count: 'count'
                }
            ])
        ])

        let total_counts = 0
        if (count_query[0]) {
            total_counts = count_query[0].count
        }

        res.json({ status: true, message: get_query, count: total_counts })
    }
    catch (err) {
        console.log('twitter list.', err.message)
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
    }
})


router.get('/user_follower_ids', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)

            let followers_id = []
            const total_followers = await professionals_followersM.find({ follower_user_row_id: user_row_id }, { following_user_row_id: 1 })
            if (total_followers) {
                followers_id = await array_column(total_followers, 'following_user_row_id')
            }

            res.json({ status: true, followers_id: followers_id })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('User follower ids.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/overview', async (req, res) => {
    try {
        let result = {}
        let report_list_type = 1
        if (req.query.report_list_type) {
            report_list_type = Number.parseInt(req.query.report_list_type)
        }

        let searchArray = [{}]
        if (req.query.search) {
            searchArray.push({ $or: [{ user_name: { '$regex': req.query.search, $options: 'i' } }, { full_name: { '$regex': req.query.search, $options: 'i' } }] })
        }

        if (req.query.tags) {
            searchArray.push({ designation_id: { $in: await getIntIdFromArray(req.query.tags) } })
        }

        if (req.query.location) {
            searchArray.push({ location: { $regex: sanitize(req.query.location), $options: 'i' } })
        }

        let match_query = {}

        if (report_list_type === 2) {
            const eventTypeId = Number.parseInt(req.query.event_type_id)
            if (eventTypeId === 1) {
                const start_date = getMinusDates(7)
                match_query = { start_date: { $gte: new Date(start_date) } }
            }
            // else if (eventTypeId === 2) {
            //     sort_filter = { $sort: { total_speakers_in_events: -1 } }
            // }
            // else if (eventTypeId === 3) {
            //     sort_filter = { $sort: { total_speakers_in_events: 1 } }
            // }
        }

        if (report_list_type === 4) {
            if (req.query.category_row_id) {
                searchArray.push({ category_ids: Number.parseInt(req.query.category_row_id) })
            }
        }


        let search_query = { $and: searchArray }

        let funds_invested_query = ''
        let speakers_query = ''
        let hosted_events_query = ''
        let exchanges_query = ''
        let funds_rounds_query = ''
        if (report_list_type === 2) {
            speakers_query = event_speakersM.aggregate([
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
                    $set: {
                        start_date: '$event_info.start_date'
                    }
                },
                {
                    $match: match_query
                },
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
                                    login_status: 1, approval_status: 1, user_name: { $exists: true }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    designation_id: 1,
                                    full_name: 1,
                                    location: 1,
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
                        location: "$user_info.location",
                        designation_id: "$user_info.designation_id",
                        full_name: "$user_info.full_name"
                    }
                },
                { $match: search_query },
                {
                    $group: {
                        _id: '',
                        count: {
                            $sum: '$count'
                        }
                    }
                }
            ])

            hosted_events_query = event_speakersM.aggregate([
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
                    $set: {
                        start_date: '$event_info.start_date'
                    }
                },
                {
                    $match: match_query
                },
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
                                    login_status: 1, approval_status: 1, user_name: { $exists: true }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    designation_id: 1,
                                    full_name: 1,
                                    location: 1,
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
                        location: "$user_info.location",
                        designation_id: "$user_info.designation_id",
                        full_name: "$user_info.full_name"
                    }
                },
                { $match: search_query },
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "host_event_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        { active_status: 1, approval_status: 1 },
                                        { list_event_type: { $in: [1, 3] } }
                                    ]
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
                { $unwind: { path: "$host_event_info" } },
                {
                    $group: {
                        _id: '',
                        count: {
                            $sum: 1
                        }
                    }
                }
            ])
        }
        else if (report_list_type === 3) {
            exchanges_query = app_exchangeM.aggregate([
                {
                    $match: {
                        founder_user_type: 1
                    }
                },
                {
                    $group: {
                        _id: '$founder_user_row_id',
                        exchange: {
                            $push: {
                                exchange_name: '$exchange_name',
                                exchange_slug: '$exchange_slug',
                                exchange_image: '$exchange_image',
                                total_pairs: '$total_pairs',
                                total_coins: '$total_coins',
                                volume_24h: '$volume_24h',
                            }
                        },
                        count: {
                            $sum: 1
                        }
                    }
                },
                {
                    $sort: {
                        count: -1, _id: 1
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: '_id',
                        foreignField: '_id',
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $project: {
                                    user_name: 1,
                                    full_name: 1,
                                    gender: 1,
                                    designation_id: 1,
                                    country_id: 1,
                                    account_visible_type: 1,
                                    login_status: 1,
                                    location: 1,
                                    approval_status: 1,
                                    about_in_one_line: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: '$user_info' }
                },
                {
                    $set: {
                        designation_id: '$user_info.designation_id',
                        country_id: '$user_info.country_id',
                        user_name: "$user_info.user_name",
                        location: "$user_info.location",
                        full_name: "$user_info.full_name"
                    }
                },
                { $match: search_query },
                {
                    $group: {
                        _id: '',
                        count: {
                            $sum: '$count'
                        }
                    }
                }
            ])
        }
        else if (report_list_type === 4) {
            funds_invested_query = fundingInvestmentM.aggregate([
                {
                    $match: {
                        investor_type: 1, investor_registered_type: 1, verified_status: 1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        let: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$funds_raised_registered_type'] },
                                                    { $eq: ['$_id', '$$funds_raised_company_row_id'] }
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
                                    company_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        investor_data: {
                            $switch: {
                                branches: [
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$funds_raised_registered_type', 1] }
                                            ]
                                        },
                                        then: '$company_info._id'
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$funds_raised_registered_type', 2] }
                                            ]
                                        },
                                        then: '$funds_raised_company_row_id'
                                    },
                                ],
                                default: 0
                            }
                        }
                    }
                },
                {
                    $match: { investor_data: { $gt: 0 } }
                },
                {
                    $group: {
                        _id: "$investor_row_id",
                        category_ids: { $addToSet: '$category_row_id' },
                        total_amount: { $sum: '$amount' }
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
                                    login_status: 1, approval_status: 1, user_name: { $exists: true }
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
                                $lookup:
                                {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "country_info",
                                    pipeline: [
                                        {
                                            $project: {
                                                _id: 0,
                                                country_name: 1,
                                                country_flag: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    designation_id: 1,
                                    country_flag: "$country_info.country_flag",
                                    country_name: "$country_info.country_name",
                                    designation_array: "$designation_info.designation_name",
                                    approval_status: 1,
                                    gender: 1,
                                    account_visible_type: 1,
                                    about_in_one_line: 1,
                                    location: 1,
                                    profile_image: "$img_info.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $set: {
                        designation_id: '$user_info.designation_id',
                        country_id: '$user_info.country_id',
                        user_name: "$user_info.user_name",
                        location: "$user_info.location",
                        full_name: "$user_info.full_name"
                    }
                },
                { $match: search_query },
                {
                    $group: {
                        _id: '',
                        amount: {
                            $sum: '$total_amount'
                        }
                    }
                }
            ])



            funds_rounds_query = fundingInvestmentM.aggregate([
                {
                    $match: {
                        investor_type: 1, investor_registered_type: 1, verified_status: 1
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        let: {
                            funds_raised_registered_type: '$funds_raised_registered_type',
                            funds_raised_company_row_id: '$funds_raised_company_row_id'
                        },
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$funds_raised_registered_type'] },
                                                    { $eq: ['$_id', '$$funds_raised_company_row_id'] }
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
                                    company_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        investor_data: {
                            $switch: {
                                branches: [
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$funds_raised_registered_type', 1] }
                                            ]
                                        },
                                        then: '$company_info._id'
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $eq: ['$funds_raised_registered_type', 2] }
                                            ]
                                        },
                                        then: '$funds_raised_company_row_id'
                                    },
                                ],
                                default: 0
                            }
                        }
                    }
                },
                {
                    $match: { investor_data: { $gt: 0 } }
                },
                {
                    $group: {
                        _id: "$investor_row_id",
                        total_amount: { $sum: '$amount' },
                        category_ids: { $addToSet: '$category_row_id' },
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
                                    login_status: 1, approval_status: 1, user_name: { $exists: true }
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
                                $lookup:
                                {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "country_info",
                                    pipeline: [
                                        {
                                            $project: {
                                                _id: 0,
                                                country_name: 1,
                                                country_flag: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    designation_id: 1,
                                    country_flag: "$country_info.country_flag",
                                    country_name: "$country_info.country_name",
                                    designation_array: "$designation_info.designation_name",
                                    approval_status: 1,
                                    gender: 1,
                                    account_visible_type: 1,
                                    about_in_one_line: 1,
                                    location: 1,
                                    profile_image: "$img_info.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $set: {
                        designation_id: '$user_info.designation_id',
                        country_id: '$user_info.country_id',
                        user_name: "$user_info.user_name",
                        location: "$user_info.location",
                        full_name: "$user_info.full_name"
                    }
                },
                { $match: search_query },
                { $unwind: "$category_ids" },
                {
                    $group: {
                        _id: null,
                        category_ids: { $addToSet: "$category_ids" }
                    }
                },
                {
                    $project: {
                        count: { $size: '$category_ids' }
                    }
                }
            ])
        }
        const queries = [
            funds_invested_query,
            speakers_query,
            exchanges_query,
            funds_rounds_query,
            hosted_events_query
        ].filter(query => query !== ""); // Filter out empty strings

        const results = await Promise.all(queries);

        // Extract results safely, providing default empty arrays
        const total_funds_invested = results[queries.indexOf(funds_invested_query)] || [];
        const total_speakers = results[queries.indexOf(speakers_query)] || [];
        const total_exchanges = results[queries.indexOf(exchanges_query)] || [];
        const total_funds_rounds = results[queries.indexOf(funds_rounds_query)] || [];
        const total_hosted_events = results[queries.indexOf(hosted_events_query)] || [];

        result['total_funds_invested'] = total_funds_invested[0] ? total_funds_invested[0].amount : 0
        result['total_speakers'] = total_speakers[0] ? total_speakers[0].count : 0
        result['total_exchanges'] = total_exchanges[0] ? total_exchanges[0].count : 0
        result['total_funds_rounds'] = total_funds_rounds[0] ? total_funds_rounds[0].count : 0
        result['total_hosted_events'] = total_hosted_events[0] ? total_hosted_events[0].count : 0


        res.json({ status: true, message: result, searchArray, sdfa: req.query })

    }
    catch (err) {

        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
    }
})


router.get('/user_other_details/:username', async (req, res) => {
    try {
        let user_row_id = 0
        let username = req.params.username
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const result = await getUserOtherDetails({ username, user_row_id, query: req.query, headers: req.headers });

        if (result.status) {
            return res.json({
                status: true,
                message: result.message,
                cache_response_status: result.cache_response_status || false
            });
        } else {
            return res.json({
                status: false,
                message: result.message
            });
        }
    }
    catch (err) {
        console.log('User other details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/user_detail/:username', async (req, res) => {
    try {
        let user_row_id = 0
        let username = req.params.username

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message
        }

        const result = await getUserDetails({ username, user_row_id });

        if (result.status) {
            res.json({
                status: true,
                message: result.message,
                cache_response_status: result.cache_response_status
            });
        } else {
            res.json({
                status: false,
                message: result.message
            });
        }
    }
    catch (err) {
        logger.error('Controller error in /user_detail:', err instanceof Error ? err.message : String(err));
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
})


const userDetails = async ({ user_row_id, username }) => {
    let resultArray = {}
    const query_run = await professionalsM.aggregate([
        { $match: { login_status: 1, approval_status: 1, user_name: username } },
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
                from: "cln_static_user_looking_for_lists",
                localField: "looking_for_id",
                foreignField: "_id",
                as: "looking_for_info",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1
                        }
                    }
                ]
            }
        },
        {
            $lookup:
            {
                from: "cln_professionals_social_links",
                localField: "_id",
                foreignField: "user_row_id",
                as: "social_info"
            }
        },
        { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_professionals_seo_details",
                localField: "_id",
                foreignField: "user_row_id",
                as: "seo_info"
            }
        },
        { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_static_countries",
                localField: "country_mobile_id",
                foreignField: "_id",
                as: "country_info"
            }
        },
        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
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
                podcast_id: 1,
                podcast_title: 1,
                email_id: 1,
                mobile_number: 1,
                country_id: 1,
                country_mobile_id: 1,
                view_counts: 1,
                gender: 1,
                wallet_address: 1,
                created_date_n_time: 1,
                company_name: 1,
                work_position: 1,
                designation_id: 1,
                pro_batch: 1,
                account_visible_type: 1,
                about_in_one_line: 1,
                looking_for_id: "$looking_for_id",
                looking_for: '$looking_for_info',
                designations_array: '$designation_info',
                feed_url: '$social_info.feed_url',
                area: 1,
                city: 1,
                state: 1,
                longitude: 1,
                latitude: 1,
                website: "$social_info.website",
                facebook: "$social_info.facebook",
                twitter: "$social_info.twitter",
                linkedin: "$social_info.linkedin",
                instagram: "$social_info.instagram",
                video_link: "$social_info.video_link",
                telegram: "$social_info.telegram",
                medium: "$social_info.medium",
                reddit: "$social_info.reddit",
                youtube_channel: "$social_info.youtube_channel",
                vcf_status: "$vcf_status",
                profile_image: "$img_info.profile_image",
                profile_image_type: "$img_info.profile_image_type",
                user_bio: "$user_bio",
                location: 1,
                meta_keywords: "$seo_info.meta_keywords",
                meta_title: "$seo_info.meta_title",
                meta_description: "$seo_info.meta_description",
                robots_index: "$seo_info.robots_index",
                robots_follow: "$seo_info.robots_follow",
                og_title: "$seo_info.og_title",
                og_description: "$seo_info.og_description",
                twitter_title: "$seo_info.twitter_title",
                twitter_description: "$seo_info.twitter_description",
                twitter_creator: "$seo_info.twitter_creator",
                country_code: "$country_info.country_code",
                country_name: "$country_info.country_name",
                country_flag: "$country_info.country_flag",
                sub_admin_row_id: 1,
                claim_status: 1,
            }
        }
    ])

    if (query_run[0]) {
        let user_following_status = 0
        if ((user_row_id > 0) && (user_row_id != query_run[0]._id)) {
            const present_follow_query = await professionals_followersM.findOne({ following_user_row_id: query_run[0]._id, follower_user_row_id: user_row_id }, { confirm_request_status: 1 })
            if (present_follow_query) {
                user_following_status = present_follow_query.confirm_request_status
            }
        }

        if ((Number.parseInt(query_run[0].account_visible_type) === 2) || (user_following_status === 2) || (query_run[0]._id == user_row_id)) {
            resultArray['_id'] = query_run[0]._id
            resultArray['user_name'] = query_run[0].user_name
            resultArray['full_name'] = query_run[0].full_name
            resultArray['pro_batch'] = query_run[0].pro_batch
            resultArray['email_id'] = query_run[0].email_id
            resultArray['mobile_number'] = query_run[0].mobile_number
            resultArray['country_id'] = query_run[0].country_id
            resultArray['country_mobile_id'] = query_run[0].country_mobile_id
            resultArray['gender'] = query_run[0].gender
            resultArray['wallet_address'] = query_run[0].wallet_address
            resultArray['created_date_n_time'] = query_run[0].created_date_n_time
            resultArray['designation_id'] = query_run[0].designation_id
            resultArray['profile_image'] = query_run[0].profile_image
            resultArray['profile_image_type'] = query_run[0].profile_image_type
            resultArray['user_bio'] = query_run[0].user_bio
            resultArray['location'] = query_run[0].location
            resultArray['country_code'] = query_run[0].country_code
            resultArray['country_name'] = query_run[0].country_name
            resultArray['country_flag'] = query_run[0].country_flag
            resultArray['facebook'] = await getSocialURL(query_run[0].facebook, 5)
            resultArray['twitter'] = await getSocialURL(query_run[0].twitter, 1)
            resultArray['linkedin'] = query_run[0].linkedin
            resultArray['vcf_status'] = query_run[0].vcf_status
            resultArray['instagram'] = await getSocialURL(query_run[0].instagram, 6)
            resultArray['video_link'] = query_run[0].video_link
            resultArray['youtube_channel'] = query_run[0].youtube_channel
            resultArray['telegram'] = await getSocialURL(query_run[0].telegram, 3)
            resultArray['medium'] = await getSocialURL(query_run[0].medium, 7)
            resultArray['reddit'] = await getSocialURL(query_run[0].reddit, 4)
            resultArray['podcast_id'] = query_run[0].podcast_id
            resultArray['view_counts'] = query_run[0].view_counts
            resultArray['claim_status'] = query_run[0].claim_status
            resultArray['account_visible_type'] = query_run[0].account_visible_type
            resultArray['meta_keywords'] = query_run[0].meta_keywords
            resultArray['meta_title'] = query_run[0].meta_title
            resultArray['meta_description'] = query_run[0].meta_description
            resultArray['robots_index'] = query_run[0].robots_index
            resultArray['robots_follow'] = query_run[0].robots_follow
            resultArray['og_title'] = query_run[0].og_title
            resultArray['og_description'] = query_run[0].og_description
            resultArray['twitter_title'] = query_run[0].twitter_title
            resultArray['twitter_description'] = query_run[0].twitter_description
            resultArray['twitter_creator'] = query_run[0].twitter_creator

            resultArray['about_in_one_line'] = query_run[0].about_in_one_line
            resultArray['website'] = query_run[0].website
            resultArray['area'] = query_run[0].area
            resultArray['city'] = query_run[0].city
            resultArray['state'] = query_run[0].state
            resultArray['longitude'] = query_run[0].longitude
            resultArray['latitude'] = query_run[0].latitude
            resultArray['feed_url'] = query_run[0].feed_url
            resultArray['designations_array'] = query_run[0].designations_array
            resultArray['looking_for_id'] = query_run[0].looking_for_id
            resultArray['looking_for'] = query_run[0].looking_for
            resultArray['user_following_status'] = query_run[0].user_following_status
            resultArray['professional_profile_score'] = query_run[0]?.professional_profile_score
            resultArray['seo_details_score'] = query_run[0]?.seo_details_score
            resultArray['social_media_score'] = query_run[0]?.social_media_score
            resultArray['academy_score'] = query_run[0]?.academy_score
            resultArray['community_score'] = query_run[0]?.community_score
            resultArray['professional_detail_score'] = query_run[0]?.professional_detail_score
            resultArray['investment_score'] = query_run[0]?.investment_score
            resultArray['award_score'] = query_run[0]?.award_score
            resultArray['faq_score'] = query_run[0]?.faq_score
            resultArray['profile_score'] = query_run[0]?.profile_score



            const profile_completed_percentage_query = user_profile_completed_percentage(resultArray)

            const total_followers_query = professionals_followersM.aggregate([
                { $match: { following_user_row_id: query_run[0]._id, confirm_request_status: 2 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "follower_user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: { "login_status": 1 } } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ])

            const total_following_query = professionals_followersM.aggregate([
                { $match: { follower_user_row_id: query_run[0]._id, confirm_request_status: 2 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "following_user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: { "login_status": 1 } } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ])

            const work_experience_query = professionals_work_experienceM.aggregate([
                {
                    $match: { user_row_id: query_run[0]._id, public_view: true, user_account_type: 1 }
                },
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
                {
                    $lookup:
                    {
                        from: "cln_manual_user_positions",
                        let: {
                            position_type: '$position_type',
                            sub_position_row_id: '$sub_position_row_id'
                        },
                        as: "manual_position_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: [2, "$$position_type"] },
                                            { $eq: ["$_id", "$$sub_position_row_id"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    position_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },
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
                        position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
                        company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                    }
                },
            ]).limit(1)

            const [total_followers, total_following, work_experience, profile_completed_percentage] = await Promise.all([total_followers_query, total_following_query, work_experience_query, profile_completed_percentage_query])
            resultArray['profile_completed_percentage'] = profile_completed_percentage

            resultArray['total_followers'] = total_followers[0] ? total_followers[0].count : 0
            resultArray['total_following'] = total_following[0] ? total_following[0].count : 0
            if (work_experience[0]) {
                resultArray['company_name'] = work_experience[0].company_name
                resultArray['position_name'] = work_experience[0].position_name
            }

            return { status: true, message: resultArray }
        }
        else {
            resultArray['_id'] = query_run[0]._id
            resultArray['user_name'] = query_run[0].user_name
            resultArray['full_name'] = query_run[0].full_name
            resultArray['account_visible_type'] = query_run[0].account_visible_type
            resultArray['profile_image'] = query_run[0].profile_image
            resultArray['profile_image_type'] = query_run[0].profile_image_type
            resultArray['designation_id'] = query_run[0].designation_id
            resultArray['facebook'] = query_run[0].facebook
            resultArray['email_id'] = query_run[0].email_id
            resultArray['twitter'] = query_run[0].twitter
            resultArray['linkedin'] = query_run[0].linkedin
            resultArray['instagram'] = query_run[0].instagram
            resultArray['video_link'] = query_run[0].video_link
            resultArray['telegram'] = query_run[0].telegram
            resultArray['medium'] = query_run[0].medium
            resultArray['reddit'] = query_run[0].reddit
            resultArray['vcf_status'] = query_run[0].vcf_status
            resultArray['claim_status'] = query_run[0].claim_status
            resultArray['alert_message'] = 'This account is private.'
            resultArray['user_bio'] = query_run[0].user_bio
            resultArray['meta_keywords'] = query_run[0].meta_keywords
            resultArray['meta_title'] = query_run[0].meta_title
            resultArray['meta_description'] = query_run[0].meta_description
            resultArray['robots_index'] = query_run[0].robots_index
            resultArray['robots_follow'] = query_run[0].robots_follow
            resultArray['og_title'] = query_run[0].og_title
            resultArray['og_description'] = query_run[0].og_description
            resultArray['twitter_title'] = query_run[0].twitter_title
            resultArray['twitter_description'] = query_run[0].twitter_description
            resultArray['twitter_creator'] = query_run[0].twitter_creator
            resultArray['country_code'] = query_run[0].country_code
            resultArray['country_name'] = query_run[0].country_name
            resultArray['country_flag'] = query_run[0].country_flag
            resultArray['designations_array'] = query_run[0].designations_array
            resultArray['looking_for_id'] = query_run[0].looking_for_id
            resultArray['looking_for'] = query_run[0].looking_for
            resultArray['professional_profile_score'] = query_run[0]?.professional_profile_score
            resultArray['seo_details_score'] = query_run[0]?.seo_details_score
            resultArray['social_media_score'] = query_run[0]?.social_media_score
            resultArray['academy_score'] = query_run[0]?.academy_score
            resultArray['community_score'] = query_run[0]?.community_score
            resultArray['professional_detail_score'] = query_run[0]?.professional_detail_score
            resultArray['investment_score'] = query_run[0]?.investment_score
            resultArray['award_score'] = query_run[0]?.award_score
            resultArray['faq_score'] = query_run[0]?.faq_score
            resultArray['profile_score'] = query_run[0]?.profile_score


            const user_designation_head = await professionals_work_experienceM.find({ user_row_id: query_run[0]._id, till_date_status: 2, public_view: true }, { position: 1, company_name: 1, till_date_status: 1 }).sort({ start_date: -1 }).limit(1)
            if (user_designation_head && user_designation_head.length > 0) {
                resultArray['company_name'] = user_designation_head[0].company_name
                resultArray['work_position'] = user_designation_head[0].position
            }
            else {
                resultArray['company_name'] = query_run[0].company_name
                resultArray['work_position'] = query_run[0].work_position

            }


            resultArray['designations_array'] = []
            if (query_run[0].designation_id) {
                resultArray['designations_array'] = await userDesignationM.find({ _id: { $in: query_run[0].designation_id }, active_status: true }, { designation_name: 1 })
            }

            resultArray['user_following_status'] = user_following_status

            return { status: true, message: resultArray }
        }
    }
    else {
        let result = {}
        result['alert_message'] = 'This user account is not valid.'
        result['account_status'] = 0
        //account_status -> 1:Account disabled, 2:Account Deleted
        const get_users_login_status_query = await professionalsM.findOne({ approval_status: 1, login_status: { $in: [0, 2] }, user_name: username }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
        if (get_users_login_status_query) {
            result['account_status'] = 1
            result['alert_message'] = 'This user account is disabled.'
        }

        if (result['account_status'] === 0) {
            const get_users_delete_query = await professionals_delete_actionsM.findOne({ user_name: username, approval_status: 1 }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
            if (get_users_delete_query) {
                result['account_status'] = 2
                result['alert_message'] = 'This user account is deleted.'
            }
        }

        return { status: false, message: result }
    }
}


router.post('/claim_user', [
    check('user_row_id')
        .trim().not().isEmpty().withMessage('The User row Id field is required.'),
    check('email_id')
        .trim().not().isEmpty().withMessage('The email id field is required')
        .isEmail().withMessage('The email id field must be contain valid email.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)


        const user_row_id = sanitize(req.body.user_row_id)
        let check_active_user_query = ""
        if (Number.isNaN(Number.parseInt(req.body.user_row_id))) {
            errObj['user_row_id'] = 'The User row id field must be contain valid number.'
        }
        else {
            const check_active_user_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1, approval_status: 1, claim_status: 1 })
            if (!check_active_user_query) {
                errObj['user_row_id'] = 'Sorry, Invalid User Claim Request.'
            }
        }

        let claim_email_id = ""
        if (req.body.email_id) {
            claim_email_id = (sanitize(req.body.email_id)).toLowerCase()

            const check_space = /\s/.test(claim_email_id)
            if (check_space) {
                errObj['email_id'] = 'Email id should not contain white spaces.'
            }
            //for different email id used by other account
            const checkEmail = await professionalsM.findOne({ email_id: claim_email_id, _id: { $ne: user_row_id } })
            if (checkEmail) {
                errObj['email_id'] = 'Sorry, This Email ID already exists for other account. You can login this account & check this account details.'
            }

            //If same email id exist for requested acccount
            const checkSameEmail = await professionalsM.findOne({ email_id: claim_email_id, _id: user_row_id })
            if (checkSameEmail) {
                errObj['alert_message'] = 'This account has been created with above submitted email id, you can directly login.'
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {

            const check_alreday_requested_query = await professionals_claimed_requestM.findOne({ claim_email_id: claim_email_id, user_row_id: user_row_id, claim_request_status: 1 })
            if (!check_alreday_requested_query) {
                let claim_request_type = 1
                if (check_active_user_query.email_id) {
                    claim_request_type = 2
                }

                const insertArr = {}
                insertArr['user_row_id'] = user_row_id
                insertArr['claim_email_id'] = claim_email_id
                insertArr['claim_request_status'] = 1 // 
                insertArr['claim_request_type'] = claim_request_type
                insertArr['created_date_n_time'] = getPresentDateTime()

                const claim_insert_query = await professionals_claimed_requestM(insertArr).save()

                await updateThreadNotification({
                    user_row_id: -1,
                    notify_type: 7,
                    notify_type_row_id: claim_insert_query._id,
                    message_row_id: 26,
                    action_row_id: claim_insert_query._id
                })

                if (claim_request_type == 2) {
                    let full_name = check_active_user_query.full_name
                    let user_name = check_active_user_query.user_name
                    let pass_email_id = check_active_user_query.email_id

                    let pass_subject = "CoinPedia User Account Claim Request with Different Email"
                    let pass_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                     <p style="color:#000;font-weight: 400;font-size:17px;">We are reaching out to inform you that a claim request has been made for your CoinPedia account by <span style="color:#0029ff;">${insertArr.claim_email_id}</span> .If this request was not made by you, please claim your account within 2 working days to avoid any unauthorized access.</p>
                     <p style="color:#000;font-weight: 400;font-size:17px;">To claim your account, please visit <a href=${"https://app.coinpedia.org/" + user_name} target="_blank" rel="nofollow" style="color:#0029ff;">${"https://app.coinpedia.org/" + user_name}</a></p>
                    `
                    await sendEmail(pass_email_id, pass_subject, pass_message)
                }
                res.json({ status: true, message: { alert_message: 'Your claim account request with an email address has been received. Please wait, the admin to send you claim status details to the email address.' } })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Your verify account request is already submitted, please wait until admin approve' } })
            }
        }

    }
    catch (err) {
        console.log('Claim user.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/check_verify_claim_token/:claim_verify_token', async (req, res) => {
    try {
        const claim_verify_token = checkClaimVerifyCode(req.params.claim_verify_token)
        if (claim_verify_token.status) {
            res.json({ status: true, message: { alert_message: 'The claim verify token is valid.' } })
        }
        else {
            res.json(claim_verify_token)
        }

    }
    catch (err) {
        console.log('Check verify claim token.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

const checkClaimVerifyCode = function (param_claim_verify_code) {
    try {
        const claim_token = jwt.verify(param_claim_verify_code, JWT_CLAIM_SECRET_KEY)
        if (claim_token.expire_at) {
            if (claim_token.expire_at < (new Date().getTime())) {
                return { status: false, message: "The claim verify code field is expired." }
            }
        }
        return { status: true, message: claim_token }
    }
    catch (err) {
        console.log('Check claim verify code.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
}

router.post('/verify_claim_change_password', [
    check('claim_verify_token')
        .trim().not().isEmpty().withMessage('The Claim Verify token field is required.'),
    check('password')
        .trim().not().isEmpty().withMessage('The password Id field is required.')
        .isLength({ min: 6 }).withMessage('The Password field must be at least 6 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let claim_verify_token = ''

        if (req.body.claim_verify_token) {
            claim_verify_token = checkClaimVerifyCode(req.body.claim_verify_token)
            if (!claim_verify_token.status) {
                errObj['claim_verify_token'] = claim_verify_token.message
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const user_row_id = claim_verify_token.message.user_row_id
            const claim_verify_code = claim_verify_token.message.claim_verify_code
            const checkCreatedby = await professionals_created_by_adminM.findOne({ user_row_id: user_row_id, claim_verify_code: claim_verify_code })
            if (checkCreatedby) {
                if (Number.parseInt(checkCreatedby.claim_status) === 1) {
                    // const password = md5(req.body.password)
                    //update password in user table
                    // await professionalsM.updateOne({ _id: checkCreatedby.user_row_id }, { $set: { password: password, email_verify_status: 1 } })
                    await professionalsM.updateOne({ _id: checkCreatedby.user_row_id }, { $set: { email_verify_status: 1 } })
                    //change claim status to 2
                    await professionals_created_by_adminM.updateOne({ user_row_id: user_row_id, claim_verify_code: claim_verify_code }, { $set: { claim_status: 2 } })

                    res.json({ status: true, message: { alert_message: 'Your account has been claimed and password is set successfully.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, This user account already claimed.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'The claim verify code field is invalid or expired.' } })
            }
        }
    }
    catch (err) {
        console.log('Verify change claim password.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get("/trending_users", async (req, res) => {
    try {
        let { skip, limit } = req.query;
        skip = !Number.isNaN(Number.parseInt(skip)) ? Number.parseInt(skip) : 0;
        limit = !Number.isNaN(Number.parseInt(limit)) ? Number.parseInt(limit) : 10;

        const result = await getTrendingUsersDetails(skip, limit);

        res.json({
            success: result.status,
            message: result.message,
            cache_response_status: result.cache_response_status,
            response_time: result.response_time
        });
    } catch (error) {
        console.error("Error in /trending_users:", error.message);
        res.json({ success: false, message: error.message });
    }
});


router.get('/search_users', async (req, res) => {
    try {
        let limit = 10;
        if (req.query.limit && !Number.isNaN(Number.parseInt(req.query.limit))) {
            limit = Number.parseInt(req.query.limit);
        }

        let search = req.query.search || "";

        const result = await getSearchUsersDetails(search, limit);

        res.json({
            status: result.status,
            message: result.message,
            cache_response_status: result.cache_response_status,
        });
    } catch (error) {
        console.error("Error in /search_users:", error.message);
        res.json({
            status: false,
            message: [],
            err: error.message,
            cache_response_status: false
        });
    }
});


router.get("/compare_users_by_ids", async (req, res) => {
    try {
        let user_row_id = "";
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message;
        }
        let users_row_ids = [];

        if (req.query.users_row_ids) {
            let raw = req.query.users_row_ids;
            try {
                const parsed = JSON.parse(raw);

                if (Array.isArray(parsed) && parsed.length > 0) {
                    users_row_ids = parsed.map(v => Number.parseInt(v, 10));
                }
            } catch (e) {
                return res.json({
                    status: false,
                    message: { alert_message: "Invalid JSON format in users_row_ids." }
                });
            }
        }
        if (users_row_ids.length) {
            const get_query = await professionalsM.aggregate([
                { $match: { _id: { $in: users_row_ids } } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_social_links",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "social_info"
                    }
                },
                { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        as: "followers_info",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "follower_user_row_id",
                                    foreignField: "_id",
                                    as: "user_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: 1
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
                            { $unwind: { path: "$user_info" } },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        total_followers: { $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0] }
                    }
                },
                {
                    $sort: { total_followers: -1 }
                },
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
                                    _id: 0,
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
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },//,public_view:true
                            { $sort: { start_date: -1 } },
                            { $limit: 1 },
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
                            {
                                $lookup: {
                                    from: "cln_static_professionals_work_positions",
                                    let: { positions: { $ifNull: ["$positions", []] } },
                                    as: "resolved_static_positions",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.position_row_id" } }]
                                                }
                                            }
                                        },
                                        { $project: { _id: 1, position_name: 1 } }
                                    ]
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_manual_user_positions",
                                    let: { positions: { $ifNull: ["$positions", []] } },
                                    as: "resolved_manual_positions",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.sub_position_row_id" } }]
                                                }
                                            }
                                        },
                                        { $project: { _id: 1, position_name: 1 } }
                                    ]
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
                                                _id: 0,
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
                                                _id: 0,
                                                company_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    position_name: "$info_position.position_name",
                                    positions: {
                                        $cond: {
                                            if: { $gt: [{ $size: { $ifNull: ["$positions", []] } }, 0] },
                                            then: {
                                                $map: {
                                                    input: { $ifNull: ["$positions", []] },
                                                    as: "p",
                                                    in: {
                                                        position_type: "$$p.position_type",
                                                        position_row_id: "$$p.position_row_id",
                                                        sub_position_row_id: "$$p.sub_position_row_id",
                                                        position_name: {
                                                            $cond: {
                                                                if: { $eq: ["$$p.position_type", 2] },
                                                                then: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_manual_positions", cond: { $eq: ["$$this._id", "$$p.sub_position_row_id"] } } }, in: "$$this.position_name" } }, 0] },
                                                                else: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_static_positions", cond: { $eq: ["$$this._id", "$$p.position_row_id"] } } }, in: "$$this.position_name" } }, 0] }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            else: [{
                                                position_type: "$position_type",
                                                position_row_id: "$position_row_id",
                                                sub_position_row_id: "$sub_position_row_id",
                                                position_name: "$info_position.position_name"
                                            }]
                                        }
                                    },
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
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "country_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    country_name: 1,
                                    country_flag: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }, { $project: { confirm_request_status: 1 } }],
                        as: "info_user_followed"
                    }
                },
                { $unwind: { path: "$info_user_followed", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_events_speakers",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "speakers_info",
                        pipeline: [
                            { $match: { user_type: 1 } },
                            {
                                $lookup: {
                                    from: "cln_events",
                                    localField: "event_row_id",
                                    foreignField: "_id",
                                    as: "event_info",
                                    pipeline: [
                                        { $match: { active_status: 1, approval_status: 1 } },
                                        { $project: { _id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$event_info" } },
                            {
                                $group: {
                                    _id: "$user_row_id",
                                    total_speakers_in_events: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        total_speakers_in_events: { $ifNull: [{ $arrayElemAt: ["$speakers_info.total_speakers_in_events", 0] }, 0] }
                    }
                },

                {
                    $lookup: {
                        from: "cln_events",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "host_event_info",
                        pipeline: [
                            {
                                $match: {
                                    active_status: 1,
                                    approval_status: 1,
                                    list_event_type: { $in: [1, 3] }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        total_hosted: { $ifNull: [{ $arrayElemAt: ["$host_event_info.count", 0] }, 0] }
                    }
                },
                {
                    $lookup: {
                        from: "cln_event_sponsors_partner_details",
                        localField: "_id",
                        foreignField: "user_company_row_id",
                        as: "sponsor_info",
                    }
                },

                {
                    $lookup: {
                        from: "cln_event_sponsor_partner_details",
                        let: { userId: "$_id" },
                        as: "sponsor_info",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$user_company_row_id", "$$userId"] },
                                            { $eq: ["$account_type", 1] },
                                            { $eq: ["$registered_type", 1] },
                                            { $eq: ["$sponsor_partner_type", 1] }
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_events",
                                    localField: "event_row_id",
                                    foreignField: "_id",
                                    as: "event_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                active_status: 1,
                                                approval_status: 1,
                                                list_event_type: { $in: [1, 2, 3] }
                                            }
                                        },
                                        { $project: { _id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: "$event_info" },
                            {
                                $group: {
                                    _id: "$user_company_row_id",
                                    event_ids: { $addToSet: "$event_info._id" }
                                }
                            },
                            {
                                $project: {
                                    total_sponsored_events: { $size: "$event_ids" }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        total_sponsored_events: {
                            $ifNull: [{ $arrayElemAt: ["$sponsor_info.total_sponsored_events", 0] }, 0]
                        }
                    }
                },



                {
                    $lookup: {
                        from: "cln_event_sponsor_partner_details",
                        localField: "_id",
                        foreignField: "user_company_row_id",
                        as: "partner_info",
                        pipeline: [
                            {
                                $match: {
                                    account_type: 1,
                                    registered_type: 1,
                                    sponsor_partner_type: 2
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_events",
                                    localField: "event_row_id",
                                    foreignField: "_id",
                                    as: "event_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                active_status: 1,
                                                approval_status: 1,
                                                list_event_type: { $in: [1, 2, 3] }
                                            }
                                        },
                                        { $project: { _id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: "$event_info" },
                            {
                                $group: {
                                    _id: "$user_company_row_id",
                                    event_ids: { $addToSet: "$event_info._id" }
                                }
                            },
                            {
                                $project: {
                                    total_partnered_events: { $size: "$event_ids" }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        total_partnered_events: {
                            $ifNull: [{ $arrayElemAt: ["$partner_info.total_partnered_events", 0] }, 0]
                        }
                    }
                },

                {
                    $lookup: {
                        from: "cln_exchanges",
                        localField: "_id",
                        foreignField: "founder_user_row_id",
                        as: "exchange_info",
                        pipeline: [
                            { $match: { founder_user_type: 1 } },
                            {
                                $group: {
                                    _id: "$founder_user_row_id",
                                    exchange: {
                                        $push: {
                                            exchange_name: "$exchange_name",
                                            exchange_slug: "$exchange_slug",
                                            exchange_image: "$exchange_image",
                                            total_pairs: "$total_pairs",
                                            total_coins: "$total_coins",
                                            volume_24h: "$volume_24h",
                                        }
                                    },
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        exchange: { $ifNull: [{ $arrayElemAt: ["$exchange_info.exchange", 0] }, []] },
                    }
                },

                {
                    $lookup: {
                        from: "cln_funding_investment_lists",
                        let: { investor_id: "$_id" },
                        as: "fundings",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$investor_type", 1] },
                                            { $eq: ["$investor_registered_type", 1] },
                                            { $eq: ["$verified_status", 1] },
                                            { $eq: ["$investor_row_id", "$$investor_id"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_company_lists",
                                    let: {
                                        funds_raised_registered_type: "$funds_raised_registered_type",
                                        funds_raised_company_row_id: "$funds_raised_company_row_id"
                                    },
                                    as: "company_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                $and: [
                                                    {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: [1, "$$funds_raised_registered_type"] },
                                                                { $eq: ["$_id", "$$funds_raised_company_row_id"] }
                                                            ]
                                                        }
                                                    },
                                                    { active_status: 1 }
                                                ]
                                            }
                                        },
                                        { $project: { _id: 1, company_id: 1 } }
                                    ]
                                }
                            },
                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set: {
                                    investor_data: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: { $eq: ["$funds_raised_registered_type", 1] },
                                                    then: "$company_info._id"
                                                },
                                                {
                                                    case: { $eq: ["$funds_raised_registered_type", 2] },
                                                    then: "$funds_raised_company_row_id"
                                                }
                                            ],
                                            default: 0
                                        }
                                    }
                                }
                            },
                            { $match: { investor_data: { $gt: 0 } } },
                            {
                                $group: {
                                    _id: "$investor_row_id",
                                    total_invested_amount: { $sum: "$amount" },
                                    category_ids: { $addToSet: "$category_row_id" },
                                    invested_companies: {
                                        $addToSet: {
                                            type: "$funds_raised_registered_type",
                                            id: "$funds_raised_company_row_id"
                                        }
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_static_company_funding_rounds",
                                    localField: "category_ids",
                                    foreignField: "_id",
                                    as: "invested_rounds",
                                    pipeline: [{ $project: { category_name: 1 } }]
                                }
                            },

                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals_awards",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "awards_info",
                        // pipeline: [{ $project: { category_name: 1 } }]
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_courses_certificates", // adjust if your collection name differs
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "certificates",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "cln_academy_courses",
                                    localField: "course_row_id",
                                    foreignField: "_id",
                                    as: "course_info"
                                }
                            },
                            { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
                            {
                                $addFields: {
                                    has_expert_tag: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $ifNull: ["$course_info.expert_tag", false] },
                                                    { $ne: ["$course_info.expert_tag", ""] }
                                                ]
                                            },
                                            1,
                                            0
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        certificate_count: { $size: { $ifNull: ["$certificates", []] } },
                        expertise_tag_count: {
                            $sum: {
                                $map: {
                                    input: "$certificates",
                                    as: "cert",
                                    in: "$$cert.has_expert_tag"
                                }
                            }
                        }
                    }
                },

                { $set: { index: { $indexOfArray: [users_row_ids, "$_id"] } } },
                { $sort: { index: 1 } },
                { $unset: "index" },

                {
                    $project: {
                        _id: 1,
                        total_followers: 1,
                        user_name: 1,
                        full_name: 1,
                        gender: 1,
                        country_id: 1,
                        account_visible_type: 1,
                        login_status: 1,
                        approval_status: 1,
                        about_in_one_line: 1,
                        pro_batch: 1,
                        designation_array: "$designation_info.designation_name",
                        profile_image: "$img_info.profile_image",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        country_flag: "$country_info.country_flag",
                        country_name: "$country_info.country_name",
                        user_followed_status: { $cond: { if: "$info_user_followed.confirm_request_status", then: "$info_user_followed.confirm_request_status", else: 0 } },
                        total_speakers_in_events: 1,
                        total_hosted: 1,
                        exchange: 1,
                        positions: "$info_work.positions",
                        website: "$social_info.website",
                        total_invested_amount: { $ifNull: [{ $arrayElemAt: ["$fundings.total_invested_amount", 0] }, 0] },
                        invested_rounds_count: {
                            $ifNull: [{ $size: { $ifNull: [{ $arrayElemAt: ["$fundings.invested_rounds", 0] }, []] } }, 0]
                        },
                        invested_companies_count: {
                            $ifNull: [{ $size: { $ifNull: [{ $arrayElemAt: ["$fundings.invested_companies", 0] }, []] } }, 0]
                        },
                        total_sponsored_events: 1,
                        total_partnered_events: 1,

                        awards_count: { $size: { $ifNull: ["$awards_info", []] } },
                        certificate_count: 1,

                        expertise_tag_count: 1,

                    }
                }
            ])
                .limit(4);

            res.json({ status: true, message: get_query });
        } else {
            res.json({
                status: false,
                message: { alert_message: "users_row_ids field is required and must be a non-empty array." },
            });
        }
    } catch (err) {
        res.json({ status: false, message: { alert_message: err.message } });
    }
});





router.get('/popular_professionals', async (req, res) => {
    try {
        const result = await getPopularProfessionalsDetails();

        res.json({
            success: result.status,
            message: result.message,
            cache_response_status: result.cache_response_status,
        });
    } catch (error) {
        console.error("Error fetching popular professionals:", error);
        res.json({ success: false, message: error.message });
    }
});



router.get('/users_list/:skip/:limit', async (req, res) => {
    try {
        const skip = Number.isFinite(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = Number.isFinite(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;

        let user_row_id = 0;
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken.status) user_row_id = checkUserToken.message;

        let report_list_type = 1;
        if (req.query.report_list_type) report_list_type = Number.parseInt(req.query.report_list_type);

        const result = await getUserListDetails({ user_row_id, req, skip, limit, report_list_type });

        return res.json(result);

    } catch (err) {
        console.log('Users list.', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});

module.exports = router