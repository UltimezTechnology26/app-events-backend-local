// modules/community-admin/community-admin.request-article.self-service.controller.ts
//
// Ports controllers/main/community/request_articles.js's POST /publish_request verbatim. Mounted
// at a temporary `_v2` prefix (routes/main.js: '/request_article_v2') parallel to the untouched
// legacy '/request_article' mount. Backend-only per the 2026-09-19 scope change.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { check, validationResult } = require('express-validator')
const { arrangeValidation } = require('../../../utils/helpers/helper')
import { submitArticlePublishRequest } from './community-admin.request-article.self-service.service'

export const communityRequestArticleSelfServiceRouter: Router = express.Router()

communityRequestArticleSelfServiceRouter.post(
  '/publish_request',
  [check('topic').notEmpty().withMessage('Topic is required.')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)
      const errObj = arrangeValidation(errors)
      if (Object.keys(errObj).length > 0) {
        return res.json({ status: false, message: errObj })
      }

      const checkToken = checkUserLoginToken(req.headers)
      if (!checkToken.status) {
        return res.json({ status: false, message: { alert_message: checkToken.message } })
      }

      const userRowId = Number.parseInt(checkToken.message)
      const { topic, document_link: documentLink, article_content: articleContent } = req.body

      const result = await submitArticlePublishRequest({ userRowId, topic, documentLink, articleContent })
      return res.json(result)
    } catch (err) {
      // Matches legacy's own catch block exactly (including leaking err.message) - FLAGGED, NOT
      // FIXED, same class of deviation-needs-sign-off already documented in
      // professionals-community.controller.ts for the identical legacy pattern.
      return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err instanceof Error ? err.message : String(err) })
    }
  },
)
