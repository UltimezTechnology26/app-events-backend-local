// Ports controllers/admin_panel/sub_admin.js's sub-admin-email routes (lines
// 550-800) into this module's convention. Dual-mounted at
// /sub_admin_emails_v2 (routes/admin_panel.js) alongside the still-live
// legacy /sub_admin mount - no cutover yet, no behavior change.
import express, { Router } from 'express'
const { check, validationResult } = require('express-validator')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { addSubAdminEmail, viewSubAdminEmail, editSubAdminEmail, deleteSubAdminEmail, listSubAdminEmails } from './sub_admin_emails.service'

const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')

export const subAdminEmailsRouter: Router = express.Router()
subAdminEmailsRouter.use(requireAdminAccess([0]))

subAdminEmailsRouter.post('/add_sub_admin_email', [
  check('full_name')
    .trim().not().isEmpty().withMessage('The Full Name field is required')
    .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
    .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
  check('email_id').trim().not().isEmpty().withMessage('The Email ID field is required.')
    .isEmail().withMessage('The Email ID field must be contain valid email.')
    .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.'),
  check('type')
    .trim().not().isEmpty().withMessage('The Type field is required')
    .isInt({ min: 1, max: 3 }).withMessage('The  Type field must be contains only integers.'),
], asyncRoute('Add sub admin email.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  const result = await addSubAdminEmail(req.body, errObj, checkToken)
  return res.json(result)
}))

subAdminEmailsRouter.get('/view/:sub_admin_row_id', asyncRoute('View sub admin details.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await viewSubAdminEmail(String(req.params.sub_admin_row_id))
  return res.json(result)
}))

subAdminEmailsRouter.post('/edit/:sub_admin_row_id', [
  check('full_name')
    .trim().not().isEmpty().withMessage('The Full Name field is required')
    .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
    .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
  check('email_id')
    .trim().not().isEmpty().withMessage('The Email ID field is required.')
    .isEmail().withMessage('The Email ID field must be contain valid email.')
    .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.'),
], asyncRoute('Update sub admin details.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  const result = await editSubAdminEmail(String(req.params.sub_admin_row_id), req.body, errObj, checkToken)
  return res.json(result)
}))

subAdminEmailsRouter.get('/delete/:sub_admin_row_id', asyncRoute('Delete sub admin details.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await deleteSubAdminEmail(String(req.params.sub_admin_row_id))
  return res.json(result)
}))

subAdminEmailsRouter.get('/sub_admin_email_list/:skip/:limit', asyncRoute('Sub admin emails list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await listSubAdminEmails(String(req.params.skip), String(req.params.limit), req.query.search as string | undefined)
  return res.json(result)
}))
