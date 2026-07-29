/**
 * $lookup + $unwind stages resolving one side of an acquisition (acquirer or
 * acquired) to its company document. Registered companies (registered_type 1)
 * resolve against cln_company_lists; manual entries (registered_type 2)
 * resolve against cln_company_manual_retrievals. Both branches are attempted
 * via two lookups feeding the same `as` key, matching the dual-registered/
 * manual pattern already used by cln_funding_investment_lists.
 */
export function resolveCompanySideStages(prefix: 'acquirer' | 'acquired', as: string): object[] {
  const registeredTypeField = `$${prefix}_registered_type`
  const companyRowIdField = `$${prefix}_company_row_id`

  return [
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { registered_type: registeredTypeField, company_row_id: companyRowIdField },
        as: as,
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [1, '$$registered_type'] },
                  { $eq: ['$_id', '$$company_row_id'] }
                ]
              }
            }
          },
          { $project: { _id: 1, company_name: 1, company_id: 1, active_status: 1, approval_status: 1, company_logo: 1 } }
        ]
      }
    },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { registered_type: registeredTypeField, company_row_id: companyRowIdField },
        as: `${as}_manual`,
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [2, '$$registered_type'] },
                  { $eq: ['$_id', '$$company_row_id'] }
                ]
              }
            }
          },
          { $project: { _id: 1, company_name: 1, company_logo: 1 } }
        ]
      }
    },
    {
      $set: {
        [as]: {
          $cond: {
            if: { $gt: [{ $size: `$${as}` }, 0] },
            then: `$${as}`,
            else: `$${as}_manual`
          }
        }
      }
    },
    { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } }
  ]
}

/**
 * Full pipeline for "every acquisition this company appears in, either as
 * acquirer or as acquired", sorted newest-first. Used by both the admin
 * per-company list and the public company-profile display route.
 *
 * By default (includeAllStatuses = false) only approved (verified_status: 1)
 * records are returned, matching the public display's need to show only
 * vetted acquisitions. Pass includeAllStatuses = true (the admin per-company
 * list) to omit the verified_status filter entirely, so pending (0) and
 * rejected (2) records come back too and can be approved/rejected.
 */
export function buildCompanyAcquisitionsListStages(companyRowId: number, includeAllStatuses: boolean = false): object[] {
  return [
    {
      $match: {
        $or: [
          { acquirer_company_row_id: companyRowId, acquirer_registered_type: 1 },
          { acquired_company_row_id: companyRowId, acquired_registered_type: 1 }
        ],
        ...(includeAllStatuses ? {} : { verified_status: 1 })
      }
    },
    ...resolveCompanySideStages('acquirer', 'acquirer_info'),
    ...resolveCompanySideStages('acquired', 'acquired_info'),
    {
      $set: {
        direction: {
          $cond: {
            if: { $and: [{ $eq: ['$acquirer_company_row_id', companyRowId] }, { $eq: ['$acquirer_registered_type', 1] }] },
            then: 'acquired',
            else: 'acquired_by'
          }
        }
      }
    },
    { $sort: { acquisition_date: -1 } }
  ]
}
