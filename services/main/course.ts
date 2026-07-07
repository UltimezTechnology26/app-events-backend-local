import coursesM from "../../models/main/academy/coursesM";
import redisCache, { CacheDuration } from "../../config/redis";

export const getCourseList = async (skip: number, limit: number, date?: string, search?: string) => {
    try {
        // Input validation
        const validatedSkip = Math.max(0, Number.parseInt(skip.toString()) || 0);
        const validatedLimit = Math.min(100, Math.max(1, Number.parseInt(limit.toString()) || 10));

        // Build search conditions efficiently
        const searchConditions: any[] = [];

        if (date) {
            const inputDate = new Date(date);
            if (!Number.isNaN(inputDate.getTime())) {
                const start_date = new Date(inputDate);
                start_date.setHours(0, 0, 0, 0);

                const end_date = new Date(inputDate);
                end_date.setHours(23, 59, 59, 999);

                searchConditions.push({ date_n_time: { $gte: start_date, $lte: end_date } });
            }
        }

        if (search?.trim()) {
            const searchRegex = { $regex: search.trim(), $options: 'i' };
            searchConditions.push({
                $or: [
                    { course_name: searchRegex },
                    { course_description: searchRegex }
                ]
            });
        }

        const searchQuery = searchConditions.length > 0 ? { $and: searchConditions } : {};
        const cacheKey = `academy_course_list_${validatedSkip}_${validatedLimit}_${date || 'all'}_${search || 'all'}`;

        // Check cache first
        const cache_response = await redisCache.getCache({ key: cacheKey });
        if (cache_response.status && Array.isArray(cache_response.message)) {
            return {
                status: true,
                message: cache_response.message,
                cache_response_status: true
            };
        }

        const get_query = await coursesM.aggregate([
            // Apply search filters early to reduce dataset
            ...(Object.keys(searchQuery).length > 0 ? [{
                $match: searchQuery
            }] : []),

            // Sort by date first (uses date_n_time index)
            {
                $sort: { date_n_time: -1 }
            },
            {
                $lookup: {
                    from: "cln_academy_courses_lessons",
                    localField: "_id",
                    foreignField: "course_row_id",
                    as: "lesson_info"
                }
            },

            // Filter out courses with no lessons early
            {
                $match: {
                    "lesson_info": { $exists: true, $ne: [] }
                }
            },

            {
                $unwind: "$lesson_info"
            },
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
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    as: "question_stats"
                }
            },

            {
                $addFields: {
                    question_count: {
                        $ifNull: [{ $arrayElemAt: ["$question_stats.count", 0] }, 0]
                    }
                }
            },

            // Filter lessons with sufficient questions
            {
                $match: {
                    question_count: { $gte: 10 }
                }
            },
            // Group back lessons under course
            {
                $group: {
                    _id: "$_id",
                    course_name: { $first: "$course_name" },
                    course_slug: { $first: "$course_slug" },
                    date_n_time: { $first: "$date_n_time" },
                    course_description: { $first: "$course_description" },
                    course_image: { $first: "$course_image" },
                    total_lessons: { $sum: 1 }
                }
            },
            // Only keep courses that now have valid lessons
            {
                $match: {
                    total_lessons: { $gt: 0 }
                }
            },
            {
                $sort: { date_n_time: -1 }
            },

            // Apply pagination
            {
                $skip: validatedSkip
            },
            {
                $limit: validatedLimit
            },

            // Project only required fields
            {
                $project: {
                    _id: 1,
                    course_name: 1,
                    course_slug: 1,
                    date_n_time: 1,
                    course_description: 1,
                    course_image: 1,
                    total_lessons: 1
                }
            }
        ]);

        // Cache the result
        await redisCache.setCache({
            key: cacheKey,
            value: get_query,
            ttl: CacheDuration.THIRTY_MINUTES
        });

        return {
            status: true,
            message: get_query,
            cache_response_status: false
        };
    } catch (error: any) {
        console.error('Course list error:', error.message);
        return {
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: error.message
        };
    }
};