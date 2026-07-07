// controllers/main/academy/jobs/eventCardGeneration.js
require('dotenv').config()
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const sharp = require("sharp");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const event_link_display_detailsM = require('../../../../models/app/events/event_link_display_detailsM');
const event_speakersM = require('../../../../models/app/events/event_speakersM');
const eventM = require('../../../../models/app/events/eventM');
const { deleteKeysByPattern } = require('../../../../config/cache_helper')

import s3 from '../../../../config/s3'
const path = require('node:path');
const fs = require('node:fs');



async function uploadToS3(key, buffer, contentType) {
    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.DO_SPACES_NAME,
            Key: key,
            Body: buffer,
            ACL: "public-read",
            ContentType: contentType,
        })
    );

    return key;
}

function fillTemplate(template, data) {
    let filled = template;
    for (const key in data) {
        const regex = new RegExp(`{{${key}}}`, "g");
        filled = filled.replace(regex, data[key] || "");
    }
    return filled;
}

async function generateQrWithLogo(url) {
    const qrBuffer = await QRCode.toBuffer(url, {
        errorCorrectionLevel: 'H',
        type: 'png',
        margin: 1,
        color: {
            dark: "#1b0b57",
            light: "#FFFFFF"
        },
    });

    const qr = sharp(qrBuffer);

    const qrMeta = await qr.metadata();
    const qrWidth = qrMeta.width;
    const logoSize = Math.round(qrWidth * 0.2);

    const logoResponse = await fetch(
        "https://image.coinpedia.org/static/common/coinpedia.png"
    );
    const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
    const resizedLogoBuffer = await sharp(logoBuffer)
        .resize(logoSize, logoSize)
        .png()
        .toBuffer();

    const finalBuffer = await qr
        .composite([
            {
                input: resizedLogoBuffer,
                gravity: "center",
            },
        ])
        .png()
        .toBuffer();

    const qrBase64 = `data:image/png;base64,${finalBuffer.toString("base64")}`;
    return qrBase64;
}

async function generateEventCard({ event_venue, event_url, start_date, event_title, event_row_id }) {
    const templatePath = path.join(__dirname, '..', 'templates', 'event-card.html');
    console.log(templatePath, 'templatePath');

    const rawHtml = fs.readFileSync(templatePath, "utf8");

    const qrCode = await generateQrWithLogo("https://events.coinpedia.org/" + event_url);
    let link_speaker_status = true;

    const get_event_link_display_details = await event_link_display_detailsM.findOne({
        event_row_id: event_row_id,
    });
    console.log(get_event_link_display_details);


    if (get_event_link_display_details) {
        link_speaker_status = get_event_link_display_details.link_speaker_status;
    }

    let speakersHTML = "";

    if (link_speaker_status) {
        const speakersData = await event_speakersM.aggregate([
            {
                $match: {
                    event_row_id: event_row_id,

                    $or: [
                        { requested_status: { $in: [1, 3] } },
                        { requested_status: null }
                    ]
                }
            },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    let: {
                        user_row_id: '$user_row_id',
                        user_type: '$user_type'
                    },
                    as: "user_info",
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: [1, '$$user_type'] },
                                                { $eq: ['$_id', '$$user_row_id'] }
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
                            $project:
                            {
                                _id: 1,
                                user_name: 1,
                                full_name: 1,
                                email_id: 1,
                                pro_batch: 1,
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
                        user_type: '$user_type',
                        user_row_id: '$user_row_id'
                    },
                    as: "manual_info",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: [2, '$$user_type'] },
                                        { $eq: ['$_id', '$$user_row_id'] }
                                    ]
                                }
                            }
                        },

                        {
                            $project:
                            {
                                _id: 1,
                                full_name: 1,
                                email_id: 1,
                                profile_image: 1,
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
                                            { $eq: ['$user_type', 1] }
                                        ]
                                    },
                                    then: "$user_info"
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ['$user_type', 2] }
                                        ]
                                    },
                                    then: "$manual_info"
                                },
                            ],
                            default: ""
                        }
                    },
                }
            },
            {
                $lookup:
                {
                    from: "cln_professionals_work_experiences",
                    let: {
                        user_type: '$user_type',
                        user_row_id: '$user_data._id'
                    },
                    pipeline: [
                        {
                            $match: {
                                $and: [
                                    { user_row_id: { $nin: ["", null] } },
                                    {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$user_row_id', '$$user_row_id'] },
                                                { $eq: ['$public_view', true] },
                                                { $eq: ['$user_account_type', '$$user_type'] }
                                            ]
                                        }
                                    }
                                ]
                            }
                        },
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
                                            $and: [
                                                { active_status: 1 },
                                                {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: [1, '$$company_type'] },
                                                            { $eq: ['$_id', "$$company_row_id"] }
                                                        ]
                                                    }
                                                }
                                            ]
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
            { $match: { user_data: { $exists: true, $ne: "" } } },
            {
                $project:
                {
                    _id: 1,
                    user_row_id: 1,
                    user_type: 1,
                    approval_status: { $cond: { if: "$user_data.approval_status", then: "$user_data.approval_status", else: 0 } },
                    user_name: "$user_data.user_name",
                    full_name: "$user_data.full_name",
                    pro_batch: "$user_data.pro_batch",
                    email_id: "$user_data.email_id",
                    profile_image: "$user_data.profile_image",
                    work_position: "$info_work.position_name",
                    company_name: "$info_work.company_name"
                }
            }
        ])

        // Base URLs for images
        const image_base_url = "https://image.coinpedia.org/app_uploads/profile/";
        const manual_user_image_base_url = "https://image.coinpedia.org/app_uploads/manual_users/";
        console.log(speakersData, '1');

        // Transform speakers to HTML
        const speakersImages = speakersData
            .slice(0, 3)
            .map((e) => {
                const imgSrc =
                    (e?.user_type === 2 && e?.profile_image
                        ? manual_user_image_base_url
                        : image_base_url) + (e.profile_image || "default.png");

                return `
                <img src="${imgSrc}" alt="${e.full_name}" title="${e.full_name}" />`;
            })
            .join("\n");
        console.log(speakersImages, '2');

        speakersHTML = speakersImages?.length > 0 ? `
  <div class="info-block">
    <h3 class="info-heading">Speakers</h3>
    <div class="speakers">
      ${speakersImages}
    </div>
  </div>
`: '';
    }


    const userHtml = false ? `<div class="user-avatar">
                <img src="{{userImage}}" alt="User" title="{{userName}}" />
            </div>`: '';

    const date = new Date(start_date);

    const formattedDate =
        date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
        }) +
        " " +
        date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    const titleFontSize = event_title.length > 30 ? "70px" : "90px";
    const title_html = `<h2 class="event-title" style="font-size: ${titleFontSize};">${event_title}</h2>`;

    const venueFontSize = event_venue.length > 70 ? "34px" : "44px";
    const venue_html = `<span class="venue-text" style="font-size: ${venueFontSize};">${event_venue}</span>`;



    const data = {
        title: title_html,
        venue: venue_html,
        date: formattedDate,
        qrCode,
        userHtml,
        speakers: speakersHTML,
    };

    return fillTemplate(rawHtml, data);
}

async function generateEventCardImage({ event_row_id, event_venue, event_url, start_date, event_title }) {
    console.log(`🧾 Generating event card for: ${event_row_id}`);

    try {
        const filledHtml = await generateEventCard({ event_venue, event_url, start_date, event_title, event_row_id });

        const browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();
        await page.setContent(filledHtml, { waitUntil: "networkidle0" });
        await page.setViewport({ width: 1280, height: 680 });

        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const imageBuffer = await page.screenshot({
            type: "jpeg",
            quality: 95,
            fullPage: true,
            omitBackground: false,
        });

        await browser.close();

        const safeDateTime = new Date().getTime();
        const imageKey = `app_uploads/events/${event_url}_${safeDateTime}.jpg`;
        const imageUrl = await uploadToS3(imageKey, imageBuffer, "image/jpeg");

        await eventM.updateOne(
            { _id: event_row_id },
            { $set: { event_card_image: imageUrl } }
        ); await deleteKeysByPattern('individual_event_*')
        await deleteKeysByPattern('users_registered_list_*')
        await deleteKeysByPattern('all_events_*')
        await deleteKeysByPattern('manage_events_list_*')

        console.log(`✅ Event card uploaded successfully: ${imageUrl}`);
        return imageUrl;
    } catch (err) {
        console.error("❌ Error generating event card:", err);
        throw err;
    }
}

module.exports = {
    generateEventCardImage
}