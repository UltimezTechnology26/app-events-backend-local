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

// modules/events-attendees/events-attendees.controller.ts's eventsAttendeesRouter — ports
// controllers/events/attendees.js's GET /all_list and GET /attendees_count out of the legacy
// file. Mounted at a temporary '/attendees_v2' prefix, parallel to the untouched legacy
// '/attendees' mount above.
const { eventsAttendeesRouter } = require('../src/modules/events-attendees/events-attendees.controller')
router.use('/attendees_v2', eventsAttendeesRouter)
router.use('/sponsors_n_partners', sponsors_n_partners)
router.use('/faq', faq)
router.use('/collaboration', collaboration)
//main ENDS HERE


module.exports = router


