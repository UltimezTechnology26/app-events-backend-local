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
const posts = require('../controllers/main/community/posts')
const pro_batch = require('../controllers/main/community/pro_batch')
const request_article = require('../controllers/main/community/request_articles')
const benefits = require('../controllers/main/community/benefits')
const { professionalsAcademyRouter } = require('../src/modules/professionals-academy/professionals-academy.controller')
const { professionalsCommunityRouter } = require('../src/modules/professionals-community/professionals-community.controller')
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
router.use('/posts', posts)
router.use('/pro_batch', pro_batch)
router.use('/request_article', request_article)
// Phase 4 (backend-only) of the Community migration (Requested Articles, self-service submit) -
// temporary `_v2` parallel mount, legacy '/request_article' above stays live and untouched.
router.use('/request_article_v2', communityRequestArticleSelfServiceRouter)
router.use('/benefits', benefits)

// Professionals migration, Phase J: certificate_list / save_n_update_visibility /
// certificate_visible / save_certificate_urls ported out of controllers/main/users.js into
// src/modules/professionals-academy/**. Mounted at a temporary `_v2` prefix, parallel to the
// untouched legacy '/users' mount above, per this migration's confirmed cutover strategy — legacy
// stays live and unmodified until this module is verified via the characterization
// capture/compare cycle and real frontend testing (same pattern as routes/admin_panel.js's
// '/users_v2' mount for the core professionals module).
router.use('/academy_v2', professionalsAcademyRouter)

// Professionals migration, Phase K: pro_batch.js's GET /details ported into
// src/modules/professionals-community/**. Same `_v2` parallel-mount pattern as academy_v2 above —
// legacy '/pro_batch' stays live and unmodified until verified.
router.use('/pro_batch_v2', professionalsCommunityRouter)




// main ENDS HERE


module.exports = router