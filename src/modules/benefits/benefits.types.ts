// modules/benefits/benefits.types.ts
// Ports services/main/benefits.ts's response shape.

export interface BenefitsRewards {
  dollar_reward: boolean
  expert_tag: boolean
  job_apply_eligibility: boolean
  direct_messsage: boolean
  team_interviewed: boolean
  news_coverage_eligability: boolean
  pro_influencer: boolean
  applied_as_speaker: boolean
  hosted_live_events: boolean
  top_contributer: boolean
  posted_on_home_page: boolean
}

export interface BenefitsDetails {
  profile_score: number
  total_points: number
  rewards: BenefitsRewards
  total_count: number
}

export type BenefitsResult =
  | { status: true; message: BenefitsDetails }
  | { status: false; message: string | { alert_message: string }; err?: string }
