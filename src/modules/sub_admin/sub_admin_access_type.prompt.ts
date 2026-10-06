// Gemini prompt for the Manager Roles refresh (↻) button. Keep in lockstep with
// markets-backend-local's src/modules/manager_roles/manager_roles.prompt.ts so
// all nine role cards are generated the same way.

export function buildRefreshPrompt(moduleLabel: string, codeExcerpt: string): string {
  return `You are documenting an internal admin permission module for a "Manager Roles" reference page shown to a super admin who assigns sub-admin access.

Module: "${moduleLabel}"

Below are the actual route declarations and permission-check lines from this module's source code:
${codeExcerpt}

Produce a JSON object, and ONLY a JSON object (no markdown fences, no commentary), matching exactly this shape:
{
  "description": string,        // one sentence, what this module/role manages
  "responsibilities": string[], // 2-4 short items, day-to-day duties
  "can_extra": string[],        // granular actions EVERY holder of this access has beyond basic page access - create/edit/request enable-disable-delete/etc, derived ONLY from the routes/checks shown above
  "cant_extra": string[],       // restrictions SPECIFIC to this module only (e.g. read-only) - empty array if none. Do NOT mention other unrelated modules/sections.
  "restricted_access": string[], // 2-4 items: what a RESTRICTED ACCESS sub-admin can and cannot do in THIS module
  "full_access": string[]        // 2-4 items: what a FULL ACCESS sub-admin can do in THIS module, starting with "Everything Restricted Access can do" when that is true
}

How to read the sub-admin type checks in the code:
- Restricted Access is sub_admin_type 1, Full Access is sub_admin_type 3 (2 is a retired type - ignore it).
- The numbers inside checkAdminLoginToken(headers, [...]) / requireAdminAccess([...]) are MODULE (access type) ids, NOT sub-admin types. They only decide which module a route belongs to and never mean Restricted vs Full Access.
- canApproveChangeRequests / canApproveChanges pass only for the main admin or Full Access: whatever they guard is Full Access only. That includes approving or rejecting change requests, publishing changes, and the first-time approve / reject of a newly submitted record (DIRECT_ACTIONS).
- Enable, disable and delete are REQUESTS any sub-admin may submit; they wait in the pending queue, and only approving or rejecting those requests is Full Access only. Never write that Restricted Access "cannot enable/disable/delete" - write that their request needs approval.
- Any sub-admin may cancel their own pending change requests.
- requireFullAdmin passes only for the main admin: neither sub-admin type can do what it guards - mention it in both lists if it applies.
- A check like \`sub_admin_type != 3\` followed by an ownership comparison means everyone except Full Access may only act on records they created or that are assigned to them.
- If no check in this module distinguishes the two types, set BOTH lists to exactly one item: "Restricted Access and Full Access have the same permissions in this module."

Rules:
- Approve, reject and publish lines belong ONLY in restricted_access / full_access - never in can_extra or cant_extra.
- Derive everything ONLY from the code shown above; do not guess.
- Write for a non-technical admin: never mention code identifiers, field names or numeric ids (e.g. admin_manager_type, sub_admin_type, access ids).`
}
