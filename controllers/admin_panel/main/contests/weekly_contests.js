const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const weekly_contestsM = require('../../../../models/main/contest/weekly_contestsM')
const started_detailsM = require('../../../../models/main/contest/started_detailsM')
const winnersM = require('../../../../models/main/contest/winnersM')
const professionalsM = require('../../../../models/app/professionalsM')

const { getPresentDateTime, addFiveMinutesToTime, arrangeValidation, formImageUpload, deleteImageDigitalOcean, createEndDateOnly, createDateTime } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const { sendAcademyEmail } = require('../../../../config/email')
const { updateNotification } = require('../../../../utils/helpers/notification_helper')
const notificationsM = require('../../../../models/app/notifications/notificationsM')

router.post('/add_n_update_details', [
    check('title')
        .trim().not().isEmpty().withMessage('The Title field is required.'),
    check('start_date')
        .trim().not().isEmpty().withMessage('The Start date field is required.'),
    check('end_date')
        .trim().not().isEmpty().withMessage('The End date field is required.'),
    check('description')
        .trim().not().isEmpty().withMessage('The Description field is required.'),
    check('first_price_reward')
        .trim().not().isEmpty().withMessage('The First price reward field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            let previous_contest_image = ""
            let contest_row_id = ""
            if (req.body.contest_row_id) {
                contest_row_id = Number.parseInt(req.body.contest_row_id)
                if (Number.isNaN(contest_row_id)) {
                    errObj['contest_row_id'] = 'Sorry, Invalid Contest Row ID.'
                }
                else {
                    const check_contest_query = await weekly_contestsM.findOne({ _id: contest_row_id })
                    if (check_contest_query) {
                        previous_contest_image = check_contest_query.contest_image
                    }
                    else {
                        errObj['contest_row_id'] = 'Sorry, Invalid Chapter Row ID.'
                    }
                }
            }

            let contest_image = ""
            if (!Object.keys(errObj).length) {
                if (req.files) {
                    if (req.files.contest_image) {
                        if (previous_contest_image) {
                            await deleteImageDigitalOcean(previous_contest_image, 6)
                        }

                        const upload_image = req.files.contest_image
                        const validate_n_save_image = await formImageUpload(upload_image, 6)
                        if (!validate_n_save_image.status) {
                            errObj['token_image'] = 'Sorry, Invalid Contest image.'
                        }
                        else {
                            contest_image = validate_n_save_image.message
                        }
                    }
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const start_date = new Date(req.body.start_date);
                const end_date = new Date(req.body.end_date);

                start_date.setHours(0, 0, 0, 0);
                end_date.setHours(23, 59, 59, 999);
                const update_array = {}
                update_array['title'] = req.body.title
                update_array['start_date'] = start_date
                update_array['end_date'] = end_date
                update_array['description'] = req.body.description
                update_array['first_price_reward'] = req.body.first_price_reward
                update_array['second_price_reward'] = req.body.second_price_reward
                update_array['third_price_reward'] = req.body.third_price_reward
                if (contest_image) {
                    update_array['contest_image'] = contest_image
                }
                update_array['completed_status'] = 0


                if (contest_row_id) {
                    await weekly_contestsM.updateOne({ _id: contest_row_id }, { $set: update_array })

                    res.json({
                        status: true,
                        message: { alert_message: "This weekly contests details has been updated successfully." }
                    })
                }
                else {

                    update_array['active_status'] = 1
                    update_array['date_n_time'] = getPresentDateTime()

                    const insert_query = await weekly_contestsM(update_array).save()

                    await updateNotification({
                        user_row_id: 0,
                        notify_type: 6,
                        notify_type_row_id: insert_query._id,
                        message_row_id: 105,
                        action_row_id: insert_query._id
                    })

                    res.json({
                        status: true,
                        message: { alert_message: "This weekly contests details has been added successfully." }
                    })
                }
            }
        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Add and update contest details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/individual_details/:contest_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const contest_row_id = Number.parseInt(req.params.contest_row_id)

            const get_query = await weekly_contestsM.aggregate([
                {
                    $match: { _id: contest_row_id }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        contest_image: 1,
                        start_date: 1,
                        end_date: 1,
                        description: 1,
                        active_status: 1,
                        date_n_time: 1,
                    }
                }
            ]).limit(1)

            if (get_query[0]) {
                res.json({
                    status: true,
                    message: get_query[0]
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid Contest Row ID." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Individual contest details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_contest/:contest_row_id', async (req, res) => {
    const contest_row_id = Number.parseInt(req.params.contest_row_id)
    if (!Number.isNaN(contest_row_id)) {
        const checkAdminToken = checkAdminLoginToken(req.headers, [13])
        if (checkAdminToken.status) {
            try {
                const check_query = await weekly_contestsM.findOne({ _id: contest_row_id })
                if (check_query) {
                    if (check_query.contest_image) {
                        await deleteImageDigitalOcean(check_query.contest_image, 6)
                    }
                    await weekly_contestsM.deleteOne({ _id: contest_row_id })

                    res.json({ status: true, message: { alert_message: "This contest details has been deleted successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Contest Row ID" } })
                }
            }
            catch (err) {
                console.log('Delete Contest.', err.message)
                res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    else {
        res.json({ status: false, message: { alert_message: "Sorry, Invalid Contest row id." } })
    }
})


router.get('/enable_contest/:contest_row_id', async (req, res) => {
    const contest_row_id = Number.parseInt(req.params.contest_row_id)
    if (!Number.isNaN(contest_row_id)) {
        const checkAdminToken = checkAdminLoginToken(req.headers, [13])
        if (checkAdminToken.status) {
            try {
                const check_query = await weekly_contestsM.findOne({ _id: contest_row_id, active_status: 0 })
                if (check_query) {
                    await weekly_contestsM.updateOne({ _id: contest_row_id, active_status: 0 }, { $set: { active_status: 1 } })

                    res.json({ status: true, message: { alert_message: "This contest details has been enabled successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Contest ID or it is enabled" } })
                }
            }
            catch (err) {
                console.log('Enable contest.', err.message)
                res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    else {
        res.json({ status: false, message: { alert_message: "Sorry, Invalid Contest row id." } })
    }
})


router.post('/disable_contest/:contest_row_id', [
    check('disable_reason')
        .trim().not().isEmpty().withMessage('The Disable Reason field is required')
        .isLength({ min: 4 }).withMessage('The Disable Reason field must be at least 4 characters.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [13])
        if (checkAdminToken.status) {
            const contest_row_id = Number.parseInt(req.params.contest_row_id)
            if (Number.isNaN(contest_row_id)) {
                errObj['contest_row_id'] = "Sorry, Invalid Contest row id."
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_query = await weekly_contestsM.findOne({ _id: contest_row_id, active_status: 1 })
                if (check_query) {
                    let updateArray = {
                        active_status: 0,
                        disable_reason: req.body.disable_reason
                    }

                    await weekly_contestsM.updateOne({ _id: contest_row_id }, { $set: updateArray })

                    res.json({ status: true, message: { alert_message: "This Contest details has been disabled successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Contest ID or it is disabled" } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Disable contest.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;

            let query = [];
            if (req.query.search) {
                query.push({
                    $or: [
                        { title: { '$regex': req.query.search, $options: 'i' } }
                    ]
                });
            }

            let filter_query = {}
            if (query.length > 0) {
                filter_query = { $and: query }
            }


            const get_query = await weekly_contestsM.aggregate([
                {
                    $match: filter_query
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_questions",
                        localField: "_id",
                        foreignField: "contest_row_id",
                        as: "question_info"
                    }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_started_details",
                        localField: "_id",
                        foreignField: "contest_row_id",
                        as: "participated_info",
                        pipeline: [
                            {
                                $match: { contest_status: 1 }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        contest_image: 1,
                        start_date: 1,
                        end_date: 1,
                        active_status: 1,
                        date_n_time: 1,
                        completed_status: 1,
                        total_question: { $size: "$question_info" },
                        participated_users: { $size: "$participated_info" }
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await weekly_contestsM.countDocuments(filter_query)

            res.json({
                status: true,
                message: get_query,
                count: count_query
            })

        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Contests list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/participated_users_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13]);

        if (checkToken.status) {
            const skip = parseInt(req.params.skip)
            const limit = parseInt(req.params.limit)

            let query = [{ contest_status: 1, winner_user_status: false }]
            if (req.query.search) {
                query.push({
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { contest_title: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            let filter_query = { $and: query }

            const get_query = await started_detailsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
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
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    email_id: 1,
                                    wallet_address: 1,
                                    profile_image: "$img_info.profile_image",
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests_winners",
                        localField: "contest_row_id",
                        foreignField: "contest_row_id",
                        as: "winner_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    winning_position: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_winners",
                        let: {
                            contest_row_id: '$contest_row_id',
                            user_row_id: '$user_row_id'
                        },
                        as: "winner_user",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$user_row_id", "$$user_row_id"] },
                                            { $eq: ["$contest_row_id", "$$contest_row_id"] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$winner_user", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: {
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        email_id: "$user_info.email_id",
                        contest_title: "$contest_info.title",
                        completed_status: "$contest_info.completed_status",
                        total_winners: { $size: "$winner_info" },
                        winner_user_status: { $cond: { if: "$winner_user.user_row_id", then: true, else: false } }
                    }
                },
                {
                    $match: filter_query
                },
                {
                    $sort: {
                        start_date: 1,
                        contest_score: 1
                    }
                },
                {
                    $project: {
                        _id: 1,
                        contest_score: 1,
                        date_n_time: 1,
                        winner_status: 1,
                        contest_status: 1,
                        user_row_id: 1,
                        contest_row_id: 1,
                        full_name: 1,
                        user_name: 1,
                        email_id: 1,
                        time_duration: 1,
                        winner_user_status: 1,
                        completed_status: 1,
                        total_winners: 1,
                        winner_user: "$winner_user",
                        profile_image: "$user_info.profile_image",
                        wallet_address: "$user_info.wallet_address",
                        contest_title: 1,
                        winner_data: "$winner_info",
                        contest_image: "$contest_info.contest_image",
                        start_date: "$contest_info.start_date",
                        end_date: "$contest_info.end_date"
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await started_detailsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                {
                    $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_winners",
                        let: {
                            contest_row_id: '$contest_row_id',
                            user_row_id: '$user_row_id'
                        },
                        as: "winner_user",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$user_row_id", "$$user_row_id"] },
                                            { $eq: ["$contest_row_id", "$$contest_row_id"] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$winner_user", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests_winners",
                        localField: "contest_row_id",
                        foreignField: "contest_row_id",
                        as: "winner_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    winning_position: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        email_id: "$user_info.email_id",
                        contest_title: "$contest_info.title",
                        completed_status: "$contest_info.completed_status",
                        total_winners: { $size: "$winner_info" },
                        winner_user_status: { $cond: { if: "$winner_user.user_row_id", then: true, else: false } }
                    }
                },
                {
                    $match: filter_query
                },
                {
                    $count: "count"
                }
            ])

            let total_count = 0
            if (count_query[0]) {
                total_count = count_query[0].count
            }

            res.json({
                status: true,
                message: get_query,
                count: total_count
            })

        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Participated users list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.get('/participated_details/:participated_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const participated_row_id = Number.parseInt(req.params.participated_row_id)
            const get_query = await started_detailsM.aggregate([

                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
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
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    email_id: 1,
                                    wallet_address: 1,
                                    mobile_number: 1,
                                    profile_image: "$img_info.profile_image",
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests_winners",
                        localField: "_id",
                        foreignField: "participated_row_id",
                        as: "winner_info"
                    }
                },
                {
                    $unwind: { path: "$winner_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup: {
                        from: "cln_main_weekly_contests_winners",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "winner_user"
                    }
                },
                {
                    $unwind: { path: "$winner_user", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: {
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        email_id: "$user_info.email_id",
                        mobile_number: "$user_info.mobile_number",
                        contest_title: "$contest_info.title",
                        completed_status: "$contest_info.completed_status",
                        winner_user_status: { $cond: { if: "$winner_user.user_row_id", then: true, else: false } }
                    }
                },
                {
                    $match: { contest_status: 1, _id: participated_row_id }
                },
                {
                    $project: {
                        _id: 1,
                        contest_score: 1,
                        date_n_time: 1,
                        contest_status: 1,
                        user_row_id: 1,
                        contest_row_id: 1,
                        full_name: 1,
                        user_name: 1,
                        email_id: 1,
                        mobile_number: 1,
                        time_duration: 1,
                        winner_user_status: 1,
                        profile_image: "$user_info.profile_image",
                        wallet_address: "$user_info.wallet_address",
                        contest_title: 1,
                        winning_position: "$winner_info.winning_position",
                        winner_reward_value: "$winner_info.reward_value",
                        winner_deposited_address: "$winner_info.deposited_address",
                        winner_trans_hash: "$winner_info.trans_hash",
                        winner_status: "$winner_info.winner_status",
                        winner_date_n_time: "$winner_info.date_n_time",
                        description: "$contest_info.description",
                        contest_image: "$contest_info.contest_image",
                        start_date: "$contest_info.start_date",
                        end_date: "$contest_info.end_date"
                    }
                }
            ]).limit(1)

            if (get_query[0]) {
                res.json({
                    status: true,
                    message: get_query[0]
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid participated row id." }
                })

            }


        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }

    }
    catch (err) {
        console.log('Participated details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.post('/save_n_select_winner', [
    check('participated_row_id')
        .trim().not().isEmpty().withMessage('The Participated Row ID field is required'),
    check('winning_position')
        .trim().not().isEmpty().withMessage('The Winning position field is required.')
        .isInt({ min: 1, max: 3 }).withMessage('The Winning position field must be contain only integer values.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [13])
        if (checkAdminToken.status) {

            const participated_row_id = Number.parseInt(req.body.participated_row_id)
            if (Number.isNaN(participated_row_id)) {
                errObj['participated_row_id'] = "Sorry, Invalid participated row id."
            }

            const check_date_query = await winnersM.findOne({}, { _id: 1, date_n_time: 1 }).sort({ _id: -1 })
            if (check_date_query) {
                const present_time = getPresentDateTime()
                const added_time = addFiveMinutesToTime(check_date_query.date_n_time)

                if (new Date(added_time) > new Date(present_time)) {
                    errObj['alert_message'] = "Place your next contest winner request after 5 minutes."
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_query = await started_detailsM.aggregate([
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "user_row_id",
                            foreignField: "_id",
                            as: "user_info"
                        }
                    },
                    {
                        $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_main_weekly_contests",
                            localField: "contest_row_id",
                            foreignField: "_id",
                            as: "contest_info"
                        }
                    },
                    {
                        $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                    },
                    {
                        $match: { _id: participated_row_id, contest_status: 1 }
                    },
                    {
                        $project: {
                            _id: 1,
                            contest_score: 1,
                            date_n_time: 1,
                            contest_status: 1,
                            user_row_id: 1,
                            contest_row_id: 1,
                            full_name: "$user_info.full_name",
                            email_id: "$user_info.email_id",
                            wallet_address: "$user_info.wallet_address",
                            contest_title: "$contest_info.title",
                            contest_image: "$contest_info.contest_image",
                            start_date: "$contest_info.start_date",
                            end_date: "$contest_info.end_date"
                        }
                    }
                ]).limit(1)

                if (check_query[0]) {
                    let reward_value = 0
                    const contest_row_id = check_query[0].contest_row_id
                    const user_row_id = check_query[0].user_row_id

                    const winning_position = Number.parseInt(req.body.winning_position)
                    if (winning_position === 1) {
                        reward_value = first_position
                    }
                    else if (winning_position === 2) {
                        reward_value = second_position
                    }
                    else if (winning_position === 3) {
                        reward_value = third_position
                    }

                    const check_winner_query = await winnersM.findOne({ contest_row_id: contest_row_id, winning_position: winning_position })
                    if (!check_winner_query) {
                        const full_name = check_query[0].full_name
                        const contest_title = check_query[0].contest_title
                        const email_id = check_query[0].email_id
                        const wallet_address = check_query[0].wallet_address

                        const insert_array = {
                            participated_row_id: participated_row_id,
                            user_row_id: user_row_id,
                            contest_row_id: contest_row_id,
                            reward_value: reward_value,
                            winning_position: winning_position,
                            winner_status: 0,
                            date_n_time: getPresentDateTime()
                        }
                        const insert_query = await winnersM(insert_array).save()

                        const total_winner_counts = await winnersM.countDocuments({ contest_row_id: contest_row_id })
                        if (total_winner_counts >= 3) {
                            await weekly_contestsM.updateOne({ _id: contest_row_id }, { $set: { completed_status: 1 } })
                        }

                        await updateNotification({
                            user_row_id: 0,
                            notify_type: 6,
                            notify_type_row_id: contest_row_id,
                            message_row_id: 107,
                            action_row_id: insert_query._id
                        })

                        await updateNotification({
                            user_row_id: user_row_id,
                            notify_type: 6,
                            notify_type_row_id: contest_row_id,
                            message_row_id: 106,
                            action_row_id: insert_query._id
                        })

                        await sendEmailToWinner({ email_id, full_name, contest_title, winning_position, reward_value, wallet_address })

                        res.json({ status: true, message: { alert_message: "This contest winner has been selected successfully." } })
                    }
                    else {
                        let win_position_content = ""
                        if (winning_position === 1) {
                            win_position_content = "1st Winner"
                        }
                        else if (winning_position === 2) {
                            win_position_content = "Runner-Up"
                        }
                        else if (winning_position === 3) {
                            win_position_content = "2nd Runner-Up"
                        }

                        res.json({ status: false, message: { alert_message: "Sorry!, The Contest Winner for " + win_position_content + " position is already exist." } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Participated User ID." } })
                }
            }
        }
        else {
            res.json(checkAdminToken)
        }
    }
    catch (err) {
        console.log('Save and select winner.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

const sendEmailToWinner = async ({ email_id, full_name, contest_title, winning_position, reward_value, wallet_address }) => {
    let win_position_content = ""
    if (winning_position === 1) {
        win_position_content = "1st Winner"
    }
    else if (winning_position === 2) {
        win_position_content = "Runner-Up"
    }
    else if (winning_position === 3) {
        win_position_content = "2nd Runner-Up"
    }

    let wallet_address_content = ''
    if (!wallet_address) {
        wallet_address_content = `<p>To claim the reward, it's important that you have a fully completed profile and have successfully linked your wallet to your Coinpedia profile.</p>`
    }

    let pass_subject = `Congratulations, you have been selected for weekly ${contest_title} contest as the ` + win_position_content
    let header_profile_section = `Congratulations on winning the reward for the weekly contest!.`

    const pass_message = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
            <h3 style="text-transform: capitalize;">Hello ${full_name},</h3>
            <p>We are thrilled to inform you that your outstanding performance in the recent Coinpedia weekly  ${contest_title} contest has earned you the prestigious title of ${win_position_content}.</p>
            <p>To acknowledge your excellent skills and hard work, we're giving you a $${reward_value} prize worth of BNB Token.</p>
            <p>We appreciate your participation and look forward to seeing your continued enthusiasm in our future contests.</p>
            ${wallet_address_content}
            <br/>
            <p style='margin-bottom: 0;padding-bottom: 5px;'>Best regards,</p>
            <p style='margin-top: 0;padding-top: 0;'>Team Coinpedia</p>
    </div>`

    await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)
}

router.post('/update_payment_details', [
    check('trans_hash')
        .trim().not().isEmpty().withMessage('The Trans Hash field is required')
        .isLength({ min: 4 }).withMessage('The Trans Hash field must be at least 4 characters.'),
    check('winner_row_id')
        .trim().not().isEmpty().withMessage('The Winner Row ID field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [13])
        if (checkAdminToken.status) {
            const winner_row_id = Number.parseInt(req.body.winner_row_id)
            if (Number.isNaN(winner_row_id)) {
                errObj['winner_row_id'] = "Sorry, Invalid Winner Row ID."
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_winner_query = await winnersM.findOne({ _id: winner_row_id, winner_status: 0 })
                if (check_winner_query) {
                    const user_query = await professionalsM.findOne({ _id: check_winner_query.user_row_id }, { _id: 1, email_id: 1, full_name: 1, wallet_address: 1 })
                    const deposited_address = user_query.wallet_address

                    const weekly_contests_query = await weekly_contestsM.findOne({ _id: check_winner_query.contest_row_id }, { _id: 1, title: 1 })


                    const update_array = {
                        trans_hash: req.body.trans_hash,
                        deposited_address: deposited_address,
                        winner_status: 1
                    }

                    await winnersM.updateOne({ _id: winner_row_id }, { $set: update_array })

                    await sendPaymentEmailToWinner({
                        email_id: user_query.email_id,
                        full_name: user_query.full_name,
                        contest_title: weekly_contests_query.title,
                        trans_hash: req.body.trans_hash,
                        winning_position: check_winner_query.winning_position,
                        reward_value: check_winner_query.reward_value
                    })

                    res.json({ status: true, message: { alert_message: "This winner payment details has been updated successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "The contest winner for this position is already exist." } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Update payment details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

const sendPaymentEmailToWinner = async ({ email_id, full_name, contest_title, winning_position, reward_value, trans_hash }) => {
    let win_position_content = ""
    if (winning_position === 1) {
        win_position_content = "1st Winner"
    }
    else if (winning_position === 2) {
        win_position_content = "Runner Up"
    }
    else if (winning_position === 3) {
        win_position_content = "2nd Runner Up"
    }

    let pass_subject = `You Have Won $${reward_value} as the Reward for Thriving in the Coinpedia Weekly Contest!`
    let header_profile_section = `Congratulations on Receiving Your Much-Deserved Crypto Reward!`

    const pass_message = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
            <h3 style="text-transform: capitalize;">Hello ${full_name},</h3>
            <p>Your outstanding performance in the Weekly ${contest_title} Contest has rewarded you with the honorable title of the contest ${win_position_content}</p>
            <p>To acknowledge your immense crypto knowledge and diligence, we have awarded you with $${reward_value} worth of BNB Token.</p>
            <p>Please find the details here: <a href="https://bscscan.com/tx/${trans_hash}">Transaction Hash.<a/></p>
            <p>We value your participation and look forward to celebrating more crypto victories with you!</p>
            <br/>
            <p style='margin-bottom: 0;padding-bottom: 5px;'>Best regards,</p>
            <p style='margin-top: 0;padding-top: 0;'>Team Coinpedia</p>
    </div>`

    await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)
}


router.get('/winner_list/:skip/:limit', async (req, res) => {
    try {

        const checkToken = checkAdminLoginToken(req.headers, [13])
        if (checkToken.status) {
            const skip = Number.parseInt(req.params.skip)
            const limit = Number.parseInt(req.params.limit)
            let query = []
            if (req.query.search) {
                query.push({
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { user_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { contest_title: { '$regex': req.query.search, $options: 'i' } }
                    ]
                })
            }

            let filter_query = {}
            if (query.length > 0) {
                filter_query = { $and: query }
            }

            const get_query = await winnersM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
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
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    email_id: 1,
                                    wallet_address: 1,
                                    profile_image: "$img_info.profile_image",
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests_started_details",
                        localField: "participated_row_id",
                        foreignField: "_id",
                        as: "participated_info",
                        pipeline: [
                            {
                                $project: {
                                    contest_score: 1,
                                    date_n_time: 1,
                                    contest_status: 1,
                                    user_row_id: 1,
                                    contest_row_id: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: { path: "$participated_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: {
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        email_id: "$user_info.email_id",
                        wallet_address: "$user_info.wallet_address",
                        contest_title: "$contest_info.title",
                    }
                },
                {
                    $match: filter_query
                },
                {
                    $sort: {
                        _id: -1
                    }
                },
                {
                    $project: {
                        _id: 1,
                        participated_row_id: 1,
                        user_row_id: 1,
                        reward_value: 1,
                        winning_position: 1,
                        date_n_time: 1,
                        full_name: 1,
                        user_name: 1,
                        email_id: 1,
                        contest_title: 1,
                        wallet_address: 1,
                        winner_status: 1,
                        deposited_address: 1,
                        trans_hash: 1,
                        profile_image: "$user_info.profile_image",
                        contest_image: "$contest_info.contest_image",
                        start_date: "$contest_info.start_date",
                        end_date: "$contest_info.end_date"
                    }
                }
            ]).skip(skip).limit(limit)

            const count_query = await winnersM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                {
                    $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup:
                    {
                        from: "cln_main_weekly_contests",
                        localField: "contest_row_id",
                        foreignField: "_id",
                        as: "contest_info"
                    }
                },
                {
                    $unwind: { path: "$contest_info", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: {
                        full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        email_id: "$user_info.email_id",
                        contest_title: "$contest_info.title",
                        wallet_address: "$user_info.wallet_address"
                    }
                },
                {
                    $match: filter_query
                },
                {
                    $count: "count"
                }
            ])

            let total_count = 0
            if (count_query[0]) {
                total_count = count_query[0].count
            }

            res.json({
                status: true,
                message: get_query,
                count: total_count
            })

        }
        else {
            res.json({
                status: false,
                message: { alert_message: checkToken.message }
            })
        }
    }
    catch (err) {
        console.log('Winner list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/delete_selected_winner_details', [
    check('winner_row_id')
        .trim().not().isEmpty().withMessage('The Winner Row ID field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [13])
        if (checkAdminToken.status) {
            const winner_row_id = Number.parseInt(req.body.winner_row_id)
            if (Number.isNaN(winner_row_id)) {
                errObj['winner_row_id'] = "Sorry, Invalid Winner Row ID."
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_winner_query = await winnersM.findOne({ _id: winner_row_id })
                if (check_winner_query) {
                    const contest_row_id = check_winner_query.contest_row_id
                    await weekly_contestsM.updateOne({ _id: contest_row_id }, { $set: { completed_status: 0 } })
                    await winnersM.deleteOne({ _id: winner_row_id })
                    res.json({ status: true, message: { alert_message: "This Winner details has been removed successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid Winner Row ID." } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Delete selected winner details .', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




module.exports = router