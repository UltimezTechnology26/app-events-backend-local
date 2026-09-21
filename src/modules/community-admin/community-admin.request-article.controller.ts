// modules/community-admin/community-admin.request-article.controller.ts
//
// Phase 4 (backend-only) slice of the Community migration: Requested Articles. Ports
// controllers/admin_panel/main/community/request_article.js. Mounted at a temporary `_v2` prefix
// ('/community/request_article_v2') parallel to the untouched legacy
// '/community/request_article' mount. Per the 2026-09-19 scope change, no admin-panel frontend
// page is built against this route - it exists purely so the backend migration for Community is
// complete module-based/CLAUDE.md-compliant, matching every other phase this session.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getRequestArticleList, updateRequestArticleStatus } from './community-admin.request-article.service'

export const communityRequestArticleRouter: Router = express.Router()

const REQUEST_ARTICLE_ACCESS_IDS = [13]

communityRequestArticleRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, REQUEST_ARTICLE_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

communityRequestArticleRouter.get(
  '/list/:skip/:limit',
  asyncRoute('Requested articles list.', async (req, res) => {
    const result = await getRequestArticleList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
    })
    res.json(result)
  }),
)

communityRequestArticleRouter.post(
  '/change_status/:id',
  writeEndpointRateLimiter,
  asyncRoute('Requested article status change.', async (req, res) => {
    const { status, comment } = req.body
    res.json(await updateRequestArticleStatus(req.params.id as string, status, comment))
  }),
)
