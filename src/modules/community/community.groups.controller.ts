// modules/community/community.groups.controller.ts
//
// First shared admin+user route of the Community unification (see
// community-user-admin-unification-plan.md). CUTOVER COMPLETE (2026-10-08): both legacy routes
// this replaced - `admin_panel/community/groups/group_list` (admin-gated) and
// `main/community/posts.js`'s `/group_list` (fully public, no auth check at all) - are deleted;
// this module now owns the plain '/app/community/group_list' path (no more `_v2` suffix).
//
// NO AUTH GATE (deliberate, not an oversight): unlike company.faq/company_holdings/etc., this
// data has no permission differences between callers at all - every visitor, logged in or not,
// sees the identical group list, same as legacy's public route. An earlier version of this file
// gated it with checkAllLoginToken, which broke anonymous browsing on the public Community page
// (confirmed via screenshot: logged-out visitors got "Token field is required" instead of the
// group list). Fixed by dropping the gate entirely rather than forcing every "shared route" into
// the checkAllLoginToken pattern regardless of whether the underlying data is actually restricted.
import express, { Router, Request, Response } from 'express'
import { getGroupList } from './community.groups.service'

export const communityGroupListRouter: Router = express.Router()

communityGroupListRouter.get('/', async (_req: Request, res: Response) => {
  const result = await getGroupList()
  res.json(result)
})
