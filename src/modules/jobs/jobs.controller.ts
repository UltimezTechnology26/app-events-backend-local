import express, { Router } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { createOrUpdateJob, deleteJob, setJobActiveStatus } from './jobs.service'
import { Actor, SaveJobBody } from './jobs.types'

const JOB_ADMIN_ACCESS_TYPE = [7]

/**
 * Ports `controllers/app/jobs/job.js`'s 3 write routes (add_n_update_details/delete/job_status) —
 * mounted at the same `/job` prefix, in `routes/app.js`, alongside that file's own remaining
 * read-only routes (`/list`, `/education_type_list`, `/skill_list`), which stay in the legacy
 * controller unmigrated (out of scope for wiring the change-request review gate — see this
 * module's own plan notes). Both app-user (company's own team) and admin/subadmin callers hit
 * this one router, exactly as the legacy controller did — `checkAllLoginToken` normalizes both
 * into the same actor shape the service layer branches on.
 */
export const jobsRouter: Router = express.Router()

jobsRouter.post(
  '/add_n_update_details',
  [
    check('company_row_id').trim().not().isEmpty().withMessage('Company ID is required.'),
    check('country_id').trim().not().isEmpty().withMessage('Country ID is required.'),
    check('job_title').trim().not().isEmpty().withMessage('Job Title is required.'),
    check('experience_level').trim().not().isEmpty().withMessage('Experience Level is required.'),
    check('highest_education').not().isEmpty().withMessage('Highest Education is required.').isNumeric().withMessage('Highest Education must be a valid ID.'),
    check('key_skills').isArray({ min: 1 }).withMessage('At least one skill is required.'),
    check('job_description').trim().not().isEmpty().withMessage('Job Description is required.'),
    check('salary_from').optional().isNumeric().withMessage('Salary From must be a number.'),
    check('salary_to').optional().isNumeric().withMessage('Salary To must be a number.'),
    check('no_of_openings').optional().isInt({ min: 1 }).withMessage('Number of openings must be at least 1.'),
    check('application_deadline').optional().isISO8601().toDate().withMessage('Application deadline must be a valid date.'),
  ],
  async (req: any, res: any) => {
    const errObj = arrangeValidation(validationResult(req))
    try {
      const actor: Actor = await checkAllLoginToken(req.headers, JOB_ADMIN_ACCESS_TYPE)
      const result = await createOrUpdateJob({ actor, body: req.body as SaveJobBody, preValidationErrors: errObj })
      res.json(result)
    } catch (error: any) {
      console.error(error)
      res.json({ status: false, message: 'Server error while saving job.', alert_message: error?.message })
    }
  },
)

jobsRouter.get('/delete/:job_id', async (req: any, res: any) => {
  try {
    const actor: Actor = await checkAllLoginToken(req.headers, JOB_ADMIN_ACCESS_TYPE)
    const jobId = Number.parseInt(req.params.job_id)
    const companyRowIdQuery = req.query.company_row_id ? Number.parseInt(req.query.company_row_id as string) : null
    const result = await deleteJob({ actor, jobId, companyRowIdQuery })
    res.json(result)
  } catch (error: any) {
    console.error(error)
    res.json({ status: false, message: 'Server error while deleting job.', alert_message: error?.message })
  }
})

jobsRouter.post('/job_status/:job_id', async (req: any, res: any) => {
  try {
    const actor: Actor = await checkAllLoginToken(req.headers, JOB_ADMIN_ACCESS_TYPE)
    const jobId = Number.parseInt(req.params.job_id)
    const companyRowIdQuery = req.query.company_row_id ? Number.parseInt(req.query.company_row_id as string) : null
    const result = await setJobActiveStatus({ actor, jobId, companyRowIdQuery, activeStatus: req.body.active_status })
    res.json(result)
  } catch (error: any) {
    console.error(error)
    res.json({ status: false, message: 'Server error while updating job status.', alert_message: error?.message })
  }
})
