import coursesM from "../../models/main/academy/coursesM";
import lessonsM from "../../models/main/academy/lessonsM";
import redisCache, { CacheDuration } from "../../config/redis";
import { checkUserLoginToken } from "../../middleware/authorization";
import { getScoreRanges, updateStreakDetails } from "../../utils/helpers/academy_helper";
import quiz_questionsM from "../../models/main/academy/quiz_questionsM";
import quiz_not_complete_remaindersM from "../../models/main/academy/quiz_not_complete_remaindersM";
import quiz_lesson_started_detailsM from "../../models/main/academy/quiz_lesson_started_detailsM";
import { getPresentDateTime } from "../../utils/helpers/helper";

export const getLessonsList = async (course_slug: string, skip: number, limit: number, search?: string, quiz_type?: string, headers?: any) => {
    try {
        // Input validation
        const validatedSkip = Math.max(0, Number.parseInt(skip.toString()) || 0);
        const validatedLimit = Math.min(100, Math.max(1, Number.parseInt(limit.toString()) || 10));

        let user_row_id = "";
        const checkToken = checkUserLoginToken(headers);
        if (checkToken.status) {
            user_row_id = checkToken.message;
        }

        // Build search conditions
        const searchConditions: any[] = [];

        if (search?.trim()) {
            const searchRegex = { $regex: search.trim(), $options: 'i' };
            searchConditions.push({
                $or: [
                    { title: searchRegex },
                    { author_name: searchRegex },
                    { lesson_url: searchRegex }
                ]
            });
        }

        if (quiz_type) {
            const quizTypeNum = Number.parseInt(quiz_type);
            if (quizTypeNum > 0 && quizTypeNum <= 4) {
                const quizTypeObject = getScoreRanges(quizTypeNum);
                searchConditions.push(quizTypeObject);
            }
        }

        const searchQuery = searchConditions.length > 0 ? { $and: searchConditions } : {};
        const cacheKey = `lessons_list_${course_slug}_${validatedSkip}_${validatedLimit}_${search || 'all'}_${quiz_type || 'all'}_${user_row_id || 'guest'}`;

        // Check cache first
        const cache_response = await redisCache.getCache({ key: cacheKey });
        if (cache_response.status) {
            return {
                status: true,
                ...cache_response.message,
                cache_response_status: true
            };
        }

        // Find course by slug
        const course = await coursesM.findOne(
            { course_slug },
            { _id: 1, course_name: 1, course_description: 1, meta_description: 1, meta_keywords: 1 }
        );

        if (!course) {
            return {
                status: false,
                message: "Course not found."
            };
        }

        const course_row_id = course._id;

        // Main aggregation query for lessons
        const get_query = lessonsM.aggregate([
            { $match: { course_row_id: course_row_id } },
            { $sort: { lesson_number: 1 } },
            {
                $lookup: {
                    from: "cln_academy_quiz_lession_started_details",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    pipeline: [
                        { $match: { user_row_id: user_row_id } }
                    ],
                    as: "lessonInfo"
                }
            },
            { $unwind: { path: "$lessonInfo", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_academy_quiz_questions",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    pipeline: [
                        {
                            $group: {
                                _id: '$lesson_row_id',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    as: "lessonQues"
                }
            },
            {
                $lookup: {
                    from: "cln_academy_quiz_answers",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    pipeline: [
                        { $match: { user_row_id: user_row_id, answer_status: true } },
                        {
                            $group: {
                                _id: null,
                                total_correct_answers: { $sum: 1 }
                            }
                        }
                    ],
                    as: "lessonAns"
                }
            },
            {
                $lookup: {
                    from: "cln_academy_quiz_answers",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    pipeline: [
                        { $match: { user_row_id: user_row_id } },
                        { $project: { close_status: 1, answer_number: 1 } }
                    ],
                    as: "lessoncompleted"
                }
            },
            {
                $addFields: {
                    total_correct_answers: {
                        $cond: {
                            if: { $not: ["$lessonInfo"] },
                            then: null,
                            else: {
                                $ifNull: [{ $arrayElemAt: ['$lessonAns.total_correct_answers', 0] }, 0]
                            }
                        }
                    },
                    total_questions_count: {
                        $ifNull: [{ $arrayElemAt: ['$lessonQues.count', 0] }, 0]
                    },
                    close_status_array: {
                        $reduce: {
                            input: {
                                $map: {
                                    input: "$lessoncompleted.close_status",
                                    as: "cs",
                                    in: {
                                        $cond: {
                                            if: { $isArray: "$$cs" },
                                            then: "$$cs",
                                            else: ["$$cs"]
                                        }
                                    }
                                }
                            },
                            initialValue: [],
                            in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] }
                        }
                    },
                    answer_number_array: {
                        $reduce: {
                            input: {
                                $map: {
                                    input: "$lessoncompleted.answer_number",
                                    as: "an",
                                    in: {
                                        $cond: {
                                            if: { $isArray: "$$an" },
                                            then: "$$an",
                                            else: ["$$an"]
                                        }
                                    }
                                }
                            },
                            initialValue: [],
                            in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] }
                        }
                    }
                }
            },
            {
                $match: {
                    total_questions_count: { $gte: 10 }
                }
            },
            { $match: searchQuery },
            {
                $project: {
                    _id: 1,
                    lesson_number: 1,
                    course_name: 1,
                    course_slug: course_slug,
                    course_row_id: 1,
                    lesson_id: 1,
                    author_id: 1,
                    title: 1,
                    date_n_time: 1,
                    description: 1,
                    author_name: 1,
                    author_link: 1,
                    reviewed_by_name: 1,
                    reviewed_by_id: 1,
                    reviewed_by_link: 1,
                    updated_on: 1,
                    lesson_image_url: 1,
                    lesson_url: 1,
                    total_correct_answers: 1,
                    total_questions_count: 1,
                    lesson_completed_status: {
                        $cond: {
                            if: { $gte: ["$total_correct_answers", 7] },
                            then: 1,
                            else: 0
                        }
                    }
                }
            }
        ]).skip(validatedSkip).limit(validatedLimit);

        // Count query for pagination
        const count_query = lessonsM.aggregate([
            { $match: { course_row_id: course_row_id } },
            {
                $lookup: {
                    from: "cln_academy_quiz_questions",
                    localField: "_id",
                    foreignField: "lesson_row_id",
                    pipeline: [
                        {
                            $group: {
                                _id: '$lesson_row_id',
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
                        $ifNull: [{ $arrayElemAt: ['$lessonQues.count', 0] }, 0]
                    }
                }
            },
            {
                $match: {
                    total_questions_count: { $gte: 10 }
                }
            },
            { $match: searchQuery },
            { $count: 'count' }
        ]);

        const [result1, result2] = await Promise.all([get_query, count_query]);

        // Process results to add ongoing status
        let found_ongoing = false;
        const final_results = result1.map((doc: any) => {
            if (!found_ongoing && doc.lesson_completed_status === 0) {
                found_ongoing = true;
                return { ...doc, ongoing_status: user_row_id ? 1 : null };
            }
            return { ...doc, ongoing_status: 0 };
        });

        let total_counts = 0;
        if (result2[0]) {
            total_counts = result2[0].count;
        }

        const responsePayload = {
            status: true,
            message: final_results,
            count: total_counts,
            course_name: course?.course_name,
            course_meta_keywords: course?.meta_keywords,
            course_meta_description: course?.meta_description,
            course_description: course?.course_description,
            course_id: course._id
        };

        // Cache the result
        await redisCache.setCache({ key: cacheKey, value: responsePayload, ttl: CacheDuration.TWELVE_HOURS });

        return {
            ...responsePayload,
            cache_response_status: false
        };

    } catch (error: any) {
        console.error('Lessons list error:', error.message);
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: error.message
        };
    }
};


const setRemainderEmail = async (user_row_id: string, course_row_id: number, lesson_row_id: string) => {
    let insert_array: any = {}
    insert_array['course_row_id'] = course_row_id
    insert_array['lesson_row_id'] = lesson_row_id
    const check_question_query = await quiz_questionsM.findOne(insert_array)
    if (check_question_query) {
        insert_array['user_row_id'] = user_row_id
        const check_query = await quiz_not_complete_remaindersM.findOne(insert_array)
        if (!check_query) {
            const lesson_started_query = await quiz_lesson_started_detailsM.findOne(insert_array)
            if (!lesson_started_query) {
                const quiz_not_complete_query = await quiz_not_complete_remaindersM.countDocuments({ user_row_id: user_row_id, email_sent_status: false })
                if (!quiz_not_complete_query) {
                    insert_array['date_n_time'] = getPresentDateTime()
                    insert_array['email_sent_status'] = false
                    await quiz_not_complete_remaindersM(insert_array).save()
                    return true
                }
                else {
                    return false
                }
            }
            else {
                return false
            }
        }
        else {
            return false
        }
    }
    else {
        return false
    }
}

export const getIndividualLessonDetails = async (lesson_url: string, headers?: any) => {
    try {
        const lesson = await lessonsM.findOne({ lesson_url }, { _id: 1, course_row_id: 1, lesson_number: 1 });

        if (!lesson) {
            return {
                status: false,
                message: "Lesson not found.",
                lesson_url: lesson_url
            };
        }

        const { _id: lesson_row_id, course_row_id, lesson_number } = lesson;
        let user_row_id = "";
        const checkToken = checkUserLoginToken(headers);
        if (checkToken.status) {
            user_row_id = checkToken.message;
        }

        const cacheKey = `individual_lesson_${lesson_url}_${headers?.authorization || 'guest'}_${user_row_id}`;
        const cache_response = await redisCache.getCache({ key: cacheKey });

        if (cache_response.status && cache_response.message) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true
            };
        }

        const [lessonDetails, relatedLessons, currentLesson] = await Promise.all([
            lessonsM.aggregate([
                { $match: { _id: lesson_row_id } },
                {
                    $lookup: {
                        from: "cln_academy_courses",
                        localField: "course_row_id",
                        foreignField: "_id",
                        as: "course_details"
                    }
                },
                { $unwind: { path: "$course_details", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "cln_academy_lessons_faq_lists",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        pipeline: [{ $project: { __v: 0 } }],
                        as: "faq_details"
                    }
                },
                ...(user_row_id ? [{
                    $lookup: {
                        from: "cln_academy_quiz_lession_started_details",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        pipeline: [{ $match: { user_row_id } }],
                        as: "lessonInfo"
                    }
                }] : []),
                ...(user_row_id ? [{
                    $lookup: {
                        from: "cln_academy_quiz_answers",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        pipeline: [
                            { $match: { user_row_id, answer_status: true } },
                            { $count: "total_correct_answers" }
                        ],
                        as: "lessonAns"
                    }
                }] : []),
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
                    $lookup: {
                        from: "cln_academy_lesson_user_readers",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        as: "totalReaderInfo"
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_lesson_user_likes",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        as: "likeInfo"
                    }
                },
                {
                    $addFields: {
                        total_readers: { $size: "$totalReaderInfo" },
                        like_count: {
                            $size: {
                                $filter: {
                                    input: "$likeInfo",
                                    as: "item",
                                    cond: { $eq: ["$$item.like_status", 1] }
                                }
                            }
                        },
                        dislike_count: {
                            $size: {
                                $filter: {
                                    input: "$likeInfo",
                                    as: "item",
                                    cond: { $eq: ["$$item.like_status", 2] }
                                }
                            }
                        },
                        total_correct_answers: {
                            $cond: {
                                if: {
                                    $eq: [
                                        { $size: { $ifNull: ["$lessonInfo", []] } },
                                        0
                                    ]
                                },
                                then: null,
                                else: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$lessonAns.total_correct_answers", 0] },
                                        0
                                    ]
                                }
                            }
                        },
                        lesson_completed_status: user_row_id ? {
                            $cond: {
                                if: { $gte: [{ $ifNull: [{ $arrayElemAt: ["$lessonAns.total_correct_answers", 0] }, 0] }, 7] },
                                then: 1,
                                else: 0
                            }
                        } : null,
                        total_questions_count: {
                            $ifNull: [{ $arrayElemAt: ["$lessonQues.count", 0] }, 0]
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        course_row_id: 1,
                        course_name: "$course_details.course_name",
                        course_slug: "$course_details.course_slug",
                        lesson_number: 1,
                        title: 1,
                        description: 1,
                        author_name: 1,
                        author_id: 1,
                        lesson_image_url: 1,
                        lesson_url: 1,
                        date_n_time: 1,
                        author_link: 1,
                        reviewed_by_name: 1,
                        reviewed_by_id: 1,
                        reviewed_by_link: 1,
                        updated_on: 1,
                        faq_details: 1,
                        like_count: 1,
                        dislike_count: 1,
                        meta_keywords: 1,
                        total_correct_answers: 1,
                        lesson_completed_status: 1,
                        total_readers: 1,
                        total_questions_count: 1,
                        question_listed_status: {
                            $cond: {
                                if: { $gte: ["$total_questions_count", 10] },
                                then: true,
                                else: false
                            }
                        },
                    }
                }
            ]).limit(1),

            lessonsM.aggregate([
                {
                    $sort: { lesson_number: 1 }
                },
                {
                    $match: { course_row_id: course_row_id, lesson_number: { $in: [lesson_number - 1, lesson_number + 1] } }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_lession_started_details",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        pipeline: [{ $match: { user_row_id: user_row_id } }],
                        as: "lessonInfo"
                    }
                },
                {
                    $unwind: { path: "$lessonInfo", preserveNullAndEmptyArrays: true }
                },
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
                {
                    $match: {
                        total_questions_count: { $gte: 10 }
                    }
                },
                {
                    $lookup: {
                        from: "cln_academy_quiz_answers",
                        localField: "_id",
                        foreignField: "lesson_row_id",
                        pipeline: [{ $match: { user_row_id: user_row_id, answer_status: true } }],
                        as: "lessonAns"
                    }
                },
                {
                    $project: {
                        _id: 1,
                        course_row_id: 1,
                        lesson_number: 1,
                        title: 1,
                        lesson_image_url: 1,
                        lesson_completed_status: { $cond: { if: "$lessonInfo.lesson_status", then: "$lessonInfo.lesson_status", else: 0 } },
                        total_correct_answers: { $size: "$lessonAns" },
                        lesson_url: 1,
                        total_questions_count: 1
                    }
                }
            ]).limit(2),

            ...(user_row_id ? [
                lessonsM.aggregate([
                    {
                        $match: { course_row_id: course_row_id }
                    },
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
                                                { $eq: ["$user_row_id", user_row_id] },
                                                { $eq: ["$lesson_status", 1] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "completionStatus"
                        }
                    },
                    {
                        $match: { completionStatus: { $eq: [] } }
                    },
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
                    {
                        $match: {
                            total_questions_count: { $gte: 10 }
                        }
                    },
                    {
                        $sort: { lesson_number: 1 }
                    },
                    {
                        $limit: 1
                    },
                    {
                        $project: {
                            _id: 1,
                            lesson_number: 1,
                            title: 1,
                            author_name: 1,
                            updated_on: 1,
                            lesson_image_url: 1,
                            lesson_url: 1,
                            total_questions_count: 1,
                        }
                    }
                ])
            ] : [Promise.resolve(null)])
        ]);


        if (lessonDetails[0]) {
            if (user_row_id && course_row_id && lesson_row_id) {
                setRemainderEmail(user_row_id, course_row_id, lesson_row_id);
                updateStreakDetails({ user_row_id });
            }

            const response_data = {
                details: lessonDetails[0],
                current_lesson: currentLesson?.[0] || null,
                related_lessons: relatedLessons
            };

            await redisCache.setCache({ key: cacheKey, value: response_data, ttl: CacheDuration.TWELVE_HOURS });

            return { status: true, message: response_data, cache_response_status: false };
        } else {
            return {
                status: false,
                message: { alert_message: "Sorry, Invalid lesson row id." }
            };
        }

    } catch (error: any) {
        console.error('Individual lesson details error:', error.message);
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: error.message
        };
    }
};