const express = require('express')
const router = express.Router()

const { marketDB } = require('../../../../config/database_connector');
const company_productsM = require('../../../../models/markets/products_n_holding/company_productsM');
const company_holdingM = require('../../../../models/markets/products_n_holding/company_holdingM');


router.get('/company_details/:company_row_id', async (req, res) => {
    try {
        let result = {};
        const company_row_id = parseInt(req.params.company_row_id);

        if (!isNaN(company_row_id)) {

            /* =========================
               PRODUCTS (DB1)
            ========================= */
            const products = await company_productsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { company_row_id: company_row_id, company_type: 1 } }
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
               FETCH FROM DB2 (FIXED)
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
                    .find({ _id: { $in: ids.token } }, {
                        projection: {
                            _id: 1,
                            token_id: 1,
                            symbol: 1,
                            token_name: 1,
                            token_image: 1,
                            price: 1,
                            percent_change_24h: 1,
                            marketcap: 1,
                            approval_status: 1,
                            volume: 1
                        }
                    }).toArray(),

                marketDB.collection("cln_markets_search_contract_addresses")
                    .find({ _id: { $in: ids.token_manual } }, {
                        projection: {
                            _id: 1,
                            symbol: 1,
                            token_name: 1,
                            token_image: 1
                        }
                    }).toArray(),

                marketDB.collection("cln_chains")
                    .find({ _id: { $in: ids.chain } }, {
                        projection: {
                            _id: 1,
                            chain_name: 1,
                            chain_image: 1,
                            chain_slug: 1,
                            chain_id: 1,
                            tvl: 1,
                            protocols: 1,
                            mcap: 1,
                            status: 1
                        }
                    }).toArray(),

                marketDB.collection("cln_chains_manuals")
                    .find({ _id: { $in: ids.chain_manual } }, {
                        projection: {
                            _id: 1,
                            chain_name: 1,
                            chain_symbol: 1,
                            chain_id: 1,
                            chain_link: 1
                        }
                    }).toArray(),

                marketDB.collection("cln_exchanges")
                    .find({ _id: { $in: ids.exchange } }, {
                        projection: {
                            _id: 1,
                            exchange_name: 1,
                            exchange_image: 1,
                            exchange_slug: 1,
                            launch_date: 1,
                            volume_24h: 1,
                            total_pairs: 1,
                            total_coins: 1,
                            status: 1
                        }
                    }).toArray(),

                marketDB.collection("cln_exchanges_manuals")
                    .find({ _id: { $in: ids.exchange_manual } }, {
                        projection: {
                            _id: 1,
                            exchange_name: 1,
                            exchange_image: 1,
                            launch_date: 1,
                            volume_24h: 1,
                            total_pairs: 1,
                            total_coins: 1
                        }
                    }).toArray()
            ]);

            /* =========================
               MAP CREATION
            ========================= */
            const toMap = arr =>
                Object.fromEntries(arr.map(i => [i._id.toString(), i]));

            const maps = {
                token: toMap(tokens),
                token_manual: toMap(tokenManual),
                chain: toMap(chains),
                chain_manual: toMap(chainManual),
                exchange: toMap(exchanges),
                exchange_manual: toMap(exchangeManual)
            };

            /* =========================
               FINAL PRODUCTS (FIXED)
            ========================= */
            result['products'] = products.map(p => {
                let product_data = "";

                const id = p._id.toString();

                if (p.register_type === 1 && p.product_type === 1)
                    product_data = maps.token[id] || null;

                else if (p.register_type === 2 && p.product_type === 1)
                    product_data = maps.token_manual[id] || null;

                else if (p.register_type === 1 && p.product_type === 2)
                    product_data = maps.chain[id] || null;

                else if (p.register_type === 2 && p.product_type === 2)
                    product_data = maps.chain_manual[id] || null;

                else if (p.register_type === 1 && p.product_type === 3)
                    product_data = maps.exchange[id] || null;

                else if (p.register_type === 2 && p.product_type === 3)
                    product_data = maps.exchange_manual[id] || null;

                return {
                    _id: p._id,
                    register_type: p.register_type,
                    company_row_id: p.company_row_id,
                    product_type: p.product_type,
                    product_row_id: p.product_row_id,
                    purchased_date: p.purchased_date,
                    purchased_value: p.purchased_value,
                    purchased_value_in_usd: p.purchased_value_in_usd,
                    date_n_time: p.date_n_time,
                    product_data
                };
            });

            /* =========================
               HOLDINGS (DB1)
            ========================= */
            const holdings = await company_holdingM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { company_row_id: company_row_id, company_type: 1 } }
            ]);

            const tokenIds = [];
            const manualTokenIds = [];

            holdings.forEach(h => {
                if (h.token_type === 1) tokenIds.push(h.token_row_id);
                if (h.token_type === 2) manualTokenIds.push(h.token_row_id);
            });

            const [holdingTokens, holdingManualTokens] = await Promise.all([

                marketDB.collection("cln_markets_tokens")
                    .find({ _id: { $in: tokenIds }, active_status: 1 }, {
                        projection: {
                            _id: 1,
                            symbol: 1,
                            token_name: 1,
                            token_id: 1,
                            token_image: 1,
                            price: 1,
                            percent_change_24h: 1,
                            marketcap: 1,
                            total_supply: 1,
                            circulating_supply: 1,
                            volume: 1,
                            approval_status: 1
                        }
                    }).toArray(),

                marketDB.collection("cln_markets_search_contract_addresses")
                    .find({ _id: { $in: manualTokenIds } }, {
                        projection: {
                            _id: 1,
                            symbol: 1,
                            token_name: 1,
                            token_image: 1,
                            contract_address: 1
                        }
                    }).toArray()
            ]);

            const tokenMap = toMap(holdingTokens);
            const manualMap = toMap(holdingManualTokens);

            /* =========================
               FINAL HOLDINGS (FIXED)
            ========================= */
            result['holding'] = holdings
                .map(h => {
                    const id = h.token_row_id?.toString();

                    let token_info = h.token_type === 1 ? tokenMap[id] : null;
                    let manual_info = h.token_type === 2 ? manualMap[id] : null;

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
                        token_id: token_info?.token_id || "",
                        approval_status: token_info?.approval_status || 0,
                        token_name: token_info?.token_name || manual_info?.token_name,
                        symbol: token_info?.symbol || manual_info?.symbol,
                        token_image: token_info?.token_image || "",
                        price: token_info?.price || "",
                        percent_change_24h: token_info?.percent_change_24h || "",
                        marketcap: token_info?.marketcap || ""
                    };
                })
                .filter(Boolean);
        }

        res.json({ status: true, message: result });

    } catch (err) {
        res.json({
            status: false,
            message: {
                alert_message: 'An unexpected error occurred. Please try again later.',
                err: err.message
            }
        });
    }
});

router.get('/company_product_details/:company_row_id/:skip/:limit', async (req, res) => {
    try {
        const company_row_id = parseInt(req.params.company_row_id);

        if (!isNaN(company_row_id)) {
            const skip = !isNaN(parseInt(req.params.skip)) ? parseInt(req.params.skip) : 0;
            const limit = !isNaN(parseInt(req.params.limit)) ? parseInt(req.params.limit) : 100;

            /* =========================
               FETCH PRODUCTS (DB1)
            ========================= */
            const products = await company_productsM.aggregate([
                { $sort: { _id: -1 } },
                { $match: { company_row_id: company_row_id, company_type: 1 } }
            ]).skip(skip).limit(limit);

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
               🔥 FIX: HANDLE ObjectId
            ========================= */


            const tokenIds = ids.token;
            const tokenManualIds = ids.token_manual
            const chainIds = ids.chain;
            const chainManualIds = ids.chain_manual;
            const exchangeIds = ids.exchange;
            const exchangeManualIds = ids.exchange_manual;

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

                tokenIds.length
                    ? marketDB.collection("cln_markets_tokens")
                        .find({ _id: { $in: tokenIds } }, {
                            projection: {
                                _id: 1,
                                token_id: 1,
                                symbol: 1,
                                token_name: 1,
                                token_image: 1,
                                price: 1,
                                percent_change_24h: 1,
                                marketcap: 1,
                                approval_status: 1,
                                volume: 1
                            }
                        }).toArray()
                    : [],

                tokenManualIds.length
                    ? marketDB.collection("cln_markets_search_contract_addresses")
                        .find({ _id: { $in: tokenManualIds } }, {
                            projection: {
                                _id: 1,
                                symbol: 1,
                                token_name: 1,
                                token_image: 1
                            }
                        }).toArray()
                    : [],

                chainIds.length
                    ? marketDB.collection("cln_chains")
                        .find({ _id: { $in: chainIds } }, {
                            projection: {
                                _id: 1,
                                chain_name: 1,
                                chain_image: 1,
                                chain_slug: 1,
                                chain_id: 1,
                                tvl: 1,
                                protocols: 1,
                                mcap: 1,
                                status: 1
                            }
                        }).toArray()
                    : [],

                chainManualIds.length
                    ? marketDB.collection("cln_chains_manuals")
                        .find({ _id: { $in: chainManualIds } }, {
                            projection: {
                                _id: 1,
                                chain_name: 1,
                                chain_symbol: 1,
                                chain_id: 1,
                                chain_link: 1
                            }
                        }).toArray()
                    : [],

                exchangeIds.length
                    ? marketDB.collection("cln_exchanges")
                        .find({ _id: { $in: exchangeIds } }, {
                            projection: {
                                _id: 1,
                                exchange_name: 1,
                                exchange_image: 1,
                                exchange_slug: 1,
                                launch_date: 1,
                                volume_24h: 1,
                                total_pairs: 1,
                                total_coins: 1,
                                cmc_id: 1,
                                fiat_currency: 1,
                                status: 1
                            }
                        }).toArray()
                    : [],

                exchangeManualIds.length
                    ? marketDB.collection("cln_exchanges_manuals")
                        .find({ _id: { $in: exchangeManualIds } }, {
                            projection: {
                                _id: 1,
                                exchange_name: 1,
                                exchange_image: 1,
                                launch_date: 1,
                                volume_24h: 1,
                                total_pairs: 1,
                                total_coins: 1,
                                cmc_id: 1,
                                fiat_currency: 1
                            }
                        }).toArray()
                    : []
            ]);

            /* =========================
               MAPS
            ========================= */
            const toMap = arr =>
                Object.fromEntries(arr.map(i => [i._id.toString(), i]));

            const maps = {
                token: toMap(tokens),
                token_manual: toMap(tokenManual),
                chain: toMap(chains),
                chain_manual: toMap(chainManual),
                exchange: toMap(exchanges),
                exchange_manual: toMap(exchangeManual)
            };

            /* =========================
               FINAL RESPONSE
            ========================= */
            const final = products.map(p => {
                const id = p.product_row_id
                let product_data = "";

                if (p.register_type === 1 && p.product_type === 1)
                    product_data = maps.token[id] || null;

                else if (p.register_type === 2 && p.product_type === 1)
                    product_data = maps.token_manual[id] || null;

                else if (p.register_type === 1 && p.product_type === 2)
                    product_data = maps.chain[id] || null;

                else if (p.register_type === 2 && p.product_type === 2)
                    product_data = maps.chain_manual[id] || null;

                else if (p.register_type === 1 && p.product_type === 3)
                    product_data = maps.exchange[id] || null;

                else if (p.register_type === 2 && p.product_type === 3)
                    product_data = maps.exchange_manual[id] || null;

                return {
                    _id: p._id,
                    register_type: p.register_type,
                    company_row_id: p.company_row_id,
                    product_type: p.product_type,
                    product_row_id: p.product_row_id,
                    purchased_date: p.purchased_date,
                    purchased_value: p.purchased_value,
                    purchased_value_in_usd: p.purchased_value_in_usd,
                    date_n_time: p.date_n_time,
                    product_data
                };
            });

            /* =========================
               COUNT (NO LOOKUP NEEDED)
            ========================= */
            const count = await company_productsM.countDocuments({
                company_row_id: company_row_id,
                company_type: 1
            });

            res.json({
                status: true,
                message: final,
                count: count
            });
        }

    } catch (err) {
        res.json({
            status: false,
            message: {
                alert_message: 'An unexpected error occurred. Please try again later.',
                err: err.message
            }
        });
    }
});


router.get('/company_holdings_details/:company_row_id/:skip/:limit', async (req, res) => {
    try {
        const company_row_id = parseInt(req.params.company_row_id);

        if (!isNaN(company_row_id)) {

            const skip = !isNaN(parseInt(req.params.skip)) ? parseInt(req.params.skip) : 0;
            const limit = !isNaN(parseInt(req.params.limit)) ? parseInt(req.params.limit) : 100;

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
                                    token_id: 1,
                                    token_image: 1,
                                    price: 1,
                                    percent_change_24h: 1,
                                    marketcap: 1,
                                    total_supply: 1,
                                    circulating_supply: 1,
                                    volume: 1,
                                    approval_status: 1
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
            const normalize = v => v?.toString();

            const tokenMap = Object.fromEntries(tokens.map(i => [normalize(i._id), i]));
            const manualMap = Object.fromEntries(manualTokens.map(i => [normalize(i._id), i]));

            /* =========================
               FINAL RESPONSE (SAME STRUCTURE)
            ========================= */
            const final = holdings
                .map(h => {
                    const id = normalize(h.token_row_id);

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
                        token_id: token_info?.token_id || "",
                        approval_status: token_info?.approval_status || 0,
                        token_name: token_info?.token_name || manual_info?.token_name,
                        symbol: token_info?.symbol || manual_info?.symbol,
                        token_image: token_info?.token_image || "",
                        price: token_info?.price || "",
                        percent_change_24h: token_info?.percent_change_24h || "",
                        marketcap: token_info?.marketcap || ""
                    };
                })
                .filter(Boolean);

            /* =========================
               COUNT (NO LOOKUP NEEDED)
            ========================= */
            const count = await company_holdingM.countDocuments({
                company_row_id: company_row_id,
                company_type: 1
            });

            res.json({
                status: true,
                message: final,
                count: count
            });
        }

    } catch (err) {
        res.json({
            status: false,
            message: {
                alert_message: 'An unexpected error occurred. Please try again later.',
                err: err.message
            }
        });
    }
});

router.get('/compare_company_products', async (req, res) => {
    try {
        let company_row_ids = req.query.company_row_ids;

        if (!company_row_ids) {
            return res.json({ status: false, message: "company_row_ids is required" });
        }

        if (typeof company_row_ids === "string") {
            try {
                company_row_ids = JSON.parse(company_row_ids);
            } catch {
                return res.json({ status: false, message: "company_row_ids must be array" });
            }
        }

        if (!Array.isArray(company_row_ids)) {
            return res.json({ status: false, message: "company_row_ids must be array" });
        }

        company_row_ids = company_row_ids.map(id => parseInt(id)).filter(id => !isNaN(id));

        /* =========================
           PRODUCTS (DB1)
        ========================= */
        const products = await company_productsM.aggregate([
            { $match: { company_row_id: { $in: company_row_ids }, company_type: 1 } },
            { $sort: { _id: -1 } }
        ]);

        /* =========================
           HOLDINGS (DB1)
        ========================= */
        const holdings = await company_holdingM.aggregate([
            { $match: { company_row_id: { $in: company_row_ids }, company_type: 1 } },
            { $sort: { _id: -1 } }
        ]);

        /* =========================
           GROUP IDS
        ========================= */
        const ids = {
            token: [],
            token_manual: [],
            chain: [],
            exchange: [],
            holding_token: [],
            holding_manual: []
        };

        products.forEach(p => {
            if (p.product_type === 1 && p.register_type === 1) ids.token.push(p.product_row_id);
            if (p.product_type === 1 && p.register_type === 2) ids.token_manual.push(p.product_row_id);
            if (p.product_type === 2) ids.chain.push(p.product_row_id);
            if (p.product_type === 3) ids.exchange.push(p.product_row_id);
        });

        holdings.forEach(h => {
            if (h.token_type === 1) ids.holding_token.push(h.token_row_id);
            if (h.token_type === 2) ids.holding_manual.push(h.token_row_id);
        });

        /* =========================
           FETCH FROM DB2
        ========================= */
        const [
            tokens,
            tokenManual,
            chains,
            exchanges,
            holdingTokens,
            holdingManual
        ] = await Promise.all([

            marketDB.collection("cln_markets_tokens")
                .find({ _id: { $in: ids.token } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1, volume: 1, approval_status: 1 } })
                .toArray(),

            marketDB.collection("cln_markets_search_contract_addresses")
                .find({ _id: { $in: ids.token_manual } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1 } })
                .toArray(),

            marketDB.collection("cln_chains")
                .find({ _id: { $in: ids.chain } }, { projection: { _id: 1, chain_name: 1, chain_image: 1, tvl: 1, mcap: 1 } })
                .toArray(),

            marketDB.collection("cln_exchanges")
                .find({ _id: { $in: ids.exchange } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1, volume_24h: 1 } })
                .toArray(),

            marketDB.collection("cln_markets_tokens")
                .find({ _id: { $in: ids.holding_token }, active_status: 1 }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1 } })
                .toArray(),

            marketDB.collection("cln_markets_search_contract_addresses")
                .find({ _id: { $in: ids.holding_manual } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1 } })
                .toArray()
        ]);

        /* =========================
           MAPS (STRING SAFE)
        ========================= */
        const norm = v => v?.toString();

        const tokenMap = Object.fromEntries(tokens.map(i => [norm(i._id), i]));
        const tokenManualMap = Object.fromEntries(tokenManual.map(i => [norm(i._id), i]));
        const chainMap = Object.fromEntries(chains.map(i => [norm(i._id), i]));
        const exchangeMap = Object.fromEntries(exchanges.map(i => [norm(i._id), i]));
        const holdingTokenMap = Object.fromEntries(holdingTokens.map(i => [norm(i._id), i]));
        const holdingManualMap = Object.fromEntries(holdingManual.map(i => [norm(i._id), i]));

        /* =========================
           BUILD COMPANY MAP
        ========================= */
        const companyMap = {};
        company_row_ids.forEach(id => {
            companyMap[id] = { company_row_id: id, tokens: [], chains: [], exchanges: [], holdings: [] };
        });

        /* =========================
           PRODUCTS MAP
        ========================= */
        products.forEach(p => {
            const id = norm(p.product_row_id);

            let data = null;

            if (p.product_type === 1)
                data = p.register_type === 1 ? tokenMap[id] : tokenManualMap[id];

            if (p.product_type === 2)
                data = chainMap[id];

            if (p.product_type === 3)
                data = exchangeMap[id];

            if (!data) return;

            if (p.product_type === 1) companyMap[p.company_row_id].tokens.push(data);
            if (p.product_type === 2) companyMap[p.company_row_id].chains.push(data);
            if (p.product_type === 3) companyMap[p.company_row_id].exchanges.push(data);
        });

        /* =========================
           HOLDINGS MAP
        ========================= */
        holdings.forEach(h => {
            const id = norm(h.token_row_id);

            const token_info = h.token_type === 1 ? holdingTokenMap[id] : null;
            const manual_info = h.token_type === 2 ? holdingManualMap[id] : null;

            const data = token_info || manual_info;
            if (!data) return;

            companyMap[h.company_row_id].holdings.push({
                ...h,
                token_name: data.token_name,
                symbol: data.symbol,
                token_image: data.token_image,
                price: data.price || "",
                percent_change_24h: data.percent_change_24h || "",
                marketcap: data.marketcap || ""
            });
        });

        /* =========================
           SORT & LIMIT
        ========================= */
        Object.values(companyMap).forEach(c => {
            c.tokens = c.tokens.sort((a, b) => (b.marketcap || 0) - (a.marketcap || 0)).slice(0, 5);
            c.chains = c.chains.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 5);
            c.exchanges = c.exchanges.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0)).slice(0, 5);
            c.holdings = c.holdings.sort((a, b) => (b.marketcap || 0) - (a.marketcap || 0)).slice(0, 5);
        });

        const companies = company_row_ids.map(id => companyMap[id]).filter(Boolean);

        res.json({ status: true, companies });

    } catch (err) {
        res.json({
            status: false,
            message: { alert_message: "Unexpected error occurred", err: err.message }
        });
    }
});

module.exports = router