const express = require('express')
const router = express.Router()
const { index } = require('../../config/pinecone') // Import the Pinecone index from your config  ;

const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const company_deleted_historyM = require('../../models/app/company/company_deleted_historyM')
const eventM = require('../../models/app/events/eventM')
const deleted_eventsM = require('../../models/app/events/deleted_eventsM')
const added_to_partnersM = require('../../models/app/company/added_to_partnersM')
const { getPresentDateTime } = require('../../utils/helpers/helper')
const event_speakersM = require('../../models/app/events/event_speakersM')
const coursesM = require('../../models/main/academy/coursesM')
const lessonsM = require('../../models/main/academy/lessonsM')
const community_postsM = require('../../models/main/community/community_postsM')
const event_tagsM = require('../../models/app/static/event_tagsM')
const company_business_modelsM = require('../../models/app/static/company_business_modelsM')
const user_designationsM = require('../../models/app/static/user_designationsM')
const user_looking_forM = require('../../models/app/static/user_looking_forM')
const cheerio = require("cheerio");
const axios = require("axios");
const seo_static_urlsM = require('../../models/seo_static_urlsM')
const { checkApiKey } = require('../../middleware/authorization')
const seo_change_logsM = require('../../models/seo_change_logsM')
const professionals_seo_detailsM = require('../../models/app/professionals_seo_detailsM')
const event_attendeesM = require('../../models/app/events/event_attendeesM')
const company_seo_detailsM = require('../../models/app/company/company_seo_detailsM')


const geminiService = require('../../services/ai_agents/geminiService');
const event_seo_detailsM = require('../../models/app/events/event_seo_detailsM')

// router.post('/details', async (req, res) => {
//   try {
//     const { prd_text, file_structure } = req.body;

//     if (!prd_text) {
//       return res.status(400).json({ error: "prd_text is required" });
//     }

//     const roadmap = await geminiService.analyzePRD(prd_text, file_structure);

//     return res.status(200).json({ success: true, data: roadmap });

//   } catch (error) {
//     console.error("AI Agent Error:", error.message);
//     return res.status(500).json({ error: "Failed to generate checklist" });
//   }
// });

//Pinecone
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    // 1. Generate the embedding (vector) for the search query
    // This must be the SAME model used during ingestion
    const queryVector = await generateEmbeddings(query);

    // 2. Query Pinecone
    const queryResponse = await index.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
      filter: { project: "APP_COINPEDIA" } // Example metadata filter
    });

    res.json({ success: true, results: queryResponse.matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/details', async (req, res) => {
  try {
    // 1. Destructure ALL fields sent from the frontend
    const {
      prd_text,
      file_structure,
      sonar_project_key,
      project_type
    } = req.body;

    // 2. Validation: Ensure we have the basics
    if (!prd_text || !file_structure) {
      return res.status(400).json({
        error: "Missing required fields: prd_text and file_structure are mandatory."
      });
    }

    // 3. Pass all 4 arguments to the service
    const roadmap = await geminiService.analyzePRD(
      prd_text,
      file_structure,
      sonar_project_key,
      project_type
    );

    return res.status(200).json({ success: true, data: roadmap });

  } catch (error) {
    console.error("AI Agent Error:", error.message);
    // Return the actual error message for easier debugging during development
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate roadmap"
    });
  }
});

router.get('/all_users_company_urls', async (req, res) => {
  try {
    let result = {}

    result['company_base_url'] = 'https://app.coinpedia.org/company/'
    // result['companies_list'] = await companyM.aggregate([
    //   {
    //     $match: { company_id: { $exists: true }, approval_status: 1 }
    //   },
    //   {
    //     $project: {
    //       _id: 1,
    //       company_name: 1,
    //       company_id: 1,
    //       updated_date_n_time: 1,
    //       active_status: 1,
    //       date_n_time: 1,
    //       company_logo: { $ifNull: ["$company_logo", ""] },
    //       status_code: {
    //         $cond: { if: { $eq: ["$active_status", 0] }, then: 410, else: 200 }
    //       }
    //     }
    //   },
    // ]).sort({ _id: -1 })
    result['companies_list'] = await companyM.aggregate([
      {
        $match: {
          company_id: { $exists: true },
          approval_status: 1
        }
      },
      {
        $lookup: {
          from: "cln_company_seo_details",
          localField: "_id",
          foreignField: "company_row_id",
          as: "seo_details"
        }
      },
      {
        $unwind: {
          path: "$seo_details",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          company_name: 1,
          company_id: 1,
          updated_date_n_time: 1,
          active_status: 1,
          created_date_n_time: 1,
          company_logo: { $ifNull: ["$company_logo", ""] },
          status_code: {
            $cond: { if: { $eq: ["$active_status", 0] }, then: 410, else: 200 }
          },
          about_company: 1,
          meta_title: "$seo_details.meta_title",
          meta_keywords: "$seo_details.meta_keywords",
          meta_description: "$seo_details.meta_description"
        }
      },
      { $sort: { _id: -1 } }
    ]);

    result['deleted_companies_list'] = await company_deleted_historyM.find({ company_id: { $exists: true }, approval_status: 1 }, { approval_status: 1, _id: 0, company_name: 1, company_id: 1, company_logo: 1, date_n_time: 1, status_code: { $literal: 410 } }).sort({ _id: -1 })

    result['user_list'] = await professionalsM.aggregate([
      {
        $match: { user_name: { $exists: true }, approval_status: 1 }
      },
      { $sort: { _id: -1 } },
      {
        $lookup:
        {
          from: "cln_professionals_profile_images",
          localField: "_id",
          foreignField: "user_row_id",
          as: "img_info"
        }
      },
      { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
      {
        $set: { profile_image: { $ifNull: ["$img_info.profile_image", ""] } }
      },
      {
        $lookup: {
          from: "cln_professionals_seo_details",
          localField: "_id",
          foreignField: "user_row_id",
          as: "seo_details"
        }
      },
      {
        $unwind: {
          path: "$seo_details",
          preserveNullAndEmptyArrays: true // so companies without details still show up
        }
      },
      {
        $project:
        {
          _id: 0,
          user_name: 1,
          full_name: 1,
          created_date_n_time: 1,
          login_status: 1,
          profile_image: 1,
          user_bio: 1,
          meta_keywords: "$seo_details.meta_keywords",
          meta_description: "$seo_details.meta_description",
          source: 'active',
          status_code: {
            $cond: { if: { $eq: ["$login_status", 1] }, then: 200, else: 410 }
          }
        }
      },
      {
        $unionWith: {
          coll: 'cln_professionals_delete_actions',
          pipeline: [
            { $match: { user_name: { $exists: true }, action_type: 2 } },
            { $sort: { _id: -1 } },
            {
              $project:
              {
                _id: 1,
                user_name: 1,
                full_name: 1,
                date_n_time: 1,
                profile_image: "",
                login_status: {
                  $cond: { if: { $eq: ["$action_type", 2] }, then: 2, else: "$$REMOVE" }
                },
                source: 'deleted',
                status_code: { $literal: 410 }
              }
            }
          ]
        }
      },
    ])

    result['users_base_url'] = 'https://app.coinpedia.org/'


    res.json({ status: true, message: result })
  }
  catch (err) {
    console.log('Users and company urls.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

router.get('/users_company_urls/:skip/:limit', async (req, res) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
    let result = {}

    result['company_base_url'] = 'https://app.coinpedia.org/company/'
    result['companies_list'] = await companyM.aggregate([
      {
        $match: { company_id: { $exists: true }, approval_status: 1 }
      },
      {
        $lookup: {
          from: "cln_company_seo_details",
          localField: "_id",
          foreignField: "company_row_id",
          as: "seo_details"
        }
      },
      {
        $unwind: {
          path: "$seo_details",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "cln_static_company_business_models",
          localField: "main_business_model_id",
          foreignField: "_id",
          as: "main_business_info",
          pipeline: [{ $project: { business_name: 1 } }]
        }
      },
      { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_static_company_business_models",
          localField: "business_model_id",
          foreignField: "_id",
          as: "business_info",
          pipeline: [{ $project: { business_name: 1 } }]
        }
      },
      {
        $project: {
          _id: 1,
          company_name: 1,
          company_id: 1,
          updated_date_n_time: 1,
          approval_status: 1,
          active_status: 1,
          created_date_n_time: 1,
          basic_details_score: 1,
          seo_details_score: 1,
          social_media_score: 1,
          owned_product_score: 1,
          team_detail_score: 1,
          job_opening_score: 1,
          funding_score: 1,
          revenue_score_score: 1,
          investment_score: 1,
          faq_score: 1,
          holding_crypto_score: 1,
          profile_score: 1,
          business_name: "$business_info.business_name",
          main_business_model_name: "$main_business_info.business_name",
          about_company: 1,
          meta_title: "$seo_details.meta_title",
          meta_keywords: "$seo_details.meta_keywords",
          meta_description: "$seo_details.meta_description",
          company_logo: { $ifNull: ["$company_logo", ""] },
          status_code: {
            $cond: { if: { $eq: ["$active_status", 0] }, then: 410, else: 200 }
          }
        }
      },
    ]).skip(skip).limit(limit).sort({ _id: -1 })

    result['company_count'] = await companyM.countDocuments({ company_id: { $exists: true }, approval_status: 1 })
    result['deleted_companies_list'] = await company_deleted_historyM.find({ company_id: { $exists: true }, approval_status: 1 }, { approval_status: 1, _id: 0, company_name: 1, company_id: 1, company_logo: 1, date_n_time: 1, status_code: { $literal: 410 } }).skip(skip).limit(limit)
    result['deleted_company_count'] = await company_deleted_historyM.countDocuments({ company_id: { $exists: true }, approval_status: 1 })

    result['user_list'] = await professionalsM.aggregate([
      {
        $match: { user_name: { $exists: true }, approval_status: 1 }
      },
      {
        $lookup:
        {
          from: "cln_professionals_profile_images",
          localField: "_id",
          foreignField: "user_row_id",
          as: "img_info"
        }
      },
      { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
      {
        $set: { profile_image: { $ifNull: ["$img_info.profile_image", ""] } }
      },
      {
        $lookup: {
          from: "cln_professionals_seo_details",
          localField: "_id",
          foreignField: "user_row_id",
          as: "seo_details"
        }
      },
      {
        $unwind: {
          path: "$seo_details",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "cln_static_user_designations",
          localField: "designation_id",
          foreignField: "_id",
          as: "designation_info",
          pipeline: [{ $project: { _id: 0, designation_name: 1 } }]
        }
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 1,
          user_name: 1,
          full_name: 1,
          created_date_n_time: 1,
          login_status: 1,
          profile_image: 1,
          user_bio: 1,
          designation_array: "$designation_info.designation_name",
          meta_keywords: "$seo_details.meta_keywords",
          meta_description: "$seo_details.meta_description",
          source: 'active',
          professional_profile_score: 1,
          seo_details_score: 1,
          social_media_score: 1,
          academy_score: 1,
          community_score: 1,
          professional_detail_score: 1,
          investment_score: 1,
          award_score: 1,
          faq_score: 1,
          profile_score: 1,
          status_code: {
            $cond: { if: { $eq: ["$login_status", 1] }, then: 200, else: 410 }
          }
        }
      },
      {
        $unionWith: {
          coll: 'cln_professionals_delete_actions',
          pipeline: [
            { $match: { user_name: { $exists: true }, action_type: 2 } },
            { $sort: { _id: -1 } },
            {
              $project: {
                _id: 1,
                user_name: 1,
                full_name: 1,
                date_n_time: 1,
                profile_image: "",
                login_status: {
                  $cond: { if: { $eq: ["$action_type", 2] }, then: 2, else: "$$REMOVE" }
                },
                source: 'deleted',
                status_code: { $literal: 410 }
              }
            }
          ]
        }
      },
    ]).skip(skip).limit(limit)

    const get_users_count = await professionalsM.aggregate([
      {
        $match: { user_name: { $exists: true }, approval_status: 1, }
      },

      {
        $project: {
          _id: 1,
        }
      },
      {
        $unionWith: {
          coll: 'cln_professionals_delete_actions',
          pipeline: [
            { $match: { user_name: { $exists: true }, action_type: 2 } },
            {
              $project: {
                _id: 1,
              }
            }
          ]
        }
      },
      {
        $count: 'count'
      }
    ])

    result['users_count'] = get_users_count[0] ? get_users_count[0].count : 0
    result['users_base_url'] = 'https://app.coinpedia.org/'


    res.json({ status: true, message: result })
  }
  catch (err) {
    console.log('Users and company urls.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

router.get('/academy_urls/:skip/:limit', async (req, res) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0;
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100;

    let result = {};

    // Base URLs
    result['academy_base_url'] = 'https://app.coinpedia.org/academy/';

    /**
     * 🧩 VALID COURSES — Must have at least 1 lesson with >=10 quiz questions
     */
    result['courses_list'] = await coursesM.aggregate([
      { $sort: { date_n_time: -1 } },
      {
        $lookup: {
          from: "cln_academy_courses_lessons",
          localField: "_id",
          foreignField: "course_row_id",
          as: "lesson_info"
        }
      },
      { $unwind: "$lesson_info" },
      {
        $lookup: {
          from: "cln_academy_quiz_questions",
          let: { lessonId: "$lesson_info._id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$lesson_row_id", "$$lessonId"] }
              }
            },
            { $count: "count" }
          ],
          as: "question_stats"
        }
      },
      {
        $addFields: {
          question_count: {
            $cond: [
              { $gt: [{ $size: "$question_stats" }, 0] },
              { $arrayElemAt: ["$question_stats.count", 0] },
              0
            ]
          }
        }
      },
      // ✅ Only keep lessons with >=10 questions
      {
        $match: { question_count: { $gte: 10 } }
      },
      // ✅ Group valid lessons back to their course
      {
        $group: {
          _id: "$_id",
          title: { $first: "$title" },
          description: { $first: "$description" },
          course_slug: { $first: "$course_slug" },
          meta_keywords: { $first: "$meta_keywords" },
          meta_description: { $first: "$meta_description" },
          date_n_time: { $first: "$date_n_time" },
          updated_on: { $first: "$updated_on" },
          total_lessons: { $sum: 1 }
        }
      },
      // ✅ Keep only courses with at least one valid lesson
      {
        $match: { total_lessons: { $gt: 0 } }
      },
      { $sort: { date_n_time: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: { status_code: { $literal: 200 } }
      }
    ]);

    /**
     * 🧩 VALID LESSONS — Must have >=10 quiz questions
     */
    result['lessons_list'] = await lessonsM.aggregate([
      { $match: { lesson_status: 1 } },
      {
        $lookup: {
          from: "cln_academy_quiz_questions",
          localField: "_id",
          foreignField: "lesson_row_id",
          pipeline: [
            {
              $group: {
                _id: "$lesson_row_id",
                count: { $sum: 1 }
              }
            }
          ],
          as: "lessonQues"
        }
      },
      {
        $addFields: {
          total_questions_count: {
            $ifNull: [{ $arrayElemAt: ["$lessonQues.count", 0] }, 0]
          }
        }
      },
      // ✅ Only keep lessons with >=10 questions
      {
        $match: { total_questions_count: { $gte: 10 } }
      },
      {
        $lookup: {
          from: "cln_academy_courses",
          localField: "course_row_id",
          foreignField: "_id",
          as: "course_info"
        }
      },
      { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          course_row_id: 1,
          lesson_number: 1,
          title: 1,
          description: 1,
          lesson_url: 1,
          course_slug: "$course_info.course_slug",
          meta_keywords: 1,
          meta_description: 1,
          total_questions_count: 1,
          updated_on: 1,
          date_n_time: 1,
          status_code: { $literal: 200 }
        }
      },
      { $sort: { _id: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // 🧾 Counts
    result['courses_count'] = result['courses_list'].length;
    result['lessons_count'] = result['lessons_list'].length;

    res.json({ status: true, message: result });
  } catch (err) {
    console.error('Academy URLs Error:', err);
    res.json({
      status: false,
      message: 'An unexpected error occurred while fetching academy URLs.',
      err: err?.message
    });
  }
});

router.get('/community_urls/:skip/:limit', async (req, res) => {
  try {
    const skip = Number.parseInt(req.params.skip) || 0;
    const limit = Number.parseInt(req.params.limit) || 100;

    const baseUrl = 'https://app.coinpedia.org/community/';

    // 🧩 Fetch only active posts
    const postList = await community_postsM.aggregate([
      { $match: { post_status: true } },
      { $sort: { date: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          group_id: 1,
          date: 1,
          content: 1,
          image: 1
        }
      },
      {
        $addFields: {
          post_url: {
            $concat: [baseUrl, { $toString: "$_id" }]
          },
          status_code: { $literal: 200 }
        }
      }
    ]);

    const totalCount = await community_postsM.countDocuments({ post_status: true });

    res.json({
      status: true,
      message: "Community URLs fetched successfully",
      total_count: totalCount,
      community_base_url: baseUrl,
      post_list: postList
    });

  } catch (err) {
    console.error('Community URLs Error:', err);
    res.status(500).json({
      status: false,
      message: 'An unexpected error occurred while fetching community URLs.',
      error: err?.message
    });
  }
});



router.get('/users_company_other_urls', async (req, res) => {
  try {
    let result = [
      {
        url: '/',
        status_code: 200
      },
      {
        url: '/login/',
        status_code: 200
      },
      {
        url: '/confirm-details/',
        status_code: 200
      },
      {
        url: '/verify-email/',
        status_code: 200
      },
      {
        url: '/referrals/',
        status_code: 200
      },
      {
        url: '/feedback/',
        status_code: 200
      },
      {
        url: '/companies/',
        status_code: 200
      },
      {
        url: '/watchlist/',
        status_code: 200
      },
      {
        url: '/partners/',
        status_code: 200
      },
      {
        url: '/professionals/',
        status_code: 200
      },
      {
        url: '/profile/',
        status_code: 200
      },
      {
        url: '/profile/professional_details/',
        status_code: 200
      },
      {
        url: '/profile/investments_details/',
        status_code: 200
      },
      {
        url: '/profile/followers/',
        status_code: 200
      },
      {
        url: '/profile/settings/',
        status_code: 200
      },
      {
        url: '/company/profile/',
        status_code: 200
      },
      {
        url: '/company/team_members/',
        status_code: 200
      },
      {
        url: '/company/connections/',
        status_code: 200
      },
      {
        url: '/company/funding/',
        status_code: 200
      },
      {
        url: '/company/funding/investments/',
        status_code: 200
      },
      {
        url: '/company/revenue_growth/',
        status_code: 200
      },
      {
        url: '/academy/',
        status_code: 200
      },
      {
        url: '/community/',
        status_code: 200
      },
      {
        url: '/compare/companies/',
        status_code: 200
      },
      {
        url: '/compare/professionals/',
        status_code: 200
      },
    ]

    const base_url = 'https://app.coinpedia.org/'

    // Company count
    let per_page = 100
    if (!Number.isNaN(Number.parseInt(req.query.per_page))) {
      per_page = Number.parseInt(req.query.per_page)
    }
    const company_count_query = await companyM.aggregate([
      {
        $match: { approval_status: 1, active_status: 1 }
      },
      {
        $lookup:
        {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            {
              $match: { login_status: { $ne: 1 } }
            },
            {
              $project: {
                _id: 1,
                login_status: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
      {
        $set: {
          login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } },
        }
      },
      { $match: { login_status: 1 } },
      {
        $count: "count"
      }
    ])

    const company_count = company_count_query[0] ? company_count_query[0].count : 0
    if (company_count > per_page) {
      let company_n = company_count / per_page
      let company_n_array = (company_n + "").split(".")
      let company_loop_value = Number.parseInt(company_n_array[0])
      if (company_n_array[1]) {
        company_loop_value += 1
      }
      for (let i = 0; i < company_loop_value; i++) {
        if (i) {
          result.push({
            url: '/companies/?page=' + (i + 1)
          })
        }
      }
    }

    //Partners Count
    let partners_per_page = 20
    if (!Number.isNaN(Number.parseInt(req.query.partners_per_page))) {
      partners_per_page = Number.parseInt(req.query.partners_per_page)
    }
    const partners_count_query = await added_to_partnersM.aggregate([
      {
        $lookup:
        {
          from: "cln_company_lists",
          localField: "company_row_id",
          foreignField: "_id",
          as: "company",
          pipeline: [
            {
              $match: { active_status: 1, approval_status: 1 }
            },
            {
              $lookup:
              {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "user_info",
                pipeline: [
                  { $match: { login_status: 1 } },
                  {
                    $project: {
                      _id: 1
                    }
                  }
                ]
              }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
            {
              $set: {
                login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } },
              }
            },
            { $match: { login_status: 1 } },
            {
              $project: {
                _id: 1,
              }
            }
          ]
        }
      },
      { $unwind: { path: "$company" } },
      {
        $count: "count"
      }
    ])

    const partners_count = partners_count_query[0] ? partners_count_query[0].count : 0
    if (partners_count > partners_per_page) {
      let partners_n = partners_count / partners_per_page
      let partners_n_array = (partners_n + "").split(".")
      let partners_loop_value = Number.parseInt(partners_n_array[0])
      if (partners_n_array[1]) {
        partners_loop_value += 1
      }
      for (let i = 0; i < partners_loop_value; i++) {
        if (i) {
          result.push({
            url: '/partners/?page=' + (i + 1)
          })
        }
      }
    }

    // Users Count
    const users_count = await professionalsM.countDocuments({ approval_status: 1, login_status: 1, account_visible_type: 2, user_name: { $exists: true } })
    if (users_count > per_page) {
      let users_n = users_count / per_page
      let users_n_array = (users_n + "").split(".")
      let users_loop_value = Number.parseInt(users_n_array[0])
      if (users_n_array[1]) {
        users_loop_value += 1
      }
      for (let i = 0; i < users_loop_value; i++) {
        if (i) {
          result.push({
            url: '/professionals/?page=' + (i + 1)
          })
        }
      }
    }

    res.json({ status: true, message: result, base_url })

  }
  catch (err) {
    console.log('Users and company other urls.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

router.get('/events_all_urls', async (req, res) => {
  try {

    const get_events_data = await eventM.aggregate([
      {
        $match: { event_url: { $exists: true }, approval_status: 1, }
      },
      {
        $lookup: {
          from: "cln_events_seo_details",
          localField: "_id",
          foreignField: "event_row_id",
          as: "seo_info"
        }
      },
      { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          event_url: 1,
          active_status: 1,
          approval_status: 1,
          start_date: 1,
          end_date: 1,
          event_title: 1,
          created_date_n_time: 1,
          event_description: 1,
          meta_keywords: { $ifNull: ["$seo_info.meta_keywords", ""] },
          meta_description: { $ifNull: ["$seo_info.meta_description", ""] },
          build_event_page_score: 1,
          seo_details_score: 1,
          contact_details_score: 1,
          tickets_coupons_score: 1,
          speakers_score: 1,
          sponsors_partners_score: 1,
          attendees_score: 1,
          faq_score: 1,
          profile_score: 1,
          event_image: { $ifNull: ["$event_image", ""] },
          source: 'active',
          status_code: {
            $cond: { if: { $eq: ["$active_status", 1] }, then: 200, else: 410 }
          }
        }
      },
      {
        $unionWith: {
          coll: 'cln_deleted_events',
          pipeline: [
            {
              $match: { event_url: { $exists: true }, approval_status: 1, }
            },
            {
              $set: { active_status: 2 }
            },
            {
              $project: {
                _id: 1,
                event_url: 1,
                active_status: 1,
                end_date: 1,
                event_title: 1,
                start_date: 1,
                created_date_n_time: 1,
                event_description: 1,
                meta_keywords: 1,
                meta_description: 1,
                event_image: "",
                source: 'deleted',
                status_code: 410
              }
            }
          ]
        }
      },
    ]).sort({ _id: -1 })

    const base_url = 'https://events.coinpedia.org/'

    res.json({ status: true, message: get_events_data, base_url })

  }
  catch (err) {
    console.log('All events urls without pagination.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})


router.get('/all_events_urls/:skip/:limit', async (req, res) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
    const present_date_time = new Date(getPresentDateTime())
    const get_events_data = await eventM.aggregate([
      {
        $match: { event_url: { $exists: true }, approval_status: 1, }
      },
      {
        $lookup:
        {
          from: "cln_events_tags",
          localField: "event_tags",
          foreignField: "_id",
          as: "eventTags"
        }
      },
      {
        $lookup: {
          from: "cln_events_seo_details",
          localField: "_id",
          foreignField: "event_row_id",
          as: "seo_info"
        }
      },
      { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 1,
          event_url: 1,
          event_tags: 1,

          start_date: 1,
          end_date: 1,
          active_status: 1,
          approval_status: 1,
          event_title: 1,
          event_description: 1,
          meta_keywords: { $ifNull: ["$seo_info.meta_keywords", ""] },
          meta_description: { $ifNull: ["$seo_info.meta_description", ""] },
          created_date_n_time: 1,
          build_event_page_score: 1,
          seo_details_score: 1,
          contact_details_score: 1,
          tickets_coupons_score: 1,
          speakers_score: 1,
          sponsors_partners_score: 1,
          attendees_score: 1,
          faq_score: 1,
          profile_score: 1,
          event_image: { $ifNull: ["$event_image", ""] },
          event_tag_array: "$eventTags.event_tag",
          source: 'active',
          status_code: {
            $cond: { if: { $eq: ["$active_status", 1] }, then: 200, else: 410 }
          },
          event_status: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $lte: ["$start_date", present_date_time] },
                      { $gte: ["$end_date", present_date_time] }
                    ]
                  },
                  then: 1 // ongoing
                },
                {
                  case: { $gte: ["$start_date", present_date_time] },
                  then: 2 // upcoming
                },
                {
                  case: { $lte: ["$end_date", present_date_time] },
                  then: 3 // ended
                }
              ],
              default: 0
            }
          }



        }
      },
      {
        $unionWith: {
          coll: 'cln_deleted_events',
          pipeline: [
            {
              $match: { event_url: { $exists: true }, approval_status: 1, }
            },
            { $sort: { _id: -1 } },
            {
              $set: { active_status: 2 }
            },
            {
              $project: {
                _id: 1,
                event_url: 1,
                active_status: 1,
                start_date: 1,
                end_date: 1,
                event_title: 1,
                created_date_n_time: 1,
                event_description: 1,
                event_image: "",
                source: 'deleted',
                event_status: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $and: [
                            { $lte: ["$start_date", present_date_time] },
                            { $gte: ["$end_date", present_date_time] }
                          ]
                        },
                        then: 1 // ongoing
                      },
                      {
                        case: { $gte: ["$start_date", present_date_time] },
                        then: 2 // upcoming
                      },
                      {
                        case: { $lte: ["$end_date", present_date_time] },
                        then: 3 // ended
                      }
                    ],
                    default: 0
                  }
                },
                status_code: { $literal: 410 }
              }
            }
          ]
        }
      },
    ]).skip(skip).limit(limit)

    const get_events_count = await eventM.aggregate([
      {
        $match: { event_url: { $exists: true }, approval_status: 1, }
      },
      {
        $project: {
          _id: 1,
        }
      },
      {
        $unionWith: {
          coll: 'cln_deleted_events',
          pipeline: [
            {
              $match: { event_url: { $exists: true }, approval_status: 1, }
            },
            {
              $project: {
                _id: 1,
              }
            }
          ]
        }
      },
      {
        $count: 'count'
      }
    ])

    const events_count = get_events_count[0] ? get_events_count[0].count : 0

    const base_url = 'https://events.coinpedia.org/'

    res.json({
      status: true, message: {
        events_list: get_events_data,
        events_count: events_count
      }, base_url
    })

  }
  catch (err) {
    console.log('All events urls.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})


router.get('/all_events_tags_url/:skip/:limit', async (req, res) => {
  try {
    const skip = Number.isNaN(Number.parseInt(req.params.skip)) ? 0 : Number.parseInt(req.params.skip);
    const limit = Number.isNaN(Number.parseInt(req.params.limit)) ? 100 : Number.parseInt(req.params.limit);

    const get_events_tags = await event_tagsM.aggregate([
      { $match: { active_status: true } },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 1,
          event_tag: 1,
          keywords: 1,
          active_status: 1,
          date_n_time: 1,
          status_code: {
            $cond: { if: { $eq: ["$active_status", true] }, then: 200, else: 410 }
          }
        }
      },
    ])
      .skip(skip)
      .limit(limit);

    // Fix: Count from event_tagsM (NOT eventM)
    const get_events_tags_count = await event_tagsM.countDocuments({ active_status: true });

    const base_url = 'https://events.coinpedia.org/';

    res.json({
      status: true,
      message: {
        events_tags: get_events_tags,
        events_tags_count: get_events_tags_count
      },
      base_url
    });

  } catch (err) {
    console.log('All events urls.', err.message);
    res.json({
      status: false,
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

router.get('/all_companies_tags_url/:skip/:limit', async (req, res) => {
  try {
    const skip = Number.isNaN(Number.parseInt(req.params.skip)) ? 0 : Number.parseInt(req.params.skip);
    const limit = Number.isNaN(Number.parseInt(req.params.limit)) ? 100 : Number.parseInt(req.params.limit);

    const get_company_tags = await company_business_modelsM.aggregate([
      { $match: { active_status: true } },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 1,
          business_name: 1,
          business_id: 1,
          active_status: 1,
          date_n_time: 1,
          status_code: {
            $cond: { if: { $eq: ["$active_status", true] }, then: 200, else: 410 }
          }
        }
      }
    ])
      .skip(skip)
      .limit(limit);

    // Correct: Use the model to count
    const get_company_tags_count = await company_business_modelsM.countDocuments({ active_status: true });

    const base_url = 'https://app.coinpedia.org/';

    res.json({
      status: true,
      message: {
        company_tags: get_company_tags,
        company_tags_count: get_company_tags_count
      },
      base_url
    });

  } catch (err) {
    console.log('All company tag urls error:', err.message);
    res.json({
      status: false,
      message: err.message
    });
  }
});


router.get('/all_users_tags_url/:skip/:limit', async (req, res) => {
  try {
    const skip = Number.isNaN(Number.parseInt(req.params.skip)) ? 0 : Number.parseInt(req.params.skip);
    const limit = Number.isNaN(Number.parseInt(req.params.limit)) ? 100 : Number.parseInt(req.params.limit);

    const get_users_tags = await user_designationsM.aggregate([
      { $match: { active_status: true } },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 1,
          designation_name: 1,
          show_in_job_status: 1,
          active_status: 1,
          date_n_time: 1,
          status_code: {
            $cond: { if: { $eq: ["$active_status", true] }, then: 200, else: 410 }
          }
        }
      }
    ])
      .skip(skip)
      .limit(limit);
    const get_users_looking_tags = await user_looking_forM.aggregate([
      { $match: { active_status: true } },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 1,
          name: 1,
          active_status: 1,
          date_n_time: 1,
          // date_n_time: 1,
          status_code: {
            $cond: { if: { $eq: ["$active_status", true] }, then: 200, else: 410 }
          }
        }
      }
    ])

    // Correct: Count using model, not array
    const get_users_tags_count = await user_designationsM.countDocuments({ active_status: true });

    const base_url = 'https://app.coinpedia.org/';

    res.json({
      status: true,
      message: {
        users_tags: get_users_tags,
        users_looking_tags: get_users_looking_tags,
        users_tags_count: get_users_tags_count
      },
      base_url
    });

  } catch (err) {
    console.log('All users tags urls error:', err.message);
    res.json({
      status: false,
      message: err.message
    });
  }
});

router.get('/events_other_urls', async (req, res) => {
  try {
    let result = [
      {
        url: '/',
        status_code: 200
      },
      {
        url: '/create-event/',
        status_code: 200
      },
      {
        url: '/upcoming/',
        status_code: 301,
        new_url: '/'
      },
      {
        url: '/organizers/',
        status_code: 200
      },
      {
        url: '/speakers/',
        status_code: 200
      },
      {
        url: '/past/',
        status_code: 410,
      },
      {
        url: '/my-events/',
        status_code: 200
      },
      {
        url: '/my-events/registered/',
        status_code: 200
      },
      {
        url: '/my-events/wishlist/',
        status_code: 200
      },
      {
        url: '/my-events/create-new/',
        status_code: 200
      },
      {
        url: '/my-events/edit/*',
        status_code: 200
      },
      {
        url: '/my-events/tickets/*',
        status_code: 200
      },
      {
        url: '/my-events/sponsors_partners/*',
        status_code: 200
      },
      {
        url: '/my-events/attendees/*',
        status_code: 200
      },
      {
        url: '/my-events/setting/*',
        status_code: 200
      },
      {
        url: '/global_search/?search=*',
        status_code: 410,
      },
      {
        url: '/global_search/',
        status_code: 410,
      },

    ]

    //Upcoming Events Counts

    const events_count_query = await eventM.aggregate([
      {
        $match: { active_status: 1, approval_status: 1, end_date: { $gte: new Date(getPresentDateTime()) } }
      },
      {
        $lookup:
        {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            {
              $match: { login_status: { $ne: 1 } }
            },
            {
              $project: {
                _id: 0,
                login_status: 1
              }
            }]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_company_lists",
          localField: "company_row_id",
          foreignField: "_id",
          as: "company_info",
          pipeline: [
            {
              $match: { active_status: { $ne: 1 } }
            },
            {
              $project: {
                _id: 0,
                active_status: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
      {
        $set: {
          company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
          login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
        }
      },
      {
        $match: {
          $or: [
            { login_status: 1, list_event_type: 1 },
            { company_active_status: 1, list_event_type: 2 },
            { list_event_type: 3, login_status: 1, company_active_status: 1 }
          ]
        }
      },
      {
        $count: "count"
      }
    ])

    const events_count = events_count_query[0] ? events_count_query[0].count : 0
    let events_per_page = 52
    if (!Number.isNaN(Number.parseInt(req.query.events_per_page))) {
      events_per_page = Number.parseInt(req.query.events_per_page)
    }

    if (events_count > events_per_page) {
      let events_n = events_count / events_per_page
      let events_n_array = (events_n + "").split(".")
      let events_loop_value = Number.parseInt(events_n_array[0])
      if (events_n_array[1]) {
        events_loop_value += 1
      }
      for (let i = 0; i < events_loop_value; i++) {
        if (i) {
          result.push({
            url: '/upcoming/?page=' + (i + 1),
            status_code: 410,
          })
        }
      }
    }

    // Organizers Count
    const organizers_count_query = await eventM.aggregate([
      {
        $match: {
          active_status: 1,
          end_date: { $gte: new Date(getPresentDateTime()) },
          approval_status: 1,
          company_row_id: { $gt: 0 }
        }
      },
      {
        $lookup:
        {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            { $match: { login_status: 1 } },
            {
              $project: {
                _id: 0,
                login_status: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
      {
        $set: {
          login_status: { $cond: { if: "$user_info.login_status", then: "$user_info.login_status", else: 1 } }
        }
      },
      { $match: { login_status: 1 } },
      { $group: { _id: "$company_row_id" } },
      {
        $lookup:
        {
          from: "cln_company_lists",
          localField: "_id",
          foreignField: "_id",
          as: "company_info",
          pipeline: [
            {
              $match: { approval_status: 1, active_status: 1 }
            },
            {
              $project: {
                _id: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$company_info" } },
      {
        $count: "count"
      }
    ])

    const organizers_count = organizers_count_query[0] ? organizers_count_query[0].count : 0
    let organizers_per_page = 52
    if (!Number.isNaN(Number.parseInt(req.query.organizers_per_page))) {
      organizers_per_page = Number.parseInt(req.query.organizers_per_page)
    }

    if (organizers_count > organizers_per_page) {
      let organizers_n = organizers_count / organizers_per_page
      let organizers_n_array = (organizers_n + "").split(".")
      let organizers_loop_value = Number.parseInt(organizers_n_array[0])
      if (organizers_n_array[1]) {
        organizers_loop_value += 1
      }
      for (let i = 0; i < organizers_loop_value; i++) {
        if (i) {
          result.push({
            url: '/organizers/?page=' + (i + 1),
            status_code: 200,

          })
        }
      }
    }

    // Speakers count
    const speakers_count_query = await event_speakersM.aggregate([
      { $match: { user_type: 1 } },
      {
        $lookup:
        {
          from: "cln_events",
          localField: "event_row_id",
          foreignField: "_id",
          as: "event_info",
          pipeline: [
            {
              $match: {
                active_status: 1,
                approval_status: 1
              }
            },
            {
              $project: {
                _id: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$event_info" } },
      {
        $group: {
          _id: "$user_row_id",
          count: { $sum: 1 }
        }
      },
      {
        $lookup:
        {
          from: "cln_professionals",
          localField: "_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            {
              $match: { login_status: 1, approval_status: 1 }
            },
            {
              $project: {
                _id: 1,
              }
            }
          ]
        }
      },
      { $unwind: { path: "$user_info" } },
      {
        $count: "count"
      }
    ])

    const speakers_count = speakers_count_query[0] ? speakers_count_query[0].count : 0
    let speakers_per_page = 52
    if (!Number.isNaN(Number.parseInt(req.query.speakers_per_page))) {
      speakers_per_page = Number.parseInt(req.query.speakers_per_page)
    }

    if (speakers_count > speakers_per_page) {
      let speakers_n = speakers_count / speakers_per_page
      let speakers_n_array = (speakers_n + "").split(".")
      let speakers_loop_value = Number.parseInt(speakers_n_array[0])
      if (speakers_n_array[1]) {
        speakers_loop_value += 1
      }
      for (let i = 0; i < speakers_loop_value; i++) {
        if (i) {
          result.push({
            url: '/speakers/?page=' + (i + 1),
            status_code: 200,

          })
        }
      }
    }

    //Past events counts
    const past_events_count_query = await eventM.aggregate([
      {
        $match: { end_date: { $lt: new Date(getPresentDateTime()) }, active_status: 1, approval_status: 1 }
      },
      {
        $lookup:
        {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            {
              $match: { login_status: { $ne: 1 } }
            },
            {
              $project: {
                _id: 1,
                login_status: 1
              }
            }]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_company_lists",
          localField: "company_row_id",
          foreignField: "_id",
          as: "company_info",
          pipeline: [
            {
              $match: { active_status: { $ne: 1 } }
            },
            {
              $project: {
                _id: 1,
                active_status: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$company_info", preserveNullAndEmptyArrays: true } },
      {
        $set: {
          company_active_status: { $cond: { if: "$company_info", then: "$company_info.active_status", else: 1 } },
          login_status: { $cond: { if: "$user_info", then: "$user_info.login_status", else: 1 } }
        }
      },
      {
        $match: {
          $or: [
            { login_status: 1, list_event_type: 1 },
            { company_active_status: 1, list_event_type: 2 },
            { list_event_type: 3, login_status: 1, company_active_status: 1 }
          ]
        }
      },
      {
        $count: "count"
      }
    ])

    const past_events_count = past_events_count_query[0] ? past_events_count_query[0].count : 0
    if (!Number.isNaN(Number.parseInt(req.query.events_per_page))) {
      events_per_page = Number.parseInt(req.query.events_per_page)
    }

    if (past_events_count > events_per_page) {
      let past_events_n = past_events_count / events_per_page
      let past_events_n_array = (past_events_n + "").split(".")
      let past_events_loop_value = Number.parseInt(past_events_n_array[0])
      if (past_events_n_array[1]) {
        past_events_loop_value += 1
      }
      for (let i = 0; i < past_events_loop_value; i++) {
        if (i) {
          result.push({
            url: '/past/?page=' + (i + 1),
            status_code: 410,
          })
        }
      }
    }

    const base_url = 'https://events.coinpedia.org'

    res.json({ status: true, message: result, base_url })
  }
  catch (err) {
    console.log('Events other urls.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})


router.get("/users_heading_structure", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "URL is required"
      });
    }

    const pageResult = {
      url,
      status_code: 200,
      h1: [],
      subheadings: [],
      h2_count: 0,
      h3_count: 0
    };

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CoinpediaSEO/1.0; +https://coinpedia.org)",
        },
        validateStatus: (status) => status < 500, // allow 404
      });
      if (response.status !== 200) {
        pageResult.status_code = response.status;
        return res.json({
          status: true,
          message: pageResult,
        });
      }
      const html = response.data;
      const $ = cheerio.load(html);

      // 🔹 Soft 404 detection
      const h1Text = $("h1").first().text().toLowerCase();
      if (h1Text.includes("404")) {
        pageResult.status_code = 404;
        return res.json({
          status: true,
          message: pageResult
        });
      }

      // 🔹 H1
      $("h1").each((_, el) => {
        const text = $(el).text().trim();
        if (text) {
          pageResult.h1.push({ tag: "h1", text });
        }
      });

      // 🔹 H2 + H3 (sequence preserved)
      $("h2, h3").each((_, el) => {
        const tag = el.tagName.toLowerCase();
        const text = $(el).text().trim();
        if (!text) return;

        if (tag === "h2") pageResult.h2_count++;
        if (tag === "h3") pageResult.h3_count++;

        pageResult.subheadings.push({ tag, text });
      });

      return res.json({
        status: true,
        message: pageResult
      });

    } catch (err) {
      pageResult.status_code = 500;
      return res.json({
        status: false,
        message: pageResult
      });
    }

  } catch (err) {
    console.error("Heading structure error:", err.message);
    return res.json({
      status: false,
      message: err.message
    });
  }
});
router.get('/get_seo_details/:module', checkApiKey, async (req, res) => {
  try {
    const { module } = req.params;
    const { url } = req.query;

    if (!module || !url) {
      return res.status(400).json({
        status: false,
        message: "module and url are required"
      });
    }
    const record = await seo_static_urlsM.findOne({
      module: module,
      url: decodeURIComponent(url)
    }).lean();

    if (!record) {
      return res.json({
        status: false,
        message: "SEO data not found",
        module,
        url
      });
    }

    return res.json({
      status: true,
      message: "SEO details fetched successfully",
      data: record
    });

  } catch (error) {
    console.error("❌ Error fetching SEO details:", error?.message);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error?.message
    });
  }
});



router.get('/seo_issues_list', checkApiKey, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const issue = req.query.issue; // e.g. h1_missing, title_above_70
    const moduleFilter = req.query.module;

    const excludePatterns = ["watchlist", "company", "companies", "partner"];

    // Validate issue field
    const allowedIssues = [
      "h1_missing",
      "h2_missing",
      "multiple_h1",
      "bad_heading_sequence",
      "title_above_60",
      "title_above_70"
    ];

    if (!issue || !allowedIssues.includes(issue)) {
      return res.status(400).json({
        status: false,
        message: `Invalid or missing issue key. Allowed: ${allowedIssues.join(", ")}`
      });
    }

    let condition_query = [];

    if (moduleFilter === 'app') {
      condition_query = [
        {
          $lookup: {
            from: "cln_professionals",
            localField: "user_row_id",
            foreignField: "_id",
            as: "user_info",
            pipeline: [
              { $match: { user_name: { $ne: "" }, approval_status: 1 } }
            ]
          }
        },
        { $match: { user_info: { $ne: [] } } }
      ];
    }

    if (moduleFilter === 'company') {
      condition_query = [
        {
          $lookup: {
            from: "cln_company_lists",
            localField: "company_row_id",
            foreignField: "_id",
            as: "company_info",
            pipeline: [
              {
                $match: {
                  approval_status: 1,
                  active_status: 1,
                  company_id: { $exists: true, $ne: "" }
                }
              }
            ]
          }
        },
        { $match: { company_info: { $ne: [] } } }
      ];
    }

    if (moduleFilter === 'event') {
      condition_query = [
        {
          $match: {
            approval_status: 1,
            active_status: 1,
            event_url: { $exists: true, $ne: "" }
          }
        }
      ];
    }


    /* --------------------------------------------------
        STATIC QUERY PIPELINE
    -------------------------------------------------- */
    const staticPipeline = [

      {
        $addFields: {
          headers: { $ifNull: ["$header_structure", []] },
        }
      },
      {
        $addFields: {
          h1_index: { $indexOfArray: ["$headers.tag", "H1"] },
          h2_index: { $indexOfArray: ["$headers.tag", "H2"] },
          h3_index: { $indexOfArray: ["$headers.tag", "H3"] }
        }
      },
      {
        $addFields: {
          h1_count: {
            $size: {
              $filter: { input: "$headers", cond: { $eq: ["$$this.tag", "H1"] } }
            }
          },
          h2_count: {
            $size: {
              $filter: { input: "$headers", cond: { $eq: ["$$this.tag", "H2"] } }
            }
          },
          meta_title_length: { $strLenCP: { $ifNull: ["$meta_title", ""] } }
        }
      },
      {
        $addFields: {
          h1_missing: { $or: [{ $eq: ["$h1_count", 0] }, { $eq: [{ $size: "$headers" }, 0] }] },
          h2_missing: { $or: [{ $eq: ["$h2_count", 0] }, { $eq: [{ $size: "$headers" }, 0] }] },
          multiple_h1: { $gt: ["$h1_count", 1] },
          title_above_60: { $and: [{ $gt: ["$meta_title_length", 60] }, { $lte: ["$meta_title_length", 70] }] },
          title_above_70: { $gt: ["$meta_title_length", 70] },
          bad_heading_sequence: {
            $or: [
              { $and: [{ $gte: ["$h2_index", 0] }, { $lt: ["$h2_index", "$h1_index"] }] }, // H2 before H1
              { $and: [{ $gte: ["$h3_index", 0] }, { $lt: ["$h3_index", "$h2_index"] }] }  // H3 before H2
            ]
          }
        }
      },
      { $match: { [issue]: true } }, // ⭐ FILTER BY ISSUE TYPE
      {
        $project: {
          _id: 1,
          url: 1,
          module: { $literal: "static" },
          page_type: 1,
          issue_type: issue
        }
      }
    ];

    /* --------------------------------------------------
        USER QUERY PIPELINE
    -------------------------------------------------- */
    const userPipeline = [
      {
        $addFields: {
          headers: { $ifNull: ["$header_structure", []] },
        }
      },
      {
        $addFields: {
          h1_index: { $indexOfArray: ["$headers.tag", "H1"] },
          h2_index: { $indexOfArray: ["$headers.tag", "H2"] },
          h3_index: { $indexOfArray: ["$headers.tag", "H3"] }
        }
      },
      {
        $addFields: {
          h1_count: {
            $size: {
              $filter: { input: "$headers", cond: { $eq: ["$$this.tag", "H1"] } }
            }
          },
          h2_count: {
            $size: {
              $filter: { input: "$headers", cond: { $eq: ["$$this.tag", "H2"] } }
            }
          },
          meta_title_length: { $strLenCP: { $ifNull: ["$meta_title", ""] } }
        }
      },
      {
        $addFields: {
          h1_missing: { $or: [{ $eq: ["$h1_count", 0] }, { $eq: [{ $size: "$headers" }, 0] }] },
          h2_missing: { $or: [{ $eq: ["$h2_count", 0] }, { $eq: [{ $size: "$headers" }, 0] }] },
          multiple_h1: { $gt: ["$h1_count", 1] },
          title_above_60: { $and: [{ $gt: ["$meta_title_length", 60] }, { $lte: ["$meta_title_length", 70] }] },
          title_above_70: { $gt: ["$meta_title_length", 70] },
          bad_heading_sequence: {
            $or: [
              { $and: [{ $gte: ["$h2_index", 0] }, { $lt: ["$h2_index", "$h1_index"] }] }, // H2 before H1
              { $and: [{ $gte: ["$h3_index", 0] }, { $lt: ["$h3_index", "$h2_index"] }] }  // H3 before H2
            ]
          }
        }
      },
      { $match: { [issue]: true } },
    ];

    // 🌍 Execute based on module query
    const results = [];


    if (moduleFilter === "user") {
      results.push(...await seo_static_urlsM.aggregate([{ $match: { module: "app", url: { $not: { $regex: excludePatterns.join("|"), $options: "i" } } } }, ...staticPipeline]));

      results.push(
        ...await professionals_seo_detailsM.aggregate([
          ...userPipeline,
          ...condition_query,
          {
            $project: {
              _id: 1,
              user_row_id: 1,
              module: { $literal: "user" },
              module_id: { $arrayElemAt: ["$user_info.user_name", 0] },
              issue_type: issue
            }
          },
          { $skip: skip },
          { $limit: limit }
        ])
      );
    } else if (moduleFilter === "company") {
      results.push(...await seo_static_urlsM.aggregate([{ $match: { module: "app", url: { $regex: excludePatterns.join("|"), $options: "i" } } }, ...staticPipeline]));

      results.push(
        ...await company_seo_detailsM.aggregate([
          ...userPipeline,
          ...condition_query,
          {
            $project: {
              _id: 1,
              module: { $literal: "company" },
              company_row_id: 1,
              module_id: { $arrayElemAt: ["$company_info.company_id", 0] }, // 👈 SHOW COMPANY ID
              company_name: { $arrayElemAt: ["$company_info.company_name", 0] },
              issue_type: issue
            }
          },
          { $skip: skip },
          { $limit: limit }
        ])
      );
    } else if (moduleFilter === "event") {
      results.push(...await seo_static_urlsM.aggregate([{ $match: { module: "event" } }, ...staticPipeline]));

      // Event-specific pipeline to handle SEO data from cln_events_seo_details
      const eventPipeline = [
        {
          $addFields: {
            headers: { $ifNull: ["$event_seo.header_structure", []] },
          }
        },
        {
          $addFields: {
            h1_index: { $indexOfArray: ["$headers.tag", "H1"] },
            h2_index: { $indexOfArray: ["$headers.tag", "H2"] },
            h3_index: { $indexOfArray: ["$headers.tag", "H3"] }
          }
        },
        {
          $addFields: {
            h1_count: {
              $size: {
                $filter: { input: "$headers", cond: { $eq: ["$$this.tag", "H1"] } }
              }
            },
            h2_count: {
              $size: {
                $filter: { input: "$headers", cond: { $eq: ["$$this.tag", "H2"] } }
              }
            },
            meta_title_length: { $strLenCP: { $ifNull: ["$event_seo.meta_title", ""] } }
          }
        },
        {
          $addFields: {
            h1_missing: { $or: [{ $eq: ["$h1_count", 0] }, { $eq: [{ $size: "$headers" }, 0] }] },
            h2_missing: { $or: [{ $eq: ["$h2_count", 0] }, { $eq: [{ $size: "$headers" }, 0] }] },
            multiple_h1: { $gt: ["$h1_count", 1] },
            title_above_60: { $and: [{ $gt: ["$meta_title_length", 60] }, { $lte: ["$meta_title_length", 70] }] },
            title_above_70: { $gt: ["$meta_title_length", 70] },
            bad_heading_sequence: {
              $or: [
                { $and: [{ $gte: ["$h2_index", 0] }, { $lt: ["$h2_index", "$h1_index"] }] }, // H2 before H1
                { $and: [{ $gte: ["$h3_index", 0] }, { $lt: ["$h3_index", "$h2_index"] }] }  // H3 before H2
              ]
            }
          }
        },
        { $match: { [issue]: true } },
      ];

      results.push(
        ...await eventM.aggregate([
          ...condition_query,
          {
            $lookup: {
              from: "cln_events_seo_details",
              localField: "_id",
              foreignField: "event_row_id",
              as: "event_seo"
            }
          },
          { $unwind: { path: "$event_seo", preserveNullAndEmptyArrays: true } },
          ...eventPipeline,
          {
            $project: {
              _id: 1,
              module: { $literal: "event" },
              module_id: "$event_url",

              event_title: "$event_title",
              issue_type: issue
            }
          },
          { $skip: skip },
          { $limit: limit }
        ])
      );
    }

    return res.json({
      status: true,
      issue,
      module: moduleFilter || "all",
      count: results.length,
      page,
      limit,
      results
    });

  } catch (error) {
    console.error("❌ /seo_user_issues:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
  }
});

router.get("/seo_issue_check", checkApiKey, async (req, res) => {
  try {
    const { module } = req.query;
    const module_id = Number.parseInt(req.query.id)

    if (!module || !module_id) {
      return res.status(400).json({
        status: false,
        message: "module and module_id are required"
      });
    }

    // map module to collection + match field
    let collection;
    let matchQuery = {};

    if (module === "user") {
      collection = professionals_seo_detailsM;
      matchQuery = { user_row_id: module_id };
    } else if (module === "company") {
      collection = company_seo_detailsM;
      matchQuery = { company_row_id: module_id };
    } else if (module === "event") {
      collection = event_seo_detailsM;
      matchQuery = { _id: module_id };
    } else {
      return res.status(400).json({
        status: false,
        message: "Invalid module type"
      });
    }

    const pipeline = [
      { $match: matchQuery },

      {
        $addFields: {
          headers: { $ifNull: ["$header_structure", []] }
        }
      },

      {
        $addFields: {
          h1_index: { $indexOfArray: ["$headers.tag", "H1"] },
          h2_index: { $indexOfArray: ["$headers.tag", "H2"] },
          h3_index: { $indexOfArray: ["$headers.tag", "H3"] }
        }
      },

      {
        $addFields: {
          h1_count: {
            $size: {
              $filter: {
                input: "$headers",
                cond: { $eq: ["$$this.tag", "H1"] }
              }
            }
          },
          h2_count: {
            $size: {
              $filter: {
                input: "$headers",
                cond: { $eq: ["$$this.tag", "H2"] }
              }
            }
          },
          meta_title_length: {
            $strLenCP: { $ifNull: ["$meta_title", ""] }
          }
        }
      },

      {
        $addFields: {
          h1_missing: {
            $or: [
              { $eq: ["$h1_count", 0] },
              { $eq: [{ $size: "$headers" }, 0] }
            ]
          },
          h2_missing: {
            $or: [
              { $eq: ["$h2_count", 0] },
              { $eq: [{ $size: "$headers" }, 0] }
            ]
          },
          multiple_h1: { $gt: ["$h1_count", 1] },
          title_above_60: {
            $and: [
              { $gt: ["$meta_title_length", 60] },
              { $lte: ["$meta_title_length", 70] }
            ]
          },
          title_above_70: { $gt: ["$meta_title_length", 70] },
          bad_heading_sequence: {
            $or: [
              {
                $and: [
                  { $gte: ["$h2_index", 0] },
                  { $lt: ["$h2_index", "$h1_index"] }
                ]
              },
              {
                $and: [
                  { $gte: ["$h3_index", 0] },
                  { $lt: ["$h3_index", "$h2_index"] }
                ]
              }
            ]
          }
        }
      },

      {
        $project: {
          _id: 0,
          module: { $literal: module },
          module_id: { $literal: module_id },
          issues: {
            h1_missing: "$h1_missing",
            h2_missing: "$h2_missing",
            multiple_h1: "$multiple_h1",
            bad_heading_sequence: "$bad_heading_sequence",
            title_above_60: "$title_above_60",
            title_above_70: "$title_above_70"
          }
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline);

    if (!result) {
      return res.json({
        status: true,
        module,
        id: module_id,
        issues: {},
        message: "No SEO data found"
      });
    }

    // return only TRUE issues
    const activeIssues = Object.entries(result.issues)
      .filter(([, value]) => value === true)
      .map(([key]) => key);

    return res.json({
      status: true,
      module,
      id: module_id,
      issue_count: activeIssues.length,
      issues: activeIssues
    });

  } catch (err) {
    console.error("❌ /seo_issue_check:", err);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
});



router.get('/get_user_seo/:user_row_id', checkApiKey, async (req, res) => {
  try {
    const user_row_id = req.params.user_row_id;

    let condition = { _id: Number(user_row_id) };

    const userData = await professionalsM.aggregate([
      { $match: condition },
      {
        $lookup:
        {
          from: "cln_static_countries",
          localField: "country_mobile_id",
          foreignField: "_id",
          as: "country_info"
        }
      },
      { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_professionals_seo_details",
          localField: "_id",
          foreignField: "user_row_id",
          as: "seo_details",
        }
      },
      { $unwind: { path: "$seo_details", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_professionals_social_links",
          localField: "_id",
          foreignField: "user_row_id",
          as: "social_details",
        }
      },
      { $unwind: { path: "$social_details", preserveNullAndEmptyArrays: true } },

      {
        $lookup:
        {
          from: "cln_professionals_profile_images",
          localField: "_id",
          foreignField: "user_row_id",
          as: "info_img"
        }
      },
      { $unwind: { path: "$info_img", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_professionals_work_experiences",
          localField: "_id",
          foreignField: "user_row_id",
          pipeline: [
            { $match: { public_view: true, user_account_type: 1 } },
            {
              $lookup:
              {
                from: "cln_static_professionals_work_positions",
                localField: "position_row_id",
                foreignField: "_id",
                as: "info_position",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      position_name: 1
                    }
                  }
                ]
              }
            },
            { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
            { $limit: 1 },
            {
              $lookup:
              {
                from: "cln_company_lists",
                let: {
                  company_type: '$company_type',
                  company_row_id: '$company_row_id'
                },
                as: "info_company",
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: [1, '$$company_type'] },
                          { $eq: ['$_id', "$$company_row_id"] }
                        ]
                      }
                    }
                  },
                  {
                    $project: {
                      _id: 1,
                      company_name: 1
                    }
                  }
                ]
              }
            },
            { $unwind: { path: "$info_company", preserveNullAndEmptyArrays: true } },
            {
              $lookup:
              {
                from: "cln_company_manual_retrievals",
                let: {
                  company_type: '$company_type',
                  company_row_id: '$company_row_id'
                },
                as: "info_manual_company",
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: [2, '$$company_type'] },
                          { $eq: ['$_id', "$$company_row_id"] }
                        ]
                      }
                    }
                  },
                  {
                    $project: {
                      _id: 1,
                      company_name: 1
                    }
                  }
                ]
              }
            },
            { $unwind: { path: "$info_manual_company", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                position_name: '$info_position.position_name',
                company_name: { $cond: { if: "$info_company.company_name", then: "$info_company.company_name", else: "$info_manual_company.company_name" } },
              }
            }
          ],
          as: "info_work",
        }
      },
      { $unwind: { path: "$info_work", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "cln_professionals_faq_lists",
          localField: "_id",
          foreignField: "user_row_id",
          as: "faq",
          pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }]
        }
      },
      {
        $project: {
          _id: 1,
          url: "$user_name",
          start_date: 1,
          end_date: 1,
          updated_date_n_time: "$created_date_n_time",
          created_date_n_time: "$updated_date_n_time",
          country_name: '$country_info.country_name',
          location: 1,
          work_position: "$info_work.position_name",
          company_name: "$info_work.company_name",
          mobile_number: 1,
          country_id: 1,
          country_mobile_id: 1,
          facebook: '$social_details.facebook',
          twitter: '$social_details.twitter',
          linkedin: '$social_details.linkedin',
          telegram: '$social_details.telegram',
          instagram: '$social_details.instagram',
          medium: '$social_details.medium',
          reddit: '$social_details.reddit',
          feed_url: '$social_details.feed_url',
          youtube_channel: '$social_details.youtube_channel',
          video_link: '$social_details.video_link',
          title: "$full_name",
          description: "$user_bio",
          image: "$info_img.profile_image",
          meta_title: '$seo_details.meta_title',
          meta_description: '$seo_details.meta_description',
          meta_keywords: '$seo_details.meta_keywords',
          robots_index: '$seo_details.robots_index',
          robots_follow: '$seo_details.robots_follow',
          og_title: '$seo_details.og_title',
          og_description: '$seo_details.og_description',
          twitter_title: '$seo_details.twitter_title',
          twitter_description: '$seo_details.twitter_description',
          twitter_creator: '$seo_details.twitter_creator',
          faq: 1,
          user_name: 1,
          full_name: 1,
          email_id: 1,

        }
      }
    ]);

    if (!userData || userData.length == 0) {
      return res.json({
        status: false,
        message: { alert_message: "Invalid User Row ID." }
      });
    }

    const data = userData[0];

    return res.json({
      status: true,
      message: { alert_message: "User SEO fetched successfully" },
      data: data
    });

  } catch (err) {
    console.log('Get User seo error:', err.message);
    return res.json({
      status: false,
      message: { alert_message: 'An unexpected error occurred. Please try again later.' }
    });
  }
});


router.get('/get_company_seo/:company_id', checkApiKey, async (req, res) => {
  try {
    const company_id = req.params.company_id;


    let condition = { _id: Number(company_id) };

    const companyData = await companyM.aggregate([
      { $match: condition },

      {
        $lookup: {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            { $project: { _id: 1, full_name: 1, user_name: 1, profile_image: 1 } }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "cln_company_seo_details",
          localField: "_id",
          foreignField: "company_row_id",
          as: "seo_details",
        }
      },
      { $unwind: { path: "$seo_details", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_company_social_links",
          localField: "_id",
          foreignField: "company_row_id",
          as: "social_links",
        }
      },
      { $unwind: { path: "$social_links", preserveNullAndEmptyArrays: true } },

      // Company FAQ
      {
        $lookup: {
          from: "cln_company_faq_lists",
          localField: "_id",
          foreignField: "company_row_id",
          as: "faq",
          pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }]
        }
      },

      {
        $project: {
          _id: 1,
          url: "$company_id",
          title: "$company_name",
          description: 1,
          image: "$company_logo",
          facebook: '$social_links.facebook',
          twitter: '$social_links.twitter',
          linkedin: '$social_links.linkedin',
          telegram: '$social_links.telegram',
          instagram: '$social_links.instagram',
          medium: '$social_links.medium',
          reddit: '$social_links.reddit',
          feed_url: '$social_links.feed_url',
          youtube_channel: '$social_links.youtube_channel',
          video_link: '$social_links.video_link',
          website_link: 1,
          established_in: 1,
          start_date: 1,
          created_date_n_time: '$created_date_n_time',
          // SEO
          meta_title: '$seo_details.meta_title',
          meta_description: '$seo_details.meta_description',
          meta_keywords: '$seo_details.meta_keywords',
          robots_index: '$seo_details.robots_index',
          robots_follow: '$seo_details.robots_follow',
          og_title: '$seo_details.og_title',
          og_description: '$seo_details.og_description',
          twitter_title: '$seo_details.twitter_title',
          twitter_description: '$seo_details.twitter_description',
          twitter_creator: '$seo_details.twitter_creator',

          faq: 1,
          user_name: "$user_info.user_name",
          full_name: "$user_info.full_name",
          email_id: "$user_info.email_id",
        }
      }
    ]);

    if (!companyData.length)
      return res.json({
        status: false,
        message: { alert_message: "Invalid Company ID." }
      });

    return res.json({
      status: true,
      message: { alert_message: "Company SEO fetched successfully" },
      data: companyData[0]
    });

  } catch (err) {
    console.log("Get company SEO error:", err);
    return res.json({
      status: false,
      message: { alert_message: "An unexpected error occurred. Please try again later." }
    });
  }
});

router.get('/get_event_seo/:event_row_id', checkApiKey, async (req, res) => {
  try {
    const event_row_id = req.params.event_row_id;
    if (!event_row_id) {
      return res.json({
        status: false,
        message: { alert_message: "The Event Row ID field is required." }
      });
    }

    // ownership restriction for normal user
    let condition = { _id: Number(event_row_id) };

    const eventData = await eventM.aggregate([
      { $match: condition },

      // USER lookup
      {
        $lookup: {
          from: "cln_professionals",
          localField: "user_row_id",
          foreignField: "_id",
          as: "user_info",
          pipeline: [
            { $project: { _id: 1, full_name: 1, user_name: 1, profile_image: 1 } }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "cln_sub_admins",
          localField: "created_by_sub_admin_id",
          foreignField: "_id",
          as: "sub_admin_info",
          pipeline: [
            { $project: { _id: 1, full_name: 1, email_id: 1 } }
          ]
        }
      },
      {
        $lookup:
        {
          from: "cln_events_utc_dates",
          localField: "utc_row_id",
          foreignField: "_id",
          as: "utc_dates"
        }
      },
      { $unwind: { path: "$utc_dates", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_static_countries",
          localField: "contact_country_row_id",
          foreignField: "_id",
          as: "country_info"
        }
      },
      { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_company_lists",
          localField: "company_row_id",
          foreignField: "_id",
          as: "company_info",
        }
      },

      // FAQ lookup
      {
        $lookup: {
          from: "cln_events_faq_lists",
          localField: "_id",
          foreignField: "event_row_id",
          as: "faq",
          pipeline: [{ $project: { _id: 0, faq_answer: 1, faq_question: 1 } }]
        }
      },
      {
        $lookup: {
          from: "cln_events_seo_details",
          localField: "_id",
          foreignField: "event_row_id",
          as: "seo_info"
        }
      },
      { $unwind: { path: "$seo_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          url: "$event_url",
          tags: "$event_tags",
          type: "$event_type",
          start_date: 1,
          end_date: 1,
          utc_time: "$utc_dates.utc_time",
          event_type: 1,
          event_venue: 1,
          sortname: "$country_info.sortname",
          webinar_meeting_link: 1,
          event_card_image: 1,
          event_link: 1,
          user_full_name: "$user_info.full_name",
          user_username: "$user_info.user_name",
          company_name: "$company_info.company_name",
          company_id: "$company_info.company_id",
          list_event_type: 1,

          price: "$event_price",
          title: "$event_title",
          description: "$event_description",
          image: "$event_image",
          meta_keywords: { $ifNull: ["$seo_info.meta_keywords", ""] },
          meta_description: { $ifNull: ["$seo_info.meta_description", ""] },
          meta_title: { $ifNull: ["$seo_info.meta_title", ""] },
          robots_index: { $ifNull: ["$seo_info.robots_index", ""] },
          robots_follow: { $ifNull: ["$seo_info.robots_follow", ""] },
          og_title: { $ifNull: ["$seo_info.og_title", ""] },
          og_description: { $ifNull: ["$seo_info.og_description", ""] },
          twitter_title: { $ifNull: ["$seo_info.twitter_title", ""] },
          twitter_description: { $ifNull: ["$seo_info.twitter_description", ""] },
          twitter_creator: { $ifNull: ["$seo_info.twitter_creator", ""] },
          updated_date_n_time: 1,
          created_date_n_time: 1,
          faq: 1,
          created_by_status: "$created_by_admin_status",
          user_name: "$user_info.user_name",
          full_name: "$user_info.full_name",
          email_id: "$user_info.email_id",
          sub_admin_name: "$sub_admin_info.full_name",
        }
      }
    ]);

    if (!eventData || eventData.length == 0) {
      return res.json({
        status: false,
        message: { alert_message: "Invalid Event Row ID." }
      });
    }

    const data = eventData[0];

    data.attendees_list = await event_attendeesM.aggregate([
      {
        $match: {
          event_row_id: Number(event_row_id),
          invitation_status: 1
        }
      },
      {
        $lookup: {
          from: "cln_professionals",
          let: {
            user_type: "$user_type",
            user_row_id: "$user_row_id"
          },
          as: "user_info",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$user_type", 1] },
                    { $eq: ["$_id", "$$user_row_id"] }
                  ]
                },
                login_status: 1
              }
            },
            {
              $lookup: {
                from: "cln_professionals_profile_images",
                localField: "_id",
                foreignField: "user_row_id",
                as: "img_info"
              }
            },
            {
              $unwind: {
                path: "$img_info",
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                user_name: 1,
                pro_batch: 1,
                full_name: 1,
                email_id: 1,
                approval_status: 1,
                profile_image: "$img_info.profile_image"
              }
            }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

      // 🔹 Manual users
      {
        $lookup: {
          from: "cln_professionals_manual_retrievals",
          let: {
            user_type: "$user_type",
            user_row_id: "$user_row_id"
          },
          as: "manual_info",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$user_type", 2] },
                    { $eq: ["$user_row_id", "$$user_row_id"] }
                  ]
                }
              }
            },
            {
              $project: {
                full_name: 1,
                email_id: 1,
                profile_image: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },

      // 🔹 Normalize both user types
      {
        $set: {
          user_data: {
            $switch: {
              branches: [
                { case: { $eq: ["$user_type", 1] }, then: "$user_info" },
                { case: { $eq: ["$user_type", 2] }, then: "$manual_info" }
              ],
              default: null
            }
          }
        }
      },

      // 🔹 Only accepted invitations
      {
        $match: {
          user_data: { $ne: null }
        }
      },

      // 🔹 Final shape
      {
        $project: {
          approval_status: { $ifNull: ["$user_data.approval_status", 0] },
          user_name: "$user_data.user_name",
          full_name: "$user_data.full_name",
          pro_batch: "$user_data.pro_batch",
          email_id: "$user_data.email_id",
          profile_image: "$user_data.profile_image"
        }
      }
    ]).sort({ _id: -1 });


    const get_speakers_query = await event_speakersM.aggregate([
      {
        $match: {
          event_row_id: Number(event_row_id),
          $or: [
            { requested_status: { $in: [1, 3] } },
            { requested_status: null }
          ]
        }
      },

      // 🔹 Platform users
      {
        $lookup: {
          from: "cln_professionals",
          let: {
            user_row_id: "$user_row_id",
            user_type: "$user_type"
          },
          as: "user_info",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$user_type", 1] },
                    { $eq: ["$_id", "$$user_row_id"] }
                  ]
                },
                login_status: 1
              }
            },
            {
              $lookup: {
                from: "cln_professionals_profile_images",
                localField: "_id",
                foreignField: "user_row_id",
                as: "img_info"
              }
            },
            {
              $unwind: {
                path: "$img_info",
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                user_name: 1,
                full_name: 1,
                email_id: 1,
                pro_batch: 1,
                approval_status: 1,
                profile_image: "$img_info.profile_image"
              }
            }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

      // 🔹 Manual users
      {
        $lookup: {
          from: "cln_professionals_manual_retrievals",
          let: {
            user_type: "$user_type",
            user_row_id: "$user_row_id"
          },
          as: "manual_info",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$user_type", 2] },
                    { $eq: ["$user_row_id", "$$user_row_id"] }
                  ]
                }
              }
            },
            {
              $project: {
                full_name: 1,
                email_id: 1,
                profile_image: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },

      // 🔹 Normalize user data
      {
        $set: {
          user_data: {
            $switch: {
              branches: [
                { case: { $eq: ["$user_type", 1] }, then: "$user_info" },
                { case: { $eq: ["$user_type", 2] }, then: "$manual_info" }
              ],
              default: null
            }
          }
        }
      },

      { $match: { user_data: { $ne: null } } },

      // 🔹 Final shape
      {
        $project: {
          _id: 1,
          user_row_id: 1,
          user_type: 1,
          approval_status: { $ifNull: ["$user_data.approval_status", 0] },
          user_name: "$user_data.user_name",
          full_name: "$user_data.full_name",
          pro_batch: "$user_data.pro_batch",
          email_id: "$user_data.email_id",
          profile_image: "$user_data.profile_image"
        }
      }
    ]);

    if (get_speakers_query) {
      data.speakers_list = get_speakers_query;
    }


    return res.json({
      status: true,
      message: { alert_message: "Event SEO fetched successfully" },
      data: data
    });

  } catch (err) {
    console.log('Get event seo error:', err.message);
    return res.json({
      status: false,
      message: { alert_message: 'An unexpected error occurred. Please try again later.' },
      err: err.message
    });
  }
});



module.exports = router