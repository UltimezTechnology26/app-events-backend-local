import { LabelResolver } from '../../common/change-request/change-request.diff'
import { buildArrayLabelResolver, buildSingleLabelResolver, resolveCountryName, resolveDateLabel } from '../../common/change-request/change-request.common-resolvers'

export const JOBS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  country_id: resolveCountryName,
  application_deadline: resolveDateLabel,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  highest_education: buildSingleLabelResolver(() => require('../../../models/app/jobs/job_education_typeM'), 'education_type'),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  key_skills: buildArrayLabelResolver(() => require('../../../models/app/jobs/job_skillM'), 'skill_name'),
}
