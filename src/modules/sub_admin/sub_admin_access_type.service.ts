// Business logic for the "Manager Roles" access-type documentation pages,
// ported verbatim from controllers/admin_panel/sub_admin.js's access_type
// handlers (lines 362-480) plus utils/helpers/manager_role_refresh_helper.js
// (ported in directly here, then that standalone file is deleted). Structural
// port only - same queries, same prompt text, same Gemini call/parse logic.

import fs from 'fs'
import path from 'path'

const sub_admin_access_typeM = require('../../../models/admin_panel/app/sub_admin_access_typeM')

import type { ServiceResponse } from './sub_admin.types'
import { buildRefreshPrompt } from './sub_admin_access_type.prompt'
import { generateJson } from './sub_admin.gemini'
import { findSourceRoot } from './sub_admin.source-root'
import { validateAccessTypeText, writeAccessTypeText, type AccessTypeText } from './sub_admin_access_type.text'

// Not __dirname-relative: on staging this file runs from the compiled dist/ folder,
// where the .ts sources below don't exist - see sub_admin.source-root.ts.
const PROJECT_ROOT = findSourceRoot() ?? process.cwd()

interface ModuleSource {
  label: string
  files: string[]
}

// Only these four ids are this backend's responsibility - Blockchain/
// Exchange/Tokens/Portfolio/Portfolio & Markets live in markets-backend-local's
// own matching module.
const MODULE_SOURCE_FILES: Record<number, ModuleSource> = {
  // Service files are listed too: that's where the Restricted vs Full Access
  // checks live (record-ownership limits and lifecycle approvals).
  1: { label: 'Users', files: ['src/modules/professionals/professionals.controller.ts', 'src/modules/professionals/professionals.approvals.controller.ts', 'src/modules/professionals/professionals.service.ts', 'src/modules/professionals/professionals.lifecycle-request.service.ts'] },
  7: { label: 'Companies', files: ['src/modules/company_admin/company_admin.controller.ts', 'src/modules/company_admin/company_admin.approvals.controller.ts', 'src/modules/company/company.controller.ts', 'src/modules/company_admin/company_admin.lifecycle-request.service.ts'] },
  10: { label: 'Events', files: ['controllers/admin_panel/events/event.js', 'src/modules/events/events.edit.service.ts', 'src/modules/events/events.lifecycle-request.service.ts', 'src/modules/events-change-approvals/events.change-approvals.controller.ts'] },
  13: { label: 'Coinpedia & Academy', files: ['src/modules/community-admin/community-admin.posts.controller.ts', 'src/modules/community-admin/community-admin.groups.controller.ts', 'src/modules/community-admin/community-admin.challenge.controller.ts', 'src/modules/community-admin/community-admin.request-article.controller.ts'] },
}

const RELEVANT_LINE_PATTERN = /checkAdminLoginToken|canApproveChange|sub_admin_type|router\.(get|post|put|delete)/
// Wide enough to include the guard around each check (e.g. a DIRECT_ACTIONS
// condition sitting a few lines above a canApproveChangeRequests call).
const CONTEXT_LINES = 6

// Keeps a huge legacy file (event.js is 13k+ lines) down to just its real
// permission/route lines plus a little surrounding context.
function extractRelevantLines(absolutePath: string): string {
  const lines = fs.readFileSync(absolutePath, 'utf8').split('\n')
  const keep = new Set<number>()

  lines.forEach((line, index) => {
    if (RELEVANT_LINE_PATTERN.test(line)) {
      for (let i = Math.max(0, index - CONTEXT_LINES); i <= Math.min(lines.length - 1, index + CONTEXT_LINES); i++) {
        keep.add(i)
      }
    }
  })

  return [...keep].sort((a, b) => a - b).map((index) => lines[index]).join('\n')
}

function buildCodeExcerpt(relativeFiles: string[]): string {
  return relativeFiles
    .map((relativeFile) => `--- ${relativeFile} ---\n${extractRelevantLines(path.join(PROJECT_ROOT, relativeFile))}`)
    .join('\n\n')
}


/** Ports GET /access_types (legacy lines 374-394). */
export async function listAccessTypes(): Promise<ServiceResponse> {
  const queryRun = await sub_admin_access_typeM.find(
    { type_status: 1 },
    { _id: 1, create_type_name: 1, description: 1, responsibilities: 1, can_extra: 1, cant_extra: 1, restricted_access: 1, full_access: 1 },
  )
  return { status: true, message: queryRun }
}

/** Ports POST /refresh_access_type/:request_row_id (legacy lines 435-480). */
export async function refreshAccessType(requestRowIdRaw: string): Promise<ServiceResponse> {
  const request_row_id = Number.parseInt(requestRowIdRaw)
  const module = MODULE_SOURCE_FILES[request_row_id]
  if (!module) {
    return { status: false, message: 'This access type is not managed by this backend.' }
  }

  const codeExcerpt = buildCodeExcerpt(module.files)
  const prompt = buildRefreshPrompt(module.label, codeExcerpt)
  const parsed = await generateJson<AccessTypeText>(prompt)
  await writeAccessTypeText(request_row_id, parsed)

  return {
    status: true,
    message: {
      alert_message: 'Role refreshed from source.',
      description: parsed.description,
      responsibilities: parsed.responsibilities,
      can_extra: parsed.can_extra,
      cant_extra: parsed.cant_extra,
      restricted_access: parsed.restricted_access,
      full_access: parsed.full_access,
    },
  }
}

/**
 * POST /update_access_type/:request_row_id - saves Manager Roles text generated
 * elsewhere. markets-backend-local's refresh generates its modules' text and
 * saves it here (with the admin's own token + this service's API key) rather
 * than writing to this service's database directly.
 */
export async function saveAccessTypeText(requestRowIdRaw: string, body: Record<string, unknown>): Promise<ServiceResponse> {
  const request_row_id = Number.parseInt(requestRowIdRaw)
  const accessType = Number.isNaN(request_row_id) ? null : await sub_admin_access_typeM.findOne({ _id: request_row_id }, { _id: 1 })
  if (!accessType) {
    return { status: false, message: { alert_message: 'Invalid access type id.' } }
  }

  const errors = validateAccessTypeText(body)
  if (Object.keys(errors).length > 0) {
    return { status: false, message: errors }
  }

  await writeAccessTypeText(request_row_id, body as unknown as AccessTypeText)
  return { status: true, message: { alert_message: 'Role text saved.' } }
}
