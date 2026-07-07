const express = require('express')
const bcrypt = require("bcryptjs")
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { arrangeValidation } = require('../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../middleware/authorization')

const sub_adminM = require('../../models/admin_panel/app/sub_adminM')

router.post('/update_sub_admin_detail', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (checkToken.status) {
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)

            if (admin_manager_type === 2) {

                if (Object.keys(errObj).length > 0) {
                    res.json({ status: false, message: errObj })
                }
                else {
                    const insertArray = {
                        full_name: req.body.full_name
                    }
                    await sub_adminM.updateOne({ _id: admin_row_id }, { $set: insertArray })

                    res.json({ status: true, message: { alert_message: 'Sub Admin details Updated Successfully.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Something Went Wrong' } })
            }

        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Update sub admin details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }


})

router.get('/details', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [-1])
    if (checkToken.status) {
        try {
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)

            if (admin_manager_type === 2) {
                const subAdminData = await sub_adminM.findOne({ _id: admin_row_id })
                if (subAdminData) {
                    const resultArray = {}

                    resultArray['_id'] = subAdminData._id
                    resultArray['full_name'] = subAdminData.full_name
                    resultArray['email_id'] = subAdminData.email_id
                    resultArray['date_n_time'] = subAdminData.date_n_time

                    res.json({ status: true, message: resultArray })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Something Went Wrong' } })
            }
        }
        catch (err) {
            console.log('Individual sub admin details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/change_password', [
    check('current_password')
        .trim().not().isEmpty().withMessage('The Current Password field is required.')
        .isLength({ min: 6 }).withMessage('The Current Password field must be at least 6 characters in length.'),
    check('new_password')
        .trim().not().isEmpty().withMessage('The New Password field is required.')
        .isLength({ min: 6 }).withMessage('The New Password field must be at least 6 characters in length.'),
    check('confirm_new_password')
        .trim().not().isEmpty().withMessage('The Confirm New Password field is required.')
        .isLength({ min: 6 }).withMessage('The Password field must be at least 6 characters in length.')
        .custom((val, { req }) => { return req.body.new_password === val }).withMessage("The Confirm New Password field must be same as New Password")
], async function (req, res) {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [-1])
        if (checkToken.status) {
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)

            if (admin_manager_type === 2) {
                const subAdminOldData = await sub_adminM.findOne({ _id: admin_row_id })
                if (subAdminOldData) {
                    if (!errObj.current_password) {
                        const validPassword = await bcrypt.compare(req.body.current_password, subAdminOldData.password)
                        if (!validPassword) {
                            errObj['current_password'] = 'Sorry, The current password is not matching'
                        }
                        else if (req.body.current_password == req.body.new_password) {
                            errObj['new_password'] = 'The new password cannot be your current password'
                        }
                    }
                }


                if (Object.keys(errObj).length > 0) {
                    res.json({ status: false, message: errObj })
                }
                else {
                    let new_password = await bcrypt.hash(req.body.new_password, 10)

                    await sub_adminM.updateOne({ _id: admin_row_id }, { $set: { password: new_password } })

                    res.json({ status: true, message: 'Subadmin login password updated successfully' })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Something Went Wrong' } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Change sub admin password.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router