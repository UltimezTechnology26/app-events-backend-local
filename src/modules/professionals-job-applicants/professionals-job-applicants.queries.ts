// modules/professionals-job-applicants/professionals-job-applicants.queries.ts
// Aggregation pipelines ported verbatim from controllers/app/jobs/job_applicants.js.
export function buildUserAppliedListPipeline(matchStage: Record<string, any>, skip: number, limit: number) {
  return [
    { $match: matchStage },
    { $lookup: { from: 'cln_jobs', localField: 'job_id', foreignField: '_id', as: 'job_info' } },
    { $unwind: { path: '$job_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_job_education_types', localField: 'highest_education', foreignField: '_id', as: 'education_info' } },
    { $unwind: { path: '$education_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_job_skills', localField: 'key_skills', foreignField: '_id', as: 'skills_info' } },
    { $lookup: { from: 'cln_static_countries', localField: 'job_info.country_id', foreignField: '_id', as: 'co_info' } },
    { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, job_id: 1, user_row_id: 1, salary_expectations: 1, linkedIn: 1, createdAt: 1, updatedAt: 1,
        resume: 1, status: 1, rejected_reason: 1, credentials: 1,
        job_info: {
          _id: '$job_info._id', job_title: '$job_info.job_title', job_type: '$job_info.job_type',
          work_location_type: '$job_info.work_location_type', salary_from: '$job_info.salary_from',
          salary_to: '$job_info.salary_to', active_status: '$job_info.active_status', is_deleted: '$job_info.is_deleted',
          country_name: '$co_info.country_name', country_flag: '$co_info.country_flag', job_description: '$job_info.job_description',
          application_deadline: '$job_info.application_deadline', experience_level: '$job_info.experience_level',
          no_of_openings: '$job_info.no_of_openings',
        },
        company_info: { _id: '$company_info._id', company_name: '$company_info.company_name', company_logo: '$company_info.company_logo' },
        highest_education: { _id: '$education_info._id', name: '$education_info.education_type' },
        skills: { $map: { input: '$skills_info', as: 's', in: { _id: '$$s._id', name: '$$s.skill_name' } } },
      },
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]
}

export function buildAdminJobApplicantsListPipeline(matchStage: Record<string, any>, skip: number, limit: number) {
  return [
    { $match: matchStage },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'profile_info' } },
    { $lookup: { from: 'cln_job_education_types', localField: 'highest_education', foreignField: '_id', as: 'education_info' } },
    { $unwind: { path: '$education_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_job_skills', localField: 'key_skills', foreignField: '_id', as: 'skills_info' } },
    {
      $project: {
        _id: 1, job_id: 1, user_row_id: 1, salary_expectations: 1, linkedIn: 1, createdAt: 1, updatedAt: 1,
        resume: 1, status: 1, credentials: 1, rejected_reason: 1,
        user: {
          _id: '$user_info._id', name: '$user_info.full_name', user_name: '$user_info.user_name',
          mobile_number: '$user_info.mobile_number', country_id: '$user_info.country_mobile_id',
          pro_batch: '$user_info.pro_batch', email_id: '$user_info.email_id',
          image: { $arrayElemAt: ['$profile_info.profile_image', 0] },
        },
        highest_education: { _id: '$education_info._id', name: '$education_info.education_type' },
        skills: { $map: { input: '$skills_info', as: 's', in: { _id: '$$s._id', name: '$$s.skill_name' } } },
      },
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]
}
