require('dotenv').config()
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const APP_SUPPORT_EMAIL_ID = process.env.APP_SUPPORT_EMAIL_ID
const EVENTS_SUPPORT_EMAIL_ID = process.env.EVENTS_SUPPORT_EMAIL_ID

const sendGridMail = require('@sendgrid/mail')
sendGridMail.setApiKey(SENDGRID_API_KEY)
const { getPresentDateTime, longDateFormat } = require('../utils/helpers/helper')

const sendEmail = async (pass_email_id, pass_subject, pass_message) => {
    const year_only = new Date().getFullYear()
    const htmlCode = `<html><head> <meta http-equiv="Content-Type" content="text/html; charset=utf-8" /><link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet" /></head><body style="background: #F8F8FC; font-family:roboto; padding-top: 20px;"><div style="max-width:700px;min-width:295px;margin:0 auto;border-radius: 5px;"><div style="border-radius: 6px;"><div style="max-width:700px;min-width:295px;margin:0 auto;background: transparent; padding: 15px 23px 16px 0px; text-align: center; border-top-left-radius: 5px; border-top-right-radius: 5px;"><a href="https://events.coinpedia.org" style="color: #fff !important; text-decoration: none !important;"><img src="https://image.coinpedia.org/wp-content/uploads/2022/11/15152824/logo_email.png" style="margin-bottom: -24px;" /></a></div><div style="background: white;"><img src="https://image.coinpedia.org/app_uploads/emails/banner.png" alt="banner-img" style="width:100%;background: white;"></div><div style="background:#FFFFFF;color: #13002D;font-weight: 400;text-align: left;font-size: 17px;padding: 20px 25px 20px;line-height: 25px;">${pass_message}<p style="margin-top: 40px;color:#000;font-weight: 400;font-size:17px;">For any queries <a  href="mailto:${APP_SUPPORT_EMAIL_ID}" style="color:#0029FF;">Contact Us</a></p><p style="font-weight: 700; margin-bottom:0px; color:#000;font-size:17px;">Thanks for choosing us.</p><p style="margin-top:0px;color:#000;font-weight: 400;font-size:17px;">Team Coinpedia</p></div><footer style="background-color: #F8F8FC; padding-bottom: 40px;">
    <div style="color:#13002D;text-align: center;">
        <h4 style="text-align:center;padding-top: 40px;">Follow us</h4>
        <section style="text-align:center;">
        <span><a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/app_uploads/emails/feed.png" style="margin-right: 5px;"></a></span>
        <span><a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/app_uploads/emails/facebook.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://twitter.com/Coinpedianews"><img src="https://image.coinpedia.org/app_uploads/emails/twitter.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://in.pinterest.com/CoinpediaNews/"><img src="https://image.coinpedia.org/app_uploads/emails/pintrest.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/app_uploads/emails/linkedin.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/app_uploads/emails/instagram.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/app_uploads/emails/medium.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/app_uploads/emails/telegram.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/app_uploads/emails/steemit.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/app_uploads/emails/quora.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/app_uploads/emails/substack.png"  style="margin-right: 5px;"></a></span>
        <span><a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/app_uploads/emails/gettr.png"  style="margin-right: 5px;"></a></span>
        </section>     

        <h6 style="text-align:center; font-size:15px; color:#13002D; text-decoration: none;margin: 0px 110px;line-height:25.27px;font-weight: 400;">
            <span><a href="https://coinpedia.org/about-coinpedia/" style=" color:#13002D; text-decoration: none;">About Us</a><span> | </span></span>
            <span><a href="https://coinpedia.org/advertising/" style=" color:#13002D; text-decoration: none;">Advertise</a><span> | </span></span>
            <span><a href="https://app.coinpedia.org/partners" style=" color:#13002D; text-decoration: none;">Partners </a><span> | </span></span>
            <span><a href="https://coinpedia.org/authors/" style=" color:#13002D; text-decoration: none;">Authors</a><span> | </span></span>
            <span><a href="https://coinpedia.org/privacy-policy/" style=" color:#13002D; text-decoration: none;">Privacy Policy</a><span> | </span></span>
            <span><a href="https://coinpedia.org/terms-and-conditions/" style=" color:#13002D; text-decoration: none;">Terms & Conditions</a><span> | </span></span>
            <span><a href="https://coinpedia.org/editorial-policy/" style=" color:#13002D; text-decoration: none;">Editorial Policy</a><span> | </span></span>
            <span><a href="https://app.coinpedia.org/feedback" style=" color:#13002D; text-decoration: none;">Feedback</a></span>
        </h6>
        <p style="text-align:center;font-size: 14px;"> &copy; Copyright ${year_only}, All Right Reserved | Coinpedia</a></p>
    </div>
    </footer></div></div></body></html>`

    if (pass_email_id) {
        await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 1)
    }
}


const sendSendGridEmail = async (pass_email_id, pass_subject, pass_html_code, pass_domain_type, attendee_row_id, event_row_id) => {
    try {
        let from_name = 'Coinpedia'
        let from_email = 'info@coinpedia.org'
        if (pass_domain_type == 2) {
            from_name = 'Coinpedia Academy'
        }
        else if (pass_domain_type == 3) {
            from_name = 'Coinpedia Events'
        }

        let getMessage = {
            to: pass_email_id,
            from: {
                name: from_name,
                email: from_email
            },
            subject: pass_subject,
            html: pass_html_code,

        }
        if (event_row_id && attendee_row_id) {
            getMessage.customArgs = {
                event_row_id: event_row_id,
                attendee_row_id: attendee_row_id,

            }
        }

        // await sendGridMail.send(getMessage).then(response =>  console.log('Test email sent successfully', response))
        // .catch(error => console.log(error))
        const response = await sendGridMail.send(getMessage)

        const sg_message_id = response[0].headers['x-message-id']

        console.log('Email sent successfully', response)
        return sg_message_id
    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }
}


const sendAcademyEmail = async (pass_email_id, pass_subject, pass_message, header_profile_section) => {
    const date = new Date();
    const todayDate = date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
    const year_only = new Date().getFullYear()
    try {
        const htmlCode = `<html>
        <head>
            <meta http-equiv='Content-Type' content='text/html; charset=utf-8'>
            <style>
                @media(max-width: 768px) {
                    .font_size_element {
                    font-size: 18px !important;
                    }

                    .logo_responsive {
                    width: 150px;
                    }
                }
            </style>
        </head>
        <body>
            <div style='background: #f8f8fc; padding: 15px; border-radius: 10px;'>
                <div style="max-width:600px; margin:0 auto; font-family:Arial, sans-serif;">
                    <div style="background:url('https://image.coinpedia.org/static/common/email_header.jpg'); background-size: cover; padding:70px 0; text-align:center; position:relative;">
                        <img src='https://image.coinpedia.org/static/common/logo-light.png'
                            alt="CoinPedia"
                            style="max-width:200px; display:inline-block;">
                    </div>
                    <div style="background:linear-gradient(90deg,#e53935,#1e88e5);width:100%;font-size:14px;color:#fff;justify-content: space-between;align-items: center;">
                        <div style="padding:8px 15px;">
                            Academy’s Newsletter
                            <span style="float:right;">${todayDate}</span>
                        </div>
                    </div>
                </div>
                <div style='max-width: 600px; min-width: 295px; margin: 0 auto;  background: #fff;'>
                    <div  style='padding: 25px 0; margin: 0 30px; border-bottom: 1px solid #1717171A'>
                        <h2 style='font-size: 20px;font-weight: 800; color: #0473CE; margin: 0px' class='font_size_element'>${header_profile_section}</h2>
                    </div>
                    ${pass_message}  
                    <div  style='padding: 0 30px 20px;'>
                    <p>
                        Thank you for Trusting us.<br/>
                        <span style="color: #0052CC; font-weight: bold;">Team CoinPedia</span>
                        <span style="float: right">For any queries <a href="https://coinpedia.org/contact-us" style="color: #0052CC; font-weight: bold; text-decoration:none;">Contact Us</span>
                    </p>
                </div>

                </div>

                <div style="max-width:600px; margin:0 auto; text-align:center; margin-top: 25px">

                    <div style="border:1px solid #eee; padding:15px; margin-bottom:20px;">
                    <p style="font-size:18px; margin:0; font-weight:bold;">
                        Stay Ahead in Crypto!
                    </p>
                    <p style="font-size:16px; margin:5px 0; color:#d32f2f; font-weight:bold;">
                        Download the Coinpedia App Now!
                    </p>
                    <div style="margin-top:10px;">
                        <a href="https://apps.apple.com/us/app/coinpedia/id1671781933" style="display:inline-block; margin-right:10px;">
                        <img src="https://image.coinpedia.org/static/common/download-apple.png" alt="App Store" style="height:40px;">
                        </a>
                        <a href="https://play.google.com/store/apps/details?id=io.coinpedia.cryptonews&hl=en_IN&pli=1" style="display:inline-block;">
                        <img src="https://image.coinpedia.org/static/common/download-google.png" alt="Google Play" style="height:40px;">
                        </a>
                    </div>
                </div>

                <p style="font-size:16px; margin:0 0 10px 0; font-weight:bold;">Follow us</p>
                <div style="margin-bottom:20px;">
                    <a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/static/common/bg-rss-feed.png" style="width:24px; margin:0 5px;" alt="RSS"></a>
                    <a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/static/common/bg-facebook.png" style="width:24px; margin:0 5px;" alt="Facebook"></a>
                    <a href="https://x.com/Coinpedianews"><img src="https://image.coinpedia.org/static/common/bg-x.png" style="width:24px; margin:0 5px;" alt="X"></a>
                    <a href="https://in.pinterest.com/coinpedianews/"><img src="https://image.coinpedia.org/static/common/bg-pinterest.png" style="width:24px; margin:0 5px;" alt="Pinterest"></a>
                    <a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/static/common/bg-linkedin.png" style="width:24px; margin:0 5px;" alt="LinkedIn"></a>
                    <a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/static/common/bg-instagram.png" style="width:24px; margin:0 5px;" alt="Instagram"></a>
                    <a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/static/common/bg-telegram.png" style="width:24px; margin:0 5px;" alt="Telegram"></a>
                    <a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/static/common/bg-medium.png" style="width:24px; margin:0 5px;" alt="Medium"></a>
                    <a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/static/common/bg-quora.png" style="width:24px; margin:0 5px;" alt="Quora"></a>
                    <a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/static/common/bg-steemit.png" style="width:24px; margin:0 5px;" alt="Steemit"></a>
                    <a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/static/common/bg-substack.png" style="width:24px; margin:0 5px;" alt="Substack"></a>
                    <a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/static/common/bg-gettr.png" style="width:24px; margin:0 5px;" alt="Gettr"></a>
                </div>

                <div style="font-size:12px; color:#555; margin-bottom:10px; line-height: 2">
                <a href="https://coinpedia.org/about-coinpedia/" style="color:#555; text-decoration:none; margin: 5px;">About Us</a><span> | </span>
                <a href="https://coinpedia.org/advertising/" style="color:#555; text-decoration:none; margin:0 5px;">Advertise</a><span> | </span>
                <a href="https://app.coinpedia.org/partners" style="color:#555; text-decoration:none; margin:0 5px;">Partners </a><span> | </span>
                <a href="https://coinpedia.org/authors/" style="color:#555; text-decoration:none; margin:0 5px;">Authors</a><span> | </span>
                <a href="https://coinpedia.org/privacy-policy/" style="color:#555; text-decoration:none; margin:0 5px;">Privacy Policy</a><span> | </span>
                <a href="https://coinpedia.org/terms-and-conditions/" style="color:#555; text-decoration:none; margin:0 5px;">Terms & Conditions</a><span> | </span>
                <a href="https://coinpedia.org/editorial-policy/" style="color:#555; text-decoration:none; margin:0 5px;">Editorial Policy</a><span> | </span>
                <a href="https://app.coinpedia.org/feedback" style="color:#555; text-decoration:none; margin:0 5px;">Feedback</a>
                </div>

                <p style="font-size:12px; color:#777; margin:0;">
                © Copyright ${year_only}, All Rights Reserved   •   ❤️ From Coinpedia
                </p>

            </div>
            </div>
            
            </body>
        </html>`

        if (pass_email_id) {
            await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 2)
        }

    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }

    // return true
}


const sendCommunityEmail = async (pass_email_id, pass_subject, pass_message, header_profile_section) => {
    const date = new Date();
    const todayDate = date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
    const year_only = new Date().getFullYear()
    try {
        const htmlCode = `<html>
        <head>
            <meta http-equiv='Content-Type' content='text/html; charset=utf-8'>
            <style>
                @media(max-width: 768px) {
                    .font_size_element {
                    font-size: 18px !important;
                    }

                    .logo_responsive {
                    width: 150px;
                    }
                }
            </style>
        </head>
        <body>
            <div style='background: #f8f8fc; padding: 15px; border-radius: 10px;'>
                <div style="max-width:600px; margin:0 auto; font-family:Arial, sans-serif;">
                    <div style="background:url('https://image.coinpedia.org/static/common/email_header.jpg'); background-size: cover; padding:70px 0; text-align:center; position:relative;">
                        <img src='https://image.coinpedia.org/static/common/logo-light.png'
                            alt="CoinPedia"
                            style="max-width:200px; display:inline-block;">
                    </div>
                    <div style="background:linear-gradient(90deg,#e53935,#1e88e5);width:100%;font-size:14px;color:#fff;justify-content: space-between;align-items: center;">
                        <div style="padding:8px 15px;">
                            Community’s Newsletter
                            <span style="float:right;">${todayDate}</span>
                        </div>
                    </div>
                </div>
                <div style='max-width: 600px; min-width: 295px; margin: 0 auto;  background: #fff;'>
                    <div  style='padding: 25px 0; margin: 0 30px; border-bottom: 1px solid #1717171A'>
                        <h2 style='font-size: 20px;font-weight: 800; color: #0473CE; margin: 0px' class='font_size_element'>${header_profile_section}</h2>
                    </div>
                    ${pass_message}  
                    <div  style='padding: 0 30px 20px;'>
                    <p>
                        Thank you for Trusting us.<br/>
                        <span style="color: #0052CC; font-weight: bold;">Team CoinPedia</span>
                        <span style="float: right">For any queries <a href="https://coinpedia.org/contact-us" style="color: #0052CC; font-weight: bold; text-decoration:none;">Contact Us</span>
                    </p>
                </div>

                </div>

                <div style="max-width:600px; margin:0 auto; text-align:center; margin-top: 25px">

                    <div style="border:1px solid #eee; padding:15px; margin-bottom:20px;">
                    <p style="font-size:18px; margin:0; font-weight:bold;">
                        Stay Ahead in Crypto!
                    </p>
                    <p style="font-size:16px; margin:5px 0; color:#d32f2f; font-weight:bold;">
                        Download the Coinpedia App Now!
                    </p>
                    <div style="margin-top:10px;">
                        <a href="https://apps.apple.com/us/app/coinpedia/id1671781933" style="display:inline-block; margin-right:10px;">
                        <img src="https://image.coinpedia.org/static/common/download-apple.png" alt="App Store" style="height:40px;">
                        </a>
                        <a href="https://play.google.com/store/apps/details?id=io.coinpedia.cryptonews&hl=en_IN&pli=1" style="display:inline-block;">
                        <img src="https://image.coinpedia.org/static/common/download-google.png" alt="Google Play" style="height:40px;">
                        </a>
                    </div>
                </div>

                <p style="font-size:16px; margin:0 0 10px 0; font-weight:bold;">Follow us</p>
                <div style="margin-bottom:20px;">
                    <a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/static/common/bg-rss-feed.png" style="width:24px; margin:0 5px;" alt="RSS"></a>
                    <a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/static/common/bg-facebook.png" style="width:24px; margin:0 5px;" alt="Facebook"></a>
                    <a href="https://x.com/Coinpedianews"><img src="https://image.coinpedia.org/static/common/bg-x.png" style="width:24px; margin:0 5px;" alt="X"></a>
                    <a href="https://in.pinterest.com/coinpedianews/"><img src="https://image.coinpedia.org/static/common/bg-pinterest.png" style="width:24px; margin:0 5px;" alt="Pinterest"></a>
                    <a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/static/common/bg-linkedin.png" style="width:24px; margin:0 5px;" alt="LinkedIn"></a>
                    <a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/static/common/bg-instagram.png" style="width:24px; margin:0 5px;" alt="Instagram"></a>
                    <a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/static/common/bg-telegram.png" style="width:24px; margin:0 5px;" alt="Telegram"></a>
                    <a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/static/common/bg-medium.png" style="width:24px; margin:0 5px;" alt="Medium"></a>
                    <a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/static/common/bg-quora.png" style="width:24px; margin:0 5px;" alt="Quora"></a>
                    <a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/static/common/bg-steemit.png" style="width:24px; margin:0 5px;" alt="Steemit"></a>
                    <a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/static/common/bg-substack.png" style="width:24px; margin:0 5px;" alt="Substack"></a>
                    <a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/static/common/bg-gettr.png" style="width:24px; margin:0 5px;" alt="Gettr"></a>
                </div>

                <div style="font-size:12px; color:#555; margin-bottom:10px; line-height: 2">
                <a href="https://coinpedia.org/about-coinpedia/" style="color:#555; text-decoration:none; margin: 5px;">About Us</a><span> | </span>
                <a href="https://coinpedia.org/advertising/" style="color:#555; text-decoration:none; margin:0 5px;">Advertise</a><span> | </span>
                <a href="https://app.coinpedia.org/partners" style="color:#555; text-decoration:none; margin:0 5px;">Partners </a><span> | </span>
                <a href="https://coinpedia.org/authors/" style="color:#555; text-decoration:none; margin:0 5px;">Authors</a><span> | </span>
                <a href="https://coinpedia.org/privacy-policy/" style="color:#555; text-decoration:none; margin:0 5px;">Privacy Policy</a><span> | </span>
                <a href="https://coinpedia.org/terms-and-conditions/" style="color:#555; text-decoration:none; margin:0 5px;">Terms & Conditions</a><span> | </span>
                <a href="https://coinpedia.org/editorial-policy/" style="color:#555; text-decoration:none; margin:0 5px;">Editorial Policy</a><span> | </span>
                <a href="https://app.coinpedia.org/feedback" style="color:#555; text-decoration:none; margin:0 5px;">Feedback</a>
                </div>

                <p style="font-size:12px; color:#777; margin:0;">
                © Copyright ${year_only}, All Rights Reserved   •   ❤️ From Coinpedia
                </p>

            </div>
            </div>
            
            </body>
        </html>`

        if (pass_email_id) {
            await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 2)
        }

    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }

    // return true
}



const sendEventsEmail = async (pass_email_id, pass_subject, pass_message, attendee_row_id, event_row_id,) => {
    try {
        const year_only = new Date().getFullYear()
        const htmlCode = `<html>
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
            <link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet" />
            <style>
                @media(max-width: 768px) {
                    .font_size_element {
                        height: 120px;
                    }

                    .logo_responsive {
                    width: 150px;
                    }
                }
            </style>
        </head>
        <body style="background: #F8F8FC; font-family:roboto; padding-top: 20px;">
        <div style="max-width:700px;min-width:295px;margin:0 auto;border-radius: 5px;">
        <div style="border-radius: 6px;">
            <div style="max-width:700px;min-width:295px;margin:0 auto;background: transparent; padding: 15px 23px 16px 0px; text-align: center; border-top-left-radius: 5px; border-top-right-radius: 5px;">
                <a href="https://events.coinpedia.org" style="color: #fff !important; text-decoration: none !important;">
                    <img src="https://image.coinpedia.org/wp-content/uploads/2022/11/15152824/logo_email.png" style="margin-bottom: -24px;" />
                </a>
            </div>
            <div style="background: white;">
            <img src="https://image.coinpedia.org/app_uploads/emails/banner.png" alt="banner-img" style="width:100%;background: white;">
            </div> 
            <div style="background:#FFFFFF;color: #13002D;font-weight: 400;text-align: left;font-size: 17px;padding: 20px 25px 20px;line-height: 25px;">  
            ${pass_message}
            <p style="margin-top: 40px;color:#000;">Need support ? Reach <a href="mailto:${EVENTS_SUPPORT_EMAIL_ID}"style="color:#0029FF;">Here</a></p>
            <p style="margin-bottom:0px; font-weight: 700;color:#000;">Thanks for choosing us.</p>
            <p style="margin-top:0px;color:#000">Team Coinpedia</p>

            </div>    
            <footer style="background-color: #F8F8FC; padding-bottom: 40px;">
                <div style="color:#13002D;">
                    
                    <h4 style="text-align:center;padding-top: 40px;color:#565362;">Follow us</h4>
                    <section style="text-align:center;">
                    <span><a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/app_uploads/emails/feed.png" style="margin-right: 5px;"></a></span>
                    <span><a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/app_uploads/emails/facebook.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://twitter.com/Coinpedianews"><img src="https://image.coinpedia.org/app_uploads/emails/twitter.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://in.pinterest.com/CoinpediaNews/"><img src="https://image.coinpedia.org/app_uploads/emails/pintrest.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/app_uploads/emails/linkedin.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/app_uploads/emails/instagram.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/app_uploads/emails/medium.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/app_uploads/emails/telegram.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/app_uploads/emails/steemit.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/app_uploads/emails/quora.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/app_uploads/emails/substack.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/app_uploads/emails/gettr.png"  style="margin-right: 5px;"></a></span>
                    </section>       
    
                    
                    <div style="text-align:center; font-size:15px; color:#13002D; text-decoration: none;margin: 20px;font-weight: 400;">
                        <span><a href="https://coinpedia.org/about-coinpedia/" style=" color:#13002D; text-decoration: none;">About Us</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/advertising/" style=" color:#13002D; text-decoration: none;">Advertise</a><span> | </span></span>
                        <span><a href="https://app.coinpedia.org/partners" style=" color:#13002D; text-decoration: none;">Partners </a><span> | </span></span>
                        <span><a href="https://coinpedia.org/authors/" style=" color:#13002D; text-decoration: none;">Authors</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/privacy-policy/" style=" color:#13002D; text-decoration: none;">Privacy Policy</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/terms-and-conditions/" style=" color:#13002D; text-decoration: none;">Terms & Conditions</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/editorial-policy/" style=" color:#13002D; text-decoration: none;">Editorial Policy</a><span> | </span></span>
                        <span><a href="https://app.coinpedia.org/feedback" style=" color:#13002D; text-decoration: none;">Feedback</a></span>
                    </div>
                    
                    <p style="text-align:center;font-size: 14px;"> &copy; Copyright ${year_only}, All Right Reserved | Coinpedia</p>
                </div>
            </footer>
        </div>
    </div>
    </body>
</html>`

        let response = ""
        if (pass_email_id) {
            if (attendee_row_id && event_row_id) {
                response = await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 3, attendee_row_id, event_row_id)
            }
            else {
                await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 3)
            }
        }

        return response

    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }
}

const sendNewsEventsEmail = async (pass_email_id, pass_subject, pass_message, header_profile_section, attendee_row_id, event_row_id) => {
    const date = new Date();
    const todayDate = date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
    const year_only = new Date().getFullYear()
    try {
        const htmlCode = `<html>
        <head>
            <meta http-equiv='Content-Type' content='text/html; charset=utf-8'>
            <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300..900&display=swap" rel="stylesheet">
            <style>
            .email_body {
                font-family: "Figtree", sans-serif !important;
            }
               .ticket_item {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .what_next_item {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                @media(max-width: 768px) {
                    .font_size_element {
                        height: 120px;
                    }

                    .logo_responsive {
                    width: 150px;
                    }
                    .ticket_item {
                        display: block !important;
                    }
                    .what_next_item {
                        display: block !important;
                    }
                    .what_next_item h6 {
                        margin: 8px 0 !important;
                    }
                    .ticket_item h5 {
                        margin: 8px 0 !important;
                    }
                    .what_next_item button {
                        margin: 8px 0 0 0 !important;
                    }
                    .discount_copy {
                        margin-top: 4px !important;
                    }
                    .queries_link {
                        float: none !important;
                        display: block !important;
                    }
                }
            </style>
        </head>
        <body class="email_body">
            <div style='background: #f8f8fc; padding: 15px; border-radius: 10px;'>
                <div style="max-width:600px;min-width:295px;margin:0 auto; font-family: 'Figtree', sans-serif !important; line-height: 1.6;">
                    <div style="background:url('https://image.coinpedia.org/static/common/email_header.jpg'); background-size: cover; padding:70px 0; background-size: contain; text-align:center; position:relative;">
                        <img src='https://image.coinpedia.org/static/common/logo-light.png'
                            alt="CoinPedia"
                            style="max-width:200px; display:inline-block;">
                    </div>
                    <div style="background:linear-gradient(90deg,#e53935,#1e88e5);width:100%;font-size:14px;color:#fff;justify-content: space-between;align-items: center;">
                        <div style="padding:8px 15px; font-family: 'Figtree', sans-serif !important;">
                            Events Newsletter
                            <span style="float:right;">${todayDate}</span>
                        </div>
                    </div>
                </div>
                <div style="max-width: 600px; min-width: 295px; margin: 0 auto;  background: #fff; font-family: 'Figtree', sans-serif !important;">
                    <div  style='padding: 25px 0; margin: 0 30px; border-bottom: 1px solid #1717171A'>
                        <h2 style='font-family: 'Figtree', sans-serif !important; font-size: 20px;font-weight: 800; color: #0473CE; margin: 0px' class='font_size_element'>${header_profile_section}</h2>
                    </div>
                    ${pass_message}  
                    <div  style='padding: 0 30px 20px;'>
                    <p style="font-family: 'Figtree', sans-serif !important;">
                        Thank you for Trusting us.<br/>
                        <span style="color: #0052CC; font-weight: bold; font-family: 'Figtree', sans-serif !important;">Team CoinPedia</span>
                        <span style="float: right; font-family: 'Figtree', sans-serif !important;" class="queries_link">For any queries <a href="https://coinpedia.org/contact-us" style="color: #0052CC; font-weight: bold; text-decoration:none;">Contact Us</span>
                    </p>
                </div>

                </div>

                <div style="max-width:600px; margin:0 auto; text-align:center; margin-top: 25px">

                    <div style="border:1px solid #eee; padding:15px; margin-bottom:20px;">
                    <p style="font-size:18px; font-family: 'Figtree', sans-serif !important; margin:0; font-weight:bold;">
                        Stay Ahead in Crypto!
                    </p>
                    <p style="font-size:16px; font-family: 'Figtree', sans-serif !important; margin:5px 0; color:#d32f2f; font-weight:bold;">
                        Download the Coinpedia App Now!
                    </p>
                    <div style="margin-top:10px;">
                        <a href="https://apps.apple.com/us/app/coinpedia/id1671781933" style="display:inline-block; margin-right:10px;">
                        <img src="https://image.coinpedia.org/static/common/download-apple.png" alt="App Store" style="height:40px;">
                        </a>
                        <a href="https://play.google.com/store/apps/details?id=io.coinpedia.cryptonews&hl=en_IN&pli=1" style="display:inline-block;">
                        <img src="https://image.coinpedia.org/static/common/download-google.png" alt="Google Play" style="height:40px;">
                        </a>
                    </div>
                </div>

                <p style="font-size:16px; margin:0 0 10px 0; font-weight:bold; font-family: 'Figtree', sans-serif !important;">Follow us</p>
                <div style="margin-bottom:20px;">
                    <a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/static/common/bg-rss-feed.png" style="width:24px; margin:0 5px;" alt="RSS"></a>
                    <a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/static/common/bg-facebook.png" style="width:24px; margin:0 5px;" alt="Facebook"></a>
                    <a href="https://x.com/Coinpedianews"><img src="https://image.coinpedia.org/static/common/bg-x.png" style="width:24px; margin:0 5px;" alt="X"></a>
                    <a href="https://in.pinterest.com/coinpedianews/"><img src="https://image.coinpedia.org/static/common/bg-pinterest.png" style="width:24px; margin:0 5px;" alt="Pinterest"></a>
                    <a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/static/common/bg-linkedin.png" style="width:24px; margin:0 5px;" alt="LinkedIn"></a>
                    
                    <a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/static/common/bg-telegram.png" style="width:24px; margin:0 5px;" alt="Telegram"></a>
                    <a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/static/common/bg-medium.png" style="width:24px; margin:0 5px;" alt="Medium"></a>
                    <a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/static/common/bg-quora.png" style="width:24px; margin:0 5px;" alt="Quora"></a>
                    <a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/static/common/bg-steemit.png" style="width:24px; margin:0 5px;" alt="Steemit"></a>
                    <a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/static/common/bg-substack.png" style="width:24px; margin:0 5px;" alt="Substack"></a>
                    <a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/static/common/bg-gettr.png" style="width:24px; margin:0 5px;" alt="Gettr"></a>
                </div>

                <div style="font-size:12px; color:#555; margin-bottom:10px; line-height: 2">
                <a href="https://coinpedia.org/about-coinpedia/" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin: 5px;">About Us</a><span> | </span>
                <a href="https://coinpedia.org/advertising/" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Advertise</a><span> | </span>
                <a href="https://app.coinpedia.org/partners" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Partners </a><span> | </span>
                <a href="https://coinpedia.org/authors/" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Authors</a><span> | </span>
                <a href="https://coinpedia.org/privacy-policy/" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Privacy Policy</a><span> | </span>
                <a href="https://coinpedia.org/terms-and-conditions/" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Terms & Conditions</a><span> | </span>
                <a href="https://coinpedia.org/editorial-policy/" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Editorial Policy</a><span> | </span>
                <a href="https://app.coinpedia.org/feedback" style="color:#555; text-decoration:none;font-family: 'Figtree', sans-serif !important; margin:0 5px;">Feedback</a>
                </div>

                <p style="font-size:12px; color:#777; margin:0; font-family: 'Figtree', sans-serif !important;">
                © Copyright ${year_only}, All Rights Reserved   •   ❤️ From Coinpedia
                </p>

            </div>
            </div>
            
            </body>
        </html>`
        // <a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/static/common/bg-instagram.png" style="width:24px; margin:0 5px;" alt="Instagram"></a>

        if (pass_email_id) {
            if (attendee_row_id && event_row_id) {
                await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 3, attendee_row_id, event_row_id)
            }
            else {
                await sendSendGridEmail(pass_email_id, pass_subject, htmlCode, 3)
            }
        }

    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }

    // return true
}


const weeklyNewsletterEmail = async (pass_email_id, pass_subject, pass_message, newsletter_title) => {
    try {
        const year_only = new Date().getFullYear()
        const pass_html_code = `
        <html>
   <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      </meta>
      <link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet" />
   </head>
   <body style="background: #F3F2F6 ;font-family:roboto;">
      <div style="max-width:800px;min-width:295px;margin:0 auto;border-radius: 5px;">
      <div style="background-color:#fff;border-radius: 6px;">
        <div style="max-width:700px;min-width:295px;margin:0 auto;background: transparent; padding: 15px 23px 16px 0px; text-align: center; border-top-left-radius: 5px; border-top-right-radius: 5px;">
            <a href="https://app.coinpedia.org" style="color: #F3F2F6 !important; text-decoration: none !important;">
            <img src="https://image.coinpedia.org/wp-content/uploads/2022/11/15152824/logo_email.png" style="margin-top: 40px;margin-bottom: 0px;width: 200px;background:#fff;" />
            </a>
        </div>
        
         <!-- <div>
            <img src="https://image.coinpedia.org/wp-content/uploads/2022/11/15163207/listed_email_banner.png" style="width:100%;margin-top:20px;height: auto;">
            <img src="https://image.coinpedia.org/wp-content/uploads/2022/11/15163203/email_image.png" alt="banner-img" style="width: auto;height: auto; margin-top: -205px;margin-left: 245px; margin-bottom: -200px;">
         </div> -->

         <div class="">

         </div>

         <div >
         <div style="background:#FFFFFF;color: #13002D;font-weight: 400;text-align: left;font-size: 17px;padding: 20px 35px 26px;line-height: 25px;">
                <img src="https://image.coinpedia.org/app_uploads/emails/banner.jpg" style="width: 100%;" />
                ${pass_message}
                
                <p style="margin-top: 40px;">Happy trading, and may the crypto winds be ever in your favor! ????</p>
             
                <p style="margin-top: 40px; font-weight: 700;">Thanks for choosing us.</p>
                <p style="margin-top: -15px; color:#1867fa;font-weight: 700;">Team Coinpedia</p>
            </div>
            
            <footer style="padding-bottom: 40px; border-top: 1px solid #f3f2f6;">
               <div style="color:#13002D;text-align: center;">
                  <h4 style="text-align:center;padding-top: 40px;">Follow us</h4>
                  <section style="text-align:center;">
                  <span><a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/app_uploads/emails/feed.png" style="margin-right: 5px;"></a></span>
                  <span><a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/app_uploads/emails/facebook.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://twitter.com/Coinpedianews"><img src="https://image.coinpedia.org/app_uploads/emails/twitter.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://in.pinterest.com/CoinpediaNews/"><img src="https://image.coinpedia.org/app_uploads/emails/pintrest.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/app_uploads/emails/linkedin.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/app_uploads/emails/instagram.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/app_uploads/emails/medium.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/app_uploads/emails/telegram.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/app_uploads/emails/steemit.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/app_uploads/emails/quora.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/app_uploads/emails/substack.png"  style="margin-right: 5px;"></a></span>
                  <span><a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/app_uploads/emails/gettr.png"  style="margin-right: 5px;"></a></span>
                  </section>     

                  <h6 style="text-align:center; font-size:15px; color:#13002D; text-decoration: none;margin: 0px 110px;line-height:25.27px;font-weight: 400;">
                     <span><a href="https://coinpedia.org/about-coinpedia/" style=" color:#13002D; text-decoration: none;">About Us</a><span> | </span></span>
                     <span><a href="https://coinpedia.org/advertising/" style=" color:#13002D; text-decoration: none;">Advertise</a><span> | </span></span>
                     <span><a href="https://app.coinpedia.org/partners" style=" color:#13002D; text-decoration: none;">Partners </a><span> | </span></span>
                     <span><a href="https://coinpedia.org/authors/" style=" color:#13002D; text-decoration: none;">Authors</a><span> | </span></span>
                     <span><a href="https://coinpedia.org/privacy-policy/" style=" color:#13002D; text-decoration: none;">Privacy Policy</a><span> | </span></span>
                     <span><a href="https://coinpedia.org/terms-and-conditions/" style=" color:#13002D; text-decoration: none;">Terms & Conditions</a><span> | </span></span>
                     <span><a href="https://coinpedia.org/editorial-policy/" style=" color:#13002D; text-decoration: none;">Editorial Policy</a><span> | </span></span>
                     <span><a href="https://app.coinpedia.org/feedback" style=" color:#13002D; text-decoration: none;">Feedback</a></span>
                  </h6>
                  <p style="text-align:center;font-size: 14px;"> &copy; Copyright ${year_only}, All Right Reserved | Coinpedia</a></p>
               </div>
            </footer>
         </div>
      </div>
   </body>
</html>
`
        try {
            let getMessage = {
                to: pass_email_id,
                from: {
                    name: 'Coinpedia',
                    email: 'info@coinpedia.org'
                },
                category: newsletter_title,
                categoryName: newsletter_title,
                subject: pass_subject,
                html: pass_html_code,
            }

            console.log("Email Newsletter Templete Name: ", newsletter_title)

            await sendGridMail.send(getMessage).then(response => console.log('Email sent successfully', response))
                .catch(error => console.log(error))
        }
        catch (error) {
            console.error('Error sending test email')
            console.error(error)
        }
    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }
}


const dailyNewsletterEmail = async (pass_email_id, pass_subject, pass_message, newsletter_title) => {
    try {
        const year_only = new Date().getFullYear()
        const date_time = getPresentDateTime()
        const formatted_date = longDateFormat(date_time)
        const pass_html_code = `
        <html>
        <head>
        <meta name="viewport" content="width=device-width">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <title>Price Prediction Newsletter</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet">

        <style>
            table td p img{
                margin-top: -4px !important;
            }
            @media (max-width: 780px) {
                .mb-width {
                    padding: 8px !important;
                    max-width: 100% !important;
                }

                .hide-in-desktop{
                display:block !important;
                }
            .hide-in-mobileview{
                display:none !important;
            }
            }
            @media (max-width: 580px) {
                .price-prediction-newsletter h2{
                    font-size: 18px !important;
                }
                .displayBlock{
                    display: block !important;
                }
                .displayBlock .crypto-block, .price-crypto-block{
                    width: 100% !important;
                }
                .crypto-block div{
                    margin: 14px 0 !important;
                }
                .crypto-block img{
                    margin-top: 10px;
                }
                .btn-margin{
                    margin-top: 6px !important;
                }
                .floatRight{
                    float: right !important;
                }
                .show-mobile{
                    display: block !important;
                }
                .hide-mobile{
                    display: none !important;
                }
                .fullwidthBtn{
                width: 80%;
                margin-top: 26px !important;
                margin-left: 0 !important;
                text-align:center !important;
                }
                .fullwidthBtn img{
                    verticle-align:middle !important;
                }
                .price-prediction-newsletter td{
                    padding-right: 10px !important;
                }
                .portfolio-overview ul li.nextlineBlock{
                    display: block !important;
                    border-right: 0 !important;
                    border-bottom: 1px solid #0066FF4D;
                    margin-bottom: 10px;
                    padding-bottom: 10px !important;
                }
                .text-align-center{
                    text-align: center;
                }
                .text-align-center h3{
                    margin-top: 6px !important;
                }
                .margin-top-0{
                    margin-top: 0;
                }
                .margin-bottom-0{
                    margin-bottom: 0;
                }
                .price-prediction-block{
                margin: 20px 0 0 !important;
                }
                .width-medium{
                width: 43%;
                }


            }
            @media (max-width: 436px) {
                .mb-btn-width{
                    display: block !important;  
                    float: unset !important;
                }
                .mb-btn-width button{
                    width: 100% !important;
                    margin-top: 10px !important;
                }
            }
        </style>
        </head>
        <body style="background: #F3F2F6 ;font-family:'Space Grotesk', sans-serif !important;overflow-x: hidden;">
        <div style="max-width: 700px;min-width:295px;margin: auto;width: 100%;" class="mb-width price-prediction-newsletter">
            <div style="text-align: center;border-bottom: 1px solid rgba(0, 102, 255, 0.5);width: 100%;">
                <a href="https://app.coinpedia.org" style="color: #F3F2F6 !important; text-decoration: none !important;">
                    <img src="https://image.coinpedia.org/app_uploads/emails/logo.png" style="margin-top: 30px;margin-bottom: 0px;width: 180px;" />
                </a>
                <h4 style="margin-top: 28px; color: #0066FF;margin-bottom: 10px;font-size: 18px; font-weight: 500;">DAILY
                    MARKETS & PREDICTION</h4>
                <h5 style="margin-top: 12px;color: rgba(23, 23, 23, 0.7); font-size: 14px;font-weight: 600;margin-bottom: 24px;">${formatted_date}</h5>
            </div>
            ${pass_message}

            <div style="color:#13002D;text-align: center;dispaly:block;background: #F3F2F6 ">
            <footer style="background: #F3F2F6 ;padding-bottom: 40px; border-top: 1px solid #f3f2f6;">
                    <h4 style="text-align:center;padding-top: 40px;">Follow us</h4>
                    <section style="text-align:center;">
                    <span><a href="https://coinpedia.org/feed/"><img src="https://image.coinpedia.org/app_uploads/emails/feed.png" style="margin-right: 5px;"></a></span>
                    <span><a href="https://www.facebook.com/Coinpedia.org/"><img src="https://image.coinpedia.org/app_uploads/emails/facebook.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://twitter.com/Coinpedianews"><img src="https://image.coinpedia.org/app_uploads/emails/twitter.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://in.pinterest.com/CoinpediaNews/"><img src="https://image.coinpedia.org/app_uploads/emails/pintrest.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://in.linkedin.com/company/coinpedia"><img src="https://image.coinpedia.org/app_uploads/emails/linkedin.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://www.instagram.com/coinpedianews/"><img src="https://image.coinpedia.org/app_uploads/emails/instagram.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://coinpediasfintechnews.medium.com/"><img src="https://image.coinpedia.org/app_uploads/emails/medium.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://t.me/CoinpediaMarket"><img src="https://image.coinpedia.org/app_uploads/emails/telegram.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://steemit.com/@coinpediacrypto"><img src="https://image.coinpedia.org/app_uploads/emails/steemit.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://www.quora.com/profile/Coinpedia-Fintech-News"><img src="https://image.coinpedia.org/app_uploads/emails/quora.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://coinpedian.substack.com/"><img src="https://image.coinpedia.org/app_uploads/emails/substack.png"  style="margin-right: 5px;"></a></span>
                    <span><a href="https://gettr.com/user/coinpediafintechnews"><img src="https://image.coinpedia.org/app_uploads/emails/gettr.png"  style="margin-right: 5px;"></a></span>
                    </section>     
                    <h6 style="text-align:center; font-size:15px; color:#13002D; text-decoration: none;margin: 0px 110px;line-height:25.27px;font-weight: 400;">
                        <span><a href="https://coinpedia.org/about-coinpedia/" style=" color:#13002D; text-decoration: none;">About Us</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/advertising/" style=" color:#13002D; text-decoration: none;">Advertise</a><span> | </span></span>
                        <span><a href="https://app.coinpedia.org/partners" style=" color:#13002D; text-decoration: none;">Partners </a><span> | </span></span>
                        <span><a href="https://coinpedia.org/authors/" style=" color:#13002D; text-decoration: none;">Authors</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/privacy-policy/" style=" color:#13002D; text-decoration: none;">Privacy Policy</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/terms-and-conditions/" style=" color:#13002D; text-decoration: none;">Terms & Conditions</a><span> | </span></span>
                        <span><a href="https://coinpedia.org/editorial-policy/" style=" color:#13002D; text-decoration: none;">Editorial Policy</a><span> | </span></span>
                        <span><a href="https://app.coinpedia.org/feedback" style=" color:#13002D; text-decoration: none;">Feedback</a></span>
                    </h6>
                    <p style="text-align:center;font-size: 14px;"> &copy; Copyright ${year_only}, All Right Reserved | Coinpedia</a></p>
                    </footer>
                </div>
        </div>
        </body>
        </html>
        `
        try {
            let getMessage = {
                to: pass_email_id,
                from: {
                    name: 'Coinpedia',
                    email: 'info@coinpedia.org'
                },
                category: newsletter_title,
                categoryName: newsletter_title,
                subject: pass_subject,
                html: pass_html_code,
            }

            console.log("Email Newsletter Templete Name: ", newsletter_title)

            await sendGridMail.send(getMessage).then(response => console.log('Email sent successfully', response))
                .catch(error => console.log(error))
        }
        catch (error) {
            console.error('Error sending test email')
            console.error(error)
        }
    }
    catch (error) {
        console.error('Error sending test email')
        console.error(error);
        if (error.response) {
            console.error(error.response.body)
        }
    }
}


module.exports = { sendEmail, sendAcademyEmail, sendCommunityEmail, sendEventsEmail, weeklyNewsletterEmail, dailyNewsletterEmail, sendNewsEventsEmail }