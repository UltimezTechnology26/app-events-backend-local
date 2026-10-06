// modules/community/community.groups.service.ts
//
// Shared group list, used identically by both the Community admin panel and the public post
// composer's group picker (see community-user-admin-unification-plan.md, step 1) - same query
// both legacy `admin_panel/community/groups.js`'s GET /group_list and legacy `main/community/
// posts.js`'s GET /group_list already ran, confirmed byte-for-byte identical. No user_type
// branching needed: every caller (admin or self-service user) sees the identical list.
import { CommunityGroupsM } from '../community-admin/community-admin.models'

export async function getGroupList() {
  const groups = await CommunityGroupsM.find({}, { _id: 1, name: 1, hashtag: 1, icon: 1, date: 1 }).sort({ _id: 1 })
  return { status: true, message: groups }
}
