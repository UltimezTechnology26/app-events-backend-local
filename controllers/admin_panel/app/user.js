require('dotenv').config()
const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { arrangeValidation, validateAndSaveImage, getPresentDateOnly, getMinusDates, yesterDayStartNEndDate, getPresentDateTime, getMinusYearDates, getIntIdFromArray, deleteImageDigitalOcean, array_column, checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken, generateUserLoginToken, checkApiKey } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { shiftUserFromManualToRegister } = require('../../../utils/helpers/events_helper')
const { deleteUserDetais, deleteProfessionalDetails, calculateUserProfileScore, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { getPositionResolutionStages } = require('../../../src/modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../src/modules/funding/funding.queries')
const MARKET_API_BASE_URL = process.env.MARKET_API_BASE_URL
const MARKET_API_KEY = process.env.MARKET_API_KEY


const professionalsM = require('../../../models/app/professionalsM')
const professionals_seo_detailsM = require('../../../models/app/professionals_seo_detailsM')
const professionals_profile_imagesM = require('../../../models/app/professionals_profile_imagesM')
const professionals_created_by_adminM = require('../../../models/app/professionals_created_by_adminM')
const professionals_disabledM = require('../../../models/app/professionals_disabledM')
const user_designationsM = require('../../../models/app/static/user_designationsM')
const user_looking_forM = require('../../../models/app/static/user_looking_forM')
const default_profile_imgM = require('../../../models/app/static/default_profile_imgM')
const countryM = require('../../../models/app/static/countryM')
const professionals_followersM = require('../../../models/app/professionals_followersM')
const companyM = require('../../../models/app/company/companyM')
const professionals_google_idsM = require('../../../models/app/auth_account/professionals_google_idsM')
const professionals_claimed_requestM = require('../../../models/app/professionals_claimed_requestM')

const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const company_nftM = require('../../../models/app/company/company_nftM')
const userPodcastsM = require('../../../models/app/podcast/userPodcastsM')
const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')
const company_nft_wallet_statusM = require('../../../models/app/company/company_nft_wallet_statusM')
const company_podcast_statusM = require('../../../models/app/company/company_podcast_statusM')
const employees_requestsM = require('../../../models/app/company/employees_requestsM')
const company_followersM = require('../../../models/app/company/followersM')

const eventM = require('../../../models/app/events/eventM')
const event_guestsM = require('../../../models/app/events/event_guestsM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const notify_userM = require('../../../models/app/events/notify_userM')
const professionals_delete_verificationsM = require('../../../models/app/professionals_delete_verificationsM')
const professionals_delete_actionsM = require('../../../models/app/professionals_delete_actionsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const professionals_ip_addressM = require('../../../models/app/professionals_ip_addressM')
const events_countM = require('../../../models/app/events/events_countM')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
const usersFollowersM = require('../../../models/app/professionals_followersM')
const companyFollowersM = require('../../../models/app/company/followersM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const professionals_pointsM = require('../../../models/app/users/professionals_pointsM')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const seo_static_urlsM = require('../../../models/seo_static_urlsM')
const professionals_social_linksM = require('../../../models/app/professionals_social_linksM')
const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')

router.get('/user_events_list/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const check_user = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                if (check_user) {
                    let events_array = {}

                    events_array['created_events'] = await eventM.aggregate([
                        {
                            $match: { user_row_id: user_row_id, list_event_type: { $in: [2, 3] } }
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
                                event_type: 1,
                                event_image: 1,
                                event_url: 1,
                                event_image_type: 1,
                                start_date: 1,
                                end_date: 1,
                                active_status: 1,
                                approval_status: 1,
                                list_event_type: 1,
                                utc_time: "$utc_dates.utc_time",
                            }
                        }
                    ])

                    events_array['speaker_events'] = await event_speakersM.aggregate([
                        {
                            $match: { user_type: 1, user_row_id: user_row_id }
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
                                        $match: { _id: { $exists: true } }
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
                                            event_type: 1,
                                            event_image: 1,
                                            event_url: 1,
                                            event_image_type: 1,
                                            start_date: 1,
                                            end_date: 1,
                                            active_status: 1,
                                            approval_status: 1,
                                            list_event_type: 1,
                                            utc_time: "$utc_dates.utc_time",
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: true } },
                        {
                            $match: { "event_info._id": { "$exists": true } }
                        },
                        {
                            $project: {
                                event_title: "$event_info.event_title",
                                event_type: "$event_info.event_type",
                                event_image: "$event_info.event_image",
                                event_url: "$event_info.event_url",
                                event_image_type: "$event_info.event_image_type",
                                start_date: "$event_info.start_date",
                                end_date: "$event_info.end_date",
                                active_status: "$event_info.active_status",
                                approval_status: "$event_info.approval_status",
                                list_event_type: "$event_info.list_event_type",
                                utc_time: "$event_info.utc_time",
                            }
                        }
                    ])

                    events_array['sp_events'] = await event_sponsors_partner_detailsM.aggregate([
                        {
                            $match: { account_type: 1, registered_type: 1, user_company_row_id: user_row_id }
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
                                        $match: { _id: { $exists: true } }
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
                                            event_type: 1,
                                            event_image: 1,
                                            event_url: 1,
                                            event_image_type: 1,
                                            start_date: 1,
                                            end_date: 1,
                                            active_status: 1,
                                            approval_status: 1,
                                            list_event_type: 1,
                                            utc_time: "$utc_dates.utc_time",
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$event_info", preserveNullAndEmptyArrays: true } },
                        {
                            $match: { "event_info._id": { "$exists": true } }
                        },
                        {
                            $project: {
                                sponsor_partner_type: 1,
                                sponsorship_type_title: 1,
                                event_title: "$event_info.event_title",
                                event_type: "$event_info.event_type",
                                event_image: "$event_info.event_image",
                                event_url: "$event_info.event_url",
                                event_image_type: "$event_info.event_image_type",
                                start_date: "$event_info.start_date",
                                end_date: "$event_info.end_date",
                                active_status: "$event_info.active_status",
                                approval_status: "$event_info.approval_status",
                                list_event_type: "$event_info.list_event_type",
                                utc_time: "$event_info.utc_time",
                            }
                        }
                    ])

                    res.json({ status: true, message: events_array })

                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid user row id." } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid user row id." } })
            }
        }
        catch (err) {
            console.log("User's all events lis .", err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }

})

router.get('/login_into_account/:user_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const rowData = await professionalsM.findOne({ _id: user_row_id })
                if (rowData) {
                    const resArray = {}
                    resArray['token'] = generateUserLoginToken(user_row_id, 1)
                    resArray['_id'] = user_row_id
                    resArray['referral_row_id'] = rowData.referral_row_id
                    resArray['referral_user_name'] = rowData.referral_user_name
                    resArray['user_name'] = rowData.user_name
                    resArray['full_name'] = rowData.full_name
                    resArray['email_id'] = rowData.email_id
                    resArray['mobile_number'] = rowData.mobile_number
                    resArray['company_name'] = rowData.company_name
                    resArray['work_position'] = rowData.work_position
                    resArray['login_status'] = 1
                    resArray['approval_status'] = rowData.approval_status
                    resArray['created_date_n_time'] = rowData.created_date_n_time
                    resArray['company_listed_status'] = 0
                    resArray['email_verify_status'] = true

                    const query = await companyM.findOne({ user_row_id: user_row_id })
                    if (query) {
                        resArray['company_listed_status'] = 1
                    }
                    else {
                        resArray['company_listed_status'] = 0
                    }

                    const imageQueryRun = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id })
                    if (imageQueryRun) {
                        resArray['profile_image'] = imageQueryRun.profile_image
                    }
                    else {
                        resArray['profile_image'] = ""
                    }


                    res.json({ status: true, message: resArray })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid user row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid user row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Login into user account.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


// Total professionals (2025, 2024, 2023, 2022)
// Admin Created (2025, 2024, 2023, 2022)
// Self Created (2025, 2024, 2023, 2022)
router.get('/years_overview', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [1])
        if (checkToken.status) {
            const new_array = new Array()
            for (let i = 0; i <= 3; i++) {
                const years = getMinusYearDates(i)
                const new_object = Object.create(null)
                new_object.start_date = years.start_date
                new_object.end_date = years.end_date

                new_array.push(new_object)
            }

            const result = new Object()
            const present_year_date = new_array[0]
            const one_year_back_date = new_array[1]
            const two_year_back_date = new_array[2]
            const three_year_back_date = new_array[3]

            const present_year_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const one_year_back_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const two_year_back_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const three_year_back_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })

            const admin_present_year_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const admin_one_year_back_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const admin_two_year_back_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const admin_three_year_back_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })

            const [present_year, one_year_back, two_year_back, three_year_back, admin_present_year, admin_one_year_back, admin_two_year_back, admin_three_year_back] = await Promise.all([present_year_query, one_year_back_query, two_year_back_query, three_year_back_query, admin_present_year_query, admin_one_year_back_query, admin_two_year_back_query, admin_three_year_back_query])

            result['present_year'] = present_year_date
            result['one_year'] = one_year_back_date
            result['two_year'] = two_year_back_date
            result['three_year'] = three_year_back_date

            result['all_present_year'] = present_year
            result['all_one_year_back'] = one_year_back
            result['all_two_year_back'] = two_year_back
            result['all_three_year_back'] = three_year_back

            result['admin_present_year'] = admin_present_year
            result['admin_one_year_back'] = admin_one_year_back
            result['admin_two_year_back'] = admin_two_year_back
            result['admin_three_year_back'] = admin_three_year_back

            result['user_present_year'] = present_year - admin_present_year
            result['user_one_year_back'] = one_year_back - admin_one_year_back
            result['user_two_year_back'] = two_year_back - admin_two_year_back
            result['user_three_year_back'] = three_year_back - admin_three_year_back

            res.json({ status: true, message: result })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Users Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/new_years_overview', checkApiKey, async (req, res) => {
    try {
        const result = new Object()
        let key = 'new_years_overview'
        const cache_response = await getCache({ key: key })

        if (!cache_response.status) {
            const new_array = new Array()
            for (let i = 0; i <= 3; i++) {
                const years = getMinusYearDates(i)
                const new_object = Object.create(null)
                new_object.start_date = years.start_date
                new_object.end_date = years.end_date

                new_array.push(new_object)
            }


            const present_year_date = new_array[0]
            const one_year_back_date = new_array[1]
            const two_year_back_date = new_array[2]
            const three_year_back_date = new_array[3]

            const present_year_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const one_year_back_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const two_year_back_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const three_year_back_query = professionalsM.countDocuments({ login_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })

            const admin_present_year_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const admin_one_year_back_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const admin_two_year_back_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const admin_three_year_back_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })

            const [present_year, one_year_back, two_year_back, three_year_back, admin_present_year, admin_one_year_back, admin_two_year_back, admin_three_year_back] = await Promise.all([present_year_query, one_year_back_query, two_year_back_query, three_year_back_query, admin_present_year_query, admin_one_year_back_query, admin_two_year_back_query, admin_three_year_back_query])

            result['present_year'] = present_year_date
            result['one_year'] = one_year_back_date
            result['two_year'] = two_year_back_date
            result['three_year'] = three_year_back_date

            result['all_present_year'] = present_year
            result['all_one_year_back'] = one_year_back
            result['all_two_year_back'] = two_year_back
            result['all_three_year_back'] = three_year_back

            result['admin_present_year'] = admin_present_year
            result['admin_one_year_back'] = admin_one_year_back
            result['admin_two_year_back'] = admin_two_year_back
            result['admin_three_year_back'] = admin_three_year_back

            result['user_present_year'] = present_year - admin_present_year
            result['user_one_year_back'] = one_year_back - admin_one_year_back
            result['user_two_year_back'] = two_year_back - admin_two_year_back
            result['user_three_year_back'] = three_year_back - admin_three_year_back

            await setCache({ key: key, value: result, ttl: 120 })

            res.json({ status: true, message: result, cache_reponse_status: false })
            // }
            // else
            // {
            //     res.json(checkToken)
            // }
        }

        else {

            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Users Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/overview', async (req, res) => {
    try {
        const result = {}
        const created_total_pending_query = professionalsM.countDocuments({ login_status: 1, approval_status: 0 })
        const created_total_approved_query = professionalsM.countDocuments({ login_status: 1, approval_status: 1 })
        const created_total_disabled_query = professionalsM.countDocuments({ login_status: 0 })
        const created_total_rejected_query = professionalsM.countDocuments({ login_status: 1, approval_status: 2 })
        const created_total_deleted_query = professionals_delete_actionsM.countDocuments({ action_type: 2 })

        const admin_total_pending_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 0 })
        const admin_total_approved_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 1 })
        const admin_total_disabled_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 0 })
        const admin_total_rejected_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 2 })

        // claim_status
        const created_sub_admin_total_pending_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 0 })
        const created_sub_admin_total_approved_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 1 })
        const created_sub_admin_total_disabled_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 0, approval_status: 1 })
        const created_sub_admin_total_rejected_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 2 })


        // 1:private, 2:public
        const total_public_query = professionalsM.countDocuments({
            $and: [
                {
                    $or:
                        [
                            { login_status: 1, approval_status: 0 },
                            { login_status: 1, approval_status: 1 },
                            { login_status: 0 },
                            { login_status: 1, approval_status: 2 }
                        ]
                },
                {
                    account_visible_type: 1
                }
            ]
        })
        const total_private_query = professionalsM.countDocuments({
            $and: [
                {
                    $or:
                        [
                            { login_status: 1, approval_status: 0 },
                            { login_status: 1, approval_status: 1 },
                            { login_status: 0 },
                            { login_status: 1, approval_status: 2 }
                        ]
                },
                {
                    account_visible_type: 2
                }
            ]
        })

        const total_pending_manual_query = professionals_manual_retrievalsM.countDocuments({ approval_status: 0 })
        const total_approved_manual_query = professionals_manual_retrievalsM.countDocuments({ approval_status: { $in: [1, 3] } })
        const total_reject_manual_query = professionals_manual_retrievalsM.countDocuments({ approval_status: 2 })



        const [created_total_pending, created_total_approved, created_total_disabled, created_total_rejected, created_total_deleted, created_sub_admin_total_pending, created_sub_admin_total_approved, created_sub_admin_total_disabled, created_sub_admin_total_rejected, total_public, total_private, total_pending_manual, total_approved_manual, total_reject_manual, admin_total_pending, admin_total_approved, admin_total_disabled, admin_total_rejected] = await Promise.all([created_total_pending_query, created_total_approved_query, created_total_disabled_query, created_total_rejected_query, created_total_deleted_query, created_sub_admin_total_pending_query, created_sub_admin_total_approved_query, created_sub_admin_total_disabled_query, created_sub_admin_total_rejected_query, total_public_query, total_private_query, total_pending_manual_query, total_approved_manual_query, total_reject_manual_query, admin_total_pending_query, admin_total_approved_query, admin_total_disabled_query, admin_total_rejected_query])

        result['total_pending'] = created_total_pending
        result['total_approved'] = created_total_approved
        result['total_disabled'] = created_total_disabled
        result['total_rejected'] = created_total_rejected
        result['total_deleted'] = created_total_deleted

        result['admin_total_pending'] = admin_total_pending - created_sub_admin_total_pending
        result['admin_total_approved'] = admin_total_approved - created_sub_admin_total_approved
        result['admin_total_disabled'] = admin_total_disabled - created_sub_admin_total_disabled
        result['admin_total_rejected'] = admin_total_rejected - created_sub_admin_total_rejected

        result['user_total_pending'] = created_total_pending - admin_total_pending
        result['user_total_approved'] = created_total_approved - admin_total_approved
        result['user_total_disabled'] = created_total_disabled - admin_total_disabled
        result['user_total_rejected'] = created_total_rejected - admin_total_rejected

        result['created_sub_admin_total_pending'] = created_sub_admin_total_pending
        result['created_sub_admin_total_approved'] = created_sub_admin_total_approved
        result['created_sub_admin_total_disabled'] = created_sub_admin_total_disabled
        result['created_sub_admin_total_rejected'] = created_sub_admin_total_rejected



        result['total_public'] = total_public
        result['total_private'] = total_private

        result['total_pending_manual_retrievals'] = total_pending_manual
        result['total_approved_manual_retrievals'] = total_approved_manual
        result['total_reject_manual_retrievals'] = total_reject_manual


        const today_date = getPresentDateOnly()

        const { start_date, end_date } = yesterDayStartNEndDate(1)


        const week_date = getMinusDates(7)
        const one_month_date = getMinusDates(30)


        const today_total_claim_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(today_date) } })
        const today_total_claim_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(today_date) } })
        const today_total_claim_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(today_date) } })


        const yesterday_claim_total_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
        const yesterday_claim_total_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
        const yesterday_claim_total_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })


        const week_total_claim_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(week_date) } })
        const week_total_claim_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(week_date) } })
        const week_total_claim_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(week_date) } })


        const month_total_claim_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(one_month_date) } })
        const month_total_claim_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(one_month_date) } })
        const month_total_claim_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(one_month_date) } })


        const [today_total_claim_pending, today_total_claim_approved, today_total_claim_disabled, yesterday_claim_total_pending, yesterday_claim_total_approved, yesterday_claim_total_disabled, week_total_claim_pending, week_total_claim_approved, week_total_claim_disabled, month_total_claim_pending, month_total_claim_approved, month_total_claim_disabled] = await Promise.all([today_total_claim_pending_query, today_total_claim_approved_query, today_total_claim_disabled_query, yesterday_claim_total_pending_query, yesterday_claim_total_approved_query, yesterday_claim_total_disabled_query, week_total_claim_pending_query, week_total_claim_approved_query, week_total_claim_disabled_query, month_total_claim_pending_query, month_total_claim_approved_query, month_total_claim_disabled_query])


        result['today_total_claim_pending'] = today_total_claim_pending
        result['today_total_claim_approved'] = today_total_claim_approved
        result['today_total_claim_rejected'] = today_total_claim_disabled

        result['yesterday_claim_total_pending'] = yesterday_claim_total_pending
        result['yesterday_claim_total_approved'] = yesterday_claim_total_approved
        result['yesterday_claim_total_rejected'] = yesterday_claim_total_disabled

        result['week_total_claim_pending'] = week_total_claim_pending
        result['week_total_claim_approved'] = week_total_claim_approved
        result['week_total_claim_rejected'] = week_total_claim_disabled

        result['month_total_claim_pending'] = month_total_claim_pending
        result['month_total_claim_approved'] = month_total_claim_approved
        result['month_total_claim_rejected'] = month_total_claim_disabled


        //SELF REGISTER APPROVALS
        result['self_registered_pending'] = await professionalsM.countDocuments({ login_status: 1, approval_status: 0 })
        result['self_registered_approved'] = await professionalsM.countDocuments({ login_status: 1, approval_status: 1 })
        result['self_registered_rejected'] = await professionalsM.countDocuments({ login_status: 1, approval_status: 2 })

        //CLAIM REQUESTS APPROVALS 0:Not Requested, its reserved for self created users, 1:Pending, 2:Accepted, 3:Rejected
        const claim_pending_query = await professionals_claimed_requestM.aggregate([
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
            { $unwind: { path: "$user_info" } },
            { $match: { claim_request_status: 1 } },
            {
                $count: "count"
            }
        ])

        let claim_request_pending = 0
        if (claim_pending_query[0]) {
            claim_request_pending = claim_pending_query[0].count
        }

        result['claim_request_pending'] = claim_request_pending

        const claim_approved_query = await professionals_claimed_requestM.aggregate([
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
            { $unwind: { path: "$user_info" } },
            { $match: { claim_request_status: 2 } },
            {
                $count: "count"
            }
        ])
        let claim_request_approved = 0
        if (claim_approved_query[0]) {
            claim_request_approved = claim_approved_query[0].count
        }
        result['claim_request_approved'] = claim_request_approved


        const claim_rejected_query = await professionals_claimed_requestM.aggregate([
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
            { $unwind: { path: "$user_info" } },
            { $match: { claim_request_status: 3 } },
            {
                $count: "count"
            }
        ])
        let claim_request_rejected = 0
        if (claim_rejected_query[0]) {
            claim_request_rejected = claim_rejected_query[0].count
        }


        result['claim_request_rejected'] = claim_request_rejected

        //DELETE REQUESTS APPROVALS
        result['delete_requests_pending'] = await professionalsM.countDocuments({ login_status: 2 })

        const delete_requests_approved_query = await professionals_delete_actionsM.aggregate([
            { $match: { action_type: 1 } },
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
                                _id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info" } },
            {
                $count: "count"
            }
        ])
        let delete_requests_approved = 0
        if (delete_requests_approved_query[0]) {
            delete_requests_approved = delete_requests_approved_query[0].count
        }

        result['delete_requests_approved'] = delete_requests_approved
        result['delete_requests_rejected'] = await professionals_delete_actionsM.countDocuments({ action_type: 2 })

        // TOTAL CREATED USERS
        const count_created_query = await professionalsM.countDocuments({ claim_status: { $gt: 0 } })
        result['total_created_users'] = count_created_query
        result['total_enabled_users'] = await professionalsM.countDocuments({ login_status: 1 })
        result['total_disabled_users'] = await professionalsM.countDocuments({ login_status: 0 })
        const total_followers_result = await usersFollowersM.aggregate([
            {
                $match: {
                    confirm_request_status: 2
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "following_user_row_id",
                    foreignField: "_id",
                    as: "follower_user",
                    pipeline: [
                        { $match: { login_status: 1, approval_status: 1 } },
                        { $project: { _id: 1 } }
                    ]
                }
            },
            { $unwind: "$follower_user" },
            {
                $group: {
                    _id: "$following_user_row_id"
                }
            },
            { $count: "count" }
        ]);

        let total_followers_count = 0;
        if (total_followers_result.length > 0) {
            total_followers_count = total_followers_result[0].count;
        }


        result['total_followers_count'] = total_followers_count
        res.json({ status: true, message: result })
        // }
        // else
        // {
        //     res.json(checkToken)
        // }

    }
    catch (err) {
        console.log('Users Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/new_users_overview', checkApiKey, async (req, res) => {
    try {
        const result = {}
        const key = 'new_users_overview'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const created_total_pending_query = professionalsM.countDocuments({ login_status: 1, approval_status: 0 })
            const created_total_approved_query = professionalsM.countDocuments({ login_status: 1, approval_status: 1 })
            const created_total_disabled_query = professionalsM.countDocuments({ login_status: 0 })
            const created_total_rejected_query = professionalsM.countDocuments({ login_status: 1, approval_status: 2 })

            const admin_total_pending_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 0 })
            const admin_total_approved_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 1 })
            const admin_total_disabled_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 0 })
            const admin_total_rejected_query = professionalsM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 2 })

            // claim_status
            const created_sub_admin_total_pending_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 0 })
            const created_sub_admin_total_approved_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 1 })
            const created_sub_admin_total_disabled_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 0, approval_status: 1 })
            const created_sub_admin_total_rejected_query = professionalsM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 2 })


            // 1:private, 2:public
            const total_public_query = professionalsM.countDocuments({
                $and: [
                    {
                        $or:
                            [
                                { login_status: 1, approval_status: 0 },
                                { login_status: 1, approval_status: 1 },
                                { login_status: 0 },
                                { login_status: 1, approval_status: 2 }
                            ]
                    },
                    {
                        account_visible_type: 1
                    }
                ]
            })
            const total_private_query = professionalsM.countDocuments({
                $and: [
                    {
                        $or:
                            [
                                { login_status: 1, approval_status: 0 },
                                { login_status: 1, approval_status: 1 },
                                { login_status: 0 },
                                { login_status: 1, approval_status: 2 }
                            ]
                    },
                    {
                        account_visible_type: 2
                    }
                ]
            })

            const total_pending_manual_query = professionals_manual_retrievalsM.countDocuments({ approval_status: 0 })
            const total_approved_manual_query = professionals_manual_retrievalsM.countDocuments({ approval_status: { $in: [1, 3] } })
            const total_reject_manual_query = professionals_manual_retrievalsM.countDocuments({ approval_status: 2 })



            const [created_total_pending, created_total_approved, created_total_disabled, created_total_rejected, created_sub_admin_total_pending, created_sub_admin_total_approved, created_sub_admin_total_disabled, created_sub_admin_total_rejected, total_public, total_private, total_pending_manual, total_approved_manual, total_reject_manual, admin_total_pending, admin_total_approved, admin_total_disabled, admin_total_rejected] = await Promise.all([created_total_pending_query, created_total_approved_query, created_total_disabled_query, created_total_rejected_query, created_sub_admin_total_pending_query, created_sub_admin_total_approved_query, created_sub_admin_total_disabled_query, created_sub_admin_total_rejected_query, total_public_query, total_private_query, total_pending_manual_query, total_approved_manual_query, total_reject_manual_query, admin_total_pending_query, admin_total_approved_query, admin_total_disabled_query, admin_total_rejected_query])

            result['total_pending'] = created_total_pending
            result['total_approved'] = created_total_approved
            result['total_disabled'] = created_total_disabled
            result['total_rejected'] = created_total_rejected

            result['admin_total_pending'] = admin_total_pending - created_sub_admin_total_pending
            result['admin_total_approved'] = admin_total_approved - created_sub_admin_total_approved
            result['admin_total_disabled'] = admin_total_disabled - created_sub_admin_total_disabled
            result['admin_total_rejected'] = admin_total_rejected - created_sub_admin_total_rejected

            result['user_total_pending'] = created_total_pending - admin_total_pending
            result['user_total_approved'] = created_total_approved - admin_total_approved
            result['user_total_disabled'] = created_total_disabled - admin_total_disabled
            result['user_total_rejected'] = created_total_rejected - admin_total_rejected

            result['created_sub_admin_total_pending'] = created_sub_admin_total_pending
            result['created_sub_admin_total_approved'] = created_sub_admin_total_approved
            result['created_sub_admin_total_disabled'] = created_sub_admin_total_disabled
            result['created_sub_admin_total_rejected'] = created_sub_admin_total_rejected



            result['total_public'] = total_public
            result['total_private'] = total_private

            result['total_pending_manual_retrievals'] = total_pending_manual
            result['total_approved_manual_retrievals'] = total_approved_manual
            result['total_reject_manual_retrievals'] = total_reject_manual


            const today_date = getPresentDateOnly()

            const { start_date, end_date } = yesterDayStartNEndDate(1)


            const week_date = getMinusDates(7)
            const one_month_date = getMinusDates(30)


            const today_total_claim_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(today_date) } })
            const today_total_claim_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(today_date) } })
            const today_total_claim_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(today_date) } })


            const yesterday_claim_total_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            const yesterday_claim_total_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            const yesterday_claim_total_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })


            const week_total_claim_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(week_date) } })
            const week_total_claim_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(week_date) } })
            const week_total_claim_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(week_date) } })


            const month_total_claim_pending_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 1, date_n_time: { $gte: new Date(one_month_date) } })
            const month_total_claim_approved_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 2, date_n_time: { $gte: new Date(one_month_date) } })
            const month_total_claim_disabled_query = professionals_claimed_requestM.countDocuments({ claim_request_status: 3, date_n_time: { $gte: new Date(one_month_date) } })


            const [today_total_claim_pending, today_total_claim_approved, today_total_claim_disabled, yesterday_claim_total_pending, yesterday_claim_total_approved, yesterday_claim_total_disabled, week_total_claim_pending, week_total_claim_approved, week_total_claim_disabled, month_total_claim_pending, month_total_claim_approved, month_total_claim_disabled] = await Promise.all([today_total_claim_pending_query, today_total_claim_approved_query, today_total_claim_disabled_query, yesterday_claim_total_pending_query, yesterday_claim_total_approved_query, yesterday_claim_total_disabled_query, week_total_claim_pending_query, week_total_claim_approved_query, week_total_claim_disabled_query, month_total_claim_pending_query, month_total_claim_approved_query, month_total_claim_disabled_query])


            result['today_total_claim_pending'] = today_total_claim_pending
            result['today_total_claim_approved'] = today_total_claim_approved
            result['today_total_claim_rejected'] = today_total_claim_disabled

            result['yesterday_claim_total_pending'] = yesterday_claim_total_pending
            result['yesterday_claim_total_approved'] = yesterday_claim_total_approved
            result['yesterday_claim_total_rejected'] = yesterday_claim_total_disabled

            result['week_total_claim_pending'] = week_total_claim_pending
            result['week_total_claim_approved'] = week_total_claim_approved
            result['week_total_claim_rejected'] = week_total_claim_disabled

            result['month_total_claim_pending'] = month_total_claim_pending
            result['month_total_claim_approved'] = month_total_claim_approved
            result['month_total_claim_rejected'] = month_total_claim_disabled


            //SELF REGISTER APPROVALS
            result['self_registered_pending'] = await professionalsM.countDocuments({ login_status: 1, approval_status: 0 })
            result['self_registered_approved'] = await professionalsM.countDocuments({ login_status: 1, approval_status: 1 })
            result['self_registered_rejected'] = await professionalsM.countDocuments({ login_status: 1, approval_status: 2 })

            //CLAIM REQUESTS APPROVALS 0:Not Requested, its reserved for self created users, 1:Pending, 2:Accepted, 3:Rejected
            const claim_pending_query = await professionals_claimed_requestM.aggregate([
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
                { $unwind: { path: "$user_info" } },
                { $match: { claim_request_status: 1 } },
                {
                    $count: "count"
                }
            ])

            let claim_request_pending = 0
            if (claim_pending_query[0]) {
                claim_request_pending = claim_pending_query[0].count
            }

            result['claim_request_pending'] = claim_request_pending

            const claim_approved_query = await professionals_claimed_requestM.aggregate([
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
                { $unwind: { path: "$user_info" } },
                { $match: { claim_request_status: 2 } },
                {
                    $count: "count"
                }
            ])
            let claim_request_approved = 0
            if (claim_approved_query[0]) {
                claim_request_approved = claim_approved_query[0].count
            }
            result['claim_request_approved'] = claim_request_approved


            const claim_rejected_query = await professionals_claimed_requestM.aggregate([
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
                { $unwind: { path: "$user_info" } },
                { $match: { claim_request_status: 3 } },
                {
                    $count: "count"
                }
            ])
            let claim_request_rejected = 0
            if (claim_rejected_query[0]) {
                claim_request_rejected = claim_rejected_query[0].count
            }


            result['claim_request_rejected'] = claim_request_rejected

            //DELETE REQUESTS APPROVALS
            result['delete_requests_pending'] = await professionalsM.countDocuments({ login_status: 2 })

            const delete_requests_approved_query = await professionals_delete_actionsM.aggregate([
                { $match: { action_type: 1 } },
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
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $count: "count"
                }
            ])
            let delete_requests_approved = 0
            if (delete_requests_approved_query[0]) {
                delete_requests_approved = delete_requests_approved_query[0].count
            }

            result['delete_requests_approved'] = delete_requests_approved
            result['delete_requests_rejected'] = await professionals_delete_actionsM.countDocuments({ action_type: 2 })

            // TOTAL CREATED USERS
            const count_created_query = await professionalsM.countDocuments({ claim_status: { $gt: 0 } })
            result['total_created_users'] = count_created_query
            result['total_enabled_users'] = await professionalsM.countDocuments({ login_status: 1 })
            result['total_disabled_users'] = await professionalsM.countDocuments({ login_status: 0 })

            await setCache({ key: key, value: result, ttl: 120 })

            res.json({ status: true, message: result, cache_reponse_status: false })
            // }
            // else
            // {
            //     res.json(checkToken)
            // }

        }
        else {

            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Users Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{
                $or: [
                    { login_status: 1, approval_status: 0 },
                    { login_status: 1, approval_status: 1 },
                    { login_status: 0 },
                    { login_status: 1, approval_status: 2 }
                ]
            }]

            if (req.query.search) {
                query.push({
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { mobile_number: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                    ]
                })
            }

            if (req.query.claim_status) {
                query.push({ claim_status: Number.parseInt(req.query.claim_status) })
            }

            if (req.query.login_status) {
                query.push({ login_status: Number.parseInt(req.query.login_status) })
            }

            if (req.query.approval_status) {
                query.push({ approval_status: Number.parseInt(req.query.approval_status) })
            }

            if (req.query.sub_admin_row_id) {
                query.push({ sub_admin_row_id: Number.parseInt(req.query.sub_admin_row_id) })
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

            let matchConditions = [];

            // cln_static_user_designations/cln_static_user_looking_for_lists are tiny,
            // fully-loaded static tables (dozens/single-digit rows). Fetching their active
            // _ids once and testing membership in-memory (via $setIntersection) replaces
            // the old approach of running a $lookup per matched professional document,
            // which was the actual cost of these two filters (~15s+ for ~73k documents).
            const designationStatus = Number.parseInt(req.query.designation_status);
            const lookingForStatus = Number.parseInt(req.query.looking_for_status);
            const needsDesignationIds = designationStatus === 0 || designationStatus === 1;
            const needsLookingForIds = lookingForStatus === 0 || lookingForStatus === 1;

            const [activeDesignationIds, activeLookingForIds] = await Promise.all([
                needsDesignationIds ? user_designationsM.distinct('_id', { active_status: true }) : null,
                needsLookingForIds ? user_looking_forM.distinct('_id', { active_status: true }) : null
            ]);

            /* ---------------- DESIGNATION STATUS FILTER ---------------- */
            if (needsDesignationIds) {
                const hasActiveDesignation = {
                    $gt: [
                        { $size: { $setIntersection: [{ $ifNull: ["$designation_id", []] }, activeDesignationIds] } },
                        0
                    ]
                };
                matchConditions.push({ $expr: designationStatus === 1 ? hasActiveDesignation : { $not: hasActiveDesignation } });
            }

            /* ---------------- LOOKING FOR STATUS FILTER ---------------- */
            if (needsLookingForIds) {
                const hasActiveLookingFor = {
                    $gt: [
                        { $size: { $setIntersection: [{ $ifNull: ["$looking_for_id", []] }, activeLookingForIds] } },
                        0
                    ]
                };
                matchConditions.push({ $expr: lookingForStatus === 1 ? hasActiveLookingFor : { $not: hasActiveLookingFor } });
            }

            const queryRun = await professionalsM.aggregate([
                { $match: { $and: query } },
                { $sort: { _id: -1 } },
                { $skip: skip },
                { $limit: limit },

                {
                    $lookup: {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_professionals_profile_images",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "userImage"
                    }
                },
                { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "sub_admin_row_id",
                        foreignField: "_id",
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_static_user_looking_for_lists",
                        localField: "looking_for_id",
                        foreignField: "_id",
                        as: "other_info",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { _id: 1, name: 1 } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: { updated_by_id: "$updated_by_row_id", updated_by_type: "$updated_by" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$updated_by_id"] },
                                            { $eq: ["$$updated_by_type", "user"] }
                                        ]
                                    }
                                }
                            },
                            { $project: { full_name: 1 } }
                        ],
                        as: "updated_by_user_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        let: { updated_by_id: "$updated_by_row_id", updated_by_type: "$updated_by" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$updated_by_id"] },
                                            { $in: ["$$updated_by_type", ["admin", "subadmin"]] }
                                        ]
                                    }
                                }
                            },
                            { $project: { full_name: 1 } }
                        ],
                        as: "updated_by_admin_info"
                    }
                },
                // ✅ No $unwind here — other_info stays as array

                // Lookup designation (ACTIVE ONLY)
                {
                    $lookup: {
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        as: "designation_info",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { _id: 0, designation_name: 1 } }
                        ]
                    }
                },

                // Normalize designation_info to null when empty
                {
                    $set: {
                        designation_info: {
                            $cond: [
                                { $gt: [{ $size: "$designation_info" }, 0] },
                                "$designation_info",
                                null
                            ]
                        }
                    }
                },

                // Apply tagged / non-tagged + looking_for filter
                ...(matchConditions.length
                    ? [{ $match: { $and: matchConditions } }]
                    : []),

                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },
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
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$company_type'] },
                                                        { $eq: ['$_id', "$$company_row_id"] }
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
                                    positions: 1,
                                    company_name: {
                                        $cond: {
                                            if: "$info_company.company_name",
                                            then: "$info_company.company_name",
                                            else: "$info_manual_company.company_name"
                                        }
                                    },
                                }
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "cln_professionals_followers",
                        let: { userId: "$_id" },
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
                            },
                            {
                                $group: {
                                    _id: "$following_user_row_id",
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        as: "followers_count_arr"
                    }
                },
                {
                    $set: {
                        total_followers_count: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $eq: ["$login_status", 1] },
                                        { $eq: ["$approval_status", 1] }
                                    ]
                                },
                                then: { $ifNull: [{ $arrayElemAt: ["$followers_count_arr.count", 0] }, 0] },
                                else: 0
                            }
                        }
                    }
                },

                {
                    $project: {
                        _id: 1,
                        login_status: 1,
                        created_date_n_time: 1,
                        full_name: 1,
                        user_name: 1,
                        mobile_number: 1,
                        email_id: 1,
                        email_verify_status: 1,
                        approval_status: 1,
                        position_name: "$info_work.position_name",
                        positions: "$info_work.positions",
                        company_name: "$info_work.company_name",
                        sub_admin_name: "$sub_admin_info.full_name",
                        sub_admin_row_id: 1,
                        claim_status: 1,
                        country_name: "$co_info.country_name",
                        country_flag: "$co_info.country_flag",
                        profile_image: "$userImage.profile_image",
                        referral_user_name: 1,
                        pro_batch: 1,
                        professional_profile_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        academy_score: 1,
                        community_score: 1,
                        professional_detail_score: 1,
                        investment_score: 1,
                        award_score: 1,
                        faq_score: 1,
                        profile_score: 1,
                        designation_array: "$designation_info.designation_name",
                        looking_for_id: 1,
                        looking_for: '$other_info',
                        total_followers_count: 1,
                        updated_by: 1,
                        updated_by_row_id: 1,
                        updated_date_n_time: 1,
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
            // matchConditions (designation_status/looking_for_status) now test array
            // membership against precomputed active-id sets directly via $expr — no
            // $lookup needed, so there's nothing left to skip/include conditionally.
            const countPipeline = [
                { $match: { $and: query } },
                ...(matchConditions.length ? [{ $match: { $and: matchConditions } }] : []),
                { $count: "count" }
            ];

            const countResult = await professionalsM.aggregate(countPipeline);
            const countQueryRun = countResult[0]?.count || 0;

            res.json({ status: true, message: queryRun, count: countQueryRun })
        }
        catch (err) {
            console.log('All Users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/user_followers/:user_row_id', async (req, res) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, [10]);
    if (!checkAdminToken.status) {
        return res.json(checkAdminToken);
    }

    try {
        const user_row_id = Number.parseInt(req.params.user_row_id);
        if (Number.isNaN(user_row_id)) {
            return res.json({
                status: false,
                message: { alert_message: 'Sorry, Invalid user row id' }
            });
        }

        let matchQuery = [
            { following_user_row_id: user_row_id },
            { confirm_request_status: 2 }
        ];

        if (req.query.search) {
            matchQuery.push({
                $or: [
                    { full_name: { $regex: req.query.search, $options: 'i' } },
                    { email_id: { $regex: req.query.search, $options: 'i' } }
                ]
            });
        }

        const followersList = await usersFollowersM.aggregate([

            {
                $match: {
                    following_user_row_id: user_row_id,
                    confirm_request_status: 2
                }
            },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "follower_user_row_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            { $unwind: "$user_info" },
            {
                $match: {
                    "user_info.login_status": 1,

                }
            },

            ...(req.query.search
                ? [{
                    $match: {
                        $or: [
                            { "user_info.full_name": { $regex: req.query.search, $options: 'i' } },
                            { "user_info.email_id": { $regex: req.query.search, $options: 'i' } }
                        ]
                    }
                }]
                : []),

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "follower_user_row_id",
                    foreignField: "user_row_id",
                    as: "img_info"
                }
            },
            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    confirm_request_status: 1,
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    profile_image: "$img_info.profile_image",
                    date_n_time: 1,
                }
            },

            { $sort: { _id: -1 } }
        ]);

        const countQuery = await usersFollowersM.aggregate([
            {
                $match: {
                    following_user_row_id: user_row_id,
                    confirm_request_status: 2
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "follower_user_row_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            { $unwind: "$user_info" },
            {
                $match: {
                    "user_info.login_status": 1,
                    // "user_info.approval_status": 1
                }
            },
            ...(req.query.search
                ? [{
                    $match: {
                        $or: [
                            { "user_info.full_name": { $regex: req.query.search, $options: 'i' } },
                            { "user_info.email_id": { $regex: req.query.search, $options: 'i' } }
                        ]
                    }
                }]
                : []),
            { $count: "count" }
        ]);


        const total_count = countQuery[0]?.count || 0;

        return res.json({
            status: true,
            message: followersList,
            count: total_count
        });

    } catch (err) {
        console.log('User followers error:', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});

// login status = 1(enabled list) AND login status = 0(disabled list)
router.get('/disabled/:skip/:limit', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            // Always start with $and
            let query = {
                $and: [
                    { login_status: 0 }
                ]
            };

            /* ================= SEARCH ================= */
            if (req.query.search) {
                query.$and.push({
                    $or: [
                        { full_name: { $regex: req.query.search, $options: 'i' } },
                        { user_name: { $regex: req.query.search, $options: 'i' } },
                        { mobile_number: { $regex: req.query.search, $options: 'i' } },
                        { email_id: { $regex: req.query.search, $options: 'i' } },
                        { referral_user_name: { $regex: req.query.search, $options: 'i' } }
                    ]
                });
            }

            /* ================= PROFILE SCORE ================= */
            if (req.query.profile_score === "0-24") {
                query.$and.push({ profile_score: { $gte: 0, $lte: 24 } });
            }
            else if (req.query.profile_score === "25-49") {
                query.$and.push({ profile_score: { $gte: 25, $lte: 49 } });
            }
            else if (req.query.profile_score === "50-74") {
                query.$and.push({ profile_score: { $gte: 50, $lte: 74 } });
            }
            else if (req.query.profile_score === "75-100") {
                query.$and.push({ profile_score: { $gte: 75, $lte: 100 } });
            }

            let matchConditions = [];

            /* ---------------- DESIGNATION STATUS FILTER ---------------- */
            if (!Number.isNaN(Number.parseInt(req.query.designation_status))) {
                const designationStatus = Number.parseInt(req.query.designation_status);

                if (designationStatus === 1) {
                    matchConditions.push({
                        designation_id: {
                            $exists: true,
                            $ne: null,
                            $ne: {}
                        }
                    });
                } else if (designationStatus === 0) {
                    matchConditions.push({
                        $or: [
                            { designation_id: { $exists: false } },
                            { designation_id: null },
                            { designation_id: {} }
                        ]
                    });
                }
            }

            /* ---------------- LOOKING FOR STATUS FILTER (FIXED) ---------------- */
            /* ---------------- DESIGNATION STATUS FILTER (FINAL & CORRECT) ---------------- */
            if (!Number.isNaN(Number.parseInt(req.query.designation_status))) {
                const designationStatus = Number.parseInt(req.query.designation_status);

                if (designationStatus === 1) {
                    // ✅ TAGGED (has at least one ACTIVE designation)
                    matchConditions.push({
                        designation_info: { $ne: null }
                    });
                }
                else if (designationStatus === 0) {
                    // ✅ NON-TAGGED (no ACTIVE designation)
                    matchConditions.push({
                        designation_info: null
                    });
                }
            }




            /* ---------------- LOOKING FOR STATUS FILTER (FIXED) ---------------- */
            if (!Number.isNaN(Number.parseInt(req.query.looking_for_status))) {
                const lookingForStatus = Number.parseInt(req.query.looking_for_status);

                if (lookingForStatus === 1) {
                    // HAS looking_for
                    matchConditions.push({
                        $expr: {
                            $gt: [
                                { $size: { $ifNull: ["$other_info", []] } },
                                0
                            ]
                        }
                    });
                } else if (lookingForStatus === 0) {
                    // NO looking_for
                    matchConditions.push({
                        $expr: {
                            $eq: [
                                { $size: { $ifNull: ["$other_info", []] } },
                                0
                            ]
                        }
                    });
                }
            }

            const queryRun = await professionalsM.aggregate([
                { $match: query },
                { $sort: { _id: -1 } },
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
                        as: "userImage"
                    }
                },
                { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "sub_admin_row_id",
                        foreignField: "_id",
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_static_user_looking_for_lists",
                        localField: "looking_for_id",
                        foreignField: "_id",
                        as: "other_info",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { _id: 1, name: 1 } }
                        ]
                    }
                },

                // 🔹 designation (NEW – SAME AS LIST)
                {
                    $lookup: {
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        as: "designation_info",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { _id: 0, designation_name: 1 } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: { updated_by_id: "$updated_by_row_id", updated_by_type: "$updated_by" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$updated_by_id"] },
                                            { $eq: ["$$updated_by_type", "user"] }
                                        ]
                                    }
                                }
                            },
                            { $project: { full_name: 1 } }
                        ],
                        as: "updated_by_user_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        let: { updated_by_id: "$updated_by_row_id", updated_by_type: "$updated_by" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$updated_by_id"] },
                                            { $in: ["$$updated_by_type", ["admin", "subadmin"]] }
                                        ]
                                    }
                                }
                            },
                            { $project: { full_name: 1 } }
                        ],
                        as: "updated_by_admin_info"
                    }
                },
                {
                    $set: {
                        designation_info: {
                            $cond: [
                                { $gt: [{ $size: "$designation_info" }, 0] },
                                "$designation_info",
                                null
                            ]
                        }
                    }
                },

                // 3️⃣ Apply tagged / non-tagged filter
                ...(matchConditions.length
                    ? [{ $match: { $and: matchConditions } }]
                    : []),

                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: [
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
                                    positions: 1,
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                }
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        login_status: 1,
                        created_date_n_time: 1,
                        full_name: 1,
                        pro_batch: 1,
                        user_name: 1,
                        mobile_number: 1,
                        looking_for_id: 1,
                        looking_for: '$other_info',
                        email_id: 1,
                        email_verify_status: 1,
                        position_name: "$info_work.position_name",
                        positions: "$info_work.positions",
                        company_name: "$info_work.company_name",
                        sub_admin_name: "$sub_admin_info.full_name",
                        sub_admin_row_id: 1,
                        claim_status: 1,
                        country_name: "$co_info.country_name",
                        country_flag: "$co_info.country_flag",
                        profile_image: "$userImage.profile_image",
                        referral_user_name: 1,
                        professional_profile_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        academy_score: 1,
                        community_score: 1,
                        professional_detail_score: 1,
                        investment_score: 1,
                        award_score: 1,
                        faq_score: 1,
                        profile_score: 1,
                        designation_array: "$designation_info.designation_name",
                        updated_by: 1,
                        updated_by_row_id: 1,
                        updated_date_n_time: 1,
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
            ]).skip(skip).limit(limit)

            // const countQueryRun = await professionalsM.countDocuments(query)
            const countPipeline = [
                { $match: query },

                {
                    $lookup: {
                        from: "cln_static_user_looking_for_lists",
                        localField: "looking_for_id",
                        foreignField: "_id",
                        as: "other_info",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { _id: 1, name: 1 } }
                        ]
                    }
                },

                // 🔹 designation (NEW – SAME AS LIST)
                {
                    $lookup: {
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        as: "designation_info",
                        pipeline: [
                            { $match: { active_status: true } },
                            { $project: { _id: 0, designation_name: 1 } }
                        ]
                    }
                },

                // 2️⃣ Normalize
                {
                    $set: {
                        designation_info: {
                            $cond: [
                                { $gt: [{ $size: "$designation_info" }, 0] },
                                "$designation_info",
                                null
                            ]
                        }
                    }
                },

                // 3️⃣ Apply tagged / non-tagged filter
                ...(matchConditions.length
                    ? [{ $match: { $and: matchConditions } }]
                    : []),

                { $count: "count" }
            ];
            const countResult = await professionalsM.aggregate(countPipeline);
            const countQueryRun = countResult[0]?.count || 0;

            res.json({ status: true, message: queryRun, count: countQueryRun })
        }
        catch (err) {
            console.log('Disabled users list.', err.message)
            res.json({ status: false, message: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/users_pages', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { mobile_number: { '$regex': req.query.search, $options: 'i' } },
                        { country_name: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }

            const queryRun = await professionals_created_by_adminM.aggregate([
                { $match: query },
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
                        from: "cln_static_countries",
                        localField: "user_info.country_id",
                        foreignField: "_id",
                        as: "co_info"
                    }
                },
                { $unwind: { path: "$co_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id",
                        mobile_number: "$user_info.mobile_number",
                        date_n_time: "$user_info.date_n_time",
                        login_status: "$user_info.login_status",
                        country_name: "$co_info.country_name",
                        country_flag: "$co_info.country_flag"
                    }
                }
            ])

            res.json({ status: true, message: queryRun })
        }
        catch (err) {
            console.log('Users pages.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/create_new_user', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.')
        .isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('user_name')
        .trim().not().isEmpty().withMessage('The User Name field is required.')
        .isLength({ min: 4 }).withMessage('The User Name field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The User Name field must be less than 120 characters.'),
    // .isAlpha().withMessage('User name must contain only alphabets'),
    check('designation_id')
        .not().isEmpty().withMessage('The Designation Id field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [1])
        if (checkAdminToken.status) {
            let admin_row_id = 0
            const check_token_message = checkAdminToken.message
            if (check_token_message.admin_manager_type == 2) {
                admin_row_id = check_token_message.admin_row_id
            }

            const userNameCheck = await professionalsM.findOne({ user_name: sanitize(req.body.user_name) })
            if (userNameCheck) {
                errObj['user_name'] = 'The User name is already in use.'
            }

            if (req.body.email_id) {
                const emailIdCheck = await professionalsM.findOne({ email_id: sanitize(req.body.email_id) })
                if (emailIdCheck) {
                    errObj['email_id'] = 'The Email Id is already in use.'
                }
            }

            if (req.body.mobile_number) {
                if (req.body.mobile_number.match(/[^0-9\-(\)\s]/)) {
                    errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.';
                }
                const mobileNumberCheck = await professionalsM.findOne({ mobile_number: sanitize(req.body.mobile_number) })
                if (mobileNumberCheck) {
                    errObj['mobile_number'] = 'The Mobile Number is already in use.'
                }
            }

            let looking_for_id = []
            if ((req.body.looking_for_id) && (req.body.looking_for_id.length > 0)) {
                let looking_for_id_array = await getIntIdFromArray(req.body.looking_for_id)
                if (looking_for_id_array.length > 0) {
                    looking_for_id = looking_for_id_array
                }
                else {
                    errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
                }
            }

            let designation_id = []
            if ((req.body.designation_id) && (req.body.designation_id.length > 0)) {
                let designation_id_array = await getIntIdFromArray(req.body.designation_id)
                if (designation_id_array.length > 0) {
                    designation_id = designation_id_array
                }
                else {
                    errObj['designation_id'] = 'The Designation Ids field must be integer in object'
                }
            }

            let profile_image = ""
            if (!Object.keys(errObj).length) {
                if (req.body.profile_image) {
                    const validate_n_save_image = await validateAndSaveImage(req.body.profile_image, 1)
                    if (!validate_n_save_image.status) {
                        errObj['profile_image'] = 'Sorry, Invalid profile image.'
                    }
                    else {
                        profile_image = validate_n_save_image.webp_file_name
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const insertArray = {}
                let referral_row_id = 1
                let referral_user_name = 'coinpedia'
                let date_n_time = getPresentDateTime()

                insertArray['gender'] = req.body.gender
                insertArray['full_name'] = req.body.full_name
                insertArray['referral_row_id'] = referral_row_id
                insertArray['referral_user_name'] = referral_user_name
                insertArray['user_name'] = req.body.user_name
                insertArray['email_id'] = req.body.email_id ? req.body.email_id : ""
                insertArray['mobile_number'] = req.body.mobile_number
                insertArray['country_id'] = req.body.country_id
                insertArray['account_visible_type'] = req.body.account_visible_type
                insertArray['work_position'] = req.body.work_position
                insertArray['company_name'] = req.body.company_name
                insertArray['designation_id'] = designation_id
                insertArray['podcast_id'] = req.body.podcast_id
                insertArray['podcast_title'] = req.body.podcast_title ? (req.body.podcast_title).trim() : ''
                insertArray['created_date_n_time'] = date_n_time
                insertArray['updated_date_n_time'] = date_n_time
                insertArray['sub_admin_row_id'] = admin_row_id
                insertArray['claim_status'] = 1
                insertArray['location'] = req.body.location
                insertArray['user_bio'] = (req.body.user_bio) ? req.body.user_bio : ''
                insertArray['looking_for_id'] = looking_for_id

                const savedData = await professionalsM(insertArray).save()
                let user_row_id = Number.parseInt(savedData._id)

                const socialArray = {}
                socialArray['facebook'] = (req.body.facebook) ? req.body.facebook : ''
                socialArray['twitter'] = (req.body.twitter) ? req.body.twitter : ''
                socialArray['linkedin'] = (req.body.linkedin) ? req.body.linkedin : ''
                socialArray['instagram'] = (req.body.instagram) ? req.body.instagram : ''
                socialArray['video_link'] = (req.body.video_link) ? req.body.video_link : ''
                socialArray['telegram'] = (req.body.telegram) ? req.body.telegram : ''
                socialArray['medium'] = (req.body.medium) ? req.body.medium : ''
                socialArray['reddit'] = (req.body.reddit) ? req.body.reddit : ''
                socialArray['user_row_id'] = user_row_id
                const seoArray = {}

                seoArray['meta_keywords'] = req.body.meta_keywords
                seoArray['meta_description'] = req.body.meta_description
                seoArray['user_row_id'] = user_row_id

                await professionals_social_linksM(socialArray).save()
                await professionals_seo_detailsM(seoArray).save()


                if (!Number.isNaN(Number.parseInt(req.body.manual_user_row_id))) {
                    const manual_user_row_id = Number.parseInt(req.body.manual_user_row_id)
                    const check_manual_query = await professionals_manual_retrievalsM.findOne({ _id: manual_user_row_id })
                    if (check_manual_query) {
                        await shiftUserFromManualToRegister({ manual_user_row_id: manual_user_row_id, register_user_row_id: user_row_id, sub_admin_row_id: admin_row_id })
                    }
                }

                if (req.body.profile_image) {
                    let profileArray = {}
                    profileArray['profile_image'] = profile_image
                    profileArray['profile_image_type'] = 0
                    profileArray['user_row_id'] = user_row_id

                    await professionals_profile_imagesM(profileArray).save()
                }

                const full_name = savedData.full_name
                const email_id = savedData.email_id

                let pass_subject = " Coinpedia Has Listed Your User Profile. ! Claim This User Profile Now "
                let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that your user profile has been listed on Coinpedia. You can claim this profile page to unlock unlimited features and enhance your online presence.</p>
                <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                <ul>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                  <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                </ul>
                <p style="color:#000;font-weight: 400;font-size:17px;">Get started with the user profile today, by submitting a claim request to our admin. Our admin will review and notify you via email. Upon admin’s approval, you get access to all the features. </p>
                <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> </p>`

                await sendEmail(email_id, pass_subject, pass_message)

                res.json({ status: true, message: { alert_message: "New user successfully created." }, user_row_id: user_row_id })

            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Create new user.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_user/:user_row_id', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.')
        .isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('user_name')
        .trim().not().isEmpty().withMessage('The User Name field is required.')
        .isLength({ min: 4 }).withMessage('The User Name field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The User Name field must be less than 120 characters.'),
    // .isAlpha().withMessage('User name must contain only alphabets'),
    check('designation_id')
        .not().isEmpty().withMessage('The Designation Id field is required.')

], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [1])
        if (checkAdminToken.status) {
            const admin_row_id = checkAdminToken.message.admin_row_id

            if (!Number.isNaN(Number.parseInt(req.params.user_row_id))) {
                if (checkAdminToken.message.admin_manager_type !== 1) {
                    if (admin_row_id) {

                        const check_user = await professionalsM.findOne({ _id: Number.parseInt(req.params.user_row_id) })
                        if (checkAdminToken.message.sub_admin_type != 3) {
                            if (check_user?.sub_admin_row_id || (Number.parseInt(checkAdminToken.message.sub_admin_type) == 2) || (Number.parseInt(checkAdminToken.message.sub_admin_type) == 1)) {
                                if (admin_row_id !== check_user.sub_admin_row_id) {
                                    errObj['created_by_sub_admin_id'] = "You do not have access to edit this user"
                                }
                            }
                        }
                    }

                }
                const getUser = await professionalsM.findOne({ _id: Number.parseInt(req.params.user_row_id) })

                if (getUser) {
                    const user_row_id = getUser._id

                    const userNameCheck = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { user_name: sanitize(req.body.user_name) }] })
                    if (userNameCheck) {
                        errObj['user_name'] = 'The User name is already in use.'
                    }

                    if (req.body.email_id) {
                        const emailIdCheck = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { email_id: sanitize(req.body.email_id) }] })
                        if (emailIdCheck) {
                            errObj['email_id'] = 'The Email Id is already in use.'
                        }
                    }


                    if (req.body.mobile_number) {
                        if (req.body.mobile_number.match(/[^0-9\-(\)\s]/)) {

                            errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.';
                        }
                        const mobileNumberCheck = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { mobile_number: sanitize(req.body.mobile_number) }] })
                        if (mobileNumberCheck) {
                            errObj['mobile_number'] = 'The Mobile Number is already in use.'
                        }

                    }

                    let looking_for_id = []
                    if ((req.body.looking_for_id) && (req.body.looking_for_id.length > 0)) {
                        let looking_for_id_array = await getIntIdFromArray(req.body.looking_for_id)
                        if (looking_for_id_array.length > 0) {
                            looking_for_id = looking_for_id_array
                        }
                        else {
                            errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
                        }
                    }

                    let designation_id = []
                    if ((req.body.designation_id) && (req.body.designation_id.length > 0)) {
                        let designation_id_array = await getIntIdFromArray(req.body.designation_id)
                        if (designation_id_array.length > 0) {
                            designation_id = designation_id_array
                        }
                        else {
                            errObj['designation_id'] = 'The Designation Ids field must be integer in object'
                        }
                    }

                    let profile_image = ""
                    if (!Object.keys(errObj).length) {
                        if (req.body.profile_image) {
                            const validate_n_save_image = await validateAndSaveImage(req.body.profile_image, 1)
                            if (!validate_n_save_image.status) {
                                errObj['profile_image'] = 'Sorry, Invalid profile image.'
                            }
                            else {
                                profile_image = validate_n_save_image.webp_file_name
                            }
                        }
                    }

                    if (Object.keys(errObj).length > 0) {
                        res.json({ status: false, message: errObj })
                    }
                    else {
                        if (req.body.company_name) {
                            const company_name = (sanitize(req.body.company_name)).toLowerCase()
                            const getQuery = await companyM.findOne({ approval_status: 1, active_status: 1, company_name: company_name }, { _id: 1 })
                            if (getQuery) {
                                const checkQuery = await employees_requestsM.findOne({ company_row_id: getQuery._id, user_row_id: user_row_id })
                                if (!checkQuery) {
                                    const insertObj = {
                                        company_row_id: getQuery._id,
                                        user_row_id: user_row_id,
                                        approval_status: 1,
                                        date_n_time: getPresentDateTime()
                                    }
                                    await employees_requestsM(insertObj).save()
                                }
                            }
                        }

                        const insertArray = {}
                        insertArray['gender'] = req.body.gender
                        insertArray['full_name'] = req.body.full_name
                        insertArray['user_name'] = req.body.user_name
                        insertArray['email_id'] = req.body.email_id
                        insertArray['mobile_number'] = req.body.mobile_number
                        insertArray['country_id'] = req.body.country_id
                        insertArray['account_visible_type'] = req.body.account_visible_type
                        insertArray['work_position'] = req.body.work_position
                        insertArray['company_name'] = req.body.company_name
                        insertArray['designation_id'] = designation_id
                        insertArray['podcast_id'] = req.body.podcast_id
                        insertArray['podcast_title'] = req.body.podcast_title ? (req.body.podcast_title).trim() : ''
                        insertArray['location'] = (req.body.location) ? req.body.location : ''
                        insertArray['user_bio'] = (req.body.user_bio) ? req.body.user_bio : ''
                        insertArray['looking_for_id'] = looking_for_id
                        insertArray['updated_date_n_time'] = getPresentDateTime()

                        const updateFields = getUpdateTrackerFields(checkAdminToken)
                        Object.assign(insertArray, updateFields)

                        await professionalsM.updateOne({ _id: user_row_id }, { $set: insertArray })

                        const socialArray = {}
                        socialArray['facebook'] = (req.body.facebook) ? req.body.facebook : ''
                        socialArray['twitter'] = (req.body.twitter) ? req.body.twitter : ''
                        socialArray['linkedin'] = (req.body.linkedin) ? req.body.linkedin : ''
                        socialArray['instagram'] = (req.body.instagram) ? req.body.instagram : ''
                        socialArray['video_link'] = (req.body.video_link) ? req.body.video_link : ''
                        socialArray['telegram'] = (req.body.telegram) ? req.body.telegram : ''
                        socialArray['medium'] = (req.body.medium) ? req.body.medium : ''
                        socialArray['reddit'] = (req.body.reddit) ? req.body.reddit : ''
                        socialArray['user_row_id'] = user_row_id

                        const seoArray = {}
                        seoArray['meta_keywords'] = req.body.meta_keywords
                        seoArray['meta_description'] = req.body.meta_description
                        seoArray['user_row_id'] = user_row_id

                        await professionals_social_linksM.findOneAndUpdate(
                            { user_row_id: user_row_id },
                            { $set: socialArray },
                            { upsert: true }
                        )

                        await professionals_seo_detailsM.findOneAndUpdate(
                            { user_row_id: user_row_id },
                            { $set: seoArray },
                            { upsert: true }
                        )

                        if (req.body.profile_image) {
                            let profileArray = {}
                            profileArray['profile_image'] = profile_image
                            profileArray['profile_image_type'] = 0

                            const checkImage = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id })
                            if (checkImage) {
                                if (checkImage.profile_image_type > 0) {
                                    const imageQuery = await default_profile_imgM.findOne({ image_name: checkImage.profile_image }, { _id: 1 })
                                    if (!imageQuery) {
                                        await deleteImageDigitalOcean(checkImage.profile_image, 1)
                                    }
                                }

                                await professionals_profile_imagesM.updateOne({ user_row_id: user_row_id }, { $set: profileArray })
                            }
                            else {
                                profileArray['user_row_id'] = user_row_id

                                await professionals_profile_imagesM(profileArray).save()
                            }
                        }

                        res.json({ status: true, message: { alert_message: "Profile updated successfully." } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid User Row Id in URL" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "User row ID must be integer" } })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Update user details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


router.get('/enable_user/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const queryRunCheck = await professionalsM.findOne({ _id: user_row_id })
                if (queryRunCheck) {
                    const check_access = await checkUserSubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        user_row_id: user_row_id
                    })

                    if (check_access.status) {
                        const checkStatus = await professionalsM.findOne({ _id: user_row_id, login_status: 0 })
                        if (checkStatus) {
                            const updateFields = getUpdateTrackerFields(checkToken)
                            await professionalsM.updateOne({ _id: user_row_id }, { $set: { login_status: 1, ...updateFields, updated_date_n_time: new Date() } })

                            let company_status = 0
                            const check_company_status = await companyM.findOne({ user_row_id: user_row_id, active_status: 1, approval_status: 1 })
                            if (check_company_status) {
                                company_status = 1
                            }

                            const checkEvents = await eventM.findOne({ user_row_id: user_row_id })
                            if (checkEvents) {
                                if (company_status == 1) {
                                    await eventM.updateMany({ user_row_id: user_row_id }, { $set: { active_status: 1 } })
                                }
                                else {
                                    await eventM.updateMany({ user_row_id: user_row_id, list_event_type: 1 }, { $set: { active_status: 1 } })
                                }
                            }

                            const email_user_data_query = await professionalsM.findOne({ _id: user_row_id })

                            let pass_email_id = email_user_data_query.email_id
                            let pass_subject = 'CoinPedia Account Resumed'
                            let pass_full_name = (email_user_data_query.full_name)
                            let pass_message = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${pass_full_name},</p>
                            <div style="color:#000;">
                                <p style="color:#000;font-weight: 400;font-size:17px;">Congratulations ! </p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Your Coinpedia account has been Unblocked and all the features are now active. You can now continue using your account. </p>
                            </div>
                        `
                            await sendEmail(pass_email_id, pass_subject, pass_message)

                            res.json({ status: true, message: { alert_message: "This User is Enabled successfully.", check_access } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: "This User is already Enabled" } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message }, tokenStatus: true })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid User Row Id" } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        catch (err) {
            console.log('Enable User.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/disable_user/:user_row_id', [
    check('reason_for_disable')
        .trim().not().isEmpty().withMessage('The Reason for Disabled field is required')
        .isLength({ min: 4 }).withMessage('The Reason for Disabled field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Reason for Disabled field must be less than 200 characters in length.')
], async (req, res) => {
    try {

        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [1])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }
        else {
            const check_access = await checkUserSubadminAccess({
                admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                admin_manager_type: checkToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                user_row_id: Number.parseInt(req.params.user_row_id)
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }
        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const queryRunCheck = await professionalsM.findOne({ _id: user_row_id })
                if (queryRunCheck) {
                    const checkStatus = await professionalsM.findOne({ _id: user_row_id, login_status: 1 })
                    if (checkStatus) {
                        const updateFields = getUpdateTrackerFields(checkToken)
                        await professionalsM.updateOne({ _id: user_row_id }, { $set: { login_status: 0, ...updateFields, updated_date_n_time: new Date() } })

                        const saveData = new professionals_disabledM({
                            user_row_id: user_row_id,
                            disabled_reason: req.body.reason_for_disable,
                            date_n_time: getPresentDateTime()
                        })
                        await saveData.save()

                        const checkPodcast = await userPodcastsM.findOne({ user_row_id: user_row_id })
                        if (checkPodcast) {
                            await userPodcastsM.deleteOne({ user_row_id: user_row_id })
                        }

                        const checkCompany = await companyM.findOne({ user_row_id: user_row_id })
                        if (checkCompany) {
                            await companyM.updateOne({ _id: checkCompany._id }, { $set: { active_status: 0 } })
                            const checkCompanyPodcast = await companyPodcastsM.findOne({ company_row_id: checkCompany._id })
                            if (checkCompanyPodcast) {
                                await companyPodcastsM.deleteOne({ company_row_id: checkCompany._id })
                            }
                        }

                        const checkEvents = await eventM.findOne({ user_row_id: user_row_id })
                        if (checkEvents) {
                            await eventM.updateMany({ user_row_id: user_row_id }, { $set: { active_status: 0 } })
                        }

                        // disable reason
                        const email_user_data_query = await professionalsM.findOne({ _id: user_row_id })
                        let pass_email_id = email_user_data_query.email_id
                        let pass_subject = 'CoinPedia Account Blocked'
                        let pass_full_name = (email_user_data_query.full_name)
                        let pass_message = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${pass_full_name},</p>
                        <div style="color:#000;">
                            <p style="color:#000;font-weight: 400;font-size:17px;">This mail is to notify you that your CoinPedia account has been blocked due to ${req.body.reason_for_disable}. Please reach out to our Support team for more information and unblock request.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">DO NOT REPLY TO THIS EMAIL. </p>
                        </div>`
                        await sendEmail(pass_email_id, pass_subject, pass_message)

                        res.json({ status: true, message: { alert_message: "This User is Disabled successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry! This User is already Disabled" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Oops! Invalid User Row Id" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
    }
    catch (err) {
        console.log('Disable User.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/admin_created_list/:skip/:limit', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{
                $and: [
                    { claim_status: { $gt: 0 } },
                    {
                        $or: [
                            { login_status: 1, approval_status: 0 },
                            { login_status: 1, approval_status: 1 },
                            { login_status: 0 },
                            { login_status: 1, approval_status: 2 }
                        ]
                    }
                ]
            }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { referral_user_name: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
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

            const queryRun = await professionalsM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_auth_verify_emails",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "email_info"
                    }
                },
                { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
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
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },
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
                                    position_name: '$info_position.position_name',
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                }
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                { $match: { $and: query } },
                {
                    $project: {
                        _id: 1,
                        referral_row_id: 1,
                        referral_user_name: 1,
                        user_name: 1,
                        full_name: 1,
                        pro_batch: 1,
                        gender: 1,
                        email_id: 1,
                        mobile_number: 1,
                        account_visible_type: 1,
                        login_status: 1,
                        created_date_n_time: 1,
                        approval_status: 1,
                        claim_status: 1,
                        sub_admin_row_id: 1,
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        email_verify_status: "$email_info.email_verify_status",
                        profile_image: "$userImage.profile_image",
                        professional_profile_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        academy_score: 1,
                        community_score: 1,
                        professional_detail_score: 1,
                        investment_score: 1,
                        award_score: 1,
                        faq_score: 1,
                        profile_score: 1,

                    }
                }
            ]).skip(skip).limit(limit)

            const countQueryRun = await professionalsM.countDocuments({ $and: query })


            res.json({ status: true, message: queryRun, count: countQueryRun })
        }
        catch (err) {
            console.log('Admin created users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/single_details/:user_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            if (!Number.isNaN(Number.parseInt(req.params.user_row_id))) {
                const user_row_id = Number.parseInt(req.params.user_row_id)
                const queryRun = await professionalsM.findOne({ _id: user_row_id })
                const resObject = {}
                if (queryRun) {
                    resObject['_id'] = queryRun._id
                    resObject['account_visible_type'] = queryRun.account_visible_type
                    resObject['user_name'] = queryRun.user_name
                    resObject['full_name'] = queryRun.full_name
                    resObject['email_id'] = queryRun.email_id
                    resObject['pro_batch'] = queryRun.pro_batch
                    resObject['mobile_number'] = queryRun.mobile_number
                    resObject['country_id'] = queryRun.country_id
                    resObject['login_status'] = queryRun.login_status
                    resObject['approval_status'] = queryRun.approval_status
                    resObject['reason_rejected'] = queryRun.reason_rejected
                    resObject['rejected_date_n_time'] = queryRun.rejected_date_n_time
                    resObject['gender'] = queryRun.gender
                    resObject['created_date_n_time'] = queryRun.created_date_n_time
                    resObject['company_name'] = queryRun.company_name
                    resObject['referral_user_name'] = queryRun.referral_user_name
                    resObject['designation_id_array'] = queryRun.designation_id
                    resObject['podcast_id'] = queryRun.podcast_id
                    resObject['podcast_title'] = queryRun.podcast_title
                    resObject['sub_admin_row_id'] = queryRun.sub_admin_row_id
                    resObject['claim_status'] = queryRun.claim_status
                    resObject['user_bio'] = queryRun.user_bio
                    resObject['location'] = queryRun.location
                    resObject['looking_for_id_array'] = queryRun.looking_for_id
                    resObject['vcf_status'] = queryRun.vcf_status

                    let sub_admin_name = ""
                    if (queryRun.sub_admin_row_id) {
                        const subAdmin = await sub_adminM.findOne(
                            { _id: queryRun.sub_admin_row_id },
                            { full_name: 1 }
                        )
                        sub_admin_name = subAdmin?.full_name || ""
                    }

                    // 🔥 Fetch updated_by full name
                    let updated_by_full_name = ""
                    if (queryRun.updated_by && queryRun.updated_by_row_id) {
                        if (queryRun.updated_by === "user") {
                            const userQuery = await professionalsM.findOne(
                                { _id: queryRun.updated_by_row_id },
                                { full_name: 1 }
                            )
                            updated_by_full_name = userQuery?.full_name || ""
                        } else if (["admin", "subadmin"].includes(queryRun.updated_by)) {
                            const adminQuery = await sub_adminM.findOne(
                                { _id: queryRun.updated_by_row_id },
                                { full_name: 1 }
                            )
                            updated_by_full_name = adminQuery?.full_name || ""
                        }
                    }

                    // ✅ FINAL STRUCTURE (same as aggregation)
                    resObject['updated_by'] = queryRun.updated_by
                    resObject['updated_by_row_id'] = queryRun.updated_by_row_id
                    resObject['updated_date_n_time'] = queryRun.updated_date_n_time
                    resObject['updated_by_full_name'] = updated_by_full_name
                    resObject['sub_admin_name'] = sub_admin_name
                    resObject['sub_admin_row_id'] = queryRun.sub_admin_row_id

                    resObject['looking_for_names_list'] = []
                    if (queryRun.looking_for_id) {
                        resObject['looking_for_names_list'] = await user_looking_forM.find({ _id: { $in: queryRun.looking_for_id }, active_status: true }, { _id: 1, name: 1 })
                    }

                    const user_designation_head = await professionals_work_experienceM.find({ user_row_id: queryRun._id, till_date_status: 2, public_view: true }, { position: 1, company_name: 1, till_date_status: 1 }).sort({ start_date: -1 }).limit(1)
                    if (user_designation_head && user_designation_head.length > 0) {
                        resObject['work_position'] = user_designation_head[0].position
                        resObject['company_name'] = user_designation_head[0].company_name
                    }
                    else {
                        resObject['work_position'] = queryRun.work_position
                        resObject['company_name'] = queryRun.company_name
                    }
                    // Get user_bio, location, looking_for_id, and vcf_status from main collection


                    // Get social links from social links table
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
                        resObject['youtube_channel'] = socialQueryRun.youtube_channel
                    }

                    // Get SEO details from SEO details table
                    const seoQueryRun = await professionals_seo_detailsM.findOne({ user_row_id: user_row_id })
                    if (seoQueryRun) {
                        resObject['meta_keywords'] = seoQueryRun.meta_keywords
                        resObject['meta_description'] = seoQueryRun.meta_description
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

                    resObject['set_password_status'] = false
                    if (queryRun.password) {
                        resObject['set_password_status'] = true
                    }

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

                    resObject['company_details'] = await companyM.findOne({ user_row_id: user_row_id }, { company_id: 1, company_name: 1, company_logo: 1, company_email_id: 1, website_link: 1, approval_status: 1, active_status: 1 })

                    const users_experience_qery = await professionals_work_experienceM.aggregate([
                        { $match: { user_row_id: user_row_id } },
                        {
                            $lookup:
                            {
                                from: "cln_company_lists",
                                let: {
                                    company_type: '$company_type',
                                    company_row_id: '$company_row_id'
                                },
                                as: "company_info",
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
                                    company_type: '$company_type',
                                    company_row_id: '$company_row_id'
                                },
                                as: "manual_info",
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
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                company_name: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.company_name", else: "$manual_info.company_name" } },
                                company_logo: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.company_logo", else: "$manual_info.company_logo" } },
                                company_id: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.company_id", else: "" } },
                                company_email_id: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.company_email_id", else: "$manual_info.company_email_id" } },
                            }
                        },
                        {
                            $project: {
                                user_row_id: 1,
                                position: 1,
                                responsibilities: 1,
                                employment_type: 1,
                                location: 1,
                                till_date_status: 1,
                                start_date: 1,
                                end_date: 1,
                                location_type: 1,
                                public_view: 1,
                                company_type: 1,
                                company_row_id: 1,
                                company_name: 1,
                                company_logo: 1,
                                company_id: 1,
                                company_email_id: 1
                            }
                        },
                        { $sort: { till_date_status: -1, start_date: -1, _id: -1 } },
                        {
                            $group: {
                                _id: { company_type: "$company_type", company_row_id: "$company_row_id" },
                                company_name: { $first: "$company_name" },
                                company_logo: { $first: "$company_logo" },
                                company_type: { $first: "$company_type" },
                                company_row_id: { $first: "$company_row_id" },
                                professional_details: { $push: "$$ROOT" }
                            }
                        }
                    ])

                    resObject['user_experience'] = users_experience_qery

                    resObject['people_following_list'] = await usersFollowersM.aggregate([
                        { $match: { follower_user_row_id: user_row_id, confirm_request_status: 2 } },
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
                            $lookup:
                            {
                                from: "cln_professionals_profile_images",
                                localField: "following_user_row_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_social_links",
                                localField: "following_user_row_id",
                                foreignField: "user_row_id",
                                as: "social_info"
                            }
                        },
                        { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_followers",
                                localField: "following_user_row_id",
                                foreignField: "following_user_row_id",
                                pipeline: [{ $match: { "confirm_request_status": 2 } }],
                                as: "count_following"
                            }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_followers",
                                localField: "following_user_row_id",
                                foreignField: "following_user_row_id",
                                pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                                as: "user_followed"
                            }
                        },
                        { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_professionals_work_experiences",
                                localField: "following_user_row_id",
                                foreignField: "user_row_id",
                                pipeline: [
                                    { $match: { till_date_status: 2, public_view: true } },
                                    { $sort: { start_date: -1 } },
                                    { $limit: 1 },
                                    {
                                        $project: {
                                            position: 1,
                                            company_name: 1,
                                            till_date_status: 1
                                        }
                                    }
                                ],
                                as: "designation_head",
                            }
                        },
                        {
                            $addFields: {
                                work_position: {
                                    $cond: [
                                        { $eq: [{ $size: "$designation_head" }, 0] },
                                        "$user_info.work_position",
                                        { $ifNull: ["$designation_head.position", "$user_info.work_position"] }
                                    ]
                                },
                                company_name: {
                                    $cond: [
                                        { $eq: [{ $size: "$designation_head" }, 0] },
                                        "$user_info.company_name",
                                        { $ifNull: ["$designation_head.company_name", "$user_info.company_name"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: "$user_info._id",
                                profile_image: "$img_info.profile_image",
                                user_name: "$user_info.user_name",
                                pro_batch: "$user_info.pro_batch",
                                user_approval_status: "$user_info.approval_status",
                                full_name: "$user_info.full_name",
                                work_position: 1,
                                company_name: 1,
                                facebook: "$social_info.facebook",
                                twitter: "$social_info.twitter",
                                linkedin: "$social_info.linkedin",
                                instagram: "$social_info.instagram",
                                video_link: "$social_info.video_link",
                                telegram: "$social_info.telegram",
                                medium: "$social_info.medium",
                                reddit: "$social_info.reddit",
                                total_followers: { $size: "$count_following" },
                                user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }
                            }
                        }
                    ])

                    resObject['company_following_list'] = await companyFollowersM.aggregate([
                        {
                            $lookup:
                            {
                                from: "cln_company_lists",
                                localField: "company_row_id",
                                foreignField: "_id",
                                as: "cmpny_info"
                            }
                        },
                        { $unwind: "$cmpny_info" },
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "cmpny_info.user_row_id",
                                foreignField: "_id",
                                as: "company_user_info"
                            }
                        },
                        { $unwind: { path: "$company_user_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set:
                            {
                                login_status: { $cond: { if: "$company_user_info.login_status", then: "$company_user_info.login_status", else: 1 } },
                                approval_status: "$cmpny_info.approval_status",
                                active_status: "$cmpny_info.active_status",
                            }
                        },
                        { $match: { user_row_id: user_row_id, login_status: 1, approval_status: 1, active_status: 1 } },
                        {
                            $lookup:
                            {
                                from: "cln_company_followers",
                                localField: "company_row_id",
                                foreignField: "company_row_id",
                                as: "count_following"
                            }
                        },
                        {
                            $lookup:
                            {
                                from: "cln_company_followers",
                                localField: "company_row_id",
                                foreignField: "company_row_id",
                                pipeline: [{ $match: { "user_row_id": user_row_id } }],
                                as: "user_followed"
                            }
                        },
                        { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup:
                            {
                                from: "cln_static_company_business_models",
                                localField: "cmpny_info.main_business_model_id",
                                foreignField: "_id",
                                as: "business"
                            }
                        },
                        { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                company_logo: "$cmpny_info.company_logo",
                                company_id: "$cmpny_info.company_id",
                                company_name: "$cmpny_info.company_name",
                                company_row_id: 1,
                                facebook: "$cmpny_info.facebook",
                                twitter: "$cmpny_info.twitter",
                                linkedin: "$cmpny_info.linkedin",
                                instagram: "$cmpny_info.instagram",
                                video_link: "$cmpny_info.video_link",
                                telegram: "$cmpny_info.telegram",
                                medium: "$cmpny_info.medium",
                                reddit: "$cmpny_info.reddit",
                                business_name: "$business.business_name",
                                total_followers: { $size: "$count_following" },
                                user_followed_status: { $cond: { if: "$user_followed", then: 1, else: 0 } }
                            }
                        }
                    ])


                    let speakers_events_id = []
                    let speaker_status = false
                    const event_speakers_query = await event_speakersM.find({ user_row_id: user_row_id }, { event_row_id: 1 })
                    if (event_speakers_query) {
                        const event_speakers_array = await array_column(event_speakers_query, 'event_row_id');
                        if (event_speakers_array.length) {
                            speakers_events_id = event_speakers_array
                            speaker_status = true
                        }
                    }
                    resObject['speaker_status'] = speaker_status

                    let sponsor_partner_id = []
                    const check_sponsor_partner = await event_sponsors_partner_detailsM.find({ account_type: 1, registered_type: 1, sponsor_partner_row_id: user_row_id }, { event_row_id: 1 })
                    if (check_sponsor_partner) {
                        const sponsor_partner_array = await array_column(check_sponsor_partner, 'event_row_id')
                        if (sponsor_partner_array.length) {
                            sponsor_partner_id = sponsor_partner_array
                        }
                    }
                    resObject['events'] = await eventM.aggregate([
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
                            $set: {
                                user_login_status: "$user_info.login_status",
                                company_active_status: "$company_info.active_status"
                            }
                        },
                        {
                            $match: {
                                $and: [
                                    {
                                        $or: [
                                            { user_row_id: user_row_id, list_event_type: { $in: [1, 3] } },
                                            { _id: { $in: speakers_events_id }, list_event_type: { $in: [1, 2, 3] } },
                                            { _id: { $in: sponsor_partner_id }, list_event_type: { $in: [1, 2, 3] } }
                                        ]
                                    },
                                    { active_status: 1, approval_status: 1 },
                                    {
                                        $or: [
                                            { user_login_status: 1, list_event_type: 1 },
                                            { company_active_status: 1, list_event_type: 2 },
                                            { list_event_type: 3, user_login_status: 1, company_active_status: 1 }
                                        ]
                                    }
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
                        { $sort: { end_date: -1 } },
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                company_row_id: 1,
                                event_title: 1,
                                event_type: 1,
                                event_image: 1,
                                event_url: 1,
                                start_date: 1,
                                end_date: 1,
                                event_price: 1,
                                created_date_n_time: 1,
                                utc_time: "$utc_dates.utc_time",
                            }
                        }
                    ])

                    res.json({ status: true, message: resObject })
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
            console.log('User Individual details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


//delete concepts code Starts Here 
router.get('/delete_requests/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{ login_status: 2 }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { mobile_number: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { referral_user_name: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }


            const queryRun = await professionalsM.aggregate([
                { $match: { $and: query } },
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
                        as: "userImage"
                    }
                },
                { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
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
                        from: "cln_auth_verify_emails",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "email_info"
                    }
                },
                { $unwind: { path: "$email_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_delete_verifications",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "delInfo"
                    }
                },
                { $unwind: { path: "$delInfo", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        delete_date_n_time: "$delInfo.date_n_time"
                    }
                },
                { $sort: { delete_date_n_time: 1 } },
                {
                    $project: {
                        _id: 1,
                        login_status: 1,
                        created_date_n_time: 1,
                        full_name: 1,
                        pro_batch: 1,
                        user_name: 1,
                        mobile_number: 1,
                        approval_status: 1,
                        // wallet_address:1,
                        sub_admin_row_id: 1,
                        email_id: 1,
                        email_verify_status: "$email_info.email_verify_status",
                        delete_date_n_time: 1,
                        claim_status: "$created_by_admin.claim_status",
                        country_name: "$co_info.country_name",
                        country_flag: "$co_info.country_flag",
                        profile_image: "$userImage.profile_image",
                        referral_user_name: 1
                    }
                }
            ]).skip(skip).limit(limit)


            const countQueryRun = await professionalsM.countDocuments({ $and: query })

            res.json({ status: true, message: queryRun, count: countQueryRun })
        }
        catch (err) {
            console.log('Users requested to delete account list', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/recover_account/:user_row_id', async (req, res) => {
    try {

        const checkToken = checkAdminLoginToken(req.headers, [1])
        if (checkToken.status) {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const check_access = await checkUserSubadminAccess({
                    admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                    admin_manager_type: checkToken.message.admin_manager_type,
                    sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                    user_row_id: user_row_id
                })
                if (check_access.status) {
                    let action_reason = ""
                    if (req.query.action_reason) {
                        action_reason = req.query.action_reason
                    }

                    const check_query = await professionalsM.findOne({ _id: user_row_id, login_status: 2 })
                    if (check_query) {
                        await professionalsM.updateOne({ _id: user_row_id }, { $set: { login_status: 1 } })
                        await professionals_delete_verificationsM.deleteOne({ user_row_id: user_row_id })

                        const check_company = await companyM.findOne({ user_row_id: user_row_id })
                        if (check_company) {
                            await companyM.updateOne({ user_row_id: user_row_id }, { $set: { active_status: 1 } })
                        }

                        const checkEvents = await eventM.findOne({ user_row_id: user_row_id })
                        if (checkEvents) {
                            await eventM.updateMany({ user_row_id: user_row_id }, { $set: { active_status: 1 } })
                        }

                        await professionals_delete_actionsM({
                            user_row_id: user_row_id,
                            action_type: 1,
                            action_reason: action_reason,
                            date_n_time: getPresentDateTime()
                        }).save()

                        let pass_email_id = check_query.email_id
                        let pass_full_name = check_query.full_name
                        let pass_subject = 'Your CoinPedia Account Recovered Successfully.'
                        let pass_message = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${pass_full_name},</p>
                        <p style="color:#000;font-weight: 500;font-size:17px;">Welcome back to your CoinPedia Account</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Your Coinpedia account has been recovered and all the features are now active. You can now continue using your account. </p>
                        <p ><a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;font-size:17px;">Login Here</a></p>
                        `
                        await sendEmail(pass_email_id, pass_subject, pass_message)

                        res.json({ status: true, message: { alert_message: "This user account has been recovered successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "This User account is active" } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: check_access.message } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }

        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Recover account.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/delete_user/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const checkUser = await professionalsM.findOne({ _id: user_row_id })
                if (checkUser) {
                    const check_access = await checkUserSubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        user_row_id: user_row_id
                    })
                    if (check_access.status) {
                        const token = req.headers.token
                        const delete_user = await deleteUserDetais({ user_row_id, token })
                        if (delete_user.status) {
                            res.json({ status: true, message: { alert_message: "This user details deleted successfully.", asd: delete_user } })

                        }
                        else {
                            res.json({ status: false, message: { alert_message: delete_user.message } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        catch (err) {
            console.log('Delete User.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/deleted_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = { action_type: 2 }
            if (req.query.search) {
                query = {
                    $and: [
                        {
                            $or: [{ user_name: { '$regex': req.query.search, $options: 'i' } },
                            { full_name: { '$regex': req.query.search, $options: 'i' } },
                            { email_id: { '$regex': req.query.search, $options: 'i' } }]
                        },
                        {
                            action_type: 2
                        }
                    ]
                }
            }

            const queryRun = await professionals_delete_actionsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: query },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        claim_email_id: 1,
                        claim_request_status: 1,
                        date_n_time: 1,
                        user_name: 1,
                        full_name: 1,
                        approval_status: 1,
                        email_id: 1
                    }
                }
            ]).skip(skip).limit(limit)

            const queryCount = await professionals_delete_actionsM.countDocuments(query)


            res.json({ status: true, message: queryRun, count: queryCount })
        }
        catch (err) {
            console.log('Deleted users list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/recovered_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [1])
        if (checkToken.status) {

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }

            const queryRun = await professionals_delete_actionsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { action_type: 1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        claim_email_id: 1,
                        claim_request_status: 1,
                        date_n_time: 1,
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_verify_status: "$user_info.email_verify_status",
                        email_id: "$user_info.email_id"
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await professionals_delete_actionsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { action_type: 1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ])
            let total_counts = 0
            if (count_query[0]) {
                total_counts = count_query[0].count
            }

            res.json({ status: true, message: queryRun, count: total_counts })

        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Recovered users list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/claim_request_pending/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{ claim_request_status: 1 }]
            if (req.query.search) {
                query.push({
                    $or: [{ user_name: { '$regex': req.query.search, $options: 'i' } },
                    { full_name: { '$regex': req.query.search, $options: 'i' } },
                    { email_id: { '$regex': req.query.search, $options: 'i' } }]
                })
            }

            const queryRun = await professionals_claimed_requestM.aggregate([
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
                { $unwind: { path: "$user_info" } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                { $match: { $and: query } },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 1 } },
                            ...getPositionResolutionStages(),
                            { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
                            { $limit: 1 },
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
                                $project: {
                                    position_name: '$resolved_position_name',
                                    positions: 1,
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                                }
                            }
                        ],
                        as: "info_work"
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        claim_email_id: 1,
                        claim_request_status: 1,
                        date_n_time: 1,
                        user_name: "$user_info.user_name",
                        sub_admin_row_id: "$user_info.sub_admin_row_id",
                        login_status: "$user_info.login_status",
                        approval_status: "$user_info.approval_status",
                        full_name: "$user_info.full_name",
                        existing_email_id: "$user_info.email_id",
                        position_name: "$info_work.position_name",
                        positions: "$info_work.positions",
                        company_name: "$info_work.company_name"
                    }
                }
            ]).skip(skip).limit(limit)


            const queryCount = await professionals_claimed_requestM.aggregate([
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
                { $unwind: { path: "$user_info" } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                { $match: { $and: query } },
                {
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (queryCount[0]) {
                total_counts = queryCount[0].count
            }

            res.json({ status: true, message: queryRun, count: total_counts })
        }
        catch (err) {
            console.log('Claim requests pending list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/claim_request_approved/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }

            const queryRun = await professionals_claimed_requestM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { claim_request_status: 2 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        claim_request_status: 1,
                        date_n_time: 1,
                        user_name: "$user_info.user_name",
                        sub_admin_row_id: "$user_info.sub_admin_row_id",
                        login_status: "$user_info.login_status",
                        approval_status: "$user_info.approval_status",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                }
            ]).skip(skip).limit(limit)


            const queryCount = await professionals_claimed_requestM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { claim_request_status: 2 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (queryCount[0]) {
                total_counts = queryCount[0].count
            }

            res.json({ status: true, message: queryRun, count: total_counts })
        }
        catch (err) {
            console.log('Claim request approved list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/claim_request_rejected/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }

            const queryRun = await professionals_claimed_requestM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { claim_request_status: 3 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        claim_email_id: 1,
                        claim_request_status: 1,
                        claim_rejected_reason: 1,
                        date_n_time: 1,
                        user_name: "$user_info.user_name",
                        sub_admin_row_id: "$user_info.sub_admin_row_id",
                        login_status: "$user_info.login_status",
                        approval_status: "$user_info.approval_status",
                        full_name: "$user_info.full_name",
                        existing_email_id: "$user_info.email_id"
                    }
                }
            ]).skip(skip).limit(limit)

            const queryCount = await professionals_claimed_requestM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { claim_request_status: 3 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: query } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (queryCount[0]) {
                total_counts = queryCount[0].count
            }
            res.json({ status: true, message: queryRun, count: total_counts })
        }
        catch (err) {
            console.log('Claim request rejected list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.post('/reject_request/:request_row_id', [
    check('rejected_reason')
        .trim().not().isEmpty().withMessage('The Rejected reason field is required')
        .isLength({ min: 4 }).withMessage('The Rejected reason field must be at least 4 characters.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [1])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }

        let request_row_id = 0
        if (Number.isNaN(Number.parseInt(req.params.request_row_id))) {
            errObj['request_row_id'] = 'The Request row id field must be contain valid number.'
        }
        else {
            request_row_id = Number.parseInt(req.params.request_row_id)
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const checkRequest = await professionals_claimed_requestM.findOne({ _id: request_row_id, claim_request_status: 1 })
            if (checkRequest) {
                const user_row_id = Number.parseInt(checkRequest.user_row_id)
                const claim_email_id = checkRequest.claim_email_id
                const check_access = await checkUserSubadminAccess({
                    admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                    admin_manager_type: checkToken.message.admin_manager_type,
                    sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                    user_row_id: user_row_id
                })
                if (check_access.status) {
                    await professionals_claimed_requestM.updateOne({ _id: request_row_id }, { $set: { claim_request_status: 3, claim_rejected_reason: req.body.rejected_reason } })

                    const checkActiveUser = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1 })

                    const full_name = checkActiveUser.full_name

                    let pass_subject = "Your CoinPedia User Profile Claim Request Rejected! "
                    let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello User,</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your claim request for a CoinPedia </b>${full_name}</p> user account has been rejected by our admin.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${req.body.reason_rejected}</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Please check all your entered details once again, and submit a request to claim the user profile.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Do Not Reply To This Email.</p>
                    `
                    await sendEmail(claim_email_id, pass_subject, pass_message)

                    res.json({ status: true, message: { alert_message: 'Request rejected successfully' } })

                }
                else {
                    res.json({ status: false, message: { alert_message: check_access.message } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
    }
    catch (err) {
        console.log('Reject user claim request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/reject_claim/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const checkRequest = await professionals_claimed_requestM.findOne({ _id: request_row_id, claim_request_status: 1 })
                if (checkRequest) {
                    const claim_email_id = checkRequest.claim_email_id
                    const user_row_id = Number.parseInt(checkRequest.user_row_id)
                    const check_access = await checkUserSubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        user_row_id: user_row_id
                    })
                    if (check_access.status) {
                        await professionals_claimed_requestM.updateOne({ _id: request_row_id }, { $set: { claim_request_status: 3 } })

                        const checkActiveUser = await professionalsM.findOne({ _id: user_row_id })

                        const full_name = checkActiveUser.full_name

                        let pass_subject = "Your CoinPedia User Profile Claim Request Rejected! "
                        let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your request for a CoinPedia user account has been rejected by our admin.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Please check all your entered details once again, and submit a request to claim the user profile.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Do Not Reply To This Email.</p>
                        `
                        await sendEmail(claim_email_id, pass_subject, pass_message)

                        res.json({ status: true, message: { alert_message: 'Request rejected successfully' } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
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
            console.log('Reject claim.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/accept_claim/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const claim_request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(claim_request_row_id)) {
                const CheckPendingList = await professionals_claimed_requestM.findOne({ _id: claim_request_row_id, claim_request_status: 1 })
                if (CheckPendingList) {
                    const user_row_id = Number.parseInt(CheckPendingList.user_row_id)
                    const check_access = await checkUserSubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        user_row_id: user_row_id
                    })
                    if (check_access.status) {
                        const checkActiveUser = await professionalsM.findOne({ _id: user_row_id, login_status: 1 })
                        if (checkActiveUser) {
                            if (checkActiveUser.claim_status === 1) {
                                let full_name = checkActiveUser.full_name
                                let claim_email_id = CheckPendingList.claim_email_id

                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_id: claim_email_id, claim_status: 2 } })
                                await professionals_claimed_requestM.updateOne({ _id: claim_request_row_id }, { $set: { claim_request_status: 2 } })

                                let pass_subject = " Your CoinPedia User Profile Claim Request Approved!"
                                let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">We are pleased to inform you that your claim request for a CoinPedia user account has been approved. Your login email ID is <span style="color:#0029ff;">${claim_email_id}</span></p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                                <ul>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                                </ul>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Thank you for supporting our mission of bringing Blockchain professionals worldwide together!</p>
                                `

                                await sendEmail(claim_email_id, pass_subject, pass_message)

                                res.json({ status: true, message: { alert_message: 'This user account has been claimed successfully.' } })
                            }
                            else if (checkActiveUser.claim_status != 1) {
                                if (checkActiveUser.claim_status === 2) {
                                    res.json({ status: false, message: { alert_message: 'Sorry, This user is already claimed by some other user.' } })
                                }
                                else {
                                    res.json({ status: false, message: { alert_message: 'Sorry, This user is self created.' } })
                                }
                            }
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Sorry, This user disabled or invalid id.' } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid request row Id.' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Accept claim.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/delete_claim/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const checkRequest = await professionals_claimed_requestM.findOne({ _id: request_row_id })
                if (checkRequest) {
                    await professionals_claimed_requestM.deleteOne({ _id: request_row_id })

                    res.json({ status: true, message: { alert_message: 'Request deleted successfully' } })
                }
                else {
                    res.json({ status: true, message: { alert_message: 'Sorry, Invalid Request Row Id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Delete claim.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/view_claim/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const queryRun = await professionals_claimed_requestM.aggregate([
                    { $match: { _id: request_row_id } },
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
                            claim_email_id: 1,
                            claim_request_status: 1,
                            date_n_time: 1,
                            claim_rejected_reason: 1,
                            user_name: "$user_info.user_name",
                            full_name: "$user_info.full_name",
                            existing_email_id: "$user_info.email_id"
                        }
                    }
                ])

                res.json({ status: true, message: queryRun[0] })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }

        }
        catch (err) {
            console.log('View claim.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

// professional details

router.get('/delete_professional_details/:user_row_id/:professional_details_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const user_row_id = Number.parseInt(req.params.user_row_id)
            const professional_details_id = Number.parseInt(req.params.professional_details_id)
            if (!Number.isNaN(user_row_id) && !Number.isNaN(professional_details_id)) {
                const check_access = await checkUserSubadminAccess({
                    admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                    admin_manager_type: checkToken.message.admin_manager_type,
                    sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                    user_row_id: user_row_id
                })

                if (check_access.status) {
                    const query = await professionals_work_experienceM.findOne({ _id: professional_details_id, user_row_id: user_row_id })
                    if (query) {

                        await deleteProfessionalDetails({ professional_details_id: professional_details_id, type: 1 })

                        await calculateUserProfileScore(user_row_id, ['professional_detail'])
                        await deleteKeysByPattern('professional_detail_list_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        if (query.company_type === 1 && query.company_row_id) {
                            await deleteKeysByPattern('employee_list_*')
                            await deleteKeysByPattern('app_company_individual_other_details_*')
                        }

                        res.json({ status: true, message: { alert_message: ' Your details have been deleted Successfully' } })

                    }
                    else {
                        res.json({ status: false, message: 'Invalid Professional Row ID' })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: check_access.message } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        catch (err) {
            console.log('Delete professional details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/public_status_list/:user_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        const user_row_id = Number.parseInt(req.params.user_row_id)
        try {
            if (!Number.isNaN(user_row_id)) {
                const query = await professionals_work_experienceM.find({ user_row_id: user_row_id, till_date_status: 2 }, { position: 1, company_name: 1, public_view: 1 })
                res.json({ status: true, message: query })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }

        }
        catch (err) {
            console.log('Public status list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/users_ip_address_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let search_query = {}
            if (req.query.search && req.query.domain) {
                search_query = {
                    $and: [
                        {
                            $or: [
                                { full_name: { $regex: req.query.search, $options: 'i' } },
                                { user_name: { $regex: req.query.search, $options: 'i' } }
                            ]
                        },
                        { domain_row_id: Number.parseInt(req.query.domain) },
                    ],
                }
            }
            else if (req.query.search) {
                search_query = {
                    $or: [
                        { full_name: { $regex: req.query.search, $options: 'i' } },
                        { user_name: { $regex: req.query.search, $options: 'i' } },
                        { page: { $regex: req.query.search, $options: 'i' } },
                        { device_name: { $regex: req.query.search, $options: 'i' } },
                    ],
                }
            }
            else if (req.query.domain) {
                search_query = { domain_row_id: Number.parseInt(req.query.domain) };
            }

            const query = await professionals_ip_addressM.aggregate([
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
                        as: "userImage"
                    }
                },
                { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        pro_batch: "$user_info.pro_batch",
                        profile_image: "$userImage.profile_image"

                    }
                },
                { $match: search_query },
                {
                    $project: {
                        user_row_id: 1,
                        device_name: 1,
                        ip_address: 1,
                        domain_row_id: 1,
                        profile_image: 1,
                        page: 1,
                        date_n_time: 1,
                        full_name: 1,
                        user_name: 1,
                        pro_batch: 1
                    }
                },
                {
                    $sort: { _id: -1 }
                }
            ]).skip(skip).limit(limit)

            const count_query = await professionals_ip_addressM.aggregate([
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
                        user_name: "$user_info.user_name"
                    }
                },
                { $match: search_query },
                {
                    $count: "count"
                }
            ])

            let total_counts = 0
            if (count_query[0]) {
                total_counts = count_query[0].count
            }
            res.json({ status: true, message: query, count: total_counts })

        }
        catch (err) {
            console.log('Users ip address list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/points_list', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        try {
            const { point_type, search, status } = req.query;

            const matchConditions = [];

            if (point_type) {
                matchConditions.push({
                    point_type: { $regex: point_type, $options: 'i' }
                });
            }

            if (status && (status === 'credited' || status === 'debited')) {
                matchConditions.push({
                    point_status: status
                });
            }

            const pipeline = [
                ...(matchConditions.length ? [{ $match: { $and: matchConditions } }] : []),

                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                {
                    $unwind: {
                        path: "$user_info",
                        preserveNullAndEmptyArrays: true
                    }
                },

                ...(search
                    ? [{
                        $match: {
                            $or: [
                                { "user_info.full_name": { $regex: search, $options: 'i' } },
                                { "user_info.user_name": { $regex: search, $options: 'i' } },
                                { point_type: { $regex: search, $options: 'i' } }
                            ]
                        }
                    }]
                    : []),

                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        point_type: 1,
                        point_status: 1,
                        points: 1,
                        createdAt: 1,
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        pro_batch: "$user_info.pro_batch",
                        email_id: "$user_info.email_id"
                    }
                },
                { $sort: { createdAt: -1 } }
            ];

            const pointsList = await professionals_pointsM.aggregate(pipeline);

            res.json({
                status: true,
                total: pointsList.length,
                data: pointsList
            });
        } catch (error) {
            console.error("Error fetching points list:", error);
            res.status(500).json({ status: false, message: "Internal Server Error" });
        }
    } else {
        res.json(checkToken)
    }
});
router.get('/change_logs/:module_type/:module_id', async (req, res) => {
    try {
        const { module_type, module_id } = req.params;
        const { search, user_type, date_from, date_to } = req.query;

        const page = Number.parseInt(req.query.page) > 0 ? Number.parseInt(req.query.page) : 1;
        const limit = Number.parseInt(req.query.limit) > 0 ? Number.parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;

        const matchConditions = [
            { module_key: module_type },
            { module_id: module_id }
        ];

        if (user_type) matchConditions.push({ user_type });

        if (date_from || date_to) {
            const dateFilter = {};
            if (date_from) dateFilter.$gte = new Date(date_from);
            if (date_to) dateFilter.$lte = new Date(date_to);
            matchConditions.push({ updated_at: dateFilter });
        }

        const pipeline = [
            { $match: { $and: matchConditions } },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "updated_by",
                    foreignField: "_id",
                    as: "users_data"
                }
            },
            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "updated_by",
                    foreignField: "_id",
                    as: "admins_data"
                }
            },
            {
                $addFields: {
                    user_info: {
                        $cond: [
                            { $eq: ["$user_type", "user"] },
                            { $arrayElemAt: ["$users_data", 0] },
                            { $arrayElemAt: ["$admins_data", 0] }
                        ]
                    }
                }
            },
            { $project: { users_data: 0, admins_data: 0 } },
            ...(search ? [{
                $match: {
                    $or: [
                        { "user_info.full_name": { $regex: search, $options: 'i' } },
                        { "user_info.user_name": { $regex: search, $options: 'i' } },
                        { "user_info.email_id": { $regex: search, $options: 'i' } }
                    ]
                }
            }] : []),

            {
                $project: {
                    _id: 1,
                    module_key: 1,
                    module_id: 1,
                    old_meta_title: 1,
                    new_meta_title: 1,
                    old_meta_description: 1,
                    new_meta_description: 1,
                    old_meta_keywords: 1,
                    new_meta_keywords: 1,
                    old_og_title: 1,
                    new_og_title: 1,

                    old_og_description: 1,
                    new_og_description: 1,

                    old_twitter_title: 1,
                    new_twitter_title: 1,

                    old_twitter_description: 1,
                    new_twitter_description: 1,

                    old_robots_index: 1,
                    new_robots_index: 1,

                    old_robots_follow: 1,
                    new_robots_follow: 1,

                    old_twitter_creator: 1,
                    new_twitter_creator: 1,
                    user_type: 1,
                    updated_at: 1,
                    full_name: "$user_info.full_name",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id"
                }
            },

            { $sort: { updated_at: -1 } },

            // 🔥 Pagination
            { $skip: skip },
            { $limit: limit }
        ];

        // Count total records (without pagination)
        const totalRecords = await seo_change_logsM.countDocuments({ $and: matchConditions });

        const changeLogs = await seo_change_logsM.aggregate(pipeline);

        res.json({
            status: true,
            total: totalRecords,
            page,
            limit,
            totalPages: Math.ceil(totalRecords / limit),
            data: changeLogs
        });

    } catch (error) {
        console.error("Error fetching change logs:", error);
        res.status(500).json({ status: false, message: "Internal Server Error", error: error?.message });
    }
});
router.get('/seo_overview', checkApiKey, async (req, res) => {
    try {

        const excludePatterns = ["watchlist", "company", "companies", "partner"];
        const excludeRegex = excludePatterns.join("|");

        const recentLogsPromise = seo_change_logsM.aggregate([
            { $match: { module_key: "professional" } },

            { $sort: { updated_at: -1 } },

            {
                $group: {
                    _id: "$module_id",
                    doc: { $first: "$$ROOT" }
                }
            },

            { $replaceRoot: { newRoot: "$doc" } },

            {
                $addFields: {
                    module_id_num: { $toInt: "$module_id" }
                }
            },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "module_id_num",
                    foreignField: "_id",
                    as: "u"
                }
            },

            // 🔥 Drop records where user not found OR username missing
            {
                $match: {
                    "u.0.user_name": { $exists: true, $ne: "" },
                }
            },

            {
                $addFields: {
                    user_name: { $arrayElemAt: ["$u.user_name", 0] },
                    full_name: { $arrayElemAt: ["$u.full_name", 0] },
                    email_id: { $arrayElemAt: ["$u.email_id", 0] },
                    login_status: { $arrayElemAt: ["$u.login_status", 0] },
                    approval_status: { $arrayElemAt: ["$u.approval_status", 0] },
                }
            },

            { $project: { u: 0 } },

            { $limit: 10 }
        ]);


        /* -------------------------------------------------
           2️⃣ USER SEO STATS (ONE SCAN)
        ------------------------------------------------- */
        const userStatsPromise = professionals_seo_detailsM.aggregate([
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "u",
                    pipeline: [
                        {
                            $match: {
                                user_name: { $exists: true, $ne: "" },
                                approval_status: 1
                            }
                        }
                    ]
                }
            },
            { $match: { u: { $ne: [] } } },

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


        /* -------------------------------------------------
           3️⃣ STATIC URL SEO STATS (ONE SCAN)
        ------------------------------------------------- */
        const staticStatsPromise = seo_static_urlsM.aggregate([
            {
                $match: {
                    module: "app",
                    url: { $not: { $regex: excludeRegex, $options: "i" } }
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

        /* -------------------------------------------------
           EXECUTE ALL IN PARALLEL
           ------------------------------------------------- */

        const staticUrlsPromise = seo_static_urlsM.aggregate([
            {
                $match: {
                    module: "app",
                    url: { $not: { $regex: excludeRegex, $options: "i" } }
                }
            }
        ]);
        const [recentLogs, userStats, staticStats, staticUrls] = await Promise.all([
            recentLogsPromise,
            userStatsPromise,
            staticStatsPromise,
            staticUrlsPromise
        ]);

        const val = (obj, key) => obj?.[0]?.[key]?.[0]?.count || 0;

        const response = {
            static_urls: staticUrls,
            recent_changes: recentLogs,
            total_urls: val(userStats, "total") + val(staticStats, "total"),
            h1_missing: val(userStats, "h1_missing") + val(staticStats, "h1_missing"),
            h2_missing: val(userStats, "h2_missing") + val(staticStats, "h2_missing"),
            multiple_h1: val(userStats, "h1_multi") + val(staticStats, "h1_multi"),
            bad_heading_sequence: val(userStats, "bad_seq") + val(staticStats, "bad_seq"),
            title_length_issues: {
                title_above_60_to_70: val(userStats, "title_warn") + val(staticStats, "title_warn"),
                title_above_70: val(userStats, "title_err") + val(staticStats, "title_err")
            },
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







module.exports = router