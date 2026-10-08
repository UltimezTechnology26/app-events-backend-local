// modules/community/community.posts.controller.ts
//
// Second shared admin+user route of the Community unification (step 2 of
// community-user-admin-unification-plan.md). CUTOVER COMPLETE (2026-10-08): both legacy routes
// this replaced - `admin_panel/community/posts.js`'s own `delete_post` (admin-only, unconditional)
// and `main/community/posts.js`'s `/delete_post/:post_id` (user-only, ownership + 24h window) -
// are deleted; this module now owns the plain '/app/community/delete_post/:post_id' path (no more
// `_v2` suffix).
//
// Gated by checkAllLoginToken (access-type id 13, same as every other Community admin route) -
// unlike group list, both legacy sides here genuinely require a known caller (the user side needs
// to know who's asking, to check ownership), so this gate is correct here. See the plan doc's
// lesson-learned note from the group-list merge before copying this gate onto a future route
// without re-checking both legacy sides' actual auth requirements first.
import express, { Router, Request, Response } from 'express'
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { deleteCommunityPostShared } from './community.posts.service'

export const communityDeletePostRouter: Router = express.Router()

const COMMUNITY_ACCESS_IDS = [13]

communityDeletePostRouter.get('/:post_id', async (req: Request, res: Response) => {
  const actor = await checkAllLoginToken(req.headers, COMMUNITY_ACCESS_IDS)
  const result = await deleteCommunityPostShared(actor, req.params.post_id as string)
  res.json(result)
})
