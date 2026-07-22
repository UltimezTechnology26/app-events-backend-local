const express = require('express')
const router = express.Router()

const { checkAdminLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const professionalsM = require('../../../models/app/professionalsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const { deleteProfessionalDetails, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.get('/company_list/:company_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            const limit = Number.parseInt(req.params.limit)
            const skip = Number.parseInt(req.params.skip)



            const get_query = await professionals_work_experienceM.aggregate([
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
                                    pro_batch: 1,
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
                        },
                        position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
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
                                    position_name: {
                                        $cond: {
                                            if: { $eq: ["$position_type", 2] },
                                            then: "$manual_position_info.position_name",
                                            else: "$info_position.position_name"
                                        }
                                    }
                                }]
                            }
                        },
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
                    $project: {
                        _id: 1,
                        user_account_type: 1,
                        user_row_id: 1,
                        position_type: 1,
                        position_row_id: 1,
                        sub_position_row_id: 1,
                        position_name: 1,
                        user_name: "$user_data.user_name",
                        full_name: "$user_data.full_name",
                        email_id: "$user_data.email_id",
                        pro_batch: "$user_data.pro_batch",
                        profile_image: "$user_data.profile_image",
                        user_approval_status: "$user_data.approval_status",
                        verified_status: 1,
                        verified_on: 1,
                        employment_type: 1,
                        designation_type: 1,
                        location_type: 1,
                        start_date: 1,
                        responsibilities: 1,
                        positions: 1,
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await professionals_work_experienceM.aggregate([
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
                        },
                        position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
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

            let counts = 0
            if (count_query[0]) {
                counts = count_query[0].count
            }

            res.json({ status: true, message: get_query, counts: counts })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Companies list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/remove_employee/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id })
                if (check_query) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: check_query.company_row_id
                    })
                    if (check_access.status) {
                        await deleteProfessionalDetails({ professional_details_id: request_row_id, type: 1 })
                        await deleteKeysByPattern('employee_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        await calculateCompanyProfileScore(check_query.company_row_id, ['team_detail'])

                        res.json({ status: true, message: { alert_message: 'This employee details has been removed successfully.' } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Remove Employee.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.get('/approve_request/:request_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            if (!Number.isNaN(request_row_id)) {
                const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, verified_status: false })
                if (check_query) {
                    const check_access = await checkCompanySubadminAccess({
                        admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                        admin_manager_type: checkToken.message.admin_manager_type,
                        sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                        company_row_id: check_query.company_row_id
                    })
                    if (check_access.status) {
                        await professionals_work_experienceM.updateOne({ _id: request_row_id }, {
                            $set: {
                                verified_status: true,
                                verified_on: getPresentDateTime()
                            }
                        })
                        await deleteKeysByPattern('employee_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        if (check_query.user_account_type == 1) {
                            await updateNotification({
                                user_row_id: check_query.user_row_id,
                                notify_type: 2,
                                notify_type_row_id: check_query.company_row_id,
                                message_row_id: 19,
                                action_row_id: check_query._id
                            })
                        }

                        res.json({ status: true, message: { alert_message: 'This employee request has been approved successfully.' } })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: check_access.message } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invaild request row id' } })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
            }
        }
        catch (err) {
            console.log('Approve Employees request.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }

})



//old not used code starts here

router.get('/suggestions/:user_name', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            let query = { user_name: { '$regex': req.params.user_name, $options: 'i' }, login_status: 1 }

            const list = await professionalsM.aggregate([
                { $match: query },
                {
                    $lookup:
                    {
                        from: "cln_company_employees_requests",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "empReq"
                    }
                },
                { $match: { "empReq.user_row_id": { $exists: false } } },
                {
                    $project: { user_name: 1 }
                }
            ]).limit(10)

            res.json({ status: true, message: list })
        }
        catch (err) {
            res.json({ status: false, message: err })
        }
    }
    else {
        res.json(checkToken)
    }
})


// Manual company team members list
router.get('/manual_company_list/:company_row_id/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            const limit = Number.parseInt(req.params.limit)
            const skip = Number.parseInt(req.params.skip)

            const get_query = await professionals_work_experienceM.aggregate([
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
                    $project: {
                        _id: 1,
                        user_account_type: 1,
                        user_row_id: 1,
                        position_row_id: 1,
                        position_name: "$info_position.position_name",
                        user_name: "$user_data.user_name",
                        full_name: "$user_data.full_name",
                        email_id: "$user_data.email_id",
                        profile_image: "$user_data.profile_image",
                        user_approval_status: "$user_data.approval_status",
                        verified_status: 1,
                        verified_on: 1,
                        employment_type: 1,
                        location_type: 1,
                        start_date: 1,
                        responsibilities: 1
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await professionals_work_experienceM.aggregate([
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
                        user_data: { $ne: "" },
                        company_type: 1,
                        company_row_id: company_row_id,
                        till_date_status: 2
                    }
                },
                {
                    $count: "count"
                }
            ])

            let counts = 0
            if (count_query[0]) {
                counts = count_query[0].count
            }

            res.json({ status: true, message: get_query, counts: counts })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Manual Companies employee list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router
