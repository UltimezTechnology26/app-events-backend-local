const header_title = `
<table width="100%" cellspacing="0" cellpadding="0" style="padding: 10px 0;"> 
<tr> 
<td style="font-size:22px;font-weight:800;color:#0473CE;font-family:'Figtree',sans-serif;"> 
Event Reminder! </td> 
<td align="right"> <img src="https://image.coinpedia.org/static/common/reminder_clock_yellow.png" style="width:48px;height:48px;"> </td> 
</tr> 
</table>
`;

const message_to_pass = `
<div style="padding: 5px 25px 20px 25px; font-size:16px; color:#000; font-family:'Figtree',sans-serif; line-height:1.7;">
//   <p><b>Hello ${user.full_name},</b></p>
//   <p>Your reminder for <b>${event.event_title}</b> is set and ready!</p>
//   <p>
//     <b>Starts at:</b> ${event.start_date} ${event.utc_time ? `(UTC${event.utc_time})` : ""}<br>
//     <b>Where:</b> ${event_location}
//   </p>
//   <a href="${event_url}">Check Details</a>
</div>
`;

//sendWatchlist Main template email.js

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
              @media(max-width: 568px) {
                .date_time {
                  float: none !important;
                  display: block;
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
                            <b>Events Newsletter</b>
                            <span style="float:right;" class="date_time">27 November 2025 at 04:46 pm</span>
                        </div>
                    </div>
                </div>
                <div style="max-width: 600px; min-width: 295px; margin: 0 auto;  background: #fff; font-family: 'Figtree', sans-serif !important;">
                    <div  style='padding: 25px 0; margin: 0 30px; border-bottom: 1px solid #1717171A'>
                        <h2 style="font-family: 'Figtree', sans-serif !important; font-size: 20px;font-weight: 800; color: #0473CE; margin: 0px">
                          Event Reminder! <img src="https://image.coinpedia.org/static/common/reminder_event.png" style="float: right; width: 30px" />
                        </h2>
                    </div>
                    <div style='padding: 25px 0; margin: 0 30px; border-bottom: 1px solid #1717171A'>
                    <p><b>Hello Rahat M,</b></p>

                    <p>Your reminder for Test hwgdwdw is set and ready!</p>

                    <p>Starts at: Thu Nov 27 2025 13:30:00 GMT+0530 (India Standard Time)</p>
                    <p>Where: Findon Valley Free Church (Baptist), 1-11 Lime Tree Ave, England, BN14 0DJ, United Kingdom</p>

                    <p>Check Details</p>
                    </div>
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
                        <img src="https://image.coinpedia.org/static/common/download-apple.png" alt="App Store" style="height:35px;">
                        </a>
                        <a href="https://play.google.com/store/apps/details?id=io.coinpedia.cryptonews&hl=en_IN&pli=1" style="display:inline-block;">
                        <img src="https://image.coinpedia.org/static/common/download-google.png" alt="Google Play" style="height:35px;">
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
