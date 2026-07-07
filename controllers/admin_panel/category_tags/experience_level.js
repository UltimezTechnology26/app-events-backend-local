const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const experience_levelsM = require('../../../models/app/static/experience_levelsM')

router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await experience_levelsM.find()

            res.json({ status: true, message: queryRun, tokenStatus: true })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Experience level list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save', [
    check('experience')
        .trim().not().isEmpty().withMessage('The Experience field is required')
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
                await experience_levelsM({ experience: req.body.experience, active_status: true, date_n_time: getPresentDateTime() }).save()

                res.json({ status: true, message: { alert_message: "New Experience created successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Save Experience level details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update/:request_row_id', [
    check('experience')
        .trim().not().isEmpty().withMessage('The Experience field is required')
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
                const request_row_id = Number.parseInt(req.params.request_row_id)
                await experience_levelsM.updateOne({ _id: request_row_id }, { experience: req.body.experience })

                res.json({ status: true, message: { alert_message: "Experience updated successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update Experience level details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await experience_levelsM.findOne({ _id: request_row_id, active_status: false })
            if (checkQuery) {
                await experience_levelsM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })
                res.json({ status: true, message: { alert_message: "This Experience enabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Experience row id  or already enabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Experience level.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await experience_levelsM.findOne({ _id: request_row_id, active_status: true })
            if (checkQuery) {
                await experience_levelsM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })
                res.json({ status: true, message: { alert_message: "This Experience disabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Experience id  or already disabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Disable Experience level.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await experience_levelsM.findOne({ _id: request_row_id })
            if (checkQuery) {
                await experience_levelsM.deleteOne({ _id: request_row_id })
                res.json({ status: true, message: { alert_message: "This Experience deleted successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Experience id " }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Experience level.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router