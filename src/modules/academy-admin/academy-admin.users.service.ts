// modules/academy-admin/academy-admin.users.service.ts
//
// Ports users.js's Manage Users + Manage Certificate routes (user_basic_details/users_list/
// user_course_details/user_lesson_details/certificate_list, ~line 1-1129) - the Phase 2-relevant
// slice of that 1,301-line legacy controller.
//
// NOT PORTED:
// - GET /certficate (confirmed dead - same leftover debug dump as the identical route already
//   found and excluded in courses.js's own migration; zero live callers).
// - GET /user_certificate_list, POST /save_n_update_visibility - both app-facing/self-service
//   concerns (not used by any of the 3 legacy admin pages this phase covers: users.js,
//   user_points.js, certificates.js), out of this admin-panel phase's scope.
// - "Users Points" (user_points.js's real content, despite its misleading title/proxy path) is
//   NOT ported here at all - its real backend, `admin_panel/app/user.js`'s `/points_list`, was
//   already migrated in the Professionals migration's Phase G (`professionals-audit` module,
//   `GET users_audit_v2/points_list`) - this phase's frontend reuses that route as-is.
import { CoursesM, LessonsM } from './academy-admin.models'
const professionalsM = require('../../../models/app/professionalsM')
const quiz_lesson_started_detailsM = require('../../../models/main/academy/quiz_lesson_started_detailsM')
import { CoursesCertificatesM } from '../professionals-academy/professionals-academy.models'
import { buildCourseMatchExpr, buildUsersListSearchQuery, buildUsersListPipeline, extractUsersListResult, buildCertificateListMatchQuery, buildCertificateListPipeline, extractCertificateListResult } from './academy-admin.users.queries'
import { GetUsersListParams, GetCertificateListParams } from './academy-admin.users.types'

/** Ports /courses_list (~line 16-23) - same dropdown source pattern as its siblings in chapters.js/lessons.js. */
export async function getCoursesForUsersForm() {
  const courses = await CoursesM.find({}, { _id: 1, course_name: 1 }).sort({ course_name: 1 })
  return { status: true, message: courses }
}

/** Ports /user_basic_details/:user_row_id (~line 36-245) verbatim. */
export async function getUserBasicDetails(userRowIdRaw: string) {
  const userRowId = Number.parseInt(userRowIdRaw)

  const [basicDetails, completedLessonsCount, lessonStats, averageScoreResult, certificateSummary] = await Promise.all([
    professionalsM.aggregate([
      { $match: { _id: userRowId } },
      { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'profile_info' } },
      { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          user_name: 1,
          pro_batch: 1,
          full_name: 1,
          gender: 1,
          email_id: 1,
          mobile_number: 1,
          country_id: 1,
          location: 1,
          updated_date_n_time: 1,
          account_visible_type: 1,
          designation_id: 1,
          login_status: 1,
          wallet_address: 1,
          approval_status: 1,
          reason_rejected: 1,
          rejected_date_n_time: 1,
          deleted_date_n_time: 1,
          view_counts: 1,
          profile_image: '$profile_info.profile_image',
        },
      },
    ]),
    quiz_lesson_started_detailsM.countDocuments({ lesson_status: 1, user_row_id: userRowId }),
    LessonsM.aggregate([
      {
        $lookup: {
          from: 'cln_academy_quiz_answers',
          let: { lessonId: '$lesson_id' },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$lesson_row_id', '$$lessonId'] }, { $eq: ['$user_row_id', userRowId] }, { $eq: ['$answer_status', true] }] } } }],
          as: 'lessonAns',
        },
      },
      {
        $lookup: {
          from: 'cln_academy_quiz_questions',
          let: { lessonId: '$lesson_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$lesson_row_id', '$$lessonId'] } } }],
          as: 'questions',
        },
      },
      { $project: { totalAnswers: { $size: '$lessonAns' }, totalQuestions: { $size: '$questions' } } },
      { $group: { _id: null, totalAnswers: { $sum: '$totalAnswers' }, totalQuestions: { $sum: '$totalQuestions' } } },
    ]),
    quiz_lesson_started_detailsM.aggregate([
      { $match: { user_row_id: userRowId, lesson_status: 1, lesson_score: { $ne: null } } },
      { $group: { _id: null, averageScore: { $avg: '$lesson_score' }, totalScoredLessons: { $sum: 1 } } },
    ]),
    professionalsM.aggregate([
      { $match: { _id: userRowId } },
      { $lookup: { from: 'cln_academy_courses_certificates', localField: '_id', foreignField: 'user_row_id', as: 'certificate_info' } },
      { $unwind: { path: '$certificate_info', preserveNullAndEmptyArrays: true } },
      { $match: { certificate_info: { $ne: null } } },
      { $lookup: { from: 'cln_academy_courses', localField: 'certificate_info.course_row_id', foreignField: '_id', as: 'course_info' } },
      { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$_id', certificateCount: { $sum: 1 }, expertTags: { $addToSet: '$course_info.expert_tag' } } },
      { $project: { _id: 0, certificateCount: 1, expertTagCount: { $size: '$expertTags' } } },
    ]),
  ])

  return {
    status: true,
    get_user_details: basicDetails,
    total_completed_lessons: completedLessonsCount,
    totalAnswers: lessonStats[0]?.totalAnswers || 0,
    totalQuestions: lessonStats[0]?.totalQuestions || 0,
    averageScore: averageScoreResult[0]?.averageScore || 0,
    certificateCount: certificateSummary[0]?.certificateCount || 0,
    expertTagCount: certificateSummary[0]?.expertTagCount || 0,
  }
}

export async function getUsersList(params: GetUsersListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100
  const courseRowId = params.courseRowIdRaw ? Number.parseInt(params.courseRowIdRaw) : undefined

  const searchQuery = buildUsersListSearchQuery({ search: params.search, date: params.date })
  const courseMatchExpr = buildCourseMatchExpr(courseRowId)

  const pipeline = buildUsersListPipeline({ searchQuery, courseMatchExpr, skip, limit })
  const aggregateOutput = await professionalsM.aggregate(pipeline)
  const { data, count } = extractUsersListResult(aggregateOutput)

  return { status: true, count, message: data }
}

/**
 * Ports /user_course_details/:user_row_id (~line 555-704) verbatim, INCLUDING the fact that the
 * legacy frontend proxy sends `course_row_id`/`search`/`chapter_row_id` query params this route
 * never reads - confirmed by reading the full handler above: no course/search filtering is
 * actually applied server-side, every course the professional touched is always returned. Not a
 * bug this route needs fixing (the frontend's own dead filter controls were already flagged and
 * not ported in `UserDetails.tsx`'s own doc comment).
 */
export async function getUserCourseDetails(userRowIdRaw: string) {
  const userRowId = Number.parseInt(userRowIdRaw)

  const completedCourses = await CoursesCertificatesM.aggregate([
    { $match: { user_row_id: userRowId } },
    { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
    { $unwind: '$course_info' },
    { $lookup: { from: 'cln_academy_courses_lessons', localField: 'course_row_id', foreignField: 'course_row_id', as: 'all_lessons' } },
    {
      $project: {
        course_row_id: 1,
        course_name: '$course_info.course_name',
        course_url: '$course_info.course_slug',
        course_description: '$course_info.course_description',
        course_image: '$course_info.course_image',
        completed_lessons: 1,
        total_lessons: { $size: '$all_lessons' },
        percentage_score: 1,
        course_status: { $literal: 'completed' },
      },
    },
  ])

  const progressCourses = await professionalsM.aggregate([
    { $match: { _id: userRowId } },
    {
      $lookup: {
        from: 'cln_academy_quiz_lession_started_details',
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$user_row_id', '$$userId'] }, { $eq: ['$lesson_status', 1] }] } } },
          { $group: { _id: '$course_row_id', completed_lessons: { $sum: 1 } } },
          { $lookup: { from: 'cln_academy_courses_lessons', localField: '_id', foreignField: 'course_row_id', as: 'all_lessons' } },
          { $addFields: { total_lessons: { $size: '$all_lessons' }, course_row_id: '$_id' } },
          { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
          { $unwind: '$course_info' },
          {
            $project: {
              _id: 0,
              course_row_id: 1,
              course_name: '$course_info.course_name',
              course_url: '$course_info.course_slug',
              course_description: '$course_info.course_description',
              course_image: '$course_info.course_image',
              total_lessons: 1,
              completed_lessons: 1,
              percentage_score: { $cond: [{ $eq: ['$total_lessons', 0] }, 0, { $multiply: [{ $divide: ['$completed_lessons', '$total_lessons'] }, 100] }] },
              course_status: { $cond: [{ $eq: ['$completed_lessons', '$total_lessons'] }, 'completed', 'ongoing'] },
            },
          },
        ],
        as: 'user_course_status',
      },
    },
    { $unwind: '$user_course_status' },
    { $replaceRoot: { newRoot: '$user_course_status' } },
  ])

  const completedCourseIds = new Set(completedCourses.map((c: { course_row_id: number }) => c.course_row_id.toString()))
  const finalOngoing = progressCourses.filter((c: { course_row_id: number }) => !completedCourseIds.has(c.course_row_id.toString()))
  const finalList = [...completedCourses, ...finalOngoing]

  if (finalList.length === 0) {
    return { status: false, message: 'No courses found for this user.' }
  }
  return { status: true, message: finalList }
}

/** Ports /user_lesson_details/:user_row_id/:course_row_id (~line 706-825) verbatim. */
export async function getUserLessonDetails(userRowIdRaw: string, courseRowIdRaw: string) {
  const userRowId = Number.parseInt(userRowIdRaw)
  const courseRowId = Number.parseInt(courseRowIdRaw)

  const lessonData = await LessonsM.aggregate([
    { $match: { course_row_id: courseRowId } },
    {
      $lookup: {
        from: 'cln_academy_quiz_lession_started_details',
        let: { lessonId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$lesson_row_id', '$$lessonId'] }, { $eq: ['$user_row_id', userRowId] }] } } },
          { $lookup: { from: 'cln_academy_quiz_answers', localField: '_id', foreignField: 'lesson_started_row_id', as: 'quiz_info' } },
          {
            $addFields: {
              correct_count: { $size: { $filter: { input: '$quiz_info', as: 'q', cond: { $eq: ['$$q.answer_status', true] } } } },
              wrong_count: { $size: { $filter: { input: '$quiz_info', as: 'q', cond: { $eq: ['$$q.answer_status', false] } } } },
              duration: { $sum: { $map: { input: '$quiz_info', as: 'q', in: { $ifNull: ['$$q.duration', 0] } } } },
            },
          },
          { $project: { lesson_status: 1, date_n_time: 1, correct_count: 1, duration: 1, wrong_count: 1 } },
        ],
        as: 'lesson_attempt',
      },
    },
    { $addFields: { status_data: { $arrayElemAt: ['$lesson_attempt', 0] } } },
    {
      $project: {
        lesson_row_id: '$_id',
        title: 1,
        lesson_url: 1,
        lesson_image_url: 1,
        lesson_number: 1,
        lesson_status: { $cond: { if: { $eq: ['$status_data', null] }, then: 'not started', else: { $cond: [{ $eq: ['$status_data.lesson_status', 1] }, 'completed', 'started'] } } },
        duration: '$status_data.duration',
        correct_count: '$status_data.correct_count',
        wrong_count: '$status_data.wrong_count',
        attempted_on: '$status_data.date_n_time',
      },
    },
    { $sort: { lesson_number: 1 as const } },
  ])

  return { status: true, message: lessonData }
}

export async function getCertificateList(params: GetCertificateListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100
  const courseRowId = params.courseRowIdRaw ? Number.parseInt(params.courseRowIdRaw) : undefined

  const matchQuery = buildCertificateListMatchQuery({ date: params.date, courseRowId })
  const pipeline = buildCertificateListPipeline({ matchQuery, search: params.search, skip, limit })
  const aggregateOutput = await CoursesCertificatesM.aggregate(pipeline)
  const { data, count } = extractCertificateListResult(aggregateOutput)

  return { status: true, message: data, count }
}
