// modules/professionals/professionals.approvals.queries.ts
//
// Bulk display-info lookup for the global pending/rejected changes queues — mirrors
// company_admin.approvals.queries.ts's findCompaniesDisplayInfoByIds exactly, one `$in`-scoped
// aggregate instead of N+1 queries. `profile_image` isn't a plain field on `cln_professionals`
// (it lives in the separate `cln_professionals_profile_images` collection, one row per
// professional, keyed by `user_row_id` — see professionals.list.queries.ts's own identical
// lookup), so this needs a small aggregation rather than companyM's plain `.find()`.
const professionalsM = require('../../../models/app/professionalsM')

export interface ProfessionalDisplayInfo {
  _id: number
  full_name: string | null
  user_name: string | null
  profile_image: string | null
}

export async function findProfessionalsDisplayInfoByIds(userRowIds: number[]): Promise<ProfessionalDisplayInfo[]> {
  return professionalsM.aggregate([
    { $match: { _id: { $in: userRowIds } } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'userImage' } },
    {
      $project: {
        _id: 1,
        full_name: 1,
        user_name: 1,
        profile_image: { $arrayElemAt: ['$userImage.profile_image', 0] },
      },
    },
  ])
}
