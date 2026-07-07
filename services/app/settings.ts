import redisCache, { CacheDuration } from '../../config/redis';
import logger from '../../config/logger';
import userDesignationM from '../../models/app/static/user_designationsM';
import userLookingForM from '../../models/app/static/user_looking_forM';
import professionalsM from '../../models/app/professionalsM';
import professionals_followersM from '../../models/app/professionals_followersM';
import professionals_pointsM from '../../models/app/users/professionals_pointsM';
import community_postsM from '../../models/main/community/community_postsM';
import courses_certificatesM from '../../models/main/academy/courses_certificatesM';
import { getUserProfileWithScore, sendInterviewedTeamEmail, sendJobEligibilityEmail, sendNewsCoverageEmail } from '../../utils/helpers/app_helper';
import professionals_manual_retrievalsM from '../../models/app/users/professionals_manual_retrievalsM';
import companyM from '../../models/app/company/companyM';
import company_manual_retrievalsM from '../../models/app/company/company_manual_retrievalsM';
import users_portfolioM from '../../models/markets/portfolio/users_portfolioM';

interface ProfessionalDetailsResponse {
    designations: any[];
    looking_for: any[];
}

interface ServiceResponse<T = any> {
    status: boolean;
    message: T;
    cache_response_status?: boolean;
    response_time?: number;
    user_type?: number;
}

export const getUsersProfessionalDetails = async (): Promise<ServiceResponse<ProfessionalDetailsResponse>> => {
    const startTime = Date.now();
    const key = 'app_users_professional_details';

    try {
        // Check redis cache
        const cache_response = await redisCache.getCache({ key });

        if (cache_response.status) {
            const responseTime = Date.now() - startTime;
            logger.info(`Cache hit for users_professional_details: ${responseTime}ms`);

            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true,
                response_time: responseTime
            };
        }

        // Cache miss - fetch from database
        const designations_query = userDesignationM
            .find({ active_status: true }, { _id: 1, designation_name: 1 })
            .sort({ designation_name: 1 })
            .lean();

        const looking_for_query = userLookingForM
            .find({ active_status: true }, { _id: 1, name: 1 })
            .sort({ name: 1 })
            .lean();

        const [designations, looking_for] = await Promise.all([designations_query, looking_for_query]);

        const resObject = {
            designations: designations,
            looking_for: looking_for
        };

        // Cache result
        await redisCache.setCache({ key, value: resObject, ttl: CacheDuration.TWELVE_HOURS });

        const responseTime = Date.now() - startTime;
        logger.info(`Users professional details fetched: ${responseTime}ms`);

        return {
            status: true,
            message: resObject,
            cache_response_status: false,
            response_time: responseTime
        };

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`Error in getUsersProfessionalDetails: ${error instanceof Error ? error.message : String(error)}, Response time: ${responseTime}ms`);

        return {
            status: false,
            message: {
                designations: [],
                looking_for: []
            },
            response_time: responseTime
        };
    }
};

export const getUserIndividualDetails = async (user_row_id: number) => {
    const startTime = Date.now();

    try {
        const get_query = await professionalsM.aggregate([
            {
                $match: {
                    _id: user_row_id
                }
            },
            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_mobile_id",
                    foreignField: "_id",
                    as: "info_country",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                country_name: 1,
                                country_flag: 1,
                                country_code: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_country", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "info_img",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                profile_image: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_img", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_social_links",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "social_info"
                }
            },
            { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_seo_details",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "seo_info"
                }
            },
            { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    info_location: {
                        area: "$area",
                        city: "$city",
                        state: "$state",
                        longitude: "$longitude",
                        latitude: "$latitude"
                    }
                }
            },
            {
                $lookup: {
                    from: "cln_static_user_designations",
                    localField: "designation_id",
                    foreignField: "_id",
                    as: "info_designations",
                    pipeline: [
                        {
                            $match: {
                                active_status: true
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                designation_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_push_notifications_details",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "info_push_notification",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                push_notification_status: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_push_notification", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_points_lists",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "userPoints"
                }
            },
            {
                $lookup: {
                    from: "cln_static_user_looking_for_lists",
                    localField: "looking_for_id",
                    foreignField: "_id",
                    as: "info_looking_for_list",
                    pipeline: [
                        {
                            $match: {
                                active_status: true
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_company_lists",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "company_details",
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                user_row_id: 1,
                                company_logo: 1,
                                company_id: 1,
                                company_name: 1
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
                $addFields: {
                    total_credited: {
                        $sum: {
                            $map: {
                                input: "$userPoints",
                                as: "point",
                                in: {
                                    $cond: [
                                        { $eq: ["$$point.point_status", "credited"] },
                                        { $toDouble: "$$point.points" },
                                        0
                                    ]
                                }
                            }
                        }
                    },
                    total_debited: {
                        $sum: {
                            $map: {
                                input: "$userPoints",
                                as: "point",
                                in: {
                                    $cond: [
                                        { $eq: ["$$point.point_status", "debited"] },
                                        { $toDouble: "$$point.points" },
                                        0
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    total_balance: { $subtract: ["$total_credited", "$total_debited"] }
                }
            },
            {
                $lookup: {
                    from: "cln_static_user_looking_for_lists",
                    localField: "looking_for_id",
                    foreignField: "_id",
                    as: "info_looking_for_list",
                    pipeline: [
                        {
                            $match: {
                                active_status: true
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                name: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    account_visible_type: 1,
                    user_name: 1,
                    full_name: 1,
                    email_id: 1,
                    mobile_number: 1,
                    country_id: 1,
                    country_mobile_id: 1,
                    login_status: 1,
                    gender: 1,
                    created_date_n_time: 1,
                    referral_user_name: 1,
                    podcast_title: 1,
                    designation_id: 1,
                    approval_status: 1,
                    sub_admin_row_id: 1,
                    claim_status: 1,
                    pro_batch: 1,
                    email_verify_status: 1,
                    about_in_one_line: 1,
                    rejected_date_n_time: 1,
                    location: 1,
                    location_country: 1,
                    total_balance: 1,
                    feed_url: "$social_info.feed_url",
                    website: "$social_info.website",
                    looking_for_id: "$looking_for_id",
                    user_bio: "$user_bio",
                    facebook: "$social_info.facebook",
                    twitter: "$social_info.twitter",
                    linkedin: "$social_info.linkedin",
                    instagram: "$social_info.instagram",
                    video_link: "$social_info.video_link",
                    telegram: "$social_info.telegram",
                    medium: "$social_info.medium",
                    reddit: "$social_info.reddit",
                    other_social_links: "$social_info.other_social_links",
                    youtube_channel: "$social_info.youtube_channel",
                    meta_keywords: "$seo_info.meta_keywords",
                    meta_description: "$seo_info.meta_description",
                    meta_title: "$seo_info.meta_title",
                    vcf_status: "$vcf_status",
                    area: "$info_location.area",
                    city: "$info_location.city",
                    state: "$info_location.state",
                    longitude: "$info_location.longitude",
                    latitude: "$info_location.latitude",
                    designation_list: "$info_designations",
                    looking_for_list: "$info_looking_for_list",
                    country_name: "$info_country.country_name",
                    country_flag: "$info_country.country_flag",
                    country_code: "$info_country.country_code",
                    profile_image: "$info_img.profile_image",
                    push_notification_status: "$info_push_notification.push_notification_status",
                    company_logo: "$company_details.company_logo",
                    company_id: "$company_details.company_id",
                    company_name: "$company_details.company_name",
                    company_row_id: "$company_details._id",
                    professional_profile_score: 1,
                    seo_details_score: 1,
                    social_media_score: 1,
                    academy_score: 1,
                    community_score: 1,
                    professional_detail_score: 1,
                    investment_score: 1,
                    award_score: 1,
                    faq_score: 1,
                    profile_score: 1
                }
            }
        ])

        if (get_query[0]) {
            let result = { ...get_query[0], total_followers: 0 };

            // let api_for_type = 1
            // if (req.query.api_for_type && Number.parseInt(req.query.api_for_type) === 2) {
            //     api_for_type = 2;
            // }

            // if(api_for_type === 2)
            // {
            const users_followers_query = await professionals_followersM.aggregate([
                {
                    $match: {
                        following_user_row_id: user_row_id,
                        confirm_request_status: 2
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals",
                        localField: "follower_user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $project: {
                                    _id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$user_info" } },
                {
                    $count: 'count'
                }
            ])

            if (users_followers_query[0]) {
                result['total_followers'] = users_followers_query[0].count
                if (users_followers_query[0].count > 5000) {
                    const points = await professionals_pointsM.findOne({ user_row_id: user_row_id, point_type: "news_coverage" })
                    if (!points) {
                        const pointEntry = new professionals_pointsM({
                            user_row_id,
                            points: '70',
                            point_type: "news_coverage",
                            point_status: "credited"
                        });
                        await pointEntry.save();
                        await sendNewsCoverageEmail({ email_id: result?.email_id, full_name: result?.full_name })
                    }

                }
                if (users_followers_query[0].count > 2000) {
                    const points = await professionals_pointsM.findOne({ user_row_id: user_row_id, point_type: "team_interviewed" })
                    if (!points) {
                        const pointEntry = new professionals_pointsM({
                            user_row_id,
                            points: '50',
                            point_type: "team_interviewed",
                            point_status: "credited"
                        });
                        await pointEntry.save();
                        await sendInterviewedTeamEmail({ email_id: result?.email_id, full_name: result?.full_name })
                    }
                }
            }
            const getWalletAddress = await users_portfolioM.findOne({ user_row_id: user_row_id, default_type: true })
            if (getWalletAddress) {
                result['wallet_address'] = getWalletAddress?.wallet_address || ""
            }
            const points = await professionals_pointsM.findOne({ user_row_id: user_row_id, point_type: "job_apply_eligibility" })
            if (!points) {
                const postExists = await community_postsM.exists({ post_status: true });
                const certificate_exists = await courses_certificatesM.exists({ user_row_id: user_row_id });

                if (postExists && certificate_exists) {
                    const total_completion = await getUserProfileWithScore(user_row_id)
                    if (total_completion >= 70) {
                        const pointEntry = new professionals_pointsM({
                            user_row_id,
                            points: '40',
                            point_type: "job_apply_eligibility",
                            point_status: "credited"
                        });
                        await pointEntry.save();
                        await sendJobEligibilityEmail({ email_id: result?.email_id, full_name: result?.full_name })
                    }
                }
            }
            const responseTime = Date.now() - startTime;
            logger.info(`getUserIndividualDetails(${user_row_id}) - Response time: ${responseTime}ms`);

            return { status: true, message: result };
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`Error in getUserIndividualDetails: ${error instanceof Error ? error.message : String(error)}, Response time: ${responseTime}ms`);
        return { status: false, message: { alert_message: 'Internal server error.' } };
    }
}

export const getUserSuggestionDetails = async (search_value: string): Promise<ServiceResponse> => {
    const startTime = Date.now();
    try {
        // Check cache first
        const cacheKey = `user_suggestion_${search_value}`;
        const cache_response = await redisCache.getCache({ key: cacheKey });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                user_type: 1,
                cache_response_status: true,
            };
        }

        const get_query = await professionalsM.aggregate([
            { $match: { login_status: 1 } },

            {
                $match: {
                    $or: [
                        { user_name: { $regex: search_value, $options: 'i' } },
                        { full_name: { $regex: search_value, $options: 'i' } }
                    ]
                }
            },

            { $limit: 15 },

            // ✅ Profile Image
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        { $project: { _id: 0, profile_image: 1 } }
                    ],
                    as: "img_info"
                }
            },
            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },

            // ✅ Work Experience (Latest)
            {
                $lookup: {
                    from: "cln_professionals_work_experiences",
                    let: { user_id: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                user_account_type: 1,
                                public_view: true,
                                $expr: {
                                    $eq: ["$user_row_id", "$$user_id"]
                                }
                            }
                        },
                        { $sort: { start_date: -1 } },
                        { $limit: 1 },

                        // ✅ STATIC POSITION
                        {
                            $lookup: {
                                from: "cln_static_professionals_work_positions",
                                let: { pos_id: "$position_row_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ["$_id", "$$pos_id"] }
                                        }
                                    },
                                    { $project: { _id: 0, position_name: 1 } }
                                ],
                                as: "static_position"
                            }
                        },

                        // ✅ MANUAL POSITION
                        {
                            $lookup: {
                                from: "cln_manual_user_positions",
                                let: {
                                    pos_type: "$position_type",
                                    sub_pos_id: "$sub_position_row_id"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$$pos_type", 2] },
                                                    { $eq: ["$_id", "$$sub_pos_id"] }
                                                ]
                                            }
                                        }
                                    },
                                    { $project: { _id: 0, position_name: 1 } }
                                ],
                                as: "manual_position"
                            }
                        },
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

                        // ✅ COMPANY (STATIC)
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    comp_type: "$company_type",
                                    comp_id: "$company_row_id"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                { active_status: 1 },
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$$comp_type", 1] },
                                                            { $eq: ["$_id", "$$comp_id"] }
                                                        ]
                                                    }
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 0,
                                            company_name: 1
                                        }
                                    }
                                ],
                                as: "company"
                            }
                        },

                        // ✅ COMPANY (MANUAL)
                        {
                            $lookup: {
                                from: "cln_company_manual_retrievals",
                                let: { comp_type: "$company_type", comp_id: "$company_row_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$$comp_type", 2] },
                                                    { $eq: ["$_id", "$$comp_id"] }
                                                ]
                                            }
                                        }
                                    },
                                    { $project: { _id: 0, company_name: 1 } }
                                ],
                                as: "manual_company"
                            }
                        },

                        // ✅ FINAL PROJECT
                        {
                            $project: {
                                position_name: {
                                    $ifNull: [
                                        {
                                            $cond: {
                                                if: { $eq: ["$position_type", 2] },
                                                then: { $arrayElemAt: ["$manual_position.position_name", 0] },
                                                else: { $arrayElemAt: ["$static_position.position_name", 0] }
                                            }
                                        },
                                        ""
                                    ]
                                },
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
                                            position_name: {
                                                $ifNull: [
                                                    {
                                                        $cond: {
                                                            if: { $eq: ["$position_type", 2] },
                                                            then: { $arrayElemAt: ["$manual_position.position_name", 0] },
                                                            else: { $arrayElemAt: ["$static_position.position_name", 0] }
                                                        }
                                                    },
                                                    ""
                                                ]
                                            }
                                        }]
                                    }
                                },
                                company_name: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$company.company_name", 0] },
                                        { $arrayElemAt: ["$manual_company.company_name", 0] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "info_work"
                }
            },

            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

            // ✅ FINAL OUTPUT
            {
                $project: {
                    _id: 1,
                    user_name: 1,
                    email_id: 1,
                    full_name: 1,
                    profile_image: "$img_info.profile_image",
                    company_name: "$info_work.company_name",
                    position_name: "$info_work.position_name",
                    positions: "$info_work.positions",
                }
            }
        ]);

        if (get_query.length) {
            const responseTime = Date.now() - startTime;
            logger.info(`getUserSuggestionDetails - Response time: ${responseTime}ms`);
            return { status: true, message: get_query, user_type: 1, response_time: responseTime };
        }
        else {
            const user_manual_query = await professionals_manual_retrievalsM.aggregate([
                {
                    $match: {
                        $or: [
                            { email_id: { $regex: search_value, $options: 'i' } },
                            { full_name: { $regex: search_value, $options: 'i' } }
                        ]
                    }
                },
                { $limit: 15 },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "info_work",
                        pipeline: [
                            { $match: { public_view: true, user_account_type: 2 } },
                            { $limit: 1 },
                            { $project: { position_type: 1, position_row_id: 1, sub_position_row_id: 1, company_type: 1, company_row_id: 1 } },
                            {
                                $lookup: {
                                    from: "cln_static_professionals_work_positions",
                                    localField: "position_row_id",
                                    foreignField: "_id",
                                    as: "info_position",
                                    pipeline: [{ $project: { _id: 0, position_name: 1 } }]
                                }
                            },
                            { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "cln_manual_user_positions",
                                    let: {
                                        position_type: '$position_type',
                                        sub_position_row_id: '$sub_position_row_id'
                                    },
                                    as: "manual_position_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: [2, "$$position_type"] },
                                                        { $eq: ["$_id", "$$sub_position_row_id"] }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                position_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },
                            {
                                $facet: {
                                    company: [
                                        {
                                            $lookup: {
                                                from: "cln_company_lists",
                                                let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                                pipeline: [
                                                    { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                                    { $project: { _id: 0, company_name: 1 } }
                                                ],
                                                as: "info_company"
                                            }
                                        },
                                        { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } }
                                    ],
                                    manual_company: [
                                        {
                                            $lookup: {
                                                from: "cln_company_manual_retrievals",
                                                let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                                                pipeline: [
                                                    { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', "$$company_row_id"] }] } } },
                                                    { $project: { _id: 0, company_name: 1 } }
                                                ],
                                                as: "info_manual_company"
                                            }
                                        },
                                        { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } }
                                    ]
                                }
                            },
                            {
                                $project: {
                                    position_name: { $ifNull: [{ $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } }, ""] },
                                    company_name: { $ifNull: [{ $arrayElemAt: ["$company.info_company.company_name", 0] }, { $arrayElemAt: ["$manual_company.info_manual_company.company_name", 0] }] }
                                }
                            }
                        ],
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        email_id: 1,
                        full_name: 1,
                        profile_image: 1,
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name"
                    }
                }
            ]).allowDiskUse(true);

            const responseTime = Date.now() - startTime;
            logger.info(`getUserSuggestionDetails - Response time: ${responseTime}ms`);
            return { status: true, message: user_manual_query, user_type: 2, response_time: responseTime };
        }

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`getUserSuggestionDetails - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'User suggestion details error:', error: error instanceof Error ? error.message : String(error) });

        return { status: false, message: [], response_time: responseTime };
    }
}

export const getCompanySuggestions = async (searchValue: string) => {
    const startTime = Date.now();

    try {
        // Input validation and sanitization
        if (!searchValue || typeof searchValue !== 'string' || searchValue.trim().length === 0) {
            return {
                status: false,
                message: [],
                company_type: 0,
            };
        }

        // Sanitize search input to prevent injection
        const sanitizedSearch = searchValue.trim().replaceAll(/[<>"']/g, '');
        if (sanitizedSearch.length === 0) {
            return {
                status: false,
                message: [],
                company_type: 0,
            };
        }

        // Search in registered companies first
        const registeredCompaniesQuery = [
            {
                $match: {
                    $and: [
                        { active_status: 1 },
                        { approval_status: 1 },
                        {
                            $or: [
                                { company_id: { $regex: sanitizedSearch, $options: 'i' } },
                                { company_name: { $regex: sanitizedSearch, $options: 'i' } }
                            ]
                        }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    company_id: 1,
                    company_name: 1,
                    company_email_id: 1,
                    company_logo: 1,
                    website_link: 1
                }
            }
        ];

        const registeredCompanies = await companyM
            .aggregate(registeredCompaniesQuery)
            .limit(15)

        if (registeredCompanies.length > 0) {
            // Cache the result
            const responseTime = Date.now() - startTime;
            logger.info(`Company suggestions (registered) fetched: ${responseTime}ms`);

            return {
                status: true,
                message: registeredCompanies,
                company_type: 1,
                cache_response_status: false,
            };
        }

        // If no registered companies found, search in manual retrievals
        const manualCompaniesQuery = [
            {
                $match: {
                    $and: [
                        { approval_status: 0 },
                        {
                            $or: [
                                { company_name: { $regex: sanitizedSearch, $options: 'i' } },
                                { company_email_id: { $regex: sanitizedSearch, $options: 'i' } }
                            ]
                        }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    company_name: 1,
                    company_email_id: 1,
                    company_logo: 1,
                    website_link: 1
                }
            }
        ];

        const manualCompanies = await company_manual_retrievalsM
            .aggregate(manualCompaniesQuery)
            .limit(15)

        const responseTime = Date.now() - startTime;
        logger.info(`Company suggestions (manual) fetched: ${responseTime}ms`);

        return {
            status: true,
            message: manualCompanies,
            company_type: 2,
            response_time: responseTime
        };

    } catch (error: unknown) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        logger.error({
            message: 'Company suggestions error:',
            error: errorMessage,
            search_value: searchValue?.slice(0, 100),
            response_time: responseTime
        });

        return {
            status: false,
            message: [],
            company_type: 0,
            response_time: responseTime
        };
    }
}