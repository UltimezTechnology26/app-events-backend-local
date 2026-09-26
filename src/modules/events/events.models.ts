// modules/events/events.models.ts
//
// eventM/deleted_eventsM are still require()'d directly by ~24 not-yet-migrated legacy files
// (controllers/admin_panel/app/user.js, controllers/admin_panel/category_tags/event_tags.js,
// controllers/app/analytics.js, controllers/app/sitemap.js, utils/helpers/events_helper.js,
// utils/helpers/app_helper.js, and more — confirmed by grep before writing this file). Per this
// repo's model-colocation rule, a model still used by legacy code is RE-EXPORTED here, never
// redeclared with mongoose.model() — redeclaring the same collection name throws
// OverwriteModelError. Matches the exact pattern models/app/static/event_tagsM.js already
// demonstrates for EventTagsM -> system_settings.models.ts.
export const EventM = require('../../../models/app/events/eventM')
export const DeletedEventsM = require('../../../models/app/events/deleted_eventsM')
