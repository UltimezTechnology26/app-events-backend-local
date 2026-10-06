// modules/benefits/benefits.service.ts
// Ports services/main/benefits.ts's getBenefitsDetails (~46-224) verbatim, including its own
// auth check and its own try/catch (the controller is a thin pass-through of this result, same
// shape as legacy's own controllers/main/community/benefits.js) - reuses the community module's
// own getProfileScores/getPostDates/calculateStreaks (same queries pro_batch_v2 already does)
// instead of redeclaring them a second time.
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { getProfileScores, getPostDates } from '../community/community.queries'
import { calculateStreaks } from '../community/community.service'
import { getLeaderboardRanking, hasAcademyCertificate, hasPointType, getPointsBalance } from './benefits.queries'
import { BenefitsResult, BenefitsRewards } from './benefits.types'

const TOP_LEADERBOARD_LIMIT = 50
const STREAK_DAYS_FOR_DOLLAR_REWARD = 21

export async function getBenefitsDetails(headers: Record<string, unknown>): Promise<BenefitsResult> {
  try {
    const checkToken = checkUserLoginToken(headers)
    if (!checkToken.status) {
      return { status: false, message: { alert_message: checkToken.message } }
    }

    const userRowId = Number.parseInt(checkToken.message)
    if (Number.isNaN(userRowId)) {
      return { status: false, message: 'Invalid user ID' }
    }

    const userMain = await getProfileScores(userRowId)
    if (!userMain) {
      throw new Error('User not found.')
    }
    const totalCompletion = (userMain as { profile_score?: number }).profile_score || 0

    const [userPosts, leaderboard, expertTag, jobApplyEligibility, teamInterviewed, newsCoverage, totalBalance] = await Promise.all([
      getPostDates(userRowId),
      getLeaderboardRanking(),
      hasAcademyCertificate(userRowId),
      hasPointType(userRowId, 'job_apply_eligibility'),
      hasPointType(userRowId, 'team_interviewed'),
      hasPointType(userRowId, 'news_coverage'),
      getPointsBalance(userRowId),
    ])

    const { maxStreak } = calculateStreaks(userPosts)

    // Legacy also built a `rankMap` (user id -> rank) here that was never read anywhere -
    // CONFIRMED DEAD CODE, dropped rather than ported.
    const isUserInTop50 = leaderboard
      .slice(0, TOP_LEADERBOARD_LIMIT)
      .some((item) => item._id === userRowId)

    const rewards: BenefitsRewards = {
      dollar_reward: maxStreak >= STREAK_DAYS_FOR_DOLLAR_REWARD && isUserInTop50,
      expert_tag: expertTag,
      job_apply_eligibility: jobApplyEligibility,
      direct_messsage: false,
      team_interviewed: teamInterviewed,
      news_coverage_eligability: newsCoverage,
      pro_influencer: false,
      applied_as_speaker: false,
      hosted_live_events: false,
      top_contributer: false,
      posted_on_home_page: false,
    }

    const totalCount = Object.values(rewards).filter(Boolean).length

    return {
      status: true,
      message: {
        profile_score: totalCompletion,
        total_points: totalBalance,
        rewards,
        total_count: totalCount,
      },
    }
  } catch (error) {
    // Matches legacy's own catch block exactly (including leaking err.message in the response) -
    // FLAGGED, NOT FIXED, same precedent as the community module's own community.controller.ts doc comment.
    console.error('❌ Error in getBenefitsDetails:', error)
    return { status: false, message: 'Something went wrong while fetching user details.', err: error instanceof Error ? error.message : String(error) }
  }
}
