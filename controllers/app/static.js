const express = require('express')
const router = express.Router()
const { setCache, getCache } = require('../../config/cache_helper')
const crypto_networksM = require('../../models/app/static/crypto_networksM')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const countryM = require('../../models/app/static/countryM')
const default_profile_imgM = require('../../models/app/static/default_profile_imgM')
const experience_levelsM = require('../../models/app/static/experience_levelsM')
const social_links_typeM = require('../../models/app/static/social_links_typeM')
const user_designationsM = require('../../models/app/static/user_designationsM')
const user_looking_forM = require('../../models/app/static/user_looking_forM')
const user_skillsM = require('../../models/app/static/user_skillsM')
const company_business_modelsM = require('../../models/app/static/company_business_modelsM')
const job_languageM = require('../../models/app/static/job_languageM')
const job_genderM = require('../../models/app/static/job_genderM')
const jobs_industryM = require('../../models/app/static/jobs_industryM')
const jobs_roleM = require('../../models/app/static/jobs_roleM')
const funding_roundsM = require('../../models/app/static/funding_roundsM')
const contact_typesM = require('../../models/app/static/event_contact_typesM')
const event_sponsor_categoriesM = require('../../models/app/static/event_sponsor_categoriesM')
const event_partners_categoriesM = require('../../models/app/static/event_partners_categoriesM')
const professional_positionsM = require('../../models/app/static/professional_positionsM')
const news_notifications_categoryM = require('../../models/app/static/news_notifications_categoryM')
const event_collaboration_typesM = require('../../models/app/static/event_collaboration_typesM')
const funding_investor_typesM = require('../../models/app/static/funding_investor_typesM')
const revenue_streams_categoryM = require('../../models/app/static/revenue_streams_categoryM')


// funding categories
router.get('/category_list', async (req, res) => {
    try {
        const key = 'app_funding_category_list'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const get_query = await funding_roundsM.find({ active_status: true }, { _id: 1, category_name: 1 })

            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/positions_list', async (req, res) => {
    try {
        const key = 'app_positions_list'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const get_query = await professional_positionsM.find({ active_status: true }, { _id: 1, position_name: 1 }).sort({ position_name: 1 })

            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/company_business_models', async (req, res) => {
    try {
        const key = 'app_company_business_models'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const get_query = await company_business_modelsM.find({ active_status: true }, { _id: 1, business_name: 1 })

            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/funding_investor_types/:investor_type', async (req, res) => {
    try {
        if (!Number.isNaN(Number.parseFloat(req.params.investor_type))) {
            const investor_type = Number.parseFloat(req.params.investor_type)
            if ((investor_type === 1) || (investor_type === 2)) {
                const key = 'app_funding_investor_types_' + investor_type
                const cache_response = await getCache({ key: key })
                if (!cache_response.status) {
                    const get_query = await funding_investor_typesM.find({ investor_type }, { _id: 1, category_name: 1 }).sort({ category_name: 1 })

                    setCache({ key: key, value: get_query, ttl: 1800 })

                    res.json({ status: true, message: get_query, cache_reponse_status: false })
                }
                else {
                    res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
                }
            }
            else {
                res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
            }
        }
        else {
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/revenue_streams_categories', async (req, res) => {
    try {
        const get_query = await revenue_streams_categoryM.find({}, { _id: 1, category_name: 1 }).sort({ category_name: 1 })

        res.json({ status: true, message: get_query })
    }
    catch (err) {
        console.log('revenue_streams_categories types.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/collaboration_types', async (req, res) => {
    try {
        const get_query = await event_collaboration_typesM.find({
            enable_status: { $ne: 0 }  // condition: not disabled
        });

        res.json({ status: true, message: get_query })
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})





router.get('/newsletters_category_list', async (req, res) => {
    try {

        const get_query = await news_notifications_categoryM.find({}, { _id: 1, news_cp_category_row_id: 1, category_name: 1 }).sort({ category_name: 1 })

        res.json({ status: true, message: get_query })

    }
    catch (err) {
        console.log('Newsletter category list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/event_contact_types', async (req, res) => {
    try {
        const key = 'app_event_contact_types'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const get_query = await contact_typesM.find().sort({ _id: 1 })

            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        console.log('Event contact types.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/event_sponsors_categories', async (req, res) => {
    try {
        const key = 'app_event_sponsors_categories'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const get_query = await event_sponsor_categoriesM.find()

            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/event_partners_categories', async (req, res) => {

    try {
        const key = 'app_event_partners_categories'
        const cache_response = await getCache({ key: key })
        if (!cache_response.status) {
            const get_query = await event_partners_categoriesM.find()

            setCache({ key: key, value: get_query, ttl: 1800 })

            res.json({ status: true, message: get_query, cache_reponse_status: false })
        }
        else {
            res.json({ status: true, message: cache_response.message, cache_reponse_status: true })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


router.get('/crypto_networks', async (req, res) => {
    try {
        const queryRun = await crypto_networksM.find().sort({ network_name: 1 })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Crypto networks.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/country', async (req, res) => {
    try {
        const queryRun = await countryM.find()
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Country list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/default_profile_images', async (req, res) => {
    try {
        const queryRun = await default_profile_imgM.find()
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Default profile images.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/experience_levels', async (req, res) => {
    try {
        const queryRun = await experience_levelsM.find()
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Experience levels.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/social_links_type', async (req, res) => {
    try {
        const queryRun = await social_links_typeM.find()
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Social links types.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/user_designations', async (req, res) => {
    try {
        const queryRun = await user_designationsM.find({ active_status: true })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('User deignations.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/user_jobs_profile', async (req, res) => {
    try {
        const queryRun = await user_designationsM.find({ active_status: true, show_in_job_status: 1 })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('User jobs profile.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/user_looking_for', async (req, res) => {
    try {
        const queryRun = await user_looking_forM.find({ active_status: true })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('User looking for.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/user_skills', async (req, res) => {
    try {
        const queryRun = await user_skillsM.find()
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('User skills.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.get('/jobs_genders', async (req, res) => {
    try {
        const queryRun = await job_genderM.find({ active_status: true }, { _id: 1, category_name: 1 })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Jobs genders.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/jobs_languages', async (req, res) => {
    try {
        const queryRun = await job_languageM.find({ active_status: true }, { _id: 1, category_name: 1 })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Jobs language.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/jobs_industry', async (req, res) => {
    try {
        const queryRun = await jobs_industryM.find({ active_status: true }, { _id: 1, category_name: 1 })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Jobs industry.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/jobs_roles', async (req, res) => {
    try {
        const queryRun = await jobs_roleM.find({ active_status: true }, { _id: 1, category_name: 1 })
        res.json({ status: true, message: queryRun })

    }
    catch (err) {
        console.log('Job roles.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/user_suggestions/:user_name', async (req, res) => {
    try {
        const query = { $and: [{ $or: [{ user_name: { $regex: req.params.user_name, $options: 'i' } }, { full_name: { $regex: req.params.user_name, $options: 'i' } }, { email_id: { $regex: req.params.user_name, $options: 'i' } }] }, { login_status: 1 }] }

        const list = await professionalsM.aggregate([
            {
                $match: query
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
                $lookup:
                {
                    from: "cln_professionals_work_experiences",
                    localField: "_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        { $match: { till_date_status: 2, public_view: true } },
                        { $sort: { start_date: -1 } },
                        { $limit: 1 },
                        {
                            $project: {
                                position: 1,
                                company_name: 1,
                                till_date_status: 1
                            }
                        }
                    ],
                    as: "designation_head",
                }
            },
            {
                $addFields: {
                    work_position: {
                        $cond: [
                            { $eq: [{ $size: "$designation_head" }, 0] },
                            "$work_position",
                            { $arrayElemAt: ["$designation_head.position", 0] }
                        ]
                    },
                    company_name: {
                        $cond: [
                            { $eq: [{ $size: "$designation_head" }, 0] },
                            "$company_name",
                            { $arrayElemAt: ["$designation_head.company_name", 0] }
                        ]
                    }
                }
            },
            {
                $project:
                {
                    _id: 1,
                    user_name: 1,
                    email_id: 1,
                    full_name: 1,
                    work_position: 1,
                    company_name: 1,
                    profile_image: "$img_info.profile_image",
                    profile_image_type: "$img_info.profile_image_type"
                }
            }
        ]).limit(20)

        res.json({ status: true, message: list })

    }
    catch (err) {
        console.log('User suggestions.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/company_suggestions/:company_id', async (req, res) => {
    try {
        let query = { company_id: { '$regex': req.params.company_id, $options: 'i' }, approval_status: 1, active_status: 1 }
        const list = await companyM.find(query, { _id: 1, company_id: 1, company_name: 1 }).limit(10)

        res.json({ status: true, message: list })

    }
    catch (err) {
        console.log('Company suggestions.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


module.exports = router