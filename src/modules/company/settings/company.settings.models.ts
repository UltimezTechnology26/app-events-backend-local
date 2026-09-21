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

const companySeoDetailsSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number, required: true, index: true },
  // Removed (Part 3 cleanup, confirmed 2026-09-02): about_company, facebook, twitter, linkedin,
  // instagram, video_link, telegram, feed_url, medium, reddit, other_social_links,
  // youtube_channel — dead duplicate fields, never written by any of the ~15 call sites across the
  // repo that touch this collection. Social links are canonically stored on
  // cln_company_social_links; about_company on cln_company_lists. Confirmed via
  // buildGetCompanySeoPipeline (company.settings.queries.ts), which reads every social field from
  // the separate $social_links join and about_company from the root company document, never from
  // $seo_details.*. Stale values in existing documents are cleared by
  // scripts/migrations/drop-dead-seo-fields.js.
  meta_title: { type: String },
  meta_keywords: { type: String },
  meta_description: { type: String },
  robots_index: { type: String, enum: ['index', 'noindex'], default: 'index' },
  robots_follow: { type: String, enum: ['follow', 'nofollow'], default: 'follow' },
  og_title: { type: String, default: '' },
  og_description: { type: String, default: '' },
  twitter_title: { type: String, default: '' },
  twitter_description: { type: String, default: '' },
  // Example: @username
  twitter_creator: { type: String, default: '' },
  header_structure: {
    type: [
      {
        tag: String,
        text: String,
      },
    ],
    default: [],
  },
})

companySeoDetailsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_seo_details')
  }
  next()
})

export const CompanySeoDetailsM = mongoose.model('cln_company_seo_details', companySeoDetailsSchema, 'cln_company_seo_details')
