const express = require("express");
const router = express.Router();
const sanitize = require("mongo-sanitize");
const professionalsM = require("../../models/app/professionalsM");
const companyM = require("../../models/app/company/companyM");
const eventM = require("../../models/app/events/eventM");
const followersM = require("../../models/app/company/followersM");
const { setCache, getCache } = require("../../config/cache_helper");
const { checkUserLoginToken } = require("../../middleware/authorization");
const { getSearchDetails } = require("../../services/search");


router.get('/', async (req, res) => {
  try {
    const search_value = sanitize(req.query.search);
    const search_type = sanitize(req.query.search_type);
    let user_row_id = 0
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
      user_row_id = checkUserToken.message
    }



    const result = await getSearchDetails(search_value, search_type, user_row_id, checkUserToken);

    return res.json(result);
  } catch (err) {
    console.error("Search error:", err.message);
    res.json({
      status: false,
      message: "An unexpected error occurred. Please try again later.",
      error: err.message,
    });
  }
});





router.get("/global", async (req, res) => {
  try {
    let search_type;
    let count_query;

    let count;
    const limit = 10;
    let user_row_id = 0;

    const search_value = sanitize(req.query.search_value);
    //santize and type cast search_type
    search_type = Number.parseInt(req.query.search_type);

    //professional =1 companies =2 events =3

    if (search_value && search_type) {
      let resArray = {};
      const search_type_index = [1, 2, 3];

      if (search_type_index.includes(search_type)) {
        if (search_type === 1) {
          resArray = await professionalsM.aggregate([
            {
              $match: {
                $and: [
                  { login_status: 1, approval_status: 1 },
                  {
                    $or: [
                      { full_name: { $regex: search_value, $options: "i" } },
                      { user_name: { $regex: search_value, $options: "i" } },
                    ],
                  },
                ],
              },
            },
            { $sort: { _id: -1 } },
            {
              $lookup: {
                from: "cln_professionals_profile_images",
                localField: "_id",
                foreignField: "user_row_id",
                as: "img_info",
              },
            },
            {
              $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true },
            },
            {
              $lookup: {
                from: "cln_professionals_followers",
                localField: "_id",
                foreignField: "following_user_row_id",
                as: "user_followed",
              },
            },
            {
              $unwind: {
                path: "$user_followed",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "cln_static_user_designations",
                localField: "designation_id",
                foreignField: "_id",
                as: "user_designation_info",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      designation_name: 1,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: "$user_designation_info",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                user_name: 1,
                full_name: 1,
                pro_batch: 1,
                profile_image: "$img_info.profile_image",
                user_followed_status: {
                  $cond: {
                    if: "$user_followed.confirm_request_status",
                    then: "$user_followed.confirm_request_status",
                    else: 0,
                  },
                },
                designation_name: "$user_designation_info.designation_name",
              },
            },
            { $limit: limit },
          ]);

          count = resArray.length;
        }
        if (search_type === 2) {
          resArray = await companyM.aggregate([
            {
              $match: {
                $and: [
                  { approval_status: 1, active_status: 1 },
                  {
                    $or: [
                      { company_name: { $regex: search_value, $options: "i" } },
                      { company_id: { $regex: search_value, $options: "i" } },
                    ],
                  },
                ],
              },
            },
            { $sort: { _id: -1 } },
            { $limit: limit },
            {
              $lookup: {
                from: "cln_static_countries",
                localField: "country_id",
                foreignField: "_id",
                as: "country_info",
              },
            },
            {
              $unwind: {
                path: "$country_info",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "cln_company_followers",
                localField: "_id",
                foreignField: "company_row_id",
                pipeline: [{ $match: { user_row_id: user_row_id } }],
                as: "user_followed",
              },
            },
            {
              $unwind: {
                path: "$user_followed",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                company_name: 1,
                company_id: 1,
                company_logo: 1,
                company_location: 1,
                country_name: "$country_info.country_name",
                user_followed_status: {
                  $cond: { if: "$user_followed.user_row_id", then: 1, else: 0 },
                },
              },
            },
          ]);

          count = resArray.length;
        }
        if (search_type === 3) {
          resArray = await eventM.aggregate([
            {
              $match: {
                event_title: { $regex: search_value, $options: "i" },
              },
            },
            {
              $lookup: {
                from: "cln_event_watchlists",
                localField: "_id",
                foreignField: "event_row_id",
                pipeline: [{ $match: { user_row_id: user_row_id } }],
                as: "user_watchlist",
              },
            },
            {
              $unwind: {
                path: "$user_watchlist",
                preserveNullAndEmptyArrays: true,
              },
            },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                event_title: 1,
                event_type: 1,
                event_image: 1,
                event_city: 1,
                event_state: 1,
                event_venue: 1,
                start_date: 1,
                end_date: 1,
                event_price: 1,
                event_url: 1,
                watchlist_status: {
                  $cond: {
                    if: "$user_watchlist.user_row_id",
                    then: 1,
                    else: 0,
                  },
                },
              },
            },
          ]);

          count = resArray.length;
        }

        res.json({
          status: true,
          message: { count, resArray },
        });
      } else {
        res.json({
          status: false,
          message: "Provide valid search_type between 1-3",
        });
      }
    } else {
      res.json({
        status: false,
        message: "Provide search_value and search_type",
      });
    }
  } catch (err) {
    res.json({
      status: false,
      message: "An unexpected error occurred. Please try again later.",
      error: err.message,
    });
  }
});

module.exports = router;
