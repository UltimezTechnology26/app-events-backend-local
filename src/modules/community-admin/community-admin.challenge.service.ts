// modules/community-admin/community-admin.challenge.service.ts
//
// Ports 21dayschallenge.js's routes (list/get_user_posts/update_valid_status/
// update_released_status, ~line 1-395).
import { Community21DaysChallengeM } from '../professionals-community/professionals-community.models'
const community_postsM = require('../../../models/main/community/community_postsM')
import { buildChallengeMatchConditions, buildChallengeListPipeline, extractChallengeListResult } from './community-admin.challenge.queries'
import { buildPostsListPipeline, extractPostsListResult } from './community-admin.posts.queries'
import { GetChallengeListParams } from './community-admin.challenge.types'

export async function getChallengeList(params: GetChallengeListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 10

  const matchConditions = buildChallengeMatchConditions({ search: params.search?.trim(), startDate: params.startDate, endDate: params.endDate })
  const pipeline = buildChallengeListPipeline({ matchConditions, skip, limit })
  const aggregateOutput = await Community21DaysChallengeM.aggregate(pipeline)
  const { data, count } = extractChallengeListResult(aggregateOutput)

  return { status: true, message: data, count }
}

/** Ports /get_user_posts/:user_row_id (~line 97-322) - reuses the same fixed lookup chain as All Posts/Deleted Posts, matched to one user's own posts (repost-aware) with no pagination (legacy has none here either - a bounded, per-user "reward review" list). */
export async function getChallengeUserPosts(userRowIdRaw: string) {
  const userRowId = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(userRowId)) {
    return { status: false, message: 'Invalid user id.' }
  }

  const matchQuery = {
    $expr: {
      $cond: [{ $eq: ['$is_repost', true] }, { $eq: ['$repost_user_row_id', userRowId] }, { $eq: ['$user_row_id', userRowId] }],
    },
  }
  // A large `limit` stands in for "unbounded" (legacy has no pagination on this route at all) -
  // reuses the shared $facet pipeline builder rather than a third copy of the lookup chain.
  const pipeline = buildPostsListPipeline({ matchQuery, skip: 0, limit: 10000 })
  const aggregateOutput = await community_postsM.aggregate(pipeline)
  const { data } = extractPostsListResult(aggregateOutput)

  return { status: true, message: data }
}

/**
 * Ports /update_valid_status/:id (~line 324-356) verbatim.
 *
 * CONFIRMED REAL GAP, closed here (not silently left unreachable): legacy's own 21-Day Challenge
 * tab has NO "Validate" button anywhere in its UI - this route exists and works, but nothing ever
 * calls it. Since `update_released_status` hard-requires `valid_status` to already be true
 * ("Cannot release before validating"), a freshly-created challenge could never legitimately be
 * released from the legacy admin panel at all. Wired into the new frontend as a real action
 * rather than reproducing the same dead end.
 */
export async function updateChallengeValidStatus(idRaw: string, validStatus: unknown) {
  if (typeof validStatus !== 'boolean') {
    return { status: false, message: 'Valid status must be a boolean' }
  }

  const id = Number.parseInt(idRaw)
  const updatedDoc = await Community21DaysChallengeM.findOneAndUpdate({ _id: id }, { $set: { valid_status: validStatus } }, { new: true })
  if (!updatedDoc) {
    return { status: false, message: 'Document not found' }
  }

  return { status: true, message: 'Valid status updated successfully' }
}

/** Ports /update_released_status/:id (~line 358-392) verbatim, including the valid_status guard. */
export async function updateChallengeReleasedStatus(idRaw: string, releasedStatus: unknown) {
  if (typeof releasedStatus !== 'boolean') {
    return { status: false, message: 'Released status must be a boolean' }
  }

  const id = Number.parseInt(idRaw)
  const challenge = await Community21DaysChallengeM.findById(id)
  if (!challenge) {
    return { status: false, message: 'Challenge not found' }
  }
  if (!challenge.valid_status) {
    return { status: false, message: 'Cannot release before validating.' }
  }

  challenge.released_status = releasedStatus
  await challenge.save()

  return { status: true, message: 'Release status changed successfully' }
}
