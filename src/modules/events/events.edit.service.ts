// modules/events/events.edit.service.ts
//
// Ports controllers/admin_panel/events/event.js's POST /edit_event (5636) plus its two same-file
// helpers update_contact_details (5998) and update_event_speakers (6046). Behavior preserved,
// including validation order and error messages.
//
// Note (not fixed, dead-code observation only): the legacy update_event_speakers has no
// fallback return when speakers_data.length === 0, but its only caller (the main handler) never
// invokes it unless speakers_data.length is truthy — so that branch was already unreachable in
// practice, not a live bug. Ported as a length-checked early return instead, same effective
// behavior.
const eventM = require('../../../models/app/events/eventM')
const professionalsM = require('../../../models/app/professionalsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const companyM = require('../../../models/app/company/companyM')
const event_default_imagesM = require('../../../models/app/static/event_default_imagesM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const event_contactsM = require('../../../models/app/events/event_contactsM')
const event_seo_detailsM = require('../../../models/app/events/event_seo_detailsM')
const seo_change_logsM = require('../../../models/seo_change_logsM')
import sanitize = require('mongo-sanitize')
import { checkAttendee } from '../../../utils/helpers/events_helper'
import { getIntIdFromArray, validateAndSaveImage, createDateTime } from '../../../utils/helpers/helper'
import { getUpdateTrackerFields } from '../../../utils/helpers/app_helper'
import { updateNotification } from '../../../utils/helpers/notification_helper'
import { invalidateEventEditCaches } from './events.cache'

interface SpeakerInput {
  user_row_id?: number
  user_type?: number
}
interface ContactInput {
  email_id?: string
  contact_number?: string
  country_id?: string | number
  contact_type?: string | number
  contact_reason?: string
}

async function updateContactDetails(eventRowId: number, contactDetails: ContactInput[]) {
  const validContactDetails: unknown[] = []
  if (contactDetails.length > 0) {
    for (const contact of contactDetails) {
      if (contact) {
        const emailId = contact.email_id ? contact.email_id.toLowerCase() : contact.email_id
        const checkQuery = await event_contactsM.findOne({ event_row_id: eventRowId, email_id: emailId, contact_number: contact.contact_number, country_id: contact.country_id, contact_type: contact.contact_type })
        if (!checkQuery) {
          const insertArray = {
            event_row_id: eventRowId,
            contact_number: contact.contact_number,
            email_id: emailId,
            country_id: Number.parseInt(String(contact.country_id)),
            contact_type: contact.contact_type,
            contact_reason: contact.contact_reason,
          }
          await event_contactsM(insertArray).save()
        } else if (checkQuery.contact_type == 16) {
          await event_contactsM.updateOne({ _id: checkQuery._id }, { $set: { contact_reason: contact.contact_reason } })
        }
      }
      const checkContactQuery = await event_contactsM.findOne({ event_row_id: sanitize(eventRowId), email_id: sanitize(contact.email_id), contact_number: sanitize(contact.contact_number), country_id: sanitize(contact.country_id), contact_type: sanitize(contact.contact_type) })
      validContactDetails.push(checkContactQuery._id)
    }
    if (validContactDetails.length > 0) {
      await event_contactsM.deleteMany({ event_row_id: eventRowId, _id: { $nin: validContactDetails } })
    }
  } else {
    await event_contactsM.deleteMany({ event_row_id: eventRowId })
  }
}

async function updateEventSpeakers(eventRowId: number, speakersData: SpeakerInput[], emailData: { approval_status: number }) {
  const speakerIds: unknown[] = []
  if (speakersData.length === 0) return []

  for (const speaker of speakersData) {
    if (speaker?.user_row_id && speaker?.user_type) {
      const checkQuery = await event_speakersM.findOne({ event_row_id: eventRowId, user_row_id: speaker.user_row_id, user_type: speaker.user_type }, { _id: 1 })
      let speakerId: unknown = 0
      if (!checkQuery) {
        const checkAttendeeResult = await checkAttendee(eventRowId, speaker.user_row_id, speaker.user_type)
        if (!checkAttendeeResult.status) {
          const insertQuery = await event_speakersM({ event_row_id: eventRowId, user_row_id: speaker.user_row_id, user_type: speaker.user_type }).save()
          speakerId = insertQuery._id
          if (emailData.approval_status == 1 && speaker.user_type == 1) {
            await updateNotification({ user_row_id: speaker.user_row_id, notify_type: 3, notify_type_row_id: eventRowId, message_row_id: 54, action_row_id: eventRowId, event_row_id: eventRowId, notify_image: undefined, notify_name: undefined, notify_id: undefined })
          }
        }
      } else {
        speakerId = checkQuery._id
      }
      speakerIds.push(speakerId)
    }
  }

  if (speakerIds.length) {
    await event_speakersM.deleteMany({ event_row_id: eventRowId, _id: { $nin: speakerIds } })
  }
  return []
}

export async function editEvent(
  body: Record<string, any>,
  checkAdminToken: { message: { admin_row_id: string | number; admin_manager_type: number | string; sub_admin_type: string | number } },
  errObj: Record<string, unknown> = {}
) {
  const adminRowId = Number.parseInt(String(checkAdminToken.message.admin_row_id))

  if (checkAdminToken.message.admin_manager_type != 1 && adminRowId && checkAdminToken.message.sub_admin_type != 3) {
    const checkEvent = await eventM.findOne({ _id: sanitize(body.event_row_id) })
    if (checkEvent?.created_by_sub_admin_id && adminRowId != checkEvent.created_by_sub_admin_id) {
      errObj['created_by_sub_admin_id'] = 'You do not have access to edit this event'
    }
    if ((Number.parseInt(String(checkAdminToken.message.sub_admin_type)) == 2 || Number.parseInt(String(checkAdminToken.message.sub_admin_type)) == 1) && checkEvent.created_by_admin_status != 2 && adminRowId != checkEvent.created_by_sub_admin_id) {
      errObj['created_by_sub_admin_id'] = 'You do not have access to edit this event'
    }
  }

  let speakersData: SpeakerInput[] = []
  if (body.speakers) {
    if (!Array.isArray(body.speakers)) {
      errObj['speakers'] = 'The speakers field contains only an array.'
    } else {
      speakersData = body.speakers
      for (const speaker of speakersData) {
        if (!speaker.user_row_id) {
          errObj['speakers'] = 'User row id field is required for speakers'
          break
        }
        if (!speaker.user_type) {
          errObj['speakers'] = 'User type field is required'
          break
        }
        if (speaker.user_type == 1) {
          const userActiveStatus = await professionalsM.findOne({ _id: sanitize(speaker.user_row_id), login_status: 1 }, { _id: 1 })
          if (!userActiveStatus) {
            errObj['speakers'] = 'Invalid speakers row id'
            break
          }
        } else if (speaker.user_type == 2) {
          const userActiveStatus = await professionals_manual_retrievalsM.findOne({ _id: sanitize(speaker.user_row_id) })
          if (!userActiveStatus) {
            errObj['speakers'] = 'Invalid speakers row id'
            break
          }
        } else {
          errObj['speakers'] = 'Invalid Speaker User type.'
          break
        }
      }
    }
  }

  if (body.contact_details) {
    if (!Array.isArray(body.contact_details)) {
      errObj['contact_details'] = 'The contact details field contains on an array'
    } else {
      for (const contact of body.contact_details as ContactInput[]) {
        if ((!contact.contact_number || contact.contact_number === '') && !contact.email_id) {
          errObj['contact_number'] = 'The contact number or email id field is required'
          break
        } else if (!contact.contact_type && !contact.contact_reason) {
          errObj['contact_reason'] = 'Select the contact reason or provide a reason for the contact'
          break
        }
        if (contact.contact_number && !contact.country_id) {
          errObj['country_id'] = 'Country ID field is required'
          break
        }
      }
    }
  }

  if (body.event_type) {
    if ([1, 3].includes(Number.parseInt(body.event_type)) && !body.event_venue) {
      errObj['event_venue'] = 'The Event Venue field is required.'
    }
    if ([2, 3].includes(Number.parseInt(body.event_type)) && body.webinar_meeting_type && !body.webinar_meeting_link) {
      errObj['webinar_meeting_link'] = 'The Meeting Link field is required.'
    }
  }

  const eventRowId = Number.parseInt(body.event_row_id)
  let userRowId = 0
  let companyRowId = 0
  if (body.event_list_id) {
    const eventListId = sanitize(body.event_list_id)
    const listEventType = Number.parseInt(body.list_event_type)
    if (listEventType == 1) {
      const checkUserQuery = await professionalsM.findOne({ user_name: eventListId, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
      if (!checkUserQuery) errObj['event_list_id'] = 'Invalid Username'
      else userRowId = checkUserQuery._id
    } else if (listEventType == 2) {
      const checkCompanyQuery = await companyM.findOne({ company_id: eventListId, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
      if (!checkCompanyQuery) errObj['event_list_id'] = 'Invalid Company ID'
      else {
        companyRowId = checkCompanyQuery._id
        userRowId = checkCompanyQuery.user_row_id ? checkCompanyQuery.user_row_id : 0
      }
    } else if (listEventType == 3) {
      const checkUserQuery = await professionalsM.findOne({ user_name: eventListId, login_status: 1, approval_status: 1 }, { _id: 1 })
      if (checkUserQuery) {
        userRowId = checkUserQuery._id
        const checkCompanyQuery2 = await companyM.findOne({ user_row_id: userRowId, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
        if (!checkCompanyQuery2) errObj['event_list_id'] = 'Invalid Company ID'
        else companyRowId = checkCompanyQuery2._id
      } else {
        errObj['event_list_id'] = 'Invalid Username'
      }
    }
  }

  let eventImage = ''
  if (Object.keys(errObj).length === 0) {
    if (!body.event_image_type) {
      if (body.event_image) {
        const validateNSaveImage = await validateAndSaveImage(body.event_image, 3)
        if (!validateNSaveImage.status) errObj['event_image'] = 'Sorry, Invalid event image.'
        else eventImage = validateNSaveImage.webp_file_name
      }
    } else {
      const imageQuery = await event_default_imagesM.findOne({ _id: Number.parseInt(body.event_image_type) }, { image_name: 1 })
      if (imageQuery) eventImage = imageQuery['image_name']
    }
  }

  const longitude = body.longitude && body.latitude ? body.longitude : ''
  const latitude = body.longitude && body.latitude ? body.latitude : ''

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: { alert_message: errObj } }
  }

  const checkEvent = await eventM.findOne({ _id: eventRowId }, { _id: 1, event_image: 1, event_image_type: 1, approval_status: 1 })
  if (!checkEvent) {
    return { status: false, message: { alert_message: 'Invalid request row Id' } }
  }

  const checkEventSeo = await event_seo_detailsM.findOne({ event_row_id: eventRowId }, { meta_keywords: 1, meta_description: 1, meta_title: 1, _id: 1 })

  const updateArr: Record<string, unknown> = {
    user_row_id: userRowId,
    company_row_id: companyRowId,
    event_title: body.event_title,
    webinar_meeting_type: body.webinar_meeting_type ? body.webinar_meeting_type : 0,
    webinar_meeting_link: body.webinar_meeting_link,
    event_tags: await getIntIdFromArray(body.event_tags),
    event_type: body.event_type,
    event_image_type: body.event_image_type ? Number.parseInt(body.event_image_type) : 0,
    event_city: body.event_city ? body.event_city : '',
    event_state: body.event_state ? body.event_state : '',
    event_venue: body.event_venue ? body.event_venue : '',
    event_link: body.event_link,
    start_date: createDateTime(body.start_date),
    end_date: createDateTime(body.end_date),
    event_description: body.event_description,
    contact_mobile_number: body.contact_mobile_number ? body.contact_mobile_number : '',
    contact_country_row_id: body.contact_country_row_id ? body.contact_country_row_id : '',
    contact_email_id: body.contact_email_id ? body.contact_email_id : '',
    longitude,
    latitude,
    utc_row_id: body.utc_row_id,
    ticket_link: body.ticket_link,
  }
  if (body.list_event_type) updateArr['list_event_type'] = body.list_event_type
  if (eventImage) updateArr['event_image'] = eventImage

  const updateSeoArr = { meta_keywords: body.meta_keywords, meta_description: body.meta_description, meta_title: body.meta_title }

  const updateFields = getUpdateTrackerFields(checkAdminToken)
  Object.assign(updateArr, updateFields, { updated_date_n_time: new Date() })

  await eventM.updateOne({ _id: eventRowId }, { $set: updateArr })
  await event_seo_detailsM.updateOne({ event_row_id: eventRowId }, { $set: updateSeoArr })

  const changed = body.meta_title !== checkEventSeo?.meta_title || body.meta_description !== checkEventSeo?.meta_description || body.meta_keywords !== checkEventSeo?.meta_keywords
  if (changed) {
    await seo_change_logsM.create({
      module_key: 'event',
      module_id: eventRowId,
      old_meta_title: checkEventSeo?.meta_title || '',
      new_meta_title: body.meta_title === checkEventSeo?.meta_title ? '' : body.meta_title,
      old_meta_description: checkEventSeo?.meta_description || '',
      new_meta_description: body.meta_description === checkEventSeo?.meta_description ? '' : body.meta_description,
      old_meta_keywords: checkEventSeo?.meta_keywords || '',
      new_meta_keywords: body.meta_keywords === checkEventSeo?.meta_keywords ? '' : body.meta_keywords,
      user_type: 'admin',
      updated_by: adminRowId,
    })
  }

  await invalidateEventEditCaches()

  if (speakersData.length) {
    await updateEventSpeakers(eventRowId, speakersData, { approval_status: checkEvent.approval_status })
  } else {
    await event_speakersM.deleteMany({ event_row_id: eventRowId })
  }

  if (body.contact_details) {
    await updateContactDetails(eventRowId, body.contact_details)
  }

  return { status: true, message: { alert_message: 'Event updated successfully' } }
}
