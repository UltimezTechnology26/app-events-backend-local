require('dotenv').config()
const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation } = require('../../utils/helpers/helper')
const article_likeM = require('../../models/main/article_likeM')
const article_linksM = require('../../models/main/article_linksM')
const article_user_ip_addressM = require('../../models/main/article_user_ip_addressM')
const { checkUserLoginToken } = require('../../middleware/authorization')
const article_savedM = require('../../models/main/article_savedM')

router.post('/add_article_wishlist', [
    check('article_id')
        .trim().not().isEmpty().withMessage('The Article Row ID field is required.'),
    check('article_url')
        .trim().not().isEmpty().withMessage('The article url field is required.'),
], async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let user_row_id = checkUserToken.message
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let article_row_id = 0
                const checkQuery = await article_linksM.findOne({ article_id: Number.parseInt(req.body.article_id) }, { _id: 1 })
                if (!checkQuery) {
                    const saveArticle = new article_linksM({
                        article_id: Number.parseInt(req.body.article_id),
                        article_url: req.body.article_url
                    })
                    const articleQuery = await saveArticle.save()
                    article_row_id = articleQuery._id
                }
                else {
                    article_row_id = checkQuery._id
                }

                if (article_row_id && user_row_id) {
                    const checkLinkQuery = await article_savedM.findOne({ article_row_id: article_row_id, user_row_id: user_row_id })
                    if (!checkLinkQuery) {
                        let insertArr = {}
                        insertArr['user_row_id'] = user_row_id
                        insertArr['article_row_id'] = article_row_id
                        insertArr['date_n_time'] = getPresentDateTime()

                        await article_savedM(insertArr).save()

                        res.json({ status: true, message: { alert_message: "Article added to wishlist successfully." } })
                    }
                    else {
                        await article_savedM.deleteOne({ _id: checkLinkQuery._id })
                        res.json({ status: false, message: { alert_message: "Successfully removed the article from the wishlist." } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Please try with valid inputs." } })
                }

            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Save like details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/users_wishlist', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            let user_row_id = checkUserToken.message
            const get_query = await article_savedM.aggregate([
                { $match: { user_row_id: user_row_id } },
                {
                    $lookup:
                    {
                        from: "cln_article_links",
                        localField: "article_row_id",
                        foreignField: "_id",
                        as: "articles_info"
                    }
                },
                { $unwind: { path: "$articles_info", preserveNullAndEmptyArrays: true } },
                {
                    $project:
                    {
                        article_id: "$articles_info.article_id",
                        article_url: "$articles_info.article_url"
                    }
                }
            ])
            res.json({ status: true, message: get_query })
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Articles list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/likes_count/:article_id', async (req, res) => {
    try {
        if (!Number.isNaN(Number.parseInt(req.params.article_id))) {
            const checkQuery = await article_linksM.findOne({ article_id: Number.parseInt(req.params.article_id) }, { _id: 1 })
            if (checkQuery) {
                const article_row_id = checkQuery._id

                const likes_count = await article_likeM.countDocuments({ article_row_id: article_row_id, like_status: 1 })
                const dislikes_count = await article_likeM.countDocuments({ article_row_id: article_row_id, like_status: 2 })

                res.json({ status: true, likes_count: likes_count, dislikes_count: dislikes_count })

            }
            else {
                res.json({ status: false, message: 'Invalid Article id.' })
            }
        }
        else {
            res.json({ status: false, message: 'Invalid Article id.' })
        }
    }
    catch (err) {
        console.log('Articles list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save_like_details', [
    check('ip_address')
        .trim().not().isEmpty().withMessage('The IP Address field is required.'),
    check('article_id')
        .trim().not().isEmpty().withMessage('The Article Row ID field is required.'),
    check('article_url')
        .trim().not().isEmpty().withMessage('The article url field is required.'),
    check('like_status')
        .trim().not().isEmpty().withMessage('The Like Status field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        if (Number.parseInt(req.body.like_status) === 2) {
            if (!req.body.dislike_title) {
                errObj['dislike_title'] = 'The Dislike Title field is required.'
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let user_row_id = 0
            const checkIPQuery = await article_user_ip_addressM.findOne({ ip_address: sanitize(req.body.ip_address) }, { _id: 1 })
            if (!checkIPQuery) {
                const saveIpAddr = new article_user_ip_addressM({
                    ip_address: req.body.ip_address
                })
                const ipAddrQuery = await saveIpAddr.save()
                user_row_id = ipAddrQuery._id
            }
            else {
                user_row_id = checkIPQuery._id
            }

            let article_row_id = 0
            const checkQuery = await article_linksM.findOne({ article_id: Number.parseInt(req.body.article_id) }, { _id: 1 })
            if (!checkQuery) {
                const saveArticle = new article_linksM({
                    article_id: Number.parseInt(req.body.article_id),
                    article_url: req.body.article_url
                })
                const articleQuery = await saveArticle.save()
                article_row_id = articleQuery._id
            }
            else {
                article_row_id = checkQuery._id
            }

            if (article_row_id && user_row_id) {
                const checkLinkQuery = await article_likeM.findOne({ article_row_id: article_row_id, user_row_id: user_row_id })
                if (!checkLinkQuery) {
                    let insertArr = {}
                    insertArr['user_row_id'] = user_row_id
                    insertArr['article_row_id'] = article_row_id
                    insertArr['like_status'] = Number.parseInt(req.body.like_status)
                    insertArr['dislike_title'] = req.body.dislike_title
                    insertArr['dislike_comments'] = req.body.dislike_comments
                    insertArr['date_n_time'] = getPresentDateTime()

                    const queryRun = new article_likeM(insertArr)
                    await queryRun.save()

                    res.json({ status: true, message: { alert_message: "We appreciate your review." } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Sorry, Already submitted like or dislike details." } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Please try with valid inputs." } })
            }
        }
    }
    catch (err) {
        console.log('Save like details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/check_user', [
    check('ip_address')
        .trim().not().isEmpty().withMessage('The IP Address field is required.'),
    check('article_id')
        .trim().not().isEmpty().withMessage('The Article Row ID field is required.')
], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    if (Object.keys(errObj).length > 0) {
        res.json({ status: false, message: errObj })
    }
    else {
        try {
            let user_row_id = 0
            const checkIPQuery = await article_user_ip_addressM.findOne({ ip_address: sanitize(req.body.ip_address) }, { _id: 1 })
            if (checkIPQuery) {
                user_row_id = checkIPQuery._id
            }

            let article_row_id = 0
            const checkQuery = await article_linksM.findOne({ article_id: Number.parseInt(req.body.article_id) }, { _id: 1 })
            if (checkQuery) {
                article_row_id = checkQuery._id
            }

            if (article_row_id && user_row_id) {
                const checkLinkQuery = await article_likeM.findOne({ article_row_id: article_row_id, user_row_id: user_row_id })
                let resultArr = {}
                if (checkLinkQuery) {
                    resultArr['_id'] = checkLinkQuery._id
                    resultArr['user_row_id'] = checkLinkQuery.user_row_id
                    resultArr['article_row_id'] = checkLinkQuery.article_row_id
                    resultArr['like_status'] = checkLinkQuery.like_status
                    if (checkLinkQuery.dislike_title) {
                        resultArr['dislike_title'] = checkLinkQuery.dislike_title
                        resultArr['dislike_comments'] = checkLinkQuery.dislike_comments
                    }
                    resultArr['date_n_time'] = checkLinkQuery.date_n_time

                    resultArr['total_article_likes'] = await article_likeM.countDocuments({ article_row_id: article_row_id, like_status: 1 })
                    resultArr['total_article_dislikes'] = await article_likeM.countDocuments({ article_row_id: article_row_id, like_status: 2 })

                    res.json({ status: true, message: resultArr })
                }
                else {
                    res.json({ status: false, message: "Not liked or Disliked." })
                }
            }
            else {
                res.json({ status: false, message: "Not liked or Disliked." })
            }

        }
        catch (err) {
            console.log('Check user.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
})

router.get('/individual_likes/:article_id', async (req, res) => {
    try {
        let article_row_id = 0
        const checkQuery = await article_linksM.findOne({ article_id: Number.parseInt(req.params.article_id) }, { _id: 1, article_url: 1 })
        if (checkQuery) {
            article_row_id = checkQuery._id
        }
        if (article_row_id) {
            const likeQuery = await article_likeM.aggregate([
                { $match: { article_row_id: article_row_id, like_status: 1 } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_article_links_user_ip_addresses",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "ip_info"
                    }
                },
                { $unwind: { path: "$ip_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        date_n_time: 1,
                        ip_address: "$ip_info.ip_address"
                    }
                }
            ])

            const likeQuerycount = await article_likeM.countDocuments({ article_row_id: article_row_id, like_status: 1 })
            const dislikeQuery = await article_likeM.aggregate([
                { $match: { article_row_id: article_row_id, like_status: 2 } },
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_article_links_user_ip_addresses",
                        localField: "user_row_id",
                        foreignField: "_id",
                        as: "ip_info"
                    }
                },
                { $unwind: { path: "$ip_info", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        date_n_time: 1,
                        dislike_comments: 1,
                        dislike_title: 1,
                        ip_address: "$ip_info.ip_address"
                    }
                }
            ])
            const dislikeQuerycount = await article_likeM.countDocuments({ article_row_id: article_row_id, like_status: 2 })
            res.json({ status: true, article_url: checkQuery.article_url, message: { like_list: likeQuery, like_count: likeQuerycount, dislike_list: dislikeQuery, dislike_count: dislikeQuerycount } })
        }
        else {
            res.json({ status: false, message: "Not inserted" })
        }


    }
    catch (err) {
        console.log('Individual likes.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})

router.get('/list/:skip/:limit', async (req, res) => {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

    let query = {}
    if (req.query.search) {
        query = { article_url: { '$regex': req.query.search, $options: 'i' } }
    }

    try {
        const runQuery = await article_linksM.aggregate([
            { $match: query },
            { $sort: { _id: -1 } },
            {
                $lookup: {
                    from: "cln_article_links_user_likes",
                    let: { ownerId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$ownerId", "$article_row_id"] },
                                        { $eq: ["$like_status", 1] }
                                    ]
                                },
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "like"
                }
            },
            { $unwind: { path: "$like", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "cln_article_links_user_likes",
                    let: { clientId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$$clientId", "$article_row_id"] },
                                        { $eq: ["$like_status", 2] }
                                    ]
                                },
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "dislike"
                }
            },
            { $unwind: { path: "$dislike", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    article_id: 1,
                    article_url: 1,
                    like: "$like.count",
                    dislike: "$dislike.count",
                }
            }
        ]).skip(skip).limit(limit)
        const queryCount = await article_linksM.countDocuments(query)
        res.json({ status: true, message: runQuery, count: queryCount })
    }
    catch (err) {
        console.log('Articles list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router