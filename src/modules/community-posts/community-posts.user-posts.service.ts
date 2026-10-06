// modules/community-posts/community-posts.user-posts.service.ts
// Ports controllers/main/community/posts.js's GET /get_user_posts/:skip/:limit (~line 437-685).
//
// CONFIRMED PERF FIX: legacy runs the posts aggregate and the separate total-count aggregate as
// two sequential `await`s, even though neither depends on the other's result - Promise.all'd here
// instead, same standard fix applied everywhere else in this migration.
import { buildUserPostsMatchStage, buildUserPostsPipeline, runUserPostsAggregate, countUserPosts } from './community-posts.user-posts.queries'

export interface GetUserPostsParams {
  skipRaw: string
  limitRaw: string
  groupIdRaw?: string
  userRowId: number
}

const DEFAULT_USER_POSTS_LIMIT = 10

export async function getUserPosts(params: GetUserPostsParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : DEFAULT_USER_POSTS_LIMIT
  const groupId = params.groupIdRaw ? Number.parseInt(params.groupIdRaw) : null

  const matchStage = buildUserPostsMatchStage(params.userRowId, groupId)
  const pipeline = buildUserPostsPipeline(matchStage, skip, limit, params.userRowId)

  const [posts, totalCount] = await Promise.all([runUserPostsAggregate(pipeline), countUserPosts(matchStage)])

  return { status: true, message: posts, count: totalCount }
}
