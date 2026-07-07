const express = require('express')
const router = express.Router()

const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')

const professionalsM = require('../../../models/app/professionalsM')
const professionals_followersM = require('../../../models/app/professionals_followersM')
const default_profile_imgM = require('../../../models/app/static/default_profile_imgM')
const companyFollowersM = require('../../../models/app/company/followersM')
const { deleteUserFollowers } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern, getCache, setCache } = require('../../../config/cache_helper')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

router.get('/followers_list', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { position_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                    ]
                }
            }
            const key = 'users_followers_list_' + user_row_id + '_' + (req.query.search || '')

            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message,
                    cache_reponse_status: true
                })
            }

            const queryRun = await professionals_followersM.aggregate([
                {
                    $match: {
                        following_user_row_id: user_row_id, confirm_request_status: 2
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "follower_user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    login_status: 1,
                                    user_name: 1,
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
                    $set: {
                        login_status: "$user_info.login_status",
                    }
                },
                { $match: { login_status: 1 } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "follower_user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "follower_user_row_id",
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
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        pro_batch: "$user_info.pro_batch",
                        positions: "$info_work.positions",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                    }
                },
                {
                    $match: query
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "follower_user_row_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                        as: "user_followed"
                    }
                },
                { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },

                {
                    $project:
                    {
                        _id: "$user_info._id",
                        user_name: 1,
                        user_row_id: "$user_info._id",
                        full_name: 1,
                        pro_batch: 1,
                        position_name: 1,
                        company_name: 1,
                        follower_user_row_id: 1,
                        following_user_row_id: 1,
                        confirm_request_status: 1,
                        email_id: "$user_info.email_id",
                        user_approval_status: "$user_info.approval_status",
                        positions: 1,
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } },
                        profile_image: "$img_info.profile_image"
                    }
                }
            ])

            // res.json({ status: true, message: queryRun })
            await setCache({
                key,
                value: queryRun,
                ttl: 1800
            })

            return res.json({
                status: true,
                message: queryRun,
                cache_reponse_status: false
            })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Followers list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/following_list', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            let search_query = {}
            if (req.query.search) {
                search_query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { position_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                    ]
                }
            }
            const key = 'users_following_list_' + user_row_id + '_' + (req.query.search || '')

            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message,
                    cache_reponse_status: true
                })
            }
            const query = await professionals_followersM.aggregate([
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
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                }
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        position_name: "$info_work.position_name",
                        positions: "$info_work.positions",
                        company_name: "$info_work.company_name",
                        pro_batch: "$user_info.pro_batch",

                    }
                },
                {
                    $match: search_query
                },
                {
                    $project: {
                        _id: "$user_info._id",
                        profile_image: "$img_info.profile_image",
                        user_name: 1,
                        full_name: 1,
                        pro_batch: 1,
                        company_name: 1,
                        position_name: 1,
                        positions: 1,
                        user_approval_status: "$user_info.approval_status",
                        total_followers: { $size: "$count_following" },
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }
                    }
                }
            ])
            await setCache({
                key,
                value: query,
                ttl: 1800
            })

            return res.json({
                status: true,
                message: query,
                cache_reponse_status: false
            })
            // res.json({ status: true, message: query, tokenStatus: true })

        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Following List.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/follow_user/:user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const date_n_time = getPresentDateTime()
            let following_user_row_id = Number.parseInt(req.params.user_row_id)
            let account_visible_type = 0
            if (!Number.isNaN(following_user_row_id)) {
                const queryRun = await professionalsM.findOne({ login_status: 1, _id: following_user_row_id }, { full_name: 1, account_visible_type: 1 })
                if (queryRun) {
                    let follower_user_name = queryRun.full_name  // for email
                    account_visible_type = queryRun.account_visible_type

                    if (user_row_id === following_user_row_id) {
                        res.json({ status: false, message: { alert_message: 'Sorry, You are following your account only.' }, tokenStatus: true })
                    }
                    else {
                        const follower_query = await professionals_followersM.findOne({ follower_user_row_id: user_row_id, following_user_row_id: following_user_row_id })
                        if (follower_query) {
                            res.json({ status: false, message: { alert_message: 'Already followed..' }, tokenStatus: true })
                        }
                        else {

                            let insert_array = {
                                follower_user_row_id: user_row_id,
                                following_user_row_id: following_user_row_id,
                                confirm_request_status: account_visible_type,
                                date_n_time: date_n_time
                            }

                            //0:not following, 1:pending, 2:approved
                            let message_row_id = 7
                            if (account_visible_type == 1) {
                                message_row_id = 8
                            }



                            const save_array = await professionals_followersM(insert_array).save()
                            await deleteKeysByPattern('app_users_list_*')
                            await deleteKeysByPattern('users_following_list_*')
                            await deleteKeysByPattern('users_followers_list_*')
                            await deleteKeysByPattern('app_user_other_details_*')
                            await deleteKeysByPattern('app_company_individual_other_details_*')
                            await deleteKeysByPattern('employee_list_*')
                            await deleteKeysByPattern('app_user_detail_*')
                            await deleteKeysByPattern('users_following_pending_list_*')
                            await deleteKeysByPattern('individual_event_*')
                            await deleteKeysByPattern('speakers_list_*')

                            await updateThreadNotification({
                                user_row_id: following_user_row_id,
                                notify_type: 1,
                                notify_type_row_id: user_row_id,
                                message_row_id: message_row_id,
                                action_row_id: save_array._id
                            })

                            // required for email
                            const following_user_name_query = await professionalsM.find({ _id: following_user_row_id })
                            let following_user_name = following_user_name_query.full_name
                            let following_user_email_id = following_user_name_query.email_id

                            const total_followers = await professionals_followersM.countDocuments({ following_user_row_id: following_user_row_id, confirm_request_status: 2 }, { following_user_row_id: 1 })

                            let pass_email_id = following_user_email_id
                            let pass_subject = 'Heya! You have a New Follower.'
                            let pass_full_name = following_user_name
                            let pass_message = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${pass_full_name},</p>
                            <div style="color:#000">
                                <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${follower_user_name}</b> Started Following you on the Coinpedia pro account profile. </p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Your total followers are ${total_followers}.</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;"> Login to know more.</p>
                            </div>
                            </div>`


                            await sendEmail(pass_email_id, pass_subject, pass_message)

                            res.json({ status: true, insert_array: insert_array, message: { alert_message: 'You have successfully followed the user. Thank you for your involvement!', following_full_name: follower_user_name }, confirm_request_status: queryRun.account_visible_type, tokenStatus: true })
                        }
                    }
                    // res.json(queryRun)
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' }, tokenStatus: true })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Follow user.', err.message)
        res.json({ status: false, message: err.message })
    }
})

router.get('/follow_requests_pending_list', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }
            let search_query = {}
            if (req.query.search) {
                search_query = {
                    $or: [
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { position_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                    ]
                }
            }
            const key = 'users_following_pending_list_' + user_row_id + '_' + (req.query.search || '')

            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message,
                    cache_reponse_status: true
                })
            }
            const queryRun = await professionals_followersM.aggregate([
                { $match: { following_user_row_id: user_row_id, confirm_request_status: 1 } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "follower_user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
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
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "follower_user_row_id",
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
                                    company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                                }
                            }
                        ],
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        pro_batch: "$user_info.pro_batch",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        positions: "$info_work.positions",
                    }
                },
                {
                    $match: search_query
                },
                {
                    $project:
                    {
                        _id: "$user_info._id",
                        user_name: 1,
                        full_name: 1,
                        pro_batch: 1,
                        position_name: 1,
                        company_name: 1,
                        approval_status: "$user_info.approval_status",
                        follower_user_row_id: 1,
                        confirm_request_status: 1,
                        profile_image: "$img_info.profile_image",
                        positions: 1,
                    }
                }
            ])
            await setCache({
                key,
                value: queryRun,
                ttl: 1800
            })

            return res.json({
                status: true,
                message: queryRun,
                cache_reponse_status: false
            })

            // res.json({ status: true, message: queryRun, tokenStatus: true })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Follow requests pending.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/confirm_request/:user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            let following_user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(following_user_row_id)) {

                const queryRun = await professionals_followersM.findOne({ follower_user_row_id: following_user_row_id, following_user_row_id: user_row_id, confirm_request_status: 1 })
                if (queryRun) {
                    await updateNotification({
                        user_row_id: following_user_row_id,
                        notify_type: 1,
                        notify_type_row_id: user_row_id,
                        message_row_id: 12,
                        action_row_id: queryRun._id
                    })

                    await professionals_followersM.updateOne({ follower_user_row_id: following_user_row_id, following_user_row_id: user_row_id }, { $set: { confirm_request_status: 2 } })
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_users_list_*')
                    await deleteKeysByPattern('users_following_list_*')
                    await deleteKeysByPattern('users_following_pending_list_*')

                    await deleteKeysByPattern('users_followers_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('speakers_list_*')

                    res.json({ status: true, message: { alert_message: 'You have successfully accepted the following request from this user. Thank you for your involvement!' }, tokenStatus: true })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Invalid Following User Row ID' }, tokenStatus: true })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Confirm request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_follow_request/:user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            let follower_user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(follower_user_row_id)) {
                const queryRun = await professionals_followersM.findOne({ follower_user_row_id: follower_user_row_id, following_user_row_id: user_row_id, confirm_request_status: 1 })
                if (queryRun) {
                    await professionals_followersM.deleteOne({ follower_user_row_id: follower_user_row_id, following_user_row_id: user_row_id, confirm_request_status: 1 })
                    await deleteKeysByPattern('users_following_list_*')
                    await deleteKeysByPattern('users_following_pending_list_*')
                    await deleteKeysByPattern('users_followers_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('speakers_list_*')

                    res.json({ status: true, message: { alert_message: 'The following request has been successfully deleted. Thank you for your action!' }, tokenStatus: true })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Something went wrong please check your inputs.' }, tokenStatus: true })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }

        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Delete follow request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/unfollow_user/:user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const follower_user_row_id = checkUserToken.message
            let user_row_id = Number.parseInt(req.params.user_row_id)
            let following_full_name = ""
            if (!Number.isNaN(follower_user_row_id)) {
                const following_user_query = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1 })
                if (following_user_query) {
                    following_full_name = following_user_query.full_name
                }

                const queryRun = await professionals_followersM.findOne({ follower_user_row_id: follower_user_row_id, following_user_row_id: user_row_id })
                if (queryRun) {
                    await deleteUserFollowers({ type: 1, follower_user_row_id: follower_user_row_id, user_row_id: user_row_id })
                    const delete_cache = await deleteKeysByPattern('app_users_list_*')
                    await deleteKeysByPattern('users_following_list_*')
                    await deleteKeysByPattern('users_followers_list_*')
                    await deleteKeysByPattern('users_following_pending_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('speakers_list_*')


                    res.json({ status: true, delete_cache: delete_cache, message: { alert_message: 'This user has been successfully removed from your following list.', following_full_name: following_full_name }, tokenStatus: true })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Already unfollowed..' }, tokenStatus: true })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Unfollow User.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/remove_user_from_follower/:user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const follower_user_row_id = checkUserToken.message
            let user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(user_row_id)) {
                const queryRun = await professionals_followersM.findOne({ follower_user_row_id: user_row_id, following_user_row_id: follower_user_row_id, confirm_request_status: 2 })
                if (queryRun) {
                    await deleteUserFollowers({ type: 1, follower_user_row_id: user_row_id, user_row_id: follower_user_row_id })
                    await deleteKeysByPattern('users_following_list_*')
                    await deleteKeysByPattern('users_followers_list_*')
                    await deleteKeysByPattern('users_following_pending_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('employee_list_*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('speakers_list_*')



                    res.json({ status: true, message: { alert_message: 'This user has been successfully removed from your followers. Thank you for managing your followers!' }, tokenStatus: true })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'User already removed from followers list.' }, tokenStatus: true })
                }

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Remove user from follower.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/view_user/:user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const login_user_row_id = checkUserToken.message
            let view_user_row_id = Number.parseInt(req.params.user_row_id)
            if (!Number.isNaN(view_user_row_id)) {
                const queryRun = await professionalsM.aggregate([
                    { $match: { login_status: 1, _id: view_user_row_id } },
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
                    { $unwind: { path: "$other_info", preserveNullAndEmptyArrays: true } },
                    {
                        $project:
                        {
                            _id: 1,
                            user_name: 1,
                            full_name: 1,
                            email_id: 1,
                            mobile_number: 1,
                            country_id: 1,
                            gender: 1,
                            user_bio: 1,
                            location: 1,
                            profile_image: "$img_info.profile_image",
                            profile_image_type: "$img_info.profile_image_type"
                        }
                    }
                ])

                if (queryRun) {
                    let innerObj = {}

                    if (queryRun[0].profile_image_type > 0) {
                        //default image
                        const default_image_query = await default_profile_imgM.findOne({ _id: queryRun[0].profile_image_type })
                        if (default_image_query) {
                            innerObj['profile_image'] = default_image_query['image_name']
                        }
                    }

                    const total_following = await professionals_followersM.countDocuments({ follower_user_row_id: view_user_row_id })
                    const total_followers = await professionals_followersM.countDocuments({ following_user_row_id: view_user_row_id })

                    innerObj['user_name'] = queryRun[0].user_name
                    innerObj['full_name'] = queryRun[0].full_name
                    innerObj['email_id'] = queryRun[0].email_id
                    innerObj['mobile_number'] = queryRun[0].mobile_number
                    innerObj['country_id'] = queryRun[0].country_id
                    innerObj['gender'] = queryRun[0].gender
                    innerObj['user_bio'] = queryRun[0].user_bio
                    innerObj['location'] = queryRun[0].location
                    innerObj['profile_image'] = queryRun[0].profile_image
                    innerObj['profile_image_type'] = queryRun[0].profile_image_type
                    innerObj['total_following'] = total_following
                    innerObj['total_followers'] = total_followers
                    innerObj['confirm_request_status'] = 0

                    const present_follow_query = await professionals_followersM.findOne({ follower_user_row_id: login_user_row_id, following_user_row_id: view_user_row_id }, { confirm_request_status: 1 })
                    if (present_follow_query) {
                        innerObj['confirm_request_status'] = present_follow_query.confirm_request_status
                    }

                    res.json({ status: true, message: innerObj, tokenStatus: true, image_base_url: "uploads/profile/" })
                }

                res.json({ status: false, tokenStatus: true })

            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('View user.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/company_following_list', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            let query = [{ user_row_id: user_row_id, login_status: 1, approval_status: 1, active_status: 1 }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { company_name: { '$regex': req.query.search, $options: 'i' } },
                        { company_id: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }
            const key = 'users_company_following_list_' + user_row_id + '_' + (req.query.search || '')

            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message,
                    cache_reponse_status: true
                })
            }
            const queryRun = await companyFollowersM.aggregate([
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
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "business_model_id",
                                    foreignField: "_id",
                                    as: "business_info",
                                    pipeline: [{ $match: { "active_status": true } }],
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "main_business_model_id",
                                    foreignField: "_id",
                                    as: "main_business_info"
                                }
                            },
                            { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "co_info"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$co_info",
                                    preserveNullAndEmptyArrays: true
                                }
                            },
                            {
                                $project: {
                                    company_name: 1,
                                    user_row_id: 1,
                                    company_id: 1,
                                    company_logo: 1,
                                    business_model_id: 1,
                                    main_business_model_id: 1,
                                    approval_status: 1,
                                    active_status: 1,
                                    main_business_model_name: "$main_business_info.business_name",
                                    business_name: "$business_info.business_name",
                                    country_name: "$co_info.country_name",
                                    country_flag: "$co_info.country_flag"
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
                        localField: "company_info.user_row_id",
                        foreignField: "_id",
                        as: "company_user_info"
                    }
                },
                { $unwind: { path: "$company_user_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        login_status: { $cond: { if: "$company_user_info.login_status", then: "$company_user_info.login_status", else: 1 } },
                        approval_status: "$company_info.approval_status",
                        active_status: "$company_info.active_status",
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                    }
                },
                { $match: { $and: query } },
                {
                    $project:
                    {
                        _id: "$company_info._id",
                        following_status: { $cond: { if: '$company_info._id', then: true, else: false } },
                        company_name: 1,
                        company_id: 1,
                        company_logo: "$company_info.company_logo",
                        business_model_id: "$company_info.business_model_id",
                        main_business_model_id: "$company_info.main_business_model_id",
                        main_business_model_name: "$company_info.main_business_model_name",
                        business_name: "$company_info.business_name",


                    }
                }
            ])

            // res.json({ status: true, message: queryRun })
            await setCache({
                key,
                value: queryRun,
                ttl: 1800
            })

            return res.json({
                status: true,
                message: queryRun,
                cache_reponse_status: false
            })
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Company following list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




module.exports = router