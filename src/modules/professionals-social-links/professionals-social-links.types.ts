// modules/professionals-social-links/professionals-social-links.types.ts

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

export interface SocialLinksBody {
  user_row_id?: string | number
  feed_url?: string
  facebook?: string
  twitter?: string
  linkedin?: string
  video_link?: string
  instagram?: string
  telegram?: string
  reddit?: string
  medium?: string
  youtube_channel?: string
  other_social_links?: unknown
}
