const express = require('express')
const router = express.Router()

const { getPresentDateTime, getSocialURL, arrangeValidation } = require('../../utils/helpers/helper')
const { check, validationResult } = require('express-validator')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const eventM = require('../../models/app/events/eventM')
const professionals_followersM = require('../../models/app/professionals_followersM')
const userDesignationM = require('../../models/app/static/user_designationsM')
const companyBusinessModelsM = require('../../models/app/static/company_business_modelsM')
const companyFollowersM = require('../../models/app/company/followersM')
const companyEmployeeRequestM = require('../../models/app/company/employees_requestsM')
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const courses_certificatesM = require('../../models/main/academy/courses_certificatesM')
const { checkAdminLoginToken, checkAllLoginToken } = require('../../middleware/authorization')
const { checkUserLoginToken } = require('../../middleware/authorization')
const coursesM = require('../../models/main/academy/coursesM')
const users_quiz_answersM = require('../../models/main/academy/users_quiz_answersM')
const user_page_trackM = require('../../models/main/academy/user_page_trackM')
const streaksM = require('../../models/main/academy/streaksM')
const professionals_pointsM = require('../../models/app/users/professionals_pointsM')
const community_postsM = require('../../models/main/community/community_postsM')
const { deleteKeysByPattern } = require('../../config/cache_helper')
const { getPositionResolutionStages } = require('../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../modules/funding/funding.queries')

/**
 * Extracted pipeline for GET /user_details/:type/:user_name (person branch).
 * Resolves the professional's most recent public work experience, including
 * position name — now via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions),
 * joined into a single display string via joinPositionNamesExpr. Previously
 * only resolved cln_static_professionals_work_positions, so manually-entered
 * (position_type===2) positions produced a blank position_name.
 */
function buildUserDetailsPersonPipeline(user_name) {
    return [
        { $match: { user_name: user_name } },
        {
            $lookup: {
                from: "cln_professionals_profile_images",
                localField: "_id",
                foreignField: "user_row_id",
                as: "userImage"
            }
        },
        { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_professionals_social_links",
                localField: "_id",
                foreignField: "user_row_id",
                as: "userSocial"
            }
        },
        { $unwind: { path: "$userSocial", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_professionals_work_experiences",
                localField: "_id",
                foreignField: "user_row_id",
                pipeline: [
                    { $match: { public_view: true, user_account_type: 1 } },
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
                                        _id: 1,
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
                                        _id: 1,
                                        company_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            position_name: '$resolved_position_name',
                            company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                        }
                    }
                ],
                as: "info_work",
            }
        },
        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                user_name: 1,
                email_id: 1,
                full_name: 1,
                pro_batch: 1,
                gender: 1,
                position_name: "$info_work.position_name",
                company_name: "$info_work.company_name",
                designation_id: 1,
                user_bio: 1,
                profile_image_type: "$userImage.profile_image_type",
                profile_image: "$userImage.profile_image",
                twitter: "$userSocial.twitter",
                facebook: "$userSocial.facebook",
                linkedin: "$userSocial.linkedin",
                instagram: "$userSocial.instagram",
                telegram: "$userSocial.telegram",
                medium: "$userSocial.medium",
                reddit: "$userSocial.reddit",
                video_link: "$userSocial.video_link",
            }
        }
    ]
}

/**
 * Extracted pipeline for GET /user_details/:type/:user_name (company branch,
 * team_members sub-aggregate). Resolves each team member's position name via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions) joined via joinPositionNamesExpr, instead of
 * the previous static-only lookup.
 */
function buildUserDetailsCompanyTeamMembersPipeline(companyRowId) {
    return [
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
        {
            $lookup:
            {
                from: "cln_professionals",
                let: {
                    user_row_id: '$user_row_id',
                    user_account_type: '$user_account_type'
                },
                as: "user_info",
                pipeline: [
                    {
                        $match: {
                            $and: [
                                {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, "$$user_account_type"] },
                                            { $eq: ["$_id", "$$user_row_id"] }
                                        ]
                                    }
                                },
                                {
                                    login_status: 1
                                }
                            ]
                        }
                    },
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
                        $project: {
                            _id: 1,
                            user_name: 1,
                            full_name: 1,
                            pro_batch: 1,
                            email_id: 1,
                            approval_status: 1,
                            profile_image: "$img_info.profile_image"
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_professionals_manual_retrievals",
                let: {
                    user_row_id: '$user_row_id',
                    user_account_type: '$user_account_type'
                },
                as: "manual_info",
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: [2, "$$user_account_type"] },
                                    { $eq: ["$_id", "$$user_row_id"] }
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            full_name: 1,
                            email_id: 1,
                            profile_image: 1
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
        {
            $set:
            {
                user_data: {
                    $switch: {
                        branches: [
                            {
                                case: {
                                    $and: [
                                        { $eq: ['$user_account_type', 1] }
                                    ]
                                },
                                then: "$user_info"
                            },
                            {
                                case: {
                                    $and: [
                                        { $eq: ['$user_account_type', 2] }
                                    ]
                                },
                                then: "$manual_info"
                            },
                        ],
                        default: ""
                    }
                }
            }
        },
        {
            $match: {
                user_data: { $exists: true, $ne: "" },
                company_type: 1,
                company_row_id: companyRowId,
                till_date_status: 2
            }
        },
        {
            $project: {
                _id: 1,
                user_account_type: 1,
                user_row_id: 1,
                user_name: "$user_data.user_name",
                full_name: "$user_data.full_name",
                pro_batch: "$user_data.pro_batch",
                email_id: "$user_data.email_id",
                profile_image: "$user_data.profile_image",
                user_approval_status: "$user_data.approval_status",
                verified_status: 1,
                verified_on: 1,
                employment_type: 1,
                position_name: "$resolved_position_name",
                location_type: 1,
                start_date: 1,
                responsibilities: 1,
            }
        }
    ]
}


//type 1:user, 2:company
router.get('/user_details/:type/:user_name', async (req, res) => {
    try {
        const type = req.params.type
        const user_name = req.params.user_name
        if (type == 'person') {
            const usersQuery = await professionalsM.aggregate(buildUserDetailsPersonPipeline(user_name))

            if (usersQuery.length > 0) {
                let resultArray = {}
                resultArray['_id'] = usersQuery[0]._id
                resultArray['email_id'] = usersQuery[0].email_id
                resultArray['user_name'] = usersQuery[0].user_name
                resultArray['full_name'] = usersQuery[0].full_name
                resultArray['pro_batch'] = usersQuery[0].pro_batch
                resultArray['gender'] = usersQuery[0].gender
                resultArray['position_name'] = usersQuery[0].position_name
                resultArray['company_name'] = usersQuery[0].company_name
                resultArray['user_bio'] = usersQuery[0].user_bio
                resultArray['profile_image'] = usersQuery[0].profile_image
                resultArray['facebook'] = await getSocialURL(usersQuery[0].facebook, 5)
                resultArray['twitter'] = await getSocialURL(usersQuery[0].twitter, 1)
                resultArray['linkedin'] = usersQuery[0].linkedin
                resultArray['instagram'] = await getSocialURL(usersQuery[0].instagram, 6)
                resultArray['telegram'] = await getSocialURL(usersQuery[0].telegram, 3)
                resultArray['medium'] = await getSocialURL(usersQuery[0].medium, 7)
                resultArray['reddit'] = await getSocialURL(usersQuery[0].reddit, 4)
                resultArray['video_link'] = usersQuery[0].video_link

                resultArray['designations_array'] = []
                if (usersQuery[0].designation_id) {
                    resultArray['designations_array'] = await userDesignationM.find({ _id: { $in: usersQuery[0].designation_id }, active_status: true }, { designation_name: 1 })
                }

                if (!resultArray['profile_image']) {
                    resultArray['profile_image'] = 'default.png'
                }

                resultArray['total_followers'] = 0
                const total_followers = await professionals_followersM.countDocuments({ following_user_row_id: usersQuery[0]._id, confirm_request_status: 2 })
                if (total_followers) {
                    resultArray['total_followers'] = total_followers
                }



                res.json({ status: true, message: resultArray })
            }
            else {
                res.json({ status: false, message: { alert_message: "Invalid username." } })
            }

        }
        else if (type == 'company') {
            const companyQuery = await companyM.findOne({ company_id: user_name }, { _id: 1, business_model_id: 1, company_name: 1, company_id: 1, company_logo: 1, website_link: 1, company_email_id: 1, location_row_id: 1, about_company: 1 })
            if (companyQuery) {
                let resultArray = {}
                resultArray['_id'] = companyQuery._id
                resultArray['company_name'] = companyQuery.company_name
                resultArray['company_id'] = companyQuery.company_id
                resultArray['company_logo'] = companyQuery.company_logo ? companyQuery.company_logo : 'company.png'
                resultArray['website_link'] = companyQuery.website_link
                resultArray['company_email_id'] = companyQuery.company_email_id
                resultArray['business_models'] = []

                resultArray['facebook'] = await getSocialURL(companyQuery.facebook, 5)
                resultArray['twitter'] = await getSocialURL(companyQuery.twitter, 1)
                resultArray['linkedin'] = companyQuery.linkedin
                resultArray['instagram'] = await getSocialURL(companyQuery.instagram, 6)
                resultArray['video_link'] = companyQuery.video_link
                resultArray['telegram'] = await getSocialURL(companyQuery.telegram, 3)
                resultArray['medium'] = await getSocialURL(companyQuery.medium, 7)
                resultArray['reddit'] = await getSocialURL(companyQuery.reddit, 4)
                resultArray['established_in'] = companyQuery.established_in
                resultArray['company_location'] = companyQuery.location

                if (companyQuery.about_company) {
                    resultArray['about_company'] = companyQuery.about_company
                }

                if (companyQuery.business_model_id) {
                    resultArray['business_models'] = await companyBusinessModelsM.find({ _id: { $in: companyQuery.business_model_id }, active_status: true }, { business_name: 1 })
                }


                resultArray['total_followers'] = await companyFollowersM.countDocuments({ company_row_id: companyQuery._id })

                resultArray['team_members'] = await professionals_work_experienceM.aggregate(buildUserDetailsCompanyTeamMembersPipeline(companyQuery._id)).limit(8)


                res.json({ status: true, message: resultArray })
            }
            else {
                res.json({ status: false, message: { alert_message: "Invalid company id." } })
            }

        }
        else {
            res.json({ status: false, message: { alert_message: "Invalid type supplied." } })
        }
    }
    catch (err) {
        console.log('User details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }
})



/**
 * Extracted pipeline for GET /top_profile_list/:category. Resolves each
 * profile's most recent public work experience position name via
 * getPositionResolutionStages() (both cln_static_professionals_work_positions
 * and cln_manual_user_positions), joined via joinPositionNamesExpr, instead
 * of the previous static-only lookup.
 */
function buildTopProfileListPipeline(categoryRowId) {
    return [
        { $match: { designation_id: { $in: [categoryRowId] } } },
        { $sample: { size: 10 } },
        { $sort: { _id: 1 } },
        {
            $lookup: {
                from: "cln_professionals_profile_images",
                localField: "_id",
                foreignField: "user_row_id",
                as: "userImage"
            }
        },
        { $unwind: { path: "$userImage", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_professionals_followers",
                localField: "_id",
                foreignField: "following_user_row_id",
                pipeline: [{ $match: { "confirm_request_status": 2 } }],
                as: "count_following"
            }
        },
        {
            $lookup: {
                from: "cln_static_user_designations",
                localField: "designation_id",
                foreignField: "_id",
                as: "desi"
            }
        },
        {
            $lookup:
            {
                from: "cln_professionals_work_experiences",
                localField: "_id",
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
                as: "info_work",
            }
        },
        { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                user_name: 1,
                email_id: 1,
                full_name: 1,
                pro_batch: 1,
                gender: 1,
                work_position: "$info_work.position_name",
                company_name: "$info_work.company_name",
                profile_image: { $cond: { if: "$userImage.profile_image", then: "$userImage.profile_image", else: "default.png" } },
                total_followers: { $size: "$count_following" },
                designations: "$desi.designation_name"
            }
        }
    ]
}

router.get('/top_profile_list/:category', async (req, res) => {
    try {
        const category = (req.params.category).toLowerCase()
        const categoryQuery = await userDesignationM.findOne({ designation_name: { '$regex': category, $options: 'i' } })
        if (categoryQuery) {
            const category_row_id = categoryQuery._id
            const usersQuery = await professionalsM.aggregate(buildTopProfileListPipeline(category_row_id)).limit(6)

            res.json({ status: true, message: usersQuery })
        }
        else {
            res.json({ status: true, message: { alert_message: "Sorry, Invalid Category Row ID." + category } })
        }
    }
    catch (err) {
        console.log('Top profile list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


/**
 * Extracted pipeline for GET /team_members/:company_id. Resolves each team
 * member's position name via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions),
 * joined via joinPositionNamesExpr, instead of the previous static-only
 * lookup. Deliberately NOT merged with buildUserDetailsCompanyTeamMembersPipeline
 * even though the pipelines are structurally similar — the two are separate
 * routes with independently evolving response shapes.
 */
function buildTeamMembersPipeline(companyRowId) {
    return [
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
        {
            $lookup:
            {
                from: "cln_professionals",
                let: {
                    user_row_id: '$user_row_id',
                    user_account_type: '$user_account_type'
                },
                as: "user_info",
                pipeline: [
                    {
                        $match: {
                            $and: [
                                {
                                    $expr: {
                                        $and: [
                                            { $eq: [1, "$$user_account_type"] },
                                            { $eq: ["$_id", "$$user_row_id"] }
                                        ]
                                    }
                                },
                                {
                                    login_status: 1
                                }
                            ]
                        }
                    },
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
                        $project: {
                            _id: 1,
                            user_name: 1,
                            full_name: 1,
                            pro_batch: 1,
                            email_id: 1,
                            approval_status: 1,
                            profile_image: "$img_info.profile_image"
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
        {
            $lookup:
            {
                from: "cln_professionals_manual_retrievals",
                let: {
                    user_row_id: '$user_row_id',
                    user_account_type: '$user_account_type'
                },
                as: "manual_info",
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: [2, "$$user_account_type"] },
                                    { $eq: ["$_id", "$$user_row_id"] }
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            full_name: 1,
                            pro_batch: 1,
                            email_id: 1,
                            profile_image: 1
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
        {
            $set:
            {
                user_data: {
                    $switch: {
                        branches: [
                            {
                                case: {
                                    $and: [
                                        { $eq: ['$user_account_type', 1] }
                                    ]
                                },
                                then: "$user_info"
                            },
                            {
                                case: {
                                    $and: [
                                        { $eq: ['$user_account_type', 2] }
                                    ]
                                },
                                then: "$manual_info"
                            },
                        ],
                        default: ""
                    }
                }
            }
        },
        {
            $match: {
                user_data: { $exists: true, $ne: "" },
                company_type: 1,
                company_row_id: companyRowId,
                till_date_status: 2
            }
        },
        {
            $project: {
                _id: 1,
                user_account_type: 1,
                user_row_id: 1,
                user_name: "$user_data.user_name",
                full_name: "$user_data.full_name",
                pro_batch: "$user_data.pro_batch",
                email_id: "$user_data.email_id",
                profile_image: "$user_data.profile_image",
                user_approval_status: "$user_data.approval_status",
                verified_status: 1,
                verified_on: 1,
                employment_type: 1,
                position_name: "$resolved_position_name",
                location_type: 1,
                start_date: 1,
                responsibilities: 1,
            }
        }
    ]
}

router.get('/team_members/:company_id', async (req, res) => {
    try {
        //, approval_status:2, active_status:1
        const company_id = req.params.company_id
        const companyQuery = await companyM.findOne({ company_id: company_id }, { _id: 1, user_row_id: 1 })
        if (companyQuery) {
            const resultArray = await professionals_work_experienceM.aggregate(buildTeamMembersPipeline(companyQuery._id)).limit(8)

            res.json({ status: true, message: resultArray })
        }
        else {
            res.json({ status: false, message: { alert_message: "Invalid type supplied." } })
        }
    }
    catch (err) {
        console.log('Team Members.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/companies', async (req, res) => {
    try {
        let query = { approval_status: 1, active_status: 1 }

        const getCompanies = await companyM.aggregate([
            { $match: query },
            { $sample: { size: 5 } },
            {
                $lookup: {
                    from: "cln_company_followers",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "followers_info"
                }
            },
            {
                $project: {
                    _id: 1,
                    business_model_id: 1,
                    company_name: 1,
                    company_logo: 1,
                    total_followers: { $size: "$followers_info" }
                }
            }
        ])

        const businessModelsQuery = await companyBusinessModelsM.find({ active_status: true }, { business_name: 1, _id: 1 })

        if (getCompanies) {

            res.json({ status: true, message: getCompanies, business_models: businessModelsQuery })
        }
        else {
            res.json({ status: false, message: 'Sorry! Invalid Token Id' })
        }
    }
    catch (err) {
        console.log('Companies.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/events', async (req, res) => {
    try {
        let query = { end_date: { $gte: new Date(getPresentDateTime()) }, approval_status: 1, active_status: 1 }
        const getEvents = await eventM.aggregate([
            { $match: query },
            { $sample: { size: 5 } },
            {
                $project: {
                    _id: 1,
                    event_title: 1,
                    event_type: 1,
                    event_image: 1,
                    event_venue: 1,
                    start_date: 1,
                    end_date: 1
                }
            }
        ])
        if (getEvents) {
            res.json({ status: true, message: getEvents })
        }
        else {
            res.json({ status: false, message: 'Sorry! Invalid Token Id' })
        }
    }
    catch (err) {
        console.log('Events.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

// certificate list by user
router.get('/certificate_list', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1]);
        if (!checkUserToken.status) return res.json({ status: false, message: "Unauthorized" });

        let user_row_id = 0;
        if (checkUserToken.message.user_type === 1) {
            user_row_id = checkUserToken.message.user_row_id;
        } else if (req.query.user_row_id && !Number.isNaN(Number.parseInt(req.query.user_row_id))) {
            user_row_id = Number.parseInt(req.query.user_row_id);
        }

        // === Get CERTIFICATE COURSES ===
        const certificates = await courses_certificatesM.aggregate([
            { $match: { user_row_id } },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "profile_info"
                }
            },
            { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },
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
                    certificate_id: "$_id",
                    full_name: "$user_info.full_name",
                    pro_batch: "$user_info.pro_batch",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    course_name: "$course_info.course_name",
                    course_url: "$course_info.course_url",
                    course_description: "$course_info.course_description",
                    course_image: "$course_info.course_image",
                    user_row_id: 1,
                    course_row_id: 1,
                    percentage_score: 1,
                    download_status: 1,
                    date_n_time: 1,
                    certificate_public: 1,
                    score_public: 1,
                    certificate_image_url: 1,
                    certificate_pdf_url: 1,
                    profile_image: "$profile_info.profile_image",
                    course_status: { $literal: "completed" }
                }
            }
        ]);

        // === Get ONGOING/PROGRESS COURSES ===
        const progressCourses = await professionalsM.aggregate([
            { $match: { _id: user_row_id } },
            {
                $lookup: {
                    from: "cln_academy_quiz_lession_started_details",
                    let: { userId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$user_row_id", "$$userId"] },
                                        { $eq: ["$lesson_status", 1] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$course_row_id",
                                completed_lessons: { $sum: 1 }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_academy_courses_lessons",
                                localField: "_id",
                                foreignField: "course_row_id",
                                as: "all_lessons"
                            }
                        },
                        {
                            $addFields: {
                                total_lessons: { $size: "$all_lessons" }
                            }
                        },
                        {
                            $lookup: {
                                from: "cln_academy_courses",
                                localField: "_id",
                                foreignField: "_id",
                                as: "course_info"
                            }
                        },
                        { $unwind: "$course_info" },
                        {
                            $project: {
                                _id: 0,
                                course_row_id: "$_id",
                                course_name: "$course_info.course_name",
                                course_url: "$course_info.course_slug",
                                course_description: "$course_info.course_description",
                                course_image: "$course_info.course_image",
                                total_lessons: 1,
                                completed_lessons: 1,
                                completion_percentage: {
                                    $cond: [
                                        { $eq: ["$total_lessons", 0] },
                                        0,
                                        {
                                            $multiply: [
                                                { $divide: ["$completed_lessons", "$total_lessons"] },
                                                100
                                            ]
                                        }
                                    ]
                                },
                                course_status: {
                                    $cond: [
                                        { $eq: ["$completed_lessons", "$total_lessons"] },
                                        "completed",
                                        "ongoing"
                                    ]
                                }
                            }
                        }
                    ],
                    as: "user_course_status"
                }
            },
            { $unwind: "$user_course_status" },
            { $replaceRoot: { newRoot: "$user_course_status" } }
        ]);

        // === Merge both lists but avoid duplicate completed courses ===
        const completedCourseIds = new Set(certificates.map(c => c.course_row_id.toString()));
        const progressFiltered = progressCourses.filter(
            c => !completedCourseIds.has(c.course_row_id.toString())
        );

        const finalCourses = [...certificates, ...progressFiltered];

        if (finalCourses.length === 0) {
            return res.json({ status: false, message: "No courses found for this user." });
        }

        return res.json({ status: true, message: finalCourses });

    } catch (err) {
        console.error("Certificate List Error:", err);
        res.json({ status: false, message: err.message });
    }
});

router.post('/save_n_update_visibility', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1]);
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }
            const { course_row_id, certificate_public } = req.body;


            if (!user_row_id || !course_row_id) {
                return res.json({ status: false, message: "Missing required fields: user_row_id and course_row_id are required.", user_row_id: { user_row_id, course_row_id } });
            }

            const existingCertificate = await courses_certificatesM.findOne({ user_row_id: user_row_id, course_row_id: course_row_id });

            if (existingCertificate) {

                existingCertificate.certificate_public = Boolean(certificate_public);

                await existingCertificate.save();
                await deleteKeysByPattern('app_user_other_details_*')


                return res.json({
                    status: true,
                    message: "Certificate visibility settings updated successfully.",
                    data: {
                        certificate_id: existingCertificate._id,
                        average_score: existingCertificate.percentage_score,
                        user_row_id: existingCertificate.user_row_id,
                        course_row_id: existingCertificate.course_row_id,
                        certificate_public: existingCertificate.certificate_public,
                        // score_public: existingCertificate.score_public,
                    }
                });
            }
        }
        return res.json({
            status: false,
            message: "Certificate not found for the given user and course.",

        });

    } catch (err) {

        console.error(err.message);
        res.json({ status: false, message: 'An error occurred while saving or updating the certificate.' });
    }
});

router.get('/certificate_visible/:user_row_id', async (req, res) => {
    try {

        let user_row_id = Number.parseInt(req.params.user_row_id)
        if (Number.isNaN(user_row_id)) {
            return res.json({ status: false, message: "Invalid user_row_id" });
        }
        const pipeline = [
            { $match: { user_row_id: user_row_id } },
            { $match: { certificate_public: true } },  // Only allow if certificate is public

            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_profile_images",
                    localField: "user_row_id",
                    foreignField: "user_row_id",
                    as: "profile_info"
                }
            },
            { $unwind: { path: "$profile_info", preserveNullAndEmptyArrays: true } },

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
                    certificate_id: "$_id",
                    course_name: "$course_info.course_name",
                    user_row_id: 1,
                    course_row_id: 1,
                    certificate_image_url: 1,
                    certificate_pdf_url: 1,
                    percentage_score: "$percentage_score",  // Always shown if cert is public
                    date_n_time: 1,
                    profile_image: "$profile_info.profile_image"
                }
            }
        ];

        const certificates = await courses_certificatesM.aggregate(pipeline);

        if (certificates.length === 0) {
            return res.json({ status: false, message: "No certificates found for this user." });
        }

        res.json({ status: true, message: certificates });

    } catch (err) {
        res.json({ status: false, message: err.message });
    }
});


router.post('/save_certificate_urls', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message;
            const { course_row_id, certificate_pdf_url, certificate_image_url } = req.body;

            if (!course_row_id || !certificate_pdf_url || !certificate_image_url) {
                return res.json({ status: false, message: 'Missing required fields: course_row_id, certificate_pdf_url or certificate_image_url' });
            }
            await courses_certificatesM.findOneAndUpdate(
                { user_row_id, course_row_id },
                { user_row_id, course_row_id, certificate_pdf_url, certificate_image_url },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            res.json({ status: true, message: 'Certificate data saved successfully' });
        }
    } catch (err) {

        res.json({ status: false, message: err.message });
    }
});

router.post('/user_page_track', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message;
            const { url, duration, exited_at } = req.body;

            if (!user_row_id || !url || !duration || !exited_at) {
                return res.status(400).json({ status: false, message: 'Missing required fields', body: req.body?.exited_at });
            }

            const entered_at = new Date(new Date(exited_at).getTime() - duration * 1000);

            const newPage = {
                url,
                entered_at,
                left_at: exited_at,
                duration_in_seconds: duration
            };
            const date = new Date()
            const updated_at = date.toISOString().split('T')[0]
            // const updated_at = req.body.updated_at

            await user_page_trackM.findOneAndUpdate(
                { user_row_id, updated_at: updated_at },
                {
                    $push: {
                        page_history: {
                            $each: [newPage],
                            $slice: -20
                        }
                    },
                    updated_at: updated_at
                },
                { upsert: true, new: true }
            );

            return res.json({ status: true, message: "Updated Page track status" });
        } else {
            res.json(checkToken)
        }
    } catch (error) {
        return res.status(500).json({ status: false, message: 'Server error', error: error?.message });
    }
});

router.get('/user_page_track', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message;

            const userTracks = await user_page_trackM.find(
                { user_row_id }
            );

            return res.json({ status: true, message: userTracks });
        } else {
            res.json(checkToken)
        }
    } catch (error) {
        console.error('Error updating page track:', error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
});

router.get('/get_streak', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message;

            const userTracks = await streaksM.find(
                { user_row_id }
            );

            return res.json({ status: true, message: userTracks });
        } else {
            res.json(checkToken)
        }
    } catch (error) {
        console.error('Error updating page track:', error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
});

function getDayStr(date) {
    return new Date(date).toISOString().split("T")[0];
}
function daysBetween(a, b) {
    const one = new Date(a);
    const two = new Date(b);
    return Math.floor((two - one) / (1000 * 60 * 60 * 24));
}
const getDateNDaysAgoString = (n = 3) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0]; // "YYYY-MM-DD"
};
router.get("/user_streak", async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken?.status) {
            const user_row_id = checkUserToken.message;

            const todayStr = getDayStr(new Date());

            const [trackDocs, quizDocs, postDocs, rePostDocs] = await Promise.all([
                user_page_trackM.find({ user_row_id }),
                users_quiz_answersM.find({ user_row_id }).select("date_n_time"),
                community_postsM.find({ user_row_id, is_repost: false }).select("date"),
                community_postsM.find({ is_repost: true, repost_user_row_id: user_row_id }).select("reposted_date")

            ]);
            const activityDates = [];

            trackDocs.forEach(doc => {
                const dailyObj = {};

                doc.page_history.forEach(entry => {
                    const dateStr = entry.entered_at?.toISOString().split("T")[0];
                    if (!dateStr) return;

                    if (!dailyObj[dateStr]) {
                        dailyObj[dateStr] = {
                            totalDuration: 0,
                            urls: []
                        };
                    }

                    if (entry.url && !dailyObj[dateStr].urls.includes(entry.url)) {
                        dailyObj[dateStr].urls.push(entry.url);
                    }

                    dailyObj[dateStr].totalDuration += entry.duration_in_seconds || 0;
                });

                Object.entries(dailyObj).forEach(([date, data]) => {
                    if (data.totalDuration >= 300 || data.urls.length > 2) {
                        activityDates.push(date);
                    }
                });
            });

            const uniqueActivityDates = [...new Set(activityDates)];
            const quizDates = quizDocs.map(doc => getDayStr(doc.date_n_time));
            const postDates = postDocs.map(doc => getDayStr(doc.date));
            const repostDates = rePostDocs.map(doc => getDayStr(doc.reposted_date));


            const allDateSet = new Set([...uniqueActivityDates, ...quizDates, ...postDates, ...repostDates]);
            const sortedDates = [...allDateSet].sort();

            if (sortedDates.length === 0) {
                return res.json({
                    status: true, streak_days: 0, streak_active: false, streak_completed: false,
                    streak_risk: 0
                });
            }

            let streakStartIndex = 0;

            for (let i = 1; i < sortedDates.length; i++) {
                const prev = sortedDates[i - 1];
                const curr = sortedDates[i];
                const diff = daysBetween(prev, curr);

                if (diff > 3) {
                    streakStartIndex = i;
                }
            }

            const currentStreakDates = sortedDates.slice(streakStartIndex);
            const lastActive = currentStreakDates[currentStreakDates.length - 1];
            const daysInactive = daysBetween(lastActive, todayStr);
            if (daysInactive > 3) {
                if (currentStreakDates?.length >= 21) {
                    return res.json({
                        status: true,
                        message: "Streak has ended due to 3+ days of inactivity",
                        streak_days: currentStreakDates?.length,
                        streak_active: false,
                        streak_completed: true,
                        lastActive,
                        streak_risk: 0
                    });
                } else {
                    await streaksM.updateOne(
                        { user_row_id },
                        {
                            $set: {
                                streak_dates: [],
                                updated_at: todayStr,
                                user_row_id
                            }
                        },
                        { upsert: true }
                    );
                    const threeDaysAgoStr = getDateNDaysAgoString(3);

                    await user_page_trackM.deleteMany({
                        user_row_id,
                        updated_at: { $lt: threeDaysAgoStr },
                    });

                    return res.json({
                        status: true,
                        message: "Streak reset due to 3+ days of inactivity",
                        streak_days: 0,
                        streak_active: false,
                        streak_completed: false,
                        lastActive,
                        streak_risk: 0
                    });
                }
            }
            if (currentStreakDates.length >= 21) {
                const pointsquery = await professionals_pointsM.findOne({
                    user_row_id: user_row_id,
                    point_type: "Streaks"
                });

                if (!pointsquery) {
                    const pointEntry = new professionals_pointsM({
                        user_row_id,
                        points: '50',
                        point_type: "Streaks",
                        point_status: "credited"
                    });
                    await pointEntry.save();
                }
            }
            await streaksM.updateOne(
                { user_row_id },
                {
                    $set: {
                        streak_dates: currentStreakDates,
                        updated_at: todayStr,
                        streak_completed_status: currentStreakDates.length >= 21 ? true : false,
                        user_row_id
                    }
                },
                { upsert: true }
            );


            return res.json({
                status: true,
                message: "Streak is active",
                streak_days: currentStreakDates.length,
                streak_active: true,
                streak_completed: currentStreakDates.length >= 21 ? true : false,
                streak_risk: daysInactive
            });
        } else {
            res.json(checkUserToken)
        }
    } catch (err) {
        console.error("User Streak Error:", err);
        res.status(500).json({ status: false, message: "Server error", error: err });
    }
});



module.exports = router
module.exports.buildUserDetailsPersonPipeline = buildUserDetailsPersonPipeline
module.exports.buildUserDetailsCompanyTeamMembersPipeline = buildUserDetailsCompanyTeamMembersPipeline
module.exports.buildTopProfileListPipeline = buildTopProfileListPipeline
module.exports.buildTeamMembersPipeline = buildTeamMembersPipeline