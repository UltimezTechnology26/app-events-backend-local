
const express = require('express')
const router = express.Router()

const { getIntValues, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')

const companyM = require('../../../models/app/company/companyM')
const company_watchlistM = require('../../../models/app/watchlist/companyM')
const { deleteCompanyWatchlist } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern, setCache, getCache } = require('../../../config/cache_helper')
router.get('/add_to_watchlist/:company_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers);

        if (!checkUserToken.status) {
            return res.json(checkUserToken);
        }

        const user_row_id = checkUserToken.message;
        const company_row_id = Number.parseInt(req.params.company_row_id, 10);

        if (Number.isNaN(company_row_id)) {
            return res.json({
                status: false,
                message: {
                    alert_message: 'Sorry, Invalid Company row id'
                }
            });
        }

        // Validate company exists and is active
        const checkCompany = await companyM.findOne(
            {
                _id: company_row_id,
                approval_status: 1,
                active_status: 1
            },
            { _id: 1 }
        );

        if (!checkCompany) {
            return res.json({
                status: false,
                message: {
                    alert_message: 'Sorry, Invalid company row id.'
                }
            });
        }

        // Prevent duplicate insert using single atomic operation
        const existingWatchlist = await company_watchlistM.findOne(
            {
                company_row_id,
                user_row_id
            },
            { _id: 1 }
        );

        if (existingWatchlist) {
            return res.json({
                status: false,
                message: {
                    alert_message: 'Sorry, This company is already added to your watchlist.'
                }
            });
        }

        await company_watchlistM.create({
            company_row_id,
            user_row_id,
            last_email_sent_on: null,
            date_n_time: getPresentDateTime()
        });

        // Parallel cache clearing
        await Promise.all([
            deleteKeysByPattern('company_watchlist_list*'),
            deleteKeysByPattern('app_company_list_*'),
            deleteKeysByPattern('company_list_*'),
            deleteKeysByPattern('app_company_individual_details_*'),
            deleteKeysByPattern('app_company_individual_other_details_*'),
            deleteKeysByPattern('app_front_page_partners_list_*'),
            deleteKeysByPattern('organizers_list_*')
        ]);

        return res.json({
            status: true,
            user_row_id,
            message: {
                alert_message: 'This company is added to your watchlist successfully!'
            }
        });

    } catch (err) {
        console.log('Company add to watchlist.', err.message);

        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});
router.get('/remove_from_watchlist/:company_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers);

        if (!checkUserToken.status) {
            return res.json(checkUserToken);
        }

        const user_row_id = checkUserToken.message;
        const company_row_id = Number.parseInt(req.params.company_row_id, 10);

        if (Number.isNaN(company_row_id)) {
            return res.json({
                status: false,
                message: {
                    alert_message: 'Sorry, Invalid Company row id'
                }
            });
        }

        // ✅ Single DB operation instead of findOne + delete
        const deleted = await company_watchlistM.findOneAndDelete({
            company_row_id,
            user_row_id
        });

        if (!deleted) {
            return res.json({
                status: false,
                message: {
                    alert_message: 'This company is not in your watchlist.'
                }
            });
        }

        // if extra logic exists inside deleteCompanyWatchlist
        await deleteCompanyWatchlist({
            type: 1,
            company_row_id,
            user_row_id
        });

        // ✅ Parallel Redis deletes
        await Promise.all([
            deleteKeysByPattern('company_watchlist_list*'),
            deleteKeysByPattern('app_company_individual_other_details_*'),
            deleteKeysByPattern('app_company_individual_details_*'),
            deleteKeysByPattern('app_front_page_partners_list_*'),
            deleteKeysByPattern('app_company_list_*'),
            deleteKeysByPattern('company_list_*'),
            deleteKeysByPattern('organizers_list_*')
        ]);

        return res.json({
            status: true,
            message: {
                alert_message: 'This company is removed from your watchlist successfully!'
            }
        });

    } catch (err) {
        console.log('Remove from watchlist.', err.message);

        return res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});

router.get('/list/:skip/:limit', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const user_row_id = checkUserToken.message

            let searchArray = [{}]
            if (req.query.search) {
                searchArray.push({ $or: [{ company_name: { '$regex': req.query.search, $options: 'i' } }, { company_id: { '$regex': req.query.search, $options: 'i' } }] })
            }

            if (req.query.business_model_id) {
                const business_model_id_array = await getIntValues(req.query.business_model_id)

                searchArray.push({ business_model_id: { $in: business_model_id_array } })
            }

            if (req.query.location) {
                searchArray.push({ company_location: { $regex: (req.query.location), $options: 'i' } })
            }
            const cacheKey = `company_watchlist_list_${user_row_id}_${skip}_${limit}_${req.query.search || 'all'}_${req.query.business_model_id || 'all'}_${req.query.location || 'all'}`;

            // ✅ Check Redis cache first
            const cache_response = await getCache({ key: cacheKey });
            if (cache_response.status && cache_response.message) {
                return res.json({
                    status: true,
                    message: cache_response.message.data,
                    count: cache_response.message.count,
                    cache_response_status: true
                });
            }

            const watchListQuery = await company_watchlistM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $match: { user_row_id: user_row_id }
                },
                {
                    $lookup: {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    approval_status: 1,
                                    active_status: 1
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "user_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: { $ne: 1 }
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                login_status: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set: {
                                    login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } },
                                }
                            },
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "business_model_id",
                                    foreignField: "_id",
                                    as: "business_info",
                                    pipeline: [{ $project: { business_name: 1 } }]
                                }
                            },
                            {
                                $lookup: {
                                    from: "cln_static_company_business_models",
                                    localField: "main_business_model_id",
                                    foreignField: "_id",
                                    as: "main_business_info",
                                    pipeline: [
                                        {
                                            $project: {
                                                _id: 0,
                                                business_name: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
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
                                $project: {
                                    _id: 1,
                                    describe_in_one_line: 1,
                                    established_in: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_logo: 1,
                                    company_location: 1,
                                    country_id: 1,
                                    business_model_id: 1,
                                    company_size_row_id: 1,
                                    company_valuation: 1,
                                    country_name: "$country_info.country_name",
                                    country_flag: "$country_info.country_flag",
                                    main_business_model_name: "$main_business_info.business_name",
                                    business_name: "$business_info.business_name",
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set:
                    {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_location: "$company_info.company_location",
                        business_model_id: "$company_info.business_model_id",
                    }
                },
                { $match: { $and: searchArray } },
                {
                    $lookup: {
                        from: "cln_company_followers",
                        localField: "company_row_id",
                        foreignField: "company_row_id",
                        as: "followers_info",
                        pipeline: [
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "inner_user_info",
                                    pipeline: [
                                        {
                                            $match: { login_status: 1 }
                                        },
                                        {
                                            $project: {
                                                _id: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$inner_user_info" } },
                            {
                                $count: 'count'
                            }
                        ]
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_company_followers",
                        localField: "company_row_id",
                        foreignField: "company_row_id",
                        pipeline: [{ $match: { "user_row_id": user_row_id } }],
                        as: "info_user_following"
                    }
                },
                { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        company_row_id: 1,
                        company_name: 1,
                        company_id: 1,
                        company_location: 1,
                        company_size_row_id: "$company_info.company_size_row_id",
                        company_valuation: '$company_info.company_valuation',
                        describe_in_one_line: "$company_info.describe_in_one_line",
                        established_in: "$company_info.established_in",
                        company_logo: "$company_info.company_logo",
                        main_business_model_name: "$company_info.main_business_model_name",
                        business_name: "$company_info.business_name",
                        country_flag: "$company_info.country_flag",
                        country_name: "$company_info.country_name",
                        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
                        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },

                    }
                }
            ]).skip(skip).limit(limit)

            const queryCount = await company_watchlistM.aggregate([
                {
                    $match: { user_row_id: user_row_id }
                },
                {
                    $lookup: {
                        from: "cln_company_lists",
                        localField: "company_row_id",
                        foreignField: "_id",
                        as: "company_info",
                        pipeline: [
                            {
                                $match: {
                                    approval_status: 1,
                                    active_status: 1
                                }
                            },
                            {
                                $lookup:
                                {
                                    from: "cln_professionals",
                                    localField: "user_row_id",
                                    foreignField: "_id",
                                    as: "user_info",
                                    pipeline: [
                                        {
                                            $match: {
                                                login_status: { $ne: 1 }
                                            }
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                login_status: 1
                                            }
                                        }
                                    ]
                                }
                            },
                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                            {
                                $set: {
                                    login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } },
                                }
                            },
                            {
                                $match: {
                                    login_status: 1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    company_name: 1,
                                    company_id: 1,
                                    company_location: 1,
                                    business_model_id: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$company_info" } },
                {
                    $set:
                    {
                        company_name: "$company_info.company_name",
                        company_id: "$company_info.company_id",
                        company_location: "$company_info.company_location",
                        business_model_id: "$company_info.business_model_id",
                    }
                },
                { $match: { $and: searchArray } },
                {
                    $count: "count"
                }
            ])
            let totalCount = 0
            if (queryCount[0]) {
                totalCount = queryCount[0].count
            }

            // res.json({ status: true, message: watchListQuery, count: totalCount })
            await setCache({
                key: cacheKey,
                value: { data: watchListQuery, count: totalCount },
                ttl: 1800
            });

            res.json({
                status: true,
                message: watchListQuery,
                count: totalCount,
                cache_response_status: false
            });

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Professional details list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

module.exports = router