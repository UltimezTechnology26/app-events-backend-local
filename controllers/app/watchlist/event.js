const express = require('express')
const router = express.Router()

const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
const { setCache, getCache } = require('../../../config/cache_helper')


router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            const user_row_id = checkUserToken.message

            let query = [{
                user_row_id: user_row_id, active_status: 1, approval_status: 1,
                $or: [
                    { login_status: 1, list_event_type: 1 },
                    { company_active_status: 1, list_event_type: 2 },
                    { list_event_type: 3, login_status: 1, company_active_status: 1 }
                ]
            }
            ]

            if (req.query.search) {
                query.push({ event_title: { '$regex': req.query.search, $options: 'i' } })
            }
            if (req.query.location) {
                query.push({ event_venue: { '$regex': req.query.location, $options: 'i' } })

            }

            if (req.query.event_tag) {
                query.push({ event_tags: Number.parseInt(req.query.event_tag) })
            }

            //list_event_type ->1:user, 2:company, 3:both
            if (req.query.list_event_type) {
                query.push({ list_event_type: Number.parseInt(req.query.list_event_type) })
            }
            const key = `events_watchlist_${user_row_id}_${skip}_${limit}_${JSON.stringify(req.query)}`

            // Check cache
            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message.list,
                    count: cache_response.message.count,
                    cache_response_status: true,
                    time: getPresentDateTime()
                })
            }

            const getQuery = await event_watchlistsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info"
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_events_tags",
                        localField: "event_info.event_tags",
                        foreignField: "_id",
                        as: "eventTags"
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "event_info.company_row_id",
                        foreignField: "_id",
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "event_info.user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        event_title: "$event_info.event_title",
                        login_status: "$user_info.login_status",
                        company_active_status: "$company_info.active_status",
                        active_status: "$event_info.active_status",
                        approval_status: "$event_info.approval_status",
                        event_tags: "$event_info.event_tags",
                        list_event_type: "$event_info.list_event_type",
                        event_venue: "$event_info.event_venue"
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_events_utc_dates",
                        localField: "event_info.utc_row_id",
                        foreignField: "_id",
                        as: "utc_dates"
                    }
                },
                { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
                {
                    $match: { $and: query }
                },
                {
                    $project: {
                        _id: 1,
                        event_row_id: 1,
                        login_status: 1,
                        alt_image_text: "$event_info.alt_image_text",
                        company_row_id: "$event_info.company_row_id",
                        event_title: "$event_info.event_title",
                        event_type: "$event_info.event_type",
                        event_image: "$event_info.event_image",
                        event_image_type: "$event_info.event_image_type",
                        event_tags: "$event_info.event_tags",
                        event_city: "$event_info.event_city",
                        event_venue: "$event_info.event_venue",
                        event_url: "$event_info.event_url",
                        event_link: "$event_info.event_link",
                        event_card_image: "$event_info.event_card_image",
                        start_date: "$event_info.start_date",
                        end_date: "$event_info.end_date",
                        list_event_type: "$event_info.list_event_type",
                        describe_in_one_line: "$event_info.describe_in_one_line",
                        event_price: "$event_info.event_price",
                        company_id: "$company_info.company_id",
                        company_name: "$company_info.company_name",
                        company_log: "$company_info.company_logo",
                        event_tag_array: "$eventTags.event_tag",
                        user_full_name: "$user_info.full_name",
                        user_name: "$user_info.user_name",
                        utc_time: "$utc_dates.utc_time",
                    }
                }
            ]).sort({ _id: -1 }).skip(skip).limit(limit)



            const queryCount = await event_watchlistsM.aggregate([
                {
                    $lookup:
                    {
                        from: "cln_events",
                        localField: "event_row_id",
                        foreignField: "_id",
                        as: "event_info"
                    }
                },
                { $unwind: { path: "$event_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "event_info.user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "event_info.company_row_id",
                        foreignField: "_id",
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        event_title: "$event_info.event_title",
                        login_status: "$user_info.login_status",
                        company_active_status: "$company_info.active_status",
                        active_status: "$event_info.active_status",
                        approval_status: "$event_info.approval_status",
                        approval_status: "$event_info.approval_status",
                        event_tags: "$event_info.event_tags",
                        list_event_type: "$event_info.list_event_type",
                        event_venue: "$event_info.event_venue"
                    }
                },
                {
                    $match: { $and: query }
                },
                {
                    $count: "count"
                }
            ])

            let totalCount = 0
            if (queryCount[0]) {
                totalCount = queryCount[0].count
            }

            // res.json({ status: true, message: getQuery, count: totalCount, time: getPresentDateTime() })
            await setCache({
                key,
                value: { list: getQuery, count: totalCount },
                ttl: 1800
            })

            return res.json({
                status: true,
                message: getQuery,
                count: totalCount,
                cache_response_status: false,
                time: getPresentDateTime()
            })
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, Your login token is expired.' }, tokenStatus: false })
        }

    }
    catch (err) {
        console.log('Events addeed to watchlist.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})
module.exports = router