// modules/community-admin/community-admin.posts.controller.ts
//
// Phase 3 slice of the Community migration (All Posts / Deleted Posts). Ports routes out of
// controllers/admin_panel/main/community/posts.js. Mounted at a temporary `_v2` prefix
// ('/community/posts_v2') parallel to the untouched legacy '/admin_panel/community/posts' mount.
// "All Posts" itself is new here (legacy's real "All Posts" data came from the shared, app-facing
// `main/posts/get_posts` route) - ported as a dedicated admin-scoped route instead, per this
// module's own service-file doc comment.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getPostsList, getDeletedPostsList, deletePost, getPostsOverview } from './community-admin.posts.service'

export const communityPostsRouter: Router = express.Router()

const COMMUNITY_POSTS_ACCESS_IDS = [13]

communityPostsRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, COMMUNITY_POSTS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

communityPostsRouter.get(
  '/overview',
  asyncRoute('Community posts overview.', async (_req, res) => {
    res.json(await getPostsOverview())
  }),
)

communityPostsRouter.get(
  '/list/:skip/:limit',
  asyncRoute('Community posts list (All Posts).', async (req, res) => {
    const result = await getPostsList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      groupIdRaw: req.query.group_id as string,
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
    })
    res.json(result)
  }),
)

communityPostsRouter.get(
  '/deleted_list/:skip/:limit',
  asyncRoute('Community deleted posts list.', async (req, res) => {
    const result = await getDeletedPostsList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      groupIdRaw: req.query.group_id as string,
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
    })
    res.json(result)
  }),
)

communityPostsRouter.get(
  '/delete_post/:post_id',
  writeEndpointRateLimiter,
  asyncRoute('Community post delete.', async (req, res) => {
    res.json(await deletePost(req.params.post_id as string))
  }),
)
