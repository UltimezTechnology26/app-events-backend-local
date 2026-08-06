// modules/company/company.faq.queries.ts
import { buildPaginatedFacetStages } from '../../common/common.pagination'

/** Ports faq.js's GET /list/:company_row_id/:skip/:limit search-match shape (lines 134-139). */
export function buildFaqSearchMatch({ companyRowId, search }: { companyRowId: number; search?: string }) {
  const query: Record<string, any>[] = [{ company_row_id: companyRowId }]
  if (search) {
    query.push({ faq_question: { $regex: search, $options: 'i' } })
  }
  return { $and: query }
}

/**
 * Ports faq.js's two separate calls (an `.aggregate().skip().limit()` plus a sibling
 * `.countDocuments()`) as one $facet pipeline, per this project's standing list+count fix.
 */
export function buildFaqListPipeline({ searchMatch, skip, limit }: { searchMatch: Record<string, any>; skip: number; limit: number }) {
  return [
    { $match: searchMatch },
    { $sort: { _id: -1 } },
    { $project: { _id: 1, faq_question: 1, faq_answer: 1 } },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}
