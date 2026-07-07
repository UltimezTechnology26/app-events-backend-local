require('dotenv').config()
const sanitize = require('mongo-sanitize')
const express = require('express')
const axios = require('axios')
const randomstring = require("randomstring")
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { addDaysToPresentDateNTime, getPresentDateTime, arrangeValidation, requestIPAddress } = require('../../../utils/helpers/helper')
const { trackUsers, calculateUserProfileScore, getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { decodeAppleToken, generateUserLoginToken, generateMobileAppUserLoginToken, generateEmailTempToken, verifyEmailTempToken } = require('../../../middleware/authorization')
const { sendEmail } = require('../../../config/email')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const MARKET_API_BASE_URL = process.env.MARKET_API_BASE_URL
const MARKET_API_KEY = process.env.MARKET_API_KEY


const professionalsM = require('../../../models/app/professionalsM')
const professionals_profile_imagesM = require('../../../models/app/professionals_profile_imagesM')
const companyM = require('../../../models/app/company/companyM')
const event_guestsM = require('../../../models/app/events/event_guestsM')
const event_guests_emailsM = require('../../../models/app/events/event_guests_emailsM')

const verify_mobile_numberM = require('../../../models/app/auth_account/verify_mobile_numberM')
const verify_emailM = require('../../../models/app/auth_account/verify_emailM')

const professionals_google_idsM = require('../../../models/app/auth_account/professionals_google_idsM')
const professional_facebookM = require('../../../models/app/auth_account/professional_facebookM')
const professional_telegramM = require('../../../models/app/auth_account/professional_telegramM')
const domains_blockedM = require('../../../models/system_settings/domains_blockedM')
const employees_requestsM = require('../../../models/app/company/employees_requestsM')
const professionals_delete_verificationsM = require('../../../models/app/professionals_delete_verificationsM')
const professional_appleM = require('../../../models/app/auth_account/professional_appleM')
const professionals_disabledM = require('../../../models/app/professionals_disabledM')
const added_to_partnersM = require('../../../models/app/company/added_to_partnersM')
const company_requests_to_partnersM = require('../../../models/app/company/company_requests_to_partnersM')
const professionals_seo_detailsM = require('../../../models/app/professionals_seo_detailsM')

router.post('/login_with_email', [
    check('email_id')
        .trim().not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        if (req.body.email_id) {
            const check_email_id = (sanitize(req.body.email_id)).toLowerCase()
            const email_id_split = (check_email_id).split("@")
            const domain_name = email_id_split.slice(-1)

            const check_domain_query = await domains_blockedM.findOne({ domain_name: domain_name })
            if (check_domain_query) {
                errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const email_id = (sanitize(req.body.email_id)).toLowerCase()

            const rowData = await professionalsM.findOne({ email_id: email_id })
            if (rowData) {
                let verify_otp = ""
                if ((rowData._id == 6009) || (rowData._id == 1062)) {
                    verify_otp = 488488
                }
                else if ((rowData._id == 18541)) {
                    verify_otp = 224466
                }
                else {
                    verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
                }
                let email_verify_code = (randomstring.generate(10)).toLowerCase()
                const user_row_id = rowData._id

                if (Number.parseInt(rowData.login_status) === 1) {

                    const check_email_query = await verify_emailM.findOne({ user_row_id: user_row_id })

                    let insertArr = {}
                    insertArr['email_otp_number'] = verify_otp
                    insertArr['email_verify_code'] = email_verify_code
                    insertArr['email_verify_status'] = false

                    if (check_email_query) {
                        await verify_emailM.updateOne({ user_row_id: user_row_id }, { $set: insertArr })
                    }
                    else {
                        insertArr['user_row_id'] = user_row_id
                        await verify_emailM(insertArr).save()
                    }

                    let resArray = {}
                    resArray['registered_status'] = true
                    const keepme_status = (req.body.keepme_status == 2) ? 2 : 1
                    resArray['token'] = generateEmailTempToken(user_row_id, email_verify_code, keepme_status)

                    const full_name = rowData.full_name
                    const header_section = 'Welcome Back to CoinPedia Account'

                    const pass_subject = verify_otp + " is OTP to login coinpedia account."
                    const pass_message = `
                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                    <p style="color:#000;font-weight: 500;font-size:17px;">${header_section}</p>  
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b> is your OTP for email verification number to login your account. </p>
                    `

                    const check_in_array = [6009, 1062, 18541]
                    if (!check_in_array.includes(rowData._id)) {
                        await sendEmail(email_id, pass_subject, pass_message)
                    }

                    res.json({ status: true, message: resArray })
                }
                else if (Number.parseInt(rowData.login_status) === 2) {
                    const check_delete_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                    const delete_date_n_time = check_delete_query ? addDaysToPresentDateNTime(check_delete_query.date_n_time) : ""

                    res.json({ status: false, message: { delete_date_n_time: delete_date_n_time, alert_message: 'Your account details will be hidden till ' + delete_date_n_time + ' and deleted on that date. If you want to recover your account, please contact administrator for further instructions.' } })
                }
                else {
                    let disabled_reason = ""
                    const check_disable_query = await professionals_disabledM.findOne({ user_row_id: user_row_id }).sort({ _id: -1 })
                    if (check_disable_query) {
                        disabled_reason = check_disable_query.disabled_reason
                    }

                    res.json({
                        status: false, message: {
                            disabled_reason: disabled_reason, alert_message:
                                // 'You do not have permission to login. please contact administrator for more details.'
                                'Your user profile is disabled due to ' + disabled_reason + ' Please contact administrator'
                        }
                    })
                }
            }
            else {
                res.json({ status: true, message: { registered_status: false } })
            }
        }
    }
    catch (err) {
        console.log('Login with email.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.post('/verify_otp_via_email', [
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
            let ip_address = requestIPAddress(req)

            //1:3.5 Hours login. 2:30 Days login
            const keepme_status = token_res.keepme_status == 2 ? 2 : 1
            const check_email_query = await verify_emailM.findOne({ user_row_id: user_row_id, email_verify_code: token_res.email_verify_code })
            if (check_email_query) {
                if (check_email_query.email_otp_number == req.body.otp_number) {
                    const rowData = await professionalsM.findOne({ _id: user_row_id })

                    let resArray = {}
                    const user_token = generateUserLoginToken(user_row_id, 1, keepme_status)
                    resArray['token'] = user_token
                    resArray['_id'] = user_row_id
                    resArray['referral_row_id'] = rowData.referral_row_id
                    resArray['referral_user_name'] = rowData.referral_user_name
                    resArray['user_name'] = rowData.user_name
                    resArray['full_name'] = rowData.full_name
                    resArray['pro_batch'] = rowData.pro_batch
                    resArray['email_id'] = rowData.email_id
                    resArray['mobile_number'] = rowData.mobile_number

                    const get_wallet_address = await getWalletAddress({ user_token })
                    resArray['get_wallet_address'] = get_wallet_address
                    if (get_wallet_address.status) {
                        if (get_wallet_address.message) {
                            resArray['wallet_address'] = get_wallet_address.message.wallet_address
                        }
                    }

                    resArray['company_name'] = rowData.company_name
                    resArray['work_position'] = rowData.work_position
                    resArray['login_status'] = 1
                    resArray['approval_status'] = rowData.approval_status
                    resArray['created_date_n_time'] = rowData.created_date_n_time
                    resArray['company_listed_status'] = 0
                    resArray['email_verify_status'] = true
                    resArray['keepme_status'] = keepme_status

                    const company_status_details = await companyListedStatus(user_row_id)
                    resArray['company_listed_status'] = company_status_details.company_listed_status
                    resArray['company_partner_status'] = company_status_details.company_partner_status

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

                    if (!rowData.email_verify_status) {
                        await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                    }

                    if (rowData.claim_status == 1) {
                        await professionalsM.updateOne({ _id: user_row_id }, { $set: { claim_status: 2 } })
                    }

                    resArray['users_ip_data'] = await trackUsers(ip_address, user_row_id, req.body.domain_row_id, req.body.page)

                    res.json({ status: true, message: resArray })
                }
                else {
                    res.json({ status: false, message: { otp_number: "Sorry, Your OTP is not matching" } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, This token field is expired.", token_res } })
            }
        }
    }
    catch (err) {
        console.log('Verify OTP via email.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

// 1:email, 2:telegram, 3:gmail, 4:facebook, 5:linkedin, 6:wallet address, 7:apple
router.post('/create_account', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The full name field is required')
        .isLength({ min: 4 }).withMessage('The full name field must be at least 4 characters in length.'),
    check('email_id')
        .trim().not().isEmpty().withMessage('The email id field is required')
        .isEmail().withMessage('The email id field must be contain valid email.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let user_name = ""
        if (req.body.user_name) {
            user_name = (sanitize(req.body.user_name)).toLowerCase()
            // const check_valid_username = /^[a-zA-Z]+$/.test(user_name)

            const checkUsername = await professionalsM.findOne({ user_name: user_name })
            if (checkUsername) {
                errObj['user_name'] = 'Sorry, this username already exists.'
            }
        }

        let email_id = req.body.email_id ? (sanitize(req.body.email_id)).toLowerCase() : ""
        if (req.body.email_id) {
            const checkEmailId = await professionalsM.findOne({ email_id: email_id })
            if (checkEmailId) {
                errObj['email_id'] = 'Sorry, This Email ID already exists.'
            }

            const email_id_split = (email_id).split("@")
            const domain_name = email_id_split.slice(-1)
            const checkDomainName = await domains_blockedM.findOne({ domain_name: domain_name })
            if (checkDomainName) {
                errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
            }
        }

        let mobile_number = ""
        if (req.body.mobile_number) {
            if (req.body.mobile_number.match(/[^0-9\-(\)\s]/)) {

                errObj['mobile_number'] = 'The Contact Number field cannot have speacial charaters.';
            }

            mobile_number = sanitize(req.body.mobile_number)
            const checkMobileNumber = await professionalsM.findOne({ mobile_number: mobile_number })
            if (checkMobileNumber) {
                errObj['mobile_number'] = 'Sorry, This mobile number already exists.'
            }
        }

        let wallet_address = ""
        if (req.body.wallet_address) {
            wallet_address = sanitize(req.body.wallet_address).toLowerCase();
            const check_wallet_response = await axios.get(
                `${MARKET_API_BASE_URL}markets/portfolio/check_default_address/${wallet_address}`,
                {
                    headers: {
                        api_key: MARKET_API_KEY,
                        "Content-Type": "application/json",
                    },
                }
            );
            if (check_wallet_response) {
                const check_wallet_response_data = {
                    statusCode: check_wallet_response.status,
                    body: check_wallet_response.data,
                };
                if (Number.parseInt(check_wallet_response_data.statusCode) == 200) {
                    if (check_wallet_response_data.body.status) {
                        errObj["wallet_address"] = "Sorry, This Wallet Address already exists.";
                    }
                }
            }
        }

        let referral_row_id = ""
        let referral_user_name = ""
        if (req.body.referral_id) {
            const referral_id = (sanitize(req.body.referral_id)).toLowerCase()
            const checkReferralID = await professionalsM.findOne({ user_name: referral_id, login_status: 1 })
            if (!checkReferralID) {
                errObj['referral_id'] = 'This referral ID is invalid. You can leave it blank.'
            }
            else {
                referral_row_id = checkReferralID._id
                referral_user_name = referral_id
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let user_array = {}
            let date_n_time = getPresentDateTime()
            let full_name = req.body.full_name
            user_array['full_name'] = full_name
            user_array['email_id'] = email_id
            user_array['created_date_n_time'] = date_n_time
            user_array['email_verify_status'] = false


            if (req.body.gender) {
                user_array['gender'] = req.body.gender
            }

            if (req.body.country_row_id) {
                user_array['country_mobile_id'] = req.body.country_row_id
            }

            if (mobile_number) {
                user_array['mobile_number'] = mobile_number
            }

            if (user_name) {
                user_array['user_name'] = user_name
            }

            if (req.body.company_name) {
                user_array['company_name'] = req.body.company_name
            }

            if (req.body.work_position) {
                user_array['work_position'] = req.body.work_position
            }

            if (referral_user_name) {
                user_array['referral_row_id'] = referral_row_id
                user_array['referral_user_name'] = referral_user_name
            }
            const seo_details_data = {}

            // Auto-fill title and keywords from full_name
            if (full_name) {
                const title = full_name + " | Coinpedia User Profile";
                seo_details_data.meta_title = title;
                seo_details_data.og_title = title;
                seo_details_data.twitter_title = title;
                seo_details_data.meta_keywords = full_name;
            }


            const userDetails = await professionalsM(user_array).save()
            const user_row_id = Number.parseInt(userDetails._id)
            await professionals_seo_detailsM.updateOne(
                { user_row_id },
                { $set: seo_details_data },
                { upsert: true }
            );



            await updateNotification({
                user_row_id: user_row_id,
                notify_type: 1,
                notify_type_row_id: 0,
                message_row_id: 1,
                action_row_id: user_row_id
            })

            if (user_name) {
                await updateThreadNotification({
                    user_row_id: -1,
                    notify_type: 1,
                    notify_type_row_id: user_row_id,
                    message_row_id: 3,
                    action_row_id: user_row_id
                })
            }


            if (referral_row_id) {
                await updateThreadNotification({
                    user_row_id: referral_row_id,
                    notify_type: 1,
                    notify_type_row_id: user_row_id,
                    message_row_id: 2,
                    action_row_id: user_row_id
                })
            }


            await updateGuestSpeakerDetails(email_id, user_row_id)
            if (req.body.company_name) {
                await updateInCompanyEmployeesList(req.body.company_name, user_row_id)
            }

            if (wallet_address) {
                await updateUserWalletAddress({ wallet_address, user_row_id })
                // await saveSingleUserNFTDetails(user_row_id, wallet_address)
            }

            const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
            let email_verify_code = (randomstring.generate(10)).toLowerCase()

            let insert_array = {
                user_row_id: user_row_id,
                email_otp_number: verify_otp,
                email_verify_code: email_verify_code,
                email_verify_status: false
            }

            await verify_emailM(insert_array).save()
            const resArray = {
                email_verify_status: false,
                token: generateEmailTempToken(user_row_id, email_verify_code)
            }


            const pass_subject = 'Welcome To Coinpedia Account'
            const pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
            <p style="font-size: 17px;margin-top: 20px;color:#000;"><b>WELCOME TO COINPEDIA ACCOUNT. </b></p>
            <p style="color:#000;font-weight: 400;font-size:17px;">Having a Coinpedia account makes you a complete Fintech and Blockchain Professional.</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b> is your OTP for the email verification code to log in to your account.</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
            <ul>
              <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
              <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
              <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
              <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
              <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
              <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
            </ul>
            <p style="color:#000;font-weight: 400;font-size:17px;">The Coinpedia team is excited to have you on board and we can’t wait for you to explore our features. </p>
            <p style="color:#000;font-weight: 400;font-size:17px;">We're counting on you for our mission of uniting Blockchain professionals worldwide!</p>`


            await sendEmail(email_id, pass_subject, pass_message)
            await calculateUserProfileScore(user_row_id, ['professional_profile'])


            res.json({ status: true, message: resArray })
        }

    }
    catch (err) {
        console.log('Create account.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/user_login_with_gmail', [
    check('email_id')
        .not().isEmpty().withMessage('The Email ID field is required.'),
    check('google_id')
        .not().isEmpty().withMessage('The Google Id field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let ip_address = requestIPAddress(req)
            const email_id = (sanitize(req.body.email_id)).toLowerCase()
            const rowData = await professionalsM.findOne({ email_id: email_id })
            if (rowData) {
                const user_row_id = rowData._id


                if (Number.parseInt(rowData.login_status) === 1) {
                    if (rowData.claim_status == 1) {
                        await professionalsM.updateOne({ _id: user_row_id }, { $set: { claim_status: 2 } })
                    }

                    const googleIdCheck = await professionals_google_idsM.findOne({ user_row_id: user_row_id })
                    if (googleIdCheck) {
                        if ((googleIdCheck.google_id) != (req.body.google_id)) {
                            res.json({ status: false, message: { alert_message: 'Login with gmail for this account is disabled. please contact administator for more details' } })
                        }
                        else {
                            if (!rowData.email_verify_status) {
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                            }
                            const userData = await get_user_data(rowData, user_row_id)
                            await trackUsers(ip_address, user_row_id, req.body.domain_row_id, req.body.page)

                            res.json({ status: true, message: userData, registered_status: true })
                        }
                    }
                    else {
                        await professionals_google_idsM({
                            google_id: req.body.google_id,
                            user_row_id: user_row_id
                        }).save()

                        if (!rowData.email_verify_status) {
                            await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                        }
                        const userData = await get_user_data(rowData, user_row_id)
                        await trackUsers(ip_address, user_row_id, req.body.domain_row_id, req.body.page)

                        res.json({ status: true, message: userData })
                    }
                }
                else if (Number.parseInt(rowData.login_status) === 2) {
                    const check_delete_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                    const delete_date_n_time = check_delete_query ? addDaysToPresentDateNTime(check_delete_query.date_n_time) : ""

                    res.json({ status: false, message: { delete_date_n_time: delete_date_n_time, alert_message: 'Your account details will be hidden till ' + delete_date_n_time + ' and deleted on that date. If you want to recover your account, please contact administrator for further instructions.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'You do not have permission to login. please contact administrator for more details.' } })
                }
            }
            else {
                const google_id = sanitize(req.body.google_id)
                const check_google_query = await professionals_google_idsM.findOne({ google_id: google_id })
                if (!check_google_query) {
                    let user_array = {}
                    let full_name = req.body.full_name

                    user_array['full_name'] = full_name
                    user_array['email_id'] = email_id
                    user_array['created_date_n_time'] = getPresentDateTime()
                    user_array['email_verify_status'] = true


                    const userDetails = await professionalsM(user_array).save()
                    const user_row_id = Number.parseInt(userDetails._id)

                    await professionals_google_idsM({
                        user_row_id: user_row_id,
                        google_id: google_id
                    }).save()

                    await updateGuestSpeakerDetails(email_id, user_row_id)

                    const userData = await get_user_data(userDetails, user_row_id)
                    await trackUsers(ip_address, user_row_id, req.body.domain_row_id, req.body.page)

                    await calculateUserProfileScore(user_row_id, ['professional_profile'])


                    res.json({ status: true, message: userData, registered_status: false })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Login with gmail is not allowed for this account. please login using other ways.' } })
                }
            }
        }
    }
    catch (err) {
        console.log('User Login with gmail.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/user_login_with_apple', [
    // check('id_token')
    // .not().isEmpty().withMessage('The Token ID field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            // console.log("test",req.headers)
            const checkAppleToken = await decodeAppleToken(req.headers)
            if (checkAppleToken.status) {
                const appleData = checkAppleToken.message
                const apple_sub = appleData.sub
                // const apple_c_hash = appleData.c_hash
                const check_apple_query = await professional_appleM.findOne({ apple_sub: apple_sub })
                if (check_apple_query) {
                    const user_row_id = check_apple_query.user_row_id
                    let ip_address = requestIPAddress(req)
                    const check_user_query = await professionalsM.findOne({ _id: user_row_id })
                    if (check_user_query) {
                        if (Number.parseInt(check_user_query.login_status) === 1) {
                            if (!check_user_query.email_verify_status) {
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                            }
                            const userData = await get_user_data(check_user_query, user_row_id)
                            await trackUsers(ip_address, user_row_id, req.body.domain_row_id, req.body.page)

                            if (userData.full_name === "" || !userData.full_name) {
                                const full_name = (userData.email_id.split('@')[0]).toLowerCase()
                                userData.full_name = full_name
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { full_name: full_name } })
                            }


                            if (check_user_query.claim_status == 1) {
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { claim_status: 2 } })
                            }

                            res.json({ status: true, message: userData, registered_status: true })
                        }
                        else if (Number.parseInt(check_user_query.login_status) === 2) {
                            const check_delete_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                            const delete_date_n_time = check_delete_query ? addDaysToPresentDateNTime(check_delete_query.date_n_time) : ""

                            res.json({ status: false, message: { delete_date_n_time: delete_date_n_time, alert_message: 'Your account details will be hidden till ' + delete_date_n_time + ' and deleted on that date. If you want to recover your account, please contact administrator for further instructions.' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'You do not have permission to login. please contact administrator for more details.' } })
                        }
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Please register manually, then try to login with apple.' } })
                    }
                }
                else if (appleData.is_private_email) {
                    res.json({ status: false, message: { alert_message: "Please visit https://appleid.apple.com/account/manage, go to account management, click 'Sign in with Apple,' and select 'Stop Using' to remove access and allow us to use your email ID." } })
                }
                else if (appleData.email) {
                    const apple_email = appleData.email

                    const check_user_query = await professionalsM.findOne({ email_id: apple_email })
                    if (check_user_query) {
                        const user_row_id = check_user_query._id
                        if (Number.parseInt(check_user_query.login_status) === 1) {
                            const insert_array = {
                                user_row_id: user_row_id,
                                apple_sub: apple_sub
                            }
                            await professional_appleM(insert_array).save()

                            if (!check_user_query.email_verify_status) {
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                            }
                            const userData = await get_user_data(check_user_query, user_row_id)
                            if (userData.full_name === "" || !userData.full_name) {
                                const full_name = (userData.email_id.split('@')[0]).toLowerCase()
                                userData.full_name = full_name
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { full_name: full_name } })
                            }

                            res.json({ status: true, message: userData, registered_status: true })
                        }
                        else if (Number.parseInt(check_user_query.login_status) === 2) {
                            const check_delete_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                            const delete_date_n_time = check_delete_query ? addDaysToPresentDateNTime(check_delete_query.date_n_time) : ""

                            res.json({ status: false, message: { delete_date_n_time: delete_date_n_time, alert_message: 'Your account details will be hidden till ' + delete_date_n_time + ' and deleted on that date. If you want to recover your account, please contact administrator for further instructions.' } })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'You do not have permission to login. please contact administrator for more details.' } })
                        }
                    }
                    else {

                        let user_array = {}
                        const apple_email = appleData.email
                        if (apple_email.endsWith('@privaterelay.appleid.com')) {
                            res.json({ status: false, message: { alert_message: "Please visit https://appleid.apple.com/account/manage, go to account management, click 'Sign in with Apple,' and select 'Stop Using' to remove access and allow us to use your email ID." } })
                        }
                        else {
                            let full_name = req.body.full_name ? req.body.full_name : (apple_email.split('@')[0]).toLowerCase()

                            user_array['full_name'] = full_name
                            user_array['email_id'] = apple_email
                            user_array['created_date_n_time'] = getPresentDateTime()
                            user_array['email_verify_status'] = true

                            const userDetails = await professionalsM(user_array).save()
                            const user_row_id = Number.parseInt(userDetails._id)

                            const insert_array = {
                                user_row_id: user_row_id,
                                apple_sub: apple_sub
                            }
                            await professional_appleM(insert_array).save()

                            await updateGuestSpeakerDetails(apple_email, user_row_id)

                            const userData = await get_user_data(userDetails, user_row_id)
                            if (userData.full_name === "" || !userData.full_name) {
                                const full_name = (userData.email_id.split('@')[0]).toLowerCase()
                                userData.full_name = full_name
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { full_name: full_name } })
                            }
                            await calculateUserProfileScore(user_row_id, ['professional_profile'])



                            res.json({ status: true, message: userData, registered_status: false })

                        }
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Please visit https://appleid.apple.com/account/manage, go to account management, click 'Sign in with Apple,' and select 'Stop Using' to remove access and allow us to use your email ID." } })
                }
            }
            else {
                res.json({ status: false, message: checkAppleToken.message })
            }
        }
    }
    catch (err) {
        console.log('User Login with apple.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


const updateGuestSpeakerDetails = async (email_id, user_row_id) => {
    const check_guest_email_query = await event_guests_emailsM.findOne({ email_id: email_id })
    if (check_guest_email_query) {
        const guest_email_row_id = check_guest_email_query._id
        const updateArr = {
            guest_email_row_id: 0,
            guest_user_type: 2,
            guest_user_row_id: user_row_id,
            invitation_request_status: 0,
            created_date_n_time: getPresentDateTime()
        }
        await event_guestsM.updateMany({ guest_email_row_id: guest_email_row_id }, { $set: updateArr })
        await event_guests_emailsM.deleteOne({ _id: guest_email_row_id })
    }
    return true
}

const updateInCompanyEmployeesList = async (company_name, user_row_id) => {
    const getQuery = await companyM.findOne({ approval_status: 1, active_status: 1, company_name: company_name }, { _id: 1 })
    if (getQuery) {
        const checkQuery = await employees_requestsM.findOne({ company_row_id: getQuery._id, user_row_id: user_row_id })
        if (!checkQuery) {
            const insertObj = {
                company_row_id: getQuery._id,
                user_row_id: user_row_id,
                approval_status: 1,
                date_n_time: getPresentDateTime()
            }
            await employees_requestsM(insertObj).save()
        }
    }
    return true
}



router.post('/mobile_app_verify_otp_via_email', [
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
                    const company_status_details = await companyListedStatus(user_row_id)
                    resArray['token'] = generateMobileAppUserLoginToken(user_row_id, 1)
                    resArray['company_partner_status'] = company_status_details.company_partner_status
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
                    resArray['company_listed_status'] = company_status_details.company_listed_status
                    resArray['email_verify_status'] = true

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
        console.log('Mobile app verify otp via email.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/login_with_telegram', [
    check('mobile_number')
        .not().isEmpty().withMessage('The mobile number field is required.')
        .isMobilePhone().withMessage('The mobile number field must be contain valid number.')
        .isLength({ min: 4 }).withMessage('The mobile number field must be at least 4 characters in length.')
        .isLength({ max: 20 }).withMessage('The mobile number field must be less than 20 characters in length.'),
    check('telegram_id')
        .not().isEmpty().withMessage('The Telegram ID field is required.'),
    check('country_row_id')
        .not().isEmpty().withMessage('The Country ID field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const rowData = await professionalsM.findOne({ mobile_number: sanitize(req.body.mobile_number), country_row_id: sanitize(req.body.country_row_id) })
            if (rowData) {
                const user_row_id = rowData._id
                if (Number.parseInt(rowData.login_status) === 1) {
                    const socialCheckQuery = await professional_telegramM.findOne({ user_row_id: user_row_id })
                    if (socialCheckQuery) {
                        if ((socialCheckQuery.telegram_id) != (req.body.telegram_id)) {
                            res.json({ status: false, message: { alert_message: 'Login with telegram is failed. please check your telegram account linked with our website.' } })
                        }
                        else {
                            const userData = await get_user_data(rowData, user_row_id)
                            res.json({ status: true, message: userData })
                        }
                    }
                    else {
                        await professional_telegramM({
                            user_row_id: user_row_id,
                            telegram_id: req.body.telegram_id
                        }).save()

                        const userData = await get_user_data(rowData, user_row_id)
                        res.json({ status: true, message: userData })
                    }
                }
                else if (Number.parseInt(rowData.login_status) === 2) {
                    const check_delete_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                    const delete_date_n_time = check_delete_query ? addDaysToPresentDateNTime(check_delete_query.date_n_time) : ""

                    res.json({ status: false, message: { delete_date_n_time: delete_date_n_time, alert_message: 'Your account details will be hidden till ' + delete_date_n_time + ' and deleted on that date. If you want to recover your account, please contact administrator for further instructions.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'You do not have permission to login. please contact administrator for more details.' } })
                }
            }
            else {
                res.json({ status: true, message: { registered_status: false } })
            }
        }
    }
    catch (err) {
        console.log('Login with telegram.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.post('/login_with_facebook', [
    check('email_id')
        .not().isEmpty().withMessage('The Email Id field is required.'),
    check('full_name')
        .not().isEmpty().withMessage('The Full Name field is required.'),
    check('facebook_id')
        .not().isEmpty().withMessage('The Facebook ID field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const rowData = await professionalsM.findOne({ email_id: sanitize(req.body.email_id) })
            if (rowData) {
                const user_row_id = rowData._id
                if (Number.parseInt(rowData.login_status) === 1) {
                    const socialCheckQuery = await professional_facebookM.findOne({ user_row_id: user_row_id })
                    if (socialCheckQuery) {
                        if ((socialCheckQuery.facebook_id) != (req.body.facebook_id)) {
                            res.json({ status: false, message: { alert_message: 'Login with facebook is failed. please check your facebook account linked with our website.' } })
                        }
                        else {
                            if (!rowData.email_verify_status) {
                                await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                            }
                            const userData = await get_user_data(rowData, user_row_id)
                            res.json({ status: true, message: userData })
                        }
                    }
                    else {
                        await professional_facebookM({
                            user_row_id: user_row_id,
                            facebook_id: req.body.facebook_id
                        }).save()

                        if (!rowData.email_verify_status) {
                            await professionalsM.updateOne({ _id: user_row_id }, { $set: { email_verify_status: true } })
                        }

                        const userData = await get_user_data(rowData, user_row_id)
                        res.json({ status: true, message: userData })
                    }
                }
                else if (Number.parseInt(rowData.login_status) === 2) {
                    const check_delete_query = await professionals_delete_verificationsM.findOne({ user_row_id: user_row_id })
                    const delete_date_n_time = check_delete_query ? addDaysToPresentDateNTime(check_delete_query.date_n_time) : ""

                    res.json({ status: false, message: { delete_date_n_time: delete_date_n_time, alert_message: 'Your account details will be hidden till ' + delete_date_n_time + ' and deleted on that date. If you want to recover your account, please contact administrator for further instructions.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'You do not have permission to login. please contact administrator for more details.' } })
                }
            }
            else {
                res.json({ status: true, message: { registered_status: false } })
            }
        }
    }
    catch (err) {
        console.log('Login with facebook.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


const updateUserWalletAddress = async ({ wallet_address, user_row_id }) => {
    try {
        const get_wallet_response = await axios.post(
            `${MARKET_API_BASE_URL}markets/portfolio/update_wallet_address_via_user_row_id`,
            { wallet_address, user_row_id },
            {
                headers: {
                    api_key: MARKET_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        );
        if (get_wallet_response) {
            const get_wallet_response_data = {
                statusCode: get_wallet_response.status,
                body: get_wallet_response.data,
            };
            if (Number.parseInt(get_wallet_response_data.statusCode) == 200) {
                if (get_wallet_response_data.body.status) {
                    if (get_wallet_response_data.body.message) {
                        return get_wallet_response_data.body.message;
                    }
                }
            }
        }
        return { status: false, message: "" };
    }
    catch (err) {
        return { status: false, message: "" }
    }
}


const getWalletAddress = async ({ user_token }) => {
    try {
        const get_wallet_response = await axios.get(
            `${MARKET_API_BASE_URL}markets/portfolio/default_address_details`,
            {
                headers: {
                    api_key: MARKET_API_KEY,
                    token: user_token,
                    "Content-Type": "application/json",
                },
            }
        );
        if (get_wallet_response) {
            const get_wallet_response_data = {
                statusCode: get_wallet_response.status,
                body: get_wallet_response.data,
            };
            if (Number.parseInt(get_wallet_response_data.statusCode) == 200) {
                if (get_wallet_response_data.body.status) {
                    if (get_wallet_response_data.body.message) {
                        return get_wallet_response_data.body;
                    }
                }
            }
        }
        return { status: false, message: "" };
    }
    catch (err) {
        return { status: false, message: "" }
    }

}

const get_user_data = async function (rowData, user_row_id) {
    try {
        let finalData = {}
        const user_token = generateUserLoginToken(user_row_id, 1)
        finalData['token'] = user_token
        finalData['_id'] = user_row_id
        finalData['referral_row_id'] = rowData.referral_row_id
        finalData['referral_user_name'] = rowData.referral_user_name
        finalData['user_name'] = rowData.user_name
        finalData['full_name'] = rowData.full_name
        finalData['email_id'] = rowData.email_id

        const get_wallet_address = await getWalletAddress({ user_token })
        finalData['get_wallet_address'] = get_wallet_address
        if (get_wallet_address.status) {
            if (get_wallet_address.message) {
                finalData['wallet_address'] = get_wallet_address.message.wallet_address
            }
        }
        finalData['company_name'] = rowData.company_name
        finalData['approval_status'] = rowData.approval_status
        finalData['work_position'] = rowData.work_position
        finalData['created_date_n_time'] = rowData.created_date_n_time
        finalData['email_verify_status'] = rowData.email_verify_status ? rowData.email_verify_status : false
        finalData['registered_status'] = true

        const company_status_details = await companyListedStatus(user_row_id)
        finalData['company_listed_status'] = company_status_details.company_listed_status
        finalData['company_partner_status'] = company_status_details.company_partner_status


        const users_profile_query = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id }, { _id: 1, profile_image: 1 })
        if (users_profile_query) {
            finalData['profile_image'] = users_profile_query.profile_image
        }
        else {
            finalData['profile_image'] = ""
        }


        return finalData
    }
    catch (err) {
        console.log('Login with email.', err.message)
        return {}
    }
}


const send_email_via_wallet = async function (user_row_id, full_name, email_id) {
    const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
    const email_verify_code = (randomstring.generate(10)).toLowerCase()

    let insertArr = {}
    insertArr["email_otp_number"] = verify_otp
    insertArr["email_verify_code"] = email_verify_code
    insertArr["email_verify_status"] = false

    const check_email_query = await verify_emailM.findOne({ user_row_id: user_row_id })
    if (check_email_query) {
        await verify_emailM.updateOne({ user_row_id: user_row_id }, { $set: insertArr })
    }
    else {
        insertArr['user_row_id'] = user_row_id
        await verify_emailM(insertArr).save()
    }

    let resArray = {}
    resArray['registered_status'] = true
    resArray['verify_status'] = false
    resArray['full_name'] = full_name
    resArray['email_id'] = email_id
    resArray['token'] = generateEmailTempToken(user_row_id, email_verify_code)

    const pass_subject = verify_otp + " is OTP to login coinpedia account."
    const pass_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Welcome back to CoinPedia Account</h1> 
    <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b> is your OTP for email verification number to login your account. </p>
    `

    await sendEmail(email_id, pass_subject, pass_message)
    return resArray
}


router.get('/ref_user_details/:user_name', async (req, res) => {
    try {
        let user_name = req.params.user_name
        const queryRun = await professionalsM.findOne({ login_status: 1, user_name: user_name }, { id: 1, user_name: 1, full_name: 1 })
        if (queryRun) {
            res.json({ status: true, message: queryRun })
        }
        else {
            res.json({ status: false, message: { alert_message: 'Sorry, invalid referral details' } })
        }
    }
    catch (err) {
        console.log('Refer user details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.post('/check_email_id', [
    check('email_id')
        .trim()
        .not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
        .normalizeEmail(),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        if (req.body.email_id) {
            const email_id = (sanitize(req.body.email_id)).toLowerCase()
            const check_query = await professionalsM.findOne({ email_id: email_id })
            if (check_query) {
                errObj['email_id'] = 'This Email ID already exists.'
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            res.json({ status: true, message: { alert_message: 'Email ID is available' } })
        }

    }
    catch (err) {
        console.log('Check email id.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

// company_partner_status -> -1:Not Requested, 1:pending Request, 1:approved, 2:rejected
const companyListedStatus = async (user_row_id) => {
    let result = new Object()
    result.company_listed_status = 0
    result.company_partner_status = -1

    const company_query = await companyM.findOne({ user_row_id: user_row_id, approval_status: 1, active_status: 1 }, { _id: 1 })
    if (company_query) {
        result.company_listed_status = 1
        const partner_query = await added_to_partnersM.findOne({ company_row_id: company_query._id })
        if (partner_query) {
            result.company_partner_status = 1
        }
        else {
            const request_partner_query = await company_requests_to_partnersM.findOne({ company_row_id: company_query._id })
            if (request_partner_query) {
                result.company_partner_status = request_partner_query.approval_status
            }
        }
    }

    return result
}

module.exports = router