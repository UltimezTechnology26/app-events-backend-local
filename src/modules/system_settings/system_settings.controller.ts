// modules/system_settings/system_settings.controller.ts
//
// Single router (`systemSettingsRouter`) carrying ALL 5 system-settings
// categories per the user's explicit decision not to split this module by
// subfeature. Each category's own routes live in
// `system_settings.<category>.controller.ts` (mirroring the
// `modules/company/company.categories.*` / `company.regulatory_details.*`
// precedent of one module folder holding multiple resource-scoped file
// groups) and are mounted here with no extra path prefix, so the external
// URL surface is byte-for-byte identical to before this split. Auth gating
// is applied ONCE here — none of the sub-routers re-apply it.
import express, { Router } from 'express'
const { requireAdminAccess } = require('../../../middleware/authorization')
import { experienceLevelRouter } from './system_settings.experience_level.controller'
import { reportIssuesOptionsRouter } from './system_settings.report_issues_options.controller'
import { eventTagsRouter } from './system_settings.event_tags.controller'
import { areaOfInterestsRouter } from './system_settings.area_of_interests.controller'
import { userExpertiseRouter } from './system_settings.user_expertise.controller'

export const systemSettingsRouter: Router = express.Router()
systemSettingsRouter.use(requireAdminAccess([0]))

systemSettingsRouter.use(experienceLevelRouter)
systemSettingsRouter.use(reportIssuesOptionsRouter)
systemSettingsRouter.use(eventTagsRouter)
systemSettingsRouter.use(areaOfInterestsRouter)
systemSettingsRouter.use(userExpertiseRouter)
