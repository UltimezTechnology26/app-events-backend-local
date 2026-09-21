// modules/community-admin/community-admin.challenge.types.ts

export interface GetChallengeListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  startDate?: string
  endDate?: string
}
