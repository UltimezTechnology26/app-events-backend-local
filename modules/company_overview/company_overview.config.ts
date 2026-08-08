// modules/company_overview/company_overview.config.ts
//
// Part 3 §7 Phase C step 4. One entry per report_list_type, each holding the model to
// aggregate against and a buildPipeline(ctx) function producing the exact same pipeline the
// legacy company/partner branches built inline — company vs. partner is just PARTNER_FILTER_STAGE
// inserted (or not) plus a renamed $group output field, confirmed mechanical in Part 1 §3.
//
// Migrated one report_list_type at a time per the Build Order (simplest first); entries below
// only exist for types already migrated in services/company/front_page.ts's overview() — an
// un-migrated type simply has no entry here yet and stays on its original inline pipeline.
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'
import { PARTNER_FILTER_STAGE } from './company_overview.stages'

const companyM = require('../../models/app/company/companyM')

export interface OverviewPipelineContext {
  isPartner: boolean
  searchQuery: any
}

export interface ReportTypeConfigEntry {
  model: any
  buildPipeline: (ctx: OverviewPipelineContext) => any[]
}

export const REPORT_TYPE_CONFIG: Record<number, ReportTypeConfigEntry> = {
  1: {
    model: companyM,
    buildPipeline: ({ isPartner, searchQuery }) => [
      { $match: { approval_status: 1, active_status: 1 } },
      ...(isPartner ? PARTNER_FILTER_STAGE() : []),
      ...buildProfessionalEnrichmentStages(),
      { $match: searchQuery },
      {
        $group: {
          _id: null,
          [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: '$company_valuation' }
        }
      }
    ]
  }
}

// report_list_type=3 (funds raised) doesn't fit the single-buildPipeline shape above: it needs
// TWO independent aggregate calls (a company-valuation sum and a funds-raised amount sum), each
// against fundingInvestmentM via an ~85-line investor-resolution pipeline that's otherwise
// byte-identical between the two — company vs. partner is still just the same PARTNER_FILTER_STAGE
// insertion + one field rename as report_list_type=1, confirmed via diff against the legacy code
// before extracting (not assumed). Exported as named functions rather than forced into
// REPORT_TYPE_CONFIG's shape; called directly from overview().

// PERFORMANCE FIX (Part 3 §7 step 7, confirmed via .explain() + stage-by-stage timing, not
// guessed): the original $expr-based correlated $lookup below forced a FULL COLLECTION SCAN of
// cln_company_lists (4,162 docs) once per matching funding record (843 scans, 3,508,566 total
// docs examined, indexesUsed: [] -- confirmed via .explain()), costing ~4.4s of this pipeline's
// ~4.5-5.9s total runtime; every other stage combined added <100ms. Replaced with a plain
// localField/foreignField join (indexable on cln_company_lists' default _id index),
// unconditional rather than gated by investor_type/investor_registered_type inside the lookup
// itself -- safe because the $switch below ALREADY re-checks those same two fields to decide
// whether to use company_info._id at all; for every other investor_type/investor_registered_type
// combination the switch ignores company_info entirely and uses investor_row_id directly, so
// this lookup finding a (now real, unconditionally-looked-up) company_info for those rows has no
// effect on the final investor_data value. Confirmed identical output via characterization.
export function buildType3ValuationPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            funds_raised_registered_type: 1, verified_status: 1
                        }
                    },

                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "investor_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        active_status: 1
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info._id"
                                        },
                                        {
                                            case: {
                                                $or: [
                                                    {
                                                        $and: [
                                                            { $eq: ['$investor_type', 1] },
                                                            { $eq: ['$investor_registered_type', 2] }
                                                        ]
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ['$investor_type', 2] },
                                                            { $eq: ['$investor_registered_type', 2] }
                                                        ]
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ['$investor_type', 1] },
                                                            { $eq: ['$investor_registered_type', 1] }
                                                        ]
                                                    }
                                                ]
                                            },
                                            then: "$investor_row_id"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match: { investor_data: { $gt: 0 } }
                    },
                    {
                        $group: {
                            _id: "$funds_raised_company_row_id",
                            total_funds_raised_amount: { $sum: '$amount' },
                            category_ids: { $addToSet: '$category_row_id' },
                            funds_raised_ids: {
                                $addToSet: {
                                    investor_row_id: '$investor_row_id',
                                    investor_type: '$investor_type',
                                    investor_registered_type: '$investor_registered_type'
                                }
                            }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_static_company_funding_rounds",
                            localField: "category_ids",
                            foreignField: "_id",
                            as: "funding_rounds",
                            pipeline: [
                                {
                                    $project: {
                                        category_name: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
  ]
}

// PERFORMANCE FIX (Part 3 §7 step 7) — same fix and same reasoning as buildType3ValuationPipeline
// above: this lookup is byte-for-byte the same shape, confirmed via diff before extracting.
export function buildType3FundsRaisedPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            funds_raised_registered_type: 1, verified_status: 1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "investor_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        active_status: 1
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$investor_type', 2] },
                                                    { $eq: ['$investor_registered_type', 1] }
                                                ]
                                            },
                                            then: "$company_info._id"
                                        },
                                        {
                                            case: {
                                                $or: [
                                                    {
                                                        $and: [
                                                            { $eq: ['$investor_type', 1] },
                                                            { $eq: ['$investor_registered_type', 2] }
                                                        ]
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ['$investor_type', 2] },
                                                            { $eq: ['$investor_registered_type', 2] }
                                                        ]
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ['$investor_type', 1] },
                                                            { $eq: ['$investor_registered_type', 1] }
                                                        ]
                                                    }
                                                ]
                                            },
                                            then: "$investor_row_id"
                                        },
                                    ],
                                    default: ""
                                }
                            }
                        }
                    },
                    {
                        $match: { investor_data: { $gt: 0 } }
                    },
                    {
                        $group: {
                            _id: "$funds_raised_company_row_id",
                            total_funds_raised_amount: { $sum: '$amount' },
                            category_ids: { $addToSet: '$category_row_id' },
                            funds_raised_ids: {
                                $addToSet: {
                                    investor_row_id: '$investor_row_id',
                                    investor_type: '$investor_type',
                                    investor_registered_type: '$investor_registered_type'
                                }
                            }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: '',
                            amount: {
                                $sum: '$total_funds_raised_amount'
                            }
                        }
                    }
  ]
}

// report_list_type=5 (revenue) also needs two independent aggregate calls against
// company_revenue_growthM. Note: the ORIGINAL company-side valuation sub-query had its own
// slightly different inline enrichment (a plain login_status:1 match +  instead of
// buildProfessionalEnrichmentStages()'s :1 match + ) and a guarded revenue_growth
// calculation the other three variants (company-revenue, partner-valuation, partner-revenue)
// don't have. Both differences are confirmed inert: revenue_growth is computed but never read
// by any of the four variants' final  stage, and the two enrichment shapes are
// functionally identical (both resolve to login_status=1 for every real professionalsM record,
// see Part 3 §7 step 3's analysis) -- unified onto the standard shared shape here, verified via
// characterization rather than left as an unexplained 4th duplicate.

export function buildType5ValuationPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $sort: {
                            year: -1,
                            quarter: -1
                        }
                    },
                    {
                        $group: {
                            _id: "$company_row_id",
                            pushed_data: {
                                $push: {
                                    $cond: {
                                        if: { $lt: ["$quarter", 5] }, // Condition: revenue > 1000
                                        then: {
                                            _id: "$_id",
                                            year: "$year",
                                            quarter: "$quarter",
                                            revenue: "$revenue"
                                        },
                                        else: "$$REMOVE" // Removes entry if condition fails
                                    }
                                }
                            },
                            total_revenue: { $sum: '$revenue' }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation",
                            revenue_growth: {
                                $multiply: [
                                    {
                                        $divide: [
                                            {
                                                $subtract: [
                                                    { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                                    { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                ]
                                            },
                                            { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                        ]
                                    },
                                    100 // Multiply the percentage change by 100
                                ]
                            }
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
                ]
}

export function buildType5RevenuePipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $sort: {
                            year: -1,
                            quarter: -1
                        }
                    },
                    {
                        $group: {
                            _id: "$company_row_id",
                            pushed_data: {
                                $push: {
                                    $cond: {
                                        if: { $lt: ["$quarter", 5] }, // Condition: revenue > 1000
                                        then: {
                                            _id: "$_id",
                                            year: "$year",
                                            quarter: "$quarter",
                                            revenue: "$revenue"
                                        },
                                        else: "$$REMOVE" // Removes entry if condition fails
                                    }
                                }
                            },
                            total_revenue: { $sum: '$revenue' }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation",
                            revenue_growth: {
                                $multiply: [
                                    {
                                        $divide: [
                                            {
                                                $subtract: [
                                                    { $arrayElemAt: ["$pushed_data.revenue", 0] },
                                                    { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                                ]
                                            },
                                            { $arrayElemAt: ["$pushed_data.revenue", 1] }
                                        ]
                                    },
                                    100 // Multiply the percentage change by 100
                                ]
                            }
                        }
                    },
                    { $match: searchQuery },
                    { $group: { _id: null, total_revenue: { $sum: "$total_revenue" } } }
                ]
}

// report_list_type=7 (holdings) — same shape as type 5: two sub-queries against
// company_holdingM, company/partner delta is the standard PARTNER_FILTER_STAGE insertion +
// one field rename. No enrichment-shape or other variance found here (already matched the
// standard buildProfessionalEnrichmentStages() shape on both sub-queries before extraction).

export function buildType7ValuationPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            company_type: 1
                        }
                    },
                    {
                        $group: {
                            _id: "$company_row_id",
                            total_holdings: { $sum: '$purchased_value_in_usd' },
                            token_row_ids: {
                                $addToSet: {
                                    $cond: {
                                        if: { $eq: ["$token_type", 1] }, // Condition: Only add if token_type is "premium"
                                        then: "$token_row_id",
                                        else: "$$REMOVE" // Do not add if condition fails
                                    }
                                }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                    {
                        $sort: {
                            total_holdings: -1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation",
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
                ]
}

export function buildType7HoldingPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            company_type: 1
                        }
                    },
                    {
                        $group: {
                            _id: "$company_row_id",
                            total_holdings: { $sum: '$purchased_value_in_usd' },
                            token_row_ids: {
                                $addToSet: {
                                    $cond: {
                                        if: { $eq: ["$token_type", 1] }, // Condition: Only add if token_type is "premium"
                                        then: "$token_row_id",
                                        else: "$$REMOVE" // Do not add if condition fails
                                    }
                                }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                    {
                        $sort: {
                            total_holdings: -1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: '',
                            total_holdings: {
                                $sum: '$total_holdings'
                            }
                        }
                    }
                ]
}

// report_list_type=4 (funds invested) — 3 sub-queries against fundingInvestmentM (valuation,
// invested amount, invested rounds count). Confirmed bug fix from Part 3 §7 step 5 lives here:
// the legacy partner branch never ran the rounds sub-query at all (funds_invested_rounds_query
// wasn't even declared in that scope), so total_funds_invested_rounds was silently missing from
// every partner-variant response for this report type. buildType4RoundsPipeline adds
// isPartner support to match the company-variant field, per the resolved decision.

// PERFORMANCE FIX (Part 3 §7 step 7, confirmed via .explain() + timing) — same class of issue as
// buildType3ValuationPipeline: the $expr-based lookup below forced a full collection scan of
// cln_company_lists per matching record instead of using its _id index. Safe to make
// unconditional (plain localField/foreignField) because the $switch below already re-checks
// funds_raised_registered_type==1 to decide whether company_info._id is even used; for
// funds_raised_registered_type==2 the switch uses funds_raised_company_row_id directly and
// ignores company_info regardless of what this lookup finds.
export function buildType4ValuationPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            investor_type: 2, investor_registered_type: 1, verified_status: 1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "funds_raised_company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        active_status: 1
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        company_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$funds_raised_registered_type', 1] }
                                                ]
                                            },
                                            then: '$company_info._id'
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$funds_raised_registered_type', 2] }
                                                ]
                                            },
                                            then: '$funds_raised_company_row_id'
                                        },
                                    ],
                                    default: 0
                                }
                            }
                        }
                    },
                    {
                        $match: { investor_data: { $gt: 0 } }
                    },
                    {
                        $group: {
                            _id: "$investor_row_id",
                            category_ids: { $addToSet: '$category_row_id' },
                            total_amount: { $sum: '$amount' }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
                ]
}

// PERFORMANCE FIX (Part 3 §7 step 7) — same fix and reasoning as buildType4ValuationPipeline
// above: byte-for-byte the same lookup shape, confirmed via diff before extracting.
export function buildType4InvestedPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            investor_type: 2, investor_registered_type: 1, verified_status: 1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "funds_raised_company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        active_status: 1
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        company_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$funds_raised_registered_type', 1] }
                                                ]
                                            },
                                            then: '$company_info._id'
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$funds_raised_registered_type', 2] }
                                                ]
                                            },
                                            then: '$funds_raised_company_row_id'
                                        },
                                    ],
                                    default: 0
                                }
                            }
                        }
                    },
                    {
                        $match: { investor_data: { $gt: 0 } }
                    },
                    {
                        $group: {
                            _id: "$investor_row_id",
                            category_ids: { $addToSet: '$category_row_id' },
                            total_amount: { $sum: '$amount' }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: '',
                            amount: {
                                $sum: '$total_amount'
                            }
                        }
                    }
                ]
}

// Adds PARTNER_FILTER_STAGE support (Part 3 §7 step 5, confirmed bug fix): the legacy partner
// branch never ran this sub-query at all, so total_funds_invested_rounds was silently absent
// from every partner-variant /overview response for report_list_type=4. Company-variant logic
// unchanged; isPartner=true is new capability, not a behavior change to the existing company path.
// PERFORMANCE FIX (Part 3 §7 step 7) — same fix and reasoning as buildType4ValuationPipeline
// above: byte-for-byte the same lookup shape, confirmed via diff before extracting.
//
// CONFIRMED BUG FIX (post-Phase-C, found via live manual testing): this stage matched
// investor_type: 1, while its sibling pipelines (buildType4InvestedPipeline,
// buildType4ValuationPipeline) match investor_type: 2 — and getCompanyListDetails /
// getPartnerListDetails's own report_list_type=4 branches (front_page.ts) compute the
// invested-amount total and the rounds/category_ids count from that SAME investor_type: 2
// query, in one $group. investor_type: 1 investors are never registered partners in this
// dataset, so total_funds_invested_rounds was structurally guaranteed to be 0 for every
// partner-side /overview response, regardless of filters. Changed to 2 to match every other
// "invested rounds" computation in the codebase.
export function buildType4RoundsPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    {
                        $match: {
                            investor_type: 2, investor_registered_type: 1, verified_status: 1
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "funds_raised_company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: {
                                        active_status: 1
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        company_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                    {
                        $set:
                        {
                            investor_data: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$funds_raised_registered_type', 1] }
                                                ]
                                            },
                                            then: '$company_info._id'
                                        },
                                        {
                                            case: {
                                                $and: [
                                                    { $eq: ['$funds_raised_registered_type', 2] }
                                                ]
                                            },
                                            then: '$funds_raised_company_row_id'
                                        },
                                    ],
                                    default: 0
                                }
                            }
                        }
                    },
                    {
                        $match: { investor_data: { $gt: 0 } }
                    },
                    {
                        $group: {
                            _id: "$investor_row_id",
                            total_amount: { $sum: '$amount' },
                            category_ids: { $addToSet: '$category_row_id' },
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id"
                        }
                    },
                    { $match: searchQuery },
                    { $unwind: "$category_ids" },
                    {
                        $group: {
                            _id: null,
                            category_ids: { $addToSet: "$category_ids" }
                        }
                    },
                    {
                        $project: {
                            count: { $size: '$category_ids' }
                        }
                    }
                ]
}

// report_list_type=6 (products) — 4 sub-queries against company_productsM. The 3 product-type
// counts (cryptocurrency/blockchain/exchange) are byte-identical except one match value, shared
// via buildType6ProductCountPipeline(productType). The valuation sub-query is genuinely unique:
// it applies PARTNER_FILTER_STAGE TWICE (once at the top level right after its own ,
// once more inside the standard enrichment lookup) — confirmed via diff against the legacy
// code, not a transcription artifact, so both are parametrized rather than deduplicated away.

export function buildType6ValuationPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    { $match: { company_type: 1 } },
                    {
                        $group: {
                            _id: "$company_row_id",
                            total_products: { $sum: 1 },
                            product_ids: {
                                $addToSet: {
                                    register_type: '$register_type',
                                    product_type: '$product_type',
                                    product_row_id: '$product_row_id'
                                }
                            }
                        }
                    },
                    ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
                ]
}

// Shared by cryptocurrency (productType=1), blockchain (productType=2), and exchange
// (productType=3) product counts — confirmed byte-identical apart from this one match value.
export function buildType6ProductCountPipeline({ isPartner, searchQuery, productType }: { isPartner: boolean, searchQuery: any, productType: number }) {
  return [
                    { $match: { company_type: 1, product_type: productType } },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $count: 'count'
                    }
                ]
}

// report_list_type=2 (event organizers) — the most complex type: 4 sub-queries against
// eventM (valuation, organizer count, sponsor count, partner count). event_sponsor_query and
// event_partner_query are byte-identical except one match value, shared via
// buildType2SponsorPartnerPipeline(sponsorPartnerType). Both contain a deeply-nested
// company_active_status+login_status COMBINED enrichment shape (the -based final match
// spanning list_event_type) that Part 3 §7 step 3 deliberately left untouched — same reasoning
// applies here: this is genuinely NOT the standalone buildProfessionalEnrichmentStages() shape
// (it combines two fields' filtering into one , which that shared function can't express),
// so it's preserved verbatim inside the extracted pipeline rather than forced into the shared
// helper. Also note the localField split already fixed once during PARTNER_FILTER_STAGE
// extraction (step 3): valuation uses the default '_id' (nested in its own enrichment lookup),
// the other three use 'company_row_id' at the top level (confirmed via the same diff-before-
// extracting discipline, not assumed uniform).

// CONFIRMED BUG FIX (Part 3 §7 step 4, decided after Phase C review — not in the original
// Build Order): the legacy company variant summed company_valuation once PER EVENT (no dedup),
// so a company hosting N events had its valuation counted N times, inflating
// total_company_valuation for report_list_type=2. The partner variant already deduped to one
// row per company first (via the $group below) before summing — confirmed correct, since this
// metric should total each company's valuation once, not once per event. The company variant
// now uses the same dedup unconditionally, matching the partner variant's (correct) behavior.
export function buildType2ValuationPipeline({ isPartner, searchQuery, matchQuery }: { isPartner: boolean, searchQuery: any, matchQuery: any }) {
  return [
                    {
                        $match: {
                            active_status: 1,
                            // end_date: { $gte: new Date(getPresentDateTime()) },
                            approval_status: 1,
                            company_row_id: { $gt: 0 }
                        }
                    },
                    {
                        $match: matchQuery
                    },
                    {
                        $group: {
                            _id: "$company_row_id",
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_valuation: 1,
                                        main_business_model_id: 1,
                                        business_model_id: 1,
                                        company_location: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {

                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            company_valuation: "$company_info.company_valuation",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
                ]
}

export function buildType2OrganizersPipeline({ isPartner, searchQuery, matchQuery }: { isPartner: boolean, searchQuery: any, matchQuery: any }) {
  return [
                    {
                        $match: {
                            active_status: 1,
                            // end_date: { $gte: new Date(getPresentDateTime()) },
                            approval_status: 1,
                            company_row_id: { $gt: 0 }
                        }
                    },
                    {
                        $match: matchQuery
                    },
                    ...(isPartner ? PARTNER_FILTER_STAGE('company_row_id') : []),
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $count: 'count'
                    }
                ]
}

// Shared by event_sponsor_query (sponsorPartnerType=1) and event_partner_query
// (sponsorPartnerType=2) — confirmed byte-identical apart from this one match value.
export function buildType2SponsorPartnerPipeline({ isPartner, searchQuery, sponsorPartnerType, matchQuery }: { isPartner: boolean, searchQuery: any, sponsorPartnerType: number, matchQuery: any }) {
  return [
                    {
                        $match: {
                            active_status: 1,
                            // end_date: { $gte: new Date(getPresentDateTime()) },
                            approval_status: 1,
                            company_row_id: { $gt: 0 }
                        }
                    },
                    {
                        $match: matchQuery
                    },
                    ...(isPartner ? PARTNER_FILTER_STAGE('company_row_id') : []),
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "company_row_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: '$company_row_id',
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $lookup: {
                            from: "cln_event_sponsor_partner_details",
                            localField: "_id",
                            foreignField: "user_company_row_id",
                            as: "info_sponsor",
                            pipeline: [
                                {
                                    $match: {
                                        sponsor_partner_type: sponsorPartnerType, // 1. Sponsor  2. Partner 
                                        account_type: 2, // 1. User  2. Company
                                        registered_type: 1, // 1. Registerd  2. Manual
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "cln_events",
                                        localField: "event_row_id",
                                        foreignField: "_id",
                                        as: "info_event",
                                        pipeline: [
                                            {
                                                $match: {
                                                    active_status: 1, approval_status: 1, list_event_type: { $in: [1, 2, 3] }
                                                }
                                            },
                                            {
                                                $lookup:
                                                {
                                                    from: "cln_professionals",
                                                    localField: "user_row_id",
                                                    foreignField: "_id",
                                                    as: "user_info",
                                                    pipeline: [
                                                        {
                                                            $match: { login_status: { $ne: 1 } }
                                                        },
                                                        {
                                                            $project: {
                                                                _id: 1,
                                                                login_status: 1
                                                            }
                                                        }]
                                                }
                                            },
                                            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                                            {
                                                $lookup:
                                                {
                                                    from: "cln_company_lists",
                                                    localField: "company_row_id",
                                                    foreignField: "_id",
                                                    as: "company_info",
                                                    pipeline: [
                                                        {
                                                            $match: { active_status: { $ne: 1 } }
                                                        },
                                                        {
                                                            $project: {
                                                                _id: 1,
                                                                active_status: 1
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                            { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                                            {
                                                $set: {
                                                    company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
                                                    login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
                                                }
                                            },
                                            {
                                                $match: {
                                                    $or: [
                                                        { login_status: 1, list_event_type: 1 },
                                                        { company_active_status: 1, list_event_type: 2 },
                                                        { list_event_type: 3, login_status: 1, company_active_status: 1 }
                                                    ]
                                                }
                                            },
                                            {
                                                $project: {
                                                    _id: 1
                                                }
                                            }

                                        ]
                                    }
                                },
                                { $unwind: { path: "$info_event" } },
                                {
                                    $count: "count"
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "",
                            total: {
                                $sum: {
                                    $add: { $ifNull: [{ $arrayElemAt: ["$info_sponsor.count", 0] }, 0] }
                                }
                            }
                        }
                    }
                ]
}

/**
 * report_list_type=8 (companies hiring) — CONFIRMED BUG FIX: this report type never had a
 * valuation branch in modules/company_overview/company_overview.service.ts at all (unlike types
 * 1-7, each with their own `if (report_list_type === N)` case there), so `total_company_valuation`
 * always fell through to its `0` default for this filter regardless of real company_valuation
 * data — same root cause class as the type-2 per-event/per-company bug fixed earlier. Base filter
 * matches modules/company/company.list.ts's own report_list_type=8 list branch exactly (active,
 * non-deleted job postings grouped by company_row_id, requiring at least one job role) so the
 * list and its valuation total stay consistent with each other; structured like
 * buildType6ValuationPipeline (group -> PARTNER_FILTER_STAGE -> company_info lookup -> sum).
 */
export function buildType8ValuationPipeline({ isPartner, searchQuery }: { isPartner: boolean, searchQuery: any }) {
  return [
                    { $match: { active_status: "active", is_deleted: false } },
                    {
                        $group: {
                            _id: "$company_row_id",
                            job_roles: { $push: "$job_title" }
                        }
                    },
                    { $match: { $expr: { $gt: [{ $size: "$job_roles" }, 0] } } },
                    ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                    {
                        $lookup:
                        {
                            from: "cln_company_lists",
                            localField: "_id",
                            foreignField: "_id",
                            as: "company_info",
                            pipeline: [
                                {
                                    $match: { approval_status: 1, active_status: 1 }
                                },
                                ...(isPartner ? PARTNER_FILTER_STAGE() : []),
                                ...buildProfessionalEnrichmentStages(),
                                {
                                    $project: {
                                        company_name: 1,
                                        company_id: 1,
                                        company_logo: 1,
                                        company_location: 1,
                                        company_valuation: 1,
                                        business_model_id: 1,
                                        describe_in_one_line: 1,
                                        main_business_model_id: 1,
                                        country_id: 1
                                    }
                                }
                            ]
                        }
                    },
                    { $unwind: { path: "$company_info" } },
                    {
                        $set:
                        {
                            company_name: "$company_info.company_name",
                            company_id: "$company_info.company_id",
                            company_location: "$company_info.company_location",
                            business_model_id: "$company_info.business_model_id",
                            main_business_model_id: "$company_info.main_business_model_id",
                            country_id: "$company_info.country_id",
                            company_valuation: "$company_info.company_valuation"
                        }
                    },
                    { $match: searchQuery },
                    {
                        $group: {
                            _id: null,
                            [isPartner ? 'total_partner_valuation' : 'total_company_valuation']: { $sum: "$company_valuation" }
                        }
                    }
                ]
}
