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
router.use('/benefits', benefits)






// main ENDS HERE


module.exports = router