import { FieldChange } from '../status-audit/status-audit.types'

const MONGOOSE_INTERNAL_PREFIX = '$'
const MONGOOSE_DOC_KEY = '_doc'

const TRUTHY_BOOLEANS: readonly unknown[] = [true, 'true', 1, '1']

/** Values that all mean "no value", collapsed so '' / null / undefined / NaN never differ. */
const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))

/**
 * A submitted string that round-trips cleanly through `Number()` (e.g. "42" -> 42 -> "42")
 * genuinely represents that number, so it should compare equal to the real number 42. A string
 * that DOESN'T round-trip (e.g. "007" -> 7 -> "7") is not purely numeric formatting - it's
 * carrying real information (a leading zero, a phone/zip/id format) - so it must stay a string
 * and compare as different from the number 7. Only matters for the `default` (no declared
 * Mongoose type) branch below - typed 'Number' fields already go through the explicit case.
 */
function coerceRoundTrippedNumericString(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  const asNumber = Number(trimmed)
  return !Number.isNaN(asNumber) && String(asNumber) === trimmed ? asNumber : value
}

/** Order-independent deep serialisation, so { a, b } and { b, a } compare equal. */
export function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !k.startsWith(MONGOOSE_INTERNAL_PREFIX) && k !== MONGOOSE_DOC_KEY)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${k}:${stableKey(v)}`).join(',')}}`
}

/**
 * Normalise a raw value using the field's DECLARED Mongoose type rather than inferring from
 * the runtime value. Request bodies deliver everything as strings while Mongo returns real
 * Numbers and Dates; comparing those raw is what produced phantom changes (design §13.3).
 */
export function normalise(value: unknown, instance: string | undefined): unknown {
  if (isBlank(value)) {
    return null
  }

  switch (instance) {
    case 'Number': {
      const n = Number(value)
      return Number.isNaN(n) ? null : n
    }
    case 'Date': {
      const t = new Date(value as string | number | Date).getTime()
      return Number.isNaN(t) ? null : t
    }
    case 'Boolean':
      return TRUTHY_BOOLEANS.includes(value)
    case 'String':
      return String(value).trim()
    case 'ObjectId':
      return String(value)
    case 'Array':
      return (Array.isArray(value) ? value : [value]).map((el) => stableKey(el))
    default:
      // No declared schema type - fall back to a value-based numeric-string guard before
      // stableKey, so an untyped field submitted as "42" still compares equal to the stored
      // number 42 (typed 'Number' fields never reach here - they go through the case above).
      return stableKey(coerceRoundTrippedNumericString(value))
  }
}

/**
 * Restricts reviewer-facing `changes` (and audit-log entries) to a section's declared display
 * allowlist (SectionConfig.displayFields) - internal bookkeeping fields with no corresponding
 * form input (e.g. `user_account_type`, `till_date_status`) still ride along in the payload via
 * `editableFields`, they're just not surfaced to a non-developer reviewer (confirmed report:
 * raw field names like "user_row_id"/"company_type" are "of no use" to an admin). Falls back to
 * the full list whenever filtering would leave nothing to show - a real change happened, every
 * changed field just isn't display-eligible, and showing nothing is MORE confusing than showing
 * the raw field (the exact "blank diff" bug already fixed once for deletes) - or when the section
 * hasn't configured a `displayFields` allowlist at all.
 */
export function filterDisplayChanges(changes: FieldChange[], displayFields?: readonly string[]): FieldChange[] {
  if (!displayFields) return changes
  const filtered = changes.filter((change) => displayFields.includes(change.field))
  return filtered.length > 0 ? filtered : changes
}

export type SchemaPathLookup = (field: string) => { instance?: string } | undefined
/**
 * `record` is the FULL side (before or submitted) the value came from, so a resolver can branch
 * on a sibling field - e.g. `product_row_id` resolving against a totally different collection
 * depending on the sibling `product_type` (Token/Chain/Exchange), rather than guessing across
 * every candidate collection and risking a same-numbered row in the WRONG one matching first
 * (confirmed report: a newly added Chain/Exchange product resolved to an unrelated Token that
 * happened to share its row id). Optional and ignored by every resolver that doesn't need it.
 */
export type LabelResolver = (value: unknown, record?: Record<string, unknown>) => Promise<string | null>

export interface ComputeDiffParams {
  /** MUST be a plain object — `.lean()` or `.toObject()`, never a live Mongoose document. */
  before: Record<string, unknown>
  /** The request payload. Only keys PRESENT here are compared. */
  submitted: Record<string, unknown>
  schemaPaths: SchemaPathLookup
  /** Whitelist. Fails safe: an undeclared field is ignored, so cron-written fields never diff. */
  editableFields: readonly string[]
  labelResolvers?: Record<string, LabelResolver>
  /** Human-readable name per field, copied onto each FieldChange as `field_label` - see SectionConfig.fieldLabels. */
  fieldLabels?: Record<string, string>
}

/**
 * Iterates the SUBMITTED keys, not the union of both sides. A field absent from the payload
 * means "not touched" — never "set to null". Iterating the union is what would let a partial
 * form submission report every omitted field as cleared, and then blank them on publish
 * (design §13.3 failure mode 1).
 */
export async function computeDiff({
  before,
  submitted,
  schemaPaths,
  editableFields,
  labelResolvers = {},
  fieldLabels = {},
}: ComputeDiffParams): Promise<FieldChange[]> {
  const changes: FieldChange[] = []

  for (const field of Object.keys(submitted)) {
    if (!editableFields.includes(field)) {
      continue
    }

    const instance = schemaPaths(field)?.instance
    const oldNorm = normalise(before[field], instance)
    const newNorm = normalise(submitted[field], instance)
    if (stableKey(oldNorm) === stableKey(newNorm)) {
      continue
    }

    const resolver = labelResolvers[field]
    changes.push({
      field,
      field_label: fieldLabels[field] ?? null,
      old_value: before[field] ?? null,
      old_label: resolver ? await resolver(before[field], before) : null,
      new_value: submitted[field] ?? null,
      new_label: resolver ? await resolver(submitted[field], submitted) : null,
    })
  }

  return changes
}
