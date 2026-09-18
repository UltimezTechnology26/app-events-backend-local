// modules/company/company.queries.ts
//
// Aggregation-pipeline builders for modules/company/ (profile, list, partners_list).
// Populated incrementally per Phase B — each function lands via TDD (Part 3 §7 Phase B),
// migrating the corresponding logic out of services/company/front_page.ts.

import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'
import { extractPaginatedResult } from '../common/common.pagination'

export { extractPaginatedResult }

// buildPeoplesInCompanyPipeline moved to modules/team-members/team-members.queries.ts
// as getPublicTeamMembersList (Part 3 §7 Phase B step 5) — company.service.ts calls
// that directly now instead of building this pipeline here.

export interface CompanyOtherDetailsCompanyRow {
  _id: number
  main_business_model_id: number
}

export interface CompanyOwnershipRow {
  _id: number
}

export interface EmployeeApprovalRequestRow {
  approval_status: number
}

export interface CompanyFaqListItem {
  _id: number
  faq_question: string
  faq_answer: string
}

export interface SimilarCompanyRow {
  _id: number
  company_name: string
  company_id: string
  company_logo: string
  established_in: string
  describe_in_one_line: string
  company_size_row_id: number
  company_location: string
  company_valuation: number
  country_flag: string
  country_name: string
  main_business_model_name: string
  watchlist_status: number
  following_status: number
  total_followers: number
}

/**
 * Moved from company.service.ts's getCompanyOtherDetails/companyOtherDetails (both call sites had
 * this identical `companyM.findOne(...)` inline) — pure relocation into the repository layer, same
 * filter/projection/lean().
 */
export function findCompanyForOtherDetails(company_row_id: number): Promise<CompanyOtherDetailsCompanyRow | null> {
  const companyM = require('../../../models/app/company/companyM')
  return companyM.findOne({ _id: company_row_id, approval_status: 1, active_status: 1 }, { _id: 1, main_business_model_id: 1 }).lean()
}

/**
 * Moved from company.service.ts's getCompanyOtherDetails/companyOtherDetails (identical
 * `companyM.findOne({ user_row_id }, ...)` inline at both call sites) — pure relocation.
 */
export function findCompanyOwnedByUser(user_row_id: number): Promise<CompanyOwnershipRow | null> {
  const companyM = require('../../../models/app/company/companyM')
  return companyM.findOne({ user_row_id: user_row_id }, { _id: 1 }).lean()
}

/**
 * Moved from company.service.ts's getCompanyOtherDetails/companyOtherDetails (identical
 * `employees_requestsM.findOne(...)` inline at both call sites) — pure relocation.
 */
export function findEmployeeApprovalRequest({
  company_row_id,
  user_row_id
}: {
  company_row_id: number
  user_row_id: number
}): Promise<EmployeeApprovalRequestRow | null> {
  const employees_requestsM = require('../../../models/app/company/employees_requestsM')
  return employees_requestsM.findOne({ company_row_id: company_row_id, user_row_id: user_row_id }, { approval_status: 1 }).lean()
}

/**
 * Moved from company.service.ts's getCompanyOtherDetails/companyOtherDetails (identical
 * `company_faqM.find(...)` inline at both call sites) — pure relocation.
 */
export function findCompanyFaqList(company_row_id: number): Promise<CompanyFaqListItem[]> {
  const company_faqM = require('../../../models/app/company/company_faqM')
  return company_faqM.find({ company_row_id: company_row_id }, { _id: 1, faq_question: 1, faq_answer: 1 }).lean()
}

/**
 * Moved from company.service.ts's getCompanyOtherDetails (`companyM.aggregate(
 * buildSimilarCompaniesPipeline(...)).limit(4)`) and companyOtherDetails (same pipeline, previously
 * duplicated inline instead of calling buildSimilarCompaniesPipeline) — pure relocation, same
 * pipeline/limit for both call sites.
 */
export function getSimilarCompanies({
  company_row_id,
  user_row_id,
  main_business_model_id
}: {
  company_row_id: number
  user_row_id: number
  main_business_model_id: number
}): Promise<SimilarCompanyRow[]> {
  const companyM = require('../../../models/app/company/companyM')
  return companyM
    .aggregate(buildSimilarCompaniesPipeline({ company_row_id, user_row_id, main_business_model_id }))
    .limit(4)
}

/** Moved from company.service.ts's two identical `company_productsM.exists(...)` inline calls. */
export function companyHasProducts(company_row_id: number): Promise<{ _id: unknown } | null> {
  const company_productsM = require('../../../models/markets/products_n_holding/company_productsM')
  return company_productsM.exists({ company_row_id: company_row_id, company_type: 1 })
}

/** Moved from company.service.ts's two identical `company_holdingM.exists(...)` inline calls. */
export function companyHasHoldings(company_row_id: number): Promise<{ _id: unknown } | null> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  return company_holdingM.exists({ company_row_id, company_type: 1 })
}

/** Moved from company.service.ts's two identical `fundingM.exists(...)` (invested) inline calls. */
export function companyHasInvested(company_row_id: number): Promise<{ _id: unknown } | null> {
  const fundingM = require('../../../models/app/funding/fundingInvestmentM')
  return fundingM.exists({
    investor_row_id: company_row_id,
    investor_type: 2,
    investor_registered_type: 1,
    verified_status: 1
  })
}

/** Moved from company.service.ts's two identical `fundingM.exists(...)` (raised) inline calls. */
export function companyHasRaised(company_row_id: number): Promise<{ _id: unknown } | null> {
  const fundingM = require('../../../models/app/funding/fundingInvestmentM')
  return fundingM.exists({
    funds_raised_company_row_id: company_row_id,
    funds_raised_registered_type: 1,
    verified_status: 1
  })
}

/** Moved from company.service.ts's two identical `jobsM.exists(...)` inline calls. */
export function companyHasApplicants(company_row_id: number): Promise<{ _id: unknown } | null> {
  const jobsM = require('../../../models/app/jobs/jobsM')
  return jobsM.exists({ company_row_id, is_deleted: false })
}

export interface LegacyPeoplesInCompanyRow {
  _id: number
  user_account_type: number
  user_row_id: number
  user_name: string
  full_name: string
  email_id: string
  profile_image: string
  pro_batch: number
  user_approval_status: number
  verified_status: boolean
  designation_type: number
  employment_type: number
  position_name: string
  location_type: number
  start_date: Date
  responsibilities: string
  positions: Array<{
    position_type: number
    position_row_id: number
    sub_position_row_id: number
    position_name: string
  }>
  social_links: Record<string, string> | null
  user_followed_status: number
}

export interface EventSponsorPartnerEventIdRow {
  event_row_id: number
}

/**
 * Moved from company.service.ts's companyIndividualEvents (identical
 * `event_sponsors_partner_detailsM.find(...)` inline calls for sponsor_partner_type 1 and 2) —
 * pure relocation.
 */
export function findEventSponsorPartnerEventIds({
  company_row_id,
  sponsor_partner_type
}: {
  company_row_id: number
  sponsor_partner_type: number
}): Promise<EventSponsorPartnerEventIdRow[]> {
  const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
  return event_sponsors_partner_detailsM
    .find(
      { account_type: 2, registered_type: 1, sponsor_partner_type, user_company_row_id: company_row_id },
      { event_row_id: 1 }
    )
    .lean()
}

/**
 * Moved verbatim from company.service.ts's companyOtherDetails() `peoples_in_company_query`
 * (the pre-Phase-B implementation's own copy of the team-members pipeline, kept as-is per the
 * "superseded but not deleted" note on that function — this is NOT the same as
 * team-members.queries.ts's getPublicTeamMembersList(), which getCompanyOtherDetails uses
 * instead).
 */
export function getLegacyPeoplesInCompany({
  company_row_id,
  user_row_id
}: {
  company_row_id: number
  user_row_id: number
}): Promise<LegacyPeoplesInCompanyRow[]> {
  const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')

  return professionals_work_experienceM.aggregate([
    {
      $match: {
        verified_status: true,
        company_row_id: company_row_id,
        company_type: 1,
        till_date_status: 2
      }
    },
    {
      $lookup:
      {
        from: "cln_static_professionals_work_positions",
        localField: "position_row_id",
        foreignField: "_id",
        as: "info_position",
        pipeline: [
          {
            $project: {
              _id: 1,
              position_name: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
    {
      $lookup:
      {
        from: "cln_manual_user_positions",
        let: {
          position_type: '$position_type',
          sub_position_row_id: '$sub_position_row_id'
        },
        as: "manual_position_info",
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [2, "$$position_type"] },
                  { $eq: ["$_id", "$$sub_position_row_id"] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 1,
              position_name: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_static_professionals_work_positions",
        let: { positions: { $ifNull: ["$positions", []] } },
        as: "resolved_static_positions",
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.position_row_id" } }]
              }
            }
          },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_manual_user_positions",
        let: { positions: { $ifNull: ["$positions", []] } },
        as: "resolved_manual_positions",
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.sub_position_row_id" } }]
              }
            }
          },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    {
      $lookup:
      {
        from: "cln_professionals",
        let: {
          user_row_id: '$user_row_id',
          user_account_type: '$user_account_type'
        },
        as: "user_info",
        pipeline: [
          {
            $match: {
              $and: [
                {
                  $expr: {
                    $and: [
                      { $eq: [1, "$$user_account_type"] },
                      { $eq: ["$_id", "$$user_row_id"] }
                    ]
                  }
                },
                {
                  login_status: 1
                },
              ]
            }
          },
          {
            $lookup:
            {
              from: "cln_professionals_profile_images",
              localField: "_id",
              foreignField: "user_row_id",
              as: "img_info"
            }
          },
          { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
          {
            $lookup:
            {
              from: "cln_professionals_social_links",
              localField: "_id",
              foreignField: "user_row_id",
              as: "social_info",
              pipeline: [
                {
                  $project: {
                    _id: 0,
                    website: 1,
                    facebook: 1,
                    twitter: 1,
                    linkedin: 1,
                    instagram: 1,
                    telegram: 1,
                    medium: 1,
                    reddit: 1,
                    feed_url: 1
                  }
                }
              ]
            }
          },
          { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              user_name: 1,
              full_name: 1,
              email_id: 1,
              profile_image: "$img_info.profile_image",
              pro_batch: 1,
              approval_status: 1,
              social_links: "$social_info"

            }
          }
        ]
      }
    },
    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup:
      {
        from: "cln_professionals_manual_retrievals",
        let: {
          user_row_id: '$user_row_id',
          user_account_type: '$user_account_type'
        },
        as: "manual_info",
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [2, "$$user_account_type"] },
                  { $eq: ["$_id", "$$user_row_id"] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 1,
              full_name: 1,
              email_id: 1,
              profile_image: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
    {
      $set:
      {
        user_data: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $eq: ['$user_account_type', 1] }
                  ]
                },
                then: "$user_info"
              },
              {
                case: {
                  $and: [
                    { $eq: ['$user_account_type', 2] }
                  ]
                },
                then: "$manual_info"
              },
            ],
            default: ""
          }
        }

      }
    },
    {
      $set: {
        user_name: "$user_data.user_name",
        full_name: "$user_data.full_name",
        position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
        positions: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: ["$positions", []] } }, 0] },
            then: {
              $map: {
                input: { $ifNull: ["$positions", []] },
                as: "p",
                in: {
                  position_type: "$$p.position_type",
                  position_row_id: "$$p.position_row_id",
                  sub_position_row_id: "$$p.sub_position_row_id",
                  position_name: {
                    $cond: {
                      if: { $eq: ["$$p.position_type", 2] },
                      then: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_manual_positions", cond: { $eq: ["$$this._id", "$$p.sub_position_row_id"] } } }, in: "$$this.position_name" } }, 0] },
                      else: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_static_positions", cond: { $eq: ["$$this._id", "$$p.position_row_id"] } } }, in: "$$this.position_name" } }, 0] }
                    }
                  }
                }
              }
            },
            else: [{
              position_type: "$position_type",
              position_row_id: "$position_row_id",
              sub_position_row_id: "$sub_position_row_id",
              position_name: {
                $cond: {
                  if: { $eq: ["$position_type", 2] },
                  then: "$manual_position_info.position_name",
                  else: "$info_position.position_name"
                }
              }
            }]
          }
        },
      }
    },
    {
      $lookup:
      {
        from: "cln_professionals_followers",
        localField: "user_row_id",
        foreignField: "following_user_row_id",
        pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
        as: "user_followed"
      }
    },
    { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
    {
      $match: {
        user_data: { $exists: true, $ne: "" }
      }
    },
    {
      $project: {
        _id: 1,
        user_account_type: 1,
        user_row_id: 1,
        user_name: 1,
        full_name: 1,
        email_id: "$user_data.email_id",
        profile_image: "$user_data.profile_image",
        pro_batch: "$user_data.pro_batch",
        user_approval_status: "$user_data.approval_status",
        verified_status: 1,
        designation_type: 1,
        employment_type: 1,
        position_name: 1,
        location_type: 1,
        start_date: 1,
        responsibilities: 1,
        positions: 1,
        social_links: {
          $cond: {
            if: { $eq: ["$user_account_type", 1] },
            then: "$user_data.social_links",
            else: null
          }
        },
        user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } },
      }
    }
  ])
}

/**
 * Moved verbatim from company.service.ts's companyOtherDetails() `similar_companies_query`.
 * NOT the same as buildSimilarCompaniesPipeline above: this legacy pipeline still runs the
 * `business_info` $lookup that buildSimilarCompaniesPipeline's own doc comment identifies as
 * dead/unreferenced for the getCompanyOtherDetails call site — but companyOtherDetails is the
 * kept, superseded-but-frozen original implementation, so its pipeline is moved here verbatim,
 * dead lookup included, rather than deduped onto buildSimilarCompaniesPipeline (that would be an
 * unrequested behavior/shape change to a frozen legacy path).
 */
export function getLegacySimilarCompanies({
  company_row_id,
  user_row_id,
  main_business_model_id
}: {
  company_row_id: number
  user_row_id: number
  main_business_model_id: number
}): Promise<SimilarCompanyRow[]> {
  const companyM = require('../../../models/app/company/companyM')

  return companyM.aggregate([
    {
      $match: { _id: { $ne: company_row_id }, approval_status: 1, active_status: 1, main_business_model_id: main_business_model_id }
    },
    { $sort: { _id: -1 } },
    ...buildProfessionalEnrichmentStages(),

    {
      $lookup: {
        from: "cln_static_company_business_models",
        localField: "business_model_id",
        foreignField: "_id",
        as: "business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cln_static_company_business_models",
        localField: "main_business_model_id",
        foreignField: "_id",
        as: "main_business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
    { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_static_countries",
        localField: "country_id",
        foreignField: "_id",
        as: "country_info",
        pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
      }
    },
    { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        as: "followers_info",
        pipeline: [
          {
            $lookup:
            {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "inner_user_info",
              pipeline: [
                {
                  $match: { login_status: 1 }
                },
                {
                  $project: {
                    _id: 1
                  }
                }
              ]
            }
          },
          { $unwind: { path: "$inner_user_info" } },
          {
            $count: 'count'
          }
        ]
      }
    },
    {
      $lookup:
      {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_user_following"
      }
    },
    { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
    {
      $lookup:
      {
        from: "cln_company_watchlists",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_company_watchlist"
      }
    },
    { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_id: 1,
        company_logo: 1,
        established_in: 1,
        describe_in_one_line: 1,
        company_size_row_id: 1,
        company_location: 1,
        company_valuation: 1,
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        main_business_model_name: "$main_business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
      }
    }
  ]).limit(4)
}

/**
 * Ports companyOtherDetails' `similar_companies_query` (front_page.ts:9045-9187),
 * with one real change: the duplicated "resolve login_status, default to 1"
 * block (front_page.ts:9050-9082) is now buildProfessionalEnrichmentStages()
 * from common.enrichment.ts instead of a 39th inline copy (Part 1 §3 finding 2).
 * Everything else — the business-model match, follower count, watchlist/follow
 * status projection — is unchanged.
 */
export function buildSimilarCompaniesPipeline({
  company_row_id,
  user_row_id,
  main_business_model_id
}: {
  company_row_id: number
  user_row_id: number
  main_business_model_id: number
}) {
  return [
    {
      $match: { _id: { $ne: company_row_id }, approval_status: 1, active_status: 1, main_business_model_id: main_business_model_id }
    },
    { $sort: { _id: -1 } },
    ...buildProfessionalEnrichmentStages(),
    // Removed a redundant $lookup here (services/company/front_page.ts:9084-9092):
    // the legacy pipeline also looked up `business_model_id` into `business_info`,
    // but that result is never unwound or referenced anywhere downstream — only
    // `main_business_info` (below, looked up from `main_business_model_id`) is
    // actually projected as `main_business_model_name`. Confirmed dead via the
    // final $project stage, not assumed. Removing it changes nothing about the
    // output, just skips an unnecessary join.
    {
      $lookup: {
        from: "cln_static_company_business_models",
        localField: "main_business_model_id",
        foreignField: "_id",
        as: "main_business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
    { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_static_countries",
        localField: "country_id",
        foreignField: "_id",
        as: "country_info",
        pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
      }
    },
    { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        as: "followers_info",
        pipeline: [
          {
            $lookup:
            {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "inner_user_info",
              pipeline: [
                {
                  $match: { login_status: 1 }
                },
                {
                  $project: {
                    _id: 1
                  }
                }
              ]
            }
          },
          { $unwind: { path: "$inner_user_info" } },
          {
            $count: 'count'
          }
        ]
      }
    },
    {
      $lookup:
      {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_user_following"
      }
    },
    { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
    {
      $lookup:
      {
        from: "cln_company_watchlists",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_company_watchlist"
      }
    },
    { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_id: 1,
        company_logo: 1,
        established_in: 1,
        describe_in_one_line: 1,
        company_size_row_id: 1,
        company_location: 1,
        company_valuation: 1,
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        main_business_model_name: "$main_business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
      }
    }
  ]
}

/**
 * Ports companyList's report_list_type===1 branch (services/company/front_page.ts:52-1053)
 * — one $facet stage combining the list and the count, instead of two separate
 * `.aggregate()` calls (Part 1 §3 finding 3). This is also the fix for the
 * confirmed count/list `login_status` inconsistency (Part 3 §7 Phase B step 3,
 * confirmed with the user before implementing): the legacy count_query never
 * applied the login_status filter the list query does, so it could overcount
 * — sharing one $match chain between both facet branches makes that
 * structurally impossible now. Everything else (geo bounding box, business
 * model/country enrichment, followers/events/sponsors/partners/funding/
 * revenue/products/holdings/jobs enrichment, final $project) is unchanged.
 */
export interface CompanyListType1Params {
  query: Record<string, unknown>
  skip: number
  limit: number
  user_row_id: number
  sort_filter: Record<string, unknown>
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}

/**
 * Moved from company.service.ts's getCompanyListType1Result (`companyM.aggregate(
 * buildCompanyListType1Pipeline(...))`) — pure relocation of the inline aggregate call.
 */
export function runCompanyListType1Aggregate(
  params: CompanyListType1Params
): Promise<Array<{ data: unknown[]; totalCount: Array<{ count: number }> }>> {
  const companyM = require('../../../models/app/company/companyM')
  return companyM.aggregate(buildCompanyListType1Pipeline(params))
}

export function buildCompanyListType1Pipeline({
  query,
  skip,
  limit,
  user_row_id,
  sort_filter,
  boundingBox
}: CompanyListType1Params) {
  const sharedPrefixStages: object[] = [
    {
      $match: {
        approval_status: 1,
        active_status: 1
      }
    },
    {
      $addFields: {
        lat_num: {
          $convert: {
            input: "$latitude",
            to: "double",
            onError: null,
            onNull: null
          }
        },
        lon_num: {
          $convert: {
            input: "$longitude",
            to: "double",
            onError: null,
            onNull: null
          }
        }
      }
    },
    ...(boundingBox ? [{
      $match: {
        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
      }
    }] : []),
    sort_filter,
    {
      $lookup: {
        from: "cln_professionals",
        localField: "user_row_id",
        foreignField: "_id",
        as: "user_info",
        pipeline: [
          { $match: { login_status: { $ne: 1 } } },
          { $project: { _id: 1, login_status: 1 } }
        ]
      }
    },
    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        login_status: {
          $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 }
        }
      }
    },
    {
      $match: { login_status: 1 }
    },
    {
      $lookup: {
        from: "cln_static_company_business_models",
        localField: "business_model_id",
        foreignField: "_id",
        as: "business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cln_static_company_business_models",
        localField: "main_business_model_id",
        foreignField: "_id",
        as: "main_business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
    { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_static_countries",
        localField: "country_id",
        foreignField: "_id",
        as: "country_info",
        pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
      }
    },
    { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
    { $match: query }
  ]

  const dataStages: object[] = [
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        as: "followers_info",
        pipeline: [
          {
            $lookup: {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "inner_user_info",
              pipeline: [
                { $match: { login_status: 1 } },
                { $project: { _id: 1 } }
              ]
            }
          },
          { $unwind: "$inner_user_info" },
          { $count: "count" }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { user_row_id: user_row_id } }],
        as: "info_user_following"
      }
    },
    { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_company_watchlists",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { user_row_id: user_row_id } }],
        as: "info_company_watchlist"
      }
    },
    { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_events",
        let: { companyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$company_row_id", "$$companyId"] },
                  { $eq: ["$active_status", 1] },
                  { $eq: ["$approval_status", 1] },
                  { $gt: ["$company_row_id", 0] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              total_events: { $sum: 1 }
            }
          }
        ],
        as: "event_info"
      }
    },
    {
      $addFields: {
        total_events: {
          $ifNull: [{ $arrayElemAt: ["$event_info.total_events", 0] }, 0]
        }
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
              sponsor_partner_type: 1,
              account_type: 2,
              registered_type: 1
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
                    active_status: 1,
                    approval_status: 1,
                    list_event_type: { $in: [1, 2, 3] }
                  }
                },
                {
                  $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                      { $project: { login_status: 1 } }
                    ]
                  }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                  $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                      { $project: { active_status: 1 } }
                    ]
                  }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                  $addFields: {
                    company_active_status: {
                      $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 }
                    },
                    login_status: {
                      $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
                    }
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
                { $project: { _id: 1 } }
              ]
            }
          },
          { $unwind: "$info_event" },
          { $count: "count" }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_event_sponsor_partner_details",
        localField: "_id",
        foreignField: "user_company_row_id",
        as: "info_partner",
        pipeline: [
          {
            $match: {
              sponsor_partner_type: 2,
              account_type: 2,
              registered_type: 1
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
                    active_status: 1,
                    approval_status: 1,
                    list_event_type: { $in: [1, 2, 3] }
                  }
                },
                {
                  $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                      { $match: { login_status: { $ne: 1 } } },
                      { $project: { login_status: 1 } }
                    ]
                  }
                },
                { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
                {
                  $lookup: {
                    from: "cln_company_lists",
                    localField: "company_row_id",
                    foreignField: "_id",
                    as: "company_info",
                    pipeline: [
                      { $match: { active_status: { $ne: 1 } } },
                      { $project: { active_status: 1 } }
                    ]
                  }
                },
                { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
                {
                  $addFields: {
                    company_active_status: {
                      $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 }
                    },
                    login_status: {
                      $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 }
                    }
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
                { $project: { _id: 1 } }
              ]
            }
          },
          { $unwind: "$info_event" },
          { $count: "count" }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_funding_investment_lists",
        let: { companyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  { $toInt: "$funds_raised_company_row_id" },
                  "$$companyId"
                ]
              },
              funds_raised_registered_type: 1,
              verified_status: 1
            }
          },
          {
            $lookup: {
              from: "cln_company_lists",
              let: {
                it: "$investor_type",
                irt: "$investor_registered_type",
                iid: "$investor_row_id"
              },
              pipeline: [
                {
                  $match: {
                    $and: [
                      {
                        $expr: {
                          $and: [
                            { $eq: [2, "$$it"] },
                            { $eq: [1, "$$irt"] },
                            { $eq: ["$_id", "$$iid"] }
                          ]
                        }
                      },
                      { active_status: 1 }
                    ]
                  }
                },
                { $project: { _id: 1 } }
              ],
              as: "company_info"
            }
          },
          {
            $addFields: {
              company_investor_id: {
                $ifNull: [
                  { $arrayElemAt: ["$company_info._id", 0] },
                  0
                ]
              }
            }
          },
          {
            $addFields: {
              investor_data: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $and: [
                          { $eq: ["$investor_type", 2] },
                          { $eq: ["$investor_registered_type", 1] }
                        ]
                      },
                      then: "$company_investor_id"
                    }
                  ],
                  default: "$investor_row_id"
                }
              }
            }
          },
          { $match: { investor_data: { $gt: 0 } } },
          // Collapse to one document per round_id BEFORE the final group, so a
          // multi-investor round's shared amount is counted once instead of once
          // per investor row. category_row_id is kept via $first since it's the
          // same across every row in a round.
          {
            $group: {
              _id: "$round_id",
              funds_raised_company_row_id: { $first: "$funds_raised_company_row_id" },
              amount: { $first: "$amount" },
              category_row_id: { $first: "$category_row_id" },
              investor_identities: {
                $push: {
                  investor_row_id: "$investor_row_id",
                  investor_type: "$investor_type",
                  investor_registered_type: "$investor_registered_type"
                }
              }
            }
          },
          // Final group back to one document per company. round_ids now counts
          // distinct ROUNDS (not round types). category_ids is kept for the
          // funding_rounds name lookup below. funds_raised_ids flattens the
          // per-round investor identities collected above into one set, since
          // total_funds_raised_companies should still reflect every distinct
          // investor across all of this company's rounds.
          {
            $group: {
              _id: "$funds_raised_company_row_id",
              total_funds_raised_amount: { $sum: "$amount" },
              round_ids: { $addToSet: "$_id" },
              category_ids: { $addToSet: "$category_row_id" },
              funds_raised_ids: { $push: "$investor_identities" }
            }
          },
          // Flatten the per-round investor-identity arrays into one set of
          // distinct investors across all rounds.
          {
            $addFields: {
              funds_raised_ids: {
                $reduce: {
                  input: "$funds_raised_ids",
                  initialValue: [],
                  in: { $setUnion: ["$$value", "$$this"] }
                }
              }
            }
          },
          {
            $lookup: {
              from: "cln_static_company_funding_rounds",
              localField: "category_ids",
              foreignField: "_id",
              as: "funding_rounds",
              pipeline: [
                { $project: { category_name: 1 } }
              ]
            }
          }
        ],
        as: "funding_info"
      }
    },
    {
      $addFields: {
        funding_data: { $arrayElemAt: ["$funding_info", 0] }
      }
    },
    {
      $addFields: {
        total_funds_raised_companies: {
          $size: { $ifNull: ["$funding_data.funds_raised_ids", []] }
        },
        total_funds_raised_rounds: {
          $size: { $ifNull: ["$funding_data.round_ids", []] }
        },
        funds_raised_rounds: {
          $ifNull: ["$funding_data.funding_rounds.category_name", []]
        },
        total_funds_raised_amount: {
          $ifNull: ["$funding_data.total_funds_raised_amount", 0]
        }
      }
    },
    {
      $lookup: {
        from: "cln_funding_investment_lists",
        let: { investorId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$investor_row_id", "$$investorId"] },
              investor_type: 2,
              investor_registered_type: 1,
              verified_status: 1
            }
          },
          {
            $lookup: {
              from: "cln_company_lists",
              let: {
                fr_reg_type: "$funds_raised_registered_type",
                fr_company_id: "$funds_raised_company_row_id"
              },
              pipeline: [
                {
                  $match: {
                    $and: [
                      {
                        $expr: {
                          $and: [
                            { $eq: ["$$fr_reg_type", 1] },
                            { $eq: ["$_id", "$$fr_company_id"] }
                          ]
                        }
                      },
                      { active_status: 1 }
                    ]
                  }
                },
                { $project: { _id: 1 } }
              ],
              as: "recipient_company"
            }
          },
          {
            $addFields: {
              recipient_ok: {
                $cond: [
                  { $eq: ["$funds_raised_registered_type", 1] },
                  { $gt: [{ $size: "$recipient_company" }, 0] },
                  true
                ]
              }
            }
          },
          { $match: { recipient_ok: true } },
          // Self-lookup: count how many total rows (across all investors) share
          // this row's round_id, to detect syndicate (multi-investor) rounds.
          {
            $lookup: {
              from: "cln_funding_investment_lists",
              let: { round_id: "$round_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$round_id", "$$round_id"] }
                  }
                },
                { $project: { _id: 1 } }
              ],
              as: "round_investor_rows"
            }
          },
          // Exclude syndicate rounds (more than 1 investor sharing round_id) —
          // same rule already applied to investor_overview and investment_graph:
          // syndicate amounts are excluded entirely, not deduped-and-included,
          // since this investor's individual contribution isn't known.
          {
            $match: {
              $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] }
            }
          },
          {
            $group: {
              _id: "$investor_row_id",
              total_invested_amount: { $sum: "$amount" },
              round_ids: { $addToSet: "$round_id" },
              category_ids: { $addToSet: "$category_row_id" },
              funds_raised_ids: { $addToSet: "$funds_raised_company_row_id" }
            }
          }
        ],
        as: "investments_agg"
      }
    },
    {
      $lookup: {
        from: "cln_static_company_funding_rounds",
        let: {
          category_ids: {
            $ifNull: [{ $arrayElemAt: ["$investments_agg.category_ids", 0] }, []]
          }
        },
        pipeline: [
          { $match: { $expr: { $in: ["$_id", "$$category_ids"] } } },
          { $project: { category_name: 1 } }
        ],
        as: "invested_rounds"
      }
    },
    {
      $addFields: {
        total_invested_amount: {
          $ifNull: [{ $arrayElemAt: ["$investments_agg.total_invested_amount", 0] }, 0]
        },
        total_invested_rounds: {
          $size: {
            $ifNull: [{ $arrayElemAt: ["$investments_agg.round_ids", 0] }, []]
          }
        },
        total_invested_companies: {
          $size: {
            $ifNull: [{ $arrayElemAt: ["$investments_agg.funds_raised_ids", 0] }, []]
          }
        }
      }
    },
    {
      $lookup: {
        from: "cln_company_revenue_details",
        localField: "_id",
        foreignField: "company_row_id",
        as: "revenue_info",
        pipeline: [
          { $sort: { year: -1, quarter: -1 } },
          {
            $group: {
              _id: "$company_row_id",
              pushed_data: {
                $push: {
                  $cond: [
                    { $lt: ["$quarter", 5] },
                    {
                      year: "$year",
                      quarter: "$quarter",
                      revenue: "$revenue"
                    },
                    "$$REMOVE"
                  ]
                }
              },
              total_revenue: { $sum: "$revenue" }
            }
          },
          {
            $project: {
              total_revenue: 1,
              revenue_growth: {
                $cond: [
                  {
                    $and: [
                      { $gte: [{ $size: "$pushed_data" }, 2] },
                      { $ne: [{ $arrayElemAt: ["$pushed_data.revenue", 1] }, 0] }
                    ]
                  },
                  {
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
                      100
                    ]
                  },
                  0
                ]
              }
            }
          }
        ]
      }
    },
    { $unwind: { path: "$revenue_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_company_products",
        let: { companyId: "$_id" },
        as: "products_info",
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$company_row_id", "$$companyId"] },
              company_type: 1
            }
          },
          {
            $group: {
              _id: "$company_row_id",
              total_products: { $sum: 1 },
              product_ids: {
                $addToSet: {
                  register_type: "$register_type",
                  product_type: "$product_type",
                  product_row_id: "$product_row_id"
                }
              }
            }
          },
          { $project: { total_products: 1, product_ids: 1 } }
        ]
      }
    },
    { $unwind: { path: "$products_info", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        total_products: "$products_info.total_products",
        product_ids: "$products_info.product_ids"
      }
    },
    {
      $lookup: {
        from: "cln_company_holdings",
        let: { companyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$company_row_id", "$$companyId"] },
              company_type: 1
            }
          },
          {
            $group: {
              _id: "$company_row_id",
              total_holdings: { $sum: "$purchased_value_in_usd" },
              token_row_ids: {
                $addToSet: {
                  $cond: [
                    { $eq: ["$token_type", 1] },
                    "$token_row_id",
                    "$$REMOVE"
                  ]
                }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { total_holdings: -1 } }
        ],
        as: "company_holdings"
      }
    },
    {
      $addFields: {
        total_holdings: {
          $ifNull: [{ $arrayElemAt: ["$company_holdings.total_holdings", 0] }, 0]
        },
        token_row_ids: {
          $ifNull: [{ $arrayElemAt: ["$company_holdings.token_row_ids", 0] }, []]
        }
      }
    },
    {
      $lookup: {
        from: "cln_jobs",
        let: { companyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$company_row_id", "$$companyId"] },
              active_status: "active",
              is_deleted: false
            }
          },
          { $project: { job_title: 1 } },
          { $sort: { createdAt: -1 } }
        ],
        as: "company_jobs"
      }
    },
    {
      $addFields: {
        job_roles: {
          $map: {
            input: "$company_jobs",
            as: "job",
            in: "$$job.job_title"
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_id: 1,
        company_logo: 1,
        established_in: 1,
        describe_in_one_line: 1,
        company_size_row_id: 1,
        company_location: 1,
        company_valuation: 1,
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        main_business_model_name: "$main_business_info.business_name",
        business_name: "$business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: {
          $cond: {
            if: { $gt: [{ $size: "$followers_info" }, 0] },
            then: "$followers_info.count",
            else: 0
          }
        },
        total_events: 1,
        total_sponsors: {
          $ifNull: [
            { $arrayElemAt: ["$info_sponsor.count", 0] },
            0
          ]
        },
        total_partners: {
          $ifNull: [
            { $arrayElemAt: ["$info_partner.count", 0] },
            0
          ]
        },
        total_funds_raised_companies: 1,
        total_funds_raised_rounds: 1,
        funds_raised_rounds: 1,
        total_funds_raised_amount: 1,
        total_invested_rounds: 1,
        total_invested_amount: 1,
        invested_rounds: {
          $map: {
            input: "$invested_rounds",
            as: "r",
            in: "$$r.category_name"
          }
        },
        total_revenue: "$revenue_info.total_revenue",
        revenue_growth: "$revenue_info.revenue_growth",
        total_products: 1,
        product_ids: 1,
        total_holdings: 1,
        token_row_ids: 1,
        job_roles: 1,
        lat_num: 1,
        lon_num: 1,
        latitude: 1,
        longitude: 1
      }
    }
  ]

  return [
    ...sharedPrefixStages,
    {
      $facet: {
        data: dataStages,
        totalCount: [{ $count: 'count' }]
      }
    }
  ]
}
