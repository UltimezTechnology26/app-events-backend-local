const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAllLoginToken } = require('../../../middleware/authorization')
const companyM = require('../../../models/app/company/companyM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const { checkCompanyRowID, deleteCompanyRevenue, calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { setCache, getCache, deleteKeysByPattern } = require('../../../config/cache_helper')

router.get('/revenue_overview', async (req, res) => {
    try {
        let errObj = {}
        let company_row_id = 0

        if (req.query.company_row_id) {
            if (!Number.isNaN(Number.parseInt(req.query.company_row_id))) {
                company_row_id = Number.parseInt(req.query.company_row_id)
            }
            else {
                errObj['company_row_id'] = 'Invalid Company Row ID.'
            }
        }
        else {
            errObj['company_row_id'] = 'The Company row id field is required.'
        }
        let filterYears = 0;
        if (req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter))) {
            filterYears = Number.parseInt(req.query.year_filter); // Can be 3, 5, or 7
        }

        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj })
        }
        const key = `company_revenue_overview_${company_row_id}_${filterYears}`

        const cache_response = await getCache({ key })
        if (cache_response.status) {
            return res.json({
                status: true,
                message: cache_response.message.list,
                cache_response_status: true
            })
        }
        else {
            let result = {}
            const total_revenue_query = await company_revenue_growthM.aggregate([
                { $match: { company_row_id: company_row_id } },
                { $group: { _id: null, total_revenue: { $sum: "$revenue" } } }
            ])

            result['total_revenue'] = total_revenue_query[0] ? total_revenue_query[0].total_revenue : 0

            const get_started_year_query = await company_revenue_growthM.aggregate([
                { $match: { company_row_id: company_row_id } },
                { $sort: { year: 1 } },
                {
                    $project: {
                        _id: 1,
                        year: 1,
                        quarter: 1,

                    }
                }
            ]).limit(1)
            result['get_started_year_query'] = get_started_year_query
            const get_last_year_query = await company_revenue_growthM.aggregate([
                { $match: { company_row_id: company_row_id } },
                { $sort: { year: -1 } },
                {
                    $project: {
                        _id: 1,
                        year: 1
                    }
                }
            ]).limit(1)

            result['total_years'] = ''
            if (get_started_year_query[0] && get_last_year_query[0]) {
                const start_year = get_started_year_query[0].year
                const last_year = get_last_year_query[0].year

                if (start_year == last_year) {
                    result['total_years'] = 0
                }
                else {
                    result['total_years'] = Number.parseInt(last_year) - Number.parseInt(start_year)
                }
            }

            let yearMatch = { company_row_id };

            if (filterYears > 0) {
                const maxYearData = await company_revenue_growthM.findOne(
                    { company_row_id },
                    { year: 1 }
                ).sort({ year: -1 });

                const maxYear = maxYearData?.year || new Date().getFullYear();

                yearMatch.year = {
                    $gte: maxYear - filterYears + 1,
                    $lte: maxYear
                };
            }


            const checkCompanyData = await company_revenue_growthM.aggregate([
                { $match: yearMatch },

                {
                    $group: {
                        _id: {
                            year: "$year",
                            quarter: "$quarter"
                        },
                        quarter_revenue: { $sum: "$revenue" }
                    }
                },
                {
                    $group: {
                        _id: "$_id.year",
                        total_revenue: { $sum: "$quarter_revenue" },
                        quarters: {
                            $push: {
                                quarter: "$_id.quarter",
                                revenue: "$quarter_revenue"
                            }
                        }
                    }
                },
                { $sort: { _id: 1 } },

                {
                    $project: {

                        _id: "$_id",
                        total_revenue: 1,
                        quarters: 1
                    }
                },

            ]);
            result['revenue_list_years'] = checkCompanyData



            // revenue_streams


            const revenue_stream_query = await company_revenue_growthM.aggregate([
                { $match: { company_row_id: company_row_id, 'revenue_streams.category_row_id': { $gte: 1 } } },
                {
                    $unwind: {
                        path: '$revenue_streams'
                    }
                },
                {
                    $group: {
                        _id: '$revenue_streams.category_row_id',
                        total: {
                            $sum: '$revenue_streams.stream_amount'
                        }
                    }
                },
                {
                    $lookup: {
                        from: "cln_static_company_revenue_streams",
                        localField: "_id",
                        foreignField: "_id",
                        as: "info_revenue_streams",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    category_name: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_revenue_streams", preserveNullAndEmptyArrays: true } },

                {
                    $project: {
                        _id: 1,
                        total: 1,
                        category_name: '$info_revenue_streams.category_name'
                    }
                }
            ])


            result['revenue_stream_list'] = revenue_stream_query

            result['revenue_growth_percentage'] = 45
            // Ensure at least two years of data exist to calculate growth
            if (checkCompanyData.length >= 2) {
                const startRevenue = checkCompanyData[0].total_revenue;
                const endRevenue = checkCompanyData[checkCompanyData.length - 1].total_revenue;

                if (startRevenue > 0) {
                    const growth = ((endRevenue - startRevenue) / startRevenue) * 100;
                    result['total_revenue_growth_percentage'] = Math.round(growth * 100) / 10;
                    result['startRevenue'] = startRevenue
                    result['endRevenue'] = endRevenue


                    // Rounded to 2 decimals
                } else {
                    result['total_revenue_growth_percentage'] = null; // Can't divide by zero
                }
            } else {
                result['total_revenue_growth_percentage'] = null; // Not enough data
            }

            await setCache({
                key,
                value: { list: result }, // cache format
                ttl: 1800
            })

            return res.json({
                status: true,
                message: result,
                cache_response_status: false
            })
            // res.json({ status: true, message: result })
        }
    }
    catch (err) {
        console.log('Revenue Overview.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.post('/update_n_save_details', [
    check('year')
        .trim().not().isEmpty().withMessage('The Year field is required.')
        .isInt().withMessage('The year field must be contains only integers.'),
    check('quarter')
        .trim().not().isEmpty().withMessage('The Quarter field is required.')
        .isInt().withMessage('The quarter field must be contains only integers.'),
    check('revenue')
        .trim().not().isEmpty().withMessage('The Reenue field is required.')
        .isInt().withMessage('The revenue field must be contains only integers.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        let errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            let company_row_id = 0
            let user_row_id = 0
            let revenue_row_id = 0
            if (req.body.company_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                    company_row_id = Number.parseInt(req.body.company_row_id)
                    if (checkUserToken.message.user_type == 1) {
                        user_row_id = checkUserToken.message.user_row_id
                        const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
                        if (!check_company.status) {
                            errObj['company_row_id'] = check_company.message.alert_message
                        }
                    }

                    if (company_row_id) {
                        if (req.body.revenue_row_id) {
                            if (!Number.isNaN(Number.parseInt(req.body.revenue_row_id))) {
                                revenue_row_id = Number.parseInt(req.body.revenue_row_id)
                                const check_revenue_query = await company_revenue_growthM.findOne({ _id: revenue_row_id })
                                if (!check_revenue_query) {
                                    errObj['revenue_row_id'] = 'Sorry, Invalid Revenue Row ID.'
                                }
                            }
                        }
                    }
                }
                else {
                    errObj['company_row_id'] = 'Invalid Company Row ID.'
                }
            }
            else {
                errObj['company_row_id'] = 'The Company row id field is required.'
            }

            let revenue_streams = []
            if (req.body.revenue_streams) {
                if (req.body.revenue_streams[0]) {
                    if (req.body.revenue_streams[0].category_row_id) {
                        for (let revenue_run of req.body.revenue_streams) {
                            let inner_error_status = false
                            if (revenue_run.category_row_id && revenue_run.stream_amount) {
                                if (Number.isNaN(Number.parseInt(revenue_run.category_row_id))) {
                                    errObj['revenue_streams'] = 'The Category Row ID field contains valid stream category id.'
                                    inner_error_status = true
                                }

                                if (Number.isNaN(Number.parseFloat(revenue_run.stream_amount))) {
                                    errObj['revenue_streams'] = 'The Stream amount field must be greater than or equal to 0.'
                                    inner_error_status = true
                                }

                                if (!inner_error_status) {
                                    if ((Number.parseInt(revenue_run.category_row_id) > 0) && (Number.parseFloat(revenue_run.stream_amount) > 0)) {
                                        revenue_streams.push({ category_row_id: Number.parseInt(revenue_run.category_row_id), stream_amount: Number.parseFloat(revenue_run.stream_amount) })
                                    }
                                }
                            }
                            else {
                                errObj['revenue_streams'] = 'The Category Row ID and Stream amount fields are required.'
                            }

                        }
                    }
                }
            }

            let year = 0
            let quarter = 0
            if (req.body.year && req.body.quarter) {
                year = Number.parseInt(req.body.year)
                quarter = Number.parseInt(req.body.quarter)
                const check_existing_revenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id, year: year, quarter: quarter, _id: { $ne: revenue_row_id } })
                if (check_existing_revenue) {
                    errObj['quarter'] = 'Sorry, This revenue details already exists.'
                }

                // Check yearly revenue already exists
                if (quarter !== 5) {
                    const check_yearly_revenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id, year: year, quarter: 5, _id: { $ne: revenue_row_id } })
                    if (check_yearly_revenue) {
                        errObj['quarter'] = 'Sorry, A yearly record already exists for this year. You can add either quarterly or yearly data.'
                    }
                }

                // Check quarterly revenue already exists
                if (quarter == 5) {
                    const check_quartely_revenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id, year: year, quarter: { $ne: 5 }, _id: { $ne: revenue_row_id } })
                    if (check_quartely_revenue) {
                        errObj['quarter'] = 'Sorry, Quaterly records already exists for this year. You can add either quarterly or yearly data.'
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const insert_object = {}
                insert_object['year'] = year
                insert_object['quarter'] = quarter
                insert_object['revenue'] = Number.parseFloat(req.body.revenue)
                insert_object['revenue_streams'] = revenue_streams
                insert_object['updated_date_n_time'] = getPresentDateTime()

                if (!revenue_row_id) {
                    insert_object['company_row_id'] = company_row_id

                    await company_revenue_growthM(insert_object).save()
                    await deleteKeysByPattern('company_revenue_list_*')
                    await deleteKeysByPattern('company_revenue_overview_*')
                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')

                    await calculateCompanyProfileScore(company_row_id, ['revenue'])

                    res.json({ status: true, message: { alert_message: "Your company's revenue details have been saved successfully. Thank you for keeping your financial information current!" }, insert_object: insert_object })
                }
                else {
                    await company_revenue_growthM.updateOne({ _id: revenue_row_id, company_row_id: company_row_id }, { $set: insert_object })
                    await deleteKeysByPattern('company_revenue_list_*')
                    await deleteKeysByPattern('company_revenue_overview_*')
                    await deleteKeysByPattern('company_investment_funding_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    res.json({ status: true, message: { alert_message: "Your company's revenue details have been updated successfully. Thank you for keeping your financial information current!" }, insert_object: insert_object })
                }

            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Save revenue details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/list/:company_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7])
    if (!checkUserToken.status) {
        return res.json(checkUserToken)
    }

    try {
        let errObj = {}

        if (Number.isNaN(Number.parseInt(req.params.skip))) {
            errObj['skip'] = 'The parameter skip field must contain a valid number'
        }
        if (Number.isNaN(Number.parseInt(req.params.limit))) {
            errObj['limit'] = 'The parameter limit field must contain a valid number.'
        }

        let company_row_id = 0
        if (!Number.isNaN(Number.parseInt(req.params.company_row_id))) {
            company_row_id = Number.parseInt(req.params.company_row_id)
        } else {
            errObj['company_row_id'] = 'The company row id field must contain a valid number.'
        }

        let user_row_id = 0
        if (checkUserToken.message.user_type == 1) {
            user_row_id = checkUserToken.message.user_row_id
        }

        if (company_row_id && user_row_id) {
            const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
            if (!check_company.status) {
                errObj['company_row_id'] = check_company.message.alert_message
            }
        }

        if (Object.keys(errObj).length) {
            return res.json({ status: false, message: errObj })
        }

        const skip = Number.parseInt(req.params.skip)
        const limit = Number.parseInt(req.params.limit)

        let query = [{ company_row_id }]

        if (req.query.year) {
            query.push({ year: Number.parseInt(req.query.year) })
        }
        if (req.query.quarter) {
            query.push({ quarter: Number.parseInt(req.query.quarter) })
        }

        let search_query = { $and: query }

        const key = `company_revenue_list_${company_row_id}_${skip}_${limit}_${req.query.year || 'all'}_${req.query.quarter || 'all'}_${req.query.revenue_stream || 'all'}`

        const cache_response = await getCache({ key })
        if (cache_response.status) {
            return res.json({
                status: true,
                message: cache_response.message.list,
                count: cache_response.message.count,
                cache_response_status: true
            })
        }

        const get_query = await company_revenue_growthM.aggregate([
            { $match: search_query },
            { $sort: { year: -1, quarter: 1 } },
            {
                $lookup: {
                    from: "cln_static_company_revenue_streams",
                    localField: "revenue_streams.category_row_id",
                    foreignField: "_id",
                    as: "info_revenue_streams",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                category_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    revenue_streams_list: {
                        $map: {
                            input: "$revenue_streams",
                            as: "c",
                            in:
                            {
                                category_row_id: "$$c.category_row_id",
                                stream_amount: "$$c.stream_amount",
                                category_name: {
                                    $arrayElemAt: [
                                        "$info_revenue_streams.category_name",
                                        {
                                            $indexOfArray: [
                                                "$info_revenue_streams._id",
                                                "$$c.category_row_id"
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            ...(req.query.revenue_stream ? [{
                $match: {
                    revenue_streams_list: {
                        $elemMatch: {
                            category_row_id: Number.parseInt(req.query.revenue_stream)
                        }
                    }
                }
            }] : []),

            {
                $project: {
                    _id: 1,
                    company_row_id: 1,
                    year: 1,
                    quarter: 1,
                    revenue: 1,
                    revenue_streams_list: 1,
                }
            }
        ]).skip(skip).limit(limit)

        const count_query = await company_revenue_growthM.countDocuments(search_query)

        await setCache({
            key,
            value: { list: get_query, count: count_query },
            ttl: 1800
        })

        return res.json({
            status: true,
            message: get_query,
            count: count_query,
            cache_response_status: false
        })

    } catch (err) {
        console.log('Revenue list.', err.message)
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        })
    }
})


router.get('/delete_revenue/:revenue_row_id', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            try {
                let errObj = {}
                let revenue_row_id = 0
                if (!Number.isNaN(Number.parseInt(req.params.revenue_row_id))) {
                    revenue_row_id = Number.parseInt(req.params.revenue_row_id)
                }
                else {
                    errObj['revenue_row_id'] = 'The revenue row id field must be contain valid number.'
                }

                let user_row_id = 0
                let company_row_id = 0
                let check_query = { _id: revenue_row_id }
                if (checkUserToken.message.user_type == 1) {
                    user_row_id = checkUserToken.message.user_row_id

                    const check_company = await checkCompanyRowID({ company_row_id: '', user_row_id })
                    if (!check_company.status) {
                        errObj['alert_message'] = check_company.message.alert_message
                    }
                    else {
                        company_row_id = check_company.message.company_row_id
                        check_query = { _id: revenue_row_id, company_row_id: company_row_id }
                    }
                }

                if (Object.keys(errObj).length) {
                    res.json({ status: false, message: errObj })
                }
                else {
                    const checkCompanyData = await company_revenue_growthM.findOne(check_query)
                    if (checkCompanyData) {
                        await deleteCompanyRevenue({ type: 1, revenue_row_id: revenue_row_id })
                        await deleteKeysByPattern('company_revenue_list_*')
                        await deleteKeysByPattern('company_revenue_overview_*')
                        await deleteKeysByPattern('company_investment_funding_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('app_company_list_*')

                        await calculateCompanyProfileScore(checkCompanyData?.company_row_id, ['revenue'])
                        res.json({ status: true, message: { alert_message: 'The revenue details have been successfully deleted. Thank you for your action!' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry, Invalid Revenue Row ID' } })
                    }
                }
            }
            catch (err) {
                console.log('Revenue list.', err.message)
                res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Delete revenue details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



module.exports = router