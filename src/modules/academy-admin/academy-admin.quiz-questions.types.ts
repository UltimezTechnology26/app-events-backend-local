// modules/academy-admin/academy-admin.quiz-questions.types.ts

export interface SaveQuizQuestionInput {
  questionRowIdRaw?: string
  courseRowIdRaw?: string
  lessonRowIdRaw?: string
  questionTitle?: string
  optionA?: string
  optionB?: string
  optionC?: string
  optionD?: string
  correctAnswerRaw?: string
}

export interface GetQuizQuestionListParams {
  lessonRowIdRaw: string
  search?: string
  date?: string
}
