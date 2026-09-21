import express, { Router } from 'express'
const { checkAdminLoginToken } = require('../../middleware/authorization')
const redisCache = require('../../config/redis').default
const seo = require('@ultimez-interview/coinpedia-backend-library').seo

export const seoRouter: Router = express.Router()

// Both models are required directly, never re-created here - Mongoose only
// allows one `model()` registration per name per connection, and each of
// these is already registered exactly once at its own canonical location:
// models/seo_static_urlsM.js and models/seo_change_logsM.js. cln_seo_change_logs
// is the single shared change log for every SEO-tracked module (static
// pages and every entity type), distinguished by module_key - not a
// module-specific collection.
const staticUrlModel = require('../../models/seo_static_urlsM')
const changeLogModel = require('../../models/seo_change_logsM')
const adminM = require('../../models/admin_panel/admin_authM')
const subAdminM = require('../../models/admin_panel/app/sub_adminM')

function unauthorized() {
  return { status: false, message: { alert_message: 'Sorry, this action requires admin access.' } }
}

// Resolves the editing admin's name/email/role from cln_admins or
// cln_sub_admins (admin_manager_type 1 vs 2, per middleware/authorization.js)
// BEFORE the change-log write, so the log entry stores a snapshot that stays
// correct even if the account is later renamed or removed - not just an id
// to join live later, which is what silently fails today for full admins
// (no existing reader joins cln_admins at all).
async function resolveUpdatedBy(tokenDecoded: any) {
  const adminRowId = tokenDecoded.admin_row_id
  if (Number(tokenDecoded.admin_manager_type) === 2) {
    const subAdmin = await subAdminM.findById(adminRowId).lean()
    return {
      userType: 'sub_admin' as const,
      updatedBy: String(adminRowId),
      updatedByName: subAdmin?.full_name || '',
      updatedByEmail: subAdmin?.email_id || '',
      updatedByRole: String(tokenDecoded.sub_admin_type ?? subAdmin?.sub_admin_type ?? ''),
    }
  }
  const admin = await adminM.findById(adminRowId).lean()
  return {
    userType: 'admin' as const,
    updatedBy: String(adminRowId),
    updatedByName: admin?.full_name || '',
    updatedByEmail: admin?.email_id || '',
  }
}

// Mirrors the breadcrumbItems derivation the public `/schema` route uses
// (record.page_name/page_type + canonical_url), so rule #2's required-field
// check validates against the same data the schema will actually be built
// from, instead of always seeing an empty object.
function toValidationContext(record: any) {
  const breadcrumbItems = record?.canonical_url
    ? [{ name: record.page_name || record.page_type, url: record.canonical_url }]
    : []
  return {
    expectedCanonicalUrl: record?.canonical_url,
    entityName: record?.page_name,
    schemaData: { BreadcrumbList: { breadcrumbItems } },
  }
}

// --- Admin: list static pages, with the score/issue-summary the Static
// Pages screen's table needs. Any admin - matches this repo's `[-1]`
// convention for "no specific access_type gate, just needs to be an admin." ---
seoRouter.get('/static-pages', async (req, res) => {
  try {
    const auth = checkAdminLoginToken(req.headers, [-1])
    if (!auth.status) return res.json(unauthorized())

    const { module, search, robots_state, issues_only } = req.query as Record<string, string | undefined>
    const query: Record<string, unknown> = {}
    if (module) query.module = module
    if (robots_state === 'noindex') query.robots_index = 'noindex'
    if (robots_state === 'index') query.robots_index = 'index'
    if (search) {
      query.$or = [
        { page_name: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } },
      ]
    }

    const records = await staticUrlModel.find(query).lean()

    const rows = records.map((record: any) => {
      const issues = seo.validateSeoRecord(record, toValidationContext(record))
      const score = seo.computeSeoScore(record, issues)
      return { ...record, seo_score: score.total, seo_issues: issues }
    })

    const filtered = issues_only === 'true' ? rows.filter((r: any) => r.seo_issues.length > 0) : rows

    res.json({
      status: true,
      message: filtered,
      count: filtered.length,
      stats: {
        total: rows.length,
        missing_title: rows.filter((r: any) => !r.meta_title).length,
        missing_description: rows.filter((r: any) => !r.meta_description).length,
        canonical_issues: rows.filter((r: any) => r.seo_issues.some((i: any) => i.code === 'canonical_mismatch')).length,
        structured_data_issues: rows.filter((r: any) => r.seo_issues.some((i: any) => i.code === 'schema_missing_required_field')).length,
      },
    })
  } catch (err: any) {
    console.log('SEO static-pages list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin: get one static page record. ---
seoRouter.get('/static-pages/:module/:page_type', async (req, res) => {
  try {
    const auth = checkAdminLoginToken(req.headers, [-1])
    if (!auth.status) return res.json(unauthorized())

    const record = await seo.getSeoRecord(staticUrlModel, { module: req.params.module, page_type: req.params.page_type })
    if (!record) return res.json({ status: false, message: { alert_message: 'Sorry, this static page record was not found.' } })

    const issues = seo.validateSeoRecord(record, toValidationContext(record))
    const score = seo.computeSeoScore(record, issues)
    res.json({ status: true, message: { ...record, seo_score: score, seo_issues: issues } })
  } catch (err: any) {
    console.log('SEO static-page get.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin: update (upsert) a static page's SEO fields. Save + change-log
// write happen together via upsertSeoRecord(), so logging can't be skipped. ---
seoRouter.post('/static-pages/:module/:page_type', async (req, res) => {
  try {
    const auth = checkAdminLoginToken(req.headers, [-1])
    if (!auth.status) return res.json(unauthorized())

    const { module, page_type } = req.params
    const query = { module, page_type }
    const data = {
      ...req.body,
      module,
      page_type,
      url: req.body.url,
    }

    const updatedByInfo = await resolveUpdatedBy(auth.message)

    const saved = await seo.upsertSeoRecord(
      staticUrlModel,
      changeLogModel,
      query,
      data,
      `static_${module}`,
      page_type,
      updatedByInfo
    )

    await seo.invalidateSeoCache(redisCache, `seo:static:${module}:${page_type}*`)

    res.json({ status: true, message: { alert_message: 'Static page SEO details updated successfully.', record: saved } })
  } catch (err: any) {
    console.log('SEO static-page update.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Public: schema-resolution read. No auth - every public frontend page
// calls this to get its JSON-LD, so it must stay unauthenticated. Returns
// only what's meant to be public: the resolved schema array, nothing else
// from the record (no internal/draft fields). ---
seoRouter.get('/schema/:module/:page_type', async (req, res) => {
  try {
    const record: any = await seo.getSeoRecord(staticUrlModel, { module: req.params.module, page_type: req.params.page_type })
    if (!record) return res.json({ status: true, message: [] })

    const appliedSchemas = (record.applied_schemas || []).filter((s: string) =>
      Object.keys(seo.BUILDERS).includes(s)
    )
    const schema = seo.resolvePageSchema(appliedSchemas, {
      breadcrumbItems: [{ name: record.page_name || record.page_type, url: record.canonical_url }],
      name: record.page_name,
      url: record.canonical_url,
    })
    res.json({ status: true, message: schema })
  } catch (err: any) {
    console.log('SEO schema read.', err.message)
    res.json({ status: false, message: [] })
  }
})
