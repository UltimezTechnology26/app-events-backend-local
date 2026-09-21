const express = require('express')
const router = express.Router()

//users - Starts here
const auth = require('../controllers/app/users/auth')
const followers = require('../controllers/app/users/followers')
const setting = require('../controllers/app/users/setting')
const referrals = require('../controllers/app/users/referrals')
const { professionalsReferralsRouter } = require('../src/modules/professionals-referrals/professionals-referrals.controller')
const points = require('../controllers/app/users/points')
const { professionalsPointsRouter } = require('../src/modules/professionals-points/professionals-points.controller')
const link_page = require('../controllers/app/link_pages')
const feedback = require('../controllers/app/users/feedback')
const { professionalsFeedbackRouter } = require('../src/modules/professionals-feedback/professionals-feedback.controller')
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
const { professionalsSocialLinksRouter } = require('../src/modules/professionals-social-links/professionals-social-links.controller')
const { professionalsProfileImagesRouter } = require('../src/modules/professionals-profile-images/professionals-profile-images.controller')
const { professionalsSeoRouter } = require('../src/modules/professionals-seo/professionals-seo.controller')
const { professionalsAccountSettingsRouter } = require('../src/modules/professionals-account-settings/professionals-account-settings.controller')
const { appFollowersRouter } = require('../src/modules/professionals-followers/professionals-followers.controller')
const { professionalsSelfServiceRouter } = require('../src/modules/professionals/professionals.self-service.controller')
const email_newsletter = require('../controllers/app/newsletter/email_newsletter')
const manual_users = require('../controllers/app/users/manual_users')
const { professionalsManualRetrievalsSelfServiceRouter } = require('../src/modules/professionals-manual-retrievals/professionals-manual-retrievals.self-service.controller')

const event_watchlist = require('../controllers/app/watchlist/event')
//users - Ends here

//company - Starts here
const { companyProductsRouter } = require('../src/modules/company_products/company_products.controller')
const { companyHoldingsRouter } = require('../src/modules/company_holdings/company_holdings.controller')
//company - Ends here

const jobs = require('../controllers/app/jobs/job')
const { jobsRouter } = require('../src/modules/jobs/jobs.controller')
const job_applicant = require('../controllers/app/jobs/job_applicants')
const { professionalsJobApplicantsRouter } = require('../src/modules/professionals-job-applicants/professionals-job-applicants.controller')
//jobs Ends Here

const meetings = require('../controllers/app/meetings/meeting')
const { professionalsMeetingsRouter } = require('../src/modules/professionals-meetings/professionals-meetings.controller')
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
const { professionalsAwardsRouter } = require('../src/modules/professionals-awards/professionals-awards.controller')
const { professionalsFaqRouter } = require('../src/modules/professionals-faq/professionals-faq.controller')

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

// Professionals migration, Phase A (4-way setting.js split, per plan doc 2026-09-10 correction):
// SEO details, social links, and profile images ported out of setting.js into their own modules,
// matching Company's per-model granularity. Mounted at temporary `_v2` prefixes parallel to the
// untouched legacy '/setting' mount above — legacy setting.js has hundreds of other routes not in
// this phase's scope and stays fully live until each slice is verified and cut over.
router.use('/setting_social_links_v2', professionalsSocialLinksRouter)
router.use('/setting_profile_images_v2', professionalsProfileImagesRouter)
router.use('/setting_seo_v2', professionalsSeoRouter)
router.use('/setting_account_v2', professionalsAccountSettingsRouter)

// Professionals migration: followers.js's 9 routes ported into
// src/modules/professionals-followers/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/followers' mount above.
router.use('/followers_v2', appFollowersRouter)

// setting.js remaining-routes sweep: /update_user_details ported into
// src/modules/professionals/professionals.self-service.*. Mounted at a temporary `_v2` prefix,
// parallel to the untouched legacy '/setting' mount above.
router.use('/setting_profile_v2', professionalsSelfServiceRouter)

// Professionals migration gap-audit backlog: controllers/app/users/awards.js ported into
// src/modules/professionals-awards/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/users/awards' mount above.
router.use('/users/awards_v2', professionalsAwardsRouter)
// Professionals migration gap-audit backlog: controllers/app/users/faq.js ported into
// src/modules/professionals-faq/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/users/faq' mount above.
router.use('/users/faq_v2', professionalsFaqRouter)
// Professionals migration gap-audit backlog: controllers/app/users/points.js ported into
// src/modules/professionals-points/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/points' mount above.
router.use('/points_v2', professionalsPointsRouter)
// Professionals migration gap-audit backlog: controllers/app/users/referrals.js ported into
// src/modules/professionals-referrals/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/referrals' mount above.
router.use('/referrals_v2', professionalsReferralsRouter)


router.use('/feedback', feedback)
// Professionals migration gap-audit backlog: controllers/app/users/feedback.js (self-service)
// ported into src/modules/professionals-feedback/**. Mounted at a temporary `_v2` prefix, parallel
// to the untouched legacy '/feedback' mount above.
router.use('/feedback_v2', professionalsFeedbackRouter)

router.use('/ticket', event_ticket)
router.use('/coupon', event_coupon)
router.use('/event', user_event)
router.use('/front_event', front_page_events)
router.use('/funding', fundingRouter)
router.use('/company_acquisitions', companyAcquisitionsRouter)
router.use('/email_newsletter', email_newsletter)
router.use('/manual_users', manual_users)
// Professionals migration gap-audit backlog: controllers/app/users/manual_users.js (self-service)
// ported into src/modules/professionals-manual-retrievals/**. Mounted at a temporary `_v2` prefix,
// parallel to the untouched legacy '/manual_users' mount above.
router.use('/manual_users_v2', professionalsManualRetrievalsSelfServiceRouter)
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
// Professionals migration gap-audit backlog: controllers/app/jobs/job_applicants.js ported into
// src/modules/professionals-job-applicants/**. Mounted at a temporary `_v2` prefix, parallel to
// the untouched legacy '/job_applicant' mount above.
router.use('/job_applicant_v2', professionalsJobApplicantsRouter)

//meetings
router.use('/meeting', meetings)
// Professionals migration gap-audit backlog: controllers/app/meetings/meeting.js ported into
// src/modules/professionals-meetings/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/meeting' mount above.
router.use('/meeting_v2', professionalsMeetingsRouter)



//App ENDS HERE


//Static List DATA STARTS HERE
router.use('', app_static)
//Static List DATA ENDS HERE

//mobile 
router.use('/mobile/settings', mobile_settings)

module.exports = router