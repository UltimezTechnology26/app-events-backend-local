const express = require('express')
const router = express.Router()

const { daysMinusFromPresentTime } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const subscribe_categoryM = require('../../../../models/app/newsletter/subscribe_categoryM')


router.get('/overview', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {

            let result = {}
            const before_1day_time = daysMinusFromPresentTime(1)
            const before_7day_time = daysMinusFromPresentTime(7)
            const before_30day_time = daysMinusFromPresentTime(30)

            result['research_1day'] = await subscribe_categoryM.countDocuments({
                category_row_id: 2,
                date_n_time: { $gte: new Date(before_1day_time) }
            })

            result['research_7day'] = await subscribe_categoryM.countDocuments({
                category_row_id: 2,
                date_n_time: { $gte: new Date(before_7day_time) }
            })

            result['research_30day'] = await subscribe_categoryM.countDocuments({
                category_row_id: 2,
                date_n_time: { $gte: new Date(before_30day_time) }
            })

            result['total_research_reports'] = await subscribe_categoryM.countDocuments({
                category_row_id: 2
            })

            result['price_prediction_1day'] = await subscribe_categoryM.countDocuments({
                category_row_id: 1,
                date_n_time: { $gte: new Date(before_1day_time) }
            })

            result['price_prediction_7day'] = await subscribe_categoryM.countDocuments({
                category_row_id: 1,
                date_n_time: { $gte: new Date(before_7day_time) }
            })

            result['price_prediction_30day'] = await subscribe_categoryM.countDocuments({
                category_row_id: 1,
                date_n_time: { $gte: new Date(before_30day_time) }
            })

            result['total_price_prediction'] = await subscribe_categoryM.countDocuments({
                category_row_id: 1
            })




            res.json({ status: true, message: result })
        }
        catch (err) {
            console.log('Subscribe category Overview.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})



router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
        try {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            let query = [{ "categories._id": { $exists: true } }]

            if (req.query.search) {
                query.push({
                    $and: [
                        {
                            $or: [
                                { user_name: { '$regex': req.query.search, $options: 'i' } },
                                { full_name: { '$regex': req.query.search, $options: 'i' } },
                                { email_id: { '$regex': req.query.search, $options: 'i' } }
                            ]
                        }
                    ]
                })
            }


            const get_query = await subscribe_categoryM.aggregate([
                {
                    $group:
                    {
                        _id: "$user_row_id"
                    }
                },
                {
                    $sort: { _id: -1 }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "_id",
                        foreignField: "_id",
                        as: "info_users",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals_profile_images",
                                    localField: "_id",
                                    foreignField: "user_row_id",
                                    as: "info_image",
                                    pipeline: [
                                        {
                                            $project:
                                            {
                                                profile_image: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_image", preserveNullAndEmptyArrays: true } },

                            {
                                $lookup:
                                {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "info_country",
                                    pipeline: [
                                        {
                                            $project:
                                            {
                                                country_name: 1,
                                                country_flag: 1,
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                            {
                                $project:
                                {
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    email_id: 1,
                                    pro_batch: 1,
                                    date_n_time: 1,
                                    country_name: "$country_info.country_name",
                                    country_flag: "$country_info.country_flag",
                                    profile_image: "$info_image.profile_image"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_users" } },
                {
                    $lookup:
                    {
                        from: "cln_subscribe_to_categories",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "info_categories",
                        pipeline: [
                            {
                                $sort: { category_row_id: 1 }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_email_newsletters",
                                    localField: "category_row_id",
                                    foreignField: "_id",
                                    as: "info_category_name",
                                    pipeline: [
                                        {
                                            $project:
                                            {
                                                _id: 0,
                                                title: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_category_name" } },
                            {
                                $project: {
                                    _id: 1,
                                    // category_row_id:1,
                                    subscribe_status: 1,
                                    category_name: "$info_category_name.title"
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        categories: "$info_categories",
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        email_id: "$info_users.email_id",
                        pro_batch: "$info_users.pro_batch",
                    }
                },
                { $match: { $and: query } },

                {
                    $project: {
                        _id: 1,
                        categories: 1,
                        created_date_n_time: "$info_users.created_date_n_time",
                        full_name: 1,
                        user_name: 1,
                        email_id: 1,
                        pro_batch: 1,
                        country_name: "$info_users.country_name",
                        country_flag: "$info_users.country_flag",
                        profile_image: "$info_users.profile_image"
                    }
                }
            ]).skip(skip).limit(limit)



            const count_query = await subscribe_categoryM.aggregate([
                {
                    $group:
                    {
                        _id: "$user_row_id"
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "_id",
                        foreignField: "_id",
                        as: "info_users",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $project:
                                {
                                    _id: 1,
                                    full_name: 1,
                                    user_name: 1,
                                    email_id: 1,
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_users" } },
                {
                    $lookup:
                    {
                        from: "cln_subscribe_to_categories",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "info_categories",
                        pipeline: [
                            {
                                $sort: { category_row_id: 1 }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_email_newsletters",
                                    localField: "category_row_id",
                                    foreignField: "_id",
                                    as: "info_category_name",
                                    pipeline: [
                                        {
                                            $project:
                                            {
                                                _id: 0,
                                                title: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$info_category_name" } },
                            {
                                $project: {
                                    _id: 1,
                                    // category_row_id:1,
                                    subscribe_status: 1,
                                    category_name: "$info_category_name.title"
                                }
                            }
                        ]
                    }
                },
                {
                    $set: {
                        categories: "$info_categories",
                        full_name: "$info_users.full_name",
                        user_name: "$info_users.user_name",
                        email_id: "$info_users.email_id",
                    }
                },
                { $match: { $and: query } },
                {
                    $count: "count"
                }

            ])



            let count = 0
            if (count_query[0]) {
                count = count_query[0].count
            }

            res.json({ status: true, message: get_query, count: count })


        }
        catch (err) {
            console.log('Subscribe category list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

module.exports = router