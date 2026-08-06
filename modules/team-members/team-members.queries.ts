// modules/team-members/team-members.queries.ts
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { buildTeamMemberFilterStages } from '../common/common.enrichment'

export interface GetEmployeeListParams {
  /** The caller's own resolved company _id (already validated/approved by the controller). */
  company_row_id: number
  skip: number
  limit: number
  search?: string
}

export interface GetEmployeeListResult {
  get_query: any[]
  counts: number
}

/**
 * Ports controllers/app/company/employee.js's GET /list/:skip/:limit (lines ~240-706) — the
 * company-owner's own paginated team-member list (professionals_work_experienceM records with
 * company_type: 1, till_date_status: 2, scoped to the caller's own company_row_id), with an
 * optional search across user_name/full_name/position_name/company_name. This endpoint's real
 * source ALREADY has the two-lookup positions[] resolution pattern — this is a pure move, not a
 * bug fix.
 *
 * getPositionResolutionStages() integration: the real source's LIST aggregate already runs the
 * two shared resolved_static_positions/resolved_manual_positions $lookup stages verbatim
 * (identical `from`/`as`/pipeline to getPositionResolutionStages()'s own two lookups). Only those
 * two lookup stages are spliced in here (`.slice(0, 2)`) — the shared function's third stage (its
 * own $set) is NOT used, because the real source resolves `positions` directly inside its final
 * $project stage (not a $set) with an identical $cond+else pattern. This is the same
 * lookups-only-dedup tradeoff already established for getProfessionalDetailList() in
 * work-experience.queries.ts.
 *
 * count_query asymmetry (real, intentionally preserved): the companion count aggregate (used only
 * for `$count`) does NOT run the resolved_static_positions/resolved_manual_positions lookups and
 * has no `positions[]` field anywhere — it only computes a single `position_name` via the older
 * `info_position` lookup, because a `$count` result never needs the resolved array. This asymmetry
 * is preserved exactly; do not "fix" the count pipeline by adding matching lookups to it.
 *
 * Caching: the real source's cache read (getCache) genuinely short-circuits (unlike
 * getProfessionalDetailList's dead/commented-out read), and — unusually — calls res.json(...)
 * BEFORE `await setCache(...)` on the write path (respond-then-cache, the reverse of the far more
 * common cache-then-respond order elsewhere in this codebase). Caching stays a controller-layer
 * concern per this module's convention; this function only runs both aggregates and returns both
 * results so the controller can replicate the real cache-read short-circuit and the real
 * respond-before-cache-write ordering exactly.
 */
export async function getEmployeeList(params: GetEmployeeListParams): Promise<GetEmployeeListResult> {
  const { company_row_id, skip, limit, search } = params
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const query: any[] = [{ user_data: { $exists: true, $ne: '' }, company_type: 1, company_row_id, till_date_status: 2 }]
  if (search) {
    query.push({
      $or: [
        { user_name: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } },
        { position_name: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } }
      ]
    })
  }

  const get_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        localField: 'position_row_id',
        foreignField: '_id',
        as: 'info_position',
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_manual_user_positions',
        let: { position_type: '$position_type', sub_position_row_id: '$sub_position_row_id' },
        as: 'manual_position_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$position_type'] }, { $eq: ['$_id', '$$sub_position_row_id'] }] } } },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_position_info', preserveNullAndEmptyArrays: true } },
    ...getPositionResolutionStages().slice(0, 2),
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          {
            $project: {
              _id: 1, user_name: 1, full_name: 1, pro_batch: 1, email_id: 1, approval_status: 1,
              profile_image: '$img_info.profile_image'
            }
          }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $set: {
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        pro_batch: '$user_data.pro_batch'
      }
    },
    { $match: { $and: query } },
    {
      $project: {
        _id: 1, user_row_id: 1, user_account_type: 1, position_type: 1, position_row_id: 1, sub_position_row_id: 1,
        pro_batch: 1, full_name: 1, email_id: '$user_data.email_id', profile_image: '$user_data.profile_image',
        user_approval_status: '$user_data.approval_status', verified_status: 1, verified_on: 1, employment_type: 1,
        location_type: 1, designation_type: 1, start_date: 1, responsibilities: 1,
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } },
        positions: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: ['$positions', []] } }, 0] },
            then: {
              $map: {
                input: { $ifNull: ['$positions', []] },
                as: 'p',
                in: {
                  position_type: '$$p.position_type',
                  position_row_id: '$$p.position_row_id',
                  sub_position_row_id: '$$p.sub_position_row_id',
                  position_name: {
                    $cond: {
                      if: { $eq: ['$$p.position_type', 2] },
                      then: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_manual_positions', cond: { $eq: ['$$this._id', '$$p.sub_position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                      else: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_static_positions', cond: { $eq: ['$$this._id', '$$p.position_row_id'] } } }, in: '$$this.position_name' } }, 0] }
                    }
                  }
                }
              }
            },
            else: [{
              position_type: '$position_type',
              position_row_id: '$position_row_id',
              sub_position_row_id: '$sub_position_row_id',
              position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } }
            }]
          }
        }
      }
    }
  ]).skip(skip).limit(limit)

  const count_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        localField: 'position_row_id',
        foreignField: '_id',
        as: 'info_position',
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $set: {
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        position_name: '$info_position.position_name'
      }
    },
    { $match: { $and: query } },
    { $count: 'count' }
  ])

  let counts = 0
  if (count_query[0]) {
    counts = count_query[0].count
  }

  return { get_query, counts }
}

export interface GetEmployeeIndividualDetailsParams {
  /** The caller's own resolved company _id (already validated/approved by the controller). */
  company_row_id: number
  request_row_id: number
}

/**
 * Ports controllers/app/company/employee.js's GET /individual_details/:request_row_id
 * (lines ~708-916) — a single team member's flattened detail record, scoped to the caller's own
 * company (company_type: 1, company_row_id, till_date_status: 2).
 *
 * BUG FIX (real, confirmed against the source, not a paraphrase): the real pipeline here ONLY
 * resolves `position_name` via the single legacy `info_position` lookup
 * (cln_static_professionals_work_positions) — it has NO `manual_position_info` lookup and NO
 * resolved_static_positions/resolved_manual_positions lookups, and its final $project has no
 * `positions` field at all. Every other already-ported read in this endpoint family
 * (getEmployeeList above, getIndividualProfessionalDetails, getAdminIndividualProfessionalDetails)
 * resolves the full positions[] array; this one silently didn't. This port fixes that: it splices
 * getPositionResolutionStages()'s two $lookup stages in (after the existing manual_info $unwind,
 * before the existing $set/$match/$project trio) and adds a `positions` key to the final
 * $project, using the same $cond+else pattern getEmployeeList's own $project uses above (chosen
 * over getPositionResolutionStages()'s own $set stage for the same reason as getEmployeeList: the
 * endpoint's real $set stage already owns `user_data` and would need `positions` declared a
 * second time in the same $set, which Mongo aggregation does not allow — computing `positions`
 * directly in the final $project keeps the fix minimal and consistent with this file's other
 * function).
 *
 * position_name itself is intentionally left untouched — it still resolves from `info_position`
 * only, with no position_type-based $cond distinguishing static vs. manual positions. That is a
 * separate, narrower, pre-existing quirk of this endpoint (this port never added a
 * manual_position_info lookup, since the task scope is specifically the missing positions[]
 * array) — not something this fix silently expands to cover. The `positions[]` fallback (when the
 * document's `positions` array is empty) therefore also falls back to `info_position.position_name`
 * only, for the same reason. See task report.
 *
 * Caching: unlike getEmployeeList (respond-then-cache), this endpoint's real cache write happens
 * in the ordinary order — `await setCache(...)` BEFORE `res.json(...)` — and its cache read also
 * genuinely short-circuits (both real/functional, not dead code). Both stay controller-layer
 * concerns; this function only returns the single flattened result object (or null) for the
 * controller to cache/respond with.
 */
export async function getEmployeeIndividualDetails(params: GetEmployeeIndividualDetailsParams): Promise<any | null> {
  const { company_row_id, request_row_id } = params
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const get_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        localField: 'position_row_id',
        foreignField: '_id',
        as: 'info_position',
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    ...getPositionResolutionStages().slice(0, 2),
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $match: {
        _id: request_row_id,
        user_data: { $exists: true, $ne: '' },
        company_type: 1,
        company_row_id,
        till_date_status: 2
      }
    },
    {
      $project: {
        _id: 1, user_account_type: 1, user_name: '$user_data.user_name', full_name: '$user_data.full_name',
        email_id: '$user_data.email_id', profile_image: '$user_data.profile_image',
        user_approval_status: '$user_data.approval_status', verified_status: 1, verified_on: 1,
        employment_type: 1, position_row_id: 1, position_name: '$info_position.position_name',
        location_type: 1, start_date: 1, responsibilities: 1,
        positions: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: ['$positions', []] } }, 0] },
            then: {
              $map: {
                input: { $ifNull: ['$positions', []] },
                as: 'p',
                in: {
                  position_type: '$$p.position_type',
                  position_row_id: '$$p.position_row_id',
                  sub_position_row_id: '$$p.sub_position_row_id',
                  position_name: {
                    $cond: {
                      if: { $eq: ['$$p.position_type', 2] },
                      then: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_manual_positions', cond: { $eq: ['$$this._id', '$$p.sub_position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                      else: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_static_positions', cond: { $eq: ['$$this._id', '$$p.position_row_id'] } } }, in: '$$this.position_name' } }, 0] }
                    }
                  }
                }
              }
            },
            else: [{
              position_type: '$position_type',
              position_row_id: '$position_row_id',
              sub_position_row_id: '$sub_position_row_id',
              position_name: '$info_position.position_name'
            }]
          }
        }
      }
    }
  ])

  return get_query[0] ?? null
}

export interface GetAdminEmployeeListParams {
  skip: number
  limit: number
  search?: string
  /** '1' -> verified_status:true, '2' -> verified_status:false. Any other value is ignored. */
  verified_status?: string
  employment_type?: string
}

export interface GetAdminEmployeeListResult {
  get_query: any[]
  counts: number
  /** The constructed $and filter array, returned so the controller can replicate the real
   *  source's response-shape leak (see BUG note below). */
  query: any[]
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /list/:skip/:limit
 * (lines ~654-942) — the admin-wide employee listing across ALL companies
 * (professionals_work_experienceM records with company_type: 1; no company_row_id scoping,
 * unlike getEmployeeList's own-company scoping).
 *
 * BUG FIX (real, confirmed against the source, not a paraphrase): the real admin list pipeline
 * ONLY resolves `position_name` via the single legacy `info_position` lookup
 * (cln_static_professionals_work_positions) — it has NO `manual_position_info` lookup and NO
 * resolved_static_positions/resolved_manual_positions lookups, and its final $project has no
 * `positions` field at all. This is the same class of bug already fixed for
 * getEmployeeIndividualDetails in this file. This port fixes it: it splices
 * getPositionResolutionStages()'s two $lookup stages in (after the existing info_position
 * $unwind, before the user_info lookup) and adds a `positions` key to the final $project, using
 * the same $cond+else pattern getEmployeeList/getEmployeeIndividualDetails use above (their own
 * $set stage already owns other computed fields, so `positions` is computed directly in the
 * final $project rather than via getPositionResolutionStages()'s own $set stage — same reasoning
 * as getEmployeeIndividualDetails). Because the real source never resolved position_type: 2
 * (manual) positions at all here, `position_name` itself is left exactly as the real source
 * computes it (`$info_position.position_name`, no position_type $cond) — narrower than
 * getEmployeeList's fix, matching the getEmployeeIndividualDetails precedent of not silently
 * expanding scope beyond the missing positions[] array.
 *
 * No company scoping (real, confirmed): unlike getEmployeeList, the base $match here is just
 * `{ company_type: 1 }` — admin lists employees across every company, not just the caller's own.
 *
 * Search/filter fields (real, confirmed, differ from getEmployeeList): the $or search covers
 * user_name/user_full_name/company_name/company_email_id/position_name (5 fields, admin-specific
 * field names e.g. `user_full_name` not `full_name`) — plus two admin-only optional filters app's
 * getEmployeeList doesn't have: `verified_status` ('1' -> true, '2' -> false, any other value
 * ignored) and an exact `employment_type` match.
 *
 * No caching (real, confirmed): unlike getEmployeeList, this admin endpoint has no getCache/
 * setCache calls anywhere. Nothing to preserve or replicate at the controller layer here.
 *
 * Sort stage (real, confirmed): the LIST pipeline's very first stage is `{ $sort: { _id: -1 } }`,
 * before any lookups or the company_type $match. getEmployeeList's own list pipeline has no
 * top-level sort at all. This ordering is preserved exactly.
 *
 * Response shape / `query` leak (real, PRESERVED NOT FIXED — controller-layer concern, flagged
 * per task): the real source responds `{ status: true, message: get_query, counts, query }` —
 * the third field leaks the constructed $and filter array (including the raw, un-sanitized
 * `search` regex the caller supplied) back to the client. This function does not attempt to fix
 * that; it simply returns `query` alongside `get_query`/`counts` so the controller can replicate
 * the real response exactly. See task report for the explicit flag.
 *
 * count_query asymmetry (real, confirmed against THIS admin source, not assumed from app's
 * precedent): the companion count aggregate does not run the resolved_static_positions/
 * resolved_manual_positions lookups and has no `positions[]` field anywhere, matching
 * getEmployeeList's app-side asymmetry — a `$count` result never needs the resolved array. This
 * asymmetry is preserved exactly; do not "fix" the count pipeline by adding matching lookups to
 * it. (Separately, and NOT touched by this port: the real count pipeline's own $set stage
 * references `$info_position.position_name` despite never running the info_position $lookup in
 * the count pipeline at all — a pre-existing bug in the real source, faithfully preserved as-is
 * since it is unrelated to the positions[] scope of this task. See task report.)
 */
export async function getAdminEmployeeList(params: GetAdminEmployeeListParams): Promise<GetAdminEmployeeListResult> {
  const { skip, limit, search, verified_status, employment_type } = params
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const query: any[] = [{}]
  if (search) {
    query.push({
      $or: [
        { user_name: { $regex: search, $options: 'i' } },
        { user_full_name: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } },
        { company_email_id: { $regex: search, $options: 'i' } },
        { position_name: { $regex: search, $options: 'i' } }
      ]
    })
  }
  if (verified_status) {
    if (Number.parseInt(verified_status) === 1) {
      query.push({ verified_status: true })
    } else if (Number.parseInt(verified_status) === 2) {
      query.push({ verified_status: false })
    }
  }
  if (employment_type) {
    query.push({ employment_type: Number.parseInt(employment_type) })
  }

  const search_query = { $and: query }

  const get_query = await professionals_work_experienceM.aggregate([
    { $sort: { _id: -1 } },
    { $match: { company_type: 1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { active_status: 1 } },
          { $project: { _id: 1, company_id: 1, approval_status: 1, company_name: 1, company_logo: 1 } }
        ]
      }
    },
    { $unwind: { path: '$company_info' } },
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        localField: 'position_row_id',
        foreignField: '_id',
        as: 'info_position',
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    ...getPositionResolutionStages().slice(0, 2),
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_account_type: '$user_account_type', user_row_id: '$user_row_id' },
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [
          {
            $match: {
              $and: [
                { login_status: 1 },
                { $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }
              ]
            }
          },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1, user_name: 1, login_status: 1, full_name: 1, pro_batch: 1, email_id: 1,
              approval_status: 1, profile_image: '$img_info.profile_image'
            }
          }
        ]
      }
    },
    { $unwind: { path: '$user_info' } },
    {
      $set: {
        user_name: '$user_info.user_name',
        pro_batch: '$user_info.pro_batch',
        user_full_name: '$user_info.full_name',
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        position_name: '$info_position.position_name'
      }
    },
    { $match: search_query },
    {
      $project: {
        _id: 1, position_name: 1, company_name: 1, company_id: 1,
        company_logo: '$company_info.company_logo', company_approval_status: '$company_info.approval_status',
        user_account_type: 1, user_full_name: 1, user_name: 1, pro_batch: 1,
        user_profile_image: '$user_info.profile_image', user_approval_status: '$user_info.approval_status',
        end_date: 1, till_date_status: 1, verified_status: 1, verified_on: 1, employment_type: 1, start_date: 1,
        positions: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: ['$positions', []] } }, 0] },
            then: {
              $map: {
                input: { $ifNull: ['$positions', []] },
                as: 'p',
                in: {
                  position_type: '$$p.position_type',
                  position_row_id: '$$p.position_row_id',
                  sub_position_row_id: '$$p.sub_position_row_id',
                  position_name: {
                    $cond: {
                      if: { $eq: ['$$p.position_type', 2] },
                      then: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_manual_positions', cond: { $eq: ['$$this._id', '$$p.sub_position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                      else: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_static_positions', cond: { $eq: ['$$this._id', '$$p.position_row_id'] } } }, in: '$$this.position_name' } }, 0] }
                    }
                  }
                }
              }
            },
            else: [{
              position_type: '$position_type',
              position_row_id: '$position_row_id',
              sub_position_row_id: '$sub_position_row_id',
              position_name: '$info_position.position_name'
            }]
          }
        }
      }
    }
  ]).skip(skip).limit(limit)

  const count_query = await professionals_work_experienceM.aggregate([
    { $match: { company_type: 1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { active_status: 1 } },
          { $project: { _id: 1, company_id: 1, approval_status: 1, company_name: 1, company_logo: 1 } }
        ]
      }
    },
    { $unwind: { path: '$company_info' } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_account_type: '$user_account_type', user_row_id: '$user_row_id' },
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [
          {
            $match: {
              $and: [
                { login_status: 1 },
                { $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }
              ]
            }
          },
          { $project: { _id: 1, user_name: 1, pro_batch: 1, login_status: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } }
        ]
      }
    },
    { $unwind: { path: '$user_info' } },
    {
      $set: {
        user_name: '$user_info.user_name',
        pro_batch: '$user_info.pro_batch',
        user_full_name: '$user_info.full_name',
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        position_name: '$info_position.position_name'
      }
    },
    { $match: search_query },
    { $count: 'count' }
  ])

  let counts = 0
  if (count_query[0]) {
    counts = count_query[0].count
  }

  return { get_query, counts, query }
}

/**
 * Ports companyOtherDetails' `peoples_in_company_query` (services/company/front_page.ts:8716-9035),
 * moved here from modules/company/company.queries.ts's buildPeoplesInCompanyPipeline
 * (Part 3 §7 Phase B step 5, confirmed with the user before implementing). This is
 * the PUBLIC company-profile page's team list — verified members only, with
 * social links and "does the viewing visitor follow this person" — genuinely
 * different from getEmployeeList() above (the owner's private "manage my team"
 * view: all members including pending, no social links/follow-status). Confirmed
 * these are two distinct views, not the same query duplicated, before building
 * this as its own function rather than reusing getEmployeeList() directly.
 *
 * Reuses getPositionResolutionStages().slice(0, 2) (same two resolved_static_positions/
 * resolved_manual_positions lookups this file's other functions already share) and
 * buildTeamMemberFilterStages() (the user_info match+img_info lookup, same shape
 * just deduplicated above in getEmployeeList/getEmployeeIndividualDetails) instead
 * of re-declaring either — output is otherwise byte-identical to the original
 * inline aggregate, verified via the characterization harness before this move.
 */
export async function getPublicTeamMembersList({
  company_row_id,
  viewer_user_row_id
}: {
  company_row_id: number
  viewer_user_row_id: number
}) {
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

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
      $lookup: {
        from: "cln_static_professionals_work_positions",
        localField: "position_row_id",
        foreignField: "_id",
        as: "info_position",
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_manual_user_positions",
        let: { position_type: '$position_type', sub_position_row_id: '$sub_position_row_id' },
        as: "manual_position_info",
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, "$$position_type"] }, { $eq: ["$_id", "$$sub_position_row_id"] }] } } },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },
    ...getPositionResolutionStages().slice(0, 2),
    {
      $lookup: {
        from: "cln_professionals",
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: "user_info",
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          {
            $lookup: {
              from: "cln_professionals_social_links",
              localField: "_id",
              foreignField: "user_row_id",
              as: "social_info",
              pipeline: [
                { $project: { _id: 0, website: 1, facebook: 1, twitter: 1, linkedin: 1, instagram: 1, telegram: 1, medium: 1, reddit: 1, feed_url: 1 } }
              ]
            }
          },
          { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1, user_name: 1, full_name: 1, email_id: 1,
              profile_image: "$img_info.profile_image",
              pro_batch: 1, approval_status: 1, social_links: "$social_info"
            }
          }
        ]
      }
    },
    { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cln_professionals_manual_retrievals",
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: "manual_info",
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, "$$user_account_type"] }, { $eq: ["$_id", "$$user_row_id"] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: "$user_info" },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: "$manual_info" }
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
      $lookup: {
        from: "cln_professionals_followers",
        localField: "user_row_id",
        foreignField: "following_user_row_id",
        pipeline: [{ $match: { "follower_user_row_id": viewer_user_row_id } }],
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

export interface GetAdminCompanyEmployeeListParams {
  company_row_id: number
  skip: number
  limit: number
  search?: string
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET
 * /company_list/:company_row_id/:skip/:limit (Part 3 §7 Phase H step 8) — the admin's
 * single-company team-member list (the "Team" tab on a company's admin detail page), scoped to
 * one company_row_id via a body/param-supplied id rather than getEmployeeList's own-company
 * resolution. The real source ALREADY has the full two-lookup positions[] resolution pattern
 * (resolved_static_positions/resolved_manual_positions) — this is a pure move, not a bug fix,
 * same as getEmployeeList's own note above.
 *
 * Response shape (PRESERVED, not simplified to match getEmployeeList's $project): the real
 * source's $project includes `user_name` — getEmployeeList's own $project does NOT. Confirmed via
 * admin-coinpedia's real consumer (components/company/manage_company/team_details.js's mobile
 * view, `e.user_name`) that this field is actually read, not dead — reusing getEmployeeList's
 * $project verbatim here would have been a real, unflagged response-shape regression. Built as its
 * own function for this reason, even though the two pipelines are otherwise near-identical.
 *
 * CONFIRMED BUG FIX: the real source's admin-coinpedia caller (pages/api/companies/
 * manage_companies/team_members/list.js) has always forwarded a `search` query param to this
 * route, but the real backend route never read `req.query.search` anywhere — the admin's team
 * search box has therefore always been a no-op. Fixed by wiring an optional `$or` search clause
 * (same 4 fields as getEmployeeList's own search: user_name/full_name/position_name/company_name)
 * into both the list and count pipelines, mirroring getEmployeeList's existing pattern exactly.
 */
export async function getAdminCompanyEmployeeList(params: GetAdminCompanyEmployeeListParams): Promise<GetEmployeeListResult> {
  const { company_row_id, skip, limit, search } = params
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const query: any[] = [{ user_data: { $exists: true, $ne: '' }, company_type: 1, company_row_id, till_date_status: 2 }]
  if (search) {
    query.push({
      $or: [
        { user_name: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } },
        { position_name: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } }
      ]
    })
  }

  const get_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        localField: 'position_row_id',
        foreignField: '_id',
        as: 'info_position',
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_manual_user_positions',
        let: { position_type: '$position_type', sub_position_row_id: '$sub_position_row_id' },
        as: 'manual_position_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$position_type'] }, { $eq: ['$_id', '$$sub_position_row_id'] }] } } },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_position_info', preserveNullAndEmptyArrays: true } },
    ...getPositionResolutionStages().slice(0, 2),
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          {
            $project: {
              _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, pro_batch: 1,
              profile_image: '$img_info.profile_image'
            }
          }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $set: {
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        pro_batch: '$user_data.pro_batch'
      }
    },
    { $match: { $and: query } },
    {
      $project: {
        _id: 1, user_account_type: 1, user_row_id: 1, position_type: 1, position_row_id: 1, sub_position_row_id: 1,
        pro_batch: 1, user_name: 1, full_name: 1, email_id: '$user_data.email_id', profile_image: '$user_data.profile_image',
        user_approval_status: '$user_data.approval_status', verified_status: 1, verified_on: 1, employment_type: 1,
        designation_type: 1, location_type: 1, start_date: 1, responsibilities: 1,
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } },
        positions: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: ['$positions', []] } }, 0] },
            then: {
              $map: {
                input: { $ifNull: ['$positions', []] },
                as: 'p',
                in: {
                  position_type: '$$p.position_type',
                  position_row_id: '$$p.position_row_id',
                  sub_position_row_id: '$$p.sub_position_row_id',
                  position_name: {
                    $cond: {
                      if: { $eq: ['$$p.position_type', 2] },
                      then: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_manual_positions', cond: { $eq: ['$$this._id', '$$p.sub_position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                      else: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_static_positions', cond: { $eq: ['$$this._id', '$$p.position_row_id'] } } }, in: '$$this.position_name' } }, 0] }
                    }
                  }
                }
              }
            },
            else: [{
              position_type: '$position_type',
              position_row_id: '$position_row_id',
              sub_position_row_id: '$sub_position_row_id',
              position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } }
            }]
          }
        }
      }
    }
  ]).skip(skip).limit(limit)

  const count_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $set: {
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } }
      }
    },
    { $match: { $and: query } },
    { $count: 'count' }
  ])

  let counts = 0
  if (count_query[0]) {
    counts = count_query[0].count
  }

  return { get_query, counts }
}

export interface GetManualCompanyEmployeeListParams {
  company_row_id: number
  skip: number
  limit: number
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET
 * /manual_company_list/:company_row_id/:skip/:limit (Part 3 §7 Phase H step 8) — confirmed
 * UNREACHABLE (no caller found anywhere across admin-coinpedia, frontend-appcp-typescript, or
 * frontend-events-typescript; the file's own source comments it as "old not used code"). Ported
 * faithfully per the standing "port dead code, flag it, don't drop it" convention — fate deferred
 * to the FINAL PHASE, same as every other flagged-dead route this engagement.
 *
 * Deliberately simpler than getAdminCompanyEmployeeList above (real, confirmed difference, not a
 * missing feature to "complete"): no manual_position_info lookup, no resolved_static_positions/
 * resolved_manual_positions lookups, no `positions[]` array, no search. `position_name` resolves
 * only via the single legacy `info_position` lookup. Since nothing calls this route, none of these
 * gaps were fixed — faithful port only.
 *
 * Real asymmetry preserved exactly: the LIST match's `user_data` clause is
 * `{ $exists: true, $ne: '' }`; the COUNT match's is `{ $ne: '' }` only (no `$exists`) — a genuine
 * difference in the real source between this route's two pipelines, not a typo to "fix".
 */
export async function getManualCompanyEmployeeList(params: GetManualCompanyEmployeeListParams): Promise<GetEmployeeListResult> {
  const { company_row_id, skip, limit } = params
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const get_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        localField: 'position_row_id',
        foreignField: '_id',
        as: 'info_position',
        pipeline: [{ $project: { _id: 1, position_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $match: {
        user_data: { $exists: true, $ne: '' },
        company_type: 1,
        company_row_id,
        till_date_status: 2
      }
    },
    {
      $project: {
        _id: 1, user_account_type: 1, user_row_id: 1, position_row_id: 1,
        position_name: '$info_position.position_name',
        user_name: '$user_data.user_name', full_name: '$user_data.full_name', email_id: '$user_data.email_id',
        profile_image: '$user_data.profile_image', user_approval_status: '$user_data.approval_status',
        verified_status: 1, verified_on: 1, employment_type: 1, location_type: 1, start_date: 1, responsibilities: 1
      }
    }
  ]).skip(skip).limit(limit)

  const count_query = await professionals_work_experienceM.aggregate([
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          ...(buildTeamMemberFilterStages()[0] as any).$lookup.pipeline,
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $match: {
        user_data: { $ne: '' },
        company_type: 1,
        company_row_id,
        till_date_status: 2
      }
    },
    { $count: 'count' }
  ])

  let counts = 0
  if (count_query[0]) {
    counts = count_query[0].count
  }

  return { get_query, counts }
}

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /suggestions/:user_name (Part 3 §7
 * Phase H step 8) — confirmed UNREACHABLE (no caller anywhere; the file's own source marks it
 * "old not used code"). Ported faithfully, fate deferred to the FINAL PHASE.
 *
 * user_name search suggestions for professionalsM, excluding anyone who already has a pending
 * company_employees_requests entry (the join's `$match` on `empReq.user_row_id: { $exists: false }`
 * — an empty lookup array means the field genuinely doesn't exist on the unwound-less array
 * element check, MongoDB's normal dot-path-into-array semantics).
 */
export async function getEmployeeSuggestions(user_name: string) {
  const professionalsM = require('../../models/app/professionalsM')

  return professionalsM.aggregate([
    { $match: { user_name: { $regex: user_name, $options: 'i' }, login_status: 1 } },
    {
      $lookup: {
        from: 'cln_company_employees_requests',
        localField: '_id',
        foreignField: 'user_row_id',
        as: 'empReq'
      }
    },
    { $match: { 'empReq.user_row_id': { $exists: false } } },
    { $project: { user_name: 1 } }
  ]).limit(10)
}

/**
 * Ports the admin dashboard's team_members/pending_team_members stats (company.js's
 * company_individual_overview, Part 3 §7 Phase H step 5) — delegated here from
 * modules/company_admin/. Parameterized by an optional verified_status filter: omitted matches
 * the real team_members stat (which never filters on it), `false` matches the real
 * pending_team_members stat. Only resolves `_id` in the user-existence lookups (unlike
 * getEmployeeList's full display fields above) since this is count-only — the `user_data`
 * match only needs to know whether a linked user record resolved, not its contents.
 */
export function buildCompanyTeamMemberCountPipeline({ companyRowId, verifiedStatus }: { companyRowId: number; verifiedStatus?: boolean }) {
  return [
    ...(verifiedStatus === undefined ? [] : [{ $match: { verified_status: verifiedStatus } }]),
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }, { login_status: 1 }] } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' },
            ],
            default: '',
          },
        },
      },
    },
    { $match: { user_data: { $exists: true, $ne: '' }, company_type: 1, company_row_id: companyRowId, till_date_status: 2 } },
    { $count: 'count' },
  ]
}

/**
 * Ports controllers/app/company/front_page.js's GET /team_members (Part 3 §7
 * Phase H step 14) — a bulk team-members lookup across one or more companies
 * at once (distinct from getPublicTeamMembersList, which is single-company).
 *
 * CONFIRMED BUG FIX: the real source read `company_row_id` as a JSON-encoded
 * array from the query string (`?company_row_id=[123]`). Its only confirmed
 * live caller — admin-coinpedia's token-detail page, via
 * `pages/api/markets/tokens/team_members_list.js` — instead calls it with a
 * single id as a URL PATH segment (`/team_members/4763`), which the
 * param-less route registration (`/team_members`) can never match — the call
 * 404s before reaching this logic at all, meaning this feature has been
 * silently non-functional in production. Fixed by accepting an optional path
 * param (`companyRowIdFromPath`) alongside the existing query-string array
 * form, so the actually-used calling convention now reaches real logic while
 * the original array form still works for any caller relying on it.
 */
export async function getTeamMembersForCompanyIds({
  companyRowIds,
  viewerUserRowId
}: {
  companyRowIds: number[]
  viewerUserRowId: number
}): Promise<any[]> {
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  return professionals_work_experienceM.aggregate([
    ...getPositionResolutionStages(),
    {
      $lookup: {
        from: 'cln_professionals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'user_info',
        pipeline: [
          {
            $match: {
              $and: [
                { $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } },
                { login_status: 1 }
              ]
            }
          },
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
            $project: {
              _id: 1,
              user_name: 1,
              full_name: 1,
              email_id: 1,
              approval_status: 1,
              profile_image: '$img_info.profile_image',
              pro_batch: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
        as: 'manual_info',
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] }
            }
          },
          { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $lookup: {
        from: 'cln_professionals_followers',
        localField: 'user_row_id',
        foreignField: 'following_user_row_id',
        pipeline: [{ $match: { follower_user_row_id: viewerUserRowId } }],
        as: 'user_followed'
      }
    },
    { $unwind: { path: '$user_followed', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        user_data: { $exists: true, $ne: '' },
        company_type: 1,
        company_row_id: { $in: companyRowIds },
        till_date_status: 2
      }
    },
    {
      $project: {
        _id: 1,
        user_account_type: 1,
        user_row_id: 1,
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        pro_batch: '$user_data.pro_batch',
        email_id: '$user_data.email_id',
        profile_image: '$user_data.profile_image',
        user_approval_status: '$user_data.approval_status',
        verified_status: 1,
        verified_on: 1,
        employment_type: 1,
        positions: 1,
        location_type: 1,
        designation_type: 1,
        start_date: 1,
        responsibilities: 1,
        user_followed_status: { $cond: { if: '$user_followed.confirm_request_status', then: '$user_followed.confirm_request_status', else: 0 } }
      }
    }
  ])
}
