// MOVED: the real schema now lives in src/modules/events-seo/events-seo.models.ts (see that
// file's own doc comment for why - genuine model colocation without a second `mongoose.model()`
// registration for the events SEO collection). This file stays as a passthrough so every other
// call site keeps working unchanged.
module.exports = require('../../../src/modules/events-seo/events-seo.models').EventSeoDetailsM
