// modules/professionals-academy/professionals-academy.queries.ts
// Aggregation pipelines ported 1:1 from controllers/main/users.js (~857-995, ~1081-1128) —
// same stages, same field names, same response shape. No new behavior.
import { CoursesCertificatesM } from './professionals-academy.models'
import ProfessionalM from '../../../models/app/professionalsM'

export async function getCompletedCertificates(userRowId: number) {
  return CoursesCertificatesM.aggregate([
    { $match: { user_row_id: userRowId } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'profile_info' } },
    { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
    { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        certificate_id: '$_id',
        full_name: '$user_info.full_name',
        pro_batch: '$user_info.pro_batch',
        user_name: '$user_info.user_name',
        email_id: '$user_info.email_id',
        course_name: '$course_info.course_name',
        course_url: '$course_info.course_url',
        course_description: '$course_info.course_description',
        course_image: '$course_info.course_image',
        user_row_id: 1,
        course_row_id: 1,
        percentage_score: 1,
        download_status: 1,
        date_n_time: 1,
        certificate_public: 1,
        score_public: 1,
        certificate_image_url: 1,
        certificate_pdf_url: 1,
        profile_image: '$profile_info.profile_image',
        course_status: { $literal: 'completed' },
      },
    },
  ])
}

export async function getInProgressCourses(userRowId: number) {
  const result = await ProfessionalM.aggregate([
    { $match: { _id: userRowId } },
    {
      $lookup: {
        from: 'cln_academy_quiz_lession_started_details',
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$user_row_id', '$$userId'] }, { $eq: ['$lesson_status', 1] }] } } },
          { $group: { _id: '$course_row_id', completed_lessons: { $sum: 1 } } },
          { $lookup: { from: 'cln_academy_courses_lessons', localField: '_id', foreignField: 'course_row_id', as: 'all_lessons' } },
          { $addFields: { total_lessons: { $size: '$all_lessons' } } },
          { $lookup: { from: 'cln_academy_courses', localField: '_id', foreignField: '_id', as: 'course_info' } },
          { $unwind: '$course_info' },
          {
            $project: {
              _id: 0,
              course_row_id: '$_id',
              course_name: '$course_info.course_name',
              course_url: '$course_info.course_slug',
              course_description: '$course_info.course_description',
              course_image: '$course_info.course_image',
              total_lessons: 1,
              completed_lessons: 1,
              completion_percentage: {
                $cond: [{ $eq: ['$total_lessons', 0] }, 0, { $multiply: [{ $divide: ['$completed_lessons', '$total_lessons'] }, 100] }],
              },
              course_status: { $cond: [{ $eq: ['$completed_lessons', '$total_lessons'] }, 'completed', 'ongoing'] },
            },
          },
        ],
        as: 'user_course_status',
      },
    },
    { $unwind: '$user_course_status' },
    { $replaceRoot: { newRoot: '$user_course_status' } },
  ])
  return result
}

export async function getPublicCertificates(userRowId: number) {
  return CoursesCertificatesM.aggregate([
    { $match: { user_row_id: userRowId } },
    { $match: { certificate_public: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'profile_info' } },
    { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_academy_courses', localField: 'course_row_id', foreignField: '_id', as: 'course_info' } },
    { $unwind: { path: '$course_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        certificate_id: '$_id',
        course_name: '$course_info.course_name',
        user_row_id: 1,
        course_row_id: 1,
        certificate_image_url: 1,
        certificate_pdf_url: 1,
        percentage_score: '$percentage_score',
        date_n_time: 1,
        profile_image: '$profile_info.profile_image',
      },
    },
  ])
}
