// modules/professionals-approvals/professionals-approvals.service.ts
// Ports controllers/admin_panel/app/user_approvals.js's 3 routes (~121-670). Same behavior, same
// response shapes. Owns no colocated model — filters the core `professionalsM` by
// approval_status, per the plan's model-to-module mapping.
import ProfessionalM from '../../../models/app/professionalsM'
import { buildApprovalsFilters, buildApprovalsListPipeline, buildApprovalsCountPipeline } from './professionals-approvals.queries'
import type { ListParams } from './professionals-approvals.types'

const VALID_APPROVAL_STATUSES = [0, 1, 2]

export async function getApprovalsList(params: ListParams) {
  if (!VALID_APPROVAL_STATUSES.includes(params.approvalStatus)) {
    return { status: false, message: { alert_message: 'Please enter according to  0:pending, 1:approved, 2:rejected' } }
  }

  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100

  const { matchAnd, designationLookingForConditions } = buildApprovalsFilters(params)

  // CONFIRMED PERF FIX, already applied by a prior engagement: list and count run concurrently
  // instead of as two sequential awaits. Preserved as-is while porting.
  const [list, countResult] = await Promise.all([
    ProfessionalM.aggregate(buildApprovalsListPipeline(matchAnd, designationLookingForConditions)).skip(skip).limit(limit),
    ProfessionalM.aggregate(buildApprovalsCountPipeline(matchAnd, designationLookingForConditions)),
  ])
  const count = countResult[0]?.count || 0

  return { status: true, message: list, count }
}

// approveRequest/rejectRequest moved to professionals.lifecycle-request.service.ts +
// professionals.lifecycle-apply.ts (submitApproveUserRequest/submitRejectUserRequest) - the
// first-time approve/reject decision on a pending self-register submission now goes through the
// same pending -> approve -> publish staging flow as Enable/Disable, instead of applying
// immediately. See professionals-approvals.controller.ts for the wiring.
