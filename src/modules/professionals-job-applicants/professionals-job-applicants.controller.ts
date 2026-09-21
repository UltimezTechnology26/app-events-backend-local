// modules/professionals-job-applicants/professionals-job-applicants.controller.ts
// Ports controllers/app/jobs/job_applicants.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy '/job_applicant' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken, checkUserLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { addOrUpdateApplication, getUserAppliedList, getJobApplicantsList, updateApplicationStatus } from './professionals-job-applicants.service'
import { AllAuthResult, UserTokenAuthResult } from './professionals-job-applicants.types'

export const professionalsJobApplicantsRouter: Router = express.Router()

professionalsJobApplicantsRouter.post(
  '/add_n_update_details',
  writeEndpointRateLimiter,
  [
    check('job_id').not().isEmpty().withMessage('Job ID is required.'),
    check('salary_expectations').not().isEmpty().withMessage('Salary expectation is required.').isNumeric().withMessage('Salary expectation must be numeric.'),
    check('highest_education').not().isEmpty().withMessage('Highest Education is required.').isNumeric().withMessage('Highest Education must be a valid ID.'),
    check('key_skills').isArray({ min: 1 }).withMessage('At least one skill is required.'),
  ],
  asyncRoute('Apply to job.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
    res.json(await addOrUpdateApplication(auth, req.body, errObj))
  }),
)

professionalsJobApplicantsRouter.get('/user_applied_list/:skip/:limit', asyncRoute('User applied job list.', async (req: Request, res: Response) => {
  const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
  res.json(await getUserAppliedList(auth, req.params.skip as string, req.params.limit as string, req.query.user_row_id, req.query.company_row_id))
}))

professionalsJobApplicantsRouter.get('/list/:skip/:limit', asyncRoute('Job applicants list.', async (req: Request, res: Response) => {
  const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
  res.json(await getJobApplicantsList(auth, req.params.skip as string, req.params.limit as string, req.query as Record<string, unknown>))
}))

professionalsJobApplicantsRouter.post('/status/:application_id', writeEndpointRateLimiter, asyncRoute('Update application status.', async (req: Request, res: Response) => {
  const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
  res.json(await updateApplicationStatus(auth, req.params.application_id as string, req.body))
}))
