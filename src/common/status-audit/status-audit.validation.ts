import { DEFAULT_AUDIT_LIMIT, DEFAULT_AUDIT_SKIP } from './status-audit.registry'

export interface AuditRequestParams {
  documentId: number
  skip: number
  limit: number
}

export interface AuditRequestValidation {
  valid: boolean
  message: string | null
  params: AuditRequestParams | null
}

const INVALID_ID_MESSAGE = 'Sorry, Invalid Company row id'
const DECIMAL_RADIX = 10

const parseWithFallback = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? '', DECIMAL_RADIX)
  return Number.isNaN(parsed) ? fallback : parsed
}

/**
 * Keeps the controller to validate-then-delegate (CLAUDE.md: controllers stay thin).
 * A non-numeric document id is rejected; non-numeric pagination falls back to defaults,
 * matching how the existing routes in this router treat their skip/limit params.
 */
export function validateAuditRequest(raw: {
  documentId?: string
  skip?: string
  limit?: string
}): AuditRequestValidation {
  const documentId = Number.parseInt(raw.documentId ?? '', DECIMAL_RADIX)
  if (Number.isNaN(documentId)) {
    return { valid: false, message: INVALID_ID_MESSAGE, params: null }
  }

  return {
    valid: true,
    message: null,
    params: {
      documentId,
      skip: parseWithFallback(raw.skip, DEFAULT_AUDIT_SKIP),
      limit: parseWithFallback(raw.limit, DEFAULT_AUDIT_LIMIT),
    },
  }
}
