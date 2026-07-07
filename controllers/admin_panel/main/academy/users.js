const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const chaptersM = require('../../../../models/main/academy/chaptersM')
const coursesM = require('../../../../models/main/academy/coursesM')
const lessonsM = require('../../../../models/main/academy/lessonsM')
const quiz_lesson_started_detailsM = require('../../../../models/main/academy/quiz_lesson_started_detailsM')
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken, checkAllLoginToken } = require('../../../../middleware/authorization')
const professionalsM = require('../../../../models/app/professionalsM')
const courses_certificatesM = require('../../../../models/main/academy/courses_certificatesM')
const users_quiz_answersM = require('../../../../models/main/academy/users_quiz_answersM')
const { deleteKeysByPattern } = require('../../../../config/cache_helper')


router.get('/courses_list', async (req, res) => {
  const get_query = await coursesM.find({}, { _id: 1, course_name: 1, course_url: 1 }).sort({ course_name: 1 })

  res.json({
    status: true,
    message: get_query
  })
})

router.get('/certficate', async (req, res) => {
  const get_query = await courses_certificatesM.find()

  res.json({
    status: true,
    message: get_query
  })
})



router.get("/user_basic_details/:user_row_id", async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [13])
  if (checkToken.status) {
    try {
      const user_row_id = Number.parseInt(req.params.user_row_id);

      const get_basic_details = await professionalsM.aggregate([
        { $match: { _id: user_row_id } },
        {
          $lookup: {
            from: "cln_professionals_profile_images",
            localField: "_id",
            foreignField: "user_row_id",
            as: "profile_info"
          }
        },
        {
          $unwind: {
            path: "$profile_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            _id: 1,
            user_name: 1,
            pro_batch: 1,
            full_name: 1,
            gender: 1,
            email_id: 1,
            mobile_number: 1,
            country_id: 1,
            location: 1,
            updated_date_n_time: 1,
            account_visible_type: 1,
            designation_id: 1,
            login_status: 1,
            wallet_address: 1,
            approval_status: 1,
            reason_rejected: 1,
            rejected_date_n_time: 1,
            deleted_date_n_time: 1,
            view_counts: 1,
            profile_image: "$profile_info.profile_image"
          }
        }
      ])
      const completed_lessons_count = await quiz_lesson_started_detailsM.countDocuments({ lesson_status: 1, user_row_id: user_row_id });

      const lessonStats = await lessonsM.aggregate([
        {
          $lookup: {
            from: "cln_academy_quiz_answers",
            let: { lessonId: "$lesson_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$lesson_row_id", "$$lessonId"] },
                      { $eq: ["$user_row_id", user_row_id] },
                      { $eq: ["$answer_status", true] }
                    ]
                  }
                }
              }
            ],
            as: "lessonAns"
          }
        },
        {
          // Lookup all questions per lesson
          $lookup: {
            from: "cln_academy_quiz_questions",
            let: { lessonId: "$lesson_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$lesson_row_id", "$$lessonId"]
                  }
                }
              }
            ],
            as: "questions"
          }
        },
        {
          $project: {
            totalAnswers: { $size: "$lessonAns" },
            totalQuestions: { $size: "$questions" }
          }
        },
        {
          $group: {
            _id: null,
            totalAnswers: { $sum: "$totalAnswers" },
            totalQuestions: { $sum: "$totalQuestions" }
          }
        }
      ]);
      const averageScoreResult = await quiz_lesson_started_detailsM.aggregate([
        {
          $match: {
            user_row_id: user_row_id,
            lesson_status: 1,
            lesson_score: { $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            averageScore: { $avg: "$lesson_score" },
            totalScoredLessons: { $sum: 1 }
          }
        }
      ]);

      const get_certificate_summary = await professionalsM.aggregate([
        {
          $match: { _id: user_row_id }
        },
        {
          $lookup: {
            from: "cln_academy_courses_certificates",
            localField: "_id",
            foreignField: "user_row_id",
            as: "certificate_info"
          }
        },
        {
          $unwind: {
            path: "$certificate_info",
            preserveNullAndEmptyArrays: true
          }
        },

        // ✅ Fix: remove rows with no certificate
        {
          $match: {
            certificate_info: { $ne: null }
          }
        },

        {
          $lookup: {
            from: "cln_academy_courses",
            localField: "certificate_info.course_row_id",
            foreignField: "_id",
            as: "course_info"
          }
        },
        {
          $unwind: {
            path: "$course_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: "$_id",
            certificateCount: { $sum: 1 },
            expertTags: { $addToSet: "$course_info.expert_tag" }
          }
        },
        {
          $project: {
            _id: 0,
            certificateCount: 1,
            expertTagCount: { $size: "$expertTags" }
          }
        }
      ]);


      const certificateCount = get_certificate_summary[0]?.certificateCount || 0;
      const expertTagCount = get_certificate_summary[0]?.expertTagCount || 0;

      const averageScore = averageScoreResult[0]?.averageScore || 0;



      res.json({
        status: true,
        get_user_details: get_basic_details,
        total_completed_lessons: completed_lessons_count,
        totalAnswers: lessonStats[0]?.totalAnswers || 0,
        totalQuestions: lessonStats[0]?.totalQuestions || 0,
        averageScore: averageScore,
        certificateCount: certificateCount,
        expertTagCount: expertTagCount,
        // lessonList: lessonList


      })
    } catch (err) {
      res.json({
        status: false,
        message: err.message

      });
    }
  }
  else {
    res.json({
      status: false,
      message: { alert_message: checkToken.message }
    })
  }
})

router.get('/users_list/:skip/:limit', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [13])
  if (checkToken.status) {
    try {
      const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
      const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;
      const search_array = [];

      const course_row_id = req.query.course_row_id ? Number.parseInt(req.query.course_row_id) : null;

      if (req.query.date) {
        const inputDate = new Date(req.query.date);
        const start_date = new Date(inputDate.setHours(0, 0, 0, 0));
        const end_date = new Date(inputDate.setHours(23, 59, 59, 999));
        search_array.push({ date_n_time: { $gte: start_date, $lte: end_date } });
      }

      if (req.query.search) {
        search_array.push({
          $or: [
            { full_name: { '$regex': req.query.search, $options: 'i' } },
            { user_name: { '$regex': req.query.search, $options: 'i' } },
            { email_id: { '$regex': req.query.search, $options: 'i' } }
          ]
        });
      }

      const search_query = search_array.length > 0 ? { $and: search_array } : {};

      const courseMatchExpr = course_row_id !== null
        ? [{ $eq: ["$course_row_id", course_row_id] }]
        : [];

      const get_query = await professionalsM.aggregate([
        {
          $lookup: {
            from: "cln_academy_quiz_lession_started_details",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$user_row_id", "$$userId"] },
                      ...courseMatchExpr
                    ]
                  }
                }
              },
              { $limit: 1 }
            ],
            as: "has_quiz"
          }
        },
        {
          $match: {
            "has_quiz.0": { $exists: true },
            ...search_query
          }
        },
        {
          $lookup: {
            from: "cln_professionals_profile_images",
            localField: "_id",
            foreignField: "user_row_id",
            as: "profile_info"
          }
        },
        {
          $unwind: {
            path: "$profile_info",
            preserveNullAndEmptyArrays: true
          }
        },

        // ✅ Completed Courses
        {
          $lookup: {
            from: "cln_academy_quiz_lession_started_details",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$user_row_id", "$$userId"] },
                      { $eq: ["$lesson_status", 1] },
                      ...courseMatchExpr
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: "$course_row_id",
                  completed_lessons: { $sum: 1 }
                }
              },
              {
                $lookup: {
                  from: "cln_academy_courses_lessons",
                  localField: "_id",
                  foreignField: "course_row_id",
                  as: "total_lessons"
                }
              },
              {
                $addFields: {
                  total_lessons_count: { $size: "$total_lessons" }
                }
              },
              {
                $match: {
                  $expr: {
                    $eq: ["$completed_lessons", "$total_lessons_count"]
                  }
                }
              },
              { $count: "completed_courses" }
            ],
            as: "completed_summary"
          }
        },
        {
          $addFields: {
            completed_courses: {
              $ifNull: [{ $arrayElemAt: ["$completed_summary.completed_courses", 0] }, 0]
            }
          }
        },

        // 
        {
          $lookup: {
            from: "cln_academy_quiz_lession_started_details",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$user_row_id", "$$userId"] },
                      ...courseMatchExpr
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: "$course_row_id",
                  completed_lessons: {
                    $sum: {
                      $cond: [{ $eq: ["$lesson_status", 1] }, 1, 0]
                    }
                  }
                }
              },
              {
                $lookup: {
                  from: "cln_academy_courses_lessons",
                  localField: "_id",
                  foreignField: "course_row_id",
                  as: "all_lessons"
                }
              },
              {
                $addFields: {
                  total_lessons: { $size: "$all_lessons" }
                }
              },
              {
                $match: {
                  $expr: {
                    $and: [
                      { $gt: ["$completed_lessons", 0] },
                      { $lt: ["$completed_lessons", "$total_lessons"] }
                    ]
                  }
                }
              },
              {
                $lookup: {
                  from: "cln_academy_courses",
                  localField: "_id",
                  foreignField: "_id",
                  pipeline: [
                    { $project: { course_name: 1, _id: 0 } }
                  ],
                  as: "course_info"
                }
              },
              {
                $project: {
                  course_name: { $arrayElemAt: ["$course_info.course_name", 0] }
                }
              }
            ],
            as: "ongoing_courses"
          }
        },
        {
          $lookup: {
            from: "cln_academy_quiz_lession_started_details",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$user_row_id", "$$userId"] }
                }
              },
              {
                $sort: { date_n_time: 1 }   // earliest first
              },
              {
                $limit: 1
              },
              {
                $project: { date_n_time: 1, _id: 0 }
              }
            ],
            as: "first_lesson"
          }
        },
        {
          $addFields: {
            first_lesson_date: {
              $arrayElemAt: ["$first_lesson.date_n_time", 0]
            }
          }
        },
        {
          $sort: { first_lesson_date: -1 }
        },

        // Final Projection
        {
          $project: {
            _id: 1,
            user_name: 1,
            pro_batch: 1,
            full_name: 1,
            email_id: 1,
            completed_courses: 1,
            ongoing_courses: 1,
            date_n_time: "$first_lesson_date",
            profile_image: "$profile_info.profile_image",
            onboarding_info: 1
          }
        }
      ]).skip(skip).limit(limit);

      const totalResult = await professionalsM.aggregate([
        {
          $lookup: {
            from: "cln_academy_quiz_lession_started_details",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$user_row_id", "$$userId"] },
                      ...courseMatchExpr
                    ]
                  }
                }
              },
              { $limit: 1 }
            ],
            as: "quiz_info"
          }
        },
        {
          $match: {
            "quiz_info.0": { $exists: true },
            ...search_query
          }
        },
        {
          $count: "total"
        }
      ]);

      const totalCount = totalResult[0]?.total || 0;

      res.json({
        status: true,
        count: totalCount,
        message: get_query
      });

    } catch (err) {
      console.error(err);
      res.json({
        status: false,
        message: 'Internal server error'
      });
    }
  } else {
    res.json({
      status: false,
      message: { alert_message: checkToken.message }
    });
  }
});



router.get('/user_course_details/:user_row_id', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [13])
  if (checkToken.status) {
    try {
      const user_row_id = Number.parseInt(req.params.user_row_id);

      const completedCourses = await courses_certificatesM.aggregate([
        { $match: { user_row_id } },
        {
          $lookup: {
            from: "cln_academy_courses",
            localField: "course_row_id",
            foreignField: "_id",
            as: "course_info"
          }
        },
        { $unwind: "$course_info" },
        {
          $lookup: {
            from: "cln_academy_courses_lessons",
            localField: "course_row_id",
            foreignField: "course_row_id",
            as: "all_lessons"
          }
        },
        {
          $project: {
            course_row_id: 1,
            course_name: "$course_info.course_name",
            course_url: "$course_info.course_slug",
            course_description: "$course_info.course_description",
            course_image: "$course_info.course_image",
            completed_lessons: 1,
            total_lessons: { $size: "$all_lessons" },
            percentage_score: 1,
            course_status: { $literal: "completed" }
          }
        }
      ]);

      const progressCourses = await professionalsM.aggregate([
        { $match: { _id: user_row_id } },
        {
          $lookup: {
            from: "cln_academy_quiz_lession_started_details",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$user_row_id", "$$userId"] },
                      { $eq: ["$lesson_status", 1] }
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: "$course_row_id",
                  completed_lessons: { $sum: 1 }
                }
              },
              {
                $lookup: {
                  from: "cln_academy_courses_lessons",
                  localField: "_id",
                  foreignField: "course_row_id",
                  as: "all_lessons"
                }
              },
              {
                $addFields: {
                  total_lessons: { $size: "$all_lessons" },
                  course_row_id: "$_id" // bring _id into a field
                }
              },
              {
                $lookup: {
                  from: "cln_academy_courses",
                  localField: "course_row_id",
                  foreignField: "_id",
                  as: "course_info"
                }
              },
              { $unwind: "$course_info" },
              {
                $project: {
                  _id: 0,
                  course_row_id: 1,
                  course_name: "$course_info.course_name",
                  course_url: "$course_info.course_slug",
                  course_description: "$course_info.course_description",
                  course_image: "$course_info.course_image",
                  total_lessons: 1,
                  completed_lessons: 1,
                  percentage_score: {
                    $cond: [
                      { $eq: ["$total_lessons", 0] },
                      0,
                      {
                        $multiply: [
                          { $divide: ["$completed_lessons", "$total_lessons"] },
                          100
                        ]
                      }
                    ]
                  },
                  course_status: {
                    $cond: [
                      { $eq: ["$completed_lessons", "$total_lessons"] },
                      "completed",
                      "ongoing"
                    ]
                  }
                }
              }
            ],
            as: "user_course_status"
          }
        },
        { $unwind: "$user_course_status" },
        { $replaceRoot: { newRoot: "$user_course_status" } }
      ]);

      // === Filter out duplicates (completed wins) ===
      const completedCourseIds = new Set(completedCourses.map(c => c.course_row_id.toString()));
      const finalOngoing = progressCourses.filter(
        c => !completedCourseIds.has(c.course_row_id.toString())
      );

      const finalList = [...completedCourses, ...finalOngoing];

      if (finalList.length === 0) {
        return res.json({ status: false, message: "No courses found for this user." });
      }

      return res.json({ status: true, message: finalList });

    } catch (err) {
      res.json({ status: false, message: err.message });
    }
  }
  else {
    res.json({
      status: false,
      message: { alert_message: checkToken.message }
    })
  }
});

router.get('/user_lesson_details/:user_row_id/:course_row_id', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [13])
  if (!checkToken.status) {
    return res.json({ status: false, message: { alert_message: checkToken.message } });
  }

  try {
    const user_row_id = Number.parseInt(req.params.user_row_id);
    const course_row_id = Number.parseInt(req.params.course_row_id);

    const lessonData = await lessonsM.aggregate([
      { $match: { course_row_id } },
      {
        $lookup: {
          from: "cln_academy_quiz_lession_started_details",
          let: { lessonId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$lesson_row_id", "$$lessonId"] },
                    { $eq: ["$user_row_id", user_row_id] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: "cln_academy_quiz_answers",
                localField: "_id",
                foreignField: "lesson_started_row_id",
                as: "quiz_info"
              }
            },
            {
              $addFields: {
                correct_count: {
                  $size: {
                    $filter: {
                      input: "$quiz_info",
                      as: "q",
                      cond: { $eq: ["$$q.answer_status", true] }
                    }
                  }
                },
                wrong_count: {
                  $size: {
                    $filter: {
                      input: "$quiz_info",
                      as: "q",
                      cond: { $eq: ["$$q.answer_status", false] }
                    }
                  }
                },
                duration: {
                  $sum: {
                    $map: {
                      input: "$quiz_info",
                      as: "q",
                      in: { $ifNull: ["$$q.duration", 0] }
                    }
                  }
                }
              }
            },
            {
              $project: {
                lesson_status: 1,
                date_n_time: 1,
                correct_count: 1,
                duration: 1,
                wrong_count: 1,
              }
            }
          ],
          as: "lesson_attempt"
        }
      },
      {
        $addFields: {
          status_data: { $arrayElemAt: ["$lesson_attempt", 0] }
        }
      },
      {
        $project: {
          lesson_row_id: "$_id",
          title: 1,
          lesson_url: 1,
          lesson_image_url: 1,
          lesson_number: 1,
          lesson_status: {
            $cond: {
              if: { $eq: ["$status_data", null] },
              then: "not started",
              else: {
                $cond: [
                  { $eq: ["$status_data.lesson_status", 1] },
                  "completed",
                  "started"
                ]
              }
            }
          },
          duration: "$status_data.duration",
          correct_count: "$status_data.correct_count",
          wrong_count: "$status_data.wrong_count",
          attempted_on: "$status_data.date_n_time"
        }
      },
      { $sort: { lesson_number: 1 } }
    ]);

    return res.json({ status: true, message: lessonData });

  } catch (err) {
    console.error("Error:", err);
    return res.json({ status: false, message: err.message });
  }
});


router.get('/certificate_performance/:user_row_id/:course_row_id', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [13]);
  if (!checkToken.status) {
    return res.json({
      status: false,
      message: { alert_message: checkToken.message }
    });
  }

  try {
    const user_row_id = Number.parseInt(req.params.user_row_id);
    const course_row_id = Number.parseInt(req.params.course_row_id);
    if (Number.isNaN(user_row_id) || Number.isNaN(course_row_id)) {
      return res.status(400).json({ status: false, message: "Invalid user_row_id or course_row_id" });
    }

    const chapterStats = await quiz_lesson_started_detailsM.aggregate([
      {
        $match: {
          user_row_id,
          course_row_id
        }
      },
      {
        $lookup: {
          from: "cln_academy_courses_lessons",
          localField: "lesson_row_id",
          foreignField: "lesson_id",
          as: "lesson_details"
        }
      },
      { $unwind: "$lesson_details" },
      {
        $lookup: {
          from: "cln_academy_courses_chapters",
          localField: "lesson_details.chapter_row_id",
          foreignField: "_id",
          as: "chapter_details"
        }
      },
      { $unwind: "$chapter_details" },
      {
        $lookup: {
          from: "cln_academy_quiz_answers",
          let: { userId: "$user_row_id", lessonId: "$lesson_row_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$user_row_id", "$$userId"] },
                    { $eq: ["$lesson_row_id", "$$lessonId"] },
                    { $eq: ["$answer_status", true] }
                  ]
                }
              }
            }
          ],
          as: "correct_answers"
        }
      },
      {
        $lookup: {
          from: "cln_academy_quiz_questions",
          localField: "lesson_row_id",
          foreignField: "lesson_row_id",
          as: "questions"
        }
      },
      {

        $addFields: {
          lesson_status_flag: {
            $cond: [
              { $gte: [{ $size: "$correct_answers" }, 7] },
              1,
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: "$lesson_details.chapter_row_id",
          chapter_number: { $first: "$chapter_details.chapter_number" },
          total_lessons: { $sum: 1 },
          completed_lessons: {
            $sum: {
              $cond: [{ $eq: ["$lesson_status", 1] }, 1, 0]
            }
          },
          correct_answers_count: { $sum: { $size: "$correct_answers" } },
          total_questions: { $sum: { $size: "$questions" } },
          status: { $max: "$lesson_status_flag" }
        }
      },

      { $sort: { _id: 1 } }
    ]);

    return res.json({
      status: true,
      message: chapterStats
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: err.message });
  }
});


router.get('/certificate_list/:skip/:limit', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [13]);

  if (!checkToken.status) {
    return res.json({
      status: false,
      message: { alert_message: checkToken.message }
    });
  }

  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;

    const search_array = [];

    if (req.query.date) {
      const inputDate = new Date(req.query.date);
      const start_date = new Date(inputDate.setHours(0, 0, 0, 0));
      const end_date = new Date(inputDate.setHours(23, 59, 59, 999));
      search_array.push({ date_n_time: { $gte: start_date, $lte: end_date } });
    }

    if (req.query.course_row_id) {
      const course_row_id = Number.parseInt(req.query.course_row_id);
      if (!Number.isNaN(course_row_id)) {
        search_array.push({ course_row_id });
      }
    }

    const search_query = search_array.length > 0 ? { $and: search_array } : {};

    const pipeline = [
      { $match: search_query },

      {
        $lookup: {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info"
        }
      },
      {
        $unwind: {
          path: "$user_info",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "cln_professionals_profile_images",
          localField: "user_row_id",
          foreignField: "user_row_id",
          as: "profile_info"
        }
      },
      {
        $unwind: {
          path: "$profile_info",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $lookup: {
          from: "cln_academy_courses",
          localField: "course_row_id",
          foreignField: "_id",
          as: "course_info"
        }
      },
      {
        $unwind: {
          path: "$course_info",
          preserveNullAndEmptyArrays: true
        }
      },

      // 🔍 Lookup lessons to count per course
      {
        $lookup: {
          from: "cln_academy_courses_lessons",
          localField: "course_row_id",
          foreignField: "course_row_id",
          as: "lessons"
        }
      },
      {
        $addFields: {
          lesson_count: { $size: "$lessons" }
        }
      },


      // Optional search by user full name
      ...(req.query.search ? [{
        $match: {
          "user_info.full_name": { $regex: req.query.search, $options: 'i' }
        }
      }] : []),
      {
        $lookup: {
          from: "cln_academy_courses_lessons",
          let: { courseId: "$course_row_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$course_row_id", "$$courseId"] },
                    { $eq: ["$lesson_number", 1] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } }
          ],
          as: "first_lesson"
        }
      },
      {
        $unwind: {
          path: "$first_lesson",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "cln_academy_quiz_answers",
          let: { userId: "$user_row_id", lessonId: "$first_lesson._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$user_row_id", "$$userId"] },
                    { $eq: ["$lesson_row_id", "$$lessonId"] }
                  ]
                }
              }
            },
            { $limit: 1 },
            { $project: { _id: 0, date_n_time: 1 } }
          ],
          as: "first_answer"
        }
      },
      {
        $addFields: {
          start_date: { $arrayElemAt: ["$first_answer.date_n_time", 0] }
        }
      },

      // Group by user
      {
        $project: {
          _id: 0,
          certificate_id: "$_id",
          user_row_id: "$user_row_id",
          full_name: "$user_info.full_name",
          user_name: "$user_info.user_name",
          email_id: "$user_info.email_id",
          pro_batch: "$user_info.pro_batch",
          profile_image: "$profile_info.profile_image",
          course_name: "$course_info.course_name",
          course_url: "$course_info.course_slug",
          course_row_id: "$course_row_id",
          percentage_score: "$percentage_score",
          download_status: "$download_status",
          certificate_pdf_url: "$certificate_pdf_url",
          end_date: "$date_n_time",
          lesson_count: "$lesson_count",
          start_date: "$start_date"
        }
      }
    ];
    const get_query = await courses_certificatesM.aggregate(pipeline).skip(skip).limit(limit);

    const count_pipeline = [...pipeline];
    count_pipeline.push({ $count: "total" });
    const count_query = await courses_certificatesM.aggregate(count_pipeline);
    const totalCount = count_query[0]?.total || 0;

    res.json({ status: true, message: get_query, count: totalCount });
  } catch (err) {
    res.json({ status: false, message: err.message });
  }
});


//app coinpedia
router.get('/user_certificate_list', async (req, res) => {

  // Validate user token
  const checkUserToken = await checkAllLoginToken(req.headers, [1]);

  if (checkUserToken.status) {
    try {
      let user_row_id = 0;

      if (checkUserToken.message.user_type == 1) {
        user_row_id = checkUserToken.message.user_row_id;
      } else if (req.query.user_row_id) {
        if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
          user_row_id = Number.parseInt(req.query.user_row_id);
        } else {
          console.log("Invalid user_row_id in query.");
        }

      }

      console.log("Using user_row_id:", user_row_id);


      const pipeline = [
        { $match: { user_row_id: user_row_id } },
        {
          $lookup: {
            from: "cln_professionals",
            localField: "user_row_id",
            foreignField: "_id",
            as: "user_info"
          }
        },
        {
          $unwind: {
            path: "$user_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "cln_professionals_profile_images",
            localField: "user_row_id",
            foreignField: "user_row_id",
            as: "profile_info"
          }
        },
        {
          $unwind: {
            path: "$profile_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "cln_academy_courses",
            localField: "course_row_id",
            foreignField: "_id",
            as: "course_info"
          }
        },
        {
          $unwind: {
            path: "$course_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            certificate_id: "$_id",
            full_name: "$user_info.full_name",
            pro_batch: "$user_info.pro_batch",
            user_name: "$user_info.user_name",
            email_id: "$user_info.email_id",
            course_name: "$course_info.course_name",
            course_url: "$course_info.course_url",
            user_row_id: 1,
            course_row_id: 1,
            percentage_score: 1,
            download_status: 1,
            date_n_time: 1,
            certificate_public: 1,
            certificate_image_url: 1,
            certificate_pdf_url: 1,
            profile_image: "$profile_info.profile_image"
          }
        }
      ];


      const certificates = await courses_certificatesM.aggregate(pipeline);
      console.log("Certificates found:", certificates.length);

      if (certificates.length === 0) {
        return res.json({ status: false, message: "No certificates found for this user." });
      }

      res.json({ status: true, message: certificates });

    } catch (err) {

      console.error("Error occurred during aggregation:", err);
      res.json({ status: false, message: err.message });
    }
  } else {

    console.log("Token validation failed:", checkUserToken.message); // This should now show a valid error message
    res.json(checkUserToken);
  }
});



router.post('/save_n_update_visibility', async (req, res) => {
  try {

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {

      const { course_row_id, certificate_public } = req.body;


      if (!course_row_id) {
        return res.json({ status: false, message: "Missing required fields: user_row_id and course_row_id are required." });
      }

      const existingCertificate = await courses_certificatesM.findOne({ course_row_id: course_row_id });

      if (existingCertificate) {

        existingCertificate.certificate_public = Boolean(certificate_public);
        await deleteKeysByPattern('app_user_other_details_*')


        await existingCertificate.save();

        return res.json({
          status: true,
          message: "Certificate visibility settings updated successfully.",
          data: {
            certificate_id: existingCertificate._id,
            average_score: existingCertificate.percentage_score,
            user_row_id: existingCertificate.user_row_id,
            course_row_id: existingCertificate.course_row_id,
            certificate_public: existingCertificate.certificate_public,
            // score_public: existingCertificate.score_public,
          }
        });
      }
    }
    return res.json({
      status: false,
      message: "Certificate not found for the given user and course.",
    });

  } catch (err) {

    console.error(err.message);
    res.json({ status: false, message: 'An error occurred while saving or updating the certificate.' });
  }
});







module.exports = router