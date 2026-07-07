const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime, generateCategoryId } = require('../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../config/authorization')

const crypto_categoryM = require('../../models/app/static/crypto_categoryM')
const user_designationsM = require('../../models/app/static/user_designationsM')


router.get('/cryto_category_list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await crypto_categoryM.find({},
                {
                    _id: 1,
                    category_name: 1,
                    title: 1,
                    description: 1,
                    category_id: 1,
                    cmc_id: 1,
                    active_status: 1,
                    date_n_time: 1
                })


            res.json({ status: true, message: queryRun })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Crypto category list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_cryto_category', [
    check('category_name')
        .trim().not().isEmpty().withMessage('The category name field is required'),
    check('title')
        .trim().not().isEmpty().withMessage('The title field is required'),
    check('description')
        .trim().not().isEmpty().withMessage('The description field is required'),
    check('category_id')
        .trim().not().isEmpty().withMessage('The category id field is required')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let category_row_id = 0
        if (req.body.category_row_id) {
            if (!Number.isNaN(req.body.category_row_id)) {
                const check_query = await crypto_categoryM.findOne({ _id: Number.parseInt(sanitize(req.body.category_row_id)) })
                if (check_query) {
                    category_row_id = Number.parseInt(sanitize(req.body.category_row_id))
                }
            }
        }

        let category_id = ""
        if (req.body.category_id) {
            category_id = await generateCategoryId(sanitize(req.body.category_id))
            const check_category_id = await crypto_categoryM.findOne({ category_id: category_id, _id: { $ne: category_row_id } })
            if (check_category_id) {
                errObj['category_id'] = 'Sorry, This category id is already exist.'
            }
        }

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let update_array = {}
                update_array['category_name'] = req.body.category_name
                update_array['title'] = req.body.title
                update_array['description'] = req.body.description
                update_array['cmc_id'] = req.body.cmc_id
                update_array['category_id'] = category_id

                if (category_row_id) {
                    update_array['date_n_time'] = getPresentDateTime()

                    await crypto_categoryM(update_array).save()
                    res.json({ status: true, message: { alert_message: "New Crypto category details has been added successfully." } })
                }
                else {
                    await crypto_categoryM.updateOne({ _id: category_row_id }, { $set: update_array })
                    res.json({ status: true, message: { alert_message: "This Crypto category details has been updated successfullyyhukykjh." } })
                }

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update Crypto category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable_category/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)
            const checkQuery = await crypto_categoryM.findOne({ _id: category_row_id, active_status: false })
            if (checkQuery) {
                await crypto_categoryM.updateOne({ _id: category_row_id }, { $set: { active_status: true } })
                res.json({ status: true, message: { alert_message: "This business model enabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid business model id or already enabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable_category/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)
            const checkQuery = await crypto_categoryM.findOne({ _id: category_row_id })
            if (checkQuery) {
                await crypto_categoryM.updateOne({ _id: category_row_id }, { $set: { active_status: false } })
                res.json({ status: true, message: { alert_message: "This business model disabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid business model id or already disabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_category/:category_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const category_row_id = Number.parseInt(req.params.category_row_id)
            const checkQuery = await crypto_categoryM.findOne({ _id: category_row_id })
            if (checkQuery) {
                await crypto_categoryM.deleteOne({ _id: category_row_id })
                res.json({ status: true, message: { alert_message: "This business model deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid business model id" } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Delete category.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/user_position_list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await user_designationsM.find({}, { _id: 1, designation_name: 1, active_status: 1, date_n_time: 1, show_in_job_status: 1 })

            res.json({ status: true, message: queryRun })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('User position list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save_n_add_position', [
    check('designation_name')
        .trim().not().isEmpty().withMessage('The Designation Name field is required')

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

                const insertArr = new user_designationsM({ designation_name: req.body.designation_name, show_in_job_status: req.body.show_in_job_status, date_n_time: getPresentDateTime() })
                await insertArr.save()

                res.json({ status: true, message: { alert_message: "New User Designation created successfully." } })

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Save and add position.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_position/:designation_id', [
    check('designation_name')
        .trim().not().isEmpty().withMessage('The Designation Name field is required')

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
                await user_designationsM.updateOne({ _id: Number.parseInt(req.params.designation_id) }, { $set: { designation_name: req.body.designation_name, show_in_job_status: req.body.show_in_job_status, date_n_time: getPresentDateTime() } })

                res.json({ status: true, message: { alert_message: "Position update successfully." } })

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update position.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable_position/:designation_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const designation_row_id = Number.parseInt(req.params.designation_id)
            const checkQuery = await user_designationsM.findOne({ _id: designation_row_id, active_status: false })
            if (checkQuery) {
                await user_designationsM.updateOne({ _id: designation_row_id }, { $set: { active_status: true } })
                res.json({ status: true, message: { alert_message: "This designation enabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid designation id or already enabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable Position.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable_position/:designation_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const designation_row_id = Number.parseInt(req.params.designation_id)
            const checkQuery = await user_designationsM.findOne({ _id: designation_row_id })
            if (checkQuery) {
                await user_designationsM.updateOne({ _id: designation_row_id }, { $set: { active_status: false } })
                res.json({ status: true, message: { alert_message: "This designation disabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid designation id or already disabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable Position.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_position/:designation_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const designation_row_id = Number.parseInt(req.params.designation_id)
            const checkQuery = await user_designationsM.findOne({ _id: designation_row_id })
            if (checkQuery) {
                await user_designationsM.deleteOne({ _id: designation_row_id })
                res.json({ status: true, message: { alert_message: "This position deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid business model id" } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete Position.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router