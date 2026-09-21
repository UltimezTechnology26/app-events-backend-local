// modules/community-admin/community-admin.posts.types.ts
// Phase 3 slice of the Community migration (All Posts / Deleted Posts).

export interface GetPostsListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  groupIdRaw?: string
  startDate?: string
  endDate?: string
}
