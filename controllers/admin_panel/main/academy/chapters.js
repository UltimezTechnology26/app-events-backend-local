const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()
const chaptersM = require('../../../../models/main/academy/chaptersM')
const coursesM = require('../../../../models/main/academy/coursesM')
const lessonsM = require('../../../../models/main/academy/lessonsM')
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')


router.get('/courses_list', async (req, res) => {
    const get_query = await coursesM.find({}, { _id: 1, course_name: 1, course_url: 1 }).sort({ course_name: 1 })

    res.json({
        status: true,
        message: get_query
    })
})

router.post('/add_n_update_details', [
    check('course_row_id')
        .trim().not().isEmpty().withMessage('The Course Row ID field is required.')
        .isInt().withMessage('The Course Row ID field must be contain only numbers.'),
    check('chapter_number')
        .trim().not().isEmpty().withMessage('The Chapter Number field is required.')
        .isInt().withMessage('The Chapter Number field must be contain only numbers.'),
    check('title')
        .trim().not().isEmpty().withMessage('The title field is required.'),
    check('description')
        .trim().not().isEmpty().withMessage('The description field is required.')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        let chapter_row_id = ""
        if (req.body.chapter_row_id) {
            chapter_row_id = Number.parseInt(req.body.chapter_row_id)
            if (Number.isNaN(chapter_row_id)) {
                errObj['chapter_row_id'] = 'Sorry, Invalid Chapter Row ID.'
            }
            else {
                const check_chapter_query = await chaptersM.findOne({ _id: chapter_row_id })
                if (!check_chapter_query) {
                    errObj['chapter_row_id'] = 'Sorry, Invalid Chapter Row ID.'
                }
            }
        }
        let course_row_id = ""
        if (req.body.course_row_id) {
            course_row_id = Number.parseInt(req.body.course_row_id)
            if (Number.isNaN(course_row_id)) {
                errObj['course_row_id'] = 'Sorry, Invalid Course Row ID.'
            }
            else {
                const check_course_query = await coursesM.findOne({ _id: course_row_id }, { _id: 1 })
                if (!check_course_query) {
                    errObj['course_row_id'] = 'Sorry, Invalid Course Row ID.'
                }
                else if (req.body.chapter_number) {
                    let chapter_number = Number.parseInt(req.body.chapter_number)
                    if (Number.isNaN(chapter_number)) {
                        errObj['chapter_number'] = 'Sorry, Invalid Chapter Number'
                    }
                    else {
                        let where_chapter_number = { chapter_number: req.body.chapter_number, course_row_id: course_row_id }
                        if (chapter_row_id) {
                            where_chapter_number = { chapter_number: req.body.chapter_number, course_row_id: course_row_id, _id: { $ne: chapter_row_id } }
                        }

                        const check_chapter_number_query = await chaptersM.findOne(where_chapter_number, { _id: 1 })
                        if (check_chapter_number_query) {
                            errObj['chapter_number'] = 'Sorry, This Chapter Number already exists.'
                        }
                    }
                }
            }
        }




        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else if (chapter_row_id) {
            const update_array = {
                course_row_id: req.body.course_row_id,
                chapter_number: req.body.chapter_number,
                title: req.body.title,
                description: req.body.description
            }
            await chaptersM.updateOne({ _id: chapter_row_id }, { $set: update_array })

            res.json({
                status: true,
                message: { alert_message: "This Chapter details has been updated successfully." }
            })
        }
        else {
            const saveObject = {
                course_row_id: req.body.course_row_id,
                chapter_number: req.body.chapter_number,
                title: req.body.title,
                description: req.body.description,
                date_n_time: getPresentDateTime()
            }
            await chaptersM(saveObject).save()

            res.json({
                status: true,
                message: { alert_message: "This Chapter details has been added successfully." }
            })
        }
    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})



router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        const search_array = [];
        if (req.query.date) {
            const inputDate = new Date(req.query.date);
            const start_date = new Date(inputDate);
            start_date.setHours(0, 0, 0, 0);

            const end_date = new Date(inputDate);
            end_date.setHours(23, 59, 59, 999);

            search_array.push({ date_n_time: { $gte: start_date, $lte: end_date } });
        }

        if (req.query.search) {
            search_array.push({
                $or: [
                    { course_name: { '$regex': req.query.search, $options: 'i' } },
                    { title: { '$regex': req.query.search, $options: 'i' } }
                ]
            })
        }
        if (req.query.course_row_id) {
            let course_row_id = Number.parseInt(req.query.course_row_id)
            if (!Number.isNaN(course_row_id)) {
                search_array.push({ course_row_id: course_row_id })
            }
        }

        const search_query = search_array.length > 0 ? { $and: search_array } : {}
        const get_query = await chaptersM.aggregate([

            {
                $sort: { chapter_number: 1, _id: -1 }
            },
            {
                $lookup:
                {
                    from: "cln_academy_courses",
                    localField: "course_row_id",
                    foreignField: "_id",
                    as: "course_info"
                }
            },
            { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    course_name: "$course_info.course_name"
                }
            },
            {
                $match: search_query
            },
            {
                $project: {
                    _id: 1,
                    course_name: "$course_info.course_name",
                    chapter_number: 1,
                    course_row_id: 1,
                    title: 1,
                    description: 1,
                    chapter_status: 1,
                    date_n_time: 1
                }
            }
        ]).skip(skip).limit(limit)
        const count_query = await chaptersM.aggregate([
            {
                $sort: { chapter_number: 1, _id: -1 }
            },
            {
                $lookup:
                {
                    from: "cln_academy_courses",
                    localField: "course_row_id",
                    foreignField: "_id",
                    as: "course_info"
                }
            },
            { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
            {
                $set: {
                    course_name: "$course_info.course_name"
                }
            },
            {
                $match: search_query
            },
            {
                $count: "count"
            }
        ])

        let count = 0
        if (count_query[0]) {
            count = count_query[0].count
        }

        res.json({
            status: true,
            count: count,
            message: get_query
        })
    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})


router.get('/details/:chapter_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const chapter_row_id = Number.parseInt(req.params.chapter_row_id)
        if (!Number.isNaN(chapter_row_id)) {
            const get_query = await chaptersM.findOne({ _id: chapter_row_id })
            if (get_query) {
                res.json({
                    status: true,
                    message: get_query
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid Chapter row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid Course Row ID."
                }
            })
        }
    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})



router.get('/delete/:chapter_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const chapter_row_id = Number.parseInt(req.params.chapter_row_id)
        if (!Number.isNaN(chapter_row_id)) {
            const get_query = await chaptersM.findOne({ _id: chapter_row_id })
            if (get_query) {

                const get_lessons_query = await lessonsM.findOne({ chapter_row_id: chapter_row_id })
                if (!get_lessons_query) {
                    await chaptersM.deleteOne({ _id: chapter_row_id })

                    res.json({
                        status: true,
                        message: { alert_message: "This chapter details has been deleted successfully." }
                    })
                }
                else {

                    res.json({
                        status: false,
                        message: { alert_message: "Sorry, This chapter can't delete beacuse its used in some lessons." }
                    })
                }


            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Sorry, Invalid chapter row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Sorry, Invalid chapter Row ID."
                }
            })
        }

    }
    else {
        res.json({
            status: false,
            message: { alert_message: checkToken.message }
        })
    }
})

module.exports = router