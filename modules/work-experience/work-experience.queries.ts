/**
 * Returns the $lookup + $set pipeline stages that resolve a document's positions[] array
 * into names, using BOTH cln_static_professionals_work_positions and cln_manual_user_positions.
 * Falls back to the document's legacy singular position_row_id/position_type/sub_position_row_id
 * fields for pre-migration docs where positions[] is empty. Always resolves the full array,
 * never just positions[0]. This is the single source of truth for position-name resolution
 * across the whole codebase — do not duplicate this logic elsewhere.
 */
export function getPositionResolutionStages(positionsField: string = 'positions', outputField: string = 'positions'): object[] {
  const positionsRef = `$${positionsField}`

  return [
    {
      $lookup: {
        from: 'cln_static_professionals_work_positions',
        let: { positions: { $ifNull: [positionsRef, []] } },
        as: 'resolved_static_positions',
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$_id', { $map: { input: '$$positions', as: 'p', in: '$$p.position_row_id' } }]
              }
            }
          },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    {
      $lookup: {
        from: 'cln_manual_user_positions',
        let: { positions: { $ifNull: [positionsRef, []] } },
        as: 'resolved_manual_positions',
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$_id', { $map: { input: '$$positions', as: 'p', in: '$$p.sub_position_row_id' } }]
              }
            }
          },
          { $project: { _id: 1, position_name: 1 } }
        ]
      }
    },
    {
      $set: {
        [outputField]: {
          $cond: {
            if: { $gt: [{ $size: { $ifNull: [positionsRef, []] } }, 0] },
            then: {
              $map: {
                input: positionsRef,
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
              position_name: {
                $cond: {
                  if: { $eq: ['$position_type', 2] },
                  then: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_manual_positions', cond: { $eq: ['$$this._id', '$sub_position_row_id'] } } }, in: '$$this.position_name' } }, 0] },
                  else: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$resolved_static_positions', cond: { $eq: ['$$this._id', '$position_row_id'] } } }, in: '$$this.position_name' } }, 0] }
                }
              }
            }]
          }
        }
      }
    }
  ]
}

/**
 * Ports controllers/app/users/setting.js's GET /individual_professional_details/:professional_details_id
 * (lines ~2313-2600) — fetches a single work-experience record owned by the caller, resolving
 * position name(s) and company name/logo/id/email via lookups, then flattening into a plain
 * result object with defaults for missing fields. Returns null when no matching record exists
 * (caller maps that to the real source's 'Sorry, Invalid Professional row id' response).
 *
 * The `positions` fallback below (`get_query[0].positions?.length > 0 ? ... : [...]`) is the
 * real source's own JS-level fallback for pre-migration docs. getPositionResolutionStages()
 * already resolves `positions[]` inside the pipeline (with its own $cond+else fallback), so by
 * the time the aggregate result reaches this function, `positions` is always already a
 * non-empty, correctly-resolved array — making this JS-level fallback dead-but-harmless code.
 * Kept intentionally (not part of this port's scope to remove a safety net) — see task report.
 */
export async function getIndividualProfessionalDetails(userRowId: number, professionalDetailsId: number): Promise<any | null> {
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const get_query = await professionals_work_experienceM.aggregate([
    { $match: { _id: professionalDetailsId, user_row_id: userRowId, user_account_type: 1 } },
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
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'company_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    ...getPositionResolutionStages(),
    {
      $set: {
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } },
        company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_name', else: '$manual_info.company_name' } },
        company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_logo', else: '$manual_info.company_logo' } },
        company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_id', else: '' } },
        company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_email_id', else: '$manual_info.company_email_id' } }
      }
    },
    {
      $project: {
        user_row_id: 1, position_type: 1, position_row_id: 1, sub_position_row_id: 1, position_name: 1, positions: 1,
        responsibilities: 1, employment_type: 1, location: 1, till_date_status: 1, start_date: 1, end_date: 1,
        location_type: 1, public_view: 1, company_type: 1, company_row_id: 1, company_name: 1, company_logo: 1,
        company_id: 1, company_email_id: 1
      }
    }
  ]).limit(1)

  if (!get_query[0]) return null

  const result: Record<string, any> = {}
  result['user_row_id'] = get_query[0].user_row_id
  result['position_row_id'] = get_query[0].position_row_id ? get_query[0].position_row_id : 0
  result['sub_position_row_id'] = get_query[0].sub_position_row_id ? get_query[0].sub_position_row_id : 0
  result['position_type'] = get_query[0].position_type ? get_query[0].position_type : 1
  result['position_name'] = get_query[0].position_name ? get_query[0].position_name : ''
  result['responsibilities'] = get_query[0].responsibilities
  result['employment_type'] = get_query[0].employment_type
  result['location'] = get_query[0].location
  result['till_date_status'] = get_query[0].till_date_status
  result['start_date'] = get_query[0].start_date
  result['end_date'] = get_query[0].end_date
  result['location_type'] = get_query[0].location_type
  result['public_view'] = get_query[0].public_view
  result['company_type'] = get_query[0].company_type
  result['company_row_id'] = get_query[0].company_row_id
  result['company_name'] = get_query[0].company_name
  result['company_logo'] = get_query[0].company_logo
  result['company_id'] = get_query[0].company_id
  result['company_email_id'] = get_query[0].company_email_id
  result['positions'] = get_query[0].positions?.length > 0
    ? get_query[0].positions
    : [{
        position_type: get_query[0].position_type || 1,
        position_row_id: get_query[0].position_row_id || 0,
        sub_position_row_id: get_query[0].sub_position_row_id || 0,
        position_name: get_query[0].position_name || ''
      }]

  return result
}

/**
 * Ports controllers/app/users/setting.js's GET /professional_detail_list/:skip/:limit
 * (lines ~2662-2930) — the caller's own work-experience records grouped by company.
 *
 * getPositionResolutionStages() integration: this endpoint's real source ALREADY has its own
 * combined $set stage that resolves `positions` (via a $cond+else fallback functionally
 * identical to what getPositionResolutionStages() computes) alongside several unrelated fields
 * (position_name, company_name, company_logo, company_id, company_email_id, approval_status) in
 * ONE $set. A single $set stage cannot declare the `positions` key twice, so
 * getPositionResolutionStages()'s own $set stage is NOT used here — only its two $lookup stages
 * are spliced in, replacing the two duplicate lookups that produced the same
 * `resolved_static_positions` / `resolved_manual_positions` arrays (same `as` names), which the
 * existing combined $set stage below already consumes as-is. This keeps the single combined
 * $set intact (faithful port) while still deduplicating the lookup logic per this task's goal.
 *
 * Caller-scoping $match placement is preserved EXACTLY as in the real source: it runs AFTER all
 * lookup/$set stages (right before $project), not as an early filter — a pre-existing
 * performance characteristic (all lookups run against the whole collection before scoping to
 * the caller), not something to "optimize" here. See task report.
 *
 * NOTE: the real source's cache read for this endpoint is commented out (write-only caching via
 * setCache near the end, no getCache-based short-circuit) — this function only performs the
 * aggregate/query portion; cache read/write stays the controller/service's responsibility. See
 * task report.
 */
export async function getProfessionalDetailList(params: { user_row_id: number; skip: number; limit: number }): Promise<any[]> {
  const { user_row_id, skip, limit } = params
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
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'company_info',
        pipeline: [{ $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } }, { active_status: 1 }] } }]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } },
        company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_name', else: '$manual_info.company_name' } },
        company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_logo', else: '$manual_info.company_logo' } },
        company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_id', else: '' } },
        company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_email_id', else: '$manual_info.company_email_id' } },
        approval_status: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.approval_status', else: 0 } },
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
    },
    { $match: { company_name: { $nin: ['', null] }, user_row_id: user_row_id, user_account_type: 1 } },
    {
      $project: {
        user_row_id: 1, position_name: 1, position_type: 1, sub_position_row_id: 1, responsibilities: 1, employment_type: 1,
        location: 1, till_date_status: 1, start_date: 1, end_date: 1, location_type: 1, public_view: 1, company_type: 1,
        company_row_id: 1, company_name: 1, company_logo: 1, company_id: 1, company_email_id: 1, approval_status: 1,
        verified_status: 1, positions: 1
      }
    },
    {
      $group: {
        _id: { company_type: '$company_type', company_row_id: '$company_row_id' },
        company_name: { $first: '$company_name' },
        company_logo: { $first: '$company_logo' },
        company_type: { $first: '$company_type' },
        company_row_id: { $first: '$company_row_id' },
        company_id: { $first: '$company_id' },
        approval_status: { $first: '$approval_status' },
        professional_details: { $push: '$$ROOT' }
      }
    },
    { $sort: { 'professional_details.start_date': -1 } }
  ]).skip(skip).limit(limit)

  return get_query
}

/**
 * Ports controllers/admin_panel/app/user.js's GET /individual_professional_details/:professional_details_id
 * (lines ~4587-4843) — admin's own version of getIndividualProfessionalDetails, with real
 * behavioral differences from the app version preserved exactly (not merged):
 *  - No user_row_id/user_account_type scoping on the $match — admin can view ANY professional's
 *    record by its work-experience _id alone.
 *  - No JS-level fallback for `positions` — the pipeline's own $cond+else already guarantees a
 *    resolved array, and admin's result-building code trusts that directly.
 *  - No `sub_position_row_id` key is set on the result object (the app version does set it) —
 *    this is a real, pre-existing omission in the admin endpoint; preserved as-is, not "fixed"
 *    here. See task report.
 *
 * Returns the full `{ status, message }` envelope directly (unlike getIndividualProfessionalDetails,
 * which returns `null`/the flattened object and lets the caller build the envelope) because this
 * function also owns the "Sorry, Invalid Professional row id" business-error message admin's
 * source builds inline.
 */
export async function getAdminIndividualProfessionalDetails(professionalDetailsId: number): Promise<{ status: boolean; message: any }> {
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

  const get_query = await professionals_work_experienceM.aggregate([
    { $match: { _id: professionalDetailsId } },
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
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'company_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } },
        company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_name', else: '$manual_info.company_name' } },
        company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_logo', else: '$manual_info.company_logo' } },
        company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_id', else: '' } },
        company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_email_id', else: '$manual_info.company_email_id' } },
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
    },
    {
      $project: {
        user_row_id: 1, position_row_id: 1, position_type: 1, position_name: 1, responsibilities: 1, employment_type: 1,
        location: 1, till_date_status: 1, start_date: 1, end_date: 1, location_type: 1, public_view: 1, company_type: 1,
        company_row_id: 1, company_name: 1, company_logo: 1, company_id: 1, company_email_id: 1, verified_status: 1, positions: 1
      }
    }
  ]).limit(1)

  if (!get_query[0]) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } }
  }

  const result: Record<string, any> = {}
  result['user_row_id'] = get_query[0].user_row_id
  result['position_row_id'] = get_query[0].position_row_id
  result['position_name'] = get_query[0].position_name
  result['position_type'] = get_query[0].position_type ? get_query[0].position_type : 1
  result['responsibilities'] = get_query[0].responsibilities
  result['employment_type'] = get_query[0].employment_type
  result['location'] = get_query[0].location
  result['till_date_status'] = get_query[0].till_date_status
  result['start_date'] = get_query[0].start_date
  result['end_date'] = get_query[0].end_date
  result['location_type'] = get_query[0].location_type
  result['public_view'] = get_query[0].public_view
  result['company_type'] = get_query[0].company_type
  result['company_row_id'] = get_query[0].company_row_id
  result['company_name'] = get_query[0].company_name
  result['company_logo'] = get_query[0].company_logo
  result['company_id'] = get_query[0].company_id
  result['company_email_id'] = get_query[0].company_email_id
  result['positions'] = get_query[0].positions

  return { status: true, message: result }
}

/**
 * Ports controllers/admin_panel/app/user.js's GET /professional_detail_list/:user_row_id/:skip/:limit
 * (lines ~4845-5101) — admin's own version of getProfessionalDetailList, with real behavioral
 * differences from the app version preserved exactly (not merged):
 *  - Does an existence pre-check on the TARGET user via professionalsM.findOne BEFORE running the
 *    aggregate at all, short-circuiting with the 'Sorry, Invalid User row id' business error when
 *    the user doesn't exist.
 *  - The caller-scoping $match has NO user_account_type filter (app's version has
 *    `user_account_type: 1`) — a real, existing difference.
 *  - $sort happens BEFORE $group, sorting INDIVIDUAL documents by
 *    till_date_status/start_date/_id — different from the app version, which sorts AFTER $group
 *    on the grouped array field "professional_details.start_date". Preserved exactly, not unified.
 *  - No caching at all (no getCache/setCache calls anywhere in the real source), unlike the app
 *    version.
 *
 * Returns the full `{ status, message }` envelope directly, matching the admin source's own
 * response-building.
 */
export async function getAdminProfessionalDetailList(params: { user_row_id: number; skip: number; limit: number }): Promise<{ status: boolean; message: any }> {
  const { user_row_id, skip, limit } = params
  const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
  const professionalsM = require('../../models/app/professionalsM')

  const check_user = await professionalsM.findOne({ _id: user_row_id })
  if (!check_user) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
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
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'company_info',
        pipeline: [{ $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } }, { active_status: 1 }] } }]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        position_name: { $cond: { if: { $eq: ['$position_type', 2] }, then: '$manual_position_info.position_name', else: '$info_position.position_name' } },
        company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_name', else: '$manual_info.company_name' } },
        company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_logo', else: '$manual_info.company_logo' } },
        company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_id', else: '' } },
        company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.company_email_id', else: '$manual_info.company_email_id' } },
        approval_status: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$company_info.approval_status', else: 0 } },
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
    },
    { $match: { company_name: { $nin: ['', null] }, user_row_id: user_row_id } },
    {
      $project: {
        user_row_id: 1, position_name: 1, position_type: 1, position_row_id: 1, responsibilities: 1, employment_type: 1,
        location: 1, till_date_status: 1, start_date: 1, end_date: 1, location_type: 1, public_view: 1, company_type: 1,
        company_row_id: 1, company_name: 1, company_logo: 1, company_id: 1, company_email_id: 1, approval_status: 1,
        verified_status: 1, positions: 1
      }
    },
    { $sort: { till_date_status: -1, start_date: -1, _id: -1 } },
    {
      $group: {
        _id: { company_type: '$company_type', company_row_id: '$company_row_id' },
        company_name: { $first: '$company_name' },
        company_logo: { $first: '$company_logo' },
        company_type: { $first: '$company_type' },
        company_row_id: { $first: '$company_row_id' },
        approval_status: { $first: '$approval_status' },
        company_id: { $first: '$company_id' },
        professional_details: { $push: '$$ROOT' }
      }
    },
    { $sort: { 'professional_details.start_date': -1 } }
  ]).skip(skip).limit(limit)

  return { status: true, message: get_query }
}

/**
 * Ports the admin dashboard's user_as_employee_request_pending/approved stats (company.js's
 * company_overview/overview, Part 3 §7 Phase H step 3) — delegated here from
 * modules/company_admin/ per the confirmed domain-split principle. Ported verbatim, byte-identical
 * between the two real-source routes and between the pending/approved variants except for the
 * verified_status match — confirmed via a full diff before porting.
 */
export function buildEmployeeRequestCountPipeline({ verified }: { verified: boolean }): object[] {
  return [
    { $match: { company_type: 1, verified_status: verified ? true : { $ne: true } } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { active_status: 1 } }, { $project: { _id: 1 } }],
      },
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
          { $match: { $and: [{ login_status: 1 }, { $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }] } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$user_info' } },
    { $count: 'count' },
  ]
}
