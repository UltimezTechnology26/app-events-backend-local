const express = require('express')
const router = express.Router()
const randomstring = require("randomstring")
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, validateAndSaveImage, user_profile_completed_percentage, deleteImageDigitalOcean, getIntIdFromArray } = require('../../../utils/helpers/helper')

const { checkAllLoginToken } = require('../../../middleware/authorization')
const { deleteUserAward, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')

const professionals_awardsM = require('../../../models/app/users/professionals_awardsM')
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')


router.post('/update_n_save_details', [
    check('award_title')
        .not().isEmpty().withMessage('The Award Title field is required.'),
    check('award_description')
        .not().isEmpty().withMessage('The Award Description field is required.')
], async (req, res) => {
    try {
        const errors = validationResult(req)
        const errObj = arrangeValidation(errors)
        const checkUserToken = await checkAllLoginToken(req.headers, [1])
        if (checkUserToken.status) {
            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.body.user_row_id) {
                if (!Number.isNaN(Number.parseFloat(req.body.user_row_id))) {
                    user_row_id = Number.parseFloat(req.body.user_row_id)
                }
            }

            if (req.body.award_image) {
                if (req.body.award_image.length < 100) {
                    errObj['award_image'] = 'The award image field must be at least 100 characters in length.'
                }
            }

            let award_image = ''
            if (!Object.keys(errObj).length) {
                const validate_n_save_image = await validateAndSaveImage(req.body.award_image, 8)
                if (validate_n_save_image.status) {
                    award_image = validate_n_save_image.webp_file_name
                }
            }

            let award_row_id = 0
            let old_image_name
            if (req.body.award_row_id) {
                if (!Number.isNaN(Number.parseFloat(req.body.award_row_id))) {
                    const check_valid_award_query = await professionals_awardsM.findOne({ _id: Number.parseFloat(req.body.award_row_id), user_row_id: user_row_id })
                    if (check_valid_award_query) {
                        award_row_id = Number.parseInt(req.body.award_row_id)
                        old_image_name = check_valid_award_query.award_image
                    }
                    else {
                        errObj['alert_message'] = 'Sorry, Invalid Award Row ID.'
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {
                let update_object = {}
                update_object['award_title'] = req.body.award_title
                update_object['award_description'] = req.body.award_description
                if (award_image) {
                    update_object['award_image'] = award_image
                    if (old_image_name) {
                        await deleteImageDigitalOcean(old_image_name, 8)
                    }
                }

                if (award_row_id) {
                    await professionals_awardsM.updateOne({ _id: award_row_id }, { $set: update_object })
                    await deleteKeysByPattern('users_awards_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    res.json({ status: true, message: { alert_message: 'This Awards details has been updated successfully.' } })
                }
                else {
                    update_object['user_row_id'] = user_row_id

                    await professionals_awardsM(update_object).save()
                    await deleteKeysByPattern('users_awards_list_*')
                    await deleteKeysByPattern('app_user_other_details_*')
                    await calculateUserProfileScore(user_row_id, ['award'])

                    res.json({ status: true, message: { alert_message: 'New Awards details has been listed successfully.' } })
                }
            }
        }
        else {
            res.json(checkUserToken)
        }
    }
    catch (err) {
        console.log('Update profile image.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})


router.get('/list/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [1])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            if (Number.isNaN(Number.parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (Number.isNaN(Number.parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }
            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = Number.parseInt(req.params.skip)
                const limit = Number.parseInt(req.params.limit)

                let query = [{ user_row_id: user_row_id }]
                if (req.query.search) {
                    query.push({ award_title: { $regex: sanitize(req.query.search), $options: 'i' } })
                }

                let search_query = { $and: query }
                const key =
                    'users_awards_list_' +
                    user_row_id +
                    '_' +
                    (req.query.search || '') +
                    '_' +
                    skip +
                    '_' +
                    limit

                // Check Redis cache
                const cache_response = await getCache({ key })
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message.data, // ✅ cached list
                        count: cache_response.message.count,  // ✅ cached count
                        cache_response_status: true
                    })
                }
                const get_query = await professionals_awardsM.aggregate([
                    { $match: search_query },
                    { $sort: { _id: -1 } },
                    {
                        $project: {
                            _id: 1,
                            user_row_id: 1,
                            award_title: 1,
                            award_description: 1,
                            award_image: 1
                        }
                    }
                ]).skip(skip).limit(limit)



                const count_query = await professionals_awardsM.countDocuments(search_query)

                // res.json({ status: true, message: get_query, count: count_query })
                await setCache({
                    key,
                    value: { data: get_query, count: count_query }, // ✅ save both data + count
                    ttl: 1800 // 30 minutes
                })

                return res.json({
                    status: true,
                    message: get_query,
                    count: count_query,
                    cache_response_status: false
                })
            }
        }
        catch (err) {
            console.log('award list.', err.message)
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkUserToken)
    }
})



router.get('/delete_award/:award_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [1])
    if (checkUserToken.status) {
        try {
            let user_row_id = 0
            let award_row_id = 0

            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }
            else if (req.query.user_row_id) {
                if (!Number.isNaN(Number.parseInt(req.query.user_row_id))) {
                    user_row_id = Number.parseInt(req.query.user_row_id)
                }
            }
            let award_image = ''
            if (Number.isNaN(Number.parseInt(req.params.award_row_id))) {
                errObj['award_row_id'] = 'The award row id field must be contain valid number.'
            }
            else {
                award_row_id = Number.parseInt(req.params.award_row_id)
                const check_query = await professionals_awardsM.findOne({ _id: award_row_id, user_row_id: user_row_id })
                if (!check_query) {
                    errObj['award_row_id'] = 'Invalid award row id.'
                }
                else if (check_query.award_image) {
                    award_image = check_query.award_image
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {

                await deleteUserAward({ type: 1, user_row_id, award_row_id, award_image })
                await deleteKeysByPattern('users_awards_list_*')

                await calculateUserProfileScore(user_row_id, ['award'])

                res.json({ status: true, message: { alert_message: 'This award details for this user have been deleted successfully.' } })
            }
        }
        catch (err) {
            console.log('Delete award Details.', err.message)
            res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


module.exports = router