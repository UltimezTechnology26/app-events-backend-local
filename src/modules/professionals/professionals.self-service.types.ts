// modules/professionals/professionals.self-service.types.ts

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

// checkUserLoginToken's own return shape (as opposed to checkAllLoginToken's normalized
// {user_row_id, user_type} envelope) — message is the bare user_row_id number on success.
export interface UserTokenAuthFailure {
  status: false
  message: string
}

export interface UserTokenAuthSuccess {
  status: true
  message: number
}

export type UserTokenAuthResult = UserTokenAuthSuccess | UserTokenAuthFailure

export interface UpdateUserDetailsBody {
  user_row_id?: string | number
  gender: string | number
  full_name: string
  account_visible_type: string | number
  user_bio: string
  designation_id?: unknown
  about_in_one_line: string
  country_id?: unknown
  country_mobile_id?: unknown
  location?: unknown
  looking_for_id?: unknown
  vcf_status?: unknown
  area?: unknown
  city?: unknown
  country_name?: unknown
  location_country?: unknown
  state?: unknown
  longitude?: unknown
  latitude?: unknown
  mobile_number?: string
  user_name?: string
  email_id?: string
  manual_user_row_id?: unknown
  youtube_channel?: string
  website?: unknown
  feed_url?: unknown
  facebook?: unknown
  twitter?: unknown
  linkedin?: unknown
  video_link?: unknown
  instagram?: unknown
  telegram?: unknown
  reddit?: unknown
  medium?: unknown
  meta_keywords?: unknown
  meta_description?: unknown
}
