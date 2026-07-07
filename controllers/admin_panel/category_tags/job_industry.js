const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const jobs_industryM = require('../../../models/app/static/jobs_industryM')

router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await jobs_industryM.find()

            res.json({ status: true, message: queryRun, tokenStatus: true })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Job Industry list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save', [
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
            else {
                await jobs_industryM({ category_name: req.body.category_name, active_status: true, date_n_time: getPresentDateTime() }).save()

                res.json({ status: true, message: { alert_message: "New Category Name created successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Save Job Industry.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update/:request_row_id', [
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
            else {
                let request_row_id = Number.parseInt(req.params.request_row_id)
                await jobs_industryM.updateOne({ _id: request_row_id }, { category_name: req.body.category_name })

                res.json({ status: true, message: { alert_message: "Category Name updated successfully." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update Job Industry.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await jobs_industryM.findOne({ _id: request_row_id, active_status: false })
            if (checkQuery) {
                await jobs_industryM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })
                res.json({ status: true, message: { alert_message: "This Category name enabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Category name id  or already enabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Job Industry.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await jobs_industryM.findOne({ _id: request_row_id, active_status: true })
            if (checkQuery) {
                await jobs_industryM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })
                res.json({ status: true, message: { alert_message: "This Category Name disabled successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Category Name id  or already disabled." }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable Job Industry.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:request_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const request_row_id = Number.parseInt(req.params.request_row_id)
            const checkQuery = await jobs_industryM.findOne({ _id: request_row_id })
            if (checkQuery) {
                await jobs_industryM.deleteOne({ _id: request_row_id })
                res.json({ status: true, message: { alert_message: "This Category Name deleted successfully." }, tokenStatus: true })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid Category Name id " }, tokenStatus: true })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Job Industry.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router