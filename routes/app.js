const express = require('express')
const router = express.Router()

//users - Starts here
const auth = require('../controllers/app/users/auth')
const followers = require('../controllers/app/users/followers')
const setting = require('../controllers/app/users/setting')
const referrals = require('../controllers/app/users/referrals')
const points = require('../controllers/app/users/points')
const link_page = require('../controllers/app/link_pages')
const feedback = require('../controllers/app/users/feedback')
const event_ticket = require('../controllers/app/events/event_ticket')
const event_coupon = require('../controllers/app/events/event_coupon')
const user_event = require('../controllers/app/events/events_listed')
const front_page_events = require('../controllers/app/events/front_page_events')

const funding = require('../controllers/app/funding')
const email_newsletter = require('../controllers/app/newsletter/email_newsletter')
const manual_users = require('../controllers/app/users/manual_users')

const event_watchlist = require('../controllers/app/watchlist/event')
const company_watchlist = require('../controllers/app/watchlist/company')
//users - Ends here

//company - Starts here
const company_setting = require('../controllers/app/company/setting')
const company_revenue = require('../controllers/app/company/revenue')
const company_front = require('../controllers/app/company/front_page')
const company_employee = require('../controllers/app/company/employee')
const manual_company = require('../controllers/app/company/manual_company')
const company_faq = require('../controllers/app/company/faq')
const products_n_holding = require('../controllers/app/company/products_n_holding/index')
const company_holding = require('../controllers/app/company/products_n_holding/company_holding')
const company_products = require('../controllers/app/company/products_n_holding/company_products')
//company - Ends here

const jobs = require('../controllers/app/jobs/job')
const job_applicant = require('../controllers/app/jobs/job_applicants')
//jobs Ends Here

const meetings = require('../controllers/app/meetings/meeting')
//Meeting Ends Here


const notifications = require('../controllers/app/notifications')
const push_notification = require('../controllers/app/notifications/push_notification')

const app_static = require('../controllers/app/static')
const search = require('../controllers/app/search')

//App STARTS HERE

//mobile app
const mobile_settings = require('../controllers/app/mobile_app/settings')
const users_faq = require('../controllers/app/users/faq')
const users_awards = require('../controllers/app/users/awards')

//users 
router.use('/auth', auth)
router.use('/followers', followers)
router.use('/referrals', referrals)
router.use('/points', points)
router.use('/link_page', link_page)
router.use('/search', search)

router.use('/users/faq', users_faq)
router.use('/users/awards', users_awards)
router.use('/setting', setting)


router.use('/feedback', feedback)

router.use('/ticket', event_ticket)
router.use('/coupon', event_coupon)
router.use('/event', user_event)
router.use('/front_event', front_page_events)
router.use('/funding', funding)
router.use('/email_newsletter', email_newsletter)
router.use('/manual_users', manual_users)
router.use('/notifications', notifications)
router.use('/notifications/push_notification', push_notification)

router.use('/event_watchlist', event_watchlist)
router.use('/company_watchlist', company_watchlist)

//company
router.use('/company/setting', company_setting)
router.use('/company/revenue', company_revenue)
router.use('/company/front_page', company_front)
router.use('/company/employee', company_employee)
router.use('/company/manual_company', manual_company)
router.use('/company/faq', company_faq)
router.use('/company/products_n_holding', products_n_holding)
router.use('/company/products_n_holding/company_holding', company_holding)
router.use('/company/products_n_holding/company_products', company_products)

//jobs
router.use('/job', jobs)
router.use('/job_applicant', job_applicant)

//meetings
router.use('/meeting', meetings)



//App ENDS HERE


//Static List DATA STARTS HERE
router.use('', app_static)
//Static List DATA ENDS HERE

//mobile 
router.use('/mobile/settings', mobile_settings)

module.exports = router