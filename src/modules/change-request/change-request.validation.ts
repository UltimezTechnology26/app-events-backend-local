const DECIMAL_RADIX = 10
const INVALID_REQUEST_ID_MESSAGE = 'Sorry, Invalid change request id'
const INVALID_COMPANY_ID_MESSAGE = 'Sorry, Invalid Company row id'
const INVALID_USER_ID_MESSAGE = 'Sorry, Invalid User Row ID'
const REASON_REQUIRED_MESSAGE = 'The Reason field is required'
const PUBLISH_FORBIDDEN_MESSAGE = 'Sorry, you do not have permission to approve, reject, or publish changes'
const RATING_MIN = 1
const RATING_MAX = 10
const INVALID_RATING_MESSAGE = 'Sorry, Rating must be a whole number from 1 to 10'
const NOTE_REQUIRED_MESSAGE = 'The Note field is required'

export const CHANGE_REQUEST_MESSAGES = {
  INVALID_REQUEST_ID: INVALID_REQUEST_ID_MESSAGE,
  INVALID_COMPANY_ID: INVALID_COMPANY_ID_MESSAGE,
  INVALID_USER_ID: INVALID_USER_ID_MESSAGE,
  REASON_REQUIRED: REASON_REQUIRED_MESSAGE,
  PUBLISH_FORBIDDEN: PUBLISH_FORBIDDEN_MESSAGE,
  NOTE_REQUIRED: NOTE_REQUIRED_MESSAGE,
  INVALID_RATING: INVALID_RATING_MESSAGE,
} as const

/** admin_manager_type 1 is a main admin; 2 is a sub-admin. */
export const ADMIN_MANAGER_TYPE_MAIN = 1

export interface NumericIdValidation {
  valid: boolean
  message: string | null
  value: number | null
}

const parseId = (raw: string | undefined, message: string): NumericIdValidation => {
  const value = Number.parseInt(raw ?? '', DECIMAL_RADIX)
  return Number.isNaN(value)
    ? { valid: false, message, value: null }
    : { valid: true, message: null, value }
}

export const validateChangeRequestId = (raw: string | undefined): NumericIdValidation =>
  parseId(raw, INVALID_REQUEST_ID_MESSAGE)

export const validateCompanyRowId = (raw: string | undefined): NumericIdValidation =>
  parseId(raw, INVALID_COMPANY_ID_MESSAGE)

export const validateUserRowId = (raw: string | undefined): NumericIdValidation =>
  parseId(raw, INVALID_USER_ID_MESSAGE)

export const isMainAdmin = (adminManagerType: unknown): boolean =>
  Number(adminManagerType) === ADMIN_MANAGER_TYPE_MAIN

/**
 * Maker-checker gate for approve/reject/publish (and their field-level and publish-all variants)
 * on change requests, shared by both the Company and Professionals modules.
 *
 * REVERTED (user-requested, 2026-09-22): this briefly also allowed a Developer or Marketing-Full
 * sub-admin to approve/reject/publish, alongside the main admin. Per explicit follow-up request,
 * that's reverted - only the main admin may approve, reject, or publish a change request; every
 * sub-admin type is excluded from this specific maker-checker step (they can still create/edit/
 * enable/disable companies and professionals like before, just never approve their own or anyone
 * else's changes).
 */
export const canApproveChangeRequests = (adminManagerType: unknown, _subAdminType?: unknown): boolean =>
  isMainAdmin(adminManagerType)

export interface RatingValidation {
  valid: boolean
  message: string | null
  value: number | null
}

export const validateRating = (raw: unknown): RatingValidation => {
  const value = Number(raw)
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX
    ? { valid: true, message: null, value }
    : { valid: false, message: INVALID_RATING_MESSAGE, value: null }
}

export interface NoteValidation {
  valid: boolean
  message: string | null
  value: string | null
}

export const validateNote = (raw: unknown): NoteValidation => {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value === ''
    ? { valid: false, message: NOTE_REQUIRED_MESSAGE, value: null }
    : { valid: true, message: null, value }
}
