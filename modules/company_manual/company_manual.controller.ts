// modules/company_manual/company_manual.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
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

companyManualAppRouter.post('/update_manual_detail', updateManualDetailValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const result = await addManualCompanyDetails({ body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Update manual company details', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAppRouter.post('/edit_manual_detail', editManualDetailValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const result = await editManualCompanyLogo({ body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Edit manual company details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ─── Admin-side ─────────────────────────────────────────────────────────────

companyManualAdminRouter.get('/pending_list/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getPendingManualCompanies({
      actor,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      createdFromType: req.query.created_from_type ? Number.parseInt(req.query.created_from_type as string) : undefined,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Company manual retievals pending list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/rejected_list/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getRejectedManualCompanies({
      actor,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      createdFromType: req.query.created_from_type ? Number.parseInt(req.query.created_from_type as string) : undefined,
      rejectType: req.query.reject_type ? Number.parseInt(req.query.reject_type as string) : undefined,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Company manual retrievals rejected list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/approved_list/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getApprovedManualCompanies({
      actor,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      createdFromType: req.query.created_from_type ? Number.parseInt(req.query.created_from_type as string) : undefined,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Company manual retrievals approved list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/individual_detail/:company_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getManualCompanyIndividualDetail({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Individual manual company', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.post('/reject_manual_company/:company_row_id', rejectManualCompanyValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const actor = checkAdminLoginToken(req.headers, [7])
    const result = await rejectManualCompany({ actor, companyRowIdRaw: req.params.company_row_id as string, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Reject Manual company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/revoke_manual_company/:company_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await revokeManualCompany({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Revoke manual company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/manual_company_employee_list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getManualCompanyEmployeeList({
      actor,
      companyRowIdRaw: req.params.company_row_id as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Manual company employee list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/manual_company_sponsor_list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getManualCompanySponsorList({
      actor,
      companyRowIdRaw: req.params.company_row_id as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Manual company sponsor list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/manual_company_partner_list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getManualCompanyPartnerList({
      actor,
      companyRowIdRaw: req.params.company_row_id as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Manual company partner list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyManualAdminRouter.get('/delete_manual_company/:company_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await deleteManualCompany({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Manual company delete.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
