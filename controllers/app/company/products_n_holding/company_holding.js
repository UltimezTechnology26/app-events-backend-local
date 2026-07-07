const express = require('express')
const router = express.Router()
const sanitize = require('mongo-sanitize');
const { check, validationResult } = require('express-validator')
const { getCache, setCache, deleteKeysByPattern } = require('../../../../config/cache_helper');
const { getPresentDateTime, arrangeValidation } = require('../../../../utils/helpers/helper');
const { getCompanyListDetails } = require('../../../../services/company/front_page');
const company_manual_retrievalsM = require('../../../../models/app/company/company_manual_retrievalsM');
const companyM = require('../../../../models/app/company/companyM');
const { checkAllLoginToken } = require('../../../../middleware/authorization');
const tokensM = require('../../../../models/markets/tokensM');
const search_contract_addressM = require('../../../../models/markets/search_contract_addressM');
const { getCompanyList, getManualCompanyList, separateManualRegisterCompany, checkCompanyRowID } = require('../../../../utils/helpers/app_helper');
const company_holdingM = require('../../../../models/markets/products_n_holding/company_holdingM');
const { marketDB } = require('../../../../config/database_connector');


router.post('/update_n_save_details', [
    check('company_type')
        .trim().not().isEmpty().withMessage('The Company Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Company Type value field contains only 1 or 2.'),
    check('company_row_id')
        .trim().not().isEmpty().withMessage('The Company Row ID field is required.')
        .isInt().withMessage('The Company Row ID value field contains valid ID.'),
    check('token_row_id')
        .trim().not().isEmpty().withMessage('The Token Row ID field is required.')
        .isInt().withMessage('The Token Row ID value field contains contains valid ID.'),
    check('token_type')
        .trim().not().isEmpty().withMessage('The Token Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Token Type value field contains only 1 or 2.'),
    // check('purchased_date')
    // .trim().not().isEmpty().withMessage('The Purchased Date field is required.'),
    check('purchased_value')
        .trim().not().isEmpty().withMessage('The Purchased Value field is required.')
        .isFloat({ min: 0 }).withMessage('The Purchased Value field must be contains greater than or equal to 0.')
], async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
        if (checkUserToken.status) {
            const errors = validationResult(req)
            let errObj = arrangeValidation(errors)

            let company_type = 0
            if (!isNaN(parseInt(req.body.company_type))) {
                company_type = parseInt(req.body.company_type)
            }

            let submitted_from_type = 1
            if (!isNaN(parseInt(req.body.submitted_from_type))) {
                submitted_from_type = parseInt(req.body.submitted_from_type)
            }

            let company_row_id = 0
            if (!isNaN(parseInt(req.body.company_row_id))) {
                company_row_id = parseInt(req.body.company_row_id)
            }

            let user_row_id = 0
            let holding_row_id = 0
            if (submitted_from_type === 2) {
                if (company_type === 1) {
                    const check_company_query = await companyM.findOne({ _id: company_row_id, active_status: 1 })
                    if (!check_company_query) {
                        errObj['company_row_id'] = 'Invalid company row id'
                    }
                }
                else {
                    const check_company_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
                    if (!check_company_query) {
                        errObj['company_row_id'] = 'Invalid company row id'
                    }
                }
            }
            else {
                if (checkUserToken.message.user_type == 1) {
                    user_row_id = checkUserToken.message.user_row_id
                    const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
                    if (!check_company.status) {
                        errObj['company_row_id'] = check_company.message.alert_message
                    }
                }
            }

            const token_type = parseInt(req.body.token_type)
            const token_row_id = parseInt(req.body.token_row_id)
            if (!isNaN(token_row_id)) {
                let match_query = { _id: parseInt(sanitize(req.body.token_row_id)) }
                if (token_type === 1) {
                    const check_token_query = await tokensM.findOne(match_query)
                    if (!check_token_query) {
                        errObj['alert_message'] = 'Sorry, Invalid token row id'
                    }
                }
                else if (token_type === 2) {
                    const check_token_query = await search_contract_addressM.findOne(match_query)
                    if (!check_token_query) {
                        errObj['alert_message'] = 'Sorry, Invalid token row id'
                    }
                }

                if (req.body.holding_row_id) {
                    if (!isNaN(parseInt(req.body.holding_row_id))) {
                        const check_valid_faq_query = await company_holdingM.findOne({ _id: parseInt(req.body.holding_row_id), company_row_id: company_row_id })
                        if (check_valid_faq_query) {
                            holding_row_id = parseInt(req.body.holding_row_id)
                        }
                        else {
                            errObj['alert_message'] = 'Sorry, Invalid Holding Row ID.'
                        }
                    }
                }
            }

            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj, errors })
            }
            else {
                const update_object = {}
                update_object['company_type'] = company_type
                update_object['company_row_id'] = company_row_id
                update_object['token_row_id'] = token_row_id
                update_object['token_type'] = token_type
                if (req.body.purchased_date) {
                    update_object['purchased_date'] = req.body.purchased_date
                }
                update_object['purchased_value'] = req.body.purchased_value
                update_object['purchased_value_in_usd'] = req.body.purchased_value_in_usd

                if (holding_row_id) {
                    await company_holdingM.updateOne({ _id: holding_row_id }, { $set: update_object })
                    const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    res.json({ status: true, message: { alert_message: 'This company holding details has been updated successfully.' }, deleteKey: deleteKey })
                }
                else {
                    update_object['date_n_time'] = getPresentDateTime()
                    await company_holdingM(update_object).save()

                    const existing = await companyM.findOne(
                        { _id: company_row_id },
                        {
                            basic_details_score: 1,
                            seo_details_score: 1,
                            social_media_score: 1,
                            owned_product_score: 1,
                            team_detail_score: 1,
                            job_opening_score: 1,
                            funding_score: 1,
                            revenue_score_score: 1,
                            investment_score: 1,
                            faq_score: 1,
                            holding_crypto_score: 1
                        }
                    ).lean();

                    // New score for holding crypto
                    const hasHoldings = await company_holdingM.exists({ company_row_id });
                    const holding_crypto_score = hasHoldings ? 5 : 0;

                    const updatedScores = {
                        basic_details_score: existing.basic_details_score ?? 0,
                        seo_details_score: existing.seo_details_score ?? 0,
                        social_media_score: existing.social_media_score ?? 0,
                        owned_product_score: existing.owned_product_score ?? 0,
                        team_detail_score: existing.team_detail_score ?? 0,
                        job_opening_score: existing.job_opening_score ?? 0,
                        funding_score: existing.funding_score ?? 0,
                        revenue_score_score: existing.revenue_score_score ?? 0,
                        investment_score: existing.investment_score ?? 0,
                        faq_score: existing.faq_score ?? 0,
                        holding_crypto_score: holding_crypto_score
                    };

                    // Correct final score calculation
                    const finalScore = Object.values(updatedScores)
                        .reduce((sum, val) => sum + (val || 0), 0);

                    // Save update
                    await companyM.updateOne(
                        { _id: company_row_id },
                        {
                            holding_crypto_score: holding_crypto_score,
                            profile_score: finalScore
                        }
                    );
                    const deleteKey = await deleteKeysByPattern('company_holdings_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    // await unirest
                    //     .post(APP_API_BASE_URL + "delete_redis_keys")
                    //     .headers({ "Content-Type": "application/json" })
                    //     .send({
                    //         patterns: [
                    //             "app_company_list_*",
                    //             "app_company_individual_details_*"
                    //         ]
                    //     });

                    res.json({ status: true, message: { alert_message: 'New company holding details has been listed successfully.' }, deleteKey: deleteKey })
                }
            }
        }
        else {
            res.json({ status: false, message: checkUserToken.message })
        }
    }
    catch (err) {
        res.json({ status: false, message: { alert_message: 'Something went wrong', error: err.message } })
    }
})

router.get('/list/:company_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4]);

    if (checkUserToken.status) {
        try {
            let errObj = {};

            if (isNaN(parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number';
            }

            if (isNaN(parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.';
            }

            let company_row_id = 0;
            if (!isNaN(parseInt(req.params.company_row_id))) {
                company_row_id = parseInt(req.params.company_row_id);
            } else {
                errObj['company_row_id'] = 'The company row id field must be contain valid number.';
            }

            let user_row_id = 0;
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id;
            }

            if (company_row_id && user_row_id) {
                const check_company = await checkCompanyRowID({ company_row_id, user_row_id });
                if (!check_company.status) {
                    errObj['company_row_id'] = check_company.message.alert_message;
                }
            }

            if (Object.keys(errObj).length) {
                return res.json({ status: false, message: errObj });
            }

            const skip = parseInt(req.params.skip);
            const limit = parseInt(req.params.limit);

            const key = `company_holdings_list_${company_row_id}_${skip}_${limit}_`;

            const cache_response = await getCache({ key });
            if (cache_response.status) {
                return res.json({
                    status: true,
                    message: cache_response.message.list,
                    count: cache_response.message.count,
                    cache_response_status: true
                });
            }

            /* =========================
               FETCH HOLDINGS (DB1)
            ========================= */
            const holdings = await company_holdingM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { company_row_id: company_row_id, company_type: 1 } }
            ]).skip(skip).limit(limit);

            /* =========================
               GROUP IDS
            ========================= */
            const tokenIds = [];
            const manualTokenIds = [];

            holdings.forEach(h => {
                if (h.token_type === 1) tokenIds.push(h.token_row_id);
                if (h.token_type === 2) manualTokenIds.push(h.token_row_id);
            });

            /* =========================
               FETCH FROM DB2
            ========================= */
            const [tokens, manualTokens] = await Promise.all([

                tokenIds.length
                    ? marketDB.collection("cln_markets_tokens")
                        .find(
                            { _id: { $in: tokenIds } },
                            {
                                projection: {
                                    _id: 1,
                                    symbol: 1,
                                    token_name: 1,
                                    token_image: 1,
                                    contract_addresses: 1
                                }
                            }
                        ).toArray()
                    : [],

                manualTokenIds.length
                    ? marketDB.collection("cln_markets_search_contract_addresses")
                        .find(
                            { _id: { $in: manualTokenIds } },
                            {
                                projection: {
                                    _id: 1,
                                    symbol: 1,
                                    token_name: 1,
                                    token_image: 1,
                                    contract_address: 1
                                }
                            }
                        ).toArray()
                    : []
            ]);

            /* =========================
               MAPS (STRING SAFE)
            ========================= */
            const norm = v => v?.toString();

            const tokenMap = Object.fromEntries(tokens.map(i => [norm(i._id), i]));
            const manualMap = Object.fromEntries(manualTokens.map(i => [norm(i._id), i]));

            /* =========================
               FINAL RESPONSE
            ========================= */
            const final = holdings
                .map(h => {
                    const id = norm(h.token_row_id);

                    const token_info = h.token_type === 1 ? tokenMap[id] : null;
                    const manual_info = h.token_type === 2 ? manualMap[id] : null;

                    const data = token_info || manual_info;
                    if (!data) return null;

                    return {
                        _id: h._id,
                        company_row_id: h.company_row_id,
                        token_type: h.token_type,
                        token_row_id: h.token_row_id,
                        purchased_date: h.purchased_date,
                        purchased_value: h.purchased_value,
                        purchased_value_in_usd: h.purchased_value_in_usd,
                        date_n_time: h.date_n_time,
                        contract_addresses: token_info?.contract_addresses || manual_info?.contract_address,
                        token_name: token_info?.token_name || manual_info?.token_name,
                        symbol: token_info?.symbol || manual_info?.symbol,
                        token_image: token_info?.token_image || manual_info?.token_image
                    };
                })
                .filter(Boolean);

            const count_query = await company_holdingM.countDocuments({
                company_row_id: company_row_id
            });

            await setCache({
                key,
                value: { list: final, count: count_query },
                ttl: 1800
            });

            return res.json({
                status: true,
                message: final,
                count: count_query,
                cache_response_status: false
            });

        } catch (err) {
            res.json({
                status: false,
                message: 'An unexpected error occurred. Please try again later.',
                err: err.message
            });
        }
    } else {
        res.json(checkUserToken);
    }
});



router.get('/delete_holding/:holding_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (checkUserToken.status) {
        try {
            let user_row_id = 0
            let holding_row_id = 0

            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (isNaN(parseInt(req.params.holding_row_id))) {
                errObj['holding_row_id'] = 'The holding row id field must be contain valid number.'
            }
            else {
                holding_row_id = parseInt(req.params.holding_row_id)
                const check_query = await company_holdingM.findOne({ _id: holding_row_id })
                if (!check_query) {
                    errObj['holding_row_id'] = 'Invalid holding row id.'
                }
                else {
                    const company_row_id = check_query.company_row_id
                    const company_type = check_query.company_type
                    const token_type = check_query.token_type
                    const token_row_id = check_query.token_row_id


                    if (user_row_id) {
                        let validation_status = false
                        if (company_row_id && (company_type == 1)) {
                            const check_event_res = await checkCompanyRowID({ company_row_id: company_row_id, user_row_id: user_row_id })
                            if (check_event_res.status) {
                                validation_status = true
                            }
                        }

                        if (token_row_id && (token_type == 1)) {
                            const check_token_query = await tokensM.findOne({ _id: token_row_id, user_row_id }, { _id: 1 })
                            if (check_token_query) {
                                validation_status = true
                            }
                        }

                        if (!validation_status) {
                            errObj['holding_row_id'] = 'Invalid user access.'
                        }
                    }


                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const check_query = await company_holdingM.findOne({ _id: holding_row_id })
                await company_holdingM.deleteOne({ _id: holding_row_id })


                const existing = await companyM.findOne(
                    { _id: check_query.company_row_id },
                    {
                        basic_details_score: 1,
                        seo_details_score: 1,
                        social_media_score: 1,
                        owned_product_score: 1,
                        team_detail_score: 1,
                        job_opening_score: 1,
                        funding_score: 1,
                        revenue_score_score: 1,
                        investment_score: 1,
                        faq_score: 1,
                        holding_crypto_score: 1
                    }
                ).lean();

                // New score for holding crypto
                const hasHoldings = await company_holdingM.exists({ company_row_id: check_query.company_row_id });
                const holding_crypto_score = hasHoldings ? 5 : 0;

                // Create updated score object (replacing only 1 field)
                const updatedScores = {
                    basic_details_score: existing.basic_details_score ?? 0,
                    seo_details_score: existing.seo_details_score ?? 0,
                    social_media_score: existing.social_media_score ?? 0,
                    owned_product_score: existing.owned_product_score ?? 0,
                    team_detail_score: existing.team_detail_score ?? 0,
                    job_opening_score: existing.job_opening_score ?? 0,
                    funding_score: existing.funding_score ?? 0,
                    revenue_score_score: existing.revenue_score_score ?? 0,
                    investment_score: existing.investment_score ?? 0,
                    faq_score: existing.faq_score ?? 0,
                    holding_crypto_score: holding_crypto_score   // updated field
                };

                // Correct final score calculation
                const finalScore = Object.values(updatedScores)
                    .reduce((sum, val) => sum + (val || 0), 0);

                // Save update
                await companyM.updateOne(
                    { _id: check_query.company_row_id },
                    {
                        holding_crypto_score: holding_crypto_score,
                        profile_score: finalScore
                    }
                );
                await deleteKeysByPattern('company_holdings_list_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('app_company_list_*')
                res.json({ status: true, message: { alert_message: 'This Company Holding details for this company have been deleted successfully.' } })
            }
        }
        catch (err) {
            console.log('Delete FAQ Details.', err.message)
            res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.get('/companies_list/:token_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            let token_row_id = 0
            if (!isNaN(parseInt(req.params.token_row_id))) {
                token_row_id = parseInt(req.params.token_row_id)
            }
            else {
                errObj['token_row_id'] = 'The token row id field must be contain valid number.'
            }

            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (token_row_id && user_row_id) {
                const check_token_query = await tokensM.findOne({ _id: token_row_id, user_row_id }, { _id: 1 })
                if (!check_token_query) {
                    errObj['token_row_id'] = 'Invalid token row id'
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const get_query = await company_holdingM.aggregate([
                    { $sort: { _id: -1 } },
                    { $match: { token_row_id: token_row_id, token_type: 1 } },

                    {
                        $project: {
                            _id: 1,
                            company_row_id: 1,
                            company_type: 1,
                            purchased_date: 1,
                            purchased_value: 1,
                            purchased_value_in_usd: 1,
                            date_n_time: 1
                        }
                    }
                ])

                const { manual_array, register_array } = await separateManualRegisterCompany(get_query, 'company_row_id')
                const company_list = await getCompanyList(register_array)
                const manual_list = await getManualCompanyList(manual_array)

                let result = []
                if (get_query[0]) {

                    for (let run of get_query) {
                        let company_data = ''
                        if (run.company_type === 1) {
                            company_data = company_list.filter(function (el) {
                                return el._id == run.company_row_id
                            })

                        }
                        else if (run.company_type === 2) {
                            company_data = manual_list.filter(function (el) {
                                return el._id == run.company_row_id
                            })
                        }


                        const company_details = company_data[0] ? company_data[0] : ""
                        if (company_details) {
                            await result.push({
                                _id: run._id,
                                company_row_id: run.company_row_id,
                                company_type: run.company_type,
                                purchased_date: run.purchased_date,
                                purchased_value: run.purchased_value,
                                purchased_value_in_usd: run.purchased_value_in_usd,
                                date_n_time: run.date_n_time,
                                approval_status: company_details.approval_status,
                                company_name: company_details.company_name,
                                company_id: company_details.company_id,
                                company_email_id: company_details.company_email_id,
                                company_logo: company_details.company_logo
                            })
                        }
                    }
                }
                //, get_query

                //const count_query = await company_holdingM.countDocuments({token_row_id:token_row_id, token_type:1 })

                res.json({ status: true, message: result })
            }
        }
        catch (err) {
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json(checkUserToken)
    }
})




module.exports = router