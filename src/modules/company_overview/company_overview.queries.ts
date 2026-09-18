// modules/company_overview/company_overview.queries.ts
//
// company_overview has no pre-existing .queries.ts (unlike company_manual/company_claim_requests) —
// it was built around company_overview.config.ts (pipeline builders), .stages.ts (shared stage
// fragments), and .watchlist.ts. Neither company_overview.config.ts nor .stages.ts ever call a
// Mongoose model directly (they only build and return pipeline arrays), so they needed no change
// here. company_overview.service.ts and .watchlist.ts DID call `.aggregate(`/`.find(` directly —
// this file is the new home for every one of those direct model calls, following this codebase's
// established repository-layer naming/shape (compare modules/company_manual/company_manual.queries.ts).
import {
  REPORT_TYPE_CONFIG,
  OverviewPipelineContext,
  OverviewEventContext,
  OverviewSponsorPartnerContext,
  OverviewProductCountContext,
  buildType2ValuationPipeline,
  buildType2OrganizersPipeline,
  buildType2SponsorPartnerPipeline,
  buildType3ValuationPipeline,
  buildType3FundsRaisedPipeline,
  buildType4ValuationPipeline,
  buildType4InvestedPipeline,
  buildType4RoundsPipeline,
  buildType5ValuationPipeline,
  buildType5RevenuePipeline,
  buildType6ValuationPipeline,
  buildType6ProductCountPipeline,
  buildType7ValuationPipeline,
  buildType7HoldingPipeline,
  buildType8ValuationPipeline,
} from './company_overview.config'
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'

const countryM = require('../../../models/app/static/countryM')
const eventM = require('../../../models/app/events/eventM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const company_productsM = require('../../../models/markets/products_n_holding/company_productsM')
const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
const jobsM = require('../../../models/app/jobs/jobsM')
const companyM = require('../../../models/app/company/companyM')

/** Projection used by overview()'s location-name-to-country_id resolution. */
export interface CountryBasicInfo {
  _id: number
  country_name: string
}

export async function findCountriesForLocationMatch(): Promise<CountryBasicInfo[]> {
  return countryM.find({}, { _id: 1, country_name: 1 }).lean()
}

/** Dispatches to REPORT_TYPE_CONFIG[reportType]'s model — used for report_list_type=1 (and any future type added to the config map). */
export async function aggregateOverviewByConfig(reportType: number, ctx: OverviewPipelineContext): Promise<unknown[] | null> {
  const config = REPORT_TYPE_CONFIG[reportType]
  if (!config) return null
  return config.model.aggregate(config.buildPipeline(ctx))
}

// ─── report_list_type=2 (events) — eventM ────────────────────────────────────

export async function aggregateType2Valuation(ctx: OverviewEventContext): Promise<unknown[]> {
  return eventM.aggregate(buildType2ValuationPipeline(ctx))
}

export async function aggregateType2Organizers(ctx: OverviewEventContext): Promise<unknown[]> {
  return eventM.aggregate(buildType2OrganizersPipeline(ctx))
}

export async function aggregateType2SponsorPartner(ctx: OverviewSponsorPartnerContext): Promise<unknown[]> {
  return eventM.aggregate(buildType2SponsorPartnerPipeline(ctx))
}

// ─── report_list_type=3 (funds raised) — fundingInvestmentM ──────────────────

export async function aggregateType3Valuation(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return fundingInvestmentM.aggregate(buildType3ValuationPipeline(ctx))
}

export async function aggregateType3FundsRaised(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return fundingInvestmentM.aggregate(buildType3FundsRaisedPipeline(ctx))
}

// ─── report_list_type=4 (funds invested) — fundingInvestmentM ────────────────

export async function aggregateType4Valuation(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return fundingInvestmentM.aggregate(buildType4ValuationPipeline(ctx))
}

export async function aggregateType4Invested(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return fundingInvestmentM.aggregate(buildType4InvestedPipeline(ctx))
}

export async function aggregateType4Rounds(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return fundingInvestmentM.aggregate(buildType4RoundsPipeline(ctx))
}

// ─── report_list_type=5 (revenue) — company_revenue_growthM ──────────────────

export async function aggregateType5Valuation(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return company_revenue_growthM.aggregate(buildType5ValuationPipeline(ctx))
}

export async function aggregateType5Revenue(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return company_revenue_growthM.aggregate(buildType5RevenuePipeline(ctx))
}

// ─── report_list_type=6 (products) — company_productsM ───────────────────────

export async function aggregateType6Valuation(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return company_productsM.aggregate(buildType6ValuationPipeline(ctx))
}

export async function aggregateType6ProductCount(ctx: OverviewProductCountContext): Promise<unknown[]> {
  return company_productsM.aggregate(buildType6ProductCountPipeline(ctx))
}

// ─── report_list_type=7 (holdings) — company_holdingM ─────────────────────────

export async function aggregateType7Valuation(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return company_holdingM.aggregate(buildType7ValuationPipeline(ctx))
}

export async function aggregateType7Holding(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return company_holdingM.aggregate(buildType7HoldingPipeline(ctx))
}

// ─── report_list_type=8 (companies hiring) — jobsM ────────────────────────────

export async function aggregateType8Valuation(ctx: OverviewPipelineContext): Promise<unknown[]> {
  return jobsM.aggregate(buildType8ValuationPipeline(ctx))
}

// ─── valuation_type=3 (watchlist) — companyM ──────────────────────────────────

/**
 * Ports company_overview.watchlist.ts's inline companyM.aggregate call verbatim — moved here
 * (pipeline construction included, since it was never factored into a standalone builder the way
 * the report-type pipelines were) so the model access itself lives in the queries file.
 */
export function buildWatchlistValuationPipeline({ userRowId, searchQuery }: { userRowId: number; searchQuery: Record<string, unknown> }) {
  return [
    {
      $match: {
        approval_status: 1, active_status: 1,
      },
    },
    {
      $lookup:
      {
        from: 'cln_company_watchlists',
        localField: '_id',
        foreignField: 'company_row_id',
        as: 'info_watchlists',
        pipeline: [
          {
            $match: {
              user_row_id: userRowId,
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: '$info_watchlists' } },
    ...buildProfessionalEnrichmentStages(),
    { $match: searchQuery },
    {
      $group: {
        _id: null,
        total_valuation: { $sum: '$company_valuation' },
      },
    },
  ]
}

export interface WatchlistValuationRow {
  total_valuation?: number
}

export async function aggregateWatchlistValuation(userRowId: number, searchQuery: Record<string, unknown>): Promise<WatchlistValuationRow[]> {
  return companyM.aggregate(buildWatchlistValuationPipeline({ userRowId, searchQuery }))
}
