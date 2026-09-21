// modules/academy-admin/academy-admin.lessons.types.ts

export interface GetLessonListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  courseRowIdRaw?: string
}

export interface SaveLessonInput {
  lessonRowIdRaw?: string
  courseRowIdRaw?: string
  lessonNumberRaw?: string
  title?: string
  description?: string
  authorName?: string
  authorIdRaw?: string
  authorLink?: string
  reviewedByName?: string
  reviewedByIdRaw?: string
  reviewedByLink?: string
  lessonImageUrl?: string
  metaKeywords?: string
  metaDescription?: string
}

export interface GetParticipatesListParams {
  lessonRowIdRaw: string
  skipRaw: string
  limitRaw: string
  search?: string
  date?: string
  quizResultRaw?: string
  lessonStatusRaw?: string
}
