const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../middleware/authorization')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const company_created_by_adminM = require('../../models/app/company/company_created_by_adminM')
const added_to_partnersM = require('../../models/app/company/added_to_partnersM')
const sub_adminM = require('../../models/admin_panel/app/sub_adminM')
const eventM = require('../../models/app/events/eventM')

router.get('/total_counting_detail', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (checkToken.status) {
            const result = {}

            const admin_row_id = checkToken.message.admin_row_id
            // BUG FIX: checkAdminLoginToken returns the raw JWT payload, where
            // admin_manager_type is a STRING (see middleware/authorization.js's own
            // Number.parseInt(...) === 1/2 checks — it wouldn't need to parse it if it
            // were already a number). The strict === 1 check below always failed as a
            // result, for every admin regardless of type, so this whole block never ran —
            // `result` stayed {} and the dashboard's total_company_enabled +
            // total_company_disabled (etc.) arithmetic on undefined fields rendered NaN.
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)
            let admin_access_types = (admin_manager_type === 2) ? (checkToken.message.admin_access_types) : 0

            if (admin_manager_type === 1) {
                result['total_users'] = await professionalsM.countDocuments()
                result['total_enabled_users'] = await professionalsM.countDocuments({ login_status: 1 })
                result['total_disabled_users'] = await professionalsM.countDocuments({ login_status: 0 })

                result['total_company_approved_count'] = await companyM.countDocuments({ approval_status: 1, active_status: 1 })
                result['total_company_pending_count'] = await companyM.countDocuments({ approval_status: 0, active_status: 1 })
                result['total_company_rejected_count'] = await companyM.countDocuments({ approval_status: 2, active_status: 1 })

                result['total_company_enabled'] = await companyM.countDocuments({ approval_status: 1, active_status: 1 })
                result['total_company_disabled'] = await companyM.countDocuments({ active_status: 0 })
                result['total_events_count'] = await eventM.countDocuments()
                result['total_events_enabled'] = await eventM.countDocuments({ active_status: 1 })


                const countsQuery = await added_to_partnersM.aggregate([
                    { $sort: { _id: -1 } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info"
                        }
                    },
                    { $match: { "company_info": { $elemMatch: {} } } },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $count: "count"
                    }
                ])
                let company_partners = 0
                if (countsQuery[0]) {
                    company_partners = countsQuery[0].count
                }

                result['company_partners_count'] = company_partners

                let query = [{ portfolio_status: { $not: { $size: 0 } } }]
                const user_portfolio_query = await professionalsM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_professionals_portfolios",
                            localField: "_id",
                            foreignField: "user_row_id",
                            pipeline: [
                                {
                                    $sort: { date_n_time: -1 }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        date_n_time: 1,
                                        wallet_network_type: 1,
                                        wallet_address: 1,
                                        nick_name: 1
                                    }
                                }
                            ],
                            as: "port_info"
                        }
                    },
                    {
                        $set: {
                            portfolio_status: "$port_info"
                        }
                    },
                    {
                        $match: { $and: query }
                    },
                    {
                        $count: "count"
                    }
                ])

                let portfolio_total_counts = 0
                if (user_portfolio_query[0]) {
                    portfolio_total_counts = user_portfolio_query[0].count
                }

                result['total_portfolio_count'] = portfolio_total_counts

            }
            else if (admin_manager_type === 2) {
                result['tokens_listed_count'] = 0
                result['tokens_created_pending'] = 0
                result['tokens_created_approved'] = 0
                result['tokens_created_rejected'] = 0
                result['tokens_enabled_count'] = 0
                result['tokens_disabled_count'] = 0
                result['tokens_launchpads_count'] = 0
                result['users_count'] = 0
                result['users_disabled_count'] = 0
                result['users_enabled_count'] = 0
                result['company_enabled_count'] = 0
                result['company_disabled_count'] = 0
                result['company_partners_count'] = 0
                result['company_created_pending'] = 0
                result['company_created_approved'] = 0
                result['company_created_rejected'] = 0
                result['company_listed_count'] = 0
                result['company_pending_count'] = 0
                result['company_approved_count'] = 0
                result['company_rejected_count'] = 0
                result['tokens_pending_count'] = 0
                result['tokens_approved_count'] = 0
                result['tokens_rejected_count'] = 0

                if (admin_access_types.includes(1)) {
                    result['users_count'] = await professionalsM.countDocuments()
                    result['users_disabled_count'] = await professionalsM.countDocuments({ login_status: 0 })
                    result['users_enabled_count'] = await professionalsM.countDocuments({ login_status: 1 })
                }

                if (admin_access_types.includes(3)) {
                    result['company_enabled_count'] = await companyM.countDocuments({ approval_status: 1, active_status: 1 })
                    result['company_disabled_count'] = await companyM.countDocuments({ active_status: 0 })
                    result['company_partners_count'] = await added_to_partnersM.countDocuments()

                    const company_created_pending = await company_created_by_adminM.aggregate([
                        { $match: { sub_admin_row_id: admin_row_id } },
                        {
                            $lookup:
                            {
                                from: "cln_company_lists",
                                localField: "company_row_id",
                                foreignField: "_id",
                                as: "company_list"
                            }
                        },
                        { $match: { "company_list": { $elemMatch: { "approval_status": 0 } } } },
                        { $unwind: { path: "$company_list", preserveNullAndEmptyArrays: true } }
                    ])
                    result['company_created_pending'] = company_created_pending.length

                    const company_created_approved = await company_created_by_adminM.aggregate([
                        { $match: { sub_admin_row_id: admin_row_id } },
                        {
                            $lookup:
                            {
                                from: "cln_company_lists",
                                localField: "company_row_id",
                                foreignField: "_id",
                                as: "company_list"
                            }
                        },
                        { $match: { "company_list": { $elemMatch: { "approval_status": 1 } } } },
                        { $unwind: { path: "$company_list", preserveNullAndEmptyArrays: true } }
                    ])
                    result['company_created_approved'] = company_created_approved.length

                    const company_created_rejected = await company_created_by_adminM.aggregate([
                        { $match: { sub_admin_row_id: admin_row_id } },
                        {
                            $lookup:
                            {
                                from: "cln_company_lists",
                                localField: "company_row_id",
                                foreignField: "_id",
                                as: "company_list"
                            }
                        },
                        { $match: { "company_list": { $elemMatch: { "approval_status": 2 } } } },
                        { $unwind: { path: "$company_list", preserveNullAndEmptyArrays: true } }
                    ])
                    result['company_created_rejected'] = company_created_rejected.length
                    result['company_listed_count'] = await company_created_by_adminM.countDocuments({ sub_admin_row_id: admin_row_id })
                }
                if (admin_access_types.includes(4)) {
                    result['company_pending_count'] = await companyM.countDocuments({ approval_status: 0 })
                    result['company_approved_count'] = await companyM.countDocuments({ approval_status: 1 })
                    result['company_rejected_count'] = await companyM.countDocuments({ approval_status: 2 })
                }
                if (admin_access_types.includes(7)) {
                    // result['tokens_pending_count'] = await tokenM.countDocuments({approval_status:0})
                    // result['tokens_approved_count'] = await tokenM.countDocuments({approval_status:1})
                    // result['tokens_rejected_count'] = await tokenM.countDocuments({approval_status:2})
                }

                if (admin_access_types.includes(8)) {
                    result['events_listed_count'] = await eventM.countDocuments({ created_by_sub_admin_id: admin_row_id })
                    // result['events_created_pending'] = await eventM.countDocuments({approval_status:0, created_by_sub_admin_id:admin_row_id})
                    // result['events_created_approved'] = await eventM.countDocuments({approval_status:1, created_by_sub_admin_id:admin_row_id})
                    // result['events_created_rejected'] = await eventM.countDocuments({approval_status:2, created_by_sub_admin_id:admin_row_id})

                    result['events_enabled_count'] = await eventM.countDocuments({ active_status: 1 })
                    result['events_disabled_count'] = await eventM.countDocuments({ active_status: 0 })

                    result['events_count'] = await eventM.countDocuments()
                }

                if (admin_access_types.includes(9)) {
                    result['events_count'] = await eventM.countDocuments()

                    // result['events_pending_count'] = await eventM.countDocuments({approval_status:0})
                    // result['events_approved_count'] = await eventM.countDocuments({approval_status:1})
                    // result['events_rejected_count'] = await eventM.countDocuments({approval_status:2})
                }


            }
            res.json({ status: true, message: result })

        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Total counting Detail.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/total_subadmin_counting', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            let result = {}
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)

            if ((admin_manager_type === 1) && (admin_row_id === 1)) {
                const listCompSub = await company_created_by_adminM.aggregate([
                    { $match: { admin_sub_admin_type: 2 } },
                    { $sort: { _id: -1 } },
                    {
                        $group: {
                            _id: "$sub_admin_row_id",
                            count: { $sum: 1 }
                        }
                    }
                ])

                for (let run of listCompSub) {
                    run['data'] = await sub_adminM.findOne({ _id: run._id }, { _id: 0, full_name: 1 })
                }

                result['company_listed_counts'] = await listCompSub

            }
            res.json({ status: true, message: result })

        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Total subadmin counting.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/total_admin_counting', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            let result = {}
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)

            if ((admin_manager_type === 1) && (admin_row_id === 1)) {
                result['companies_by_admin'] = await company_created_by_adminM.countDocuments({ admin_sub_admin_type: 1 })
            }
            res.json({ status: true, message: result })

        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Total admin counting.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router