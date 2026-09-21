// modules/sources/sources.controller.ts
// New feature, mounted fresh (no legacy route to run parallel to) at admin_panel/sources.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getCompanySourcesList, getProfessionalSourcesList } from './sources.service'
import { getSourceFeedDetail } from './sources.feeds.service'
import { AdminAuthResult, SourcesListParams } from './sources.types'

export const sourcesRouter: Router = express.Router()

const SOURCES_ACCESS_IDS = [1]

function readListParams(req: Request): SourcesListParams {
  return {
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string,
    sourceType: req.query.source_type as string,
    sourceOrigin: req.query.source_origin as string,
    status: req.query.status as string,
    isVerified: req.query.is_verified as string,
    fetchStatus: req.query.fetch_status as string,
    entityId: req.query.entity_id as string,
    sortBy: req.query.sort_by as string,
    order: req.query.order as string,
    tier: req.query.tier as string,
    feedType: req.query.feed_type as string,
    refreshType: req.query.refresh_type as string,
    scraperUsed: req.query.scraper_used as string,
    sitemapFound: req.query.sitemap_found as string,
  }
}

// Mirrors parsePaging's own fallback in sources.service.ts (default limit 50, default skip 0) so
// a malformed skip/limit in the feed-detail URL degrades the same way the list route's does.
function readPagingParam(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

sourcesRouter.get('/companies/list/:skip/:limit', asyncRoute('Company sources list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, SOURCES_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getCompanySourcesList(readListParams(req)))
}))

sourcesRouter.get('/professionals/list/:skip/:limit', asyncRoute('Professional sources list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, SOURCES_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getProfessionalSourcesList(readListParams(req)))
}))

sourcesRouter.get('/companies/feed-detail/:sourceUrlId/:skip/:limit', asyncRoute('Company source feed detail.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, SOURCES_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  const skip = readPagingParam(req.params.skip as string, 0)
  const limit = readPagingParam(req.params.limit as string, 50)
  res.json(await getSourceFeedDetail('company', req.params.sourceUrlId as string, skip, limit))
}))

sourcesRouter.get('/professionals/feed-detail/:sourceUrlId/:skip/:limit', asyncRoute('Professional source feed detail.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, SOURCES_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  const skip = readPagingParam(req.params.skip as string, 0)
  const limit = readPagingParam(req.params.limit as string, 50)
  res.json(await getSourceFeedDetail('professional', req.params.sourceUrlId as string, skip, limit))
}))
