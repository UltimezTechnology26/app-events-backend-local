// modules/professionals-community/professionals-community.types.ts

export interface EngagementStats {
  total_likes: number
  total_comments: number
  total_reposts: number
  high_engagement: boolean
}

export interface CommunityDetailsResult {
  status: boolean
  message: unknown
}
