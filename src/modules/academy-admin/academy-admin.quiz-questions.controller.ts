// modules/academy-admin/academy-admin.quiz-questions.controller.ts
//
// Phase 1 slice of the Academy migration (the "Add Question" step of the Lessons chain - the
// frontend page lives at `/academy/add-question/<course_row_id>/<lesson_row_id>`, but its real
// backend mount, confirmed by reading routes/admin_panel.js directly rather than assuming from
// the page URL, is `/admin_panel/main/quiz_questions` - a DIFFERENT prefix than every sibling in
// this module, resolving the ambiguity flagged earlier in this migration's own plan doc). Ports
// the Quiz Questions CRUD routes out of controllers/admin_panel/main/academy/quiz_questions.js.
// Mounted at a temporary `_v2` prefix ('/main/quiz_questions_v2') parallel to the untouched
// legacy '/admin_panel/main/quiz_questions' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { saveQuizQuestion, getQuizQuestionList, getQuizQuestionDetail, deleteQuizQuestion } from './academy-admin.quiz-questions.service'

export const academyQuizQuestionsRouter: Router = express.Router()

const ACADEMY_QUIZ_QUESTIONS_ACCESS_IDS = [13]

academyQuizQuestionsRouter.use((req: Request, res: Response, next) => {
  const checkToken = checkAdminLoginToken(req.headers, ACADEMY_QUIZ_QUESTIONS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

academyQuizQuestionsRouter.post(
  '/add_n_update_details',
  writeEndpointRateLimiter,
  [
    check('course_row_id').trim().not().isEmpty().withMessage('The Course Row ID field is required.'),
    check('lesson_row_id').trim().not().isEmpty().withMessage('The Lesson Row ID is required.').isInt().withMessage('The Lesson Row ID field must be contain only numbers.'),
    check('question_title').trim().not().isEmpty().withMessage('The Question Title  field is required.'),
    check('option_a').trim().not().isEmpty().withMessage('The Option A field is required.'),
    check('option_b').trim().not().isEmpty().withMessage('The Option B field is required.'),
    check('option_c').trim().not().isEmpty().withMessage('The Option C field is required.'),
    check('option_d').trim().not().isEmpty().withMessage('The Option D field is required.'),
    check('correct_answer').trim().not().isEmpty().withMessage('The Correct Answer field is required.').isInt({ min: 1, max: 4 }).withMessage('The Correct Answer field must be contain only integer values.'),
  ],
  asyncRoute('Academy quiz question save.', async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await saveQuizQuestion({
      questionRowIdRaw: req.body.question_row_id,
      courseRowIdRaw: req.body.course_row_id,
      lessonRowIdRaw: req.body.lesson_row_id,
      questionTitle: req.body.question_title,
      optionA: req.body.option_a,
      optionB: req.body.option_b,
      optionC: req.body.option_c,
      optionD: req.body.option_d,
      correctAnswerRaw: req.body.correct_answer,
    })
    res.json(result)
  }),
)

academyQuizQuestionsRouter.get(
  '/list/:lesson_row_id',
  asyncRoute('Academy quiz question list.', async (req, res) => {
    const result = await getQuizQuestionList({
      lessonRowIdRaw: req.params.lesson_row_id as string,
      search: req.query.search as string,
      date: req.query.date as string,
    })
    res.json(result)
  }),
)

academyQuizQuestionsRouter.get(
  '/details/:request_row_id',
  asyncRoute('Academy quiz question details.', async (req, res) => {
    res.json(await getQuizQuestionDetail(req.params.request_row_id as string))
  }),
)

academyQuizQuestionsRouter.get(
  '/delete/:request_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Academy quiz question delete.', async (req, res) => {
    res.json(await deleteQuizQuestion(req.params.request_row_id as string))
  }),
)
