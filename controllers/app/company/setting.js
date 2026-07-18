const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const randomstring = require("randomstring")
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, validateAndSaveImage, getIntIdFromArray, company_profile_completed_percentage, deleteImageDigitalOcean, removeHtmltag } = require('../../../utils/helpers/helper')
const { checkUserLoginToken, generateUserLoginToken, verifyEmailTempToken, checkApiKey, checkAllLoginToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const { checkCompanyRowID, calculateCompanyProfileScore, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { shiftCompanyFromManualToRegister } = require('../../../utils/helpers/events_helper')
const { getPositionResolutionStages } = require('../../../modules/work-experience/work-experience.queries')
const { joinPositionNamesExpr } = require('../../../modules/funding/funding.queries')

/**
 * Extracted nested `cln_professionals_work_experiences` sub-pipeline for the
 * `info_work` lookup inside GET /company_followers/:company_row_id. Resolves
 * position name(s) via getPositionResolutionStages() (both
 * cln_static_professionals_work_positions and cln_manual_user_positions), joined
 * into a single display string via joinPositionNamesExpr, instead of the previous
 * static-only lookup. Downstream, the outer pipeline's final $project still reads
 * `position_name` from `$info_work.position_name` — unchanged shape. `{ $limit: 1 }`
 * kept in its original position: after position resolution, before company lookups.
 */
function buildCompanyFollowersInfoWorkPipeline() {
    return [
        { $match: { public_view: true, user_account_type: 1 } },
        ...getPositionResolutionStages(),
        { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
        { $limit: 1 },
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
    ]
}


const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const followersM = require('../../../models/app/company/followersM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')
const company_wallet_addressM = require('../../../models/app/company/company_wallet_addressM')
const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')
const company_created_by_adminM = require('../../../models/app/company/company_created_by_adminM')
const countryM = require('../../../models/app/static/countryM')
const sub_admin_emailsM = require('../../../models/admin_panel/app/sub_admin_emailsM')
const professionals_profile_imagesM = require('../../../models/app/professionals_profile_imagesM')
const verify_emailM = require('../../../models/app/auth_account/verify_emailM')
const added_to_partnersM = require('../../../models/app/company/added_to_partnersM')
const { deleteCompanyFollowers } = require('../../../utils/helpers/app_helper')
const company_exchanges_bodiesM = require('../../../models/app/company/company_exchanges_bodiesM')
const { deleteKeysByPattern, getCache, setCache } = require('../../../config/cache_helper')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const company_seo_detailsM = require('../../../models/app/company/company_seo_detailsM')

router.post('/update_basic_company_details', [
    check('company_name')
        .trim().not().isEmpty().withMessage('The Company Name field is required.')
        .isLength({ min: 4 }).withMessage('The Company Name field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The Company Name field must be less than 120 characters.'),
    check('company_id')
        .trim().not().isEmpty().withMessage('The Company Id field is required.')
        .isLength({ min: 4 }).withMessage('The Company Id field must be at least 4 characters.')
        .isLength({ max: 40 }).withMessage('The Company Id field must be less than 40 characters.')
        .matches(/^[a-zA-Z0-9-]+$/).withMessage('Company ID must contain only alphabets, numbers, and hyphen.'),
    check('describe_in_one_line')
        .trim().not().isEmpty().withMessage('The Describe in One Line field is required.')
        .isLength({ min: 4 }).withMessage('The Describe in One Line field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The Describe in One Line field must be less than 120 characters.'),

    check('business_model_id')
        .not().isEmpty().withMessage('The Business Model Id field is required.'),

    check('website_link')
        .trim().not().isEmpty().withMessage('The Website Link field is required.'),
    // check('about_company')
    //     .trim().not().isEmpty().withMessage('The About Company field is required.')
    //     .isLength({ min: 4 }).withMessage('The About Company field must be at least 4 characters.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        let sub_admin_row_id = 0
        let user_row_id = 0
        let company_row_id = 0

        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id

                const check_company_res = await professionalsM.findOne({ _id: user_row_id, login_status: 1, approval_status: 1 }, { _id: 1 })
                if (!check_company_res) {
                    errObj['alert_message'] = 'Your profile is currently under approval. Please wait, while the admin approves your profile.'
                }
            }
            else {
                sub_admin_row_id = checkUserToken.message.user_row_id
            }


            if (req.body.company_row_id) {

                if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                    const check_company_res = await checkCompanyRowID({ company_row_id: Number.parseInt(req.body.company_row_id), user_row_id: user_row_id })
                    if (!check_company_res.status) {
                        errObj['alert_message'] = check_company_res.message.alert_message
                    }
                    else {
                        company_row_id = Number.parseInt(req.body.company_row_id)
                    }
                }
            }

            if (checkUserToken.message.user_type == 1) {
                if (!company_row_id) {
                    const check_user_company_query = await companyM.findOne({ user_row_id: user_row_id })
                    if (check_user_company_query) {
                        errObj['alert_message'] = 'Sorry, a company has already been created for your user account'
                    }
                }
            }

            if (!company_row_id && user_row_id) {
                const check_company_res2 = await checkCompanyRowID({ company_row_id: 0, user_row_id: user_row_id })
                if (check_company_res2.status) {
                    errObj['alert_message'] = 'Sorry, a company has already been created for your user account.'
                }
            }

            if (req.body.company_id) {
                const check_company_id_query = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { company_id: sanitize(req.body.company_id) }] }).collation({ locale: 'en', strength: 2 })
                if (check_company_id_query) {
                    errObj['company_id'] = 'The Company ID is already in use.'
                }
            }


            if (req.body.company_email_id) {
                const check_email_id_query = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { company_email_id: sanitize(req.body.company_email_id) }] }).collation({ locale: 'en', strength: 2 })
                if (check_email_id_query) {
                    errObj['company_email_id'] = 'The Company Email ID is already in use.'
                }
            }



            if (req.body.contact_number) {
                if (req.body.contact_number.match(/[^0-9\-(\)\s]/)) {

                    errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.';
                }

                const check_mobile_number_query = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { contact_number: sanitize(req.body.contact_number) }] }).collation({ locale: 'en', strength: 2 })
                if (check_mobile_number_query) {
                    errObj['contact_number'] = 'The Contact Number is already in use.'
                }
            }
        }
        else {
            errObj['alert_message'] = checkUserToken.message
        }

        let business_model_id = []
        if ((req.body.business_model_id) && (req.body.business_model_id.length > 0)) {
            let business_model_id_array = await Promise.resolve(getIntIdFromArray(req.body.business_model_id))
            if (business_model_id_array.length > 0) {
                business_model_id = business_model_id_array
            }
            else {
                errObj['business_model_id'] = 'The Business Model Ids field must be integer in object'
            }
        }
        let invalidEntries = [];
        let regularitiesArray = [];

        if (
            req.body.regularities_details &&
            Array.isArray(req.body.regularities_details) &&
            req.body.regularities_details.length > 0
        ) {
            for (let i = 0; i < req.body.regularities_details.length; i++) {
                const entry = req.body.regularities_details[i];

                const parsed_bodies_ids = Number.parseInt(entry.regulatory_bodies_ids);
                const parsed_country_id = Number.parseInt(entry.country_id);
                const parsed_types_id = Number.parseInt(entry.regulatory_types_id);

                if (Number.isNaN(parsed_bodies_ids)) {
                    invalidEntries.push(i + 1);
                    continue;
                }

                const bodyDoc = await company_exchanges_bodiesM.findOne({ _id: parsed_bodies_ids });

                if (bodyDoc?.country_id && bodyDoc?.regulatory_type_id) {
                    regularitiesArray.push({
                        regulatory_bodies_ids: parsed_bodies_ids,
                    });
                }
                else {
                    if (Number.isNaN(parsed_country_id) || Number.isNaN(parsed_types_id)) {
                        invalidEntries.push(i + 1);
                        continue;
                    }

                    regularitiesArray.push({
                        regulatory_bodies_ids: parsed_bodies_ids,
                    });
                }
            }

            if (invalidEntries.length > 0) {
                errObj['regularities_details'] = `Invalid regularities data at entries: ${invalidEntries.join(', ')}`;
            }
        }





        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const date_n_time = getPresentDateTime()
            const insertArray = {}

            insertArray['business_model_id'] = business_model_id
            insertArray['main_business_model_id'] = req.body.main_business_model_id
            insertArray['regularities_details'] = regularitiesArray;
            insertArray['company_name'] = req.body.company_name
            insertArray['company_id'] = (req.body.company_id).toLowerCase()
            insertArray['company_email_id'] = req.body.company_email_id
            insertArray['contact_number'] = req.body.contact_number

            insertArray['website_link'] = req.body.website_link
            insertArray['describe_in_one_line'] = req.body.describe_in_one_line
            insertArray['established_in'] = req.body.established_in



            insertArray['company_valuation'] = req.body.company_valuation
            insertArray['company_size_row_id'] = req.body.company_size_row_id
            insertArray['investor_category_row_id'] = req.body.investor_category_row_id

            insertArray['country_id'] = req.body.country_id
            insertArray['country_mobile_id'] = req.body.country_mobile_id
            insertArray['company_location'] = req.body.company_location
            insertArray['city'] = req.body.city ? req.body.city : ""
            insertArray['state'] = req.body.state ? req.body.state : ""
            insertArray['longitude'] = req.body.longitude ? req.body.longitude : ""
            insertArray['latitude'] = req.body.latitude ? req.body.latitude : ""

            insertArray['nft_wallet_address'] = req.body.nft_wallet_address ? (req.body.nft_wallet_address).trim() : ''
            insertArray['about_company'] = req.body.about_company

            const seoArray = {}
            seoArray['meta_keywords'] = req.body.meta_keywords
            seoArray['meta_description'] = req.body.meta_description
            seoArray['meta_title'] = req.body.meta_title

            const socialArray = {}


            socialArray['youtube_channel'] = req.body.youtube_channel




            if (!company_row_id) {

                insertArray['user_row_id'] = user_row_id
                if (checkUserToken.message.user_type == 2) {
                    insertArray['sub_admin_row_id'] = sub_admin_row_id
                    insertArray['claim_status'] = 1
                }


                insertArray['created_date_n_time'] = date_n_time

                const saveCompanyDetails = await companyM(insertArray).save()

                seoArray['company_row_id'] = saveCompanyDetails._id
                socialArray['company_row_id'] = saveCompanyDetails._id



                if (insertArray?.about_company) {
                    // Sanitize input before using it
                    const cleanedBio = removeHtmltag(insertArray?.about_company).slice(0, 160);

                    seoArray.meta_description = cleanedBio;
                    seoArray.og_description = cleanedBio;
                    seoArray.twitter_description = cleanedBio;

                }

                // Auto-fill title and keywords from full_name
                if (insertArray.company_name) {
                    const title = insertArray.company_name + " | Coinpedia Company Listing";
                    seoArray.meta_title = title;
                    seoArray.og_title = title;
                    seoArray.twitter_title = title;
                    seoArray.meta_keywords = insertArray.company_name;
                }
                const hasChanged = (newVal) =>
                    (newVal ?? "").trim() !== ""
                await seo_change_logsM.create({
                    module_key: "company",
                    module_id: saveCompanyDetails._id,

                    old_meta_title: "",
                    new_meta_title: hasChanged(seoArray.meta_title)
                        ? seoArray.meta_title
                        : "",

                    old_meta_description: "",
                    new_meta_description: hasChanged(seoArray.meta_description)
                        ? seoArray.meta_description
                        : "",

                    old_meta_keywords: "",
                    new_meta_keywords: hasChanged(seoArray.meta_keywords)
                        ? seoArray.meta_keywords
                        : "",

                    old_og_title: "",
                    new_og_title: hasChanged(seoArray.og_title)
                        ? seoArray.og_title
                        : "",

                    old_og_description: "",
                    new_og_description: hasChanged(seoArray.og_description)
                        ? seoArray.og_description
                        : "",

                    old_twitter_title: "",
                    new_twitter_title: hasChanged(seoArray.twitter_title)
                        ? seoArray.twitter_title
                        : "",

                    old_twitter_description: "",
                    new_twitter_description: hasChanged(seoArray.twitter_description)
                        ? seoArray.twitter_description
                        : "",

                    user_type:
                        checkUserToken.message.user_type === 1 ? "user" : "admin",

                    updated_by:
                        checkUserToken.message.user_type === 1
                            ? user_row_id
                            : sub_admin_row_id
                });


                await company_social_linksM(socialArray).save()
                await company_seo_detailsM(seoArray).save()

                await deleteKeysByPattern('app_company_list_*');
                await deleteKeysByPattern('app_company_individual_other_details_*');
                await deleteKeysByPattern('app_front_page_partners_list_*');
                await deleteKeysByPattern('app_company_individual_details_*')
                await deleteKeysByPattern('organizers_list_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('app_user_detail_*')
                await deleteKeysByPattern('app_popular_companies*')
                await deleteKeysByPattern('app_search_companies_*')
                await deleteKeysByPattern('company_watchlist_list_*')
                await deleteKeysByPattern('professional_detail_list_*')


                await updateThreadNotification({
                    user_row_id: -1,
                    notify_type: 2,
                    notify_type_row_id: saveCompanyDetails._id,
                    message_row_id: 9,
                    action_row_id: saveCompanyDetails._id
                })
                if (!Number.isNaN(Number.parseInt(req.body.manual_company_row_id))) {
                    const manual_company_row_id = Number.parseInt(req.body.manual_company_row_id)
                    const check_manual_query = await company_manual_retrievalsM.findOne({ _id: manual_company_row_id })
                    if (check_manual_query) {
                        await shiftCompanyFromManualToRegister({ manual_company_row_id: manual_company_row_id, register_company_row_id: saveCompanyDetails._id, sub_admin_row_id: sub_admin_row_id })
                    }
                }

                if (user_row_id) {
                    const sub_admin_data = await sub_admin_emailsM.find({ type: { $in: [2, 3] } }, { full_name: 1, email_id: 1 })
                    const user_query = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1 })
                    const email_data = {
                        full_name: user_query.full_name,
                        company_name: saveCompanyDetails.company_name,
                        updated_date_n_time: saveCompanyDetails.updated_date_n_time
                    }
                    await sub_admin_email(sub_admin_data, email_data)
                }


                await calculateCompanyProfileScore(saveCompanyDetails._id, ['basic', 'team_detail'])


                res.json({
                    status: true, message: {
                        alert_message:
                            'Your company details have been updated successfully. Thank you for keeping your company information current!',
                    }
                })
            }
            else {

                const check_company_status = await companyM.findOne({ _id: company_row_id }, { approval_status: 1 })

                const check_company_seo = await company_seo_detailsM.findOne({ company_row_id: company_row_id }, {
                    meta_title: 1, meta_description: 1, meta_keywords: 1,
                    robots_index: 1,
                    robots_follow: 1,
                    og_title: 1,
                    og_description: 1,
                    twitter_title: 1,
                    twitter_description: 1,
                    twitter_creator: 1
                })

                if (check_company_status.approval_status === 2) {
                    insertArray['approval_status'] = 0
                }

                const updateFields = getUpdateTrackerFields(checkUserToken)
                Object.assign(insertArray, updateFields)


                insertArray['updated_date_n_time'] = date_n_time

                await companyM.updateOne({ _id: company_row_id }, { $set: insertArray })



                if (insertArray?.about_company) {

                    // Sanitize input before using it
                    if (!check_company_seo?.meta_description) {
                        const cleanedBio = removeHtmltag(insertArray?.about_company).slice(0, 160);

                        seoArray.meta_description = cleanedBio;
                        seoArray.og_description = cleanedBio;
                        seoArray.twitter_description = cleanedBio;
                    } else if (!check_company_seo.og_description) {
                        seoArray.og_description = check_company_seo?.meta_description;
                        seoArray.twitter_description = check_company_seo?.meta_description;
                    }
                }

                // Auto-fill title and keywords from full_name
                if (insertArray.company_name) {
                    const title = insertArray.company_name + " | Coinpedia Company Listing";
                    if (!check_company_seo?.meta_title) {
                        seoArray.meta_title = title;
                        seoArray.og_title = title;
                        seoArray.twitter_title = title;
                    } else if (!check_company_seo.og_title) {
                        seoArray.og_title = check_company_seo?.meta_title;
                        seoArray.twitter_title = check_company_seo?.meta_title;
                    }

                    if (!check_company_seo?.meta_keywords) {
                        seoArray.meta_keywords = insertArray.company_name;
                    }
                }
                const hasChanged = (oldVal, newVal) =>
                    (newVal ?? "").trim() !== "" &&
                    (oldVal ?? "").trim() !== (newVal ?? "").trim();

                const changed =
                    hasChanged(check_company_seo?.meta_title, seoArray.meta_title) ||
                    hasChanged(check_company_seo?.meta_description, seoArray.meta_description) ||
                    hasChanged(check_company_seo?.meta_keywords, seoArray.meta_keywords) ||

                    hasChanged(check_company_seo?.og_title, seoArray.og_title) ||
                    hasChanged(check_company_seo?.og_description, seoArray.og_description) ||

                    hasChanged(check_company_seo?.twitter_title, seoArray.twitter_title) ||
                    hasChanged(check_company_seo?.twitter_description, seoArray.twitter_description);

                if (changed) {
                    await seo_change_logsM.create({
                        module_key: "company",
                        module_id: company_row_id,

                        // ---------- META ----------
                        old_meta_title: check_company_seo?.meta_title || "",
                        new_meta_title: hasChanged(
                            check_company_seo?.meta_title,
                            seoArray.meta_title
                        ) ? seoArray.meta_title : "",

                        old_meta_description: check_company_seo?.meta_description || "",
                        new_meta_description: hasChanged(
                            check_company_seo?.meta_description,
                            seoArray.meta_description
                        ) ? seoArray.meta_description : "",

                        old_meta_keywords: check_company_seo?.meta_keywords || "",
                        new_meta_keywords: hasChanged(
                            check_company_seo?.meta_keywords,
                            seoArray.meta_keywords
                        ) ? seoArray.meta_keywords : "",

                        // ---------- OG ----------
                        old_og_title: check_company_seo?.og_title || "",
                        new_og_title: hasChanged(
                            check_company_seo?.og_title,
                            seoArray.og_title
                        ) ? seoArray.og_title : "",

                        old_og_description: check_company_seo?.og_description || "",
                        new_og_description: hasChanged(
                            check_company_seo?.og_description,
                            seoArray.og_description
                        ) ? seoArray.og_description : "",

                        // ---------- TWITTER ----------
                        old_twitter_title: check_company_seo?.twitter_title || "",
                        new_twitter_title: hasChanged(
                            check_company_seo?.twitter_title,
                            seoArray.twitter_title
                        ) ? seoArray.twitter_title : "",

                        old_twitter_description: check_company_seo?.twitter_description || "",
                        new_twitter_description: hasChanged(
                            check_company_seo?.twitter_description,
                            seoArray.twitter_description
                        ) ? seoArray.twitter_description : "",

                        // ---------- AUDIT ----------
                        user_type:
                            checkUserToken.message.user_type === 1 ? "user" : "admin",

                        updated_by:
                            checkUserToken.message.user_type === 1
                                ? user_row_id
                                : sub_admin_row_id
                    });
                }

                const compayny_list_key = await deleteKeysByPattern('app_company_list_*');
                const compayny_other_details_key = await deleteKeysByPattern('app_company_individual_other_details_*');
                await deleteKeysByPattern('app_front_page_partners_list_*');
                await deleteKeysByPattern('app_company_individual_details_*')
                await deleteKeysByPattern('organizers_list_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('app_user_detail_*')
                await deleteKeysByPattern('app_popular_companies*')
                await deleteKeysByPattern('app_search_companies_*')
                await deleteKeysByPattern('company_watchlist_list_*')
                await deleteKeysByPattern('professional_detail_list_*')

                await company_seo_detailsM.updateOne({ company_row_id: company_row_id }, { $set: seoArray })

                await calculateCompanyProfileScore(company_row_id, ['basic', 'team_detail'])

                res.json({
                    status: true, message: {
                        alert_message:
                            'Your company details have been successfully resubmitted. Thank you for keeping your company information current!'
                    },
                    insertArray: insertArray,
                    compayny_list_key: compayny_list_key,
                    compayny_other_details_key: compayny_other_details_key
                })
            }

        }
    }
    catch (err) {
        console.log('Update company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }
})




//without token api for team
router.post('/update_new_basic_company_details', checkApiKey, [
    check('company_name')
        .trim().not().isEmpty().withMessage('The Company Name field is required.')
        .isLength({ min: 4 }).withMessage('The Company Name field must be at least 4 characters.')
        .isLength({ max: 120 }).withMessage('The Company Name field must be less than 120 characters.'),
    check('company_id')
        .trim().not().isEmpty().withMessage('The Company Id field is required.')
        .isLength({ min: 4 }).withMessage('The Company Id field must be at least 4 characters.')
        .isLength({ max: 40 }).withMessage('The Company Id field must be less than 40 characters.')
        .matches(/^[a-zA-Z0-9-]+$/).withMessage('Company ID must contain only alphabets, numbers, and hyphen.'),
    check('user_row_id')
        .not().isEmpty().withMessage('The user row id field is required.'),


], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        let sub_admin_row_id = 0
        let user_row_id = 0
        let company_row_id = 0



        if (req.body.user_row_id) {
            user_row_id = Number.parseInt(req.body.company_row_id)
            const check_company_res = await professionalsM.findOne({ _id: user_row_id, login_status: 1, approval_status: 1 }, { _id: 1 })
            if (!check_company_res) {
                errObj['alert_message'] = 'Your profile is currently under approval. Please wait, while the admin approves your profile.'
            }
        }
        else {
            sub_admin_row_id = Number.parseInt(req.body.company_row_id)
        }


        if (req.body.company_row_id) {

            if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                const check_company_res = await checkCompanyRowID({ company_row_id: Number.parseInt(req.body.company_row_id), user_row_id: user_row_id })
                if (!check_company_res.status) {
                    errObj['alert_message'] = check_company_res.message.alert_message
                }
                else {
                    company_row_id = Number.parseInt(req.body.company_row_id)
                }
            }
        }


        if (!company_row_id) {
            const check_user_company_query = await companyM.findOne({ user_row_id: user_row_id })
            if (check_user_company_query) {
                errObj['alert_message'] = 'Sorry, a company has already been created for your user account'
            }
        }


        if (!company_row_id && user_row_id) {
            const check_company_res2 = await checkCompanyRowID({ company_row_id: 0, user_row_id: user_row_id })
            if (check_company_res2.status) {
                errObj['alert_message'] = 'Sorry, a company has already been created for your user account.'
            }
        }

        if (req.body.company_id) {
            const check_company_id_query = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { company_id: sanitize(req.body.company_id) }] }).collation({ locale: 'en', strength: 2 })
            if (check_company_id_query) {
                errObj['company_id'] = 'The Company ID is already in use.'
            }
        }


        if (req.body.company_email_id) {
            const check_email_id_query = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { company_email_id: sanitize(req.body.company_email_id) }] }).collation({ locale: 'en', strength: 2 })
            if (check_email_id_query) {
                errObj['company_email_id'] = 'The Company Email ID is already in use.'
            }
        }



        if (req.body.contact_number) {
            if (req.body.contact_number.match(/[^0-9\-(\)\s]/)) {

                errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.';
            }

            const check_mobile_number_query = await companyM.findOne({ $and: [{ _id: { $ne: company_row_id } }, { contact_number: sanitize(req.body.contact_number) }] }).collation({ locale: 'en', strength: 2 })
            if (check_mobile_number_query) {
                errObj['contact_number'] = 'The Contact Number is already in use.'
            }
        }


        let business_model_id = []
        if ((req.body.business_model_id) && (req.body.business_model_id.length > 0)) {
            let business_model_id_array = await Promise.resolve(getIntIdFromArray(req.body.business_model_id))
            if (business_model_id_array.length > 0) {
                business_model_id = business_model_id_array
            }
            else {
                errObj['business_model_id'] = 'The Business Model Ids field must be integer in object'
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const date_n_time = getPresentDateTime()
            const insertArray = {}

            insertArray['business_model_id'] = business_model_id
            insertArray['main_business_model_id'] = req.body.main_business_model_id

            insertArray['company_name'] = req.body.company_name
            insertArray['company_id'] = (req.body.company_id).toLowerCase()
            insertArray['company_email_id'] = req.body.company_email_id
            insertArray['contact_number'] = req.body.contact_number

            insertArray['website_link'] = req.body.website_link
            insertArray['describe_in_one_line'] = req.body.describe_in_one_line
            insertArray['established_in'] = req.body.established_in



            insertArray['company_valuation'] = req.body.company_valuation
            insertArray['company_size_row_id'] = req.body.company_size_row_id
            insertArray['investor_category_row_id'] = req.body.investor_category_row_id

            insertArray['country_id'] = req.body.country_id
            insertArray['company_location'] = req.body.company_location
            insertArray['city'] = req.body.city ? req.body.city : ""
            insertArray['state'] = req.body.state ? req.body.state : ""
            insertArray['longitude'] = req.body.longitude ? req.body.longitude : ""
            insertArray['latitude'] = req.body.latitude ? req.body.latitude : ""
            insertArray['updated_date_n_time'] = date_n_time

            insertArray['nft_wallet_address'] = req.body.nft_wallet_address ? (req.body.nft_wallet_address).trim() : ''
            insertArray['about_company'] = req.body.about_company

            const seoArray = {}
            seoArray['meta_keywords'] = req.body.meta_keywords
            seoArray['meta_description'] = req.body.meta_description
            seoArray['meta_title'] = req.body.meta_title

            const socialArray = {}


            socialArray['youtube_channel'] = req.body.youtube_channel

            if (!company_row_id) {

                insertArray['user_row_id'] = user_row_id
                if (checkUserToken.message.user_type == 2) {
                    insertArray['sub_admin_row_id'] = sub_admin_row_id
                    insertArray['claim_status'] = 1
                }


                insertArray['created_date_n_time'] = date_n_time

                const saveCompanyDetails = await companyM(insertArray).save()

                seoArray['company_row_id'] = saveCompanyDetails._id
                socialArray['company_row_id'] = saveCompanyDetails._id


                await company_seo_detailsM(seoArray).save()
                await company_social_linksM(socialArray).save()


                await updateThreadNotification({
                    user_row_id: -1,
                    notify_type: 2,
                    notify_type_row_id: saveCompanyDetails._id,
                    message_row_id: 9,
                    action_row_id: saveCompanyDetails._id
                })

                if (!Number.isNaN(Number.parseInt(req.body.manual_company_row_id))) {
                    const manual_company_row_id = Number.parseInt(req.body.manual_company_row_id)
                    const check_manual_query = await company_manual_retrievalsM.findOne({ _id: manual_company_row_id })
                    if (check_manual_query) {
                        await shiftCompanyFromManualToRegister({ manual_company_row_id: manual_company_row_id, register_company_row_id: saveCompanyDetails._id, sub_admin_row_id: sub_admin_row_id })
                    }
                }

                if (user_row_id) {
                    const sub_admin_data = await sub_admin_emailsM.find({ type: { $in: [2, 3] } }, { full_name: 1, email_id: 1 })
                    const user_query = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1 })
                    const email_data = {
                        full_name: user_query.full_name,
                        company_name: saveCompanyDetails.company_name,
                        updated_date_n_time: saveCompanyDetails.updated_date_n_time
                    }
                    await sub_admin_email(sub_admin_data, email_data)
                }


                res.json({
                    status: true, message: {
                        alert_message:
                            'Your company details have been updated successfully. Thank you for keeping your company information current!'
                    }
                })
            }
            else {

                const check_company_status = await companyM.findOne({ _id: company_row_id }, { approval_status: 1 })
                if (check_company_status.approval_status === 2) {
                    insertArray['approval_status'] = 0
                }

                const updateFields = getUpdateTrackerFields(checkUserToken)
                Object.assign(insertArray, updateFields)

                await companyM.updateOne({ _id: company_row_id }, { $set: insertArray })


                await company_seo_detailsM.updateOne({ company_row_id: company_row_id }, { $set: seoArray })
                await company_social_linksM.updateOne({ company_row_id: company_row_id }, { $set: socialArray })

                res.json({
                    status: true, message: {
                        alert_message:
                            'Your company details have been successfully resubmitted. Thank you for keeping your company information current!'
                    }
                })
            }

        }
    }
    catch (err) {
        console.log('Update company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }
})


router.post('/update_social_details', [
    check('company_row_id')
        .trim().not().isEmpty().withMessage('The company row id field is required.')
], async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            let user_row_id = 0
            let company_row_id = 0

            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (req.body.company_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                    company_row_id = Number.parseInt(req.body.company_row_id)
                    const check_event_res = await checkCompanyRowID({ company_row_id: company_row_id, user_row_id: user_row_id })
                    if (!check_event_res.status) {
                        errObj['alert_message'] = check_event_res.message.alert_message
                    }
                }
            }

            if (!(req.body.feed_url || req.body.facebook || req.body.twitter || req.body.linkedin || req.body.video_link || req.body.instagram || req.body.telegram || req.body.reddit || req.body.medium || req.body.youtube_channel || req.body.other_social_links)) {
                errObj['alert_message'] = 'Please submit atleast one social media details.'
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const insert_object = {}
                insert_object['facebook'] = req.body.facebook
                insert_object['twitter'] = req.body.twitter
                insert_object['linkedin'] = req.body.linkedin
                insert_object['instagram'] = req.body.instagram
                insert_object['video_link'] = req.body.video_link
                insert_object['telegram'] = req.body.telegram
                insert_object['youtube_channel'] = req.body.youtube_channel
                insert_object['medium'] = req.body.medium
                insert_object['reddit'] = req.body.reddit
                insert_object['feed_url'] = req.body.feed_url
                insert_object['other_social_links'] = req.body.other_social_links

                const check_query = await company_social_linksM.findOne({ company_row_id: company_row_id }, { _id: 1 })
                let social_links_key_deleted
                if (check_query) {
                    await company_social_linksM.updateOne({ company_row_id: company_row_id }, { $set: insert_object })
                    social_links_key_deleted = await deleteKeysByPattern('app_company_individual_details_*')
                }
                else {
                    insert_object['company_row_id'] = company_row_id

                    await company_social_linksM(insert_object).save()
                }

                await calculateCompanyProfileScore(company_row_id, ['social_media'])

                res.json({
                    status: true, message: { alert_message: 'Your company social media details have been successfully updated.' },
                    social_links_key_deleted: social_links_key_deleted
                })
            }
        }
        else {
            res.json({ status: false, message: { alert_message: checkUserToken, test: "dsaf" } })
        }
    }
    catch (err) {
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
    }
})


//without token api for team panel

router.post('/update_social_media_details', [
    check('company_row_id')
        .trim().not().isEmpty().withMessage('The company row id field is required.'),
    check('user_row_id')
        .trim().not().isEmpty().withMessage('The user row id field is required.')
], async (req, res) => {
    try {

        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let user_row_id = 0
        let company_row_id = 0

        user_row_id = Number.parseInt(req.body.user_row_id)

        if (req.body.company_row_id) {
            if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                company_row_id = Number.parseInt(req.body.company_row_id)
                const check_event_res = await checkCompanyRowID({ company_row_id: company_row_id, user_row_id: user_row_id })
                if (!check_event_res.status) {
                    errObj['alert_message'] = check_event_res.message.alert_message
                }
            }
        }

        if (!(req.body.feed_url || req.body.facebook || req.body.twitter || req.body.linkedin || req.body.video_link || req.body.instagram || req.body.telegram || req.body.reddit || req.body.medium || req.body.youtube_channel || req.body.other_social_links)) {
            errObj['alert_message'] = 'Please submit atleast one social media details.'
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const insert_object = {}
            insert_object['facebook'] = req.body.facebook
            insert_object['twitter'] = req.body.twitter
            insert_object['linkedin'] = req.body.linkedin
            insert_object['instagram'] = req.body.instagram
            insert_object['video_link'] = req.body.video_link
            insert_object['telegram'] = req.body.telegram
            insert_object['youtube_channel'] = req.body.youtube_channel
            insert_object['medium'] = req.body.medium
            insert_object['reddit'] = req.body.reddit
            insert_object['feed_url'] = req.body.feed_url
            insert_object['other_social_links'] = req.body.other_social_links

            const check_query = await company_social_linksM.findOne({ company_row_id: company_row_id }, { _id: 1 })
            if (check_query) {
                await company_social_linksM.updateOne({ company_row_id: company_row_id }, { $set: insert_object })
            }
            else {
                insert_object['company_row_id'] = company_row_id

                await company_social_linksM(insert_object).save()
            }


            res.json({ status: true, message: { alert_message: 'Your company social media details have been successfully updated.' } })
        }


    }
    catch (err) {
        res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
    }
})



router.get('/individual_details', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            let errObj = {}
            let user_row_id = 0
            let company_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (!req.query.company_row_id) {
                errObj['alert_message'] = 'The company row id field is required.'
            }
            else if (!Number.isNaN(Number.parseInt(req.query.company_row_id))) {
                company_row_id = Number.parseInt(req.query.company_row_id)
            }
            else {
                errObj['faq_row_id'] = 'The company row id field must be contain valid number.'
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
                if (!check_company.status) {
                    res.json({ status: false, message: { alert_message: check_company.message.alert_message, sdf: 3 } })
                }
                else {
                    const pass_company_row_id = check_company.message.company_row_id
                    const get_data = await getCompanyData({ company_row_id: pass_company_row_id })
                    res.json(get_data)
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

//without login token api for team panel
router.get('/individual_company_details/:user_row_id', checkApiKey, async (req, res) => {
    try {


        let errObj = {}
        // let user_row_id = 0
        let company_row_id = 0

        // user_row_id = Number.parseInt(req.params.user_row_id)
        if (!req.query.company_row_id) {
            errObj['alert_message'] = 'The company row id field is required.'
        }
        else if (!Number.isNaN(Number.parseInt(req.query.company_row_id))) {
            company_row_id = Number.parseInt(req.query.company_row_id)
        }
        else {
            errObj['faq_row_id'] = 'The company row id field must be contain valid number.'
        }


        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj })
        }
        else {
            const check_company = await checkCompanyRowID({ company_row_id })
            if (!check_company.status) {
                res.json({ status: false, message: { alert_message: check_company.message.alert_message } })
            }
            else {
                const pass_company_row_id = check_company.message.company_row_id
                const get_data = await getCompanyData({ company_row_id: pass_company_row_id })

                res.json(get_data)
            }
        }


    }
    catch (err) {
        console.log('Company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})


const getCompanyData = async ({ company_row_id }) => {
    try {


        const get_query_array = await companyM.aggregate([
            {
                $match: { _id: company_row_id }
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
                    from: "cln_company_created_by_admins",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "created_by_admins_info"
                }
            },

            { $unwind: { path: "$created_by_admins_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_company_created_by_admins",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "created_by_admins_info"
                }
            },

            { $unwind: { path: "$created_by_admins_info", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_company_seo_details",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "seo_details"
                }
            },
            { $unwind: { path: "$seo_details", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_company_social_links",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "social_links"
                }
            },
            { $unwind: { path: "$social_links", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_static_company_business_models",
                    localField: "main_business_model_id",
                    foreignField: "_id",
                    as: "info_main_business"
                }
            },
            { $unwind: { path: "$info_main_business", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_static_funding_investor_types",
                    localField: "investor_category_row_id",
                    foreignField: "_id",
                    as: "info_investor_category"
                }
            },
            { $unwind: { path: "$info_investor_category", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_static_company_business_models",
                    localField: "business_model_id",
                    foreignField: "_id",
                    as: "info_business",
                    pipeline: [
                        {
                            $match: {
                                active_status: true
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                business_name: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    country_id: 1,
                    _id: 1,
                    user_row_id: 1,
                    company_name: 1,
                    company_id: 1,
                    company_email_id: 1,
                    company_location: 1,
                    country_mobile_id: 1,
                    city: 1,
                    state: 1,
                    longitude: 1,
                    latitude: 1,
                    contact_number: 1,
                    website_link: 1,
                    describe_in_one_line: 1,
                    established_in: 1,
                    main_business_model_id: 1,
                    main_business_name: "$info_main_business.business_name",
                    business_model_id: 1,
                    approval_status: 1,
                    active_status: 1,
                    updated_date_n_time: 1,
                    company_logo: 1,
                    reason_rejected: 1,
                    rejected_date_n_time: 1,
                    disable_reason: 1,
                    disabled_date_n_time: 1,
                    nft_wallet_address: 1,
                    sub_admin_row_id: 1,
                    claim_status: 1,
                    company_valuation: 1,
                    company_size_row_id: 1,
                    investor_category_row_id: 1,
                    email_verify_status: 1,
                    basic_details_score: 1,
                    seo_details_score: 1,
                    social_media_score: 1,
                    owned_product_score: 1,
                    team_detail_score: 1,
                    job_opening_score: 1,
                    funding_score: 1,
                    revenue_score_score: 1,
                    investment_score: 1,
                    faq_score: 1,
                    holding_crypto_score: 1,
                    profile_score: 1,
                    country_sortname: "$country_info.sortname",
                    country_code: "$country_info.country_code",
                    country_name: "$country_info.country_name",
                    country_flag: "$country_info.country_flag",
                    created_admin_row_id: "$created_by_admins_info.sub_admin_row_id",
                    created_by_type: "$created_by_admins_info.admin_sub_admin_type",
                    facebook: "$social_links.facebook",
                    twitter: "$social_links.twitter",
                    linkedin: "$social_links.linkedin",
                    instagram: "$social_links.instagram",
                    video_link: "$social_links.video_link",
                    telegram: "$social_links.telegram",
                    medium: "$social_links.medium",
                    reddit: "$social_links.reddit",
                    other_social_links: "$social_links.other_social_links",
                    feed_url: "$social_links.feed_url",
                    youtube_channel: "$social_links.youtube_channel",
                    about_company: 1,
                    meta_keywords: "$seo_details.meta_keywords",
                    meta_description: "$seo_details.meta_description",
                    meta_title: "$seo_details.meta_title",
                    business_models_categories: "$info_business",
                    investor_category_name: "$info_investor_category.category_name"
                }
            }
        ])


        if (get_query_array[0]) {
            const get_query = get_query_array[0]

            let result = {}
            result['_id'] = get_query._id
            result['user_row_id'] = get_query.user_row_id
            result['company_name'] = get_query.company_name
            result['company_id'] = get_query.company_id
            result['company_email_id'] = get_query.company_email_id
            result['company_location'] = get_query.company_location
            result['city'] = get_query.city ? get_query.city : ""
            result['state'] = get_query.state ? get_query.state : ""
            result['longitude'] = get_query.longitude ? get_query.longitude : ""
            result['latitude'] = get_query.latitude ? get_query.latitude : ""
            result['contact_number'] = get_query.contact_number
            result['website_link'] = get_query.website_link
            result['describe_in_one_line'] = get_query.describe_in_one_line
            result['established_in'] = get_query.established_in
            result['main_business_model_id'] = get_query.main_business_model_id
            result['business_model_id'] = await Promise.resolve(getIntIdFromArray(get_query.business_model_id))
            result['approval_status'] = get_query.approval_status
            result['active_status'] = get_query.active_status
            result['updated_date_n_time'] = get_query.updated_date_n_time
            result['company_logo'] = get_query.company_logo
            result['feed_url'] = get_query.feed_url

            result['reason_rejected'] = get_query.reason_rejected
            result['rejected_date_n_time'] = get_query.rejected_date_n_time
            result['disable_reason'] = get_query.disable_reason
            result['disabled_date_n_time'] = get_query.disabled_date_n_time
            result['nft_wallet_address'] = get_query.nft_wallet_address
            result['sub_admin_row_id'] = get_query.sub_admin_row_id

            result['claim_status'] = get_query.claim_status

            result['company_valuation'] = get_query.company_valuation
            result['company_size_row_id'] = get_query.company_size_row_id
            result['investor_category_row_id'] = get_query.investor_category_row_id

            result['email_verify_status'] = get_query.email_verify_status ? get_query.email_verify_status : false
            // result['email_verify_otp'] = get_query.email_verify_otp
            result['country_id'] = get_query.country_id
            result['country_sortname'] = get_query.sortname
            result['country_code'] = get_query.country_code
            result['country_name'] = get_query.country_name
            result['country_flag'] = get_query.country_flag
            result['country_mobile_id'] = get_query.country_mobile_id
            result['about_company'] = get_query.about_company
            result['total_employees'] = get_query.total_employees
            result['meta_keywords'] = get_query.meta_keywords
            result['meta_description'] = get_query.meta_description
            result['meta_title'] = get_query?.meta_title

            result['facebook'] = get_query.facebook
            result['twitter'] = get_query.twitter
            result['linkedin'] = get_query.linkedin
            result['instagram'] = get_query.instagram
            result['video_link'] = get_query.video_link
            result['telegram'] = get_query.telegram
            result['medium'] = get_query.medium
            result['reddit'] = get_query.reddit
            result['other_social_links'] = get_query.other_social_links
            result['youtube_channel'] = get_query.youtube_channel
            result['business_models_categories'] = get_query.business_models_categories
            result['main_business_name'] = get_query.main_business_name
            result['investor_category_name'] = get_query.investor_category_name
            result['created_admin_row_id'] = get_query.created_admin_row_id
            result['created_by_type'] = get_query.created_by_type
            result['basic_details_score'] = get_query?.basic_details_score
            result['seo_details_score'] = get_query?.seo_details_score
            result['social_media_score'] = get_query?.social_media_score
            result['team_detail_score'] = get_query?.team_detail_score
            result['owned_product_score'] = get_query?.owned_product_score
            result['job_opening_score'] = get_query?.job_opening_score
            result['funding_score'] = get_query?.funding_score
            result['revenue_score_score'] = get_query?.revenue_score_score
            result['investment_score'] = get_query?.investment_score
            result['holding_crypto_score'] = get_query?.holding_crypto_score
            result['profile_score'] = get_query?.profile_score
            result['faq_score'] = get_query?.faq_score

            result['profile_completed_percentage'] = await company_profile_completed_percentage(result)

            const check_partner_status_query = await added_to_partnersM.findOne({ company_row_id: get_query._id }, { _id: 1 })
            if (check_partner_status_query) {
                result['partner_status'] = true
            }
            else {
                result['partner_status'] = false
            }


            const queryFollowers = await followersM.aggregate([
                { $match: { company_row_id: get_query._id } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
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

            result['total_followers'] = 0
            if (queryFollowers.length > 0) {
                result['total_followers'] = queryFollowers[0].count
            }

            return { status: true, message: result }
        }
        else {
            return { status: false, message: { alert_message: 'Sorry, Invalid company row id' } }
        }
    }
    catch (err) {
        return { status: false, message: { alert_message: 'Sorry, Invalid company row id ' + err.message } }
    }
}



const sub_admin_email = async (subadmin_data, email_data) => {
    for (const subadmin of subadmin_data) {

        let pass_subject = " Company Approval Request"
        let message_to_pass = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${subadmin.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">A new company profile has been created by <span style="text-transform: capitalize;font-weight: 500;">${email_data.full_name}</span> on your platform, and we kindly request your review and approval of the Company.After approval, the company can unlock exciting features like hosting events, managing their company profile and building a strong team for success.</p>
            <p style="color:#000;font-weight: 400;font-size:17px; text-decoration:underline"><b>Company Details </b></p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Company Name : </b><span style="text-transform: capitalize;">${email_data.company_name}</span> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Created On :</b> ${email_data.updated_date_n_time} </p>
            `
        await sendEmail(subadmin.email_id, pass_subject, message_to_pass)

    }
}

router.post('/update_company_logo', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            const errObj = {}
            let company_row_id = 0
            let user_row_id = 0
            if (!Number.isNaN(Number.parseInt(req.body.company_row_id))) {
                company_row_id = Number.parseInt(req.body.company_row_id)
                if (checkUserToken.message.user_type == 1) {
                    user_row_id = checkUserToken.message.user_row_id
                    const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
                    if (!check_company.status) {
                        errObj['company_row_id'] = check_company.message.alert_message
                    }
                }
            }
            else {
                errObj['company_row_id'] = 'The Company Row ID field is required.'
            }


            let company_logo = 0
            if (!(req.body.company_logo)) {
                errObj['company_logo'] = 'The Company Logo field is required.'
            }
            else if (req.body.company_logo.length < 100) {
                errObj['company_logo'] = 'The Company Logo field must be at least 100 characters in length.'
            }
            else {
                const validate_n_save_image = await validateAndSaveImage(req.body.company_logo, 1)
                if (!validate_n_save_image.status) {
                    errObj['company_logo'] = 'Sorry, Invalid profile image.'
                }
                else {
                    company_logo = validate_n_save_image.webp_file_name
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const queryRun = await companyM.findOne({ _id: company_row_id }, { company_logo: 1 })
                if (queryRun) {
                    let old_company_logo = queryRun.company_logo
                    if (old_company_logo) {
                        await deleteImageDigitalOcean(old_company_logo, 1)
                    }
                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    await companyM.updateOne({ _id: company_row_id }, { $set: { company_logo: company_logo, ...updateFields } })

                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('organizers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('company_followers_*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('app_popular_companies*')
                    await deleteKeysByPattern('app_search_companies_*')
                    await deleteKeysByPattern('company_watchlist_list_*')
                    await deleteKeysByPattern('professional_detail_list_*')


                    res.json({ status: true, message: { alert_message: 'Company logo updated successfully..!' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Please update your company details.' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Update company logo.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/remove_company_logo', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7])
        if (checkUserToken.status) {
            const errObj = {}
            let company_row_id = 0
            let user_row_id = 0
            let company_logo = ''
            let check_company = ''
            if (req.query.company_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.company_row_id))) {
                    company_row_id = Number.parseInt(req.query.company_row_id)
                    if (checkUserToken.message.user_type == 1) {
                        user_row_id = checkUserToken.message.user_row_id
                    }

                    check_company = await checkCompanyRowID({ company_row_id, user_row_id })
                    if (!check_company.status) {
                        errObj['company_row_id'] = check_company.message.alert_message
                    }
                    else if (!check_company.message.company_logo) {
                        errObj['alert_message'] = 'Sorry, For this company the company logo is not updated.'
                    }
                    else {
                        company_logo = check_company.message.company_logo
                    }
                }
            }
            else {
                errObj['company_row_id'] = 'The Company Row ID field is required.'
            }



            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                if (company_logo) {
                    await deleteImageDigitalOcean(company_logo, 1)
                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    await companyM.updateOne({ _id: company_row_id }, { $set: { company_logo: '', ...updateFields } })
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('organizers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('company_followers_*')
                    await deleteKeysByPattern('app_popular_companies*')
                    await deleteKeysByPattern('app_search_companies_*')
                    await deleteKeysByPattern('company_watchlist_list_*')
                } await deleteKeysByPattern('professional_detail_list_*')


                res.json({ status: true, message: { check_company, company_logo, company_row_id, alert_message: 'Company logo is removed successfully..!' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Update company logo.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/follow/:following_company_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let following_company_row_id = Number.parseInt(req.params.following_company_row_id)
            const date_n_time = getPresentDateTime()
            if (!Number.isNaN(following_company_row_id)) {
                const user_row_id = checkUserToken.message

                const queryList = await followersM.findOne({ company_row_id: following_company_row_id, user_row_id: user_row_id })
                if (queryList) {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your already following this company' } })
                }
                else {
                    const check_company = await companyM.findOne({ _id: following_company_row_id, active_status: 1, approval_status: 1 })
                    if (check_company) {
                        const insertArray = new followersM({
                            company_row_id: following_company_row_id,
                            user_row_id: user_row_id,
                            date_n_time: date_n_time
                        })
                        await insertArray.save()
                        const delete_cache = await deleteKeysByPattern('company_followers_*')
                        await deleteKeysByPattern('app_company_list_*')
                        await deleteKeysByPattern('company_list_*')
                        await deleteKeysByPattern('organizers_list_*')
                        await deleteKeysByPattern('company_followers_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        await deleteKeysByPattern('app_company_individual_details_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('app_popular_companies*')
                        await deleteKeysByPattern('app_front_page_partners_list_*')
                        await deleteKeysByPattern('company_watchlist_list_*')
                        await deleteKeysByPattern('users_company_following_list_*')

                        const following_user_name_query = await professionalsM.findOne({ _id: user_row_id })
                        let following_user_name = following_user_name_query.full_name
                        // let following_user_email_id = following_user_name_query.email_id

                        const getCompany = await companyM.findOne({ _id: following_company_row_id })

                        const total_following = await followersM.countDocuments({ company_row_id: following_company_row_id })

                        if (getCompany) {
                            if (getCompany.company_email_id) {

                                let pass_email_id = getCompany.company_email_id
                                let pass_subject = 'Heya! You have a New Follower.'
                                let pass_full_name = getCompany.company_name
                                let pass_message = `<div>
                                <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${pass_full_name},</p>
                                <div style="color:#000">
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${following_user_name}</b> Started Following you on the Coinpedia pro account profile. </p>
                                    <p style="line-height: 1.8;color:#000;font-weight: 400;font-size:17px;">Your total followers are ${total_following}. </p>
                                    <p><a href="https://app.coinpedia.org/login/" style="color:#0029ff;font-weight: 400;font-size:17px;">Login to know more.</a> </p>
                                </div>
                                </div>`

                                await sendEmail(pass_email_id, pass_subject, pass_message)
                            }
                        }

                        res.json({ status: true, message: { alert_message: ' You have successfully followed the company. Thank you for your involvement!' }, delete_cache: delete_cache })

                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid company row id' } })
                    }
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Invalid company row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Follow company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/unfollow/:following_company_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let following_company_row_id = Number.parseInt(req.params.following_company_row_id)
            // const date_n_time = getPresentDateTime()
            if (!Number.isNaN(following_company_row_id)) {
                const user_row_id = checkUserToken.message
                const queryRun = await followersM.findOne({ user_row_id: user_row_id, company_row_id: following_company_row_id })
                if (queryRun) {
                    await deleteCompanyFollowers({ type: 1, company_row_id: following_company_row_id, user_row_id: user_row_id })
                    const delete_cache = await deleteKeysByPattern('company_followers_*')
                    await deleteKeysByPattern('app_company_list_*')
                    await deleteKeysByPattern('company_list_*')
                    await deleteKeysByPattern('organizers_list_*')
                    await deleteKeysByPattern('company_followers_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_popular_companies*')
                    await deleteKeysByPattern('app_front_page_partners_list_*')
                    await deleteKeysByPattern('company_watchlist_list_*')
                    await deleteKeysByPattern('users_company_following_list_' + user_row_id + '_*')


                    res.json({ status: true, delete_cache: delete_cache, message: { alert_message: 'This company has been successfully removed from your following list.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Already removed..' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Invalid company row id' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Unfollow company.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/remove_follower/:follower_user_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const company_user_row_id = Number.parseInt(checkUserToken.message)
            const company_query = await companyM.findOne({ user_row_id: company_user_row_id }, { _id: 1 })
            if (company_query) {
                let company_row_id = company_query._id
                let follower_user_row_id = Number.parseInt(req.params.follower_user_row_id)
                if (!Number.isNaN(follower_user_row_id)) {
                    const queryRun = await followersM.findOne({ user_row_id: follower_user_row_id, company_row_id: company_row_id })
                    if (queryRun) {
                        await deleteCompanyFollowers({ type: 1, company_row_id: company_row_id, user_row_id: follower_user_row_id })
                        const delete_cache = await deleteKeysByPattern('company_followers_*')
                        await deleteKeysByPattern('organizers_list_*')
                        await deleteKeysByPattern('app_user_other_details_*')
                        await deleteKeysByPattern('app_company_individual_details_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('app_front_page_partners_list_*')
                        await deleteKeysByPattern('company_watchlist_list_*')
                        res.json({ status: true, delete_cache: delete_cache, message: { alert_message: 'The user has been successfully removed from your followers. Thank you for your action!' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Already removed..' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry,This user not listed any company' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Remove Follower.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/company_followers/:company_row_id', async (req, res) => {
    try {

        if (!Number.isNaN(Number.parseInt(req.params.company_row_id))) {
            const company_row_id = Number.parseInt(req.params.company_row_id)
            const key = `company_followers_${company_row_id}`
            const cache_response = await getCache({ key })
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message,
                    cache_reponse_status: true
                })
            }
            const get_query = await followersM.aggregate([
                { $match: { company_row_id } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        as: "img_info"
                    }
                },
                { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "user_info",
                        pipeline: [
                            {
                                $project: {
                                    user_name: 1,
                                    full_name: 1,
                                    approval_status: 1,
                                    pro_batch: 1,
                                    login_status: 1,
                                    account_visible_type: 1,
                                    designation_id: 1,
                                }
                            }
                        ]
                    }
                },
                { $match: { "user_info": { $elemMatch: { "login_status": 1 } } } },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_work_experiences",
                        localField: "user_row_id",
                        foreignField: "user_row_id",
                        pipeline: buildCompanyFollowersInfoWorkPipeline(),
                        as: "info_work",
                    }
                },
                { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: "$user_info._id",
                        profile_image: "$img_info.profile_image",
                        user_name: "$user_info.user_name",
                        full_name: "$user_info.full_name",
                        pro_batch: "$user_info.pro_batch",
                        approval_status: "$user_info.approval_status",
                        login_status: "$user_info.login_status",
                        account_visible_type: "$user_info.account_visible_type",
                        user_row_id: 1,
                        position_name: "$info_work.position_name",
                        company_name: "$info_work.company_name",
                        designation_id: "$user_info.designation_id"
                    }
                }
            ])

            // res.json({ status: true, message: get_query })
            await setCache({
                key,
                value: get_query,
                ttl: 1800
            })

            return res.json({
                status: true,
                message: get_query,
                cache_reponse_status: false
            })
        }
        else {
            res.json({ status: true, message: { alert_message: 'Invalid company row id' } })
        }
    }
    catch (err) {
        console.log('Company followers.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/company_wallet_address_list', async (req, res) => {
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
        try {
            const user_row_id = checkUserToken.message
            const getCompany = await companyM.findOne({ user_row_id: user_row_id }, { _id: 1 })
            if (getCompany) {
                let company_row_id = getCompany._id
                const queryRun = await company_wallet_addressM.find({ company_row_id: company_row_id }).limit(3)

                res.json({ status: true, message: queryRun })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, This user did not register company." } })
            }
        }
        catch (err) {
            console.log('Company wallet address list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    }
    else {
        res.json(checkUserToken)
    }
})

router.post('/add_company_wallet_address', [
    check('wallet_address')
        .not().isEmpty().withMessage('The Wallet Address field is required.')
        .isLength({ min: 25 }).withMessage('The Wallet Address field must be at least 25 characters in length.')
        .isLength({ max: 60 }).withMessage('The Wallet Address field must be less than 60 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const getCompany = await companyM.findOne({ user_row_id: user_row_id }, { _id: 1 })
            if (getCompany) {
                let company_row_id = getCompany._id

                const wallet_address = (sanitize(req.body.wallet_address)).toLowerCase()
                if (user_row_id) {
                    const checkWalletAddress = await company_wallet_addressM.findOne({ wallet_address: wallet_address, company_row_id: company_row_id })
                    if (checkWalletAddress) {
                        errObj['wallet_address'] = 'Sorry, This Wallet Address already exists.'
                    }

                    const checkWalletAddLimitQuery = await company_wallet_addressM.find({ company_row_id: company_row_id })
                    if (checkWalletAddLimitQuery.length >= 3) {
                        errObj['alert_message'] = 'Sorry, maximun wallet addresses limit reached.'
                    }
                }

                if (Object.keys(errObj).length > 0) {
                    res.json({ status: false, message: errObj })
                }
                else {
                    // const nick_name = (req.body.nick_name).toLowerCase()
                    const insertArray = new company_wallet_addressM({
                        company_row_id: company_row_id,
                        nick_name: req.body.nick_name,
                        wallet_address: wallet_address,
                        date_n_time: getPresentDateTime()
                    })
                    await insertArray.save()
                    res.json({ status: true, message: { alert_message: "Your company wallet Address details added successfully." } })

                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, this user did not register Company" } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Add company wallet address list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

// router.get('/remove_company_wallet/:request_row_id', async (req, res) =>  
// {   
//     try
//     {
//         const checkUserToken = checkUserLoginToken(req.headers)
//         if(checkUserToken.status)
//         {
//             const request_row_id = Number.parseInt(req.params.request_row_id)
//             const user_row_id = checkUserToken.message
//             if(!Number.isNaN(request_row_id))
//             {
//                 const getCompany = await companyM.findOne({user_row_id:user_row_id},{_id:1})
//                 if(getCompany)
//                 {
//                     let company_row_id = getCompany._id
//                     const queryRun = await company_wallet_addressM.findOne({company_row_id:company_row_id, _id:request_row_id})
//                     if(queryRun)
//                     {   
//                         await company_wallet_addressM.deleteOne({company_row_id:company_row_id, _id:request_row_id})
//                         res.json({ status:true, message:{alert_message:"This company wallet address removed successfully."} })

//                     }
//                     else
//                     {
//                         res.json({ status:false, message:{alert_message:"Sorry, Invalid company wallet address request id."} })
//                     }
//                 }
//                 else
//                 {
//                     res.json({ status:false, message: {alert_message:"Sorry, This user did not register company."} })
//                 }
//             }
//             else
//             {
//                 res.json({status:false, message:{alert_message:'Sorry, Invalid request row id'}})
//             }
//         }
//         else
//         { 
//             res.json(checkUserToken) 
//         } 
//     }
//     catch(err)
//     {
//         console.log('Remove company wallet.', err.message)
//         res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
//     } 
// })

// router.get('/remove_podcast_id', async(req, res) =>
// {
//     const checkUserToken = checkUserLoginToken(req.headers)
//     if(checkUserToken.status)
//     {
//         try
//         {
//             const user_row_id = Number.parseInt(checkUserToken.message)
//             const checkPodcast = await companyM.findOne({user_row_id:user_row_id},{podcast_id:1, podcast_title:1})
//             if(checkPodcast.podcast_id)
//             {
//                 await companyM.updateOne({user_row_id:user_row_id},{$set:{podcast_id:'', podcast_title:''}})
//                 await companyPodcastsM.deleteOne({company_row_id:checkPodcast._id})

//                 res.json({status:true, message:{alert_message:'Podcast removed successfully'}})
//             }
//             else
//             {
//                 res.json({status:false, message:{alert_message:'Sorry, This company did not have any podcast'}})
//             }
//         }
//         catch(err)
//         {
//             console.log('Remove podcast id.', err.message)
//             res.json({ status:false, message: 'An unexpected error occurred. Please try again later.' })
//         } 
//     }
//     else
//     {
//         res.json(checkUserToken)
//     }
// })


router.post('/verify_company_email_otp', [
    check('otp_number')
        .trim().not().isEmpty().withMessage('The otp number field is required.')
        .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = verifyEmailTempToken(req.headers)
        if (!checkUserToken.status) {
            errObj['alert_message'] = checkUserToken.message.alert_message
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const token_res = checkUserToken.message
            const user_row_id = token_res.account_row_id
            const check_email_query = await verify_emailM.findOne({ user_row_id: user_row_id, email_verify_code: token_res.email_verify_code })
            if (check_email_query) {
                if (check_email_query.email_otp_number == req.body.otp_number) {
                    const rowData = await professionalsM.findOne({ _id: user_row_id })

                    let resArray = {}
                    resArray['token'] = generateUserLoginToken(user_row_id, 1)
                    resArray['_id'] = user_row_id
                    resArray['referral_row_id'] = rowData.referral_row_id
                    resArray['referral_user_name'] = rowData.referral_user_name
                    resArray['user_name'] = rowData.user_name
                    resArray['full_name'] = rowData.full_name
                    resArray['email_id'] = rowData.email_id
                    resArray['mobile_number'] = rowData.mobile_number
                    resArray['wallet_address'] = rowData.wallet_address
                    resArray['company_name'] = rowData.company_name
                    resArray['work_position'] = rowData.work_position
                    resArray['login_status'] = 1
                    resArray['approval_status'] = rowData.approval_status
                    resArray['created_date_n_time'] = rowData.created_date_n_time
                    resArray['company_listed_status'] = 0
                    resArray['email_verify_status'] = true

                    const query = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 })
                    if (query) {
                        resArray['company_listed_status'] = 1
                    }
                    else {
                        resArray['company_listed_status'] = 0
                    }

                    const imageQueryRun = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id })
                    if (imageQueryRun) {
                        resArray['profile_image'] = imageQueryRun.profile_image
                    }
                    else {
                        resArray['profile_image'] = ""
                    }

                    await verify_emailM.updateOne({ user_row_id: user_row_id }, {
                        $set:
                        {
                            email_otp_number: "",
                            email_verify_code: "",
                            email_verify_status: true
                        }
                    })

                    res.json({ status: true, message: resArray })
                }
                else {
                    res.json({ status: false, message: { otp_number: "Sorry, Your OTP is not matching" } })
                }
            }
            else {

                res.json({ status: false, message: { alert_message: "Sorry, This token field is expired." } })

            }
        }
    }
    catch (err) {
        console.log('Verify company email otp.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})



// email_verify_otp
router.get('/send_email_otp', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const user_query = await professionalsM.findOne({ _id: user_row_id, email_verify_status: 1, login_status: true },
                { _id: 1, full_name: 1, email_verify_status: 1 })
            if (user_query) {
                const company_query = await companyM.findOne({ user_row_id: user_row_id }, { _id: 1, company_email_id: 1, email_verify_status: 1, company_name: 1 })
                if (company_query) {

                    if (!company_query.email_verify_status) {
                        const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
                        await companyM.updateOne({ user_row_id: user_row_id }, { email_verify_status: false, email_verify_otp: verify_otp })

                        let pass_email_id = company_query.company_email_id //'developerjory@gmail.com'
                        let pass_subject = verify_otp + " is OTP to verify your coinpedia company profile account."
                        let full_name = user_query.full_name
                        let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b> is your OTP for email verification number to verify your coinpedia <b>${company_query.company_name}</b> company profile account. </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Please verify your company email for the quick process for account claiming.</p>`

                        await sendEmail(pass_email_id, pass_subject, pass_message)

                        res.json({ status: true, message: { alert_message: "We sent an OTP to your company email, please verify email." } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry, Your company account is already verified" } })
                    }

                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, we are not any related your account, please update your company details" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Your User Account email is not verified, please verify & update company email verify status." } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Send email otp.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_company_seo', [
    check('module_id').not().isEmpty().withMessage('The Company ID field is required.'),
    check('meta_title').not().isEmpty().withMessage('The Meta Title field is required.'),
    check('meta_description').not().isEmpty().withMessage('The Meta Description field is required.'),
    check('meta_keywords').not().isEmpty().withMessage('The Meta Keywords field is required.'),
], async (req, res) => {
    try {
        // VALIDATION
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);
        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        // TOKEN CHECK
        const checkUserToken = await checkAllLoginToken(req.headers, [7]);
        if (!checkUserToken.status) return res.json(checkUserToken);

        let {
            module_id,
            meta_title,
            meta_description,
            meta_keywords,
            robots_index,
            robots_follow,
            twitter_creator,
            og_title,
            og_description,
            twitter_title,
            twitter_description,
            updated_at
        } = req.body;

        // RESTRICTION: Normal user can update only his company
        let condition = { _id: Number(module_id) };
        if (checkUserToken.message.user_type == 1) {
            condition.user_row_id = checkUserToken.message.user_row_id;
        }

        const companyData = await companyM.findOne(condition);
        if (!companyData) {
            return res.json({ status: false, message: { alert_message: "Invalid Company ID." } });
        }

        const checkQuery = await company_seo_detailsM.findOne({ company_row_id: condition?._id })

        // CHANGE DETECTION
        const seoChanged =
            meta_title !== checkQuery?.meta_title ||
            meta_description !== checkQuery?.meta_description ||
            meta_keywords !== checkQuery?.meta_keywords ||
            og_title !== checkQuery?.og_title ||
            og_description !== checkQuery?.og_description ||
            twitter_title !== checkQuery?.twitter_title ||
            twitter_description !== checkQuery?.twitter_description ||
            robots_index !== checkQuery?.robots_index ||
            robots_follow !== checkQuery?.robots_follow ||
            twitter_creator !== checkQuery?.twitter_creator;

        // CREATE CHANGE LOG ENTRY
        if (seoChanged) {
            await seo_change_logsM.create({
                module_key: "company",
                module_id: module_id,

                old_meta_title: checkQuery?.meta_title || "",
                new_meta_title: meta_title === checkQuery?.meta_title ? "" : meta_title,

                old_meta_description: checkQuery?.meta_description || "",
                new_meta_description: meta_description === checkQuery?.meta_description ? "" : meta_description,

                old_meta_keywords: checkQuery?.meta_keywords || "",
                new_meta_keywords: meta_keywords === checkQuery?.meta_keywords ? "" : meta_keywords,

                old_og_title: checkQuery?.og_title || "",
                new_og_title: og_title === checkQuery?.og_title ? "" : og_title,

                old_og_description: checkQuery?.og_description || "",
                new_og_description: og_description === checkQuery?.og_description ? "" : og_description,

                old_twitter_title: checkQuery?.twitter_title || "",
                new_twitter_title: twitter_title === checkQuery?.twitter_title ? "" : twitter_title,

                old_twitter_description: checkQuery?.twitter_description || "",
                new_twitter_description: twitter_description === checkQuery?.twitter_description ? "" : twitter_description,

                old_robots_index: checkQuery?.robots_index || "",
                new_robots_index: robots_index === checkQuery?.robots_index ? "" : robots_index,

                old_robots_follow: checkQuery?.robots_follow || "",
                new_robots_follow: robots_follow === checkQuery?.robots_follow ? "" : robots_follow,

                old_twitter_creator: checkQuery?.twitter_creator || "",
                new_twitter_creator: twitter_creator === checkQuery?.twitter_creator ? "" : twitter_creator,

                user_type: checkUserToken.message.user_type == 1 ? "user" : "admin",
                updated_by: checkUserToken.message.user_row_id || 0
            });
        }

        // UPDATE COMPANY SEO
        let updateData = {
            meta_title,
            meta_description,
            meta_keywords,
            robots_index,
            robots_follow,
            twitter_creator,
            og_title,
            og_description,
            twitter_title,
            twitter_description
        };

        console.log(`update_company_seo: company_row_id=${module_id} existingSeoDoc=${!!checkQuery} seoChanged=${seoChanged}`)

        const updateResult = await company_seo_detailsM.updateOne(
            { company_row_id: Number(module_id) },
            { $set: updateData },
            { upsert: true }
        );

        console.log(`update_company_seo: matchedCount=${updateResult.matchedCount} modifiedCount=${updateResult.modifiedCount} upsertedCount=${updateResult.upsertedCount}`)

        if (!updateResult.acknowledged || (updateResult.matchedCount === 0 && !updateResult.upsertedCount)) {
            console.log(`update_company_seo: write did not take effect for company_row_id=${module_id}`, updateResult)
            return res.json({
                status: false,
                message: { alert_message: "Company SEO details could not be saved. Please try again." }
            });
        }

        await deleteKeysByPattern('app_user_detail_*')
        await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('app_company_individual_details_*')


        await calculateCompanyProfileScore(module_id, ["basic"]);

        return res.json({
            status: true,
            message: { alert_message: "Company SEO meta details updated successfully" }
        });

    } catch (err) {
        console.log("Update company SEO error:", err.message, err)
        return res.json({
            status: false,
            message: { alert_message: "An unexpected error occurred. Please try again later." }
        });
    }
});

router.get('/get_company_seo/:company_id', async (req, res) => {
    try {
        const company_id = req.params.company_id;

        if (!company_id) {
            return res.json({
                status: false,
                message: { alert_message: "The Company ID field is required." }
            });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [7]);
        if (!checkUserToken.status) return res.json(checkUserToken);

        // RESTRICTION: Normal user can view only his company
        let condition = { _id: Number(company_id) };
        if (checkUserToken.message.user_type == 1) {
            condition.user_row_id = checkUserToken.message.user_row_id;
        }
        const companyData = await companyM.aggregate([
            { $match: condition },

            // Subadmin data
            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "sub_admin_row_id",
                    foreignField: "_id",
                    as: "sub_admin_info",
                    pipeline: [
                        { $project: { _id: 1, full_name: 1 } }
                    ]
                }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        { $project: { _id: 1, full_name: 1, user_name: 1, profile_image: 1 } }
                    ]
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_company_seo_details",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "seo_details",
                }
            },
            { $unwind: { path: "$seo_details", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_company_social_links",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "social_links",
                }
            },
            { $unwind: { path: "$social_links", preserveNullAndEmptyArrays: true } },
            // Company FAQ
            {
                $lookup: {
                    from: "cln_company_faq_lists",
                    localField: "_id",
                    foreignField: "company_row_id",
                    as: "faq",
                    pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }]
                }
            },

            // Identify creator
            {
                $addFields: {
                    created_by_status: {
                        $switch: {
                            branches: [
                                {   // if sub_admin exists -> 2
                                    case: { $gt: [{ $size: "$sub_admin_info" }, 0] },
                                    then: 2
                                },
                                {   // if no sub_admin AND full_name exists (not empty / "0") -> 1
                                    case: {
                                        $and: [
                                            { $eq: [{ $size: "$sub_admin_info" }, 0] },
                                            {
                                                $or: [
                                                    { $gt: ["$user_info.full_name", ""] },
                                                    { $gt: ["$user_info.full_name", 0] }
                                                ]
                                            }
                                        ]
                                    },
                                    then: 1
                                }
                            ],
                            // else -> 0
                            default: 0
                        }
                    }
                }
            },

            {
                $project: {
                    _id: 1,
                    url: "$company_id",
                    title: "$company_name",
                    description: "$about_company",
                    image: "$company_logo",
                    facebook: '$social_links.facebook',
                    twitter: '$social_links.twitter',
                    linkedin: '$social_links.linkedin',
                    telegram: '$social_links.telegram',
                    instagram: '$social_links.instagram',
                    medium: '$social_links.medium',
                    reddit: '$social_links.reddit',
                    feed_url: '$social_links.feed_url',
                    youtube_channel: '$social_links.youtube_channel',
                    video_link: '$social_links.video_link',
                    website_link: 1,
                    established_in: 1,
                    start_date: 1,
                    created_date_n_time: '$created_date_n_time',
                    // SEO
                    meta_title: '$seo_details.meta_title',
                    meta_description: '$seo_details.meta_description',
                    meta_keywords: '$seo_details.meta_keywords',
                    robots_index: '$seo_details.robots_index',
                    robots_follow: '$seo_details.robots_follow',
                    og_title: '$seo_details.og_title',
                    og_description: '$seo_details.og_description',
                    twitter_title: '$seo_details.twitter_title',
                    twitter_description: '$seo_details.twitter_description',
                    twitter_creator: '$seo_details.twitter_creator',

                    faq: 1,
                    created_by_status: 1,

                    sub_admin_name: "$sub_admin_info.full_name",
                    email_id: "$company_email_id",
                    user_name: "$user_info.user_name",
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    sub_admin_name: "$sub_admin_info.full_name",
                }
            }
        ]);

        if (!companyData.length)
            return res.json({
                status: false,
                message: { alert_message: "Invalid Company ID." }
            });

        return res.json({
            status: true,
            message: { alert_message: "Company SEO fetched successfully" },
            data: companyData[0]
        });

    } catch (err) {
        console.log("Get company SEO error:", err);
        return res.json({
            status: false,
            message: { alert_message: "An unexpected error occurred. Please try again later." }
        });
    }
});



router.buildCompanyFollowersInfoWorkPipeline = buildCompanyFollowersInfoWorkPipeline

module.exports = router