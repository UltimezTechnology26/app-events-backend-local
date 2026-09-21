// modules/academy-admin/academy-admin.models.ts
//
// REAL SCHEMA COLOCATION, same convention already proven for `professionals.models.ts`/
// `professionals-*.models.ts` this session: `CoursesM`'s schema now lives here, ported verbatim
// (every field, every `.index()` call, the `pre('save')` auto-increment hook) from legacy
// `models/main/academy/coursesM.js`.
//
// `CoursesM` still has a WIDE legacy consumer list that stays live for this migration's whole
// `_v2` parallel-mount window (confirmed via a repo-wide grep before colocating): every route in
// `controllers/admin_panel/main/academy/{chapters,courses,lessons,overview,quiz_questions,users}.js`,
// `controllers/app/{analytics,sitemap}.js`, `controllers/main/academy/{lessons,quiz_questions}.js`,
// `controllers/main/{users,weekly_contests}.js`, and already-TypeScript `services/main/{course,
// lesson}.ts`. Two `mongoose.model()` calls for the same collection name in one process always
// throws `OverwriteModelError`, so `models/main/academy/coursesM.js` is reduced to a one-line
// passthrough (see that file) rather than left as a second declaration - every legacy call site
// resolves to this exact same compiled model object via Node's require cache.
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for this helper (see professionals.models.ts, funding.service.ts)
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const courseSchema = new mongoose.Schema(
  {
    _id: { type: Number },
    course_name: { type: String, required: true, index: true },
    course_description: { type: String, required: true },
    course_slug: { type: String },
    course_image: { type: String, required: true },
    expert_tag: { type: String, required: true },
    date_n_time: { type: Date, required: true, index: true },
    meta_keywords: { type: String, required: true },
    meta_description: { type: String, required: true },
  },
  { versionKey: false },
)

courseSchema.index({ date_n_time: -1 })
courseSchema.index({ course_name: 1 })

courseSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_academy_courses')
  }
  next()
})

export const CoursesM = mongoose.model('cln_academy_courses', courseSchema, 'cln_academy_courses')

// `ChaptersM` - same colocation treatment, ported verbatim from legacy `models/main/academy/
// chaptersM.js`. Wide legacy consumer list confirmed via grep (chapters.js, courses.js,
// lessons.js x2, users.js, overview.js, weekly_contests.js) - `models/main/academy/chaptersM.js`
// reduced to a one-line passthrough, same as coursesM.js above.
const chapterSchema = new mongoose.Schema({
  _id: { type: Number },
  course_row_id: { type: Number, index: true, required: true },
  chapter_number: { type: Number, index: true, required: true },
  title: { type: String },
  description: { type: String },
  chapter_status: { type: Boolean, default: true },
  date_n_time: { type: Date, required: true },
})

chapterSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_academy_courses_chapters')
  }
  next()
})

export const ChaptersM = mongoose.model('cln_academy_courses_chapters', chapterSchema, 'cln_academy_courses_chapters')

// `LessonsM` - same colocation treatment, ported verbatim from legacy `models/main/academy/
// lessonsM.js` (every field, every `.index()` call). Wide legacy consumer list confirmed via grep
// (chapters.js, courses.js, faq.js, lessons.js x2, overview.js x2, quiz_questions.js x2, users.js,
// bookmarks.js, weekly_contests.js, app/analytics.js, app/sitemap.js, services/main/lesson.ts) -
// `models/main/academy/lessonsM.js` reduced to a one-line passthrough, same as its siblings above.
const lessonSchema = new mongoose.Schema({
  _id: { type: Number },
  course_row_id: { type: Number, index: true, required: true },
  lesson_number: { type: Number, index: true, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  author_name: { type: String, required: true },
  author_id: { type: Number, required: true },
  author_link: { type: String, required: true },
  reviewed_by_name: { type: String, required: true },
  reviewed_by_id: { type: Number, required: true },
  reviewed_by_link: { type: String, required: true },
  updated_on: { type: Date, required: true },
  lesson_image_url: { type: String, required: true },
  lesson_url: { type: String, index: true },
  lesson_status: { type: Number, default: 1 },
  date_n_time: { type: Date, required: true },
  meta_keywords: { type: String, required: true },
  meta_description: { type: String, required: true },
})

lessonSchema.index({ course_row_id: 1, lesson_number: 1 })
lessonSchema.index({ course_row_id: 1, lesson_number: 1, _id: 1 })

lessonSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_academy_courses_lessons')
  }
  next()
})

export const LessonsM = mongoose.model('cln_academy_courses_lessons', lessonSchema, 'cln_academy_courses_lessons')

// `QuizQuestionsM` - same colocation treatment, ported verbatim from legacy `models/main/academy/
// quiz_questionsM.js`. Wide legacy consumer list confirmed via grep (courses.js, lessons.js x2,
// overview.js, quiz_questions.js x2, weekly_contests.js, services/main/lesson.ts) -
// `models/main/academy/quiz_questionsM.js` reduced to a one-line passthrough, same as its
// siblings above.
const quizQuestionSchema = new mongoose.Schema({
  _id: { type: Number },
  course_row_id: { type: Number, index: true, required: true },
  lesson_row_id: { type: Number, index: true, required: true },
  question_title: { type: String, required: true },
  option_a: { type: String },
  option_b: { type: String },
  option_c: { type: String },
  option_d: { type: String },
  correct_answer: { type: Number },
  time_in_seconds: { type: String },
  question_status: { type: Number },
  date_n_time: { type: Date, required: true },
})

quizQuestionSchema.index({ lesson_row_id: 1 })

quizQuestionSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_academy_quiz_questions')
  }
  next()
})

export const QuizQuestionsM = mongoose.model('cln_academy_quiz_questions', quizQuestionSchema, 'cln_academy_quiz_questions')
