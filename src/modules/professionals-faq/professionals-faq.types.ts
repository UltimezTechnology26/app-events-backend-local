// modules/professionals-faq/professionals-faq.types.ts

export interface UserAuthFailure {
  status: false
  message: unknown
}

export interface UserAuthSuccess {
  status: true
  message: {
    user_row_id: number
    user_type: number
  }
}

export type UserAuthResult = UserAuthSuccess | UserAuthFailure

export interface UpdateFaqBody {
  user_row_id?: string | number
  faq_row_id?: string | number
  faq_question: string
  faq_answer: string
}
