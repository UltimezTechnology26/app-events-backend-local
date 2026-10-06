// modules/community-posts/community-posts.validation.ts
// Ports controllers/main/community/posts.js's per-route express-validator rules, one export per
// route as each gets migrated.
const { check } = require('express-validator')

/** Ports POST /add_details's validation array (~line 32-36) verbatim. */
export const addPostValidation = [
  check('content')
    .trim()
    .notEmpty()
    .withMessage('Post content is required.')
    .isLength({ max: 200 })
    .withMessage('The Post content field must be less than 200 characters.'),
  check('group_id').notEmpty().withMessage('Group ID is required.'),
]

/**
 * Ports POST /add_repost_details's validation array (~line 113-115) verbatim - including
 * legacy's own message text, which says "Post content is required." even though it's validating
 * `post_id` (a pre-existing copy-paste oddity in the user-facing string, not a logic bug - left
 * as-is rather than silently rewording it).
 */
export const addRepostValidation = [check('post_id').notEmpty().withMessage('Post content is required.')]

/** Ports POST /save_like_details's validation array (~line 260-265) verbatim. */
export const saveLikeValidation = [
  check('post_id').trim().not().isEmpty().withMessage('The Post ID field is required.'),
  check('like_status').trim().not().isEmpty().withMessage('The Like Status field is required.'),
]

/** Ports POST /rewrite's validation array (~line 325-330) verbatim. */
export const rewritePostValidation = [check('content').trim().not().isEmpty().withMessage('The Content field is required.')]

/**
 * FIXED (2026-10-05): legacy defines this exact rule array for POST /add_comment (~line 380-384)
 * but never calls `validationResult(req)` to enforce it - genuinely dead code, not a judgment
 * call like expert_tag's wrong-but-maybe-relied-upon value. Now actually wired up in the
 * controller, same as every sibling route in this module.
 */
export const addCommentValidation = [
  check('post_id').trim().not().isEmpty().withMessage('The Post ID field is required.'),
  check('comment').trim().not().isEmpty().withMessage('The Comment field is required.'),
]
