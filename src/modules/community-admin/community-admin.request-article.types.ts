// modules/community-admin/community-admin.request-article.types.ts
// Phase 4 slice of the Community migration (Requested Articles). Backend-only per the
// 2026-09-19 scope change - no admin-panel frontend is built against this module.

export interface GetRequestArticleListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  startDate?: string
  endDate?: string
}

export type RequestArticleStatus = 'published' | 'unpublished'

export interface PublishArticleRequestParams {
  userRowId: number
  topic: string
  documentLink?: string
  articleContent?: string
}
