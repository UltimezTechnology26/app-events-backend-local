// modules/events/events.controller.ts
//
// First slice of the Events core module migration (see plan doc
// docs/superpowers/plans/2026-09-22-events-module-migration.md, Phase 2). Ports
// controllers/admin_panel/events/event.js's GET /list/:active_status/:skip/:limit (line 6439)
// out of the legacy file. Mounted at a temporary `_v2` prefix (routes/admin_panel.js:
// '/event_v2'), parallel to the untouched legacy '/event' mount, per this repo's standing
// cutover strategy — legacy stays live and unmodified until this module is verified and the
// frontend explicitly switches over.
//
// This slice adds enable_event (7729), disable_event (7842), delete_event (7959).
// Remaining routes in this module's scope (view_event, edit_event, deleted_events_list,
// submit_event) are ported in follow-up slices, not this one.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getEventsList } from './events.list.service'
import { getPublishedEventsOverview, getEventsEmployees } from './events.published-overview.service'
import { getAttendeesInviteesList, getEventWatchlist } from './events.attendees-invitees.service'
import { deleteEvent } from './events.write.service'
import { editEvent } from './events.edit.service'
import { getDeletedEventsList } from './events.deleted-list.service'
import { getDisabledEventsList } from './events.disabled-list.service'
import { getPendingEventsList } from './events.pending-list.service'
import { submitEnableEventRequest, submitDisableEventRequest, submitApproveEventRequest, submitRejectEventRequest } from './events.lifecycle-request.service'
import { getEventView } from './events.view.service'
import { AdminAuthFailure } from './events.types'

export const eventsRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]

function requireEventsAdmin(req: Request): AdminAuthFailure | null {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
  return checkToken.status ? null : checkToken
}

// Router-level guard (additive safety net, matching professionals.controller.ts's two-layer
// pattern): the legacy route calls checkAdminLoginToken inline per-handler; this adds a
// default-closed gate in front so a route can't be left reachable if a handler ever forgot the
// call, without removing the per-route check below.
eventsRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsRouter.get(
  '/list/:active_status/:skip/:limit',
  asyncRoute('Published events list.', async (req: Request, res: Response) => {
    const authFailure = requireEventsAdmin(req)
    if (authFailure) {
      return res.json(authFailure)
    }

    const result = await getEventsList({
      activeStatusRaw: req.params.active_status as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      ticket: req.query.ticket as string | undefined,
      search: req.query.search as string | undefined,
      employeeIdRaw: req.query.employee_id as string | undefined,
      eventTypeRaw: req.query.event_type as string | undefined,
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
      eventStatusRaw: req.query.event_status as string | undefined,
      eventTag: req.query.event_tag as string | undefined,
      location: req.query.location as string | undefined,
      createdType: req.query.created_type as string | undefined,
      profileScoreRange: req.query.profile_score as string | undefined,
      tagStatusRaw: req.query.tag_status as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrderRaw: req.query.sortOrder as string | undefined,
    })
    res.json(result)
  })
)

eventsRouter.get(
  '/published_overview',
  asyncRoute('Published events overview cards.', async (req: Request, res: Response) => {
    const authFailure = requireEventsAdmin(req)
    if (authFailure) {
      return res.json(authFailure)
    }
    res.json(await getPublishedEventsOverview())
  })
)

eventsRouter.get(
  '/employees',
  asyncRoute('Events sub-admin filter list.', async (req: Request, res: Response) => {
    const authFailure = requireEventsAdmin(req)
    if (authFailure) {
      return res.json(authFailure)
    }
    res.json(await getEventsEmployees())
  })
)

eventsRouter.get(
  '/attendees_invitees_list/:event_row_id/:status',
  asyncRoute('Attendees/invitees list.', async (req: Request, res: Response) => {
    const authFailure = requireEventsAdmin(req)
    if (authFailure) {
      return res.json(authFailure)
    }
    res.json(await getAttendeesInviteesList(req.params.event_row_id as string, req.params.status as string, req.query.search as string | undefined))
  })
)

eventsRouter.get(
  '/event_watchlist/:event_row_id',
  asyncRoute('Event watchlist.', async (req: Request, res: Response) => {
    const authFailure = requireEventsAdmin(req)
    if (authFailure) {
      return res.json(authFailure)
    }
    res.json(await getEventWatchlist(req.params.event_row_id as string, req.query.search as string | undefined))
  })
)

eventsRouter.get(
  '/enable_event/:request_row_id',
  asyncRoute('Enable event.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    res.json(await submitEnableEventRequest(checkAdminToken, req.params.request_row_id as string))
  })
)

eventsRouter.post(
  '/disable_event/:request_row_id',
  [check('disable_reason').not().isEmpty().withMessage('The Disable Reason field is required').isLength({ min: 4 }).withMessage('The Disable Reason field must be at least 4 characters in length.')],
  asyncRoute('Disable event.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    if (Object.keys(errObj).length > 0) {
      return res.json({ status: false, message: errObj })
    }
    res.json(await submitDisableEventRequest(checkAdminToken, req.params.request_row_id as string, req.body.disable_reason))
  })
)

eventsRouter.post(
  '/delete_event/:request_row_id',
  [check('deleted_reason').not().isEmpty().withMessage('The Delete Reason field is required').isLength({ min: 4 }).withMessage('The Delete Reason field must be at least 4 characters in length.')],
  asyncRoute('Delete event.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    if (Object.keys(errObj).length > 0) {
      return res.json({ status: false, message: errObj })
    }
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    if (Number.isNaN(requestRowId)) {
      return res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
    }
    res.json(await deleteEvent(requestRowId, req.body.deleted_reason))
  })
)

eventsRouter.post(
  '/edit_event',
  [
    check('event_row_id').not().isEmpty().withMessage('The Event Row ID field is required.'),
    check('event_title').not().isEmpty().withMessage('The Event Title field is required.').isLength({ min: 4 }).withMessage('The Event Title field must be at least 4 characters in length.'),
    check('event_tags').not().isEmpty().withMessage('The Event Tags field is required.'),
    check('event_type').not().isEmpty().withMessage('The Event Type field is required.'),
    check('event_link').not().isEmpty().withMessage('The Event Link field is required.').isLength({ min: 4 }).withMessage('The Event Link field must be at least 4 characters in length.'),
    check('start_date').not().isEmpty().withMessage('The Start Date field is required.'),
    check('end_date').not().isEmpty().withMessage('The End Date field is required.'),
    check('event_description').not().isEmpty().withMessage('The Event Description field is required.').isLength({ min: 4 }).withMessage('The Event Description field must be at least 4 characters in length.'),
    check('list_event_type').not().isEmpty().withMessage('The Event List Type field is required').isInt({ min: 1, max: 3 }).withMessage('The Event List Type field must be contain 1, 2 or 3.'),
    check('event_list_id').not().isEmpty().withMessage('The Event List Type field is required'),
  ],
  asyncRoute('Admin panel edit event.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    // Matches legacy exactly: express-validator errors and business-logic errors accumulate into
    // the SAME errObj (business logic still runs even if express-validator already failed) before
    // a single combined check — not an early return on express-validator errors alone.
    res.json(await editEvent(req.body, checkAdminToken, errObj))
  })
)

eventsRouter.get(
  '/pending_events/:approval_status/:skip/:limit',
  asyncRoute('Pending events list.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) {
      return res.json(checkToken)
    }
    const result = await getPendingEventsList({
      approvalStatusRaw: req.params.approval_status as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      createdType: req.query.created_type as string | undefined,
      employeeIdRaw: req.query.employee_id as string | undefined,
      eventTypeRaw: req.query.event_type as string | undefined,
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
      dateTimeRaw: req.query.date_time as string | undefined,
      eventStatusRaw: req.query.event_status as string | undefined,
      profileScoreRange: req.query.profile_score as string | undefined,
      tagStatusRaw: req.query.tag_status as string | undefined,
    })
    res.json(result)
  })
)

eventsRouter.get(
  '/approve_event/:request_row_id',
  asyncRoute('Approve event.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    res.json(await submitApproveEventRequest(checkAdminToken, req.params.request_row_id as string))
  })
)

eventsRouter.post(
  '/reject_event/:request_row_id',
  [check('reason_for_reject').not().isEmpty().withMessage('The Reason for Reject field is required').isLength({ min: 4 }).withMessage('The Reason for Reject field must be at least 4 characters in length.')],
  asyncRoute('Reject event.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    if (Object.keys(errObj).length > 0) {
      return res.json({ status: false, message: errObj })
    }
    res.json(await submitRejectEventRequest(checkAdminToken, req.params.request_row_id as string, req.body.reason_for_reject))
  })
)

eventsRouter.get(
  '/disabled_list/:skip/:limit',
  asyncRoute('Disabled events list.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) {
      return res.json(checkToken)
    }
    const result = await getDisabledEventsList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      listEventTypeRaw: req.query.list_event_type as string | undefined,
      createdByAdminStatusRaw: req.query.created_by_admin_status as string | undefined,
      profileScoreRange: req.query.profile_score as string | undefined,
      eventTag: req.query.event_tag as string | undefined,
      tagStatusRaw: req.query.tag_status as string | undefined,
    })
    res.json(result)
  })
)

eventsRouter.get(
  '/deleted_events_list/:skip/:limit',
  asyncRoute('Deleted events list.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) {
      return res.json(checkToken)
    }
    const result = await getDeletedEventsList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      employeeIdRaw: req.query.employee_id as string | undefined,
      eventTypeRaw: req.query.event_type as string | undefined,
      activeStatusRaw: req.query.active_status as string | undefined,
      approvalStatusRaw: req.query.approval_status as string | undefined,
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
      eventStatusRaw: req.query.event_status as string | undefined,
      eventTag: req.query.event_tag as string | undefined,
      location: req.query.location as string | undefined,
      createdType: req.query.created_type as string | undefined,
      tagStatusRaw: req.query.tag_status as string | undefined,
    })
    res.json(result)
  })
)

eventsRouter.get(
  '/view_event/:request_row_id',
  asyncRoute('Event individual view.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      return res.json(checkAdminToken)
    }
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    if (Number.isNaN(requestRowId)) {
      return res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
    }
    res.json(await getEventView(requestRowId))
  })
)
