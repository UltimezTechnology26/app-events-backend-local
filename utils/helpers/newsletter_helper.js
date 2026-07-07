require('dotenv').config()
const axios = require('axios')
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const MARKET_API_BASE_URL = process.env.MARKET_API_BASE_URL
const MARKET_API_KEY = process.env.MARKET_API_KEY
const MAIN_CP_API_KEY = process.env.MAIN_CP_API_KEY
const MAIN_CP_API_BASE_URL = process.env.MAIN_CP_API_BASE_URL

dayjs.extend(utc);
dayjs.extend(timezone);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const cryto_tokensM = require('../../models/markets/tokensM')
const { weeklyNewsletterEmail, dailyNewsletterEmail } = require('../../config/email')
const { convertToShortValue, roundNumericValue, addDaysToPresentDate, getPresentDateOnly, getPresentDateTime } = require('./helper')
const subscribe_categoryM = require('../../models/app/newsletter/subscribe_categoryM')
const email_newslettersM = require('../../models/app/newsletter/email_newslettersM')
const email_newsletters_sent_usersM = require('../../models/app/newsletter/email_newsletters_sent_usersM')
const email_newsletters_sent_reportsM = require('../../models/app/newsletter/email_newsletters_sent_reportsM')

export const sendEmailsForPricePrediction = async () => {
    try {
        console.log("Cron Job Called - > newsletter cron job started")
        const today_date = getPresentDateOnly()
        // {
        //     $match:{
        //         _id:19
        //     }
        // },
        const get_email_newsletter_query = await email_newslettersM.aggregate([
            { $sort: { _id: 1 } },
            {
                $lookup:
                {
                    from: "cln_static_news_notifications_categories",
                    localField: "category_row_id",
                    foreignField: "_id",
                    as: "info_category",
                    pipeline: [
                        {
                            $project:
                            {
                                _id: 1,
                                news_cp_category_row_id: 1,
                                category_name: 1
                            }
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_category", preserveNullAndEmptyArrays: true } },
            {
                $lookup:
                {
                    from: "cln_subscribe_to_categories",
                    localField: "category_row_id",
                    foreignField: "category_row_id",
                    as: "info_subscribe_users",
                    pipeline: [
                        {
                            $lookup:
                            {
                                from: "cln_professionals",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "info_users",
                                pipeline: [
                                    {
                                        $match: {
                                            login_status: 1,
                                            email_id: { $exists: true, $ne: "" }
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
                        { $unwind: { path: "$info_users" } },
                        {
                            $match: {
                                subscribe_status: 1
                            }
                        },
                        {
                            $count: "count"
                        }
                    ]
                }
            },
            { $unwind: { path: "$info_subscribe_users", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    total_subscribers: "$info_subscribe_users.count"
                }
            },
            {
                $match: {
                    active_status: 1,
                    category_row_id: 1,
                    total_subscribers: { $gte: 1 }
                }
            },
            {
                $project: {
                    _id: 1,
                    category_row_id: 1,
                    notification_type: 1,
                    day_number: 1,
                    category_name: "$info_category.category_name",
                    title: 1,
                    active_status: 1,
                    total_subscribers: "$info_subscribe_users.count",
                    news_cp_category_row_id: "$info_category.news_cp_category_row_id"
                }
            }
        ]).limit(3)


        if (get_email_newsletter_query[0]) {


            const news_cp_category_row_id = get_email_newsletter_query[0].news_cp_category_row_id
            const get_articles_data = await articlesList({ news_cp_category_row_id })
            const article_list = get_articles_data.message

            console.log("get_email_newsletter_query", get_email_newsletter_query)

            for (let newsletter_item of get_email_newsletter_query) {
                if (newsletter_item.news_cp_category_row_id) {
                    // console.log("newsletter data fetched", newsletter_item.notification_type)

                    // notification_type - > 1: daily, 2:weekly, 3:monthly
                    const email_newsletter_row_id = newsletter_item._id
                    const notification_type = newsletter_item.notification_type
                    const day_number = newsletter_item.day_number
                    const title = newsletter_item.title

                    const check_in_report_query = await email_newsletters_sent_reportsM.findOne({ newsletter_row_id: email_newsletter_row_id, created_on: { $gte: new Date(today_date) } })
                    if (!check_in_report_query) {
                        let send_email_status = false
                        if (notification_type === 1) {
                            send_email_status = true
                        }
                        else if (notification_type === 2) {
                            let now = new Date();
                            let day = now.getDay()
                            let today_day_number = day + 1
                            if (day_number === today_day_number) {
                                send_email_status = true
                            }
                        }
                        else if (notification_type === 3) {

                            const cp_today_time_string = dayjs(today_date).valueOf();

                            // current date in Africa/Bamako
                            const nowInBamako = dayjs().tz("Africa/Bamako");

                            // zero-pad day number
                            let new_day_number = day_number;
                            if (new_day_number < 10) {
                                new_day_number = "0" + day_number;
                            }

                            // build preferred date (YYYY-MM-DD) in Bamako timezone
                            const preferred_date = `${nowInBamako.format("YYYY-MM")}-${new_day_number}`;
                            const cp_preferred_time_string = dayjs(preferred_date).valueOf();

                            if (cp_today_time_string === cp_preferred_time_string) {
                                send_email_status = true;
                            }
                        }

                        //console.log("send_email_status", send_email_status)

                        if (send_email_status) {
                            const gainer_list = await gainersList({ notification_type })
                            const loser_list = await losersList({ notification_type })
                            const users_list = await getUsersList({ email_newsletter_row_id })

                            let article_content = ''
                            if (article_list.length) {
                                for (let item of article_list) {
                                    article_content += `<tr style="vertical-align: top;">
                                        <td>
                                        <img style="width: 175px; border-radius: 10px;margin-right: 15px;" src="${item.article_image}" />
                                        </td>
                                        <td>
                                            <h3 style="color: #13002D; font-size: 18px; margin-top: 2px; margin-bottom: 0;">${item.article_title}</h3>
                                            <p style="margin-top: 10px; margin-bottom: 20px;"><a href="${item.article_link}" style="color:rgba(0, 102, 255, 1);text-decoration: none;font-weight: 600">Read Articles</a></p>
                                        </td>
                                    </tr>
                                    `
                                }
                            }

                            let gainer_content = ''
                            if (gainer_list.length) {
                                for (let item of gainer_list) {
                                    let percent_change = item.percent_change_24h
                                    if (notification_type === 2) {
                                        percent_change = item.percent_change_7d
                                    }

                                    gainer_content += `<li style="background: #f2f7ff; width: 27%; padding: 15px; border-radius: 10px; list-style: none; display: inline-block; text-align: left; margin: 0 1.5% 1.5% 0; ">
                                    <h4 style="padding: 0; margin: 5px 0 0 0;">${item.token_name} / <span style="color: rgba(23, 23, 23, 0.7); font-weight: 500;">${item.symbol}</span></h4>
                                    <h5 style="margin: 0; font-size: 16px; font-weight: 500;">$${roundNumericValue(item.price)} 
                                    ${percent_change >= 0 ?
                                            `<span style="color: rgba(22, 199, 132, 1); float: right; font-weight: 700;">
                                            <img src="https://image.coinpedia.org/app_uploads/emails/gain.png" style="width: 16px; vertical-align: text-top;" /> ${(percent_change).toFixed(2)}%
                                        </span>
                                        `
                                            :
                                            `
                                        <span style="color: rgba(224, 36, 61, 1); float: right; font-weight: 700;">
                                        <img src="https://image.coinpedia.org/app_uploads/emails/lose.png" style="width: 16px; vertical-align: text-top;" /> ${(percent_change).toFixed(2)}%
                                        </span>
                                        `
                                        } 
                                    </h5>
                                </li>
                                `
                                }
                            }


                            let loser_content = ''
                            if (loser_list.length) {
                                for (let item of loser_list) {
                                    let percent_change = item.percent_change_24h
                                    if (notification_type === 2) {
                                        percent_change = item.percent_change_7d
                                    }

                                    loser_content += `<li style="background: #f2f7ff; width: 27%; padding: 15px; border-radius: 10px; list-style: none; display: inline-block; text-align: left; margin: 0 1.5% 1.5% 0; ">
                                    <h4 style="padding: 0; margin: 5px 0 0 0;">${item.token_name} / <span style="color: rgba(23, 23, 23, 0.7); font-weight: 500;">${item.symbol}</span></h4>
                                    <h5 style="margin: 0; font-size: 16px; font-weight: 500;">$${roundNumericValue(item.price)} 
                                    ${percent_change >= 0 ?
                                            `<span style="color: rgba(22, 199, 132, 1); float: right; font-weight: 700;">
                                            <img src="https://image.coinpedia.org/app_uploads/emails/gain.png" style="width: 16px; vertical-align: text-top;" /> ${(percent_change).toFixed(2)}%
                                        </span>
                                        `
                                            :
                                            `
                                        <span style="color: rgba(224, 36, 61, 1); float: right; font-weight: 700;">
                                        <img src="https://image.coinpedia.org/app_uploads/emails/lose.png" style="width: 16px; vertical-align: text-top;" /> ${(percent_change).toFixed(2)}%
                                        </span>
                                        `
                                        } 
                                    </h5>
                                </li>
                                `
                                }
                            }



                            //const email_ids = await array_column(users_list, 'email_id')
                            let notification_type_name = "Daily"
                            let pass_message = ''
                            let head_content = ''
                            if (notification_type === 2) {
                                notification_type_name = "Weekly"
                                head_content = "Welcome to your Weekly Crypto Market Overview! Dive into Breaking crypto news, DeFi, NFTs, Memecoins, and more. Catch up on on-chain action, top gainers and losers, stablecoins, ETFs, and the latest exchange trends. Stay ahead and be connected with the crypto world!"
                                pass_message = `
                                        <p>${head_content}</p>
                                        <p style="margin-top: 50px; font-size: 22px;"><b>Top 5 Articles List </b> <a href="https://coinpedia.org/price-prediction/" style="float: right; color:#1867fa; font-size: 16px;text-decoration: none;">View More <img src="https://image.coinpedia.org/app_uploads/emails/arrow-blue.png" /></a></p>
                                        <table>
                                            ${article_content}
                                        </table>
        
                                        <p style="margin-top: 50px; font-size: 22px;"><b>Top Gainers For This ${notification_type_name}</b> <a href="https://markets.coinpedia.org/gainers/" style="float: right; color:#1867fa; font-size: 16px;text-decoration: none;">View More <img src="https://image.coinpedia.org/app_uploads/emails/arrow-blue.png" /></a></p>
                                        <ul style="padding-left: 0; text-align: center;">
                                            ${gainer_content}
                                        </ul>
        
        
                                        <p style="margin-top: 50px; font-size: 22px;"><b>Top Losers For This  ${notification_type_name}</b> <a href="https://markets.coinpedia.org/losers/" style="float: right; color:#1867fa;; font-size: 16px;text-decoration: none;">View More <img src="https://image.coinpedia.org/app_uploads/emails/arrow-blue.png" /></a></p>
                                        <ul style="padding-left: 0; text-align: center;">
                                            ${loser_content}
                                        </ul>
                                    `
                            }
                            else if (notification_type === 3) {
                                notification_type_name = "Monthly"
                                head_content = "Welcome to your Monthly Crypto Market Overview! Kickstart the month with the latest market performance, top crypto news, and key insights. Dive into on-chain activities, top gainers and losers, stablecoin trends, ETF analysis, DeFi developments, NFT market insights, recent funding rounds, and hacks. Gear up for an exciting month in the crypto world!"
                                pass_message = `
                                        <p>${head_content}</p>
                                        <p style="margin-top: 50px; font-size: 22px;"><b>Top 5 Articles List </b> <a href="https://coinpedia.org/price-prediction/" style="float: right; color:#1867fa; font-size: 16px;text-decoration: none;">View More <img src="https://image.coinpedia.org/app_uploads/emails/arrow-blue.png" /></a></p>
                                        <table>
                                            ${article_content}
                                        </table>
        
                                        <p style="margin-top: 50px; font-size: 22px;"><b>Top Gainers For This ${notification_type_name}</b> <a href="https://markets.coinpedia.org/gainers-and-losers/" style="float: right; color:#1867fa; font-size: 16px;text-decoration: none;">View More <img src="https://image.coinpedia.org/app_uploads/emails/arrow-blue.png" /></a></p>
                                        <ul style="padding-left: 0; text-align: center;">
                                            ${gainer_content}
                                        </ul>
        
        
                                        <p style="margin-top: 50px; font-size: 22px;"><b>Top Losers For This  ${notification_type_name}</b> <a href="https://markets.coinpedia.org/gainers-and-losers/" style="float: right; color:#1867fa;; font-size: 16px;text-decoration: none;">View More <img src="https://image.coinpedia.org/app_uploads/emails/arrow-blue.png" /></a></p>
                                        <ul style="padding-left: 0; text-align: center;">
                                            ${loser_content}
                                        </ul>
                                    `
                            }
                            else {
                                const daily_news = await dailyNewsLetter(1)
                                pass_message = `
                                        <div>
                                        ${daily_news.news_content}
                                        ${daily_news.global_market_overview_content}
                                        ${daily_news.tokens_content}
                                        ${daily_news.gainers_losers_content}
                                        ${daily_news.categories_content}
                                        ${daily_news.analysis_content}
                                        ${daily_news.price_pridiction_content}
                                        </div>
                                    `

                            }


                            const pass_subject = title


                            if (users_list[0]) {
                                const date_n_time = getPresentDateTime()
                                const report_insert_query = await email_newsletters_sent_reportsM({
                                    newsletter_row_id: email_newsletter_row_id,
                                    created_on: date_n_time
                                }).save()
                                const sent_report_row_id = report_insert_query._id

                                console.log(users_list[0])

                                await sendNewslettersEmails({
                                    data: users_list,
                                    run_time: 0,
                                    interval_length: users_list.length,
                                    pass_subject,
                                    pass_message,
                                    newsletter_title: title,
                                    sent_report_row_id,
                                    notification_type
                                })
                                //return sent_report_row_id
                            }

                        }
                    }
                }
            }

        }

        return { status: false, message: { alert_message: "Sorry, Something went wrong. ", get_email_newsletter_query } }
    }
    catch (err) {
        return { status: false, message: err.message }
    }
}

export const sendNewslettersEmails = async ({ data, run_time, interval_length, pass_subject, pass_message, sent_report_row_id, newsletter_title, notification_type }) => {
    if (run_time >= interval_length) {
        console.log("Congrats! The sending newsletters emails job completed.")
    }
    else {
        if (data[run_time]) {
            let pass_message_with_name = `<p style="margin-top: 55px;">Hello ${data[run_time].full_name},</p>`

            const email_message = pass_message_with_name + pass_message
            const email_id = data[run_time].email_id

            if (notification_type === 2 || notification_type === 3) {

                await weeklyNewsletterEmail(email_id, pass_subject, email_message, newsletter_title)

            }
            else {
                await dailyNewsletterEmail(email_id, pass_subject, pass_message, newsletter_title);
            }

            await email_newsletters_sent_usersM({
                user_row_id: data[run_time].user_row_id,
                sent_report_row_id: sent_report_row_id
            }).save()
        }

        setTimeout(() => sendNewslettersEmails({ data, run_time: (run_time + 1), interval_length, pass_subject, pass_message, sent_report_row_id, newsletter_title, notification_type }), 2000)
    }
}

function getImageName(image_name) {
    const svg_image = image_name
    const only_image_name = svg_image.replace(/\.[^/.]+$/, '');

    return only_image_name

}

function truncateString(title) {
    if (title.length > 70) {
        title = title.substring(0, 70) + '...'
    }

    return title
}
function formatNumber(num) {
    if (num === 0) return '0.00';
    if (num < 0.01 && num > -0.01) {
        return num.toExponential(2)
    }
    return num.toFixed(2)
}

export const dailyNewsLetter = async (date_type) => {

    const get_response = await axios.get(
        `${MARKET_API_BASE_URL}app/newsletters/overview`,
        {
            params: {
                date_type: date_type,
            },
            headers: {
                api_key: MARKET_API_KEY,
                "Content-Type": "application/json",
            },
        }
    );
    if (get_response) {
        const responseArray = [];
        const response_data = {
            statusCode: get_response.status,
            body: get_response.data,
        };
        if (parseInt(response_data.statusCode) === 200) {
            const new_object = await Promise.resolve({
                top_tokens: response_data.body.message.top_tokens,
                categories: response_data.body.message.categories,
                top_gainers: response_data.body.message.top_gainers,
                top_losers: response_data.body.message.top_losers,
                total_change_24h: response_data.body.message.total_change_24h,
                total_marketcap: response_data.body.message.total_marketcap,
                total_volume_24h: response_data.body.message.total_volume_24h,
                bitcoin_dominance: response_data.body.message.bitcoin_dominance,
                bitcoin_dominance_percentage: response_data.body.message.bitcoin_dominance_percentage,
            })

            responseArray.push(new_object)

            const total_marketcap = await convertToShortValue(responseArray[0].total_marketcap)
            const total_volume_24h = await convertToShortValue(responseArray[0].total_volume_24h)

            const get_news_data = await articlesList({ news_cp_category_row_id: 6, per_page: 5 })
            const get_analysis_data = await articlesList({ news_cp_category_row_id: 34116, per_page: 5 })
            const get_price_prediction_data = await articlesList({ news_cp_category_row_id: 34126, per_page: 2 })
            const trending_news_list = get_news_data.message
            let news_content = ''
            if (trending_news_list.length) {
                let news_list = ''
                for (let item of trending_news_list) {
                    news_list += `
                        <li style="margin-left: 0;font-size: 30px;font-weight: 400;line-height: 24px;color: #0066FF; border-bottom: 1px solid #0066FF4D; padding: 12px 0;"><span style="color: #171717 !important;font-size: 16px !important;vertical-align: bottom;"><a href="${item.article_link}" style="color:#000; text-decoration:none;">${item.article_title}</a></span></li>
                        `
                }
                news_content = `
                       <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;dispaly:block;">
                      <div style="background: #f3fcf8; padding: 25px; border-radius: 10px;border: 1px solid #16C5824D;margin-top:20px">
                          <h4 style="font-size: 20px; margin: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/market_updates.png" style="vertical-align: sub; margin-right: 5px;" /> Market Updates For Today</h4>
                          <h6 style="color: rgba(23, 23, 23, 0.7); font-size: 16px;margin: 15px 0 0;font-weight: 400;">Today, the
                              crypto market is ${responseArray[0].total_change_24h > 0 ? `<span style="color:rgba(22, 197, 130, 1);">Bullish</span>` : `<span style="color:rgba(224, 36, 61, 1);">Bearish</span>`} with market cap of $${total_marketcap} with ${responseArray[0].total_change_24h}% in 24 hrs</h6>
                      </div>
                    </div>
                    `
            }

            // <div
            //           style="background: #fff;margin-top: 20px; padding: 15px; border: 1px solid #0066FF4D; border-radius: 16px; padding: 25px; border-radius: 16px;">
            //           <h2 style="font-size: 20px; margin: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/news.png"
            //                   style="vertical-align: middle; margin-right: 5px;" /> Top 5 Trending News </h2>
            //           <ul style="padding-left: 30px;margin-top: 8px;">
            //           ${news_list}
            //           </ul>
            //           <div>
            //             <a href="https://coinpedia.org/news/" style="text-decoration: none; display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
            //                 font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">View All Trending News <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/></a>
            //           </div>


            //       </div>

            let analysis_content = ''
            const analysis_list = get_analysis_data.message
            if (analysis_list.length) {
                let analysis_data = ''
                for (let item of analysis_list) {
                    analysis_data += `
                         <li style="margin-left: 0;font-size: 30px;font-weight: 400;line-height: 24px;color: #0066FF; border-bottom: 1px solid #0066FF4D; padding: 12px 0;"><span style="color: #171717 !important;font-size: 16px !important;vertical-align: bottom;"><a href="${item.article_link}" style="color:#000; text-decoration:none;">${item.article_title}</a></span></li>
                    `
                }
                analysis_content = `
                    <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;dispaly:block;">
                     <div style="background: #fff;margin-top: 20px; padding: 15px; border: 1px solid #0066FF4D; border-radius: 16px; padding: 25px; border-radius: 16px;">
                    <h2 style="font-size: 20px; margin: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/graph.png"
                        style="vertical-align: middle; margin-right: 5px;" /> Price Analysis by Experts </h2>
                    <ul style="padding-left: 30px;">
                    ${analysis_data}
                    </ul>
                     <div>
                     <a href="https://coinpedia.org/price-analysis/" style="text-decoration: none; display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                        font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">View All Price Analysis <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/></a>
                    
                         </div>
                      </div>
                    </div>
                    `
            }

            let price_pridiction_content = ''
            const price_prediction_list = get_price_prediction_data.message
            if (price_prediction_list.length) {

                price_pridiction_content = `
                    <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;dispaly:block;">
                    <div style="background: #fff;margin-top: 20px; padding: 15px; border: 1px solid #0066FF4D; border-radius: 16px; padding: 25px; border-radius: 16px;">
                    <h2 style="font-size: 20px; margin: 0px 0 10px;"><img src="https://image.coinpedia.org/app_uploads/emails/price-prediction.png"
                    style="vertical-align: middle; margin-right: 5px;" /> Price Prediction by Experts </h2>
                    <div style="display: flex;" class="displayBlock">
                        <div style="width: 50%;margin-right: 7px;" class="price-crypto-block price-prediction-block">
                            <div style="border: 1px solid #0066FF4D;border-radius: 20px;">
                                <div style="padding: 20px;">
                                    <img src=${price_prediction_list[0].article_image} alt="price predicction" style="width: 100%;margin: 14px 0;"/>
                                    <ul style="padding-left:1px;margin: 0 0 6px;">
                                        <li style="display: inline-block;font-size: 14px; color: #0066FFB2; font-weight: 500; line-height: 18px;border-right: 1px solid #17171780;
                                        padding-right: 10px;margin-left: 0px;"><a href="${price_prediction_list[0].author_profile_link}" style="color: #0066FFB2; text-decoration: none;">${price_prediction_list[0].author_name}</a></li>
                                        <li style="display: inline-block;font-size: 14px; color: #17171780;; font-weight: 500; line-height: 18px;">${price_prediction_list[0].article_date}</li>
            
                                    </ul>
                                    <p style="margin-top: 4px;font-weight: 400; color: #171717;
                                    font-size: 15px; line-height: 23px;">${truncateString(price_prediction_list[0].article_title)}</p>
                               <div>
                                <a href=${price_prediction_list[0].article_link} style="text-decoration: none; display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                                font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">Read Prediction </a>
                    
                               </div>
                            
                            </div>
            
                            </div>
                            
                        </div>
            
                        <div style="width: 50%;margin-left: 7px;" class="price-crypto-block price-prediction-block">
                            <div style="border: 1px solid #0066FF4D;border-radius: 20px;">
                                <div style="padding: 20px;">
                                    
                                    <img src=${price_prediction_list[1].article_image} alt="price predicction" style="width: 100%;margin: 14px 0;"/>
                                    <ul style="padding-left:1px;margin: 0 0 6px;">
                                        <li style="display: inline-block;font-size: 14px; color: #0066FFB2; font-weight: 500; line-height: 18px;border-right: 1px solid #17171780;
                                         padding-right: 10px;margin-left: 0px;"><a href="${price_prediction_list[1].author_profile_link}" style="color: #0066FFB2; text-decoration: none;">${price_prediction_list[1].author_name}</a></li>
                                        <li style="display: inline-block;font-size: 14px; color: #17171780;; font-weight: 500; line-height: 18px;">${price_prediction_list[1].article_date}</li>
            
                                    </ul>
                                    <p style="margin-top: 4px;font-weight: 400; color: #171717;
                                    font-size: 15px; line-height: 23px;">${truncateString(price_prediction_list[1].article_title)}</p>
                               <div>
                                 <a href=${price_prediction_list[1].article_link} style="text-decoration: none; display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                                font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">Read Prediction </a>
                    
                               </div>
                            </div>
                            </div>
                        </div>
                    </div>
                     <a href="https://coinpedia.org/price-prediction/" style="text-decoration: none; display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                        font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">View all Price Prediction  <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/></a>
                    </div>
                    </div>
                    `
            }

            let tokens_content = ''
            if (responseArray[0].top_tokens) {

                let tokens_table = ""
                for (let item of responseArray[0].top_tokens) {
                    let marketcap = await convertToShortValue(item.marketcap)
                    let image = 'default'
                    if (item.token_image) {
                        image = item.token_image
                    }

                    tokens_table += `<tr>
                            <td style="padding: 22px 0 10px; font-weight: 500;font-size: 16px; line-height: 16px;color: rgba(23, 23, 23, 1);">
                            <img onerror="this.onerror=null;this.src='https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/default.webp';" src="https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/${image}" alt="crypto" style="vertical-align: middle;margin-right: 6px;width: 30px;border-radius: 50px;"/><a href="https://markets.coinpedia.org/${item.token_id}" style="color: rgba(23, 23, 23, 1);text-decoration:none;">${item.token_name} / <span style="font-weight: 400;color: rgba(23, 23, 23, 0.7);"> ${item.symbol}</span></a></td>
                            <td style="font-weight: 500;color: rgba(23, 23, 23, 1);font-size: 16px;">$${marketcap}</td>
                            <td style="font-weight: 500;color: rgba(23, 23, 23, 1);font-size: 16px;"> $${(item.price).toFixed(2)}</td>
                        </tr>`
                }


                tokens_content = `
                    <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;dispaly:block;">
                    <div style="border: 1px solid rgba(0, 102, 255, 0.3);border-radius: 16px;background: #fff;padding: 24px;margin-top: 20px;"> 
                    <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/top-5-crypto.png" alt="global-crypto" style="vertical-align: bottom; margin-right: 6px;"/> Top 5 Crypto By Market cap</h2>
                    <div style="overflow-x:auto;">
                        <table style="border-collapse: collapse;width: 100% !important;white-space: nowrap;overflow: auto;">
                        <thead>
                            <tr style="border-top: 1px solid rgba(0, 102, 255, 0.3);border-bottom: 1px solid rgba(0, 102, 255, 0.3);">
                                <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Name</th>
                                <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px 0;text-align: left;">Market Cap</th>
                                <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${tokens_table}
                        </tbody>
                    </table>
                    </div>
                     
                    <a href="https://markets.coinpedia.org/" style="text-decoration: none;color: rgba(0, 102, 255, 1);">
                        <div style="display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px; font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">
                            View All Crypto   <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/>
                        </div>
                    </a>
                         
                       
                    </div>
                    </div>
                    `
            }

            let gainers_losers_content = ''
            let gainer_content = ''
            let loser_content = ''

            if (responseArray[0].top_gainers) {
                for (let item of responseArray[0].top_gainers) {
                    let image = 'default'
                    if (item.token_image) {
                        image = item.token_image

                    }
                    let price = await formatNumber(item.price)

                    gainer_content += `
                            <tr>
                            <td style="padding: 15px 0 10px; font-weight: 500;font-size: 14px; line-height: 16px;color: rgba(23, 23, 23, 1);">
                            <img onerror="this.onerror=null;this.src='https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/default.webp';" src="https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/${image}" alt="crypto" style="vertical-align: middle;margin-right: 6px;width: 30px;border-radius: 50px;"/>
                                <a href="https://markets.coinpedia.org/${item.token_id}" style="color: rgba(23, 23, 23, 1);text-decoration:none;">${item.token_name}</a></td>
                            <td style="padding: 15px 0 10px;font-weight: 700;color: rgba(23, 23, 23, 1);  font-size: 16px; text-align: right; padding-right: 12px;"> $${price}</td>
                            <td style="padding: 15px 0 10px;font-weight: 500;color: rgba(22, 199, 132, 1);font-size: 14px;"> <img src="https://image.coinpedia.org/app_uploads/emails/green-drop-down.png"  width="13" alt="dropdown" style="margin-right:5px;"/>${(date_type === 2 ? item.percent_change_7d : item.percent_change_24h).toFixed(2)}% </td>
                        </tr>
                            `
                }
            }

            if (responseArray[0].top_losers) {
                for (let item of responseArray[0].top_losers) {
                    let image = 'default'
                    if (item.token_image) {
                        image = item.token_image

                    }
                    let price = await formatNumber(item.price)
                    loser_content += `
                            <tr>
                            <td style="padding: 15px 0 10px; font-weight: 500;font-size: 14px; line-height: 16px;color: rgba(23, 23, 23, 1);">
                                <img onerror="this.onerror=null;this.src='https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/default.webp';" src="https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/${image}" alt="crypto" style="vertical-align: middle;margin-right: 6px;width: 30px;border-radius: 50px;"/>
                                <a href="https://markets.coinpedia.org/${item.token_id}" style="color: rgba(23, 23, 23, 1);text-decoration:none;">${item.token_name}</a>
                            </td>
                            <td style="padding: 15px 0 10px;font-weight: 700;color: rgba(23, 23, 23, 1);  font-size: 16px; text-align: right; padding-right: 12px;">$${price}</td>
                            <td style="padding: 15px 0 10px;font-weight: 500;color:rgba(224, 36, 61, 1);;font-size: 14px;"> <img src="https://image.coinpedia.org/app_uploads/emails/red-drop-down.png"  width="13" alt="dropdown" style="margin-right:4px;" /> ${(date_type === 2 ? item.percent_change_7d : item.percent_change_24h).toFixed(2)}%  </td>
                        </tr>
                            `
                }
            }


            if (responseArray[0].top_gainers || responseArray[0].top_losers) {
                gainers_losers_content = `
                        <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;">
                        <div style="display: flex;margin-top: 24px;" class="hide-in-mobileview">
                        <div style="width: 50%;margin-right: 10px;" class="crypto-block">
                        <div style="border: 1px solid rgba(22, 197, 130, 0.5);background: linear-gradient(0deg, #FFFFFF, #FFFFFF),
                            linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(22, 197, 130, 0.05) 100%);
                             border-radius: 16px;padding: 24px;">
                                <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/top-gainer.png" alt="global-crypto" style="vertical-align: bottom;
                                    margin-right: 6px;"/> Top Gainers</h2>
                                <div style="overflow-x:auto;">
                                    <table style="border-collapse: collapse;width: 100% !important;white-space: nowrap;overflow: auto;">
                                        <thead>
                                        <tr style="border-top: 1px solid rgba(0, 102, 255, 0.3);border-bottom: 1px solid rgba(0, 102, 255, 0.3);">
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Name</th>
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px 0;">Price</th>
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">%Up</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        ${gainer_content}
                                        </tbody>
                                    </table>
                                 </div>
                              <a href="https://markets.coinpedia.org/gainers/" style="text-decoration: none; ">
                            <div style="display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                            font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">  View All Gainers
                            <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/>              
                            </div>
                            </a>
                            </div>
                        </div>
                        <div style="width: 50%;margin-right: 0px;" class="crypto-block">
                            <div style="border: 1px solid rgba(224, 36, 61, 0.3);;background: linear-gradient(0deg, #FFFFFF, #FFFFFF),
                            linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(224, 36, 61, 0.05) 100%);
                             border-radius: 16px;padding: 24px;">
                                <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/top-looser.png" alt="global-crypto" style="vertical-align: bottom;
                                    margin-right: 6px;"/> Top Looser</h2>
                                 <div style="overflow-x:auto;">
                                <table style="border-collapse: collapse;width: 100% !important;white-space: nowrap;overflow: auto;">
                                    <thead>
                                    <tr style="border-top: 1px solid rgba(0, 102, 255, 0.3);border-bottom: 1px solid rgba(0, 102, 255, 0.3);">
                                        <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Name</th>
                                        <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px 0;">Price</th>
                                        <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">%Down</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    ${loser_content}
                                    </tbody>
                                </table>
                            </div>
                            <div>
                            <a href="https://markets.coinpedia.org/losers/" style="text-decoration: none;color: rgba(0, 102, 255, 1);">
                            <div style="display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                            font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">View All Losers<img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/>
                            </a>
                            </div>
                            </div>
                        </div>
                        </div>


                           <div class="hide-in-desktop" style="display: none;">
                            <div style="margin-top: 20px;border: 1px solid rgba(22, 197, 130, 0.5);background: linear-gradient(0deg, #FFFFFF, #FFFFFF),
                                linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(22, 197, 130, 0.05) 100%);
                                border-radius: 16px;padding: 24px;">
                                    <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/top-gainer.png" alt="global-crypto" style="vertical-align: bottom;
                                        margin-right: 6px;"/> Top Gainers</h2>
                                    <div style="overflow-x:auto;">
                                    <table style="border-collapse: collapse;width: 100%;white-space: nowrap;overflow: auto;">
                                        <thead>
                                        <tr style="border-top: 1px solid rgba(0, 102, 255, 0.3);border-bottom: 1px solid rgba(0, 102, 255, 0.3);">
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Name</th>
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px 0;">Price</th>
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">%Up</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        ${gainer_content}
                                        </tbody>
                                    </table>
                                </div>
                                <a href="https://markets.coinpedia.org/gainers/">
                                    <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;width: 100%;
                                    font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View All Gainers <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/></button>
                                </a>
                                    </div>
                                    <div style="margin-top:20px;border: 1px solid rgba(224, 36, 61, 0.3);background: linear-gradient(0deg, #FFFFFF, #FFFFFF),
                                linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(224, 36, 61, 0.05) 100%);
                                border-radius: 16px;padding: 24px;">
                                    <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/top-looser.png" alt="global-crypto" style="vertical-align: bottom;
                                        margin-right: 6px;"/> Top Looser</h2>
                                    <div style="overflow-x:auto;">
                                    <table style="border-collapse: collapse;width: 100%;white-space: nowrap;overflow: auto;">
                                        <thead>
                                        <tr style="border-top: 1px solid rgba(0, 102, 255, 0.3);border-bottom: 1px solid rgba(0, 102, 255, 0.3);">
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Name</th>
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px 0;">Price</th>
                                            <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">%Down</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                            ${loser_content}
                                
                                        </tbody>
                                    </table>
                                </div>
                                <a href="https://markets.coinpedia.org/losers/">
                                    <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: 100%;
                                    font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View All Losers <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/></button>
                                </a>
                                </div>
                        </div>
                        </div>
                        `
            }
            let global_market_overview_content = ''
            if (responseArray[0].total_marketcap && responseArray[0].bitcoin_dominance) {

                // `<p>Total market cap today is ${total_marketcap} with ${responseArray[0].total_change_24h}</p>
                // <p>Bitcoin Dominance : ${responseArray[0].bitcoin_dominance} and Bitcoin Dominance Percentage:${(responseArray[0].bitcoin_dominance_percentage).toFixed(2)}%</p>
                // `
                global_market_overview_content = ` 
                    <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;">
                    <div style="border: 1px solid rgba(0, 102, 255, 0.3);border-radius: 16px;background: #fff;padding: 24px;margin-top:20px;">
                    <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/global-crypto.png" alt="global-crypto" style="vertical-align: bottom;
                        margin-right: 6px;"/> Global Crypto Market Overview</h2>
        
                        <div style="display: flex;" class="displayBlock">
                            <div style="width: 33.33%;" class="crypto-block">
                                <div style="background: linear-gradient(180deg, rgba(245, 167, 156, 0) 0%, rgba(245, 167, 156, 0.1) 100%);border: 1px solid rgba(245, 167, 156, 0.3);
                                border-radius: 8px; padding: 10px; margin-right: 8px;">
                                    <h3 style="color: #171717B2;font-size: 14px;font-weight: 400; line-height: 18px; margin: 0;">Global Market Cap</h3> 
                                    <h4 style="font-size: 24px;font-weight: 600; line-height: 1; margin: 14px 0 0;">$${total_marketcap} ${responseArray[0].total_change_24h > 0 ?
                        `<span class="floatRight" style="margin-left: 10px;color: #16C582;font-size: 14px;font-weight: 600;line-height: 18px;margin-right:4px;"><img src="https://image.coinpedia.org/app_uploads/emails/green-drop-down.png" width="13" style="margin-right:4px;" alt="dropdown" />${responseArray[0].total_change_24h}%</span>`
                        :
                        `<span class="floatRight" style="margin-left: 8px;color: #E0243D;font-size: 14px;font-weight: 600;line-height: 18px;margin-right:4px;"><img src="https://image.coinpedia.org/app_uploads/emails/red-drop-down.png" width="13"style="margin-right:4px;" alt="dropdown" />${responseArray[0].total_change_24h}%</span>`
                    }
                                </div>    
        
                            </div>
        
                            <div style="width: 33.33%;" class="crypto-block">
                                <div style="background: linear-gradient(180deg, rgba(250, 250, 250, 0) 0%, rgba(69, 209, 251, 0.1) 100%);border: 1px solid rgba(69, 209, 251, 0.3);border-radius: 8px; padding: 10px; margin: 0 8px;">
                                    <h3 style="color: #171717B2;font-size: 14px;font-weight: 400; line-height: 18px; margin: 0;">Volume in 24 Hrs</h3> 
                                    <h4 style="font-size: 24px;font-weight: 600; line-height: 1; margin: 14px 0 0;">${total_volume_24h} </h4>
                                </div>
        
                            </div>
        
                            <div style="width: 33.33%;" class="crypto-block">
                                <div style="background: linear-gradient(180deg, rgba(250, 250, 250, 0) 0%, rgba(254, 228, 90, 0.1) 100%) ;border: 1px solid rgba(254, 228, 90, 0.3);
                                border-radius: 8px; padding: 10px; margin-left: 8px;">
                                    <h3 style="color: #171717B2;font-size: 14px;font-weight: 400; line-height: 18px; margin: 0;">Bitcoin Dominance</h3> 
                                    <h4 style="font-size: 24px;font-weight: 600; line-height: 1; margin: 14px 0 0;">${(responseArray[0].bitcoin_dominance_percentage).toFixed(2)}%</h4>
                                </div>
        
                            </div>
                            
                        </div>
                        <p style="color: rgba(23, 23, 23, 0.7); font-size: 16px;line-height: 26px; font-weight: 400;" class="margin-bottom-0">The Global Market Cap is <span style="color: rgba(23, 23, 23, 1);font-weight: 700;">$${total_marketcap}</span> at ${responseArray[0].total_change_24h > 0 ?
                        `<span style="color: #16C582 ;font-weight: 700;">${responseArray[0].total_change_24h}%</span> increases over the last day</p>`
                        :
                        `<span style="color: rgba(224, 36, 61, 1) ;font-weight: 700;">${responseArray[0].total_change_24h}%</span> decrease over the last day</p>`
                    }
                        <p style="color: rgba(23, 23, 23, 0.7); font-size: 16px;line-height: 26px; font-weight: 400;margin-bottom: 0;" class="margin-top-0">The total crypto market volume over the last 24 hours is <span style="color: rgba(23, 23, 23, 1);font-weight: 700;">${total_volume_24h}</span></p>
                </div>

                </div>`

            }

            let categories = ''
            if (responseArray[0].categories) {
                for (let item of responseArray[0].categories) {

                    let network_content = ""
                    let image1 = 'default'
                    let image2 = 'default'
                    if (item.token_gainer.length === 1) {

                        if (item.token_gainer[0].token_image) {
                            image1 = item.token_gainer[0].token_image

                        }
                        network_content = `<td style="font-weight: 500;color: rgba(23, 23, 23, 1);"><a href="https://markets.coinpedia.org/${item.token_gainer[0].token_id}" style="text-decoration:none;"> <img onerror="this.onerror=null;this.src='https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/default.webp';" src="https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/${image1}" alt="crypto" style="vertical-align: middle;margin-right: 6px;width: 30px;border-radius: 50px;"/></a></td>`
                    }
                    else if (item.token_gainer.length >= 2) {
                        if (item.token_gainer[0].token_image) {
                            image1 = await item.token_gainer[0].token_image

                        }
                        if (item.token_gainer[1].token_image) {
                            image2 = await item.token_gainer[1].token_image

                        }

                        network_content = `<td style="font-weight: 500;color: rgba(23, 23, 23, 1);"><a href="https://markets.coinpedia.org/${item.token_gainer[0].token_id}" style="text-decoration:none;"><img onerror="this.onerror=null;this.src='https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/default.webp';" src="https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/${image1}" alt="crypto" style="vertical-align: middle;margin-right: 6px;width: 30px;border-radius: 50px;"/></a><a href="https://markets.coinpedia.org/${item.token_gainer[1].token_id}" style="text-decoration:none;"><img src="https://image.coinpedia.org/app_uploads/markets/cryptocurrencies/${image2}" alt="crypto" style="vertical-align: middle;margin-right: 6px;width: 30px;border-radius: 50px;"/></a>
                                </td>`
                    }

                    categories += `
                        <tr>
                        <td style="padding: 22px 0 10px; ">
                            <a href="https://markets.coinpedia.org/category/${item.category_id}" style="text-decoration:none;"><h4 style="font-weight: 500;font-size: 16px; line-height: 16px;color: rgba(23, 23, 23, 1);margin: 0;"> ${item.category_name} </h4></a>
                            <p style="color: rgba(23, 23, 23, 0.7); font-weight: 400;  font-size: 12px; line-height: 16px; margin: 10px 0 0;">${item.title}</p>
                        </td>
                          ${network_content}
                        `
                }
            }
            let categories_content = ""
            if (responseArray[0].categories) {
                categories_content = `
                    <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;">
                    <div style="border: 1px solid rgba(0, 102, 255, 0.3);border-radius: 16px;background: #fff;padding: 24px;margin-top: 20px;"> 
                    <h2 style="margin-top: 0;"><img src="https://image.coinpedia.org/app_uploads/emails/top-crypto.png" alt="global-crypto" style="vertical-align: bottom;
                        margin-right: 6px;"/> Top Crypto Category’s</h2>
                    <div style="overflow-x:auto;">
                        <table style="border-collapse: collapse;width: 100% !important;white-space: nowrap;overflow: auto;">
                        <thead>
                            <tr style="border-top: 1px solid rgba(0, 102, 255, 0.3);border-bottom: 1px solid rgba(0, 102, 255, 0.3);">
                                <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px;text-align: left;">Name</th>
                                <th style="font-weight: 500; font-size: 14px; line-height: 18px; color: rgba(0, 102, 255, 0.7);padding: 10px 0;text-align: left;">Network</th>   
                            </tr>
                        </thead>
                        <tbody>
                         ${categories}
                      </tbody>
                    </table>
                    </div>
                    <div>
                    <a href="https://markets.coinpedia.org/categories/" style="text-decoration: none; display: inline-block;background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;
                        font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;" class="fullwidthBtn">View All <img src="https://image.coinpedia.org/app_uploads/emails/blue-arrow.png" alt="arrow" style="vertical-align: middle; margin-left: 4px;"/></a>
                    </div>
                </div>
                </div>`
            }



            return { global_market_overview_content, tokens_content, gainers_losers_content, categories_content, news_content, analysis_content, price_pridiction_content }

        }

    }
}

export const gainersList = async ({ notification_type }) => {
    let gainer_filter_by = { percent_change_24h: -1 }
    if (notification_type === 2) {
        gainer_filter_by = { percent_change_7d: -1 }
    }

    const gainer_query = await cryto_tokensM.aggregate([
        {
            $match: { active_status: 1, approval_status: 1, volume: { $gte: 50000 } }
        },
        {
            $sort: gainer_filter_by
        },
        {
            $project: {
                _id: 1,
                list_type: 1,
                token_name: 1,
                token_id: 1,
                symbol: 1,
                token_image: 1,
                price: 1,
                marketcap: 1,
                volume: 1,
                percent_change_24h: 1,
                percent_change_7d: 1
            }
        }
    ]).limit(3)

    return gainer_query
}

export const losersList = async ({ notification_type }) => {
    let loser_filter_by = { percent_change_24h: 1 }
    if (notification_type === 2) {
        loser_filter_by = { percent_change_7d: 1 }
    }

    const loser_query = await cryto_tokensM.aggregate([
        {
            $match: { active_status: 1, approval_status: 1, volume: { $gte: 50000 } }
        },
        {
            $sort: loser_filter_by
        },
        {
            $project: {
                _id: 1,
                list_type: 1,
                token_name: 1,
                token_id: 1,
                symbol: 1,
                token_image: 1,
                price: 1,
                marketcap: 1,
                volume: 1,
                percent_change_24h: 1,
                percent_change_7d: 1
            }
        }
    ]).limit(3)
    return loser_query
}

export const articlesList = async ({ news_cp_category_row_id }) => {
    try {
        let articles = [];
        const post_response = await axios.get(
            `${MAIN_CP_API_BASE_URL}wp-json/custom-api/v1/categories/`,
            {
                params: {
                    page: 1,
                    per_page: 5,
                    category: news_cp_category_row_id,
                },
                headers: {
                    "Content-Type": "application/json",
                    "API-KEY": MAIN_CP_API_KEY,
                },
            }
        );
        if (post_response) {
            const post_response_output = {
                statusCode: post_response.status,
                body: post_response.data,
            };
            if (parseInt(post_response_output.statusCode) === 200) {
                const response = post_response_output.body;
                if (response.posts) {
                    for (let run of response.posts) {
                        const new_object = await Promise.resolve({
                            article_link: run.link,
                            article_title: run.title,
                            article_content: "",
                            article_image: run.featured_image,
                            article_date: run.published_date + " " + run.published_time,
                            author_name: run.author.name,
                            author_profile_link: run.author.link
                        })
                        articles.push(new_object)
                    }
                }

            }
        }

        return { status: true, message: articles }

    }
    catch (err) {
        return { status: false, message: err.message }
    }
}

export const getUsersList = async ({ email_newsletter_row_id }) => {

    // email_id:{$in:["developerjory@gmail.com", "ultimez.priyad@gmail.com"]}
    const get_query = await subscribe_categoryM.aggregate([
        {
            $match: {
                category_row_id: email_newsletter_row_id,
                subscribe_status: 1
            }
        },
        {
            $lookup:
            {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "info_users",
                pipeline: [
                    {
                        $match: {
                            login_status: 1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_professionals_profile_images",
                            localField: "_id",
                            foreignField: "user_row_id",
                            as: "info_image"
                        }
                    },
                    { $unwind: { path: "$info_image", preserveNullAndEmptyArrays: true } },
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
                        $project: {
                            _id: 1,
                            full_name: 1,
                            user_name: 1,
                            mobile_number: 1,
                            email_id: 1,
                            country_name: "$info_country.country_name",
                            country_flag: "$info_country.country_flag",
                            profile_image: "$info_image.profile_image"
                        }
                    }
                ]
            }
        },
        { $unwind: { path: "$info_users" } },
        {
            $project:
            {
                _id: 1,
                user_row_id: 1,
                full_name: "$info_users.full_name",
                user_name: "$info_users.user_name",
                mobile_number: "$info_users.mobile_number",
                email_id: "$info_users.email_id",
                country_name: "$info_users.country_name",
                country_flag: "$info_users.country_flag",
                profile_image: "$info_users.profile_image"
            }
        }
    ]).limit(100)

    return get_query
}

export const getNextScheduledWeekDay = async (day_number) => {
    let d = new Date();
    let get_date_fun_day_number = d.getDay()
    if (day_number > get_date_fun_day_number) {
        return addDaysToPresentDate(day_number - get_date_fun_day_number)
    }
    else {
        const daysToAdd =
            (day_number + (7 - today.day())) % 7;

        const next_scheduled_date = today.add(daysToAdd, "day");

        return (
            next_scheduled_date.format("YYYY-MM-DD") + "T07:00:00Z"
        );
    }
}

export const getNextScheduledMonthDay = async (pass_day_number) => {
    const nowInBamako = dayjs().tz("Africa/Bamako");

    // Zero-pad day number
    let day_number = pass_day_number < 10
        ? `0${pass_day_number}`
        : `${pass_day_number}`;

    // Preferred date for current month
    const preferred_date = `${nowInBamako.format("YYYY-MM")}-${day_number}`;
    const cp_preferred_date = dayjs(preferred_date).valueOf();

    // Today date (from helper)
    const cp_today_date = dayjs(getPresentDateOnly()).valueOf();

    if (cp_today_date >= cp_preferred_date) {
        // Move to next month
        const nextMonthDate = nowInBamako.add(2, "month");

        const preferred_date2 =
            `${nextMonthDate.format("YYYY-MM")}-${day_number}`;

        return preferred_date2 + "T07:00:00Z";
    } else {
        return preferred_date + "T07:00:00Z";
    }
}

export const getSentDetailsByCategory = async ({ sent_report_row_id, start_date }) => {
    try {
        const reqConfig = {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SENDGRID_API_KEY}`,
            },
        };
        const get_response = await axios.get(
            `https://api.sendgrid.com/v3/categories/stats/sums?categories=${sent_report_row_id}&start_date=${start_date}`,
            reqConfig
        );
        return { status: true, message: get_response };
    } catch (error) {
        return { status: false, message: error };
    }
};