// modules/company/company.faq.queries.ts
const company_faqM = require('../../../../models/app/company/company_faqM')
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

/** Ports faq.js's POST /update_faq_details existing-FAQ-row lookup (was inline in the service, ~line 41). */
export async function findFaqByIdAndCompany({ faqRowId, companyRowId }: { faqRowId: number; companyRowId: number }) {
  return company_faqM.findOne({ _id: faqRowId, company_row_id: companyRowId })
}

/** Ports faq.js's POST /update_faq_details update path (was inline in the service, ~line 61). */
export async function updateFaqById({ faqRowId, updateObject }: { faqRowId: number; updateObject: Record<string, any> }) {
  return company_faqM.updateOne({ _id: faqRowId }, { $set: updateObject })
}

/** Ports faq.js's POST /update_faq_details insert path (was inline in the service, ~line 67). */
export async function insertFaq(updateObject: Record<string, any>) {
  return new company_faqM(updateObject).save()
}

/** Ports faq.js's GET /list/:company_row_id/:skip/:limit aggregate call (was inline in the service, ~line 125). */
export async function aggregateFaqList({ searchMatch, skip, limit }: { searchMatch: Record<string, any>; skip: number; limit: number }) {
  return company_faqM.aggregate(buildFaqListPipeline({ searchMatch, skip, limit }))
}

/** Ports faq.js's GET /delete_faq/:faq_row_id lookup (was inline in the service, ~line 157). */
export async function findFaqById(faqRowId: number) {
  return company_faqM.findOne({ _id: faqRowId })
}
