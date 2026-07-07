const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const poll_votingsM = require('../../models/main/polling/poll_votingsM')
const poll_questionsM = require('../../models/main/polling/poll_questionsM')
const poll_emailsM = require('../../models/main/polling/poll_emailsM')
const { checkUserLoginToken } = require('../../middleware/authorization')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime, requestIPAddress } = require('../../utils/helpers/helper')


router.get('/polling_details/:article_id', async (req, res) => {
    try {
        let article_id = Number.parseInt(sanitize(req.params.article_id))
        if (Number.isNaN(article_id)) {
            res.json({ status: false, message: { alert_message: "Invalid question row id. It should be a number." } })
        }
        else {
            const check_query = await poll_questionsM.findOne({ article_id: article_id, question_status: 1 })
            if (check_query) {
                let result = {}
                result['article_id'] = check_query.article_id
                result['article_title'] = check_query.article_title
                result['article_slug'] = check_query.article_slug
                result['question_title'] = check_query.question_title
                result['date_n_time'] = check_query.date_n_time

                let ip_address = ""
                if (req.query.ip_address) {
                    ip_address = req.query.ip_address
                }
                else {
                    ip_address = requestIPAddress(req)
                }

                const check_vote_query = await poll_votingsM.findOne({ article_id: sanitize(article_id), ip_address: sanitize(ip_address) })
                if (check_vote_query) {
                    result['vote_status'] = check_vote_query.user_vote_type
                }
                else {
                    result['vote_status'] = 0
                }

                res.json({ status: true, message: result })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Invalid article id' } })
            }
        }
    }
    catch (err) {
        console.log('Polling details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/save_polling_details', [
    check('article_id')
        .not().isEmpty().withMessage('The article id field is required.'),
    check('user_vote_type')
        .not().isEmpty().withMessage('The user vote type field is required.'),

], async (req, res) => {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    if (Object.keys(errObj).length > 0) {
        res.json({ status: false, message: errObj })
    }
    else {
        try {
            let ip_address = ""
            if (req.body.ip_address) {
                ip_address = req.body.ip_address
            }
            else {
                ip_address = requestIPAddress(req)
            }

            const check_vote_query = await poll_votingsM.findOne({ article_id: sanitize(req.body.article_id), ip_address: sanitize(ip_address) })
            if (!check_vote_query) {
                let insert_array = {}
                insert_array['user_type'] = 1
                insert_array['article_id'] = req.body.article_id
                insert_array['ip_address'] = ip_address
                insert_array['user_vote_type'] = req.body.user_vote_type
                insert_array['date_n_time'] = getPresentDateTime()
                const response = await poll_votingsM(insert_array).save()
                res.json({ status: true, message: { alert_message: "Your polling details has been submitted successfully.", response } })

            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Your polling details are already exist." } })
            }
        }
        catch (err) {
            console.log('Save polling details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }

}
)


router.post('/polling_result_details', [
    check('article_id')
        .not().isEmpty().withMessage('The Article ID field is required.'),
    check('ip_address')
        .not().isEmpty().withMessage('The ip address field is required.'),
    check('email_id')
        .not().isEmpty().withMessage('The email id field is required.')
        .isEmail().withMessage('The email id field must be contain valid email.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const article_id = Number.parseInt(req.body.article_id)
        if (Number.isNaN(article_id)) {
            errObj['article_id'] = 'The article id field must be contain valid id'
        }
        else {
            const check_article_query = await poll_questionsM.findOne({ article_id: article_id })
            if (!check_article_query) {
                errObj['article_id'] = 'The article id field must be contain valid id'
            }
        }

        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let ip_address = ""
            if (req.body.ip_address) {
                ip_address = req.body.ip_address
            }
            else {
                ip_address = requestIPAddress(req)
            }
            const check_query = await poll_emailsM.findOne({ email_id: sanitize(req.body.email_id) })
            if (!check_query) {
                let insert_array = {}
                insert_array['article_id'] = req.body.article_id
                insert_array['email_id'] = req.body.email_id
                insert_array['ip_address'] = ip_address
                insert_array['date_n_time'] = getPresentDateTime()
                await poll_emailsM(insert_array).save()
            }
            else {
                await poll_emailsM.updateOne({ email_id: sanitize(req.body.email_id) }, {
                    $set: {
                        article_id: req.body.article_id,
                        ip_address: ip_address,
                        date_n_time: getPresentDateTime()
                    }
                })
            }
            // const usersQuery = await poll_votingsM.find({ article_id: article_id })
            const positive_votes_query = await poll_votingsM.countDocuments({ article_id: article_id, user_vote_type: 1 })
            const negative_votes_query = await poll_votingsM.countDocuments({ article_id: article_id, user_vote_type: 2 })
            const positive_votes = ((positive_votes_query / (positive_votes_query + negative_votes_query)) * 100).toFixed(2)
            const negative_votes = ((negative_votes_query / (positive_votes_query + negative_votes_query)) * 100).toFixed(2)
            res.json({
                status: true,
                message: {
                    positive_votes: positive_votes,
                    negative_votes: negative_votes
                }
            })
        }
    }
    catch (err) {
        console.log('Polling result details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

}

)

//mobile app api

router.get('/mobile_polling_details/:article_id', async (req, res) => {

    const article_id = Number.parseInt(req.params.article_id)
    try {
        if (Number.isNaN(article_id)) {
            res.json({ status: false, message: { alert_message: "Invalid question row id. It should be a number." } })
        }
        else {
            let user_row_id = 0
            const checkToken = checkUserLoginToken(req.headers)
            if (checkToken.status) {
                user_row_id = checkToken.message
            }
            const check_query = await poll_questionsM.findOne({ article_id: article_id, question_status: 1 })
            if (check_query) {
                let result = {}
                result['article_id'] = check_query.article_id
                result['article_title'] = check_query.article_title
                result['article_slug'] = check_query.article_slug
                result['question_title'] = check_query.question_title
                result['date_n_time'] = check_query.date_n_time

                result['vote_status'] = 0

                if (user_row_id) {
                    const check_vote_query = await poll_votingsM.findOne({ article_id: article_id, user_row_id: user_row_id })
                    if (check_vote_query) {
                        const positive_votes_query = await poll_votingsM.countDocuments({ article_id: article_id, user_vote_type: 1 })
                        const negative_votes_query = await poll_votingsM.countDocuments({ article_id: article_id, user_vote_type: 2 })

                        result['positive_votes'] = ((positive_votes_query / (positive_votes_query + negative_votes_query)) * 100).toFixed(2)
                        result['negative_votes'] = ((negative_votes_query / (positive_votes_query + negative_votes_query)) * 100).toFixed(2)

                        result['vote_status'] = check_vote_query.user_vote_type
                    }
                }


                res.json({ status: true, message: result })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Invalid article id' } })
            }
        }
    }
    catch (err) {
        console.log('Mobile polling details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/mobile_submit_vote', [
    check('article_id')
        .not().isEmpty().withMessage('The article id field is required.'),
    check('user_vote_type')
        .not().isEmpty().withMessage('The user vote type field is required.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkUserLoginToken(req.headers)
        if (checkToken.status) {
            const user_row_id = checkToken.message
            const article_id = sanitize(req.body.article_id)
            const check_query = await poll_votingsM.findOne({ user_row_id: user_row_id, article_id: article_id })

            if (check_query) {
                errObj['article_id'] = 'Sorry, Your polling details already exists'
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_vote_query = await poll_votingsM.findOne({ user_row_id: user_row_id, user_type: 2 })
                if (!check_vote_query) {
                    let insert_array = {}
                    insert_array['user_type'] = 2
                    insert_array['article_id'] = article_id
                    insert_array['user_row_id'] = user_row_id
                    insert_array['user_vote_type'] = req.body.user_vote_type
                    insert_array['date_n_time'] = getPresentDateTime()
                    await poll_votingsM(insert_array).save()

                }
                else {
                    await poll_votingsM.updateOne({ user_row_id: user_row_id }, {
                        $set: {
                            article_id: article_id,
                            user_vote_type: req.body.user_vote_type,
                            date_n_time: getPresentDateTime()
                        }
                    })
                }
                const positive_votes_query = await poll_votingsM.countDocuments({ article_id: article_id, user_vote_type: 1 })
                const negative_votes_query = await poll_votingsM.countDocuments({ article_id: article_id, user_vote_type: 2 })

                const positive_votes = ((positive_votes_query / (positive_votes_query + negative_votes_query)) * 100).toFixed(2)
                const negative_votes = ((negative_votes_query / (positive_votes_query + negative_votes_query)) * 100).toFixed(2)

                res.json({
                    status: true,
                    message: {
                        positive_votes: positive_votes,
                        negative_votes: negative_votes
                    }
                })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Mobile submit vote.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})
module.exports = router


































