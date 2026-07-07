const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const event_tagsM = require('../../../models/app/static/event_tagsM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
const eventM = require('../../../models/app/events/eventM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0]);
        if (!checkToken.status) {
            return res.json(checkToken);
        }

        const present = new Date(getPresentDateTime());
        let matchCondition = {};

        if (req.query.active_status !== undefined) {
            const statusValue = Number(req.query.active_status);
            matchCondition.active_status = statusValue === 1;
        }

        // Search Filter
        if (req.query.search && req.query.search.trim() !== "") {
            matchCondition.$or = [
                { event_tag: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const pipeline = [];

        if (Object.keys(matchCondition).length > 0) {
            pipeline.push({ $match: matchCondition });
        }

        pipeline.push(

            {
                $lookup: {
                    from: "cln_events",
                    let: { tagId: "$_id" },
                    pipeline: [
                        { $match: { approval_status: 1, $expr: { $in: ["$$tagId", "$event_tags"] } } },
                        { $count: "count" }
                    ],
                    as: "events_count_res"
                }
            },
            { $addFields: { total_events: { $ifNull: [{ $arrayElemAt: ["$events_count_res.count", 0] }, 0] } } },
            { $project: { events_count_res: 0 } },

            // Deleted events count
            {
                $lookup: {
                    from: "cln_deleted_events",
                    let: { tagId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $in: ["$$tagId", "$event_tags"] } } },
                        { $count: "count" }
                    ],
                    as: "deleted_res"
                }
            },
            { $addFields: { deleted_count: { $ifNull: [{ $arrayElemAt: ["$deleted_res.count", 0] }, 0] } } },
            { $project: { deleted_res: 0 } },

            // Pending count
            {
                $lookup: {
                    from: "cln_events",
                    let: { tagId: "$_id" },
                    pipeline: [
                        { $match: { approval_status: 0, $expr: { $in: ["$$tagId", "$event_tags"] } } },
                        { $count: "count" }
                    ],
                    as: "pending_res"
                }
            },
            { $addFields: { pending_count: { $ifNull: [{ $arrayElemAt: ["$pending_res.count", 0] }, 0] } } },
            { $project: { pending_res: 0 } },

            // Upcoming count
            {
                $lookup: {
                    from: "cln_events",
                    let: { tagId: "$_id" },
                    pipeline: [
                        { $match: { approval_status: 1, start_date: { $gt: present }, $expr: { $in: ["$$tagId", "$event_tags"] } } },
                        { $count: "count" }
                    ],
                    as: "upcoming_res"
                }
            },
            { $addFields: { upcoming_temp: { $ifNull: [{ $arrayElemAt: ["$upcoming_res.count", 0] }, 0] } } },
            { $project: { upcoming_res: 0 } },

            // Ongoing count
            {
                $lookup: {
                    from: "cln_events",
                    let: { tagId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                approval_status: 1,
                                start_date: { $lte: present },
                                end_date: { $gte: present },
                                $expr: { $in: ["$$tagId", "$event_tags"] }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "ongoing_res"
                }
            },
            { $addFields: { ongoing_temp: { $ifNull: [{ $arrayElemAt: ["$ongoing_res.count", 0] }, 0] } } },
            { $project: { ongoing_res: 0 } },

            // Combine ongoing + upcoming
            { $addFields: { ongoing_count: { $add: ["$ongoing_temp", "$upcoming_temp"] } } },
            { $project: { ongoing_temp: 0, upcoming_temp: 0 } },

            // Ended count
            {
                $lookup: {
                    from: "cln_events",
                    let: { tagId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                approval_status: 1,
                                end_date: { $lt: present },
                                $expr: { $in: ["$$tagId", "$event_tags"] }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "ended_res"
                }
            },
            { $addFields: { ended_count: { $ifNull: [{ $arrayElemAt: ["$ended_res.count", 0] }, 0] } } },
            { $project: { ended_res: 0 } },

            { $sort: { _id: -1 } }
        );

        const get_query = await event_tagsM.aggregate(pipeline);

        return res.json({
            status: true,
            message: get_query,

        });

    } catch (err) {
        console.log("Event tags list error:", err.message);

        return res.json({
            status: false,
            message: err.message
        });
    }
});


router.post('/save', [
    check('event_tag')
        .trim().not().isEmpty().withMessage('The Event tag field is required'),
    // check('keywords')
    // .trim().not().isEmpty().withMessage('The Keywords field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            const escapeRegex = (text) => {
                return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            };

            const cleanEventTag = req.body.event_tag.trim();

            const isExists = await event_tagsM.findOne({
                event_tag: {
                    $regex: '^' + escapeRegex(cleanEventTag) + '$',
                    $options: 'i'
                }
            });

            if (isExists) {
                return res.json({
                    status: false,
                    message: { event_tag: "This event tag already exists." }
                });
            }

            else {

                await event_tagsM({ event_tag: req.body.event_tag, active_status: true, date_n_time: getPresentDateTime() }).save()
                await deleteKeysByPattern('backend_event_tags_list*')
                res.json({ status: true, message: { alert_message: "New Event tag created successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save event tag details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update/:request_row_id', [
    check('event_tag')
        .trim().not().isEmpty().withMessage('The Event tag field is required'),
    // check('keywords')
    // .trim().not().isEmpty().withMessage('The Keywords field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            const escapeRegex = (text) => {
                return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            };

            const cleanEventTag = req.body.event_tag.trim();

            const isExists = await event_tagsM.findOne({
                event_tag: {
                    $regex: '^' + escapeRegex(cleanEventTag) + '$',
                    $options: 'i'
                }
            });

            if (isExists) {
                return res.json({
                    status: false,
                    message: { event_tag: "This event tag already exists." }
                });
            }

            else {

                const request_row_id = Number.parseInt(req.params.request_row_id)
                await event_tagsM.updateOne({ _id: request_row_id }, { event_tag: req.body.event_tag }) // , keywords:req.body.keywords
                await deleteKeysByPattern('backend_event_tags_list*')
                res.json({ status: true, message: { alert_message: "Event tag updated successfully." }, tokenStatus: true })

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update Event tag details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await event_tagsM.findOne({ _id: request_row_id, active_status: false })
            if (checkQuery) {
                await event_tagsM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })
                await deleteKeysByPattern('backend_event_tags_list*')
                res.json({ status: true, message: { alert_message: "This Event Tag enabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Event Tag id  or already enabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Event tag.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await event_tagsM.findOne({ _id: request_row_id, active_status: true })
            if (checkQuery) {
                await event_tagsM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })
                await deleteKeysByPattern('backend_event_tags_list*')
                res.json({ status: true, message: { alert_message: "This Event Tag disabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Event Tag id  or already disabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable Event tag.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await event_tagsM.findOne({ _id: request_row_id })
            if (checkQuery) {
                await event_tagsM.deleteOne({ _id: request_row_id })
                await deleteKeysByPattern('backend_event_tags_list*')
                res.json({ status: true, message: { alert_message: "This Event Tag deleted successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Event Tag id " }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Event tag.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router