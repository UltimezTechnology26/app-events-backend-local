const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')
const { arrangeValidation } = require('../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const domains_blockedM = require('../../models/system_settings/domains_blockedM')

router.post('/add_n_block_domain', [
    check('domain_name')
        .trim().not().isEmpty().withMessage('The Domain Name field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                await domains_blockedM({ domain_name: req.body.domain_name }).save()

                res.json({ status: true, message: { alert_message: 'This Domain blocked successfully' }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Add and block domain.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/block_domains_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
            let query = (req.query.search) ? { domain_name: { '$regex': req.query.search, $options: 'i' } } : {}

            const queryRun = await domains_blockedM.find(query).sort({ _id: -1 }).skip(skip).limit(limit)
            const countQueryRun = await domains_blockedM.countDocuments(query)

            res.json({ status: true, message: queryRun, countQueryRun: countQueryRun, tokenStatus: true })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Blocked domains list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/remove_domain/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await domains_blockedM.findOne({ _id: Number.parseInt(req.params.request_row_id) })
            if (queryRun) {
                await domains_blockedM.deleteOne({ _id: Number.parseInt(req.params.request_row_id) })

                res.json({ status: true, message: { alert_message: 'This Domain is Removed Successfully' }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry! Invalid Request Row id' }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Remove domain.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router