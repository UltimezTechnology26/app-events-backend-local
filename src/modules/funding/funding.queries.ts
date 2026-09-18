import type { PipelineStage } from 'mongoose'
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'

export interface RoundInvestorRow {
  investor_type: number
  investor_registered_type: number
  investor_row_id: number
  investor_category_row_id: number
}

/**
 * Reconstructs a funding round's investors[] array from its sibling rows (one document per
 * investor, all sharing `round_id`) — the shape createOrUpdateRound's `investors` param takes,
 * used as the change-request diff's `liveValues.investors` (change-request.diff.ts's default
 * branch structurally compares the two arrays). Sorted by `_id` (insertion order) so the same
 * round produces a stable comparison key across calls.
 */
export async function findRoundInvestors(roundId: number): Promise<RoundInvestorRow[]> {
  const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
  const rows = await fundingInvestmentM
    .find({ round_id: roundId }, { _id: 1, investor_type: 1, investor_registered_type: 1, investor_row_id: 1, investor_category_row_id: 1 })
    .sort({ _id: 1 })
    .lean()
  return rows.map((row: any) => ({
    investor_type: row.investor_type,
    investor_registered_type: row.investor_registered_type,
    investor_row_id: row.investor_row_id,
    investor_category_row_id: row.investor_category_row_id,
  }))
}

/**
 * Builds a Mongo aggregation expression that joins a resolved positions[] array
 * (as produced by getPositionResolutionStages()) into a single display string,
 * for consumers that can only show one position_name value per person. Mirrors
 * utils/helpers/app_helper.js's joinPositionNames join convention — filter out
 * falsy/unresolved names, then join with ", " except the last pair joined with
 * " and" (2 names -> "A and B"; 3+ names -> "A, B and C") — ported as a Mongo
 * expression (not a plain JS post-processing step, and without the JS helper's
 * capitalizeWords() call, since position_name values here are already stored/
 * resolved names) because this runs inside the aggregation pipeline itself, on
 * a single matched work-experience document's positions[] array, not on a
 * plain JS array after the query returns.
 *
 * Exported (not just used internally) because services/app/linkPageServices.ts's
 * report_list_type 2/3/4 sections and getPopularProfessionalsDetails need the
 * identical join convention for their own nested work-experience position
 * resolution — linkPageServices.ts already imports resolveFundsRaisedCompanyStages
 * and syndicateDetectionStages from this module, so reusing this export follows
 * that same established precedent rather than duplicating the logic a 3rd time.
 */
export function joinPositionNamesExpr(positionsArrayField: string): object {
  const names = {
    $filter: {
      input: { $map: { input: positionsArrayField, as: 'p', in: '$$p.position_name' } },
      as: 'n',
      cond: { $and: [{ $ne: ['$$n', null] }, { $ne: ['$$n', ''] }] }
    }
  }

  return {
    $let: {
      vars: { names },
      in: {
        $switch: {
          branches: [
            { case: { $eq: [{ $size: '$$names' }, 0] }, then: '' },
            { case: { $eq: [{ $size: '$$names' }, 1] }, then: { $arrayElemAt: ['$$names', 0] } }
          ],
          default: {
            $concat: [
              {
                $reduce: {
                  input: { $slice: ['$$names', 0, { $subtract: [{ $size: '$$names' }, 1] }] },
                  initialValue: '',
                  in: { $cond: { if: { $eq: ['$$value', ''] }, then: '$$this', else: { $concat: ['$$value', ', ', '$$this'] } } }
                }
              },
              ' and ',
              { $arrayElemAt: ['$$names', { $subtract: [{ $size: '$$names' }, 1] }] }
            ]
          }
        }
      }
    }
  }
}

/**
 * Nested lookups added inside the "rich" professional resolution branch:
 * profile image + most recent public work experience (position + employer name).
 * userAccountType distinguishes registered (1) vs manual (2) professionals, since
 * cln_professionals_work_experiences filters on it. Position resolution uses
 * getPositionResolutionStages() to resolve the FULL positions[] array (both
 * cln_static_professionals_work_positions and cln_manual_user_positions sources,
 * plus its own legacy-field fallback for pre-migration docs) for the single
 * latest-work-experience document already isolated by $match/$sort/$limit above,
 * then joins any multiple resolved names into one display string via
 * joinPositionNamesExpr — this feeds a single position_name field (resolveInvestorStages
 * below), not a UI that renders individual position chips.
 */
function richProfessionalNestedLookups(userAccountType: 1 | 2): PipelineStage[] {
  return [
    {
      $lookup: {
        from: 'cln_professionals_profile_images',
        localField: '_id',
        foreignField: 'user_row_id',
        as: 'img_info'
      }
    },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: '_id',
        foreignField: 'user_row_id',
        pipeline: [
          { $match: { public_view: true, user_account_type: userAccountType } },
          { $sort: { start_date: -1 } },
          { $limit: 1 },
          ...getPositionResolutionStages(),
          { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
          {
            $lookup: {
              from: 'cln_company_lists',
              let: { company_type: '$company_type', company_row_id: '$company_row_id' },
              as: 'info_company',
              pipeline: [
                {
                  $match: {
                    $and: [
                      { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } },
                      { active_status: 1 }
                    ]
                  }
                },
                { $project: { _id: 1, company_name: 1 } }
              ]
            }
          },
          { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_manual_retrievals',
              let: { company_type: '$company_type', company_row_id: '$company_row_id' },
              as: 'info_manual_company',
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
                { $project: { _id: 1, company_name: 1 } }
              ]
            }
          },
          { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              position_name: '$resolved_position_name',
              company_name: {
                $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' }
              }
            }
          }
        ],
        as: 'info_work'
      }
    },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } }
  ] as PipelineStage[]
}

/**
 * Resolves who invested: a registered professional, a manually-entered professional,
 * a registered company, or a manually-entered company — based on
 * investor_type (1=user,2=company) + investor_registered_type (1=registered,2=manual).
 * `rich: true` adds the profile image + latest work experience used by detail views;
 * `rich: false` returns id-only, used by validation/sum/overview aggregations.
 *
 * `dropUnresolved` (default true, preserving every existing caller's exact behavior)
 * controls the final "at least one of the 4 lookups matched" $match. CONFIRMED BUG (found
 * via live query, 2026-08-25): for manual companies specifically, this drops the entire
 * funding row whenever the referenced investor has been deleted — verified live, 17 of 347
 * real manual-company Fund Raised records (4.9%) were silently discarded this way even
 * though the funding record itself is valid. `getManualFundsRaisedList` opts out via
 * `dropUnresolved: false`; every other caller (registered-company flows, where an
 * unresolvable investor is a stronger signal of corrupt data) keeps the original behavior.
 */
export function resolveInvestorStages(opts: { rich: boolean; dropUnresolved?: boolean }): PipelineStage[] {
  const richUserFields = opts.rich
    ? { user_name: 1, pro_batch: 1, email_id: 1, approval_status: 1, login_status: 1, position_name: '$info_work.position_name', company_name: '$info_work.company_name', profile_image: '$img_info.profile_image' }
    : {}
  const richManualUserFields = opts.rich
    ? { gender: 1, pro_batch: 1, email_id: 1, profile_image: 1, position_name: '$info_work.position_name', company_name: '$info_work.company_name' }
    : {}
  const richCompanyFields = opts.rich
    ? { company_id: 1, company_logo: 1, company_email_id: 1, website_link: 1, active_status: 1, approval_status: 1 }
    : {}

  return [
    {
      $lookup: {
        from: 'cln_professionals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'user_info',
        pipeline: [
          {
            $match: {
              $and: [
                { $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } },
                { login_status: 1 }
              ]
            }
          },
          ...(opts.rich ? richProfessionalNestedLookups(1) : []),
          { $project: { _id: 1, full_name: 1, ...richUserFields } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'user_manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } },
          ...(opts.rich ? richProfessionalNestedLookups(2) : []),
          { $project: { _id: 1, full_name: 1, ...richManualUserFields } }
        ]
      }
    },
    { $unwind: { path: '$user_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'company_info',
        pipeline: [
          {
            $match: {
              $and: [
                { $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } },
                { active_status: 1, approval_status: 1 }
              ]
            }
          },
          { $project: { _id: 1, company_name: 1, ...richCompanyFields } }
        ]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'company_manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } }
        ]
      }
    },
    { $unwind: { path: '$company_manual_info', preserveNullAndEmptyArrays: true } },
    ...(opts.dropUnresolved === false
      ? []
      : [
          {
            $match: {
              $or: [
                { 'user_info._id': { $ne: null } },
                { 'user_manual_info._id': { $ne: null } },
                { 'company_info._id': { $ne: null } },
                { 'company_manual_info._id': { $ne: null } }
              ]
            }
          }
        ])
  ] as PipelineStage[]
}

/**
 * Resolves who raised the funds — always a company, never a professional, either
 * registered (funds_raised_registered_type=1) or manually-entered (=2). Only 2
 * lookups, unlike resolveInvestorStages' 4, since there is no professional branch
 * on this side.
 *
 * `dropUnresolved` (default true, preserving every existing caller's exact behavior) —
 * same reasoning/fix as `resolveInvestorStages` above. CONFIRMED live: 20 of 412 real
 * manual-company Fund Invested records (4.9%) were dropped because the company they
 * invested in had been deleted. `getManualInvestorList` opts out via
 * `dropUnresolved: false`; every other caller keeps the original behavior.
 */
export function resolveFundsRaisedCompanyStages(opts: { rich: boolean; dropUnresolved?: boolean }): PipelineStage[] {
  return [
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' },
        as: 'company_info',
        pipeline: [
          {
            $match: {
              $and: [
                { $expr: { $and: [{ $eq: [1, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } },
                { active_status: 1 }
              ]
            }
          },
          opts.rich
            ? { $project: { _id: 1, company_id: 1, company_logo: 1, company_name: 1, company_email_id: 1, website_link: 1, active_status: 1, approval_status: 1, profile_score: 1 } }
            : { $project: { _id: 1 } }
        ]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: '$company_info', else: '$manual_info' } }
      }
    },
    ...(opts.dropUnresolved === false ? [] : [{ $match: { company_data: { $nin: ['', null] } } }])
  ] as PipelineStage[]
}

/**
 * Merged funds_raised_overview (app + admin). Collapses the 4 sequential
 * aggregations the old app version ran into one $facet sharing the base match +
 * investor resolution (brief perf item #9). total_funds_invested (previously
 * always 0, computed on neither side) is dropped entirely. Field names follow the
 * agreed rename: total_usd_value (was admin's total_funds_raised),
 * funding_split_by_category (was app's misleadingly-named unique_investors_list).
 */
export async function getFundsRaisedOverview(companyRowId: number): Promise<{
  total_usd_value: number
  total_unique_investors: number
  total_unique_funding_rounds: number
  funding_split_by_category: Array<{ _id: number; total: number; investor_name: string }>
}> {
  const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
  const baseMatch = { verified_status: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: companyRowId }

  const [facetResult] = await fundingInvestmentM.aggregate([
    { $match: baseMatch },
    ...resolveInvestorStages({ rich: false }),
    {
      $facet: {
        roundsAndAmount: [
          { $group: { _id: '$round_id', amount: { $first: '$amount' }, category_row_id: { $first: '$category_row_id' } } }
        ],
        uniqueInvestors: [
          { $group: { _id: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' } } },
          { $count: 'count' }
        ]
      }
    }
  ])

  const rounds = facetResult?.roundsAndAmount ?? []
  const total_usd_value = rounds.reduce((sum: number, r: any) => sum + (r.amount || 0), 0)
  const total_unique_funding_rounds = rounds.length
  const total_unique_investors = facetResult?.uniqueInvestors?.[0]?.count ?? 0

  const splitByCategory = new Map<number, number>()
  for (const r of rounds) {
    splitByCategory.set(r.category_row_id, (splitByCategory.get(r.category_row_id) || 0) + (r.amount || 0))
  }
  const categoryIds = [...splitByCategory.keys()]
  const funding_roundsM = require('../../../models/app/static/funding_roundsM')
  const categories = categoryIds.length
    ? await funding_roundsM.find({ _id: { $in: categoryIds } }, { category_name: 1 }).lean()
    : []
  const categoryNameById = new Map(categories.map((c: any) => [c._id, c.category_name]))
  const funding_split_by_category = categoryIds
    .map((id) => ({ _id: id, total: splitByCategory.get(id)!, investor_name: (categoryNameById.get(id) as string) || '' }))
    .sort((a, b) => b.total - a.total)

  return { total_usd_value, total_unique_investors, total_unique_funding_rounds, funding_split_by_category }
}

/**
 * Self-joins on round_id to count how many total rows share it. More than 1 means
 * this is a syndicate (multi-investor) round — the frontend uses is_syndicate to
 * hide Edit/Delete and show a "co-invested" disclosure, since an individual investor
 * shouldn't edit/delete a round record shared with others.
 */
export function syndicateDetectionStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        let: { round_id: '$round_id' },
        as: 'round_investor_rows',
        pipeline: [
          { $match: { $expr: { $eq: ['$round_id', '$$round_id'] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    {
      $set: {
        round_investor_count: { $size: '$round_investor_rows' },
        is_syndicate: { $gt: [{ $size: '$round_investor_rows' }, 1] }
      }
    }
  ] as PipelineStage[]
}

/**
 * Collapses a round's flat per-investor rows into one document with an investors[]
 * array. Round-level fields (announcement_date, amount, category) are identical
 * across every row in the round (edit-as-a-whole), so $first is safe; investor-level
 * fields are pushed into the array.
 */
export function groupRoundWithInvestorsStages(): PipelineStage[] {
  return [
    {
      $group: {
        _id: '$round_id',
        round_id: { $first: '$round_id' },
        announcement_date: { $first: '$announcement_date' },
        amount: { $first: '$amount' },
        category_row_id: { $first: '$category_row_id' },
        category_name: { $first: '$category_name' },
        investors: {
          $push: {
            _id: '$_id',
            verified_status: '$verified_status',
            verified_on: '$verified_on',
            investor_row_id: '$investor_row_id',
            investor_type: '$investor_type',
            investor_registered_type: '$investor_registered_type',
            reject_type: '$reject_type',
            reject_reason: '$reject_reason',
            investor_image: '$investor_image',
            investor_name: '$investor_name',
            investor_email_id: '$investor_email_id',
            investor_position_name: '$investor_position_name',
            investor_company_name: '$investor_company_name',
            investor_category_row_id: '$investor_category_row_id',
            investor_category_name: '$investor_category_name'
          }
        }
      }
    },
    {
      $project: { _id: 0, round_id: 1, announcement_date: 1, amount: 1, category_row_id: 1, category_name: 1, investors: 1 }
    }
  ] as PipelineStage[]
}

/**
 * Ports companyList's report_list_type===3 branch (services/company/front_page.ts:1645-2048)
 * — the "funds raised" company-directory listing. One $facet stage combining
 * list and count (Part 1 §3 finding 3, Part 3 §7 Phase B step 4) instead of two
 * separate `.aggregate()` calls; unlike the type=1 branch, both sides already
 * shared the identical base pipeline here (including the login_status filter),
 * so there's no count/list correctness bug to fix in this one — purely a
 * duplicate-query consolidation, output unchanged.
 */
export function buildCompanyListFundsRaisedPipeline({
  query,
  skip,
  limit,
  user_row_id,
  boundingBox
}: {
  query: any
  skip: number
  limit: number
  user_row_id: any
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}): PipelineStage[] {
  const basePipeline: any[] = [
    {
      $match: {
        funds_raised_registered_type: 1,
        verified_status: 1
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        let: {
          investor_type: "$investor_type",
          investor_registered_type: "$investor_registered_type",
          investor_row_id: "$investor_row_id"
        },
        as: "company_info",
        pipeline: [
          {
            $match: {
              $and: [
                {
                  $expr: {
                    $and: [
                      { $eq: [2, "$$investor_type"] },
                      { $eq: [1, "$$investor_registered_type"] },
                      { $eq: ["$_id", "$$investor_row_id"] }
                    ]
                  }
                },
                { active_status: 1 }
              ]
            }
          },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
    {
      $set: {
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
                then: "$company_info._id"
              },
              {
                case: {
                  $or: [
                    { $and: [{ $eq: ["$investor_type", 1] }, { $eq: ["$investor_registered_type", 2] }] },
                    { $and: [{ $eq: ["$investor_type", 2] }, { $eq: ["$investor_registered_type", 2] }] },
                    { $and: [{ $eq: ["$investor_type", 1] }, { $eq: ["$investor_registered_type", 1] }] }
                  ]
                },
                then: "$investor_row_id"
              }
            ],
            default: ""
          }
        }
      }
    },
    { $match: { investor_data: { $gt: 0 } } },
    // Collapse to one document per round_id BEFORE the company-level group,
    // so a multi-investor round's shared amount is counted once instead of
    // once per investor row — same rule as the funding_info lookup elsewhere
    // in this file. category_row_id is kept via $first since it's the same
    // across every row in a round.
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
    // Final group back to one document per company. round_ids counts
    // distinct ROUNDS. category_ids is kept for the funding_rounds name
    // lookup below. funds_raised_ids flattens the per-round investor
    // identities collected above into one set, since
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
    { $sort: { total_funds_raised_amount: -1, _id: 1 } },
    {
      $lookup: {
        from: "cln_static_company_funding_rounds",
        localField: "category_ids",
        foreignField: "_id",
        as: "funding_rounds",
        pipeline: [{ $project: { category_name: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        localField: "_id",
        foreignField: "_id",
        as: "company_info",
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          {
            $lookup: {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "user_info",
              pipeline: [
                { $match: { login_status: 1 } },
                { $project: { _id: 1, login_status: 1 } }
              ]
            }
          },
          { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
          {
            $set: {
              login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
            }
          },
          { $match: { login_status: 1 } },
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
              country_id: 1,
              latitude: 1,
              longitude: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$company_info" } },
    {
      $set: {
        company_name: "$company_info.company_name",
        company_id: "$company_info.company_id",
        company_location: "$company_info.company_location",
        business_model_id: "$company_info.business_model_id",
        main_business_model_id: "$company_info.main_business_model_id",
        country_id: "$company_info.country_id",
        company_valuation: "$company_info.company_valuation",
        latitude: "$company_info.latitude",
        longitude: "$company_info.longitude"
      }
    },
    {
      $addFields: {
        lat_num: { $convert: { input: "$latitude", to: "double", onError: null, onNull: null } },
        lon_num: { $convert: { input: "$longitude", to: "double", onError: null, onNull: null } }
      }
    },
    ...(boundingBox ? [{
      $match: {
        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
      }
    }] : []),
    { $match: query },
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
        from: "cln_static_company_business_models",
        localField: "business_model_id",
        foreignField: "_id",
        as: "business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
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
      $project: {
        _id: 1,
        company_name: 1,
        company_id: 1,
        latitude: 1,
        longitude: 1,
        lat_num: 1,
        lon_num: 1,
        total_funds_raised_companies: { $size: "$funds_raised_ids" },
        total_funds_raised_rounds: { $size: "$round_ids" },
        funds_raised_rounds: "$funding_rounds.category_name",
        total_funds_raised_amount: 1,
        company_location: 1,
        main_business_model_id: 1,
        country_id: 1,
        company_logo: "$company_info.company_logo",
        describe_in_one_line: "$company_info.describe_in_one_line",
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        company_valuation: 1,
        business_name: "$business_info.business_name",
        main_business_model_name: "$main_business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } }
      }
    }
  ]

  return [
    ...basePipeline,
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }]
      }
    }
  ] as PipelineStage[]
}

/**
 * Ports partnersList's report_list_type===3 branch (services/company/front_page.ts:5734-6301)
 * — the "funds raised" partner-directory listing (same shape as
 * buildCompanyListFundsRaisedPipeline, but scoped to partner-flagged companies
 * via the cln_company_added_to_partners inner-join). $facet consolidation only
 * (Part 1 §3 finding 3) — list and count already shared an identical filter
 * chain (including the partner + login_status filters) here, confirmed line by
 * line before migrating, so there's no correctness bug to fix in this one.
 */
export function buildPartnersListFundsRaisedPipeline({
  searchArray,
  skip,
  limit,
  user_row_id
}: {
  searchArray: any[]
  skip: number
  limit: number
  user_row_id: any
}): PipelineStage[] {
  const basePipeline: any[] = [
    {
      $match: {
        funds_raised_registered_type: 1, verified_status: 1
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        let: {
          investor_type: '$investor_type',
          investor_registered_type: '$investor_registered_type',
          investor_row_id: '$investor_row_id'
        },
        as: "company_info",
        pipeline: [
          {
            $match: {
              $and: [
                {
                  $expr: {
                    $and: [
                      { $eq: [2, '$$investor_type'] },
                      { $eq: [1, '$$investor_registered_type'] },
                      { $eq: ['$_id', '$$investor_row_id'] }
                    ]
                  }
                },
                { active_status: 1 }
              ]
            }
          },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              {
                case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] },
                then: "$company_info._id"
              },
              {
                case: {
                  $or: [
                    { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] },
                    { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 2] }] },
                    { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }
                  ]
                },
                then: "$investor_row_id"
              }
            ],
            default: ""
          }
        }
      }
    },
    { $match: { investor_data: { $gt: 0 } } },
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
    { $sort: { total_funds_raised_amount: -1, _id: 1 } },
    {
      $lookup: {
        from: "cln_static_company_funding_rounds",
        localField: "category_ids",
        foreignField: "_id",
        as: "funding_rounds",
        pipeline: [{ $project: { category_name: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        localField: "_id",
        foreignField: "_id",
        as: "company_info",
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          {
            $lookup: {
              from: "cln_company_added_to_partners",
              localField: "_id",
              foreignField: "company_row_id",
              as: "info_parnters",
              pipeline: [{ $project: { _id: 1 } }]
            }
          },
          { $unwind: { path: "$info_parnters" } },
          {
            $lookup: {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "user_info",
              pipeline: [
                { $match: { login_status: 1 } },
                { $project: { _id: 1, login_status: 1 } }
              ]
            }
          },
          { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
          {
            $set: {
              login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
            }
          },
          { $match: { login_status: 1 } },
          {
            $project: {
              company_name: 1,
              company_id: 1,
              company_logo: 1,
              latitude: 1,
              longitude: 1,
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
      $set: {
        company_name: "$company_info.company_name",
        company_id: "$company_info.company_id",
        company_location: "$company_info.company_location",
        business_model_id: "$company_info.business_model_id",
        main_business_model_id: "$company_info.main_business_model_id",
        country_id: "$company_info.country_id",
        company_valuation: "$company_info.company_valuation"
      }
    },
    { $match: { $and: searchArray } },
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
        from: "cln_static_company_business_models",
        localField: "business_model_id",
        foreignField: "_id",
        as: "business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
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
          { $unwind: { path: "$inner_user_info" } },
          { $count: 'count' }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_user_following"
      }
    },
    { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
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
        company_row_id: "$_id",
        company_name: 1,
        company_id: 1,
        total_funds_raised_companies: { $size: '$funds_raised_ids' },
        total_funds_raised_rounds: { $size: '$category_ids' },
        funds_raised_rounds: '$funding_rounds.category_name',
        company_location: 1,
        main_business_model_id: 1,
        country_id: 1,
        total_funds_raised_amount: 1,
        company_logo: "$company_info.company_logo",
        describe_in_one_line: '$company_info.describe_in_one_line',
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        company_valuation: 1,
        latitude: "$company.latitude",
        longitude: "$company.longitude",
        business_name: "$business_info.business_name",
        main_business_model_name: "$main_business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } }
      }
    }
  ]

  return [
    ...basePipeline,
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }]
      }
    }
  ] as PipelineStage[]
}

/**
 * Ports companyList's report_list_type===4 branch (services/company/front_page.ts:2050-2426)
 * — the "funds invested" company-directory listing (companies that invested in
 * others, as opposed to type=3's companies that raised funds). Same $facet
 * consolidation as buildCompanyListFundsRaisedPipeline; no login_status bug
 * here either (list/count already shared one base pipeline).
 */
export function buildCompanyListFundsInvestedPipeline({
  query,
  skip,
  limit,
  user_row_id,
  boundingBox
}: {
  query: any
  skip: number
  limit: number
  user_row_id: any
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}): PipelineStage[] {
  const basePipeline: any[] = [
    {
      $match: {
        investor_type: 2, investor_registered_type: 1, verified_status: 1
      }
    },
    ...(boundingBox ? [{
      $match: {
        $expr: {
          $and: [
            { $gte: [{ $convert: { input: "$latitude", to: "double", onError: null, onNull: null } }, boundingBox.minLat] },
            { $lte: [{ $convert: { input: "$latitude", to: "double", onError: null, onNull: null } }, boundingBox.maxLat] },
            { $gte: [{ $convert: { input: "$longitude", to: "double", onError: null, onNull: null } }, boundingBox.minLon] },
            { $lte: [{ $convert: { input: "$longitude", to: "double", onError: null, onNull: null } }, boundingBox.maxLon] }
          ]
        }
      }
    }] : []),
    {
      $lookup: {
        from: "cln_company_lists",
        let: {
          funds_raised_registered_type: '$funds_raised_registered_type',
          funds_raised_company_row_id: '$funds_raised_company_row_id'
        },
        as: "company_info",
        pipeline: [
          {
            $match: {
              $and: [
                {
                  $expr: {
                    $and: [
                      { $eq: [1, '$$funds_raised_registered_type'] },
                      { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                    ]
                  }
                },
                { active_status: 1 }
              ]
            }
          },
          { $project: { _id: 1, company_id: 1 } }
        ]
      }
    },
    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$funds_raised_registered_type', 1] }] }, then: '$company_info._id' },
              { case: { $and: [{ $eq: ['$funds_raised_registered_type', 2] }] }, then: '$funds_raised_company_row_id' }
            ],
            default: 0
          }
        }
      }
    },
    { $match: { investor_data: { $gt: 0 } } },
    // Self-lookup: count how many total rows (across all investors) share
    // this row's round_id, to detect syndicate (multi-investor) rounds.
    {
      $lookup: {
        from: "cln_funding_investment_lists",
        let: { round_id: "$round_id" },
        as: "round_investor_rows",
        pipeline: [
          { $match: { $expr: { $eq: ["$round_id", "$$round_id"] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    // Exclude syndicate rounds (more than 1 investor sharing round_id) — same
    // rule applied to investor_overview and investment_graph: syndicate
    // amounts are excluded entirely from this investor's totals, since their
    // individual contribution to a shared round isn't known.
    { $match: { $expr: { $lte: [{ $size: "$round_investor_rows" }, 1] } } },
    {
      $group: {
        _id: "$investor_row_id",
        total_invested_amount: { $sum: '$amount' },
        round_ids: { $addToSet: '$round_id' },
        category_ids: { $addToSet: '$category_row_id' },
        funds_raised_ids: { $addToSet: '$funds_raised_company_row_id' }
      }
    },
    // _id added as a secondary sort key (Part 3 §7 Phase B step 4, confirmed with
    // the user before fixing): total_invested_amount alone left ties (e.g. two
    // companies both at $0 invested) with no deterministic tiebreaker, so the
    // exact same query could return them in a different relative order between
    // separate executions — confirmed via the characterization harness comparing
    // two independent runs. Pre-existing in the legacy source, not introduced by
    // this migration; fixed here since this is where the pipeline was rewritten.
    { $sort: { total_invested_amount: -1, _id: 1 } },
    {
      $lookup: {
        from: "cln_static_company_funding_rounds",
        localField: "category_ids",
        foreignField: "_id",
        as: "invested_rounds",
        pipeline: [{ $project: { category_name: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        localField: "_id",
        foreignField: "_id",
        as: "company_info",
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          {
            $lookup: {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "user_info",
              pipeline: [
                { $match: { login_status: 1 } },
                { $project: { _id: 1, login_status: 1 } }
              ]
            }
          },
          { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
          {
            $set: {
              login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
            }
          },
          { $match: { login_status: 1 } },
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
              country_id: 1,
              latitude: 1,
              longitude: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$company_info" } },
    {
      $set: {
        company_name: "$company_info.company_name",
        company_id: "$company_info.company_id",
        company_location: "$company_info.company_location",
        business_model_id: "$company_info.business_model_id",
        main_business_model_id: "$company_info.main_business_model_id",
        country_id: "$company_info.country_id",
        company_valuation: "$company_info.company_valuation",
        latitude: "$company_info.latitude",
        longitude: "$company_info.longitude"
      }
    },
    { $match: query },
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
        from: "cln_static_company_business_models",
        localField: "business_model_id",
        foreignField: "_id",
        as: "business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
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
          { $unwind: { path: "$inner_user_info" } },
          { $count: 'count' }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_user_following"
      }
    },
    { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
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
        latitude: 1,
        longitude: 1,
        total_invested_companies: { $size: '$funds_raised_ids' },
        total_invested_rounds: { $size: '$round_ids' },
        invested_rounds: '$invested_rounds.category_name',
        company_location: 1,
        main_business_model_id: 1,
        country_id: 1,
        total_invested_amount: 1,
        business_name: "$business_info.business_name",
        company_logo: "$company_info.company_logo",
        describe_in_one_line: '$company_info.describe_in_one_line',
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        company_valuation: 1,
        main_business_model_name: "$main_business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } }
      }
    }
  ]

  return [
    ...basePipeline,
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }]
      }
    }
  ] as PipelineStage[]
}

/**
 * Ports partnersList's report_list_type===4 branch (services/company/front_page.ts:6303-6801)
 * — the "funds invested" partner-directory listing. $facet consolidation only
 * (Part 1 §3 finding 3); list and count already shared an identical filter
 * chain here (partner + login_status filters both applied identically before
 * the searchArray match), confirmed line by line, no correctness bug here.
 */
export function buildPartnersListFundsInvestedPipeline({
  searchArray,
  skip,
  limit,
  user_row_id
}: {
  searchArray: any[]
  skip: number
  limit: number
  user_row_id: any
}): PipelineStage[] {
  const basePipeline: any[] = [
    {
      $match: {
        investor_type: 2, investor_registered_type: 1, verified_status: 1
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        let: {
          funds_raised_registered_type: '$funds_raised_registered_type',
          funds_raised_company_row_id: '$funds_raised_company_row_id'
        },
        as: "company_info",
        pipeline: [
          {
            $match: {
              $and: [
                {
                  $expr: {
                    $and: [
                      { $eq: [1, '$$funds_raised_registered_type'] },
                      { $eq: ['$_id', '$$funds_raised_company_row_id'] }
                    ]
                  }
                },
                { active_status: 1 }
              ]
            }
          },
          { $project: { _id: 1, company_id: 1 } }
        ]
      }
    },
    { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$funds_raised_registered_type', 1] }] }, then: '$company_info._id' },
              { case: { $and: [{ $eq: ['$funds_raised_registered_type', 2] }] }, then: '$funds_raised_company_row_id' }
            ],
            default: 0
          }
        }
      }
    },
    { $match: { investor_data: { $gt: 0 } } },
    {
      $group: {
        _id: "$investor_row_id",
        total_invested_amount: { $sum: '$amount' },
        category_ids: { $addToSet: '$category_row_id' },
        funds_raised_ids: { $addToSet: '$funds_raised_company_row_id' }
      }
    },
    // _id added as a secondary sort key (Part 3 §7 Phase B step 4, confirmed with
    // the user before fixing): total_invested_amount alone left ties (e.g. two
    // companies both at $0 invested) with no deterministic tiebreaker, so the
    // exact same query could return them in a different relative order between
    // separate executions — confirmed via the characterization harness comparing
    // two independent runs. Pre-existing in the legacy source, not introduced by
    // this migration; fixed here since this is where the pipeline was rewritten.
    { $sort: { total_invested_amount: -1, _id: 1 } },
    {
      $lookup: {
        from: "cln_static_company_funding_rounds",
        localField: "category_ids",
        foreignField: "_id",
        as: "invested_rounds",
        pipeline: [{ $project: { category_name: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cln_company_lists",
        localField: "_id",
        foreignField: "_id",
        as: "company_info",
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          {
            $lookup: {
              from: "cln_company_added_to_partners",
              localField: "_id",
              foreignField: "company_row_id",
              as: "info_parnters",
              pipeline: [{ $project: { _id: 1 } }]
            }
          },
          { $unwind: { path: "$info_parnters" } },
          {
            $lookup: {
              from: "cln_professionals",
              localField: "user_row_id",
              foreignField: "_id",
              as: "user_info",
              pipeline: [
                { $match: { login_status: 1 } },
                { $project: { _id: 1, login_status: 1 } }
              ]
            }
          },
          { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
          {
            $set: {
              login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
            }
          },
          { $match: { login_status: 1 } },
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
              latitude: 1,
              longitude: 1,
              country_id: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$company_info" } },
    {
      $set: {
        company_name: "$company_info.company_name",
        company_id: "$company_info.company_id",
        company_location: "$company_info.company_location",
        business_model_id: "$company_info.business_model_id",
        main_business_model_id: "$company_info.main_business_model_id",
        country_id: "$company_info.country_id",
        company_valuation: "$company_info.company_valuation"
      }
    },
    { $match: { $and: searchArray } },
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
        from: "cln_static_company_business_models",
        localField: "business_model_id",
        foreignField: "_id",
        as: "business_info",
        pipeline: [{ $project: { business_name: 1 } }]
      }
    },
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
          { $unwind: { path: "$inner_user_info" } },
          { $count: 'count' }
        ]
      }
    },
    {
      $lookup: {
        from: "cln_company_followers",
        localField: "_id",
        foreignField: "company_row_id",
        pipeline: [{ $match: { "user_row_id": user_row_id } }],
        as: "info_user_following"
      }
    },
    { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
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
        company_row_id: "$_id",
        company_name: 1,
        company_id: 1,
        total_invested_companies: { $size: '$funds_raised_ids' },
        total_invested_rounds: { $size: '$category_ids' },
        invested_rounds: '$invested_rounds.category_name',
        company_location: 1,
        main_business_model_id: 1,
        country_id: 1,
        total_invested_amount: 1,
        company_logo: "$company_info.company_logo",
        describe_in_one_line: '$company_info.describe_in_one_line',
        country_flag: "$country_info.country_flag",
        country_name: "$country_info.country_name",
        company_valuation: 1,
        latitude: "$company.latitude",
        longitude: "$company.longitude",
        business_name: "$business_info.business_name",
        main_business_model_name: "$main_business_info.business_name",
        watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
        following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
        total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } }
      }
    }
  ]

  return [
    ...basePipeline,
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }]
      }
    }
  ] as PipelineStage[]
}

/**
 * Ports the admin dashboard's total_number_investor stat (company.js's company_overview/overview,
 * Part 3 §7 Phase H step 3) — counts distinct, verified investors whose invested-in company (or
 * manual-company row) is itself an approved, active, still-logged-in company. Delegated here from
 * modules/company_admin/ per the confirmed domain-split principle (funding stats belong in the
 * funding module, not reimplemented inline in the dashboard). Ported verbatim, byte-identical
 * between the two real-source routes — confirmed via a full diff before porting.
 */
export function buildVerifiedInvestorCountPipeline(): PipelineStage[] {
  return [
    { $match: { investor_type: 2, investor_registered_type: 1, verified_status: 1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'funds_raised_company_row_id',
        foreignField: '_id',
        let: { funds_raised_registered_type: '$funds_raised_registered_type' },
        as: 'company_info',
        pipeline: [
          { $match: { $expr: { $eq: [1, '$$funds_raised_registered_type'] }, active_status: 1 } },
          { $project: { _id: 1, company_id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$funds_raised_registered_type', 1] }] }, then: '$company_info._id' },
              { case: { $and: [{ $eq: ['$funds_raised_registered_type', 2] }] }, then: '$funds_raised_company_row_id' },
            ],
            default: 0,
          },
        },
      },
    },
    { $match: { investor_data: { $gt: 0 } } },
    { $group: { _id: '$investor_row_id' } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          {
            $lookup: {
              from: 'cln_professionals',
              localField: 'user_row_id',
              foreignField: '_id',
              as: 'user_info',
              pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1, login_status: 1 } }],
            },
          },
          { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
          { $set: { login_status: { $cond: { if: '$user_info', then: '$user_info.login_status', else: 1 } } } },
          { $match: { login_status: 1 } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ] as PipelineStage[]
}

/**
 * Ports the admin dashboard's total_funds_invested stat (company.js's
 * company_individual_overview, Part 3 §7 Phase H step 5) — sum of amounts this company invested
 * as a verified investor. Delegated here from modules/company_admin/ per the confirmed
 * domain-split principle. Reuses resolveFundsRaisedCompanyStages (confirmed byte-identical to
 * the legacy route's own company_info/manual_info cross-check) but keeps its own top-level match
 * — company_admin's getInvestorOverview lacks the legacy route's verified_status:1 filter, so it
 * isn't a safe drop-in replacement here without changing behavior.
 */
export function buildVerifiedFundsInvestedTotalPipeline(companyRowId: number): PipelineStage[] {
  return [
    { $match: { verified_status: 1, investor_registered_type: 1, investor_type: 2, investor_row_id: companyRowId } },
    ...resolveFundsRaisedCompanyStages({ rich: false }),
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ] as PipelineStage[]
}

/**
 * Ports the admin dashboard's total_funds_raised stat (company.js's
 * company_individual_overview, Part 3 §7 Phase H step 5) — sum of amounts this company raised
 * from verified investors. Ported verbatim rather than reusing resolveInvestorStages: that
 * helper's company_info branch additionally requires approval_status:1, which the legacy route's
 * own company_info lookup here does not — reusing it would silently exclude some funds-raised
 * rows the real route currently counts.
 */
export function buildVerifiedFundsRaisedTotalPipeline(companyRowId: number): PipelineStage[] {
  return [
    { $match: { verified_status: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: companyRowId } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'user_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } }, { login_status: 1 }] } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'user_manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$user_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'company_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } }, { active_status: 1 }] } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'company_manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } }],
      },
    },
    { $unwind: { path: '$company_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [{ 'user_info._id': { $ne: null } }, { 'user_manual_info._id': { $ne: null } }, { 'company_info._id': { $ne: null } }, { 'company_manual_info._id': { $ne: null } }],
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ] as PipelineStage[]
}
