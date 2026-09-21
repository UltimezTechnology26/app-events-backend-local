// modules/community-admin/community-admin.groups.service.ts
//
// Ports groups.js's Manage Community (Groups) CRUD routes (add_n_update_details/group_list/
// delete_group, ~line 1-137) verbatim, including the confirmed dual-counter bug documented in
// community-admin.models.ts.
import { CommunityGroupsM } from './community-admin.models'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for these helpers (see academy-admin.courses.service.ts)
const { getPresentDateTime, validateAndSaveImage } = require('../../../utils/helpers/helper')
const { getCollectionID } = require('../../../utils/helpers/database_helper')
import { SaveGroupInput } from './community-admin.groups.types'

export async function saveGroup(input: SaveGroupInput) {
  const errObj: Record<string, string> = {}

  let icon = ''
  if (Object.keys(errObj).length === 0 && input.icon) {
    const validated = await validateAndSaveImage(input.icon, 10)
    if (!validated.status) {
      errObj.icon = 'Sorry, Invalid group icon image.'
    } else {
      icon = validated.webp_file_name
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const saveObject: Record<string, unknown> = { name: input.name, hashtag: input.hashtag, icon }

  if (input.groupIdRaw) {
    const groupId = Number.parseInt(input.groupIdRaw)
    const group = await CommunityGroupsM.findOne({ _id: groupId })
    if (!group) {
      return { status: false, message: { alert_message: 'Group not found for update.' } }
    }

    if (!icon) delete saveObject.icon
    await CommunityGroupsM.updateOne({ _id: groupId }, { $set: saveObject })
    return { status: true, message: { alert_message: 'Group updated successfully.' } }
  }

  const _id = await getCollectionID('cln_community_groups')
  saveObject._id = _id
  saveObject.date = getPresentDateTime()

  const existingGroup = await CommunityGroupsM.findOne({ hashtag: input.hashtag })
  if (existingGroup) {
    return { status: false, message: { alert_message: 'Group already exists.' } }
  }

  await new CommunityGroupsM(saveObject).save()
  return { status: true, message: { alert_message: 'Group created successfully.' } }
}

export async function getGroupList() {
  const groups = await CommunityGroupsM.find({}, { _id: 1, name: 1, hashtag: 1, icon: 1, date: 1 }).sort({ _id: 1 })
  return { status: true, message: groups }
}

export async function deleteGroup(groupIdRaw: string) {
  const groupId = Number.parseFloat(groupIdRaw)
  if (Number.isNaN(groupId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Group ID.' } }
  }

  const existingGroup = await CommunityGroupsM.findOne({ _id: groupId })
  if (!existingGroup) {
    return { status: false, message: { alert_message: 'Group not found.' } }
  }

  await CommunityGroupsM.deleteOne({ _id: groupId })
  return { status: true, message: { alert_message: 'Group deleted successfully.' } }
}
