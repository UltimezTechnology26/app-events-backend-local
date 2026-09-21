// modules/academy-admin/academy-admin.lessons.controller.ts
//
// Phase 1 slice of the Academy migration. Ports the Lessons CRUD + Participates routes out of
// controllers/admin_panel/main/academy/lessons.js. Mounted at a temporary `_v2` prefix
// (routes/admin_panel.js: '/academy/lessons_v2') parallel to the untouched legacy
// '/admin_panel/academy/lessons' mount.
//
// FLAGGED, NOT CHANGED (matching the same pattern as Chapters' /courses_list): legacy's GET
// /courses_list, /chapters_list/:course_row_id, and /get_lesson have no checkAdminLoginToken call
// at all - low-sensitivity dropdown/reference data, not the full lesson/participant records the
// other routes expose. Preserved open here for the same reason.
//
// NOT PORTED (confirmed dead code - see academy-admin.lessons.service.ts's own header comment):
// GET /certficate, GET /issue.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  getCoursesForLessonForm,
  getChaptersForLessonForm,
  saveLesson,
  getLessonList,
  getLessonDetail,
  getLessonDetailByLessonId,
  deleteLesson,
  getParticipatesList,
  getParticipantQuestionCount,
  getParticipantQuestionList,
} from './academy-admin.lessons.service'

export const academyLessonsRouter: Router = express.Router()

const ACADEMY_LESSONS_ACCESS_IDS = [13]

const OPEN_PATHS = [/^\/courses_list$/, /^\/chapters_list\/[^/]+$/, /^\/get_lesson$/]
academyLessonsRouter.use((req: Request, res: Response, next) => {
  if (OPEN_PATHS.some((pattern) => pattern.test(req.path))) return next()
  const checkToken = checkAdminLoginToken(req.headers, ACADEMY_LESSONS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

academyLessonsRouter.get(
  '/courses_list',
  asyncRoute('Academy lesson form course list.', async (_req, res) => {
    res.json(await getCoursesForLessonForm())
  }),
)

academyLessonsRouter.get(
  '/chapters_list/:course_row_id',
  asyncRoute('Academy lesson form chapter list.', async (req, res) => {
    res.json(await getChaptersForLessonForm(req.params.course_row_id as string))
  }),
)

academyLessonsRouter.get(
  '/list/:skip/:limit',
  asyncRoute('Academy lesson list.', async (req, res) => {
    const result = await getLessonList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      courseRowIdRaw: req.query.course_row_id as string,
    })
    res.json(result)
  }),
)

academyLessonsRouter.get(
  '/details/:lesson_row_id',
  asyncRoute('Academy lesson details.', async (req, res) => {
    res.json(await getLessonDetail(req.params.lesson_row_id as string))
  }),
)

academyLessonsRouter.get(
  '/details_by_lesson_id/:lesson_id',
  asyncRoute('Academy lesson details by lesson id.', async (req, res) => {
    res.json(await getLessonDetailByLessonId(req.params.lesson_id as string))
  }),
)

academyLessonsRouter.post(
  '/add_n_update_details',
  writeEndpointRateLimiter,
  [
    check('course_row_id').trim().not().isEmpty().withMessage('The Course Row ID field is required.').isInt().withMessage('The Course Row ID field must contain an integer value.'),
    check('lesson_number').trim().not().isEmpty().withMessage('The Lesson Number field is required.').isInt().withMessage('The Lesson Number field must contain only an integer value.'),
    check('title').trim().not().isEmpty().withMessage('The Lesson Title field is required.'),
    check('lesson_image_url').trim().not().isEmpty().withMessage('The Lesson Image URL field is required.'),
    check('description').trim().not().isEmpty().withMessage('The Lesson Description field is required.'),
    check('author_name').trim().not().isEmpty().withMessage('The Lesson Author Name field is required.'),
    check('author_id').trim().not().isEmpty().withMessage('The Lesson Author Id field is required.'),
    check('author_link').trim().not().isEmpty().withMessage('The Lesson Author Link field is required.'),
    check('reviewed_by_name').trim().not().isEmpty().withMessage('The Lesson Reviewed by Name field is required.'),
    check('reviewed_by_id').trim().not().isEmpty().withMessage('The Lesson Reviewed by Id field is required.'),
    check('reviewed_by_link').trim().not().isEmpty().withMessage('The Lesson Reviewed by Link field is required.'),
    check('meta_keywords').trim().not().isEmpty().withMessage('The Meta Keywords field is required.'),
    check('meta_description').trim().not().isEmpty().withMessage('The Meta Description field is required.'),
  ],
  asyncRoute('Academy lesson save.', async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await saveLesson({
      lessonRowIdRaw: req.body.lesson_row_id,
      courseRowIdRaw: req.body.course_row_id,
      lessonNumberRaw: req.body.lesson_number,
      title: req.body.title,
      description: req.body.description,
      authorName: req.body.author_name,
      authorIdRaw: req.body.author_id,
      authorLink: req.body.author_link,
      reviewedByName: req.body.reviewed_by_name,
      reviewedByIdRaw: req.body.reviewed_by_id,
      reviewedByLink: req.body.reviewed_by_link,
      lessonImageUrl: req.body.lesson_image_url,
      metaKeywords: req.body.meta_keywords,
      metaDescription: req.body.meta_description,
    })
    res.json(result)
  }),
)

academyLessonsRouter.get(
  '/delete/:lesson_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Academy lesson delete.', async (req, res) => {
    res.json(await deleteLesson(req.params.lesson_row_id as string))
  }),
)

academyLessonsRouter.get(
  '/participates_list/:lesson_row_id/:skip/:limit',
  asyncRoute('Academy lesson participates list.', async (req, res) => {
    const result = await getParticipatesList({
      lessonRowIdRaw: req.params.lesson_row_id as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      date: req.query.date as string,
      quizResultRaw: req.query.quiz_result as string,
      lessonStatusRaw: req.query.lesson_status as string,
    })
    res.json(result)
  }),
)

academyLessonsRouter.get(
  '/participates_question_count/:participated_row_id',
  asyncRoute('Academy participant question count.', async (req, res) => {
    res.json(await getParticipantQuestionCount(req.params.participated_row_id as string))
  }),
)

academyLessonsRouter.get(
  '/participates_question_list/:participated_row_id',
  asyncRoute('Academy participant question list.', async (req, res) => {
    const result = await getParticipantQuestionList(req.params.participated_row_id as string, req.query.search as string, req.query.answer_value as string)
    res.json(result)
  }),
)
