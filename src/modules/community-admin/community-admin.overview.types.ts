// modules/community-admin/community-admin.overview.types.ts
// Ports overview.js's GET /details and GET /group_details/:group_id response shapes.

export type CommunityOverviewDateRange = 'today' | '7days' | '1month' | '3months' | '6months'

export interface CommunityOverviewTopPost {
  _id: number
  post_content?: string
  post_images?: string[]
  full_name?: string
  user_name?: string
  user_pro_batch?: boolean
  user_email?: string
  user_profile_image?: string
  repost_full_name?: string
  repost_user_name?: string
  repost_pro_batch?: boolean
  repost_user_email?: string
  repost_user_profile_image?: string
  group_name?: string
  group_hastag?: string
  date?: Date
  reposted_date?: Date
  is_repost?: boolean
  repost_id?: number | null
  likeCount?: number
  commentCount?: number
  repostCount?: number
}

export interface CommunityOverviewDetails {
  total_posts: number
  total_deleted_posts: number
  top_liked_posts: CommunityOverviewTopPost[]
  top_commented_posts: CommunityOverviewTopPost[]
  top_reposted_posts: CommunityOverviewTopPost[]
}

export interface CommunityGroupOverviewDetails {
  total_group_posts: number
  total_comments: number
  total_likes: number
  total_dislikes: number
  total_reposts: number
  post_change_percentage: number
  like_change_percentage: number
  dislike_change_percentage: number
  comment_change_percentage: number
  repost_change_percentage: number
}
