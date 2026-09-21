const mongoose = require('mongoose');
const { getCollectionID } = require('../utils/helpers/database_helper');
const { createSeoEntityDetailsModel } = require('@ultimez-interview/coinpedia-backend-library').seo;

// Single shared entity-level SEO collection for App-Events -
// cln_app_seo_details, discriminated by entity_type. Merges what were
// previously 3 separate collections (company/professional/event, each with
// its own dedicated SEO model) into one, plus hosts Academy Course/Lesson
// going forward. Registered exactly once here - every file that needs it
// requires THIS file, never calls createSeoEntityDetailsModel() again
// directly (that would throw OverwriteModelError the moment a second file
// loaded).
module.exports = createSeoEntityDetailsModel(
  mongoose.connection,
  'cln_app_seo_details',
  ['company', 'professional', 'event', 'academy_course', 'academy_lesson'],
  getCollectionID
);
