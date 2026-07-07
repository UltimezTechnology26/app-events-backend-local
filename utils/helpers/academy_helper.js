
const streaksM = require('../../models/main/academy/streaksM')
const streaks_lostM = require('../../models/main/academy/streaks_lostM')
const lessonsM = require('../../models/main/academy/lessonsM')
const MARKET_API_BASE_URL = process.env.MARKET_API_BASE_URL
const MARKET_API_KEY = process.env.MARKET_API_KEY
const axios = require('axios')
const { sendAcademyEmail, sendCommunityEmail } = require('../../config/email')
const { getPresentDateOnly, getPrevStartDate, getPresentDateTime } = require('../../utils/helpers/helper')
const community_postsM = require('../../models/main/community/community_postsM')
const quiz_not_complete_remaindersM = require('../../models/main/academy/quiz_not_complete_remaindersM')
const { updateNotification } = require('./notification_helper')


export const getNextLessonDetails = async ({ course_row_id, user_row_id }) => {
    try {
        const next_lesson_query = await lessonsM.aggregate([
            {
                $match: { course_row_id: course_row_id }
            },
            {
                $lookup: {
                    from: "cln_academy_courses",
                    localField: "course_row_id",
                    foreignField: "_id",
                    as: "courses"
                }
            },
            { $unwind: "$courses" },
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
                $match: { total_questions_count: { $gte: 10 } }
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
            { $sort: { lesson_number: 1 } },
            { $limit: 1 },
            {
                $project: {
                    _id: 1,
                    lesson_number: 1,
                    title: 1,
                    author_name: 1,
                    updated_on: 1,
                    lesson_image_url: 1,
                    chapter_row_id: 1,
                    lesson_url: 1,
                    course_url: "$courses.course_url"
                }
            }
        ]);

        return next_lesson_query[0] ? next_lesson_query[0] : '';
    } catch (err) {
        console.error('getNextLessonDetails error:', err.message);
        return '';
    }
}


export const getUserWalletAddress = async (user_row_id, token) => {
    try {
        const response = await axios.get(
            `${MARKET_API_BASE_URL}admin/portfolio/wallets_list/${user_row_id}`,
            {
                headers: {
                    api_key: MARKET_API_KEY,
                    token: token,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log("API Response:", response.data);
        return { status: true, data: response.data };
    } catch (err) {
        const msg = err?.response?.data || err.message;
        console.log("Get user wallet address error", msg);
        return { status: false, message: msg };
    }
};

export const restoreStreakDetails = async () => {
    const today_date = getPresentDateOnly()
    const insert_date = new Date(today_date + 'T00:00:00.000Z')
    const date_n_time = getPresentDateTime()
    const get_streaks_query = await streaksM.aggregate([
        {
            $sort: {
                user_row_id: 1,
                date_only: -1,
            }
        },
        {
            $group: {
                _id: '$user_row_id',
                dates: {
                    $push: "$date_only"
                }
            }
        },
        {
            $set: {
                dates: {
                    $cond: {
                        if: { $in: [insert_date, '$dates'] },
                        then: '$dates',
                        else: { $concatArrays: [[insert_date], '$dates'] }
                    }
                }
            }
        },
        {
            $set: {
                days: {
                    $dateDiff: {
                        startDate: { $arrayElemAt: ["$dates", 1] },
                        endDate: { $arrayElemAt: ["$dates", 0] },
                        unit: "day"
                    }
                }
            }
        },
        {
            $match: {
                days: { $gte: 3 }
            }
        },
        {
            $project: {
                _id: 1,
                dates: 1,
                days: 1
            }
        }
    ])

    if (get_streaks_query[0]) {
        for (let run of get_streaks_query) {
            await streaksM.deleteMany({ user_row_id: run._id })

            await streaks_lostM({
                user_row_id: run._id,
                days: run.days,
                date_n_time: date_n_time
            }).save()
        }
    }
    return get_streaks_query
}



export const updateStreakDetails = async ({ user_row_id }) => {
    try {
        const date_only = getPresentDateOnly()
        const get_query = await streaksM.findOne({ user_row_id, date_only }, { _id: 1 })
        if (!get_query) {
            await new streaksM({
                user_row_id,
                date_only
            }).save();

            await streaks_lostM.deleteOne({ user_row_id })

            return true
        }
        else {
            return true
        }
    }
    catch (err) {
        console.error('Send quiz not  complete remainder error', err)
        return false
    }
}


export const getScoreRanges = (quiz_type) => {
    if (quiz_type === 1) // Completed 
    {
        return { total_correct_answers: { $gt: 0 } }
    }
    else if (quiz_type === 2) // Good Score
    {
        return { total_correct_answers: { $gte: 7 } }
    }
    else if (quiz_type === 3) // Bad Score
    {
        return { total_correct_answers: { $gte: 1, $lte: 6 } }
    }
    else if (quiz_type === 4) // Not Enrolled
    {
        return { total_correct_answers: 0 }
    }
    else {
        return ""
    }
}


//Reminder to the users for not completing the quiz
export const send_quiz_not_complete_remainder = async function () {
    try {
        const get_query = await quiz_not_complete_remaindersM.aggregate([
            {
                $match: { email_sent_status: false }
            },
            {
                $lookup:
                {
                    from: "cln_professionals",
                    localField: "user_row_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },

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
                $lookup:
                {
                    from: "cln_academy_courses_lessons",
                    localField: "lesson_row_id",
                    foreignField: "_id",
                    as: "lesson_info"
                }
            },
            { $unwind: { path: "$lesson_info", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    user_row_id: 1,
                    lesson_row_id: 1,
                    email_sent_status: 1,
                    full_name: "$user_info.full_name",
                    email_id: "$user_info.email_id",
                    course_name: "$course_info.course_name",
                    course_url: "$course_info.course_url",
                    lesson_title: "$lesson_info.title",
                    lesson_image_url: "$lesson_info.lesson_image_url",
                    lesson_number: "$lesson_info.lesson_number",
                    lesson_url: "$lesson_info.lesson_url"
                }
            }
        ])

        let header_profile_section = "Don't forget to complete the Quiz!"
        let pass_subject = "Don't forget to complete the Quiz!"

        let users_ids = []
        if (get_query) {
            for (let run of get_query) {
                const user_row_id = run.user_row_id
                const lesson_row_id = run.lesson_row_id

                if (!users_ids.includes(user_row_id)) {
                    users_ids.push(user_row_id)

                    let email_id = run.email_id
                    let full_name = run.full_name
                    let lesson_title = run.lesson_title
                    let lesson_url = run.lesson_url
                    let lesson_number = run.lesson_number
                    let course_name = run.course_name
                    let course_url = run.course_url

                    await updateNotification({
                        user_row_id: user_row_id,
                        notify_type: 5,
                        notify_type_row_id: lesson_row_id,
                        message_row_id: 104,
                        action_row_id: lesson_row_id,
                        notify_image: run.lesson_image_url,
                        notify_name: run.lesson_title,
                        notify_id: course_url + "/" + lesson_url
                    })

                    await quiz_not_complete_remaindersM.updateOne({ _id: run._id }, { $set: { email_sent_status: true } })

                    let string_join_button = "https://coinpedia.org/" + course_url + "/" + lesson_url

                    let pass_message = `<div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                        <h3>Hello ${full_name},</h3>
                        <p>This is a reminder to complete your quiz in <b>${course_name}</b> </p>
                        <p>Lesson ${lesson_number}: ${lesson_title}</p>
                        <p>Complete this quiz, to test your knowledge of Crypto and Blockchain. </p>
                        <p>You will get 1 point for each correct answer. At the end of the Quiz, your total score will be displayed. Maximum score is 10 points.</p>
                        <h3 style='margin-bottom: 0;'>Instructions : </h3>
                        <ul style='list-style: none; padding-left: 0; margin-top: 10px;'>
                           <li style='line-height:2;'><img src='https://image.coinpedia.org/static/common/check-mark.png' style='vertical-align: sub;' /> 10 Multiple Choice Questions.  </li>
                           <li style='line-height:2;'><img src='https://image.coinpedia.org/static/common/check-mark.png' style='vertical-align: sub;' /> You will get one point for each correct answer. </li>
                           <li style='line-height:2;'><img src='https://image.coinpedia.org/static/common/check-mark.png' style='vertical-align: sub;' /> 60 seconds per question. </li>
                           <li style='line-height:2;'><img src='https://image.coinpedia.org/static/common/check-mark.png' style='vertical-align: sub;' /> Total score will be displayed at the end of the quiz. </li>
                           <li style='line-height:2;'><img src='https://image.coinpedia.org/static/common/check-mark.png' style='vertical-align: sub;' /> Maximum Score: 10 Points and Minimum points for passing the quiz: 05</li>
                           <li style='line-height:2;'><img src='https://image.coinpedia.org/static/common/check-mark.png' style='vertical-align: sub;' /> Quiz can be reattempted if the score is below 08 </li>
                        </ul>
                        <a href="${string_join_button}" style='background: #5ce181; border: 0; color: #000; padding: 10px 25px; font-weight: 600; border-radius: 3px; font-size: 14px; display: inline-block;'>Start the Quiz</a>
                    </div>`

                    await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)
                }

            }
        }
        return get_query

    }
    catch (err) {
        console.error('Send quiz not  complete remainder error', err)
        return false
    }

}

export const sendWeeklyReportEmail = async (userData) => {
    const { full_name, email_id, _id: user_row_id } = userData;

    const exprCondition = {
        $or: [
            { $and: [{ $eq: ["$is_repost", true] }, { $eq: ["$repost_user_row_id", user_row_id] }] },
            { $and: [{ $ne: ["$is_repost", true] }, { $eq: ["$user_row_id", user_row_id] }] }
        ]
    };

    const matchStage = {
        $and: [
            { $expr: exprCondition },
            { post_status: true },
        ]
    };

    const [stats] = await community_postsM.aggregate([
        { $match: matchStage },
        { $lookup: { from: "cln_main_community_user_likes", localField: "_id", foreignField: "post_id", as: "likes_data" } },
        {
            $lookup: {
                from: "cln_main_community_post_comments",
                let: { postId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$post_id", "$$postId"] },
                                    { $eq: ["$parent_comment_id", null] }
                                ]
                            }
                        }
                    }
                ],
                as: "comments_data"
            }
        },
        { $lookup: { from: "cln_main_community_posts", localField: "_id", foreignField: "repost_id", as: "reposts_data" } },
        {
            $addFields: {
                like_count: { $size: { $filter: { input: "$likes_data", as: "l", cond: { $eq: ["$$l.like_status", 1] } } } },
                comment_count: { $size: "$comments_data" },
                repost_count: { $size: "$reposts_data" },
                dateOnly: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
            }
        },
        {
            $group: {
                _id: null,
                total_posts: { $sum: 1 },
                total_likes: { $sum: "$like_count" },
                total_comments: { $sum: "$comment_count" },
                total_reposts: { $sum: "$repost_count" },
                dates: { $addToSet: "$dateOnly" }
            }
        }
    ]);

    let currentStreak = 0, maxStreak = 0;

    if (stats) {
        const dates = stats.dates
            .map(d => {
                const dt = new Date(d);
                dt.setHours(0, 0, 0, 0);
                return dt;
            })
            .sort((a, b) => a - b);

        maxStreak = currentStreak = 1;

        for (let i = 1; i < dates.length; i++) {
            const dayDiff = (dates[i] - dates[i - 1]) / 86400000;
            if (dayDiff === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else if (dayDiff > 1) {
                currentStreak = 1;
            }
        }

        const lastDateObj = dates[dates.length - 1];
        if ((new Date().setHours(0, 0, 0, 0) - lastDateObj) / 86400000 > 1) {
            currentStreak = 0;
        }
    }

    const pass_subject = `Here’s How You Performed This Week!`;
    const header_profile_section = `Here’s How You Performed This Week!`;
    const pass_message = `
            <div style='background:#fff; padding: 20px 30px; border-radius: 0 0 10px 10px;'>
                <h3>Hello ${full_name},</h3>
                <p>Your weekly engagement report is ready 💬✨</p>
                <p>Total <b>Likes</b> Received: ${stats?.total_likes || 0}</p>
                <p><b>Comments</b> on Your Posts: ${stats?.total_comments || 0}</p>
                <p><b>Reposts</b>: ${stats?.total_reposts || 0}</p>
                <p>Posts <b>Published</b>: ${stats?.total_posts || 0}</p>
                <p><b>Streak</b> Maintained: ${currentStreak} Days</p>
                <p>Keep the momentum going 🚀</p>
            </div>
        `;

    sendCommunityEmail(email_id, pass_subject, pass_message, header_profile_section);
};

export function fillTemplate(template, data) {
    let result = template;
    for (let key in data) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, data[key]);
    }
    return result;
}

export function formatCertificateDate(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0'); // "07"
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase(); // "JUL"
    const year = String(date.getFullYear()).slice(-2); // "23"

    return `COMP_${day}${month}${year}`;
}

export function formatLongMonthYear(date = new Date()) {
    const options = { month: 'long', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}