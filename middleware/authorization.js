require('dotenv').config()
const jwt = require('jsonwebtoken')
const verifyAppleToken = require("verify-apple-id-token").default
const API_KEY = process.env.API_KEY
const JWT_USR_SECRET_KEY = process.env.JWT_USR_SECRET_KEY
const JWT_ADMIN_SECRET_KEY = process.env.JWT_ADMIN_SECRET_KEY
const JWT_FORGOT_SECRET_KEY = process.env.JWT_FORGOT_SECRET_KEY
const JWT_USR_TEMP_SECRET_KEY = process.env.JWT_USR_TEMP_SECRET_KEY

//Check valid api key
const checkApiKey = function (req, res, next) {
    try {
        if (!req.headers.api_key) {
            res.json({
                status: false,
                message: { "api_key": "The API KEY field is required in headers." }
            })
        }
        else if (req.headers.api_key !== API_KEY) {
            res.json({
                status: false,
                message: { "api_key": "The API KEY field is Not Valid." }
            })
        }
        else {
            next()
        }

    }
    catch (err) {
        console.error('Check api key error', err)
        return { status: false }
    }
}

const ALLOWED_APPLE_AUDIENCES = [
    "sign.coinpedia.services",   // web
    "io.coinpedia.cryptonews"    // ionic mobile
];

const decodeAppleToken = async function (headers) {
    try {
        if (!headers.token) {
            return {
                status: false,
                message: { alert_message: "The Token field is required in headers." }
            }
        }

        let jwtClaims = null
        let lastError = null

        // Try each allowed audience until one succeeds
        for (const clientId of ALLOWED_APPLE_AUDIENCES) {
            try {
                jwtClaims = await verifyAppleToken({
                    idToken: headers.token,
                    clientId
                })
                break // verified successfully — stop trying
            } catch (err) {
                lastError = err
                continue // try next clientId
            }
        }

        // None of the clientIds worked
        if (!jwtClaims) {
            console.error('Decode apple token error', lastError)
            return {
                status: false,
                message: { alert_message: "The token field is Not Valid." }
            }
        }

        // Extra safety — aud must be one of our allowed audiences
        if (ALLOWED_APPLE_AUDIENCES.includes(jwtClaims.aud)) {
            return { status: true, message: jwtClaims }
        }

        return {
            status: false,
            message: { alert_message: "The token field is Not Valid." }
        }

    } catch (err) {
        console.error('Decode apple token error', err)
        return {
            status: false,
            message: { alert_message: "The token field is Not Valid." }
        }
    }
}

//Check user login token
const checkUserLoginToken = function (headers) {
    try {
        if (!headers.token) {
            return { status: false, message: "The Token field is required in headers." }
        }
        else {

            const token_decoded = jwt.verify(headers.token, JWT_USR_SECRET_KEY)
            if (token_decoded.expire_at) {
                if (token_decoded.expire_at < (new Date().getTime())) {
                    return { status: false, message: "Sorry, This token field is expired." }
                }
            }
            return { status: true, message: token_decoded.temp_row_id }

        }

    }
    catch (err) {
        console.error('check user login token error', err)
        return { status: false, message: { alert_message: "The token field is Not Valid." } }
    }
}



//Check admin and user both token
const checkAllLoginToken = async function (headers, admin_array) {
    try {
        if (!headers.token) {
            return { status: false, message: { alert_message: "The Token field is required in headers." } }
        }
        else {
            const checkUserToken = checkUserLoginToken(headers)

            if (checkUserToken.status) {
                let user_type = 1
                let user_row_id = checkUserToken.message
                let token_message = checkUserToken.message

                return { status: true, message: { user_row_id, user_type }, token_message: token_message }
            }

            const checkAdminToken = checkAdminLoginToken(headers, admin_array)
            if (checkAdminToken.status) {
                let user_row_id = 0
                let user_type = 2
                let token_message = checkAdminToken.message
                if (checkAdminToken.message.admin_manager_type == 2) {
                    user_row_id = checkAdminToken.message.admin_row_id
                }
                return { status: true, message: { user_row_id, user_type }, token_message: token_message }
            }

            return { status: false, message: { alert_message: "Sorry, This token field is expired." } }
        }
    }
    catch (err) {
        console.error('check all login tokens error', err)
        return { status: false, message: "The token field is Not Valid." }
    }
}


//Generate user login token
const generateUserLoginToken = function (user_row_id, verify_status, keepme_status) {
    try {
        let expire_at = (3.5 * 60 * 60 * 1000) + (new Date().getTime())
        if (keepme_status == 2) {
            expire_at = (30 * 24 * 60 * 60 * 1000) + (new Date().getTime())
        }

        let jwtObj = {
            expire_at: expire_at,
            temp_row_id: user_row_id,
            verify_status: verify_status,
            issued_at: new Date().getTime()
        }
        return jwt.sign(jwtObj, JWT_USR_SECRET_KEY)

    }
    catch (err) {
        console.error('Generate user login error', err)
        return false
    }
}

//Generate apple mobile user login token
const generateMobileAppUserLoginToken = function (user_row_id, verify_status) {
    try {
        let jwtObj = {
            expire_at: (30 * 24 * 60 * 60 * 1000) + (new Date().getTime()),
            temp_row_id: user_row_id,
            verify_status: verify_status,
            issued_at: new Date().getTime()
        }
        return jwt.sign(jwtObj, JWT_USR_SECRET_KEY)
    }
    catch (err) {
        console.error('Generate apple user mobile login token error', err)
        return { status: false, message: "The token field is Not Valid." }
    }
}

//Genrate admin login token
const checkAdminLoginToken = function (headers, access_type) {
    try {
        if (!headers.token) {
            return { status: false, message: "The Token field is required in headers." }
        }
        else {
            const token_decoded = jwt.verify(headers.token, JWT_ADMIN_SECRET_KEY)
            if (token_decoded.expire_at) {
                if (token_decoded.expire_at < (new Date().getTime())) {
                    return { status: false, message: "Sorry, This token field is expired." }
                }
            }
            if (Number.parseInt(token_decoded.admin_manager_type) === 1) {
                return { status: true, message: token_decoded }
            }
            else if (Number.parseInt(token_decoded.admin_manager_type) === 2) {
                if (access_type[0] === -1) {
                    return { status: true, message: token_decoded }
                }

                let check_include_status = false
                for (let item in access_type) {
                    if (((token_decoded.admin_access_types).includes(access_type[item]))) {
                        check_include_status = true
                        break
                    }
                }
                if (check_include_status) {
                    return { status: true, message: token_decoded }
                }
                else {
                    return { status: false, message: "The token field is Not Valid.", check_include_status, token_decoded, access_type }
                }

            }
            else {
                return { status: false, message: "The token field is Not Valid." }
            }
        }
    }
    catch (err) {
        console.error('Generate admin login token error', err)
        return { status: false, message: "The token field is Not Valid." }
    }
}

//Verify forgot code
const checkForgotUniqueId = function (forgot_verify_code) {
    try {
        if (!forgot_verify_code) {
            return { status: false, message: "The Forgot Verify Code field is required." }
        }
        else {
            const token_decoded = jwt.verify(forgot_verify_code, JWT_FORGOT_SECRET_KEY)
            if (token_decoded.expire_at) {
                if (token_decoded.expire_at < (new Date().getTime())) {
                    return { status: false, message: "Sorry, The Forgot Verify Code is expired." }
                }
            }
            return { status: true, message: token_decoded.forgot_user_row_id }
        }
    }
    catch (err) {
        console.error('Check forgot unique id error', err.message)
        return { status: false, message: "Sorry, The Forgot Verify Code is invalid." }
    }
}


// Generate email temp token
const generateEmailTempToken = function (user_row_id, email_verify_code, keepme_status) {
    try {
        let jwtObj = {
            expire_at: (20 * 60 * 1000) + (new Date().getTime()),
            account_row_id: user_row_id,
            email_verify_code: email_verify_code,
            keepme_status: keepme_status,
            issued_at: new Date().getTime()
        }
        return jwt.sign(jwtObj, JWT_USR_TEMP_SECRET_KEY)

    }
    catch (err) {
        console.error('Generate email temp token error', err)
        return false
    }
}

// Verify email temp token
const verifyEmailTempToken = function (headers) {
    try {
        if (!headers.token) {
            return { status: false, message: { alert_message: "The Token field is required in headers." } }
        }
        else {
            const token_decoded = jwt.verify(headers.token, JWT_USR_TEMP_SECRET_KEY)
            if (token_decoded.expire_at) {
                if (token_decoded.expire_at < (new Date().getTime())) {
                    return { status: false, message: { alert_message: "Sorry, This token field is expired." } }
                }
            }
            return { status: true, message: token_decoded }
        }
    }
    catch (err) {
        console.error('Verify email temp token error', err)
        return { status: false, message: { alert_message: "The token field is Not Valid." } }
    }
}

// Profile Verify email token
const profileVerifyEmailToken = function (email_verify_code) {
    try {
        const token_decoded = jwt.verify(email_verify_code, JWT_USR_TEMP_SECRET_KEY)
        if (token_decoded.expire_at) {
            if (token_decoded.expire_at < (new Date().getTime())) {
                return { status: false, message: { alert_message: "Sorry, This token field is expired." } }
            }
        }
        return { status: true, message: token_decoded }
    }
    catch (err) {
        console.error('Profile Verify email token error', err)
        return { status: false, message: { alert_message: "The token field is Not Valid." } }
    }
}


module.exports = { checkAllLoginToken, decodeAppleToken, checkApiKey, checkUserLoginToken, checkAdminLoginToken, checkForgotUniqueId, generateMobileAppUserLoginToken, generateUserLoginToken, generateEmailTempToken, verifyEmailTempToken, profileVerifyEmailToken }