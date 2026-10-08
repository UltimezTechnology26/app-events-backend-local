// modules/community-posts/community-posts.feed.controller.ts
//
// Migrates controllers/main/community/posts.js's GET /get_posts/:skip/:limit,
// GET /get_single_post/:post_id and GET /get_user_posts/:skip/:limit. CUTOVER COMPLETE
// (2026-10-07): that legacy file is gone; this module now owns the plain '/main/posts' path (no
// more `_v2` suffix) alongside community-posts.controller.ts, with no parallel legacy sibling.
//
// GET /get_posts uses `checkAllLoginToken(req.headers, [13])` same as legacy - not because an
// admin gets different data (they don't; only a self-service user, `user_type === 1`, gets
// personalization), but because that's the exact gate legacy's own route already used. Ported
// as-is, not simplified to `checkUserLoginToken`, to avoid a deviation that wasn't asked for.
//
// GET /get_single_post uses plain optional `checkUserLoginToken` (legacy's own sentinel for a
// logged-out caller there is `0`, a number - different from get_posts's own `""` sentinel. Both
// preserved exactly as legacy had them, not unified, since they're two different routes' own
// pre-existing conventions.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getPostsList, getSinglePostDetails } from './community-posts.feed.service'
import { getUserPosts } from './community-posts.user-posts.service'

export const communityPostsFeedRouter: Router = express.Router()

const COMMUNITY_ACCESS_IDS = [13]

communityPostsFeedRouter.get(
  '/get_posts/:skip/:limit',
  asyncRoute('Community posts get_posts.', async (req: Request, res: Response) => {
    const actor = await checkAllLoginToken(req.headers, COMMUNITY_ACCESS_IDS)
    const userRowId = actor?.status && Number(actor.message?.user_type) === 1 ? actor.message.user_row_id : ''

    const result = await getPostsList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      groupIdRaw: req.query.group_id as string | undefined,
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
      userRowId,
    })
    res.json(result)
  }),
)

communityPostsFeedRouter.get(
  '/get_single_post/:post_id',
  asyncRoute('Community posts get_single_post.', async (req: Request, res: Response) => {
    const checkToken = checkUserLoginToken(req.headers)
    const userRowId = checkToken.status ? Number(checkToken.message) : 0
    const result = await getSinglePostDetails(req.params.post_id as string, userRowId)
    res.json(result)
  }),
)

// Same checkAllLoginToken([13]) gate as get_posts: a self-service user (user_type 1) sees their
// own posts; an admin (user_type 2) can view any user's posts via `?user_row_id=`, matching
// legacy's own branch exactly even though no known admin UI currently exercises it.
communityPostsFeedRouter.get(
  '/get_user_posts/:skip/:limit',
  asyncRoute('Community posts get_user_posts.', async (req: Request, res: Response) => {
    const actor = await checkAllLoginToken(req.headers, COMMUNITY_ACCESS_IDS)
    if (!actor.status) {
      return res.json(actor)
    }

    const userRowId = Number(actor.message?.user_type) === 1 ? Number(actor.message.user_row_id) : Number.parseInt(req.query.user_row_id as string)

    const result = await getUserPosts({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      groupIdRaw: req.query.group_id as string | undefined,
      userRowId,
    })
    res.json(result)
  }),
)
