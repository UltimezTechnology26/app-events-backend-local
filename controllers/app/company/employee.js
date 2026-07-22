const express = require('express')
const router = express.Router()

const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
const { updateNotification } = require('../../../utils/helpers/notification_helper')

const companyM = require('../../../models/app/company/companyM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const { calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')




router.get('/remove_employee/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)

            const check_company_query = await companyM.findOne({ user_row_id: user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    const company_row_id = check_company_query._id

                    const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, company_type: 1, company_row_id: company_row_id })
                    if (check_query) {
                        await professionals_work_experienceM.deleteOne({ _id: request_row_id, company_type: 1, company_row_id: company_row_id })

                        const delete_cache1 = await deleteKeysByPattern('app_company_individual_other_details_*')
                        await deleteKeysByPattern('employee_list_*')
                        await calculateCompanyProfileScore(company_row_id, ['team_detail'])

                        res.json({ status: true, message: { alert_message: 'This employee details has been removed successfully.' }, delete_cache1: delete_cache1 })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Remove employee.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
    }
})

router.get('/approve_request/:request_row_id', async (req, res) => {
    try {
        const checkUserToken = checkUserLoginToken(req.headers)
        if (checkUserToken.status) {
            const user_row_id = checkUserToken.message
            const request_row_id = Number.parseInt(req.params.request_row_id)

            const check_company_query = await companyM.findOne({ user_row_id: user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
            if (check_company_query) {
                if (check_company_query.approval_status == 1) {
                    const company_row_id = check_company_query._id

                    const check_query = await professionals_work_experienceM.findOne({ _id: request_row_id, company_type: 1, company_row_id: company_row_id, verified_status: false })
                    if (check_query) {
                        await professionals_work_experienceM.updateOne({ _id: request_row_id }, {
                            $set: {
                                verified_status: true,
                                verified_on: getPresentDateTime()
                            }
                        })
                        await deleteKeysByPattern('employee_list_*')
                        await deleteKeysByPattern('app_company_individual_other_details_*')
                        if (check_query.user_account_type == 1) {
                            const employee_user_row_id = check_query.user_row_id
                            await updateNotification({
                                user_row_id: employee_user_row_id,
                                notify_type: 2,
                                notify_type_row_id: company_row_id,
                                message_row_id: 19,
                                action_row_id: check_query._id
                            })
                        }

                        res.json({ status: true, message: { alert_message: 'This employee details has been verified successfully.' } })
                    }
                    else {
                        res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
                    }
                }
                else {
                    res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
                }
            }
            else {
                res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
            }
        }
        else {
            res.json(checkUserToken)
        }

    }
    catch (err) {
        console.log('Approve employee request.', err.message)
        res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
})

module.exports = router
