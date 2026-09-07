import { LabelResolver } from '../../common/change-request/change-request.diff'

/**
 * `revenue_streams` is submitted as one opaque array of `{category_row_id, stream_amount}` (see
 * company_revenue.service.ts's revenue_streams `_id`-stripping fix for this same field) -
 * resolves each entry's category id and joins into one readable "Category: amount" line per
 * stream, same convention as Jobs' key_skills / Funding Round's investors. Require is lazy, same
 * reasoning as change-request.common-resolvers.ts.
 */
export const resolveRevenueStreamsLabel: LabelResolver = async (value) => {
  const entries = Array.isArray(value) ? value : []
  if (!entries.length) return null

  const ids = entries
    .map((entry: unknown) => Number((entry as { category_row_id?: unknown })?.category_row_id))
    .filter((id) => !Number.isNaN(id) && id !== 0)
  if (!ids.length) return null

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const revenue_streams_categoryM = require('../../../models/app/static/revenue_streams_categoryM')
  const categories = await revenue_streams_categoryM.find({ _id: { $in: ids } }).select('category_name').lean()
  const nameById = new Map(categories.map((c: { _id: number; category_name: string }) => [c._id, c.category_name]))

  const lines = entries
    .map((entry: unknown) => {
      const { category_row_id, stream_amount } = (entry ?? {}) as { category_row_id?: unknown; stream_amount?: unknown }
      const name = nameById.get(Number(category_row_id))
      if (!name) return null
      return `${name}: ${stream_amount}`
    })
    .filter((line): line is string => Boolean(line))

  return lines.length ? lines.join(', ') : null
}

export const REVENUE_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  revenue_streams: resolveRevenueStreamsLabel,
}
