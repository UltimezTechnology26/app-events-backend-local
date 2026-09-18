import meetingM from "../../models/app/meetings/meetingM";
import redisCache, { CacheDuration } from "../../config/redis";
import { getPositionResolutionStages } from "../../src/modules/work-experience/work-experience.queries";
import { joinPositionNamesExpr } from "../../src/modules/funding/funding.queries";

export const getMeetingList = async (req: any, company_row_id: number, user_row_id: string) => {
    try {
        const meetingType = req.query.meeting_type ? req.query.meeting_type.toLowerCase() : null;
        const status = req.query.status ? req.query.status.toLowerCase() : "scheduled";

        // Build OR conditions dynamically
        const orConditions = [];

        if (company_row_id) {
            orConditions.push(
                ...[
                    { company_row_id },
                    { requested_company_row_id: { $in: [company_row_id] } }
                ]
            );
        } else {
            orConditions.push(
                ...[
                    {
                        user_row_id,
                        $or: [
                            { company_row_id: { $exists: false } },
                            { company_row_id: null },
                            { company_row_id: "" }
                        ]
                    },
                    { requested_user_row_id: { $in: [user_row_id] } }
                ]
            );
        }

        // Optimized status filter - pre-built status arrays
        const statusMap: { [key: string]: string[] } = {
            scheduled: ["scheduled", "rescheduled"],
            completed: ["scheduled", "rescheduled"],
            pending: ["pending", "rejected"]
        };

        let statusFilter: any = {
            $or: orConditions,
        };

        if (meetingType) {
            statusFilter.meeting_type = meetingType;
        }

        if (status !== "all") {
            statusFilter.status = { $in: statusMap[status] || ["scheduled", "rescheduled"] };
        }

        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 50;
        const cacheKey = `interview_list_${user_row_id}_${company_row_id}_${meetingType || 'all'}_${status}_${skip}_${limit}`;
        const cache_response = await redisCache.getCache<{ data: any[], count: number }>({ key: cacheKey });
        if (cache_response.status && cache_response.message) {
            return {
                status: true,
                message: "Job interview details fetched successfully!",
                data: cache_response.message.data,
                count: cache_response.message.count,
                cache_response_status: true
            };
        }
        const meetingDetails = await meetingM.aggregate([
            { $match: statusFilter },
            // Early status-based datetime filtering for better performance
            ...(status === "completed"
                ? [{
                    $match: {
                        $expr: {
                            $lt: [
                                { $dateAdd: { startDate: "$meeting_datetime", unit: "hour", amount: 6 } },
                                new Date()
                            ]
                        }
                    }
                }]
                : status === "scheduled"
                    ? [{
                        $match: {
                            $expr: {
                                $gte: [
                                    { $dateAdd: { startDate: "$meeting_datetime", unit: "hour", amount: 6 } },
                                    new Date()
                                ]
                            }
                        }
                    }]
                    : []),
            { $sort: { meeting_datetime: 1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_details",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                company_name: 1,
                                company_logo: 1,
                                company_email_id: 1,
                                company_id: 1,
                                describe_in_one_line: 1
                            }
                        }
                    ]
                }
            },
            {
                $unwind: {
                    path: "$company_details",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                user_name: 1,
                                pro_batch: 1,
                                email_id: 1,
                                mobile_number: 1,
                                country_mobile_id: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "user_profile",
                    pipeline: [
                        {
                            $project: {
                                user_row_id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_profile", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_work_experiences",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        { $match: { public_view: true, user_account_type: 1 } },//,public_view:true
                        { $sort: { start_date: -1 } },
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
                                            _id: 0,
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
                                            _id: 0,
                                            company_name: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                position_name: "$resolved_position_name",
                                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } }
                            }
                        },
                    ],
                    as: "user_info_work",
                }
            },

            // ✅ requested_user_row_id → multiple users
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "requested_user_row_id",
                    foreignField: "_id",
                    as: "requested_users"
                }
            },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "requested_user_row_id",
                    foreignField: "user_row_id",
                    as: "requested_user_profiles"
                }
            },
            {
                $lookup: {
                    from: "cln_professionals_work_experiences",
                    localField: "requested_user_row_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        { $match: { public_view: true, user_account_type: 1 } },
                        { $sort: { start_date: -1 } },
                        { $limit: 1 },
                        ...getPositionResolutionStages(),
                        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    company_type: "$company_type",
                                    company_row_id: "$company_row_id"
                                },
                                as: "info_company",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: [1, "$$company_type"] },
                                                    { $eq: ["$_id", "$$company_row_id"] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 0,
                                            company_name: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_company_manual_retrievals",
                                let: {
                                    company_type: "$company_type",
                                    company_row_id: "$company_row_id"
                                },
                                as: "info_manual_company",
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
                                    },
                                    {
                                        $project: {
                                            _id: 0,
                                            company_name: 1
                                        }
                                    }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                user_row_id: 1, // 👈 keep this for mapping later
                                position_name: "$resolved_position_name",
                                company_name: {
                                    $cond: {
                                        if: "$info_company.company_name",
                                        then: "$info_company.company_name",
                                        else: "$info_manual_company.company_name"
                                    }
                                }
                            }
                        }
                    ],
                    as: "requested_user_work"
                }
            },


            // ✅ requested_company_row_id → multiple companies
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "requested_company_row_id",
                    foreignField: "_id",
                    as: "requested_companies"
                }
            },

            // ✅ filter by meeting status (completed vs scheduled)
            ...(status === "completed"
                ? [
                    {
                        $match: {
                            $expr: {
                                $lt: [
                                    { $dateAdd: { startDate: "$meeting_datetime", unit: "hour", amount: 6 } },
                                    new Date()
                                ]
                            }
                        }
                    }
                ]
                : status === "scheduled"
                    ? [
                        {
                            $match: {
                                $expr: {
                                    $gte: [
                                        { $dateAdd: { startDate: "$meeting_datetime", unit: "hour", amount: 6 } },
                                        new Date()
                                    ]
                                }
                            }
                        }
                    ]
                    : []),

            { $sort: { meeting_datetime: 1 } },
            { $skip: skip },
            { $limit: limit },

            // ✅ Final projection
            {
                $project: {
                    meeting_type: 1,
                    meeting_title: 1,
                    meeting_datetime: 1,
                    meeting_timezone: 1,
                    meeting_link: 1,
                    status: 1,
                    job_role: 1,
                    upload_document: 1,
                    user_row_id: 1,
                    rejected_comment: 1,
                    rescheduled_by: 1,
                    rescheduled_count: 1,
                    created_on: "$createdAt",
                    // main user info
                    user_name: "$user_info.full_name",
                    user_id: "$user_info.user_name",
                    pro_batch: "$user_info.pro_batch",
                    email_id: "$user_info.email_id",
                    mobile_number: "$user_info.mobile_number",
                    country_mobile_id: "$user_info.country_mobile_id",
                    user_profile_image: "$user_profile.profile_image",
                    work_experience: "$user_info_work",
                    requested_users: {
                        $map: {
                            input: "$requested_users",
                            as: "ru",
                            in: {
                                name: "$$ru.full_name",
                                id: "$$ru._id",
                                user_id: "$$ru.user_name",
                                pro_batch: "$$ru.pro_batch",
                                mobile_number: "$$ru.mobile_number",
                                email_id: "$$ru.email_id",
                                country_mobile_id: "$$ru.country_mobile_id",

                                // join profile by matching
                                profile_image: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$requested_user_profiles",
                                                        as: "rup",
                                                        cond: { $eq: ["$$rup.user_row_id", "$$ru._id"] }
                                                    }
                                                },
                                                as: "match",
                                                in: "$$match.profile_image"
                                            }
                                        },
                                        0
                                    ]
                                },

                                // join work experience by matching
                                work_experience: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$requested_user_work",
                                                        as: "ruw",
                                                        cond: { $eq: ["$$ruw.user_row_id", "$$ru._id"] }
                                                    }
                                                },
                                                as: "work",
                                                in: {
                                                    position_name: "$$work.position_name",
                                                    company_name: "$$work.company_name"
                                                }
                                            }
                                        },
                                        0
                                    ]
                                }
                            }
                        }
                    },

                    requested_companies: {
                        $map: {
                            input: "$requested_companies",
                            as: "rc",
                            in: {
                                id: "$$rc._id",
                                name: "$$rc.company_name",
                                logo: "$$rc.company_logo",
                                company_id: "$$rc.company_id",
                                email_id: "$$rc.company_email_id",
                                description: "$$rc.describe_in_one_line"
                            }
                        }
                    },
                    company_name: "$company_details.company_name",
                    company_logo: "$company_details.company_logo",
                    company_email_id: "$company_details.company_email_id",
                    company_id: "$company_details.company_id",
                    company_row_id: "$company_details._id",
                    company_description: "$company_details.describe_in_one_line"

                }
            }
        ]);


        const countQueryAgg = await meetingM.aggregate([
            { $match: statusFilter },
            ...(status === "completed"
                ? [
                    {
                        $match: {
                            $expr: {
                                $lt: [
                                    { $dateAdd: { startDate: "$meeting_datetime", unit: "hour", amount: 6 } },
                                    new Date()
                                ]
                            }
                        }
                    }
                ]
                : status === "scheduled"
                    ? [
                        {
                            $match: {
                                $expr: {
                                    $gte: [
                                        { $dateAdd: { startDate: "$meeting_datetime", unit: "hour", amount: 6 } },
                                        new Date()
                                    ]
                                }
                            }
                        }
                    ]
                    : []),
            { $count: "total" }
        ]);

        const countQuery = countQueryAgg.length ? countQueryAgg[0].total : 0;

        if (!meetingDetails.length) {
            return { status: true, data: [], message: "No interview meetings found." };
        }

        // return {
        //     status: true,
        //     message: "Job interview details fetched successfully!",
        //     data: meetingDetails,
        //     count: countQuery
        // });
        await redisCache.setCache({
            key: cacheKey,
            value: { data: meetingDetails, count: countQuery },
            ttl: CacheDuration.TWELVE_HOURS
        });

        return {
            status: true,
            message: "Job interview details fetched successfully!",
            data: meetingDetails,
            count: countQuery,
            cache_response_status: false
        };
    } catch (error) {
        console.error("❌ Error in getMeetingList:", error);
        return {
            status: false,
            message: "Something went wrong while fetching meeting details.",
            data: [],
            count: 0
        };
    }
}