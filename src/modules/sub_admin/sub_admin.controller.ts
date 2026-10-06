// Sub-admin account routes (list/create/update/enable/disable/password),
// mounted at /sub_admin_v2 in routes/admin_panel.js. Super-admin only.
import express, { Router } from 'express'
const { check, validationResult } = require('express-validator')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import {
  listSubAdmins,
  createSubAdmin,
  updateSubAdminDetail,
  enableSubAdmin,
  disableSubAdmin,
  updateSubAdminPassword,
} from './sub_admin.service'

const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')

export const subAdminRouter: Router = express.Router()
subAdminRouter.use(requireAdminAccess([0]))

subAdminRouter.get('/list/:skip/:limit', asyncRoute('Sub admins list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await listSubAdmins(String(req.params.skip), String(req.params.limit), req.query.search as string | undefined)
  return res.json(result)
}))

const createOrUpdateValidators = [
  check('full_name')
    .trim().not().isEmpty().withMessage('The Full Name field is required')
    .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
    .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
  check('email_id').trim().not().isEmpty().withMessage('The Email ID field is required.')
    .isEmail().withMessage('The Email ID field must be contain valid email.')
    .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.'),
  check('create_type_row_id').not().isEmpty().withMessage('The Create Type Row Id field is required'),
  check('sub_admin_type').not().isEmpty().withMessage('The Subadmin Type field is required')
    .isInt({ min: 1, max: 3 }).withMessage('The Subadmin Type field must contains only integers.'),
]

subAdminRouter.post('/create_sub_admin', [
  ...createOrUpdateValidators,
  check('password')
    .trim().not().isEmpty().withMessage('The Password field is required')
    .isLength({ min: 6 }).withMessage('The Password field must be at least 6 characters in length.')
    .isLength({ max: 50 }).withMessage('The Password field must be less than 50 characters in length.'),
], asyncRoute('Create sub admin.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  const result = await createSubAdmin(req.body, errObj, checkToken)
  return res.json(result)
}))

subAdminRouter.post('/update_sub_admin_detail/:sub_admin_row_id', createOrUpdateValidators, asyncRoute('Update sub admin details.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  const result = await updateSubAdminDetail(String(req.params.sub_admin_row_id), req.body, errObj, checkToken)
  return res.json(result)
}))

subAdminRouter.get('/enable_user/:sub_admin_row_id', asyncRoute('Enable sub admin .', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await enableSubAdmin(String(req.params.sub_admin_row_id))
  return res.json(result)
}))

subAdminRouter.post('/disable_user/:sub_admin_row_id', [
  check('reason_for_disable')
    .trim().not().isEmpty().withMessage('The Reason for Disabled field is required')
    .isLength({ min: 4 }).withMessage('The Reason for Disabled field must be at least 4 characters in length.')
    .isLength({ max: 200 }).withMessage('The Reason for Disabled field must be less than 200 characters in length.'),
], asyncRoute('Disable sub admin.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await disableSubAdmin(String(req.params.sub_admin_row_id), req.body, errObj)
  return res.json(result)
}))

subAdminRouter.post('/update_subadmin_password/:sub_admin_row_id', [
  check('new_password')
    .trim().not().isEmpty().withMessage('The New password field is required.')
    .isLength({ min: 6 }).withMessage('The New Password field must be at least 6 characters in length.'),
], asyncRoute('Update sub admin password.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) return res.json(checkToken)
  const result = await updateSubAdminPassword(String(req.params.sub_admin_row_id), req.body.new_password, errObj)
  return res.json(result)
}))
