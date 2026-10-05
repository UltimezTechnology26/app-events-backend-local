// src/common/app-faq/app-faq.model.ts
//
// Shared, module-discriminated FAQ collection for this backend's own domains (App + Events),
// modelled after markets-backend-local's generic cln_faqs collection/admin FAQ tab pattern.
// Named cln_app_faqs (not cln_faqs) since this backend already has its own cln_* namespace and
// to avoid any confusion with markets' identically-shaped but physically separate collection.
//
// PILOT (2026-10-05): only `event` writes here so far - company/professionals keep their own
// dedicated cln_company_faq_lists/cln_professionals_faq_lists collections (src/modules/company/faq,
// src/modules/professionals-faq) until each is migrated onto this collection the same way, per
// the user's "pilot one domain, then replicate" direction.
import mongoose from 'mongoose'
import { getCollectionID } from '../../../utils/helpers/database_helper'

export type AppFaqModuleKey = 'event' | 'company' | 'professional'

// Matches markets' own change_management ActorRef shape closely enough for FAQ's own
// created_by/updated_by stamping - this backend's change-request system has its own richer
// ActorRef (src/common/status-audit/status-audit.types.ts), but FAQ's row-level actor stamp is
// just "who touched this row last", independent of that system's own audit trail.
export interface FaqActorRef {
  type: string
  id: number
}

const appFaqSchema = new mongoose.Schema({
  _id: { type: Number },
  // Discriminates which domain a row belongs to - the one field markets' own cln_faqs uses this
  // way too (see frontend-markets-typescript's FaqItem.module), kept as a plain string rather than
  // an enum so a future domain can start writing here without a schema migration.
  module: { type: String, index: true },
  // The owning record's own id (an event/company/professional row id) - named generically since
  // one collection now serves multiple domains, unlike the single `event_row_id`-style field each
  // domain's old dedicated collection used.
  root_document_id: { type: Number, index: true },
  // question/answer, not faq_question/faq_answer - matches markets-backend-local's own cln_faqs
  // schema (models/default/faqM.ts) field-for-field, per the user's explicit "same as the markets
  // module" direction. The HTTP contract stays faq_question/faq_answer everywhere (frontend
  // payloads, embedded faq[] in event responses) - only the DB-level shape changed; see
  // events-faq.service.ts's own wire<->storage mapping.
  question: { type: String },
  answer: { type: String },
  // Manual ordering (drag-reorder) - lowest first. Assigned "current max + 1" on create (see
  // app-faq.repository.ts's own getNextSortOrder), matching markets' own createFaq exactly.
  sort_order: { type: Number, default: 0 },
  // 1 = active/visible, 0 = disabled - same convention as markets' own FaqM (not currently
  // surfaced in any app-events UI, but kept so a row's shape matches markets' exactly).
  status: { type: Number, default: 1 },
  created_by: { type: mongoose.Schema.Types.Mixed },
  updated_by: { type: mongoose.Schema.Types.Mixed },
}, {
  // Mongoose's own timestamps (mapped to these field names rather than its camelCase default)
  // stamp created_at/updated_at on EVERY save/updateOne automatically - including writes made
  // through the change-request apply-writer's generic model.create()/model.updateOne() calls
  // (change-request.apply.writers.ts), which has no way to pass through a "when was this
  // approved" value of its own. created_by/updated_by stay manual (set via this file's own
  // repository functions' `actor` param) since there's no equivalent automatic mechanism for an
  // arbitrary actor object.
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})

appFaqSchema.index({ module: 1, root_document_id: 1 })

appFaqSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_app_faqs')
  }
  next()
})

export const AppFaqM = mongoose.model('cln_app_faqs', appFaqSchema, 'cln_app_faqs')

/**
 * A `module`-scoped view of AppFaqM exposing only the subset of the Mongoose Model surface the
 * change-request apply-writer needs (see change-request.apply.writers.ts's own SectionModel type).
 * Every filter/payload is tagged with `module` before it reaches the real model, so one physical
 * collection can back several change-request sections (`cln_app_faqs__event` today,
 * `cln_app_faqs__company`/`cln_app_faqs__professional` once those migrate) without their rows
 * colliding - each section still only ever sees and writes its own module's rows.
 */
export function createModuleScopedFaqModel(moduleKey: AppFaqModuleKey) {
  return {
    create: (docs: Record<string, unknown>[], opts?: Record<string, unknown>) =>
      AppFaqM.create(
        docs.map((doc) => ({ ...doc, module: moduleKey })),
        opts,
      ),
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>, opts?: Record<string, unknown>) =>
      AppFaqM.updateOne({ ...filter, module: moduleKey }, update, opts),
    deleteOne: (filter: Record<string, unknown>, opts?: Record<string, unknown>) =>
      AppFaqM.deleteOne({ ...filter, module: moduleKey }, opts),
  }
}
