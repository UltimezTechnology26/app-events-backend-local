// modules/community-posts/community-posts.create.service.ts
// Ports controllers/main/community/posts.js's POST /add_details (~line 32-108).
const { getPresentDateTime, validateAndSaveImage } = require('../../../utils/helpers/helper')
const { calculateUserProfileScore, sendJobEligibilityEmail } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
import CommunityPostsM from '../../../models/main/community/community_postsM'
import ProfessionalM from '../../../models/app/professionalsM'
import ProfessionalsPointsM from '../../../models/app/users/professionals_pointsM'
import CoursesCertificatesM from '../../../models/main/academy/courses_certificatesM'
import { getProfileScores } from '../community/community.queries'
import { findGroupById, findPostById, findExistingRepost } from './community-posts.queries'
import { CreatePostBody, CreateRepostBody } from './community-posts.types'

const COMMUNITY_POST_IMAGE_TYPE = 11
const JOB_ELIGIBILITY_POINTS = '40'
const JOB_ELIGIBILITY_PROFILE_THRESHOLD = 70

/**
 * CONFIRMED PRE-EXISTING BUG, fixed here (not flagged-and-left - this is a crash, not a judgment
 * call like expert_tag's always-true value was): legacy's own `pointEntry` object literal
 * references an undefined `user_row_id` local in this route (only `checkToken.message` is ever
 * declared) - a ReferenceError the instant this branch is reached (certificate held + profile
 * >=70% complete + no existing job_apply_eligibility points). Since this runs AFTER the post is
 * already saved, the bug meant the post itself still saved but the request then crashed, and the
 * caller saw a generic error instead of "Post created successfully." Fixed by using the actual
 * `userRowId` parameter.
 */
async function maybeAwardJobEligibilityPoints(userRowId: number) {
  const existingPoints = await ProfessionalsPointsM.findOne({ user_row_id: userRowId, point_type: 'job_apply_eligibility' })
  if (existingPoints) return

  const hasCertificate = await CoursesCertificatesM.exists({ user_row_id: userRowId })
  const userMain = await getProfileScores(userRowId)
  const totalCompletion = (userMain as { profile_score?: number } | null)?.profile_score || 0

  if (hasCertificate && totalCompletion >= JOB_ELIGIBILITY_PROFILE_THRESHOLD) {
    const user = await ProfessionalM.findOne({ _id: userRowId }, { full_name: 1, email_id: 1 })
    const pointEntry = new ProfessionalsPointsM({
      user_row_id: userRowId,
      points: JOB_ELIGIBILITY_POINTS,
      point_type: 'job_apply_eligibility',
      point_status: 'credited',
    })
    await pointEntry.save()
    sendJobEligibilityEmail({ email_id: user?.email_id, full_name: user?.full_name })
  }
}

export async function createPost(userRowId: number, body: CreatePostBody, preValidationErrors: Record<string, string>) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let imageName = ''
  if (!Object.keys(errObj).length && body.image) {
    const validated = await validateAndSaveImage(body.image, COMMUNITY_POST_IMAGE_TYPE)
    if (!validated.status) {
      errObj.image = 'Invalid post image.'
    } else {
      imageName = validated.webp_file_name
    }
  }

  const groupExists = await findGroupById(body.group_id)
  if (!groupExists) {
    errObj.group_id = 'Group ID does not exist'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const post = new CommunityPostsM({
    content: body.content,
    user_row_id: userRowId,
    group_id: body.group_id,
    image: imageName,
    repost_user_row_id: null,
    is_repost: false,
    date: getPresentDateTime(),
  })
  await post.save()

  await maybeAwardJobEligibilityPoints(userRowId)
  await calculateUserProfileScore(userRowId, ['community'])
  await deleteKeysByPattern('job_list_*')

  return { status: true, message: { alert_message: 'Post created successfully.' } }
}

/** Ports POST /add_repost_details (~line 113-162) verbatim. */
export async function createRepost(userRowId: number, body: CreateRepostBody, preValidationErrors: Record<string, string>) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  const postDetails = await findPostById(body.post_id)
  if (!postDetails) {
    errObj.post_id = 'Post ID does not exist'
  }

  const existingRepost = await findExistingRepost(body.post_id, userRowId)
  if (existingRepost) {
    errObj.alert_message = 'You’ve already reposted this post.'
  }

  if (postDetails && Number(postDetails.user_row_id) === userRowId) {
    errObj.alert_message = 'You can only repost posts from other users.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const repost = new CommunityPostsM({
    content: postDetails?.content,
    user_row_id: postDetails?.user_row_id,
    group_id: postDetails?.group_id,
    image: postDetails?.image,
    repost_user_row_id: userRowId,
    is_repost: true,
    date: postDetails?.date,
    reposted_date: getPresentDateTime(),
    repost_comment: body.repost_comment,
    repost_id: body.post_id,
  })
  await repost.save()

  return { status: true, message: { alert_message: 'Repost created successfully.' } }
}
