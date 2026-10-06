// src/common/app-seo/app-seo.repository.ts
//
// This is a local copy of coinpedia-backend-library's own seo/createAppSeoHelpers (same logic,
// just bound directly to a Model via DI) - per that library's own "copy, don't move" policy, kept
// here until the library is published and this backend's dependency is bumped to pull it in
// instead. Swap each module's own call sites to import `@ultimez-interview/coinpedia-backend-library/seo`
// directly once that category is published, same plan already noted for this repo's own app-faq
// local copy.
import { Model } from 'mongoose'
import { AppSeoDocument, SeoActorRef } from './app-seo.model'

export function createAppSeoHelpers(SeoModel: Model<AppSeoDocument>) {
  const findSeoByRoot = ({ rootDocumentId }: { rootDocumentId: number }): Promise<AppSeoDocument | null> =>
    SeoModel.findOne({ root_document_id: rootDocumentId }).lean() as unknown as Promise<AppSeoDocument | null>

  // Standardized suggested title - same "{name} | {suffix}" shape already established by the
  // company module's own write-time default (company.settings.service.ts) and markets'
  // generateDefaultTokenSeoTitle, just generalized to any entity name/suffix pair.
  const buildDefaultSeoTitle = (entityName: string, suffix: string): string => `${entityName} | ${suffix}`

  const upsertSeoByRoot = async ({
    rootDocumentId,
    updateObject,
    actor,
    before,
  }: {
    rootDocumentId: number
    updateObject: Record<string, unknown>
    actor: SeoActorRef
    before: AppSeoDocument | null
  }) => {
    if (before) {
      return SeoModel.updateOne({ root_document_id: rootDocumentId }, { $set: { ...updateObject, updated_by: actor, updated_at: new Date() } })
    }
    return new SeoModel({
      ...updateObject,
      root_document_id: rootDocumentId,
      created_by: actor,
      created_at: new Date(),
    } as AppSeoDocument).save()
  }

  const deleteSeoByRoot = ({ rootDocumentId }: { rootDocumentId: number }) => SeoModel.deleteOne({ root_document_id: rootDocumentId })

  // For an aggregation pipeline on the PARENT entity's own Model.
  const buildSeoLookupStage = (localField = '_id') => ({
    $lookup: {
      from: SeoModel.collection.collectionName,
      localField,
      foreignField: 'root_document_id',
      as: 'seo_details',
    },
  })

  return {
    findSeoByRoot,
    upsertSeoByRoot,
    deleteSeoByRoot,
    buildSeoLookupStage,
    buildDefaultSeoTitle,
  }
}
