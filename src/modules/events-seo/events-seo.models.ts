// modules/events-seo/events-seo.models.ts
//
// REAL SCHEMA COLOCATION: `EventSeoDetailsM`'s schema now lives here, ported from the legacy
// `models/app/events/event_seo_detailsM.js` (every field, both `.index()` calls, the `pre('save')`
// auto-increment hook) - same pattern already applied to Company's and Professionals' own SEO
// models. `models/app/events/event_seo_detailsM.js` was reduced to a one-line passthrough so every
// legacy call site keeps resolving to the exact same compiled model object.
//
// Unified SEO storage (Part 4 §SEO unification): one collection per module,
// `cln_app_seo_details_event`, built from the shared `createAppSeoModel` factory
// (src/common/app-seo/app-seo.model.ts) - same field shape as Company's/Professionals' own SEO
// collections and markets-backend-local's cln_seo_details, minus a `module` discriminator (each
// module gets its own physical collection, hence the `_event` postfix). The foreign key field is
// now `root_document_id` (was `event_row_id`) - every call site across the repo was updated to
// match in the same change.
import { createAppSeoModel } from '../../common/app-seo/app-seo.model'

export const EventSeoDetailsM = createAppSeoModel('cln_app_seo_details_event')
