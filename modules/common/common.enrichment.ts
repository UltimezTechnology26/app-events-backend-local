// Two enrichment shapes were found duplicated across the Company domain
// (Part 1 §3 finding 2) — extracted here faithfully (same stages, not
// reworked), so every module builds on one copy of each instead of adding
// a 39th/4th.

// The "resolve login_status, default to 1 if missing" shape — 38 near-
// identical copies inside controllers/app/company/front_page.js's /overview
// handler alone, plus 2 more in companyList and 1 in companyOtherDetails.
// This is the cleanest of those copies (front_page.js:246-290), promoted
// here rather than re-copied a 42nd time.
export function buildProfessionalEnrichmentStages() {
  return [
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [{ $match: { login_status: { $ne: 1 } } }, { $project: { _id: 1, login_status: 1 } }],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        login_status: { $cond: { if: '$user_info.login_status', then: '$user_info.login_status', else: 1 } },
      },
    },
    { $match: { login_status: 1 } },
  ]
}

// The $expr/let-based FILTER shape — excludes non-matching/non-logged-in
// professionals outright, rather than defaulting them. Duplicated 3x inside
// modules/team-members/team-members.queries.ts, once more in
// companyOtherDetails (front_page.ts:8808-8843). Genuinely different intent
// from the shape above (filter vs. default), so it stays a separate function
// — not merged into one, per Part 1 §3 finding 2.
export function buildTeamMemberFilterStages() {
  return [
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
                { login_status: 1 },
              ],
            },
          },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
        ],
      },
    },
  ]
}
