const express = require('express')
const router = express.Router()
const randomstring = require("randomstring")
const sanitize = require('mongo-sanitize')
const { deleteCache, getKeys, deleteKeysByPattern } = require('../../../config/cache_helper')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, validateAndSaveImage, user_profile_completed_percentage, deleteImageDigitalOcean, getIntIdFromArray, removeHtmltag } = require('../../../utils/helpers/helper')
const { checkUserLoginToken, generateEmailTempToken, profileVerifyEmailToken, checkAllLoginToken, checkApiKey, checkAdminLoginToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { deleteProfessionalDetails, basic_details_points, social_details_points, getUserProfileWithScore, sendJobEligibilityEmail, sendNewsCoverageEmail, calculateUserProfileScore, calculateCompanyProfileScore, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { shiftUserFromManualToRegister } = require('../../../utils/helpers/events_helper')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')

const professionalsM = require('../../../models/app/professionalsM')
const professionals_profile_imagesM = require('../../../models/app/professionals_profile_imagesM')
const { getUsersProfessionalDetails, getUserIndividualDetails, getUserSuggestionDetails, getCompanySuggestions } = require('../../../services/app/settings')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const sub_admin_emailsM = require('../../../models/admin_panel/app/sub_admin_emailsM')
const professionals_followersM = require('../../../models/app/professionals_followersM')

const verify_mobile_numberM = require('../../../models/app/auth_account/verify_mobile_numberM')
const verify_emailM = require('../../../models/app/auth_account/verify_emailM')
const update_verify_emailsM = require('../../../models/app/auth_account/update_verify_emailsM')

const userDesignationM = require('../../../models/app/static/user_designationsM')
const userLookingForM = require('../../../models/app/static/user_looking_forM')
const default_profile_imgM = require('../../../models/app/static/default_profile_imgM')
const domains_blockedM = require('../../../models/system_settings/domains_blockedM')

const companyM = require('../../../models/app/company/companyM')
const professionals_delete_verificationsM = require('../../../models/app/professionals_delete_verificationsM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const eventM = require('../../../models/app/events/eventM')
const push_notifications_detailsM = require('../../../models/app/notifications/push_notifications_detailsM')
const professionals_faqM = require('../../../models/app/users/professionals_faqM')
const professionals_pointsM = require('../../../models/app/users/professionals_pointsM')
const community_postsM = require('../../../models/main/community/community_postsM')
const courses_certificatesM = require('../../../models/main/academy/courses_certificatesM')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const professionals_seo_detailsM = require('../../../models/app/professionals_seo_detailsM')
const professionals_social_linksM = require('../../../models/app/professionals_social_linksM')


router.post('/update_user_details', [
    check('gender')
        .trim().isInt({ min: 1, max: 3 }).withMessage('The gender field value must be contain 1,2 or 3.'),
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.')
        .isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('account_visible_type')
        .trim().isInt({ min: 1, max: 2 }).withMessage('The account visible type field value must be contain 1 or 2.'),
    check('user_bio')
        .trim().not().isEmpty().withMessage('The User Bio field is required.'),
    check('designation_id')
        .not().isEmpty().withMessage('The Designation Id field is required.'),
    check('about_in_one_line')
        .not().isEmpty().withMessage('The About in One Line field is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            let mobile_number = ''
            let user_name = ""
            let email_id = ""
            let sub_admin_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else {
                sub_admin_row_id = checkUserToken.message.user_row_id
                if (req.body.user_row_id) {
                    if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                        user_row_id = Number.parseInt(req.body.user_row_id)
                    }
                    else {
                        const check_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                        if (!check_user_query) {
                            errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
                        }
                    }
                }

                if (req.body.mobile_number) {
                    if (req.body.mobile_number.match(/[^0-9\-(\)\s]/)) {

                        errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.';
                    }

                    const check_mobile_num_query = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { mobile_number: sanitize(req.body.mobile_number) }] })
                    if (check_mobile_num_query) {
                        errObj['mobile_number'] = 'This Mobile number is already in use.'
                    }
                    mobile_number = req.body.mobile_number
                }


                if (req.body.user_name) {
                    user_name = (sanitize(req.body.user_name)).toLowerCase()
                    const check_query = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { user_name: user_name }] })
                    if (check_query) {
                        errObj['user_name'] = 'This username is already in use.'
                    }
                }
                else {
                    errObj['user_name'] = 'The username field is required.'
                }

                if (req.body.email_id) {
                    email_id = req.body.email_id ? (sanitize(req.body.email_id)).toLowerCase() : ""

                    const check_email_query = await professionalsM.findOne({ email_id: email_id, _id: { $ne: sanitize(user_row_id) } })
                    if (check_email_query) {
                        errObj['email_id'] = 'Sorry, This Email ID already exists.'
                    }

                    const email_id_split = (email_id).split("@")
                    const domain_name = email_id_split.slice(-1)
                    const check_domain_query = await domains_blockedM.findOne({ domain_name: domain_name })
                    if (check_domain_query) {
                        errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
                    }
                }
            }



            if (req.body.full_name.match(/[^A-Za-z0-9 ]/)) {
                errObj['full_name'] = 'The Full Name field may only contain alpha-numeric characters and spaces.'
            }

            let looking_for_id = []
            if ((req.body.looking_for_id) && (req.body.looking_for_id.length > 0)) {
                let looking_for_id_array = await getIntIdFromArray(req.body.looking_for_id)
                if (looking_for_id_array.length > 0) {
                    looking_for_id = looking_for_id_array
                }
                else {
                    errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
                }
            }

            let designation_id = []
            if ((req.body.designation_id) && (req.body.designation_id.length > 0)) {
                let designation_id_array = await getIntIdFromArray(req.body.designation_id)
                if (designation_id_array.length > 0) {
                    designation_id = designation_id_array
                }
                else {
                    errObj['designation_id'] = 'The Designation Ids field must be integer in object'
                }
            }

            if (req.body.vcf_status) {
                if (Number.isNaN(Number.parseInt(req.body.vcf_status))) {
                    errObj['vcf_status'] = 'The VCF Status field must be integer.'
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const main_array = {}
                main_array['gender'] = req.body.gender
                main_array['full_name'] = req.body.full_name
                main_array['account_visible_type'] = req.body.account_visible_type
                main_array['designation_id'] = designation_id
                main_array['updated_date_n_time'] = getPresentDateTime()
                main_array['about_in_one_line'] = req.body.about_in_one_line
                main_array['country_id'] = req.body.country_id
                main_array['country_mobile_id'] = req.body.country_mobile_id

                main_array['location'] = req.body.location
                main_array['looking_for_id'] = looking_for_id
                main_array['user_bio'] = req.body.user_bio
                main_array['vcf_status'] = req.body.vcf_status ? Number.parseInt(req.body.vcf_status) : 0
                main_array['area'] = req.body.area
                main_array['city'] = req.body.city
                main_array['country_name'] = req.body.country_name
                main_array['location_country'] = req.body.location_country
                main_array['state'] = req.body.state
                main_array['longitude'] = req.body.longitude
                main_array['latitude'] = req.body.latitude
                if (checkUserToken.message.user_type == 2) {
                    main_array['mobile_number'] = ''
                    if (mobile_number) {
                        main_array['mobile_number'] = req.body.mobile_number
                    }
                }


                if (checkUserToken.message.user_type == 2) {
                    main_array['user_name'] = ''
                    if (user_name) {
                        main_array['user_name'] = req.body.user_name
                    }
                }


                if (checkUserToken.message.user_type == 2) {
                    main_array['email_id'] = ''
                    if (email_id) {
                        main_array['email_id'] = req.body.email_id
                    }
                }


                let alert_message = ''
                if (user_row_id) {

                    const updateFields = getUpdateTrackerFields(checkUserToken)
                    Object.assign(main_array, updateFields)

                    await professionalsM.updateOne({ _id: user_row_id }, { $set: main_array })
                    await deleteKeysByPattern('professional_detail_list_*')
                    await deleteKeysByPattern('speakers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('user_detail*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('app_popular_professionals*')

                    alert_message = "Great! Your profile details have been updated successfully. Thank you for making the necessary changes"
                }
                else {
                    const date_n_time = getPresentDateTime()
                    main_array['created_date_n_time'] = date_n_time
                    main_array['sub_admin_row_id'] = sub_admin_row_id
                    main_array['claim_status'] = 1
                    delete main_array['updated_date_n_time'];

                    const inserted_query = await professionalsM(main_array).save()
                    await deleteKeysByPattern('speakers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('user_detail*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('app_popular_professionals*')
                    user_row_id = inserted_query._id

                    if (!Number.isNaN(Number.parseInt(req.body.manual_user_row_id))) {
                        const manual_user_row_id = Number.parseInt(req.body.manual_user_row_id)
                        const check_manual_query = await professionals_manual_retrievalsM.findOne({ _id: manual_user_row_id })
                        if (check_manual_query) {
                            await shiftUserFromManualToRegister({ manual_user_row_id: manual_user_row_id, register_user_row_id: user_row_id, sub_admin_row_id: sub_admin_row_id })
                        }
                    }

                    let pass_subject = " Coinpedia Has Listed Your User Profile. ! Claim This User Profile Now "
                    let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${inserted_query.full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that your user profile has been listed on Coinpedia. You can claim this profile page to unlock unlimited features and enhance your online presence.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                    <ul>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                    </ul>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Get started with the user profile today, by submitting a claim request to our admin. Our admin will review and notify you via email. Upon admin’s approval, you get access to all the features. </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> </p>`

                    await sendEmail(email_id, pass_subject, pass_message)
                    alert_message = 'New user successfully created.'
                }

                // Update main collection fields 

                let social_update_array = {}
                social_update_array['youtube_channel'] = req.body.youtube_channel ? (req.body.youtube_channel).trim() : ''
                social_update_array['website'] = req.body.website

                // Update SEO details
                let seo_update_array = {}
                const check_query = await professionals_seo_detailsM.findOne({ user_row_id: user_row_id }, {
                    _id: 1, meta_keywords: 1,
                    meta_description: 1,
                    meta_title: 1,
                    robots_index: 1,
                    robots_follow: 1,
                    og_title: 1,
                    og_description: 1,
                    twitter_title: 1,
                    twitter_description: 1,
                    twitter_creator: 1
                })
                if (req.body?.user_bio) {

                    // Sanitize input before using it
                    if (!check_query?.meta_description) {
                        const cleanedBio = removeHtmltag(req.body.user_bio).slice(0, 160);
                        seo_update_array.meta_description = cleanedBio;
                        seo_update_array.og_description = cleanedBio;
                        seo_update_array.twitter_description = cleanedBio;
                    } else if (!check_query.og_description) {
                        seo_update_array.og_description = check_query?.meta_description;
                        seo_update_array.twitter_description = check_query?.meta_description;
                    }
                }

                // Auto-fill title and keywords from full_name
                if (req.body.full_name) {
                    const title = req.body.full_name + " | Coinpedia User Profile";
                    if (!check_query?.meta_title) {
                        seo_update_array.meta_title = title;
                        seo_update_array.og_title = title;
                        seo_update_array.twitter_title = title;
                    } else if (!check_query.og_title) {
                        seo_update_array.og_title = check_query?.meta_title;
                        seo_update_array.twitter_title = check_query?.meta_title;
                    }

                    if (!check_query?.meta_keywords) {
                        seo_update_array.meta_keywords = req.body.full_name;
                    }
                }
                const hasChanged = (oldVal, newVal) =>
                    (newVal ?? "").trim() !== "" &&
                    (oldVal ?? "").trim() !== (newVal ?? "").trim();

                const changed =
                    hasChanged(check_query?.meta_description, seo_update_array.meta_description) ||
                    hasChanged(check_query?.og_description, seo_update_array.og_description) ||
                    hasChanged(
                        check_query?.twitter_description, seo_update_array.twitter_description) ||
                    hasChanged(check_query?.meta_keywords, seo_update_array.meta_keywords) ||
                    hasChanged(check_query?.meta_title, seo_update_array.meta_title) ||
                    hasChanged(check_query?.og_title, seo_update_array.og_title) ||
                    hasChanged(check_query?.twitter_title, seo_update_array.twitter_title);



                if (changed) {
                    await seo_change_logsM.create({
                        module_key: "professional",
                        module_id: user_row_id,

                        old_meta_title: check_query?.meta_title || "",
                        new_meta_title: hasChanged(check_query?.meta_title, seo_update_array.meta_title)
                            ? seo_update_array.meta_title
                            : "",

                        old_meta_description: check_query?.meta_description || "",
                        new_meta_description: hasChanged(
                            check_query?.meta_description,
                            seo_update_array.meta_description
                        )
                            ? seo_update_array.meta_description
                            : "",

                        old_meta_keywords: check_query?.meta_keywords || "",
                        new_meta_keywords: hasChanged(
                            check_query?.meta_keywords,
                            seo_update_array.meta_keywords
                        )
                            ? seo_update_array.meta_keywords
                            : "",

                        old_og_title: check_query?.og_title || "",
                        new_og_title: hasChanged(check_query?.og_title, seo_update_array.og_title)
                            ? seo_update_array.og_title
                            : "",

                        old_og_description: check_query?.og_description || "",
                        new_og_description: hasChanged(
                            check_query?.og_description,
                            seo_update_array.og_description
                        )
                            ? seo_update_array.og_description
                            : "",

                        old_twitter_title: check_query?.twitter_title || "",
                        new_twitter_title: hasChanged(
                            check_query?.twitter_title,
                            seo_update_array.twitter_title
                        )
                            ? seo_update_array.twitter_title
                            : "",

                        old_twitter_description: check_query?.twitter_description || "",
                        new_twitter_description: hasChanged(
                            check_query?.twitter_description,
                            seo_update_array.twitter_description
                        )
                            ? seo_update_array.twitter_description
                            : "",

                        user_type: checkUserToken.message.user_type === 1 ? "user" : "admin",
                        updated_by:
                            checkUserToken.message.user_type === 1
                                ? user_row_id
                                : sub_admin_row_id
                    });
                }

                // Update SEO details
                await professionals_seo_detailsM.findOneAndUpdate(
                    { user_row_id: user_row_id },
                    { $set: seo_update_array },
                    { upsert: true }
                )
                await professionals_social_linksM.findOneAndUpdate(
                    { user_row_id: user_row_id },
                    { $set: social_update_array },
                    { upsert: true }
                )

                await deleteKeysByPattern('user_detail*')
                await deleteKeysByPattern('app_user_detail_*')
                await deleteKeysByPattern('app_popular_professionals*')
                await deleteKeysByPattern('individual_event_*')

                let location_object = {}



                await deleteKeysByPattern('app_company_individual_details_*')
                await deleteKeysByPattern('speakers_list_*')
                await deleteKeysByPattern('user_detail*')
                await deleteKeysByPattern('app_user_detail_*')
                await deleteKeysByPattern('app_popular_professionals*')
                await deleteKeysByPattern('individual_event_*')
                await calculateUserProfileScore(user_row_id, ['professional_profile'])
                res.json({ status: true, message: { user_row_id, alert_message, location_country: req.body.location_country } })
            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Update user profile.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }

})
router.get("/profile_score", async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [0])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else {
                if (req.query.user_row_id) {
                    if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                        user_row_id = Number.parseInt(req.query.user_row_id)
                    }
                }
            }

            const showScore = req.query.score


            const userMain = await professionalsM.findOne(
                { _id: user_row_id },
                {
                    professional_profile_score: 1,
                    seo_details_score: 1,
                    social_media_score: 1,
                    academy_score: 1,
                    community_score: 1,
                    professional_detail_score: 1,
                    investment_score: 1,
                    award_score: 1,
                    faq_score: 1,
                    profile_score: 1,
                }
            );

            if (!userMain) {
                return res.status(404).json({
                    status: false,
                    message: "User not found."
                });
            }

            let total_balance
            if (showScore) {
                total_balance = await professionals_pointsM.aggregate([
                    { $match: { user_row_id: user_row_id } },
                    {
                        $addFields: {
                            numeric_points: { $toDouble: "$points" }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total_credited: {
                                $sum: {
                                    $cond: [
                                        { $eq: ["$point_status", "credited"] },
                                        "$numeric_points",
                                        0
                                    ]
                                }
                            },
                            total_debited: {
                                $sum: {
                                    $cond: [
                                        { $eq: ["$point_status", "debited"] },
                                        "$numeric_points",
                                        0
                                    ]
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            total_balance: { $subtract: ["$total_credited", "$total_debited"] }
                        }
                    }
                ]);
            }

            const balance = showScore ? total_balance[0]?.total_balance || 0 : null

            return res.json({
                status: true,
                message: {
                    basic_details: userMain.professional_profile_score,
                    seo_details: userMain.seo_details_score,
                    social_media: userMain.social_media_score,
                    academy: userMain.academy_score,
                    community: userMain.community_score,
                    work_experience: userMain.professional_detail_score,
                    investments: userMain.investment_score,
                    awards: userMain.award_score,
                    faqs: userMain.faq_score,
                    total_score: userMain.profile_score,
                    points: balance,
                },
            });
        } else {
            res.json({ status: true, message: { alert_message: checkUserToken.message } })
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: "Server error", error: err.message });
    }
});


router.get("/all_users_profile_scores/:skip/:limit", async (req, res) => {
    try {
        const checkAdminToken = checkAdminLoginToken(req.headers, [0])
        if (checkAdminToken?.status) {

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const users = await professionalsM.find({}, { _id: 1, full_name: 1, email_id: 1, pro_batch: 1 })
                .skip(skip)
                .limit(limit);

            const results = [];

            for (const user of users) {
                const user_row_id = user._id;
                const userMain = await professionalsM.findOne(
                    { _id: user_row_id },
                    {
                        professional_profile_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        academy_score: 1,
                        community_score: 1,
                        professional_detail_score: 1,
                        investment_score: 1,
                        award_score: 1,
                        faq_score: 1,
                        profile_score: 1,
                    }
                );

                const basic_details_score = userMain?.professional_profile_score
                const seo_details_score = userMain?.seo_details_score
                const social_media_score = userMain?.social_media_score
                const faq_score = userMain?.faq_score
                const awards_score = userMain?.award_score
                const work_experience_score = userMain?.professional_detail_score
                const investment_score = userMain?.investment_score
                const total_completion = userMain?.profile_score
                const academy_score = userMain?.academy_score
                const community_score = userMain?.community_score


                results.push({
                    _id: user._id,
                    full_name: user.full_name,
                    pro_batch: user.pro_batch,
                    email_id: user.email_id,
                    profile_score: {
                        basic_details: basic_details_score,
                        seo_details: seo_details_score,
                        social_media: social_media_score,
                        faq: faq_score,
                        awards: awards_score,
                        work_experience: work_experience_score,
                        investments: investment_score,
                        total_score_percentage: total_completion,
                        academy_score: academy_score,
                        community_score: community_score
                    },
                });
            }

            res.json({
                status: true,
                message: "Live profile scores fetched successfully",
                data: results,
                skip,
                limit,
            });
        } else {
            res.json({ status: false, message: { alert_message: checkAdminToken.message } })
        }
    } catch (err) {
        res.status(500).json({ status: false, message: "Server error", error: err.message });
    }
});




// without token api 
router.post('/update_user_details_api', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.')
        .isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),

], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let user_row_id = 0
        // let mobile_number = ''
        let user_name = ""
        let email_id = ""
        let sub_admin_row_id = 0

        // sub_admin_row_id = checkUserToken.message.user_row_id
        if (!(req.body.feed_url || req.body.facebook || req.body.twitter || req.body.linkedin || req.body.video_link || req.body.instagram || req.body.telegram || req.body.reddit || req.body.medium || req.body.youtube_channel)) {
            errObj['alert_message'] = 'Please submit atleast one social media details.'
        }
        if (req.body.user_row_id) {
            if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                user_row_id = Number.parseInt(req.body.user_row_id)
            }
            else {
                const check_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                if (!check_user_query) {
                    errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
                }
            }


            if (req.body.mobile_number) {
                if (req.body.mobile_number.match(/[^0-9\-(\)\s]/)) {

                    errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.';
                }

                const check_mobile_num_query = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { mobile_number: sanitize(req.body.mobile_number) }] })
                if (check_mobile_num_query) {
                    errObj['mobile_number'] = 'This Mobile number is already in use.'
                }
                // mobile_number = req.body.mobile_number
            }


            if (req.body.user_name) {
                user_name = (sanitize(req.body.user_name)).toLowerCase()
                const check_query = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { user_name: user_name }] })
                if (check_query) {
                    errObj['user_name'] = 'This username is already in use.'
                }
            }
            else {
                errObj['user_name'] = 'The username field is required.'
            }

            if (req.body.email_id) {
                email_id = req.body.email_id ? (sanitize(req.body.email_id)).toLowerCase() : ""

                const check_email_query = await professionalsM.findOne({ email_id: email_id, _id: { $ne: sanitize(user_row_id) } })
                if (check_email_query) {
                    errObj['email_id'] = 'Sorry, This Email ID already exists.'
                }

                const email_id_split = (email_id).split("@")
                const domain_name = email_id_split.slice(-1)
                const check_domain_query = await domains_blockedM.findOne({ domain_name: domain_name })
                if (check_domain_query) {
                    errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
                }
            }
        }



        if (req.body.full_name.match(/[^A-Za-z0-9 ]/)) {
            errObj['full_name'] = 'The Full Name field may only contain alpha-numeric characters and spaces.'
        }

        let looking_for_id = []
        if ((req.body.looking_for_id) && (req.body.looking_for_id.length > 0)) {
            let looking_for_id_array = await getIntIdFromArray(req.body.looking_for_id)
            if (looking_for_id_array.length > 0) {
                looking_for_id = looking_for_id_array
            }
            else {
                errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
            }
        }

        let designation_id = []
        if ((req.body.designation_id) && (req.body.designation_id.length > 0)) {
            let designation_id_array = await getIntIdFromArray(req.body.designation_id)
            if (designation_id_array.length > 0) {
                designation_id = designation_id_array
            }
            else {
                errObj['designation_id'] = 'The Designation Ids field must be integer in object'
            }
        }

        if (req.body.vcf_status) {
            if (Number.isNaN(Number.parseInt(req.body.vcf_status))) {
                errObj['vcf_status'] = 'The VCF Status field must be integer.'
            }
        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const main_array = {}
            main_array['gender'] = req.body.gender
            main_array['full_name'] = req.body.full_name
            main_array['account_visible_type'] = req.body.account_visible_type
            main_array['designation_id'] = designation_id
            main_array['updated_date_n_time'] = getPresentDateTime()
            main_array['about_in_one_line'] = req.body.about_in_one_line
            main_array['country_id'] = req.body.country_id
            main_array['country_mobile_id'] = req.body.country_mobile_id
            main_array['location'] = req.body.location
            main_array['looking_for_id'] = looking_for_id
            main_array['user_bio'] = req.body.user_bio
            main_array['vcf_status'] = req.body.vcf_status ? Number.parseInt(req.body.vcf_status) : 0
            main_array['area'] = req.body.area
            main_array['city'] = req.body.city
            main_array['country_name'] = req.body.country_name
            main_array['state'] = req.body.state
            main_array['longitude'] = req.body.longitude
            main_array['latitude'] = req.body.latitude
            let alert_message = ''
            if (user_row_id) {

                await professionalsM.updateOne({ _id: user_row_id }, { $set: main_array })

                alert_message = "Great! Your profile details have been updated successfully. Thank you for making the necessary changes"
            }
            else {
                const date_n_time = getPresentDateTime()
                main_array['created_date_n_time'] = date_n_time
                main_array['updated_date_n_time'] = date_n_time
                main_array['sub_admin_row_id'] = sub_admin_row_id
                main_array['claim_status'] = 1
                const inserted_query = await professionalsM(main_array).save()
                user_row_id = inserted_query._id

                if (!Number.isNaN(Number.parseInt(req.body.manual_user_row_id))) {
                    const manual_user_row_id = Number.parseInt(req.body.manual_user_row_id)
                    const check_manual_query = await professionals_manual_retrievalsM.findOne({ _id: manual_user_row_id })
                    if (check_manual_query) {
                        await shiftUserFromManualToRegister({ manual_user_row_id: manual_user_row_id, register_user_row_id: user_row_id, sub_admin_row_id: sub_admin_row_id })
                    }
                }

                let pass_subject = " Coinpedia Has Listed Your User Profile. ! Claim This User Profile Now "
                let pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${inserted_query.full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that your user profile has been listed on Coinpedia. You can claim this profile page to unlock unlimited features and enhance your online presence.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                    <ul>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                    </ul>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Get started with the user profile today, by submitting a claim request to our admin. Our admin will review and notify you via email. Upon admin’s approval, you get access to all the features. </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> </p>`

                await sendEmail(email_id, pass_subject, pass_message)
                alert_message = 'New user successfully created.'
            }

            // Update SEO details
            const seo_update_array = {}
            seo_update_array['meta_keywords'] = req.body.meta_keywords
            seo_update_array['meta_description'] = req.body.meta_description
            seo_update_array['user_row_id'] = user_row_id

            await professionals_seo_detailsM.findOneAndUpdate(
                { user_row_id: user_row_id },
                { $set: seo_update_array },
                { upsert: true }
            )

            // Update social links
            const social_update_array = {}
            social_update_array['youtube_channel'] = req.body.youtube_channel ? (req.body.youtube_channel).trim() : ''
            social_update_array['website'] = req.body.website
            social_update_array['user_row_id'] = user_row_id

            await professionals_social_linksM.findOneAndUpdate(
                { user_row_id: user_row_id },
                { $set: social_update_array },
                { upsert: true }
            )


            res.json({ status: true, message: { user_row_id, alert_message, check_location_query } })

        }



    }
    catch (err) {
        console.log('Update user profile.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }

})

router.post('/update_social_media_details', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let errObj = {}
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.body.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                    user_row_id = Number.parseInt(req.body.user_row_id)
                }
                else {
                    const check_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                    if (!check_user_query) {
                        errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
                    }
                }
            }

            if (!(req.body.feed_url || req.body.facebook || req.body.twitter || req.body.linkedin || req.body.video_link || req.body.instagram || req.body.telegram || req.body.reddit || req.body.medium || req.body.youtube_channel || req.body.other_social_links)) {
                errObj['alert_message'] = 'Please submit atleast one social media details.'
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const update_array = {}
                update_array['facebook'] = req.body.facebook ? (req.body.facebook).trim() : ''
                update_array['twitter'] = req.body.twitter ? (req.body.twitter).trim() : ''
                update_array['linkedin'] = req.body.linkedin ? (req.body.linkedin).trim() : ''
                update_array['video_link'] = req.body.video_link ? (req.body.video_link).trim() : ''
                update_array['instagram'] = req.body.instagram ? (req.body.instagram).trim() : ''
                update_array['telegram'] = req.body.telegram ? (req.body.telegram).trim() : ''
                update_array['medium'] = req.body.medium ? (req.body.medium).trim() : ''
                update_array['reddit'] = req.body.reddit ? (req.body.reddit).trim() : ''
                update_array['youtube_channel'] = req.body.youtube_channel ? (req.body.youtube_channel).trim() : ''
                update_array['feed_url'] = req.body.feed_url
                update_array['other_social_links'] = req.body.other_social_links

                await professionals_social_linksM.findOneAndUpdate(
                    { user_row_id: user_row_id },
                    { $set: update_array },
                    { upsert: true }
                )
                await deleteKeysByPattern('user_detail*')
                await deleteKeysByPattern('app_user_detail_*')
                await deleteKeysByPattern('app_user_other_details_*')
                await calculateUserProfileScore(user_row_id, ['social_media'])


                res.json({ status: true, message: { alert_message: 'Your social media details have been updated successfully. We appreciate your diligence in keeping your information current!', update_array: update_array } })
            }
        }
        else {
            res.json({ status: false, message: { alert_message: checkUserToken.message } })
        }
    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/users_professional_details', async (req, res) => {
    try {
        const result = await getUsersProfessionalDetails();

        if (result.status) {
            res.json({
                status: true,
                message: result.message,
                cache_response_status: result.cache_response_status,
            });
        } else {
            res.json({
                status: false,
                message: result.message,
            });
        }
    } catch (err) {
        logger.error(`Controller error in /users_professional_details: ${err instanceof Error ? err.message : String(err)}`);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
})

//without login token 

router.post('/update_user_social_media_details', checkApiKey, [
    check('user_row_id')
        .trim().not().isEmpty().withMessage('The user row id field is required.')
], async (req, res) => {
    try {

        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        let user_row_id = 0

        if (req.body.user_row_id) {
            if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                user_row_id = Number.parseInt(req.body.user_row_id)
            }
            else {
                const check_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                if (!check_user_query) {
                    errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
                }
            }
        }


        if (!(req.body.feed_url || req.body.facebook || req.body.twitter || req.body.linkedin || req.body.video_link || req.body.instagram || req.body.telegram || req.body.reddit || req.body.medium || req.body.youtube_channel)) {
            errObj['alert_message'] = 'Please submit atleast one social media details.'
        }

        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj })
        }
        else {
            const update_array = {}
            update_array['facebook'] = req.body.facebook ? (req.body.facebook).trim() : ''
            update_array['twitter'] = req.body.twitter ? (req.body.twitter).trim() : ''
            update_array['linkedin'] = req.body.linkedin ? (req.body.linkedin).trim() : ''
            update_array['video_link'] = req.body.video_link ? (req.body.video_link).trim() : ''
            update_array['instagram'] = req.body.instagram ? (req.body.instagram).trim() : ''
            update_array['telegram'] = req.body.telegram ? (req.body.telegram).trim() : ''
            update_array['medium'] = req.body.medium ? (req.body.medium).trim() : ''
            update_array['reddit'] = req.body.reddit ? (req.body.reddit).trim() : ''
            update_array['youtube_channel'] = req.body.youtube_channel ? (req.body.youtube_channel).trim() : ''
            update_array['feed_url'] = req.body.feed_url
            await professionals_social_linksM.findOneAndUpdate(
                { user_row_id: user_row_id },
                { $set: update_array },
                { upsert: true }
            )
            await deleteKeysByPattern('user_detail*')
            await deleteKeysByPattern('app_user_detail_*')

            res.json({ status: true, message: { alert_message: 'Your social media details have been updated successfully. We appreciate your diligence in keeping your information current!' } })
        }

    }
    catch (err) {
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/user_individual_details', async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }

            // Validate user_row_id before calling service
            if (!user_row_id || user_row_id <= 0) {
                return res.json({ status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' } });
            }

            const result = await getUserIndividualDetails(user_row_id)
            res.json(result)

        }
        else {
            res.json({ status: false, message: { alert_message: checkUserToken.message } })
        }

    }
    catch (err) {
        console.log('User personal details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err?.message })
    }
})

// without login token api for panel
router.get('/new_user_individual_details', checkApiKey, async (req, res) => {
    try {

        let user_row_id = 0

        if (req.query.user_row_id) {
            if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                user_row_id = Number.parseInt(req.query.user_row_id)
            }
        }


        if (user_row_id) {
            const get_query = await professionalsM.aggregate([
                {
                    $match: {
                        _id: user_row_id
                    }
                },
                {
                    $lookup:
                    {
                        from: "cln_static_countries",
                        localField: "country_id",
                        foreignField: "_id",
                        as: "info_country"
                    }
                },
                { $unwind: { path: "$info_country", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
                        from: "cln_professionals_profile_images",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "info_img"
                    }
                },
                { $unwind: { path: "$info_img", preserveNullAndEmptyArrays: true } },
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
                        from: "cln_static_user_designations",
                        localField: "designation_id",
                        foreignField: "_id",
                        as: "info_designations",
                        pipeline: [
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
                    $lookup:
                    {
                        from: "cln_push_notifications_details",
                        localField: "_id",
                        foreignField: "user_row_id",
                        as: "info_push_notification",
                        pipeline: [
                            {
                                $project: {
                                    push_notification_status: 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: { path: "$info_push_notification", preserveNullAndEmptyArrays: true } },
                {
                    $lookup:
                    {
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
                                    name: 1,
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
                        login_status: 1,
                        gender: 1,
                        created_date_n_time: 1,
                        referral_user_name: 1,
                        podcast_title: 1,
                        designation_id: 1,
                        pro_batch: 1,
                        approval_status: 1,
                        sub_admin_row_id: 1,
                        claim_status: 1,
                        email_verify_status: 1,
                        about_in_one_line: 1,
                        rejected_date_n_time: 1,
                        location: 1,
                        feed_url: "$social_info.feed_url",
                        website: "$social_info.website",
                        looking_for_id: "$looking_for_id",
                        user_bio: 1,
                        facebook: '$social_info.facebook',
                        twitter: '$social_info.twitter',
                        linkedin: '$social_info.linkedin',
                        instagram: '$social_info.instagram',
                        video_link: '$social_info.video_link',
                        telegram: '$social_info.telegram',
                        medium: '$social_info.medium',
                        reddit: '$social_info.reddit',
                        youtube_channel: '$social_info.youtube_channel',
                        meta_keywords: '$seo_info.meta_keywords',
                        meta_description: '$seo_info.meta_description',
                        email_status: '$seo_info.email_status',
                        vcf_status: 1,
                        area: 1,
                        city: 1,
                        // country_name : 1,
                        state: 1,
                        longitude: 1,
                        latitude: 1,
                        designation_list: "$info_designations",
                        looking_for_list: "$info_looking_for_list",
                        country_name: "$info_country.country_name",
                        country_flag: "$info_country.country_flag",
                        country_code: "$info_country.country_code",
                        profile_image: "$info_img.profile_image",
                        push_notification_status: "$info_push_notification.push_notification_status"
                    }
                }
            ])


            if (get_query[0]) {
                let result = {}
                result = get_query[0]
                result['total_followers'] = 0

                let api_for_type = 1
                if (req.query.api_for_type) {
                    if (Number.parseInt(req.query.api_for_type) === 2) {
                        api_for_type = 2
                    }
                }

                if (api_for_type === 2) {
                    const users_followers_query = await professionals_followersM.aggregate([
                        {
                            $match: {
                                following_user_row_id: user_row_id, confirm_request_status: 2
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
                    }
                }

                res.json({ status: true, message: result })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' } })
            }
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' } })
        }

    }



    catch (err) {
        console.log('User personal details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/update_push_notification', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            if (req.query.push_notification_status) {

                const push_notification_status = Number.parseInt(req.query.push_notification_status)
                const check_in_array = [1, 2]
                if (check_in_array.includes(push_notification_status)) {
                    const updated_on = getPresentDateTime()
                    const get_query = await push_notifications_detailsM.findOne({ user_row_id: user_row_id })
                    if (get_query) {
                        await push_notifications_detailsM.updateOne({ user_row_id: user_row_id }, { $set: { push_notification_status, updated_on } })

                        res.json({
                            status: true,
                            message: { alert_message: "Visited history details has been updated successfully." }
                        })
                    }
                    else {
                        await push_notifications_detailsM({
                            updated_on,
                            push_notification_status,
                            user_row_id
                        }).save()

                        res.json({
                            status: true,
                            message: { alert_message: "Visited history details has been updated successfully." }
                        })
                    }

                }
                else {
                    res.json({
                        status: false,
                        message: { push_notification_status: "Invalid notification status type." }
                    })
                }
            }
            else {
                res.json({
                    status: false,
                    message: { push_notification_status: "The notification status field is required." }
                })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        res.json({ status: false, message: err.message })
    }
})


const sub_admin_email = async (subadmin_data, email_data) => {
    for (const subadmin of subadmin_data) {
        let pass_subject = "Request for CoinPedia User Account Approval"
        let message_to_pass = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${subadmin.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">I've just created a user account on CoinPedia and request your review and approval of my account.Once approved, I can start creating exciting events, and my profile will be open for other users to follow and engage with my activities. Let's make CoinPedia a dynamic hub together!</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Full Name : </b><span style="text-transform: capitalize;">${email_data.full_name}</span> <br><b>Email :</b><span style="color:#0029ff;"> ${email_data.email_id}</span><br><b>Created On :</b> ${email_data.date_n_time} </p>
            `
        await sendEmail(subadmin.email_id, pass_subject, message_to_pass)
    }
}


router.post('/update_username', [
    check('user_name')
        .trim().not().isEmpty().withMessage('The username field is required.')
        .isLength({ min: 4 }).withMessage('The username field must be at least 4 characters.')
        .isLength({ max: 50 }).withMessage('The username field must be less than 255 characters.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            let user_name = ""
            if (req.body.user_name) {
                user_name = (sanitize(req.body.user_name)).toLowerCase()
                const check_query = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { user_name: user_name }] })
                if (check_query) {
                    errObj['user_name'] = 'This username is already in use.'
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const inner_check_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, user_name: 1 })
                if (!inner_check_query.user_name) {

                    const updateFields = getUpdateTrackerFields(checkToken)
                    await professionalsM.updateOne({ _id: user_row_id }, { $set: { user_name: user_name, updated_date_n_time: getPresentDateTime(), ...updateFields } })
                    await updateThreadNotification({
                        user_row_id: -1,
                        notify_type: 1,
                        notify_type_row_id: user_row_id,
                        message_row_id: 3,
                        action_row_id: user_row_id
                    })
                    await calculateUserProfileScore(user_row_id, ['professional_profile'])


                    res.json({ status: true, message: { alert_message: "Your profile username has been updated successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Your username is already updated." } })
                }
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Update Username.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/verify_email_account', [
    check('otp_number')
        .trim().not().isEmpty().withMessage('The otp number field is required.')
        .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = Number.parseInt(checkToken.message)
                const check_email_query = await verify_emailM.findOne({ user_row_id: user_row_id, email_verify_status: false })
                if (check_email_query) {
                    if (check_email_query.email_otp_number == req.body.otp_number) {
                        await verify_emailM.updateOne({ user_row_id: user_row_id }, {
                            $set:
                            {
                                email_otp_number: "",
                                email_verify_code: "",
                                email_verify_status: true
                            }
                        })
                        res.json({ status: true, message: { alert_message: "Your email account has been verified successfully." } })
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
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Verify email account.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/resend_otp', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = Number.parseInt(checkUserToken.message)
            const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
            const user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1 })
            const email_id = user_query.email_id
            const full_name = user_query.full_name

            const pass_subject = verify_otp + " is OTP to verify email of coinpedia account."
            const pass_message = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</h4>
                <div style="color:#000">
                    <p style="text-align:center;font-size: 17px;margin-top: 30px;font-weight: 500;"><b>WELCOME BACK TO COINPEDIA ACCOUNT</b></p>
                    <br>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b> is your OTP for email verification number to login your account.</p>
                </div>
            </div>`

            const check_email_query = await verify_emailM.findOne({ user_row_id: user_row_id })
            if (check_email_query) {
                if (!check_email_query.email_verify_status) {
                    await verify_emailM.updateOne({ user_row_id: user_row_id }, { $set: { email_otp_number: verify_otp } })
                    await sendEmail(email_id, pass_subject, pass_message)

                    res.json({ status: true, message: { alert_message: "Your account email has been verified successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Your account email is already in verified state." } })
                }

            }
            else {
                const insertArr = {}
                insertArr['email_otp_number'] = verify_otp
                insertArr['email_verify_status'] = false
                insertArr['user_row_id'] = user_row_id
                await verify_emailM(insertArr).save()

                await sendEmail(email_id, pass_subject, pass_message)

                res.json({ status: true, message: { alert_message: "Your new email id has been updated successfully. Please verify your email id." } })
            }
        }
        else {

            res.json({ status: false, message: { alert_message: checkUserToken.message } })
        }

    }
    catch (err) {
        console.log('Resend OTP.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/change_mobile_number', [
    check('mobile_number')
        .trim().not().isEmpty().withMessage('The Mobile Number field is required.')
        .isLength({ min: 5 }).withMessage('The Mobile Number field must be at least 5 characters in length.')
        .isLength({ max: 20 }).withMessage('The Mobile Number field must be less than or equal to 20 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = Number.parseInt(checkToken.message)
            if (req.body.mobile_number) {
                if (req.body.mobile_number.match(/[^0-9\-(\)\s]/)) {

                    errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.';
                }

                const check_mobile_num_query = await professionalsM.findOne({ $and: [{ _id: { $ne: sanitize(user_row_id) } }, { mobile_number: sanitize(req.body.mobile_number) }] })
                if (check_mobile_num_query) {
                    errObj['mobile_number'] = 'This Mobile number is already in use.'
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let update_array = {}
                update_array['mobile_number'] = req.body.mobile_number
                if (req.body.country_mobile_id) {
                    update_array['country_mobile_id'] = req.body.country_mobile_id
                }
                update_array['updated_date_n_time'] = getPresentDateTime()

                const updateFields = getUpdateTrackerFields(checkToken)
                Object.assign(update_array, updateFields)

                await professionalsM.updateOne({ _id: user_row_id }, { $set: update_array })

                let insertArr = {}
                insertArr['mobile_verify_status'] = false
                const verify_mobile_num_query = await verify_mobile_numberM.findOne({ user_row_id: user_row_id })
                if (verify_mobile_num_query) {
                    await verify_mobile_numberM.updateOne({ user_row_id: user_row_id }, { $set: insertArr })
                }
                else {
                    insertArr['user_row_id'] = user_row_id
                    await verify_mobile_numberM(insertArr).save()
                }
                await deleteKeysByPattern('app_user_detail_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await calculateUserProfileScore(user_row_id, ['professional_profile'])

                res.json({ status: true, message: { alert_message: "Your new mobile number has been updated successfully." } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Change mobile number.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})





router.get('/company_suggestion_list/:search_value', async (req, res) => {
    try {
        const search_value = req.params.search_value;

        const company_reg_query = await companyM.aggregate([
            {
                $match: {
                    $and: [
                        { active_status: 1 },
                        { approval_status: 1 },
                        {
                            $or: [
                                { company_id: { '$regex': search_value, $options: 'i' } },
                                { company_name: { '$regex': search_value, $options: 'i' } }
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
        ]).limit(15);

        if (company_reg_query.length > 0) {
            // If results are found in companyM, return them
            return res.json({ status: true, message: company_reg_query, company_type: 1 });
        } else {
            // If no results from companyM, then try company_manual_retrievalsM
            const company_manual_query = await company_manual_retrievalsM.aggregate([
                {
                    $match: {
                        $and: [
                            { approval_status: 0 },
                            {
                                $or: [
                                    { company_name: { $regex: search_value, $options: 'i' } },
                                    { company_email_id: { $regex: search_value, $options: 'i' } }
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
            ]).limit(15);

            // Return results from company_manual_retrievalsM (could be empty)
            return res.json({ status: true, message: company_manual_query, company_type: 2 });
        }
    } catch (err) {
        console.log('Company suggestions.', err.message);
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});


//Professional Details Starts Here
router.get('/company_suggestion/:search_value', async (req, res) => {
    try {
        const search_value = req.params.search_value;

        const result = await getCompanySuggestions(search_value);

        if (result.status) {
            res.json({
                status: true,
                message: result.message,
                company_type: result.company_type,
                cache_response_status: result.cache_response_status || false,
                response_time: result.response_time
            });
        } else {
            res.json({
                status: false,
                message: result.message,
                response_time: result.response_time
            });
        }

    } catch (err) {
        console.error('Error in /company_suggestion:', err);
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.'
        });
    }
});


router.get('/user_suggestion/:search_value', async (req, res) => {
    try {
        const search_value = req.params.search_value
        const result = await getUserSuggestionDetails(search_value);

        res.json({
            status: result.status,
            message: result.message,
            user_type: result.user_type,
        });
    } catch (error) {
        console.error("Error in /user_suggestion:", error.message);
        res.json({
            status: false,
            message: [],
            user_type: 0,
            err: error.message,
        });
    }
})



router.post('/update_wallet_address', [
    check('wallet_address')
        .trim().not().isEmpty().withMessage('The Wallet Address field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message

            const wallet_address = (sanitize(req.body.wallet_address)).toLowerCase()
            if (!errObj.wallet_address) {
                const checkWalletAddr = await professionalsM.findOne({ $and: [{ _id: { $ne: user_row_id } }, { wallet_address: wallet_address }] })
                if (checkWalletAddr) {
                    errObj['alert_message'] = 'Sorry, This wallet address is already in use.'
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                await professionalsM.updateOne({ _id: user_row_id }, { $set: { wallet_address: wallet_address } })

                res.json({ status: true, message: { alert_message: 'Your wallet address updated successfully.' } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update wallet address.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/update_profile_image', [
    check('profile_image_type')
        .isInt({ min: 0, max: 8 }).withMessage('Profile image type field must be at greater than or equal to 0 and less than equal to 8 number.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.body.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
                    user_row_id = Number.parseInt(req.body.user_row_id)
                }
                else {
                    const check_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                    if (!check_user_query) {
                        errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
                    }
                }
            }
            else {
                errObj['alert_message'] = 'The User Row ID field is required.'
            }

            let profile_image_type = req.body.profile_image_type
            let default_profile_image = ""
            if (Number.parseInt(req.body.profile_image_type) <= 0) {
                if (!req.body.profile_image) {
                    errObj['profile_image'] = 'The profile image field is required.'
                }
                else if (req.body.profile_image.length < 100) {
                    errObj['profile_image'] = 'The profile image field must be at least 100 characters in length.'
                }
            }
            else {
                const imageQuery = await default_profile_imgM.findOne({ _id: Number.parseInt(req.body.profile_image_type) }, { image_name: 1 })
                if (imageQuery) {
                    default_profile_image = imageQuery['image_name']
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let profile_image = default_profile_image
                if (!default_profile_image) {
                    if (req.body.profile_image) {
                        const validate_n_save_image = await validateAndSaveImage(req.body.profile_image, 1)
                        if (validate_n_save_image.status) {
                            profile_image = validate_n_save_image.webp_file_name
                        }
                    }
                }

                const queryRun = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id }, { profile_image: 1, profile_image_type: 1 })
                if (queryRun) {
                    if (queryRun.profile_image_type > 0) {
                        const imageQuery = await default_profile_imgM.findOne({ image_name: queryRun.profile_image }, { _id: 1 })
                        if (!imageQuery) {
                            await deleteImageDigitalOcean(queryRun.profile_image, 1)
                        }
                    }

                    await professionalsM.updateOne({ _id: user_row_id }, { $set: { updated_date_n_time: getPresentDateTime() } })


                    await professionals_profile_imagesM.updateOne({ user_row_id: user_row_id }, { $set: { profile_image_type: profile_image_type, profile_image: profile_image } })
                }
                else {
                    const insertArr = {}
                    insertArr['user_row_id'] = user_row_id
                    insertArr['profile_image'] = profile_image
                    insertArr['profile_image_type'] = profile_image_type

                    await professionals_profile_imagesM(insertArr).save()
                    await deleteKeysByPattern('speakers_list_*')
                    await deleteKeysByPattern('event_speakers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('user_detail*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('app_popular_professionals*')
                    await professionalsM.updateOne({ _id: user_row_id }, { $set: { updated_date_n_time: getPresentDateTime() } })
                    await deleteKeysByPattern('speakers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('user_detail*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('event_speakers_list_*')
                    await deleteKeysByPattern('app_popular_professionals*')
                }
                await calculateUserProfileScore(user_row_id, ['professional_profile'])

                res.json({ status: true, message: { alert_message: 'Profile image updated successfully..!' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Update profile image.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/remove_profile_image', async (req, res) => {
    try {
        let errObj = {}
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
                else {
                    const check_user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1 })
                    if (!check_user_query) {
                        errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
                    }
                }
            }
            else {
                errObj['alert_message'] = 'The User Row ID field is required.'
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const queryRun = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id }, { profile_image: 1, profile_image_type: 1 })

                if (queryRun) {
                    if (queryRun.profile_image_type > 0) {
                        const imageQuery = await default_profile_imgM.findOne({ image_name: queryRun.profile_image }, { _id: 1 })
                        if (!imageQuery) {
                            await deleteImageDigitalOcean(queryRun.profile_image, 1)
                        }
                    }
                    await professionals_profile_imagesM.deleteOne({ user_row_id: user_row_id })
                    await deleteKeysByPattern('speakers_list_*')
                    await deleteKeysByPattern('event_speakers_list_*')
                    await deleteKeysByPattern('individual_event_*')
                    await deleteKeysByPattern('app_company_individual_details_*')
                    await deleteKeysByPattern('user_detail*')
                    await deleteKeysByPattern('app_user_detail_*')
                    await deleteKeysByPattern('app_popular_professionals*')
                }

                await calculateUserProfileScore(user_row_id, ['professional_profile'])

                res.json({ status: true, message: { alert_message: 'Profile image removed successfully..!' } })
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Remove profile image.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/delete_user_account', async (req, res) => {
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
        try {
            const user_row_id = checkUserToken.message
            const check_user_query = await professionalsM.findOne({ _id: user_row_id, login_status: 1 })
            if (check_user_query) {
                let otp_number = randomstring.generate({ length: 6, charset: '0123456789' })

                let insertArray = {}
                insertArray['otp_number'] = otp_number
                insertArray['status'] = false
                insertArray['date_n_time'] = getPresentDateTime()


                const check_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                if (check_query) {
                    await professionals_delete_verificationsM.updateOne({ user_row_id: user_row_id }, { $set: insertArray })
                }
                else {
                    insertArray['user_row_id'] = user_row_id
                    await professionals_delete_verificationsM(insertArray).save()
                }

                const full_name = check_user_query.full_name
                const email_id = check_user_query.email_id
                const pass_subject = otp_number + " is OTP to delete coinpedia account."
                const pass_message = `
                <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                <p style="color:#000;font-weight: 500;font-size:17px;">CoinPedia Account Deletion Confirmation</p>
                <p style="color:#000;font-weight: 400;font-size:17px;">We received a request to permanently delete your coinpedia account.</p>
                <p style="color:#000;font-weight: 400;font-size:17px;"><b>${otp_number}</b> is your OTP for email verification number to delete your account. </p>
                `


                await sendEmail(email_id, pass_subject, pass_message)

                res.json({ status: true, message: { alert_message: "We have sent an OTP to registered Email ID, please verify to delete the account." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, your login token is expired." } })
            }
        }
        catch (err) {
            console.log('Delete user account.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkUserToken)
    }
})

router.post('/verify_email_n_delete_account', [
    check('otp_number')
        .trim().not().isEmpty().withMessage('The otp number field is required.')
        .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkToken.message
                const otp_number = req.body.otp_number
                const check_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id, status: false })
                if (check_query) {
                    if (check_query.otp_number == otp_number) {
                        await professionalsM.updateOne({ _id: user_row_id }, { $set: { login_status: 2, deleted_date_n_time: getPresentDateTime() } })
                        await professionals_delete_verificationsM.updateOne({ _id: check_query._id }, { $set: { status: true, otp_number: "" } })

                        const checkCompany = await companyM.findOne({ user_row_id: user_row_id })
                        if (checkCompany) {
                            await companyM.updateOne({ user_row_id: user_row_id }, { $set: { active_status: 0 } })
                        }

                        const checkEvents = await eventM.findOne({ user_row_id: user_row_id })
                        if (checkEvents) {
                            await eventM.updateMany({ user_row_id: user_row_id }, { $set: { active_status: 0 } })
                        }
                        res.json({ status: true, message: { alert_message: "Your user account has been deleted successfully." } })
                    }
                    else {
                        res.json({ status: false, message: { otp_number: "Your OTP is not matching" } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Something went wrong, please refersh your page or login once again." } })
                }
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Verify email and delete account.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', asd: err.message })
    }
})



router.get('/change_email_id', async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
        try {
            const user_row_id = checkToken.message
            const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
            const email_verify_code = (randomstring.generate(10)).toLowerCase()

            const insert_array = {}
            insert_array['otp_number'] = verify_otp
            insert_array['email_verify_type'] = 0
            insert_array['email_verify_code'] = email_verify_code
            insert_array['email_id'] = ""
            insert_array['date_n_time'] = getPresentDateTime()

            const check_email_query = await update_verify_emailsM.findOne({ user_row_id: user_row_id })
            if (!check_email_query) {
                insert_array['user_row_id'] = user_row_id
                await update_verify_emailsM(insert_array).save()
            }
            else {
                await update_verify_emailsM.updateOne({ user_row_id: user_row_id }, { $set: insert_array })
            }

            const user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1, email_id: 1 })

            const full_name = user_query.full_name
            const email_id = user_query.email_id

            const pass_subject = verify_otp + " is OTP to change email for coinpedia account."

            const pass_message = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">We have received a request to change your email of Coinpedia account . Please verify your old email address by entering the following OTP.</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b></p>
            <p style="color:#000;font-weight: 400;font-size:17px;">This OTP is valid for the next 15 minutes.</p>
            `

            await sendEmail(email_id, pass_subject, pass_message)

            let resArray = {}
            resArray['verify_token'] = generateEmailTempToken(user_row_id, email_verify_code)
            resArray['alert_message'] = "The OTP number has been sent to your email id."

            res.json({ status: true, message: resArray })
        }
        catch (err) {
            console.log('Change email id.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.post('/verify_current_email_id', [
    check('otp_number')
        .trim().not().isEmpty().withMessage('The otp number field is required.')
        .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.'),
    check('verify_token')
        .trim().not().isEmpty().withMessage('The verify token field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkToken.message
                const check_verify_token = profileVerifyEmailToken(req.body.verify_token)
                if (check_verify_token.status) {
                    const { account_row_id, email_verify_code } = check_verify_token.message
                    if (account_row_id == user_row_id) {
                        const check_email_query = await update_verify_emailsM.findOne({ user_row_id: user_row_id, email_verify_type: 0, email_verify_code: email_verify_code })
                        if (check_email_query) {
                            if (check_email_query.otp_number == req.body.otp_number) {
                                await update_verify_emailsM.updateOne({ user_row_id: user_row_id }, {
                                    $set:
                                        { otp_number: "", email_verify_type: 1, email_verify_code: "", date_n_time: getPresentDateTime() }
                                })

                                res.json({ status: true, message: { alert_message: "Your Email ID is old email id is verified, please update your new email id." } })
                            }
                            else {
                                res.json({ status: false, message: { otp_number: "Sorry, Your OTP is not matching" } })
                            }
                        }
                        else {
                            res.json({ status: false, message: { alert_message: "Sorry, This token field is expired." } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry, This token field is expired." } })
                    }
                }
                else {
                    res.json({ status: false, message: check_verify_token.message })
                }

            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Verify current email id.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/update_new_email_id', [
    check('email_id')
        .trim().not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
        .isLength({ min: 4 }).withMessage('The Email ID field must be at least 4 characters.')
        .isLength({ max: 255 }).withMessage('The Email ID field must be less than 255 characters.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let email_id = req.body.email_id ? (sanitize(req.body.email_id)).toLowerCase() : ""
        if (req.body.email_id) {
            const check_email_query = await professionalsM.findOne({ email_id: email_id })
            if (check_email_query) {
                errObj['email_id'] = 'Sorry, This Email ID already exists.'
            }

            const email_id_split = (email_id).split("@")
            const domain_name = email_id_split.slice(-1)
            const check_domain_query = await domains_blockedM.findOne({ domain_name: domain_name })
            if (check_domain_query) {
                errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
            }
        }

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkToken.message
                const check_email_query = await update_verify_emailsM.findOne({ user_row_id: user_row_id, email_verify_type: { $in: [1, 2] } })
                if (check_email_query) {

                    const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
                    const email_verify_code = (randomstring.generate(10)).toLowerCase()

                    await update_verify_emailsM.updateOne({ user_row_id: user_row_id }, {
                        $set:
                            { otp_number: verify_otp, email_verify_type: 2, email_verify_code: email_verify_code, email_id: email_id, date_n_time: getPresentDateTime() }
                    })

                    const user_query = await professionalsM.findOne({ _id: user_row_id }, { _id: 1, full_name: 1 })

                    const full_name = user_query.full_name
                    const pass_subject = verify_otp + " is OTP to confirm your new email for coinpedia account."

                    const pass_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">You recently selected <span style="color:#0029ff;">${email_id}</span> as your new Coinpedia Email ID. To verify this email address belongs to you, enter below OTP number</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b></p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">This OTP is valid for the next 15 minutes. If you did not make this change, please ignore this email.</p>
                    `

                    await sendEmail(email_id, pass_subject, pass_message)

                    let resArray = {}
                    resArray['verify_token'] = generateEmailTempToken(user_row_id, email_verify_code)
                    resArray['alert_message'] = "The OTP number has been sent to your email id."

                    res.json({ status: true, message: resArray })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, This token field is expired." } })
                }

            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Update new email id.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.post('/verify_new_email_id', [
    check('otp_number')
        .trim().not().isEmpty().withMessage('The otp number field is required.')
        .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.'),
    check('verify_token')
        .trim().not().isEmpty().withMessage('The verify token field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const user_row_id = checkToken.message
                const check_verify_token = profileVerifyEmailToken(req.body.verify_token)
                if (check_verify_token.status) {
                    const { account_row_id, email_verify_code } = check_verify_token.message
                    if (account_row_id == user_row_id) {
                        const check_email_query = await update_verify_emailsM.findOne({ user_row_id: user_row_id, email_verify_type: 2, email_verify_code: email_verify_code })
                        if (check_email_query) {
                            if (check_email_query.otp_number == req.body.otp_number) {

                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_id: check_email_query.email_id, updated_date_n_time: getPresentDateTime() } })
                                await update_verify_emailsM.deleteOne({ _id: check_email_query._id })

                                let resArray = {}
                                resArray['email_id'] = check_email_query.email_id
                                resArray['alert_message'] = "Your new Email ID has been updated successfully."

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
                    else {
                        res.json({ status: false, message: { alert_message: "Sorry, This token field is expired." } })
                    }
                }
                else {
                    res.json({ status: false, message: check_verify_token.message })
                }
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Verify new email id.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/delete_professional_details/:professional_details_id', async (req, res) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
        try {
            const user_row_id = checkToken.message
            const professional_details_id = Number.parseInt(req.params.professional_details_id)
            if (!Number.isNaN(professional_details_id)) {
                const query = await professionals_work_experienceM.findOne({ _id: professional_details_id, user_row_id: user_row_id }, { company_row_id: 1, till_date_status: 1, company_type: 1 })
                if (query) {

                    await deleteProfessionalDetails({ professional_details_id: professional_details_id, type: 1 })
                    await deleteKeysByPattern('app_user_other_details_*')

                    await deleteKeysByPattern('professional_detail_list_*')
                    if (query.company_type === 1 && query.company_row_id) {
                        await deleteKeysByPattern('employee_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                    }
                    await calculateUserProfileScore(user_row_id, ['professional_detail'])


                    res.json({ status: true, message: { alert_message: 'Your details have been deleted successfully. ' } })
                }
                else {
                    res.json({ status: false, message: 'Invalid Professional Row ID' })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } })
            }
        }
        catch (err) {
            console.log('Delete professional details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


router.get('/public_status_list', async (req, res) => {
    try {
        const checkToken = checkUserLoginToken(req.headers)
        let user_row_id = 0
        if (checkToken.status) {
            user_row_id = checkToken.message
        }
        else {
            user_row_id = Number.parseInt(req.query.user_row_id)
        }

        const query = await professionals_work_experienceM.find({ user_row_id: user_row_id, till_date_status: 2 }, { position: 1, company_name: 1, public_view: 1 })
        res.json({ status: true, message: query })

    }
    catch (err) {
        console.log('Public status list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


router.post('/update_user_seo', [
    check('module_id').not().isEmpty().withMessage('The User ID field is required.'),
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
        const checkUserToken = await checkAllLoginToken(req.headers, [1]);
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
            twitter_description
        } = req.body;

        // USER RESTRICTION - normal user can update only his profile
        let condition = { _id: Number(module_id) };
        if (checkUserToken.message.user_type == 1) {
            condition._id = checkUserToken.message.user_row_id;
        }

        const userData = await professionalsM.findOne(condition);
        if (!userData) {
            return res.json({ status: false, message: { alert_message: "Invalid User ID." } });
        }
        const checkQuery = await professionals_seo_detailsM.findOne({ user_row_id: condition._id });


        // CHANGE DETECTION
        const seoChanged =
            meta_title !== checkQuery.meta_title ||
            meta_description !== checkQuery.meta_description ||
            meta_keywords !== checkQuery.meta_keywords ||
            og_title !== checkQuery.og_title ||
            og_description !== checkQuery.og_description ||
            twitter_title !== checkQuery.twitter_title ||
            twitter_description !== checkQuery.twitter_description ||
            robots_index !== checkQuery.robots_index ||
            robots_follow !== checkQuery.robots_follow ||
            twitter_creator !== checkQuery.twitter_creator;

        // CREATE CHANGE LOG
        if (seoChanged) {
            await seo_change_logsM.create({
                module_key: "professional",
                module_id: module_id,

                old_meta_title: checkQuery.meta_title || "",
                new_meta_title: meta_title === checkQuery.meta_title ? "" : meta_title,

                old_meta_description: checkQuery.meta_description || "",
                new_meta_description: meta_description === checkQuery.meta_description ? "" : meta_description,

                old_meta_keywords: checkQuery.meta_keywords || "",
                new_meta_keywords: meta_keywords === checkQuery.meta_keywords ? "" : meta_keywords,

                old_og_title: checkQuery.og_title || "",
                new_og_title: og_title === checkQuery.og_title ? "" : og_title,

                old_og_description: checkQuery.og_description || "",
                new_og_description: og_description === checkQuery.og_description ? "" : og_description,

                old_twitter_title: checkQuery.twitter_title || "",
                new_twitter_title: twitter_title === checkQuery.twitter_title ? "" : twitter_title,

                old_twitter_description: checkQuery.twitter_description || "",
                new_twitter_description: twitter_description === checkQuery.twitter_description ? "" : twitter_description,

                old_robots_index: checkQuery.robots_index || "",
                new_robots_index: robots_index === checkQuery.robots_index ? "" : robots_index,

                old_robots_follow: checkQuery.robots_follow || "",
                new_robots_follow: robots_follow === checkQuery.robots_follow ? "" : robots_follow,

                old_twitter_creator: checkQuery.twitter_creator || "",
                new_twitter_creator: twitter_creator === checkQuery.twitter_creator ? "" : twitter_creator,

                user_type: checkUserToken.message.user_type == 1 ? "user" : "admin",
                updated_by:
                    checkUserToken.message.user_type == 1
                        ? checkUserToken.message.user_row_id
                        : checkUserToken.message.user_row_id ?? 0
            });
        }

        // UPDATE USER SEO DATA
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


        await professionals_seo_detailsM.updateOne({ user_row_id: Number(module_id) }, updateData);
        await calculateUserProfileScore(module_id, ['professional_profile'])
        await deleteKeysByPattern('user_detail*')
        await deleteKeysByPattern('app_user_detail_*')
        await deleteKeysByPattern('app_user_other_details_*')

        return res.json({
            status: true,
            message: { alert_message: "User SEO meta details updated successfully" }
        });

    } catch (err) {
        console.log("Update user SEO error:", err.message);
        return res.json({
            status: false,
            message: { alert_message: "An unexpected error occurred. Please try again later." }
        });
    }
});




router.get('/get_user_seo/:user_row_id', async (req, res) => {
    try {
        const user_row_id = req.params.user_row_id;
        if (!user_row_id) {
            return res.json({
                status: false,
                message: { alert_message: "The User Row ID field is required." }
            });
        }

        const checkUserToken = await checkAllLoginToken(req.headers, [1]);
        if (!checkUserToken.status) {
            return res.json(checkUserToken);
        }

        // ownership restriction for normal user
        let condition = { _id: Number(user_row_id) };

        const userData = await professionalsM.aggregate([
            { $match: condition },
            {
                $lookup: {
                    from: "cln_sub_admins",
                    localField: "sub_admin_row_id",
                    foreignField: "_id",
                    as: "sub_admin_info",
                    pipeline: [
                        { $project: { _id: 1, full_name: 1, email_id: 1 } }
                    ]
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
                $lookup: {
                    from: "cln_professionals_seo_details",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "seo_details"
                }
            },
            { $unwind: { path: "$seo_details", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_professionals_social_links",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "social_details"
                }
            },
            { $unwind: { path: "$social_details", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_professionals_profile_images",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "info_img"
                }
            },
            { $unwind: { path: "$info_img", preserveNullAndEmptyArrays: true } },

            {
                $lookup:
                {
                    from: "cln_professionals_work_experiences",
                    localField: "_id",
                    foreignField: "user_row_id",
                    pipeline: [
                        { $match: { public_view: true, user_account_type: 1 } },
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
                                position_name: '$info_position.position_name',
                                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
                            }
                        }
                    ],
                    as: "info_work",
                }
            },
            { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "cln_professionals_faq_lists",
                    localField: "_id",
                    foreignField: "user_row_id",
                    as: "faq",
                    pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }]
                }
            },
            {
                $addFields: {
                    created_by_status: {
                        $cond: [
                            { $gt: [{ $size: "$sub_admin_info" }, 0] },
                            2,
                            0
                        ]
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    url: "$user_name",
                    start_date: 1,
                    end_date: 1,
                    created_date_n_time: "$created_date_n_time",
                    updated_date_n_time: "$updated_date_n_time",
                    country_name: '$country_info.country_name',
                    location: 1,
                    work_position: "$info_work.position_name",
                    company_name: "$info_work.company_name",
                    mobile_number: 1,
                    country_id: 1,
                    country_mobile_id: 1,
                    facebook: '$social_details.facebook',
                    twitter: '$social_details.twitter',
                    linkedin: '$social_details.linkedin',
                    telegram: '$social_details.telegram',
                    instagram: '$social_details.instagram',
                    medium: '$social_details.medium',
                    reddit: '$social_details.reddit',
                    feed_url: '$social_details.feed_url',
                    youtube_channel: '$social_details.youtube_channel',
                    video_link: '$social_details.video_link',
                    title: "$full_name",
                    description: "$user_bio",
                    image: "$info_img.profile_image",
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
                    user_name: 1,
                    full_name: 1,
                    email_id: 1,
                    sub_admin_name: "$sub_admin_info.full_name",

                }
            }
        ]);

        if (!userData || userData.length == 0) {
            return res.json({
                status: false,
                message: { alert_message: "Invalid User Row ID." }
            });
        }

        const data = userData[0];

        return res.json({
            status: true,
            message: { alert_message: "User SEO fetched successfully" },
            data: data
        });

    } catch (err) {
        console.log('Get User seo error:', err.message);
        return res.json({
            status: false,
            message: { alert_message: 'An unexpected error occurred. Please try again later.' }
        });
    }
});
module.exports = router


