// modules/community-posts/community-posts.feed.service.ts
// Ports services/main/community/posts.ts's getPostsList (~line 5-355) and getSinglePostDetails
// (~line 452-920).
import { buildPostsListMatchStage, buildPostsListPipeline, extractPostsListResult, runPostsListAggregate } from './community-posts.feed.list.queries'
import { findExistingPostId, buildSinglePostPipeline, runSinglePostAggregate } from './community-posts.single-post.queries'

const DEFAULT_LIST_LIMIT = 100

export interface GetPostsListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  groupIdRaw?: string
  startDate?: string
  endDate?: string
  /** `""` when the caller isn't a self-service user (matches legacy's own sentinel exactly). */
  userRowId: number | string
}

export async function getPostsList(params: GetPostsListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : DEFAULT_LIST_LIMIT
  const groupId = Number.parseInt(params.groupIdRaw ?? '')

  const matchStage = buildPostsListMatchStage({ startDate: params.startDate, endDate: params.endDate, groupId })
  const pipeline = buildPostsListPipeline({ matchStage, search: params.search?.trim(), skip, limit, userRowId: params.userRowId })
  const aggregateOutput = await runPostsListAggregate(pipeline)
  const { data, count } = extractPostsListResult(aggregateOutput)

  return { status: true, message: data, total_posts: count }
}

export async function getSinglePostDetails(postIdRaw: string, userRowId: number) {
  const postId = Number.parseInt(postIdRaw)

  const existingPost = await findExistingPostId(postId)
  if (!existingPost) {
    return { status: false, message: 'Post not found.' }
  }

  const pipeline = buildSinglePostPipeline(postId, userRowId)
  const posts = await runSinglePostAggregate(pipeline)

  return { status: true, message: posts[0] || null }
}
