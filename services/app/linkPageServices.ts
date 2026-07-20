import professionalsM from '../../models/app/professionalsM';
import redisCache, { CacheDuration } from '../../config/redis';
import logger from '../../config/logger';
import { array_column, createDateTime, createEndDateOnly, getIntIdFromArray, getMinusDates, getSocialURL, user_profile_completed_percentage } from '../../utils/helpers/helper';
import professionals_followersM from '../../models/app/professionals_followersM';
import professionals_work_experienceM from '../../models/app/professionals_work_experienceM';
import user_designationsM from '../../models/app/static/user_designationsM';
import professionals_delete_actionsM from '../../models/app/professionals_delete_actionsM';
import courses_certificatesM from '../../models/main/academy/courses_certificatesM';
import fundingInvestmentM from '../../models/app/funding/fundingInvestmentM';
import { getEventsData, professionalfilterQuery } from '../../utils/helpers/events_helper';
import event_speakersM from '../../models/app/events/event_speakersM';
import event_sponsors_partner_detailsM from '../../models/app/events/event_sponsors_partner_detailsM';
import companyFollowersM from '../../models/app/company/followersM';
import professionals_faqM from '../../models/app/users/professionals_faqM';
import professionals_awardsM from '../../models/app/users/professionals_awardsM';
import countryM from '../../models/app/static/countryM';
import sanitize from 'mongo-sanitize';
import app_exchangeM from '../../models/markets/app_exchangeM';
import { resolveFundsRaisedCompanyStages, syndicateDetectionStages, joinPositionNamesExpr } from '../../modules/funding/funding.queries';
import { getPositionResolutionStages } from '../../modules/work-experience/work-experience.queries';

interface UserDetailsResponse {
    status: boolean;
    message: any;
    cache_response_status?: boolean;
    account_status?: number;
    alert_message?: string;
}

interface ServiceResponse<T = any> {
    status: boolean;
    message: T;
    count?: number;
    top_countries?: any[];
    cache_response_status?: boolean;
    response_time?: number;
}

interface UserDetailParams {
    username: string;
    user_row_id: number;
    query: any;
    headers: any;
}

/**
 * Builds the aggregation pipeline for an investor's public "funds invested"
 * list (used by getUserOtherDetails). Extracted as a pure, exported function so
 * it's independently testable without mocking the rest of getUserOtherDetails'
 * many other dependencies. Reuses the shared resolveFundsRaisedCompanyStages
 * and syndicateDetectionStages builders from modules/funding/funding.queries —
 * this block was previously duplicated inline, field-for-field identical to
 * what those two builders already produce.
 */
export function buildFundsInvestedListPipeline(investorRowId: number, query: any): any[] {
    let raised_search_query: any = [{ verified_status: 1, investor_type: 1, investor_registered_type: 1, investor_row_id: investorRowId }]

    if (query.start_date) {
        const start_date = createDateTime(query.start_date);
        if (start_date) {
            raised_search_query.push({ announcement_date: { $gte: new Date(start_date) } })
        }
    }

    if (query.end_date) {
        const end_date = createEndDateOnly(query.end_date);
        if (end_date) {
            raised_search_query.push({ announcement_date: { $lte: new Date(end_date) } })
        }
    }
    if (query.investor_category_row_id) {
        raised_search_query.push({ investor_category_row_id: Number.parseInt(query.investor_category_row_id) });
    }

    let sort_order: any = { announcement_date: -1 }

    if (!Number.isNaN(Number.parseInt(query.sort_order))) {
        if (query.sort_order == 1) {
            sort_order = { amount: -1 }
        }
        else if (query.sort_order == 2) {
            sort_order = { amount: 1 }
        }
    }

    if (query.category_row_id) {
        raised_search_query.push({ category_row_id: Number.parseInt(query.category_row_id) });
    }

    const pipeline: any[] = [
        { $match: { $and: raised_search_query } },
        { $sort: sort_order },
        {
            $lookup: {
                from: "cln_static_company_funding_rounds",
                localField: "category_row_id",
                foreignField: "_id",
                as: "category_info"
            }
        },
        { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "cln_static_funding_investor_types",
                localField: "investor_category_row_id",
                foreignField: "_id",
                as: "investor_category_info",
                pipeline: [{ $project: { category_name: 1 } }]
            }
        },
        { $unwind: { path: "$investor_category_info", preserveNullAndEmptyArrays: true } },
        ...resolveFundsRaisedCompanyStages({ rich: true }),
        ...syndicateDetectionStages()
    ];

    if (query.search) {
        pipeline.push({
            $match: {
                $or: [
                    { "company_data.company_name": { $regex: query.search, $options: "i" } },
                    { "company_data.company_id": { $regex: query.search, $options: "i" } }
                ]
            }
        });
    }

    pipeline.push({
        $project: {
            _id: 1,
            round_id: 1,
            investor_row_id: 1,
            investor_type: 1,
            investor_registered_type: 1,
            funds_raised_registered_type: 1,
            funds_raised_company_row_id: 1,
            company_approval_status: "$company_data.approval_status",
            company_active_status: "$company_data.active_status",
            company_row_id: "$company_data._id",
            company_name: "$company_data.company_name",
            company_id: "$company_data.company_id",
            company_email_id: "$company_data.company_email_id",
            website_link: "$company_data.website_link",
            company_logo: "$company_data.company_logo",
            announcement_date: 1,
            category_row_id: 1,
            amount: 1,
            investor_category_row_id: 1,
            investor_category_name: "$investor_category_info.category_name",
            category_name: "$category_info.category_name",
            round_investor_count: 1,
            is_syndicate: 1
        }
    });

    return pipeline;
}

/**
 * Builds the $lookup stage that resolves a professional's latest public work
 * experience (position + company) into an `info_work` field. Used identically
 * by report_list_type 2/3/4's list pipelines in getUserListDetails below
 * (previously copy-pasted three times, each only resolving a single
 * position_row_id against cln_static_professionals_work_positions plus a
 * position_type===2 fallback against cln_manual_user_positions — never the
 * full positions[] array, so a professional with multiple job titles only had
 * the first one's resolution source even considered, and multiple titles were
 * never shown). Now splices in getPositionResolutionStages() to resolve the
 * FULL positions[] array via BOTH cln_static_professionals_work_positions and
 * cln_manual_user_positions (with its own legacy-field fallback for
 * pre-migration docs), then joins any multiple resolved names into one display
 * string via joinPositionNamesExpr — mirroring the convention established in
 * modules/funding/funding.queries.ts's richProfessionalNestedLookups. Extracted
 * as a pure, exported function (rather than fixed 3x inline) both to remove the
 * triplicated copy-paste and to make it independently testable.
 */
export function buildLatestWorkExperienceInfoWorkLookup(): any {
    return {
        $lookup: {
            from: "cln_professionals_work_experiences",
            let: { userId: "$user_row_id" },
            pipeline: [
                {
                    $match: {
                        public_view: true,
                        user_account_type: 1
                    }
                },
                {
                    $match: {
                        $expr: { $eq: ["$user_row_id", "$$userId"] }
                    }
                },
                { $sort: { start_date: -1 } },
                { $limit: 1 },

                // ✅ FIXED: resolves the full positions[] array (both static + manual
                // sources, up to 3 titles) instead of a single position_row_id lookup.
                ...getPositionResolutionStages(),
                { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },

                // ✅ COMPANY (REGISTERED)
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
                                            { $eq: ["$$company_type", 1] },
                                            { $eq: ["$_id", "$$company_row_id"] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 0, company_name: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },

                // ✅ COMPANY (MANUAL)
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
                                            { $eq: ["$$company_type", 2] },
                                            { $eq: ["$_id", "$$company_row_id"] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 0, company_name: 1 } }
                        ]
                    }
                },
                { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },

                // ✅ FINAL OUTPUT
                {
                    $project: {
                        position_name: "$resolved_position_name",
                        company_name: {
                            $ifNull: [
                                "$info_company.company_name",
                                "$info_manual_company.company_name"
                            ]
                        }
                    }
                }
            ],
            as: "info_work"
        }
    };
}

/**
 * Builds the $lookup stage resolving a professional's latest public work
 * experience for getPopularProfessionalsDetails' homepage "popular
 * professionals" widget. Previously only resolved position_row_id against
 * cln_static_professionals_work_positions — no cln_manual_user_positions
 * fallback at all (a bigger gap than the report_list_type sections above,
 * which at least had a manual fallback for the single position), and no
 * positions[] support. Now uses getPositionResolutionStages() +
 * joinPositionNamesExpr for the same full multi-position resolution, for
 * consistency with buildLatestWorkExperienceInfoWorkLookup above.
 */
export function buildPopularProfessionalsWorkExperienceLookup(): any {
    return {
        $lookup: {
            from: "cln_professionals_work_experiences",
            let: { userId: "$_id" },
            pipeline: [
                { $match: { $expr: { $eq: ["$user_row_id", "$$userId"] }, public_view: true, user_account_type: 1 } },
                { $sort: { start_date: -1 } },
                { $limit: 1 },

                // ✅ FIXED: resolves the full positions[] array via both static + manual
                // sources instead of a single static-only position_row_id lookup.
                ...getPositionResolutionStages(),
                { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },

                {
                    $lookup: {
                        from: "cln_company_lists",
                        let: { company_type: "$company_type", company_row_id: "$company_row_id" },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: [1, "$$company_type"] }, { $eq: ["$_id", "$$company_row_id"] }] } } },
                            { $project: { _id: 0, company_name: 1 } }
                        ],
                        as: "company_info"
                    }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_company_manual_retrievals",
                        let: { company_type: "$company_type", company_row_id: "$company_row_id" },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: [2, "$$company_type"] }, { $eq: ["$_id", "$$company_row_id"] }] } } },
                            { $project: { _id: 0, company_name: 1 } }
                        ],
                        as: "manual_company_info"
                    }
                },
                { $unwind: { path: "$manual_company_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        position_name: "$resolved_position_name",
                        company_name: {
                            $ifNull: ["$company_info.company_name", "$manual_company_info.company_name"]
                        }
                    }
                }
            ],
            as: "info_work"
        }
    };
}

export const getUserOtherDetails = async ({ username, user_row_id, query, headers }: UserDetailParams): Promise<UserDetailsResponse> => {
    const startTime = Date.now();
    try {
        const key = `app_user_other_details_${username}_${user_row_id}_${JSON.stringify(query)}`;

        // Check redis cache
        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true
            };
        }
        let resultArray: any = {}
        const query_run = await professionalsM.findOne({ login_status: 1, approval_status: 1, user_name: username }, { _id: 1, account_visible_type: 1, designation_id: 1 })
        if (query_run) {
            resultArray['account_user_row_id'] = query_run._id
            let user_following_status = 0
            if ((user_row_id > 0) && (user_row_id != query_run._id)) {
                const present_follow_query = await professionals_followersM.findOne({ following_user_row_id: query_run._id, follower_user_row_id: user_row_id, confirm_request_status: { $exists: true } }, { confirm_request_status: 1, _id: 0 })
                if (present_follow_query) {
                    user_following_status = present_follow_query.confirm_request_status
                }
            }

            if ((Number.parseInt(query_run.account_visible_type) === 2) || (user_following_status === 2) || (query_run._id == user_row_id)) {
                resultArray['account_visible_type'] = query_run.account_visible_type

                let search_query = [{}]
                let sort_value = { end_date: -1 }

                // Own events — independent of the speaker/sponsor/partner lookups below,
                // so kick it off now and let it run concurrently with them.
                const own_events_promise = (async () => {
                    let filter_array = [{ active_status: 1, approval_status: 1, user_row_id: query_run._id, list_event_type: { $in: [1, 3] } }]
                    let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: query, sort: undefined, event_status: undefined })
                    const { list }: any = await getEventsData({
                        sort_value: sort_value,
                        top_filter_array: { $and: top_filter_array },
                        search_query: { $and: search_array },
                        req_query: query,
                        req_params: undefined,
                        req_headers: headers
                    })
                    return list
                })()

                // These three lookups don't depend on each other — run them together.
                const [event_speakers_query, check_sponsors, check_partners] = await Promise.all([
                    event_speakersM.find({ user_row_id: query_run._id, user_type: 1 }, { event_row_id: 1, _id: 0 }).lean().sort({ event_row_id: -1 }),
                    event_sponsors_partner_detailsM.find({ account_type: 1, registered_type: 1, sponsor_partner_type: 1, user_company_row_id: query_run._id }, { event_row_id: 1, _id: 0 }).lean(),
                    event_sponsors_partner_detailsM.find({ account_type: 1, registered_type: 1, sponsor_partner_type: 2, user_company_row_id: query_run._id }, { event_row_id: 1, _id: 0 }).lean()
                ])

                let speakers_events_id = []
                let speaker_status = false
                let speaker_events_promise: Promise<any> = Promise.resolve({ list: [] })
                if (event_speakers_query) {
                    const event_speakers_array = await array_column(event_speakers_query, 'event_row_id')
                    if (event_speakers_array.length) {
                        speakers_events_id = event_speakers_array
                        speaker_status = true
                    }
                    let speaker_filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: speakers_events_id }, list_event_type: { $in: [1, 2, 3] } }]
                    speaker_events_promise = (async () => {
                        let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: speaker_filter_array, search_array: search_query, req_query: query, sort: undefined, event_status: undefined })
                        return getEventsData({
                            sort_value: sort_value,
                            top_filter_array: { $and: top_filter_array },
                            search_query: { $and: search_array },
                            req_query: query,
                            req_params: undefined,
                            req_headers: headers
                        })
                    })()
                }
                resultArray['speaker_status'] = speaker_status

                let sponsor_id = []
                let sponsored_events_promise: Promise<any> = Promise.resolve({ list: [] })
                if (check_sponsors) {
                    const sponsor_array = await array_column(check_sponsors, 'event_row_id')
                    if (sponsor_array.length) {
                        sponsor_id = sponsor_array
                    }
                    let sponsor_filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: sponsor_id }, list_event_type: { $in: [1, 2, 3] } }]
                    sponsored_events_promise = (async () => {
                        let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: sponsor_filter_array, search_array: search_query, req_query: query, sort: undefined, event_status: undefined })
                        return getEventsData({
                            sort_value: sort_value,
                            top_filter_array: { $and: top_filter_array },
                            search_query: { $and: search_array },
                            req_query: query,
                            req_params: undefined,
                            req_headers: headers
                        })
                    })()
                }

                let partner_id = []
                let partnered_events_promise: Promise<any> = Promise.resolve({ list: [] })
                if (check_partners) {
                    const partner_array = await array_column(check_partners, 'event_row_id')
                    if (partner_array.length) {
                        partner_id = partner_array
                    }
                    let partner_filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: partner_id }, list_event_type: { $in: [1, 2, 3] } }]
                    partnered_events_promise = (async () => {
                        let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: partner_filter_array, search_array: search_query, req_query: query, sort: undefined, event_status: undefined })
                        return getEventsData({
                            sort_value: sort_value,
                            top_filter_array: { $and: top_filter_array },
                            search_query: { $and: search_array },
                            req_query: query,
                            req_params: undefined,
                            req_headers: headers
                        })
                    })()
                }

                const [own_events_list, speaker_events_result, sponsored_events_result, partnered_events_result] = await Promise.all([
                    own_events_promise,
                    speaker_events_promise,
                    sponsored_events_promise,
                    partnered_events_promise
                ])

                resultArray['events'] = own_events_list
                resultArray['speaker_events'] = speaker_events_result.list
                resultArray['sponsored_events'] = sponsored_events_result.list
                resultArray['partnered_events'] = partnered_events_result.list

                const users_experience_qery = await professionals_work_experienceM.aggregate([
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
                            approval_status: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.approval_status", else: 0 } },
                            active_status: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.active_status", else: 0 } },
                            company_id: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.company_id", else: "" } },
                            company_email_id: { $cond: { if: { $eq: ["$company_type", 1] }, then: "$company_info.company_email_id", else: "$manual_info.company_email_id" } },
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
                                            $cond: {
                                                if: { $eq: ["$position_type", 2] },
                                                then: "$manual_position_info.position_name",
                                                else: "$info_position.position_name"
                                            }
                                        }
                                    }]
                                }
                            },
                        }
                    },
                    {
                        $match: {
                            user_account_type: 1,
                            company_name: { $nin: ["", null] },
                            user_row_id: query_run._id
                        }
                    },
                    {
                        $project: {
                            user_row_id: 1,
                            position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
                            approval_status: 1,
                            active_status: 1,
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
                            verified_status: 1,
                            company_id: 1,
                            company_email_id: 1,
                            positions: 1,
                        }
                    },
                    {
                        $group: {
                            _id: { company_type: "$company_type", company_row_id: "$company_row_id" },
                            company_id: { $first: "$company_id" },
                            approval_status: { $first: "$approval_status" },
                            active_status: { $first: "$active_status" },
                            company_name: { $first: "$company_name" },
                            company_logo: { $first: "$company_logo" },
                            company_type: { $first: "$company_type" },
                            company_row_id: { $first: "$company_row_id" },
                            professional_details: { $push: "$$ROOT" }
                        }
                    },
                    { $sort: { "professional_details.start_date": -1 } },
                ])

                if (users_experience_qery) {
                    resultArray['user_experience'] = users_experience_qery
                }

                const pipeline = buildFundsInvestedListPipeline(query_run._id, query)

                // 🟢 Run aggregation
                resultArray['funds_invested_list'] = await fundingInvestmentM.aggregate(pipeline);
                resultArray['user_following_status'] = user_following_status
            }


            const account_user_row_id = query_run._id

            const designation_id = query_run.designation_id ? query_run.designation_id : []

            const users_faq_query = professionals_faqM.find({ user_row_id: query_run._id }, { faq_question: 1, faq_answer: 1, _id: 1 }).lean()

            const users_awards_query = professionals_awardsM.find({ user_row_id: query_run._id }, { award_title: 1, award_description: 1, award_image: 1, _id: 1 }).lean().sort({ _id: -1 })

            const similar_users_query = professionalsM.aggregate([
                {
                    $match: {
                        _id: { $ne: account_user_row_id },
                        designation_id: { $in: designation_id },
                        approval_status: 1,
                        login_status: 1,
                        user_name: { $exists: true }
                    }
                },
                { $limit: 100 },
                {
                    $lookup: {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        as: "followers_info",
                        pipeline: [
                            {
                                $lookup:
                                {
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
                        ]
                    }
                },
                { $sort: { "followers_info.count": -1 } },
                { $limit: 20 },
                {
                    $set: {
                        total_followers: "$followers_info.count"
                    }
                },
                {
                    $sort: { total_followers: -1 }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "img_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    profile_image: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        as: "designation_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    designation_name: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        let: {
                            userId: "$_id"
                        },
                        pipeline: [
                            {
                                $match: {
                                    user_account_type: 1,
                                    $or: [
                                        { public_view: true },
                                        { till_date_status: 2 }
                                    ]
                                }
                            },
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$user_row_id", "$$userId"]
                                    }
                                }
                            },

                            // latest work experience first
                            { $sort: { start_date: -1 } },
                            { $limit: 1 },

                            // Static Position
                            {
                                $lookup: {
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
                            {
                                $unwind: {
                                    path: "$info_position",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Manual Position
                            {
                                $lookup: {
                                    from: "cln_manual_user_positions",
                                    let: {
                                        position_type: "$position_type",
                                        sub_position_row_id: "$sub_position_row_id"
                                    },
                                    as: "manual_position_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: ["$$position_type", 2] },
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
                            {
                                $unwind: {
                                    path: "$manual_position_info",
                                    preserveNullAndEmptyArrays: true
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

                            // Registered Company
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
                                                        { $eq: ["$$company_type", 1] },
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
                            {
                                $unwind: {
                                    path: "$info_company",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Manual Company
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
                                                        { $eq: ["$$company_type", 2] },
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
                            {
                                $unwind: {
                                    path: "$info_manual_company",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            {
                                $project: {
                                    position_name: {
                                        $cond: {
                                            if: { $eq: ["$position_type", 2] },
                                            then: "$manual_position_info.position_name",
                                            else: "$info_position.position_name"
                                        }
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
                                                    $cond: {
                                                        if: { $eq: ["$position_type", 2] },
                                                        then: "$manual_position_info.position_name",
                                                        else: "$info_position.position_name"
                                                    }
                                                }
                                            }]
                                        }
                                    },
                                    company_name: {
                                        $ifNull: [
                                            "$info_company.company_name",
                                            "$info_manual_company.company_name"
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "info_work"
                    }
                },
                {
                    $unwind: {
                        path: "$info_work",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "country_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    country_name: 1,
                                    country_flag: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }, { $project: { confirm_request_status: 1 } }],
                        as: "info_user_followed"
                    }
                },
                { $unwind: { path: "$info_user_followed", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        total_followers: 1,
                        user_name: 1,
                        full_name: 1,
                        pro_batch: 1,
                        gender: 1,
                        country_id: 1,
                        account_visible_type: 1,
                        login_status: 1,
                        approval_status: 1,
                        about_in_one_line: 1,
                        designation_array: "$designation_info.designation_name",
                        profile_image: "$img_info.profile_image",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        country_flag: "$country_info.country_flag",
                        country_name: "$country_info.country_name",
                        positions: "$info_work.positions",
                        user_followed_status: { $cond: { if: "$info_user_followed.confirm_request_status", then: "$info_user_followed.confirm_request_status", else: 0 } }
                    }
                }
            ]).limit(4)

            const people_following_query = professionals_followersM.aggregate([
                { $match: { follower_user_row_id: query_run._id, confirm_request_status: 2 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "following_user_row_id",
                        foreignField: "_id",
                        as: "user_info"
                    }
                },
                { $match: { "user_info": { $elemMatch: { "login_status": 1 } } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "following_user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "following_user_row_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "confirm_request_status": 2 } }],
                        as: "count_following"
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "following_user_row_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                        as: "user_followed"
                    }
                },
                { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        let: {
                            userId: "$following_user_row_id"
                        },
                        pipeline: [
                            {
                                $match: {
                                    public_view: true,
                                    user_account_type: 1
                                }
                            },
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$user_row_id", "$$userId"]
                                    }
                                }
                            },

                            // latest work experience first
                            { $sort: { start_date: -1 } },
                            { $limit: 1 },

                            // Static Position
                            {
                                $lookup: {
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
                            {
                                $unwind: {
                                    path: "$info_position",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Manual Position
                            {
                                $lookup: {
                                    from: "cln_manual_user_positions",
                                    let: {
                                        position_type: "$position_type",
                                        sub_position_row_id: "$sub_position_row_id"
                                    },
                                    as: "manual_position_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: ["$$position_type", 2] },
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
                            {
                                $unwind: {
                                    path: "$manual_position_info",
                                    preserveNullAndEmptyArrays: true
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

                            // Registered Company
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
                                                        { $eq: ["$$company_type", 1] },
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
                            {
                                $unwind: {
                                    path: "$info_company",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Manual Company
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
                                                        { $eq: ["$$company_type", 2] },
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
                            {
                                $unwind: {
                                    path: "$info_manual_company",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            {
                                $project: {
                                    position_name: {
                                        $cond: {
                                            if: { $eq: ["$position_type", 2] },
                                            then: "$manual_position_info.position_name",
                                            else: "$info_position.position_name"
                                        }
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
                                                    $cond: {
                                                        if: { $eq: ["$position_type", 2] },
                                                        then: "$manual_position_info.position_name",
                                                        else: "$info_position.position_name"
                                                    }
                                                }
                                            }]
                                        }
                                    },

                                    company_name: {
                                        $ifNull: [
                                            "$info_company.company_name",
                                            "$info_manual_company.company_name"
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "info_work"
                    }
                },
                {
                    $unwind: {
                        path: "$info_work",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: "$user_info._id",
                        profile_image: "$img_info.profile_image",
                        user_name: "$user_info.user_name",
                        user_approval_status: "$user_info.approval_status",
                        full_name: "$user_info.full_name",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        total_followers: { $size: "$count_following" },
                        positions: "$info_work.positions",
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } }
                    }
                }
            ])

            const company_following_query = companyFollowersM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "business_model_id",
                                    foreignField: "_id",
                                    as: "business_info",
                                    pipeline: [{ $match: { "active_status": true } }],
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "main_business_model_id",
                                    foreignField: "_id",
                                    as: "main_business_info"
                                }
                            },
                            { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },

                            {
                                $lookup: {
                                    from: "cln_static_countries",
                                    localField: "country_id",
                                    foreignField: "_id",
                                    as: "co_info"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$co_info",
                                    preserveNullAndEmptyArrays: true
                                }
                            },
                            {
                                $project: {
                                    company_name: 1,
                                    user_row_id: 1,
                                    company_id: 1,
                                    company_logo: 1,
                                    business_model_id: 1,
                                    main_business_model_id: 1,
                                    approval_status: 1,
                                    active_status: 1,
                                    main_business_model_name: "$main_business_info.business_name",
                                    business_name: "$business_info.business_name",

                                    country_name: "$co_info.country_name",
                                    country_flag: "$co_info.country_flag"
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "company_info.user_row_id",
                        foreignField: "_id",
                        as: "company_user_info"
                    }
                },
                { $unwind: { path: "$company_user_info", preserveNullAndEmptyArrays: true } },
                {
                    $set:
                    {
                        login_status: { $cond: { if: "$company_user_info.login_status", then: "$company_user_info.login_status", else: 1 } },
                        approval_status: "$company_info.approval_status",
                        active_status: "$company_info.active_status",
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                    }
                },
                { $match: { user_row_id: query_run._id, login_status: 1, approval_status: 1, active_status: 1 } },
                {
                    $project:
                    {
                        _id: "$company_info._id",
                        following_status: { $cond: { if: '$company_info._id', then: true, else: false } },
                        company_name: 1,
                        company_id: 1,
                        company_logo: "$company_info.company_logo",
                        business_model_id: "$company_info.business_model_id",
                        main_business_model_id: "$company_info.main_business_model_id",
                        main_business_model_name: "$company_info.main_business_model_name",
                        business_name: "$company_info.business_name",
                        country_flag: "$company_info.country_flag",
                        country_name: "$company_info.country_name"

                    }
                }
            ])

            const certificate_details_query = await courses_certificatesM.aggregate([
                { $match: { user_row_id: query_run._id } },
                { $sort: { date_n_time: -1 } },
                {
                    $lookup: {
                        from: "cln_academy_courses",
                        localField: "course_row_id",
                        foreignField: "_id",
                        as: "course_info"
                    }
                },
                { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user_row_id: 1,
                        course_row_id: 1,
                        percentage_score: 1,
                        download_status: 1,
                        date_n_time: 1,
                        certificate_public: 1,
                        score_public: 1,
                        course_name: "$course_info.course_name",
                        course_url: "$course_info.course_slug",
                        expert_tag: "$course_info.expert_tag",
                        certificate_image_url: {
                            $cond: {
                                if: { $eq: ["$certificate_public", true] },
                                then: "$certificate_image_url",
                                else: null
                            }
                        },
                        certificate_pdf_url: {
                            $cond: {
                                if: { $eq: ["$certificate_public", true] },
                                then: "$certificate_pdf_url",
                                else: null
                            }
                        }
                    }
                }
            ]);

            const people_followers_query = professionals_followersM.aggregate([
                {
                    $match: {
                        following_user_row_id: query_run._id, confirm_request_status: 2
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "follower_user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    login_status: 1,
                                    user_name: 1,
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
                    $set: {
                        login_status: "$user_info.login_status",
                    }
                },
                { $match: { login_status: 1 } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "follower_user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_professionals_work_experiences",
                        let: {
                            userId: "$follower_user_row_id"
                        },
                        pipeline: [
                            {
                                $match: {
                                    public_view: true,
                                    user_account_type: 1
                                }
                            },
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$user_row_id", "$$userId"]
                                    }
                                }
                            },

                            // latest work experience first
                            { $sort: { start_date: -1 } },
                            { $limit: 1 },

                            // Static Position
                            {
                                $lookup: {
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
                            {
                                $unwind: {
                                    path: "$info_position",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Manual Position
                            {
                                $lookup: {
                                    from: "cln_manual_user_positions",
                                    let: {
                                        position_type: "$position_type",
                                        sub_position_row_id: "$sub_position_row_id"
                                    },
                                    as: "manual_position_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: ["$$position_type", 2] },
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
                            {
                                $unwind: {
                                    path: "$manual_position_info",
                                    preserveNullAndEmptyArrays: true
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
                            // Registered Company
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
                                                        { $eq: ["$$company_type", 1] },
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
                            {
                                $unwind: {
                                    path: "$info_company",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Manual Company
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
                                                        { $eq: ["$$company_type", 2] },
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
                            {
                                $unwind: {
                                    path: "$info_manual_company",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            {
                                $project: {
                                    position_name: {
                                        $cond: {
                                            if: { $eq: ["$position_type", 2] },
                                            then: "$manual_position_info.position_name",
                                            else: "$info_position.position_name"
                                        }
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
                                                    $cond: {
                                                        if: { $eq: ["$position_type", 2] },
                                                        then: "$manual_position_info.position_name",
                                                        else: "$info_position.position_name"
                                                    }
                                                }
                                            }]
                                        }
                                    },

                                    company_name: {
                                        $ifNull: [
                                            "$info_company.company_name",
                                            "$info_manual_company.company_name"
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "info_work"
                    }
                },
                {
                    $unwind: {
                        path: "$info_work",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $set: {
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        info_work: "$info_work",
                        positions: "$info_work.positions",
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_professionals_followers",
                        localField: "follower_user_row_id",
                        foreignField: "following_user_row_id",
                        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                        as: "user_followed"
                    }
                },
                { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },

                {
                    $project:
                    {
                        _id: "$user_info._id",
                        info_work: 1,
                        user_name: 1,
                        user_row_id: "$user_info._id",
                        full_name: 1,
                        position_name: 1,
                        company_name: 1,
                        positions: 1,
                        follower_user_row_id: 1,
                        following_user_row_id: 1,
                        confirm_request_status: 1,
                        email_id: "$user_info.email_id",
                        user_approval_status: "$user_info.approval_status",
                        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } },
                        profile_image: "$img_info.profile_image"
                    }
                }
            ])

            const [similar_users, users_faq, users_awards, people_following_list, company_following_list, people_followers_list, certificate_details] = await Promise.all([similar_users_query, users_faq_query, users_awards_query, people_following_query, company_following_query, people_followers_query, certificate_details_query])


            resultArray['similar_users'] = similar_users
            resultArray['users_faq'] = users_faq
            resultArray['users_awards'] = users_awards
            resultArray['people_following_list'] = people_following_list
            resultArray['company_following_list'] = company_following_list
            resultArray['people_followers_list'] = people_followers_list
            resultArray['certificate_details'] = certificate_details


            // Cache result
            await redisCache.setCache({ key, value: resultArray, ttl: CacheDuration.TWELVE_HOURS });
            const responseTime = Date.now() - startTime;
            logger.info(`getUserOtherDetails(${username}) - Response time: ${responseTime}ms`);
            return { status: true, message: resultArray, cache_response_status: false };

        }
        else {
            return { status: false, message: { username: 'Sorry, Invalid username.' } }
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`getUserOtherDetails(${username}) - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'User other details error:', error: error instanceof Error ? error.message : String(error) });

        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        };
    }
}


export const getUserDetails = async ({ username, user_row_id }: UserDetailParams): Promise<UserDetailsResponse> => {
    const startTime = Date.now();

    try {
        const key = `app_user_detail_${username}_${user_row_id}`;

        // Try to get from cache first
        const cacheHitResponse = await redisCache.getCache({ key });

        if (cacheHitResponse.status) {
            const responseTime = Date.now() - startTime;
            logger.info(`getUserDetails(${username}) - Response time: ${responseTime}ms (cache hit)`);
            return {
                status: true,
                message: cacheHitResponse.message,
                cache_response_status: true
            };
        }

        // Cache miss - fetch from database
        let resultArray: any = {}
        const query_run = await professionalsM.aggregate([
            { $match: { login_status: 1, approval_status: 1, user_name: username } },
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
                    from: "cln_professionals_social_links",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "social_info"
                }
            },
            { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_seo_details",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "seo_info"
                }
            },
            { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_static_user_looking_for_lists",
                    localField: "looking_for_id",
                    foreignField: "_id",
                    as: "info_looking_for"
                }
            },
            {
                $lookup:
                {
                    from: "cln_static_countries",
                    localField: "country_mobile_id",
                    foreignField: "_id",
                    as: "country_info"
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_static_user_designations",
                    localField: "designation_id",
                    foreignField: "_id",
                    as: "designation_info",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                designation_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    user_name: 1,
                    full_name: 1,
                    email_id: 1,
                    mobile_number: 1,
                    company_name: 1,
                    work_position: 1,
                    designation_id: 1,
                    pro_batch: 1,
                    account_visible_type: 1,
                    about_in_one_line: 1,
                    location: 1,
                    location_country: 1,
                    looking_for_id: 1,
                    designations_array: '$designation_info',
                    feed_url: '$social_info.feed_url',
                    area: '$info_location.area',
                    city: '$info_location.city',
                    state: '$info_location.state',
                    longitude: '$info_location.longitude',
                    latitude: '$info_location.latitude',
                    website: "$social_info.website",
                    vcf_status: 1,
                    profile_image: "$img_info.profile_image",
                    profile_image_type: "$img_info.profile_image_type",
                    user_bio: 1,
                    looking_for: "$info_looking_for.name",
                    country_code: "$country_info.country_code",
                    country_name: "$country_info.country_name",
                    country_flag: "$country_info.country_flag",
                    sub_admin_row_id: 1,
                    claim_status: 1,
                    seo_details: {
                        meta_keywords: "$seo_info.meta_keywords",
                        meta_title: "$seo_info.meta_title",
                        meta_description: "$seo_info.meta_description",
                        og_title: "$seo_info.og_title",
                        og_description: "$seo_info.og_description",
                        twitter_title: "$seo_info.twitter_title",
                        twitter_description: "$seo_info.twitter_description",
                        twitter_creator: "$seo_info.twitter_creator",
                        robots_index: "$seo_info.robots_index",
                        robots_follow: "$seo_info.robots_follow"
                    },
                    profile_scores: {
                        professional_profile_score: "$professional_profile_score",
                        seo_details_score: "$seo_details_score",
                        social_media_score: "$social_media_score",
                        academy_score: "$academy_score",
                        community_score: "$community_score",
                        professional_detail_score: "$professional_detail_score",
                        investment_score: "$investment_score",
                        award_score: "$award_score",
                        faq_score: "$faq_score",
                        profile_score: "$profile_score"
                    },
                    social_links: {
                        facebook: "$social_info.facebook",
                        linkedin: "$social_info.linkedin",
                        twitter: "$social_info.twitter",
                        video_link: "$social_info.video_link",
                        instagram: "$social_info.instagram",
                        telegram: "$social_info.telegram",
                        medium: "$social_info.medium",
                        reddit: "$social_info.reddit",
                        youtube_channel: "$social_info.youtube_channel",
                        feed_url: "$social_info.feed_url"
                    }
                }
            }
        ])

        const responseTime = Date.now() - startTime;
        logger.info(`getUserDetails(${username}) - Response time: ${responseTime}ms (database query completed)`);

        if (query_run[0]) {
            let user_following_status = 0
            if ((user_row_id > 0) && (user_row_id != query_run[0]._id)) {
                const present_follow_query = await professionals_followersM.findOne({ following_user_row_id: query_run[0]._id, follower_user_row_id: user_row_id }, { confirm_request_status: 1 })
                if (present_follow_query) {
                    user_following_status = present_follow_query.confirm_request_status
                }
            }

            if ((Number.parseInt(query_run[0].account_visible_type) === 2) || (user_following_status === 2) || (query_run[0]._id == user_row_id)) {
                resultArray['_id'] = query_run[0]._id
                resultArray['user_name'] = query_run[0].user_name
                resultArray['full_name'] = query_run[0].full_name
                resultArray['pro_batch'] = query_run[0].pro_batch
                resultArray['account_visible_type'] = query_run[0].account_visible_type
                resultArray['email_id'] = query_run[0].email_id
                resultArray['mobile_number'] = query_run[0].mobile_number
                resultArray['country_id'] = query_run[0].country_id
                resultArray['country_mobile_id'] = query_run[0].country_mobile_id
                resultArray['location_country'] = query_run[0].location_country
                resultArray['gender'] = query_run[0].gender
                resultArray['wallet_address'] = query_run[0].wallet_address
                resultArray['created_date_n_time'] = query_run[0].created_date_n_time
                resultArray['designation_id'] = query_run[0].designation_id
                resultArray['profile_image'] = query_run[0].profile_image
                resultArray['profile_image_type'] = query_run[0].profile_image_type
                resultArray['user_bio'] = query_run[0].user_bio
                resultArray['location'] = query_run[0].location
                resultArray['country_code'] = query_run[0].country_code
                resultArray['country_name'] = query_run[0].country_name
                resultArray['country_flag'] = query_run[0].country_flag
                resultArray['sub_admin_row_id'] = 1
                resultArray['claim_status'] = 1
                resultArray['seo_details'] = {
                    meta_keywords: query_run[0].seo_details.meta_keywords,
                    meta_title: query_run[0].seo_details.meta_title,
                    meta_description: query_run[0].seo_details.meta_description,
                    og_title: query_run[0].seo_details.og_title,
                    og_description: query_run[0].seo_details.og_description,
                    twitter_title: query_run[0].seo_details.twitter_title,
                    twitter_description: query_run[0].seo_details.twitter_description,
                    twitter_creator: query_run[0].seo_details.twitter_creator,
                    robots_index: query_run[0].seo_details.robots_index,
                    robots_follow: query_run[0].seo_details.robots_follow
                }
                resultArray['profile_scores'] = {
                    professional_profile_score: query_run[0]?.profile_scores?.professional_profile_score ?? 0,
                    seo_details_score: query_run[0]?.profile_scores?.seo_details_score ?? 0,
                    social_media_score: query_run[0]?.profile_scores?.social_media_score ?? 0,
                    academy_score: query_run[0]?.profile_scores?.academy_score ?? 0,
                    community_score: query_run[0]?.profile_scores?.community_score ?? 0,
                    professional_detail_score: query_run[0]?.profile_scores?.professional_detail_score ?? 0,
                    investment_score: query_run[0]?.profile_scores?.investment_score ?? 0,
                    award_score: query_run[0]?.profile_scores?.award_score ?? 0,
                    faq_score: query_run[0]?.profile_scores?.faq_score ?? 0,
                    profile_score: query_run[0]?.profile_scores?.profile_score ?? 0
                }
                const [facebook_url, twitter_url, instagram_url, telegram_url, medium_url, reddit_url] = await Promise.all([
                    getSocialURL(query_run[0].social_links.facebook, 5),
                    getSocialURL(query_run[0].social_links.twitter, 1),
                    getSocialURL(query_run[0].social_links.instagram, 6),
                    getSocialURL(query_run[0].social_links.telegram, 3),
                    getSocialURL(query_run[0].social_links.medium, 7),
                    getSocialURL(query_run[0].social_links.reddit, 4)
                ])

                resultArray['social_links'] = {
                    facebook: facebook_url,
                    linkedin: query_run[0].social_links.linkedin,
                    twitter: twitter_url,
                    video_link: query_run[0].social_links.video_link,
                    instagram: instagram_url,
                    telegram: telegram_url,
                    medium: medium_url,
                    reddit: reddit_url,
                    youtube_channel: query_run[0].social_links.youtube_channel,
                    feed_url: query_run[0].social_links.feed_url
                }
                resultArray['about_in_one_line'] = query_run[0].about_in_one_line
                resultArray['website'] = query_run[0].website
                resultArray['area'] = query_run[0].area
                resultArray['city'] = query_run[0].city
                resultArray['state'] = query_run[0].state
                resultArray['longitude'] = query_run[0].longitude
                resultArray['latitude'] = query_run[0].latitude
                resultArray['looking_for'] = query_run[0].looking_for
                resultArray['looking_for_id'] = query_run[0].looking_for_id
                resultArray['designations_array'] = query_run[0].designations_array
                resultArray['feed_url'] = query_run[0].feed_url
                resultArray['vcf_status'] = query_run[0].vcf_status
                resultArray['user_following_status'] = user_following_status


                // const counts_update_query = professionalsM.findOneAndUpdate({ _id: query_run[0]._id }, { $inc: { view_counts: 1 } })

                const profile_completed_percentage_query = user_profile_completed_percentage(resultArray)

                const total_followers_query = professionals_followersM.aggregate([
                    { $match: { following_user_row_id: query_run[0]._id, confirm_request_status: 2 } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "follower_user_row_id",
                            foreignField: "_id",
                            as: "user_info"
                        }
                    },
                    { $match: { "user_info": { $elemMatch: { "login_status": 1 } } } },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $count: "count"
                    }
                ])

                const total_following_query = professionals_followersM.aggregate([
                    { $match: { follower_user_row_id: query_run[0]._id, confirm_request_status: 2 } },
                    {
                        $lookup:
                        {
                            from: "cln_professionals",
                            localField: "following_user_row_id",
                            foreignField: "_id",
                            as: "user_info"
                        }
                    },
                    { $match: { "user_info": { $elemMatch: { "login_status": 1 } } } },
                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                    {
                        $count: "count"
                    }
                ])

                const work_experience_query = professionals_work_experienceM.aggregate([
                    {
                        $match: { user_row_id: query_run[0]._id, public_view: true, user_account_type: 1 }
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
                                        company_name: 1,
                                        company_logo: 1
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
                                        company_name: 1,
                                        company_logo: 1,
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                            company_logo: { $cond: { if: "$info_company.company_logo", then: "$info_company.company_logo", else: "$info_manual_company.company_logo" } },
                            position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
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
                                            $cond: {
                                                if: { $eq: ["$position_type", 2] },
                                                then: "$manual_position_info.position_name",
                                                else: "$info_position.position_name"
                                            }
                                        }
                                    }]
                                }
                            },

                        }
                    },
                ]).limit(1)

                const [total_followers, total_following, work_experience, profile_completed_percentage] = await Promise.all([total_followers_query, total_following_query, work_experience_query, profile_completed_percentage_query])

                const additionalQueriesTime = Date.now() - startTime;
                logger.info(`getUserDetails(${username}) - Response time: ${additionalQueriesTime}ms (additional queries completed)`);

                resultArray['profile_completed_percentage'] = profile_completed_percentage

                resultArray['total_followers'] = total_followers[0] ? total_followers[0].count : 0
                resultArray['total_following'] = total_following[0] ? total_following[0].count : 0
                if (work_experience[0]) {
                    resultArray['company_name'] = work_experience[0].company_name
                    resultArray['position_name'] = work_experience[0].position_name
                    resultArray['company_logo'] = work_experience[0].company_logo
                    resultArray['positions'] = work_experience[0].positions



                }


                // resultArray['designations_array'] = []
                // if(query_run[0].designation_id)
                // {
                //     resultArray['designations_array'] = await userDesignationM.find({ _id: { $in: query_run[0].designation_id }, active_status:true },{designation_name:1})
                // }

                // resultArray['looking_for'] = []
                // if(query_run[0].looking_for_id)
                // {
                //     resultArray['looking_for'] = await userLookingForM.find({ _id: { $in: query_run[0].looking_for_id }, active_status:true },{_id:1, name:1})
                // }
                return { status: true, message: resultArray, cache_response_status: false }
            }
            else {
                resultArray['_id'] = query_run[0]._id
                resultArray['user_name'] = query_run[0].user_name
                resultArray['full_name'] = query_run[0].full_name
                resultArray['account_visible_type'] = query_run[0].account_visible_type
                resultArray['profile_image'] = query_run[0].profile_image
                resultArray['profile_image_type'] = query_run[0].profile_image_type
                resultArray['designation_id'] = query_run[0].designation_id
                resultArray['facebook'] = query_run[0].facebook
                resultArray['email_id'] = query_run[0].email_id
                resultArray['twitter'] = query_run[0].twitter
                resultArray['linkedin'] = query_run[0].linkedin
                resultArray['instagram'] = query_run[0].instagram
                resultArray['video_link'] = query_run[0].video_link
                resultArray['telegram'] = query_run[0].telegram
                resultArray['medium'] = query_run[0].medium
                resultArray['reddit'] = query_run[0].reddit
                resultArray['vcf_status'] = query_run[0].vcf_status
                resultArray['claim_status'] = query_run[0].claim_status
                resultArray['alert_message'] = 'This account is private.'
                resultArray['user_bio'] = query_run[0].user_bio
                resultArray['seo_details'] = {
                    meta_keywords: query_run[0].seo_details.meta_keywords,
                    meta_title: query_run[0].seo_details.meta_title,
                    meta_description: query_run[0].seo_details.meta_description,
                    og_title: query_run[0].seo_details.og_title,
                    og_description: query_run[0].seo_details.og_description,
                    twitter_title: query_run[0].seo_details.twitter_title,
                    twitter_description: query_run[0].seo_details.twitter_description,
                    twitter_creator: query_run[0].seo_details.twitter_creator,
                    robots_index: query_run[0].seo_details.robots_index,
                    robots_follow: query_run[0].seo_details.robots_follow
                }
                resultArray['country_code'] = query_run[0].country_code
                resultArray['country_name'] = query_run[0].country_name
                resultArray['country_flag'] = query_run[0].country_flag
                resultArray['designations_array'] = query_run[0].designations_array
                resultArray['looking_for_id'] = query_run[0].looking_for_id
                resultArray['looking_for'] = query_run[0].looking_for
                resultArray['professional_profile_score'] = query_run[0]?.professional_profile_score
                resultArray['seo_details_score'] = query_run[0]?.seo_details_score
                resultArray['social_media_score'] = query_run[0]?.social_media_score
                resultArray['academy_score'] = query_run[0]?.academy_score
                resultArray['community_score'] = query_run[0]?.community_score
                resultArray['professional_detail_score'] = query_run[0]?.professional_detail_score
                resultArray['investment_score'] = query_run[0]?.investment_score
                resultArray['award_score'] = query_run[0]?.award_score
                resultArray['faq_score'] = query_run[0]?.faq_score
                resultArray['profile_score'] = query_run[0]?.profile_score


                const user_designation_head = await professionals_work_experienceM.find({ user_row_id: query_run[0]._id, till_date_status: 2, public_view: true }, { position: 1, company_name: 1, till_date_status: 1 }).sort({ start_date: -1 }).limit(1)
                if (user_designation_head && user_designation_head.length > 0) {
                    resultArray['company_name'] = user_designation_head[0].company_name
                    resultArray['work_position'] = user_designation_head[0].position
                }
                else {
                    resultArray['company_name'] = query_run[0].company_name
                    resultArray['work_position'] = query_run[0].work_position
                    resultArray['positions'] = query_run[0].positions

                }

                // if(query_run[0].profile_image_type > 0) 
                // {   
                //     //default image
                //     const default_image_query = await default_profile_imgM.findOne({_id:query_run[0].profile_image_type})
                //     if(default_image_query)
                //     {
                //         resultArray['profile_image'] = default_image_query['image_name']
                //     }
                // }

                resultArray['designations_array'] = []
                if (query_run[0].designation_id) {
                    resultArray['designations_array'] = await user_designationsM.find({ _id: { $in: query_run[0].designation_id }, active_status: true }, { designation_name: 1 })
                }

                resultArray['user_following_status'] = user_following_status
                await redisCache.setCache({
                    key,
                    value: resultArray,
                    ttl: CacheDuration.THIRTY_MINUTES
                });

                return { status: true, message: resultArray, cache_response_status: false }
            }
        }
        else {
            let result: any = {}
            result['alert_message'] = 'This user account is not valid.'
            result['account_status'] = 0
            //account_status -> 1:Account disabled, 2:Account Deleted
            const get_users_login_status_query = await professionalsM.findOne({ approval_status: 1, login_status: { $in: [0, 2] }, user_name: username }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
            if (get_users_login_status_query) {
                result['account_status'] = 1
                result['alert_message'] = 'This user account is disabled.'
            }

            if (result['account_status'] === 0) {
                const get_users_delete_query = await professionals_delete_actionsM.findOne({ user_name: username, approval_status: 1 }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
                if (get_users_delete_query) {
                    result['account_status'] = 2
                    result['alert_message'] = 'This user account is deleted.'
                }
            }

            const responseTime = Date.now() - startTime;
            logger.info(`getUserDetails(${username}) - Response time: ${responseTime}ms (cache miss - returning response)`);

            return { status: false, message: result, cache_response_status: false }
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        logger.error(`getUserOtherDetails(${username}) - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'User other details error:', error: error instanceof Error ? error.message : String(error) });

        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        };
    }
}

interface UserListDetailsParams {
    user_row_id: number;
    req: any;
    skip: number;
    limit: number;
    report_list_type: number;
}

interface UserListDetailsResponse {
    list: any[];
    count: number;
    top_countries: any[];
}

export const getUserListDetails = async ({ user_row_id, req,
    skip,
    limit, report_list_type }: UserListDetailsParams): Promise<ServiceResponse<any[]>> => {
    const startTime = Date.now();

    // Destructure query parameters
    const {
        search,
        tags,
        location,
        event_type_id,
        category_row_id,
        user_latitude,
        user_longitude
    } = req.query;

    try {
        // -------- Top Countries --------
        const TOP_COUNTRIES_CACHE_KEY = 'users_list_top_countries';
        let finalCountries: any[];
        const countryDetails = await countryM.find(
            {},
            { _id: 1, country_name: 1, country_flag: 1, sortname: 1, country_code: 1 }
        ).lean();

        const top_countries_cache = await redisCache.getCache({ key: TOP_COUNTRIES_CACHE_KEY });
        if (top_countries_cache.status) {
            finalCountries = top_countries_cache.message;
        } else {

            const countryRegexList = countryDetails.map((c: { country_name: string }) => ({
                name: c.country_name,
                regex: new RegExp(`(^|.*\\s|,\\s*)${(c.country_name || '').replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|,|$)`, 'i')
            }));

            const topCountriesAgg = await professionalsM.aggregate([
                {
                    $match: {
                        approval_status: 1,
                        login_status: 1,
                        user_name: { $exists: true, $ne: "" },
                        location: { $exists: true, $ne: "" }
                    }
                },

                // extract country from location using regex logic
                {
                    $addFields: {
                        locationCountries: {
                            $let: {
                                vars: {
                                    match: {
                                        $filter: {
                                            input: countryRegexList,
                                            as: "c",
                                            cond: { $regexMatch: { input: "$location", regex: "$$c.regex" } }
                                        }
                                    }
                                },
                                in: "$$match.name"
                            }
                        }
                    }
                },

                {
                    $match: {
                        locationCountries: { $exists: true, $nin: ["", null] }
                    }
                },

                // Unwind countries array to create separate documents for each country found
                { $unwind: "$locationCountries" },

                {
                    $group: {
                        _id: "$locationCountries",
                        professionalCount: { $sum: 1 }
                    }
                },

                { $sort: { professionalCount: -1 } },
                { $limit: 5 }
            ]);

            finalCountries = topCountriesAgg
                .filter((c: { _id: string | null; professionalCount: number }) => c._id != null && c._id !== "")
                .map((c: { _id: string; professionalCount: number }) => {
                    const details = countryDetails.find((cnt: { country_name: string }) =>
                        cnt.country_name?.toLowerCase() === c._id?.toLowerCase()
                    );
                    return {
                        country_id: details?._id || 0,
                        country_name: details?.country_name || c._id,
                        country_flag: details?.country_flag || "",
                        sortname: details?.sortname || "",
                        country_code: details?.country_code || "",
                        professionalCount: c.professionalCount || 0
                    };
                });

            await redisCache.setCache({ key: TOP_COUNTRIES_CACHE_KEY, value: finalCountries, ttl: 1200 }); // 30 minutes
        }


        // -------- Build filters --------
        let searchArray = [{}];

        if (report_list_type === 1) {
            searchArray.push({
                approval_status: 1,
                login_status: 1,
                user_name: { $exists: true }
            });
        }

        // Optimized search filter
        if (search && typeof search === 'string' && search.trim()) {
            const searchRegex = new RegExp(search.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            searchArray.push({
                $or: [
                    { user_name: { $regex: searchRegex } },
                    { full_name: { $regex: searchRegex } }
                ]
            });
        }

        // Optimized tag filter
        if (tags) {
            let tagsArray: string[] = [];
            if (Array.isArray(tags)) {
                tagsArray = tags.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean);
            } else if (typeof tags === 'string') {
                tagsArray = tags.split(',').map(x => x.trim()).filter(Boolean);
            }

            if (tagsArray.length > 0) {
                const ids = await getIntIdFromArray(tagsArray);
                if (ids && ids.length > 0) {
                    searchArray.push({ designation_id: { $in: ids } });
                }
            }
        }

        // if (req.query.location) {
        //     searchArray.push({ location: { $regex: sanitize(req.query.location), $options: 'i' } });
        // }
        // const searchArray = [];

        if (location) {
            const userInput = sanitize(location.trim());

            const matchedCountry = countryDetails.find(
                (c: { country_name: string }) => c.country_name.toLowerCase() === userInput.toLowerCase()
            );

            let orConditions = [];

            if (matchedCountry) {
                const escapedName = matchedCountry.country_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const strictCountryRegex = new RegExp(`(^|,)\\s*${escapedName}\\s*$`, "i");
                orConditions.push({
                    location: strictCountryRegex
                });

            } else {
                orConditions.push({
                    location: { $regex: userInput, $options: "i" }
                });
            }

            searchArray.push({ $or: orConditions });
        }


        if (report_list_type === 4 && category_row_id) {
            searchArray.push({ category_ids: Number.parseInt(category_row_id) });
        }

        let match_query = {};
        let sort_filter = null;

        if (report_list_type === 2) {
            const eventTypeId = Number.parseInt(event_type_id || '0');
            if (eventTypeId === 1) {
                const start_date = getMinusDates(7);
                if (start_date) {
                    match_query = { start_date: { $gte: new Date(start_date) } };
                }
            } else if (eventTypeId === 2) {
                sort_filter = { $sort: { total_speakers_in_events: -1 } };
            } else if (eventTypeId === 3) {
                sort_filter = { $sort: { total_speakers_in_events: 1 } };
            }
        }

        const query = { $and: searchArray };

        // -------- GEO context --------
        const userLat = user_latitude ? Number.parseFloat(user_latitude) : null;
        const userLon = user_longitude ? Number.parseFloat(user_longitude) : null;
        const isGeoActive = Number.isFinite(userLat) && Number.isFinite(userLon);
        const MAX_DISTANCE_KM = 500;

        let boundingBox = null;
        if (isGeoActive) {
            const latDelta = MAX_DISTANCE_KM / 111;
            const lonDelta = MAX_DISTANCE_KM / (111 * Math.cos(userLat! * Math.PI / 180));
            boundingBox = {
                minLat: userLat! - latDelta,
                maxLat: userLat! + latDelta,
                minLon: userLon! - lonDelta,
                maxLon: userLon! + lonDelta
            };
        }

        // Caching: bypass for geo or heavy search
        const shouldBypassCache = isGeoActive || (searchArray.length > 2);
        const key = `app_users_list_${skip}_${limit}_${report_list_type}_${JSON.stringify(req.query)}_${user_row_id}`;

        if (shouldBypassCache) {
            const { list, count } = await getUsersList({
                user_row_id,
                report_list_type,
                skip,
                limit,
                query,
                match_query,
                sort_filter,
                boundingBox,
                userLat: userLat?.toString() || null,
                userLon: userLon?.toString() || null,
                isGeoActive,
                MAX_DISTANCE_KM
            });

            return {
                status: true,
                message: list,
                count: count,
                top_countries: finalCountries,
                cache_response_status: false
            };
        }

        // Cached path
        const cache_response = await redisCache.getCache({ key });
        if (!cache_response.status) {
            const { list, count } = await getUsersList({
                user_row_id,
                report_list_type,
                skip,
                limit,
                query,
                match_query,
                sort_filter,
                boundingBox,
                userLat: userLat?.toString() || null,
                userLon: userLon?.toString() || null,
                isGeoActive,
                MAX_DISTANCE_KM
            });

            await redisCache.setCache({ key, value: { list, count }, ttl: 1800 });

            const responseTime = Date.now() - startTime;
            logger.info(`getUserListDetails(${user_row_id}) - Response time: ${responseTime}ms`);

            return {
                status: true,
                message: list,
                count,
                top_countries: finalCountries,
                cache_response_status: false,
            };
        }

        // // Return cached response
        return {
            status: true,
            message: cache_response.message.list || [],
            count: cache_response.message.count || 0,
            top_countries: finalCountries,
            cache_response_status: true,
        };

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`getUserListDetails(${user_row_id}) - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'User list details error:', error: error instanceof Error ? error.message : String(error) });

        return {
            status: false,
            message: [],
            count: 0,
            top_countries: [],
        };
    }
}

const getUsersList = async ({
    user_row_id,
    report_list_type,
    skip,
    limit,
    query,
    match_query,
    sort_filter,
    boundingBox = null,
    userLat = null,
    userLon = null,
    isGeoActive = false,
    MAX_DISTANCE_KM = 500
}: {
    user_row_id: number;
    report_list_type: number;
    skip: number;
    limit: number;
    query: any;
    match_query: any;
    sort_filter: any;
    boundingBox?: any;
    userLat?: string | null;
    userLon?: string | null;
    isGeoActive?: boolean;
    MAX_DISTANCE_KM?: number;
}) => {

    const locationLookupWithBBox = (preserveNull = true) => [
        {
            $addFields: {
                latitudeNum: {
                    $convert: {
                        input: "$latitude",
                        to: "double",
                        onError: null,
                        onNull: null
                    }
                },
                longitudeNum: {
                    $convert: {
                        input: "$longitude",
                        to: "double",
                        onError: null,
                        onNull: null
                    }
                }
            }
        },
        ...(boundingBox ? [{
            $match: {
                latitudeNum: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
                longitudeNum: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
            }
        }] : []),
        {
            $addFields: {
                location_info: {
                    latitude: "$latitudeNum",
                    longitude: "$longitudeNum"
                }
            }
        }
    ];

    const addGeoDistance = (latField: string, lonField: string) => [
        {
            $match: {
                [latField]: { $type: "number" },
                [lonField]: { $type: "number" }
            }
        },
        {
            $addFields: {
                distance: {
                    $let: {
                        vars: {
                            lat1: { $toDouble: userLat },
                            lon1: { $toDouble: userLon },
                            lat2: `$${latField}`,
                            lon2: `$${lonField}`
                        },
                        in: {
                            $multiply: [
                                6371,
                                {
                                    $acos: {
                                        $add: [
                                            {
                                                $multiply: [
                                                    { $cos: { $degreesToRadians: "$$lat1" } },
                                                    { $cos: { $degreesToRadians: "$$lat2" } },
                                                    {
                                                        $cos: {
                                                            $subtract: [
                                                                { $degreesToRadians: "$$lon2" },
                                                                { $degreesToRadians: "$$lon1" }
                                                            ]
                                                        }
                                                    }
                                                ]
                                            },
                                            {
                                                $multiply: [
                                                    { $sin: { $degreesToRadians: "$$lat1" } },
                                                    { $sin: { $degreesToRadians: "$$lat2" } }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        },
        { $match: { distance: { $lte: MAX_DISTANCE_KM } } }
    ];

    // ---------------- TYPE 1 ----------------
    if (report_list_type === 1) {
        // base pipeline USED by list + count
        const basePipeline = [
            { $match: query },
            ...locationLookupWithBBox(!boundingBox),
            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "follower_user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info" } },
                        { $group: { _id: null, count: { $sum: 1 } } }
                    ]
                }
            },
            {
                $set: {
                    total_followers: {
                        $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0]
                    }
                }
            },
            ...(isGeoActive
                ? [
                    ...addGeoDistance("location_info.latitude", "location_info.longitude"),
                    { $sort: { distance: 1, _id: 1 } }
                ]
                : [
                    { $sort: { total_followers: -1, _id: 1 } }
                ])
        ];

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "img_info",
                    pipeline: [{ $project: { _id: 0, profile_image: 1 } }]
                }
            },
            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_static_user_designations",
                    localField: "designation_id",
                    foreignField: "_id",
                    as: "designation_info",
                    pipeline: [{ $project: { _id: 0, designation_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { _id: 0, country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    as: "info_user_followed",
                    pipeline: [
                        { $match: { follower_user_row_id: user_row_id } },
                        { $project: { confirm_request_status: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$info_user_followed", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_events_speakers",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "speakers_info",
                    pipeline: [
                        { $match: { user_type: 1 } },
                        {
                            $lookup: {
                                from: "cln_events",
                                localField: "event_row_id",
                                foreignField: "_id",
                                as: "event_info",
                                pipeline: [
                                    { $match: { active_status: 1, approval_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$event_info" } },
                        { $group: { _id: "$user_row_id", total_speakers_in_events: { $sum: 1 } } }
                    ]
                }
            },
            {
                $set: {
                    total_speakers_in_events: {
                        $ifNull: [{ $arrayElemAt: ["$speakers_info.total_speakers_in_events", 0] }, 0]
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_events",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "host_event_info",
                    pipeline: [
                        { $match: { active_status: 1, approval_status: 1, list_event_type: { $in: [1, 3] } } },
                        { $group: { _id: null, count: { $sum: 1 } } }
                    ]
                }
            },
            {
                $set: {
                    total_hosted: {
                        $ifNull: [{ $arrayElemAt: ["$host_event_info.count", 0] }, 0]
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_exchanges",
                    localField: "_id",
                    foreignField: "founder_user_row_id",
                    as: "exchange_info",
                    pipeline: [
                        { $match: { founder_user_type: 1 } },
                        {
                            $group: {
                                _id: "$founder_user_row_id",
                                exchange: {
                                    $push: {
                                        exchange_name: "$exchange_name",
                                        exchange_slug: "$exchange_slug",
                                        exchange_image: "$exchange_image",
                                        total_pairs: "$total_pairs",
                                        total_coins: "$total_coins",
                                        volume_24h: "$volume_24h",
                                    }
                                },
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    exchange: {
                        $ifNull: [{ $arrayElemAt: ["$exchange_info.exchange", 0] }, []]
                    }
                }
            },

            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { investor_id: "$_id" },
                    as: "fundings",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$investor_type", 1] },
                                        { $eq: ["$investor_registered_type", 1] },
                                        { $eq: ["$verified_status", 1] },
                                        { $eq: ["$investor_row_id", "$$investor_id"] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_company_lists",
                                let: {
                                    funds_raised_registered_type: "$funds_raised_registered_type",
                                    funds_raised_company_row_id: "$funds_raised_company_row_id"
                                },
                                as: "company_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $and: [
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [1, "$$funds_raised_registered_type"] },
                                                            { $eq: ["$_id", "$$funds_raised_company_row_id"] }
                                                        ]
                                                    }
                                                },
                                                { active_status: 1 }
                                            ]
                                        }
                                    },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                        {
                            $set: {
                                investor_data: {
                                    $switch: {
                                        branches: [
                                            { case: { $eq: ["$funds_raised_registered_type", 1] }, then: "$company_info._id" },
                                            { case: { $eq: ["$funds_raised_registered_type", 2] }, then: "$funds_raised_company_row_id" }
                                        ],
                                        default: 0
                                    }
                                }
                            }
                        },
                        { $match: { investor_data: { $gt: 0 } } },

                        // Self-lookup: count how many total rows (across all investors) share
                        // this row's round_id, to detect syndicate (multi-investor) rounds.
                        {
                            $lookup: {
                                from: "cln_funding_investment_lists",
                                let: { round_id: "$round_id" },
                                as: "round_investor_rows",
                                pipeline: [
                                    { $match: { $expr: { $eq: ["$round_id", "$$round_id"] } } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },

                        // Exclude syndicate rounds (more than 1 investor sharing round_id) —
                        // same rule applied everywhere else on the investment side: syndicate
                        // amounts are excluded entirely, since this professional's individual
                        // contribution to a shared round isn't known.
                        {
                            $match: {
                                $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                            }
                        },

                        {
                            $group: {
                                _id: "$investor_row_id",
                                total_invested_amount: { $sum: "$amount" },
                                round_ids: { $addToSet: "$round_id" },
                                category_ids: { $addToSet: "$category_row_id" }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_company_funding_rounds",
                                localField: "category_ids",
                                foreignField: "_id",
                                as: "invested_rounds",
                                pipeline: [{ $project: { category_name: 1 } }]
                            }
                        },
                        { $project: { _id: 0, total_invested_amount: 1, invested_rounds: 1, round_ids: 1 } }
                    ]
                }
            },


            {
                $lookup: {
                    from: "cln_professionals_work_experiences",
                    localField: "_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        { $match: { public_view: true, user_account_type: 1 } },
                        { $sort: { start_date: -1 } },
                        { $limit: 1 },

                        // ✅ STATIC POSITION
                        {
                            $lookup: {
                                from: "cln_static_professionals_work_positions",
                                localField: "position_row_id",
                                foreignField: "_id",
                                as: "info_position",
                                pipeline: [{ $project: { _id: 1, position_name: 1 } }]
                            }
                        },
                        { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },

                        // ✅ MANUAL POSITION (FIXED)
                        {
                            $lookup: {
                                from: "cln_manual_user_positions",
                                let: {
                                    position_type: "$position_type",
                                    sub_position_row_id: "$sub_position_row_id"
                                },
                                as: "manual_position_info",
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$$position_type", 2] },
                                                    { $eq: ["$_id", "$$sub_position_row_id"] }
                                                ]
                                            }
                                        }
                                    },
                                    { $project: { _id: 1, position_name: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },

                        // ✅ COMPANY (REGISTERED)
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
                                                    { $eq: ["$$company_type", 1] },
                                                    { $eq: ["$_id", "$$company_row_id"] }
                                                ]
                                            }
                                        }
                                    },
                                    { $project: { _id: 0, company_name: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },

                        // ✅ COMPANY (MANUAL)
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
                                                    { $eq: ["$$company_type", 2] },
                                                    { $eq: ["$_id", "$$company_row_id"] }
                                                ]
                                            }
                                        }
                                    },
                                    { $project: { _id: 0, company_name: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
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

                        // ✅ FINAL OUTPUT (FIXED LOGIC)
                        {
                            $project: {
                                position_name: {
                                    $cond: {
                                        if: { $eq: ["$position_type", 2] },
                                        then: "$manual_position_info.position_name",
                                        else: "$info_position.position_name"
                                    }
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
                                                $cond: {
                                                    if: { $eq: ["$position_type", 2] },
                                                    then: "$manual_position_info.position_name",
                                                    else: "$info_position.position_name"
                                                }
                                            }
                                        }]
                                    }
                                },
                                company_name: {
                                    $ifNull: [
                                        "$info_company.company_name",
                                        "$info_manual_company.company_name"
                                    ] // ✅ CLEANER
                                }
                            }
                        }
                    ],
                    as: "info_work"
                }
            },
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    total_followers: 1,
                    location: 1,
                    location_country: 1,
                    user_name: 1,
                    full_name: 1,
                    gender: 1,
                    country_id: 1,
                    account_visible_type: 1,
                    login_status: 1,
                    approval_status: 1,
                    about_in_one_line: 1,

                    pro_batch: 1,
                    latitude: "$location_info.latitude",
                    longitude: "$location_info.longitude",
                    designation_array: "$designation_info.designation_name",
                    profile_image: "$img_info.profile_image",
                    position_name: "$info_work.position_name",
                    positions: "$info_work.positions",
                    company_name: "$info_work.company_name",
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    user_followed_status: {
                        $cond: {
                            if: "$info_user_followed.confirm_request_status",
                            then: "$info_user_followed.confirm_request_status",
                            else: 0
                        }
                    },
                    total_speakers_in_events: 1,
                    total_hosted: 1,
                    exchange: 1,
                    total_invested_amount: { $arrayElemAt: ["$fundings.total_invested_amount", 0] },
                    invested_rounds: { $arrayElemAt: ["$fundings.invested_rounds.category_name", 0] },
                    ...(isGeoActive ? { distance: "$distance" } : {})
                }
            }
        ];

        const resultDocs = await professionalsM.aggregate(listPipeline)

        const countDocs = await professionalsM.aggregate([
            ...basePipeline,
            { $count: "count" }
        ])

        const count_query = countDocs[0]?.count || 0;

        return { list: resultDocs, count: count_query };
    }

    // ---------------- TYPE 2 ----------------
    if (report_list_type === 2) {
        const baseSort = (sort_filter?.$sort) ? sort_filter.$sort : { _id: 1 };

        const basePipeline = [
            { $match: { user_type: 1 } },
            {
                $lookup: {
                    from: "cln_events",
                    localField: "event_row_id",
                    foreignField: "_id",
                    as: "event_info",
                    pipeline: [
                        { $match: { active_status: 1, approval_status: 1 } },
                        { $project: { _id: 1, start_date: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$event_info" } },
            { $set: { start_date: "$event_info.start_date" } },
            ...(match_query && Object.keys(match_query).length ? [{ $match: match_query }] : []),
            { $group: { _id: "$user_row_id", total_speakers_in_events: { $sum: 1 } } },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1, approval_status: 1, user_name: { $exists: true } } },
                        { $limit: 1 },
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_static_user_designations",
                                localField: "designation_id",
                                foreignField: "_id",
                                as: "designation_info",
                                pipeline: [{ $project: { _id: 0, designation_name: 1 } }]
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_countries",
                                localField: "country_id",
                                foreignField: "_id",
                                as: "country_info",
                                pipeline: [{ $project: { _id: 0, country_name: 1, country_flag: 1, country_id: 1 } }]
                            }
                        },
                        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                        ...locationLookupWithBBox(!boundingBox),
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                designation_id: 1,
                                country_flag: "$country_info.country_flag",
                                country_name: "$country_info.country_name",
                                country_id: 1,
                                location_country: 1,

                                designation_array: "$designation_info.designation_name",
                                approval_status: 1,
                                gender: 1,
                                account_visible_type: 1,
                                about_in_one_line: 1,
                                location: 1,
                                profile_image: "$img_info.profile_image",
                                latitude: "$location_info.latitude",
                                longitude: "$location_info.longitude"
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info" } },

            {
                $set: {
                    user_row_id: "$user_info._id",
                    user_name: "$user_info.user_name",
                    location: "$user_info.location",
                    designation_id: "$user_info.designation_id",
                    full_name: "$user_info.full_name",
                    country_flag: "$user_info.country_flag",
                    country_name: "$user_info.country_name",
                    country_id: "$user_info.country_id",
                    location_country: "$user_info.location_country",
                    designation_array: "$user_info.designation_array",
                    approval_status: "$user_info.approval_status",
                    gender: "$user_info.gender",
                    account_visible_type: "$user_info.account_visible_type",
                    about_in_one_line: "$user_info.about_in_one_line",
                    profile_image: "$user_info.profile_image",
                    latitude: "$user_info.latitude",
                    longitude: "$user_info.longitude"
                }
            },

            { $match: query },

            ...(isGeoActive
                ? [
                    ...addGeoDistance("latitude", "longitude"),
                    { $sort: { distance: 1, _id: 1 } }
                ]
                : [{ $sort: baseSort }])
        ];

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

            {
                $lookup: {
                    from: "cln_events",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "host_event_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    { active_status: 1, approval_status: 1 },
                                    { list_event_type: { $in: [1, 3] } }
                                ]
                            }
                        },
                        { $group: { _id: null, count: { $sum: 1 } } }
                    ]
                }
            },
            buildLatestWorkExperienceInfoWorkLookup(),
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
                    as: "user_followed"
                }
            },
            { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    as: "followers_info",
                    pipeline: [
                        {
                            $lookup: {
                                from: "cln_professionals",
                                localField: "follower_user_row_id",
                                foreignField: "_id",
                                as: "user_info",
                                pipeline: [
                                    { $match: { login_status: 1 } },
                                    { $project: { _id: 1 } }
                                ]
                            }
                        },
                        { $unwind: { path: "$user_info" } },
                        { $group: { _id: null, count: { $sum: 1 } } }
                    ]
                }
            },

            {
                $project: {
                    _id: 1,
                    user_name: 1,
                    full_name: 1,
                    total_speakers_in_events: 1,
                    total_hosted: {
                        $ifNull: [{ $arrayElemAt: ["$host_event_info.count", 0] }, 0]
                    },
                    total_followers: {
                        $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0]
                    },
                    position_name: "$info_work.position_name",
                    company_name: "$info_work.company_name",
                    country_flag: "$country_flag",
                    country_name: "$country_name",
                    country_id: "$country_id",
                    location_country: "$location_country",
                    profile_image: "$profile_image",
                    designation_id: 1,
                    designation_array: "$designation_array",
                    gender: 1,
                    account_visible_type: 1,
                    about_in_one_line: 1,
                    latitude: "$latitude",
                    longitude: "$longitude",
                    user_followed_status: {
                        $cond: {
                            if: "$user_followed.confirm_request_status",
                            then: "$user_followed.confirm_request_status",
                            else: 0
                        }
                    },
                    user_row_id: 1,
                    ...(isGeoActive ? { distance: "$distance" } : {})
                }
            }
        ];

        const docs = await event_speakersM.aggregate(listPipeline)

        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        const cnt = await event_speakersM.aggregate(countPipeline)
        const total_count = cnt[0]?.count || 0;

        return { list: docs, count: total_count };
    }

    // ---------------- TYPE 3 ----------------
    if (report_list_type === 3) {
        const basePipeline = [
            { $match: { founder_user_type: 1 } },
            {
                $group: {
                    _id: '$founder_user_row_id',
                    exchange: {
                        $push: {
                            exchange_name: '$exchange_name',
                            exchange_slug: '$exchange_slug',
                            exchange_image: '$exchange_image',
                            total_pairs: '$total_pairs',
                            total_coins: '$total_coins',
                            volume_24h: '$volume_24h',
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: '_id',
                    foreignField: '_id',
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1 } },
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                gender: 1,
                                location: 1,
                                country_id: 1,
                                designation_id: 1,
                                account_visible_type: 1,
                                login_status: 1,
                                approval_status: 1,
                                about_in_one_line: 1,
                                location_country: 1,

                            }
                        }
                    ]
                }
            },
            { $unwind: { path: '$user_info' } },
            {
                $set: {
                    user_row_id: "$user_info._id",
                    designation_id: '$user_info.designation_id',
                    country_id: '$user_info.country_id',
                    user_name: "$user_info.user_name",
                    location: "$user_info.location",
                    full_name: "$user_info.full_name",
                    gender: "$user_info.gender",
                    account_visible_type: "$user_info.account_visible_type",
                    about_in_one_line: "$user_info.about_in_one_line",
                    location_country: "$user_info.location_country",
                }
            },

            ...locationLookupWithBBox(!boundingBox),

            { $match: query },

            ...(isGeoActive
                ? [
                    ...addGeoDistance("location_info.latitude", "location_info.longitude"),
                    { $sort: { distance: 1, count: -1, _id: 1 } }
                ]
                : [
                    { $sort: { count: -1, _id: 1 } }
                ])
        ];

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "img_info",
                    pipeline: [{ $project: { _id: 0, profile_image: 1 } }]
                }
            },
            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_static_user_designations",
                    localField: "designation_id",
                    foreignField: "_id",
                    as: "designation_info",
                    pipeline: [{ $project: { _id: 0, designation_name: 1 } }]
                }
            },

            buildLatestWorkExperienceInfoWorkLookup(),
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_static_countries",
                    localField: "country_id",
                    foreignField: "_id",
                    as: "country_info",
                    pipeline: [{ $project: { _id: 0, country_name: 1, country_flag: 1 } }]
                }
            },
            { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    pipeline: [
                        { $match: { "follower_user_row_id": user_row_id } },
                        { $project: { confirm_request_status: 1 } }
                    ],
                    as: "info_user_followed"
                }
            },
            { $unwind: { path: "$info_user_followed", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    count: 1,
                    exchange: '$exchange',
                    user_name: '$user_info.user_name',
                    full_name: '$user_info.full_name',
                    location: '$user_info.location',
                    gender: '$user_info.gender',
                    country_id: '$user_info.country_id',
                    location_country: "$user_info.location_country",
                    latitude: "$location_info.latitude",
                    longitude: "$location_info.longitude",
                    account_visible_type: '$user_info.account_visible_type',
                    about_in_one_line: '$user_info.about_in_one_line',
                    designation_array: "$designation_info.designation_name",
                    profile_image: "$img_info.profile_image",
                    position_name: "$info_work.position_name",
                    company_name: "$info_work.company_name",
                    country_flag: "$country_info.country_flag",
                    country_name: "$country_info.country_name",
                    user_followed_status: {
                        $cond: {
                            if: "$info_user_followed.confirm_request_status",
                            then: "$info_user_followed.confirm_request_status",
                            else: 0
                        }
                    },
                    ...(isGeoActive ? { distance: "$distance" } : {})
                }
            }
        ];

        const docs = await app_exchangeM.aggregate(listPipeline)

        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        const count_query = await app_exchangeM.aggregate(countPipeline)
        const total_counts = count_query[0]?.count || 0;

        return { list: docs, count: total_counts };
    }

    // ---------------- TYPE 4 ----------------
    if (report_list_type === 4) {
        const basePipeline = [
            { $match: { investor_type: 1, investor_registered_type: 1, verified_status: 1 } },

            {
                $lookup: {
                    from: "cln_company_lists",
                    let: {
                        funds_raised_registered_type: '$funds_raised_registered_type',
                        funds_raised_company_row_id: '$funds_raised_company_row_id'
                    },
                    as: "company_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$funds_raised_registered_type'] },
                                                { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                                            ]
                                        }
                                    },
                                    { active_status: 1 }
                                ]
                            }
                        },
                        { $project: { _id: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    investor_data: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$funds_raised_registered_type', 1] }, then: '$company_info._id' },
                                { case: { $eq: ['$funds_raised_registered_type', 2] }, then: '$funds_raised_company_row_id' },
                            ],
                            default: 0
                        }
                    }
                }
            },
            { $match: { investor_data: { $gt: 0 } } },

            // Self-lookup: count how many total rows (across all investors) share
            // this row's round_id, to detect syndicate (multi-investor) rounds.
            {
                $lookup: {
                    from: "cln_funding_investment_lists",
                    let: { round_id: "$round_id" },
                    as: "round_investor_rows",
                    pipeline: [
                        { $match: { $expr: { $eq: ["$round_id", "$$round_id"] } } },
                        { $project: { _id: 1 } }
                    ]
                }
            },

            // Exclude syndicate rounds (more than 1 investor sharing round_id) —
            // same rule applied everywhere else on the investment side: syndicate
            // amounts are excluded entirely, since this professional's individual
            // contribution to a shared round isn't known.
            {
                $match: {
                    $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
                }
            },

            {
                $group: {
                    _id: "$investor_row_id",
                    total_invested_amount: { $sum: '$amount' },
                    round_ids: { $addToSet: '$round_id' },
                    category_ids: { $addToSet: '$category_row_id' },
                    funds_raised_ids: { $addToSet: '$funds_raised_company_row_id' }
                }
            },

            {
                $lookup: {
                    from: "cln_static_company_funding_rounds",
                    localField: "category_ids",
                    foreignField: "_id",
                    as: "invested_rounds",
                    pipeline: [{ $project: { category_name: 1 } }]
                }
            },

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $match: { login_status: 1, approval_status: 1, user_name: { $exists: true } } },
                        { $limit: 1 },
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info"
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "cln_static_user_designations",
                                localField: "designation_id",
                                foreignField: "_id",
                                as: "designation_info",
                                pipeline: [{ $project: { _id: 0, designation_name: 1 } }]
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_static_countries",
                                localField: "country_id",
                                foreignField: "_id",
                                as: "country_info",
                                pipeline: [{ $project: { _id: 0, country_name: 1, country_flag: 1 } }]
                            }
                        },
                        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
                        ...locationLookupWithBBox(!boundingBox),
                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                designation_id: 1,
                                country_flag: "$country_info.country_flag",
                                country_name: "$country_info.country_name",
                                country_id: 1,
                                location_country: 1,
                                designation_array: "$designation_info.designation_name",
                                approval_status: 1,
                                gender: 1,
                                account_visible_type: 1,
                                about_in_one_line: 1,
                                location: 1,
                                profile_image: "$img_info.profile_image",
                                latitude: "$location_info.latitude",
                                longitude: "$location_info.longitude",
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$user_info" } },
            {
                $set: {
                    user_row_id: "$user_info._id",

                    designation_id: '$user_info.designation_id',
                    country_id: '$user_info.country_id',
                    user_name: "$user_info.user_name",
                    location: "$user_info.location",
                    full_name: "$user_info.full_name",
                    country_flag: "$user_info.country_flag",
                    country_name: "$user_info.country_name",
                    location_country: "$user_info.location_country",
                    designation_array: "$user_info.designation_array",
                    approval_status: "$user_info.approval_status",
                    gender: "$user_info.gender",
                    account_visible_type: "$user_info.account_visible_type",
                    about_in_one_line: "$user_info.about_in_one_line",
                    profile_image: "$user_info.profile_image",
                    latitude: "$user_info.latitude",
                    longitude: "$user_info.longitude"
                }
            },

            { $match: query },

            ...(isGeoActive
                ? [
                    ...addGeoDistance("latitude", "longitude"),
                    { $sort: { distance: 1, total_invested_amount: -1, _id: 1 } }
                ]
                : [
                    { $sort: { total_invested_amount: -1, _id: 1 } }
                ])
        ];

        const listPipeline = [
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },

            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    pipeline: [
                        { $match: { "follower_user_row_id": user_row_id } },
                        { $project: { confirm_request_status: 1 } }
                    ],
                    as: "info_user_followed"
                }
            },
            { $unwind: { path: "$info_user_followed", preserveNullAndEmptyArrays: true } },
            buildLatestWorkExperienceInfoWorkLookup(),
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    designation_id: 1,
                    total_invested_companies: { $size: '$funds_raised_ids' },
                    total_invested_rounds: { $size: '$round_ids' },
                    category_ids: '$category_ids',
                    total_invested_amount: 1,
                    invested_rounds: '$invested_rounds.category_name',
                    user_name: '$user_name',
                    full_name: '$full_name',
                    location: '$location',
                    gender: '$gender',
                    country_id: '$country_id',
                    account_visible_type: '$account_visible_type',
                    about_in_one_line: '$about_in_one_line',
                    designation_array: "$designation_array",
                    profile_image: "$profile_image",
                    country_flag: "$country_flag",
                    latitude: "$latitude",
                    longitude: "$longitude",
                    country_name: "$country_name",
                    location_country: "$location_country",
                    position_name: "$info_work.position_name",
                    company_name: "$info_work.company_name",
                    user_followed_status: {
                        $cond: {
                            if: "$info_user_followed.confirm_request_status",
                            then: "$info_user_followed.confirm_request_status",
                            else: 0
                        }
                    },
                    ...(isGeoActive ? { distance: "$distance" } : {})
                }
            }
        ];

        const docs = await fundingInvestmentM.aggregate(listPipeline)

        const countPipeline = [
            ...basePipeline,
            { $count: "count" }
        ];

        const count_query = await fundingInvestmentM.aggregate(countPipeline)
        const total_counts = count_query[0]?.count || 0;

        return { list: docs, count: total_counts };
    }

    // default
    return { list: [], count: 0 };
};

export const getPopularProfessionalsDetails = async (): Promise<ServiceResponse> => {
    const startTime = Date.now();
    try {
        const key = 'app_popular_professionals';

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true,
            };
        }

        const result = await professionalsM.aggregate([

            {
                $match: { approval_status: 1, login_status: 1 }
            },

            { $unwind: "$designation_id" },
            {
                $group: { _id: "$designation_id", userCount: { $sum: 1 } }
            },

            {
                $lookup: {
                    from: "cln_static_user_designations",
                    localField: "_id",
                    foreignField: "_id",
                    as: "designation_info",
                    pipeline: [{ $project: { _id: 1, designation_name: 1 } }]
                }
            },
            { $unwind: "$designation_info" },
            { $match: { "designation_info.designation_name": { $ne: "Other" } } },
            { $sort: { userCount: -1 } },
            { $limit: 4 },

            {
                $lookup: {
                    from: "cln_professionals",
                    let: { desigId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $in: [
                                                "$$desigId",
                                                {
                                                    $cond: {
                                                        if: { $isArray: "$designation_id" },
                                                        then: "$designation_id",
                                                        else: []
                                                    }
                                                }
                                            ]
                                        },
                                        { $eq: ["$approval_status", 1] },
                                        { $eq: ["$login_status", 1] }
                                    ]
                                }
                            }
                        },

                        {
                            $lookup: {
                                from: "cln_professionals_followers",
                                localField: "_id",
                                foreignField: "following_user_row_id",
                                as: "followers_info",
                                pipeline: [
                                    { $match: { confirm_request_status: 2 } },
                                    {
                                        $lookup: {
                                            from: "cln_professionals",
                                            localField: "follower_user_row_id",
                                            foreignField: "_id",
                                            as: "user_info",
                                            pipeline: [
                                                { $match: { login_status: 1 } },
                                                { $project: { _id: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: false } },
                                    {
                                        $group: {
                                            _id: null,
                                            count: { $sum: 1 }
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $set: {
                                followers_count: {
                                    $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0]
                                }
                            }
                        },
                        { $sort: { followers_count: -1 } },
                        { $limit: 2 },

                        {
                            $lookup: {
                                from: "cln_static_countries",
                                localField: "country_id",
                                foreignField: "_id",
                                as: "country_info",
                                pipeline: [{ $project: { _id: 0, country_name: 1, country_flag: 1 } }]
                            }
                        },
                        { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },

                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "_id",
                                foreignField: "user_row_id",
                                as: "img_info",
                                pipeline: [{ $project: { _id: 0, profile_image: 1 } }]
                            }
                        },
                        { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },

                        buildPopularProfessionalsWorkExperienceLookup(),
                        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

                        {
                            $project: {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                                followers_count: 1,
                                country_name: "$country_info.country_name",
                                country_flag: "$country_info.country_flag",
                                profile_image: "$img_info.profile_image",
                                position_name: "$info_work.position_name",
                                company_name: "$info_work.company_name"
                            }
                        }
                    ],
                    as: "topUsers"
                }
            },

            {
                $project: {
                    designation_name: "$designation_info.designation_name",
                    topUsers: 1
                }
            }
        ]);


        await redisCache.setCache({
            key,
            value: result,
            ttl: 1800,
        });

        const responseTime = Date.now() - startTime;
        logger.info(`getPopularProfessionalsDetails - Response time: ${responseTime}ms`);

        return {
            status: true,
            message: result,
            cache_response_status: false,
        };

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`getPopularProfessionalsDetails - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'Popular professionals details error:', error: error instanceof Error ? error.message : String(error) });

        return {
            status: false,
            message: [],
            cache_response_status: false,
        };
    }
}

export const getTrendingUsersDetails = async (skip: number = 0, limit: number = 10): Promise<ServiceResponse> => {
    const startTime = Date.now();
    try {
        const key = `app_trending_users_${skip}_${limit}`;

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true,
            };
        }

        const result = await professionalsM.aggregate([
            {
                $match: {
                    login_status: 1,
                    approval_status: 1,
                },
            },
            {
                $lookup: {
                    from: "cln_professionals_followers",
                    localField: "_id",
                    foreignField: "following_user_row_id",
                    as: "followers_info",
                    pipeline: [
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
                        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: false } },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            },
            {
                $set: {
                    followers_count: { $ifNull: [{ $arrayElemAt: ["$followers_info.count", 0] }, 0] }
                }
            },
            { $sort: { followers_count: -1, _id: 1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "img_info",
                    pipeline: [{ $project: { _id: 0, profile_image: 1 } }]
                },
            },
            {
                $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true },
            },
            {
                $project: {
                    _id: 1,
                    user_name: 1,
                    full_name: 1,
                    pro_batch: 1,
                    profile_image: "$img_info.profile_image",
                    followers_count: 1,
                },
            },
        ])

        await redisCache.setCache({
            key,
            value: result,
            ttl: 1800,
        });

        const responseTime = Date.now() - startTime;
        logger.info(`getTrendingUsersDetails - Response time: ${responseTime}ms`);

        return {
            status: true,
            message: result,
            cache_response_status: false,
            response_time: responseTime
        };

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`getTrendingUsersDetails - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'Trending users details error:', error: error instanceof Error ? error.message : String(error) });

        return {
            status: false,
            message: [],
            cache_response_status: false,
        };
    }
}

export const getSearchUsersDetails = async (search: string, limit: number = 10): Promise<ServiceResponse> => {
    const startTime = Date.now();
    try {
        const key = `app_search_users_${search}_${limit}`;

        const cache_response = await redisCache.getCache({ key });
        if (cache_response.status) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true,
            };
        }

        if (!search) {
            return {
                status: false,
                message: [],
                cache_response_status: false,
            };
        }

        const query = {
            $and: [
                { approval_status: 1, login_status: 1 },
                {
                    $or: [
                        { user_name: { $regex: search, $options: "i" } },
                        { full_name: { $regex: search, $options: "i" } },
                        { email_id: { $regex: search, $options: "i" } }
                    ]
                }
            ]
        };

        const result = await professionalsM.aggregate([
            { $match: query },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "img_info",
                    pipeline: [{ $project: { _id: 0, profile_image: 1 } }]
                },
            },
            {
                $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    _id: 1,
                    user_name: 1,
                    full_name: 1,
                    email_id: 1,
                    about_in_one_line: 1,
                    profile_image: "$img_info.profile_image",
                }
            },
            { $sort: { _id: -1 } },
            { $limit: limit }
        ])

        await redisCache.setCache({
            key,
            value: result,
            ttl: 1800,
        });

        const responseTime = Date.now() - startTime;
        logger.info(`getSearchUsersDetails - Response time: ${responseTime}ms`);

        return {
            status: true,
            message: result,
            cache_response_status: false,
        };

    } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error(`getSearchUsersDetails - Response time: ${responseTime}ms (error)`);
        logger.error({ message: 'Search users details error:', error: error instanceof Error ? error.message : String(error) });

        return {
            status: false,
            message: [],
            cache_response_status: false,
        };
    }
}
