// modules/professionals-notifications/professionals-notifications.service.ts
// Ports admin_panel/app/notifications.js in full (3 routes): /list/:skip/:limit, /info,
// /update_viewed_status. notificationsM is shared with several still-legacy files
// (app/notifications.js, weekly_contests.js) — required directly, not colocated.
import { buildNotificationsListPipeline, buildNotificationsCountPipeline } from './professionals-notifications.queries'
import type { AdminAuthResult } from './professionals-notifications.types'

const NotificationsM = require('../../../models/app/notifications/notificationsM')

const ADMIN_NOTIFICATIONS_USER_ROW_ID = -1

export async function getNotificationsList(auth: AdminAuthResult, skipRaw: string, limitRaw: string) {
  if (!auth.status) return auth

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 500

  const [result1, result2] = await Promise.all([
    NotificationsM.aggregate(buildNotificationsListPipeline()).skip(skip).limit(limit),
    NotificationsM.aggregate(buildNotificationsCountPipeline()),
  ])

  const count = result2[0] ? result2[0].count : 0

  return { status: true, message: result1, count }
}

export async function getNotificationsInfo(auth: AdminAuthResult) {
  if (!auth.status) return auth

  const countQuery = await NotificationsM.aggregate([
    { $match: { user_row_id: ADMIN_NOTIFICATIONS_USER_ROW_ID, view_status: 0 } },
    { $lookup: { from: 'cln_notifications_messages', localField: 'message_row_id', foreignField: '_id', as: 'info_message' } },
    { $unwind: { path: '$info_message' } },
    { $count: 'count' },
  ])

  const pendingCount = countQuery[0] ? countQuery[0].count : 0

  return { status: true, message: { pending_count: pendingCount } }
}

export async function updateViewedStatus(auth: AdminAuthResult) {
  if (!auth.status) return auth

  await NotificationsM.updateMany({ user_row_id: ADMIN_NOTIFICATIONS_USER_ROW_ID, view_status: 0 }, { $set: { view_status: 1 } })

  return { status: true, message: { alert_message: 'Notification viewed succesfully.' } }
}
