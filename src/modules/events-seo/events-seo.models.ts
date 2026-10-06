// modules/events-seo/events-seo.models.ts
//
// REAL SCHEMA COLOCATION: `EventSeoDetailsM`'s schema now lives here, ported from the legacy
// `models/app/events/event_seo_detailsM.js` (every field, both `.index()` calls, the `pre('save')`
// auto-increment hook) - same pattern already applied to Company's and Professionals' own SEO
// models. `models/app/events/event_seo_detailsM.js` was reduced to a one-line passthrough so every
// legacy call site keeps resolving to the exact same compiled model object.
//
// Unified SEO storage: events share the one `cln_app_seo_details` collection (entity_type 'event'),
// built from the `createSharedAppSeoModel` factory
// (src/common/app-seo/app-seo.model.ts) - same field shape as Company's/Professionals' own SEO
// collections and markets-backend-local's cln_seo_details, minus a `module` discriminator (each
// module gets its own physical collection, hence the `_event` postfix). The foreign key field is
// now `root_document_id` (was `event_row_id`) - every call site across the repo was updated to
// match in the same change.
import { createSharedAppSeoModel } from '../../common/app-seo/app-seo.model'

// Events SEO now lives in the shared `cln_app_seo_details` collection (entity_type = 'event'); the
// per-module `cln_app_seo_details_event` collection is no longer read or written. `root_document_id`
// stays usable as an alias of the shared collection's `entity_row_id`.
export const EventSeoDetailsM = createSharedAppSeoModel('event')
