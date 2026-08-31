import express, { Router } from 'express'
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import * as service from './company_acquisitions.service'
import { getCache, setCache, buildCompanyAcquisitionsListKey } from './company_acquisitions.cache'
import { asyncRoute } from '../../../middleware/asyncRoute'

export const companyAcquisitionsRouter: Router = express.Router()

// Router-level auth middleware (additive safety net — does not replace the per-route
// requireAllLogin17 checks below). Every route here requires role 1 or 7 except
// GET /list/:company_row_id/:skip/:limit, which is intentionally public (no auth at all) —
// exempted explicitly rather than silently gating it.
companyAcquisitionsRouter.use(async (req, res, next) => {
  if (req.path.startsWith('/list/')) return next()
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  next()
})

async function requireAllLogin17(req: express.Request): Promise<{ status: false; message: any } | null> {
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  return auth.status ? null : auth
}

function unauthorizedAdminOnly() {
  return { status: false, message: { alert_message: 'Sorry, this action requires admin access.' } }
}

function unauthorizedApprover() {
  return { status: false, message: { alert_message: 'Sorry, only an admin or the other company involved in this acquisition can approve or reject it.' } }
}

// --- Admin-only: create or update a record (auto-approved) ---
companyAcquisitionsRouter.post('/update_details', writeEndpointRateLimiter, asyncRoute('Company acquisitions update.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

  const result = await service.createOrUpdateAcquisition({
    acquisition_row_id: req.body.acquisition_row_id,
    input: req.body,
    submittedByType: 1
  })
  return res.json(result)
}))

// --- App-user: submit a record (starts pending) ---
companyAcquisitionsRouter.post('/submit', writeEndpointRateLimiter, asyncRoute('Company acquisitions submit.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  // The submitter must own the registered company on at least one side of
  // the deal — never trust a client-supplied company_row_id on its own
  // (same reasoning as funding.controller.ts's resolveOwnCompanyId guard).
  const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
  const claimsAcquirer =
    Number(req.body.acquirer_registered_type) === 1 && Number(req.body.acquirer_company_row_id) === ownCompanyId
  const claimsAcquired =
    Number(req.body.acquired_registered_type) === 1 && Number(req.body.acquired_company_row_id) === ownCompanyId
  if (!ownCompanyId || (!claimsAcquirer && !claimsAcquired)) {
    return res.json({ status: false, message: { alert_message: 'Sorry, you can only submit acquisitions involving your own company.' } })
  }

  const result = await service.createOrUpdateAcquisition({
    input: req.body,
    submittedByType: 2,
    submittedByCompanyRowId: ownCompanyId
  })
  return res.json(result)
}))

// --- App-user: "my own company"'s acquisitions, all statuses (pending/
// approved/rejected) — so a submitter can see why something is still pending
// or was rejected. Scoped to the caller's own company only; there is no
// company_row_id URL param to request someone else's, unlike admin_list. ---
companyAcquisitionsRouter.get('/my_list/:skip/:limit', asyncRoute('Company acquisitions my_list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
  if (!ownCompanyId) {
    return res.json({ status: false, message: { alert_message: 'Sorry, Company not listed.' } })
  }

  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)
  const result = await service.getAdminCompanyAcquisitionsList({ companyRowId: ownCompanyId, skip, limit })
  return res.json(result)
}))

// --- App-user: delete an acquisition involving "my own company", but only
// while it's still pending or rejected — approved records are public and
// can only be removed by an admin. ---
companyAcquisitionsRouter.get('/my_delete/:acquisition_row_id', writeEndpointRateLimiter, asyncRoute('Company acquisitions my_delete.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
  if (!ownCompanyId) {
    return res.json({ status: false, message: { alert_message: 'Sorry, Company not listed.' } })
  }

  const result = await service.deleteOwnAcquisition({
    acquisitionRowId: Number.parseInt(req.params.acquisition_row_id as string),
    ownCompanyId
  })
  return res.json(result)
}))

// --- Public: combined list for a company (both directions), cached ---
companyAcquisitionsRouter.get('/list/:company_row_id/:skip/:limit', asyncRoute('Company acquisitions list.', async (req, res) => {
  const companyRowId = Number.parseInt(req.params.company_row_id as string)
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)

  const key = buildCompanyAcquisitionsListKey(companyRowId, skip, limit)
  const cached = await getCache({ key })
  if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })

  const result = await service.getCompanyAcquisitionsList({ companyRowId, skip, limit })
  await setCache({ key, value: result.message, ttl: 1800 })
  return res.json({ ...result, cache_response_status: false })
}))

// --- Admin-only: combined list for a company (both directions, all statuses), not cached ---
companyAcquisitionsRouter.get('/admin_list/:company_row_id/:skip/:limit', asyncRoute('Company acquisitions admin list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

  const companyRowId = Number.parseInt(req.params.company_row_id as string)
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)

  const result = await service.getAdminCompanyAcquisitionsList({ companyRowId, skip, limit })
  return res.json(result)
}))

// --- Admin OR the counterparty company's owner: approve. Whoever acts first
// decides — a single shared gate, not two separate ones (the submitter
// themselves is excluded by isCounterpartyForAcquisition). ---
companyAcquisitionsRouter.get('/verify/:acquisition_row_id', writeEndpointRateLimiter, asyncRoute('Company acquisitions verify.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const acquisitionRowId = Number.parseInt(req.params.acquisition_row_id as string)
  const isAdmin = auth.message.user_type === 2
  if (!isAdmin) {
    const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
    const isCounterparty = ownCompanyId ? await service.isCounterpartyForAcquisition(acquisitionRowId, ownCompanyId) : false
    if (!isCounterparty) return res.json(unauthorizedApprover())
  }

  const result = await service.verifyAcquisition(acquisitionRowId)
  return res.json(result)
}))

// --- Admin OR the counterparty company's owner: reject. Same shared-gate
// reasoning as verify above. ---
companyAcquisitionsRouter.post('/reject', writeEndpointRateLimiter, asyncRoute('Company acquisitions reject.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const acquisitionRowId = Number.parseInt(req.body.acquisition_row_id)
  const isAdmin = auth.message.user_type === 2
  if (!isAdmin) {
    const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
    const isCounterparty = ownCompanyId ? await service.isCounterpartyForAcquisition(acquisitionRowId, ownCompanyId) : false
    if (!isCounterparty) return res.json(unauthorizedApprover())
  }

  const result = await service.rejectAcquisition({
    acquisitionRowId,
    rejectType: req.body.reject_type,
    rejectReason: req.body.reject_reason
  })
  return res.json(result)
}))

// --- Admin-only: delete ---
companyAcquisitionsRouter.get('/delete/:acquisition_row_id', writeEndpointRateLimiter, asyncRoute('Company acquisitions delete.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

  const result = await service.deleteAcquisition(Number.parseInt(req.params.acquisition_row_id as string))
  return res.json(result)
}))
