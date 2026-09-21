// modules/community-admin/community-admin.posts.service.ts
//
// Ports posts.js's Manage Community Posts routes (deleted_list/delete_post/overview,
// ~line 1-425) - the Phase 3-relevant slice. Also backs "All Posts" (post_status: true), reusing
// the same fixed pipeline (legacy's own "All Posts" equivalent lived in a different file,
// services/main/community/posts.ts, shared with the app-facing feed - this module ports a
// dedicated admin-scoped copy instead of reusing that shared route, since the admin panel doesn't
// need the app-facing extras like `user_following_status`/`login_status`/`approval_status`).
//
// `community_postsM` is NOT colocated here - confirmed generic/shared across the whole app
// (wired into index.js's own change-stream setup), matching the same "required directly, not
// owned" precedent already documented in professionals-community.models.ts for this exact model.
const community_postsM = require('../../../models/main/community/community_postsM')
import { buildPostsBaseMatchQuery, buildPostsListPipeline, extractPostsListResult } from './community-admin.posts.queries'
import { GetPostsListParams } from './community-admin.posts.types'

async function getPostsListByStatus(params: GetPostsListParams, postStatus: boolean) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 20

  const matchQuery = buildPostsBaseMatchQuery({ groupIdRaw: params.groupIdRaw, startDate: params.startDate, endDate: params.endDate, postStatus })
  const pipeline = buildPostsListPipeline({ matchQuery, search: params.search?.trim(), skip, limit })
  const aggregateOutput = await community_postsM.aggregate(pipeline)
  const { data, count } = extractPostsListResult(aggregateOutput)

  return { status: true, message: data, count }
}

/** Backs "All Posts" - ported/fixed equivalent of `services/main/community/posts.ts`'s `getPostsList`, scoped for admin display (post_status: true). */
export async function getPostsList(params: GetPostsListParams) {
  return getPostsListByStatus(params, true)
}

/** Ports /deleted_list/:skip/:limit (~line 7-266). See community-admin.posts.queries.ts's own doc comment for the 2 confirmed bugs fixed here (search-before-pagination correctness bug, missing count). */
export async function getDeletedPostsList(params: GetPostsListParams) {
  return getPostsListByStatus(params, false)
}

/** Ports /delete_post/:post_id (~line 268-294) verbatim - a soft delete (post_status: false). */
export async function deletePost(postIdRaw: string) {
  const postId = Number.parseInt(postIdRaw)
  if (Number.isNaN(postId)) {
    return { status: false, message: 'Invalid post id.' }
  }

  const post = await community_postsM.findOne({ _id: postId, post_status: true })
  if (!post) {
    return { status: false, message: 'Post not found.' }
  }

  post.post_status = false
  await post.save()

  return { status: true, message: 'Post status set to deleted successfully.' }
}

/** Ports /overview (~line 296-419) verbatim. */
export async function getPostsOverview() {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const tomorrowStart = new Date(startOfToday)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const last7Days = new Date(startOfToday)
  last7Days.setDate(last7Days.getDate() - 7)
  const last30Days = new Date(startOfToday)
  last30Days.setDate(last30Days.getDate() - 30)

  const postCounts = await community_postsM.aggregate([
    { $match: { post_status: true } },
    {
      $group: {
        _id: null,
        today: { $sum: { $cond: [{ $and: [{ $gte: ['$date', startOfToday] }, { $lt: ['$date', tomorrowStart] }] }, 1, 0] } },
        yesterday: { $sum: { $cond: [{ $and: [{ $gte: ['$date', startOfYesterday] }, { $lt: ['$date', startOfToday] }] }, 1, 0] } },
        last7days: { $sum: { $cond: [{ $and: [{ $gte: ['$date', last7Days] }, { $lt: ['$date', startOfToday] }] }, 1, 0] } },
        last30days: { $sum: { $cond: [{ $and: [{ $gte: ['$date', last30Days] }, { $lt: ['$date', startOfToday] }] }, 1, 0] } },
      },
    },
  ])

  const finalData = postCounts[0] || { today: 0, yesterday: 0, last7days: 0, last30days: 0 }
  return { status: true, message: finalData }
}
