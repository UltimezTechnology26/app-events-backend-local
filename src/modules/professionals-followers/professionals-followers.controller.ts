// modules/professionals-followers/professionals-followers.controller.ts
//
// Ports controllers/app/users/followers.js (9 routes, ~16-1444) and the two admin routes flagged
// in Phase A's header comment for inconsistent permission ids — controllers/admin_panel/app/
// user.js's /user_followers (~1499-1640, access id [10]) and /login_into_account (~258-320,
// access id [0]). See professionals-followers.service.ts's doc comment for why those two ids are
// preserved exactly, not normalized to [1].
//
// Mounted at temporary `_v2` prefixes (routes/app.js: '/followers_v2', routes/admin_panel.js:
// '/users_followers_v2') parallel to the untouched legacy mounts.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken, checkAllLoginToken, checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  getFollowersList, getFollowingList, followUser, getFollowRequestsPendingList,
  confirmRequest, deleteFollowRequest, unfollowUser, removeUserFromFollower, viewUser, getCompanyFollowingList,
  getAdminUserFollowersList, loginIntoAccount,
} from './professionals-followers.service'
import { UserAuthResult, AdminAuthResult } from './professionals-followers.types'

export const appFollowersRouter: Router = express.Router()
export const adminFollowersRouter: Router = express.Router()

appFollowersRouter.get('/followers_list', asyncRoute('Followers list.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getFollowersList(auth, req.query.user_row_id, req.query.search as string))
}))

appFollowersRouter.get('/following_list', asyncRoute('Following List.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getFollowingList(auth, req.query.user_row_id, req.query.search as string))
}))

appFollowersRouter.get(
  '/follow_user/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Follow user.', async (req: Request, res: Response) => {
    const auth = checkUserLoginToken(req.headers)
    res.json(await followUser(auth, req.params.user_row_id as string))
  }),
)

appFollowersRouter.get('/follow_requests_pending_list', asyncRoute('Follow requests pending.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getFollowRequestsPendingList(auth, req.query.user_row_id, req.query.search as string))
}))

appFollowersRouter.get(
  '/confirm_request/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Confirm request.', async (req: Request, res: Response) => {
    const auth = checkUserLoginToken(req.headers)
    res.json(await confirmRequest(auth, req.params.user_row_id as string))
  }),
)

appFollowersRouter.get(
  '/delete_follow_request/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Delete follow request.', async (req: Request, res: Response) => {
    const auth = checkUserLoginToken(req.headers)
    res.json(await deleteFollowRequest(auth, req.params.user_row_id as string))
  }),
)

appFollowersRouter.get(
  '/unfollow_user/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Unfollow User.', async (req: Request, res: Response) => {
    const auth = checkUserLoginToken(req.headers)
    res.json(await unfollowUser(auth, req.params.user_row_id as string))
  }),
)

appFollowersRouter.get(
  '/remove_user_from_follower/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Remove user from follower.', async (req: Request, res: Response) => {
    const auth = checkUserLoginToken(req.headers)
    res.json(await removeUserFromFollower(auth, req.params.user_row_id as string))
  }),
)

appFollowersRouter.get('/view_user/:user_row_id', asyncRoute('View user.', async (req: Request, res: Response) => {
  const auth = checkUserLoginToken(req.headers)
  res.json(await viewUser(auth, req.params.user_row_id as string))
}))

appFollowersRouter.get('/company_following_list', asyncRoute('Company following list.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getCompanyFollowingList(auth, req.query.user_row_id, req.query.search as string))
}))

// Access id [10] preserved exactly — see professionals-followers.service.ts's doc comment.
adminFollowersRouter.get('/user_followers/:user_row_id', asyncRoute('User followers error:', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [10])
  if (!auth.status) return res.json(auth)
  res.json(await getAdminUserFollowersList(auth, Number.parseInt(req.params.user_row_id as string), req.query.search as string))
}))

// Access id [0] preserved exactly — see professionals-followers.service.ts's doc comment.
// No rate limiter: matches this migration's established convention (write-endpoint limiter only
// on routes that mutate data) — this route only reads and issues a JWT, it writes nothing.
adminFollowersRouter.get('/login_into_account/:user_row_id', asyncRoute('Login into user account.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [0])
  if (!auth.status) return res.json(auth)
  res.json(await loginIntoAccount(auth, Number.parseInt(req.params.user_row_id as string)))
}))
