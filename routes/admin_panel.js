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
const admin_company = require('../controllers/admin_panel/app/company')
const admin_user = require('../controllers/admin_panel/app/user')
const admin_user_approvals = require('../controllers/admin_panel/app/user_approvals')

const requests_to_partners = require('../controllers/admin_panel/app/company/requests_to_partners')
const company_approvals = require('../controllers/admin_panel/app/company_approvals')
const admin_feedback = require('../controllers/admin_panel/app/feedback')
const company_employees = require('../controllers/admin_panel/app/company_employees')
const { fundingRouter } = require('../modules/funding/funding.controller')
const { companyAcquisitionsRouter } = require('../modules/company_acquisitions/company_acquisitions.controller')
const { adminWorkExperienceRouter } = require('../modules/work-experience/work-experience.controller')
const { adminTeamMembersRouter } = require('../modules/team-members/team-members.controller')
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



const claim_requests = require('../controllers/admin_panel/app/company/claim_requests')
const manual_retrievals = require('../controllers/admin_panel/app/company/manual_retrievals')

const manual_users = require('../controllers/admin_panel/app/user/manual_users')
const work_experiences = require('../controllers/admin_panel/app/user/work_experiences')
//admin - Ends Here



//ADMIN PANEL STARTS HERE
router.use('/blocked_domian', blocked_domian)
router.use('/crypto_category', crypto_category)
router.use('/company_categories', company_categories)

router.use('/regularities_details', regularities_details)

router.use('/area_of_interests', area_of_interests)
router.use('/user_expertise', user_expertise_category)
router.use('/crypto_networks', crypto_networks)
router.use('/positions', positions)
router.use('/revenue_streams', revenue_streams)
router.use('/report_issues_options', report_issues_options)
router.use('/funding_investor_types', funding_investor_types)

router.use('/dashboard', dashboard)
router.use('/event', admin_event)

router.use('/event_tags', category_tag_event_tags)
router.use('/experience_level', category_tag_experience_level)
router.use('/funding_rounds', category_funding_rounds)



router.use('/company', admin_company)
router.use('/company_manual_retrievals', manual_retrievals)
router.use('/company_claim_requests', claim_requests)
router.use('/company_employees', company_employees)
router.use('/company_employees', adminTeamMembersRouter)
router.use('/company/requests_to_partners', requests_to_partners)
router.use('/users', admin_user)
router.use('/users', adminWorkExperienceRouter)
router.use('/users_approvals', admin_user_approvals)

router.use('/sub_admin', sub_admin)
router.use('/sub_admin_auth', sub_admin_auth)
router.use('/company_approvals', company_approvals)
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