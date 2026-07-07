const express = require('express')
const router = express.Router()
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const professionals_manual_retrievalsM = require('../../../../models/app/users/professionals_manual_retrievalsM')
const professionals_work_experienceM = require('../../../../models/app/professionals_work_experienceM')


router.get('/manual_professional_detail_list/:user_row_id/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (checkToken.status) {
        let user_row_id = Number.parseInt(req.params.user_row_id)
        try {

            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.user_row_id))) {
                errObj['user_row_id'] = 'The User row id field must be contain valid number.'
            }
            else {
                user_row_id = Number.parseInt(req.params.user_row_id)
            }

            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }


            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
                const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50

                const check_user = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })
                if (check_user) {
                    const query = await professionals_work_experienceM.aggregate([
                        {
                            $match: { user_account_type: 2 }
                        },
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
                                from: "cln_company_lists",
                                let: {
                                    company_type: '$company_type',
                                    company_row_id: '$company_row_id'
                                },
                                as: "company_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [1, "$$company_type"] },
                                                            { $eq: ["$_id", "$$company_row_id"] }
                                                        ]
                                                    }
                                                },
                                                {
                                                    active_status: 1
                                                }
                                            ]
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
                        { $match: { company_name: { $nin: ["", null] }, user_row_id: user_row_id } },
                        {
                            $project: {
                                user_row_id: 1,
                                position_name: "$info_position.position_name",
                                position_row_id: 1,
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
                    ]).skip(skip).limit(limit)


                    res.json({ status: true, message: query })

                }
                else {
                    res.json({ status: false, message: 'Invalid User Row ID.' })
                }
            }

        }
        catch (err) {
            console.log('Manual user professional details list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


module.exports = router