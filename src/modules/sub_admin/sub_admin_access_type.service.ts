// Business logic for the "Manager Roles" access-type documentation pages,
// ported verbatim from controllers/admin_panel/sub_admin.js's access_type
// handlers (lines 362-480) plus utils/helpers/manager_role_refresh_helper.js
// (ported in directly here, then that standalone file is deleted). Structural
// port only - same queries, same prompt text, same Gemini call/parse logic.

import fs from 'fs'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'

const sanitize = require('mongo-sanitize')
const sub_admin_access_typeM = require('../../../models/admin_panel/app/sub_admin_access_typeM')

import type { ServiceResponse } from './sub_admin.types'

// Separate client from services/ai_agents/geminiService.js on purpose - that
// file also wires up Pinecone/BigQuery clients this feature has no use for.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string)
const PROJECT_ROOT = path.join(__dirname, '../../../')

interface ModuleSource {
  label: string
  files: string[]
}

// Only these four ids are this backend's responsibility - Blockchain/
// Exchange/Tokens/Portfolio/Portfolio & Markets live in markets-backend-local's
// own matching module.
const MODULE_SOURCE_FILES: Record<number, ModuleSource> = {
  1: { label: 'Users', files: ['src/modules/professionals/professionals.controller.ts', 'src/modules/professionals/professionals.approvals.controller.ts'] },
  7: { label: 'Companies', files: ['src/modules/company_admin/company_admin.controller.ts', 'src/modules/company_admin/company_admin.approvals.controller.ts', 'src/modules/company/company.controller.ts'] },
  10: { label: 'Events', files: ['controllers/admin_panel/events/event.js'] },
  13: { label: 'Coinpedia & Academy', files: ['src/modules/community-admin/community-admin.posts.controller.ts', 'src/modules/community-admin/community-admin.groups.controller.ts', 'src/modules/community-admin/community-admin.challenge.controller.ts', 'src/modules/community-admin/community-admin.request-article.controller.ts'] },
}

const RELEVANT_LINE_PATTERN = /checkAdminLoginToken|canApproveChanges|router\.(get|post|put|delete)/
const CONTEXT_LINES = 2

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

function buildRefreshPrompt(moduleLabel: string, codeExcerpt: string): string {
  return `You are documenting an internal admin permission module for a "Manager Roles" reference page shown to a super admin who assigns sub-admin access.

Module: "${moduleLabel}"

Below are the actual route declarations and permission-check lines from this module's source code:
${codeExcerpt}

Produce a JSON object, and ONLY a JSON object (no markdown fences, no commentary), matching exactly this shape:
{
  "description": string,        // one sentence, what this module/role manages
  "responsibilities": string[], // 2-4 short items, day-to-day duties
  "can_extra": string[],        // granular actions this role's access enables beyond basic page access - create/edit/approve/reject/disable/publish/etc, derived ONLY from the routes/checks shown above
  "cant_extra": string[]        // restrictions SPECIFIC to this module only (e.g. read-only, needs a different role to approve) - empty array if none. Do NOT mention other unrelated modules/sections.
}`
}

interface RefreshedRoleData {
  description: string
  responsibilities: string[]
  can_extra: string[]
  cant_extra: string[]
}

// Same model/strip-fences/JSON.parse-with-repair-fallback pattern as
// services/ai_agents/geminiService.js's own analyzePRD.
async function callGeminiForRefresh(prompt: string): Promise<RefreshedRoleData> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent(prompt)
  const raw = result.response.text().replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(raw)
  } catch {
    const repaired = raw.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(repaired)
  }
}

/** Ports GET /add_access_type verbatim (legacy lines 362-372) - a dead/incomplete stub, kept as-is. */
export async function addAccessTypeStub(): Promise<ServiceResponse> {
  const insert_query = 'working' // await sub_admin_access_typeM({ create_type_name : "Coinpedia Academy", type_status:1 }).save()
  return { status: true, message: insert_query }
}

/** Ports GET /access_types (legacy lines 374-394). */
export async function listAccessTypes(): Promise<ServiceResponse> {
  const queryRun = await sub_admin_access_typeM.find(
    { type_status: 1 },
    { _id: 1, create_type_name: 1, description: 1, responsibilities: 1, can_extra: 1, cant_extra: 1 },
  )
  return { status: true, message: queryRun }
}

interface UpdateAccessTypeBody {
  description?: string
  responsibilities?: unknown
  can_extra?: unknown
  cant_extra?: unknown
}

/** Ports POST /update_access_type/:request_row_id (legacy lines 396-433). */
export async function updateAccessType(requestRowIdRaw: string, body: UpdateAccessTypeBody, errObj: Record<string, string>): Promise<ServiceResponse> {
  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)
  await sub_admin_access_typeM.updateOne(
    { _id: request_row_id },
    {
      description: sanitize(body.description),
      responsibilities: sanitize(body.responsibilities),
      can_extra: sanitize(body.can_extra),
      cant_extra: sanitize(body.cant_extra),
    },
  )

  return { status: true, message: { alert_message: 'Role updated successfully.' } }
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
  const parsed = await callGeminiForRefresh(prompt)

  await sub_admin_access_typeM.updateOne(
    { _id: request_row_id },
    {
      description: sanitize(parsed.description),
      responsibilities: sanitize(parsed.responsibilities),
      can_extra: sanitize(parsed.can_extra),
      cant_extra: sanitize(parsed.cant_extra),
    },
  )

  return {
    status: true,
    message: {
      alert_message: 'Role refreshed from source.',
      description: parsed.description,
      responsibilities: parsed.responsibilities,
      can_extra: parsed.can_extra,
      cant_extra: parsed.cant_extra,
    },
  }
}
