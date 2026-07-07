const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const crypto_networksM = require('../../../models/app/static/crypto_networksM')
const crypto_tokenM = require('../../../models/markets/tokensM')

router.get('/list', async (req, res) => {
    try {

        const pipeline = [];

        // 🔍 SEARCH FILTER
        if (req.query.search && req.query.search.trim() !== "") {
            const searchText = req.query.search.trim();

            pipeline.push({
                $lookup: {
                    from: "cln_markets_tokens",
                    localField: "token_row_id",
                    foreignField: "_id",
                    as: "token_info"
                }
            });

            pipeline.push({
                $match: {
                    $or: [
                        { network_name: { $regex: searchText, $options: "i" } },
                        { "token_info.token_name": { $regex: searchText, $options: "i" } },
                        { "token_info.symbol": { $regex: searchText, $options: "i" } }
                    ]
                }
            });

            pipeline.push({
                $project: { token_info: 0 }
            });
        }

        // 🔹 Pending tokens
        pipeline.push(
            {
                $lookup: {
                    from: "cln_markets_tokens",
                    let: { tokenId: "$token_row_id" },
                    pipeline: [
                        {
                            $match: {
                                approval_status: 0,
                                $expr: { $eq: ["$_id", "$$tokenId"] }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "pending_res"
                }
            },
            {
                $addFields: {
                    pending_count: {
                        $ifNull: [{ $arrayElemAt: ["$pending_res.count", 0] }, 0]
                    }
                }
            },
            { $project: { pending_res: 0 } },

            // 🔹 Approved tokens
            {
                $lookup: {
                    from: "cln_markets_tokens",
                    let: { tokenId: "$token_row_id" },
                    pipeline: [
                        {
                            $match: {
                                approval_status: 1,
                                active_status: 1,
                                $expr: { $eq: ["$_id", "$$tokenId"] }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "approved_res"
                }
            },
            {
                $addFields: {
                    approved_count: {
                        $ifNull: [{ $arrayElemAt: ["$approved_res.count", 0] }, 0]
                    }
                }
            },
            { $project: { approved_res: 0 } },

            // 🔹 Disabled tokens
            {
                $lookup: {
                    from: "cln_markets_tokens",
                    let: { tokenId: "$token_row_id" },
                    pipeline: [
                        {
                            $match: {
                                active_status: 0,
                                $expr: { $eq: ["$_id", "$$tokenId"] }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "disabled_res"
                }
            },
            {
                $addFields: {
                    disabled_count: {
                        $ifNull: [{ $arrayElemAt: ["$disabled_res.count", 0] }, 0]
                    }
                }
            },
            { $project: { disabled_res: 0 } },

            // 🔹 Rejected tokens
            {
                $lookup: {
                    from: "cln_markets_tokens",
                    let: { tokenId: "$token_row_id" },
                    pipeline: [
                        {
                            $match: {
                                approval_status: 2,
                                $expr: { $eq: ["$_id", "$$tokenId"] }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "rejected_res"
                }
            },
            {
                $addFields: {
                    rejected_count: {
                        $ifNull: [{ $arrayElemAt: ["$rejected_res.count", 0] }, 0]
                    }
                }
            },
            { $project: { rejected_res: 0 } },

            { $sort: { _id: -1 } }
        );

        const result = await crypto_networksM.aggregate(pipeline);

        res.json({ status: true, message: result });

    } catch (err) {
        console.log("Network list error:", err.message);
        res.json({ status: false, message: err.message });
    }
});







router.post('/add_n_update_details', [
    check('network_name')
        .trim().not().isEmpty().withMessage('The Network Name field is required')
], async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            let network_row_id = ""
            if (!Number.isNaN(Number.parseInt(req.body.network_row_id))) {
                network_row_id = Number.parseInt(req.body.network_row_id)
            }

            let token_row_id = ""
            if (req.body.token_id) {
                const check_token_query = await crypto_tokenM.findOne({ token_id: (sanitize(req.body.token_id)).toLowerCase() })
                if (check_token_query) {
                    token_row_id = check_token_query._id
                }
                else {
                    errObj['token_id'] = 'Sorry, Invalid conpedia markets token id'
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                let update_array = {}
                update_array['network_link'] = ""
                update_array['network_name'] = req.body.network_name
                if (req.body.network_link) {
                    update_array['network_link'] = req.body.network_link
                }


                if (token_row_id) {
                    update_array['token_row_id'] = token_row_id
                }

                update_array['date_n_time'] = getPresentDateTime()
                if (!network_row_id) {
                    await crypto_networksM(update_array).save()

                    res.json({ status: true, message: { alert_message: "New crypto network details has been added successfully." } })
                }
                else {
                    const check_network = await crypto_networksM.findOne({ _id: network_row_id })
                    if (check_network) {
                        await crypto_networksM.updateOne({ _id: network_row_id }, { $set: update_array })

                        res.json({ status: true, message: { alert_message: "This crypto network details has been updated successfully." } })
                    }
                    else {
                        res.json({ status: true, message: { alert_message: "Sorry, Invalid network row id." } })
                    }
                }

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Add and update crypto networks details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})




router.get('/individual_details/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await crypto_networksM.findOne({ _id: request_row_id, active_status: false })
                if (get_query) {
                    res.json({ status: true, message: get_query })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid network row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid network row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Individual Crypto networks details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await crypto_networksM.findOne({ _id: request_row_id })
                if (get_query) {
                    await crypto_networksM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })

                    res.json({ status: true, message: { alert_message: "This  crypto network details has been enabled successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid network row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid network row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Crypto networks.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



router.get('/disable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (!Number.isNaN(Number.parseInt(req.params.request_row_id))) {
                const request_row_id = Number.parseInt(req.params.request_row_id)

                const get_query = await crypto_networksM.findOne({ _id: request_row_id })
                if (get_query) {
                    await crypto_networksM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })

                    res.json({ status: true, message: { alert_message: "This crypto network details has been disabled successfully." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Invalid network row id." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid network row id." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable Crypto networks.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await crypto_networksM.findOne({ _id: request_row_id })
            if (checkQuery) {
                await crypto_networksM.deleteOne({ _id: request_row_id })
                res.json({ status: true, message: { alert_message: "This crypto network has been deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid crypto network id " } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Crypto networks.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router