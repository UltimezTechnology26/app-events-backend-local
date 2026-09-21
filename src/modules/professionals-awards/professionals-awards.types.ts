// modules/professionals-awards/professionals-awards.types.ts

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

export interface UpdateAwardBody {
  user_row_id?: string | number
  award_row_id?: string | number
  award_title: string
  award_description: string
  award_image?: string
}
