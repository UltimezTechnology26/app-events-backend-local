// modules/academy-admin/academy-admin.courses.controller.ts
//
// Phase 1 slice of the Academy migration (see plan doc's "Academy core: courses, lessons,
// chapters, add-question, participates/participant"). Ports the Courses CRUD routes out of
// controllers/admin_panel/main/academy/courses.js. Mounted at a temporary `_v2` prefix
// (routes/admin_panel.js: '/academy/courses_v2') parallel to the untouched legacy
// '/admin_panel/academy/courses' mount, per this repo's established cutover convention - legacy
// stays live and unmodified until this module is verified and the frontend explicitly cuts over.
//
// CONFIRMED REAL GAP, closed here (not silently ported forward): legacy's GET /list/:skip/:limit
// has NO checkAdminLoginToken call at all - wide open behind only the global checkApiKey gate,
// unlike every sibling route in the same file (add_n_update_details/details/delete all use access
// id [13]). This module's /list route below is gated with [13] like its siblings, matching the
// same "close an open-list-route gap, flag it" precedent already applied in the Professionals
// migration (professionals.controller.ts's /overview, professionals-audit's /change_logs).
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getCourseList, getCourseDetail, saveCourse, deleteCourse } from './academy-admin.courses.service'

export const academyCoursesRouter: Router = express.Router()

const ACADEMY_COURSES_ACCESS_IDS = [13]

// Router-level guard: every route in this module needs the same [13] access id, so one
// router.use() enforces it for all of them - no per-route re-check needed since (unlike
// professionals.controller.ts's /disable_user exemption) no route here needs a different error
// response shape on an auth failure.
academyCoursesRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, ACADEMY_COURSES_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

academyCoursesRouter.get(
  '/list/:skip/:limit',
  asyncRoute('Academy course list.', async (req, res) => {
    const result = await getCourseList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      date: req.query.date as string,
    })
    res.json(result)
  }),
)

academyCoursesRouter.get(
  '/details/:course_row_id',
  asyncRoute('Academy course details.', async (req, res) => {
    const result = await getCourseDetail(req.params.course_row_id as string)
    res.json(result)
  }),
)

academyCoursesRouter.post(
  '/add_n_update_details',
  writeEndpointRateLimiter,
  [
    check('course_name').trim().not().isEmpty().withMessage('The Course Name field is required.'),
    check('course_image').trim().not().isEmpty().withMessage('The Course Image is required.'),
    check('expert_tag').trim().not().isEmpty().withMessage('The Expert Tag field is required.'),
    check('course_description').trim().not().isEmpty().withMessage('The Course Description field is required.').isLength({ max: 100 }).withMessage('The Course Description field must be less than 100 characters.'),
    check('meta_keywords').trim().not().isEmpty().withMessage('The Meta Keywords field is required.'),
    check('meta_description').trim().not().isEmpty().withMessage('The Meta Description field is required.'),
  ],
  asyncRoute('Academy course save.', async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await saveCourse({
      courseRowIdRaw: req.body.course_row_id,
      courseName: req.body.course_name,
      courseDescription: req.body.course_description,
      courseImage: req.body.course_image,
      expertTag: req.body.expert_tag,
      metaKeywords: req.body.meta_keywords,
      metaDescription: req.body.meta_description,
    })
    res.json(result)
  }),
)

academyCoursesRouter.get(
  '/delete/:course_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Academy course delete.', async (req, res) => {
    const result = await deleteCourse(req.params.course_row_id as string)
    res.json(result)
  }),
)
