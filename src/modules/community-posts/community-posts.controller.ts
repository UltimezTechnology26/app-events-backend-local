// modules/community-posts/community-posts.controller.ts
//
// Migrates the user-only routes from controllers/main/community/posts.js. CUTOVER COMPLETE
// (2026-10-07): that legacy file (and its own service file, services/main/community/posts.ts)
// are gone; this module now owns the plain '/main/posts' path (no more `_v2` suffix) alongside
// community-posts.feed.controller.ts, with no parallel legacy sibling. No checkAllLoginToken
// needed here or on any route in this module - there's no admin equivalent for any of them, same
// as benefits/pro_batch.
//
// Auth is OPTIONAL on this route (not required, not absent either): legacy's own /leaderboard
// works for a logged-out visitor (no `your_rank` in the response) and personalizes it when a
// valid user token is present - ported verbatim, not a stricter or looser gate than legacy had.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { validationResult } = require('express-validator')
const { arrangeValidation } = require('../../../utils/helpers/helper')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import logger from '../../../config/logger'
import { getLeaderboard } from './community-posts.service'
import { createPost, createRepost } from './community-posts.create.service'
import { saveLikeDetails } from './community-posts.likes.service'
import { rewritePostContent } from './community-posts.rewrite.service'
import { addComment } from './community-posts.comments.service'
import { addPostValidation, addRepostValidation, saveLikeValidation, rewritePostValidation, addCommentValidation } from './community-posts.validation'
import { CreatePostBody, CreateRepostBody, SaveLikeBody, RewritePostBody, AddCommentBody } from './community-posts.types'

export const communityPostsRouter: Router = express.Router()

communityPostsRouter.get(
  '/leaderboard',
  asyncRoute('Community posts leaderboard.', async (req: Request, res: Response) => {
    const checkToken = checkUserLoginToken(req.headers)
    const userRowId = checkToken.status ? Number(checkToken.message) : undefined
    const result = await getLeaderboard(userRowId)
    res.json(result)
  }),
)

communityPostsRouter.post(
  '/add_details',
  writeEndpointRateLimiter,
  addPostValidation,
  asyncRoute('Community posts add_details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))

    const checkToken = checkUserLoginToken(req.headers)
    if (!checkToken.status) {
      return res.json({ status: false, message: { alert_message: checkToken.message } })
    }

    const userRowId = Number(checkToken.message)
    const result = await createPost(userRowId, req.body as CreatePostBody, errObj)
    res.json(result)
  }),
)

communityPostsRouter.post(
  '/add_repost_details',
  writeEndpointRateLimiter,
  addRepostValidation,
  asyncRoute('Community posts add_repost_details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))

    const checkToken = checkUserLoginToken(req.headers)
    if (!checkToken.status) {
      return res.json({ status: false, message: { alert_message: checkToken.message } })
    }

    const userRowId = Number(checkToken.message)
    const result = await createRepost(userRowId, req.body as CreateRepostBody, errObj)
    res.json(result)
  }),
)

communityPostsRouter.post(
  '/save_like_details',
  writeEndpointRateLimiter,
  saveLikeValidation,
  asyncRoute('Community posts save_like_details.', async (req: Request, res: Response) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (!checkToken.status) {
      // Legacy forwards `checkToken` as-is here, unlike add_details/add_repost_details which
      // re-wrap it in `{alert_message: ...}` - two different routes' own pre-existing shapes,
      // each ported exactly as that specific route had it.
      return res.json(checkToken)
    }

    const errObj = arrangeValidation(validationResult(req))
    if (Object.keys(errObj).length > 0) {
      return res.json({ status: false, message: errObj })
    }

    const userRowId = Number(checkToken.message)
    const result = await saveLikeDetails(userRowId, req.body as SaveLikeBody)
    res.json(result)
  }),
)

// NOT wrapped in asyncRoute: legacy's own catch block here returns 500 (every other asyncRoute
// catch defaults to 200), and its validation-failure branch returns the raw express-validator
// error array under `errors`, not the flattened `{field: message}` shape every other route in
// this module uses via arrangeValidation - both preserved exactly as legacy had them.
communityPostsRouter.post('/rewrite', writeEndpointRateLimiter, rewritePostValidation, async (req: Request, res: Response) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }

  const checkToken = checkUserLoginToken(req.headers)
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  try {
    const result = await rewritePostContent((req.body as RewritePostBody).content)
    return res.status(200).json(result)
  } catch (err) {
    logger.error({ err, path: req.path }, `Rewrite error: ${err instanceof Error ? err.message : String(err)} openai`)
    return res.status(500).json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// FIXED (2026-10-05): legacy defines a validation array for this route but never enforces it (see
// addCommentValidation's own doc comment) - now actually checked, same order as save_like_details
// (token check first, then validation).
communityPostsRouter.post(
  '/add_comment',
  writeEndpointRateLimiter,
  addCommentValidation,
  asyncRoute('Community posts add_comment.', async (req: Request, res: Response) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const errObj = arrangeValidation(validationResult(req))
    if (Object.keys(errObj).length > 0) {
      return res.json({ status: false, message: errObj })
    }

    const userRowId = Number(checkToken.message)
    const { httpStatus, body } = await addComment(userRowId, req.body as AddCommentBody)
    res.status(httpStatus).json(body)
  }),
)
