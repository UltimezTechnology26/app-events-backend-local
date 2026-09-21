// modules/academy-admin/academy-admin.users.controller.ts
//
// Phase 2 slice of the Academy migration (Manage Users / Manage Certificate). Ports the routes
// out of controllers/admin_panel/main/academy/users.js. Mounted at a temporary `_v2` prefix
// ('/academy/users_v2') parallel to the untouched legacy '/admin_panel/academy/users' mount.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getCoursesForUsersForm, getUserBasicDetails, getUsersList, getUserCourseDetails, getUserLessonDetails, getCertificateList } from './academy-admin.users.service'

export const academyUsersRouter: Router = express.Router()

const ACADEMY_USERS_ACCESS_IDS = [13]

// FLAGGED, NOT CHANGED: matching Chapters'/Lessons' own `/courses_list` treatment - a
// low-sensitivity dropdown source, not the full user/certificate records the other routes expose.
const OPEN_PATHS = new Set(['/courses_list'])
academyUsersRouter.use((req: Request, res: Response, next) => {
  if (OPEN_PATHS.has(req.path)) return next()
  const checkToken = checkAdminLoginToken(req.headers, ACADEMY_USERS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

academyUsersRouter.get(
  '/courses_list',
  asyncRoute('Academy users form course list.', async (_req, res) => {
    res.json(await getCoursesForUsersForm())
  }),
)

academyUsersRouter.get(
  '/user_basic_details/:user_row_id',
  asyncRoute('Academy user basic details.', async (req, res) => {
    res.json(await getUserBasicDetails(req.params.user_row_id as string))
  }),
)

academyUsersRouter.get(
  '/users_list/:skip/:limit',
  asyncRoute('Academy users list.', async (req, res) => {
    const result = await getUsersList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      date: req.query.date as string,
      courseRowIdRaw: req.query.course_row_id as string,
    })
    res.json(result)
  }),
)

academyUsersRouter.get(
  '/user_course_details/:user_row_id',
  asyncRoute('Academy user course details.', async (req, res) => {
    res.json(await getUserCourseDetails(req.params.user_row_id as string))
  }),
)

academyUsersRouter.get(
  '/user_lesson_details/:user_row_id/:course_row_id',
  asyncRoute('Academy user lesson details.', async (req, res) => {
    res.json(await getUserLessonDetails(req.params.user_row_id as string, req.params.course_row_id as string))
  }),
)

academyUsersRouter.get(
  '/certificate_list/:skip/:limit',
  asyncRoute('Academy certificate list.', async (req, res) => {
    const result = await getCertificateList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      date: req.query.date as string,
      courseRowIdRaw: req.query.course_row_id as string,
    })
    res.json(result)
  }),
)
