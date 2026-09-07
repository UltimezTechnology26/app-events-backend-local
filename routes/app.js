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

const { fundingRouter, companyFundingDetailsHandler } = require('../src/modules/funding/funding.controller')
const { companyAcquisitionsRouter } = require('../src/modules/company_acquisitions/company_acquisitions.controller')
const { appWorkExperienceRouter } = require('../src/modules/work-experience/work-experience.controller')
const { appTeamMembersRouter } = require('../src/modules/team-members/team-members.controller')
const { companyRouter } = require('../src/modules/company/company.controller')
const { companySettingsRouter } = require('../src/modules/company/settings/company.settings.controller')
const { companyFaqRouter } = require('../src/modules/company/faq/company.faq.controller')
const { companyManualAppRouter } = require('../src/modules/company_manual/company_manual.controller')
const { companyWatchlistRouter } = require('../src/modules/company_watchlist/company_watchlist.controller')
const { partnersAppRouter } = require('../src/modules/partners/partners.controller')
const { companyClaimRequestsAppRouter } = require('../src/modules/company_claim_requests/company_claim_requests.controller')
const { companyRevenueRouter } = require('../src/modules/company_revenue/company_revenue.controller')
const email_newsletter = require('../controllers/app/newsletter/email_newsletter')
const manual_users = require('../controllers/app/users/manual_users')

const event_watchlist = require('../controllers/app/watchlist/event')
//users - Ends here

//company - Starts here
const { companyProductsRouter } = require('../src/modules/company_products/company_products.controller')
const { companyHoldingsRouter } = require('../src/modules/company_holdings/company_holdings.controller')
//company - Ends here

const jobs = require('../controllers/app/jobs/job')
const { jobsRouter } = require('../src/modules/jobs/jobs.controller')
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
router.use('/setting', appWorkExperienceRouter)


router.use('/feedback', feedback)

router.use('/ticket', event_ticket)
router.use('/coupon', event_coupon)
router.use('/event', user_event)
router.use('/front_event', front_page_events)
router.use('/funding', fundingRouter)
router.use('/company_acquisitions', companyAcquisitionsRouter)
router.use('/email_newsletter', email_newsletter)
router.use('/manual_users', manual_users)
router.use('/notifications', notifications)
router.use('/notifications/push_notification', push_notification)

router.use('/event_watchlist', event_watchlist)
// controllers/app/watchlist/company.js fully migrated and deleted — every route it defined now
// lives directly in modules/company_watchlist/company_watchlist.controller.ts's companyWatchlistRouter.
router.use('/company_watchlist', companyWatchlistRouter)

//company
// controllers/app/company/setting.js fully migrated and deleted — every route it defined now
// lives directly in modules/company/settings/company.settings.controller.ts's companySettingsRouter.
router.use('/company/setting', companySettingsRouter)
// controllers/app/company/revenue.js fully migrated and deleted — every route it defined now
// lives directly in modules/company_revenue/company_revenue.controller.ts's companyRevenueRouter.
router.use('/company/revenue', companyRevenueRouter)
router.use('/company/front_page', partnersAppRouter)
router.use('/company/front_page', companyClaimRequestsAppRouter)
// controllers/app/company/front_page.js fully migrated and deleted (completeness follow-up) —
// every route it defined now lives directly in modules/company/company.controller.ts's
// companyRouter, mounted here.
router.use('/company/front_page', companyRouter)
// company_funding_details moved to modules/funding — mounted here directly to keep the original URL unchanged.
router.get('/company/front_page/company_funding_details/:company_row_id', companyFundingDetailsHandler)
// controllers/app/company/employee.js fully migrated and deleted — every route it defined now
// lives directly in modules/team-members/team-members.controller.ts's appTeamMembersRouter.
router.use('/company/employee', appTeamMembersRouter)
// controllers/app/company/manual_company.js fully migrated and deleted — every route it defined
// now lives directly in modules/company_manual/company_manual.controller.ts's companyManualAppRouter.
router.use('/company/manual_company', companyManualAppRouter)
// controllers/app/company/faq.js fully migrated and deleted — every route it defined now lives
// directly in modules/company/faq/company.faq.controller.ts's companyFaqRouter.
router.use('/company/faq', companyFaqRouter)
// controllers/app/company/products_n_holding/{index,company_holding,company_products}.js fully
// migrated and deleted — every route they defined now lives directly in
// modules/company_products/company_products.controller.ts's companyProductsRouter and
// modules/company_holdings/company_holdings.controller.ts's companyHoldingsRouter.
router.use('/company/products_n_holding', companyProductsRouter)
router.use('/company/products_n_holding', companyHoldingsRouter)

//jobs
// Write routes (add_n_update_details/delete/job_status) now live in jobsRouter (modules/jobs) -
// mounted first so its 3 routes take precedence; `jobs` still serves this file's own remaining
// read-only routes (list/education_type_list/skill_list), left unmigrated (see jobs.controller.ts).
router.use('/job', jobsRouter)
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