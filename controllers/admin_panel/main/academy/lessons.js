const express = require('express')
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const router = express.Router()
const coursesM = require('../../../../models/main/academy/coursesM')
const lessonsM = require('../../../../models/main/academy/lessonsM')
const lessons_bookmarksM = require('../../../../models/main/academy/lessons_bookmarksM')
const chaptersM = require('../../../../models/main/academy/chaptersM')
const quiz_questionsM = require('../../../../models/main/academy/quiz_questionsM')
const quiz_lesson_started_detailsM = require('../../../../models/main/academy/quiz_lesson_started_detailsM')
const users_quiz_answersM = require('../../../../models/main/academy/users_quiz_answersM')

const { getPresentDateTime, arrangeValidation, validateAndSaveImage } = require('../../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../../middleware/authorization')
const professionalsM = require('../../../../models/app/professionalsM')
const courses_certificatesM = require('../../../../models/main/academy/courses_certificatesM')
const { deleteKeysByPattern } = require('../../../../config/cache_helper')


router.get('/courses_list', async (req, res) => {
    const get_query = await coursesM.find({}, { _id: 1, course_name: 1 })

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


router.get('/chapters_list/:course_row_id', async (req, res) => {
    const course_row_id = Number.parseInt(req.params.course_row_id)
    if (!Number.isNaN(course_row_id)) {
        const get_query = await chaptersM.find({ course_row_id: course_row_id }, { _id: 1, title: 1 })

        res.json({
            status: true,
            message: get_query
        })
    }
    else {
        res.json({
            status: false,
            message: {
                alert_message: "Invalid Course Row ID."
            }
        })
    }

})



router.get('/get_lesson', async (req, res) => {
    const get_query = await lessonsM.find()
    res.json({ status: true, message: get_query })
})

const generateLessonUrl = async function (string) {
    try {
        let trimStr = string.trim().toLowerCase();

        let normalized = trimStr.replace(/\s+/g, ' ');

        let hyphenated = normalized.replace(/\s/g, '-');

        let cleaned = hyphenated.replace(/[&/#\\,+()$~%.'":*?<>{}|^]/g, '');

        cleaned = cleaned.replace(/-+/g, '-');

        cleaned = cleaned.replace(/(^-+)|(-+$)/g, '');

        return cleaned;
    } catch (err) {
        console.error('Generate lesson URL error:', err);
        return false;
    }
};



router.post('/add_n_update_details', [
    check('course_row_id')
        .trim().not().isEmpty().withMessage('The Course Row ID field is required.')
        .isInt().withMessage('The Course Row ID field must contain an integer value.'),
    check('lesson_number')
        .trim().not().isEmpty().withMessage('The Lesson Number field is required.')
        .isInt().withMessage('The Lesson Number field must contain only an integer value.'),
    check('title')
        .trim().not().isEmpty().withMessage('The Lesson Title field is required.'),
    check('lesson_image_url')
        .trim().not().isEmpty().withMessage('The Lesson Image URL field is required.'),
    check('description')
        .trim().not().isEmpty().withMessage('The Lesson Description field is required.'),
    check('author_name')
        .trim().not().isEmpty().withMessage('The Lesson Author Name field is required.'),
    check('author_id')
        .trim().not().isEmpty().withMessage('The Lesson Author Id field is required.'),
    check('author_link')
        .trim().not().isEmpty().withMessage('The Lesson Author Link field is required.'),
    check('reviewed_by_name')
        .trim().not().isEmpty().withMessage('The Lesson Reviewed by Name field is required.'),
    check('reviewed_by_id')
        .trim().not().isEmpty().withMessage('The Lesson Reviewed by Id field is required.'),
    check('reviewed_by_link')
        .trim().not().isEmpty().withMessage('The Lesson Reviewed by Link field is required.'),
    check('meta_keywords')
        .trim().not().isEmpty().withMessage('The Meta Keywords field is required.'),
    check('meta_description')
        .trim().not().isEmpty().withMessage('The Meta Description field is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        let errObj = arrangeValidation(errors);
        const checkToken = checkAdminLoginToken(req.headers, [13]);

        if (!checkToken.status) {
            return res.json({
                status: false,
                message: { alert_message: checkToken.message }
            });
        }

        const isUpdate = !!req.body.lesson_row_id;

        // Sanitize and safely parse integers
        let course_row_id = Number.parseInt(sanitize(req.body.course_row_id));
        let author_id = Number.parseInt(sanitize(req.body.author_id));
        let reviewed_by_id = Number.parseInt(sanitize(req.body.reviewed_by_id));
        let lesson_number = Number.parseInt(sanitize(req.body.lesson_number));
        let lesson_row_id = isUpdate ? Number.parseInt(sanitize(req.body.lesson_row_id)) : null;
        const title = req.body.title

        // Check for invalid numbers
        if (Number.isNaN(course_row_id)) errObj['course_row_id'] = 'Invalid Course Row ID.';
        if (Number.isNaN(lesson_number)) errObj['lesson_number'] = 'Invalid Lesson Number.';
        if (Number.isNaN(author_id)) errObj['author_id'] = 'Invalid Author Number.';
        if (Number.isNaN(reviewed_by_id)) errObj['reviewed_by_id'] = 'Invalid Reviewed By Id.';
        if (isUpdate && Number.isNaN(lesson_row_id)) errObj['lesson_row_id'] = 'Invalid Lesson Row ID.';

        // Early return if there are validation errors
        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        // Validate course existence
        const courseExists = await coursesM.findOne({ _id: course_row_id }, { _id: 1 });
        if (!courseExists) {
            errObj['course_row_id'] = 'Invalid Course Row ID.';
        }

        // Validate uniqueness of lesson_id
        let where_lesson_id = { course_row_id, title };
        if (isUpdate) {
            where_lesson_id._id = { $ne: lesson_row_id };
        }
        const existingLessonId = await lessonsM.findOne(where_lesson_id, { _id: 1 });
        if (existingLessonId) {
            errObj['title'] = 'This Lesson already exists.';
        }

        // Validate uniqueness of lesson_number
        let where_lesson_number = { course_row_id, lesson_number };
        if (isUpdate) {
            where_lesson_number._id = { $ne: lesson_row_id };
        }
        const existingLessonNumber = await lessonsM.findOne(where_lesson_number, { _id: 1 });
        if (existingLessonNumber) {
            errObj['lesson_number'] = 'This Lesson Number already exists.';
        }

        // If updating, check that lesson exists
        if (isUpdate) {
            const lessonExists = await lessonsM.findOne({ _id: lesson_row_id });
            if (!lessonExists) {
                errObj['lesson_row_id'] = 'Invalid Lesson Row ID.';
            }
        }

        let lesson_image_url = ""
        if (!Object.keys(errObj).length) {
            if (req.body.lesson_image_url) {
                const validate_n_save_image = await validateAndSaveImage(req.body.lesson_image_url, 9)
                if (!validate_n_save_image.status) {
                    errObj['lesson_image_url'] = 'Sorry, Invalid Lesson image.'
                }
                else {
                    lesson_image_url = validate_n_save_image.webp_file_name
                }
            }
        }

        if (Object.keys(errObj).length > 0) {
            return res.json({ status: false, message: errObj });
        }

        let generateUrl = await generateLessonUrl(req.body.title)

        // Prepare lesson data
        const lessonData = {
            course_row_id,
            lesson_number,
            title: req.body.title,
            description: req.body.description,
            author_name: req.body.author_name,
            author_id: req.body.author_id,
            author_link: req.body.author_link,
            reviewed_by_name: req.body.reviewed_by_name,
            reviewed_by_id: req.body.reviewed_by_id,
            reviewed_by_link: req.body.reviewed_by_link,
            updated_on: getPresentDateTime(),
            lesson_image_url: lesson_image_url,
            lesson_url: generateUrl,
            meta_keywords: req.body.meta_keywords,
            meta_description: req.body.meta_description,
        };

        if (isUpdate) {
            await lessonsM.updateOne({ _id: lesson_row_id }, { $set: lessonData });
            await deleteKeysByPattern('lessons_list_*')
            await deleteKeysByPattern('individual_lesson_*')
            return res.json({
                status: true,
                update_array: lessonData,
                message: { alert_message: "This Lesson details have been updated successfully." }
            });
        } else {
            const saveData = {
                ...lessonData,
                lesson_status: 1,
                date_n_time: getPresentDateTime()
            };
            const saved_lesson = await lessonsM(saveData).save();
            await deleteKeysByPattern('lessons_list_*')
            await deleteKeysByPattern('individual_lesson_*')
            return res.json({
                status: true,
                saveObject: { ...saveData, _id: saved_lesson?._id },
                message: { alert_message: "This Lesson details have been added successfully." }
            });
        }
    } catch (error) {
        console.error("Lesson add/update error:", error);
        return res.json({
            status: false,
            message: { alert_message: error.message || "Server error." }
        });
    }
});



router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

        let query = []
        if (req.query.search) {
            query.push({
                $or: [
                    { course_name: { '$regex': req.query.search, $options: 'i' } },
                    { title: { '$regex': req.query.search, $options: 'i' } },
                ]
            })
        }
        if (req.query.course_row_id) {
            let course_row_id = Number.parseInt(req.query.course_row_id)
            if (!Number.isNaN(course_row_id)) {
                query.push({ course_row_id: course_row_id })
            }
        }

        let filter_query = {}
        if (query.length) {
            filter_query = { $and: query }
        }

        // const get_query = await lessonsM.aggregate([
        //     {
        //         $match: filter_query
        //     },
        //     {
        //         $lookup:
        //         {
        //             from: "cln_academy_courses",
        //             localField: "course_row_id",
        //             foreignField: "_id",
        //             as: "course_info"
        //         }
        //     },
        //     { $unwind: { path: "$course_info", preserveNullAndEmptyArrays: true } },
        //     {
        //         $lookup:
        //         {
        //             from: "cln_academy_courses_chapters",
        //             localField: "chapter_row_id",
        //             foreignField: "_id",
        //             as: "chapter_info"
        //         }
        //     },
        //     { $unwind: { path: "$chapter_info", preserveNullAndEmptyArrays: true } },
        //     {
        //         $lookup:
        //         {
        //             from: "cln_academy_quiz_lession_started_details",
        //             localField: "lesson_id",
        //             foreignField: "lesson_row_id",
        //             as: "participates_info"
        //         }
        //     },
        //     {
        //         $set: {
        //             course_name: "$course_info.course_name",
        //             course_url: "$course_info.course_url",
        //             chapter_title: "$chapter_info.title",
        //             chapter_number: "$chapter_info.chapter_number"
        //         }
        //     },
        //     {
        //         $sort: { course_row_id: 1, chapter_row_id: 1, lesson_number: 1 }
        //     },

        //     {
        //         $lookup:
        //         {
        //             from: "cln_academy_quiz_questions",
        //             localField: "lesson_id",
        //             foreignField: "lesson_row_id",
        //             as: "lessonQuestion"
        //         }
        //     },

        //     {
        //         $project: {
        //             _id: 1,
        //             title: 1,
        //             course_url: 1,
        //             course_name: 1,
        //             chapter_title: "$chapter_info.title",
        //             chapter_number: "$chapter_info.chapter_number",
        //             course_row_id: 1,
        //             chapter_row_id: 1,
        //             date_n_time: 1,
        //             description: 1,
        //             lesson_id: 1,
        //             lesson_image_url: 1,
        //             lesson_number: 1,
        //             lesson_status: 1,
        //             recommended_status: 1,
        //             lesson_url: 1,
        //             total_question: { $size: "$lessonQuestion" },
        //             total_participates: { $size: "$participates_info" },
        //             time_spent:1,
        //             first_answer_time:1,
        //             last_answer_time:1,
        //         }
        //     }
        // ]).skip(skip).limit(limit)

        const get_query = await lessonsM.aggregate([
            { $match: filter_query },
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
                $lookup: {
                    from: "cln_academy_quiz_questions",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    as: "lessonQuestion"
                }
            },
            {
                $lookup: {
                    from: "cln_academy_quiz_lession_started_details",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    as: "participates_info"
                }
            },
            {
                $lookup: {
                    from: "cln_academy_quiz_answers",
                    let: { lesson_id: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$lesson_row_id", "$$lesson_id"] }
                            }
                        },
                        {
                            $group: {
                                _id: { user: "$user_row_id" },
                                startTime: { $min: "$date_n_time" },
                                endTime: { $max: "$date_n_time" }
                            }
                        },
                        {
                            $project: {
                                timeSpentSeconds: {
                                    $divide: [
                                        { $subtract: ["$endTime", "$startTime"] },
                                        1000
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                avgTimeSeconds: { $avg: "$timeSpentSeconds" }
                            }
                        }
                    ],
                    as: "average_time_info"
                }
            },
            {
                $addFields: {
                    time_spent: {
                        $ifNull: [
                            { $arrayElemAt: ["$average_time_info.avgTimeSeconds", 0] },
                            0
                        ]
                    }
                }
            },
            {
                $set: {
                    course_name: "$course_info.course_name",
                    course_url: "$course_info.course_url",
                }
            },
            {
                $sort: { course_row_id: 1, lesson_number: 1 }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    course_url: 1,
                    course_name: 1,
                    course_row_id: 1,
                    date_n_time: 1,
                    description: 1,
                    lesson_image_url: 1,
                    lesson_number: 1,
                    lesson_status: 1,
                    lesson_url: 1,
                    author_name: 1,
                    author_id: 1,
                    author_link: 1,
                    reviewed_by_name: 1,
                    reviewed_by_id: 1,
                    reviewed_by_link: 1,
                    updated_on: 1,
                    total_question: { $size: "$lessonQuestion" },
                    total_participates: { $size: "$participates_info" },
                    time_spent: 1,
                }
            }
        ])
            .skip(skip)
            .limit(limit);



        const count_query = await lessonsM.aggregate([
            {
                $sort: { chapter_number: 1 }
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
                    course_name: "$course_info.course_name",
                }
            },
            {
                $match: filter_query
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



router.get('/details/:lesson_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const lesson_row_id = Number.parseInt(req.params.lesson_row_id)
        if (!Number.isNaN(lesson_row_id)) {
            const get_query = await lessonsM.aggregate([
                { $match: { _id: lesson_row_id } },
                {
                    $lookup: {
                        from: "cln_academy_quiz_questions",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        pipeline: [
                            { $group: { _id: "$lesson_row_id", count: { $sum: 1 } } }
                        ],
                        as: "quiz_question_count"
                    }
                },
                {
                    $addFields: {
                        total_questions_count: {
                            $ifNull: [{ $arrayElemAt: ["$quiz_question_count.count", 0] }, 0]
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        description: 1,
                        lesson_number: 1,
                        lesson_image_url: 1,
                        course_row_id: 1,
                        total_questions_count: 1,
                        author_name: 1,
                        author_id: 1,
                        lesson_url: 1,
                        date_n_time: 1,
                        author_link: 1,
                        reviewed_by_name: 1,
                        reviewed_by_id: 1,
                        reviewed_by_link: 1,
                        meta_description: 1,
                        meta_keywords: 1,
                    }
                }
            ]);

            if (get_query && get_query.length > 0) {
                res.json({
                    status: true,
                    message: get_query[0]
                });
            } else {
                res.json({
                    status: false,
                    message: "Lesson not found"
                });
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Invalid Lesson Row ID."
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


router.get('/details_by_lesson_id/:lesson_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const lesson_id = Number.parseInt(req.params.lesson_id)
        if (!Number.isNaN(lesson_id)) {
            const get_query = await lessonsM.aggregate([
                {
                    $match: { _id: lesson_id }
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
                    $project:
                    {
                        title: 1,
                        lesson_image_url: 1,
                        lesson_number: 1,
                        course_name: "$course_info.course_name",
                        chapter_title: "$chapter_info.title",
                        chapter_number: "$chapter_info.chapter_number"
                    }
                }
            ])

            if (get_query[0]) {
                res.json({
                    status: true,
                    message: get_query[0]
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Invalid Lesson  ID." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Invalid Lesson Row ID."
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


router.get('/issue', async (req, res) => {
    try {
        // Await the result of the database query
        const ans = await professionalsM.find({ user_row_id: 1837 });

        // Check if any data was found
        if (ans.length > 0) {
            res.json({ status: true, message: ans });
        } else {
            res.json({ status: false, message: 'User not found' });
        }
    } catch (error) {
        // Handle any errors that occur during the database query
        res.status(500).json({ status: false, message: 'Internal server error', error: error.message });
    }
});



router.get('/delete/:lesson_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const lesson_row_id = Number.parseInt(req.params.lesson_row_id)
        if (!Number.isNaN(lesson_row_id)) {
            const get_query = await lessonsM.findOne({ _id: lesson_row_id })
            if (get_query) {
                await lessonsM.deleteOne({ _id: lesson_row_id })
                const coinpedia_lesson_id = get_query.lesson_id

                await quiz_lesson_started_detailsM.deleteMany({ lesson_row_id: coinpedia_lesson_id })
                await users_quiz_answersM.deleteMany({ lesson_row_id: coinpedia_lesson_id })
                await deleteKeysByPattern('individual_lesson_*')
                await deleteKeysByPattern('lessons_list_*')


                res.json({
                    status: true,
                    get_query: get_query,

                    message: { alert_message: "This lesson details has been deleted successfully." }
                })
            }
            else {
                res.json({
                    status: false,
                    message: { alert_message: "Invalid lesson row id." }
                })
            }
        }
        else {
            res.json({
                status: false,
                message: {
                    alert_message: "Invalid Lesson Row ID."
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



router.get('/participates_list/:lesson_row_id/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13])
    if (checkToken.status) {
        const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
        const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
        const lesson_row_id = Number.parseInt(req.params.lesson_row_id)

        let query = [{ lesson_row_id: lesson_row_id }]

        if (req.query.date) {
            const inputDate = new Date(req.query.date);
            const start_date = new Date(inputDate);
            start_date.setHours(0, 0, 0, 0);

            const end_date = new Date(inputDate);
            end_date.setHours(23, 59, 59, 999);

            query.push({
                date_n_time: {
                    $gte: start_date,
                    $lte: end_date
                }
            });
        }
        if (req.query.search) {
            query.push({
                $or: [
                    { full_name: { '$regex': req.query.search, $options: 'i' } },
                    { user_name: { '$regex': req.query.search, $options: 'i' } },
                    { email_id: { '$regex': req.query.search, $options: 'i' } },
                    { email_id: { '$regex': req.query.search, $options: 'i' } },
                ]
            })
        }

        if (req.query.quiz_result) {
            let quiz_result = Number.parseInt(req.query.quiz_result);

            if (quiz_result === 1) {
                // Score >= 7
                query.push({ lesson_score: { $gte: 7 } });
            } else if (quiz_result === 2) {
                // Score < 7
                query.push({ lesson_score: { $lt: 7 } });
            }
        }


        // Completion status filter 0 //not completed //1:completed 
        if (req.query.lesson_status) {
            const status = Number.parseInt(req.query.lesson_status);
            if (status === 1) {
                query.push({ lesson_status: 1 }); // completed
            } else if (status === 2) {
                query.push({ lesson_status: 0 }); // pending
            }
        }
        let filter_query = {}
        if (query.length > 0) {
            filter_query = { $and: query }
        }

        const get_query = await quiz_lesson_started_detailsM.aggregate([
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
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
                            $project: {
                                _id: 1,
                                user_info: "$user_info",
                                full_name: 1,
                                pro_batch: 1,
                                user_name: 1,
                                email_id: 1,
                                wallet_address: 1,
                                profile_image: "$img_info.profile_image",
                            }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup:
                {
                    from: "cln_academy_quiz_answers",
                    localField: "_id",
                    foreignField: "lesson_started_row_id", //coinpedia article row id
                    as: "lessonAns",
                    pipeline: [{
                        $match: {
                            answer_status: true
                        }
                    }]
                }
            },
            {
                $set: {
                    full_name: "$user_info.full_name",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    pro_batch: "$user_info.pro_batch",
                    wallet_address: "$user_info.wallet_address"
                }
            },
            {
                $sort: { _id: -1 }
            },
            {
                $match: filter_query
            },
            {
                $project: {
                    _id: 1,
                    full_name: 1,
                    user_name: 1,
                    email_id: 1,
                    pro_batch: 1,
                    wallet_address: 1,
                    lesson_status: 1,
                    user_info: "$user_info",
                    lesson_score: { $size: "$lessonAns" },
                    lessonAns: "$lessonAns",
                    date_n_time: 1,
                    mobile_number: "$user_info.mobile_number",
                    profile_image: "$user_info.profile_image"
                }
            }
        ]).skip(skip).limit(limit)


        const count_query = await quiz_lesson_started_detailsM.aggregate([
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
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
                            $project: {
                                _id: 1,
                                full_name: 1,
                                pro_batch: 1,
                                user_name: 1,
                                email_id: 1,
                                wallet_address: 1,
                                mobile_number: 1,
                                profile_image: "$img_info.profile_image",
                            }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
            },
            {
                $set: {
                    full_name: "$user_info.full_name",
                    pro_batch: "$user_info.pro_batch",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    wallet_address: "$user_info.wallet_address"
                }
            },
            {
                $sort: { _id: -1 }
            },
            {
                $match: filter_query
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

router.get('/participates_question_count/:participated_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13]);
    if (!checkToken.status) {
        return res.json({ status: false, message: { alert_message: checkToken.message } });
    }

    const participated_row_id = Number.parseInt(req.params.participated_row_id);
    if (Number.isNaN(participated_row_id)) {
        return res.json({ status: false, message: { alert_message: "Invalid Lesson Row ID." } });
    }

    try {
        const count_query = await users_quiz_answersM.aggregate([
            {
                $match: { lesson_started_row_id: participated_row_id }
            },
            {
                $lookup: {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info",
                    pipeline: [
                        {
                            $lookup: {
                                from: "cln_professionals_profile_images",
                                localField: "user_row_id",
                                foreignField: "_id",
                                as: "img_info"
                            }
                        },
                        {
                            $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true }
                        },
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                pro_batch: 1,
                                user_name: 1,
                                email_id: 1,
                                mobile_number: 1,
                                profile_image: "$img_info.profile_image"
                            }
                        }
                    ]
                }
            },
            {
                $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
            },

            {
                $lookup: {
                    from: "cln_academy_quiz_questions",
                    localField: "question_row_id",
                    foreignField: "_id",
                    as: "question_details"
                }
            },
            {
                $unwind: {
                    path: "$question_details",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    answer_number: 1,
                    correct_answer: { $toInt: "$question_details.correct_answer" },
                    user_info: {
                        _id: "$user_info._id",
                        full_name: "$user_info.full_name",
                        pro_batch: "$user_info.pro_batch",
                        user_name: "$user_info.user_name",
                        email_id: "$user_info.email_id",
                        mobile_number: "$user_info.mobile_number",
                        profile_image: "$user_info.profile_image"
                    }
                }
            },
            {
                $group: {
                    _id: "$user_info",
                    total_questions: { $sum: 1 },
                    correct_answers: {
                        $sum: {
                            $cond: [
                                { $eq: ["$answer_number", "$correct_answer"] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    user_info: "$_id",
                    total_questions: 1,
                    correct_answers: 1,
                    incorrect_answers: { $subtract: ["$total_questions", "$correct_answers"] },
                    result_status: {
                        $cond: {
                            if: { $gte: ["$correct_answers", 7] },
                            then: 1,
                            else: 0
                        }
                    }
                }
            }
        ]);

        res.json({
            status: true,
            message: count_query[0] || {
                total_questions: 0,
                correct_answers: 0,
                incorrect_answers: 0,
                result_status: 0,
                user_info: null
            }
        });
    } catch (err) {
        res.json({
            status: false,
            message: { alert_message: "Aggregation Error", error: err.message }
        });
    }
});



router.get('/participates_question_list/:participated_row_id', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [13]);
    if (!checkToken.status) {
        return res.json({ status: false, message: { alert_message: checkToken.message } });
    }

    const participated_row_id = Number.parseInt(req.params.participated_row_id);
    if (Number.isNaN(participated_row_id)) {
        return res.json({ status: false, message: { alert_message: "Invalid Lesson Row ID." } });
    }

    const search_query = [{ lesson_started_row_id: participated_row_id }];


    const filter_query = search_query.length > 0 ? { $and: search_query } : search_query[0];
    const base_pipeline = [
        { $match: filter_query },
        {
            $lookup: {
                from: "cln_academy_quiz_questions",
                localField: "question_row_id",
                foreignField: "_id",
                as: "question_details"
            }
        },
        { $unwind: { path: "$question_details", preserveNullAndEmptyArrays: true } },

        {
            $addFields: {
                answer_status: {
                    $cond: {
                        if: { $eq: ["$answer_number", "$question_details.correct_answer"] },
                        then: true,
                        else: false
                    }
                },
                timeout_status: {
                    $cond: {
                        if: { $in: ["$answer_number", [null, false, "", 0]] },
                        then: true,
                        else: false
                    }
                }
            }
        }
    ];


    if (req.query.search) {
        base_pipeline.push({
            $match: {
                "question_details.question_title": { '$regex': req.query.search, $options: 'i' }
            }
        });
    }
    if (req.query.answer_value) {
        const answerFilter = Number.parseInt(req.query.answer_value);
        if (answerFilter === 1) {
            base_pipeline.push({ $match: { answer_status: true, timeout_status: false } });
        } else if (answerFilter === 2) {
            base_pipeline.push({ $match: { answer_status: false, timeout_status: false } });
        } else if (answerFilter === 3) {
            base_pipeline.push({ $match: { answer_status: false, timeout_status: true } });
        }
    }

    base_pipeline.push({
        $project: {
            user_row_id: 1,
            lesson_started_row_id: 1,
            question_row_id: 1,
            answer_number: 1,
            close_status: 1,
            date_n_time: 1,
            question_title: "$question_details.question_title",
            option_a: "$question_details.option_a",
            option_b: "$question_details.option_b",
            option_c: "$question_details.option_c",
            option_d: "$question_details.option_d",
            correct_answer: "$question_details.correct_answer",
            answer_status: 1,
            timeout_status: 1
        }
    });

    const list_query = await users_quiz_answersM.aggregate(base_pipeline);
    const count_query = await users_quiz_answersM.aggregate([
        {
            $match: { lesson_started_row_id: participated_row_id }
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
                        $project: {
                            _id: 1,
                            full_name: 1,
                            pro_batch: 1,
                            user_name: 1,
                            email_id: 1,
                            wallet_address: 1,
                            mobile_number: 1,
                            profile_image: "$img_info.profile_image",
                        }
                    }
                ]
            }
        },
        {
            $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true }
        },

        {
            $lookup: {
                from: "cln_academy_quiz_questions",
                localField: "question_row_id",
                foreignField: "_id",
                as: "question_details"
            }
        },
        {
            $unwind: {
                path: "$question_details",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                answer_number: 1,
                correct_answer: { $toInt: "$question_details.correct_answer" },
                user_info: {
                    _id: "$user_info._id",
                    full_name: "$user_info.full_name",
                    pro_batch: "$user_info.pro_batch",
                    user_name: "$user_info.user_name",
                    email_id: "$user_info.email_id",
                    mobile_number: "$user_info.mobile_number",
                    profile_image: "$user_info.profile_image"
                }
            }
        },
        {
            $group: {
                _id: "$user_info",
                total_questions: { $sum: 1 },
                correct_answers: {
                    $sum: {
                        $cond: [
                            { $eq: ["$answer_number", "$correct_answer"] },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                user_info: "$_id",
                total_questions: 1,
                correct_answers: 1,
                incorrect_answers: { $subtract: ["$total_questions", "$correct_answers"] },
                result_status: {
                    $cond: {
                        if: { $gte: ["$correct_answers", 7] },
                        then: 1,
                        else: 0
                    }
                }
            }
        }
    ]);
    res.json({
        status: true,
        question_details: list_query,
        count_query: count_query,

    });
});




module.exports = router