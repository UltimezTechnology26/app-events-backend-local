require('dotenv').config()
const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require("bcryptjs")
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { arrangeValidation, getPresentDateTime, getIPAddress, getIntIdFromArray } = require('../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../middleware/authorization')

const authM = require('../../models/admin_panel/admin_authM')
const sub_adminM = require('../../models/admin_panel/app/sub_adminM')
const admin_ip_addressM = require('../../models/admin_panel/admin_ip_addressM')
const JWT_ADMIN_SECRET_KEY = process.env.JWT_ADMIN_SECRET_KEY


//login functionality starts here 
router.post('/login', [
    check('login_id')
        .not().isEmpty().withMessage('The Login ID field is required.'),
    check('password')
        .not().isEmpty().withMessage('The Password field is required.')
        .isLength({ min: 6 }).withMessage('The Password field must be at least 6 characters in length.')
],
    async function (req, res) {
        try {
            const errors = validationResult(req)
            const errObj = arrangeValidation(errors)

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {

                const rowData = await authM.findOne({ email_id: sanitize(req.body.login_id) })
                if (rowData) {
                    const validPassword = await bcrypt.compare(sanitize(req.body.password), rowData.password)
                    if (validPassword) {
                        let resultArray = {}
                        let jsonTokenGenObj = {
                            expire_at: (3.5 * 60 * 60 * 1000) + (new Date().getTime()),
                            admin_row_id: 1,
                            admin_manager_type: 1,
                            sub_admin_type: 1,
                            issued_at: new Date().getTime()
                        }
                        const jwt_token = jwt.sign(jsonTokenGenObj, JWT_ADMIN_SECRET_KEY)

                        let ip_array = await getIPAddress(req)
                        if (ip_array.length > 0) {
                            let arrIp = []
                            ip_array = await ip_array[0].replace("::ffff:", "")
                            arrIp.push(ip_array)

                            const saveData = new admin_ip_addressM({ admin_manager_type: 1, admin_row_id: 0, login_ip_address: arrIp, date_n_time: getPresentDateTime() })
                            await saveData.save()
                        }

                        resultArray['token'] = jwt_token
                        resultArray['_id'] = 1
                        resultArray['full_name'] = rowData.full_name
                        resultArray['email_id'] = rowData.email_id
                        resultArray['admin_manager_type'] = 1
                        resultArray['create_type_row_id'] = []

                        res.json({ status: true, message: resultArray })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Login Credentials.' } })
                    }
                }
                else {
                    const subAdminData = await sub_adminM.findOne({ email_id: sanitize(req.body.login_id), login_status: 1 })
                    if (subAdminData) {
                        const create_types = await getIntIdFromArray(subAdminData.create_type_row_id)

                        const validPassword = await bcrypt.compare(req.body.password, subAdminData.password)
                        if (validPassword) {
                            let jsonTokenGenObj = {
                                expire_at: (3.5 * 60 * 60 * 1000) + (new Date().getTime()),
                                admin_row_id: subAdminData._id,
                                admin_manager_type: 2,
                                admin_access_types: create_types,
                                sub_admin_type: subAdminData.sub_admin_type ? subAdminData.sub_admin_type : 1,
                                issued_at: new Date().getTime()
                            }
                            const jwt_token = jwt.sign(jsonTokenGenObj, JWT_ADMIN_SECRET_KEY)

                            let ip_array = await getIPAddress(req)
                            if (ip_array.length > 0) {
                                let arrIp = []
                                ip_array = await ip_array[0].replace("::ffff:", "")
                                arrIp.push(ip_array)

                                const saveIpData = new admin_ip_addressM({ admin_manager_type: 2, admin_row_id: Number.parseInt(subAdminData._id), login_ip_address: arrIp, date_n_time: getPresentDateTime() })
                                await saveIpData.save()
                            }

                            let resultArray = {}
                            resultArray['token'] = jwt_token
                            resultArray['_id'] = subAdminData._id
                            resultArray['full_name'] = subAdminData.full_name
                            resultArray['email_id'] = subAdminData.email_id
                            resultArray['admin_manager_type'] = 2
                            resultArray['sub_admin_type'] = subAdminData.sub_admin_type ? subAdminData.sub_admin_type : 1
                            resultArray['create_type_row_id'] = create_types

                            res.json({ status: true, message: resultArray })
                        }
                        else {
                            res.json({ status: false, message: { alert_message: 'Invalid Login Credentials.' } })
                        }

                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Login Credentials.' } })
                    }
                }

            }

        }
        catch (err) {
            console.log('Admin page login', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }

    })
//login api ends here

router.get('/details', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const admin_manager_type = Number.parseInt(checkToken.message.admin_manager_type)

            if (admin_manager_type === 1) {
                const rowData = await authM.findOne({ _id: admin_row_id })
                if (rowData) {
                    let resultArray = {}

                    resultArray['_id'] = rowData._id
                    resultArray['full_name'] = rowData.full_name
                    resultArray['email_id'] = rowData.email_id
                    resultArray['date_n_time'] = rowData.date_n_time

                    res.json({ status: true, message: resultArray })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Something Went Wrong' } })
            }
        }
        catch (err) {
            console.log('Details.', err.message)
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

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const admin_row_id = Number.parseInt(checkToken.message.admin_row_id)
            const oldData = await authM.findOne({ _id: admin_row_id })
            if (oldData) {
                if (!errObj.current_password) {
                    const validPassword = await bcrypt.compare(sanitize(req.body.current_password), oldData.password)
                    if (!validPassword) {
                        errObj['current_password'] = 'Sorry, The current password is not matching.'
                    }
                    else if (sanitize(req.body.current_password) === sanitize(req.body.new_password)) {
                        errObj['new_password'] = 'The new password cannot be your current password'
                    }


                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let new_password = await bcrypt.hash(req.body.new_password, 10)

                await authM.updateOne({ _id: admin_row_id }, { $set: { password: new_password } })

                res.json({ status: true, message: 'Admin login password updated successfully' })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Change Password.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_details', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const admin_row_id = checkToken.message.admin_row_id

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                await authM.updateOne({ _id: admin_row_id }, { $set: { full_name: req.body.full_name } })

                res.json({ status: true, message: { alert_message: 'Your Profile Details Updated Successfully' } })
            }
        }
        else {
            res.json(checkToken)
        }
    }
    catch (err) {
        console.log('Update Details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/last_login_list/:skip/:limit', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const queryRun = await admin_ip_addressM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup:
                    {
                        from: "cln_sub_admins",
                        localField: "admin_row_id",
                        foreignField: "_id",
                        as: "subadmin_info"
                    }
                },
                { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
                {
                    $project:
                    {
                        _id: 1,
                        admin_manager_type: 1,
                        admin_row_id: 1,
                        date_n_time: 1,
                        login_ip_address: 1,
                        full_name: "$subadmin_info.full_name"
                    }
                }
            ]).skip(skip).limit(limit)
            const count_query = await admin_ip_addressM.aggregate([
                { $sort: { _id: -1 } },
                {
                    $lookup: {
                        from: "cln_sub_admins",
                        localField: "admin_row_id",
                        foreignField: "_id",
                        as: "subadmin_info"
                    }
                },
                { $unwind: { path: "$subadmin_info", preserveNullAndEmptyArrays: true } },
                { $count: "count" }
            ])

            const totalCount = count_query.length > 0 ? count_query[0].count : 0

            res.json({ status: true, message: queryRun, count: totalCount, })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Last login list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router