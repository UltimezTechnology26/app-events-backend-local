// modules/work-experience/work-experience.positions.list.stages.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's GET /list
// (lines 12-197) `$lookup`/`$addFields`/`$project` blocks verbatim, each
// extracted into its own small builder function purely to keep any single
// file/function under the project's line-length limit — the blocks below
// are assembled, in this same order, by buildPositionsListStages in
// work-experience.positions.list.queries.ts.

export function buildWorkExperienceJoinStages(): object[] {
  return [
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: '_id',
        foreignField: 'position_row_id',
        as: 'work_experience',
      },
    },
    {
      $addFields: {
        user_ids: {
          $setUnion: [
            {
              $map: {
                input: '$work_experience',
                as: 'we',
                in: '$$we.user_row_id',
              },
            },
            [],
          ],
        },
        company_ids: {
          $setUnion: [
            {
              $map: {
                input: '$work_experience',
                as: 'we',
                in: '$$we.company_row_id',
              },
            },
            [],
          ],
        },
      },
    },
  ]
}

export function buildUsersAndCompaniesLookupStages(): object[] {
  return [
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_ids',
        foreignField: '_id',
        as: 'users',
      },
    },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_ids',
        foreignField: '_id',
        as: 'companies',
      },
    },
    {
      $lookup: {
        from: 'cln_company_deleted_history_lists',
        let: { companyIds: '$company_ids' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$company_row_id', '$$companyIds'],
              },
            },
          },
        ],
        as: 'deleted_companies',
      },
    },
  ]
}

