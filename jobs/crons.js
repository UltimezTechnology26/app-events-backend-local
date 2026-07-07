const cron = require('node-cron')
const axios = require('axios')

// Add these missing imports:
const jwt = require('jsonwebtoken')
const professionalsM = require('../models/app/professionalsM')
const community_postsM = require('../models/main/community/community_postsM')
const companyM = require('../models/app/company/companyM')
const { generateEventCardImage, sendAttendeesEmails } = require('../utils/helpers/events_helper')
const { crawlHeadings } = require('../utils/helpers/app_helper')
const { sendWeeklyReportEmail, send_quiz_not_complete_remainder } = require('../utils/helpers/academy_helper')
const { deleteUserDetais, fetchAndStoreEmailDetails, convertUnixTimeToUTC } = require('../utils/helpers/helper')
const eventM = require('../models/app/events/eventM')
import exchangeM from '../models/markets/exchangeM'
import app_exchangeM from '../models/markets/app_exchangeM'
import markets_company_holdingM from '../models/markets/products_n_holding/markets_company_holdingM'
import company_holdingM from '../models/markets/products_n_holding/company_holdingM'
import { deleteOldNotifications } from '../utils/helpers/notification_helper'
import bounced_emailsM from '../models/emails/bounced_emailsM'
import { sendEmailsForPricePrediction } from '../utils/helpers/newsletter_helper'
import professionals_seo_detailsM from '../models/app/professionals_seo_detailsM'
import company_seo_detailsM from '../models/app/company/company_seo_detailsM'
import event_seo_detailsM from '../models/app/events/event_seo_detailsM'

const JWT_ADMIN_SECRET_KEY = process.env.JWT_ADMIN_SECRET_KEY


// Live Crons -------------------------------------------------------------------------------------------


cron.schedule('0 1 * * 0', async () => {
    try {
        const userIds = await community_postsM.distinct("user_row_id", { post_status: true });
        const users = await professionalsM.find(
            { _id: { $in: userIds } },
            { full_name: 1, email_id: 1 } // only required fields
        ).lean();
        const formattedUsers = users.map(user => ({
            user_row_id: user._id,
            full_name: user.full_name,
            email_id: user.email_id
        }));
        console.log("weekly cron jobs");

        for (const user of users) {
            const userData = {
                user_row_id: user._id,
                full_name: user.full_name,
                email_id: user.email_id
            };

            await sendWeeklyReportEmail(userData);
        }

    } catch (err) {
        console.error('[CRON] Error in weekly job:', err.message);
    }
}, {
    timezone: 'Asia/Kolkata' // optional
});

cron.schedule('0 */4 * * *', async () => {
    try {
        console.log('Running cron job to fetch email details...')
        await fetchAndStoreEmailDetails()
    }
    catch (err) {
        console.log('Store emails details cron job', err.message)
    }
})


cron.schedule('12 16 * * *', async () => {
    console.log('Running cron: Generate Event Cards for approved events...');

    try {
        // Fetch all approved events
        const approvedEvents = await eventM.find(
            {
                approval_status: 1,
                active_status: 1,
                $or: [
                    { event_card_image: { $exists: false } },
                    { event_card_image: "" }
                ]
            },
            {
                event_title: 1,
                start_date: 1,
                event_venue: 1,
                event_url: 1,
                event_type: 1,
                created_date_n_time: 1,
            }
        ).sort({ created_date_n_time: -1 });

        if (!approvedEvents.length) {
            console.log("No approved events found.");
            return;
        }

        console.log(`Found ${approvedEvents.length} approved events.`);

        // Run them one by one (sequentially)
        for (const eventData of approvedEvents) {
            const cardData = {
                event_title: eventData.event_title,
                start_date: eventData.start_date,
                event_venue: (eventData?.event_type == 1 || eventData?.event_type == 3) ? eventData.event_venue : "Virtual",
                event_url: eventData.event_url,
                event_row_id: eventData._id,
            };

            console.log(`Generating card for event: ${eventData.event_title}`);
            await generateEventCardImage(cardData);
            await new Promise(r => setTimeout(r, 3000));
            console.log(`Card generated for event: ${eventData.event_title}`);
        }

        console.log(" All event cards generated successfully.");
    } catch (err) {
        console.error(" Error in cron job:", err);
    }
}, {
    timezone: "Asia/Kolkata", // Run at 8:25 PM IST
});


cron.schedule('*/30 * * * *', async () => {
    try {
        const update_array = []
        const get_query = await exchangeM.aggregate([
            {
                $lookup: {
                    from: 'cln_exchanges_details',
                    localField: '_id',
                    foreignField: 'exchange_row_id',
                    as: 'exchange_detail',
                    pipeline: [
                        {
                            $match: {
                                founder_user_row_id: { $gte: 1 }
                            }
                        },
                        {
                            $project: {
                                founder_user_row_id: 1,
                                founder_user_type: 1,
                            }
                        }
                    ]
                }
            },
            {
                $unwind: { path: '$exchange_detail' }
            },
            {
                $project: {
                    exchange_name: 1,
                    exchange_slug: 1,
                    exchange_image: 1,
                    total_pairs: 1,
                    total_coins: 1,
                    volume_24h: 1,
                    founder_user_row_id: '$exchange_detail.founder_user_row_id',
                    founder_user_type: '$exchange_detail.founder_user_type',
                    status: 1,
                    updated_on: 1,
                    date_n_time: 1,
                }
            }
        ])

        if (get_query) {
            for (let run of get_query) {
                await update_array.push(run)

                const check_inserted_data = await app_exchangeM.findOne({ exchange_slug: run.exchange_slug }, { _id: 1 })
                if (!check_inserted_data) {
                    try {
                        const insert_data = await app_exchangeM({
                            exchange_name: run.exchange_name,
                            exchange_slug: run.exchange_slug,
                            exchange_image: run.exchange_image,
                            total_pairs: run.total_pairs,
                            total_coins: run.total_coins,
                            volume_24h: run.volume_24h,
                            founder_user_row_id: run.founder_user_row_id,
                            founder_user_type: run.founder_user_type,
                            status: run.status,
                            updated_on: run.updated_on,
                            date_n_time: run.date_n_time
                        }).save()

                    }
                    catch (e) {
                        console.log('update products data shift', e.message)
                    }
                }
                else {
                    await update_array.push(check_inserted_data._id)
                }
            }
        }

        await app_exchangeM.deleteMany({ _id: { $nin: update_array } })

        console.log('Data Shifting of exchanges completed')
    }

    catch (err) {
        console.log('Store emails details cron job', err.message)
    }
})


//At every 30th minute.
cron.schedule('*/30 * * * *', async () => {
    try {
        console.log('Sending attendees emails before event live')
        await sendAttendeesEmails()
    }
    catch (err) {
        console.log('Error in Sending attendees emails before event live', err.message)
    }
})

cron.schedule('50 23 * * *', async () => {
    try {
        console.log('Deleting old notifications')
        await deleteOldNotifications()
    }
    catch (err) {
        console.log('Error in Deleting old notifications', err.message)
    }
})


//every 10 hour update
cron.schedule('0 10 * * *', async () => {

    try {
        const check_query = await axios.get('https://api.sendgrid.com/v3/suppression/bounces?limit=500&offset=0', {
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        if (check_query.data.length > 0) {
            const bounced_emails_list = check_query.data

            for (let run of bounced_emails_list) {
                try {
                    const check_email_query = await bounced_emailsM.findOne({ email_id: run.email }).collation({ locale: 'en', strength: 2 })
                    if (!check_email_query) {
                        let insert_array = {
                            email_id: run.email,
                            status: run.status,
                            reason: run.reason,
                            bounced_date: convertUnixTimeToUTC(run.created)
                        };

                        await bounced_emailsM(insert_array).save()
                    }

                }
                catch (err) {
                    console.log('Bounced emails data store cron job', err.message)
                }

            }

            console.log('Running cron job to store bounced emails.');
        }
    }
    catch (err) {
        console.log('Bounced emails data store cron job', err.message)
    }
})


cron.schedule('30 1 * * *', async () => {
    // UTC Time : 1:30am
    // Every day at 06:00 am O Clock 
    await sendEmailsForPricePrediction()
})

//At night 01:00 every day data 
cron.schedule('0 1 * * *', async () => {
    await send_quiz_not_complete_remainder()
})


//At night 01:00 every day data 
cron.schedule('0 1 * * *', async () => {
    try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const usersToDelete = await professionalsM.find({ deleted_date_n_time: { $lte: sevenDaysAgo }, login_status: 2 })
        if (usersToDelete.length > 0) {
            let jsonTokenGenObj = {
                expire_at: (3.5 * 60 * 60 * 1000) + (new Date().getTime()),
                admin_row_id: 1,
                admin_manager_type: 1,
                sub_admin_type: 1,
                issued_at: new Date().getTime()
            }
            const jwt_token = jwt.sign(jsonTokenGenObj, JWT_ADMIN_SECRET_KEY)
            for (const user of usersToDelete) {
                await deleteUserDetais({ user_row_id: user._id, token: jwt_token })
            }
        }
    }
    catch (err) {
        console.error('Error running deletion job:', err.message);
    }
})

// cron.schedule("22 15 * * *", async () => {
//     console.log("🔁 SEO Meta Update Cron Running:", new Date());

//     try {
//         const BATCH_SIZE = 2000;
//         let skip = 0;
//         let batchUsers = [];

//         do {
//             try {
//                 batchUsers = await professionalsM.find(
//                     {},
//                     { _id: 1, full_name: 1 }
//                 )
//                 .skip(skip)
//                 .limit(BATCH_SIZE);

//                 console.log(`📦 Processing batch: ${skip} → ${skip + batchUsers.length}`);
//             } catch (batchErr) {
//                 console.error(`❌ ERROR fetching batch starting at ${skip}:`, batchErr);
//                 break; // Stop further processing if batch fetch fails
//             }

//             for (const mainUser of batchUsers) {
//                 try {
//                     const user_id = mainUser?._id;
//                     const full_name = mainUser?.full_name || "";

//                     if (!user_id) {
//                         console.warn("⚠️ Skipping user with invalid ID:", mainUser);
//                         continue;
//                     }

//                     const details = await professionals_seo_detailsM.findOne(
//                         { user_row_id: user_id },
//                         {
//                             meta_title: 1,
//                             meta_description: 1,
//                             meta_keywords: 1,
//                             user_bio: 1,
//                         }
//                     );

//                     // If no details doc exists, create SEO details
//                     if (!details) {
//                         console.log(`⚠️ No details found for user ${user_id}, creating new one...`);

//                         const metaTitle = `${full_name} | Coinpedia User Profile`;

//                         const newDetails = {
//                             user_row_id: user_id,
//                             meta_title: metaTitle,
//                             meta_keywords: full_name,
//                             og_title: metaTitle,
//                             twitter_title: metaTitle,
//                         };

//                         await professionals_seo_detailsM.create(newDetails);
//                         console.log(`✨ Created SEO details for user ${user_id}`);
//                         continue;
//                     }

//                     const update = {};

//                     /** -------------------------------
//                      * 1️⃣ META TITLE HANDLING
//                      * ------------------------------*/
//                     if (!details.meta_title) {
//                         const metaTitle = `${full_name} | Coinpedia User Profile`;
//                         update.meta_title = metaTitle;
//                         update.og_title = metaTitle;
//                         update.twitter_title = metaTitle;
//                     } else {
//                         update.og_title = details.meta_title;
//                         update.twitter_title = details.meta_title;
//                     }

//                     /** -------------------------------
//                      * 2️⃣ META DESCRIPTION HANDLING
//                      * ------------------------------*/
//                     let finalDescription = details.meta_description;

//                     if (!details.meta_description) {
//                         finalDescription = removeHtmltag(details?.user_bio || "").slice(0, 160);
//                         update.meta_description = finalDescription;

//                         // Fill keywords only when auto filling
//                         if (!details.meta_keywords) {
//                             update.meta_keywords = full_name;
//                         }
//                     }

//                     update.og_description = finalDescription;
//                     update.twitter_description = finalDescription;

//                     /** -------------------------------
//                      * 3️⃣ PERFORM UPDATE
//                      * ------------------------------*/
//                     await users_other_detailsM.updateOne(
//                         { user_row_id: user_id },
//                         { $set: update }
//                     );

//                     console.log(`✅ SEO Updated for user ${user_id}`);

//                 } catch (userErr) {
//                     console.error(`❌ Error processing user ${mainUser?._id}:`, userErr);
//                     // Continue with next user
//                 }
//             }

//             skip += BATCH_SIZE;
//         } while (batchUsers.length === BATCH_SIZE);

//         console.log("🎉 Completed SEO Cron Job");

//     } catch (cronError) {
//         console.error("🚨 Fatal Cron Error:", cronError);
//     }
// });

// cron.schedule("52 16 * * *", async () => {
//   console.log("🏢 Company SEO Meta Update Cron Running:", new Date());

//   try {
//     const BATCH_SIZE = 2000;
//     let skip = 0;
//     let batchCompanies = [];

//     do {
//       try {
//         batchCompanies = await companyM.find(
//           {},
//           { _id: 1, company_name: 1, about_company: 1 }
//         ).skip(skip).limit(BATCH_SIZE);

//         console.log(`🏭 Processing company batch: ${skip} → ${skip + batchCompanies.length}`);
//       } catch (batchError) {
//         console.error(`❌ ERROR fetching company batch at skip ${skip}:`, batchError);
//         break;
//       }

//       for (const company of batchCompanies) {
//         try {
//           const company_id = company?._id;
//           const company_name = company?.company_name || "";
//           const about_company = company?.about_company || "";

//           if (!company_id) {
//             console.warn("⚠️ Skipping invalid company:", company);
//             continue;
//           }

//           const details = await company_seo_detailsM.findOne(
//             { company_row_id: company_id },
//             {
//               meta_title: 1,
//               meta_description: 1,
//               meta_keywords: 1
//             }
//           );

//           if (!details) {
//             console.log(`⚠️ Missing SEO record for company ${company_id}, creating...`);
//             const metaTitle = `${company_name} | Coinpedia Company Listing`;

//             await company_seo_detailsM.create({
//               company_row_id: company_id,
//               meta_title: metaTitle,
//               meta_keywords: company_name,
//               og_title: metaTitle,
//               twitter_title: metaTitle,
//             });

//             console.log(`✨ Created SEO for company ${company_id}`);
//             continue;
//           }

//           const update = {};

//           // Title
//           if (!details.meta_title) {
//             const metaTitle = `${company_name} | Coinpedia Company Listing`;
//             update.meta_title = metaTitle;
//             update.og_title = metaTitle;
//             update.twitter_title = metaTitle;
//           } else {
//             update.og_title = details.meta_title;
//             update.twitter_title = details.meta_title;
//           }

//           // Description
//           let finalDescription = details.meta_description;
//           if (!details.meta_description) {
//             finalDescription = removeHtmltag(about_company || "").slice(0, 160);
//             update.meta_description = finalDescription;
//             if (!details.meta_keywords) update.meta_keywords = company_name;
//           }

//           update.og_description = finalDescription;
//           update.twitter_description = finalDescription;

//           await company_seo_detailsM.updateOne(
//             { company_row_id: company_id },
//             { $set: update }
//           );

//           console.log(`🟣 Updated SEO for company ${company_id}`);

//         } catch (companyError) {
//           console.error(`❌ Error updating company ${company?._id}:`, companyError);
//         }
//       }

//       skip += BATCH_SIZE;
//     } while (batchCompanies.length === BATCH_SIZE);

//     console.log("🎯 Completed Company SEO Cron");

//   } catch (cronError) {
//     console.error("🚨 Fatal Company SEO Cron Error:", cronError);
//   }
// });



async function safeCrawl(url) {
    try {
        return await crawlHeadings(url);
    } catch (err) {
        console.error(`❌ Failed crawling: ${url}`, err.message);
        return [];
    }
}
//Event Structure:


cron.schedule("08 13 * * *", async () => {
    console.log("📅 Event Header Structure Update Cron Running:", new Date());

    try {
        const events = await eventM.find(
            { approval_status: 1, active_status: 1 },
            { _id: 1, event_url: 1 }
        )

        if (!events.length) return console.log("⚠️ No events found to update!");

        for (const event of events) {
            try {
                const url = `https://events.coinpedia.org/${event.event_url}`;
                const header_structure = await safeCrawl(url);

                await event_seo_detailsM.updateOne(
                    { event_row_id: event._id },
                    { $set: { header_structure } },
                    { upsert: true }
                );

                console.log(`🟠 Event Updated: ${event._id} | ${event.event_url} | Count: ${header_structure.length}`);

            } catch (err) {
                console.error(`❌ Error processing event ${event._id}:`, err.message);
            }
        }

        console.log("🏁 Completed Event Header Structure Cron");

    } catch (err) {
        console.error("🚨 Event Cron Fatal Error:", err.message);
    }
});
// User Structure:


/* ----------------------------------------------------
 1️⃣ USER HEADER STRUCTURE CRON
 Runs everyday at 1:30 AM
-----------------------------------------------------*/
cron.schedule("40 20 * * 6", async () => {
    console.log("🔁 User Header Structure Update Cron Running:", new Date());

    try {
        const users = await professionalsM.find(
            { user_name: { $exists: true, $ne: "" }, approval_status: 1 },
            { _id: 1, user_name: 1 }
        )

        if (!users.length) return console.log("⚠️ No users found to update!");

        for (const user of users) {
            try {
                const url = `https://app.coinpedia.org/${user.user_name}`;
                const header_structure = await safeCrawl(url);

                await professionals_seo_detailsM.updateOne(
                    { user_row_id: user._id },
                    { $set: { header_structure } }
                );

                console.log(`🟢 User Updated: ${user._id} | ${user.user_name} | Count: ${header_structure.length}`);

            } catch (err) {
                console.error(`❌ Error processing user ${user._id}:`, err.message);
            }
        }

        console.log("🎉 Completed User Header Structure Cron");

    } catch (err) {
        console.error("🚨 User Cron Fatal Error:", err.message);
    }
});


// //Company Structure:

cron.schedule("35 20 * * 6", async () => {
    console.log("🏢 Company Header Structure Update Cron Running:", new Date());

    try {
        const companies = await companyM.find(
            { approval_status: 1 },
            { _id: 1, company_name: 1 }
        )

        if (!companies.length) return console.log("⚠️ No companies found to update!");

        for (const company of companies) {
            try {
                const url = `https://app.coinpedia.org/company/${company.company_name}`;
                const header_structure = await safeCrawl(url);

                await company_seo_detailsM.updateOne(
                    { company_row_id: company._id },
                    { $set: { header_structure } }
                );

                console.log(`🟣 Company Updated: ${company._id} | ${company.company_name} | Count: ${header_structure.length}`);

            } catch (err) {
                console.error(`❌ Error processing company ${company._id}:`, err.message);
            }
        }

        console.log("🎯 Completed Company Header Structure Cron");

    } catch (err) {
        console.error("🚨 Company Cron Fatal Error:", err.message);
    }
});


const fetchURLs = async (api, api_key) => {
    const FILTER_BLOCK = [
        "page", "profile", "/company/", "watchlist",
        "/token", "create-event", "my-events",
        "confirm-details", "verify-email", "referrals"
    ];

    try {
        const { body } = await superagent
            .get(api)
            .set("api_key", api_key);

        // ✅ normalize response to array
        const list =
            Array.isArray(body?.message) ? body.message :
                Array.isArray(body?.message?.data) ? body.message.data :
                    Array.isArray(body?.data) ? body.data :
                        [];

        return list
            .filter(item =>
                item?.status_code === 200 &&
                typeof item?.url === "string" &&
                !FILTER_BLOCK.some(str => item.url.includes(str))
            )
            .map(item => item.url);

    } catch (err) {
        console.error("❌ Fetch URL Error:", err.message);
        return [];
    }
};

/** CRAWL PAGE **/
const crawlPage = async (url, base, module) => {
    const fullUrl = `${base}${url}`;
    console.log("🔍 Crawling:", fullUrl);

    const pageData = {
        url: fullUrl,
        module,
        h1_tag: "",
        header_structure: [],
        meta_title: "",
        meta_description: "",
        meta_keywords: "",
        robots_index: "index",
        robots_follow: "follow",
        og_title: "",
        og_description: "",
        og_image: "",
        twitter_title: "",
        twitter_description: "",
        twitter_creator: "",
        page_type: "",
        schema_type: "BreadCrumbList",
        private: false
    };

    try {
        const res = await superagent.get(fullUrl).set("User-Agent", "Mozilla/SEO/1.0");

        const $ = cheerio.load(res.text);

        pageData.h1_tag = $("h1").first().text().trim() || "";

        $("h1, h2, h3").each((_, el) => {
            const tag = el.tagName.toUpperCase();
            const text = $(el).text().trim();
            if (text) pageData.header_structure.push({ tag, text });
        });

        // Meta Tags
        pageData.meta_title = $("title").first().text().trim() || "";
        pageData.meta_description = $('meta[name="description"]').attr("content") || "";
        pageData.meta_keywords = $('meta[name="keywords"]').attr("content") || "";

        // Robots
        const robots = $('meta[name="robots"]').attr("content") || "";
        if (robots.includes("noindex")) pageData.robots_index = "noindex";
        if (robots.includes("nofollow")) pageData.robots_follow = "nofollow";

        // OG & Twitter
        pageData.og_title = $('meta[property="og:title"]').attr("content") || "";
        pageData.og_description = $('meta[property="og:description"]').attr("content") || "";
        pageData.og_image = $('meta[property="og:image"]').attr("content") || "";
        pageData.twitter_title = $('meta[name="twitter:title"]').attr("content") || "";
        pageData.twitter_description = $('meta[name="twitter:description"]').attr("content") || "";
        pageData.twitter_creator = $('meta[name="twitter:creator"]').attr("content") || "";

        return pageData;

    } catch (error) {
        console.error("⚠️ Crawl Error:", error.message);
        return pageData;
    }
};

/** SAVE TO DB **/
// const saveSEO = async (data) => {
//     const exists = await seo_static_urlsM.findOne({ url: data.url });
//     if (exists) {
//         await seo_static_urlsM.updateOne({ url: data.url }, data);
//         console.log("🔁 Updated:", data.url);
//     } else {
//         await seo_static_urlsM.create(data);
//         console.log("🆕 Created:", data.url);
//     }
// };

// cron.schedule("50 7 * * 5", async () => {
//     console.log("🚀 Weekly APP SEO Cron Running...");
//     const urls = await fetchURLs("https://api.coinpedia.org/analytics/users_company_other_urls", APP_API_KEY);
//     for (const url of urls) {
//         const data = await crawlPage(url, "https://app.coinpedia.org", "app");
//         await saveSEO(data);
//     }
//     console.log("🎉 APP SEO Weekly Complete.\n");
// });

// cron.schedule("55 7 * * 5", async () => {
//     console.log("🚀 Weekly EVENTS SEO Cron Running...");
//     const urls = await fetchURLs("https://api.coinpedia.org/analytics/events_other_urls", APP_API_KEY);
//     for (const url of urls) {
//         const data = await crawlPage(url, "https://events.coinpedia.org", "event");
//         await saveSEO(data);
//     }
//     console.log("🎉 EVENTS SEO Weekly Complete.\n");
// });

// cron.schedule("59 7 * * 5", async () => {
//     console.log("🚀 Weekly MARKETS SEO Cron Running...");
//     const urls = await fetchURLs("https://marketsapi.coinpedia.org/analytics/other_urls", MARKET_API_KEY);
//     for (const url of urls) {
//         const data = await crawlPage(url, "https://markets.coinpedia.org", "market");
//         await saveSEO(data);
//     }
//     console.log("🎉 MARKETS SEO Weekly Complete.\n");
// });


