// certificateGeneration.js

require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { PutObjectCommand } = require("@aws-sdk/client-s3")

// Helpers
const { formatCertificateDate, formatLongMonthYear, fillTemplate } = require('../utils/helpers/academy_helper');

// Models
const professionalsM = require('../models/app/professionalsM');
const courses_certificatesM = require('../models/main/academy/courses_certificatesM');
const coursesM = require('../models/main/academy/coursesM');
const { sendAcademyEmail } = require('../config/email');
const { calculateUserProfileScore } = require('../utils/helpers/app_helper');
import s3 from '../config/s3'




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


async function generateCertificateFile({ data, certificate_row_id }) {
    // Load template
    const templatePath = path.join(__dirname, '..', 'controllers','main','academy','templates', 'certificate.html');

    const rawHtml = fs.readFileSync(templatePath, 'utf8');
    const filledHtml = fillTemplate(rawHtml, data);

    // Launch browser
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(filledHtml, { waitUntil: 'networkidle0' });

    // PDF generation
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        landscape: true,
        scale: 0.9,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    // Image generation
    await page.setViewport({
        width: Math.floor(1500 * 0.9),
        height: Math.floor(800 * 0.9)
    });

    await page.evaluateHandle('document.fonts.ready');

    await new Promise(resolve => setTimeout(resolve, 7000));

    const imageBuffer = await page.screenshot({ fullPage: true });

    await browser.close();

    // Upload to Spaces
    const pdfKey = `academy/certificate_${certificate_row_id}.pdf`;
    const imageKey = `academy/certificate_${certificate_row_id}.png`;

    const [pdfUrl, imageUrl] = await Promise.all([
        uploadToS3(pdfKey, pdfBuffer, 'application/pdf'),
        uploadToS3(imageKey, imageBuffer, 'image/png')
    ]);

    return { pdf_url: pdfUrl, image_url: imageUrl };
}

/**
 * Agenda Job: generate certificate
 */
module.exports = (agenda) => {
    agenda.define(
        'generate certificate',
        { priority: 'high', concurrency: 3 },
        async (job) => {
            const { user_row_id, course_row_id, certificate_row_id } = job.attrs.data;
            console.log(`Processing certificate for user ${user_row_id}`);

            try {
                // Fetch user, course, and certificate details
                const [user, certificate_details, course_details] = await Promise.all([
                    professionalsM.findOne({ _id: user_row_id }, { full_name: 1, email_id: 1 }),
                    courses_certificatesM.findOne({ user_row_id, course_row_id }),
                    coursesM.findOne({ _id: course_row_id })
                ]);

                const certificateData = {
                    name: user?.full_name
                        ? user.full_name.charAt(0).toUpperCase() + user.full_name.slice(1)
                        : '',
                    course_name: course_details?.course_name,
                    score: certificate_details?.percentage_score,
                    date: formatLongMonthYear(certificate_details?.date_n_time),
                    certificate_id: `CP/BGC/${formatCertificateDate(new Date(certificate_details?.date_n_time))}/${certificate_row_id}`
                };
                // Generate and upload files
                const { pdf_url, image_url } = await generateCertificateFile({
                    data: certificateData,
                    certificate_row_id
                });

                // Update DB with file URLs
                await courses_certificatesM.updateOne(
                    { _id: certificate_row_id },
                    { $set: { certificate_image_url: image_url, certificate_pdf_url: pdf_url } }
                );
                await sendCertificateGenerationEmail(user, pdf_url)
                await calculateUserProfileScore(user_row_id, ['academy'])


                console.log(`✅ Certificate generated for user ${user_row_id}`);
            } catch (error) {
                console.error(`❌ Certificate generation failed for user ${user_row_id}:`, error);
                throw error; // Let Agenda retry
            }
        }
    );
};

const sendCertificateGenerationEmail = async (userData, pdfLink) => {
    const full_name = userData.full_name
    const email_id = userData.email_id
    const pass_subject = `You’ve Earned It! 🎉 Download Your Coinpedia Certificate`
    const header_profile_section = `You’ve Earned It! 🎉 Download Your Coinpedia Certificate`

    const pass_message = `
            <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                <h3>Hi ${full_name},</h3>
                <p>Great news — your <b>Coinpedia Academy Certificate of Completion has been generated! 🎉</b></p>
                <p style="margin: 0 0 8px">You can now download it instantly and showcase your achievement.</p>
                <a href="https://image.coinpedia.org/${pdfLink}">
                                    <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                                    font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">Download</button>
                                </a>

            <p>Add it to your <b>LinkedIn, resume, or portfolio</b> to highlight your new skills.
Keep learning. Keep growing 🚀</p>
            </div>`

    sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

    return { status: true }
}