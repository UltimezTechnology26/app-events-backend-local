const company_seo_detailsM = require('../../../models/app/company/company_seo_detailsM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const company_faqM = require('../../../models/app/company/company_faqM')
const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
const company_productsM = require('../../../models/markets/products_n_holding/company_productsM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const companyM = require('../../../models/app/company/companyM')
const jobsM = require('../../../models/app/jobs/jobsM')
const companyAcquisitionsM = require('../../../models/app/company/companyAcquisitionsM')

import { ChangeRequestDoc } from './change-request.types'
import { SectionConfig } from './change-request.registry'

const ACTION_CREATE = 'create'
const ACTION_UPDATE = 'update'
const ACTION_DELETE = 'delete'

export interface SectionModel {
  updateOne: (...args: unknown[]) => Promise<unknown>
  create?: (...args: unknown[]) => Promise<unknown>
  deleteOne?: (...args: unknown[]) => Promise<unknown>
}

/**
 * Section collection -> live model. A section name reaching here has already passed
 * isCompanySection(), so this map is a second explicit whitelist rather than a dynamic lookup
 * (the backend CLAUDE.md forbids resolving a model from request input).
 */
export const SECTION_MODELS: Record<string, SectionModel> = {
  cln_company_seo_details: company_seo_detailsM,
  cln_company_social_links: company_social_linksM,
  cln_company_faq_lists: company_faqM,
  cln_company_holdings: company_holdingM,
  cln_company_products: company_productsM,
  cln_company_revenue_details: company_revenue_growthM,
  cln_funding_investment_lists: fundingInvestmentM,
  cln_professionals_work_experiences: professionals_work_experienceM,
  cln_company_lists: companyM,
  cln_jobs: jobsM,
  cln_company_acquisitions: companyAcquisitionsM,
}

async function applyDocumentWrite({
  request,
  config,
  model,
  session,
}: {
  request: ChangeRequestDoc
  config: SectionConfig
  model: SectionModel
  session: unknown
}): Promise<{ appliedFieldCount: number }> {
  const payload = request.payload ?? {}
  await model.updateOne(
    { [config.keyField]: request.root_document_id },
    { $set: payload },
    { upsert: true, session },
  )
  return { appliedFieldCount: Object.keys(payload).length }
}

async function applyChildWrite({
  request,
  config,
  model,
  session,
}: {
  request: ChangeRequestDoc
  config: SectionConfig
  model: SectionModel
  session: unknown
}): Promise<{ appliedFieldCount: number }> {
  const payload = request.payload ?? {}

  switch (request.action) {
    case ACTION_CREATE: {
      if (!model.create) {
        throw new Error(`Section ${config.collection} has no create() registered`)
      }
      // Mongoose's Model.create() only honours a `session` option when the first argument is an
      // array — a bare object here silently drops the session (breaking the publish transaction)
      // and can even be misread as a second document to insert. Always pass a one-element array.
      await model.create([{ ...payload, [config.keyField]: request.root_document_id }], { session })
      return { appliedFieldCount: Object.keys(payload).length }
    }
    case ACTION_UPDATE: {
      await model.updateOne({ _id: request.target_row_id }, { $set: payload }, { session })
      return { appliedFieldCount: Object.keys(payload).length }
    }
    case ACTION_DELETE: {
      // Scoped to both the row id and the company, defence in depth against a mismatched
      // target_row_id ever reaching this point.
      if (config.softDeleteField) {
        await model.updateOne(
          { _id: request.target_row_id, [config.keyField]: request.root_document_id },
          { $set: { [config.softDeleteField]: true } },
          { session },
        )
        return { appliedFieldCount: 1 }
      }
      if (!model.deleteOne) {
        throw new Error(`Section ${config.collection} has no deleteOne() registered`)
      }
      await model.deleteOne({ _id: request.target_row_id, [config.keyField]: request.root_document_id }, { session })
      return { appliedFieldCount: 0 }
    }
    default: {
      throw new Error(`Unsupported change request action: ${String(request.action)}`)
    }
  }
}

/**
 * Performs the actual live-data mutation for one change request, inside the caller's
 * transaction session. Document-scope sections (SEO, Social Media) always upsert one row by
 * keyField. List sections (FAQ) branch on the request's own action — create inserts a new row
 * tagged with the company, update sets fields on the row by its own _id (no upsert — the row
 * must already exist), delete removes it.
 */
export async function applySectionWrite({
  request,
  config,
  model,
  session,
}: {
  request: ChangeRequestDoc
  config: SectionConfig
  model: SectionModel
  session: unknown
}): Promise<{ appliedFieldCount: number }> {
  return config.isList
    ? applyChildWrite({ request, config, model, session })
    : applyDocumentWrite({ request, config, model, session })
}
