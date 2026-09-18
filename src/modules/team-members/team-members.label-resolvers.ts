import { LabelResolver } from '../../common/change-request/change-request.diff'
import { buildEnumLabelResolver, buildSingleLabelResolver, resolveDateLabel } from '../../common/change-request/change-request.common-resolvers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const getProfessionalPositionsM = () => require('../../../models/app/static/professional_positionsM')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getManualUserPositionsM = () => require('../../../models/app/static/manual_user_positionsM')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getProfessionalsM = () => require('../../../models/app/professionalsM')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getProfessionalsManualRetrievalsM = () => require('../../../models/app/users/professionals_manual_retrievalsM')

const resolvePositionName = buildSingleLabelResolver(getProfessionalPositionsM, 'position_name')

/**
 * `user_row_id` resolves against ONE of two collections depending on the sibling
 * `user_account_type` (1 = a registered professional in `cln_professionals`, 2 = someone added
 * manually via `cln_professionals_manual_retrievals` - see team-members.queries.ts's own
 * user_info/manual_info lookup pair). Same "try the common case first, fall back" shape as
 * `resolveSubPositionName` below, since a `LabelResolver` only ever sees its own field's value.
 */
const resolveUserName: LabelResolver = async (value) => {
  const row_id = Number(value)
  if (!row_id) return null
  const registered = await getProfessionalsM().findById(row_id).select('full_name').lean()
  if (registered) return registered.full_name ?? null
  const manual = await getProfessionalsManualRetrievalsM().findById(row_id).select('full_name').lean()
  return manual?.full_name ?? null
}

/** Matches `company_type`'s own schema comment (professionals_work_experienceM.js) - 1: registered, 2: manual. The company itself never varies within one section's diff (`company_row_id` is this section's keyField, always the page's own company), so there's no separate id to resolve a name from here - just which kind of company record it is. */
const resolveCompanyTypeLabel = buildEnumLabelResolver({
  1: 'Registered Company',
  2: 'Manual Company',
})

/**
 * `positions` is a small array of `{position_type, position_row_id, sub_position_row_id}`
 * subdocuments (professionals_work_experienceM.js) - the same shape as the row's own top-level
 * position fields, just list-shaped for (future) multi-position support. Resolves each entry the
 * same dual-lookup way `resolveSubPositionName` does, joining into one readable line instead of
 * a raw JSON blob.
 */
const resolvePositionsList: LabelResolver = async (value) => {
  if (!Array.isArray(value) || value.length === 0) return null
  const labels = await Promise.all(
    value.map(async (entry) => {
      if (!entry || typeof entry !== 'object') return null
      const { position_row_id, sub_position_row_id } = entry as Record<string, unknown>
      const positionName = await resolvePositionName(position_row_id)
      const subPositionName = sub_position_row_id ? await resolveSubPositionName(sub_position_row_id, entry as Record<string, unknown>) : null
      return [positionName, subPositionName].filter(Boolean).join(' - ') || null
    }),
  )
  const resolved = labels.filter((label): label is string => Boolean(label))
  return resolved.length ? resolved.join(', ') : null
}

/**
 * Matches TeamDetails.tsx's own hardcoded `work_time_list` - a static form enum, never a DB
 * lookup collection.
 */
const resolveEmploymentTypeLabel = buildEnumLabelResolver({
  1: 'Full-Time',
  2: 'Part-Time',
  3: 'Internship',
  4: 'Freelancer',
  5: 'Trainee',
})

/** Matches TeamDetails.tsx's own hardcoded `designation_types` - a static enum, not `user_designationsM` (that model backs a different, unrelated feature). */
const resolveDesignationTypeLabel = buildEnumLabelResolver({
  1: 'Employee',
  2: 'Board Members',
  3: 'Advisor',
})

/** Matches TeamDetails.tsx's own hardcoded `location_types` - "Work Location Type" (On-site/Hybrid/Remote), a static enum, not a country id despite the generic-sounding field name. */
const resolveLocationTypeLabel = buildEnumLabelResolver({
  1: 'On-site',
  2: 'Hybrid',
  3: 'Remote',
})

/**
 * `sub_position_row_id` resolves against ONE of two collections depending on the sibling
 * `position_type` (1 = a predefined professional_positionsM sub-position, 2 = a custom one added
 * via addManualPosition into manual_user_positionsM) - see work-experience.service.ts's
 * validatePositions. `record` (threaded through by computeDiff, or passed manually by
 * resolvePositionsList for a `positions[]` entry) carries that sibling, checked first - same
 * "confirmed report" fix as Owned Products' resolveProductName, since the predefined and manual
 * collections are independent auto-increment id spaces and a custom sub-position's row id can
 * coincidentally also exist in the predefined one. Falls back to trying both, predefined first,
 * only when `position_type` isn't available.
 */
const resolveSubPositionName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null

  const positionType = Number(record?.position_type)
  if (positionType === 2) {
    const manual = await getManualUserPositionsM().findById(row_id).select('position_name').lean()
    return manual?.position_name ?? null
  }
  if (positionType === 1) {
    const predefined = await getProfessionalPositionsM().findById(row_id).select('position_name').lean()
    return predefined?.position_name ?? null
  }

  const predefined = await getProfessionalPositionsM().findById(row_id).select('position_name').lean()
  if (predefined) return predefined.position_name ?? null
  const manual = await getManualUserPositionsM().findById(row_id).select('position_name').lean()
  return manual?.position_name ?? null
}

export const TEAM_MEMBERS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  start_date: resolveDateLabel,
  verified_on: resolveDateLabel,
  employment_type: resolveEmploymentTypeLabel,
  designation_type: resolveDesignationTypeLabel,
  location_type: resolveLocationTypeLabel,
  position_row_id: resolvePositionName,
  sub_position_row_id: resolveSubPositionName,
  positions: resolvePositionsList,
  user_row_id: resolveUserName,
  company_type: resolveCompanyTypeLabel,
}

/** Human-readable names, matching TeamDetails.tsx's own form labels field-for-field. */
export const TEAM_MEMBERS_FIELD_LABELS: Record<string, string> = {
  user_row_id: 'Name',
  start_date: 'Joining Date',
  employment_type: 'Employment Type',
  location_type: 'Work Location Type',
  designation_type: 'Designation Type',
  positions: 'Position / Designation',
  responsibilities: 'Responsibilities',
}

/**
 * Only these fields have a corresponding input on TeamDetails.tsx's add/edit form - everything
 * else in TEAM_MEMBERS_EDITABLE_FIELDS (user_account_type, company_type, till_date_status,
 * verified_status, verified_on, public_view, and the singular position_type/position_row_id/
 * sub_position_row_id - a legacy mirror of `positions[0]` kept for older single-position readers)
 * is internal bookkeeping a non-developer reviewer can't interpret (confirmed report: "showing
 * user account type, user row ID, company type... is of no use, this is the work of
 * development"). They still ride along in the payload via editableFields so publish keeps
 * producing a valid row - they're just never shown to a reviewer.
 */
export const TEAM_MEMBERS_DISPLAY_FIELDS = [
  'user_row_id',
  'start_date',
  'employment_type',
  'location_type',
  'designation_type',
  'positions',
  'responsibilities',
] as const
