// Overall sub-admin type guide (top "Sub Admin Type" panel on Manager Roles):
// read the saved guide, or regenerate it from every module's saved
// Restricted / Full Access text (see sub_admin_access_type.service.ts).
const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const sub_admin_access_typeM = require('../../../models/admin_panel/app/sub_admin_access_typeM')
const sub_admin_type_guideM = require('../../../models/admin_panel/app/sub_admin_type_guideM')

import { generateJson } from './sub_admin.gemini'
import { buildTypeGuidePrompt, type ModuleTypeText } from './sub_admin_type_guide.prompt'
import { SUB_ADMIN_TYPE } from './sub_admin.types'
import type { ServiceResponse } from './sub_admin.types'

interface TypeGuideText {
  summary: string
  tagline: string
  best_for: string
  can: string[]
  cannot: string[]
}

interface GeneratedTypeGuide {
  restricted: TypeGuideText
  full: TypeGuideText
}

interface AccessTypeRow {
  restricted_access?: string[]
  full_access?: string[]
}

export async function getTypeGuide(): Promise<ServiceResponse> {
  const guide = await sub_admin_type_guideM.find({}, { _id: 1, summary: 1, tagline: 1, best_for: 1, can: 1, cannot: 1, updated_date_n_time: 1 })
  return { status: true, message: guide }
}

function saveGuide(subAdminType: number, text: TypeGuideText) {
  return sub_admin_type_guideM.updateOne(
    { _id: subAdminType },
    {
      $set: {
        summary: sanitize(text.summary),
        tagline: sanitize(text.tagline),
        best_for: sanitize(text.best_for),
        can: sanitize(text.can),
        cannot: sanitize(text.cannot),
        updated_date_n_time: getPresentDateTime(),
      },
    },
    { upsert: true },
  )
}

export async function refreshTypeGuide(): Promise<ServiceResponse> {
  const accessTypes: AccessTypeRow[] = await sub_admin_access_typeM.find(
    { type_status: 1 },
    { restricted_access: 1, full_access: 1 },
  )
  // Only modules whose card has been refreshed have Restricted / Full text to summarise.
  const modules: ModuleTypeText[] = accessTypes
    .filter((row) => row.restricted_access?.length && row.full_access?.length)
    .map((row) => ({ restricted_access: row.restricted_access ?? [], full_access: row.full_access ?? [] }))

  if (modules.length === 0) {
    return { status: false, message: { alert_message: 'Refresh at least one module card first - there is no module text to summarise yet.' } }
  }

  const guide = await generateJson<GeneratedTypeGuide>(buildTypeGuidePrompt(modules))
  await Promise.all([
    saveGuide(SUB_ADMIN_TYPE.MARKETING_RESTRICTED, guide.restricted),
    saveGuide(SUB_ADMIN_TYPE.MARKETING_FULL, guide.full),
  ])

  return { status: true, message: { alert_message: 'Sub admin type guide refreshed.', modules_used: modules.length } }
}
