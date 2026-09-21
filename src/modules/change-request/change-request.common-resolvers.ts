import { LabelResolver } from './change-request.diff'

interface LeanNamedDoc {
  _id: number
  [labelField: string]: unknown
}

type LeanFindableModel = { findById: (id: number) => { select: (f: string) => { lean: () => Promise<LeanNamedDoc | null> } } }
type LeanQueryableModel = { find: (q: Record<string, unknown>) => { select: (f: string) => { lean: () => Promise<LeanNamedDoc[]> } } }

/**
 * Builds a `LabelResolver` for a single foreign-key id field backed by a static lookup
 * collection with one flat `{_id, <labelField>}` shape (business models, funding rounds,
 * investor types, education types, tokens, etc.) — the large majority of ID fields across every
 * section. Sections whose id is genuinely a list (key_skills, revenue_streams[].category_row_id)
 * use `buildArrayLabelResolver` below instead.
 *
 * `getModel` is called lazily, INSIDE the returned resolver, never at module load time - matching
 * this codebase's existing lazy-require convention for exactly this reason (e.g. funding.service.
 * ts's resolveOwnCompanyId): change-request.registry.ts (and everything that imports it, including
 * change-request.apply.ts) would otherwise eagerly load every model this file's callers reference
 * the moment the registry module loads, which breaks any test that mocks mongoose/a subset of
 * models without also mocking these — a resolver only actually needs its model at the one moment
 * computeDiff calls it, never at import time.
 */
export function buildSingleLabelResolver(getModel: () => LeanFindableModel, labelField: string): LabelResolver {
  return async (value) => {
    const row_id = Number(value)
    if (!row_id) return null
    const doc = await getModel().findById(row_id).select(labelField).lean()
    return doc ? ((doc[labelField] as string) ?? null) : null
  }
}

/**
 * Same lookup shape as `buildSingleLabelResolver`, but `value` is an array of ids (submitted as
 * one opaque field, e.g. `key_skills`) - resolves each and joins into one readable line rather
 * than one label per array element (computeDiff's labelResolvers map is keyed by field name, not
 * by array index). `getModel` is lazy for the same reason as above.
 */
export function buildArrayLabelResolver(getModel: () => LeanQueryableModel, labelField: string): LabelResolver {
  return async (value) => {
    const ids = (Array.isArray(value) ? value : [value]).map(Number).filter((id) => !Number.isNaN(id) && id !== 0)
    if (!ids.length) return null
    const docs = await getModel().find({ _id: { $in: ids } }).select(labelField).lean()
    const nameById = new Map(docs.map((d) => [d._id, d[labelField] as string]))
    const names = ids.map((id) => nameById.get(id)).filter((name): name is string => Boolean(name))
    return names.length ? names.join(', ') : null
  }
}

/** `companyM`'s own name field, for any section referencing another company by row id (acquirer/acquired, funds-raised counterparty). */
export const resolveCompanyName: LabelResolver = async (value) => {
  const row_id = Number(value)
  if (!row_id) return null
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const companyM = require('../../../models/app/company/companyM')
  const company = await companyM.findById(row_id).select('company_name').lean()
  return company?.company_name ?? null
}

export const resolveCountryName: LabelResolver = buildSingleLabelResolver(
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  () => require('../../../models/app/static/countryM'),
  'country_name',
)

/** For a small fixed enum with no backing collection (registered-type flags, company-size bands) - not a DB call, just a label map. */
export function buildEnumLabelResolver(labels: Record<number, string>): LabelResolver {
  return async (value) => {
    const key = Number(value)
    if (Number.isNaN(key)) return null
    return labels[key] ?? null
  }
}

/**
 * A Date-typed field's `old_value` comes from Mongo (a full ISO timestamp, e.g.
 * "2021-05-11T00:00:00.000Z") while `new_value` comes straight from the submitted form (often
 * just a plain "YYYY-MM-DD" string) - same underlying date, two different-looking formats side by
 * side in a reviewer's diff. Formats both sides to the same plain "YYYY-MM-DD" so the diff reads
 * as a real comparison instead of what looks like a format change. Applies to every Date-typed
 * field across every section (established_in, application_deadline, announcement_date,
 * acquisition_date, start_date, purchased_date, etc).
 */
export const resolveDateLabel: LabelResolver = async (value) => {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value as string | number | Date)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}
