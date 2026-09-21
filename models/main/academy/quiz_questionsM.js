// MOVED (2026-09-17): the real schema now lives in
// src/modules/academy-admin/academy-admin.models.ts (see that file's own doc comment for why -
// genuine model colocation without a second `mongoose.model()` registration for
// 'cln_academy_quiz_questions'). This file stays as a passthrough so every legacy
// `require('models/main/academy/quiz_questionsM')` call site keeps working unchanged.
module.exports = require('../../../src/modules/academy-admin/academy-admin.models').QuizQuestionsM
