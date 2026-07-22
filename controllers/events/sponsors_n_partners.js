const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')

const { getPresentDateTime, arrangeValidation } = require('../../utils/helpers/helper')
const { checkAllLoginToken } = require('../../middleware/authorization')
const { DateFormatter, checkEventRowID, checkSubadminAccess, deleteSponsorsPartners } = require('../../utils/helpers/events_helper')
const { updateNotification } = require('../../utils/helpers/notification_helper')
const { sendEventsEmail } = require('../../config/email')

const event_utc_datesM = require('../../models/app/events/event_utc_datesM')
const professionalsM = require('../../models/app/professionalsM')
const professionals_manual_retrievalsM = require('../../models/app/users/professionals_manual_retrievalsM')
const companyM = require('../../models/app/company/companyM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const eventM = require('../../models/app/events/eventM')
const { setCache, getCache, deleteKeysByPattern } = require('../../config/cache_helper')
const { calculateEventScore } = require('../../utils/helpers/app_helper')
const { getPositionResolutionStages } = require('../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../modules/funding/funding.queries')

/**
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `outer_info_work` lookup inside GET /individual_details/:sponsor_partner_row_id.
 * Resolves position name(s) via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions), joined
 * into a single display string via joinPositionNamesExpr, instead of the previous
 * static-only lookup. Downstream, the outer pipeline's final $project still reads
 * `sp_user_position_name` from `$outer_info_work.position_name` — unchanged shape.
 * `{ $limit: 1 }` kept in its original position: after the position lookup/unwind,
 * before the company lookups.
 */
function buildOuterInfoWorkPipeline() {
    return [
        {
            $match: {
                $and: [
                    { user_row_id: { $nin: ["", null] } },
                    {
                        $expr: {
                            $and: [
                                { $eq: [1, '$$account_type'] },
                                { $eq: ['$user_account_type', '$$registered_type'] },
                                { $eq: ['$user_row_id', '$$user_company_row_id'] },
                            ]
                        }
                    }
                ]
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
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `info_work` lookup inside `user_info` (registered professionals, account_type 1)
 * in GET /list/:event_row_id/:skip/:limit. Resolves position name(s) via
 * getPositionResolutionStages() + joinPositionNamesExpr, instead of the previous
 * static-only lookup. Downstream, the outer $project of this same nested user_info
 * pipeline still reads `position_name: "$info_work.position_name"` — unchanged
 * shape. `{ $limit: 1 }` kept in its original position: after the position
 * lookup/unwind, before the company lookups.
 */
function buildRegisteredUserInfoWorkPipeline() {
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
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `info_work` lookup inside `user_manual_info` (manually-entered professionals,
 * account_type 2) in GET /list/:event_row_id/:skip/:limit. Resolves position
 * name(s) via getPositionResolutionStages() + joinPositionNamesExpr, instead of
 * the previous static-only lookup. Downstream, the outer $project of this same
 * nested user_manual_info pipeline still reads `position_name:
 * "$info_work.position_name"` — unchanged shape. Deliberately kept as its own,
 * separate function from buildRegisteredUserInfoWorkPipeline (not merged) even
 * though the two pipelines are structurally similar, since they resolve different
 * account types and have a real pre-existing difference: here `{ $match }` is
 * immediately followed by `{ $limit: 1 }` BEFORE the position lookup (not after,
 * as in the registered-user version) — preserved exactly, not "fixed".
 */
function buildManualUserInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 2 } },
        { $limit: 1 },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
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

router.post('/update_sponsors_partners', [
    check('event_row_id')
        .trim().not().isEmpty().withMessage('The Event Row ID field is required.'),
    check('sponsor_partner_type')
        .trim().not().isEmpty().withMessage('The Sponsor or partner Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Sponsor or partner Type field must be contains 1 or 2.'),
    check('account_type')
        .if((edit_sponsor_partner_row_id, { req }) => { return !req.body.edit_sponsor_partner_row_id })
        .trim().not().isEmpty().withMessage('The Account Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Account Type field must be contains 1 or 2.'),
    check('registered_type')
        .if((edit_sponsor_partner_row_id, { req }) => { return !req.body.edit_sponsor_partner_row_id })
        .trim().not().isEmpty().withMessage('The Registered Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Registered Type field must be contains 1 or 2.'),
    check('user_company_row_id')
        .if((edit_sponsor_partner_row_id, { req }) => { return !req.body.edit_sponsor_partner_row_id })
        .trim().not().isEmpty().withMessage('The Sponsor or Partner row id field is required.'),
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            let host_user_row_id = 0
            let company_listed_user_row_id = 0
            let event_row_id = 0
            let sponsor_partner_type = 0 // 1. Sponsor  2. Partner
            let account_type = 0
            let registered_type = 0
            let user_company_row_id = 0
            let edit_sponsor_partner_row_id = 0

            const token_message = checkUserToken.token_message
            if (token_message.admin_row_id) {
                const check_access = await checkSubadminAccess({
                    admin_row_id: Number.parseInt(token_message.admin_row_id),
                    admin_manager_type: token_message.admin_manager_type,
                    sub_admin_type: Number.parseInt(token_message.sub_admin_type),
                    event_row_id: Number.parseInt(req.body.event_row_id)
                })

                if (!check_access.status) {
                    errObj['alert_message'] = check_access.message
                }
            }

            if (!Number.isNaN(Number.parseInt(req.body.event_row_id))) {
                event_row_id = Number.parseInt(req.body.event_row_id)
            }

            if (!Number.isNaN(Number.parseInt(req.body.sponsor_partner_type))) {
                sponsor_partner_type = Number.parseInt(req.body.sponsor_partner_type)
            }

            if (!Number.isNaN(Number.parseInt(req.body.account_type))) {
                account_type = Number.parseInt(req.body.account_type)
            }

            if (!Number.isNaN(Number.parseInt(req.body.registered_type))) {
                registered_type = Number.parseInt(req.body.registered_type)
            }

            if (!Number.isNaN(Number.parseInt(req.body.user_company_row_id))) {
                user_company_row_id = Number.parseInt(req.body.user_company_row_id)
            }



            let email_id = ""
            let event_host_name = ""
            let event_event_venue = ""
            let start_date = ""
            let event_title = ""
            let event_url = ""
            let utc_row_id = ""
            let sender_full_name = ''
            let sender_email_id = ''

            if (event_row_id && sponsor_partner_type) {
                if (checkUserToken.message.user_type == 1) {
                    host_user_row_id = checkUserToken.message.user_row_id
                }

                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })
                if (!check_event_res.status) {
                    errObj['event_row_id'] = check_event_res.message.alert_message
                }
                else {
                    event_event_venue = check_event_res.message.event_venue
                    start_date = check_event_res.message.start_date
                    event_title = check_event_res.message.event_title
                    event_url = check_event_res.message.event_url
                    utc_row_id = check_event_res.message.utc_row_id
                    event_host_name = check_event_res.message.event_host_name

                    if (req.body.edit_sponsor_partner_row_id) {
                        if (!Number.isNaN(Number.parseInt(req.body.edit_sponsor_partner_row_id))) {
                            edit_sponsor_partner_row_id = Number.parseInt(req.body.edit_sponsor_partner_row_id)
                            const check_query = await event_sponsors_partner_detailsM.findOne({ _id: edit_sponsor_partner_row_id, event_row_id: event_row_id }, { _id: 1 })
                            if (!check_query) {
                                errObj['edit_sponsor_partner_row_id'] = 'The Edit Sponsor or Partner row id field is invalid.'
                            }
                        }
                    }
                }



                if (!edit_sponsor_partner_row_id) {
                    if (account_type && registered_type && user_company_row_id) {
                        //account_type :  1. User  2. Company
                        if (account_type == 1) {
                            //registered_type : 1. Registerd  2. Manual
                            if (registered_type == 1) {
                                const check_user_query = await professionalsM.findOne({ _id: user_company_row_id, login_status: 1 })
                                if (!check_user_query) {
                                    errObj['user_company_row_id'] = 'The user or company row id field is invalid.'
                                }
                                else {
                                    sender_full_name = check_user_query.full_name
                                    sender_email_id = check_user_query.email_id
                                }
                            }
                            else {
                                const check_user_query = await professionals_manual_retrievalsM.findOne({ _id: user_company_row_id })
                                if (!check_user_query) {
                                    errObj['user_company_row_id'] = 'The user or company row id field is invalid.'
                                }
                                else {
                                    sender_full_name = check_user_query.full_name
                                    sender_email_id = check_user_query.email_id
                                }
                            }
                        }
                        else if (registered_type == 1) {
                            const check_company_query = await companyM.findOne({ _id: user_company_row_id, active_status: 1 })
                            if (!check_company_query) {
                                errObj['user_company_row_id'] = 'The user or company row id field is invalid.'
                            }
                            else if (check_company_query.user_row_id) {
                                sender_full_name = check_company_query.company_name
                                sender_email_id = check_company_query.company_email_id
                            }
                        }
                        else {
                            const check_company_query = await company_manual_retrievalsM.findOne({ _id: user_company_row_id })
                            if (!check_company_query) {
                                errObj['user_company_row_id'] = 'The user or company row id field is invalid.'
                            }
                        }

                        const check_exist_query = await event_sponsors_partner_detailsM.findOne({
                            event_row_id: event_row_id,
                            sponsor_partner_type: sponsor_partner_type,
                            account_type: account_type,
                            registered_type: registered_type,
                            user_company_row_id: user_company_row_id
                        }, { _id: 1 })
                        if (check_exist_query) {
                            errObj['user_company_row_id'] = 'This user or company row id is already exists.'
                        }
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {


                const insert_array = {}
                insert_array['sponsor_partner_type'] = sponsor_partner_type
                insert_array['sponsorship_type_title'] = sponsor_partner_type == 1 ? req.body.sponsorship_type_title : ""

                if (!Number.isNaN(Number.parseInt(req.body.category_row_id))) {
                    insert_array['category_row_id'] = req.body.category_row_id
                }

                if (!edit_sponsor_partner_row_id) {
                    insert_array['account_type'] = account_type
                    insert_array['registered_type'] = registered_type
                    insert_array['user_company_row_id'] = user_company_row_id

                    insert_array['event_row_id'] = event_row_id
                    insert_array['created_date_n_time'] = getPresentDateTime()

                    const insert_query = await event_sponsors_partner_detailsM(insert_array).save()
                    await deleteKeysByPattern('event_sponsor_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')

                    await calculateEventScore(event_row_id, ['sponsors_partners'])

                    // 1.Sponsor  2.Partner
                    // registered_type : 1.Registerd 
                    if ((registered_type == 1)) {
                        if (account_type == 1) {
                            let message_row_id = 0
                            if (sponsor_partner_type == 1) {
                                message_row_id = 59 //sponsor
                            }
                            else {
                                message_row_id = 60 //partner
                            }
                            await updateNotification({
                                user_row_id: user_company_row_id,
                                notify_type: 3,
                                notify_type_row_id: event_row_id,
                                message_row_id: message_row_id,
                                action_row_id: event_row_id
                            })
                        }
                        else if ((account_type == 2) && company_listed_user_row_id) {

                            let message_row_id = 0
                            if (sponsor_partner_type == 1) {
                                message_row_id = 68 //sponsor
                            }
                            else {
                                message_row_id = 69 //partner
                            }

                            await updateNotification({
                                user_row_id: company_listed_user_row_id,
                                notify_type: 3,
                                notify_type_row_id: event_row_id,
                                message_row_id: message_row_id,
                                action_row_id: event_row_id
                            })
                        }


                        //email
                        if (sender_email_id && sender_full_name && event_title) {
                            const get_utc_time = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1 })
                            let start_date_formatted = DateFormatter(start_date)

                            let pass_subject = `You’re Added as a ${(sponsor_partner_type == 1 ? ' Sponsor ' : ' Partner ')} | ${event_title}`
                            let invite_req_url = "https://events.coinpedia.org/" + event_url
                            let message_to_pass = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${sender_full_name},</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">
                                We are excited to announce that ${account_type == 2 ? 'your company has been ' : 'you have been '} added as a ${(sponsor_partner_type == 1 ? ' sponsor ' : ' partner ')} for <b>${event_title}</b>.
                            </p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Event Details</b></p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Event Link : <a href="${invite_req_url}">view</a></p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Event Host : ${event_host_name}</p>
                            ${event_event_venue ?
                                    `<p style="color:#000;font-weight: 400;font-size:17px;">Event Location: <b>${event_event_venue}</b></p>`
                                    :
                                    ''
                                }
                            <p style="color:#000;font-weight: 400;font-size:17px;">Event Date : <b>${start_date_formatted} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ""}</b></p>
                            
                            
                            `
                            await sendEventsEmail(sender_email_id, pass_subject, message_to_pass, "", event_row_id)

                        }
                        //email code ends here
                    }


                    // let sender_full_name = ''
                    // let sender_email_id = ''


                    // registered_type
                    // user_company_row_id


                    insert_array['_id'] = insert_query._id
                    insert_array['alert_message'] = 'Congratulations!  Your ' + (sponsor_partner_type == 1 ? ' sponsor ' : ' partner ') + ' details have been successfully added!'

                    await deleteKeysByPattern('all_events_*')
                    res.json({ status: true, message: insert_array })
                }
                else {

                    await event_sponsors_partner_detailsM.updateOne({ _id: edit_sponsor_partner_row_id }, { $set: insert_array })
                    await deleteKeysByPattern('event_sponsor_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('all_events_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')

                    res.json({ status: true, message: { alert_message: 'Your ' + (sponsor_partner_type == 1 ? ' sponsor ' : ' partner ') + ' details have been successfully updated. Thank you for keeping your information current!', token_message } })

                }
            }
        }
        catch (err) {
            console.log('Update sponsor partner details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})

router.get('/individual_details/:sponsor_partner_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (checkUserToken.status) {
            const sponsor_partner_row_id = Number.parseInt(req.params.sponsor_partner_row_id)
            if (!Number.isNaN(sponsor_partner_row_id)) {
                const get_query = await event_sponsors_partner_detailsM.aggregate([
                    { $match: { _id: sponsor_partner_row_id } },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_sponsor_categories",
                            let: {
                                sponsor_partner_type: '$sponsor_partner_type',
                                category_row_id: '$category_row_id'
                            },
                            as: "info_sponsor_category",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$sponsor_partner_type'] },
                                                { $eq: ['$_id', '$$category_row_id'] },
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        sponsorship_name: 1,
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_sponsor_category", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_partner_categories",
                            let: {
                                sponsor_partner_type: '$sponsor_partner_type',
                                category_row_id: '$category_row_id'
                            },
                            as: "info_partner_category",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$sponsor_partner_type'] },
                                                { $eq: ['$_id', '$$category_row_id'] },
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        partnership_name: 1,
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_partner_category", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$account_type'] },
                                                        { $eq: [1, '$$registered_type'] },
                                                        { $eq: ['$_id', '$$user_company_row_id'] },
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
                                        profile_image: "$img_info.profile_image",
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
                        $lookup:
                        {
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$account_type'] },
                                                { $eq: [2, '$$registered_type'] },
                                                { $eq: ['$_id', '$$user_company_row_id'] },
                                            ]
                                        }
                                    },
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        gender: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        profile_image: 1
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
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, '$$account_type'] },
                                                        { $eq: [1, "$$registered_type"] },
                                                        { $eq: ['$_id', "$$user_company_row_id"] }
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
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$account_type'] },
                                                { $eq: [2, "$$registered_type"] },
                                                { $eq: ['$_id', "$$user_company_row_id"] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_work_experiences",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "outer_info_work",
                            pipeline: buildOuterInfoWorkPipeline(),
                        }
                    },
                    { $unwind: { path: "$outer_info_work", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            sp_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 1] },
                                                    { $eq: ['$registered_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 1] },
                                                    { $eq: ['$registered_type', 2] }
                                                ]
                                            },
                                            then: "$user_manual_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 2] },
                                                    { $eq: ['$registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 2] },
                                                    { $eq: ['$registered_type', 2] }
                                                ]
                                            },
                                            then: "$company_manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match:
                        {
                            sp_data: { $nin: ["", null] },
                        }
                    },
                    {
                        $project:
                        {
                            event_row_id: 1,
                            category_row_id: 1,
                            sponsor_partner_type: 1,
                            account_type: 1,
                            registered_type: 1,
                            user_company_row_id: 1,
                            sponsorship_type_title: 1,
                            manual_type: 1,
                            created_date_n_time: 1,
                            sponsor_category_name: "$info_sponsor_category.sponsorship_name",
                            partner_category_name: "$info_partner_category.partnership_name",
                            sp_user_position_name: { $cond: { if: "$outer_info_work.position_name", then: "$outer_info_work.position_name", else: "" } },
                            sp_user_company_name: { $cond: { if: "$outer_info_work.company_name", then: "$outer_info_work.company_name", else: "" } },
                            sp_image: { $cond: { if: "$sp_data.profile_image", then: "$sp_data.profile_image", else: "$sp_data.company_logo" } },
                            sp_name: { $cond: { if: "$sp_data.full_name", then: "$sp_data.full_name", else: "$sp_data.company_name" } },
                            sp_pro_batch: { $cond: { if: "$sp_data.pro_batch", then: "$sp_data.pro_batch", else: '' } },
                            sp_email_id: { $cond: { if: "$sp_data.email_id", then: "$sp_data.email_id", else: "$sp_data.company_email_id" } },
                            sp_link: { $cond: { if: "$sp_data.website_link", then: "$sp_data.website_link", else: "" } },
                        }
                    }
                ]).limit(1)

                if (get_query[0]) {


                    res.json({ status: true, message: get_query[0] })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid edit row ID' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid edit row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Individual sponsor partner details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/list/:event_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            let host_user_row_id = 0
            let event_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                host_user_row_id = checkUserToken.message.user_row_id
            }

            if (Number.isNaN(Number.parseInt(req.params.event_row_id))) {
                errObj['event_row_id'] = 'The event row id field must be contain valid number.'
            }
            else {
                event_row_id = Number.parseInt(req.params.event_row_id)
            }

            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            if (event_row_id) {
                const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })
                if (!check_event_res.status) {
                    errObj['event_row_id'] = check_event_res.message.alert_message
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)
                const cacheKey = `event_sponsor_list_${event_row_id}_${skip}_${limit}_${req.query.sponsor_partner_type || 'all'}`

                // ✅ Check cache
                const cache_response = await getCache({ key: cacheKey })
                if (cache_response.status && Array.isArray(cache_response.message)) {
                    return res.json({
                        status: true,
                        message: cache_response.message,
                        cache_response_status: true
                    })
                }
                let query = [{ event_row_id: event_row_id }]
                if (!Number.isNaN(Number.parseInt(req.query.sponsor_partner_type))) {
                    query.push({ sponsor_partner_type: Number.parseInt(req.query.sponsor_partner_type) })
                }

                const get_query = await event_sponsors_partner_detailsM.aggregate([
                    {
                        $sort: {
                            _id: -1
                        }
                    },
                    { $match: { $and: query } },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_sponsor_categories",
                            let: {
                                sponsor_partner_type: '$sponsor_partner_type',
                                category_row_id: '$category_row_id'
                            },
                            as: "info_sponsor_category",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$sponsor_partner_type'] },
                                                { $eq: ['$_id', '$$category_row_id'] },
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        sponsorship_name: 1,
                                    }
                                }
                            ]
                        }
                    },

                    { $unwind: { path: "$info_sponsor_category", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_static_event_partner_categories",
                            let: {
                                sponsor_partner_type: '$sponsor_partner_type',
                                category_row_id: '$category_row_id'
                            },
                            as: "info_partner_category",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$sponsor_partner_type'] },
                                                { $eq: ['$_id', '$$category_row_id'] },
                                            ]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        partnership_name: 1,
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_partner_category", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$account_type'] },
                                                        { $eq: [1, '$$registered_type'] },
                                                        { $eq: ['$_id', '$$user_company_row_id'] },
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
                                        pipeline: buildRegisteredUserInfoWorkPipeline(),
                                        as: "info_work",
                                    }
                                },
                                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        _id: 1,
                                        user_name: 1,
                                        pro_batch: 1,
                                        profile_image: "$img_info.profile_image",
                                        position_name: "$info_work.position_name",
                                        company_name: "$info_work.company_name",
                                        full_name: 1,
                                        email_id: 1,
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
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$account_type'] },
                                                { $eq: [2, '$$registered_type'] },
                                                { $eq: ['$_id', '$$user_company_row_id'] },
                                            ]
                                        }
                                    },
                                },
                                {
                                    $lookup:
                                    {
                                        from: "cln_professionals_work_experiences",
                                        localField: "_id",
                                        foreignField: "user_row_id",
                                        as: "info_work",
                                        pipeline: buildManualUserInfoWorkPipeline(),

                                    }
                                },
                                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                                {
                                    $project: {
                                        _id: 1,
                                        gender: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        profile_image: 1,
                                        position_name: "$info_work.position_name",
                                        company_name: "$info_work.company_name"
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
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, '$$account_type'] },
                                                        { $eq: [1, "$$registered_type"] },
                                                        { $eq: ['$_id', "$$user_company_row_id"] }
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
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$account_type'] },
                                                { $eq: [2, "$$registered_type"] },
                                                { $eq: ['$_id', "$$user_company_row_id"] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            sp_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 1] },
                                                    { $eq: ['$registered_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 1] },
                                                    { $eq: ['$registered_type', 2] }
                                                ]
                                            },
                                            then: "$user_manual_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 2] },
                                                    { $eq: ['$registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 2] },
                                                    { $eq: ['$registered_type', 2] }
                                                ]
                                            },
                                            then: "$company_manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match:
                        {
                            sp_data: { $nin: ["", null] },
                        }
                    },
                    {
                        $project:
                        {
                            event_row_id: 1,
                            category_row_id: 1,
                            sponsor_partner_type: 1,
                            account_type: 1,
                            registered_type: 1,
                            user_company_row_id: 1,
                            sponsorship_type_title: 1,
                            info_sponsor_category: "$info_sponsor_category",
                            manual_type: 1,
                            created_date_n_time: 1,
                            requested_status: { $ifNull: ["$requested_status", 3] },
                            sponsor_category_name: "$info_sponsor_category.sponsorship_name",
                            partner_category_name: "$info_partner_category.partnership_name",
                            sp_user_position_name: { $cond: { if: "$user_info.position_name", then: "$user_info.position_name", else: "$user_manual_info.position_name" } },
                            sp_user_company_name: { $cond: { if: "$user_info.company_name", then: "$user_info.company_name", else: "$user_manual_info.company_name" } },
                            sp_image: { $cond: { if: "$sp_data.profile_image", then: "$sp_data.profile_image", else: "$sp_data.company_logo" } },
                            sp_name: { $cond: { if: "$sp_data.full_name", then: "$sp_data.full_name", else: "$sp_data.company_name" } },
                            sp_pro_batch: { $cond: { if: "$sp_data.pro_batch", then: "$sp_data.pro_batch", else: "" } },
                            sp_email_id: { $cond: { if: "$sp_data.email_id", then: "$sp_data.email_id", else: "$sp_data.company_email_id" } },
                            sp_link: { $cond: { if: "$sp_data.website_link", then: "$sp_data.website_link", else: "" } },
                        }
                    }
                ]).skip(skip).limit(limit)


                const count_query = await event_sponsors_partner_detailsM.aggregate([
                    { $match: { $and: query } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "user_info",
                            pipeline: [
                                {
                                    $match: {
                                        $and: [
                                            {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [1, '$$account_type'] },
                                                        { $eq: [1, '$$registered_type'] },
                                                        { $eq: ['$_id', '$$user_company_row_id'] },
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
                                        profile_image: "$img_info.profile_image",
                                        full_name: 1,
                                        email_id: 1,
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
                            from: "cln_professionals_manual_retrievals",
                            let: {
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "user_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$account_type'] },
                                                { $eq: [2, '$$registered_type'] },
                                                { $eq: ['$_id', '$$user_company_row_id'] },
                                            ]
                                        }
                                    },
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        gender: 1,
                                        full_name: 1,
                                        email_id: 1,
                                        profile_image: 1
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
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, '$$account_type'] },
                                                        { $eq: [1, "$$registered_type"] },
                                                        { $eq: ['$_id', "$$user_company_row_id"] }
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
                                account_type: '$account_type',
                                registered_type: '$registered_type',
                                user_company_row_id: '$user_company_row_id'
                            },
                            as: "company_manual_info",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: [2, '$$account_type'] },
                                                { $eq: [2, "$$registered_type"] },
                                                { $eq: ['$_id', "$$user_company_row_id"] }
                                            ]
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_manual_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            sp_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 1] },
                                                    { $eq: ['$registered_type', 1] }
                                                ]
                                            },
                                            then: "$user_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 1] },
                                                    { $eq: ['$registered_type', 2] }
                                                ]
                                            },
                                            then: "$user_manual_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 2] },
                                                    { $eq: ['$registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info"
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$account_type', 2] },
                                                    { $eq: ['$registered_type', 2] }
                                                ]
                                            },
                                            then: "$company_manual_info"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match:
                        {
                            sp_data: { $nin: ["", null] },
                        }
                    },
                    {
                        $count: "count"
                    }
                ])

                let count = 0
                if (count_query[0]) {
                    if (count_query[0].count) {
                        count = count_query[0].count
                    }
                }

                // res.json({ status: true, message: { data: get_query, count: count } })
                await setCache({
                    key: cacheKey,
                    value: { data: get_query, count },
                    ttl: 1800 // 30 minutes
                })

                res.json({
                    status: true,
                    message: { data: get_query, count },
                    cache_response_status: false
                })
            }

        }
        catch (err) {
            console.log('Sponsor partner list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})

router.post('/accept_sponsor_request', [
    check('request_id')
        .not().isEmpty().withMessage('The Request ID field is required.')
        .isInt().withMessage('The Request ID must contain only integers.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        if (!errors.isEmpty()) {
            return res.json({ status: false, message: errObj });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status)
            return res.json(checkUserToken);

        const request_id = Number.parseInt(req.body.request_id);
        if (Number.isNaN(request_id)) {
            return res.json({ status: false, message: { request_id: 'Invalid Request ID.' } });
        }

        const requestData = await event_sponsors_partner_detailsM.findOne({ _id: request_id });
        if (!requestData) {
            return res.json({ status: false, message: { request_id: 'Sponsor request not found.' } });
        }
        if (requestData.requested_status === 1) {
            return res.json({ status: false, message: { alert_message: 'This sponsor request is already accepted.' } });
        }

        await event_sponsors_partner_detailsM.updateOne(
            { _id: request_id },
            { $set: { requested_status: 1, created_date_n_time: new Date() } }
        );
        await deleteKeysByPattern('event_sponsor_list_*')
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('app_user_other_details_*')
        await deleteKeysByPattern('app_company_list_*')
        await deleteKeysByPattern('all_events_*')
        // ===== Send Email =====
        // Get required data: sponsor user, event, host
        const sponsorUserInfo = await professionalsM.findOne({ _id: requestData.user_company_row_id }, { full_name: 1, email_id: 1 });
        const eventInfo = await eventM.findOne({ _id: requestData.event_row_id }, {
            event_title: 1,
            event_url: 1,
            event_venue: 1,
            start_date: 1,
            event_type: 1,
            user_row_id: 1
        });

        let event_host_name = '';
        const check_event_res = await checkEventRowID({ event_row_id: requestData.event_row_id });
        if (check_event_res.status) {
            event_host_name = check_event_res.message.event_host_name || '';
        }

        const email_event_url = `https://events.coinpedia.org/${eventInfo.event_url}`;
        const eventName = eventInfo.event_title || '';
        const eventAddress = eventInfo.event_venue || '';
        const eventDateTime = eventInfo.start_date ? DateFormatter(eventInfo.start_date) : '[Event Date and Time]';
        const eventTypeMap = { 1: 'Seminar', 2: 'Webinar', 3: 'Hybrid' };
        const eventType = eventTypeMap[eventInfo.event_type] || '';

        const sponsorName = sponsorUserInfo?.full_name || 'Sponsor';
        const pass_email_id = sponsorUserInfo?.email_id || '';

        const pass_subject = 'Sponsorship Request Accepted!';
        const pass_message = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #28a745;"> Sponsorship Request Accepted!</h2>
             

                <p style="font-size: 17px;">Hello ${sponsorName},</p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Congratulations! We're thrilled to inform you that your sponsorship request for the event
                    <strong>${eventName}</strong>, happening at <strong>${eventAddress}</strong> on <strong>${eventDateTime}</strong>
                    and <strong>${eventType}</strong> has been successfully accepted by the event host <strong>${event_host_name}</strong>.
                </p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Together your expertise will be invaluable to the success of this event.
                    Thank you for being part of this exciting journey.
                </p>

                <div style="margin: 24px 0;">
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">Visit Now</a></p>
                    <p style="font-size: 12px; margin-top: 8px; color: #666;">This link will direct you to the event details page where the sponsors are added.</p>
                </div>

                <p style="font-size: 15px;">Thank you for Trusting us.<br><strong>Team CoinPedia</strong></p>
                <p style="font-size: 13px; color: #555;">For any queries <a href="mailto:support@coinpedia.org" style="color: #007bff;">Contact Us</a></p>
            </div>
        `;

        if (pass_email_id) {
            await sendEventsEmail(pass_email_id, pass_subject, pass_message);
        }
        else {
            return res.json({
                status: true,
                message: { alert_message: 'email  not sent' }
            });
        }

        return res.json({
            status: true,
            message: { alert_message: 'Sponsor request has been accepted and email sent successfully.' }
        });

    } catch (err) {
        console.log('Accept sponsor request error:', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});




router.post('/reject_sponsor_request', [
    check('request_id')
        .not().isEmpty().withMessage('The Request ID field is required.')
        .isInt().withMessage('The Request ID must contain only integers.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        if (!errors.isEmpty()) {
            return res.json({ status: false, message: errObj });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (!checkUserToken.status)
            return res.json(checkUserToken);

        const request_id = Number.parseInt(req.body.request_id);
        if (Number.isNaN(request_id)) {
            return res.json({ status: false, message: { request_id: 'Invalid Request ID.' } });
        }

        const requestData = await event_sponsors_partner_detailsM.findOne({ _id: request_id });
        if (!requestData) {
            return res.json({ status: false, message: { request_id: 'Sponsor request not found.' } });
        }

        if (requestData.requested_status === 2) {
            return res.json({ status: false, message: { alert_message: 'This sponsor request is already rejected.' } });
        }

        await event_sponsors_partner_detailsM.updateOne(
            { _id: request_id },
            { $set: { requested_status: 2, created_date_n_time: new Date() } }
        );
        await deleteKeysByPattern('event_sponsor_list_*')
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('all_events_*')
        await deleteKeysByPattern('app_user_other_details_*')
        // ===== Send Email =====
        // Get sponsor info robustly
        let sponsorUserInfo = {};
        if (requestData.account_type === 1) {
            sponsorUserInfo = await professionalsM.findOne({ _id: requestData.user_company_row_id }, { full_name: 1, email_id: 1 });
        } else if (requestData.account_type === 2) {
            sponsorUserInfo = await companyM.findOne({ _id: requestData.user_company_row_id }, { company_name: 1, company_email: 1 });
        } else if (requestData.registered_type === 2) {
            sponsorUserInfo = await manual_sponsorsM.findOne({ _id: requestData.user_company_row_id }, { full_name: 1, email_id: 1 });
        }

        const sponsorName = sponsorUserInfo?.full_name || sponsorUserInfo?.company_name || 'Sponsor';
        const pass_email_id = sponsorUserInfo?.email_id || sponsorUserInfo?.company_email || '';

        const eventInfo = await eventM.findOne({ _id: requestData.event_row_id }, {
            event_title: 1,
            event_url: 1,
            event_venue: 1,
            start_date: 1,
            event_type: 1,
            user_row_id: 1
        });

        let event_host_name = '';
        const check_event_res = await checkEventRowID({ event_row_id: requestData.event_row_id });
        if (check_event_res.status) {
            event_host_name = check_event_res.message.event_host_name || '';
        }

        const email_event_url = `https://events.coinpedia.org/${eventInfo.event_url}`;
        const eventName = eventInfo.event_title || '';
        const eventAddress = eventInfo.event_venue || '';
        const eventDateTime = eventInfo.start_date ? DateFormatter(eventInfo.start_date) : '[Event Date and Time]';
        const eventTypeMap = { 1: 'Seminar', 2: 'Webinar', 3: 'Hybrid' };
        const eventType = eventTypeMap[eventInfo.event_type] || '';

        const pass_subject = 'Sponsorship Request Rejected!';
        const pass_message = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #dc3545;"> Sponsorship Request Rejected!</h2>
           

                <p style="font-size: 17px;">Hello ${sponsorName},</p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Unfortunately, your sponsorship request for the event
                    <strong>${eventName}</strong>, happening at <strong>${eventAddress}</strong> on <strong>${eventDateTime}</strong>
                    and <strong>${eventType}</strong> has been rejected by the event host <strong>${event_host_name}</strong>.
                </p>

                <p style="font-size: 16px; line-height: 1.6;">
                    Thank you for your interest in having a sponsorship in this event. We genuinely value the effort and perspective you shared and hope you get potential opportunities together in the future.
                </p>

                <p style="font-size: 16px; line-height: 1.6;">
                    To offer a more comprehensive perspective, we also encourage you to consider inviting additional speakers.
                </p>

                <div style="margin: 24px 0;">
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="${email_event_url}" style="color:#0029ff;">Visit Now</a></p>
                    <p style="font-size: 12px; margin-top: 8px; color: #666;">This link will direct you to the event edit page where you can add other sponsors.</p>
                </div>

                <p style="font-size: 15px;">Thank you for Trusting us.<br><strong>Team CoinPedia</strong></p>
                <p style="font-size: 13px; color: #555;">For any queries <a href="mailto:support@coinpedia.org" style="color: #007bff;">Contact Us</a></p>
            </div>
        `;

        if (pass_email_id) {
            await sendEventsEmail(pass_email_id, pass_subject, pass_message);
        } else {
            return res.json({
                status: true,
                message: { alert_message: 'Sponsor request rejected but email not sent (email not found).' }
            });
        }

        return res.json({
            status: true,
            message: { alert_message: 'Sponsor request has been rejected and email sent successfully.' }
        });

    } catch (err) {
        console.log('Reject sponsor request error:', err.message);
        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});

router.get('/delete/:sponsor_partner_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (checkUserToken.status) {
        try {
            let host_user_row_id = 0
            let sponsor_partner_row_id = 0
            let sponsor_partner_type = 0
            let event_row_id = 0
            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                host_user_row_id = checkUserToken.message.user_row_id
            }

            if (Number.isNaN(Number.parseInt(req.params.sponsor_partner_row_id))) {
                errObj['sponsor_partner_row_id'] = 'The sponsor or partner row id field must be contain valid number.'
            }
            else {
                sponsor_partner_row_id = Number.parseInt(req.params.sponsor_partner_row_id)
                const check_query = await event_sponsors_partner_detailsM.findOne({ _id: sponsor_partner_row_id })
                if (!check_query) {
                    errObj['sponsor_partner_row_id'] = 'Invalid sponsor or partner row id.'
                }
                else {
                    event_row_id = check_query.event_row_id

                    const token_message = checkUserToken.token_message
                    if (token_message.admin_row_id) {
                        const check_access = await checkSubadminAccess({
                            admin_row_id: Number.parseInt(token_message.admin_row_id),
                            admin_manager_type: token_message.admin_manager_type,
                            sub_admin_type: Number.parseInt(token_message.sub_admin_type),
                            event_row_id: event_row_id
                        })

                        if (!check_access.status) {
                            errObj['alert_message'] = check_access.message
                        }
                    }

                    sponsor_partner_type = check_query.sponsor_partner_type
                    const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: host_user_row_id })
                    if (!check_event_res.status) {
                        errObj['event_row_id'] = check_event_res.message.alert_message
                    }
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                await deleteSponsorsPartners({ type: 1, sp_row_id: sponsor_partner_row_id })
                await deleteKeysByPattern('event_sponsor_list_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('all_events_*')
                await deleteKeysByPattern('app_user_other_details_*')
                await deleteKeysByPattern('app_company_list_*')

                await calculateEventScore(event_row_id, ['sponsors_partners'])

                res.json({ status: true, message: { alert_message: (sponsor_partner_type == 1 ? 'This sponsor ' : 'This partner ') + ' details from this event has been deleted successfully. The guest information has now been permanently removed from our records.' } })
            }
        }
        catch (err) {
            console.log('Delete sponsor partner details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.buildOuterInfoWorkPipeline = buildOuterInfoWorkPipeline
router.buildRegisteredUserInfoWorkPipeline = buildRegisteredUserInfoWorkPipeline
router.buildManualUserInfoWorkPipeline = buildManualUserInfoWorkPipeline

module.exports = router