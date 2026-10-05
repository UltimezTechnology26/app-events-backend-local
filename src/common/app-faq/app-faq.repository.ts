// src/common/app-faq/app-faq.repository.ts
//
// Generic cln_app_faqs queries, every one scoped by `module` so Events' rows (and, once migrated,
// Company's/Professionals') never leak into each other despite sharing one physical collection.
// Field shape (question/answer/sort_order/status/created_at/updated_at/created_by/updated_by)
// matches markets-backend-local's own cln_faqs (models/default/faqM.ts) field-for-field - the HTTP
// contract stays faq_question/faq_answer everywhere though (see events-faq.service.ts's own
// wire<->storage mapping) - only the DB-level shape changed.
//
// This is a local copy of coinpedia-backend-library's own faqs/createAppFaqHelpers (same logic,
// just bound directly to AppFaqM instead of taking a Model as an argument) - per that library's
// own "copy, don't move" policy, kept here until the library is published and this backend's
// dependency is bumped to pull it in instead.
import { AppFaqM, FaqActorRef } from './app-faq.model'

export function buildFaqSearchMatch({ module, rootDocumentId, search }: { module: string; rootDocumentId: number; search?: string }) {
  const query: Record<string, any>[] = [{ module, root_document_id: rootDocumentId }]
  if (search) {
    query.push({ question: { $regex: search, $options: 'i' } })
  }
  return { $and: query }
}

export function buildFaqListPipeline({ searchMatch, skip, limit }: { searchMatch: Record<string, any>; skip: number; limit: number }) {
  return [
    { $match: searchMatch },
    // Lowest sort_order first, _id as the tie-breaker - matches markets' own listFaqs ordering.
    { $sort: { sort_order: 1, _id: 1 } },
    { $project: { _id: 1, question: 1, answer: 1, sort_order: 1, status: 1 } },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

function buildPaginatedFacetStages({ skip, limit }: { skip: number; limit: number }) {
  return [{ $facet: { data: [{ $skip: skip }, { $limit: limit }], totalCount: [{ $count: 'count' }] } }]
}

export async function aggregateFaqList({ searchMatch, skip, limit }: { searchMatch: Record<string, any>; skip: number; limit: number }) {
  // Mongoose's PipelineStage union rejects this mix of $match/$sort/$project/$facet stages even
  // though it's a valid aggregation pipeline - cast at the call boundary rather than loosen
  // AppFaqM's own typing (see coinpedia-backend-library/faqs's identical cast for the same reason).
  return AppFaqM.aggregate(buildFaqListPipeline({ searchMatch, skip, limit }) as any[])
}

export async function findFaqByIdAndRoot({
  module,
  faqRowId,
  rootDocumentId,
}: {
  module: string
  faqRowId: number
  rootDocumentId: number
}) {
  return AppFaqM.findOne({ _id: faqRowId, module, root_document_id: rootDocumentId })
}

// Explicit projection — CLAUDE.md forbids `SELECT *`.
const FAQ_EDITABLE_FIELDS_PROJECTION = { _id: 0, question: 1, answer: 1 } as const

export async function findFaqByIdAndRootLean({
  module,
  faqRowId,
  rootDocumentId,
}: {
  module: string
  faqRowId: number
  rootDocumentId: number
}): Promise<Record<string, unknown> | null> {
  return AppFaqM.findOne({ _id: faqRowId, module, root_document_id: rootDocumentId }, FAQ_EDITABLE_FIELDS_PROJECTION).lean()
}

export async function findFaqById({ module, faqRowId }: { module: string; faqRowId: number }) {
  return AppFaqM.findOne({ _id: faqRowId, module })
}

export async function findFaqByIdLean({ module, faqRowId }: { module: string; faqRowId: number }): Promise<Record<string, unknown> | null> {
  return AppFaqM.findOne({ _id: faqRowId, module }).lean()
}

// "Current max + 1", not a count - a prior delete would otherwise leave a gap that a plain
// count-based scheme could collide into. Matches markets' own createFaq comment exactly
// (src/modules/faq/faq.service.ts).
export async function getNextSortOrder({ module, rootDocumentId }: { module: string; rootDocumentId: number }): Promise<number> {
  const lastRow = await AppFaqM.findOne({ module, root_document_id: rootDocumentId }, { sort_order: 1 }).sort({ sort_order: -1 }).lean()
  return ((lastRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1
}

export async function insertFaq({
  module,
  rootDocumentId,
  question,
  answer,
  actor,
}: {
  module: string
  rootDocumentId: number
  question: string
  answer: string
  actor?: FaqActorRef
}) {
  const sort_order = await getNextSortOrder({ module, rootDocumentId })
  return new AppFaqM({
    module,
    root_document_id: rootDocumentId,
    question,
    answer,
    sort_order,
    status: 1,
    created_by: actor,
    // created_at/updated_at are stamped automatically by the schema's own `timestamps` option
    // (app-faq.model.ts) on every save/update - not set manually here.
  }).save()
}

export async function updateFaqById({
  module,
  faqRowId,
  updateObject,
  actor,
}: {
  module: string
  faqRowId: number
  updateObject: Record<string, unknown>
  actor?: FaqActorRef
}) {
  // updated_at is stamped automatically by the schema's own `timestamps` option.
  return AppFaqM.updateOne({ _id: faqRowId, module }, { $set: { ...updateObject, updated_by: actor } })
}

export async function deleteFaqById({ module, faqRowId }: { module: string; faqRowId: number }) {
  return AppFaqM.deleteOne({ _id: faqRowId, module })
}

export async function deleteFaqsByRoot({ module, rootDocumentId }: { module: string; rootDocumentId: number }) {
  return AppFaqM.deleteMany({ module, root_document_id: rootDocumentId })
}

export async function countFaqsByRoot({ module, rootDocumentId }: { module: string; rootDocumentId: number }) {
  return AppFaqM.countDocuments({ module, root_document_id: rootDocumentId })
}

export async function findOneFaqByRoot({ module, rootDocumentId }: { module: string; rootDocumentId: number }) {
  return AppFaqM.findOne({ module, root_document_id: rootDocumentId })
}

export async function findFaqsByRoot({ module, rootDocumentId }: { module: string; rootDocumentId: number }) {
  return AppFaqM.find({ module, root_document_id: rootDocumentId }).sort({ sort_order: 1, _id: 1 })
}

/**
 * Rewrites sort_order for every id in `orderedIds` to its own index in that array - the admin's
 * own drag-reorder UI always sends the FULL list back (not a partial move), so there's no need to
 * shift neighbors individually. Matches markets' own reorderFaqs exactly
 * (src/modules/faq/faq.service.ts), scoped to {_id, module, root_document_id} per row so a stray id
 * can never reorder a row outside the caller's own module/record.
 */
export async function reorderFaqs({
  module,
  rootDocumentId,
  orderedIds,
  actor,
}: {
  module: string
  rootDocumentId: number
  orderedIds: number[]
  actor?: FaqActorRef
}) {
  await Promise.all(
    orderedIds.map((faqId, index) =>
      AppFaqM.updateOne(
        { _id: faqId, module, root_document_id: rootDocumentId },
        { $set: { sort_order: index, updated_by: actor } },
      ),
    ),
  )
}
