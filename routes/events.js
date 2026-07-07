const express = require('express')
const router = express.Router()

//main - Starts here
const attendees = require('../controllers/events/attendees')
const sponsors_n_partners = require('../controllers/events/sponsors_n_partners')
const faq = require('../controllers/events/faq')
const collaboration = require('../controllers/events/collaboration')
//main - Ends here

//main STARTS HERE
router.use('/attendees', attendees)
router.use('/sponsors_n_partners', sponsors_n_partners)
router.use('/faq', faq)
router.use('/collaboration', collaboration)
//main ENDS HERE


module.exports = router


