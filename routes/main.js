const express = require('express')
const router = express.Router()

//main - Starts here
const article = require('../controllers/main/article')
const main_users = require('../controllers/main/users')
const quiz_questions = require('../controllers/main/academy/quiz_questions')
const lessons = require('../controllers/main/academy/lessons')
const users_polling = require('../controllers/main/polling')
const weekly_contests = require('../controllers/main/weekly_contests')
const onboarding = require('../controllers/main/academy/onboarding')
const overview = require('../controllers/main/academy/overview')
const bookmarks = require('../controllers/main/academy/bookmarks')
const courses = require('../controllers/main/academy/courses')
const { professionalsAcademyRouter } = require('../src/modules/professionals-academy/professionals-academy.controller')
const { communityRouter } = require('../src/modules/community/community.controller')
const { benefitsRouter } = require('../src/modules/benefits/benefits.controller')
const { communityPostsRouter } = require('../src/modules/community-posts/community-posts.controller')
const { communityPostsFeedRouter } = require('../src/modules/community-posts/community-posts.feed.controller')
const { communityRequestArticleSelfServiceRouter } = require('../src/modules/community-admin/community-admin.request-article.self-service.controller')



//main - Ends here


// main STARTS HERE
router.use('/article', article)
router.use('/users', main_users)
router.use('/quiz_questions', quiz_questions)
router.use('/lessons', lessons)
router.use('/users_polling', users_polling)
router.use('/weekly_contests', weekly_contests)
router.use('/onboarding', onboarding)
router.use('/overview', overview)
router.use('/bookmarks', bookmarks)
router.use('/courses', courses)
router.use('/lesson/faq', courses)
// Phase 4 of the Community migration (Requested Articles, self-service submit) - CUTOVER
// COMPLETE (2026-10-07): legacy '/request_article' (controllers/main/community/request_articles.js)
// removed, `_v2` suffix dropped now that the plain path is free again.
router.use('/request_article', communityRequestArticleSelfServiceRouter)
// Professionals migration, Phase J: certificate_list / save_n_update_visibility /
// certificate_visible / save_certificate_urls ported out of controllers/main/users.js into
// src/modules/professionals-academy/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/users' mount above, per this migration's confirmed cutover strategy — legacy
// stays live and unmodified until this module is verified via the characterization
// capture/compare cycle and real frontend testing (same pattern as routes/admin_panel.js's
// '/users_v2' mount for the core professionals module).
router.use('/academy_v2', professionalsAcademyRouter)

// Professionals migration, Phase K: pro_batch.js's GET /details ported into
// src/modules/community/**. CUTOVER COMPLETE (2026-10-07): legacy '/pro_batch'
// (controllers/main/community/pro_batch.js) removed, `_v2` suffix dropped now that the plain
// path is free again.
router.use('/pro_batch', communityRouter)

// `benefits` module - ports controllers/main/community/benefits.js's GET /details, reusing
// getProfileScores/getPostDates/calculateStreaks from the community module above rather than
// redeclaring them. CUTOVER COMPLETE (2026-10-07): legacy '/benefits' (and its own service file,
// services/main/benefits.ts) removed, `_v2` suffix dropped now that the plain path is free again.
router.use('/benefits', benefitsRouter)

// `community-posts` module - full parity port of controllers/main/community/posts.js's
// user-only routes (group_list and delete_post excluded - those live in the shared
// modules/community/** unification instead). CUTOVER COMPLETE (2026-10-07): legacy
// '/posts' (and its own service file, services/main/community/posts.ts) removed, `_v2`
// suffix dropped from both routers now that the plain path is free again.
router.use('/posts', communityPostsRouter)
router.use('/posts', communityPostsFeedRouter)




// main ENDS HERE


module.exports = router