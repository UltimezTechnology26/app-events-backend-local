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

// ---------------------------------------------------------------------------------------------
// Shared-collection variant: every entity type (company / professional / event) lives in the one
// physical `cln_app_seo_details` collection, keyed by (entity_type, entity_row_id).
//
// The per-module collections this replaces were keyed by `root_document_id`. So existing call
// sites (and change-request's `keyField: 'root_document_id'`) keep working unchanged, this model
// takes `root_document_id` as an alias of `entity_row_id` and translates it in filters/updates,
// and every query/update/delete is scoped to its own `entity_type` so one module can never read
// or write another module's rows.
// ---------------------------------------------------------------------------------------------
const SHARED_SEO_COLLECTION = 'cln_app_seo_details'
const ROW_KEY_ALIAS = 'root_document_id'
const ROW_KEY = 'entity_row_id'

type PlainObject = Record<string, unknown>

// Row shape in the shared collection: keyed by entity_row_id (aliased as root_document_id) and
// carrying the extra social fields the shared collection already stores.
export interface SharedAppSeoDocument extends Omit<AppSeoDocument, 'root_document_id'> {
  entity_type: string
  entity_row_id: number
  og_image?: string
  og_type?: string
  twitter_card?: string
  applied_schemas?: unknown
}

function translateRowKey(obj: PlainObject | undefined | null): PlainObject | undefined | null {
  if (!obj || typeof obj !== 'object') return obj
  const out: PlainObject = {}
  for (const [key, value] of Object.entries(obj)) {
    out[key === ROW_KEY_ALIAS ? ROW_KEY : key] = value
  }
  return out
}

function translateUpdate(update: unknown): unknown {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return update
  const out: PlainObject = {}
  for (const [key, value] of Object.entries(update as PlainObject)) {
    if (key.startsWith('$')) {
      out[key] = value && typeof value === 'object' ? translateRowKey(value as PlainObject) : value
    } else {
      out[key === ROW_KEY_ALIAS ? ROW_KEY : key] = value
    }
  }
  return out
}

const SCOPED_QUERY_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'distinct',
] as const

export function createSharedAppSeoModel(entityType: 'company' | 'professional' | 'event') {
  const schema = new mongoose.Schema<SharedAppSeoDocument>(
    {
      _id: { type: Number },
      entity_type: { type: String, required: true, default: entityType },
      entity_row_id: { type: Number, required: true, alias: ROW_KEY_ALIAS },
      meta_title: { type: String },
      meta_keywords: { type: String },
      meta_description: { type: String },
      robots_index: { type: String, enum: ['index', 'noindex'], default: 'index' },
      robots_follow: { type: String, enum: ['follow', 'nofollow'], default: 'follow' },
      og_title: { type: String, default: '' },
      og_description: { type: String, default: '' },
      og_image: { type: String },
      og_type: { type: String },
      twitter_title: { type: String, default: '' },
      twitter_description: { type: String, default: '' },
      twitter_creator: { type: String, default: '' },
      twitter_card: { type: String },
      header_structure: { type: [{ tag: String, text: String }], default: [] },
      applied_schemas: { type: mongoose.Schema.Types.Mixed },
      created_by: { type: actorSchema, default: null },
      created_at: { type: Date, default: null },
      updated_by: { type: actorSchema, default: null },
      updated_at: { type: Date, default: null },
    },
    // The shared collection already has its indexes (incl. the unique (entity_type, entity_row_id)),
    // so this model must never try to create or alter them.
    { versionKey: false, autoIndex: false, autoCreate: false },
  )

  for (const op of SCOPED_QUERY_OPS) {
    schema.pre(op, async function (this: mongoose.Query<unknown, unknown>) {
      this.setQuery({ ...(translateRowKey(this.getQuery()) as PlainObject), entity_type: entityType })
      const update = this.getUpdate()
      if (update) {
        const translated = translateUpdate(update) as PlainObject
        // An upsert inserts a brand-new row, which must carry its own numeric _id and entity_type.
        if (this.getOptions().upsert) {
          const onInsert = (translated.$setOnInsert as PlainObject) || {}
          translated.$setOnInsert = { _id: await getCollectionID(SHARED_SEO_COLLECTION), entity_type: entityType, ...onInsert }
        }
        this.setUpdate(translated)
      }
    })
  }

  // Model.aggregate() bypasses the query hooks above, so scope it the same way: a leading
  // entity_type $match, and `root_document_id` translated inside any top-level $match stage.
  schema.pre('aggregate', function () {
    const pipeline = this.pipeline() as unknown as PlainObject[]
    for (const stage of pipeline) {
      if (stage.$match && typeof stage.$match === 'object') stage.$match = translateRowKey(stage.$match as PlainObject)
    }
    pipeline.unshift({ $match: { entity_type: entityType } })
  })

  schema.pre('save', async function (next) {
    if (!this._id) {
      this._id = await getCollectionID(SHARED_SEO_COLLECTION)
    }
    next()
  })

  return mongoose.model<SharedAppSeoDocument>(`AppSeoDetails_${entityType}`, schema, SHARED_SEO_COLLECTION)
}
