const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const bounced_emailsM = require('../../models/emails/bounced_emailsM')
const { arrangeValidation, getPresentDateTime } = require('../../utils/helpers/helper')

router.post('/bounced_issue_resolve/:bounced_row_id', [
    check('resolved_reason')
        .trim()
        .not().isEmpty().withMessage('The resolved reason field is required.')
        .isLength({ min: 4 }).withMessage('The resolved reason field must be at least 4 characters in length.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        let bounced_row_id = 0

        if (Number.isNaN(Number.parseInt(req.params.bounced_row_id))) {
            errObj['bounced_row_id'] = 'The parameter bounce row id field must contain valid number.'
        }
        else {
            bounced_row_id = Number.parseInt(req.params.bounced_row_id)
        }


        const checkToken = checkAdminLoginToken(req.headers)
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_query = await bounced_emailsM.findOne({ _id: bounced_row_id })
                if (check_query) {
                    await bounced_emailsM.updateOne({ _id: bounced_row_id }, { $set: { resolved_reason: req.body.resolved_reason, resolved_status: true, fixed_date_time: new Date(getPresentDateTime()) } })
                    res.json({ status: true, message: "Issue resolved successfully." })

                }
                else {
                    res.json({ status: false, message: "Invalid bounce row id." })

                }
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Update bounce issue.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/bounced_emails_list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must contain valid number.'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must contain valid number.'
            }
            let query = [{}]
            if (req.query.email_id) {
                query.push({ email_id: { '$regex': req.query.email_id, $options: 'i' } })
            }
            if (req.query.resolved_status) {
                if (Number.isNaN(Number.parseInt(req.query.resolved_status))) {
                    errObj['resolved_status'] = 'The parameter resolved status field must contain valid number.'
                }
                else {
                    const resolved_status = Number.parseInt(req.query.resolved_status) === 1 ? true : false
                    query.push({ resolved_status: resolved_status })
                }
            }
            if (req.query.start_date && req.query.end_date) {
                query.push({ $and: [{ bounced_date: { $gte: new Date(req.query.start_date) } }, { bounced_date: { $lte: new Date(req.query.end_date) } }] })
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)
                const get_query = await bounced_emailsM.aggregate([
                    { $match: { $and: query } },
                    { $skip: skip },
                    { $limit: limit },
                    { $sort: { bounced_date: -1 } },

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
                        $project:
                        {
                            email_id: 1,
                            status: 1,
                            reason: 1,
                            bounced_date: 1,
                            sub_admin_row_id: 1,
                            resolved_status: 1,
                            fixed_date_time: 1,
                            resolved_reason: 1,
                            sub_admin_name: "$sub_admin_info.full_name",
                        }
                    }
                ])

                res.json({ status: true, message: get_query })
            }
        }
        catch (err) {
            console.log('Bounced emails list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})






module.exports = router