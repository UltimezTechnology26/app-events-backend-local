// modules/professionals-academy/professionals-academy.models.ts
//
// Phase J of the Professionals migration (see plan doc). Ports controllers/main/users.js's
// certificate_list / save_n_update_visibility / certificate_visible / save_certificate_urls
// (~844-1166) into a module of their own, since Academy is a real, dedicated professionals
// domain (professional course completion/certificates), not a sub-feature of the core
// professionals module.
//
// REAL SCHEMA COLOCATION (2026-09-17): `CoursesCertificatesM`'s schema now lives here, ported
// verbatim from the legacy `models/main/academy/courses_certificatesM.js` — including the
// confirmed bug below, preserved exactly. `models/main/academy/courses_certificatesM.js` was
// reduced to a one-line passthrough so legacy `controllers/main/users.js` (which stays mounted for
// the whole `_v2` parallel-verification window) keeps resolving to the exact same compiled model
// object — same reverse-shim pattern already applied to every other colocated model in this
// migration (see professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

// CONFIRMED BUG, NOT FIXED HERE (flag, don't silently fix — per this migration's transparency
// rule): the `_id` field's schema default is `Math.floor(Math.random() * 1e9)`, which Mongoose
// applies BEFORE the `pre('save')` hook runs. Since the hook only calls
// `getCollectionID('cln_academy_courses_certificates')` `if (!this._id)`, and the default always
// populates `_id` first, the row-id counter is dead code — every new certificate row actually gets
// a random 9-digit id, not a sequential row id like every sibling professionals collection. This
// is a real, live inconsistency (and a theoretical, if unlikely, collision risk against the
// schema's own `unique: true` constraint) — left as-is here since fixing it would change the ID
// generation behavior of a live collection, which needs explicit user sign-off first, not a
// migration-time silent fix.
const coursesCertificatesSchema = new mongoose.Schema(
  {
    _id: { type: Number, default: () => Math.floor(Math.random() * 1_000_000_000), unique: true },
    user_row_id: { type: Number, index: true, required: true },
    course_row_id: { type: Number, index: true, required: true },
    percentage_score: { type: Number },
    // 0: pending, 1: downloaded
    download_status: { type: Number, default: 0 },
    date_n_time: { type: Date, required: true },
    certificate_public: { type: Boolean, default: true },
    score_public: { type: Boolean, default: false },
    certificate_pdf_url: { type: String },
    certificate_image_url: { type: String },
  },
  { versionKey: false },
)

coursesCertificatesSchema.index({ user_row_id: 1, course_row_id: 1 }, { unique: true })

coursesCertificatesSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_academy_courses_certificates')
  }
  next()
})

export const CoursesCertificatesM = mongoose.model('cln_academy_courses_certificates', coursesCertificatesSchema, 'cln_academy_courses_certificates')
