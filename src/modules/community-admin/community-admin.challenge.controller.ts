// modules/community-admin/community-admin.challenge.controller.ts
//
// Phase 3 slice of the Community migration (21 Days Challenge tab). Ports routes out of
// controllers/admin_panel/main/community/21dayschallenge.js. Mounted at a temporary `_v2` prefix
// ('/community/challenge_v2') parallel to the untouched legacy '/admin_panel/community/challenge'
// mount.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getChallengeList, getChallengeUserPosts, updateChallengeValidStatus, updateChallengeReleasedStatus } from './community-admin.challenge.service'

export const communityChallengeRouter: Router = express.Router()

const COMMUNITY_CHALLENGE_ACCESS_IDS = [13]

communityChallengeRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, COMMUNITY_CHALLENGE_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

communityChallengeRouter.get(
  '/list/:skip/:limit',
  asyncRoute('Community 21-day challenge list.', async (req, res) => {
    const result = await getChallengeList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
    })
    res.json(result)
  }),
)

communityChallengeRouter.get(
  '/get_user_posts/:user_row_id',
  asyncRoute('Community 21-day challenge user posts.', async (req, res) => {
    res.json(await getChallengeUserPosts(req.params.user_row_id as string))
  }),
)

communityChallengeRouter.post(
  '/update_valid_status/:id',
  writeEndpointRateLimiter,
  asyncRoute('Community 21-day challenge validate.', async (req, res) => {
    res.json(await updateChallengeValidStatus(req.params.id as string, req.body.valid_status))
  }),
)

communityChallengeRouter.post(
  '/update_released_status/:id',
  writeEndpointRateLimiter,
  asyncRoute('Community 21-day challenge release reward.', async (req, res) => {
    res.json(await updateChallengeReleasedStatus(req.params.id as string, req.body.released_status))
  }),
)
