// modules/community-posts/community-posts.queries.ts
// Ports services/main/community/posts.ts's query logic, one function per sub-feature as each
// controllers/main/community/posts.js route gets migrated here
// (community-user-admin-unification-plan.md's "finish migrating the rest" step).
import CommunityPostsM from '../../../models/main/community/community_postsM'
import ProfessionalM from '../../../models/app/professionalsM'
import { ProfessionalProfileImagesM } from '../professionals-profile-images/professionals-profile-images.models'
import { CommunityGroupsM } from '../community-admin/community-admin.models'

export const LEADERBOARD_LIMIT = 8

/** Ports getLeaderboard's post-count-per-user aggregate (~line 362-371) verbatim. */
export async function getLeaderboardRanking(): Promise<{ _id: number; total_posts: number }[]> {
  return CommunityPostsM.aggregate([
    { $match: { post_status: true } },
    { $group: { _id: '$user_row_id', total_posts: { $sum: 1 } } },
    { $sort: { total_posts: -1, _id: 1 } },
  ])
}

const LEADERBOARD_USER_PROJECTION = { full_name: 1, pro_batch: 1, user_name: 1, login_status: 1, approval_status: 1 }

export async function findLeaderboardUsers(userIds: number[]) {
  return ProfessionalM.find({ _id: { $in: userIds } }, LEADERBOARD_USER_PROJECTION)
}

export async function findLeaderboardProfileImages(userIds: number[]) {
  return ProfessionalProfileImagesM.find({ user_row_id: { $in: userIds } }, { user_row_id: 1, profile_image: 1 })
}

export async function findLeaderboardUser(userRowId: number) {
  return ProfessionalM.findOne({ _id: userRowId }, LEADERBOARD_USER_PROJECTION)
}

export async function findLeaderboardProfileImage(userRowId: number) {
  return ProfessionalProfileImagesM.findOne({ user_row_id: userRowId }, { profile_image: 1 })
}

/** Ports POST /add_details's group-existence check (~line 51-54) verbatim. */
export async function findGroupById(groupId: number | string) {
  return CommunityGroupsM.findOne({ _id: groupId })
}

/** Ports POST /add_repost_details's lookups (~line 123-128) verbatim. */
export async function findPostById(postId: number | string) {
  return CommunityPostsM.findOne({ _id: postId })
}

export async function findExistingRepost(postId: number | string, userRowId: number) {
  return CommunityPostsM.findOne({ repost_id: postId, repost_user_row_id: userRowId })
}
