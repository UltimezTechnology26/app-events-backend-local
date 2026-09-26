// modules/events/events.submit.service.ts
//
// Ports controllers/app/events/events_listed.js's POST /submit_event (1652-2315) plus its
// same-file helper sub_admin_email (2317). Dual-purpose create/update endpoint: used by the
// self-service app AND by the admin panel's "Create New" page (admin-coinpedia's
// pages/api/events-manage/manage/add_event.js proxies to this exact upstream route) — gated by
// checkAllLoginToken, not checkAdminLoginToken, so it's mounted on a separate router
// (events.app.controller.ts) without the admin-only guard.
//
// Behavior preserved: same validation, same create-vs-update branching (by event_row_id
// presence), same SEO auto-fill rules (conditional on update, unconditional on create), same
// notification/email side effects.
//
// Minor confirmed fix (not a behavior change to the response): the self-service branch fetched
// the same professionalsM document twice with two different field projections
// (get_invite_id: {user_name:1}, event_host_query: {_id:1,full_name:1,email_id:1}) — merged into
// one query with the union of both projections, since both reads use the same _id and neither
// result is mutated before the other is read.
const eventM = require('../../../models/app/events/eventM')
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const event_default_imagesM = require('../../../models/app/static/event_default_imagesM')
const event_seo_detailsM = require('../../../models/app/events/event_seo_detailsM')
const event_tagsM = require('../../../models/app/static/event_tagsM')
const event_utc_datesM = require('../../../models/app/events/event_utc_datesM')
const sub_admin_emailsM = require('../../../models/admin_panel/app/sub_admin_emailsM')
const seo_change_logsM = require('../../../models/seo_change_logsM')
const agenda = require('../../../config/agenda')
import sanitize = require('mongo-sanitize')
import { checkSubadminAccess, DateFormatter } from '../../../utils/helpers/events_helper'
import { getIntIdFromArray, validateAndSaveImage, createDateTime, removeHtmltag, getPresentDateTime } from '../../../utils/helpers/helper'
import { calculateEventScore } from '../../../utils/helpers/app_helper'
import { updateNotification, updateThreadNotification } from '../../../utils/helpers/notification_helper'
const { sendEventsEmail, sendEmail } = require('../../../config/email')
import { invalidateEventSubmitCaches } from './events.cache'
import { recordEventStatusChange } from './events.audit'
import type { UpdateTracker } from '../../common/status-audit/status-audit.types'

interface CheckUserToken {
  message: { user_type: number; user_row_id: number }
  token_message?: { admin_row_id?: number; admin_manager_type?: number; sub_admin_type?: number }
}

async function sendSubAdminApprovalEmails(subadminData: { full_name: string; email_id: string }[], emailData: Record<string, unknown>) {
  for (const subadmin of subadminData) {
    const subject = ' Event Approval Request '
    const message = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear  ${subadmin.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">A new event has been created by <span style="text-transform: capitalize;font-weight: 500;">${emailData.name}</span> on your platform, and we kindly request your review and approval for this event.Upon approval, the user can engage in various activities such as inviting speakers, managing attendees, and increasing their audience’s registration.</p>
            <p style="color:#000;font-weight: 400;font-size:17px; text-decoration:underline"><b>Event Details</b> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Event Name : </b>${emailData.event_title}</p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Host / Event Organizer / Company name : </b> <span style="text-transform: capitalize;">${emailData.host_name}</span> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"> <b>Event / Website Link : </b><span style="color:#0029ff;">${emailData.event_link}</span> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"> <b>Event Date : </b>${emailData.start_date}  ${emailData.utc_time ? `(UTC${emailData.utc_time})` : ''}</p>
            ${emailData.event_venue ? `<p style="color:#000;font-weight: 400;font-size:17px;"><b>Event Location : </b>${emailData.event_venue}</p>` : ''}
            `
    await sendEmail(subadmin.email_id, subject, message)
  }
}

export async function submitEvent(body: Record<string, any>, checkUserToken: CheckUserToken, errObj: Record<string, unknown> = {}) {
  let userRowId = 0
  let companyRowId = 0
  let eventRowId = Number.parseInt(body?.event_row_id || 0)
  let adminManagerType = 0
  let adminRowId = 0
  let activeStatus = 1
  let approvalStatus = 0
  let dateNTime = getPresentDateTime()
  let defaultKeywords = ''

  if (checkUserToken.message.user_type == 1) {
    adminManagerType = 0
    userRowId = checkUserToken.message.user_row_id
    // CONFIRMED FIX: merged with the event_host_query fetch below (same _id, same document) —
    // the legacy code issued two separate findOne calls for this doc.
    const checkUserQuery = await professionalsM.findOne({ _id: userRowId, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
    if (checkUserQuery) {
      defaultKeywords = checkUserQuery.full_name
    }
    if (Number.parseInt(body.event_row_id)) {
      const checkEvent = await eventM.findOne({ _id: eventRowId, user_row_id: userRowId })
      if (!checkEvent) {
        errObj['event_row_id'] = 'Invalid Event Row ID.'
      } else {
        activeStatus = checkEvent.active_status
        approvalStatus = checkEvent.approval_status
      }
    }

    if (Number.parseInt(body.list_event_type) >= 2) {
      const companyQuery = await companyM.findOne({ user_row_id: userRowId, approval_status: 1, active_status: 1 }, { _id: 1, company_name: 1 })
      if (!companyQuery) {
        errObj['list_event_type'] = "Sorry, Your not listed company or your company in pending approval."
      } else {
        if (Number.parseInt(body.list_event_type) == 2) {
          defaultKeywords = companyQuery.company_name
        } else {
          defaultKeywords += ', ' + companyQuery.company_name
        }
        companyRowId = companyQuery['_id']
      }
    }
  } else {
    const tokenMessage = checkUserToken.token_message
    if (tokenMessage?.admin_row_id) {
      adminManagerType = tokenMessage.admin_manager_type as number
      adminRowId = tokenMessage.admin_row_id
      if (Number.parseInt(body.event_row_id)) {
        const checkAccess = await checkSubadminAccess({
          admin_row_id: adminRowId,
          admin_manager_type: adminManagerType,
          sub_admin_type: Number.parseInt(String(tokenMessage.sub_admin_type)),
          event_row_id: eventRowId,
        })
        if (!checkAccess.status) {
          errObj['alert_message'] = checkAccess.message
        }
      }

      if (body.event_list_id) {
        const eventListId = sanitize(body.event_list_id)
        const listEventType = Number.parseInt(body.list_event_type)
        if (listEventType == 1) {
          const checkUserQuery = await professionalsM.findOne({ user_name: eventListId, login_status: 1, approval_status: 1 }, { _id: 1, full_name: 1 })
          if (!checkUserQuery) errObj['event_list_id'] = 'Invalid Username'
          else {
            defaultKeywords = checkUserQuery.full_name
            userRowId = checkUserQuery._id
          }
        } else if (listEventType == 2) {
          const checkCompanyQuery = await companyM.findOne({ company_id: eventListId, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1, company_name: 1 })
          if (!checkCompanyQuery) errObj['event_list_id'] = 'Invalid Company ID'
          else {
            defaultKeywords = checkCompanyQuery.company_name
            companyRowId = checkCompanyQuery._id
            userRowId = checkCompanyQuery.user_row_id ? checkCompanyQuery.user_row_id : 0
          }
        } else if (listEventType == 3) {
          const checkUserQuery = await professionalsM.findOne({ user_name: eventListId, login_status: 1 }, { _id: 1, full_name: 1 })
          if (checkUserQuery) {
            userRowId = checkUserQuery._id
            defaultKeywords = checkUserQuery.full_name
            const checkCompanyQuery2 = await companyM.findOne({ user_row_id: userRowId, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1, company_name: 1 })
            if (!checkCompanyQuery2) errObj['event_list_id'] = 'Invalid Company ID'
            else {
              defaultKeywords += ', ' + checkCompanyQuery2.company_name
              companyRowId = checkCompanyQuery2._id
            }
          } else {
            errObj['event_list_id'] = 'Invalid Username'
          }
        }
      } else {
        errObj['event_list_id'] = 'Event list ID field is required.'
      }
    }
  }

  if (eventRowId) {
    const getEventDate = await eventM.findOne({ _id: eventRowId }, { created_date_n_time: 1, created_by_admin_status: 1, created_by_sub_admin_id: 1 })
    if (getEventDate) {
      dateNTime = getEventDate.created_date_n_time
      adminManagerType = getEventDate.created_by_admin_status
      adminRowId = getEventDate.created_by_sub_admin_id
    }
  }

  let eventHostQuery: { _id: number; full_name: string; email_id: string; user_name?: string } | null = null
  if (userRowId) {
    eventHostQuery = await professionalsM.findOne({ _id: userRowId }, { _id: 1, full_name: 1, email_id: 1, user_name: 1 })
    if (!eventHostQuery) {
      errObj['alert_message'] = 'Please request admin to approve your user account.'
    }
  }

  if (body.event_type) {
    const checkSeminarArray = [1, 3, 4, 5, 6, 7, 8]
    if (checkSeminarArray.includes(Number.parseInt(body.event_type)) && !body.event_venue) {
      errObj['event_venue'] = 'The Event Venue field is required.'
    }
    const checkWebinarArray = [2, 3, 6, 7]
    if (checkWebinarArray.includes(Number.parseInt(body.event_type)) && body.webinar_meeting_type && !body.webinar_meeting_link) {
      errObj['webinar_meeting_link'] = 'The Meeting Link field is required.'
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
      const imageQuery = await event_default_imagesM.findOne({ _id: Number.parseInt(sanitize(body.event_image_type)) }, { image_name: 1 })
      if (imageQuery) eventImage = imageQuery['image_name']
    }
  }

  const longitude = body.longitude && body.latitude ? body.longitude : ''
  const latitude = body.longitude && body.latitude ? body.latitude : ''

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const insertArr: Record<string, unknown> = {
    user_row_id: userRowId,
    company_row_id: companyRowId,
    event_title: sanitize(body.event_title),
    event_tags: await getIntIdFromArray(body.event_tags),
    event_image_type: body.event_image_type ? Number.parseInt(body.event_image_type) : 0,
    event_type: Number.parseInt(body.event_type),
    alt_image_text: sanitize(body.alt_image_text),
    event_image: eventImage,
    list_event_type: Number.parseInt(body.list_event_type),
    event_venue: body.event_venue ? sanitize(body.event_venue) : '',
    event_city: body.event_city ? sanitize(body.event_city) : '',
    event_state: body.event_state ? sanitize(body.event_state) : '',
    webinar_meeting_link: body.webinar_meeting_link ? sanitize(body.webinar_meeting_link) : '',
    webinar_meeting_type: body.webinar_meeting_type ? sanitize(body.webinar_meeting_type) : 0,
    event_link: sanitize(body.event_link),
    start_date: createDateTime(body.start_date),
    end_date: createDateTime(body.end_date),
    event_description: sanitize(body.event_description),
    ticket_link: sanitize(body.ticket_link),
    contact_country_row_id: body.contact_country_row_id ? Number.parseInt(body.contact_country_row_id) : 0,
    longitude,
    latitude,
    utc_row_id: Number.parseInt(body.utc_row_id),
  }

  const eventTags = await event_tagsM.find({ _id: { $in: insertArr.event_tags } }, { _id: 1, event_tag: 1 })
  const eventTagNames = eventTags.map((t: { event_tag?: string }) => t.event_tag).filter(Boolean)
  if (eventTagNames.length > 0) {
    defaultKeywords += ', ' + eventTagNames.join(', ')
  }

  const hasChangedFromOld = (oldVal: unknown, newVal: unknown) => String(newVal ?? '').trim() !== '' && String(oldVal ?? '').trim() !== String(newVal ?? '').trim()

  if (eventRowId) {
    // ---- UPDATE PATH ----
    const eventData = await eventM.findOne({ _id: eventRowId }, { event_url: 1, approval_status: 1 })
    const seoData = await event_seo_detailsM.findOne(
      { event_row_id: eventRowId },
      { meta_keywords: 1, meta_description: 1, meta_title: 1, robots_index: 1, robots_follow: 1, og_title: 1, og_description: 1, twitter_title: 1, twitter_description: 1, twitter_creator: 1 }
    )
    const combinedData = { ...eventData?.toObject(), ...seoData?.toObject() }

    if (insertArr.event_description) {
      if (!combinedData?.meta_description) {
        const cleanedBio = removeHtmltag(insertArr.event_description as string).slice(0, 160)
        insertArr.meta_description = cleanedBio
        insertArr.og_description = cleanedBio
        insertArr.twitter_description = cleanedBio
      } else if (!combinedData.og_description) {
        insertArr.og_description = combinedData?.meta_description
        insertArr.twitter_description = combinedData?.meta_description
      }
    }
    if (insertArr.event_title) {
      const title = insertArr.event_title
      if (!combinedData?.meta_title) {
        insertArr.meta_title = title
        insertArr.og_title = title
        insertArr.twitter_title = title
      } else if (!combinedData.og_title) {
        insertArr.og_title = combinedData?.meta_title
        insertArr.twitter_title = combinedData?.meta_title
      }
      if (!combinedData?.meta_keywords) {
        insertArr.meta_keywords = defaultKeywords
      }
    }

    const seoFields = {
      meta_keywords: insertArr.meta_keywords,
      meta_description: insertArr.meta_description,
      meta_title: insertArr.meta_title,
      robots_index: insertArr.robots_index,
      robots_follow: insertArr.robots_follow,
      og_title: insertArr.og_title,
      og_description: insertArr.og_description,
      twitter_title: insertArr.twitter_title,
      twitter_description: insertArr.twitter_description,
      twitter_creator: insertArr.twitter_creator,
      header_structure: insertArr.header_structure,
    }

    const eventUpdateData = { ...insertArr }
    for (const key of ['meta_keywords', 'meta_description', 'meta_title', 'robots_index', 'robots_follow', 'og_title', 'og_description', 'twitter_title', 'twitter_description', 'twitter_creator', 'header_structure', 'created_date_n_time']) {
      delete eventUpdateData[key]
    }

    await eventM.updateOne({ _id: eventRowId }, { $set: eventUpdateData })
    await event_seo_detailsM.updateOne({ event_row_id: eventRowId }, { $set: seoFields }, { upsert: true })
    await invalidateEventSubmitCaches()

    const changed =
      hasChangedFromOld(combinedData?.meta_title, insertArr.meta_title) ||
      hasChangedFromOld(combinedData?.meta_description, insertArr.meta_description) ||
      hasChangedFromOld(combinedData?.meta_keywords, insertArr.meta_keywords) ||
      hasChangedFromOld(combinedData?.og_title, insertArr.og_title) ||
      hasChangedFromOld(combinedData?.og_description, insertArr.og_description) ||
      hasChangedFromOld(combinedData?.twitter_title, insertArr.twitter_title) ||
      hasChangedFromOld(combinedData?.twitter_description, insertArr.twitter_description)

    if (changed) {
      await seo_change_logsM.create({
        module_key: 'event',
        module_id: eventRowId,
        old_meta_title: combinedData?.meta_title || '',
        new_meta_title: hasChangedFromOld(combinedData?.meta_title, insertArr.meta_title) ? insertArr.meta_title : '',
        old_meta_description: combinedData?.meta_description || '',
        new_meta_description: hasChangedFromOld(combinedData?.meta_description, insertArr.meta_description) ? insertArr.meta_description : '',
        old_meta_keywords: combinedData?.meta_keywords || '',
        new_meta_keywords: hasChangedFromOld(combinedData?.meta_keywords, insertArr.meta_keywords) ? insertArr.meta_keywords : '',
        old_og_title: combinedData?.og_title || '',
        new_og_title: hasChangedFromOld(combinedData?.og_title, insertArr.og_title) ? insertArr.og_title : '',
        old_og_description: combinedData?.og_description || '',
        new_og_description: hasChangedFromOld(combinedData?.og_description, insertArr.og_description) ? insertArr.og_description : '',
        old_twitter_title: combinedData?.twitter_title || '',
        new_twitter_title: hasChangedFromOld(combinedData?.twitter_title, insertArr.twitter_title) ? insertArr.twitter_title : '',
        old_twitter_description: combinedData?.twitter_description || '',
        new_twitter_description: hasChangedFromOld(combinedData?.twitter_description, insertArr.twitter_description) ? insertArr.twitter_description : '',
        user_type: checkUserToken.message.user_type === 1 ? 'user' : 'admin',
        updated_by: checkUserToken.message.user_type === 1 ? userRowId : (checkUserToken.message.user_row_id ?? 0),
      })
    }

    if (combinedData?.approval_status === 1) {
      const venueEventTypes = [1, 3, 4, 5, 6, 7, 8]
      await agenda.now('generate event card', {
        event_title: insertArr.event_title,
        start_date: insertArr.start_date,
        event_venue: venueEventTypes.includes(insertArr.event_type as number) ? insertArr.event_venue : 'Virtual',
        event_url: combinedData.event_url,
        event_row_id: eventRowId,
      })
    }
    await calculateEventScore(eventRowId, ['build_event_page'])

    return { status: true, message: { alert_message: 'Event updated successfully.', event_row_id: eventRowId } }
  }

  // ---- CREATE PATH ----
  insertArr['active_status'] = activeStatus
  insertArr['approval_status'] = approvalStatus
  insertArr['created_by_admin_status'] = adminManagerType
  insertArr['created_by_sub_admin_id'] = adminRowId
  insertArr['created_date_n_time'] = dateNTime

  const seoFields: Record<string, unknown> = {}
  if (insertArr.event_description) {
    const cleanedBio = removeHtmltag(insertArr.event_description as string).slice(0, 160)
    seoFields.meta_description = cleanedBio
    seoFields.og_description = cleanedBio
    seoFields.twitter_description = cleanedBio
  }
  if (insertArr.event_title) {
    seoFields.meta_title = insertArr.event_title
    seoFields.og_title = insertArr.event_title
    seoFields.twitter_title = insertArr.event_title
  }
  if (defaultKeywords) {
    seoFields.meta_keywords = defaultKeywords
  }

  const eventInsertData = { ...insertArr }
  for (const key of ['meta_description', 'og_description', 'twitter_description', 'meta_title', 'og_title', 'twitter_title', 'meta_keywords']) {
    delete eventInsertData[key]
  }

  const dataSave = await eventM(eventInsertData).save()

  // CONFIRMED GAP FIX (user-requested, 2026-09-26, "event creation ... must be registered in the
  // history"): event creation was never audited at all - mirrors the equivalent fix in
  // `professionals.service.ts`/`company.settings.service.ts`. This endpoint is dual-purpose
  // (self-service app user OR admin panel, see this file's own top doc comment), and its
  // `checkUserToken` shape (`{ message: { user_type, user_row_id }, token_message?: {...} }`) is
  // NOT one `getUpdateTrackerFields()` recognizes (no `.status` wrapper - confirmed against
  // `events.submit.service.test.ts`'s own fixtures) - it would silently fall through to that
  // helper's null-actor branch. Built directly here instead, from the same
  // userRowId/adminManagerType/adminRowId this function already resolved above.
  const auditTracker: UpdateTracker = userRowId
    ? { updated_by: 'user', updated_by_row_id: userRowId }
    : adminManagerType === 1
      ? { updated_by: 'admin', updated_by_row_id: 0 }
      : { updated_by: 'subadmin', updated_by_row_id: adminRowId }
  await recordEventStatusChange({
    documentId: Number.parseInt(dataSave._id),
    action: 'create',
    tracker: auditTracker,
    adminRowId: userRowId ? null : adminRowId,
    eventTitle: insertArr.event_title as string | undefined,
  })

  if (Object.keys(seoFields).length > 0) {
    await event_seo_detailsM.updateOne({ event_row_id: dataSave._id }, { $set: seoFields }, { upsert: true })
  }

  const hasNonEmpty = (val: unknown) => String(val ?? '').trim() !== ''
  const created =
    hasNonEmpty(insertArr.meta_title) ||
    hasNonEmpty(insertArr.meta_description) ||
    hasNonEmpty(insertArr.meta_keywords) ||
    hasNonEmpty(insertArr.og_title) ||
    hasNonEmpty(insertArr.og_description) ||
    hasNonEmpty(insertArr.twitter_title) ||
    hasNonEmpty(insertArr.twitter_description)

  if (created) {
    await seo_change_logsM.create({
      module_key: 'event',
      module_id: Number.parseInt(dataSave._id),
      old_meta_title: '',
      new_meta_title: hasNonEmpty(insertArr.meta_title) ? insertArr.meta_title : '',
      old_meta_description: '',
      new_meta_description: hasNonEmpty(insertArr.meta_description) ? insertArr.meta_description : '',
      old_meta_keywords: '',
      new_meta_keywords: hasNonEmpty(insertArr.meta_keywords) ? insertArr.meta_keywords : '',
      old_og_title: '',
      new_og_title: hasNonEmpty(insertArr.og_title) ? insertArr.og_title : '',
      old_og_description: '',
      new_og_description: hasNonEmpty(insertArr.og_description) ? insertArr.og_description : '',
      old_twitter_title: '',
      new_twitter_title: hasNonEmpty(insertArr.twitter_title) ? insertArr.twitter_title : '',
      old_twitter_description: '',
      new_twitter_description: hasNonEmpty(insertArr.twitter_description) ? insertArr.twitter_description : '',
      user_type: checkUserToken.message.user_type === 1 ? 'user' : 'admin',
      updated_by: checkUserToken.message.user_type === 1 ? userRowId : (checkUserToken.message.user_row_id ?? 0),
    })
  }

  await invalidateEventSubmitCaches()
  eventRowId = Number.parseInt(dataSave._id)

  if (userRowId) {
    if (adminRowId) {
      await updateNotification({ user_row_id: userRowId, notify_type: 3, notify_type_row_id: eventRowId, message_row_id: 65, action_row_id: eventRowId, event_row_id: eventRowId, notify_image: undefined, notify_name: undefined, notify_id: undefined })
    } else {
      await updateThreadNotification({ user_row_id: -1, notify_type: 1, notify_type_row_id: userRowId, message_row_id: 51, action_row_id: eventRowId, event_row_id: eventRowId })
    }
  }

  if (adminManagerType == 0 && adminRowId == 0 && eventHostQuery) {
    const getUtcTime = await event_utc_datesM.findOne({ _id: dataSave.utc_row_id }, { utc_time: 1 })
    const startDateFormatted = DateFormatter(dataSave.start_date)
    const eventTitle = dataSave.event_title

    const emailData: Record<string, unknown> = {
      event_title: dataSave.event_title,
      start_date: startDateFormatted,
      event_venue: dataSave.event_venue,
      event_link: dataSave.event_link,
      name: eventHostQuery.full_name,
      utc_time: getUtcTime.utc_time,
      invite_id: eventHostQuery.user_name,
    }

    if (body.list_event_type === 1 || body.list_event_type === 3) {
      emailData.host_name = eventHostQuery.full_name
    } else if (body.list_event_type === 2) {
      const companyQuery = await companyM.findOne({ user_row_id: userRowId }, { company_name: 1 })
      emailData.host_name = companyQuery.company_name
    }

    const subAdminData = await sub_admin_emailsM.find({ type: { $in: [1, 3] } }, { full_name: 1, email_id: 1 })
    await sendSubAdminApprovalEmails(subAdminData, emailData)

    const passSubject = 'Congratulations on successfully creating the event! ' + eventTitle
    const messageToPass = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${eventHostQuery.full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">We hope this message finds you well. Thank You for listing your event on Coinpedia.! </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Your Event <b>${eventTitle}</b>  is currently under approval from the administrative team and will be approved within the next 24 hours, you will receive a confirmation email from our coinpedia administrator. </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">You can modify event details, include speakers, and manage tickets through your <a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Coinpedia account.</a></p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">All the best and we're at your side</p>`
    await sendEventsEmail(eventHostQuery.email_id, passSubject, messageToPass)
  }

  await calculateEventScore(eventRowId, ['build_event_page'])

  return { status: true, message: { alert_message: 'New event created successfully.', event_row_id: eventRowId } }
}
