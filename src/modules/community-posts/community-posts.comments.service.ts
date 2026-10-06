// modules/community-posts/community-posts.comments.service.ts
// Ports controllers/main/community/posts.js's POST /add_comment (~line 380-414).
//
// FIXED (2026-10-05): legacy defines an express-validator rule array for this route but never
// calls `validationResult(req)` to read it, so an empty `post_id`/`comment` fell through to
// `community_commentsM`'s own Mongoose-level `required: true` constraint at `.save()` time instead,
// producing a generic "An unexpected error occurred" message rather than the validator's own
// field-specific one. The controller now actually enforces `addCommentValidation` before calling
// this function, so `post_id`/`comment` are guaranteed non-empty by the time execution reaches
// here - the Mongoose-level constraint stays as a defense-in-depth backstop, not the primary path.
const CommunityPostsM = require('../../../models/main/community/community_postsM')
const CommunityCommentsM = require('../../../models/main/community/community_commentsM')
import { AddCommentBody } from './community-posts.types'

export async function addComment(userRowId: number, body: AddCommentBody) {
  const { post_id: postId, comment, parent_comment_id: parentCommentId = null } = body

  const postExists = await CommunityPostsM.findOne({ _id: postId, post_status: true })
  if (!postExists) {
    return { httpStatus: 404, body: { status: false, message: 'Post not found.' } }
  }

  if (parentCommentId) {
    const parent = await CommunityCommentsM.findOne({ _id: parentCommentId })
    if (!parent) {
      return { httpStatus: 400, body: { status: false, message: 'Parent comment not found.' } }
    }
  }

  const newComment = new CommunityCommentsM({ post_id: postId, user_row_id: userRowId, comment, parent_comment_id: parentCommentId })
  await newComment.save()

  return { httpStatus: 200, body: { status: true, message: { alert_message: 'Comment added successfully.' } } }
}
