require('dotenv').config()
const sanitize = require('mongo-sanitize')
const express = require('express')
const expressip = require('express-ip')
const requestIp = require('request-ip')
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const randomstring = require("randomstring")
const sharp = require('sharp')
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3")

const axios = require('axios')
dayjs.extend(utc);
dayjs.extend(timezone);
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const companyPodcastsM = require('../../models/app/podcast/companyPodcastsM')
const company_nftM = require('../../models/app/company/company_nftM')

const company_nft_wallet_statusM = require('../../models/app/company/company_nft_wallet_statusM')
const company_podcast_statusM = require('../../models/app/company/company_podcast_statusM')
const event_attendeesM = require('../../models/app/events/event_attendeesM')
const email_eventsM = require('../../models/emails/email_eventsM')
import s3 from '../../config/s3'

const sendgrid_api_url = 'https://api.sendgrid.com'

const app = express()
app.use(expressip().getIpInfoMiddleware)

export const convertUnixTimeToUTC = function (pass_date_n_time) {
    try {
        const formattedDate = dayjs
            .unix(pass_date_n_time)          // seconds → date
            .tz("Africa/Bamako")             // convert timezone
            .format("YYYY-MM-DDTHH:mm:ssZ");

        return formattedDate;

    }
    catch (err) {
        console.error('convert unix timestamp date to UTC date time', err)
        return false
    }
}

// Convert to short value
export const convertToShortValue = (labelValue) => {
    try {
        const absValue = Math.abs(Number(labelValue))
        let shortValue;

        if (absValue >= 1.0e12) {
            shortValue = Math.trunc((absValue / 1.0e12) * 100) / 100 + " T"
        } else if (absValue >= 1.0e9) {
            shortValue = Math.trunc((absValue / 1.0e9) * 100) / 100 + " B"
        } else if (absValue >= 1.0e6) {
            shortValue = Math.trunc((absValue / 1.0e6) * 100) / 100 + " M"
        } else if (absValue >= 1.0e3) {
            shortValue = Math.trunc((absValue / 1.0e3) * 100) / 100 + " K"
        } else if (absValue >= 1) {
            shortValue = labelValue.toFixed(2)
        } else {
            shortValue = absValue
        }

        return shortValue
    }
    catch (err) {
        console.error('Convert to short value error', err)
        return false
    }

}

//Get server time
export const getServerTime = function () {
    try {
        return dayjs().format("YYYY-MM-DDTHH:mm:ssZ");
    }
    catch (err) {
        console.error('Get server time error', err)
        return false
    }
}

//Get ip address
export const requestIPAddress = function (req) {
    try {
        return requestIp.getClientIp(req)
    }
    catch (err) {
        console.error('Get ip address error', err)
        return false
    }
}

//get preesent date only
export const getPresentDateOnly = function () {
    try {
        return dayjs()
            .tz("Africa/Bamako")
            .format("YYYY-MM-DD");

    }
    catch (err) {
        console.error('Get present date only error', err)
        return false
    }
}

//Get present year only
export const getPresentYearOnly = function () {
    try {
        return dayjs()
            .tz("Africa/Bamako")
            .format("YYYY");

    }
    catch (err) {
        console.error('Get present year only error', err)
        return false
    }
}

//Get short wallet address
export const getShortWalletAddress = (wallet_address) => {
    try {
        const res1 = wallet_address.substr(0, 4)
        const res2 = wallet_address.substr(wallet_address.length - 4)
        return res1 + '...' + res2
    }
    catch (err) {
        console.error('Get short wallet address error', err)
        return false
    }
}

// Get Events email date
export const getEmailEventDate = function (pass_date_n_time) {
    try {
        return dayjs(pass_date_n_time)
            .tz("Africa/Bamako")
            .format("DD, MM YYYY hh:mmA");

    }
    catch (err) {
        console.error('Get events email date error', err)
        return false
    }
}

//Get previous day start date
export const getPrevStartDate = function (pass_number) {
    try {
        return (
            dayjs()
                .subtract(pass_number, "day")
                .tz("Africa/Bamako")
                .format("YYYY-MM-DD") + "T00:00:00Z"
        );
    }
    catch (err) {
        console.error('Get previous start date error', err)
        return false
    }
}

export const getMinusYearDates = function (year_number) {
    try {
        const new_object = new Object(null)
        let year = new Date().getFullYear()

        new_object.start_date = (Number.parseInt(year) - year_number) + '-01-01T00:00:00Z'
        new_object.end_date = (Number.parseInt(year) - year_number) + '-12-31T00:00:00Z'
        return new_object
    }
    catch (err) {
        console.error('Get present date and time error', err)
        return false
    }
}

// Get present date and time
export const getPresentDateTime = function () {
    try {
        return dayjs()
            .tz("Africa/Bamako")
            .format("YYYY-MM-DDTHH:mm:ssZ");
    }
    catch (err) {
        console.error('Get present date and time error', err)
        return false
    }
}

// Create date start time
export const createDateOnly = function (param_date_only) {
    try {
        return (
            dayjs(param_date_only)
                .tz("Africa/Bamako")
                .format("YYYY-MM-DD") + "T00:00:00Z"
        );
    }
    catch (err) {
        console.error('Create date only error', err)
        return false
    }
}

// Create date end time
export const createEndDateOnly = function (param_date_only) {
    try {
        return (
            dayjs(param_date_only)
                .add(2, "day")
                .tz("Africa/Bamako")
                .format("YYYY-MM-DD") + "T23:59:59Z"
        );
    }
    catch (err) {
        console.error('Create end date only error', err)
        return false
    }
}

// Add days to present date
export const addDaysToPresentDate = (pass_day_number) => {
    try {
        return (
            dayjs()
                .add(pass_day_number, "day")
                .tz("Africa/Bamako")
                .format("YYYY-MM-DD") + "T07:00:00Z"
        );

    }
    catch (err) {
        console.error('Add days to present date error', err)
        return false
    }
}

// Add days to present date and time
export const addDaysToPresentDateNTime = (param_date_time) => {
    try {
        return dayjs(param_date_time)
            .add(7, "day")
            .tz("Africa/Bamako")
            .format("MM DD, YYYY");

    }
    catch (err) {
        console.error('Add days to present date and time error', err)
        return false
    }
}

// Add five minutes to time
export const addFiveMinutesToTime = (param_date_time) => {
    try {
        return dayjs(param_date_time)
            .add(5, "minute")
            .tz("Africa/Bamako")
            .format("YYYY-MM-DDTHH:mm:ssZ");

    }
    catch (err) {
        console.error('Add five minutes to time error', err)
        return false
    }
}

// Get minus dates
export const getMinusDates = function (pass_day_number) {
    try {
        return (
            dayjs()
                .subtract(pass_day_number, "day")
                .tz("Africa/Bamako")
                .format("YYYY-MM-DD") + "T00:00:00Z"
        );

    }
    catch (err) {
        console.error('Get minus dates error', err)
        return false
    }
}

// Create date and time
export const createDateTime = function (param_date_time) {
    try {
        return dayjs(param_date_time)
            .tz("Africa/Bamako")
            .format("YYYY-MM-DDTHH:mm:ssZ");

    }
    catch (err) {
        console.error('Create date and time error', err)
        return false
    }
}

//Get start and end of today
export function startAndEndOfToday() {
    try {
        const dateInBamako = dayjs().tz("Africa/Bamako").format("YYYY-MM-DD");

        return {
            start_date: `${dateInBamako}T00:00:00Z`,
            end_date: `${dateInBamako}T23:59:59Z`,
        };

    }
    catch (err) {
        console.error('Get start and end of today error', err)
        return false
    }
}

// Get start and end of tomorrow
export function startAndEndOfTomorrow() {
    try {
        const today = new Date()
        let tomorrow_start = new Date()
        tomorrow_start.setHours(0, 0, 0, 0);
        tomorrow_start.setDate(today.getDate() + 1)

        let tomorrow_end = new Date()
        tomorrow_end.setHours(23, 59, 59, 999);
        tomorrow_end.setDate(today.getDate() + 1)

        return { start_date: tomorrow_start, end_date: tomorrow_end }

    }
    catch (err) {
        console.error('Get start and end of tomorrow error', err)
        return false
    }
}

// Get start and end of week 
export function startAndEndOfWeek() {
    try {
        let date = getPresentDateTime()
        let now = date ? new Date(date) : new Date()
        now.setHours(0, 0, 0, 0);
        let monday = new Date(now);
        monday.setDate(monday.getDate() - monday.getDay() + 0)
        now.setHours(23, 59, 59, 999)
        let sunday = new Date(now);
        sunday.setDate(sunday.getDate() - sunday.getDay() + 6)
        return { start_date: monday, end_date: sunday }

    }
    catch (err) {
        console.error('Get start and end of week error', err)
        return false
    }
}

// Get start and end of weekend
export function startAndEndOfWeekend() {
    try {
        let date = getPresentDateTime()
        let now = date ? new Date(date) : new Date()
        now.setHours(0, 0, 0, 0)
        let saturday = new Date(now)
        saturday.setDate(saturday.getDate() - saturday.getDay() + 6)
        now.setHours(23, 59, 59, 999)
        let sunday = new Date(now)
        sunday.setDate(sunday.getDate() - sunday.getDay() + 7)
        return { start_date: saturday, end_date: sunday }

    }
    catch (err) {
        console.error('Get start and end of weekend error', err)
        return false
    }
}

// Get month start and end date
export const monthStartEndDate = function () {
    try {
        const now = dayjs().tz("Africa/Bamako");

        const month_start_date = now
            .startOf("month")
            .format("YYYY-MM-DDTHH:mm:ssZ");

        const month_end_date = now
            .endOf("month")
            .format("YYYY-MM-DDTHH:mm:ssZ");

        return {
            start_date: month_start_date,
            end_date: month_end_date,
        };

    } catch (err) {
        console.error("Get month start and end date error", err);
        return false;
    }
}

// Get yesterdays start and end date
export const yesterDayStartNEndDate = () => {
    try {
        const dateInBamako = dayjs()
            .subtract(1, "day")
            .tz("Africa/Bamako")
            .format("YYYY-MM-DD");

        return {
            start_date: `${dateInBamako}T00:00:00Z`,
            end_date: `${dateInBamako}T23:59:59Z`,
        };

    }
    catch (err) {
        console.error('Get yesterdays start and end date error', err)
        return false
    }

}

// Get last week start and end date
export const lastWeekStartEndDate = function () {
    try {
        const present_time = getPresentDateTime();

        // Convert to dayjs
        let endDate = dayjs(present_time);

        // JS getDay(): 0 = Sunday → convert to 7
        let dayNumberForSunday = endDate.day();
        if (dayNumberForSunday === 0) {
            dayNumberForSunday = 7;
        }

        // Move to previous Sunday
        endDate = endDate.subtract(dayNumberForSunday, "day");

        // Start date = 6 days before end date
        const startDate = endDate.subtract(6, "day");

        // Format in Africa/Bamako timezone
        const formatted_start_date =
            startDate.tz("Africa/Bamako").format("YYYY-MM-DD") + "T00:00:00Z";

        const formatted_end_date =
            endDate.tz("Africa/Bamako").format("YYYY-MM-DD") + "T23:59:59Z";

        return {
            start_date: formatted_start_date,
            end_date: formatted_end_date,
        };

    }
    catch (err) {
        console.error('Get last week start and end date error', err)
        return false
    }
}

// Get last month start and end date
export const lastMonthStartEndDate = function () {
    try {
        const date = dayjs(presentHourTime());

        // Previous month start
        const formatted_start_date =
            date
                .subtract(1, "month")
                .startOf("month")
                .format("YYYY-MM-DD") + "T00:00:00Z";

        // Previous month end
        const formatted_end_date =
            date
                .subtract(1, "month")
                .endOf("month")
                .format("YYYY-MM-DD") + "T23:59:59Z";

        return {
            start_date: formatted_start_date,
            end_date: formatted_end_date,
        };

    }
    catch (err) {
        console.error('Get last month start and end date error', err)
        return false
    }
}

// Get present hour time
export const presentHourTime = function () {
    try {
        return (
            dayjs()
                .tz("Africa/Bamako")
                .format("YYYY-MM-DDTHH") + ":00:00Z"
        );

    }
    catch (err) {
        console.error('Get present hour time error', err)
        return false
    }
}

// not being used
export const checkValidSpeakers = async function (speakers) {
    let userIds = []
    for (let user_id of speakers) {
        const userActiveStatus = await professionalsM.findOne({ user_name: user_id, login_status: 1, approval_status: 1 }, { _id: 1 })
        if (!userActiveStatus) {
            return { status: false, message: [] }
        }
        else {
            const new_object = await Promise.resolve(userActiveStatus._id)
            userIds.push(new_object)
        }
    }

    return { status: true, message: userIds }
}

// Get new company row id
export const getNewCompanyRowID = async (pass_company_name) => {
    try {

        let company_id = pass_company_name.toLowerCase()
        company_id = company_id.replace(/\s/g, '')
        company_id = company_id.replace(/[^A-Za-z0-9-]/g, '')

        const check_query = await companyM.findOne({ company_id: company_id }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
        if (check_query) {
            const count_number = await companyM.countDocuments({ company_id: { '$regex': company_id, $options: 'i' } })
            return company_id + (count_number + 1)
        }
        else {
            return company_id
        }
    }
    catch (err) {
        console.error('Get new company row id error', err)
        return false
    }
}

// Check valid date
export const checkValidDate = (date) => {
    try {
        let matches = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(date)
        if (matches === null) return { status: false, message: "" };
        const formatted_date = matches[0] + 'T00:00:00Z'
        return { status: true, message: new Date(formatted_date) }

    }
    catch (err) {
        console.error('check valid date error', err)
        return { status: false }
    }
}

// Create new user name
export const createNewUsername = async function (param_username) {
    try {
        let username = param_username.toLowerCase()
        username = username.replace(/\s/g, '-')
        username = username.replace(/[^A-Za-z0-9-]/g, '')
        const checkQuery = await professionalsM.findOne({ user_name: { '$regex': username, $options: 'i' } }, { _id: 1 })
        if (!checkQuery) {
            return username
        }
        else {
            const total_usernames = await professionalsM.countDocuments({ user_name: { '$regex': username, $options: 'i' } })
            let new_username = username + total_usernames

            const checkQuery2 = await professionalsM.findOne({ user_name: new_username }, { _id: 1 })
            if (checkQuery2) {
                let random_string = randomstring.generate({ length: 2, charset: '0123456789' })
                new_username = username + total_usernames + random_string
            }
            return new_username
        }

    }
    catch (err) {
        console.error('Create new user name error', err)
        return false
    }
}

// Upload form image
export const formImageUpload = async (upload_image, upload_type) => {
    try {
        let random_string = (randomstring.generate(10)).toLowerCase()
        const fileContent = Buffer.from(upload_image.data, 'binary')
        let params = {}
        let new_image_name = ""
        let my_content_type = "image/svg+xml"

        if (upload_type === 2) {
            new_image_name = Date.now() + random_string + ".svg"

            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/markets/cryptocurrencies/" + new_image_name,
                Body: fileContent,
                ACL: "public-read",
                ContentType: "image/svg+xml"
            }
        }
        else if (upload_type === 6) {
            new_image_name = Date.now() + random_string + ".webp"

            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/contests/" + new_image_name,
                Body: fileContent,
                ACL: "public-read",
                ContentType: "image/png"
            }
        }
        else if (upload_type === 7) {

            new_image_name = Date.now() + random_string + ".svg"

            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/events_sponsors_partners/" + new_image_name,
                Body: fileContent,
                ACL: "public-read",
                ContentType: "image/svg+xml"
            }
        }
        else if (upload_type === 8) {

            const pass_profile_image_name = upload_image.name
            const pass_profile_image_name_array = await pass_profile_image_name.split(".")
            const pass_profile_image_extension = await pass_profile_image_name_array.pop()

            if (pass_profile_image_extension !== 'svg') {
                my_content_type = 'image/png'
            }
            new_image_name = Date.now() + random_string + '.' + pass_profile_image_extension

            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/manual_users/" + new_image_name,
                Body: fileContent,
                ACL: "public-read",
                ContentType: my_content_type
            }
        }
        else if (upload_type === 9) {
            const pass_profile_image_name = upload_image.name
            const pass_profile_image_name_array = await pass_profile_image_name.split(".")
            const pass_profile_image_extension = await pass_profile_image_name_array.pop()

            if (pass_profile_image_extension !== 'svg') {
                my_content_type = 'image/png'
            }
            new_image_name = Date.now() + random_string + '.' + pass_profile_image_extension

            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/manual_companies/" + new_image_name,
                Body: fileContent,
                ACL: "public-read",
                ContentType: my_content_type
            }
        }

        try {
            await s3.send(new PutObjectCommand(params));

            console.log("upload success", params.Key);

            return {
                status: true,
                message: new_image_name,
            };
        } catch (err) {
            console.log("upload err", err);

            return {
                status: false,
                message: err,
            };
        }

    }
    catch (err) {
        console.error('Upload form image error', err)
        return { status: false }
    }
}

// Decode image
export const decodeImage = async function (image, type) {
    try {
        let img = ""
        let webp_img = ""
        let matches = image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)

        let imgReqObj = {}
        if (matches[1]) {
            imgReqObj.type = matches[1]
            imgReqObj.data = Buffer.from(matches[2], 'base64')
            let imageType = (matches[1]).replace("image/", "")
            let decodedImg = imgReqObj

            // resize
            if (Number.parseInt(type) === 1) {
                // img = await sharp(decodedImg.data).resize({ height: 250, width: 250 }).webp().toBuffer()
                webp_img = await sharp(decodedImg.data).resize({ height: 250, width: 250 }).webp().toBuffer()
            }
            else if (Number.parseInt(type) === 2) {
                img = await sharp(decodedImg.data).resize({ height: 128, width: 128 }).jpeg({ mozjpeg: true }).toBuffer()
                webp_img = await sharp(decodedImg.data).resize({ height: 1200, width: 1200 }).jpeg({ mozjpeg: true }).toBuffer()
            }
            else if (Number.parseInt(type) === 3) {
                //.resize({ height: 1250, width: 656 })
                img = await sharp(decodedImg.data).resize({ height: 656, width: 1250 }).webp().toBuffer()
                webp_img = await sharp(decodedImg.data).resize({ height: 656, width: 1250 }).webp().toBuffer()
            }
            else if (Number.parseInt(type) === 4) {
                if (imageType === "gif") {
                    img = await sharp(decodedImg.data).toBuffer()
                }
                else {
                    img = await sharp(decodedImg.data).png().toBuffer()
                }
            }
            else if (Number.parseInt(type) === 5) {
                img = await sharp(decodedImg.data).png().toBuffer()
            }
            else if (Number.parseInt(type) === 6) {
                webp_img = await sharp(decodedImg.data).resize({ height: 250, width: 250 }).webp().toBuffer()
            }
            else if (Number.parseInt(type) === 7) {
                webp_img = await sharp(decodedImg.data).resize({ height: 250, width: 250 }).webp().toBuffer()
            }
            else if (Number.parseInt(type) === 8) {
                webp_img = await sharp(decodedImg.data).resize({ height: 250, width: 250 }).webp().toBuffer()
            }
            else if (Number.parseInt(type) === 9) {
                img = await sharp(decodedImg.data).resize({ height: 628, width: 1200 }).webp().toBuffer()
                webp_img = await sharp(decodedImg.data).resize({ height: 628, width: 1200 }).webp().toBuffer()
            } else if (Number.parseInt(type) === 10) {
                img = await sharp(decodedImg.data).resize({ height: 50, width: 50 }).webp().toBuffer()
                webp_img = await sharp(decodedImg.data).resize({ height: 50, width: 50 }).webp().toBuffer()
            }
            else if (Number.parseInt(type) === 11) {
                img = await sharp(decodedImg.data).resize({ height: 628, width: 1200 }).webp().toBuffer()
                webp_img = await sharp(decodedImg.data).resize({ height: 628, width: 1200 }).webp().toBuffer()
            }
            else {
                img = await sharp(decodedImg.data).png().toBuffer()
            }

            let random_string = (randomstring.generate(10)).toLowerCase()
            let image_prefix_name = Date.now() + random_string
            let fileName = image_prefix_name + ".jpg"
            let webp_file_name = image_prefix_name + ".webp"

            return { img: img, fileName: fileName, matches: imageType, webp_img: webp_img, webp_file_name: webp_file_name }
        }

    }
    catch (err) {
        console.error('Decode image error', err)
        return false
    }
}

// Validate and save images
export const validateAndSaveImage = async function (image, type) {
    try {
        if (image) {
            const validateFunction = await decodeImage(image, type)
            let fileName = validateFunction.fileName
            let img = validateFunction.img
            let webp_file_name = validateFunction.webp_file_name
            let webp_img = validateFunction.webp_img

            let key_path = ""
            let params = {}
            let params2 = {}
            if (Number.parseInt(type) === 1)//users and companies
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/profile/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            }
            else if (Number.parseInt(type) === 2) {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/markets/cryptocurrencies/" + fileName,
                    Body: img,
                    ACL: "public-read",
                    ContentType: "image/png"
                }
            }
            else if (Number.parseInt(type) === 3)//event images
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/events/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }

                // key_path = "app_uploads/events_jpg/"+fileName
            }
            else if (Number.parseInt(type) === 5) {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/nft/" + fileName,
                    Body: img,
                    ACL: "public-read",
                    ContentType: "image/png"
                }
            }
            else if (Number.parseInt(type) === 6)//manual users
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/manual_users/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            }
            else if (Number.parseInt(type) === 7)//manual companies
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/manual_companies/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            }
            else if (Number.parseInt(type) === 8) // awards
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "app_uploads/users_awards/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            }
            else if (Number.parseInt(type) === 9) // academy
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "academy/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            }
            else if (Number.parseInt(type) === 10) // community groups
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "community/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            } else if (Number.parseInt(type) === 11) // community posts
            {
                params = {
                    Bucket: process.env.DO_SPACES_NAME,
                    Key: "community/" + webp_file_name,
                    Body: webp_img,
                    ACL: "public-read",
                    ContentType: "image/webp"
                }
            }


            try {
                await s3.send(new PutObjectCommand(params));
            } catch (err) {
                console.log(err, err.stack);
            }
            // let check_in_array = [1, 2, 3]
            // if(check_in_array.includes(Number.parseInt(type)))
            // {
            //     let webp_params =  {
            //         Bucket: process.env.DO_SPACES_NAME,
            //         Key: key_path,
            //         Body: img,
            //         ACL: "public-read",
            //         ContentType: "image/jpg"
            //     }

            //     s3.putObject(webp_params, function(err, data) 
            //     {
            //         if (err) {console.log(err, err.stack)}
            //     })
            // }

            if (Object.keys(params2).length > 0) {
                try {
                    await s3.send(new PutObjectCommand(params2));
                } catch (err) {
                    console.log(err, err.stack);
                }
            }
            return { status: true, message: fileName, webp_file_name: webp_file_name, matches: validateFunction.matches }
        }
        else {
            return { status: false, message: "" }
        }

    }
    catch (err) {
        console.error('Validate and save image error', err)
        return { status: false }
    }
}


// Delete image from digital ocean
export const deleteImageDigitalOcean = async function (deleteImage, type) {
    try {
        let params = {}
        if (Number.parseInt(type) === 1) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/profile/" + deleteImage
            }
        }
        else if (Number.parseInt(type) === 2) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/markets/cryptocurrencies/" + deleteImage
            }
        }
        else if (Number.parseInt(type) === 3) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/events/" + deleteImage
            }

        }
        else if (Number.parseInt(type) === 5) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/nft/" + deleteImage
            }
        }
        else if (Number.parseInt(type) === 6) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/contests/" + deleteImage
            }
        }
        else if (Number.parseInt(type) === 7) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/events_sponsors_partners/" + deleteImage
            }
        }
        else if (Number.parseInt(type) === 8) {
            params = {
                Bucket: process.env.DO_SPACES_NAME,
                Key: "app_uploads/users_awards/" + deleteImage
            }
        }

        try {
            const data = await s3.send(new DeleteObjectCommand(params));
            console.log(data);
        } catch (err) {
            console.log(err, err.stack);
        }

        return true

    }
    catch (err) {
        console.error('Delete image from digital ocean error', err)
        return false
    }
}

// Arrange validation
export const arrangeValidation = function (errors) {
    try {
        let errObj = {}
        if (!errors.isEmpty()) {
            let errors_array = errors.array()
            for (let key in errors_array) {
                let obj = errors_array[key]
                let msg = obj.msg
                let path = obj.path
                if (typeof errObj[path] == 'undefined') {
                    errObj[path] = msg
                }
            }
        }

        return errObj

    }
    catch (err) {
        console.error('Arrange validation error', err)
        return false
    }
}

// Get IP address
export const getIPAddress = function (req) {
    try {

        if (req.ipInfo) {
            return req.ipInfo.ip.split(", ")
        }
        else if (req.ip) {
            return req.ip.split(", ")
        }
        else {
            return []
        }
    }
    catch (err) {
        console.error('Get IP address error', err)
        return false
    }
}

// Get integer values
export const getIntValues = async function (pass_array) {
    try {
        let new_array = []
        if (pass_array) {
            if (Array.isArray(pass_array)) {
                for (let x of pass_array) {

                    new_array.push(Number.parseInt(x))
                }
            }
        }
        return new_array

    }
    catch (err) {
        console.error('Get integer values error', err)
        return false
    }
}

// Minus days from present time
export const daysMinusFromPresentTime = function (pass_day_number) {
    try {
        return dayjs()
            .subtract(pass_day_number, "day")
            .tz("Africa/Bamako")
            .format("YYYY-MM-DDTHH:mm:ssZ");

    }
    catch (err) {
        console.error('Minus days from present time error', err)
        return ""
    }
}

export const hoursAddFromPresentTime = function (hours) {
    try {
        return dayjs()
            .add(hours, "hour")
            .tz("Africa/Bamako")
            .format("YYYY-MM-DDTHH:mm:ssZ");
    }
    catch (err) {
        console.error('Add five minutes to time error', err)
        return false
    }
}

// Get integer id from array
export const getIntIdFromArray = async function (listArr) {
    try {
        let businessModelId = []
        if (Array.isArray(listArr)) {
            if (listArr) {
                for (let key in listArr) {
                    if (Number.parseInt(listArr[key])) {
                        businessModelId.push(Number.parseInt(listArr[key]))
                    }
                }
            }
            return businessModelId
        }
        else {
            return businessModelId
        }

    }
    catch (err) {
        console.error('Get integer id from array error', err)
        return false
    }

}

// Generate event URL
export const generateEventUrl = async function (string, row_id) {
    try {
        let trimStr = (string.trim()).toLowerCase()
        let tripleReplaced = trimStr.replace('   ', ' ')
        let doubleReplaced = tripleReplaced.replace('  ', ' ')
        let singleReplaced = doubleReplaced.replace(/\s/g, '-')
        let spclChar = singleReplaced.replace(/[&/#\\, +()$~%.'":*?<>{}|^]/g, '')
        return await spclChar.concat(("-" + row_id.toString()))

    }
    catch (err) {
        console.error('Generate event URL error', err)
        return false
    }
}

// Generate category id
export const generateCategoryId = async function (string) {
    try {
        let trimStr = (string.trim()).toLowerCase()

        let spclChar = trimStr.replace(/[#,+()$~%.'":*?<>{}]/g, '')
        let checkAnd = spclChar.replace(/&/g, 'and')
        let checkOr = checkAnd.replace(/\//g, 'or')

        let tripleReplaced = checkOr.replace('   ', ' ')
        let doubleReplaced = tripleReplaced.replace('  ', ' ')
        let singleReplaced = doubleReplaced.replace(/\s/g, '-')

        return singleReplaced.replace('--', '-')

    }
    catch (err) {
        console.error('Generate category id error', err)
        return false
    }
}

//Get User profile completed percentge
export const user_profile_completed_percentage = async function (query) {
    try {
        //basic =20, profile image=15, about user=15, location=5, wallet_address=5, social=20,  work_position=10, company_name=10
        //email_id= 10, full_name=10, contact number= 5, wallet= 10, youtube channel id= 5, country= 5, expertise= 10, area of interest= 5, Bio=5, social media= 1each, location = 5, meta tag= 3, professional details =10, image=10 

        let completed_percentage = 0
        if (query['profile_image']) {
            completed_percentage += 10
        }
        if (query['email_id']) {
            completed_percentage += 10
        }

        if (query['full_name']) {
            completed_percentage += 10
        }

        if (query['wallet_address']) {
            completed_percentage += 10
        }


        if (query['mobile_number']) {
            completed_percentage += 5
        }

        if (query['youtube_channel']) {
            completed_percentage += 5
        }

        if (query['country_id']) {
            completed_percentage += 5
        }
        if (query['designation_name_list']) {
            if ((query['designation_name_list']).length > 0) {
                completed_percentage += 10
            }

        }

        if (query['looking_for_names_list']) {
            if ((query['looking_for_names_list']).length > 0) {
                completed_percentage += 5
            }

        }

        if (query['user_bio']) {
            completed_percentage += 5
        }

        if (query['location']) {
            completed_percentage += 5
        }

        if (query['meta_keywords'] && query['meta_description']) {
            completed_percentage += 3
        }

        if (query['work_position']) {
            completed_percentage += 5
        }

        if (query['company_name']) {
            completed_percentage += 5
        }

        if (query['facebook']) {
            completed_percentage += 1
        }

        if (query['twitter']) {
            completed_percentage += 1
        }

        if (query['linkedin']) {
            completed_percentage += 1
        }

        if (query['video_link']) {
            completed_percentage += 1
        }

        if (query['instagram']) {
            completed_percentage += 1
        }

        if (query['telegram']) {
            completed_percentage += 1
        }
        if (query['medium']) {
            completed_percentage += 1
        }

        return completed_percentage

    }
    catch (err) {
        console.error('Get user profile completed percentage error', err)
        return false
    }
}

// Get company profile completed percentage
export const company_profile_completed_percentage = async function (query) {
    try {
        //basic =20, profile image=15, company_location=10, about company=15, website_link=10, describe_in_one_line=10,  social=20
        let completed_percentage = 20
        if (query['company_logo']) {
            completed_percentage += 15
        }

        if (query['company_location']) {
            completed_percentage += 10

        }

        if (query['about_company']) {
            completed_percentage += 15
        }

        if (query['website_link']) {
            completed_percentage += 10
        }

        if (query['describe_in_one_line']) {
            completed_percentage += 10
        }

        let fill_social_link = 0
        if (query['facebook']) {
            fill_social_link += 1
        }

        if (query['twitter']) {
            fill_social_link += 1
        }

        if (query['linkedin']) {
            fill_social_link += 1
        }

        if (query['video_link']) {
            fill_social_link += 1
        }

        if (query['instagram']) {
            fill_social_link += 1
        }

        if (query['telegram']) {
            fill_social_link += 1
        }

        if (query['medium']) {
            fill_social_link += 1
        }

        if (fill_social_link === 1) {
            completed_percentage += 5
        }

        if (fill_social_link === 2) {
            completed_percentage += 10
        }
        else if (fill_social_link > 2) {
            completed_percentage += 20
        }

        return completed_percentage

    }
    catch (err) {
        console.error('Get company profile completed percentage error', err)
        return false
    }

}

export const arrayUniqueValues = (anArray, columnNumber) => {
    const new_array = []
    for (let row of anArray) {
        if (row[columnNumber]) {
            if (!new_array.includes(row[columnNumber])) {
                new_array.push(row[columnNumber])
            }
        }
    }
    return new_array
}


export const array_column = (anArray, columnNumber) => anArray.map(row => row[columnNumber])

// Save company podcast details
export const saveSingleCompanyPodcast = async function (company_row_id, podcast_id) {
    try {
        await companyPodcastsM.deleteMany({ company_row_id: company_row_id });
        if (podcast_id) {
            const response = await axios.get(
                `https://listen-api.listennotes.com/api/v2/podcasts/${podcast_id}?sort=recent_first`,
                {
                    headers: {
                        "X-ListenAPI-Key": "20ee49ee018b4293b2804dfb738343c5",
                    },
                }
            );
            const resOutput = {
                statusCode: response.status,
                body: response.data,
            };
            if (Number.parseInt(resOutput.statusCode) === 200) {
                const createObj = {};
                createObj["company_row_id"] = company_row_id;
                createObj["publisher_name"] = resOutput.body.publisher
                    ? resOutput.body.publisher
                    : "";
                createObj["channel_id"] = podcast_id;
                createObj["channel_name"] = resOutput.body.title
                    ? resOutput.body.title
                    : "";
                createObj["channel_image"] = resOutput.body.image
                    ? resOutput.body.image
                    : "";
                createObj["channel_description"] = resOutput.body.description
                    ? resOutput.body.description
                    : "";
                createObj["episodes"] = resOutput.body.episodes
                    ? resOutput.body.episodes
                    : [];
                createObj["date_n_time"] = getPresentDateTime();
                await companyPodcastsM(createObj).save();
                const checkNft = await company_podcast_statusM.findOne({
                    company_row_id: company_row_id,
                });
                if (!checkNft) {
                    await company_podcast_statusM({ company_row_id: company_row_id }).save();
                }
            }
        } else {
            const check_nft_query = await company_podcast_statusM.findOne({
                company_row_id: company_row_id,
            });
            if (check_nft_query) {
                await company_podcast_statusM.deleteOne({
                    company_row_id: company_row_id,
                });
            }
        }
        return true;
    } catch (err) {
        console.error("Save company podcast details error", err);
        return false;
    }
};


// Get company nft list
export const getCompanyNftList = async function () {
    try {
        const getAddr = await company_nft_wallet_statusM.aggregate([
            {
                $lookup:
                {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info"
                }
            },
            { $match: { "company_info": { $elemMatch: { "active_status": 1 } } } },
            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    company_row_id: 1,
                    nft_wallet_address: "$company_info.nft_wallet_address",
                }
            }
        ])

        const myArray = []
        // const getAddr = await companyM.find({ nft_wallet_address: { $exists: true, $ne : "" } },{_id:1, nft_wallet_address:1, view_counts:1}).sort({view_counts:-1}).limit(10)
        for (let i of getAddr) {
            const response = await axios.get(
                "https://api.opensea.io/api/v1/assets",
                {
                    params: {
                        owner: i.nft_wallet_address,
                        order_direction: "desc",
                        offset: 0,
                        limit: 20,
                    },
                    headers: {
                        "x-api-key": "54cd9488fbcf40a5a208ea92be9e5871",
                    },
                }
            );
            const resOutput = {
                statusCode: response.status,
                body: response.data,
            };
            // if(Number.parseInt(resOutput.statusCode) === 200)
            if ((Number.parseInt(resOutput.statusCode) === 200) || (Number.parseInt(resOutput.statusCode) == 400)) {
                await company_nftM.deleteMany({ company_row_id: i.company_row_id })
                if ((resOutput.body.assets)) {
                    if (resOutput.body.assets.length > 0) {
                        const resultArr = resOutput.body.assets
                        for (let key in resultArr) {
                            const innerObj = {}
                            innerObj['company_row_id'] = i.company_row_id
                            innerObj['image_url'] = resultArr[key].image_url
                            innerObj['nft_name'] = resultArr[key].name
                            innerObj['asset_collection_name'] = resultArr[key].asset_contract.name
                            innerObj['asset_contract_schema_name'] = resultArr[key].asset_contract.schema_name
                            innerObj['token_id'] = Number.parseInt(resultArr[key].token_id)
                            innerObj['asset_contract_address'] = (resultArr[key].asset_contract.address) ? resultArr[key].asset_contract.address : ''
                            innerObj['date_n_time'] = resultArr[key].asset_contract.created_date
                            innerObj['update_on'] = getPresentDateTime()

                            const new_object = await Promise.resolve(innerObj)
                            myArray.push(new_object)
                            await company_nftM(innerObj).save()

                        }
                    }

                }
            }
        }
        return myArray

    }
    catch (err) {
        console.error('Get company nft list error', err)
        return false
    }
}

// Save single company NFT details
export const saveSingleCompanyNFTDetails = async function (company_row_id, nft_wallet_address) {
    try {
        if (nft_wallet_address) {
            const response = await axios.get(
                "https://api.opensea.io/api/v1/assets",
                {
                    params: {
                        owner: nft_wallet_address,
                        order_direction: "desc",
                        offset: 0,
                        limit: 20,
                    },
                    headers: {
                        "x-api-key": "54cd9488fbcf40a5a208ea92be9e5871",
                    },
                }
            );
            const resOutput = {
                statusCode: response.status,
                body: response.data,
            };

            if ((Number.parseInt(resOutput.statusCode) === 200) || (Number.parseInt(resOutput.statusCode) === 400)) {
                await company_nftM.deleteMany({ company_row_id: company_row_id })
                if ((resOutput.body.assets)) {
                    if (resOutput.body.assets.length > 0) {
                        const resultArr = resOutput.body.assets
                        for (let key in resultArr) {
                            const innerObj = {}
                            innerObj['company_row_id'] = company_row_id
                            innerObj['image_url'] = resultArr[key].image_url
                            innerObj['nft_name'] = resultArr[key].name
                            innerObj['asset_collection_name'] = resultArr[key].asset_contract.name
                            innerObj['asset_contract_schema_name'] = resultArr[key].asset_contract.schema_name
                            innerObj['token_id'] = Number.parseInt(resultArr[key].token_id)
                            innerObj['asset_contract_address'] = (resultArr[key].asset_contract.address) ? resultArr[key].asset_contract.address : ''
                            innerObj['date_n_time'] = resultArr[key].asset_contract.created_date
                            innerObj['update_on'] = getPresentDateTime()


                            await company_nftM(innerObj).save()

                        }

                        const checkNft = await company_nft_wallet_statusM.findOne({ company_row_id: company_row_id })
                        if (!checkNft) {
                            await company_nft_wallet_statusM({ company_row_id: company_row_id }).save()
                        }
                    }
                }
            }
        }
        else {
            const checkNftQuery = await company_nft_wallet_statusM.findOne({ company_row_id: company_row_id })
            if (checkNftQuery) {
                await company_nft_wallet_statusM.deleteOne({ company_row_id: company_row_id })
            }
        }
        return true

    }
    catch (err) {
        console.error('Save single company NFT details error', err)
        return false
    }
}

// Get Investors object
export const getInvestorsObject = async function (investorsObj) {
    try {
        let listInvestors = []
        if (investorsObj) {
            for (let key of investorsObj) {
                const innerObj = {}
                innerObj['investor_type'] = Number.parseInt(key.investor_type)
                innerObj['search_type'] = Number.parseInt(key.search_type)
                innerObj['investor_id'] = (key.investor_id).toLowerCase()

                if (Number.parseInt(key.investor_type) === 1) {
                    const checkUserInvestors = await professionalsM.findOne({ user_name: sanitize(key.investor_id) })
                    if (checkUserInvestors) {
                        innerObj['investor_row_id'] = checkUserInvestors._id
                    }
                }

                if (Number.parseInt(key.investor_type) === 2) {
                    const checkCompInvestors = await companyM.findOne({ company_id: sanitize(key.investor_id) })
                    if (checkCompInvestors) {
                        innerObj['investor_row_id'] = checkCompInvestors._id
                    }
                }
                const new_object = await Promise.resolve(innerObj)
                listInvestors.push(new_object)
            }
        }
        return listInvestors

    }
    catch (err) {
        console.error('Get Investors object error', err)
        return false
    }
}

// Get social URL
export const getSocialURL = async function (social_link, type) {
    try {
        if (social_link) {
            if (Number.parseInt(type) === 1) {
                if (social_link.includes("https://twitter.com")) {
                    return social_link
                }
                else if (social_link.includes("https://mobile.twitter.com")) {
                    return social_link
                }
                else if (social_link.includes("https://www.twitter.com")) {
                    return social_link
                }
                else if (social_link.includes("twitter.com")) {
                    return "https://" + social_link
                }
                else if (social_link.includes("www.twitter.com")) {
                    return "https://" + social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://twitter.com/" + social_link
                }
            }
            else if (Number.parseInt(type) === 2) {
                if (social_link.includes("https://discord.gg")) {
                    return social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://discord.gg/" + social_link
                }
            }
            else if (Number.parseInt(type) === 3) {
                if (social_link.includes("https://t.me")) {
                    return social_link
                }
                else if (social_link.includes("https://telegram.org")) {
                    return social_link
                }
                else if (social_link.includes("https://www.t.me")) {
                    return social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://t.me/" + social_link
                }
            }
            else if (Number.parseInt(type) === 4) {
                if (social_link.includes("https://www.reddit.com/user")) {
                    return social_link
                }
                else if (social_link.includes("https://www.reddit.com/r")) {
                    return social_link
                }
                else if (social_link.includes("https://www.reddit.com")) {
                    return social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://www.reddit.com/r/" + social_link
                }
            }
            else if (Number.parseInt(type) === 5) {
                if (social_link.includes("https://www.facebook.com")) {
                    return social_link
                }
                else if (social_link.includes("https://facebook.com")) {
                    return social_link
                }
                else if (social_link.includes("https://m.facebook.com")) {
                    return social_link
                }
                else if (social_link.includes("www.facebook.com")) {
                    return "https://" + social_link
                }
                else if (social_link.includes("facebook.com")) {
                    return "https://" + social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://www.facebook.com/" + social_link
                }
            }
            else if (Number.parseInt(type) === 6) {
                if (social_link.includes("https://www.instagram.com")) {
                    return social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://www.instagram.com/" + social_link
                }
            }
            else if (Number.parseInt(type) === 7) {
                if (social_link.includes("https://medium.com")) {
                    return social_link
                }
                else if (social_link.includes(".medium.com")) {
                    return social_link
                }
                else if (social_link.includes("http")) {
                    return social_link
                }
                else {
                    return "https://medium.com/" + social_link
                }
            }
        }
        return social_link

    }
    catch (err) {
        console.error('Get social URL error', err)
        return false
    }
}


// Round off numeric value
export const roundNumericValue = (value) => {
    try {
        if (value) {
            if (value > 0) {
                if (parseFloat(value) >= 1000000) {
                    return separator((parseFloat(value)).toFixed(0))
                }
                else if (parseFloat(value) >= 0.1) {
                    return separator((parseFloat(value)).toFixed(2))
                }
                else if ((parseFloat(value) < 0.1) && (parseFloat(value) >= 0.01)) {
                    return (parseFloat(value)).toFixed(2)
                }
                else if ((parseFloat(value) < 0.01) && (parseFloat(value) >= 0.001)) {
                    return (parseFloat(value)).toFixed(3)
                }
                else if ((parseFloat(value) < 0.001) && (parseFloat(value) > 0.0001)) {
                    return (parseFloat(value)).toFixed(4)
                }
                else if ((parseFloat(value) < 0.0001) && (parseFloat(value) > 0.00001)) {
                    return (parseFloat(value)).toFixed(8)
                }
                else if ((parseFloat(value) < 0.00001) && (parseFloat(value) > 0.000001)) {
                    return (parseFloat(value)).toFixed(9)
                }
                else if ((parseFloat(value) < 0.000001) && (parseFloat(value) > 0.0000001)) {
                    return ((parseFloat(value)).toFixed(10))
                }
                else if ((parseFloat(value) < 0.0000001) && (parseFloat(value) > 0.00000001)) {
                    return (parseFloat(value)).toFixed(11)
                }
                else if ((parseFloat(value) < 0.00000001) && (parseFloat(value) > 0.000000001)) {
                    return (parseFloat(value)).toFixed(12)
                }
                else if ((parseFloat(value) < 0.000000001) && (parseFloat(value) > 0.0000000001)) {
                    return (parseFloat(value)).toFixed(12)
                }
                else {
                    return ((parseFloat(value)).toFixed(13))
                }
            }
            else if (value < 0) {
                if (parseFloat(value) <= -0.1) {
                    return ((parseFloat(value)).toFixed(2))
                }
                else if ((parseFloat(value) > -0.1) && (parseFloat(value) <= -0.01)) {
                    return (parseFloat(value)).toFixed(3)
                }
                else if ((parseFloat(value) > -0.01) && (parseFloat(value) <= -0.001)) {
                    return (parseFloat(value)).toFixed(6)
                }
                else if ((parseFloat(value) > -0.001) && (parseFloat(value) <= -0.0001)) {
                    return (parseFloat(value)).toFixed(6)
                }
                else if ((parseFloat(value) > -0.0001) && (parseFloat(value) <= -0.00001)) {
                    return (parseFloat(value)).toFixed(6)
                }
                else if ((parseFloat(value) > -0.00001) && (parseFloat(value) <= -0.000001)) {
                    return (parseFloat(value)).toFixed(7)
                }
                else if ((parseFloat(value) > -0.000001) && (parseFloat(value) <= -0.0000001)) {
                    return (parseFloat(value)).toFixed(8)
                }
                else if ((parseFloat(value) > -0.0000001) && (parseFloat(value) <= -0.00000001)) {
                    return (parseFloat(value)).toFixed(9)
                }
                else {
                    return ((parseFloat(value)).toFixed(13))
                }
            }
        }
        else {
            return "-"
        }

    }
    catch (err) {
        console.error('Round off numeric value error', err)
        return false
    }
}

// Value separator
export const separator = (number) => {
    try {
        if (typeof number !== "number" && typeof number !== "string") {
            return number
        }

        let numStr = number.toString()
        let isNegative = false
        if (numStr.startsWith('-')) {
            isNegative = true
            numStr = numStr.slice(1);
        }

        let [integerPart, fractionalPart] = numStr.split(".")
        let reversedInt = integerPart.split("").reverse().join("")
        let result = ""
        for (let i = 0; i < reversedInt.length; i++) {
            if (i > 0 && i % 3 === 0) {
                result += ","
            }
            result += reversedInt[i]
        }
        result = result.split("").reverse().join("")
        if (fractionalPart) {
            result += "." + fractionalPart;
        }

        if (isNegative) {
            result = "-" + result;
        }

        return result

    }
    catch (err) {
        console.error('Value separator error', err)
        return false
    }
}

// Long date format
export function longDateFormat(start_date) {
    try {
        const dateObject = new Date(start_date);

        const dateOptions = {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
        };

        const formattedDate = new Intl.DateTimeFormat('en-US', dateOptions).format(dateObject);

        return `${formattedDate}`;

    }
    catch (err) {
        console.error('Long date format error', err)
        return false
    }
}

export const checkUserSubadminAccess = async ({ admin_row_id, admin_manager_type, sub_admin_type, user_row_id }) => {
    try {
        if (admin_manager_type != 1) {
            const check_user = await professionalsM.findOne({ _id: user_row_id }, { sub_admin_row_id: 1 })
            if (check_user) {
                if (sub_admin_type == 2 && admin_row_id != check_user.sub_admin_row_id) {
                    return { status: false, message: "You do not have permission to perform this action" }
                }
                else {
                    return { status: true }
                }
            }
            else {
                return { status: false, message: "Invalid User Row ID" }
            }
        }
        else {
            return { status: true }
        }

    }
    catch (err) {
        console.log('Check User subadmin access type.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

export const checkCompanySubadminAccess = async ({ admin_row_id, admin_manager_type, sub_admin_type, company_row_id }) => {
    try {
        if (admin_manager_type != 1) {
            const check_company = await companyM.findOne({ _id: company_row_id }, { sub_admin_row_id: 1 })
            if (check_company) {
                if (sub_admin_type == 2 && admin_row_id != check_company.sub_admin_row_id) {
                    return { status: false, message: "You do not have permission to perform this action" }
                }
                else {
                    return { status: true }
                }
            }
            else {
                return { status: false, message: "Invalid Company Row ID" }
            }
        }
        else {
            return { status: true }
        }

    }
    catch (err) {
        console.log('Check Company subadmin access type.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

export const insertEmailDetails = async ({ email_details, sg_message_id, attendee_row_id }) => {
    try {
        if (email_details) {
            for (let key of email_details.body.events) {
                const get_query = await email_eventsM.findOne({ sg_message_id: sg_message_id, event_type: key.event_name })
                if (!get_query) {
                    let insert_array = {
                        sg_message_id: sanitize(sg_message_id),
                        event_type: sanitize(key.event_name),
                        response: key.reason ? sanitize(key.reason) : "",
                        attendee_row_id: attendee_row_id,
                        date_n_time: sanitize(key.processed)
                    }
                    console.log(insert_array)
                    await email_eventsM(insert_array).save()
                }
            }
        }
    }
    catch (err) {
        console.log('Insert emails details error.', err.message)
        return { status: false, message: "An unexpected error occurred. Please try again later." }
    }
}

export const fetchAndStoreEmailDetails = async () => {
    try {
        const dt = startAndEndOfToday();
        const date_query = ` AND last_event_time BETWEEN TIMESTAMP "${dt.start_date}" AND TIMESTAMP "${dt.end_date}"`;
        const check_query = await axios.get(
            `${sendgrid_api_url}/v3/messages`,
            {
                params: {
                    limit: 1000,
                    query: `from_email="info@coinpedia.org"` + date_query,
                },
                headers: {
                    Authorization: `Bearer ${SENDGRID_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );
        if (check_query.data.messages?.length > 0) {
            for (let run of check_query.data.messages) {
                if (run.msg_id) {
                    let sg_message_id = run.msg_id.split(".")[0];
                    const check_attendee_query = await event_attendeesM.findOne({
                        sg_message_id: sg_message_id,
                    });
                    if (check_attendee_query) {
                        const single_query = await axios.get(
                            `${sendgrid_api_url}/v3/messages/${run.msg_id}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${SENDGRID_API_KEY}`,
                                    "Content-Type": "application/json",
                                },
                            }
                        );
                        if (single_query) {
                            await insertEmailDetails({
                                email_details: single_query,
                                sg_message_id: sg_message_id,
                                attendee_row_id: check_attendee_query._id,
                            });
                        }
                    }
                }
            }
        }
    } catch (err) {
        const msg = err?.response?.data || err.message;
        console.log("Fetch and Store emails details error.", msg);
        return {
            status: false,
            message: "An unexpected error occurred. Please try again later.",
        };
    }
};

export const uploadDocumentFunc = async function (fileBase64, type) {
    try {
        if (!fileBase64) {
            return { status: false, message: "No file provided" }
        }

        // Match base64 file string (handles PDF, DOCX, images, etc.)
        const matches = fileBase64.match(/^data:([A-Za-z0-9.+\/-]+);base64,(.+)$/)
        if (!matches) {
            return { status: false, message: "Invalid file format" }
        }

        const mimeType = matches[1]
        const buffer = Buffer.from(matches[2], "base64")

        // Generate unique file name
        const randomString = (randomstring.generate(10)).toLowerCase()
        const fileExt = mimeType.split("/")[1] || "bin"
        const fileName = Date.now() + randomString + "." + fileExt

        // Build S3 key path
        let keyPath = ""
        if (Number.parseInt(type) === 1) {
            // Resume
            keyPath = "app_uploads/resumes/" + fileName
        } else if (Number.parseInt(type) === 2) {
            // Certificate
            keyPath = "app_uploads/certificates/" + fileName
        }
        else if (Number.parseInt(type) === 3) {
            // Certificate
            keyPath = "app_uploads/meeting_documents/" + fileName
        } else {
            return { status: false, message: "Invalid type" }
        }

        // Upload to S3
        const params = {
            Bucket: process.env.DO_SPACES_NAME,
            Key: keyPath,
            Body: buffer,
            ACL: "public-read",
            ContentType: mimeType,
        };

        await s3.send(new PutObjectCommand(params));

        return { status: true, message: fileName, mimeType: mimeType, path: keyPath }
    }
    catch (err) {
        console.error("Upload resume/certificate error", err)
        return { status: false, message: "Upload failed" }
    }
}
export function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
    if (
        !lat1 || !lon1 || !lat2 || !lon2 ||
        Number.isNaN(lat1) || Number.isNaN(lon1) || Number.isNaN(lat2) || Number.isNaN(lon2)
    ) {
        return null;
    }

    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
}

export const removeHtmltag = (value) => {
    if (!value) return "";
    return value
        .replace(/<br\s*\/?>/gi, "\n")      // convert <br> to newline (optional)
        .replace(/<[^>]+>/g, " ")           // remove HTML tags
        .replace(/&nbsp;/gi, " ")           // remove &nbsp;
        .replace(/\s+/g, " ")               // collapse extra spaces
        .trim();                            // trim start/end
};


// async function generateMetaDescription(entity, module) {
//     // entity = { full_name, user_bio } or { company_name, about_company } or { event_title, event_description }

//     const cleanBio = removeHtmltag(entity.description);

//     const prompt = `
// Generate an SEO-friendly meta description for a ${module} profile:

// Name/Title: ${entity.name}
// Description: ${cleanBio}

// Rules:
// - Maximum 150 characters (hard limit)
// - Professional and neutral tone
// - Must include the ${module}'s name at least once
// - Should be readable and suitable for search engine snippets.
//     `;

//     try {
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [{ role: "user", content: prompt }],
//         });

//         return response.choices[0].message.content.trim();
//     } catch (err) {
//         console.error("OpenAI Error:", err);
//         return `${entity.name} - Coinpedia ${module} Profile`;
//     }
// }