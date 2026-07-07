import eventM from "../../models/app/events/eventM"

interface EventsListParams {
    sort_value: { [key: string]: number };
    top_filter_array: { [key: string]: any }[];
    req_params?: { [key: string]: string };
    req_headers?: { [key: string]: string };
    req_query?: { [key: string]: string };
}

export const eventsList = async ({ sort_value, top_filter_array, req_params, req_headers, req_query }: EventsListParams) => {
    try {
        const skip = Number.parseInt(req_params?.skip || '0')
        const limit = Number.parseInt(req_params?.limit || '100')
        const tagStatusValue = req_headers?.tag_status ?? req_query?.tag_status
        const tagStatus = Number.parseInt(tagStatusValue ?? '')
        const hasTagFilter = !Number.isNaN(tagStatus)

        const baseMatchStage = { $match: { $and: top_filter_array } }
        const sortStage = Object.keys(sort_value).length > 0 ? { $sort: sort_value } : { $sort: { _id: -1 } }

        const query_pipeline: any = [
            baseMatchStage,
            sortStage,

            // 🔹 Move projections inside lookup (already good, keep it)

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [{ $project: { user_name: 1, full_name: 1, email_id: 1 } }]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [{ $project: { company_id: 1, company_name: 1 } }]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_events_tags",
                    let: { tagIds: "$event_tags" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$_id", "$$tagIds"] },
                                active_status: true
                            }
                        },
                        { $project: { event_tag: 1 } }
                    ],
                    as: "eventTags"
                }
            },

            {
                $lookup: {
                    from: "cln_event_counts",
                    localField: "_id",
                    foreignField: "event_row_id",
                    as: "events_count",
                    pipeline: [{ $project: { total_attendees: 1, total_watchlist: 1, total_invitees: 1 } }]
                }
            },
            { $unwind: { path: "$events_count", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_events_utc_dates",
                    localField: "utc_row_id",
                    foreignField: "_id",
                    as: "utc_dates",
                    pipeline: [{ $project: { utc_time: 1 } }]
                }
            },
            { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "created_by_sub_admin_id",
                    foreignField: "_id",
                    as: "sub_admin_info",
                    pipeline: [{ $project: { full_name: 1 } }]
                }
            },
            { $unwind: { path: "$sub_admin_info", preserveNullAndEmptyArrays: true } },

            // 🔥 Combine $set + $project → reduce stages
            {
                $project: {
                    _id: 1,
                    company_row_id: 1,
                    user_row_id: 1,
                    event_type: 1,
                    event_url: 1,
                    event_title: 1,
                    event_tags: 1,
                    start_date: 1,
                    event_image: 1,
                    event_image_type: 1,
                    end_date: 1,
                    event_venue: 1,
                    active_status: 1,
                    approval_status: 1,
                    created_date_n_time: 1,
                    alt_image_text: 1,
                    list_event_type: 1,
                    created_by_admin_status: 1,
                    created_by_sub_admin_id: 1,

                    // flattened fields
                    sub_admin_name: "$sub_admin_info.full_name",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    company_id: "$company_info.company_id",
                    company_name: "$company_info.company_name",

                    // computed
                    event_tag_array: "$eventTags.event_tag",
                    total_attendees: { $ifNull: ["$events_count.total_attendees", 0] },
                    total_watchlist: { $ifNull: ["$events_count.total_watchlist", 0] },
                    total_invitees: { $ifNull: ["$events_count.total_invitees", 0] },
                    utc_time: "$utc_dates.utc_time"
                }
            }
        ];

        if (hasTagFilter) {
            if (tagStatus === 1) {
                query_pipeline.push({ $match: { event_tag_array: { $ne: [] } } })
            } else if (tagStatus === 0) {
                query_pipeline.push({ $match: { event_tag_array: { $size: 0 } } })
            }
        }

        const [queryRun, queryRunCount] = await Promise.all([
            eventM.aggregate(query_pipeline).skip(skip).limit(limit),
            eventM.aggregate([
                baseMatchStage,
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            { $project: { _id: 1 } }
                        ]
                    }
                },
                { $count: "count" }
            ])
        ])

        const count = queryRunCount.length > 0 ? queryRunCount[0].count : 0

        return { list: queryRun, count }

    }
    catch (err: any) {
        console.log('Events List function error.', err.message)
        return { list: [], count: [], err: err.message }
    }
}