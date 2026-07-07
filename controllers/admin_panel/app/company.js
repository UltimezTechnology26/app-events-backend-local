const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { getMinusYearDates, getPresentYearOnly, getPresentDateOnly, createDateOnly, createEndDateOnly, getMinusDates, yesterDayStartNEndDate, getPresentDateTime, arrangeValidation, checkValidDate, validateAndSaveImage, deleteImageDigitalOcean, getIntIdFromArray, getInvestorsObject, getNewCompanyRowID, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken, checkApiKey, checkAllLoginToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { shiftCompanyFromManualToRegister, deleteCompanyRevenue, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { updateNotification } = require('../../../utils/helpers/notification_helper')



const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const company_seo_detailsM = require('../../../models/app/company/company_seo_detailsM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')
const company_created_by_adminM = require('../../../models/app/company/company_created_by_adminM')
const added_to_partnersM = require('../../../models/app/company/added_to_partnersM')
const company_claim_requestsM = require('../../../models/app/company/company_claim_requestsM')
const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')
const countryM = require('../../../models/app/static/countryM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const funding_roundsM = require('../../../models/app/static/funding_roundsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const eventM = require('../../../models/app/events/eventM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const company_requests_to_partnersM = require('../../../models/app/company/company_requests_to_partnersM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')

const seo_change_logsM = require('../../../models/seo_change_logsM')
const seo_static_urlsM = require('../../../models/seo_static_urlsM')
router.get('/subadmin_list', async (req, res) => {
    try {
        const get_query = await sub_adminM.find({ login_status: 1 }, { _id: 1, full_name: 1 }).sort({ full_name: 1 })

        res.json({ status: true, message: get_query })
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/company_events_list/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                let events_array = {}
                events_array['created_events'] = await eventM.aggregate([
                    {
                        $match: { company_row_id: company_row_id, list_event_type: { $in: [2, 3] } }
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

                events_array['sp_events'] = await event_sponsors_partner_detailsM.aggregate([
                    {
                        $match: { account_type: 2, registered_type: 1, user_company_row_id: company_row_id }
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
                res.json({ status: false, message: { alert_message: "Sorry, Invalid company row id." } })
            }
        }
        catch (err) {
            console.log('Company events list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



// Total professionals (2025, 2024, 2023, 2022)
// Admin Created (2025, 2024, 2023, 2022)
// Self Created (2025, 2024, 2023, 2022)


router.get('/new_company_years_overview', checkApiKey, async (req, res) => {
    try {
        const result = new Object()
        let key = "new_company_years_overview"

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
            const present_year_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const one_year_back_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const two_year_back_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const three_year_back_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })
            const admin_present_year_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const admin_one_year_back_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_timee_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const admin_two_year_back_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_timee_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const admin_three_year_back_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })
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
router.get('/years_overview', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
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

            const present_year_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const one_year_back_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const two_year_back_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const three_year_back_query = companyM.countDocuments({ active_status: 1, created_date_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })

            const admin_present_year_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_time: { $gte: new Date(present_year_date.start_date) } })
            const admin_one_year_back_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_time: { $gte: new Date(one_year_back_date.start_date), $lte: new Date(one_year_back_date.end_date) } })
            const admin_two_year_back_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_time: { $gte: new Date(two_year_back_date.start_date), $lte: new Date(two_year_back_date.end_date) } })
            const admin_three_year_back_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, active_status: 1, created_date_n_timee_n_time: { $gte: new Date(three_year_back_date.start_date), $lte: new Date(three_year_back_date.end_date) } })

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

router.get('/company_overview', checkApiKey, async (req, res) => {
    try {
        let result = {}
        let key = "company_overview"
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const present_date_n_time = getPresentDateTime()
            // 0 = pending, 1 = approved, 2 = rejected created_by_type -> 0:user, 1:admin, 2:subadmin created_admin_row_id -> 0:admin, >0:sub admin

            const total_pending_query = companyM.countDocuments({ active_status: 1, approval_status: 0 })
            const total_approved_query = companyM.countDocuments({ active_status: 1, approval_status: 1 })
            const total_disabled_query = companyM.countDocuments({ active_status: 0 })
            const total_rejected_query = companyM.countDocuments({ active_status: 1, approval_status: 2 })

            const total_bulk_upload_pending_query = companyM.countDocuments({ active_status: 1, approval_status: 0, bulk_upload_status: 1 })
            const total_bulk_upload_approved_query = companyM.countDocuments({ active_status: 1, approval_status: 1, bulk_upload_status: 1 })
            const total_bulk_upload_disabled_query = companyM.countDocuments({ active_status: 0, bulk_upload_status: 1 })
            const total_bulk_upload_rejected_query = companyM.countDocuments({ active_status: 1, approval_status: 2, bulk_upload_status: 1 })

            const created_sub_admin_total_pending_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 0 })
            const created_sub_admin_total_approved_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 1 })
            const created_sub_admin_total_disabled_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 0, approval_status: 1 })
            const created_sub_admin_total_rejected_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 2 })

            const created_total_pending_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 1, approval_status: 0 })
            const created_total_approved_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 1, approval_status: 1 })
            const created_total_disabled_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 0, approval_status: 1 })
            const created_total_rejected_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 1, approval_status: 2 })

            const manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ approval_status: 0 })
            const manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ approval_status: 1 })
            const manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ approval_status: 2 })

            const professional_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ created_from_type: 1, approval_status: 0 })
            const professional_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ created_from_type: 1, approval_status: 1 })
            const professional_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ created_from_type: 1, approval_status: 2 })

            const events_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ created_from_type: 2, approval_status: 0 })
            const events_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ created_from_type: 2, approval_status: 1 })
            const events_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ created_from_type: 2, approval_status: 2 })

            const funding_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ created_from_type: 3, approval_status: 0 })
            const funding_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ created_from_type: 3, approval_status: 1 })
            const funding_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ created_from_type: 3, approval_status: 2 })

            const today_date = getPresentDateOnly()

            const { start_date, end_date } = yesterDayStartNEndDate(1)

            const week_date = getMinusDates(7)
            const one_month_date = getMinusDates(30)

            const today_total_claim_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(today_date) } })
            const today_total_claim_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(today_date) } })
            const today_total_claim_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(today_date) } })

            const yesterday_claim_total_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            const yesterday_claim_total_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            const yesterday_claim_total_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })

            const week_total_claim_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(week_date) } })
            const week_total_claim_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(week_date) } })
            const week_total_claim_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(week_date) } })

            const month_total_claim_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(one_month_date) } })
            const month_total_claim_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(one_month_date) } })
            const month_total_claim_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(one_month_date) } })

            const total_number_investor_query = fundingInvestmentM.aggregate([
                {
                    $match: {
                        investor_type: 2, investor_registered_type: 1, verified_status: 1
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
                        _id: "$investor_row_id"
                    }
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
                                $set: {
                                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                                }
                            },
                            {
                                $match: {
                                    login_status: 1
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
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            const event_partners_sponsor_query = event_sponsors_partner_detailsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { active_status: 1, approval_status: 1 }
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
                                            approval_status: 1, active_status: 1
                                        },
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$account_type'] },
                                                    { $eq: [1, '$$registered_type'] },
                                                    { $eq: ['$_id', '$$user_company_row_id'] }
                                                ]
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
                                            $match: {
                                                login_status: 1
                                            }
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
                                $set: {
                                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                                }
                            },
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
                { $unwind: { path: "$company_info" } },
                {
                    $group: {
                        _id: '$company_row_id',
                        count: { $sum: 1 }
                    }
                }
            ])

            const become_partners_pending_query = company_requests_to_partnersM.countDocuments({ approval_status: 0 })
            const become_partners_approved_query = company_requests_to_partnersM.countDocuments({ approval_status: 1 })
            const become_partners_rejected_query = company_requests_to_partnersM.countDocuments({ approval_status: 2 })

            const [total_pending, total_approved, total_disabled, total_rejected, created_sub_admin_total_pending, created_sub_admin_total_approved, created_sub_admin_total_disabled, created_sub_admin_total_rejected, created_total_pending, created_total_approved, created_total_disabled, created_total_rejected, manual_retrievals_pending, manual_retrievals_approved, manual_retrievals_rejected, professional_manual_retrievals_pending, professional_manual_retrievals_approved, professional_manual_retrievals_rejected, events_manual_retrievals_pending, events_manual_retrievals_approved, events_manual_retrievals_rejected, funding_manual_retrievals_pending, funding_manual_retrievals_approved, funding_manual_retrievals_rejected, total_number_investor, become_partners_pending, become_partners_approved, become_partners_rejected, event_partners_sponsor, total_bulk_upload_pending, total_bulk_upload_approved, total_bulk_upload_disabled, total_bulk_upload_rejected] = await Promise.all([total_pending_query, total_approved_query, total_disabled_query, total_rejected_query, created_sub_admin_total_pending_query, created_sub_admin_total_approved_query, created_sub_admin_total_disabled_query, created_sub_admin_total_rejected_query, created_total_pending_query, created_total_approved_query, created_total_disabled_query, created_total_rejected_query, manual_retrievals_pending_query, manual_retrievals_approved_query, manual_retrievals_rejected_query, professional_manual_retrievals_pending_query, professional_manual_retrievals_approved_query, professional_manual_retrievals_rejected_query, events_manual_retrievals_pending_query, events_manual_retrievals_approved_query, events_manual_retrievals_rejected_query, funding_manual_retrievals_pending_query, funding_manual_retrievals_approved_query, funding_manual_retrievals_rejected_query, total_number_investor_query, become_partners_pending_query, become_partners_approved_query, become_partners_rejected_query, event_partners_sponsor_query, total_bulk_upload_pending_query, total_bulk_upload_approved_query, total_bulk_upload_disabled_query, total_bulk_upload_rejected_query])

            result['total_pending'] = total_pending
            result['total_approved'] = total_approved
            result['total_disabled'] = total_disabled
            result['total_rejected'] = total_rejected

            result['created_sub_admin_total_pending'] = created_sub_admin_total_pending
            result['created_sub_admin_total_approved'] = created_sub_admin_total_approved
            result['created_sub_admin_total_disabled'] = created_sub_admin_total_disabled
            result['created_sub_admin_total_rejected'] = created_sub_admin_total_rejected

            result['created_admin_total_pending'] = created_total_pending - created_sub_admin_total_pending
            result['created_admin_total_approved'] = created_total_approved - created_sub_admin_total_approved
            result['created_admin_total_disabled'] = created_total_disabled - created_sub_admin_total_disabled
            result['created_admin_total_rejected'] = created_total_rejected - created_sub_admin_total_rejected


            result['user_total_pending'] = total_pending - created_total_pending
            result['user_total_approved'] = total_approved - created_total_approved
            result['user_total_disabled'] = total_disabled - created_total_disabled
            result['user_total_rejected'] = total_rejected - created_total_rejected

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

            result['total_bulk_upload_pending'] = total_bulk_upload_pending
            result['total_bulk_upload_approved'] = total_bulk_upload_approved
            result['total_bulk_upload_disabled'] = total_bulk_upload_disabled
            result['total_bulk_upload_rejected'] = total_bulk_upload_rejected

            result['manual_retrievals_pending'] = manual_retrievals_pending
            result['manual_retrievals_approved'] = manual_retrievals_approved
            result['manual_retrievals_rejected'] = manual_retrievals_rejected

            result['professional_manual_retrievals_pending'] = professional_manual_retrievals_pending
            result['professional_manual_retrievals_approved'] = professional_manual_retrievals_approved
            result['professional_manual_retrievals_rejected'] = professional_manual_retrievals_rejected

            result['events_manual_retrievals_pending'] = events_manual_retrievals_pending
            result['events_manual_retrievals_approved'] = events_manual_retrievals_approved
            result['events_manual_retrievals_rejected'] = events_manual_retrievals_rejected

            result['funding_manual_retrievals_pending'] = funding_manual_retrievals_pending
            result['funding_manual_retrievals_approved'] = funding_manual_retrievals_approved
            result['funding_manual_retrievals_rejected'] = funding_manual_retrievals_rejected
            result['total_number_investor'] = total_number_investor[0] ? total_number_investor[0].count : 0
            result['total_event_partners_sponsor'] = event_partners_sponsor[0] ? event_partners_sponsor[0].count : 0

            result['become_partners_pending'] = become_partners_pending
            result['become_partners_approved'] = become_partners_approved
            result['become_partners_rejected'] = become_partners_rejected

            result['total_admin_created'] = await companyM.countDocuments({ claim_status: 1 })
            result['total_company'] = await companyM.countDocuments()
            result['disabled_company'] = await companyM.countDocuments({ active_status: 0 })
            result['rejected_company'] = await companyM.countDocuments({ approval_status: 2, active_status: 1 })

            result['pending_company'] = await companyM.countDocuments({ approval_status: 0, active_status: 1 })
            result['pending_company_users'] = await companyM.countDocuments({ approval_status: 0, active_status: 1, created_by_type: 0 })
            result['pending_company_admins'] = await companyM.countDocuments({ approval_status: 0, active_status: 1, created_by_type: { $gte: 1 } })

            result['live_company'] = await companyM.countDocuments({ approval_status: 1, active_status: 1 })
            result['live_company_users'] = await companyM.countDocuments({ approval_status: 1, active_status: 1, created_by_type: 0 })
            result['live_company_admins'] = await companyM.countDocuments({ approval_status: 1, active_status: 1, created_by_type: { $gte: 1 } })
            result['live_claimed_company'] = await companyM.countDocuments({ approval_status: 1, active_status: 1, created_by_type: { $gte: 1 }, user_row_id: { $gte: 1 } })


            const company_event_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1 }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let live_company_events = 0
            if (company_event_query[0]) {
                live_company_events = company_event_query[0].count
            }
            result['live_company_events'] = live_company_events


            const countsQuery = await added_to_partnersM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])
            let company_partners = 0
            if (countsQuery[0]) {
                company_partners = countsQuery[0].count
            }
            result['live_company_partners'] = company_partners

            //0:not employee, 1:pending, 2:approved, 3:rejected

            const approved_employees_query = await professionals_work_experienceM.aggregate([
                {
                    $match: {
                        company_type: 1,
                        verified_status: true
                    }
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
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            user_account_type: '$user_account_type',
                            user_row_id: '$user_row_id'
                        },
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        { login_status: 1 },
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$user_account_type'] },
                                                    { $eq: ['$_id', "$$user_row_id"] }
                                                ]
                                            }
                                        }
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
                { $unwind: { path: "$user_info" } },
                {
                    $count: "count"
                }
            ])

            let user_as_employee_request_approved = 0
            if (approved_employees_query[0]) {
                user_as_employee_request_approved = approved_employees_query[0].count
            }

            const pending_employees_query = await professionals_work_experienceM.aggregate([
                {
                    $match: {
                        company_type: 1,
                        verified_status: { $ne: true }
                    }
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
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            user_account_type: '$user_account_type',
                            user_row_id: '$user_row_id'
                        },
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        { login_status: 1 },
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$user_account_type'] },
                                                    { $eq: ['$_id', "$$user_row_id"] }
                                                ]
                                            }
                                        }
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
                { $unwind: { path: "$user_info" } },
                {
                    $count: "count"
                }
            ])

            let user_as_employee_request_pending = 0
            if (pending_employees_query[0]) {
                user_as_employee_request_pending = pending_employees_query[0].count
            }

            result['user_as_employee_request_pending'] = user_as_employee_request_pending
            result['user_as_employee_request_approved'] = user_as_employee_request_approved
            result['user_as_employee_request_rejected'] = 0

            //  1:Pending, 2:Accepted, 3:Rejected
            const company_claim_requests_pending_query = await company_claim_requestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                {
                    $match: { claim_status: 1 }
                },
                {
                    $count: "count"
                }
            ])
            let user_claim_pending = 0
            if (company_claim_requests_pending_query[0]) {
                user_claim_pending = company_claim_requests_pending_query[0].count
            }

            const company_claim_requests_approved_query = await company_claim_requestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                {
                    $match: { claim_status: 2 }
                },
                {
                    $count: "count"
                }
            ])

            let user_claim_approved = 0
            if (company_claim_requests_approved_query[0]) {
                user_claim_approved = company_claim_requests_approved_query[0].count
            }

            const company_claim_requests_rejected_query = await company_claim_requestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                {
                    $match: { claim_status: 3 }
                },
                {
                    $count: "count"
                }
            ])

            let user_claim_rejected = 0
            if (company_claim_requests_rejected_query[0]) {
                user_claim_rejected = company_claim_requests_rejected_query[0].count
            }

            result['user_claim_pending'] = user_claim_pending
            result['user_claim_approved'] = user_claim_approved
            result['user_claim_rejected'] = user_claim_rejected

            const company_event_ongoing_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1, start_date: { $lte: new Date(present_date_n_time) }, end_date: { $gte: new Date(present_date_n_time) } }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let company_event_ongoing = 0
            if (company_event_ongoing_query[0]) {
                company_event_ongoing = company_event_ongoing_query[0].count
            }
            result['company_event_ongoing'] = company_event_ongoing

            const company_event_upcoming_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1, start_date: { $gte: new Date(present_date_n_time) } }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let company_event_upcoming = 0
            if (company_event_upcoming_query[0]) {
                company_event_upcoming = company_event_upcoming_query[0].count
            }
            result['company_event_upcoming'] = company_event_upcoming

            const company_event_completed_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1, end_date: { $lt: new Date(present_date_n_time) } }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let company_event_completed = 0
            if (company_event_completed_query[0]) {
                company_event_completed = company_event_completed_query[0].count
            }
            result['company_event_completed'] = company_event_completed

            await setCache({ key: key, value: result, ttl: 120 })

            res.json({ status: true, message: result, cache_reponse_status: false })
        }
        else {

            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Companies overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/overview', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            let result = {}
            const present_date_n_time = getPresentDateTime()
            // 0 = pending, 1 = approved, 2 = rejected created_by_type -> 0:user, 1:admin, 2:subadmin created_admin_row_id -> 0:admin, >0:sub admin

            const total_pending_query = companyM.countDocuments({ active_status: 1, approval_status: 0 })
            const total_approved_query = companyM.countDocuments({ active_status: 1, approval_status: 1 })
            const total_disabled_query = companyM.countDocuments({ active_status: 0 })
            const total_rejected_query = companyM.countDocuments({ active_status: 1, approval_status: 2 })
            const total_deleted_query = company_deleted_historyM.countDocuments()
            const total_bulk_upload_pending_query = companyM.countDocuments({ active_status: 1, approval_status: 0, bulk_upload_status: 1 })
            const total_bulk_upload_approved_query = companyM.countDocuments({ active_status: 1, approval_status: 1, bulk_upload_status: 1 })
            const total_bulk_upload_disabled_query = companyM.countDocuments({ active_status: 0, bulk_upload_status: 1 })
            const total_bulk_upload_rejected_query = companyM.countDocuments({ active_status: 1, approval_status: 2, bulk_upload_status: 1 })

            const created_sub_admin_total_pending_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 0 })
            const created_sub_admin_total_approved_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 1 })
            const created_sub_admin_total_disabled_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 0, approval_status: 1 })
            const created_sub_admin_total_rejected_query = companyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 2 })
            const created_sub_admin_total_deleted_query = company_deleted_historyM.countDocuments({ sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 } })

            const created_total_pending_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 1, approval_status: 0 })
            const created_total_approved_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 1, approval_status: 1 })
            const created_total_disabled_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 0, approval_status: 1 })
            const created_total_rejected_query = companyM.countDocuments({ claim_status: { $gte: 1 }, active_status: 1, approval_status: 2 })
            const created_total_deleted_query = company_deleted_historyM.countDocuments({ claim_status: { $gte: 1 } })

            const manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ approval_status: 0 })
            const manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ approval_status: 1 })
            const manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ approval_status: 2 })

            const professional_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ created_from_type: 1, approval_status: 0 })
            const professional_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ created_from_type: 1, approval_status: 1 })
            const professional_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ created_from_type: 1, approval_status: 2 })

            const events_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ created_from_type: 2, approval_status: 0 })
            const events_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ created_from_type: 2, approval_status: 1 })
            const events_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ created_from_type: 2, approval_status: 2 })

            const funding_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments({ created_from_type: 3, approval_status: 0 })
            const funding_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments({ created_from_type: 3, approval_status: 1 })
            const funding_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments({ created_from_type: 3, approval_status: 2 })


            const today_date = getPresentDateOnly()

            const { start_date, end_date } = yesterDayStartNEndDate(1)


            const week_date = getMinusDates(7)
            const one_month_date = getMinusDates(30)


            const today_total_claim_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(today_date) } })
            const today_total_claim_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(today_date) } })
            const today_total_claim_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(today_date) } })


            const yesterday_claim_total_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            const yesterday_claim_total_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            const yesterday_claim_total_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })


            const week_total_claim_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(week_date) } })
            const week_total_claim_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(week_date) } })
            const week_total_claim_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(week_date) } })


            const month_total_claim_pending_query = company_claim_requestsM.countDocuments({ claim_status: 1, date_n_time: { $gte: new Date(one_month_date) } })
            const month_total_claim_approved_query = company_claim_requestsM.countDocuments({ claim_status: 2, date_n_time: { $gte: new Date(one_month_date) } })
            const month_total_claim_disabled_query = company_claim_requestsM.countDocuments({ claim_status: 3, date_n_time: { $gte: new Date(one_month_date) } })



            const total_number_investor_query = fundingInvestmentM.aggregate([
                {
                    $match: {
                        investor_type: 2, investor_registered_type: 1, verified_status: 1
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
                        _id: "$investor_row_id"
                    }
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
                                $set: {
                                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                                }
                            },
                            {
                                $match: {
                                    login_status: 1
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
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])




            const event_partners_sponsor_query = event_sponsors_partner_detailsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info",
                        pipeline: [
                            {
                                $match: { active_status: 1, approval_status: 1 }
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
                                            approval_status: 1, active_status: 1
                                        },
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [2, '$$account_type'] },
                                                    { $eq: [1, '$$registered_type'] },
                                                    { $eq: ['$_id', '$$user_company_row_id'] }
                                                ]
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
                                            $match: {
                                                login_status: 1
                                            }
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
                                $set: {
                                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                                }
                            },
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
                { $unwind: { path: "$company_info" } },
                {
                    $group: {
                        _id: '$company_row_id',
                        count: { $sum: 1 }
                    }
                }
            ])


            const become_partners_pending_query = company_requests_to_partnersM.countDocuments({ approval_status: 0 })
            const become_partners_approved_query = company_requests_to_partnersM.countDocuments({ approval_status: 1 })
            const become_partners_rejected_query = company_requests_to_partnersM.countDocuments({ approval_status: 2 })

            const [total_pending, total_approved, total_disabled, total_rejected, total_deleted, created_sub_admin_total_pending, created_sub_admin_total_approved, created_sub_admin_total_disabled, created_sub_admin_total_rejected, total_sub_admin_deleted, created_total_pending, created_total_approved, created_total_disabled, created_total_rejected, created_total_deleted, manual_retrievals_pending, manual_retrievals_approved, manual_retrievals_rejected, professional_manual_retrievals_pending, professional_manual_retrievals_approved, professional_manual_retrievals_rejected, events_manual_retrievals_pending, events_manual_retrievals_approved, events_manual_retrievals_rejected, funding_manual_retrievals_pending, funding_manual_retrievals_approved, funding_manual_retrievals_rejected, total_number_investor, become_partners_pending, become_partners_approved, become_partners_rejected, event_partners_sponsor, total_bulk_upload_pending, total_bulk_upload_approved, total_bulk_upload_disabled, total_bulk_upload_rejected] = await Promise.all([total_pending_query, total_approved_query, total_disabled_query, total_rejected_query, total_deleted_query, created_sub_admin_total_pending_query, created_sub_admin_total_approved_query, created_sub_admin_total_disabled_query, created_sub_admin_total_rejected_query, created_sub_admin_total_deleted_query, created_total_pending_query, created_total_approved_query, created_total_disabled_query, created_total_rejected_query, created_total_deleted_query, manual_retrievals_pending_query, manual_retrievals_approved_query, manual_retrievals_rejected_query, professional_manual_retrievals_pending_query, professional_manual_retrievals_approved_query, professional_manual_retrievals_rejected_query, events_manual_retrievals_pending_query, events_manual_retrievals_approved_query, events_manual_retrievals_rejected_query, funding_manual_retrievals_pending_query, funding_manual_retrievals_approved_query, funding_manual_retrievals_rejected_query, total_number_investor_query, become_partners_pending_query, become_partners_approved_query, become_partners_rejected_query, event_partners_sponsor_query, total_bulk_upload_pending_query, total_bulk_upload_approved_query, total_bulk_upload_disabled_query, total_bulk_upload_rejected_query])

            result['total_pending'] = total_pending
            result['total_approved'] = total_approved
            result['total_disabled'] = total_disabled
            result['total_rejected'] = total_rejected
            result['total_deleted'] = total_deleted
            result['created_sub_admin_total_pending'] = created_sub_admin_total_pending
            result['created_sub_admin_total_approved'] = created_sub_admin_total_approved
            result['created_sub_admin_total_disabled'] = created_sub_admin_total_disabled
            result['created_sub_admin_total_rejected'] = created_sub_admin_total_rejected
            result['created_sub_admin_total_deleted'] = total_sub_admin_deleted

            result['created_admin_total_pending'] = created_total_pending - created_sub_admin_total_pending
            result['created_admin_total_approved'] = created_total_approved - created_sub_admin_total_approved
            result['created_admin_total_disabled'] = created_total_disabled - created_sub_admin_total_disabled
            result['created_admin_total_rejected'] = created_total_rejected - created_sub_admin_total_rejected
            result['created_admin_total_deleted'] = created_total_deleted - total_sub_admin_deleted


            result['user_total_pending'] = total_pending - created_total_pending
            result['user_total_approved'] = total_approved - created_total_approved
            result['user_total_disabled'] = total_disabled - created_total_disabled
            result['user_total_rejected'] = total_rejected - created_total_rejected
            result['user_total_deleted'] = total_deleted - created_total_rejected
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


            result['total_bulk_upload_pending'] = total_bulk_upload_pending
            result['total_bulk_upload_approved'] = total_bulk_upload_approved
            result['total_bulk_upload_disabled'] = total_bulk_upload_disabled
            result['total_bulk_upload_rejected'] = total_bulk_upload_rejected



            result['manual_retrievals_pending'] = manual_retrievals_pending
            result['manual_retrievals_approved'] = manual_retrievals_approved
            result['manual_retrievals_rejected'] = manual_retrievals_rejected

            result['professional_manual_retrievals_pending'] = professional_manual_retrievals_pending
            result['professional_manual_retrievals_approved'] = professional_manual_retrievals_approved
            result['professional_manual_retrievals_rejected'] = professional_manual_retrievals_rejected

            result['events_manual_retrievals_pending'] = events_manual_retrievals_pending
            result['events_manual_retrievals_approved'] = events_manual_retrievals_approved
            result['events_manual_retrievals_rejected'] = events_manual_retrievals_rejected

            result['funding_manual_retrievals_pending'] = funding_manual_retrievals_pending
            result['funding_manual_retrievals_approved'] = funding_manual_retrievals_approved
            result['funding_manual_retrievals_rejected'] = funding_manual_retrievals_rejected
            result['total_number_investor'] = total_number_investor[0] ? total_number_investor[0].count : 0
            result['total_event_partners_sponsor'] = event_partners_sponsor[0] ? event_partners_sponsor[0].count : 0


            result['become_partners_pending'] = become_partners_pending
            result['become_partners_approved'] = become_partners_approved
            result['become_partners_rejected'] = become_partners_rejected

            result['total_admin_created'] = await companyM.countDocuments({ claim_status: 1 })
            result['total_company'] = await companyM.countDocuments()
            result['disabled_company'] = await companyM.countDocuments({ active_status: 0 })
            result['rejected_company'] = await companyM.countDocuments({ approval_status: 2, active_status: 1 })

            result['pending_company'] = await companyM.countDocuments({ approval_status: 0, active_status: 1 })
            result['pending_company_users'] = await companyM.countDocuments({ approval_status: 0, active_status: 1, created_by_type: 0 })
            result['pending_company_admins'] = await companyM.countDocuments({ approval_status: 0, active_status: 1, created_by_type: { $gte: 1 } })

            result['live_company'] = await companyM.countDocuments({ approval_status: 1, active_status: 1 })
            result['live_company_users'] = await companyM.countDocuments({ approval_status: 1, active_status: 1, created_by_type: 0 })
            result['live_company_admins'] = await companyM.countDocuments({ approval_status: 1, active_status: 1, created_by_type: { $gte: 1 } })
            result['live_claimed_company'] = await companyM.countDocuments({ approval_status: 1, active_status: 1, created_by_type: { $gte: 1 }, user_row_id: { $gte: 1 } })

            const company_event_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1 }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let live_company_events = 0
            if (company_event_query[0]) {
                live_company_events = company_event_query[0].count
            }
            result['live_company_events'] = live_company_events


            const countsQuery = await added_to_partnersM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])
            let company_partners = 0
            if (countsQuery[0]) {
                company_partners = countsQuery[0].count
            }
            result['live_company_partners'] = company_partners


            //0:not employee, 1:pending, 2:approved, 3:rejected

            const approved_employees_query = await professionals_work_experienceM.aggregate([
                {
                    $match: {
                        company_type: 1,
                        verified_status: true
                    }
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
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            user_account_type: '$user_account_type',
                            user_row_id: '$user_row_id'
                        },
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        { login_status: 1 },
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$user_account_type'] },
                                                    { $eq: ['$_id', "$$user_row_id"] }
                                                ]
                                            }
                                        }
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
                { $unwind: { path: "$user_info" } },
                {
                    $count: "count"
                }
            ])

            let user_as_employee_request_approved = 0
            if (approved_employees_query[0]) {
                user_as_employee_request_approved = approved_employees_query[0].count
            }

            const pending_employees_query = await professionals_work_experienceM.aggregate([
                {
                    $match: {
                        company_type: 1,
                        verified_status: { $ne: true }
                    }
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
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: {
                            user_account_type: '$user_account_type',
                            user_row_id: '$user_row_id'
                        },
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    $and: [
                                        { login_status: 1 },
                                        {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, '$$user_account_type'] },
                                                    { $eq: ['$_id', "$$user_row_id"] }
                                                ]
                                            }
                                        }
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
                { $unwind: { path: "$user_info" } },
                {
                    $count: "count"
                }
            ])

            let user_as_employee_request_pending = 0
            if (pending_employees_query[0]) {
                user_as_employee_request_pending = pending_employees_query[0].count
            }

            result['user_as_employee_request_pending'] = user_as_employee_request_pending
            result['user_as_employee_request_approved'] = user_as_employee_request_approved
            result['user_as_employee_request_rejected'] = 0

            //  1:Pending, 2:Accepted, 3:Rejected
            const company_claim_requests_pending_query = await company_claim_requestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                {
                    $match: { claim_status: 1 }
                },
                {
                    $count: "count"
                }
            ])
            let user_claim_pending = 0
            if (company_claim_requests_pending_query[0]) {
                user_claim_pending = company_claim_requests_pending_query[0].count
            }

            const company_claim_requests_approved_query = await company_claim_requestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                {
                    $match: { claim_status: 2 }
                },
                {
                    $count: "count"
                }
            ])


            let user_claim_approved = 0
            if (company_claim_requests_approved_query[0]) {
                user_claim_approved = company_claim_requests_approved_query[0].count
            }

            const company_claim_requests_rejected_query = await company_claim_requestsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: { login_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    user_name: 1,
                                    full_name: 1,
                                    email_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: { active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_email_id: 1,
                                    website_link: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set: {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        website_link: "$company_info.website_link",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        email_id: "$user_info.email_id"
                    }
                },
                {
                    $match: { claim_status: 3 }
                },
                {
                    $count: "count"
                }
            ])



            let user_claim_rejected = 0
            if (company_claim_requests_rejected_query[0]) {
                user_claim_rejected = company_claim_requests_rejected_query[0].count
            }

            result['user_claim_pending'] = user_claim_pending
            result['user_claim_approved'] = user_claim_approved
            result['user_claim_rejected'] = user_claim_rejected

            const company_event_ongoing_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1, start_date: { $lte: new Date(present_date_n_time) }, end_date: { $gte: new Date(present_date_n_time) } }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let company_event_ongoing = 0
            if (company_event_ongoing_query[0]) {
                company_event_ongoing = company_event_ongoing_query[0].count
            }
            result['company_event_ongoing'] = company_event_ongoing

            const company_event_upcoming_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1, start_date: { $gte: new Date(present_date_n_time) } }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let company_event_upcoming = 0
            if (company_event_upcoming_query[0]) {
                company_event_upcoming = company_event_upcoming_query[0].count
            }
            result['company_event_upcoming'] = company_event_upcoming


            const company_event_completed_query = await eventM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { active_status: 1, approval_status: 1, end_date: { $lt: new Date(present_date_n_time) } }
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
                                $match: { approval_status: 1, active_status: 1 }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $count: "count"
                }
            ])

            let company_event_completed = 0
            if (company_event_completed_query[0]) {
                company_event_completed = company_event_completed_query[0].count
            }
            result['company_event_completed'] = company_event_completed
            res.json({ status: true, message: result })

        }
        catch (err) {
            console.log('Companies overview.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/subadmin_overview', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [4])
    if (checkToken.status) {
        try {
            const get_query = await sub_adminM.aggregate([
                {
                    $match: {
                        login_status: 1,
                        create_type_row_id: 7
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "_id",
                        foreignField: "created_admin_row_id",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    approval_status: 1
                                }
                            }
                        ],
                        as: "info_company"
                    }
                },
                {
                    $project: {
                        _id: 1,
                        full_name: 1,
                        email_id: 1,
                        total_company: "$info_company",
                        date_n_time: 1
                    }
                }
            ])


            res.json({ status: true, message: get_query })

        }
        catch (err) {
            console.log('Company subadmin overview.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})




router.post('/company_bulk_data', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            let admin_row_id = 0
            const check_token_message = checkToken.message
            if (check_token_message.admin_manager_type === 2) {
                admin_row_id = check_token_message.admin_row_id
            }

            let not_inserted_array = []
            if (req.body.bulk_data) {
                if (Array.isArray(req.body.bulk_data)) {
                    const bulk_data = req.body.bulk_data
                    if (bulk_data[0]) {
                        if (bulk_data[0].company_name && bulk_data[0].main_category && bulk_data[0].about_company) {
                            for (let run of bulk_data) {
                                if (run.company_name && run.main_category && run.about_company) {
                                    if (run.company_name.length >= 4) {
                                        let insert_status = true

                                        const check_email_query = await companyM.findOne({ company_name: sanitize(run.company_name) }).collation({ locale: 'en', strength: 2 })
                                        if (check_email_query) {
                                            insert_status = false
                                        }

                                        let insert_array = {}
                                        if (run.company_email_id) {
                                            const check_email_query = await companyM.findOne({ company_email_id: sanitize(run.company_email_id) }).collation({ locale: 'en', strength: 2 })
                                            if (check_email_query) {
                                                insert_status = false
                                            }
                                            else {
                                                insert_array['company_email_id'] = (run.company_email_id).toLowerCase()
                                            }
                                        }

                                        if (run.contact_number) {
                                            const check_contact_number_query = await companyM.findOne({ contact_number: sanitize(run.contact_number) })
                                            if (check_contact_number_query) {
                                                insert_status = false
                                            }
                                            else {
                                                insert_array['contact_number'] = run.contact_number
                                            }
                                        }

                                        if (insert_status) {
                                            const company_name = run.company_name
                                            const check_category_query = await company_business_modelsM.findOne({ business_name: sanitize(run.main_category) }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
                                            if (check_category_query) {
                                                insert_array['main_business_model_id'] = check_category_query._id
                                            }

                                            const check_country_query = await countryM.findOne({ country_name: sanitize(run.country_name) }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
                                            if (check_country_query) {
                                                insert_array['country_id'] = check_country_query._id
                                            }

                                            let company_id = await getNewCompanyRowID(company_name)
                                            insert_array['company_name'] = company_name
                                            insert_array['company_id'] = company_id
                                            insert_array['facebook'] = run.facebook ? run.facebook : ""
                                            insert_array['twitter'] = run.twitter ? run.twitter : ""
                                            insert_array['linkedin'] = run.linkedin ? run.linkedin : ""
                                            insert_array['instagram'] = run.instagram ? run.instagram : ""
                                            insert_array['video_link'] = run.video_link ? run.video_link : ""
                                            insert_array['telegram'] = run.telegram ? run.telegram : ""
                                            insert_array['medium'] = run.medium ? run.medium : ""
                                            insert_array['reddit'] = run.reddit ? run.reddit : ""
                                            insert_array['updated_date_n_time'] = getPresentDateTime()
                                            insert_array['created_date_n_time'] = getPresentDateTime()

                                            insert_array['website_link'] = run.website_link ? run.website_link : ""
                                            let check_date = checkValidDate(run.established_in)
                                            if (check_date.status) {
                                                insert_array['established_in'] = check_date.message
                                            }
                                            insert_array['youtube_channel'] = run.youtube_channel_id ? run.youtube_channel_id : ""
                                            insert_array['contact_number'] = run.contact_number ? run.contact_number : ""

                                            insert_array['describe_in_one_line'] = run.describe_in_one_line ? run.describe_in_one_line : ""
                                            insert_array['company_location'] = run.company_location ? run.company_location : ""
                                            insert_array['sub_admin_row_id'] = admin_row_id
                                            insert_array['claim_status'] = 1
                                            insert_array['bulk_upload_status'] = 1
                                            insert_array['user_row_id'] = 0
                                            insert_array['about_company'] = run.about_company ? run.about_company : ""
                                            const inserted_query = await companyM(insert_array).save()
                                            const company_row_id = inserted_query._id

                                            let other_insert_array = {}
                                            other_insert_array['company_row_id'] = company_row_id
                                            other_insert_array['meta_title'] = run.meta_title ? run.meta_title : ""
                                            other_insert_array['meta_keywords'] = run.meta_keywords ? run.meta_keywords : ""
                                            other_insert_array['meta_description'] = run.meta_description ? run.meta_description : ""
                                            other_insert_array['robots_index'] = run.robots_index ? run.robots_index : "index"
                                            other_insert_array['robots_follow'] = run.robots_follow ? run.robots_follow : "follow"
                                            other_insert_array['og_title'] = run.og_title ? run.og_title : ""
                                            other_insert_array['og_description'] = run.og_description ? run.og_description : ""
                                            other_insert_array['twitter_title'] = run.twitter_title ? run.twitter_title : ""
                                            other_insert_array['twitter_description'] = run.twitter_description ? run.twitter_description : ""
                                            other_insert_array['twitter_creator'] = run.twitter_creator ? run.twitter_creator : ""
                                            await company_seo_detailsM(other_insert_array).save()

                                            let social_insert_array = {}
                                            social_insert_array['company_row_id'] = company_row_id
                                            social_insert_array['facebook'] = run.facebook ? run.facebook : ""
                                            social_insert_array['twitter'] = run.twitter ? run.twitter : ""
                                            social_insert_array['linkedin'] = run.linkedin ? run.linkedin : ""
                                            social_insert_array['instagram'] = run.instagram ? run.instagram : ""
                                            social_insert_array['video_link'] = run.video_link ? run.video_link : ""
                                            social_insert_array['telegram'] = run.telegram ? run.telegram : ""
                                            social_insert_array['medium'] = run.medium ? run.medium : ""
                                            social_insert_array['reddit'] = run.reddit ? run.reddit : ""
                                            social_insert_array['other_social_links'] = run.other_social_links ? run.other_social_links : ""
                                            social_insert_array['youtube_channel'] = run.youtube_channel_id ? run.youtube_channel_id : ""
                                            social_insert_array['feed_url'] = run.feed_url ? run.feed_url : ""
                                            await company_social_linksM(social_insert_array).save()
                                        }
                                        else {
                                            not_inserted_array.push({ message: "Company name, Email ID or contact number is already exist.", data: run })
                                        }

                                    }
                                    else {
                                        not_inserted_array.push({ message: "The company name field name must be contain 4 charecters in length.", data: run })
                                    }
                                }
                                else {
                                    not_inserted_array.push({ message: "The company name, main category, and description fiels are required.", data: run })
                                }
                            }

                            res.json({
                                status: true, message: {
                                    not_inserted_array,
                                    alert_message: "Companies list details has been submitted successfully."
                                }
                            })
                        }
                        else {
                            res.json({
                                status: false,
                                message: { companies: 'The companies data field such as company_name, main_category and description.' }
                            })
                        }
                    }
                }
                else {
                    res.json({
                        status: false,
                        message: { companies: 'The companies field must be contain valid array format of data.' }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: { companies: 'The companies field is required.' }
                })
            }

        }
        catch (err) {
            console.log('Company bulk data.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = [{ approval_status: 1, active_status: 1 }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_id: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            if (req.query.main_business_model_id) {
                if (!Number.isNaN(Number.parseInt(req.query.main_business_model_id))) {
                    query.push({ main_business_model_id: Number.parseInt(req.query.main_business_model_id) })
                }
            }

            if (req.query.sub_admin_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.sub_admin_row_id))) {
                    query.push({ sub_admin_row_id: Number.parseInt(req.query.sub_admin_row_id) })
                }
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


            let start_date = ''
            let end_date = ''
            if (req.query.created_date_n_time) {
                start_date = createDateOnly(req.query.created_date_n_time)
                end_date = createEndDateOnly(req.query.created_date_n_time)

                query.push({ created_date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } })
            }


            if (req.query.claim_status) {
                if (!Number.isNaN(Number.parseInt(req.query.claim_status))) {
                    let claim_status = Number.parseInt(req.query.claim_status)
                    if (claim_status == 3) {
                        query.push({ claim_status: { $nin: [1, 2] } })
                    }
                    else {
                        query.push({ claim_status: claim_status })
                    }

                }
            }

            const search_query = { $and: query }

            const queryRun = await companyM.aggregate([
                { $match: search_query },
                { $sort: { _id: -1 } },
                // { $sort: sortCondition },

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
                        from: "cln_company_added_to_partners",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "partner"
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
                { $unwind: { path: "$partner", preserveNullAndEmptyArrays: true } },
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
                        from: "cln_static_company_business_models",
                        localField: "business_model_id",
                        foreignField: "_id",
                        pipeline: [{ $match: { active_status: true } }, { $project: { business_name: 1 } }],
                        as: "business_info",

                    }
                },
                ...(
                    !Number.isNaN(Number.parseInt(req.query.category_status)) &&
                        [0, 1].includes(Number.parseInt(req.query.category_status))
                        ? [
                            Number.parseInt(req.query.category_status) === 1
                                ? {
                                    $match: {
                                        $expr: {
                                            $gt: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                                : {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                        ]
                        : []
                ),


                {
                    $lookup: {
                        from: "cln_static_company_business_models",
                        localField: "main_business_model_id",
                        foreignField: "_id",
                        as: "main_business_info",
                        pipeline: [{ $project: { business_name: 1 } }]
                    }
                },
                { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        created_date_n_time: 1,
                        updated_date_n_time: 1,
                        company_name: 1,
                        company_id: 1,
                        company_email_id: 1,
                        contact_number: 1,
                        website_link: 1,
                        company_logo: 1,
                        business_model_id: 1,
                        active_status: 1,
                        approval_status: 1,
                        user_row_id: 1,
                        sub_admin_row_id: 1,
                        claim_status: 1,
                        main_business_model_name: "$main_business_info.business_name",
                        business_name: "$business_info.business_name",
                        // created_admin_row_id:"$admin_info.sub_admin_row_id",
                        created_user_name: "$user_info.full_name",
                        partner_added_id: "$partner._id",
                        // claim_status:"$admin_info.claim_status",
                        sub_admin_name: "$sub_admin_info.full_name",
                        sub_admin_username: "$sub_admin_info.user_name",
                        basic_details_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        owned_product_score: 1,
                        team_detail_score: 1,
                        job_opening_score: 1,
                        funding_score: 1,
                        revenue_score_score: 1,
                        investment_score: 1,
                        faq_score: 1,
                        holding_crypto_score: 1,
                        profile_score: 1,
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
            const countPipeline = [
                { $match: search_query },
                {
                    $lookup: {
                        from: "cln_static_company_business_models",
                        localField: "business_model_id",
                        foreignField: "_id",
                        pipeline: [{ $match: { active_status: true } }],
                        as: "business_info"
                    }
                },
                ...(
                    !Number.isNaN(Number.parseInt(req.query.category_status)) &&
                        [0, 1].includes(Number.parseInt(req.query.category_status))
                        ? [
                            Number.parseInt(req.query.category_status) === 1
                                ? {
                                    $match: {
                                        $expr: {
                                            $gt: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                                : {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                        ]
                        : []
                ),

                { $count: "count" }
            ]

            const countResult = await companyM.aggregate(countPipeline)
            const queryRunCount = countResult[0]?.count || 0

            res.json({ status: true, message: queryRun, count: queryRunCount, start_date, end_date })
        }
        catch (err) {
            console.log('Companies list.', err.message)
            res.json({ status: false, message: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/company_individual_overview/:company_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)

            if (!Number.isNaN(company_row_id)) {
                let result = {}
                result['total_funds_invested'] = 0
                const funds_invested_query = fundingInvestmentM.aggregate([
                    {
                        $match: { verified_status: 1, investor_registered_type: 1, investor_type: 2, investor_row_id: company_row_id }
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
                                funds_raised_registered_type: '$funds_raised_registered_type',
                                funds_raised_company_row_id: '$funds_raised_company_row_id'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
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
                            company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: "$company_info", else: '$manual_info' } }
                        }
                    },
                    {
                        $match: {
                            company_data: { $nin: ["", null] }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: "$amount"
                            }
                        }
                    }
                ])


                const funds_raised_query = fundingInvestmentM.aggregate([
                    {
                        $match: { verified_status: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: company_row_id }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$investor_type'] },
                                                        { $eq: [1, '$$investor_registered_type'] },
                                                        { $eq: ['$_id', '$$investor_row_id'] }
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
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
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
                    { $unwind: { path: "$user_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            let: {
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, '$$investor_type'] },
                                                        { $eq: [1, '$$investor_registered_type'] },
                                                        { $eq: ['$_id', '$$investor_row_id'] }
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
                                investor_type: '$investor_type',
                                investor_registered_type: '$investor_registered_type',
                                investor_row_id: '$investor_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$investor_type'] },
                                                { $eq: [2, '$$investor_registered_type'] },
                                                { $eq: ['$_id', '$$investor_row_id'] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $match: {
                            $or: [
                                { "user_info._id": { $ne: null } },
                                { "user_manual_info._id": { $ne: null } },
                                { "company_info._id": { $ne: null } },
                                { "company_manual_info._id": { $ne: null } }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: "$amount"
                            }
                        }
                    }
                ])

                const total_revenue_query = company_revenue_growthM.aggregate([
                    {
                        $match: { company_row_id: company_row_id }
                    },
                    { $group: { _id: null, total: { $sum: "$revenue" } } }
                ])

                const last_revenue_query = await company_revenue_growthM.aggregate([
                    { $match: { company_row_id: company_row_id } },
                    {
                        $group: {
                            _id: "$year",
                            total: { $sum: "$revenue" }
                        }
                    },
                    {
                        $limit: 1
                    },
                    {
                        $project: {
                            _id: 0,
                            total: 1
                        }
                    }
                ])

                const team_members_query = professionals_work_experienceM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                user_row_id: '$user_row_id',
                                user_account_type: '$user_account_type'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, "$$user_account_type"] },
                                                        { $eq: ["$_id", "$$user_row_id"] }
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
                    {
                        $lookup:
                        {
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                user_row_id: '$user_row_id',
                                user_account_type: '$user_account_type'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, "$$user_account_type"] },
                                                { $eq: ["$_id", "$$user_row_id"] }
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
                        $set:
                        {
                            user_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_account_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_account_type', 2] }
                                                ]
                                            },
                                            then: "$manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match: {
                            user_data: { $exists: true, $ne: "" },
                            company_type: 1,
                            company_row_id: company_row_id,
                            till_date_status: 2
                        }
                    },
                    {
                        $count: "count"
                    }
                ])


                const pending_team_members_query = professionals_work_experienceM.aggregate([
                    {
                        $match: {
                            verified_status: false
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                user_row_id: '$user_row_id',
                                user_account_type: '$user_account_type'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, "$$user_account_type"] },
                                                        { $eq: ["$_id", "$$user_row_id"] }
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
                    {
                        $lookup:
                        {
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                user_row_id: '$user_row_id',
                                user_account_type: '$user_account_type'
                            },
                            as: "manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, "$$user_account_type"] },
                                                { $eq: ["$_id", "$$user_row_id"] }
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
                        $set:
                        {
                            user_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_account_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$user_account_type', 2] }
                                                ]
                                            },
                                            then: "$manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match: {
                            user_data: { $exists: true, $ne: "" },
                            company_type: 1,
                            company_row_id: company_row_id,
                            till_date_status: 2
                        }
                    },
                    {
                        $count: "count"
                    }
                ])




                const [funds_invested, funds_raised, total_revenue, last_revenue, team_members, pending_team_members] = await Promise.all([funds_invested_query, funds_raised_query, total_revenue_query, last_revenue_query, team_members_query, pending_team_members_query])

                if (funds_invested[0]) {
                    if (funds_invested[0].total) {
                        result['total_funds_invested'] = funds_invested[0].total
                    }
                }

                if (funds_raised[0]) {
                    if (funds_raised[0].total) {
                        result['total_funds_raised'] = funds_raised[0].total
                    }
                }

                if (total_revenue[0]) {
                    if (total_revenue[0].total) {
                        result['total_revenue'] = total_revenue[0].total
                    }
                }

                if (team_members[0]) {
                    result['team_members'] = team_members[0].count

                }

                if (pending_team_members[0]) {
                    result['pending_team_members'] = pending_team_members[0].count
                }

                if (last_revenue[0]) {
                    if (last_revenue[0].total) {
                        result['last_year_revenue'] = last_revenue[0].total
                    }
                }




                res.json({ status: true, message: result })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }
        }
        catch (err) {
            console.log('Company individual view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/view_individual_details/:company_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)

            if (!Number.isNaN(company_row_id)) {
                const getCompanydetails = await companyM.findOne({ _id: company_row_id })

                const companyDetails = {}
                if (getCompanydetails) {
                    const company_row_id = getCompanydetails._id


                    companyDetails['_id'] = getCompanydetails._id
                    companyDetails['user_row_id'] = getCompanydetails.user_row_id
                    companyDetails['company_name'] = getCompanydetails.company_name
                    companyDetails['company_id'] = getCompanydetails.company_id
                    companyDetails['company_email_id'] = getCompanydetails.company_email_id
                    companyDetails['website_link'] = getCompanydetails.website_link
                    companyDetails['company_logo'] = getCompanydetails.company_logo
                    companyDetails['updated_date_n_time'] = getCompanydetails.updated_date_n_time
                    companyDetails['contact_number'] = getCompanydetails.contact_number
                    companyDetails['established_in'] = getCompanydetails.established_in
                    companyDetails['describe_in_one_line'] = getCompanydetails.describe_in_one_line
                    companyDetails['approval_status'] = getCompanydetails.approval_status
                    companyDetails['headquarter'] = getCompanydetails.headquarter
                    companyDetails['active_status'] = getCompanydetails.active_status
                    companyDetails['country_id'] = getCompanydetails.country_id
                    companyDetails['youtube_channel'] = getCompanydetails.youtube_channel
                    companyDetails['created_date_n_time'] = getCompanydetails.created_date_n_time
                    companyDetails['sub_admin_row_id'] = getCompanydetails.sub_admin_row_id
                    companyDetails['claim_status'] = getCompanydetails.claim_status
                    companyDetails['reason_rejected'] = getCompanydetails.reason_rejected
                    companyDetails['rejected_date_n_time'] = getCompanydetails.rejected_date_n_time

                    companyDetails['company_location'] = getCompanydetails.company_location
                    companyDetails['city'] = getCompanydetails.city ? getCompanydetails.city : ""
                    companyDetails['state'] = getCompanydetails.state ? getCompanydetails.state : ""
                    companyDetails['longitude'] = getCompanydetails.longitude ? getCompanydetails.longitude : ""
                    companyDetails['latitude'] = getCompanydetails.latitude ? getCompanydetails.latitude : ""
                    companyDetails['facebook'] = getCompanydetails.facebook
                    companyDetails['twitter'] = getCompanydetails.twitter
                    companyDetails['linkedin'] = getCompanydetails.linkedin
                    companyDetails['instagram'] = getCompanydetails.instagram
                    companyDetails['video_link'] = getCompanydetails.video_link
                    companyDetails['telegram'] = getCompanydetails.telegram
                    companyDetails['medium'] = getCompanydetails.medium
                    companyDetails['reddit'] = getCompanydetails.reddit
                    companyDetails['podcast_id'] = getCompanydetails.podcast_id
                    companyDetails['podcast_title'] = getCompanydetails.podcast_title
                    companyDetails['nft_wallet_address'] = getCompanydetails.nft_wallet_address


                    const check_partner_status_query = await added_to_partnersM.findOne({ company_row_id: company_row_id }, { _id: 1 })
                    if (check_partner_status_query) {
                        companyDetails['partner_status'] = true
                    }
                    else {
                        companyDetails['partner_status'] = false
                    }

                    const adminData = await company_created_by_adminM.findOne({ company_row_id: Number.parseInt(getCompanydetails._id) })
                    if (adminData) {
                        companyDetails['created_by_type'] = adminData.admin_sub_admin_type
                        companyDetails['created_admin_row_id'] = adminData.sub_admin_row_id
                    }

                    if (getCompanydetails.main_business_model_id) {
                        companyDetails['main_business_model_id'] = getCompanydetails.main_business_model_id
                        companyDetails['main_business_models'] = await company_business_modelsM.findOne({ _id: Number.parseInt(getCompanydetails.main_business_model_id), active_status: true }, { business_name: 1, _id: 1 })
                    }

                    if ((getCompanydetails.business_model_id) && (getCompanydetails.business_model_id.length > 0)) {
                        companyDetails['business_model_id'] = await getIntIdFromArray(getCompanydetails.business_model_id)
                    }

                    const getCompanyOtherDetails = await company_other_detailsM.findOne({ company_row_id: Number.parseInt(getCompanydetails._id) })
                    if (getCompanyOtherDetails) {
                        companyDetails['about_company'] = (getCompanyOtherDetails.about_company) ? (getCompanyOtherDetails.about_company) : ""
                        companyDetails['total_employees'] = (getCompanyOtherDetails.total_employees) ? (getCompanyOtherDetails.total_employees) : ""
                        companyDetails['meta_keywords'] = (getCompanyOtherDetails.meta_keywords) ? (getCompanyOtherDetails.meta_keywords) : ""
                        companyDetails['meta_description'] = (getCompanyOtherDetails.meta_description) ? (getCompanyOtherDetails.meta_description) : ""
                        companyDetails['meta_title'] = (getCompanyOtherDetails.meta_title) ? (getCompanyOtherDetails.meta_title) : ""
                    }
                    else {
                        companyDetails['about_company'] = ""
                        companyDetails['meta_keywords'] = ""
                        companyDetails['meta_description'] = ""
                        companyDetails['meta_title'] = ""
                    }



                    const queryRun = await professionalsM.aggregate([
                        { $match: { _id: getCompanydetails.user_row_id } },
                        { $limit: 1 },
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
                                full_name: 1,
                                user_name: 1,
                                mobile_number: 1,
                                email_id: 1,
                                wallet_address: 1,
                                country_name: "$co_info.country_name"
                            }
                        }
                    ])

                    if (queryRun.length > 0) {
                        companyDetails['user_full_name'] = queryRun[0].full_name
                        companyDetails['user_username'] = queryRun[0].user_name
                        companyDetails['user_mobile_number'] = queryRun[0].mobile_number
                        companyDetails['user_email_id'] = queryRun[0].email_id
                        companyDetails['user_wallet_address'] = queryRun[0].wallet_address
                        companyDetails['user_country_name'] = queryRun[0].country_name
                    }
                    else {
                        companyDetails['user_full_name'] = ""
                        companyDetails['user_username'] = ""
                        companyDetails['user_mobile_number'] = ""
                        companyDetails['user_email_id'] = ""
                        companyDetails['user_wallet_address'] = ""
                        companyDetails['user_country_name'] = ""
                    }


                    if (getCompanydetails.sub_admin_row_id) {
                        const runQuery = await sub_adminM.aggregate([
                            { $match: { _id: getCompanydetails.sub_admin_row_id } },
                            { $limit: 1 },
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
                                    full_name: 1,
                                    user_name: 1,
                                    mobile_number: 1,
                                    email_id: 1,
                                    wallet_address: 1,
                                    country_name: "$co_info.country_name"
                                }
                            }
                        ])
                        if (runQuery.length > 0) {
                            companyDetails['sub_admin_full_name'] = runQuery[0].full_name
                            companyDetails['sub_admin_username'] = runQuery[0].user_name
                            companyDetails['sub_admin_mobile_number'] = runQuery[0].mobile_number
                            companyDetails['sub_admin_email_id'] = runQuery[0].email_id
                            companyDetails['sub_admin_wallet_address'] = runQuery[0].wallet_address
                            companyDetails['sub_admin_country_name'] = runQuery[0].country_name
                        }
                        else {
                            companyDetails['sub_admin_full_name'] = ""
                            companyDetails['sub_admin_username'] = ""
                            companyDetails['sub_admin_mobile_number'] = ""
                            companyDetails['sub_admin_email_id'] = ""
                            companyDetails['sub_admin_wallet_address'] = ""
                            companyDetails['sub_admin_country_name'] = ""
                        }
                    }


                    if (getCompanydetails.business_model_id) {
                        companyDetails['business_name'] = await company_business_modelsM.find({ _id: { $in: getCompanydetails.business_model_id }, active_status: true }, { business_name: 1, _id: 1 })
                    }
                    else {
                        companyDetails['business_name'] = []
                    }

                    res.json({ status: true, message: companyDetails })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Oops! No data Found" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }
        }
        catch (err) {
            console.log('Company individual view.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/enable_company/:company_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                const queryRunCheck = await companyM.findOne({ _id: company_row_id })
                if (queryRunCheck) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: company_row_id
                    })
                    if (check_access.status) {
                        const checkStatus = await companyM.findOne({ _id: company_row_id, active_status: 0 })
                        if (checkStatus) {

                            let user_status = 0
                            let check_user_status
                            if (checkStatus.user_row_id > 0) {
                                //,approval_status:1
                                check_user_status = await professionalsM.findOne({ _id: checkStatus.user_row_id, login_status: 1 })
                                if (check_user_status) {
                                    user_status = 1
                                }
                                else {

                                    user_status = 2
                                }
                            }

                            if (user_status == 2) {
                                res.json({ status: false, message: { check_user_status, alert_message: "Sorry! You need to enable the user before enabling the company" } })
                            }
                            else {
                                const updateFields = getUpdateTrackerFields(checkToken)
                                await companyM.updateOne({ _id: company_row_id }, { $set: { active_status: 1, ...updateFields } })

                                if (queryRunCheck.user_row_id) {
                                    await updateNotification({
                                        user_row_id: queryRunCheck.user_row_id,
                                        notify_type: 2,
                                        notify_type_row_id: company_row_id,
                                        message_row_id: 15,
                                        action_row_id: company_row_id
                                    })
                                }

                                // const checkEvents = await eventM.findOne({ company_row_id: company_row_id })
                                // if (checkEvents) {
                                //     if (user_status == 1) {
                                //         await eventM.updateMany({ company_row_id: company_row_id }, { $set: { active_status: 1 } })
                                //     }
                                //     else {
                                //         await eventM.updateMany({ company_row_id: company_row_id, list_event_type: 2 }, { $set: { active_status: 1 } })
                                //     }
                                // }

                                const checkPodcast = await companyPodcastsM.findOne({ company_row_id: company_row_id })
                                if (checkPodcast) {
                                    await companyPodcastsM.deleteOne({ company_row_id: company_row_id })
                                }
                                await deleteKeysByPattern('app_company_list_*')
                                await deleteKeysByPattern('app_company_individual_details_*')
                                res.json({ status: true, message: { alert_message: "This company is enabled successfully" } })

                            }
                        }
                        else {
                            res.json({ status: false, message: { alert_message: "Sorry! This Company is already enabled" } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Oops! Invalid Company Row Id" } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }
        }
        catch (err) {
            console.log('Enable company.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/disable_company/:company_row_id', [
    check('disable_reason')
        .trim().not().isEmpty().withMessage('The Reason Disabled field is required')
        .isLength({ min: 4 }).withMessage('The Reason Disabled field must be at least 4 characters.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }
        else {
            const check_access = await checkCompanySubadminAccess({
                admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                admin_manager_type: checkToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                company_row_id: Number.parseInt(req.params.company_row_id)
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let admin_row_id = 0
            const check_token_message = checkToken.message
            if (check_token_message.admin_manager_type == 2) {
                admin_row_id = check_token_message.admin_row_id
            }
            let company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                const queryRunCheck = await companyM.findOne({ _id: company_row_id })
                if (queryRunCheck) {
                    const checkStatus = await companyM.findOne({ _id: company_row_id, active_status: 1 })
                    if (checkStatus) {
                        const updateArray = {}
                        updateArray['disable_reason'] = req.body.disable_reason
                        updateArray['disabled_sub_admin_row_id'] = admin_row_id
                        updateArray['disabled_date_n_time'] = getPresentDateTime()
                        updateArray['active_status'] = 0

                        const updateFields = getUpdateTrackerFields(checkToken)
                        Object.assign(updateArray, updateFields)

                        await companyM.updateOne({ _id: company_row_id }, { $set: updateArray })
                        const checkEvents = await eventM.findOne({ company_row_id: company_row_id })

                        if (queryRunCheck.user_row_id) {
                            await updateNotification({
                                user_row_id: queryRunCheck.user_row_id,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 16,
                                action_row_id: company_row_id
                            })
                        }



                        if (checkEvents) {
                            await eventM.updateMany({ company_row_id: company_row_id }, { $set: { active_status: 0 } })
                        }
                        await deleteKeysByPattern('app_company_list_*')
                        await deleteKeysByPattern('app_company_individual_details_*')
                        res.json({ status: true, message: { alert_message: "This Company is Disabled successfully" } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry! This Company is already Disabled" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Oops! Invalid Company Row Id" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }
        }
    }
    catch (err) {
        console.log('Disable company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/partners_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_id: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }
            if (req.query.profile_score === "0-24") {
                query.profile_score = { $gte: 0, $lte: 24 };
            } else if (req.query.profile_score === "25-49") {
                query.profile_score = { $gte: 25, $lte: 49 };
            } else if (req.query.profile_score === "50-74") {
                query.profile_score = { $gte: 50, $lte: 74 };
            } else if (req.query.profile_score === "75-100") {
                query.profile_score = { $gte: 75, $lte: 100 };
            }


            const queryRun = await added_to_partnersM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    approval_status: 1, active_status: 1
                                }
                            }
                        ]
                    }
                },
                { $match: { "company_info": { $elemMatch: query } } },
                { $unwind: { path: "$company_info" } },
                {
                    $lookup:
                    {
                        from: "cln_company_created_by_admins",
                        localField: "company_row_id",
                        foreignField: "company_row_id",
                        as: "created_by_admin"
                    }
                },
                { $unwind: { path: "$created_by_admin", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals",
                        let: { updated_by_id: "$company_info.updated_by_row_id", updated_by_type: "$company_info.updated_by" },
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
                        let: { updated_by_id: "$company_info.updated_by_row_id", updated_by_type: "$company_info.updated_by" },
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
                    $lookup:
                    {
                        from: "cln_professionals",
                        let: { user_id: "$company_info.user_row_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$user_id"] }
                                }
                            }
                        ],
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        let: { sub_admin_id: "$company_info.sub_admin_row_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$sub_admin_id"] }
                                }
                            }
                        ],
                        as: "sub_admin_info"
                    }
                },
                { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        company_row_id: 1,
                        user_row_id: "$company_info.user_row_id",
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_email_id: "$company_info.company_email_id",
                        company_logo: "$company_info.company_logo",
                        created_date_n_time: "$company_info.created_date_n_time",
                        claim_status: "$company_info.claim_status",
                        created_admin_row_id: "$created_by_admin.sub_admin_row_id",
                        created_user_name: "$user_info.full_name",
                        // claim_status:"$admin_info.claim_status",
                        sub_admin_name: "$sub_admin_info.full_name",
                        sub_admin_username: "$sub_admin_info.user_name",
                        basic_details_score: "$company_info.basic_details_score",
                        seo_details_score: "$company_info.seo_details_score",
                        social_media_score: "$company_info.social_media_score",
                        owned_product_score: "$company_info.owned_product_score",
                        team_detail_score: "$company_info.team_detail_score",
                        job_opening_score: "$company_info.job_opening_score",
                        funding_score: "$company_info.funding_score",
                        revenue_score_score: "$company_info.revenue_score_score",
                        investment_score: "$company_info.investment_score",
                        faq_score: "$company_info.faq_score",
                        holding_crypto_score: "$company_info.holding_crypto_score",
                        profile_score: "$company_info.profile_score",
                        updated_by: "$company_info.updated_by",
                        updated_by_row_id: "$company_info.updated_by_row_id",
                        updated_date_n_time: "$company_info.updated_date_n_time",
                        updated_by_full_name: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$company_info.updated_by", "user"] },
                                        then: {
                                            $let: {
                                                vars: { userInfo: { $arrayElemAt: ["$updated_by_user_info", 0] } },
                                                in: { $ifNull: ["$$userInfo.full_name", ""] }
                                            }
                                        }
                                    },
                                    {
                                        case: { $eq: ["$company_info.updated_by", "admin"] },
                                        then: {
                                            $let: {
                                                vars: { adminInfo: { $arrayElemAt: ["$updated_by_admin_info", 0] } },
                                                in: { $ifNull: ["$$adminInfo.full_name", ""] }
                                            }
                                        }
                                    },
                                    {
                                        case: { $eq: ["$company_info.updated_by", "subadmin"] },
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

            if (queryRun.length > 0) {
                const countsQuery = await added_to_partnersM.aggregate([
                    { $sort: { _id: -1 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        approval_status: 1, active_status: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $match: { "company_info": { $elemMatch: query } } },
                    { $unwind: { path: "$company_info" } },
                    {
                        $count: "count"
                    }
                ])

                res.json({ status: true, message: queryRun, count: countsQuery[0].count })
            }
            else {
                res.json({ status: true, message: [], count: 0 })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Partners list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.post('/create_company_details', [
    check('company_name')
        .trim().not().isEmpty().withMessage('The Company Name field is required.')
        .isLength({ min: 4 }).withMessage('The Company Name field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The Company Name field must be less than 120 characters.'),
    check('company_id')
        .trim().not().isEmpty().withMessage('The Company Id field is required.')
        .isLength({ min: 4 }).withMessage('The Company Id field must be at least 4 characters.')
        .isLength({ max: 40 }).withMessage('The Company Id field must be less than 40 characters.')
        .matches(/^[a-zA-Z0-9-]+$/).withMessage('Company ID must contain only alphabets, numbers, and hyphen.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [7])
        if (checkAdminToken.status) {
            let admin_row_id = 0
            const check_token_message = checkAdminToken.message
            if (check_token_message.admin_manager_type == 2) {
                admin_row_id = check_token_message.admin_row_id
            }


            const companyIdCheck = await companyM.findOne({ company_id: sanitize(req.body.company_id) })
            if (companyIdCheck) {
                errObj['company_id'] = 'The Company Id is already in use.'
            }

            if (req.body.company_email_id) {
                const emailIdCheck = await companyM.findOne({ company_email_id: sanitize(req.body.company_email_id) })
                if (emailIdCheck) {
                    errObj['company_email_id'] = 'The Company Email Id is already in use.'
                }
            }

            if (req.body.contact_number) {
                if (req.body.contact_number.match(/[^0-9\-(\)\s]/)) {

                    errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.';
                }
                const mobileNumberCheck = await companyM.findOne({ contact_number: sanitize(req.body.contact_number) })
                if (mobileNumberCheck) {
                    errObj['contact_number'] = 'The Contact Number is already in use.'
                }
            }

            let business_model_id = []
            if ((req.body.business_model_id) && (req.body.business_model_id.length > 0)) {
                let business_model_id_array = await getIntIdFromArray(req.body.business_model_id)
                if (business_model_id_array.length > 0) {
                    business_model_id = business_model_id_array
                }
                else {
                    errObj['business_model_id'] = 'The Business Model Ids field must be integer in object'
                }
            }

            let company_logo = ""
            if (!Object.keys(errObj).length) {
                if (req.body.company_logo) {
                    const validate_n_save_image = await validateAndSaveImage(req.body.company_logo, 1)
                    if (!validate_n_save_image.status) {
                        errObj['company_logo'] = 'Sorry, Invalid Company Logo.'
                    }
                    else {
                        company_logo = validate_n_save_image.webp_file_name
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                let insertArray = {}
                insertArray['main_business_model_id'] = req.body.main_business_model_id
                insertArray['business_model_id'] = business_model_id

                const company_id = (req.body.company_id).toLowerCase()
                const company_name = req.body.company_name
                const company_email_id = (req.body.company_email_id) ? (req.body.company_email_id).toLowerCase() : ""

                insertArray['company_id'] = company_id
                insertArray['company_email_id'] = company_email_id
                insertArray['company_name'] = company_name
                if (company_logo) {
                    insertArray['company_logo'] = company_logo
                }

                insertArray['contact_number'] = req.body.contact_number
                insertArray['website_link'] = req.body.website_link
                insertArray['describe_in_one_line'] = req.body.describe_in_one_line
                insertArray['established_in'] = req.body.established_in
                insertArray['created_date_n_time'] = getPresentDateTime()
                insertArray['updated_date_n_time'] = getPresentDateTime()
                insertArray['country_id'] = req.body.country_id
                insertArray['company_location'] = req.body.company_location
                insertArray['city'] = req.body.city ? req.body.city : ""
                insertArray['state'] = req.body.state ? req.body.state : ""
                insertArray['longitude'] = req.body.longitude ? req.body.longitude : ""
                insertArray['latitude'] = req.body.latitude ? req.body.latitude : ""
                insertArray['facebook'] = req.body.facebook
                insertArray['twitter'] = req.body.twitter
                insertArray['linkedin'] = req.body.linkedin
                insertArray['instagram'] = req.body.instagram
                insertArray['video_link'] = req.body.video_link
                insertArray['telegram'] = req.body.telegram
                insertArray['medium'] = req.body.medium
                insertArray['reddit'] = req.body.reddit
                insertArray['podcast_id'] = req.body.podcast_id
                insertArray['headquarter'] = req.body.headquarter ? req.body.headquarter : ""
                insertArray['podcast_title'] = req.body.podcast_title ? (req.body.podcast_title).trim() : ''
                insertArray['nft_wallet_address'] = req.body.nft_wallet_address ? (req.body.nft_wallet_address).trim() : ''
                insertArray['youtube_channel'] = req.body.youtube_channel_id
                insertArray['sub_admin_row_id'] = admin_row_id
                insertArray['claim_status'] = 1

                let otherArray = {}
                otherArray['total_employees'] = req.body.total_employees
                otherArray['about_company'] = req.body.about_company
                otherArray['meta_keywords'] = req.body.meta_keywords
                otherArray['meta_description'] = req.body.meta_description
                otherArray['meta_title'] = req.body.meta_title

                insertArray['user_row_id'] = 0
                const saveCompanyDetails = await companyM(insertArray).save()

                const company_row_id = saveCompanyDetails._id

                otherArray['company_row_id'] = company_row_id
                await company_other_detailsM(otherArray).save()

                if (!Number.isNaN(Number.parseInt(req.body.manual_company_row_id))) {
                    const manual_company_row_id = Number.parseInt(req.body.manual_company_row_id)
                    const check_manual_query = await company_manual_retrievalsM.findOne({ _id: manual_company_row_id })
                    if (check_manual_query) {

                        await shiftCompanyFromManualToRegister({ manual_company_row_id: manual_company_row_id, register_company_row_id: company_row_id, sub_admin_row_id: admin_row_id })

                    }
                }

                if (company_email_id) {
                    let pass_subject = 'Claim Your Account! Coinpedia Has Listed Your Company ' + company_name
                    let pass_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${company_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are delighted to inform you that, your company <b style="text-transform: capitalize;">${company_name}</b> has been listed by our admin. </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">You can claim your company profile by submitting a claim <a href="https://app.coinpedia.org/company/${company_id}" style="color:#0029ff;">request here.</a> </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">With this account you can:</p>
                    <ul style="color:#000;font-weight: 400;font-size:17px;">
                        <li>Create, List and Manage events.</li>
                        <li>Add Team Members.</li>
                        <li>Add and Update Company Details.</li>
                        <li>Add and update Funding and Revenue details</li>
                        <li>Get Market Insights, Share News.</li>
                        <li>Notify people about Jobs.</li>
                    </ul>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Upon claim request approval, you can access all the exciting features on Coinpedia. <a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login Now.</a></p>
                    `
                    await sendEmail(company_email_id, pass_subject, pass_message)
                }

                res.json({ status: true, message: { alert_message: 'New company details has been listed successfully.' } })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Create company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_company_page_details/:company_row_id', [
    check('company_name')
        .trim().not().isEmpty().withMessage('The Company Name field is required.')
        .isLength({ min: 4 }).withMessage('The Company Name field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The Company Name field must be less than 120 characters.'),
    check('company_id')
        .trim().not().isEmpty().withMessage('The Company Id field is required.')
        .isLength({ min: 4 }).withMessage('The Company Id field must be at least 4 characters.')
        .isLength({ max: 40 }).withMessage('The Company Id field must be less than 40 characters.')
        .matches(/^[a-zA-Z0-9-]+$/).withMessage('Company ID must contain only alphabets, numbers, and hyphen.'),
    check('describe_in_one_line')
        .trim().not().isEmpty().withMessage('The Describe in One Line field is required.')
        .isLength({ min: 4 }).withMessage('The Describe in One Line field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The Describe in One Line field must be less than 120 characters.'),
    check('business_model_id')
        .not().isEmpty().withMessage('The Business Model Id field is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [7])
        if (checkAdminToken.status) {
            const admin_row_id = checkAdminToken.message.admin_row_id
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (Number.isNaN(company_row_id)) {
                errObj['company_row_id'] = 'The Company row id should be an integer'
            }
            else if (checkAdminToken.message.admin_manager_type !== 1) {
                if (admin_row_id) {

                    if (checkAdminToken.message.sub_admin_type != 3) {
                        const check_company = await companyM.findOne({ _id: company_row_id })
                        if (check_company?.sub_admin_row_id) {
                            if (admin_row_id !== check_company.sub_admin_row_id) {
                                errObj['created_by_sub_admin_id'] = "You do not have access to edit this user"
                            }
                        }
                        else if ((Number.parseInt(checkAdminToken.message.sub_admin_type) == 2) || (Number.parseInt(checkAdminToken.message.sub_admin_type) == 1)) {
                            if (admin_row_id !== check_company.sub_admin_row_id) {
                                errObj['created_by_sub_admin_id'] = "You do not have access to edit this company"
                            }
                        }
                    }
                }
            }

            const companyIdCheck = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { company_id: sanitize(req.body.company_id) }] })
            if (companyIdCheck) {
                errObj['company_id'] = 'The Company Id is already in use.'
            }
            if (req.body.company_email_id) {
                const emailIdCheck = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { company_email_id: sanitize(req.body.company_email_id) }] })
                if (emailIdCheck) {
                    errObj['company_email_id'] = 'The Company Email Id is already in use.'
                }
            }

            if (req.body.contact_number) {
                if (req.body.contact_number.match(/[^0-9\-(\)\s]/)) {

                    errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.';
                }
                const mobileNumberCheck = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { contact_number: sanitize(req.body.contact_number) }] })
                if (mobileNumberCheck) {
                    errObj['contact_number'] = 'The Contact Number is already in use.'
                }
            }

            let business_model_id = []
            if ((req.body.business_model_id) && (req.body.business_model_id.length > 0)) {
                let business_model_id_array = await getIntIdFromArray(req.body.business_model_id)
                if (business_model_id_array.length > 0) {
                    business_model_id = business_model_id_array
                }
                else {
                    errObj['business_model_id'] = 'The Business Model Ids field must be integer in object'
                }
            }

            let company_logo = ""
            if (!Object.keys(errObj).length) {
                if (req.body.company_logo) {
                    const validate_n_save_image = await validateAndSaveImage(req.body.company_logo, 1)
                    if (!validate_n_save_image.status) {
                        errObj['company_logo'] = 'Sorry, Invalid Company Logo.'
                    }
                    else {
                        company_logo = validate_n_save_image.webp_file_name
                    }
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const checkCompany = await companyM.findOne({ _id: sanitize(company_row_id) }, { _id: 1, company_logo: 1 })
                if (checkCompany) {
                    let insertArray = {}
                    if (company_logo) {
                        insertArray['company_logo'] = company_logo
                        if (checkCompany.company_logo) {
                            await deleteImageDigitalOcean(checkCompany.company_logo, 1)
                        }
                    }

                    insertArray['main_business_model_id'] = req.body.main_business_model_id
                    insertArray['business_model_id'] = business_model_id
                    insertArray['company_name'] = req.body.company_name
                    insertArray['company_id'] = (req.body.company_id).toLowerCase()
                    insertArray['company_email_id'] = (req.body.company_email_id) ? (req.body.company_email_id).toLowerCase() : ""
                    insertArray['contact_number'] = req.body.contact_number
                    insertArray['website_link'] = req.body.website_link
                    insertArray['describe_in_one_line'] = req.body.describe_in_one_line
                    insertArray['established_in'] = (req.body.established_in) ? req.body.established_in : ""
                    insertArray['city'] = req.body.city ? req.body.city : ""
                    insertArray['state'] = req.body.state ? req.body.state : ""
                    insertArray['longitude'] = req.body.longitude ? req.body.longitude : ""
                    insertArray['latitude'] = req.body.latitude ? req.body.latitude : ""
                    insertArray['updated_date_n_time'] = getPresentDateTime()
                    insertArray['country_id'] = req.body.country_id
                    insertArray['company_location'] = req.body.company_location
                    insertArray['facebook'] = req.body.facebook
                    insertArray['twitter'] = req.body.twitter
                    insertArray['linkedin'] = req.body.linkedin
                    insertArray['instagram'] = req.body.instagram
                    insertArray['video_link'] = req.body.video_link
                    insertArray['telegram'] = req.body.telegram
                    insertArray['medium'] = req.body.medium
                    insertArray['reddit'] = req.body.reddit
                    insertArray['podcast_id'] = req.body.podcast_id
                    insertArray['headquarter'] = req.body.headquarter ? req.body.headquarter : ""
                    insertArray['podcast_title'] = req.body.podcast_title ? (req.body.podcast_title).trim() : ''
                    insertArray['nft_wallet_address'] = req.body.nft_wallet_address ? (req.body.nft_wallet_address).trim() : ''
                    insertArray['youtube_channel'] = req.body.youtube_channel_id ? (req.body.youtube_channel_id).trim() : ''

                    const updateFields = getUpdateTrackerFields(checkAdminToken)
                    Object.assign(insertArray, updateFields)

                    await companyM.updateOne({ _id: company_row_id }, { $set: insertArray })

                    let otherArray = {}
                    otherArray['total_employees'] = req.body.total_employees
                    otherArray['about_company'] = req.body.about_company
                    otherArray['meta_keywords'] = req.body.meta_keywords
                    otherArray['meta_description'] = req.body.meta_description
                    otherArray['meta_title'] = req.body.meta_title

                    const companyOther = await company_other_detailsM.findOne({ company_row_id: company_row_id })
                    if (companyOther) {
                        await company_other_detailsM.updateOne({ company_row_id: company_row_id }, { $set: otherArray })
                    }
                    else {
                        otherArray['company_row_id'] = company_row_id
                        await company_other_detailsM(otherArray).save()
                    }

                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    res.json({ status: true, message: { alert_message: 'Your company detail has been updated successfully.', checkAdminToken } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company Row ID.' } })
                }
            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Update company page details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }
})

router.get('/disabled_list/:skip/:limit', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            let skip = Number.parseInt(req.params.skip)
            let limit = Number.parseInt(req.params.limit)

            // Always start with $and
            let query = {
                $and: [
                    { active_status: 0 }
                ]
            };

            /* ================= SEARCH ================= */
            if (req.query.search) {
                query.$and.push({
                    $or: [
                        { company_name: { $regex: req.query.search, $options: 'i' } },
                        { company_id: { $regex: req.query.search, $options: 'i' } },
                        { company_email_id: { $regex: req.query.search, $options: 'i' } }
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





            const queryRun = await companyM.aggregate([
                { $match: query },
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
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_added_to_partners",
                        localField: "_id",
                        foreignField: "company_row_id",
                        as: "partner"
                    }
                },
                { $unwind: { path: "$partner", preserveNullAndEmptyArrays: true } },
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
                        from: "cln_static_company_business_models",
                        localField: "business_model_id",
                        foreignField: "_id",

                        pipeline: [{ $match: { active_status: true } }, { $project: { business_name: 1 } }],
                        as: "business_info",
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
                ...(
                    !Number.isNaN(Number.parseInt(req.query.category_status)) &&
                        [0, 1].includes(Number.parseInt(req.query.category_status))
                        ? [
                            Number.parseInt(req.query.category_status) === 1
                                ? {
                                    $match: {
                                        $expr: {
                                            $gt: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                                : {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                        ]
                        : []
                ),
                {
                    $project: {
                        _id: 1,
                        created_date_n_time: 1,
                        company_name: 1,
                        company_id: 1,
                        company_email_id: 1,
                        contact_number: 1,
                        website_link: 1,
                        company_logo: 1,
                        business_model_id: 1,
                        active_status: 1,
                        disable_reason: 1,
                        disabled_date_n_time: 1,
                        sub_admin_row_id: 1,
                        claim_status: 1,
                        business_name: "$business_info.business_name",
                        // created_admin_row_id:"$admin_info.sub_admin_row_id",
                        created_user_name: "$user_info.full_name",
                        partner_added_id: "$partner._id",
                        // claim_status:"$admin_info.claim_status",
                        sub_admin_name: "$sub_admin_info.full_name",
                        sub_admin_username: "$sub_admin_info.user_name",
                        basic_details_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        owned_product_score: 1,
                        team_detail_score: 1,
                        job_opening_score: 1,
                        funding_score: 1,
                        revenue_score_score: 1,
                        investment_score: 1,
                        faq_score: 1,
                        holding_crypto_score: 1,
                        profile_score: 1,
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

            // const queryRunCount = await companyM.countDocuments(query)
            const countPipeline = [
                { $match: query },
                {
                    $lookup: {
                        from: "cln_static_company_business_models",
                        localField: "business_model_id",
                        foreignField: "_id",
                        pipeline: [{ $match: { active_status: true } }],
                        as: "business_info"
                    }
                },
                ...(
                    !Number.isNaN(Number.parseInt(req.query.category_status)) &&
                        [0, 1].includes(Number.parseInt(req.query.category_status))
                        ? [
                            Number.parseInt(req.query.category_status) === 1
                                ? {
                                    $match: {
                                        $expr: {
                                            $gt: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                                : {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                { $size: { $ifNull: ["$business_info", []] } },
                                                0
                                            ]
                                        }
                                    }
                                }
                        ]
                        : []
                ),
                { $count: "count" }
            ]

            const countResult = await companyM.aggregate(countPipeline)
            const queryRunCount = countResult[0]?.count || 0

            res.json({ status: true, message: queryRun, count: queryRunCount })
        }
        catch (err) {
            console.log('Companies disabled list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', error: err.message })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/remove_from_partner/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                const queryRunCheck = await added_to_partnersM.findOne({ company_row_id: company_row_id })
                if (queryRunCheck) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: company_row_id
                    })




                    if (check_access.status) {
                        await added_to_partnersM.deleteOne({ company_row_id: company_row_id })

                        const checkCompany = await companyM.findOne({ _id: company_row_id })
                        if (checkCompany.user_row_id) {
                            await updateNotification({
                                user_row_id: checkCompany.user_row_id,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 24,
                                action_row_id: company_row_id,
                                notify_image: checkCompany.company_logo,
                                notify_name: checkCompany.company_name,
                                notify_id: ((checkCompany.approval_status == 1) && (checkCompany.active_status == 1)) ? checkCompany.company_id : ''
                            })
                        }

                        await deleteKeysByPattern('app_front_page_partners_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        res.json({ status: true, message: { alert_message: "This company is removed from your partners list successfully." } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Oops! Invalid Partner Row ID." } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Partner row id' } })
            }
        }
        catch (err) {
            console.log('Remove from Partners list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/add_to_partners/:company_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                const checkCompany = await companyM.findOne({ _id: company_row_id })
                if (checkCompany) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: company_row_id
                    })
                    if (check_access.status) {
                        const queryRunCheck = await added_to_partnersM.findOne({ company_row_id: company_row_id })
                        if (queryRunCheck) {
                            res.json({ status: false, message: { alert_message: "Company already added partner." } })
                        }
                        else {
                            const insert_query = await added_to_partnersM({ company_row_id: company_row_id, date_n_time: getPresentDateTime() }).save()
                            await deleteKeysByPattern('app_front_page_partners_list_*')
                            await deleteKeysByPattern('app_company_individual_other_details_*')
                            if (checkCompany.user_row_id) {
                                await updateNotification({
                                    user_row_id: checkCompany.user_row_id,
                                    notify_type: 2,
                                    notify_type_row_id: company_row_id,
                                    message_row_id: 23,
                                    action_row_id: insert_query._id,
                                    notify_image: checkCompany.company_logo,
                                    notify_name: checkCompany.company_name,
                                    notify_id: ((checkCompany.approval_status == 1) && (checkCompany.active_status == 1)) ? checkCompany.company_id : ''
                                })

                                const get_query = await company_requests_to_partnersM.findOne({ company_row_id: company_row_id, user_row_id: checkCompany.user_row_id, approval_status: 0 })
                                if (get_query) {
                                    await company_requests_to_partnersM.updateOne({ _id: get_query._id }, { $set: { approval_status: 0 } })
                                }
                            }


                            res.json({ status: true, message: { alert_message: "This company added to partners list successfully." } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Inavlid Company Row Id" } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }
        }
        catch (err) {
            console.log('Add to Partners list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})




router.get('/check_user_company_id/:investor_type/:id', async (req, res) => {
    try {
        const investor_type = Number.parseInt(req.params.investor_type)
        const req_id = req.params.id
        if (investor_type === 1) {
            const runQuery1 = await professionalsM.findOne({ user_name: req_id })
            if (runQuery1) {
                res.json({ status: true, message: { alert_message: "This User ID is available." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid User ID." } })
            }
        }
        else if (investor_type === 2) {
            const runQuery2 = await companyM.findOne({ comapany_id: req_id })
            if (runQuery2) {
                res.json({ status: true, message: { alert_message: "This Company ID is available." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Company ID." } })
            }
        }
        else {
            res.json({ status: false, message: { alert_message: "Sorry, Invalid investor type." } })
        }

    }
    catch (err) {
        console.log('Check user and company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/save_revenue_details/:company_row_id', [
    check('year')
        .isInt().withMessage('The year field must be contains only integers.')
        .trim().not().isEmpty().withMessage('The Year field is required.'),
    check('quarter')
        .trim().not().isEmpty().withMessage('The Quarter field is required.')
        .isInt().withMessage('The quarter field must be contains only integers.'),
    check('revenue')
        .trim().not().isEmpty().withMessage('The Reenue field is required.')
        .isInt().withMessage('The revenue field must be contains only integers.'),
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            let company_row_id = Number.parseInt(req.params.company_row_id)
            let year = 0
            let quarter = 0

            if (Number.isNaN(Number.parseInt(req.params.company_row_id))) {
                errObj['company_row_id'] = 'Company Row Id should be an integer'
            }
            else {
                const companyQuery = await companyM.findOne({ _id: company_row_id, active_status: 1 })
                if (companyQuery) {
                    company_row_id = Number.parseInt(companyQuery._id)
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: Number.parseInt(req.params.company_row_id)
                    })

                    if (!check_access.status) {
                        errObj['alert_message'] = check_access.message
                    }
                }
                else {
                    errObj['company_row_id'] = 'Invalid Company Row Id'
                }


                if (req.body.year && req.body.quarter) {
                    year = Number.parseInt(req.body.year)
                    quarter = Number.parseInt(req.body.quarter)
                    const check_existing_revenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id, year: year, quarter: quarter })
                    if (check_existing_revenue) {
                        errObj['quarter'] = 'Sorry, This revenue details already exists.'
                    }

                    // Check yearly revenue already exists
                    if (quarter !== 5) {
                        const check_yearly_revenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id, year: year, quarter: 5 })
                        if (check_yearly_revenue) {
                            errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }

                    // Check quarterly revenue already exists
                    if (quarter == 5) {
                        const check_quartely_revenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id, year: year, quarter: { $ne: 5 } })
                        if (check_quartely_revenue) {
                            errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let insertArray = {}
                insertArray['year'] = year
                insertArray['quarter'] = quarter
                insertArray['revenue'] = Number.parseInt(req.body.revenue)
                insertArray['company_row_id'] = company_row_id

                await company_revenue_growthM(insertArray).save()
                res.json({ status: true, message: { alert_message: 'Your company revenue details saved successfully.' } })

            }
        }
        catch (err) {
            console.log('Save revenue details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/revenue_individual/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const revenue_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(revenue_row_id)) {
                const checkCompanyData = await company_revenue_growthM.findOne({ _id: revenue_row_id })
                if (checkCompanyData) {
                    res.json({ status: true, message: checkCompanyData })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row ID' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Revenue row id' } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Individual revenue details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/revenue_list/:company_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            if (!Number.isNaN(company_row_id)) {
                const companyQuery = await companyM.findOne({ _id: company_row_id })
                if (companyQuery) {

                    const checkCompanyData = await company_revenue_growthM.find({ company_row_id: company_row_id }).sort({ year: -1 })
                    const count = await company_revenue_growthM.countDocuments({ company_row_id: company_row_id })
                    if (checkCompanyData) {
                        res.json({ status: true, message: checkCompanyData, count: count })
                    }
                    else {
                        res.json({ status: true, message: [] })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Company Row Id' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Revenue list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_revenue_details/:request_row_id', [
    check('year')
        .isInt().withMessage('The year field must contain only integers.')
        .not().isEmpty().withMessage('The Year field is required.').trim(),
    check('quarter')
        .isInt().withMessage('The quarter field must contain only integers.')
        .not().isEmpty().withMessage('The Quarter field is required.').trim(),
    check('revenue')
        .isInt().withMessage('The revenue field must contain only integers.')
        .not().isEmpty().withMessage('The Revenue field is required.').trim(),
    check('company_row_id')
        .isInt().withMessage('The Company Row ID field must contain only integers.')
        .not().isEmpty().withMessage('The Company Row ID field is required.').trim(),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const check_access = await checkCompanySubadminAccess({
                admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                admin_manager_type: checkToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                company_row_id: Number.parseInt(req.body.company_row_id)
            })

            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }

            let revenue_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                revenue_row_id = Number.parseInt(req.params.request_row_id)
                const checkCompanyData = await company_revenue_growthM.findOne({ _id: revenue_row_id })
                if (!checkCompanyData) {
                    errObj['revenue_row_id'] = 'Invalid revenue Row Id'
                }
            }
            else {
                errObj['revenue_row_id'] = 'Invalid revenue Row Id'
            }
            let company_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                company_row_id = Number.parseInt(req.body.company_row_id)
            }

            let year = 0
            let quarter = 0

            const companyQuery = await companyM.findOne({ _id: company_row_id, active_status: 1 })
            if (!companyQuery) {
                errObj['company_row_id'] = 'Invalid Company Row Id'
            }
            else {
                company_row_id = Number.parseInt(companyQuery._id)

                if (req.body.year && req.body.quarter) {
                    year = Number.parseInt(req.body.year)
                    quarter = Number.parseInt(req.body.quarter)
                    const check_existing_revenue = await company_revenue_growthM.findOne({ _id: { $ne: revenue_row_id }, company_row_id: company_row_id, year: year, quarter: quarter })
                    if (check_existing_revenue) {
                        errObj['quarter'] = 'Sorry, This revenue details already exists.'
                    }

                    // Check yearly revenue already exists
                    if (quarter !== 5) {
                        const check_yearly_revenue = await company_revenue_growthM.findOne({ _id: { $ne: revenue_row_id }, company_row_id: company_row_id, year: year, quarter: 5 })
                        if (check_yearly_revenue) {
                            errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }

                    // Check quarterly revenue already exists
                    if (quarter == 5) {
                        const check_quartely_revenue = await company_revenue_growthM.findOne({ _id: { $ne: revenue_row_id }, company_row_id: company_row_id, year: year, quarter: { $ne: 5 } })
                        if (check_quartely_revenue) {
                            errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
                        }
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                let updateArray = {}
                updateArray['year'] = year
                updateArray['quarter'] = quarter
                updateArray['revenue'] = Number.parseInt(req.body.revenue)

                await company_revenue_growthM.updateOne({ _id: revenue_row_id }, { $set: updateArray })

                res.json({ status: true, message: { alert_message: 'Your company revenue details updated successfully.' } })

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update revenue details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/revenue_delete/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const revenue_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(revenue_row_id)) {
                const checkCompanyData = await company_revenue_growthM.findOne({ _id: revenue_row_id })
                if (checkCompanyData) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: checkCompanyData.company_row_id
                    })

                    if (check_access.status) {
                        await deleteCompanyRevenue({ type: 1, revenue_row_id: revenue_row_id })
                        res.json({ status: true, message: { alert_message: "This revenue details has been deleted successfully." } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid Request Row ID" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Revenue row id' } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Delete revenue details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/revenue_bulk_data', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const persent_year = getPresentYearOnly()

            let company_row_id = 0
            let errObj = {}
            if (!req.body.company_row_id) {
                errObj['company_row_id'] = 'The company row id field is required.'
            }
            else if (req.body.company_row_id) {
                if (Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                    errObj['company_row_id'] = 'The company row id field should contain valid company id.'
                }
                else {
                    company_row_id = Number.parseInt(sanitize(req.body.company_row_id))
                    const check_company_query = await companyM.findOne({ _id: company_row_id, active_status: 1 })
                    if (!check_company_query) {
                        errObj['company_row_id'] = 'Invalid company row id.'
                    }
                }
            }

            let inserted_array = []
            if (!req.body.bulk_data) {
                errObj['bulk_data'] = 'The bulk data field is required'
            }
            else if (Array.isArray(req.body.bulk_data)) {
                errObj['bulk_data'] = 'The bulk data field must be an array.'
            }
            else {
                const bulk_data = req.body.bulk_data
                if (bulk_data[0]) {
                    if (bulk_data[0].revenue_year && bulk_data[0].quarter_of_the_year && bulk_data[0].revenue_in_usd) {
                        for (let run of bulk_data) {
                            let revenue_year = ""
                            let quarter_of_the_year = ""
                            let revenue_in_usd = ""
                            if (run.revenue_year) {
                                if (Number.isNaN(Number.parseInt(run.revenue_year))) {
                                    errObj['revenue_year'] = 'The revenue year field must be contain valid number.'
                                    break
                                }
                                else if (!((run.revenue_year >= 1900) && (run.revenue_year <= persent_year))) {
                                    errObj['revenue_year'] = 'The revenue year field must be contain valid year.'
                                    break
                                }
                                else {
                                    revenue_year = sanitize(run.revenue_year)
                                }
                            }
                            else {
                                errObj['revenue_year'] = 'The revenue year field is required.'
                                break
                            }

                            if (run.quarter_of_the_year) {
                                if (Number.isNaN(Number.parseInt(run.quarter_of_the_year))) {
                                    errObj['quarter_of_the_year'] = 'The quarter of the year field must be contain valid number.'
                                    break
                                }
                                else if (!((run.revenue_year >= 1) && (run.revenue_year <= 4))) {
                                    errObj['quarter_of_the_year'] = 'The quarter of the year field must be contain number from 1 to 4.'
                                    break
                                }
                                else {
                                    quarter_of_the_year = Number.parseInt(sanitize(run.quarter_of_the_year))
                                }
                            }
                            else {
                                errObj['quarter_of_the_year'] = 'The revenue year field is required.'
                                break
                            }

                            if (run.revenue_in_usd) {
                                if (Number.isNaN(Number.parseFloat(run.revenue_in_usd))) {
                                    errObj['revenue_in_usd'] = 'The revenue in usd field must be contain valid number.'
                                    break
                                }
                                else if (run.revenue_in_usd <= 0) {
                                    errObj['revenue_in_usd'] = 'The quarter of the year field must be value greater than zero.'
                                    break
                                }
                                else {
                                    revenue_in_usd = Number.parseFloat(run.revenue_in_usd)
                                }
                            }
                            else {
                                errObj['revenue_in_usd'] = 'The revenue in usd field is required.'
                                break
                            }

                            const check_query = await company_revenue_growthM.findOne({ revenue_year, quarter_of_the_year, company_row_id })
                            if (check_query) {
                                errObj['alret_message'] = 'The revenue year ' + revenue_year + ' and quarter of the year ' + quarter_of_the_year + ' is already exist.'
                            }

                            const new_object = await Promise.resolve({
                                company_row_id,
                                revenue_year,
                                quarter_of_the_year,
                                revenue_in_usd
                            })

                            inserted_array.push(new_object)

                        }
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                if (inserted_array.length) {
                    for (let run of inserted_array) {
                        await company_revenue_growthM(run).save()
                    }
                }

                res.json({ status: true, message: { alert_message: "This company revenue details has been updated successfully." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Upload revenue bulk data.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/seo_overview', checkApiKey, async (req, res) => {
    try {

        const includePatterns = ["watchlist", "company", "companies", "partner"];
        const includeRegex = includePatterns.join("|");

        /* -------------------------------------------------
           1️⃣ RECENT CHANGES (FAST & SAFE)
        ------------------------------------------------- */
        const recentLogsPromise = seo_change_logsM.aggregate([
            { $match: { module_key: "company" } },

            // latest first
            { $sort: { updated_at: -1 } },

            // keep only latest record per company
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

            // lookup active
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "module_id_num",
                    foreignField: "_id",
                    as: "active_company"
                }
            },

            // lookup deleted
            {
                $lookup: {
                    from: "cln_company_deleted_history_lists",
                    localField: "module_id_num",
                    foreignField: "company_row_id",
                    as: "deleted_company"
                }
            },

            // pick active first else deleted
            {
                $addFields: {
                    company_data: {
                        $cond: [
                            { $gt: [{ $size: "$active_company" }, 0] },
                            { $arrayElemAt: ["$active_company", 0] },
                            { $arrayElemAt: ["$deleted_company", 0] }
                        ]
                    }
                }
            },

            {
                $addFields: {
                    company_id: "$company_data.company_id",
                    company_name: "$company_data.company_name",
                    approval_status: "$company_data.approval_status",
                    active_status: "$company_data.active_status",
                }
            },

            // remove logs that have no valid company
            {
                $match: {
                    company_id: { $exists: true, $ne: "" }
                }
            },

            // clean up heavy arrays
            {
                $project: {
                    active_company: 0,
                    deleted_company: 0,
                    company_data: 0
                }
            },

            // ⚠️ sort again AFTER grouping + lookup
            { $sort: { updated_at: -1 } },

            { $limit: 10 }
        ]);


        const companyStatsPromise = company_other_detailsM.aggregate([
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "c",
                    pipeline: [
                        {
                            $match: {
                                company_id: { $exists: true, $ne: "" },
                                approval_status: 1,
                                active_status: 1
                            }
                        }
                    ]
                }
            },
            { $match: { c: { $ne: [] } } },

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
                    url: { $regex: includeRegex, $options: "i" }
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



        const staticUrlsPromise = seo_static_urlsM.aggregate([
            {
                $match: {
                    module: "app",
                    url: { $regex: includeRegex, $options: "i" }
                }
            }
        ]);

        /* -------------------------------------------------
           EXECUTE ALL IN PARALLEL
        ------------------------------------------------- */
        const [recentLogs, companyStats, staticStats, staticUrls] = await Promise.all([
            recentLogsPromise,
            companyStatsPromise,
            staticStatsPromise,
            staticUrlsPromise
        ]);

        const val = (obj, key) => obj?.[0]?.[key]?.[0]?.count || 0;

        const response = {
            recent_changes: recentLogs,
            static_urls: staticUrls,
            total_urls: val(companyStats, "total") + val(staticStats, "total"),
            h1_missing: val(companyStats, "h1_missing") + val(staticStats, "h1_missing"),
            h2_missing: val(companyStats, "h2_missing") + val(staticStats, "h2_missing"),
            multiple_h1: val(companyStats, "h1_multi") + val(staticStats, "h1_multi"),
            bad_heading_sequence: val(companyStats, "bad_seq") + val(staticStats, "bad_seq"),
            title_length_issues: {
                title_above_60_to_70: val(companyStats, "title_warn") + val(staticStats, "title_warn"),
                title_above_70: val(companyStats, "title_err") + val(staticStats, "title_err")
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