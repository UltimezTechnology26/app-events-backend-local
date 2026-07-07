const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const job_languageM = require('../../../models/app/static/job_languageM')

router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await job_languageM.find({ active_status: true }, { _id: 1, category_name: 1, active_status: 1, date_n_time: 1 })

            res.json({ status: true, message: queryRun, tokenStatus: true })
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Job language list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save_and_update', [
    check('category_name')
        .trim().not().isEmpty().withMessage('The Category Name field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else if (req.body.category_id) {
                const checkCategory = await job_languageM.findOne({ _id: sanitize(req.body.category_id) })
                if (checkCategory) {
                    await job_languageM.updateOne({ _id: req.body.category_id }, { $set: { category_name: req.body.category_name, date_n_time: getPresentDateTime() } })

                    res.json({ status: true, message: { alert_message: "Category Name updated successfully." }, tokenStatus: true })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Invalid Category Name." }, tokenStatus: true })
                }
            }
            else {
                await job_languageM({ category_name: req.body.category_name, active_status: true, date_n_time: getPresentDateTime() }).save()

                res.json({ status: true, message: { alert_message: "New Category Name created successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Save and Update Job language.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)
            const checkQuery = await job_languageM.findOne({ _id: category_row_id, active_status: false })
            if (checkQuery) {
                await job_languageM.updateOne({ _id: category_row_id }, { $set: { active_status: true } })
                res.json({ status: true, message: { alert_message: "This category enabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid category id or already enabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Job language.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)
            const checkQuery = await job_languageM.findOne({ _id: category_row_id, active_status: true })
            if (checkQuery) {
                await job_languageM.updateOne({ _id: category_row_id }, { $set: { active_status: false } })
                res.json({ status: true, message: { alert_message: "This category disabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid category id or already disabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable Job language.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)
            const checkQuery = await job_languageM.findOne({ _id: category_row_id })
            if (checkQuery) {
                await job_languageM.deleteOne({ _id: category_row_id })
                res.json({ status: true, message: { alert_message: "This category deleted successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid category id" }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Job language.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router