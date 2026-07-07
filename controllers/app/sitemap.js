const express = require('express')
const router = express.Router()

const { daysMinusFromPresentTime, getPresentDateTime } = require('../../utils/helpers/helper')

const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const eventM = require('../../models/app/events/eventM')
const deleted_eventsM = require('../../models/app/events/deleted_eventsM')
const coursesM = require('../../models/main/academy/coursesM')
const lessonsM = require('../../models/main/academy/lessonsM')
const community_postsM = require('../../models/main/community/community_postsM')

router.get('/user/:skip/:limit', async (req, res) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

    const getData = await professionalsM.find({
      login_status: 1,
      approval_status: 1,
      user_name: { $exists: true }
    }, { user_name: 1, updated_date_n_time: 1, _id: 1 }).skip(skip).limit(limit).sort({ updated_date_n_time: -1 })

    // If updated_date_n_time is not available, use current date
    const processedData = getData.map(user => ({
      user_name: user.user_name,
      updated_date_n_time: user.updated_date_n_time || new Date(),
      _id: user._id
    }))

    const count_query = await professionalsM.countDocuments({
      login_status: 1,
      approval_status: 1,
      user_name: { $exists: true }
    })

    res.json({ status: true, message: processedData, count: count_query })
  }
  catch (err) {
    console.log('All Users list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', error: err.message })
  }
})

router.get('/company/:skip/:limit', async (req, res) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

    const getData = await companyM.aggregate([
      {
        $match: { approval_status: 1, active_status: 1 }
      },
      {
        $sort: { updated_date_n_time: -1 }
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
              $match: {
                login_status: { $ne: 1 }
              }
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
      {
        $match: {
          login_status: 1
        }
      },
      {
        $set: {
          updated_date_n_time: { $ifNull: ["$updated_date_n_time", new Date()] }
        }
      },
      {
        $project: {
          company_id: 1,
          updated_date_n_time: 1
        }
      }
    ]).skip(skip).limit(limit)


    const count_query = await companyM.aggregate([
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
              $match: {
                login_status: { $ne: 1 }
              }
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
      {
        $match: {
          login_status: 1
        }
      },
      {
        $count: "count"
      }
    ])

    let total_counts = 0
    if (count_query[0]) {
      total_counts = count_query[0].count
    }

    // const getData = await companyM.find({approval_status:1, active_status:1},{company_id:1, updated_date_n_time:1}).skip(skip).limit(limit).sort({updated_date_n_time:-1})
    //const count_query = await companyM.countDocuments({approval_status:1, active_status:1})

    res.json({ status: true, message: getData, count: total_counts })
  }
  catch (err) {
    console.log('All companies.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})



router.get('/events', async (req, res) => {
  try {
    const date_n_time = getPresentDateTime()

    const getData = await eventM.find({ active_status: 1, approval_status: 1, end_date: { $gte: new Date(date_n_time) } }, { event_url: 1, updated_date_n_time: 1, _id: 1 }).sort({ _id: -1 })

    // If updated_date_n_time is not available, use current date
    const processedData = getData.map(event => ({
      event_url: event.event_url,
      updated_date_n_time: event.updated_date_n_time || new Date(),
      _id: event._id
    }))

    res.json({ status: true, message: processedData })
  }
  catch (err) {
    console.log('All events.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

router.get('/events_past', async (req, res) => {
  try {
    const date_n_time = getPresentDateTime()
    const before_day_date_n_time = daysMinusFromPresentTime(7)

    const getData = await eventM.find({ active_status: 1, approval_status: 1, end_date: { $lte: new Date(date_n_time), $gte: new Date(before_day_date_n_time) } }, { event_url: 1, updated_date_n_time: 1, _id: 1, end_date: 1 }).sort({ end_date: 1 })

    // If updated_date_n_time is not available, use current date
    const processedData = getData.map(event => ({
      event_url: event.event_url,
      updated_date_n_time: event.updated_date_n_time || new Date(),
      _id: event._id,
      end_date: event.end_date
    }))

    res.json({ status: true, message: processedData })
  }
  catch (err) {
    console.log('Past events.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

router.get('/events_disabled', async (req, res) => {
  try {
    const getData = await eventM.find({ active_status: 0 }, { event_url: 1, updated_date_n_time: 1, _id: 1 }).sort({ _id: -1 })

    // If updated_date_n_time is not available, use current date
    const processedData = getData.map(event => ({
      event_url: event.event_url,
      updated_date_n_time: event.updated_date_n_time || new Date(),
      _id: event._id
    }))

    res.json({ status: true, message: processedData })
  }
  catch (err) {
    console.log('Events disabled list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

router.get('/events_deleted', async (req, res) => {
  try {
    const getData = await deleted_eventsM.find({}, { event_url: 1, date_n_time: 1, _id: 0 }).sort({ _id: -1 })
    res.json({ status: true, message: getData })
  }
  catch (err) {
    console.log('Events deleted list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})



router.get('/course_list', async (req, res) => {
  try {
    const getData = await coursesM.find({}, { course_slug: 1, date_n_time: 1, _id: 0 }).sort({ _id: -1 })
    res.json({ status: true, message: getData })
  }
  catch (err) {
    console.log('Events deleted list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
router.get('/lesson_list', async (req, res) => {
  try {
    const getData = await lessonsM.aggregate([
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
          _id: 0,
          lesson_url: 1,
          date_n_time: 1,
          course_url: "$course_info.course_slug"
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.json({ status: true, message: getData });
  }
  catch (err) {
    console.log("Lesson list error:", err.message);
    res.json({ status: false, message: "An unexpected error occurred. Please try again later." });
  }
});

router.get('/post_list/:skip/:limit', async (req, res) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
    const getData = await community_postsM.find({ post_status: true }, { _id: 1, updatedAt: 1 }).sort({ _id: -1 }).skip(skip).limit(limit)
    res.json({ status: true, message: getData })
  }
  catch (err) {
    console.log('Events deleted list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})





module.exports = router