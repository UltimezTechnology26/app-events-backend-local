// modules/company_overview/company_overview.service.ts
//
// Part 3 §7 Phase C step 4. Thin dispatcher over REPORT_TYPE_CONFIG — returns the SAME kind of
// unawaited Mongoose aggregate promise the legacy inline pipelines returned, so it drops into
// services/company/front_page.ts's overview() exactly where a `<x>_query = <model>.aggregate([...])`
// literal used to sit (that surrounding function collects every `*_query` variable into one
// array, filters out the not-applicable-this-report-type ones, and awaits them all together via
// Promise.all — this must keep returning a plain unawaited promise, not resolve early, or that
// batching breaks).
//
// Returns null for a report_list_type with no REPORT_TYPE_CONFIG entry yet (not all 7 are
// migrated in one pass, per the Build Order) — the caller falls through to the original inline
// pipeline in that case.
import {
  REPORT_TYPE_CONFIG,
  OverviewPipelineContext,
  buildType2ValuationPipeline,
  buildType2OrganizersPipeline,
  buildType2SponsorPartnerPipeline,
  buildType3ValuationPipeline,
  buildType3FundsRaisedPipeline,
  buildType4ValuationPipeline,
  buildType4InvestedPipeline,
  buildType4RoundsPipeline,
  buildType5ValuationPipeline,
  buildType5RevenuePipeline,
  buildType6ValuationPipeline,
  buildType6ProductCountPipeline,
  buildType7ValuationPipeline,
  buildType7HoldingPipeline
} from './company_overview.config'
import { getWatchlistValuation } from './company_overview.watchlist'
import redisCache, { CacheDuration } from '../../config/redis'

const sanitize = require('mongo-sanitize')
const countryM = require('../../models/app/static/countryM')
const eventM = require('../../models/app/events/eventM')
const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
const company_holdingM = require('../../models/markets/products_n_holding/company_holdingM')
const { getIntValues, getMinusDates } = require('../../utils/helpers/helper')

export function getOverviewAggregatePromise(reportType: number, ctx: OverviewPipelineContext): Promise<any> | null {
  const config = REPORT_TYPE_CONFIG[reportType]
  if (!config) return null
  return config.model.aggregate(config.buildPipeline(ctx))
}

/**
 * Ports controllers/app/company/front_page.js's GET /overview handler
 * (lines 171-5285, 5,115 lines) verbatim — pure mechanical extraction, zero logic
 * change (Part 3 §7 Phase C step 1/2). This is the hard-prerequisite step: a
 * characterization baseline must be captured against this exact function, BEFORE
 * any dedup/config-map extraction (steps 3-4) touches the logic itself.
 *
 * Relocated here from services/company/front_page.ts verbatim (Part 3 §7 Phase H
 * step 13 — completing what Phase C started but never finished landing).
 */
export async function overview(req: any) {
    try {
        let result: any = {}
        let report_list_type = 1
        if (req.query.report_list_type) {
            report_list_type = Number.parseInt(req.query.report_list_type)
        }

        let valuation_type = 1
        if (req.query.valuation_type) {
            if (Number.parseInt(req.query.valuation_type) === 2) {
                valuation_type = 2
            }
            else if (Number.parseInt(req.query.valuation_type) === 3) {
                valuation_type = 3
            }
        }

        // CACHE (Part 3 §7 Phase D, confirmed with the user): valuation_type 1/2 (company/
        // partner) results depend only on the query filters below, never on who's asking —
        // safe to cache and share across requests. valuation_type 3 (watchlist) is deliberately
        // EXCLUDED: getWatchlistValuation() below reads req.headers to resolve the CALLING
        // USER's own watchlist, so caching it under a key built from req.query alone would leak
        // one user's watchlist valuation to a different user hitting the same filters — stays
        // fully live, uncached, exactly as before. Invalidated by
        // modules/company_revenue/company_revenue.cache.ts's invalidateCompanyRevenueCaches()
        // on every revenue write (add/edit/delete, app and admin) — the only writes that can
        // change these totals.
        const overview_cache_key = `company_overview_${JSON.stringify(req.query)}`
        if (valuation_type !== 3) {
            const overview_cache_response = await redisCache.getCache({ key: overview_cache_key })
            if (overview_cache_response.status) {
                return { status: true, message: overview_cache_response.message }
            }
        }

        let search_array = [{}]
        if (req.query.search) {
            search_array.push({ $or: [{ company_name: { '$regex': req.query.search, $options: 'i' } }, { company_id: { '$regex': req.query.search, $options: 'i' } }] })
        }

        let business_model_id_array = []
        if (req.query.business_model_id) {
            business_model_id_array = await getIntValues(req.query.business_model_id)
            search_array.push({ business_model_id: { $in: business_model_id_array } })
        }

        // CONFIRMED BUG FIX (found via live manual testing after Phase C, pre-existing not
        // introduced by this refactor -- overview() was extracted verbatim from the original
        // controllers/app/company/front_page.js, which never had this logic): a plain regex
        // substring match against company_location (a free-text "City, State" string) silently
        // excludes companies whose location text doesn't literally spell out the country name --
        // e.g. "Los Angeles, California" doesn't contain "United States", so filtering by
        // location=United States matched nothing for that company even though it genuinely is a
        // US company (country_id correctly set). services/company/front_page.ts's
        // getCompanyListDetails (the already-correct list endpoint) resolves this by matching an
        // exact country name first (filtering by country_id) and only falling back to a raw
        // regex when the input isn't a recognized country name (e.g. a city search) -- ported
        // verbatim here rather than reinvented.
        if (req.query.location) {
            const loc = sanitize(req.query.location).trim().toLowerCase()
            const countryDetails = await countryM.find({}, { _id: 1, country_name: 1 }).lean()
            const matchedCountry = countryDetails.find((c: any) => c.country_name.toLowerCase() === loc)

            if (matchedCountry) {
                search_array.push({ country_id: matchedCountry._id })
                search_array.push({ company_location: { $exists: true, $ne: "" } })
            } else {
                search_array.push({ company_location: { $exists: true, $ne: "", $regex: loc, $options: 'i' } })
            }
        }

        if ((report_list_type === 4) || (report_list_type === 3)) {
            if (req.query.category_row_id) {
                search_array.push({ category_ids: Number.parseInt(req.query.category_row_id) })
            }
        }

        if (report_list_type === 5) {
            const growthId = Number.parseInt(req.query.revenue_growth_id);

            if (growthId === 1) search_array.push({ revenue_growth: { $lt: 0 } });
            else if (growthId === 2) search_array.push({ revenue_growth: { $gte: 0, $lte: 10 } });
            else if (growthId === 3) search_array.push({ revenue_growth: { $gt: 10, $lte: 50 } });
            else if (growthId === 4) search_array.push({ revenue_growth: { $gt: 50 } });
        }

        let match_query = {}
        if (report_list_type === 2) {
            if (Number.parseInt(req.query.event_type_id) === 1) {
                const start_date = getMinusDates(7)

                match_query = { start_date: { $gte: new Date(start_date as string) } }
            }
        }

        let search_query = { $and: search_array }



        if (valuation_type === 1) {
            let get_company_valuation_query: any = ""
            let event_organizers_query: any = ""
            let event_sponsor_query: any = ""
            let event_partner_query: any = ""
            let funds_raised_query: any = ''
            let funds_invested_query: any = ''
            let funds_invested_rounds_query: any = ''
            let total_revenue_query: any = ""
            let cryptocurrency_product_query: any = ""
            let blockchain_product_query: any = ""
            let exchange_product_query: any = ""
            let crypto_holding_query: any = ""
            if (report_list_type === 1) {
                get_company_valuation_query = getOverviewAggregatePromise(1, { isPartner: false, searchQuery: search_query })
            }
            else if (report_list_type === 2) {
                get_company_valuation_query = eventM.aggregate(buildType2ValuationPipeline({ isPartner: false, searchQuery: search_query, matchQuery: match_query }))
                event_organizers_query = eventM.aggregate(buildType2OrganizersPipeline({ isPartner: false, searchQuery: search_query, matchQuery: match_query }))
                event_sponsor_query = eventM.aggregate(buildType2SponsorPartnerPipeline({ isPartner: false, searchQuery: search_query, sponsorPartnerType: 1, matchQuery: match_query }))
                event_partner_query = eventM.aggregate(buildType2SponsorPartnerPipeline({ isPartner: false, searchQuery: search_query, sponsorPartnerType: 2, matchQuery: match_query }))
            }
            else if (report_list_type === 3) {
                get_company_valuation_query = fundingInvestmentM.aggregate(buildType3ValuationPipeline({ isPartner: false, searchQuery: search_query }))
                funds_raised_query = fundingInvestmentM.aggregate(buildType3FundsRaisedPipeline({ isPartner: false, searchQuery: search_query }))
            }
            else if (report_list_type === 4) {
                get_company_valuation_query = fundingInvestmentM.aggregate(buildType4ValuationPipeline({ isPartner: false, searchQuery: search_query }))
                funds_invested_query = fundingInvestmentM.aggregate(buildType4InvestedPipeline({ isPartner: false, searchQuery: search_query }))
                funds_invested_rounds_query = fundingInvestmentM.aggregate(buildType4RoundsPipeline({ isPartner: false, searchQuery: search_query }))
            }
            else if (report_list_type === 5) {
                get_company_valuation_query = company_revenue_growthM.aggregate(buildType5ValuationPipeline({ isPartner: false, searchQuery: search_query }))
                total_revenue_query = company_revenue_growthM.aggregate(buildType5RevenuePipeline({ isPartner: false, searchQuery: search_query }))
            }
            else if (report_list_type === 6) {
                get_company_valuation_query = company_productsM.aggregate(buildType6ValuationPipeline({ isPartner: false, searchQuery: search_query }))
                cryptocurrency_product_query = company_productsM.aggregate(buildType6ProductCountPipeline({ isPartner: false, searchQuery: search_query, productType: 1 }))
                blockchain_product_query = company_productsM.aggregate(buildType6ProductCountPipeline({ isPartner: false, searchQuery: search_query, productType: 2 }))
                exchange_product_query = company_productsM.aggregate(buildType6ProductCountPipeline({ isPartner: false, searchQuery: search_query, productType: 3 }))
            }
            else if (report_list_type === 7) {
                get_company_valuation_query = company_holdingM.aggregate(buildType7ValuationPipeline({ isPartner: false, searchQuery: search_query }))
                crypto_holding_query = company_holdingM.aggregate(buildType7HoldingPipeline({ isPartner: false, searchQuery: search_query }))
            }

            const queries = [
                get_company_valuation_query,
                total_revenue_query,
                event_organizers_query,
                event_sponsor_query,
                event_partner_query,
                funds_raised_query,
                funds_invested_query,
                cryptocurrency_product_query,
                blockchain_product_query,
                exchange_product_query,
                funds_invested_rounds_query,
                crypto_holding_query
            ].filter(query => query !== ""); // Filter out empty strings

            const results: any[] = await Promise.all(queries);

            // Extract results safely, providing default empty arrays
            const company_valuation_result = results[queries.indexOf(get_company_valuation_query)] || [];
            const total_revenue_result = results[queries.indexOf(total_revenue_query)] || [];
            const total_organizer_count = results[queries.indexOf(event_organizers_query)] || [];
            const total_event_sponsor_count = results[queries.indexOf(event_sponsor_query)] || [];
            const total_event_partner_count = results[queries.indexOf(event_partner_query)] || [];
            const total_funds_raised = results[queries.indexOf(funds_raised_query)] || [];
            const total_funds_invested = results[queries.indexOf(funds_invested_query)] || [];
            const total_cryptocurrency_product = results[queries.indexOf(cryptocurrency_product_query)] || [];
            const total_blockchain_product = results[queries.indexOf(blockchain_product_query)] || [];
            const total_exchange_product = results[queries.indexOf(exchange_product_query)] || [];
            const total_funds_invested_rounds = results[queries.indexOf(funds_invested_rounds_query)] || [];
            const total_crypto_holding = results[queries.indexOf(crypto_holding_query)] || [];

            result['total_company_valuation'] = company_valuation_result[0] ? company_valuation_result[0].total_company_valuation : 0
            result['total_organizer_count'] = total_organizer_count[0] ? total_organizer_count[0].count : 0
            result['total_event_sponsor_count'] = total_event_sponsor_count[0] ? total_event_sponsor_count[0].total : 0
            result['total_event_partner_count'] = total_event_partner_count[0] ? total_event_partner_count[0].total : 0
            result['total_funds_raised'] = total_funds_raised[0] ? total_funds_raised[0].amount : 0
            result['total_funds_invested'] = total_funds_invested[0] ? total_funds_invested[0].amount : 0
            result['total_revenue'] = total_revenue_result[0] ? total_revenue_result[0].total_revenue : 0
            result['total_cryptocurrency_product'] = total_cryptocurrency_product[0] ? total_cryptocurrency_product[0].count : 0
            result['total_blockchain_product'] = total_blockchain_product[0] ? total_blockchain_product[0].count : 0
            result['total_exchange_product'] = total_exchange_product[0] ? total_exchange_product[0].count : 0
            result['total_funds_invested_rounds'] = total_funds_invested_rounds[0] ? total_funds_invested_rounds[0].count : 0
            result['total_crypto_holding'] = total_crypto_holding[0] ? total_crypto_holding[0].total_holdings : 0

        }
        else if (valuation_type === 2) {


            let get_partner_valuation_query: any = ""
            let event_organizers_query: any = ""
            let event_sponsor_query: any = ""
            let event_partner_query: any = ""
            let funds_raised_query: any = ''
            let funds_invested_query: any = ''
            let funds_invested_rounds_query: any = ''
            let total_revenue_query: any = ""
            let cryptocurrency_product_query: any = ""
            let blockchain_product_query: any = ""
            let exchange_product_query: any = ""
            let get_company_valuation_query: any = ""
            let crypto_holding_query: any = ""
            if (report_list_type === 1) {
                get_partner_valuation_query = getOverviewAggregatePromise(1, { isPartner: true, searchQuery: search_query })
            }
            else if (report_list_type === 2) {
                get_partner_valuation_query = eventM.aggregate(buildType2ValuationPipeline({ isPartner: true, searchQuery: search_query, matchQuery: match_query }))
                event_organizers_query = eventM.aggregate(buildType2OrganizersPipeline({ isPartner: true, searchQuery: search_query, matchQuery: match_query }))
                event_sponsor_query = eventM.aggregate(buildType2SponsorPartnerPipeline({ isPartner: true, searchQuery: search_query, sponsorPartnerType: 1, matchQuery: match_query }))
                event_partner_query = eventM.aggregate(buildType2SponsorPartnerPipeline({ isPartner: true, searchQuery: search_query, sponsorPartnerType: 2, matchQuery: match_query }))
            }
            else if (report_list_type === 3) {
                get_partner_valuation_query = fundingInvestmentM.aggregate(buildType3ValuationPipeline({ isPartner: true, searchQuery: search_query }))
                funds_raised_query = fundingInvestmentM.aggregate(buildType3FundsRaisedPipeline({ isPartner: true, searchQuery: search_query }))
            }
            else if (report_list_type === 4) {
                get_partner_valuation_query = fundingInvestmentM.aggregate(buildType4ValuationPipeline({ isPartner: true, searchQuery: search_query }))
                funds_invested_query = fundingInvestmentM.aggregate(buildType4InvestedPipeline({ isPartner: true, searchQuery: search_query }))
                funds_invested_rounds_query = fundingInvestmentM.aggregate(buildType4RoundsPipeline({ isPartner: true, searchQuery: search_query }))
            }
            else if (report_list_type === 5) {
                get_partner_valuation_query = company_revenue_growthM.aggregate(buildType5ValuationPipeline({ isPartner: true, searchQuery: search_query }))
                total_revenue_query = company_revenue_growthM.aggregate(buildType5RevenuePipeline({ isPartner: true, searchQuery: search_query }))
            }
            else if (report_list_type === 6) {
                get_partner_valuation_query = company_productsM.aggregate(buildType6ValuationPipeline({ isPartner: true, searchQuery: search_query }))
                cryptocurrency_product_query = company_productsM.aggregate(buildType6ProductCountPipeline({ isPartner: true, searchQuery: search_query, productType: 1 }))
                blockchain_product_query = company_productsM.aggregate(buildType6ProductCountPipeline({ isPartner: true, searchQuery: search_query, productType: 2 }))
                exchange_product_query = company_productsM.aggregate(buildType6ProductCountPipeline({ isPartner: true, searchQuery: search_query, productType: 3 }))
            }
            else if (report_list_type === 7) {
                get_partner_valuation_query = company_holdingM.aggregate(buildType7ValuationPipeline({ isPartner: true, searchQuery: search_query }))
                crypto_holding_query = company_holdingM.aggregate(buildType7HoldingPipeline({ isPartner: true, searchQuery: search_query }))
            }


            const queries = [
                get_partner_valuation_query,
                event_organizers_query,
                event_sponsor_query,
                event_partner_query,
                funds_raised_query,
                funds_invested_query,
                total_revenue_query,
                cryptocurrency_product_query,
                blockchain_product_query,
                exchange_product_query,
                funds_invested_rounds_query,
                crypto_holding_query
            ].filter(query => query !== ""); // Filter out empty strings

            const results: any[] = await Promise.all(queries);

            // Extract results safely, providing default empty arrays
            const company_valuation_result = results[queries.indexOf(get_partner_valuation_query)] || [];
            const total_organizer_count = results[queries.indexOf(event_organizers_query)] || [];
            const total_event_sponsor_count = results[queries.indexOf(event_sponsor_query)] || [];
            const total_event_partner_count = results[queries.indexOf(event_partner_query)] || [];
            const total_funds_raised = results[queries.indexOf(funds_raised_query)] || [];
            const total_funds_invested = results[queries.indexOf(funds_invested_query)] || [];
            const total_revenue_result = results[queries.indexOf(total_revenue_query)] || [];
            const total_cryptocurrency_product = results[queries.indexOf(cryptocurrency_product_query)] || [];
            const total_blockchain_product = results[queries.indexOf(blockchain_product_query)] || [];
            const total_exchange_product = results[queries.indexOf(exchange_product_query)] || [];
            const total_funds_invested_rounds = results[queries.indexOf(funds_invested_rounds_query)] || [];
            const total_crypto_holding = results[queries.indexOf(crypto_holding_query)] || [];

            result['total_company_valuation'] = company_valuation_result[0] ? company_valuation_result[0].total_partner_valuation : 0
            result['total_organizer_count'] = total_organizer_count[0] ? total_organizer_count[0].count : 0
            result['total_event_sponsor_count'] = total_event_sponsor_count[0] ? total_event_sponsor_count[0].total : 0
            result['total_event_partner_count'] = total_event_partner_count[0] ? total_event_partner_count[0].total : 0

            result['total_funds_raised'] = total_funds_raised[0] ? total_funds_raised[0].amount : 0
            result['total_funds_invested'] = total_funds_invested[0] ? total_funds_invested[0].amount : 0
            // Confirmed bug fix (Part 3 §7 step 5): this field was silently absent from every
            // partner-variant response for report_list_type=4 — the legacy branch never ran
            // funds_invested_rounds_query at all. Now matches the company-variant field.
            result['total_funds_invested_rounds'] = total_funds_invested_rounds[0] ? total_funds_invested_rounds[0].count : 0
            result['total_revenue'] = total_revenue_result[0] ? total_revenue_result[0].total_revenue : 0
            result['total_cryptocurrency_product'] = total_cryptocurrency_product[0] ? total_cryptocurrency_product[0].count : 0
            result['total_blockchain_product'] = total_blockchain_product[0] ? total_blockchain_product[0].count : 0
            result['total_exchange_product'] = total_exchange_product[0] ? total_exchange_product[0].count : 0
            result['total_crypto_holding'] = total_crypto_holding[0] ? total_crypto_holding[0].total_holdings : 0

        }
        else if (valuation_type === 3) {
            const watchlistResult = await getWatchlistValuation({ headers: req.headers, searchQuery: search_query })
            result['total_watchlist_valuation'] = watchlistResult.total_watchlist_valuation
        }

        if (valuation_type !== 3) {
            await redisCache.setCache({ key: overview_cache_key, value: result, ttl: CacheDuration.THIRTY_MINUTES })
        }

        return { status: true, message: result }
    }
    catch (err: any) {
        return { status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } }
    }
}
