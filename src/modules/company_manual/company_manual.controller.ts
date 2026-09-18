// modules/company_manual/company_manual.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken, checkAllLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
import {
  addManualCompanyDetails,
  editManualCompanyLogo,
  getPendingManualCompanies,
  getRejectedManualCompanies,
  getApprovedManualCompanies,
  getManualCompanyIndividualDetail,
  rejectManualCompany,
  revokeManualCompany,
  getManualCompanyEmployeeList,
  getManualCompanySponsorList,
  getManualCompanyPartnerList,
  deleteManualCompany,
} from './company_manual.service'
import { updateManualDetailValidation, editManualDetailValidation, rejectManualCompanyValidation } from './company_manual.validation'

/**
 * Ports controllers/app/company/manual_company.js (2 routes) and
 * controllers/admin_panel/app/company/manual_retrievals.js (8 routes) — Part 3 §7 Phase G step 3,
 * scaffolded as its own module per the user's explicit direction, following the
 * modules/company_acquisitions layout. App and admin routes stay in their real source's separate
 * top-level mount points ('/app/company/manual_company' and
 * '/admin_panel/company_manual_retrievals'), so this file exports two routers.
 */
export const companyManualAppRouter: Router = express.Router()
export const companyManualAdminRouter: Router = express.Router()

// ─── App-side ───────────────────────────────────────────────────────────────

// Router-level auth middleware (additive safety net — does not replace the per-route
// checkAllLoginToken([1, 7]) checks below). Both app-side routes require the same role set.
companyManualAppRouter.use(async (req: Request, res: Response, next) => {
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  next()
})

// FIX (confirmed gap, signed off): neither route below had any auth check before this —
// no checkUserLoginToken, checkAllLoginToken, or checkApiKey, in the route or the service,
// which trusts req.body entirely. Matches the legacy source's behavior exactly, so this was
// not a regression from an earlier pass, but a genuine pre-existing gap. Gated here with
// checkAllLoginToken([1, 7]) (logged-in user or admin) per explicit decision — matching the
// pattern already used by company_acquisitions/funding's analogous app-side submission routes.
companyManualAppRouter.post('/update_manual_detail', writeEndpointRateLimiter, updateManualDetailValidation, asyncRoute('Update manual company details', async (req, res) => {
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const errObj = arrangeValidation(validationResult(req))
  const result = await addManualCompanyDetails({ body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

companyManualAppRouter.post('/edit_manual_detail', writeEndpointRateLimiter, editManualDetailValidation, asyncRoute('Edit manual company details.', async (req, res) => {
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const errObj = arrangeValidation(validationResult(req))
  const result = await editManualCompanyLogo({ body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

// ─── Admin-side ─────────────────────────────────────────────────────────────

// Additive safety net: every admin route in this router requires checkAdminLoginToken(req.headers, [7]).
companyManualAdminRouter.use(requireAdminAccess([7]))

companyManualAdminRouter.get('/pending_list/:skip/:limit', asyncRoute('Company manual retievals pending list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getPendingManualCompanies({
    actor,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    createdFromType: req.query.created_from_type ? Number.parseInt(req.query.created_from_type as string) : undefined,
  })
  res.json(result)
}))

companyManualAdminRouter.get('/rejected_list/:skip/:limit', asyncRoute('Company manual retrievals rejected list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getRejectedManualCompanies({
    actor,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    createdFromType: req.query.created_from_type ? Number.parseInt(req.query.created_from_type as string) : undefined,
    rejectType: req.query.reject_type ? Number.parseInt(req.query.reject_type as string) : undefined,
  })
  res.json(result)
}))

companyManualAdminRouter.get('/approved_list/:skip/:limit', asyncRoute('Company manual retrievals approved list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getApprovedManualCompanies({
    actor,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    createdFromType: req.query.created_from_type ? Number.parseInt(req.query.created_from_type as string) : undefined,
  })
  res.json(result)
}))

companyManualAdminRouter.get('/individual_detail/:company_row_id', asyncRoute('Individual manual company', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getManualCompanyIndividualDetail({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

companyManualAdminRouter.post('/reject_manual_company/:company_row_id', writeEndpointRateLimiter, rejectManualCompanyValidation, asyncRoute('Reject Manual company.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await rejectManualCompany({ actor, companyRowIdRaw: req.params.company_row_id as string, body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

companyManualAdminRouter.get('/revoke_manual_company/:company_row_id', writeEndpointRateLimiter, asyncRoute('Revoke manual company.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await revokeManualCompany({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

companyManualAdminRouter.get('/manual_company_employee_list/:company_row_id/:skip/:limit', asyncRoute('Manual company employee list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getManualCompanyEmployeeList({
    actor,
    companyRowIdRaw: req.params.company_row_id as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    isApproved: req.query.is_approved === 'true',
  })
  res.json(result)
}))

companyManualAdminRouter.get('/manual_company_sponsor_list/:company_row_id/:skip/:limit', asyncRoute('Manual company sponsor list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getManualCompanySponsorList({
    actor,
    companyRowIdRaw: req.params.company_row_id as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    isApproved: req.query.is_approved === 'true',
  })
  res.json(result)
}))

companyManualAdminRouter.get('/manual_company_partner_list/:company_row_id/:skip/:limit', asyncRoute('Manual company partner list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getManualCompanyPartnerList({
    actor,
    companyRowIdRaw: req.params.company_row_id as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    isApproved: req.query.is_approved === 'true',
  })
  res.json(result)
}))

companyManualAdminRouter.get('/delete_manual_company/:company_row_id', writeEndpointRateLimiter, asyncRoute('Manual company delete.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await deleteManualCompany({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))
