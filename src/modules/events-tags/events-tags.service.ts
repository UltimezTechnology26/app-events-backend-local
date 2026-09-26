// modules/events-tags/events-tags.service.ts
const event_tagsM = require('../../../models/app/static/event_tagsM')
const event_default_imagesM = require('../../../models/app/static/event_default_imagesM')
const eventM = require('../../../models/app/events/eventM')
const companyM = require('../../../models/app/company/companyM')
const professionalsM = require('../../../models/app/professionalsM')
import { checkUserLoginToken } from '../../../middleware/authorization'
import { buildPreviousEventPipeline, buildCompanySnapshotPipeline, buildUserSnapshotPipeline } from './events-tags.queries'

export async function getEventsTags(headers: Record<string, unknown>) {
  const queries: Promise<unknown>[] = [
    event_tagsM.find({ active_status: true }, { _id: 1, event_tag: 1, active_status: 1 }).sort({ event_tag: 1 }),
    event_default_imagesM.find({ image_type: 1 }),
    event_default_imagesM.find({ image_type: 2 }),
    event_default_imagesM.find({ image_type: 3 }),
  ]

  const checkUserToken = checkUserLoginToken(headers as any)
  let hasUserContext = false
  if (checkUserToken.status) {
    hasUserContext = true
    const userRowId = checkUserToken.message
    queries.push(eventM.aggregate(buildPreviousEventPipeline(userRowId)).limit(1))
    queries.push(companyM.aggregate(buildCompanySnapshotPipeline(userRowId)).limit(1))
    queries.push(professionalsM.aggregate(buildUserSnapshotPipeline(userRowId)).limit(1))
  }

  const results = await Promise.all(queries)
  const [eventTags, picks, gradient, color, previousEvent, companyData, userData] = results as any[]

  return {
    status: true,
    message: {
      tags: eventTags,
      previous_event: hasUserContext && previousEvent?.[0] ? previousEvent[0] : '',
      default_images: { picks, gradient, color },
      company_data: hasUserContext && companyData?.[0] ? companyData[0] : '',
      user_data: hasUserContext && userData?.[0] ? userData[0] : '',
    },
  }
}
