// modules/community/community.posts.service.ts
//
// Shared delete-post, used by both the Community admin panel and the public app's own post
// delete action (community-user-admin-unification-plan.md, step 2). Branches on
// actor.message.user_type: an admin (2) gets legacy admin_panel/community/posts.js's
// unconditional moderation delete (ported verbatim from community-admin.posts.service.ts's own
// deletePost); a self-service user (1) gets legacy main/community/posts.js's ownership + 24-hour
// window checked delete (~line 202-253), ported verbatim.
const community_postsM = require('../../../models/main/community/community_postsM')

const USER_TYPE_SELF_SERVICE = 1
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface ActorMessage {
  user_type?: number
  user_row_id?: number
}

interface Actor {
  status: boolean
  message: ActorMessage
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
    return deleteAsAdmin(postId)
  }

  return deleteAsOwner(postId, Number(actor.message.user_row_id))
}
