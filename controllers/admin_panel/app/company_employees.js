const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, arrangeValidation, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const professional_positionsM = require('../../../models/app/static/professional_positionsM')
const { addManualPosition, deleteProfessionalDetails, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.post('/update_employee_details', [
    check('employment_type')
        .trim().not().isEmpty().withMessage('The Employment Type field is required.')
        .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
    check('designation_type')
        .trim().not().isEmpty().withMessage('The Designation Type field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            let work_row_id = 0
            let company_row_id = 0
            let user_account_type = 0
            let user_row_id = 0


            const check_access = await checkCompanySubadminAccess({
                admin_row_id: Number.parseInt(checkToken.message.admin_row_id),
                admin_manager_type: checkToken.message.admin_manager_type,
                sub_admin_type: Number.parseInt(checkToken.message.sub_admin_type),
                company_row_id: Number.parseInt(req.body.company_row_id)
            })
            if (!check_access.status) {
                errObj['alert_message'] = check_access.message
            }

            let positions = []
            let position_row_id = 0
            let sub_position_row_id = 0

            let raw_positions = req.body.additional_positions
            if (!raw_positions) {
                errObj['additional_positions'] = 'At least one position is required.'
            } else {
                if (typeof raw_positions === 'string') {
                    try { raw_positions = JSON.parse(raw_positions) } catch (e) { raw_positions = [] }
                }
                if (!Array.isArray(raw_positions) || raw_positions.length === 0) {
                    errObj['additional_positions'] = 'At least one position is required.'
                } else if (raw_positions.length > 3) {
                    errObj['additional_positions'] = 'You can add a maximum of 3 positions.'
                } else {
                    for (const ap of raw_positions) {
                        const ap_position_type = Number.parseInt(ap.position_type)
                        const ap_position_row_id = Number.parseInt(ap.position_row_id)
                        let ap_sub_position_row_id = 0

                        if (Number.isNaN(ap_position_type) || ap_position_type < 1 || ap_position_type > 2) {
                            errObj['additional_positions'] = 'Invalid position type.'
                            break
                        }
                        if (Number.isNaN(ap_position_row_id)) {
                            errObj['additional_positions'] = 'Invalid position.'
                            break
                        }
                        const ap_get_query = await professional_positionsM.findOne({ _id: ap_position_row_id, active_status: true })
                        if (!ap_get_query) {
                            errObj['additional_positions'] = 'Sorry, invalid position.'
                            break
                        }
                        if (ap_position_type === 2) {
                            if (!ap.sub_position_name) {
                                errObj['additional_positions'] = 'Position name is required for custom positions.'
                                break
                            }
                            const ap_manual_query = await addManualPosition(ap.sub_position_name)
                            if (ap_manual_query.status) {
                                ap_sub_position_row_id = Number.parseInt(ap_manual_query.sub_position_row_id)
                            } else {
                                errObj['additional_positions'] = 'Invalid custom position name.'
                                break
                            }
                        }
                        const is_dupe = positions.some(p =>
                            p.position_type === ap_position_type &&
                            p.position_row_id === ap_position_row_id &&
                            p.sub_position_row_id === ap_sub_position_row_id
                        )
                        if (is_dupe) {
                            errObj['additional_positions'] = 'Duplicate position found.'
                            break
                        }
                        positions.push({
                            position_type: ap_position_type,
                            position_row_id: ap_position_row_id,
                            sub_position_row_id: ap_sub_position_row_id
                        })
                    }
                    if (positions.length > 0) {
                        position_row_id = positions[0].position_row_id
                        sub_position_row_id = positions[0].sub_position_row_id
                    }
                }
            }

            if (req.body.work_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.work_row_id))) {
                    work_row_id = Number.parseInt(req.body.work_row_id)
                    const check_query = await professionals_work_experienceM.findOne({ _id: work_row_id })
                    if (!check_query) {
                        errObj['alert_message'] = 'Invalid work row id'
                    }
                }
            }
            else {

                if (!req.body.company_row_id) {
                    errObj['company_row_id'] = 'The Company Row ID field is required.'
                }
                else {
                    company_row_id = Number.parseInt(req.body.company_row_id)
                    const check_company_query = await companyM.findOne({ _id: company_row_id }, { _id: 1 })
                    if (!check_company_query) {
                        errObj['alert_message'] = 'Sorry, Invalid Company Row ID.'
                    }
                }

                if (!Number.isNaN(Number.parseInt(req.body.user_account_type)) && !Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                    user_account_type = Number.parseInt(req.body.user_account_type)
                    user_row_id = Number.parseInt(req.body.user_row_id)
                    if (user_account_type === 1) {
                        const user_reg_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 }, { _id: 1 })
                        if (!user_reg_query) {
                            errObj['investor_row_id'] = 'Sorry, Invalid registered user row id'
                        }
                    }
                    else if (user_account_type === 2) {
                        const user_manual_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id }, { _id: 1 })
                        if (!user_manual_query) {
                            errObj['investor_row_id'] = 'Sorry, Invalid manual user row id'
                        }
                    }
                }

                if (user_row_id && user_account_type && company_row_id) {
                    const check_work_query = await professionals_work_experienceM.findOne(
                        { till_date_status: 2, user_account_type: user_account_type, user_row_id: user_row_id, company_type: 1, company_row_id: company_row_id },
                        { _id: 1 })
                    if (check_work_query) {
                        errObj['alert_message'] = 'Sorry, This employee details are already exist.'
                    }
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                const update_array = {}
                const employment_type = Number.parseInt(req.body.employment_type)
                const designation_type = Number.parseInt(req.body.designation_type)
                const location_type = req.body.location_type ? Number.parseInt(req.body.location_type) : ""
                update_array['employment_type'] = employment_type
                update_array['designation_type'] = designation_type
                update_array['location_type'] = location_type
                update_array['responsibilities'] = req.body.responsibilities
                update_array['start_date'] = req.body.start_date
                update_array['positions'] = positions
                update_array['position_row_id'] = position_row_id
                update_array['position_type'] = positions[0]?.position_type || 1
                update_array['sub_position_row_id'] = sub_position_row_id
                update_array['public_view'] = true

                if (!work_row_id) {
                    update_array['user_row_id'] = user_row_id
                    update_array['user_account_type'] = user_account_type
                    update_array['company_type'] = 1
                    update_array['company_row_id'] = company_row_id
                    update_array['till_date_status'] = 2
                    update_array['verified_status'] = true
                    update_array['verified_on'] = getPresentDateTime()

                    await professionals_work_experienceM.updateMany({ user_row_id: user_row_id, user_account_type: user_account_type }, { $set: { public_view: false } })
                    const insert_query = await professionals_work_experienceM(update_array).save()
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_user_other_details_*')

                    if (user_account_type == 1) {
                        await updateNotification({
                            user_row_id: user_row_id,
                            notify_type: 2,
                            notify_type_row_id: company_row_id,
                            message_row_id: 18,
                            action_row_id: insert_query._id
                        })
                    }
                    await calculateCompanyProfileScore(company_row_id, ['team_detail'])

                    res.json({ status: true, message: { alert_message: 'This employee details are added successfully.' } })
                }
                else {
                    await professionals_work_experienceM.updateMany({ _id: { $ne: work_row_id }, user_row_id: user_row_id, user_account_type: user_account_type }, { $set: { public_view: false } })
                    await professionals_work_experienceM.updateOne({ _id: work_row_id }, { $set: update_array })
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    res.json({ status: true, message: { alert_message: 'This employee details are updated successfully.' } })
                }

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update employee details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

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
                                    pro_batch: 1,
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

router.get('/list/:skip/:limit', async (req, res) => {

    try {
        const checkToken = checkAdminLoginToken(req.headers, [7])
        if (checkToken.status) {
            const limit = Number.parseInt(req.params.limit)
            const skip = Number.parseInt(req.params.skip)

            const query = [{}]

            if (req.query.search) {
                query.push({
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { user_full_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_email_id: { '$regex': req.query.search, $options: 'i' } },
                        { position_name: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            if (req.query.verified_status) {
                if (Number.parseInt(req.query.verified_status) == 1) {
                    query.push({ verified_status: true })
                }
                else if (Number.parseInt(req.query.verified_status) == 2) {
                    query.push({ verified_status: false })
                }
            }

            if (req.query.employment_type) {
                query.push({ employment_type: Number.parseInt(req.query.employment_type) })
            }

            const search_query = { $and: query }



            const get_query = await professionals_work_experienceM.aggregate([
                {
                    $sort: { _id: -1 }
                },
                {
                    $match: {
                        company_type: 1
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
                                    _id: 1,
                                    company_id: 1,
                                    approval_status: 1,
                                    company_name: 1,
                                    company_logo: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
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
                                    login_status: 1,
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
                { $unwind: { path: "$user_info" } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        pro_batch: "$user_info.pro_batch",
                        user_full_name: "$user_info.full_name",
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        position_name: "$info_position.position_name"
                    }
                },
                {
                    $match: search_query
                },
                {
                    $project: {
                        _id: 1,
                        position_name: 1,
                        company_name: 1,
                        company_id: 1,
                        company_logo: "$company_info.company_logo",
                        company_approval_status: "$company_info.approval_status",
                        user_account_type: 1,
                        user_full_name: 1,
                        user_name: 1,
                        pro_batch: 1,
                        user_profile_image: "$user_info.profile_image",
                        user_approval_status: "$user_info.approval_status",
                        end_date: 1,
                        till_date_status: 1,
                        verified_status: 1,
                        verified_on: 1,
                        employment_type: 1,
                        start_date: 1
                    }
                }
            ]).skip(skip).limit(limit)


            const count_query = await professionals_work_experienceM.aggregate([
                {
                    $match: {
                        company_type: 1
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
                                    _id: 1,
                                    company_id: 1,
                                    approval_status: 1,
                                    company_name: 1,
                                    company_logo: 1
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
                                    _id: 1,
                                    user_name: 1,
                                    pro_batch: 1,
                                    login_status: 1,
                                    full_name: 1,
                                    email_id: 1,
                                    approval_status: 1,
                                    profile_image: "$img_info.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        pro_batch: "$user_info.pro_batch",
                        user_full_name: "$user_info.full_name",
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        position_name: "$info_position.position_name"
                    }
                },
                {
                    $match: search_query
                },
                {
                    $count: "count"
                }
            ])

            let counts = 0
            if (count_query[0]) {
                counts = count_query[0].count
            }

            res.json({ status: true, message: get_query, counts: counts, query })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Employees list.', err.message)
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