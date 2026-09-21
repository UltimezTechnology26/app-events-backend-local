// modules/academy-admin/academy-admin.chapters.types.ts

export interface GetChapterListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  date?: string
  courseRowIdRaw?: string
}

export interface SaveChapterInput {
  chapterRowIdRaw?: string
  courseRowIdRaw?: string
  chapterNumberRaw?: string
  title?: string
  description?: string
}
