// modules/professionals-seo/professionals-seo.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalSeoDetailsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/professionals_seo_detailsM.js` (every field, both
// `.index()` calls, the `pre('save')` auto-increment hook). This is this model's designated owner
// per the plan's model-to-module mapping.
//
// `models/app/professionals_seo_detailsM.js` was reduced to a one-line passthrough so every legacy
// call site (`setting.js`, and the core `professionals` module's own re-export of this same model)
// keeps resolving to the exact same compiled model object — see `professionals.models.ts`'s own
// doc comment for the general pattern.
import { createAppSeoModel } from '../../common/app-seo/app-seo.model'

// Unified SEO storage (Part 4 §SEO unification): one collection per module,
// `cln_app_seo_details_professional`, built from the shared `createAppSeoModel` factory
// (src/common/app-seo/app-seo.model.ts) - same field shape as Company's/Events' own SEO
// collections and markets-backend-local's cln_seo_details, minus a `module` discriminator (each
// module gets its own physical collection, hence the `_professional` postfix). The foreign key
// field is now `root_document_id` (was `user_row_id`) - every call site across the repo was
// updated to match in the same change.
export const ProfessionalSeoDetailsM = createAppSeoModel('cln_app_seo_details_professional')
