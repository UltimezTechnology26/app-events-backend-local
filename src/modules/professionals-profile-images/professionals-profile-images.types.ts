// modules/professionals-profile-images/professionals-profile-images.types.ts

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

export interface UpdateProfileImageBody {
  user_row_id?: string | number
  profile_image_type: string | number
  profile_image?: string
}
