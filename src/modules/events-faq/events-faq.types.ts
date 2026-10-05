// src/modules/events-faq/events-faq.types.ts

export interface CheckUserTokenMessage {
  user_row_id?: number | string
  user_type?: number | string
}

export interface CheckUserTokenResult {
  status: boolean
  message: CheckUserTokenMessage
  token_message?: {
    admin_row_id?: number | string
    admin_manager_type?: unknown
    sub_admin_type?: number | string
  }
}

export interface UpdateEventFaqBody {
  event_row_id?: string | number
  faq_row_id?: string | number
  faq_question: string
  faq_answer: string
}
