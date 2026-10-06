// Gemini prompt for the Manager Roles top "Sub Admin Type" panel's refresh (↻)
// button: turns every module's saved Restricted / Full Access text into one
// overall, module-independent explanation per sub-admin type.

export interface ModuleTypeText {
  restricted_access: string[]
  full_access: string[]
}

function bulletList(items: string[]): string {
  return items.length > 0 ? `- ${items.join('\n- ')}` : '- (none listed)'
}

export function buildTypeGuidePrompt(modules: ModuleTypeText[]): string {
  // Modules are anonymised on purpose: this is a GENERAL guide, so the model
  // never sees a module name it could repeat.
  const moduleText = modules
    .map((m, index) => `## Module ${index + 1}
Restricted Access in this module:
${bulletList(m.restricted_access)}
Full Access in this module:
${bulletList(m.full_access)}`)
    .join('\n\n')

  return `You are writing the overall explanation of two sub-admin types for a "Manager Roles" admin page. A super admin reads it to decide which type to give a new team member, so it must say concretely what that person will be able to DO day to day.

Background:
- Every sub-admin is given one or more modules (access types). They only ever see and act inside those modules - everything else is hidden from their sidebar. The type (Restricted or Full Access) decides how much they can do INSIDE those modules.

Below is what is possible in every module of the admin panel:
${moduleText}

Produce a JSON object, and ONLY a JSON object (no markdown fences, no commentary), matching exactly this shape:
{
  "restricted": { "summary": string, "tagline": string, "best_for": string, "can": string[], "cannot": string[] },
  "full":       { "summary": string, "tagline": string, "best_for": string, "can": string[], "cannot": string[] }
}

Rules:
- This is a GENERAL explanation of the two types, not a per-module one. Do NOT name any module or kind of record (for example users, user accounts, professionals, profiles, companies, company information, events, tickets, guests, community, posts, Coinpedia, Academy, listings, tokens, exchanges). The module text above is only your evidence - always say "records" and "the modules assigned to them" instead.
- summary: 2-3 plain sentences describing how this type works day to day - what they do, what happens to their changes (e.g. waiting for approval vs going live after review), and that they only work inside the modules assigned to them.
- tagline: one short sentence (max 10 words). best_for: one sentence on who should get this type.
- can: 6-8 CONCRETE actions, each starting with a verb (Create, Edit, Submit, Cancel, Approve, Reject, Publish...), described in general terms such as "Create new records in their assigned modules".
- cannot: 4-6 concrete limits in general terms. When a limit only applies in some modules, say "in some modules" and add "(each module card below says where)".
- Approving, rejecting and publishing changes is Full Access only in EVERY module - never qualify it with "in some modules".
- Leave out anything that appears in only one module and is not about Restricted vs Full Access.
- Both types only act inside the modules assigned to them, and neither can open System Settings or manage other sub-admins - include both points in each "cannot" list.
- full.can must start with "Everything Restricted Access can do, in the modules assigned to them" and then list only what Full Access adds.
- Use only facts present in the module text above; do not invent permissions or modules.
- Write for a non-technical admin: no code identifiers, field names or numeric ids.`
}
