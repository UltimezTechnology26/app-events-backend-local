// modules/company/settings/company.settings.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanySocialLinksM` and `CompanySeoDetailsM`'s schemas
// now live here, ported verbatim from the legacy `models/app/company/company_social_linksM.js`
// and `models/app/company/company_seo_detailsM.js` (every field, `CompanySeoDetailsM`'s own
// "Part 3 cleanup" doc comment about already-removed dead duplicate fields, the `pre('save')`
// auto-increment hooks). Both are genuinely owned by this settings submodule - `company_admin`'s
// own reads (including its dedicated `company_admin.seo_overview.*` admin dashboard) are plain
// lookups, not ownership, confirmed via a repo-wide grep. Mirrors the same split already done for
// Professionals (`professionals-social-links`, `professionals-seo`).
//
// Both legacy files were reduced to one-line passthroughs so every other call site (company_admin,
// company.discovery.ts, the change-request module's generic apply-writers layer) keeps resolving
// to the exact same compiled model object - same reverse-shim pattern already applied to every
// other colocated model in this migration (see professionals.models.ts's own doc comment for the
// general reasoning).
import mongoose from 'mongoose'
import { createSharedAppSeoModel } from '../../../common/app-seo/app-seo.model'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../../utils/helpers/database_helper')

const companySocialLinksSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number, required: true, index: true },
  facebook: { type: String },
  twitter: { type: String },
  linkedin: { type: String },
  instagram: { type: String },
  video_link: { type: String },
  telegram: { type: String },
  feed_url: { type: String },
  medium: { type: String },
  reddit: { type: String },
  other_social_links: { type: Object },
  youtube_channel: { type: String },
})

companySocialLinksSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_social_links')
  }
  next()
})

export const CompanySocialLinksM = mongoose.model('cln_company_social_links', companySocialLinksSchema, 'cln_company_social_links')

// Unified SEO storage (Part 4 §SEO unification): one collection per module, `cln_app_seo_details_company`,
// built from the shared `createAppSeoModel` factory (src/common/app-seo/app-seo.model.ts) - same
// field shape as Professionals'/Events' own SEO collections and markets-backend-local's
// cln_seo_details, minus a `module` discriminator (each module gets its own physical collection,
// hence the `_company` postfix). The foreign key field is now `root_document_id` (was
// `company_row_id`) - every call site across the repo was updated to match in the same change.
// Dead-field removal (about_company, facebook, twitter, etc.) from the prior schema version
// carries over unchanged - see scripts/migrations/drop-dead-seo-fields.js's own comment.
// Company SEO now lives in the shared `cln_app_seo_details` collection (entity_type = 'company');
// `root_document_id` stays usable as an alias of its `entity_row_id`.
export const CompanySeoDetailsM = createSharedAppSeoModel('company')
