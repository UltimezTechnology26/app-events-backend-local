const express = require('express')
const router = express.Router()

//main - Starts here
const attendees = require('../controllers/events/attendees')
const sponsors_n_partners = require('../controllers/events/sponsors_n_partners')
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

// modules/events-faq/events-faq.controller.ts's eventsFaqRouter — ports controllers/events/faq.js
// onto the shared cln_app_faqs collection (src/common/app-faq), the FAQ-unification pilot domain.
// Mounted at the same '/faq' path prefix (full cutover, same shape as Company's own
// companyFaqRouter in routes/app.js) — every existing frontend call site is unchanged.
const { eventsFaqRouter } = require('../src/modules/events-faq/events-faq.controller')
router.use('/faq', eventsFaqRouter)
router.use('/collaboration', collaboration)
//main ENDS HERE


module.exports = router


