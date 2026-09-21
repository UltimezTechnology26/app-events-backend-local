import { LabelResolver } from '../../modules/change-request/change-request.diff'
import {
  TEAM_MEMBERS_LABEL_RESOLVERS,
  TEAM_MEMBERS_FIELD_LABELS,
  TEAM_MEMBERS_DISPLAY_FIELDS,
} from '../team-members/team-members.label-resolvers'

/**
 * `professional_details` shares `cln_professionals_work_experiences` with Team Members
 * (change-request.registry.ts's SECTION_TEAM_MEMBERS), but is scoped by `user_row_id`
 * (a professional's own work-history rows) instead of `company_row_id` (a company's roster) -
 * see the plan's own "no cross-contamination" confirmation, since every row carries both fields
 * independently. That flips which id is the section's keyField (auto-set from root_document_id,
 * never shown to a reviewer) and which is a real editable/resolvable field: here `company_row_id`
 * needs a name resolver Team Members never needed (it doesn't resolve its own keyField), while
 * `user_row_id` (Team Members' own resolved field) is this section's keyField instead.
 */
const resolveWorkExperienceCompanyName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null
  const companyType = Number(record?.company_type)
  /* eslint-disable @typescript-eslint/no-var-requires */
  if (companyType === 2) {
    const manual = await require('../../../models/app/company/company_manual_retrievalsM').findById(row_id).select('company_name').lean()
    return manual?.company_name ?? null
  }
  const registered = await require('../../../models/app/company/companyM').findById(row_id).select('company_name').lean()
  if (registered) return registered.company_name ?? null
  const manual = await require('../../../models/app/company/company_manual_retrievalsM').findById(row_id).select('company_name').lean()
  return manual?.company_name ?? null
  /* eslint-enable @typescript-eslint/no-var-requires */
}

export const PROFESSIONAL_DETAILS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  ...TEAM_MEMBERS_LABEL_RESOLVERS,
  company_row_id: resolveWorkExperienceCompanyName,
}

export const PROFESSIONAL_DETAILS_FIELD_LABELS: Record<string, string> = {
  ...TEAM_MEMBERS_FIELD_LABELS,
  company_row_id: 'Company',
}

export const PROFESSIONAL_DETAILS_DISPLAY_FIELDS = [
  'company_row_id',
  ...TEAM_MEMBERS_DISPLAY_FIELDS,
] as const
