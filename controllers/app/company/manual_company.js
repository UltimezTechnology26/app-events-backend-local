const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, formImageUpload, validateAndSaveImage } = require('../../../utils/helpers/helper')

const companyM = require('../../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')


router.post('/update_manual_detail', [
    check('company_name')
        .trim().not().isEmpty().withMessage('The Company Name field is required.'),
    check('website_link')
        .trim().not().isEmpty().withMessage('The Website Link field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const date_n_time = getPresentDateTime()

        let company_name = ''
        if (req.body.company_name) {
            company_name = sanitize(req.body.company_name)
            const check_company_query = await companyM.findOne({ company_name: company_name }).collation({ locale: 'en', strength: 2 })
            if (check_company_query) {
                errObj['company_name'] = 'Sorry, This Company Name is already exist.'
            }
            else {
                const check_manual_company_query = await company_manual_retrievalsM.findOne({ company_name: company_name }).collation({ locale: 'en', strength: 2 })
                if (check_manual_company_query) {
                    errObj['company_name'] = 'Sorry, This Company Name is already exist.'
                }
            }
        }

        let company_email_id = ''
        if (req.body.company_email_id) {
            company_email_id = (sanitize(req.body.company_email_id)).toLowerCase()
            const check_company_query = await companyM.findOne({ company_email_id: company_email_id }).collation({ locale: 'en', strength: 2 })
            if (check_company_query) {
                errObj['company_email_id'] = 'Sorry, This Company Email ID is already exist.'
            }
            else {
                const check_manual_company_query = await company_manual_retrievalsM.findOne({ company_email_id: company_email_id }).collation({ locale: 'en', strength: 2 })
                if (check_manual_company_query) {
                    errObj['company_email_id'] = 'Sorry, This Company Email ID is already exist.'
                }
            }
        }

        let website_link = ''
        if (req.body.website_link) {
            website_link = (sanitize(req.body.website_link)).toLowerCase()
            const check_company_query = await companyM.findOne({ website_link: website_link }).collation({ locale: 'en', strength: 2 })
            if (check_company_query) {
                errObj['website_link'] = 'Sorry, This Website Link is already exist.'
            }
            else {
                const check_link_query = await company_manual_retrievalsM.findOne({ website_link: website_link }).collation({ locale: 'en', strength: 2 })
                if (check_link_query) {
                    errObj['website_link'] = 'Sorry, This Website Link is already exist.'
                }
            }
        }

        let company_logo = ""
        if (!Object.keys(errObj).length) {
            if (req.body.company_logo) {
                const validate_n_save_image = await validateAndSaveImage(req.body.company_logo, 7)
                if (!validate_n_save_image.status) {
                    errObj['company_logo'] = 'Sorry, Invalid Profile Image.'
                }
                else {
                    company_logo = validate_n_save_image.webp_file_name
                }
            }

        }

        if (Object.keys(errObj).length) {
            res.json({ status: false, message: errObj })
        }
        else {
            let used_counts = 0
            const get_counts_query = await company_manual_retrievalsM.findOne({ used_counts: 1 })
            if (get_counts_query) {
                used_counts = Number.parseInt(get_counts_query.used_counts) + 1
            }

            const update_array = {
                company_name: company_name,
                company_email_id: company_email_id,
                company_logo: company_logo,
                created_from_type: Number.isFinite(Number.parseInt(req.body.created_from_type)) ? Number.parseInt(req.body.created_from_type) : 1,
                website_link: website_link,
                used_counts: used_counts,
                created_on: date_n_time,
                updated_on: date_n_time
            }

            const insert_query = await company_manual_retrievalsM(update_array).save()
            await deleteKeysByPattern('app_company_list_*')
            //    await deleteKeysByPattern('app_user_detail_*')

            res.json({
                status: true, message: {
                    manual_data: insert_query,
                    alert_message: "The manual company details has been listed successfully."
                }
            })
        }
    }
    catch (err) {
        console.log('Update manual company details', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})





router.post('/edit_manual_detail', [
    check('company_row_id')
        .trim().not().isEmpty().withMessage('The Company Row ID field is required.')
], async (req, res) => {
    try {

        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        let company_row_id = 0
        if (req.body.company_row_id) {
            company_row_id = Number.parseInt(req.body.company_row_id)
            const check_manual_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
            if (check_manual_query) {
                if (check_manual_query.company_logo) {

                    let company_logo = ""
                    if (!Object.keys(errObj).length) {
                        if (req.body.company_logo) {
                            const validate_n_save_image = await validateAndSaveImage(req.body.company_logo, 7)
                            if (!validate_n_save_image.status) {
                                errObj['company_logo'] = 'Sorry, Invalid Profile Image.'
                            }
                            else {
                                company_logo = validate_n_save_image.webp_file_name
                            }
                        }
                        else {
                            errObj['company_logo'] = 'The company logo field is required.'
                        }
                    }

                    if (Object.keys(errObj).length) {
                        res.json({ status: false, message: errObj })
                    }
                    else {
                        await company_manual_retrievalsM.updateOne({ _id: company_row_id }, { $set: { company_logo: company_logo } })
                        const get_manual_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
                        await deleteKeysByPattern('app_company_list_*')
                        res.json({
                            status: true, message: {
                                manual_data: get_manual_query,
                                alert_message: "The manual company details has been listed successfully."
                            }
                        })
                    } errObj['company_logo'] = 'The logo for this company is already exist.'
                }
            }
            else {
                errObj['company_row_id'] = 'Sorry, Invalid manual user row id.'
            }
        }
    }
    catch (err) {
        console.log('Edit manual company details.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})



module.exports = router
