// src/common/app-seo/app-seo.model.ts
//
// One-collection-per-module SEO schema factory - every module's SEO collection uses the exact
// same field shape (meta_title/meta_description/meta_keywords/robots_index/robots_follow/og_*/
// twitter_*/header_structure + actor-tracking), matching coinpedia-backend-library's own
// `seo/createAppSeoHelpers` field shape (AppSeoDoc) field-for-field, and markets-backend-local's
// shared `cln_seo_details` shape minus its `module` discriminator (not needed here - each module
// gets its OWN physical collection, named with a `cln_app_seo_details_<module>` postfix, e.g.
// `cln_app_seo_details_company`/`_professional`/`_event`).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

export interface SeoActorRef {
  type: 'admin' | 'subadmin' | 'user' | 'system' | null
  id: number | null
}

export interface AppSeoDocument {
  _id: number
  root_document_id: number
  meta_title?: string
  meta_keywords?: string
  meta_description?: string
  robots_index: 'index' | 'noindex'
  robots_follow: 'follow' | 'nofollow'
  og_title?: string
  og_description?: string
  twitter_title?: string
  twitter_description?: string
  twitter_creator?: string
  header_structure: { tag?: string; text?: string }[]
  created_by: SeoActorRef | null
  created_at: Date | null
  updated_by: SeoActorRef | null
  updated_at: Date | null
}

const actorSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['admin', 'subadmin', 'user', 'system'], default: null },
    id: { type: Number, default: null },
  },
  { _id: false },
)

// `collectionName` doubles as the auto-increment counter key, same convention as every other
// per-collection model in this repo (company.settings.models.ts's own `getCollectionID('cln_company_seo_details')`).
export function createAppSeoModel(collectionName: string) {
  const schema = new mongoose.Schema<AppSeoDocument>(
    {
      _id: { type: Number },
      root_document_id: { type: Number, required: true, unique: true, index: true },
      meta_title: { type: String },
      meta_keywords: { type: String },
      meta_description: { type: String },
      robots_index: { type: String, enum: ['index', 'noindex'], default: 'index' },
      robots_follow: { type: String, enum: ['follow', 'nofollow'], default: 'follow' },
      og_title: { type: String, default: '' },
      og_description: { type: String, default: '' },
      twitter_title: { type: String, default: '' },
      twitter_description: { type: String, default: '' },
      twitter_creator: { type: String, default: '' },
      header_structure: { type: [{ tag: String, text: String }], default: [] },
      created_by: { type: actorSchema, default: null },
      created_at: { type: Date, default: null },
      updated_by: { type: actorSchema, default: null },
      updated_at: { type: Date, default: null },
    },
    { versionKey: false },
  )

  schema.pre('save', async function (next) {
    if (!this._id) {
      this._id = await getCollectionID(collectionName)
    }
    next()
  })

  return mongoose.model<AppSeoDocument>(collectionName, schema, collectionName)
}
