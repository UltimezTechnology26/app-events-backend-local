// modules/academy-admin/academy-admin.lessons.service.ts
//
// Ports lessons.js's Lessons CRUD + Participates routes (courses_list/chapters_list/
// add_n_update_details/list/details/details_by_lesson_id/delete/participates_list/
// participates_question_count/participates_question_list, ~line 1-1302) - the Phase 1-relevant
// slice of that 1,302-line legacy controller.
//
// NOT PORTED (confirmed dead code, zero live callers found via a repo-wide grep of
// admin-coinpedia excluding node_modules): GET /certficate (dumps the entire
// cln_academy_courses_certificates collection with no auth, no pagination, no filter - unused)
// and GET /issue (a hardcoded debug endpoint querying professionalsM for a single, literal
// user_row_id: 1837). Both are leftover debugging/scratch routes, not real functionality -
// migrating them forward would relocate dead weight, not port a feature.
import { ChaptersM, CoursesM, LessonsM } from './academy-admin.models'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- these models are shared with the
// not-yet-migrated quiz_questions.js/overview.js legacy controllers and aren't owned by this
// module - required directly rather than colocated, same precedent as professionals.self-service
// .service.ts requiring ProfessionalsPointsM/ProfessionalsFollowersM directly.
const quiz_lesson_started_detailsM = require('../../../models/main/academy/quiz_lesson_started_detailsM')
const users_quiz_answersM = require('../../../models/main/academy/users_quiz_answersM')
const sanitize = require('mongo-sanitize')
const { getPresentDateTime, validateAndSaveImage } = require('../../../utils/helpers/helper')
import { buildLessonListMatchQuery, buildLessonListPipeline, extractLessonListResult, buildParticipatesMatchQuery, buildParticipatesListPipeline, extractParticipatesListResult } from './academy-admin.lessons.queries'
import { invalidateCourseCaches } from './academy-admin.courses.cache'
import { GetLessonListParams, SaveLessonInput, GetParticipatesListParams } from './academy-admin.lessons.types'

/** Ports /courses_list (~line 20-27) - a course-name dropdown source for the lesson form. */
export async function getCoursesForLessonForm() {
  const courses = await CoursesM.find({}, { _id: 1, course_name: 1 })
  return { status: true, message: courses }
}

/** Ports /chapters_list/:course_row_id (~line 40-59) - a chapter-title dropdown scoped to one course. */
export async function getChaptersForLessonForm(courseRowIdRaw: string) {
  const courseRowId = Number.parseInt(courseRowIdRaw)
  if (Number.isNaN(courseRowId)) {
    return { status: false, message: { alert_message: 'Invalid Course Row ID.' } }
  }

  const chapters = await ChaptersM.find({ course_row_id: courseRowId }, { _id: 1, title: 1 })
  return { status: true, message: chapters }
}

/** Ported verbatim from lessons.js's own `generateLessonUrl` helper (slug generation). */
export async function generateLessonUrl(value: string): Promise<string | false> {
  try {
    const trimStr = value.trim().toLowerCase()
    const normalized = trimStr.replace(/\s+/g, ' ')
    const hyphenated = normalized.replace(/\s/g, '-')
    let cleaned = hyphenated.replace(/[&/#\\,+()$~%.'":*?<>{}|^]/g, '')
    cleaned = cleaned.replace(/-+/g, '-')
    cleaned = cleaned.replace(/(^-+)|(-+$)/g, '')
    return cleaned
  } catch {
    return false
  }
}

export async function saveLesson(input: SaveLessonInput) {
  const errObj: Record<string, string> = {}
  const isUpdate = !!input.lessonRowIdRaw

  const courseRowId = Number.parseInt(sanitize(input.courseRowIdRaw))
  const authorId = Number.parseInt(sanitize(input.authorIdRaw))
  const reviewedById = Number.parseInt(sanitize(input.reviewedByIdRaw))
  const lessonNumber = Number.parseInt(sanitize(input.lessonNumberRaw))
  const lessonRowId = isUpdate ? Number.parseInt(sanitize(input.lessonRowIdRaw)) : undefined

  if (Number.isNaN(courseRowId)) errObj.course_row_id = 'Invalid Course Row ID.'
  if (Number.isNaN(lessonNumber)) errObj.lesson_number = 'Invalid Lesson Number.'
  if (Number.isNaN(authorId)) errObj.author_id = 'Invalid Author Number.'
  if (Number.isNaN(reviewedById)) errObj.reviewed_by_id = 'Invalid Reviewed By Id.'
  if (isUpdate && Number.isNaN(lessonRowId)) errObj.lesson_row_id = 'Invalid Lesson Row ID.'

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const courseExists = await CoursesM.findOne({ _id: courseRowId }, { _id: 1 })
  if (!courseExists) {
    errObj.course_row_id = 'Invalid Course Row ID.'
  }

  const whereLessonTitle: Record<string, unknown> = isUpdate ? { course_row_id: courseRowId, title: input.title, _id: { $ne: lessonRowId } } : { course_row_id: courseRowId, title: input.title }
  const existingLessonTitle = await LessonsM.findOne(whereLessonTitle, { _id: 1 })
  if (existingLessonTitle) {
    errObj.title = 'This Lesson already exists.'
  }

  const whereLessonNumber: Record<string, unknown> = isUpdate ? { course_row_id: courseRowId, lesson_number: lessonNumber, _id: { $ne: lessonRowId } } : { course_row_id: courseRowId, lesson_number: lessonNumber }
  const existingLessonNumber = await LessonsM.findOne(whereLessonNumber, { _id: 1 })
  if (existingLessonNumber) {
    errObj.lesson_number = 'This Lesson Number already exists.'
  }

  if (isUpdate) {
    const lessonExists = await LessonsM.findOne({ _id: lessonRowId })
    if (!lessonExists) {
      errObj.lesson_row_id = 'Invalid Lesson Row ID.'
    }
  }

  let lessonImageUrl = ''
  if (Object.keys(errObj).length === 0 && input.lessonImageUrl) {
    const validated = await validateAndSaveImage(input.lessonImageUrl, 9)
    if (!validated.status) {
      errObj.lesson_image_url = 'Sorry, Invalid Lesson image.'
    } else {
      lessonImageUrl = validated.webp_file_name
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const generatedUrl = await generateLessonUrl(input.title as string)
  const lessonData = {
    course_row_id: courseRowId,
    lesson_number: lessonNumber,
    title: input.title,
    description: input.description,
    author_name: input.authorName,
    author_id: input.authorIdRaw,
    author_link: input.authorLink,
    reviewed_by_name: input.reviewedByName,
    reviewed_by_id: input.reviewedByIdRaw,
    reviewed_by_link: input.reviewedByLink,
    updated_on: getPresentDateTime(),
    lesson_image_url: lessonImageUrl,
    lesson_url: generatedUrl,
    meta_keywords: input.metaKeywords,
    meta_description: input.metaDescription,
  }

  if (isUpdate) {
    await LessonsM.updateOne({ _id: lessonRowId }, { $set: lessonData })
    await invalidateCourseCaches()
    return { status: true, update_array: lessonData, message: { alert_message: 'This Lesson details have been updated successfully.' } }
  }

  const saveData = { ...lessonData, lesson_status: 1, date_n_time: getPresentDateTime() }
  const savedLesson = await new LessonsM(saveData).save()
  await invalidateCourseCaches()
  return { status: true, saveObject: { ...saveData, _id: savedLesson?._id }, message: { alert_message: 'This Lesson details have been added successfully.' } }
}

export async function getLessonList(params: GetLessonListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100
  const courseRowId = params.courseRowIdRaw !== undefined ? Number.parseInt(params.courseRowIdRaw) : undefined
  const matchQuery = buildLessonListMatchQuery({ search: params.search, courseRowId })

  const pipeline = buildLessonListPipeline({ matchQuery, skip, limit })
  const aggregateOutput = await LessonsM.aggregate(pipeline)
  const { data, count } = extractLessonListResult(aggregateOutput)

  return { status: true, message: data, count }
}

export async function getLessonDetail(lessonRowIdRaw: string) {
  const lessonRowId = Number.parseInt(lessonRowIdRaw)
  if (Number.isNaN(lessonRowId)) {
    return { status: false, message: { alert_message: 'Invalid Lesson Row ID.' } }
  }

  const aggregateOutput = await LessonsM.aggregate([
    { $match: { _id: lessonRowId } },
    {
      $lookup: {
        from: 'cln_academy_quiz_questions',
        localField: '_id',
        foreignField: 'lesson_row_id',
        pipeline: [{ $group: { _id: '$lesson_row_id', count: { $sum: 1 } } }],
        as: 'quiz_question_count',
      },
    },
    { $addFields: { total_questions_count: { $ifNull: [{ $arrayElemAt: ['$quiz_question_count.count', 0] }, 0] } } },
    {
      $project: {
        _id: 1,
        title: 1,
        description: 1,
        lesson_number: 1,
        lesson_image_url: 1,
        course_row_id: 1,
        total_questions_count: 1,
        author_name: 1,
        author_id: 1,
        lesson_url: 1,
        date_n_time: 1,
        author_link: 1,
        reviewed_by_name: 1,
        reviewed_by_id: 1,
        reviewed_by_link: 1,
        meta_description: 1,
        meta_keywords: 1,
      },
    },
  ])

  if (aggregateOutput.length > 0) {
    return { status: true, message: aggregateOutput[0] }
  }
  return { status: false, message: 'Lesson not found' }
}

export async function getLessonDetailByLessonId(lessonIdRaw: string) {
  const lessonId = Number.parseInt(lessonIdRaw)
  if (Number.isNaN(lessonId)) {
    return { status: false, message: { alert_message: 'Invalid Lesson Row ID.' } }
  }

  const aggregateOutput = await LessonsM.aggregate([
    { $match: { _id: lessonId } },
    { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
    { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        title: 1,
        lesson_image_url: 1,
        lesson_number: 1,
        course_name: '$course_info.course_name',
        // CONFIRMED PRE-EXISTING BUG, ported as-is (flagged, not fixed): `chapter_info` is never
        // looked up anywhere in this pipeline (no $lookup against chapters at all) - these two
        // fields always project as undefined. Fixing this would mean adding a real $lookup, a
        // behavior change beyond a straight port.
        chapter_title: '$chapter_info.title',
        chapter_number: '$chapter_info.chapter_number',
      },
    },
  ])

  if (aggregateOutput[0]) {
    return { status: true, message: aggregateOutput[0] }
  }
  return { status: false, message: { alert_message: 'Invalid Lesson  ID.' } }
}

export async function deleteLesson(lessonRowIdRaw: string) {
  const lessonRowId = Number.parseInt(lessonRowIdRaw)
  if (Number.isNaN(lessonRowId)) {
    return { status: false, message: { alert_message: 'Invalid Lesson Row ID.' } }
  }

  const lesson = await LessonsM.findOne({ _id: lessonRowId })
  if (!lesson) {
    return { status: false, message: { alert_message: 'Invalid lesson row id.' } }
  }

  await LessonsM.deleteOne({ _id: lessonRowId })
  // CONFIRMED SEVERE BUG, FIXED (not ported as-is - see rationale below): legacy reads
  // `get_query.lesson_id`, a field that doesn't exist anywhere on the Lessons schema (confirmed
  // against models/main/academy/lessonsM.js - the schema has no `lesson_id` field, only `_id`).
  // That property access always evaluates to `undefined`, so legacy's own
  // `quiz_lesson_started_detailsM.deleteMany({ lesson_row_id: undefined })` /
  // `users_quiz_answersM.deleteMany({ lesson_row_id: undefined })` calls pass a filter Mongoose
  // strips down to `{}` (an undefined field value is omitted from the cast query) - deleting a
  // SINGLE lesson would delete EVERY quiz-participation and quiz-answer document across the
  // entire Academy feature, for every lesson, every course. This is a mass-data-loss bug, not a
  // cosmetic one, and the "preserve behavior by default" rule doesn't extend to reproducing a
  // live data-destruction vector - fixed to scope the cleanup to the lesson actually being
  // deleted, using the same `lesson_row_id` value (the lesson's own numeric `_id`) every other
  // route in this file already uses to reference a lesson from these two collections (see
  // buildParticipatesMatchQuery/getParticipatesList above).
  await quiz_lesson_started_detailsM.deleteMany({ lesson_row_id: lessonRowId })
  await users_quiz_answersM.deleteMany({ lesson_row_id: lessonRowId })
  await invalidateCourseCaches()

  return { status: true, get_query: lesson, message: { alert_message: 'This lesson details has been deleted successfully.' } }
}

export async function getParticipatesList(params: GetParticipatesListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100
  const lessonRowId = Number.parseInt(params.lessonRowIdRaw)
  const quizResult = params.quizResultRaw !== undefined ? Number.parseInt(params.quizResultRaw) : undefined
  const lessonStatus = params.lessonStatusRaw !== undefined ? Number.parseInt(params.lessonStatusRaw) : undefined

  const matchQuery = buildParticipatesMatchQuery({ lessonRowId, search: params.search, date: params.date, quizResult, lessonStatus })
  const pipeline = buildParticipatesListPipeline({ matchQuery, skip, limit })
  const aggregateOutput = await quiz_lesson_started_detailsM.aggregate(pipeline)
  const { data, count } = extractParticipatesListResult(aggregateOutput)

  return { status: true, message: data, count }
}

/** Ports /participates_question_count/:participated_row_id (~line 969-1099) verbatim. */
export async function getParticipantQuestionCount(participatedRowIdRaw: string) {
  const participatedRowId = Number.parseInt(participatedRowIdRaw)
  if (Number.isNaN(participatedRowId)) {
    return { status: false, message: { alert_message: 'Invalid Lesson Row ID.' } }
  }

  const aggregateOutput = await users_quiz_answersM.aggregate([
    { $match: { lesson_started_row_id: participatedRowId } },
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [
          { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: '_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, full_name: 1, pro_batch: 1, user_name: 1, email_id: 1, mobile_number: 1, profile_image: '$img_info.profile_image' } },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_academy_quiz_questions', localField: 'question_row_id', foreignField: '_id', as: 'question_details' } },
    { $unwind: { path: '$question_details', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        answer_number: 1,
        correct_answer: { $toInt: '$question_details.correct_answer' },
        user_info: { _id: '$user_info._id', full_name: '$user_info.full_name', pro_batch: '$user_info.pro_batch', user_name: '$user_info.user_name', email_id: '$user_info.email_id', mobile_number: '$user_info.mobile_number', profile_image: '$user_info.profile_image' },
      },
    },
    {
      $group: {
        _id: '$user_info',
        total_questions: { $sum: 1 },
        correct_answers: { $sum: { $cond: [{ $eq: ['$answer_number', '$correct_answer'] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        user_info: '$_id',
        total_questions: 1,
        correct_answers: 1,
        incorrect_answers: { $subtract: ['$total_questions', '$correct_answers'] },
        result_status: { $cond: { if: { $gte: ['$correct_answers', 7] }, then: 1, else: 0 } },
      },
    },
  ])

  return { status: true, message: aggregateOutput[0] || { total_questions: 0, correct_answers: 0, incorrect_answers: 0, result_status: 0, user_info: null } }
}

/**
 * Ports /participates_question_list/:participated_row_id (~line 1103-1297) verbatim, except:
 * CONFIRMED PERF FIX - legacy ran `list_query` then `count_query` as two sequential `await`s
 * despite neither depending on the other's result; Promise.all'd here, same class of fix applied
 * throughout this migration.
 */
export async function getParticipantQuestionList(participatedRowIdRaw: string, search?: string, answerValueRaw?: string) {
  const participatedRowId = Number.parseInt(participatedRowIdRaw)
  if (Number.isNaN(participatedRowId)) {
    return { status: false, message: { alert_message: 'Invalid Lesson Row ID.' } }
  }

  const basePipeline: Record<string, unknown>[] = [
    { $match: { $and: [{ lesson_started_row_id: participatedRowId }] } },
    { $lookup: { from: 'cln_academy_quiz_questions', localField: 'question_row_id', foreignField: '_id', as: 'question_details' } },
    { $unwind: { path: '$question_details', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        answer_status: { $cond: { if: { $eq: ['$answer_number', '$question_details.correct_answer'] }, then: true, else: false } },
        timeout_status: { $cond: { if: { $in: ['$answer_number', [null, false, '', 0]] }, then: true, else: false } },
      },
    },
  ]

  if (search) {
    basePipeline.push({ $match: { 'question_details.question_title': { $regex: search, $options: 'i' } } })
  }

  const answerValue = answerValueRaw !== undefined ? Number.parseInt(answerValueRaw) : undefined
  if (answerValue === 1) {
    basePipeline.push({ $match: { answer_status: true, timeout_status: false } })
  } else if (answerValue === 2) {
    basePipeline.push({ $match: { answer_status: false, timeout_status: false } })
  } else if (answerValue === 3) {
    basePipeline.push({ $match: { answer_status: false, timeout_status: true } })
  }

  basePipeline.push({
    $project: {
      user_row_id: 1,
      lesson_started_row_id: 1,
      question_row_id: 1,
      answer_number: 1,
      close_status: 1,
      date_n_time: 1,
      question_title: '$question_details.question_title',
      option_a: '$question_details.option_a',
      option_b: '$question_details.option_b',
      option_c: '$question_details.option_c',
      option_d: '$question_details.option_d',
      correct_answer: '$question_details.correct_answer',
      answer_status: 1,
      timeout_status: 1,
    },
  })

  const [listQuery, countQuery] = await Promise.all([
    users_quiz_answersM.aggregate(basePipeline),
    users_quiz_answersM.aggregate([
      { $match: { lesson_started_row_id: participatedRowId } },
      {
        $lookup: {
          from: 'cln_professionals',
          localField: 'user_row_id',
          foreignField: '_id',
          as: 'user_info',
          pipeline: [
            { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
            { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
            { $project: { _id: 1, full_name: 1, pro_batch: 1, user_name: 1, email_id: 1, wallet_address: 1, mobile_number: 1, profile_image: '$img_info.profile_image' } },
          ],
        },
      },
      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'cln_academy_quiz_questions', localField: 'question_row_id', foreignField: '_id', as: 'question_details' } },
      { $unwind: { path: '$question_details', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          answer_number: 1,
          correct_answer: { $toInt: '$question_details.correct_answer' },
          user_info: { _id: '$user_info._id', full_name: '$user_info.full_name', pro_batch: '$user_info.pro_batch', user_name: '$user_info.user_name', email_id: '$user_info.email_id', mobile_number: '$user_info.mobile_number', profile_image: '$user_info.profile_image' },
        },
      },
      { $group: { _id: '$user_info', total_questions: { $sum: 1 }, correct_answers: { $sum: { $cond: [{ $eq: ['$answer_number', '$correct_answer'] }, 1, 0] } } } },
      {
        $project: {
          _id: 0,
          user_info: '$_id',
          total_questions: 1,
          correct_answers: 1,
          incorrect_answers: { $subtract: ['$total_questions', '$correct_answers'] },
          result_status: { $cond: { if: { $gte: ['$correct_answers', 7] }, then: 1, else: 0 } },
        },
      },
    ]),
  ])

  return { status: true, question_details: listQuery, count_query: countQuery }
}
