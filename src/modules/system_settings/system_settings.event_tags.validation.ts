// modules/system_settings/system_settings.event_tags.validation.ts
//
// Ports controllers/admin_panel/category_tags/event_tags.js's POST /save and
// POST /update/:request_row_id validation exactly: the express-validator
// chain only requires `event_tag` (trimmed, not empty) — the `keywords`
// check is commented out in the legacy file, so it is intentionally not
// validated here either.

export interface EventTagInput {
  event_tag?: string
  keywords?: string
}

export function validateEventTagInput(
  input: EventTagInput
): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}
  if (!input.event_tag || !input.event_tag.trim()) {
    errObj.event_tag = 'The Event tag field is required'
  }
  return { valid: Object.keys(errObj).length === 0, errObj }
}
