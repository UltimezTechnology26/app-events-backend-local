// modules/academy-admin/academy-admin.quiz-questions.service.ts
//
// Ports quiz_questions.js's Add Question CRUD routes (add_n_update_details/list/details/delete,
// ~line 1-267) verbatim. No pagination added to /list - legacy has none, and a lesson's quiz has
// a small, bounded question count (the UI's own correct_answer validation caps answers at 4
// options; lessons realistically hold a handful of questions, not thousands) - not worth the
// added complexity for this volume, unlike Courses/Chapters/Lessons' own admin lists.
import { CoursesM, LessonsM, QuizQuestionsM } from './academy-admin.models'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for this helper (see academy-admin.courses.service.ts)
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { SaveQuizQuestionInput, GetQuizQuestionListParams } from './academy-admin.quiz-questions.types'

export async function saveQuizQuestion(input: SaveQuizQuestionInput) {
  const errObj: Record<string, string> = {}
  const isUpdate = !!input.questionRowIdRaw

  let courseRowId = 0
  if (input.courseRowIdRaw) {
    courseRowId = Number.parseInt(input.courseRowIdRaw)
    if (Number.isNaN(courseRowId)) {
      errObj.course_row_id = 'Sorry, Invalid Course Row ID.'
    } else {
      const course = await CoursesM.findOne({ _id: courseRowId })
      if (!course) {
        errObj.course_row_id = 'Sorry, Invalid Course Row ID.'
      }
    }
  }

  let lessonRowId = 0
  if (input.lessonRowIdRaw) {
    lessonRowId = Number.parseInt(input.lessonRowIdRaw)
    if (Number.isNaN(lessonRowId)) {
      errObj.lesson_row_id = 'Sorry, Invalid Lesson Row ID.'
    } else {
      const lesson = await LessonsM.findOne({ _id: lessonRowId })
      if (!lesson) {
        errObj.lesson_row_id = 'Sorry, Invalid Lesson Row ID.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (isUpdate) {
    const questionRowId = Number.parseInt(input.questionRowIdRaw as string)
    const existing = await QuizQuestionsM.findOne({ _id: questionRowId })
    if (!existing) {
      return { status: false, message: { alert_message: 'Sorry, This question row id is invalid.' } }
    }

    const updateArray = {
      lesson_row_id: lessonRowId,
      question_title: input.questionTitle,
      option_a: input.optionA,
      option_b: input.optionB,
      option_c: input.optionC,
      option_d: input.optionD,
      correct_answer: input.correctAnswerRaw,
    }
    await QuizQuestionsM.updateOne({ _id: questionRowId }, { $set: updateArray })

    // CONFIRMED PERF FIX (no-op cleanup, not a behavior change): legacy computed this same
    // `countDocuments` unconditionally at the top of the route, before it was even known whether
    // the request was a create or an update - on create, the count is silently discarded (never
    // read anywhere in the create response), wasting a full DB round trip. Moved into the update
    // branch, the only place its result (`count`) is ever returned.
    const existingQuestionCount = await QuizQuestionsM.countDocuments({ lesson_row_id: lessonRowId })

    return { status: true, count: existingQuestionCount, message: { alert_message: 'This quiz question details has been updated successfully.' } }
  }

  const saveObject = {
    course_row_id: courseRowId,
    lesson_row_id: lessonRowId,
    question_title: input.questionTitle,
    option_a: input.optionA,
    option_b: input.optionB,
    option_c: input.optionC,
    option_d: input.optionD,
    correct_answer: Number.parseInt(input.correctAnswerRaw as string),
    date_n_time: getPresentDateTime(),
  }
  await new QuizQuestionsM(saveObject).save()

  return { status: true, message: { alert_message: 'This quiz question details has been added successfully.' } }
}

export async function getQuizQuestionList(params: GetQuizQuestionListParams) {
  const lessonRowId = Number.parseInt(params.lessonRowIdRaw)
  if (Number.isNaN(lessonRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Lesson Row ID.' } }
  }

  const searchQuery: Record<string, unknown>[] = [{ lesson_row_id: lessonRowId }]

  if (params.search) {
    searchQuery.push({ $or: [{ question_title: { $regex: params.search, $options: 'i' } }] })
  }

  if (params.date) {
    const inputDate = new Date(params.date)
    const startDate = new Date(inputDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(inputDate)
    endDate.setHours(23, 59, 59, 999)
    searchQuery.push({ date_n_time: { $gte: startDate, $lte: endDate } })
  }

  const filterQuery = searchQuery.length > 0 ? { $and: searchQuery } : searchQuery[0]
  const questions = await QuizQuestionsM.find(filterQuery)

  return { status: true, message: questions }
}

export async function getQuizQuestionDetail(requestRowIdRaw: string) {
  const requestRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row ID.' } }
  }

  const question = await QuizQuestionsM.findOne({ _id: requestRowId })
  if (!question) {
    return { status: false, message: { alert_message: 'Sorry, Invalid request row id.' } }
  }

  return { status: true, message: question }
}

export async function deleteQuizQuestion(requestRowIdRaw: string) {
  const requestRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row ID.' } }
  }

  const question = await QuizQuestionsM.findOne({ _id: requestRowId })
  if (!question) {
    return { status: false, message: { alert_message: 'Sorry, Invalid request row id.' } }
  }

  await QuizQuestionsM.deleteOne({ _id: requestRowId })
  return { status: true, message: { alert_message: 'This quiz question details has been deleted successfully.' } }
}
