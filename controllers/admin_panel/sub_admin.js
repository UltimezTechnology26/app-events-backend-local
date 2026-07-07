const express = require('express')
const bcrypt = require("bcryptjs")
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, getIntIdFromArray } = require('../../utils/helpers/helper')
const { checkAdminLoginToken } = require('../../middleware/authorization')

const sub_adminM = require('../../models/admin_panel/app/sub_adminM')
const sub_admin_access_typeM = require('../../models/admin_panel/app/sub_admin_access_typeM')
const sub_admin_emailsM = require('../../models/admin_panel/app/sub_admin_emailsM')

router.get('/list/:skip/:limit', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                        { mobile_number: { '$regex': req.query.search, $options: 'i' } }
                    ]
                }
            }

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const queryRun = await sub_adminM.find(query, { _id: 1, email_id: 1, create_type_row_id: 1, mobile_number: 1, login_status: 1, date_n_time: 1, full_name: 1 }).sort({ _id: -1 }).skip(skip).limit(limit)

            let myArray = []
            if (queryRun) {
                for (let run of queryRun) {
                    const innerObj = {}
                    innerObj['_id'] = run._id
                    innerObj['full_name'] = run.full_name
                    innerObj['email_id'] = run.email_id
                    innerObj['mobile_number'] = run.mobile_number
                    innerObj['login_status'] = run.login_status
                    innerObj['sub_admin_type'] = run.sub_admin_type
                    innerObj['date_n_time'] = run.date_n_time
                    innerObj['create_type_row_id'] = await getIntIdFromArray(run.create_type_row_id)
                    innerObj['create_types_query'] = await sub_admin_access_typeM.find({ _id: { $in: run.create_type_row_id }, type_status: 1 }, { create_type_name: 1, _id: 1 })

                    const new_object = await Promise.resolve(innerObj)
                    myArray.push(new_object)
                }
            }

            res.json({ status: true, message: myArray, countQueryRun: queryRun.length })
        }
        catch (err) {
            console.log('Sub admins list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/create_sub_admin', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
    check('email_id').trim().not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
        .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.'),
    // .normalizeEmail(),
    check('password')
        .trim().not().isEmpty().withMessage('The Password field is required')
        .isLength({ min: 6 }).withMessage('The Password field must be at least 6 characters in length.')
        .isLength({ max: 50 }).withMessage('The Password field must be less than 50 characters in length.'),
    check('create_type_row_id')
        .not().isEmpty().withMessage('The Create Type Row Id field is required'),
    check('sub_admin_type')
        .not().isEmpty().withMessage('The Subadmin Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The Subadmin Type field must contains only integers.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }
        const email_id = (sanitize(req.body.email_id)).toLowerCase()
        const checkEmailId = await sub_adminM.findOne({ email_id: email_id })
        if (checkEmailId) {
            errObj['email_id'] = 'Sorry, This Email ID already exists.'
        }

        let create_type_row_id = []
        let create_type_row_id_array = await getIntIdFromArray(req.body.create_type_row_id)
        if (create_type_row_id_array.length > 0) {
            create_type_row_id = create_type_row_id_array
        }
        else {
            errObj['create_type_row_id'] = 'The Create type row Ids field must be integer in object'
        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let password = await bcrypt.hash(req.body.password, 10)

            const save_query = await sub_adminM({
                full_name: req.body.full_name,
                email_id: email_id,
                mobile_number: (req.body.mobile_number) ? req.body.mobile_number : "",
                password: password,
                create_type_row_id: create_type_row_id,
                login_status: 1,
                date_n_time: getPresentDateTime(),
                sub_admin_type: req.body.sub_admin_type ? Number.parseInt(req.body.sub_admin_type) : 1
            }).save()

            res.json({ status: true, message: { alert_message: "The sub admin details created successfully.", save_query } })

        }

    }
    catch (err) {
        console.log('Create sub admin.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_sub_admin_detail/:sub_admin_row_id', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
    check('email_id')
        .trim().not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
        // .normalizeEmail()
        .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.'),
    check('create_type_row_id')
        .not().isEmpty().withMessage('The Create Type Row Id field is required'),
    check('sub_admin_type')
        .not().isEmpty().withMessage('The Subadmin Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The Subadmin Type field must contains only integers.'),
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }

        const email_id = (sanitize(req.body.email_id)).toLowerCase()
        const mobile_number = req.body.mobile_number

        const queryRun = await sub_adminM.findOne({ _id: sanitize(req.params.sub_admin_row_id) })
        if (queryRun) {
            const checkEmailId = await sub_adminM.findOne({ $and: [{ _id: { $ne: sanitize(queryRun._id) } }, { email_id: email_id }] })
            if (checkEmailId) {
                errObj['email_id'] = 'Sorry, This Email ID already exists.'
            }

        }
        else {
            errObj['alert_message'] = 'Sorry! Invalid Sub admin Row ID'
        }

        let create_type_row_id = []
        let create_type_row_id_array = await getIntIdFromArray(req.body.create_type_row_id)
        if (create_type_row_id_array.length > 0) {
            create_type_row_id = create_type_row_id_array
        }
        else {
            errObj['create_type_row_id'] = 'The Create type row Ids field must be integer in object'
        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const insertArray = {
                full_name: req.body.full_name,
                email_id: email_id,
                mobile_number: mobile_number,
                create_type_row_id: create_type_row_id,
                sub_admin_type: req.body.sub_admin_type ? Number.parseInt(req.body.sub_admin_type) : 1
            }
            await sub_adminM.updateOne({ _id: req.params.sub_admin_row_id }, { $set: insertArray })

            res.json({ status: true, message: { alert_message: 'Sub Admin details Updated Successfully.' } })
        }

    }
    catch (err) {
        console.log('Update sub admin details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/enable_user/:sub_admin_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            let sub_admin_row_id = Number.parseInt(req.params.sub_admin_row_id)
            const queryRun = await sub_adminM.findOne({ _id: sub_admin_row_id })
            if (queryRun) {
                const checkLoginStatus = await sub_adminM.findOne({ _id: sub_admin_row_id, login_status: 0 })
                if (checkLoginStatus) {
                    await sub_adminM.updateOne({ _id: sub_admin_row_id, login_status: 0 }, { $set: { login_status: 1 } })


                    res.json({ status: true, message: { alert_message: 'Sub Admin Enabled Successfully.' } })
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Sub Admin is already Enabled.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry! Invalid Sub Admin Row Id.' } })
            }
        }
        catch (err) {
            console.log('Enable sub admin .', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }

})

router.post('/disable_user/:sub_admin_row_id', [
    check('reason_for_disable')
        .trim().not().isEmpty().withMessage('The Reason for Disabled field is required')
        .isLength({ min: 4 }).withMessage('The Reason for Disabled field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Reason for Disabled field must be less than 200 characters in length.'),

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
                let sub_admin_row_id = Number.parseInt(req.params.sub_admin_row_id)
                const queryRun = await sub_adminM.findOne({ _id: sub_admin_row_id })
                if (queryRun) {
                    const checkLoginStatus = await sub_adminM.findOne({ _id: sub_admin_row_id, login_status: 1 })
                    if (checkLoginStatus) {
                        let updateArray = {
                            login_status: 0,
                            disabled_reason: req.body.reason_for_disable,
                            disabled_date_n_time: getPresentDateTime()
                        }

                        await sub_adminM.updateOne({ _id: sub_admin_row_id, login_status: 1 }, { $set: updateArray })


                        res.json({ status: true, message: { alert_message: 'Sub Admin Disabled Successfully.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Sorry! Sub Admin is already Disabled.' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry! Invalid Sub Admin Row Id.' } })
                }

            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Disable sub admin.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/individual/:user_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            const queryRun = await sub_adminM.findOne({ _id: Number.parseInt(req.params.user_row_id) }, { _id: 1, full_name: 1, mobile_number: 1, email_id: 1, login_status: 1, date_n_time: 1, create_type_row_id: 1, sub_admin_type: 1 })

            if (queryRun) {
                let innerObj = {}

                innerObj['_id'] = queryRun._id
                innerObj['full_name'] = queryRun.full_name
                innerObj['mobile_number'] = queryRun.mobile_number
                innerObj['email_id'] = queryRun.email_id
                innerObj['login_status'] = queryRun.login_status
                innerObj['date_n_time'] = queryRun.date_n_time
                innerObj['sub_admin_type'] = queryRun.sub_admin_type
                innerObj['create_type_row_id'] = await getIntIdFromArray(queryRun.create_type_row_id)
                innerObj['create_types_query'] = await sub_admin_access_typeM.find({ _id: { $in: queryRun.create_type_row_id } }, { create_type_name: 1, _id: 1 })

                res.json({ status: true, message: innerObj })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry! Invalid User Row id' } })
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

router.get('/add_access_type', async (req, res) => {
    try {
        const insert_query = "working" //await sub_admin_access_typeM({ create_type_name : "Coinpedia Academy", type_status:1 }).save()
        res.json({ status: true, message: insert_query })

    }
    catch (err) {
        console.log('Add access type.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/access_types', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await sub_admin_access_typeM.find({ type_status: 1 }, { _id: 1, create_type_name: 1 })

            res.json({ status: true, message: queryRun })
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Access types list.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete_sub_admin/:sub_admin_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await sub_adminM.findOne({ _id: Number.parseInt(req.params.sub_admin_row_id) })
            if (queryRun) {
                await sub_adminM.deleteOne({ _id: Number.parseInt(req.params.sub_admin_row_id) })

                res.json({ status: true, message: { alert_message: 'Subadmin Deleted Successfully' } })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Invalid Subadmin Row id' } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete sub admin.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.post('/update_subadmin_password/:sub_admin_row_id', [
    check('new_password')
        .trim().not().isEmpty().withMessage('The New password field is required.')
        .isLength({ min: 6 }).withMessage('The New Password field must be at least 6 characters in length.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkAdminToken = checkAdminLoginToken(req.headers, [0])
        if (checkAdminToken.status) {
            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const sub_admin_row_id = Number.parseInt(req.params.sub_admin_row_id)
                const queryRunCheck = await sub_adminM.findOne({ _id: sub_admin_row_id })
                if (queryRunCheck) {
                    let get_password = await bcrypt.hash(req.body.new_password, 10)

                    await sub_adminM.updateOne({ _id: sub_admin_row_id }, { $set: { password: get_password } })

                    res.json({ status: true, message: { alert_message: "Profile Password Updated Successfully" } })
                }
                else {
                    res.json({ status: false, message: { alert_message: "Inavlid Sub Admin Row Id" } })
                }

            }
        }
        else {
            res.json(checkAdminToken)
        }

    }
    catch (err) {
        console.log('Update sub admin password.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


// sub admin emails
router.post('/add_sub_admin_email', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
    check('email_id').trim().not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
        .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.'),
    // .normalizeEmail(),
    check('type')
        .trim().not().isEmpty().withMessage('The Type field is required')
        .isInt({ min: 1, max: 3 }).withMessage('The  Type field must be contains only integers.'),

], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }
        let sub_admin_row_id = 0
        const email_id = (sanitize(req.body.email_id)).toLowerCase()

        if (req.body.sub_admin_row_id) {
            sub_admin_row_id = Number.parseInt(sanitize(req.body.sub_admin_row_id))
            const check_query = await sub_admin_emailsM.findOne({ _id: sub_admin_row_id })
            if (!check_query) {
                errObj['sub_admin_row_id'] = 'Invalid sub admin row id'
            }
            const checkEmailId = await sub_admin_emailsM.findOne({ $and: [{ _id: { $ne: sub_admin_row_id } }, { email_id: email_id }] })
            if (checkEmailId) {
                errObj['email_id'] = 'Sorry, This Email ID already exists.'
            }

        }

        if (!req.body.sub_admin_row_id) {
            const checkEmailId = await sub_admin_emailsM.findOne({ email_id: email_id })
            if (checkEmailId) {
                errObj['email_id'] = 'Sorry, This Email ID already exists.'
            }

        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            let insertArray = {}

            insertArray['full_name'] = req.body.full_name
            insertArray['email_id'] = email_id
            insertArray['date_n_time'] = getPresentDateTime()
            insertArray['type'] = req.body.type
            if (req.body.sub_admin_row_id) {
                await sub_admin_emailsM.updateOne({ _id: Number.parseInt(sanitize(req.body.sub_admin_row_id)) }, { $set: insertArray })

                res.json({ status: true, message: { alert_message: 'Sub admin email details updated successfully' } })
            }
            else {

                await sub_admin_emailsM(insertArray).save()
                res.json({ status: true, message: { alert_message: "The sub admin email details created successfully." } })
            }
        }
    }
    catch (err) {
        console.log('Add sub admin email.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/view/:sub_admin_row_id', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            const queryRun = await sub_admin_emailsM.findOne({ _id: Number.parseInt(sanitize(req.params.sub_admin_row_id)) }, { _id: 1, full_name: 1, email_id: 1, date_n_time: 1, type: 1 })

            if (queryRun) {
                const innerObj = {}

                innerObj['_id'] = queryRun._id
                innerObj['full_name'] = queryRun.full_name
                innerObj['email_id'] = queryRun.email_id
                innerObj['date_n_time'] = queryRun.date_n_time
                innerObj['type'] = queryRun.type

                res.json({ status: true, message: innerObj })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry! Invalid User Row id' } })
            }
        }
        catch (err) {
            console.log('View sub admin details.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})

router.post('/edit/:sub_admin_row_id', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters in length.')
        .isLength({ max: 200 }).withMessage('The Full Name field must be less than 200 characters in length.'),
    check('email_id')
        .trim().not().isEmpty().withMessage('The Email ID field is required.')
        .isEmail().withMessage('The Email ID field must be contain valid email.')
        // .normalizeEmail()
        .isLength({ max: 220 }).withMessage('The Email ID field must be less than 220 characters in length.')

], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (!checkToken.status) {
            errObj['alert_message'] = checkToken.message
        }

        const email_id = (sanitize(req.body.email_id)).toLowerCase()

        const queryRun = await sub_admin_emailsM.findOne({ _id: sanitize(req.params.sub_admin_row_id) })
        if (queryRun) {
            const checkEmailId = await sub_admin_emailsM.findOne({ $and: [{ _id: { $ne: sanitize(queryRun._id) } }, { email_id: email_id }] })
            if (checkEmailId) {
                errObj['email_id'] = 'Sorry, This Email ID already exists.'
            }

        }
        else {
            errObj['alert_message'] = 'Sorry! Invalid Sub admin Row ID'
        }

        if (req.body.type) {
            if ((Number.parseInt(req.body.type) <= 1) && (Number.parseInt(req.body.type) >= 3)) {
                errObj['type'] = 'The type should be between 1 to 3'

            }
        }


        if (Object.keys(errObj).length > 0) {
            res.json({ status: false, message: errObj })
        }
        else {
            const insertArray = {
                full_name: req.body.full_name,
                type: req.body.type,
                email_id: email_id
            }
            await sub_admin_emailsM.updateOne({ _id: req.params.sub_admin_row_id }, { $set: insertArray })

            res.json({ status: true, message: { alert_message: 'Sub Admin details Updated Successfully.' }, insertArray: insertArray })
        }

    }
    catch (err) {
        console.log('Update sub admin details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/delete/:sub_admin_row_id', async (req, res) => {
    try {
        const checkToken = checkAdminLoginToken(req.headers, [0])
        if (checkToken.status) {
            const queryRun = await sub_admin_emailsM.findOne({ _id: Number.parseInt(req.params.sub_admin_row_id) })
            if (queryRun) {
                await sub_admin_emailsM.deleteOne({ _id: Number.parseInt(req.params.sub_admin_row_id) })

                res.json({ status: true, message: { alert_message: 'Subadmin Deleted Successfully' } })
            }
            else {
                res.json({ status: false, message: { alert_message: 'Invalid Subadmin Row id' } })
            }
        }
        else {
            res.json(checkToken)
        }

    }
    catch (err) {
        console.log('Delete sub admin details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

router.get('/sub_admin_email_list/:skip/:limit', async (req, res) => {

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (checkToken.status) {
        try {
            let query = {}
            if (req.query.search) {
                query = {
                    $or: [
                        { full_name: { '$regex': req.query.search, $options: 'i' } },
                        { email_id: { '$regex': req.query.search, $options: 'i' } },
                    ]
                }
            }

            const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
            const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100

            const queryRun = await sub_admin_emailsM.find(query, { _id: 1, email_id: 1, date_n_time: 1, full_name: 1, type: 1 }).sort({ _id: -1 }).skip(skip).limit(limit)
            const count = await sub_admin_emailsM.countDocuments({ query })

            let myArray = []
            if (queryRun) {
                for (let run of queryRun) {
                    let innerObj = {}

                    innerObj['_id'] = run._id
                    innerObj['full_name'] = run.full_name
                    innerObj['email_id'] = run.email_id
                    innerObj['date_n_time'] = run.date_n_time
                    innerObj['type'] = run.type
                    const new_object = await Promise.resolve(innerObj)
                    myArray.push(new_object)
                }
            }

            res.json({ status: true, message: myArray, countQueryRun: count })
        }
        catch (err) {
            console.log('Sub admin emails list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
        }
    }
    else {
        res.json(checkToken)
    }
})


module.exports = router