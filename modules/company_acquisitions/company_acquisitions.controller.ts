import express, { Router } from 'express'
const { checkAllLoginToken } = require('../../middleware/authorization')
import * as service from './company_acquisitions.service'
import { getCache, setCache, buildCompanyAcquisitionsListKey } from './company_acquisitions.cache'

export const companyAcquisitionsRouter: Router = express.Router()

function unauthorizedAdminOnly() {
  return { status: false, message: { alert_message: 'Sorry, this action requires admin access.' } }
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
      submittedByType: 2
    })
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions submit.', err.message)
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

// --- Admin-only: approve ---
companyAcquisitionsRouter.get('/verify/:acquisition_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

    const result = await service.verifyAcquisition(Number.parseInt(req.params.acquisition_row_id))
    return res.json(result)
  } catch (err: any) {
    console.log('Company acquisitions verify.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: reject ---
companyAcquisitionsRouter.post('/reject', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

    const result = await service.rejectAcquisition({
      acquisitionRowId: req.body.acquisition_row_id,
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
