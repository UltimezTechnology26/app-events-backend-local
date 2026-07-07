const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize')
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation } = require('../../../utils/helpers/helper')
const { checkAllLoginToken } = require('../../../middleware/authorization')
const eventM = require('../../../models/app/events/eventM')
const { checkSubadminAccess } = require('../../../utils/helpers/events_helper')
const couponM = require('../../../models/app/events/couponM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

router.post('/create_edit_coupon', [
    check('event_row_id')
        .not().isEmpty().withMessage('The Event Row Id field is required'),
    check('coupon_code')
        .not().isEmpty().withMessage('The Coupon Code field is required')
        .isLength({ min: 3 }).withMessage('The Coupon Code must be at least 3 characters long.'),
    check('discount')
        .not().isEmpty().withMessage('The Discount field is required')
        .isNumeric().withMessage('The Discount must be a valid number.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const errObj = arrangeValidation(errors);

        const checkUserToken = await checkAllLoginToken(req.headers, [10]);
        if (checkUserToken.status) {
            let user_row_id = 0;
            const event_row_id = Number.parseInt(req.body.event_row_id);

            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id;
                const check_event = await eventM.findOne({ _id: event_row_id, user_row_id: user_row_id });
                if (!check_event) {
                    errObj['event_row_id'] = "Invalid Event Row ID.";
                }
            } else {
                const token_message = checkUserToken.token_message;
                if (token_message.admin_row_id) {
                    const check_access = await checkSubadminAccess({
                        admin_row_id: Number.parseInt(token_message.admin_row_id),
                        admin_manager_type: token_message.admin_manager_type,
                        sub_admin_type: Number.parseInt(token_message.sub_admin_type),
                        event_row_id: event_row_id
                    });

                    if (!check_access.status) {
                        errObj['alert_message'] = check_access.message;
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            let coupon_row_id = "";
            if (req.body.coupon_row_id) {
                const coupon_check = await couponM.findOne({ event_row_id: event_row_id, _id: sanitize(req.body.coupon_row_id) });
                if (!coupon_check) {
                    errObj['coupon_row_id'] = "Invalid Coupon Row ID";
                } else {
                    coupon_row_id = sanitize(req.body.coupon_row_id);
                }
            }

            // ✅ Allow only one coupon per event
            if (!coupon_row_id) {
                const existingCoupon = await couponM.findOne({ event_row_id: event_row_id });
                if (existingCoupon) {
                    errObj['event_row_id'] = "This event already has a coupon. Only one coupon is allowed per event.";
                }
            }

            // ✅ Unique coupon_code validation per event (skip if updating same one)
            // ✅ Discount validation


            if (Object.keys(errObj).length > 0) {
                return res.json({ status: false, message: errObj });
            }

            // ✅ Prepare insert/update object
            const insertArr = {};
            insertArr['event_row_id'] = event_row_id;
            insertArr['coupon_code'] = sanitize(req.body.coupon_code);
            insertArr['discount'] = Number.parseInt(req.body.discount);
            insertArr['updated_date_n_time'] = getPresentDateTime();

            let alert_message = "";
            if (coupon_row_id) {
                await couponM.updateOne({ _id: coupon_row_id }, { $set: insertArr });
                await deleteKeysByPattern('all_events_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('users_registered_list_*')
                await deleteKeysByPattern('events_watchlist_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('manage_events_list_*')
                alert_message = "Coupon updated successfully!";
            } else {
                await couponM(insertArr).save();
                await deleteKeysByPattern('all_events_*')
                await deleteKeysByPattern('individual_event_*')
                await deleteKeysByPattern('users_registered_list_*')
                await deleteKeysByPattern('events_watchlist_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('manage_events_list_*')
                alert_message = "Coupon created successfully!";
            }

            return res.json({ status: true, message: { alert_message } });
        } else {
            return res.json(checkUserToken);
        }
    } catch (err) {
        console.log('Create Edit Coupon Error:', err.message);
        return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' });
    }
});

router.get('/coupon_list/:event_row_id', async (req, res) => {
    try {
        // ✅ Step 1: Auth check
        const checkUserToken = await checkAllLoginToken(req.headers, [10])
        if (!checkUserToken.status) {
            return res.json(checkUserToken)
        }

        let errObj = {}
        let user_row_id = checkUserToken.message.user_row_id || 0
        const event_row_id = Number.parseInt(req.params.event_row_id)

        if (Number.isNaN(event_row_id)) {
            errObj['event_row_id'] = "Invalid Event Row ID."
        }

        const check_event = await eventM.findOne({ _id: event_row_id })
        if (!check_event) {
            errObj['event_row_id'] = "Invalid Event Row ID."
        }

        if (checkUserToken.message.user_type == 1) {
            const check_event_query = await eventM.findOne({ _id: event_row_id, user_row_id })
            if (!check_event_query) {
                errObj['event_row_id'] = "Invalid Event Row ID."

            }
        }

        if (Object.keys(errObj).length) {
            return res.json({ status: false, message: errObj })
        }
        const coupon_list = await couponM.findOne({ event_row_id })


        // Attach flag to the response


        return res.json({
            status: true,
            message: coupon_list ? coupon_list : [],
            cache_response_status: false
        })

    } catch (err) {
        console.log('Coupon list.', err.message)
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        })
    }
})



module.exports = router