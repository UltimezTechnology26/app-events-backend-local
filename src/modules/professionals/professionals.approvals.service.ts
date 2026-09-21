// modules/professionals/professionals.approvals.service.ts
//
// Global cross-professional pending/rejected changes queues — mirrors
// company_admin.approvals.service.ts's getGlobalPendingChangeRequests/getGlobalRejectedChangeRequests
// exactly, parameterized with AUDIT_MODULE_PROFESSIONALS and enriched with professional display
// info (name/username/avatar) instead of company name/id/logo.
import { getPendingChangeRequestsAcrossEntities, getRejectedChangeRequestsAcrossEntities } from '../../modules/change-request/change-request.service'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { findProfessionalsDisplayInfoByIds } from './professionals.approvals.queries'

export interface GetGlobalProfessionalChangesParams {
  skipRaw: string
  limitRaw: string
}

export interface ProfessionalChangeQueueEntity {
  user_row_id: number
  full_name: string | null
  user_name: string | null
  profile_image: string | null
}

export interface PendingProfessionalChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  changes: unknown[]
  root_document_id: number
  entity: ProfessionalChangeQueueEntity | null
}

function buildEntityById(professionals: { _id: number; full_name?: string | null; user_name?: string | null; profile_image?: string | null }[]) {
  return new Map(professionals.map((professional) => [professional._id, professional]))
}

function toEntity(professional: { _id: number; full_name?: string | null; user_name?: string | null; profile_image?: string | null } | undefined): ProfessionalChangeQueueEntity | null {
  if (!professional) return null
  return {
    user_row_id: professional._id,
    full_name: professional.full_name ?? null,
    user_name: professional.user_name ?? null,
    profile_image: professional.profile_image ?? null,
  }
}

export async function getGlobalPendingChangeRequestsForProfessionals({ skipRaw, limitRaw }: GetGlobalProfessionalChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getPendingChangeRequestsAcrossEntities({ module: AUDIT_MODULE_PROFESSIONALS, skip, limit })

  const userRowIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const professionals = userRowIds.length > 0 ? await findProfessionalsDisplayInfoByIds(userRowIds) : []
  const professionalById = buildEntityById(professionals)

  const data: PendingProfessionalChangeQueueRow[] = requests.map((request) => ({
    ...request,
    entity: toEntity(professionalById.get(request.root_document_id)),
  }))

  return { status: true, message: data, count }
}

export interface RejectedProfessionalChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  reviewed_by: unknown
  reviewed_at: Date | null
  reason: string | null
  changes: unknown[]
  root_document_id: number
  entity: ProfessionalChangeQueueEntity | null
}

export async function getGlobalRejectedChangeRequestsForProfessionals({ skipRaw, limitRaw }: GetGlobalProfessionalChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getRejectedChangeRequestsAcrossEntities({ module: AUDIT_MODULE_PROFESSIONALS, skip, limit })

  const userRowIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const professionals = userRowIds.length > 0 ? await findProfessionalsDisplayInfoByIds(userRowIds) : []
  const professionalById = buildEntityById(professionals)

  const data: RejectedProfessionalChangeQueueRow[] = requests.map((request) => ({
    ...request,
    entity: toEntity(professionalById.get(request.root_document_id)),
  }))

  return { status: true, message: data, count }
}
