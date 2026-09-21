// modules/professionals-seo/professionals-seo.types.ts

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

export interface UpdateUserSeoBody {
  module_id: string | number
  meta_title: string
  meta_description: string
  meta_keywords: string
  robots_index?: unknown
  robots_follow?: unknown
  twitter_creator?: unknown
  og_title?: unknown
  og_description?: unknown
  twitter_title?: unknown
  twitter_description?: unknown
}
