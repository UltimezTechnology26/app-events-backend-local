// modules/professionals-community/professionals-community.service.ts
// Ports controllers/main/community/pro_batch.js's GET /details (~94-265). Same behavior, same
// response shape, same conditional side effects (21-day-challenge row, Pro Batch badge + points +
// emails) — only the independent reads are parallelized (CONFIRMED PERF FIX, see below).
import ProfessionalM from '../../../models/app/professionalsM'
import ProfessionalsPointsM from '../../../models/app/users/professionals_pointsM'
import { Community21DaysChallengeM } from './professionals-community.models'
import { getProfileScores, getIntroAndFirstFeedFlags, getPostDates, getUserPostEngagementStats, getDistinctPostGroupIds } from './professionals-community.queries'
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { sendCommunityEmail } = require('../../../config/email')
const { sendDollarrewardEmail } = require('../../../utils/helpers/app_helper')

const PROFILE_COMPLETE_THRESHOLD = 70
const STREAK_DAYS_FOR_CHALLENGE = 21
const PRO_BATCH_POINTS = '100'

function calculateStreaks(postDates: Array<{ _id: string }>): { maxStreak: number; currentStreak: number } {
  const dates = postDates.map((p) => new Date(p._id))
  let maxStreak = 1
  let currentStreak = 1

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const curr = new Date(dates[i])
    prev.setHours(0, 0, 0, 0)
    curr.setHours(0, 0, 0, 0)

    const diffInDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)

    if (diffInDays === 1) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else if (diffInDays > 1) {
      currentStreak = 1
    }
  }

  return { maxStreak, currentStreak }
}

async function sendProBadgeEmail(userData: any) {
  const pass_subject = `Big Win! Your Pro Badge is Here!`
  const header_profile_section = `Big Win! Your Pro Badge is Here!`
  const pass_message = `
            <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                <h3>Hello  ${userData?.full_name},</h3>

                <p>Huge congratulations - you’ve officially completed all tasks and earned your Pro Badge on Coinpedia! </p>
                <p style="margin: 0px; font-weight: bold">🎉 What does this mean for you?</p>
                <p style="margin: 0 0 8px">
                    You now have the exclusive ability to submit your article to the Coinpedia team for publishing!
                    It’s your time to shine and share your voice with a wider audience.</p>

                <p>We’re excited to feature your work - let’s make it happen! 🚀,</p>
            </div>`

  await sendCommunityEmail(userData?.email_id, pass_subject, pass_message, header_profile_section)
}

async function maybeRecord21DayChallenge(userRowId: number, maxStreak: number) {
  if (maxStreak < STREAK_DAYS_FOR_CHALLENGE) return

  const group_ids = await getDistinctPostGroupIds(userRowId)
  const exists = await Community21DaysChallengeM.findOne({ user_row_id: userRowId })
  if (exists) return

  const newChallenge = new Community21DaysChallengeM({
    user_row_id: userRowId,
    group_ids,
    valid_status: false,
    released_status: false,
    date_n_time: getPresentDateTime(),
  })
  await newChallenge.save()
}

async function maybeAwardProBadge(userRowId: number, userMain: any, opts: { hasIntroduced: boolean; hasFirstFeed: boolean; totalCompletion: number; maxStreak: number; stats: { high_engagement: boolean } }) {
  const { hasIntroduced, hasFirstFeed, totalCompletion, maxStreak, stats } = opts
  const eligible = stats?.high_engagement && hasFirstFeed && hasIntroduced && totalCompletion >= PROFILE_COMPLETE_THRESHOLD && maxStreak >= STREAK_DAYS_FOR_CHALLENGE
  if (!eligible) return

  const user = await ProfessionalM.findOne({ _id: userRowId, pro_batch: false })
  if (user) {
    await sendProBadgeEmail(userMain)
    await ProfessionalM.updateOne({ _id: userRowId }, { $set: { pro_batch: true } })
  }

  const points = await ProfessionalsPointsM.findOne({ user_row_id: userRowId, point_type: 'pro_batch' })
  if (!points) {
    const pointEntry = new ProfessionalsPointsM({
      user_row_id: userRowId,
      points: PRO_BATCH_POINTS,
      point_type: 'pro_batch',
      point_status: 'credited',
    })
    await pointEntry.save()
    sendDollarrewardEmail({ full_name: user?.full_name, email_id: user?.email_id })
  }
}

export async function getCommunityDetails(userRowId: number) {
  const userMain = await getProfileScores(userRowId)
  if (!userMain) {
    return { httpStatus: 404, body: { status: false, message: 'User not found.' } }
  }

  const totalCompletion = (userMain as any).profile_score || 0

  // CONFIRMED PERF FIX: legacy runs the profile-score fetch, the intro/first-feed existence
  // checks, the post-dates aggregate, and the engagement-stats computation as four independent
  // sequential blocks of `await`s, even though none of them depend on each other's result (only
  // the streak calc + the later conditional writes depend on their combined output).
  // Promise.all them — matching this migration's standard independent-query fix.
  const [[hasIntroduced, hasFirstFeed], userPosts, stats] = await Promise.all([
    getIntroAndFirstFeedFlags(userRowId),
    getPostDates(userRowId),
    getUserPostEngagementStats(userRowId),
  ])

  const { maxStreak, currentStreak } = calculateStreaks(userPosts)

  await maybeRecord21DayChallenge(userRowId, maxStreak)
  await maybeAwardProBadge(userRowId, userMain, { hasIntroduced: !!hasIntroduced, hasFirstFeed: !!hasFirstFeed, totalCompletion, maxStreak, stats })

  return {
    httpStatus: 200,
    body: {
      status: true,
      message: {
        profile_completed_status: totalCompletion >= PROFILE_COMPLETE_THRESHOLD,
        has_introduced: !!hasIntroduced,
        has_first_feed: !!hasFirstFeed,
        current_streak: currentStreak,
        has_21_day_streak: maxStreak >= STREAK_DAYS_FOR_CHALLENGE,
        stats,
        high_engagement: stats?.high_engagement,
        requested_team: false,
        userPosts,
      },
    },
  }
}
