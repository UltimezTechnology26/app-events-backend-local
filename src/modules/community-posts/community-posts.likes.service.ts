// modules/community-posts/community-posts.likes.service.ts
// Ports controllers/main/community/posts.js's POST /save_like_details (~line 260-311).
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const CommunityPostsM = require('../../../models/main/community/community_postsM')
const CommunityLikesM = require('../../../models/main/community/community_likesM')
import { SaveLikeBody } from './community-posts.types'

/**
 * CONFIRMED PRE-EXISTING BUG, fixed here (a crash, not a judgment call - same class already fixed
 * for add_details): legacy's own "Invalid post id" branch sends a response but never `return`s, so
 * execution falls through into the save/update logic below it and tries to send a SECOND response
 * on the same request - which throws `ERR_HTTP_HEADERS_SENT` once the first response's headers are
 * already flushed, caught by the outer catch block, which then attempts a THIRD response and fails
 * the same way. Fixed by returning immediately after the invalid-post-id response, same as every
 * other branch in this function already does by virtue of being its own last statement.
 */
export async function saveLikeDetails(userRowId: number, body: SaveLikeBody) {
  const postId = Number.parseInt(String(body.post_id))
  const checkQuery = await CommunityPostsM.findOne({ _id: postId }, { _id: 1 })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Invalid post id' } }
  }

  if (!(body.post_id && userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Please try with valid inputs.' } }
  }

  const likeStatus = Number.parseInt(String(body.like_status))
  const existingLike = await CommunityLikesM.findOne({ post_id: body.post_id, user_row_id: userRowId })

  if (!existingLike) {
    const like = new CommunityLikesM({ user_row_id: userRowId, post_id: body.post_id, like_status: likeStatus, date_n_time: getPresentDateTime() })
    await like.save()
    return { status: true, message: { alert_message: 'We appreciate your review.' } }
  }

  existingLike.like_status = likeStatus
  existingLike.date_n_time = getPresentDateTime()
  await existingLike.save()
  return { status: true, message: { alert_message: 'Your review has been updated.' } }
}
