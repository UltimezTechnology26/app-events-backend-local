const express = require('express')
const router = express.Router()

const admin_panel = require('./admin_panel')
const app = require('./app')
const sitemap = require('../controllers/app/sitemap')
const analytics = require('../controllers/app/analytics')
const main = require('./main')
const events = require('./events')


router.use('/main', main)
router.use('/app', app)
router.use('/events', events)
router.use('/sitemap', sitemap)
router.use('/admin_panel', admin_panel)
router.use('/analytics', analytics)


module.exports = router