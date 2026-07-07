const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()
const sanitize = require('mongo-sanitize');
const { check, validationResult } = require('express-validator')
const { getPresentDateTime, arrangeValidation, getIntIdFromArray } = require('../../../../utils/helpers/helper');
const { getCompanyList, getManualCompanyList, separateManualRegisterCompany, checkCompanyRowID } = require('../../../../utils/helpers/app_helper')


const company_productsM = require('../../../../models/markets/products_n_holding/company_productsM');

const companyM = require('../../../../models/app/company/companyM');

// const { calculateBlockchainScore, calculateExchangeScore } = require('../../../config/market_helper');
const { checkUserLoginToken, checkAllLoginToken } = require('../../../../middleware/authorization');
const tokensM = require('../../../../models/markets/tokensM');
const search_contract_addressM = require('../../../../models/markets/search_contract_addressM');
const chainsM = require('../../../../models/markets/chainsM');
const chains_manualsM = require('../../../../models/markets/chains_manualsM');
const exchangeM = require('../../../../models/markets/exchangeM');
const exchange_manualsM = require('../../../../models/markets/exchange_manualsM');
const { getCache, setCache, deleteKeysByPattern } = require('../../../../config/cache_helper');
const { marketDB } = require('../../../../config/database_connector');

const array_column_without_null = (anArray, columnNumber) => {
    const new_array = []
    for (let run of anArray) {
        if (run[columnNumber]) {
            new_array.push(run[columnNumber])
        }
    }
    return new_array
}

router.post('/update_n_save_details', [
    check('company_type')
        .trim().not().isEmpty().withMessage('The Company Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Company Type value field contains only 1 or 2.'),
    check('company_row_id')
        .trim().not().isEmpty().withMessage('The Company Row ID field is required.')
        .isInt().withMessage('The Company Row ID value field contains valid ID.'),
    check('register_type')
        .trim().not().isEmpty().withMessage('The Register Type field is required.')
        .isInt({ min: 1, max: 2 }).withMessage('The Register Type value field contains only 1 or 2.'),
    check('product_row_id')
        .trim().not().isEmpty().withMessage('The Product Row ID field is required.')
        .isInt().withMessage('The Product Row ID value field contains contains valid ID.'),
    check('product_type')
        .trim().not().isEmpty().withMessage('The Product Type field is required.')
        .isInt({ min: 1, max: 3 }).withMessage('The Product Type value field contains only 1,2 or 3.'),
], async (req, res) => {
    try {
        const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
        if (checkUserToken.status) {
            const errors = validationResult(req)
            let errObj = arrangeValidation(errors)

            let submitted_from_type = 1
            if (!isNaN(parseInt(req.body.submitted_from_type))) {
                submitted_from_type = parseInt(req.body.submitted_from_type)
            }

            let company_type = 0
            if (!isNaN(parseInt(req.body.company_type))) {
                company_type = parseInt(req.body.company_type)
            }

            let company_row_id = 0
            if (!isNaN(parseInt(req.body.company_row_id))) {
                company_row_id = parseInt(req.body.company_row_id)
            }

            let edit_product_row_id = 0
            let user_row_id = 0
            if (req.body.edit_product_row_id) {
                if (!isNaN(parseInt(req.body.edit_product_row_id))) {
                    const check_valid_faq_query = await company_productsM.findOne({ _id: parseInt(req.body.edit_product_row_id), company_row_id: company_row_id })
                    if (check_valid_faq_query) {
                        edit_product_row_id = parseInt(req.body.edit_product_row_id)
                    }
                    else {
                        errObj['alert_message'] = 'Sorry, Invalid Edit Product Row ID.'
                    }
                }
            }

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

            const register_type = parseInt(req.body.register_type) //1:registered, 2:manual
            const product_row_id = parseInt(req.body.product_row_id)
            const product_type = parseInt(req.body.product_type) // 1:crypto tokens, 2:blockchains, 3: exchanges

            if (product_type == 1) {
                if (register_type == 1) {
                    const user_reg_query = await tokensM.findOne({ _id: product_row_id, active_status: 1 })
                    if (!user_reg_query) {
                        errObj['product_row_id'] = 'Sorry, Invalid product row id'
                    }
                }
                else if (register_type == 2) {
                    const user_manual_query = await search_contract_addressM.findOne({ _id: product_row_id }, { _id: 1 })
                    if (!user_manual_query) {
                        errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
                    }
                }
            }
            else if (product_type == 2) {
                if (register_type == 1) {
                    const company_reg_query = await chainsM.findOne({ _id: product_row_id, status: 1 }, { _id: 1, user_row_id: 1 })
                    if (!company_reg_query) {
                        errObj['product_row_id'] = 'Sorry, Invalid product row id'
                    }
                }
                else {
                    const company_manual_query = await chains_manualsM.findOne({ _id: product_row_id }, { _id: 1 })
                    if (!company_manual_query) {
                        errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
                    }
                }

            }
            else if (product_type == 3) {
                if (register_type == 1) {
                    const user_reg_query = await exchangeM.findOne({ _id: product_row_id, status: 1 })
                    if (!user_reg_query) {
                        errObj['product_row_id'] = 'Sorry, Invalid product row id'
                    }

                }
                else if (register_type == 2) {
                    const user_manual_query = await exchange_manualsM.findOne({ _id: product_row_id }, { _id: 1 })
                    if (!user_manual_query) {
                        errObj['product_row_id'] = 'Sorry, Invalid manual product row id'
                    }
                }
            }


            if (register_type && product_row_id && product_type) {
                const check_product_query = await company_productsM.findOne({
                    company_type,
                    company_row_id,
                    register_type,
                    product_row_id,
                    product_type,
                    _id: { $ne: edit_product_row_id }
                })
                if (check_product_query) {
                    errObj['alert_message'] = 'Sorry, This type of product is already exists.'
                }
            }


            if (Object.keys(errObj).length > 0) {
                res.json({ status: false, message: errObj })
            }
            else {


                const update_object = {}
                update_object['company_type'] = company_type
                update_object['company_row_id'] = company_row_id
                update_object['register_type'] = register_type
                update_object['product_row_id'] = product_row_id
                update_object['product_type'] = product_type


                // update_object['country_id'] = country_id;
                // update_object['regulatory_bodies_ids'] = regulatory_bodies_ids;
                // update_object['regulatory_types_ids'] = regulatory_types_ids;


                if (edit_product_row_id) {
                    await company_productsM.updateOne({ _id: edit_product_row_id }, { $set: update_object })
                    await deleteKeysByPattern('company_product_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    res.json({ status: true, message: { alert_message: 'This company product details has been updated successfully.' } })
                }
                else {
                    update_object['date_n_time'] = getPresentDateTime()
                    await company_productsM(update_object).save()


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
                    const products = await company_productsM.exists({ company_row_id: company_row_id });
                    const owned_product_score = products ? 10 : 0

                    // Create updated score object (replacing only 1 field)
                    const updatedScores = {
                        basic_details_score: existing.basic_details_score ?? 0,
                        seo_details_score: existing.seo_details_score ?? 0,
                        social_media_score: existing.social_media_score ?? 0,
                        owned_product_score: owned_product_score,
                        team_detail_score: existing.team_detail_score ?? 0,
                        job_opening_score: existing.job_opening_score ?? 0,
                        funding_score: existing.funding_score ?? 0,
                        revenue_score_score: existing.revenue_score_score ?? 0,
                        investment_score: existing.investment_score ?? 0,
                        faq_score: existing.faq_score ?? 0,
                        holding_crypto_score: existing?.holding_crypto_score ?? 0  // updated field
                    };

                    // Correct final score calculation
                    const finalScore = Object.values(updatedScores)
                        .reduce((sum, val) => sum + (val || 0), 0);

                    // Save update
                    await companyM.updateOne(
                        { _id: company_row_id },
                        {
                            owned_product_score: owned_product_score,
                            profile_score: finalScore
                        }
                    );
                    if (product_type == 2) {

                        await chainsM.updateOne(
                            { _id: product_row_id },
                            { $set: { owning_companies_score: 15 } }
                        );
                    } else if (product_type == 3) {
                        await exchangeM.updateOne(
                            { _id: product_row_id },
                            { $set: { owning_companies_score: 15 } }
                        );
                    }
                    await deleteKeysByPattern('company_product_list_*')
                    await deleteKeysByPattern('app_company_individual_other_details_*')
                    await deleteKeysByPattern('app_company_list_*')
                    res.json({ status: true, message: { alert_message: 'New company product details has been listed successfully.', products, owned_product_score } })
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
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            if (isNaN(parseInt(req.params.skip))) {
                errObj['skip'] = 'The parameter skip field must be contain valid number'
            }

            if (isNaN(parseInt(req.params.limit))) {
                errObj['limit'] = 'The parameter limit field must be contain valid number.'
            }

            let company_row_id = 0
            if (!isNaN(parseInt(req.params.company_row_id))) {
                company_row_id = parseInt(req.params.company_row_id)
            }
            else {
                errObj['company_row_id'] = 'The company row id field must be contain valid number.'
            }

            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (company_row_id && user_row_id) {
                const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
                if (!check_company.status) {
                    errObj['company_row_id'] = check_company.message.alert_message
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const skip = parseInt(req.params.skip)
                const limit = parseInt(req.params.limit)
                const key = `company_product_list_${company_row_id}_${skip}_${limit}_`

                const cache_response = await getCache({ key })
                if (cache_response.status) {
                    return res.json({
                        status: true,
                        message: cache_response.message.list,
                        count: cache_response.message.count,
                        cache_response_status: true
                    })
                }


                let query = [{}]
                if (req.query.search) {
                    query.push({ faq_question: { $regex: sanitize(req.query.search), $options: 'i' } })
                }

                let search_query = { $and: query }

                /* =========================
   FETCH PRODUCTS (DB1)
========================= */
                const products = await company_productsM.aggregate([
                    {
                        $match: {
                            company_row_id: company_row_id,
                            company_type: 1
                        }
                    },
                    { $sort: { _id: -1 } }
                ]);

                /* =========================
                   GROUP IDS
                ========================= */
                const ids = {
                    token: [],
                    token_manual: [],
                    chain: [],
                    chain_manual: [],
                    exchange: [],
                    exchange_manual: []
                };

                products.forEach(p => {
                    if (p.product_type === 1 && p.register_type === 1) ids.token.push(p.product_row_id);
                    if (p.product_type === 1 && p.register_type === 2) ids.token_manual.push(p.product_row_id);
                    if (p.product_type === 2 && p.register_type === 1) ids.chain.push(p.product_row_id);
                    if (p.product_type === 2 && p.register_type === 2) ids.chain_manual.push(p.product_row_id);
                    if (p.product_type === 3 && p.register_type === 1) ids.exchange.push(p.product_row_id);
                    if (p.product_type === 3 && p.register_type === 2) ids.exchange_manual.push(p.product_row_id);
                });

                /* =========================
                   FETCH FROM DB2
                ========================= */
                const [
                    tokens,
                    tokenManual,
                    chains,
                    chainManual,
                    exchanges,
                    exchangeManual
                ] = await Promise.all([

                    marketDB.collection("cln_markets_tokens")
                        .find({ _id: { $in: ids.token } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1, volume: 1 } })
                        .toArray(),

                    marketDB.collection("cln_markets_search_contract_addresses")
                        .find({ _id: { $in: ids.token_manual } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1 } })
                        .toArray(),

                    marketDB.collection("cln_chains")
                        .find({ _id: { $in: ids.chain } }, { projection: { _id: 1, chain_name: 1, chain_slug: 1, chain_image: 1, chain_id: 1, tvl: 1, protocols: 1, mcap: 1 } })
                        .toArray(),

                    marketDB.collection("cln_chains_manuals")
                        .find({ _id: { $in: ids.chain_manual } }, { projection: { _id: 1, chain_name: 1, chain_symbol: 1, chain_id: 1, chain_link: 1 } })
                        .toArray(),

                    marketDB.collection("cln_exchanges")
                        .find({ _id: { $in: ids.exchange } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1, launch_date: 1, volume_24h: 1, total_pairs: 1, total_coins: 1 } })
                        .toArray(),

                    marketDB.collection("cln_exchanges_manuals")
                        .find({ _id: { $in: ids.exchange_manual } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1, launch_date: 1, volume_24h: 1 } })
                        .toArray()
                ]);

                /* =========================
                   MAPS
                ========================= */
                const norm = v => v?.toString();

                const maps = {
                    token: Object.fromEntries(tokens.map(i => [norm(i._id), i])),
                    token_manual: Object.fromEntries(tokenManual.map(i => [norm(i._id), i])),
                    chain: Object.fromEntries(chains.map(i => [norm(i._id), i])),
                    chain_manual: Object.fromEntries(chainManual.map(i => [norm(i._id), i])),
                    exchange: Object.fromEntries(exchanges.map(i => [norm(i._id), i])),
                    exchange_manual: Object.fromEntries(exchangeManual.map(i => [norm(i._id), i]))
                };

                /* =========================
                   FINAL DATA (same response)
                ========================= */
                let final = products.map(p => {
                    const id = norm(p.product_row_id);
                    let product_data = "";

                    if (p.register_type === 1 && p.product_type === 1) product_data = maps.token[id];
                    else if (p.register_type === 2 && p.product_type === 1) product_data = maps.token_manual[id];
                    else if (p.register_type === 1 && p.product_type === 2) product_data = maps.chain[id];
                    else if (p.register_type === 2 && p.product_type === 2) product_data = maps.chain_manual[id];
                    else if (p.register_type === 1 && p.product_type === 3) product_data = maps.exchange[id];
                    else if (p.register_type === 2 && p.product_type === 3) product_data = maps.exchange_manual[id];

                    if (!product_data) return null;

                    return {
                        _id: p._id,
                        company_row_id: p.company_row_id,
                        product_type: p.product_type,
                        product_row_id: p.product_row_id,
                        purchased_date: p.purchased_date,
                        purchased_value: p.purchased_value,
                        purchased_value_in_usd: p.purchased_value_in_usd,
                        date_n_time: p.date_n_time,
                        regulatory_bodies_ids: p.regulatory_bodies_ids,
                        regulatory_types_ids: p.regulatory_types_ids,
                        country_id: p.country_id,
                        country_details: p.country_details,
                        product_data
                    };
                }).filter(Boolean);

                /* =========================
                   PAGINATION + COUNT
                ========================= */
                const total_counts = final.length;
                const get_query = final.slice(skip, skip + limit);

                await setCache({
                    key,
                    value: { list: get_query, count: total_counts },
                    ttl: 1800
                });

                return res.json({
                    status: true,
                    message: get_query,
                    count: total_counts,
                    cache_response_status: false,
                });

                // res.json({ status: true, message: get_query, count: total_counts })
            }
        }
        catch (err) {
            res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
        }
    }
    else {
        res.json({ status: false, message: checkUserToken })
    }
})

router.get('/get_exchange_country_details/:product_row_id/:skip/:limit', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4]);

    if (!checkUserToken.status) {
        return res.json({ status: false, message: checkUserToken });
    }

    try {
        let errObj = {};

        if (isNaN(parseInt(req.params.skip))) {
            errObj['skip'] = 'The parameter skip field must be contain valid number';
        }

        if (isNaN(parseInt(req.params.limit))) {
            errObj['limit'] = 'The parameter limit field must be contain valid number.';
        }

        let product_row_id = 0;
        if (!isNaN(parseInt(req.params.product_row_id))) {
            product_row_id = parseInt(req.params.product_row_id);
        } else {
            errObj['product_row_id'] = 'The product row id must be valid number.';
        }

        if (Object.keys(errObj).length) {
            return res.json({ status: false, message: errObj });
        }

        const skip = parseInt(req.params.skip);
        const limit = parseInt(req.params.limit);

        /* =========================
           FETCH PRODUCTS (DB1)
        ========================= */
        const products = await company_productsM.find({
            product_row_id: product_row_id
        }).sort({ _id: -1 });

        /* =========================
           GROUP IDS
        ========================= */
        const ids = {
            exchange: [],
            exchange_manual: []
        };

        products.forEach(p => {
            if (p.product_type === 3 && p.register_type === 1) ids.exchange.push(p.product_row_id);
            if (p.product_type === 3 && p.register_type === 2) ids.exchange_manual.push(p.product_row_id);
        });

        /* =========================
           FETCH FROM DB2
        ========================= */
        const [exchanges, exchangeManual] = await Promise.all([

            marketDB.collection("cln_exchanges")
                .find({ _id: { $in: ids.exchange } }, {
                    projection: {
                        _id: 1,
                        exchange_name: 1,
                        exchange_image: 1
                    }
                }).toArray(),

            marketDB.collection("cln_exchanges_manuals")
                .find({ _id: { $in: ids.exchange_manual } }, {
                    projection: {
                        _id: 1,
                        exchange_name: 1,
                        exchange_image: 1
                    }
                }).toArray()
        ]);

        /* =========================
           MAPS
        ========================= */
        const norm = v => v?.toString();

        const exchangeMap = Object.fromEntries(exchanges.map(i => [norm(i._id), i]));
        const exchangeManualMap = Object.fromEntries(exchangeManual.map(i => [norm(i._id), i]));

        /* =========================
           COUNTRY FETCH
        ========================= */
        const countryIds = [];

        products.forEach(p => {
            if (Array.isArray(p.country_details)) {
                p.country_details.forEach(c => {
                    if (c?.country_id) countryIds.push(c.country_id);
                });
            }
        });

        const countries = await marketDB.collection("cln_exchanges_static_countries")
            .find({ country_id: { $in: countryIds } }).toArray();

        const countryMap = Object.fromEntries(
            countries.map(c => [c.country_id, c])
        );

        /* =========================
           FINAL RESPONSE
        ========================= */
        let final = products.map(p => {
            const id = norm(p.product_row_id);

            let exchange =
                p.register_type === 1
                    ? exchangeMap[id]
                    : exchangeManualMap[id];

            if (!exchange) return null;

            const country_details = (p.country_details || []).map(c => ({
                ...c,
                ...(countryMap[c.country_id] || {})
            }));

            return {
                _id: p._id,
                company_row_id: p.company_row_id,
                product_row_id: p.product_row_id,
                exchange_name: exchange.exchange_name,
                exchange_image: exchange.exchange_image,
                country_details
            };
        }).filter(Boolean);

        const total_counts = final.length;
        const paginated = final.slice(skip, skip + limit);

        res.json({
            status: true,
            message: paginated,
            count: total_counts
        });

    } catch (err) {
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});

router.get('/delete_product/:edit_product_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (checkUserToken.status) {
        try {
            let user_row_id = 0
            let edit_product_row_id = 0
            let company_row_id = 0

            let errObj = {}
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (isNaN(parseInt(req.params.edit_product_row_id))) {
                errObj['edit_product_row_id'] = 'The own company product row id field must be contain valid number.'
            }
            else {
                edit_product_row_id = parseInt(req.params.edit_product_row_id)
                const check_query = await company_productsM.findOne({ _id: edit_product_row_id })




                if (!check_query) {
                    errObj['edit_product_row_id'] = 'Invalid  own company product row id.'
                }
                else {
                    const product_row_id = check_query.product_row_id
                    const company_row_id = check_query.company_row_id
                    const company_type = check_query.company_type
                    const product_type = check_query.product_type
                    const register_type = check_query.register_type


                    if (user_row_id) {
                        let validation_status = false
                        if (company_row_id && (company_type == 1)) {
                            const check_event_res = await checkCompanyRowID({ company_row_id: company_row_id, user_row_id: user_row_id })
                            if (check_event_res.status) {
                                validation_status = true
                            }
                        }

                        if (register_type === 1) {
                            if (product_row_id && (product_type == 1)) {
                                const check_token_query = await tokensM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
                                if (check_token_query) {
                                    validation_status = true
                                }
                            }

                            if (product_row_id && (product_type == 2)) {
                                const check_token_query = await chainsM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
                                if (check_token_query) {
                                    validation_status = true
                                }
                            }

                            if (product_row_id && (product_type == 3)) {
                                const check_token_query = await exchangeM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
                                if (check_token_query) {
                                    validation_status = true
                                }
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
                const check_query = await company_productsM.findOne({ _id: edit_product_row_id })

                await company_productsM.deleteOne({ _id: edit_product_row_id })
                await deleteKeysByPattern('company_product_list_*')
                await deleteKeysByPattern('app_company_individual_other_details_*')
                await deleteKeysByPattern('app_company_list_*')



                const existing = await companyM.findOne(
                    { _id: check_query?.company_row_id },
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
                const products = await company_productsM.exists({ company_row_id: check_query?.company_row_id });
                const owned_product_score = products ? 10 : 0;

                // Create updated score object (replacing only 1 field)
                const updatedScores = {
                    basic_details_score: existing.basic_details_score ?? 0,
                    seo_details_score: existing.seo_details_score ?? 0,
                    social_media_score: existing.social_media_score ?? 0,
                    owned_product_score: owned_product_score,
                    team_detail_score: existing.team_detail_score ?? 0,
                    job_opening_score: existing.job_opening_score ?? 0,
                    funding_score: existing.funding_score ?? 0,
                    revenue_score_score: existing.revenue_score_score ?? 0,
                    investment_score: existing.investment_score ?? 0,
                    faq_score: existing.faq_score ?? 0,
                    holding_crypto_score: existing?.holding_crypto_score ?? 0  // updated field
                };

                // Correct final score calculation
                const finalScore = Object.values(updatedScores)
                    .reduce((sum, val) => sum + (val || 0), 0);

                // Save update
                await companyM.updateOne(
                    { _id: check_query?.company_row_id },
                    {
                        owned_product_score: owned_product_score,
                        profile_score: finalScore
                    }
                );
                if (check_query.product_type == 2) {

                    await chainsM.updateOne(
                        { _id: check_query.product_row_id },
                        { $set: { owning_companies_score: 0 } }
                    );
                } else if (check_query.product_type == 3) {
                    await exchangeM.updateOne(
                        { _id: check_query.product_row_id },
                        { $set: { owning_companies_score: 0 } }
                    );
                }

                res.json({ status: true, message: { alert_message: 'This own company details for this company have been deleted successfully.' } })
            }
        }
        catch (err) {
            console.log('Delete Product Details.', err.message)
            res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.', err: err.message } })
        }
    }
    else {
        res.json(checkUserToken)
    }
})


router.get('/own_companies_list/:product_type/:product_row_id', async (req, res) => {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (checkUserToken.status) {
        try {
            let errObj = {}
            let product_type = 0
            let product_row_id = 0
            const check_in_array = [1, 2, 3]
            if (!isNaN(parseInt(req.params.product_type))) {
                if (check_in_array.includes(parseInt(req.params.product_type))) {
                    product_type = parseInt(req.params.product_type)
                }
                else {
                    errObj['product_type'] = 'Sorry, Invalid product type.'
                }
            }
            else {
                errObj['product_type'] = 'The product type field must be contain 1,2 or 3.'
            }

            if (isNaN(parseInt(req.params.product_row_id))) {
                errObj['product_row_id'] = 'The product row id field must be contain valid number.'
            }
            else {
                product_row_id = parseInt(req.params.product_row_id)
            }

            let user_row_id = 0
            if (checkUserToken.message.user_type == 1) {
                user_row_id = checkUserToken.message.user_row_id
            }

            if (product_row_id && (product_type === 1) && user_row_id) {
                const check_company = await tokensM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
                if (!check_company) {
                    errObj['product_row_id'] = 'Invalid product row id.'
                }
            }

            if (Object.keys(errObj).length) {
                res.json({ status: false, message: errObj })
            }
            else {
                const get_query = await company_productsM.aggregate([
                    { $sort: { _id: -1 } },
                    { $match: { product_row_id: product_row_id, product_type: product_type } },
                    {
                        $project: {
                            _id: 1,
                            company_row_id: 1,
                            company_type: 1,
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




router.get('/front_companies_list/:skip/:limit', async (req, res) => {
    const skip = !isNaN(parseInt(req.params.skip)) ? parseInt(req.params.skip) : 0;
    const limit = !isNaN(parseInt(req.params.limit)) ? parseInt(req.params.limit) : 100;

    try {
        let user_row_id = 0;
        const checkUserToken = checkUserLoginToken(req.headers);
        if (checkUserToken.status) {
            user_row_id = checkUserToken.message;
        }

        /* =========================
           FETCH PRODUCTS (DB1)
        ========================= */
        const products = await company_productsM.find({
            company_type: 1,
            register_type: 1
        }).sort({ _id: -1 });

        /* =========================
           GROUP BY COMPANY
        ========================= */
        const companyMap = {};

        products.forEach(p => {
            if (!companyMap[p.company_row_id]) {
                companyMap[p.company_row_id] = {
                    _id: p.company_row_id,
                    total: 0,
                    product_ids: []
                };
            }

            companyMap[p.company_row_id].total += 1;
            companyMap[p.company_row_id].product_ids.push({
                product_type: p.product_type,
                product_row_id: p.product_row_id
            });
        });

        const grouped = Object.values(companyMap);

        /* =========================
           COLLECT IDS
        ========================= */
        const tokenIds = [];
        const chainIds = [];
        const exchangeIds = [];

        grouped.forEach(c => {
            c.product_ids.forEach(p => {
                if (p.product_type === 1) tokenIds.push(p.product_row_id);
                if (p.product_type === 2) chainIds.push(p.product_row_id);
                if (p.product_type === 3) exchangeIds.push(p.product_row_id);
            });
        });

        /* =========================
           FETCH FROM DB2
        ========================= */
        const [tokens, chains, exchanges] = await Promise.all([

            marketDB.collection("cln_markets_tokens")
                .find({ _id: { $in: tokenIds } }, {
                    projection: { _id: 1, token_name: 1, token_image: 1 }
                }).toArray(),

            marketDB.collection("cln_chains")
                .find({ _id: { $in: chainIds } }, {
                    projection: { _id: 1, chain_name: 1, chain_image: 1 }
                }).toArray(),

            marketDB.collection("cln_exchanges")
                .find({ _id: { $in: exchangeIds } }, {
                    projection: { _id: 1, exchange_name: 1, exchange_image: 1 }
                }).toArray()
        ]);

        /* =========================
           MAPS
        ========================= */
        const norm = v => v?.toString();

        const tokenMap = Object.fromEntries(tokens.map(i => [norm(i._id), i]));
        const chainMap = Object.fromEntries(chains.map(i => [norm(i._id), i]));
        const exchangeMap = Object.fromEntries(exchanges.map(i => [norm(i._id), i]));

        /* =========================
           BUILD PRODUCT LIST
        ========================= */
        let result1 = grouped.map(c => {
            const product_list = c.product_ids.map(p => {
                const id = norm(p.product_row_id);

                if (p.product_type === 1) {
                    const t = tokenMap[id];
                    if (!t) return null;
                    return {
                        product_type: 1,
                        product_row_id: p.product_row_id,
                        token_name: t.token_name,
                        token_image: t.token_image
                    };
                }

                if (p.product_type === 2) {
                    const ch = chainMap[id];
                    if (!ch) return null;
                    return {
                        product_type: 2,
                        product_row_id: p.product_row_id,
                        chain_name: ch.chain_name,
                        chain_image: ch.chain_image
                    };
                }

                if (p.product_type === 3) {
                    const ex = exchangeMap[id];
                    if (!ex) return null;
                    return {
                        product_type: 3,
                        product_row_id: p.product_row_id,
                        exchange_name: ex.exchange_name,
                        exchange_image: ex.exchange_image
                    };
                }

                return null;
            }).filter(Boolean);

            return {
                _id: c._id,
                total: c.total,
                product_list
            };
        });

        /* =========================
           SORT + PAGINATION
        ========================= */
        result1 = result1.sort((a, b) => b.total - a.total);

        const total_counts = result1.length;
        result1 = result1.slice(skip, skip + limit);

        /* =========================
           COMPANY DETAILS (UNCHANGED)
        ========================= */
        const register_array = await array_column_without_null(result1, '_id');
        const company_list = await getFrontCompanyList({
            company_ids: register_array,
            user_row_id
        });

        let products_result = [];

        for (let run of result1) {
            const company_details = company_list.find(el => el._id == run._id);

            if (company_details) {
                products_result.push({
                    _id: run._id,
                    total: run.total,
                    product_list: run.product_list,
                    company_type: run.company_type,
                    date_n_time: run.date_n_time,
                    approval_status: company_details.approval_status,
                    company_name: company_details.company_name,
                    company_id: company_details.company_id,
                    company_email_id: company_details.company_email_id,
                    describe_in_one_line: company_details.describe_in_one_line,
                    company_size_row_id: company_details.company_size_row_id,
                    company_valuation: company_details.company_location,
                    country_name: company_details.country_flag,
                    main_business_model_name: company_details.main_business_model_name,
                    business_name: company_details.business_name,
                    watchlist_status: company_details.watchlist_status,
                    following_status: company_details.following_status,
                    total_followers: company_details.total_followers
                });
            }
        }

        res.json({
            status: true,
            message: products_result,
            count: total_counts
        });

    } catch (err) {
        res.json({
            status: false,
            message: 'An unexpected error occurred. Please try again later.',
            err: err.message
        });
    }
});






module.exports = router