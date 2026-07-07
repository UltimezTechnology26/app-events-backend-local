const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
const { updateNotification } = require('../../../utils/helpers/notification_helper')

const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const professional_positionsM = require('../../../models/app/static/professional_positionsM')
const { addManualPosition, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')




router.post('/update_employee_details', [
    check('user_account_type')
        .not().isEmpty().withMessage('The User Account Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The User Account Type field must be contains only integers.'),
    check('user_row_id')
        .not().isEmpty().withMessage('The User Row ID field is required.'),
    check('responsibilities')
        .not().isEmpty().withMessage('The Responsibilities field is required.'),
    check('employment_type')
        .trim().not().isEmpty().withMessage('The Employment Type field is required.')
        .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
    check('designation_type')
        .trim().not().isEmpty().withMessage('The Designation Type field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            let work_row_id = 0
            let company_row_id = 0

            const company_owner_user_row_id = checkUserToken.message?.user_row_id
            const check_company_query = await companyM.findOne({ user_row_id: company_owner_user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    company_row_id = check_company_query._id
                }
                else {
                    errObj['alert_message'] = 'Sorry, Your company is still not approved. Please wait for approval.'
                }
            }
            else {
                errObj['alert_message'] = 'Sorry, This user company does not exist.'
            }


            // ── Positions validation ──────────────────────────────────────────
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

                    // derive denormalized primary from positions[0]
                    if (positions.length > 0) {
                        position_row_id = positions[0].position_row_id
                        sub_position_row_id = positions[0].sub_position_row_id
                    }
                }
            }
            let user_account_type = 0
            let user_row_id = 0
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

                if (!Number.isNaN(Number.parseInt(req.body.user_account_type)) && !Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                    user_account_type = Number.parseInt(req.body.user_account_type)
                    user_row_id = Number.parseInt(req.body.user_row_id)
                    if (user_account_type == 1) {
                        const user_reg_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 }, { _id: 1 })
                        if (!user_reg_query) {
                            errObj['investor_row_id'] = 'Sorry, Invalid registered user row id'
                        }
                    }
                    else if (user_account_type == 2) {
                        const user_manual_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id }, { _id: 1 })
                        if (!user_manual_query) {
                            errObj['investor_row_id'] = 'Sorry, Invalid manual user row id'
                        }
                    }
                }

                if (user_row_id && user_account_type) {
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
                update_array['employment_type'] = req.body.employment_type ? Number.parseInt(req.body.employment_type) : ""
                if (req.body.location_type) {
                    update_array['location_type'] = Number.parseInt(req.body.location_type)
                }

                update_array['designation_type'] = req.body.designation_type
                update_array['responsibilities'] = req.body.responsibilities
                update_array['start_date'] = req.body.start_date ? req.body.start_date : ""
                update_array['positions'] = positions
                update_array['position_row_id'] = position_row_id
                update_array['position_type'] = positions[0]?.position_type || 1
                update_array['sub_position_row_id'] = sub_position_row_id
                update_array['public_view'] = false

                if (!work_row_id) {
                    update_array['user_account_type'] = user_account_type
                    update_array['user_row_id'] = user_row_id
                    update_array['company_type'] = 1
                    update_array['company_row_id'] = company_row_id
                    update_array['till_date_status'] = 2
                    update_array['verified_status'] = true
                    update_array['verified_on'] = getPresentDateTime()

                    await professionals_work_experienceM.updateMany({ user_row_id: user_row_id }, { $set: { public_view: false } })
                    const insert_query = await professionals_work_experienceM(update_array).save()
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')

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

                    res.json({ status: true, message: { alert_message: 'This team members details are added successfully.', insert_query: insert_query } })
                }
                else {
                    await professionals_work_experienceM.updateMany({ _id: { $ne: work_row_id }, user_row_id: user_row_id }, { $set: { public_view: false } })
                    await professionals_work_experienceM.updateOne({ _id: work_row_id }, { $set: update_array })
                    const delete_cache = await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')

                    res.json({ status: true, message: { alert_message: 'This team members details are update successfully .' }, delete_cache: delete_cache })
                }
            }
        }
        else {
            res.json({ status: false, message: checkUserToken?.message })
        }
    }
    catch (err) {
        console.log('Update employee details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const check_company_query = await companyM.findOne({ user_row_id: user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    const company_row_id = check_company_query._id
                    const limit = Number.parseInt(req.params.limit)
                    const skip = Number.parseInt(req.params.skip)

                    let query = [{ user_data: { $exists: true, $ne: "" }, company_type: 1, company_row_id: company_row_id, till_date_status: 2 }]
                    if (req.query.search) {
                        query.push({
                            $or: [
                                { user_name: { '$regex': req.query.search, $options: 'i' } },
                                { full_name: { '$regex': req.query.search, $options: 'i' } },
                                { position_name: { '$regex': req.query.search, $options: 'i' } },
                                { company_name: { '$regex': req.query.search, $options: 'i' } },
                            ]
                        })
                    }
                    const key = `employee_list_${company_row_id}_${skip}_${limit}_${req.query.search || ""}`;

                    const cache_response = await getCache({ key });
                    if (cache_response.status) {
                        return res.json({
                            status: true,
                            message: cache_response.message.get_query,
                            counts: cache_response.message.counts,
                            cache_response_status: true
                        });
                    }
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
                            }
                        },
                        {
                            $set: {
                                user_name: "$user_data.user_name",
                                full_name: "$user_data.full_name",
                                pro_batch: "$user_data.pro_batch",
                                // position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
                            }
                        },
                        {
                            $match: { $and: query }
                        },
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                user_account_type: 1,
                                position_type: 1,
                                position_row_id: 1,
                                sub_position_row_id: 1,
                                position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
                                pro_batch: 1,
                                // user_name1,
                                full_name: 1,
                                email_id: "$user_data.email_id",
                                profile_image: "$user_data.profile_image",
                                user_approval_status: "$user_data.approval_status",
                                verified_status: 1,
                                verified_on: 1,
                                employment_type: 1,
                                location_type: 1,
                                designation_type: 1,
                                start_date: 1,
                                responsibilities: 1,
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
                                            position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } }
                                        }]
                                    }
                                },
                            }
                        }
                    ]).skip(skip).limit(limit)

                    const count_query = await professionals_work_experienceM.aggregate([
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
                            $set: {
                                user_name: "$user_data.user_name",
                                full_name: "$user_data.full_name",
                                position_name: "$info_position.position_name"
                            }
                        },
                        {
                            $match: { $and: query }
                        },
                        {
                            $count: "count"
                        }
                    ])

                    let counts = 0
                    if (count_query[0]) {
                        counts = count_query[0].count
                    }

                    res.json({ status: true, message: get_query, counts: counts, cache_response_status: false })
                    await setCache({ key: key, value: { get_query, counts }, ttl: 1800 });
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Employee list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/individual_details/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)

            const check_company_query = await companyM.findOne({ user_row_id: user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    const company_row_id = check_company_query._id
                    const key = `employee_details_${company_row_id}_${request_row_id}`;

                    const cache_response = await getCache({ key });
                    if (cache_response.status) {
                        return res.json({
                            status: true,
                            message: cache_response.message,
                            cache_response_status: true
                        });
                    }
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
                                _id: request_row_id,
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
                                user_name: "$user_data.user_name",
                                full_name: "$user_data.full_name",
                                email_id: "$user_data.email_id",
                                profile_image: "$user_data.profile_image",
                                user_approval_status: "$user_data.approval_status",
                                verified_status: 1,
                                verified_on: 1,
                                employment_type: 1,
                                position_row_id: 1,
                                position_name: "$info_position.position_name",
                                location_type: 1,
                                start_date: 1,
                                responsibilities: 1
                            }
                        }
                    ])

                    if (get_query[0]) {
                        await setCache({ key, value: get_query[0], ttl: 1800 });
                        res.json({ status: true, message: get_query[0], cache_response_status: false })

                    }

                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Individual employee details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/remove_employee/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)

            const check_company_query = await companyM.findOne({ user_row_id: user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    const company_row_id = check_company_query._id

                    const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, company_type: 1, company_row_id: company_row_id })
                    if (check_query) {
                        await professionals_work_experienceM.deleteOne({ _id: request_row_id, company_type: 1, company_row_id: company_row_id })

                        const delete_cache1 = await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('employee_list_*')
                        await calculateCompanyProfileScore(company_row_id, ['team_detail'])

                        res.json({ status: true, message: { alert_message: 'This employee details has been removed successfully.' }, delete_cache1: delete_cache1 })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Remove employee.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/approve_request/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)

            const check_company_query = await companyM.findOne({ user_row_id: user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    const company_row_id = check_company_query._id

                    const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, company_type: 1, company_row_id: company_row_id, verified_status: false })
                    if (check_query) {
                        await professionals_work_experienceM.updateOne({ _id: request_row_id }, {
                            $set: {
                                verified_status: true,
                                verified_on: getPresentDateTime()
                            }
                        })
                        await deleteKeysByPattern('employee_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        if (check_query.user_account_type == 1) {
                            const employee_user_row_id = check_query.user_row_id
                            await updateNotification({
                                user_row_id: employee_user_row_id,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 19,
                                action_row_id: check_query._id
                            })
                        }

                        res.json({ status: true, message: { alert_message: 'This employee details has been verified successfully.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Approve employee request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router