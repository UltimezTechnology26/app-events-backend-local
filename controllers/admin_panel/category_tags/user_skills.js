const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../../middleware/authorization')

const user_skillsM = require('../../../models/app/static/user_skillsM')

router.get('/list', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await user_skillsM.find()

            res.json({ status: true, message: queryRun })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('User skills list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/save', [
    check('skill_name')
        .trim().not().isEmpty().withMessage('The Skill Name field is required')

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

                const insertArr = new user_skillsM({ skill_name: req.body.skill_name, active_status: true, date_n_time: getPresentDateTime() })
                await insertArr.save()

                res.json({ status: true, message: { alert_message: "New Skill created successfully." } })

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Save User skills.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update/:request_row_id', [
    check('skill_name')
        .trim().not().isEmpty().withMessage('The Skill Name field is required')

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

                await user_skillsM.updateOne({ _id: Number.parseInt(req.params.request_row_id) }, { $set: { skill_name: req.body.skill_name } })

                res.json({ status: true, message: { alert_message: "User Skills updated successfully." } })

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update User skills.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable/:skill_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const skill_row_id = Number.parseInt(req.params.skill_id)
            const checkQuery = await user_skillsM.findOne({ _id: skill_row_id, active_status: false })
            if (checkQuery) {
                await user_skillsM.updateOne({ _id: skill_row_id }, { $set: { active_status: true } })
                res.json({ status: true, message: { alert_message: "This skill enabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid skill id or already enabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Enable User skills.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/disable/:skill_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const skill_row_id = Number.parseInt(req.params.skill_id)
            const checkQuery = await user_skillsM.findOne({ _id: skill_row_id, active_status: true })
            if (checkQuery) {
                await user_skillsM.updateOne({ _id: skill_row_id }, { $set: { active_status: false } })
                res.json({ status: true, message: { alert_message: "This skill disabled successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid skill id or already disabled." } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable User skills.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:skill_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const skill_row_id = Number.parseInt(req.params.skill_id)
            const checkQuery = await user_skillsM.findOne({ _id: skill_row_id })
            if (checkQuery) {
                await user_skillsM.deleteOne({ _id: skill_row_id })
                res.json({ status: true, message: { alert_message: "This skill deleted successfully." } })
            }
            else {
                res.json({ status: false, message: { alert_message: "Sorry, Invalid skill id" } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete User skills.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router