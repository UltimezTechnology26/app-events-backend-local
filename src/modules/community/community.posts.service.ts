// modules/community/community.posts.service.ts
//
// Shared delete-post, used by both the Community admin panel and the public app's own post
// delete action (community-user-admin-unification-plan.md, step 2). Branches on
// actor.message.user_type: an admin (2) gets legacy admin_panel/community/posts.js's
// unconditional moderation delete (ported verbatim from community-admin.posts.service.ts's own
// deletePost); a self-service user (1) gets legacy main/community/posts.js's ownership + 24-hour
// window checked delete (~line 202-253), ported verbatim.
import { canApproveChangeRequests } from '../change-request/change-request.validation'

const community_postsM = require('../../../models/main/community/community_postsM')

const USER_TYPE_SELF_SERVICE = 1
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface ActorMessage {
  user_type?: number
  user_row_id?: number
}

interface ActorTokenMessage {
  admin_manager_type?: number
  sub_admin_type?: number
}

interface Actor {
  status: boolean
  message: ActorMessage
  token_message?: ActorTokenMessage
}

async function deleteAsAdmin(postId: number) {
  const post = await community_postsM.findOne({ _id: postId, post_status: true })
  if (!post) {
    return { status: false, message: 'Post not found.' }
  }

  post.post_status = false
  await post.save()

  return { status: true, message: 'Post status set to deleted successfully.' }
}

async function deleteAsOwner(postId: number, userRowId: number) {
  const post = await community_postsM.findOne({ _id: postId })
  if (!post) {
    return { status: false, message: 'Post not found.' }
  }

  const isOwner = post.is_repost ? post.repost_user_row_id === userRowId : post.user_row_id === userRowId
  if (!isOwner) {
    return { status: false, message: 'Unauthorized to delete this post.' }
  }

  const createdAt = post.is_repost ? new Date(post.reposted_date) : new Date(post.date)
  const timeDiff = Date.now() - createdAt.getTime()
  if (timeDiff > ONE_DAY_MS) {
    return { status: false, message: 'You can only delete a post within 24 hours of creation.' }
  }

  post.post_status = false
  await post.save()

  return { status: true, message: 'Post status set to deleted successfully.' }
}

export async function deleteCommunityPostShared(actor: Actor, postIdRaw: string) {
  if (!actor.status) {
    return actor
  }

  const postId = Number.parseInt(postIdRaw)
  if (Number.isNaN(postId)) {
    return { status: false, message: 'Invalid post id.' }
  }

  const isAdmin = Number(actor.message.user_type) !== USER_TYPE_SELF_SERVICE
  if (isAdmin) {
    // CONFIRMED NEW BEHAVIOR (2026-10-07, user-requested): reuses the same Full-Access-or-main-
    // admin maker-checker policy already enforced for change-request publish/approve elsewhere
    // (see canApproveChangeRequests's own doc comment) - a Marketing Restricted or Developer
    // sub-admin can see and manage posts within this module, but may not permanently delete one.
    // Only applies to the admin-moderation branch - a self-service user's own ownership + 24-hour
    // window delete below is untouched.
    if (!canApproveChangeRequests(actor.token_message?.admin_manager_type, actor.token_message?.sub_admin_type)) {
      return { status: false, message: { alert_message: 'Sorry, you do not have permission to delete this post.' } }
    }
    return deleteAsAdmin(postId)
  }

  return deleteAsOwner(postId, Number(actor.message.user_row_id))
}
