import express, { Router } from 'express'
const { checkAllLoginToken } = require('../../middleware/authorization')
import * as service from './company_acquisitions.service'
import { getCache, setCache, buildCompanyAcquisitionsListKey } from './company_acquisitions.cache'

export const companyAcquisitionsRouter: Router = express.Router()

function unauthorizedAdminOnly() {
  return { status: false, message: { alert_message: 'Sorry, this action requires admin access.' } }
}

function unauthorizedApprover() {
  return { status: false, message: { alert_message: 'Sorry, only an admin or the other company involved in this acquisition can approve or reject it.' } }
}

// --- Admin-only: create or update a record (auto-approved) ---
companyAcquisitionsRouter.post('/update_details', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

    const result = await service.createOrUpdateAcquisition({
      acquisition_row_id: req.body.acquisition_row_id,
      input: req.body,
      submittedByType: 1
    })
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions update.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-user: submit a record (starts pending) ---
companyAcquisitionsRouter.post('/submit', async (req, res) => {
  try {
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
  } catch (err: any) {
    console.log('Company acquisitions submit.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-user: "my own company"'s acquisitions, all statuses (pending/
// approved/rejected) — so a submitter can see why something is still pending
// or was rejected. Scoped to the caller's own company only; there is no
// company_row_id URL param to request someone else's, unlike admin_list. ---
companyAcquisitionsRouter.get('/my_list/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)

    const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompanyId) {
      return res.json({ status: false, message: { alert_message: 'Sorry, Company not listed.' } })
    }

    const skip = Number.parseInt(req.params.skip)
    const limit = Number.parseInt(req.params.limit)
    const result = await service.getAdminCompanyAcquisitionsList({ companyRowId: ownCompanyId, skip, limit })
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions my_list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-user: delete an acquisition involving "my own company", but only
// while it's still pending or rejected — approved records are public and
// can only be removed by an admin. ---
companyAcquisitionsRouter.get('/my_delete/:acquisition_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)

    const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompanyId) {
      return res.json({ status: false, message: { alert_message: 'Sorry, Company not listed.' } })
    }

    const result = await service.deleteOwnAcquisition({
      acquisitionRowId: Number.parseInt(req.params.acquisition_row_id),
      ownCompanyId
    })
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions my_delete.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Public: combined list for a company (both directions), cached ---
companyAcquisitionsRouter.get('/list/:company_row_id/:skip/:limit', async (req, res) => {
  try {
    const companyRowId = Number.parseInt(req.params.company_row_id)
    const skip = Number.parseInt(req.params.skip)
    const limit = Number.parseInt(req.params.limit)

    const key = buildCompanyAcquisitionsListKey(companyRowId, skip, limit)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })

    const result = await service.getCompanyAcquisitionsList({ companyRowId, skip, limit })
    await setCache({ key, value: result.message, ttl: 1800 })
    return res.json({ ...result, cache_response_status: false })
  } catch (err: any) {
    console.log('Company acquisitions list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: combined list for a company (both directions, all statuses), not cached ---
companyAcquisitionsRouter.get('/admin_list/:company_row_id/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

    const companyRowId = Number.parseInt(req.params.company_row_id)
    const skip = Number.parseInt(req.params.skip)
    const limit = Number.parseInt(req.params.limit)

    const result = await service.getAdminCompanyAcquisitionsList({ companyRowId, skip, limit })
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions admin list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin OR the counterparty company's owner: approve. Whoever acts first
// decides — a single shared gate, not two separate ones (the submitter
// themselves is excluded by isCounterpartyForAcquisition). ---
companyAcquisitionsRouter.get('/verify/:acquisition_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)

    const acquisitionRowId = Number.parseInt(req.params.acquisition_row_id)
    const isAdmin = auth.message.user_type === 2
    if (!isAdmin) {
      const ownCompanyId = await service.resolveOwnCompanyId(auth.message.user_row_id)
      const isCounterparty = ownCompanyId ? await service.isCounterpartyForAcquisition(acquisitionRowId, ownCompanyId) : false
      if (!isCounterparty) return res.json(unauthorizedApprover())
    }

    const result = await service.verifyAcquisition(acquisitionRowId)
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions verify.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin OR the counterparty company's owner: reject. Same shared-gate
// reasoning as verify above. ---
companyAcquisitionsRouter.post('/reject', async (req, res) => {
  try {
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
  } catch (err: any) {
    console.log('Company acquisitions reject.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: delete ---
companyAcquisitionsRouter.get('/delete/:acquisition_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

    const result = await service.deleteAcquisition(Number.parseInt(req.params.acquisition_row_id))
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions delete.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
