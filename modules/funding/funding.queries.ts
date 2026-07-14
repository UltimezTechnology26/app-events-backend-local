import type { PipelineStage } from 'mongoose'
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'

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
 */
export function resolveInvestorStages(opts: { rich: boolean }): PipelineStage[] {
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
  ] as PipelineStage[]
}

/**
 * Resolves who raised the funds — always a company, never a professional, either
 * registered (funds_raised_registered_type=1) or manually-entered (=2). Only 2
 * lookups, unlike resolveInvestorStages' 4, since there is no professional branch
 * on this side.
 */
export function resolveFundsRaisedCompanyStages(opts: { rich: boolean }): PipelineStage[] {
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
    { $match: { company_data: { $nin: ['', null] } } }
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
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
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
  const funding_roundsM = require('../../models/app/static/funding_roundsM')
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
