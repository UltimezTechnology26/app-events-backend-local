const fs = require('fs')
const path = require('path')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// Separate client from services/ai_agents/geminiService.js on purpose - that
// file also wires up Pinecone/BigQuery clients this feature has no use for,
// and pulling it in just for genAI would mean paying that startup cost here
// too. Same env var/model as that file, so it shares the one real client
// config this backend already has.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Relative to this backend's project root - the actual source files
// containing each module's real permission checks (checkAdminLoginToken
// calls) and route declarations. Only these four ids are this backend's
// responsibility - Blockchain/Exchange/Tokens/Portfolio/Portfolio & Markets
// live in markets-backend-local's own matching module.
const MODULE_SOURCE_FILES = {
    1: { label: 'Users', files: ['src/modules/professionals/professionals.controller.ts', 'src/modules/professionals/professionals.approvals.controller.ts'] },
    7: { label: 'Companies', files: ['src/modules/company_admin/company_admin.controller.ts', 'src/modules/company_admin/company_admin.approvals.controller.ts', 'src/modules/company/company.controller.ts'] },
    10: { label: 'Events', files: ['controllers/admin_panel/events/event.js'] },
    13: { label: 'Coinpedia & Academy', files: ['src/modules/community-admin/community-admin.posts.controller.ts', 'src/modules/community-admin/community-admin.groups.controller.ts', 'src/modules/community-admin/community-admin.challenge.controller.ts', 'src/modules/community-admin/community-admin.request-article.controller.ts'] },
}

const RELEVANT_LINE_PATTERN = /checkAdminLoginToken|canApproveChanges|router\.(get|post|put|delete)/
const CONTEXT_LINES = 2

// Keeps a huge legacy file (event.js is 13k+ lines) down to just its real
// permission/route lines plus a little surrounding context, instead of
// feeding the whole file to the LLM.
function extractRelevantLines(absolutePath) {
    const lines = fs.readFileSync(absolutePath, 'utf8').split('\n')
    const keep = new Set()

    lines.forEach((line, index) => {
        if (RELEVANT_LINE_PATTERN.test(line)) {
            for (let i = Math.max(0, index - CONTEXT_LINES); i <= Math.min(lines.length - 1, index + CONTEXT_LINES); i++) {
                keep.add(i)
            }
        }
    })

    return [...keep].sort((a, b) => a - b).map((index) => lines[index]).join('\n')
}

function buildCodeExcerpt(projectRoot, relativeFiles) {
    return relativeFiles
        .map((relativeFile) => {
            const absolutePath = path.join(projectRoot, relativeFile)
            return `--- ${relativeFile} ---\n${extractRelevantLines(absolutePath)}`
        })
        .join('\n\n')
}

function buildRefreshPrompt(moduleLabel, codeExcerpt) {
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

// Same model/strip-fences/JSON.parse-with-repair-fallback pattern as
// services/ai_agents/geminiService.js's own analyzePRD.
async function callGeminiForRefresh(prompt) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const raw = result.response.text().replace(/```json|```/g, '').trim()

    try {
        return JSON.parse(raw)
    }
    catch (jsonError) {
        const repaired = raw.replace(/,(\s*[}\]])/g, '$1')
        return JSON.parse(repaired)
    }
}

module.exports = { MODULE_SOURCE_FILES, buildCodeExcerpt, buildRefreshPrompt, callGeminiForRefresh }
