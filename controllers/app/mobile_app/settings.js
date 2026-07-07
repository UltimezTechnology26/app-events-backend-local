const express = require('express')
const router = express.Router()

const { check, validationResult } = require('express-validator')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { getPresentDateTime, arrangeValidation, getIntIdFromArray } = require('../../../utils/helpers/helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')

const professionalsM = require('../../../models/app/professionalsM')
const professionals_seo_detailsM = require('../../../models/app/professionals_seo_detailsM')
const professionals_social_linksM = require('../../../models/app/professionals_social_linksM')

router.post('/update_user_profile', [
    check('gender')
        .trim().isInt({ min: 1, max: 3 }).withMessage('The gender field value must be contain 1,2 or 3.'),
    check('full_name')
        .trim().not().isEmpty().withMessage('The Full Name field is required.')
        .isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.')
        .isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('account_visible_type')
        .trim().isInt({ min: 1, max: 2 }).withMessage('The account visible type field value must be contain 1 or 2.'),
    check('user_bio')
        .trim().not().isEmpty().withMessage('The User Bio field is required.'),
    check('designation_id')
        .not().isEmpty().withMessage('The Designation Id field is required.'),
    check('looking_for_id')
        .not().isEmpty().withMessage('The Looking For Id field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)

        if (req.body.full_name.match(/[^A-Za-z0-9 ]/)) {
            errObj['full_name'] = 'The Full Name field may only contain alpha-numeric characters and spaces.'
        }

        let looking_for_id = []
        if ((req.body.looking_for_id) && (req.body.looking_for_id.length > 0)) {
            let looking_for_id_array = await getIntIdFromArray(req.body.looking_for_id)
            if (looking_for_id_array.length > 0) {
                looking_for_id = looking_for_id_array
            }
            else {
                errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
            }
        }

        let designation_id = []
        if ((req.body.designation_id) && (req.body.designation_id.length > 0)) {
            let designation_id_array = await getIntIdFromArray(req.body.designation_id)
            if (designation_id_array.length > 0) {
                designation_id = designation_id_array
            }
            else {
                errObj['designation_id'] = 'The Designation Ids field must be integer in object'
            }
        }

        if (req.body.vcf_status) {
            if (Number.isNaN(Number.parseInt(req.body.vcf_status))) {
                errObj['vcf_status'] = 'The VCF Status field must be integer.'
            }

        }

        if (!req.body.reddit && !req.body.facebook && !req.body.twitter && !req.body.linkedin && !req.body.video_link && !req.body.instagram && !req.body.telegram && !req.body.medium) {
            errObj['social_links'] = 'Any one social link is required.'
        }

        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                const main_array = {}
                main_array['gender'] = req.body.gender
                main_array['full_name'] = req.body.full_name
                main_array['country_id'] = req.body.country_id
                main_array['account_visible_type'] = req.body.account_visible_type
                main_array['designation_id'] = designation_id
                main_array['updated_date_n_time'] = getPresentDateTime()
                main_array['looking_for_id'] = looking_for_id
                main_array['user_bio'] = req.body.user_bio
                main_array['location'] = req.body.location ? (req.body.location).trim() : ''
                main_array['vcf_status'] = req.body.vcf_status ? Number.parseInt(req.body.vcf_status) : 0

                const updateFields = getUpdateTrackerFields(checkUserToken)
                Object.assign(main_array, updateFields)

                await professionalsM.updateOne({ _id: user_row_id }, { $set: main_array })

                // Update social links
                const social_update_array = {}
                social_update_array['facebook'] = req.body.facebook ? (req.body.facebook).trim() : ''
                social_update_array['twitter'] = req.body.twitter ? (req.body.twitter).trim() : ''
                social_update_array['linkedin'] = req.body.linkedin ? (req.body.linkedin).trim() : ''
                social_update_array['video_link'] = req.body.video_link ? (req.body.video_link).trim() : ''
                social_update_array['instagram'] = req.body.instagram ? (req.body.instagram).trim() : ''
                social_update_array['telegram'] = req.body.telegram ? (req.body.telegram).trim() : ''
                social_update_array['medium'] = req.body.medium ? (req.body.medium).trim() : ''
                social_update_array['reddit'] = req.body.reddit ? (req.body.reddit).trim() : ''
                social_update_array['youtube_channel'] = req.body.youtube_channel ? (req.body.youtube_channel).trim() : ''
                social_update_array['user_row_id'] = user_row_id

                await professionals_social_linksM.findOneAndUpdate(
                    { user_row_id: user_row_id },
                    { $set: social_update_array },
                    { upsert: true }
                )

                // Update SEO details
                const seo_update_array = {}
                seo_update_array['meta_keywords'] = req.body.meta_keywords
                seo_update_array['meta_description'] = req.body.meta_description
                seo_update_array['user_row_id'] = user_row_id

                await professionals_seo_detailsM.findOneAndUpdate(
                    { user_row_id: user_row_id },
                    { $set: seo_update_array },
                    { upsert: true }
                )


                res.json({ status: true, message: { alert_message: "Great! Your profile details have been updated successfully. Thank you for making the necessary changes" } })

            }

        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Update user profile.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }

})


module.exports = router