const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, formImageUpload, validateAndSaveImage } = require('../../../utils/helpers/helper')

const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const professional_positionsM = require('../../../models/app/static/professional_positionsM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')


router.post('/update_manual_detail', [
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const date_n_time = getPresentDateTime()

        let email_id = ''
        if (req.body.email_id) {
            email_id = (sanitize(req.body.email_id)).toLowerCase()
            const check_user_query = await professionalsM.findOne({ email_id: email_id }).collation({ locale: 'en', strength: 2 })
            if (check_user_query) {
                errObj['email_id'] = 'Sorry, This Email ID is already exist.'
            }
            else {
                const check_manual_user_query = await professionals_manual_retrievalsM.findOne({ email_id: email_id }).collation({ locale: 'en', strength: 2 })
                if (check_manual_user_query) {
                    errObj['email_id'] = 'Sorry, This Email ID is already exist.'
                }
            }
        }

        const check_in_array = [1, 2]
        let company_type = ''
        let company_row_id = ''
        let position_row_id = ''
        if (req.body.company_type && req.body.company_row_id && req.body.position_row_id) {
            if (check_in_array.includes(Number.parseInt(req.body.company_type))) {
                company_type = Number.parseInt(req.body.company_type)
                company_row_id = Number.parseInt(req.body.company_row_id)
                if (company_type == 1) {
                    const check_company_query = await companyM.findOne({ _id: company_row_id })
                    if (!check_company_query) {
                        errObj['alert_message'] = 'The Company Row ID field is invalid.'
                    }
                }
                else if (company_type == 2) {
                    const check_manual_company_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
                    if (!check_manual_company_query) {
                        errObj['alert_message'] = 'The Manual Company Row ID field is invalid.'
                    }
                }
            }
            else {
                errObj['alert_message'] = 'The Company Type field cotain value 1 or 2.'
            }

            if (!Number.isNaN(Number.parseInt(req.body.position_row_id))) {
                position_row_id = Number.parseInt(req.body.position_row_id)
                const get_query = await professional_positionsM.findOne({ _id: position_row_id, active_status: true })
                if (!get_query) {
                    errObj['position_row_id'] = 'Sorry, Invalid position row id.'
                }
            }

        }

        let profile_image = ""
        if (!Object.keys(errObj).length) {
            if (req.body.profile_image) {
                const validate_n_save_image = await validateAndSaveImage(req.body.profile_image, 6)
                if (!validate_n_save_image.status) {
                    errObj['profile_image'] = 'Sorry, Invalid Profile Image.'
                }
                else {
                    profile_image = validate_n_save_image.webp_file_name
                }
            }
            // }
        }

        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj })
        }
        else {
            let used_counts = 0
            const get_counts_query = await professionals_manual_retrievalsM.findOne({ used_counts: 1 })
            if (get_counts_query) {
                used_counts = Number.parseInt(get_counts_query.used_counts) + 1
            }
            const full_name = req.body.full_name
            const gender = Number.parseInt(req.body.gender) ? Number.parseInt(req.body.gender) : 0

            const update_array = {
                gender: gender,
                full_name: full_name,
                email_id,
                used_counts,
                profile_image,
                mobile_number: req.body.mobile_number,
                user_link: req.body.user_link,
                created_on: date_n_time,
                updated_on: date_n_time
            }

            const insert_query = await professionals_manual_retrievalsM(update_array).save()
            const manual_user_row_id = insert_query._id
            if (company_type && company_row_id && position_row_id) {
                let experience_array = {
                    user_account_type: 2,
                    user_row_id: manual_user_row_id,
                    employment_type: 1,
                    position_row_id: position_row_id,
                    public_view: true,
                    company_type,
                    company_row_id,
                    till_date_status: 2
                }

                await professionals_work_experienceM(experience_array).save()
                await deleteKeysByPattern('app_users_list_*')
            }

            const manual_data = {
                _id: manual_user_row_id,
                user_account_type: 2,
                gender,
                full_name,
                email_id,
                company_type,
                profile_image,
                company_row_id,
                position_row_id
            }

            res.json({
                status: true, message: {
                    manual_data: manual_data,
                    alert_message: "The manual user details has been listed successfully."
                }
            })
        }
    }
    catch (err) {
        console.log('Update manual user details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.post('/edit_manual_detail', [
    check('user_row_id')
        .trim().not().isEmpty().withMessage('The Manual user row id field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let user_row_id = 0
        if (req.body.user_row_id) {
            user_row_id = Number.parseInt(req.body.user_row_id)
            const check_manual_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })
            if (check_manual_query) {
                if (check_manual_query.profile_image) {
                    errObj['profile_image'] = 'The profile image for this user is already exist.'
                }
            }
            else {
                errObj['user_row_id'] = 'Sorry, Invalid manual user row id.'
            }
        }

        let profile_image = ""
        if (!Object.keys(errObj).length) {
            if (req.files) {
                if (req.body.profile_image) {
                    const validate_n_save_image = await validateAndSaveImage(req.body.profile_image, 6)
                    if (!validate_n_save_image.status) {
                        errObj['profile_image'] = 'Sorry, Invalid Profile Image.'
                    }
                    else {
                        profile_image = validate_n_save_image.webp_file_name
                    }
                }
                else {
                    errObj['profile_image'] = 'The profile image field is required.'
                }
            }
            else {
                errObj['profile_image'] = 'The profile image field is required.'
            }
        }

        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj, req: req.files })
        }
        else {
            await professionals_manual_retrievalsM.updateOne({ _id: user_row_id }, { $set: { profile_image: profile_image } })
            const get_manual_user_query = await professionals_manual_retrievalsM.findOne({ _id: user_row_id })
            await deleteKeysByPattern('app_users_list_*')
            res.json({
                status: true, message: {
                    manual_data: get_manual_user_query,
                    alert_message: "The manual user details has been listed successfully."
                }
            })
        }

    }
    catch (err) {
        console.log('Edit manual user details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})



module.exports = router
