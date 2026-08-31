const express = require('express')
const router = express.Router()

//admin - Starts Here
const blocked_domian = require('../controllers/admin_panel/blocked_domian')
const dashboard = require('../controllers/admin_panel/dashboard')
const sub_admin = require('../controllers/admin_panel/sub_admin')
const sub_admin_auth = require('../controllers/admin_panel/sub_admin_auth')
const crypto_category = require('../controllers/admin_panel/category_tags/crypto_category')

const company_categories = require('../controllers/admin_panel/category_tags/company_business_model')
const regularities_details = require('../controllers/admin_panel/category_tags/regularity_details')
const area_of_interests = require('../controllers/admin_panel/category_tags/area_of_interests')
const category_tag_event_tags = require('../controllers/admin_panel/category_tags/event_tags')
const user_expertise_category = require('../controllers/admin_panel/category_tags/user_expertise')
const category_funding_rounds = require('../controllers/admin_panel/category_tags/funding_rounds')
const positions = require('../controllers/admin_panel/category_tags/positions')
const revenue_streams = require('../controllers/admin_panel/category_tags/revenue_streams')
const report_issues_options = require('../controllers/admin_panel/category_tags/report_issues_options')

const funding_investor_types = require('../controllers/admin_panel/category_tags/funding_investor_types')

const category_tag_experience_level = require('../controllers/admin_panel/category_tags/experience_level')
const crypto_networks = require('../controllers/admin_panel/category_tags/crypto_networks')
const admin_event = require('../controllers/admin_panel/events/event')


const email_newsletter = require('../controllers/admin_panel/app/newsletter/email_newsletter')
const subscribe_category = require('../controllers/admin_panel/app/newsletter/subscribe_category')
const { companyRevenueAdminRouter } = require('../src/modules/company_revenue/company_revenue.controller')
const { companyAdminRouter } = require('../src/modules/company_admin/company_admin.controller')
const { companyAdminApprovalsRouter } = require('../src/modules/company_admin/company_admin.approvals.controller')
const { companyCategoriesRouter } = require('../src/modules/company/company.categories.controller')
const { revenueStreamCategoriesRouter } = require('../src/modules/company_revenue/company_revenue.categories.controller')
const { fundingInvestorTypesRouter } = require('../src/modules/funding/funding.investor_types.controller')
const { fundingRoundsRouter } = require('../src/modules/funding/funding.rounds.controller')
const { regulatoryDetailsRouter } = require('../src/modules/company/company.regulatory_details.controller')
const admin_user = require('../controllers/admin_panel/app/user')
const admin_user_approvals = require('../controllers/admin_panel/app/user_approvals')

const admin_feedback = require('../controllers/admin_panel/app/feedback')
const { fundingRouter } = require('../src/modules/funding/funding.controller')
const { companyAcquisitionsRouter } = require('../src/modules/company_acquisitions/company_acquisitions.controller')
const { adminWorkExperienceRouter } = require('../src/modules/work-experience/work-experience.controller')
const { positionsRouter } = require('../src/modules/work-experience/work-experience.positions.controller')
const { adminTeamMembersRouter } = require('../src/modules/team-members/team-members.controller')
const notifications = require('../controllers/admin_panel/app/notifications')
const push_notification = require('../controllers/admin_panel/app/notifications/push_notification')


const admin_auth = require('../controllers/admin_panel/auth')
const email_performance = require('../controllers/admin_panel/email_performance')



const quiz_questions = require('../controllers/admin_panel/main/academy/quiz_questions')
const academy_lessons = require('../controllers/admin_panel/main/academy/lessons')
const faq_lessons = require('../controllers/admin_panel/main/academy/faq')

const academy_users = require('../controllers/admin_panel/main/academy/users')
const academy_courses = require('../controllers/admin_panel/main/academy/courses')
const academy_chapters = require('../controllers/admin_panel/main/academy/chapters')
const academy_overview = require('../controllers/admin_panel/main/academy/overview')

const polling = require('../controllers/admin_panel/main/polling')
const contests_questions = require('../controllers/admin_panel/main/contests/questions')
const weekly_contests = require('../controllers/admin_panel/main/contests/weekly_contests')


const community_groups = require('../controllers/admin_panel/main/community/groups')
const community_posts = require('../controllers/admin_panel/main/community/posts')
const community_overview = require('../controllers/admin_panel/main/community/overview')

const community_request_article = require('../controllers/admin_panel/main/community/request_article')
const community_21days_challenge = require('../controllers/admin_panel/main/community/21dayschallenge')

const job_skill = require('../controllers/admin_panel/app/jobs/skills')
const education_type = require('../controllers/admin_panel/app/jobs/education_type')
const meetings = require('../controllers/admin_panel/app/meetings/meetings')



const { companyManualAdminRouter } = require('../src/modules/company_manual/company_manual.controller')
const { partnersRequestsAdminRouter, partnersAdminRouter } = require('../src/modules/partners/partners.controller')
const { companyClaimRequestsAdminRouter } = require('../src/modules/company_claim_requests/company_claim_requests.controller')
const { systemSettingsRouter } = require('../src/modules/system_settings/system_settings.controller')

const manual_users = require('../controllers/admin_panel/app/user/manual_users')
const work_experiences = require('../controllers/admin_panel/app/user/work_experiences')
//admin - Ends Here



//ADMIN PANEL STARTS HERE
router.use('/blocked_domian', blocked_domian)
router.use('/crypto_category', crypto_category)
router.use('/company_categories', company_categories)
// modules/company/company.categories.controller.ts's companyCategoriesRouter — ported from
// controllers/admin_panel/category_tags/company_business_model.js, mounted at a temporary
// '/company_categories_v2' prefix to avoid colliding with the still-live legacy mount above
// until this port is verified over real traffic and the cutover is explicitly confirmed.
router.use('/company_categories_v2', companyCategoriesRouter)

router.use('/regularities_details', regularities_details)
// modules/company/company.regulatory_details.controller.ts's regulatoryDetailsRouter — ported from
// controllers/admin_panel/category_tags/regularity_details.js, mounted at a temporary
// '/regularities_details_v2' prefix to avoid colliding with the still-live legacy mount above
// until this port is verified over real traffic and the cutover is explicitly confirmed.
router.use('/regularities_details_v2', regulatoryDetailsRouter)

router.use('/area_of_interests', area_of_interests)
router.use('/user_expertise', user_expertise_category)
router.use('/crypto_networks', crypto_networks)
router.use('/positions', positions)
router.use('/revenue_streams', revenue_streams)
// modules/company_revenue/company_revenue.categories.controller.ts's revenueStreamCategoriesRouter —
// ported from controllers/admin_panel/category_tags/revenue_streams.js, mounted at a temporary
// '/revenue_streams_v2' prefix to avoid colliding with the still-live legacy mount above until
// this port is verified over real traffic and the cutover is explicitly confirmed.
router.use('/revenue_streams_v2', revenueStreamCategoriesRouter)
router.use('/report_issues_options', report_issues_options)
router.use('/funding_investor_types', funding_investor_types)
// modules/funding/funding.investor_types.controller.ts's fundingInvestorTypesRouter —
// ported from controllers/admin_panel/category_tags/funding_investor_types.js, mounted at a
// temporary '/funding_investor_types_v2' prefix to avoid colliding with the still-live legacy
// mount above until this port is verified over real traffic and the cutover is explicitly confirmed.
router.use('/funding_investor_types_v2', fundingInvestorTypesRouter)

router.use('/dashboard', dashboard)
router.use('/event', admin_event)

router.use('/event_tags', category_tag_event_tags)
router.use('/experience_level', category_tag_experience_level)
router.use('/funding_rounds', category_funding_rounds)
// modules/funding/funding.rounds.controller.ts's fundingRoundsRouter — ported from
// controllers/admin_panel/category_tags/funding_rounds.js, mounted at a temporary
// '/funding_rounds_v2' prefix to avoid colliding with the still-live legacy mount above
// until this port is verified over real traffic and the cutover is explicitly confirmed.
router.use('/funding_rounds_v2', fundingRoundsRouter)

// Temporary parallel top-level prefix for the modules/system_settings/ port (Task 1 of the
// system-settings migration plan). This router will carry all 5 categories' routes by the end
// of Task 5, reachable at /system_settings_v2/<category>/... Legacy prefixes above stay
// untouched — swapping frontend/proxies to the new paths, and retiring the legacy ones, is a
// follow-up decision for the user.
router.use('/system_settings_v2', systemSettingsRouter)

// Task 12: positions migrated into the EXISTING modules/work-experience/ module (not
// modules/system_settings/) since it already owns the cross-cutting
// invalidateStaticPositionsListCache() dependency that positions.js's mutations rely on.
// Temporary parallel prefix, '/positions_v2', distinct from the still-live legacy
// '/positions' mount above.
router.use('/positions_v2', positionsRouter)



// controllers/admin_panel/app/company.js fully migrated and deleted (completeness follow-up) —
// every route it defined (including /list, /disabled_list) now lives directly in
// modules/company_admin/company_admin.controller.ts's companyAdminRouter, mounted below.
router.use('/company', companyRevenueAdminRouter)
router.use('/company', companyAdminRouter)
router.use('/company', partnersAdminRouter)
// controllers/admin_panel/app/company/manual_retrievals.js fully migrated and deleted — every
// route it defined now lives directly in modules/company_manual/company_manual.controller.ts's
// companyManualAdminRouter.
router.use('/company_manual_retrievals', companyManualAdminRouter)
// controllers/admin_panel/app/company/requests_to_partners.js fully migrated and deleted — every
// route it defined now lives directly in modules/partners/partners.controller.ts's
// partnersRequestsAdminRouter.
router.use('/company/requests_to_partners', partnersRequestsAdminRouter)
// controllers/admin_panel/app/company/claim_requests.js fully migrated and deleted — every route
// it defined now lives directly in modules/company_claim_requests/company_claim_requests.controller.ts's
// companyClaimRequestsAdminRouter.
router.use('/company_claim_requests', companyClaimRequestsAdminRouter)
// controllers/admin_panel/app/company_employees.js fully migrated and deleted — every route it
// defined now lives directly in modules/team-members/team-members.controller.ts's adminTeamMembersRouter.
router.use('/company_employees', adminTeamMembersRouter)
router.use('/users', admin_user)
router.use('/users', adminWorkExperienceRouter)
router.use('/users_approvals', admin_user_approvals)

router.use('/sub_admin', sub_admin)
router.use('/sub_admin_auth', sub_admin_auth)
// controllers/admin_panel/app/company_approvals.js fully migrated and deleted — every route it
// defined now lives directly in modules/company_admin/company_admin.approvals.controller.ts's
// companyAdminApprovalsRouter.
router.use('/company_approvals', companyAdminApprovalsRouter)
router.use('/feedback', admin_feedback)
router.use('/funding', fundingRouter)
router.use('/company_acquisitions', companyAcquisitionsRouter)
router.use('/notifications', notifications)
router.use('/notifications/push_notification', push_notification)


router.use('/manual_users', manual_users)
router.use('/work_experiences', work_experiences)
router.use('/subscribe_category', subscribe_category)
router.use('/email_newsletter', email_newsletter)

router.use('/auth', admin_auth)
router.use('/email_performance', email_performance)


router.use('/main/quiz_questions', quiz_questions)
router.use('/main/contests/questions', contests_questions)
router.use('/main/contests/weekly_contests', weekly_contests)

router.use('/academy/lessons', academy_lessons)
router.use('/academy/lessons/faq', faq_lessons)
router.use('/academy/users', academy_users)

router.use('/academy/courses', academy_courses)
router.use('/academy/chapters', academy_chapters)
router.use('/academy/overview', academy_overview)

router.use('/community/groups', community_groups)
router.use('/community/posts', community_posts)
router.use('/community/overview', community_overview)
router.use('/community/challenge', community_21days_challenge)
router.use('/community/request_article', community_request_article)

router.use('/job/skill', job_skill)
router.use('/job/education_type', education_type)
router.use('/meetings', meetings)




router.use('/polling', polling)


//ADMIN PANEL ENDS HERE
module.exports = router