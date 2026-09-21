// modules/academy-admin/academy-admin.chapters.controller.ts
//
// Phase 1 slice of the Academy migration. Ports the Chapters CRUD routes out of
// controllers/admin_panel/main/academy/chapters.js. Mounted at a temporary `_v2` prefix
// (routes/admin_panel.js: '/academy/chapters_v2') parallel to the untouched legacy
// '/admin_panel/academy/chapters' mount.
//
// FLAGGED, NOT CHANGED: legacy's GET /courses_list has no checkAdminLoginToken call at all,
// unlike every other route in this file (all use access id [13]) - unlike Courses' own /list gap
// (closed in academy-admin.courses.controller.ts), this route only returns course id/name pairs
// for a dropdown, not the full course/professional records the earlier gap exposed. Preserved
// open here since tightening it is a real access-control decision, not an obvious bug fix -
// naming it for the user's call rather than silently picking either way.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getCoursesForChapterForm, getChapterList, getChapterDetail, saveChapter, deleteChapter } from './academy-admin.chapters.service'

export const academyChaptersRouter: Router = express.Router()

const ACADEMY_CHAPTERS_ACCESS_IDS = [13]

const OPEN_PATHS = new Set(['/courses_list'])
academyChaptersRouter.use((req: Request, res: Response, next) => {
  if (OPEN_PATHS.has(req.path)) return next()
  const checkToken = checkAdminLoginToken(req.headers, ACADEMY_CHAPTERS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

academyChaptersRouter.get(
  '/courses_list',
  asyncRoute('Academy chapter form course list.', async (_req, res) => {
    res.json(await getCoursesForChapterForm())
  }),
)

academyChaptersRouter.get(
  '/list/:skip/:limit',
  asyncRoute('Academy chapter list.', async (req, res) => {
    const result = await getChapterList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      date: req.query.date as string,
      courseRowIdRaw: req.query.course_row_id as string,
    })
    res.json(result)
  }),
)

academyChaptersRouter.get(
  '/details/:chapter_row_id',
  asyncRoute('Academy chapter details.', async (req, res) => {
    res.json(await getChapterDetail(req.params.chapter_row_id as string))
  }),
)

academyChaptersRouter.post(
  '/add_n_update_details',
  writeEndpointRateLimiter,
  [
    check('course_row_id').trim().not().isEmpty().withMessage('The Course Row ID field is required.').isInt().withMessage('The Course Row ID field must be contain only numbers.'),
    check('chapter_number').trim().not().isEmpty().withMessage('The Chapter Number field is required.').isInt().withMessage('The Chapter Number field must be contain only numbers.'),
    check('title').trim().not().isEmpty().withMessage('The title field is required.'),
    check('description').trim().not().isEmpty().withMessage('The description field is required.'),
  ],
  asyncRoute('Academy chapter save.', async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await saveChapter({
      chapterRowIdRaw: req.body.chapter_row_id,
      courseRowIdRaw: req.body.course_row_id,
      chapterNumberRaw: req.body.chapter_number,
      title: req.body.title,
      description: req.body.description,
    })
    res.json(result)
  }),
)

academyChaptersRouter.get(
  '/delete/:chapter_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Academy chapter delete.', async (req, res) => {
    res.json(await deleteChapter(req.params.chapter_row_id as string))
  }),
)
