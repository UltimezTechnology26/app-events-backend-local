const { marketDB } = require('../../config/database_connector');
const { getPositionResolutionStages } = require('../../modules/work-experience/work-experience.queries');

const sanitize = require('mongo-sanitize')
const axios = require('axios')
const cheerio = require("cheerio");

const { deleteNotifications } = require('./notification_helper')
const { getPresentDateTime, deleteImageDigitalOcean } = require('./helper')
const professionals_ip_addressM = require('../../models/app/professionals_ip_addressM')
const locationsM = require('../../models/app/company/locationsM')
const countryM = require('../../models/app/static/countryM')
const manual_user_positionsM = require('../../models/app/static/manual_user_positionsM')
const professional_positionsM = require('../../models/app/static/professional_positionsM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')
const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const professionals_delete_actionsM = require('../../models/app/professionals_delete_actionsM')
const professionalsM = require('../../models/app/professionalsM')
const professionals_seo_detailsM = require('../../models/app/professionals_seo_detailsM')
const professionals_social_linksM = require('../../models/app/professionals_social_linksM')
const professionals_profile_imagesM = require('../../models/app/professionals_profile_imagesM')
const default_profile_imgM = require('../../models/app/static/default_profile_imgM')
const professionals_claimed_requestM = require('../../models/app/professionals_claimed_requestM')
const professionals_disabledM = require('../../models/app/professionals_disabledM')
const professionals_google_idsM = require('../../models/app/auth_account/professionals_google_idsM')
const companyM = require('../../models/app/company/companyM')
const company_deleted_historyM = require('../../models/app/company/company_deleted_historyM')
const company_watchlistM = require('../../models/app/watchlist/companyM')
const company_social_linksM = require('../../models/app/company/company_social_linksM')
const company_seo_detailsM = require('../../models/app/company/company_seo_detailsM')

const professionals_followersM = require('../../models/app/professionals_followersM')
const eventM = require('../../models/app/events/eventM')
const event_seo_detailsM = require('../../models/app/events/event_seo_detailsM')

const deleted_eventsM = require('../../models/app/events/deleted_eventsM')
const event_guestsM = require('../../models/app/events/event_guestsM')
const event_attendeesM = require('../../models/app/events/event_attendeesM')
const events_countM = require('../../models/app/events/events_countM')
const notify_userM = require('../../models/app/events/notify_userM')
const company_followersM = require('../../models/app/company/followersM')
const event_watchlistsM = require('../../models/app/watchlist/eventM')

const events_attendeesM = require('../../models/app/events/event_attendeesM')
const event_speakersM = require('../../models/app/events/event_speakersM')
const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
const added_to_partnersM = require('../../models/app/company/added_to_partnersM')
const company_faqM = require('../../models/app/company/company_faqM')
const professionals_faqM = require('../../models/app/users/professionals_faqM')
const professionals_awardsM = require('../../models/app/users/professionals_awardsM')
const tokensM = require('../../models/markets/tokensM')

const followersM = require('../../models/app/company/followersM')
const { deleteEvent, deleteSponsorsPartners, DateFormatter, checkEventRowID } = require('./events_helper')
const professional_appleM = require('../../models/app/auth_account/professional_appleM')
const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
const { sendAcademyEmail, sendEventWatchlistEmail, sendCompanyWatchlistEmail } = require('../../config/email')
const quiz_lesson_started_detailsM = require('../../models/main/academy/quiz_lesson_started_detailsM')
const courses_certificatesM = require('../../models/main/academy/courses_certificatesM')
const community_postsM = require('../../models/main/community/community_postsM')
const jobsM = require('../../models/app/jobs/jobsM')
const company_holdingM = require('../../models/markets/products_n_holding/company_holdingM')
const lessonsM = require('../../models/main/academy/lessonsM')
const { generateUserLoginToken } = require('../../middleware/authorization')
const event_contactsM = require('../../models/app/events/event_contactsM')
const ticketM = require('../../models/app/events/ticketM')
const event_faqM = require('../../models/app/events/event_faqM')
const event_utc_datesM = require('../../models/app/events/event_utc_datesM')
const eventsM = require('../../models/app/events/eventM')
const MARKET_API_BASE_URL = process.env.MARKET_API_BASE_URL
const MARKET_API_KEY = process.env.MARKET_API_KEY

export const calRevenueGrowth = async () => {
  const get_query = await company_revenue_growthM.aggregate([
    // {
    //   $match:{
    //     quarter:{$lt:5}
    //   }
    // },
    {
      $sort: {
        year: -1,
        quarter: -1
      }
    },
    {
      $group: {
        _id: "$company_row_id",
        sum_value: {
          $sum: '$revenue'
        },
        pushed_data: {
          $push: {
            $cond: {
              if: { $lt: ["$quarter", 5] }, // Condition: revenue > 1000
              then: {
                _id: "$_id",
                year: "$year",
                quarter: "$quarter",
                revenue: "$revenue",
                revenue_streams: "$revenue_streams"
              },
              else: "$$REMOVE" // Removes entry if condition fails
            }
          }
        },
        count: {
          $sum: 1
        }
      }
    },
    {
      $set: {
        pushed_data: { $slice: ["$pushed_data", 2] }, // Keep only 2 entries
        cal: {
          $multiply: [
            {
              $divide: [
                {
                  $subtract: [
                    { $arrayElemAt: ["$pushed_data.revenue", 0] },
                    { $arrayElemAt: ["$pushed_data.revenue", 1] }
                  ]
                },
                { $arrayElemAt: ["$pushed_data.revenue", 1] }
              ]
            },
            100 // Multiply the percentage change by 100
          ]
        }
      }
    },
    {
      $sort: {
        count: -1
      }
    }
  ])
  return get_query
  // revenue_growth
}

export const getTokenList = async ({ token_ids }) => {
  if (Array.isArray(token_ids)) {
    return await tokensM.find({ _id: { $in: token_ids } }, {
      _id: 1,
      symbol: 1,
      token_name: 1,
      price: 1,
      percent_change_24h: 1,
      marketcap: 1,
      volume: 1,
      token_image: 1,
      total_supply: 1
    })
  }
  return []
}

export const filterTokens = async ({ token_ids, token_list }) => {
  const result = []
  for (let run of token_ids) {
    const filter_data = token_list.find(item => ((run == item._id)))
    filter_data ? result.push(filter_data) : ""
  }
  return result
}

export const getMatchedProducts = async (product_ids, products_list) => {
  const result = []
  for (let run of product_ids) {
    const filter_data = products_list.find(item => ((run.register_type == item.register_type) && (run.product_type == item.product_type) && (run.product_row_id == item.product_row_id)))
    filter_data ? result.push(filter_data) : ""
  }
  return result
}



export const getCompanyProducts = async (anArray) => {
  const merged_result = (anArray || [])
    .map((company) => company?.product_ids || [])
    .flat()
    .filter(Boolean);

  if (!Array.isArray(merged_result) || !merged_result.length) {
    return [];
  }

  // company_product from company DB only
  const companyProducts = await company_productsM.aggregate([
    {
      $match: {
        $or: merged_result
      }
    },
    {
      $project: {
        _id: 0,
        product_type: 1,
        product_row_id: 1,
        register_type: 1
      }
    }
  ]);

  if (!companyProducts.length) {
    return [];
  }

  // separate ids for market DB queries
  const ids = {
    token: [],
    token_manual: [],
    chain: [],
    chain_manual: [],
    exchange: [],
    exchange_manual: []
  };

  for (const item of companyProducts) {
    if (item.product_type === 1 && item.register_type === 1) {
      ids.token.push(item.product_row_id);
    }

    if (item.product_type === 1 && item.register_type === 2) {
      ids.token_manual.push(item.product_row_id);
    }

    if (item.product_type === 2 && item.register_type === 1) {
      ids.chain.push(item.product_row_id);
    }

    if (item.product_type === 2 && item.register_type === 2) {
      ids.chain_manual.push(item.product_row_id);
    }

    if (item.product_type === 3 && item.register_type === 1) {
      ids.exchange.push(item.product_row_id);
    }

    if (item.product_type === 3 && item.register_type === 2) {
      ids.exchange_manual.push(item.product_row_id);
    }
  }

  // fetch from market DB separately
  const [
    tokenData,
    tokenManualData,
    chainData,
    chainManualData,
    exchangeData,
    exchangeManualData
  ] = await Promise.all([
    marketDB.collection("cln_markets_tokens")
      .find(
        { _id: { $in: ids.token } },
        {
          projection: {
            _id: 1,
            symbol: 1,
            token_name: 1,
            token_image: 1,
            price: 1,
            percent_change_24h: 1,
            marketcap: 1,
            volume: 1,
            total_supply: 1
          }
        }
      )
      .toArray(),

    marketDB.collection("cln_markets_search_contract_addresses")
      .find(
        { _id: { $in: ids.token_manual } },
        {
          projection: {
            _id: 1,
            symbol: 1,
            token_name: 1,
            token_image: 1
          }
        }
      )
      .toArray(),

    marketDB.collection("cln_chains")
      .find(
        { _id: { $in: ids.chain } },
        {
          projection: {
            _id: 1,
            chain_name: 1,
            chain_slug: 1,
            chain_image: 1,
            chain_id: 1,
            tvl: 1,
            protocols: 1,
            mcap: 1
          }
        }
      )
      .toArray(),

    marketDB.collection("cln_chains_manuals")
      .find(
        { _id: { $in: ids.chain_manual } },
        {
          projection: {
            _id: 1,
            chain_name: 1,
            chain_symbol: 1,
            chain_id: 1,
            chain_link: 1
          }
        }
      )
      .toArray(),

    marketDB.collection("cln_exchanges")
      .find(
        { _id: { $in: ids.exchange } },
        {
          projection: {
            _id: 1,
            exchange_name: 1,
            exchange_image: 1,
            launch_date: 1,
            volume_24h: 1,
            total_pairs: 1,
            total_coins: 1
          }
        }
      )
      .toArray(),

    marketDB.collection("cln_exchanges_manuals")
      .find(
        { _id: { $in: ids.exchange_manual } },
        {
          projection: {
            _id: 1,
            exchange_name: 1,
            exchange_image: 1,
            launch_date: 1,
            volume_24h: 1
          }
        }
      )
      .toArray()
  ]);

  const finalResult = companyProducts.map((item) => {
    let product_data = null;

    if (item.product_type === 1 && item.register_type === 1) {
      product_data = tokenData.find((x) => x._id === item.product_row_id);
    }

    if (item.product_type === 1 && item.register_type === 2) {
      product_data = tokenManualData.find((x) => x._id === item.product_row_id);
    }

    if (item.product_type === 2 && item.register_type === 1) {
      product_data = chainData.find((x) => x._id === item.product_row_id);
    }

    if (item.product_type === 2 && item.register_type === 2) {
      product_data = chainManualData.find((x) => x._id === item.product_row_id);
    }

    if (item.product_type === 3 && item.register_type === 1) {
      product_data = exchangeData.find((x) => x._id === item.product_row_id);
    }

    if (item.product_type === 3 && item.register_type === 2) {
      product_data = exchangeManualData.find((x) => x._id === item.product_row_id);
    }

    return {
      product_type: item.product_type,
      product_row_id: item.product_row_id,
      register_type: item.register_type,
      product_data
    };
  }).filter((item) => item.product_data);

  return finalResult;
};


export const checkCompanyRowID = async ({ user_row_id, company_row_id }) => {
  try {
    if (company_row_id) {
      const company_query = await companyM.findOne({ _id: company_row_id })
      if (company_query) {
        if (user_row_id && company_query.user_row_id) {
          if (user_row_id != company_query.user_row_id) {
            return { status: false, message: { alert_message: "The company row id field is invalid." } }
          }
        }

        let result = {}
        result['company_row_id'] = company_query._id
        result['company_name'] = company_query.company_name
        result['company_id'] = company_query.company_id
        result['company_email_id'] = company_query.company_email_id
        result['company_logo'] = company_query.company_logo ? company_query.company_logo : ''
        result['website_link'] = company_query.website_link
        result['company_location'] = company_query.company_location
        result['describe_in_one_line'] = company_query.describe_in_one_line
        result['city'] = company_query.city
        result['state'] = company_query.state
        result['longitude'] = company_query.longitude
        result['latitude'] = company_query.latitude
        result['basic_details_score'] = company_query.basic_details_score
        result['seo_details_score'] = company_query.seo_details_score
        result['social_media_score'] = company_query.social_media_score
        result['team_detail_score'] = company_query.team_detail_score
        result['owned_product_score'] = company_query.owned_product_score
        result['job_opening_score'] = company_query.job_opening_score
        result['funding_score'] = company_query.funding_score
        result['revenue_score_score'] = company_query.revenue_score_score
        result['investment_score'] = company_query.investment_score
        result['holding_crypto_score'] = company_query.holding_crypto_score
        result['profile_score'] = company_query.profile_score
        result['faq_score'] = company_query.faq_score

        return { status: true, message: result }
      }
      else {
        return { status: false, message: { alert_message: "The company row id field is invalid." } }
      }
    }
    else if (user_row_id) {
      const company_query = await companyM.findOne({ user_row_id: user_row_id })
      if (company_query) {
        let result = {}
        result['company_row_id'] = company_query._id
        result['company_name'] = company_query.company_name
        result['company_id'] = company_query.company_id
        result['company_email_id'] = company_query.company_email_id
        result['company_logo'] = company_query.company_logo
        result['website_link'] = company_query.website_link
        result['company_location'] = company_query.company_location
        result['describe_in_one_line'] = company_query.describe_in_one_line
        result['city'] = company_query.city
        result['state'] = company_query.state
        result['longitude'] = company_query.longitude
        result['latitude'] = company_query.latitude
        result['basic_details_score'] = company_query.basic_details_score
        result['seo_details_score'] = company_query.seo_details_score
        result['social_media_score'] = company_query.social_media_score
        result['team_detail_score'] = company_query.team_detail_score
        result['owned_product_score'] = company_query.owned_product_score
        result['job_opening_score'] = company_query.job_opening_score
        result['funding_score'] = company_query.funding_score
        result['revenue_score_score'] = company_query.revenue_score_score
        result['investment_score'] = company_query.investment_score
        result['holding_crypto_score'] = company_query.holding_crypto_score
        result['profile_score'] = company_query.profile_score
        result['faq_score'] = company_query.faq_score

        return { status: true, message: result }
      }
      else {
        return { status: false, message: { alert_message: "The user row id field is invalid." } }
      }
    }

    return { status: false, message: { alert_message: "The user row id field is invalid." } }
  }
  catch (err) {
    return { status: false, message: { err: err.message } }
  }
}



// Used to save the details of users and from which domain the users are getting logged in
export const trackUsers = async (ip_address, user_row_id, domain_row_id, page) => {
  try {
    if (ip_address && user_row_id && domain_row_id && page) {
      const insert_array = {
        user_row_id: user_row_id,
        ip_address: ip_address,
        domain_row_id: domain_row_id,
        page: page,
        date_n_time: getPresentDateTime()
      }
      const insert_query = await professionals_ip_addressM(insert_array).save()

      return {
        status: true,
        message: { alert_message: 'Users data saved successfully' },
        insert_query: insert_query,
      }

    }
    else {
      return {
        status: false
      }
    }

  }
  catch (err) {
    console.error('Track users domain error', err)
    return {
      status: false,
      message: err
    }
  }
}

//save company location details
export const locations = async ({ company_row_id, country_id, location, longitude, latitude, area, city, state, country_name }) => {
  try {
    console.log("location", location)

    let locationArray = {}
    const check_location = await locationsM.findOne({ company_row_id: company_row_id })
    locationArray['country_id'] = country_id

    if (country_name) {
      const check_country_query = await countryM.findOne({ country_name: sanitize(country_name) }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
      if (check_country_query) {
        locationArray['country_id'] = check_country_query._id
      }
    }

    locationArray['location'] = location
    locationArray['longitude'] = longitude
    locationArray['latitude'] = latitude
    locationArray['area'] = area
    locationArray['city'] = city
    locationArray['state'] = state
    locationArray['country_name'] = country_name

    if (!check_location) {
      locationArray['company_row_id'] = company_row_id

      const location_query = await locationsM(locationArray).save()
      return location_query
    }
    else {
      await locationsM.updateOne({ company_row_id: company_row_id }, { $set: locationArray })
    }
  }
  catch (err) {
    console.error('Track users domain error', err)
    return false
  }
}

//add manual position 
export async function addManualPosition(position_name) {
  try {
    if (position_name) {

      const check_query = await professional_positionsM.findOne({ position_name: sanitize(position_name), active_status: 1 }, { _id: 1 }).collation({ locale: 'en', strength: 2 });
      if (check_query) {
        return { status: false }
      }
      else {
        const check_query = await manual_user_positionsM.findOne({ position_name: sanitize(position_name) }).collation({ locale: 'en', strength: 2 });
        if (check_query) {
          return { status: true, sub_position_row_id: check_query._id };

        }
        else {
          const insert_array = {
            position_name: position_name,
            date_n_time: getPresentDateTime()
          };

          const query = await manual_user_positionsM(insert_array).save();

          return { status: true, sub_position_row_id: query._id };

        }
      }
    }
    else {
      return { status: false }
    }
  }
  catch (err) {
    console.error('Add manual position error', err)
    return false
  }
}

//Shift data from manual company to registered company after company is approved from manual retrievals
export const shiftCompanyFromManualToRegister = async ({ manual_company_row_id, register_company_row_id, sub_admin_row_id }) => {
  try {
    // company funds - STARTS HERE

    const funds_invested_query = await fundingInvestmentM.findOne({ investor_type: 2, investor_registered_type: 2, investor_row_id: manual_company_row_id })
    if (funds_invested_query) {
      await fundingInvestmentM.updateMany({ investor_type: 2, investor_registered_type: 2, investor_row_id: manual_company_row_id }, { $set: { investor_type: 2, investor_registered_type: 1, investor_row_id: register_company_row_id } })
    }

    const funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 2, funds_raised_registered_type: 2, funds_raised_company_row_id: manual_company_row_id })
    if (funds_raised_query) {
      await fundingInvestmentM.updateMany({ investor_type: 2, funds_raised_registered_type: 2, funds_raised_company_row_id: manual_company_row_id }, { $set: { investor_type: 2, funds_raised_registered_type: 1, funds_raised_company_row_id: register_company_row_id } })
    }

    const user_funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 1, funds_raised_registered_type: 2, funds_raised_company_row_id: manual_company_row_id })
    if (user_funds_raised_query) {
      await fundingInvestmentM.updateMany({ investor_type: 1, funds_raised_registered_type: 2, funds_raised_company_row_id: manual_company_row_id }, { $set: { investor_type: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: register_company_row_id } })
    }

    // sponsors and partners
    const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 2, registered_type: 2, user_company_row_id: manual_company_row_id })
    if (sp_query) {
      await event_sponsors_partner_detailsM.updateMany({ account_type: 2, registered_type: 2, user_company_row_id: manual_company_row_id }, { $set: { account_type: 2, registered_type: 1, user_company_row_id: register_company_row_id } })
    }

    // work_experience - STARTS HERE

    const work_experience_query = await professionals_work_experienceM.findOne({ company_type: 2, company_row_id: manual_company_row_id })
    if (work_experience_query) {
      await professionals_work_experienceM.updateMany({ company_type: 2, company_row_id: manual_company_row_id }, { $set: { company_type: 1, company_row_id: register_company_row_id } })
    }

    // Update in Manual Retrievals - STARTS HERE

    // approval_sub_admin_row_id
    const company_query = await company_manual_retrievalsM.findOne({ _id: manual_company_row_id })
    if (company_query) {
      await company_manual_retrievalsM.updateOne({ _id: manual_company_row_id }, {
        $set: {
          main_company_row_id: register_company_row_id,
          approval_sub_admin_row_id: sub_admin_row_id,
          approval_status: 1,
          approval_date: getPresentDateTime()
        }
      })
    }

    return true

  }
  catch (err) {
    console.error('Shift data from manual to register user error', err)
    return false
  }
}

//Delete Professional details 
//Type-> 1. Delete one, 2. Delete Many, user_type -> 1.User , 2.Company , registered_type-> 1.Registered, 2.Manual
export const deleteProfessionalDetails = async ({ professional_details_id, type, user_company_row_id, user_type, reqistered_type }) => {
  try {
    if (type == 1 && professional_details_id) {
      await professionals_work_experienceM.deleteOne({ _id: professional_details_id })
    }
    else {
      const query = user_type === 1 ? { user_row_id: user_company_row_id, user_account_type: reqistered_type } : { company_row_id: user_company_row_id, company_type: reqistered_type };

      if (query) {
        await professionals_work_experienceM.deleteMany(query)
      }
    }

  }
  catch {
    console.error('Delete Professional details', err.message)
    return false
  }
}

//Delete user followers
//Type-> 1. Delete one, 2. Delete Many,
export const deleteUserFollowers = async ({ type, follower_user_row_id, user_row_id, }) => {
  try {
    if (type == 1) {
      await professionals_followersM.deleteOne({ follower_user_row_id: follower_user_row_id, following_user_row_id: user_row_id })
    }
    else {
      await professionals_followersM.deleteMany({ $or: [{ follower_user_row_id: user_row_id }, { following_user_row_id: user_row_id }] })

    }

  }
  catch {
    console.error('Delete User Followers details', err.message)
    return false
  }
}

//Delete Funding Details
//Type-> 1. Delete one, 2. Delete Many, investment_type-> 1. Investment , 2.Funding
export const deleteUserFunding = async ({ type, funding_row_id, investor_type, registered_type, investment_type }) => {
  try {
    if (type == 1) {
      await fundingInvestmentM.deleteOne({ _id: funding_row_id })
    }
    else {
      const query = investment_type == 1
        ? { investor_type: investor_type, investor_registered_type: registered_type, investor_row_id: funding_row_id }
        : { investor_type: investor_type, funds_raised_registered_type: registered_type, funds_raised_company_row_id: funding_row_id }

      await fundingInvestmentM.deleteMany(query)
    }

  }
  catch {
    console.error('Delete Funding details', err.message)
    return { status: false, message: err.message }
  }
}

//Delete Revenue details
//Type-> 1. Delete one, 2. Delete Many,
export const deleteCompanyRevenue = async ({ type, revenue_row_id }) => {
  try {
    if (type == 1) {
      await company_revenue_growthM.deleteOne({ _id: revenue_row_id })
    }
    else {
      await company_revenue_growthM.deleteMany({ company_row_id: revenue_row_id })
    }

  }
  catch {
    console.error('Delete Company Revenue details', err.message)
    return { status: false, message: err.message }
  }
}

//Delete user followers
//Type-> 1. Delete one, 2. Delete Many,
export const deleteCompanyFollowers = async ({ type, company_row_id, user_row_id, }) => {
  try {
    if (type == 1) {
      await followersM.deleteOne({ company_row_id: company_row_id, user_row_id: user_row_id })

    }
    else {
      await followersM.deleteMany({ company_row_id: company_row_id, })
    }

  }
  catch {
    console.error('Delete Company Followers details', err.message)
    return false
  }
}

//Delete Company Watchlist
//Type-> 1. Delete one, 2. Delete Many,
export const deleteCompanyWatchlist = async ({ type, company_row_id, user_row_id, }) => {
  try {
    if (type == 1) {
      await company_watchlistM.deleteOne({ company_row_id: company_row_id, user_row_id: user_row_id })

    }
    else {
      await company_watchlistM.deleteMany({ company_row_id: company_row_id, })
    }

  }
  catch {
    console.error('Delete Company Followers details', err.message)
    return false
  }
}


//Type-> 1. Delete one, 2. Delete Many,
export const deleteFAQ = async ({ type, company_row_id, faq_row_id }) => {
  try {
    if (type == 1) {
      await company_faqM.deleteOne({ company_row_id: company_row_id, _id: faq_row_id })
    }
    else {
      await company_faqM.deleteMany({ company_row_id: company_row_id })
    }
  }
  catch {
    console.error('Delete Company Followers details', err.message)
    return false
  }
}






//Delete company
export const deleteCompanyDetails = async ({ company_row_id }) => {
  try {
    const queryRun = await companyM.findOne({ _id: company_row_id })
    await deleteNotifications({ notify_type: 2, notify_type_row_id: company_row_id })


    const date_n_time = getPresentDateTime()

    await company_deleted_historyM({
      company_row_id: queryRun._id,
      user_row_id: queryRun.user_row_id,
      sub_admin_row_id: queryRun.sub_admin_row_id,
      claim_status: queryRun.claim_status,
      company_name: queryRun.company_name,
      company_id: queryRun.company_id,
      company_email_id: queryRun.company_email_id,
      company_logo: queryRun.company_logo,
      website_link: queryRun.website_link,
      date_n_time: date_n_time,
      contact_number: queryRun.contact_number,
      established_in: queryRun.established_in,
      country_id: queryRun.country_id,
      company_location: queryRun.company_location,
      describe_in_one_line: queryRun.describe_in_one_line,
      main_business_model_id: queryRun.main_business_model_id,
      business_model_id: queryRun.business_model_id,
      approval_status: queryRun.approval_status,
    }).save()

    await companyM.deleteOne({ _id: company_row_id })
    await company_social_linksM.deleteOne({ company_row_id: company_row_id })
    await company_seo_detailsM.deleteOne({ company_row_id: company_row_id })



    const partnerQueryCheck = await added_to_partnersM.findOne({ company_row_id: company_row_id })
    if (partnerQueryCheck) {
      await added_to_partnersM.deleteOne({ company_row_id: company_row_id })
    }

    await deleteCompanyFollowers({ type: 2, company_row_id: company_row_id })

    const checkCompanyWatchList = await company_watchlistM.findOne({ company_row_id: company_row_id })
    if (checkCompanyWatchList) {
      await deleteCompanyWatchlist({ type: 2, company_row_id: company_row_id })
    }

    const checkEvents = await eventM.find({ company_row_id: company_row_id })
    if (checkEvents.length) {
      for (let run of checkEvents) {
        await deleteEvent({ event_row_id: run._id, deleted_reason: "Company deleted" })
      }
    }

    const checkRevenue = await company_revenue_growthM.findOne({ company_row_id: company_row_id })
    if (checkRevenue) {
      await deleteCompanyRevenue({ type: 2, revenue_row_id: company_row_id })
    }

    //funds
    const funds_invested_query = await fundingInvestmentM.findOne({ investor_type: 2, investor_registered_type: 1, investor_row_id: company_row_id })
    if (funds_invested_query) {
      await deleteUserFunding({ type: 2, investor_type: 2, registered_type: 1, funding_row_id: company_row_id, investment_type: 1 })
    }
    const funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 2, funds_raised_registered_type: 1, funds_raised_company_row_id: company_row_id })
    if (funds_raised_query) {
      await deleteUserFunding({ type: 2, investor_type: 2, registered_type: 1, funding_row_id: company_row_id, investment_type: 2 })
    }
    const user_funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: company_row_id })
    if (user_funds_raised_query) {
      await deleteUserFunding({ type: 2, investor_type: 1, registered_type: 1, funding_row_id: company_row_id, investment_type: 2 })
    }

    // sponsors and partners
    const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 2, registered_type: 1, user_company_row_id: company_row_id })
    if (sp_query) {
      await deleteSponsorsPartners({ type: 2, account_type: 2, registered_type: 1, user_company_row_id: company_row_id })
    }

    // work_experience - STARTS HERE
    const work_experience_query = await professionals_work_experienceM.findOne({ company_type: 1, company_row_id: company_row_id })
    if (work_experience_query) {
      await deleteProfessionalDetails({ type: 2, user_company_row_id: company_row_id, user_type: 2, reqistered_type: 1 })
    }
  }
  catch (err) {
    console.log('Delete Company details error', err.message)
    return { status: false, message: err.message }
  }
}

//Delete user
export const deleteUserDetais = async ({ user_row_id, token }) => {
  try {
    const checkUser = await professionalsM.findOne({ _id: user_row_id }, { full_name: 1, user_name: 1, email_id: 1, approval_status: 1, })
    const date_n_time = getPresentDateTime()

    await professionals_delete_actionsM({
      user_row_id: user_row_id,
      action_type: 2,
      full_name: checkUser.full_name,
      user_name: checkUser.user_name,
      email_id: checkUser.email_id,
      approval_status: checkUser.approval_status,
      date_n_time: date_n_time
    }).save()

    await professionalsM.deleteOne({ _id: user_row_id })
    await deleteNotifications({ notify_type: 1, notify_type_row_id: user_row_id })


    const getSeoDetails = await professionals_seo_detailsM.findOne({ user_row_id: user_row_id })
    if (getSeoDetails) {
      await professionals_seo_detailsM.deleteOne({ user_row_id: user_row_id })
    }
    const getSocialDetails = await professionals_social_linksM.findOne({ user_row_id: user_row_id })
    if (getSocialDetails) {
      await professionals_social_linksM.deleteOne({ user_row_id: user_row_id })
    }

    const getImage = await professionals_profile_imagesM.findOne({ user_row_id: user_row_id })
    if (getImage) {

      if (getImage.profile_image_type > 0) {
        const imageQuery = await default_profile_imgM.findOne({ image_name: getImage.profile_image }, { _id: 1 })
        if (!imageQuery) {
          await deleteImageDigitalOcean(getImage.profile_image, 1)
        }
      }
      await professionals_profile_imagesM.deleteOne({ user_row_id: user_row_id })
    }

    const checkUserClaimRequests = await professionals_claimed_requestM.findOne({ user_row_id: user_row_id })
    if (checkUserClaimRequests) {
      await professionals_claimed_requestM.deleteMany({ user_row_id: user_row_id })
    }

    const getDisable = await professionals_disabledM.findOne({ user_row_id: user_row_id })
    if (getDisable) {
      await professionals_disabledM.deleteOne({ user_row_id: user_row_id })
    }

    const getGoogleId = await professionals_google_idsM.findOne({ user_row_id: user_row_id })
    if (getGoogleId) {
      await professionals_google_idsM.deleteOne({ user_row_id: user_row_id })
    }
    const getAppleId = await professional_appleM.findOne({ user_row_id: user_row_id })
    if (getAppleId) {
      await professional_appleM.deleteOne({ user_row_id: user_row_id })
    }

    await deleteUserFAQ({ type: 2, user_row_id })
    await deleteUserAward({ type: 2, user_row_id })


    const getData = await companyM.findOne({ user_row_id: user_row_id })
    if (getData) {
      await deleteCompanyDetails({ company_row_id: getData._id })
    }

    await deleteUserFollowers({ type: 2, follower_user_row_id: user_row_id, user_row_id: user_row_id })
    await company_followersM.deleteOne({ user_row_id: user_row_id })

    const check_events = await eventM.find({ user_row_id: user_row_id })
    if (check_events.length) {
      for (let run of check_events) {
        await deleteEvent({ event_row_id: run._id, deleted_reason: "User deleted" })
      }
    }
    // user attendees - STARTS HERE
    const getEventGuest = await event_attendeesM.find({ user_row_id: user_row_id, user_type: 1 }, { event_row_id: 1 })
    if (getEventGuest.length > 0) {
      await event_attendeesM.deleteMany({ user_row_id: user_row_id, user_type: 1 })
      for (let guestid of getEventGuest) {
        const total_attendees = await event_guestsM.countDocuments({ event_row_id: guestid.event_row_id, invitation_request_status: 1 })
        const total_invitees = await event_guestsM.countDocuments({ event_row_id: guestid.event_row_id, invitation_request_status: 0 })
        await events_countM.updateOne({ event_row_id: guestid.event_row_id }, { $set: { total_invitees: total_invitees, total_attendees: total_attendees } })
      }
    }

    const getEventWatchlist = await event_watchlistsM.find({ user_row_id: user_row_id }, { event_row_id: 1 })
    if (getEventWatchlist) {
      if (getEventWatchlist.length > 0) {
        await event_watchlistsM.deleteMany({ user_row_id: user_row_id })
        for (let watchlist_id of getEventWatchlist) {
          const total_watchlist = await event_watchlistsM.countDocuments({ event_row_id: watchlist_id.event_row_id })
          await events_countM.updateOne({ event_row_id: watchlist_id.event_row_id }, { $set: { total_watchlist: total_watchlist } })
        }
      }
    }
    await notify_userM.deleteMany({ user_row_id: user_row_id })


    // user speakers - STARTS HERE

    const speakers_query = await event_speakersM.findOne({ user_type: 1, user_row_id: user_row_id })
    if (speakers_query) {
      await event_speakersM.deleteMany({ user_type: 1, user_row_id: user_row_id })
    }

    // sponsors and partners
    const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 1, registered_type: 1, user_company_row_id: user_row_id })
    if (sp_query) {
      await deleteSponsorsPartners({ type: 2, account_type: 1, registered_type: 1, user_company_row_id: user_row_id })

    }

    // users funds - STARTS HERE

    const funds_query = await fundingInvestmentM.findOne({ investor_type: 1, investor_registered_type: 1, investor_row_id: user_row_id })
    if (funds_query) {
      await deleteUserFunding({ type: 2, investor_type: 1, registered_type: 1, funding_row_id: user_row_id, investment_type: 1 })
    }

    // work_experience - STARTS HERE

    const work_experience_query = await professionals_work_experienceM.findOne({ user_account_type: 1, user_row_id: user_row_id })
    if (work_experience_query) {
      await deleteProfessionalDetails({ type: 2, user_company_row_id: user_row_id, user_type: 1, reqistered_type: 1 })
    }


    await axios.get(
      `${MARKET_API_BASE_URL}admin/portfolio/delete_wallet_list/${user_row_id}`,
      {
        headers: {
          api_key: MARKET_API_KEY,
          token: token,
          "Content-Type": "application/json",
        },
      }
    );

    return { status: true }
  }
  catch (err) {
    console.log('Delete user details error', err.message)
    return { status: false, message: err.message }
  }
}


export const deleteUserFAQ = async ({ type, user_row_id, faq_row_id }) => {
  try {
    if (type == 1) {
      await professionals_faqM.deleteOne({ user_row_id: user_row_id, _id: faq_row_id })
    }
    else {
      await professionals_faqM.deleteMany({ user_row_id: user_row_id })
    }
  }
  catch {
    console.error('deleteUserFAQ', err.message)
    return false
  }
}


export const deleteUserAward = async ({ type, user_row_id, award_row_id, award_image }) => {
  try {
    if (type == 1) {
      await professionals_awardsM.deleteOne({ user_row_id: user_row_id, _id: award_row_id })
      if (award_image) {
        await deleteImageDigitalOcean(award_image, 8)
      }
    }
    else {
      await professionals_awardsM.deleteMany({ user_row_id: user_row_id })
    }
  }
  catch {
    console.error('deleteUserFAQ', err.message)
    return false
  }
}


export const basic_details_points = {
  full_name: 5,
  mobile_number: 5,
  email_id: 5,
  website: 2,
  user_bio: 4,
  about_in_one_line: 3,
  location: 3,
  looking_for_id: 3,
  designation_id: 3,
  gender: 2,
  meta_keywords: 2,
  meta_description: 3,
};

export const social_details_points = {
  twitter: 2.5,
  linkedin: 2.5,
  facebook: 2,
  medium: 2,
  instagram: 1.5,
  reddit: 2,
  feed_url: 2,
  telegram: 2,
  video_link: 1.5,
  youtube_channel: 2,
};

export function calculateProfileScore(data, weights) {
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = data?.[key];
    if (
      (typeof value === 'string' && value.trim()) ||
      (typeof value === 'object' && value !== null && Object.keys(value).length > 0) ||
      (typeof value === 'number' && value > 0)
    ) {
      score += weight;
    }
  }
  return score;
}

export const getWalletAddress = async ({ user_token }) => {
  try {
    const response = await axios.get(
      `${MARKET_API_BASE_URL}markets/portfolio/default_address_details`,
      {
        headers: {
          api_key: MARKET_API_KEY,
          token: user_token,
          "Content-Type": "application/json",
        },
      }
    );
    // If response is invalid
    if (!response) {
      return { status: false, message: "No response from wallet server" };
    }
    const statusCode = response.status;
    const body = response.data;
    if (statusCode === 200 && body?.status && body?.message) {
      return body; // ✅ correct structure from your API
    }
    return { status: false, message: "" };
  } catch (err) {
    return {
      status: false,
      message: "",
      error: err?.response?.data || err?.message,
    };
  }
};


export async function calculateUserProfileScore(user_row_id, fieldsToUpdate = ["profile_score"]) {

  // If full update needed
  const fullUpdate = fieldsToUpdate.length === 0 || fieldsToUpdate.includes("profile_score");

  const updateObject = {};
  let total = 0;

  // -----------------------------------------------------
  // 1) PROFESSIONAL PROFILE
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("professional_profile")) {

    const user_token = generateUserLoginToken(user_row_id, 1);
    const [profile, social, seo, profileImage] = await Promise.all([
      professionalsM.findOne({ _id: user_row_id }).lean(),
      professionals_social_linksM.findOne({ user_row_id }).lean(),
      professionals_seo_detailsM.findOne({ user_row_id }).lean(),
      professionals_profile_imagesM.findOne({ user_row_id }).lean(),
    ]);

    const walletData = await getWalletAddress({ user_token });
    const walletAddress = walletData?.status ? walletData?.message?.wallet_address : null;

    let profScore = 0;
    let seoScore = 0;


    const mandatoryFields = [
      { value: profileImage?.profile_image, points: 3 },
      { value: profile?.full_name, points: 3 },
      { value: profile?.user_name, points: 3 },
      { value: profile?.gender, points: 2 },
      { value: profile?.location, points: 2 },
      { value: profile?.designation_id, points: 3 },
      { value: profile?.email_id, points: 2 },
      { value: profile?.mobile_number, points: 2 },
      { value: social?.website, points: 2 },
      { value: profile?.about_in_one_line, points: 2 },
      { value: profile?.user_bio, points: 3 }
    ];

    const seoFields = [
      { value: seo?.meta_title, points: 3 },
      { value: seo?.meta_keywords, points: 4 },
      { value: seo?.meta_description, points: 3 }
    ];

    mandatoryFields.forEach(f => {
      if (f.value) profScore += f.points;
    });

    seoFields.forEach(f => {
      if (f.value) seoScore += f.points;
    });

    if (social?.looking_for_id) profScore += 1;
    if (walletAddress) profScore += 2;

    if (profScore > 30) profScore = 30;


    updateObject.professional_profile_score = profScore;
    updateObject.seo_details_score = seoScore;

    total += profScore;
    total += seoScore;

  }

  // -----------------------------------------------------
  // 2) SOCIAL MEDIA
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("social_media")) {

    const social = await professionals_social_linksM.findOne({ user_row_id }).lean();

    const socialFields = [
      social?.linkedin,
      social?.twitter,
      social?.facebook,
      social?.instagram,
      social?.telegram,
      social?.reddit,
      social?.medium,
      social?.youtube_channel,
      social?.video_link,
      social?.feed_url,
    ];

    const filled = socialFields.filter(x => x).length;
    const socialScore = Math.min(filled * 2, 10);

    updateObject.social_media_score = socialScore;
    total += socialScore;
  }

  // -----------------------------------------------------
  // 3) ACADEMY
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("academy")) {

    const [anyCourseStarted, completedAtLeastOneLesson, anyCertificate] = await Promise.all([
      quiz_lesson_started_detailsM.exists({ user_row_id }),
      quiz_lesson_started_detailsM.exists({ user_row_id, lesson_status: 1 }),
      courses_certificatesM.exists({ user_row_id })
    ]);

    let academyScore = 0;
    if (anyCourseStarted) academyScore += 2;
    if (completedAtLeastOneLesson) academyScore += 2;
    if (anyCertificate) academyScore += 6;

    updateObject.academy_score = academyScore;
    total += academyScore;
  }

  // -----------------------------------------------------
  // 4) COMMUNITY
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("community")) {

    const [anyPost, introPost] = await Promise.all([
      community_postsM.exists({ user_row_id, group_id: { $ne: 1 }, post_status: true }),
      community_postsM.exists({ user_row_id, group_id: 1, post_status: true })
    ]);

    let communityScore = 0;
    if (anyPost) communityScore += 5;
    if (introPost) communityScore += 5;

    updateObject.community_score = communityScore;
    total += communityScore;
  }

  // -----------------------------------------------------
  // 5) PROFESSIONAL DETAILS
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("professional_detail")) {

    const hasExperience = await professionals_work_experienceM.exists({
      user_row_id,
      $or: [
        { start_date: { $exists: true } },
        { position_row_id: { $exists: true } },
        { responsibilities: { $exists: true, $ne: "" } }
      ]
    });

    const professionalDetailsScore = hasExperience ? 10 : 0;

    updateObject.professional_detail_score = professionalDetailsScore;
    total += professionalDetailsScore;
  }

  // -----------------------------------------------------
  // 6) INVESTMENTS
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("investment")) {

    const hasInvestment = await fundingInvestmentM.exists({
      investor_row_id: user_row_id,
      investor_type: 1
    });

    const investmentScore = hasInvestment ? 10 : 0;

    updateObject.investment_score = investmentScore;
    total += investmentScore;
  }

  // -----------------------------------------------------
  // 7) AWARDS
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("award")) {

    const hasAwards = await professionals_awardsM.exists({
      user_row_id,
      award_title: { $exists: true, $ne: "" }
    });

    const awardsScore = hasAwards ? 5 : 0;

    updateObject.award_score = awardsScore;
    total += awardsScore;
  }

  // -----------------------------------------------------
  // 8) FAQ
  // -----------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("faq")) {

    const hasFAQ = await professionals_faqM.exists({
      user_row_id,
      faq_question: { $exists: true, $ne: "" },
      faq_answer: { $exists: true, $ne: "" }
    });

    const faqScore = hasFAQ ? 5 : 0;

    updateObject.faq_score = faqScore;
    total += faqScore;
  }

  // -----------------------------------------------------
  // FINAL SCORE
  // -----------------------------------------------------
  let finalProfileScore = 0;
  const userScores = await professionalsM.findOne(
    { _id: user_row_id },
    {
      professional_profile_score: 1,
      seo_details_score: 1,
      social_media_score: 1,
      academy_score: 1,
      community_score: 1,
      professional_detail_score: 1,
      investment_score: 1,
      award_score: 1,
      faq_score: 1,
      profile_score: 1
    }
  ).lean();

  if (fullUpdate) {
    // ✅ full update → direct total
    finalProfileScore = total;
  } else {
    // ✅ partial update → recompute intelligently
    const fieldMap = {
      professional_profile: "professional_profile_score",
      seo_details_score: "seo_details_score",
      social_media: "social_media_score",
      academy: "academy_score",
      community: "community_score",
      professional_detail: "professional_detail_score",
      investment: "investment_score",
      award: "award_score",
      faq: "faq_score",
      profile_score: "profile_score"
    };
    let oldScores = {
      professional_profile_score: userScores.professional_profile_score || 0,
      seo_details_score: userScores?.seo_details_score || 0,
      social_media_score: userScores.social_media_score || 0,
      academy_score: userScores.academy_score || 0,
      community_score: userScores.community_score || 0,
      professional_detail_score: userScores.professional_detail_score || 0,
      investment_score: userScores.investment_score || 0,
      award_score: userScores.award_score || 0,
      faq_score: userScores.faq_score || 0
    };

    // 2) subtract old values for updated fields
    for (const field of fieldsToUpdate) {
      const mapped = fieldMap[field];
      if (mapped) total = total + (userScores[mapped] || 0);
    }

    // 3) calculate the new final score
    const updatedFields = {
      professional_profile_score: updateObject.professional_profile_score ?? oldScores.professional_profile_score,
      seo_details_score: updateObject.seo_details_score ?? oldScores.seo_details_score,
      social_media_score: updateObject.social_media_score ?? oldScores.social_media_score,
      academy_score: updateObject.academy_score ?? oldScores.academy_score,
      community_score: updateObject.community_score ?? oldScores.community_score,
      professional_detail_score: updateObject.professional_detail_score ?? oldScores.professional_detail_score,
      investment_score: updateObject.investment_score ?? oldScores.investment_score,
      award_score: updateObject.award_score ?? oldScores.award_score,
      faq_score: updateObject.faq_score ?? oldScores.faq_score,
    };

    finalProfileScore =
      updatedFields.professional_profile_score +
      updatedFields.seo_details_score +
      updatedFields.social_media_score +
      updatedFields.academy_score +
      updatedFields.community_score +
      updatedFields.professional_detail_score +
      updatedFields.investment_score +
      updatedFields.award_score +
      updatedFields.faq_score;
  }

  // Always update profile_score using computed method
  updateObject.profile_score = finalProfileScore;

  // -----------------------------------------------------------
  // ✅ FINAL DB UPDATE
  // -----------------------------------------------------------

  // Update only required fields
  await professionalsM.updateOne({ _id: user_row_id }, updateObject);

  return updateObject;
}


export async function getUserProfileWithScore(user_row_id) {
  // Fetch user main + details together
  const userMain = await professionalsM.findOne(
    { _id: user_row_id },
    {
      professional_profile_score: 1,
      seo_details_score: 1,
      social_media_score: 1,
      academy_score: 1,
      community_score: 1,
      professional_detail_score: 1,
      investment_score: 1,
      award_score: 1,
      faq_score: 1,
      profile_score: 1,
    }
  );

  if (!userMain) {
    throw new Error("User not found.");
  }
  return userMain.profile_score || 0;
}

export async function calculateCompanyProfileScore(company_row_id, fieldsToUpdate = ["profile_score"]) {

  // Full recalculation flag
  const fullUpdate = fieldsToUpdate.length === 0 || fieldsToUpdate.includes("profile_score");

  // Final update object
  const updateObject = {};
  let total = 0;


  // ---------------------------------------------------------
  // LOAD ALL PREVIOUS SCORES (needed for partial updates)
  // ---------------------------------------------------------
  const oldScores = await companyM.findOne(
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
      holding_crypto_score: 1,
      profile_score: 1
    }
  ).lean();
  const existingScores = {
    basic_details_score: oldScores.basic_details_score ?? 0,
    seo_details_score: oldScores.seo_details_score ?? 0,
    social_media_score: oldScores.social_media_score ?? 0,
    owned_product_score: oldScores.owned_product_score ?? 0,
    team_detail_score: oldScores.team_detail_score ?? 0,
    job_opening_score: oldScores.job_opening_score ?? 0,
    funding_score: oldScores.funding_score ?? 0,
    revenue_score_score: oldScores.revenue_score_score ?? 0,
    investment_score: oldScores.investment_score ?? 0,
    faq_score: oldScores.faq_score ?? 0,
    holding_crypto_score: oldScores.holding_crypto_score ?? 0,
    profile_score: oldScores.profile_score ?? 0
  };

  // ---------------------------------------------------------
  // ✅ 1. BASIC DETAILS (30%)
  // ---------------------------------------------------------
  const basic = await companyM.findOne({ _id: company_row_id }).lean();
  if (fullUpdate || fieldsToUpdate.includes("basic")) {
    const other = await company_seo_detailsM.findOne({ company_row_id }).lean();

    const basicFields = {
      company_logo: 2,
      company_name: 2,
      company_id: 1,
      website_link: 2,
      established_in: 2,
      company_location: 2,
      main_business_model_id: 2,
      business_model_id: 2,
      company_valuation: 2,
      nft_wallet_address: 2,
      company_email_id: 2,
      contact_number: 2,
      company_size_row_id: 2,
      describe_in_one_line: 2,
      about_company: 3,

    };

    const seoFields = {
      meta_keywords: 4,
      meta_description: 3,
      meta_title: 3,
    }

    let basicScore = 0;
    let seoScore = 0;


    for (let f in basicFields) {
      const v = basic?.[f] ?? other?.[f];
      if (v) basicScore += basicFields[f];
    }
    for (let f in seoFields) {
      const v = other?.[f];
      if (v) seoScore += seoFields[f];
    }
    updateObject.basic_details_score = basicScore;
    updateObject.seo_details_score = seoScore;

    total += basicScore;
    total += seoScore
  }

  // ---------------------------------------------------------
  // ✅ 2. SOCIAL MEDIA (10%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("social_media")) {
    const other = await company_social_linksM.findOne({ company_row_id }).lean();

    const socials = ['linkedin', 'twitter', 'facebook', 'instagram', 'telegram', 'medium', 'reddit', 'youtube_channel', 'video_link', 'feed_url'];
    let socialScore = socials.filter(f => other?.[f]).length * 2;

    if (socialScore > 10) socialScore = 10;

    updateObject.social_media_score = socialScore;
    total += socialScore;
  }

  // ---------------------------------------------------------
  // ✅ 3. OWNED PRODUCTS (10%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("owned_product")) {
    const products = await company_productsM.find({ company_row_id });

    updateObject.owned_product_score = products ? 10 : 0;
    total += updateObject.owned_product_score;
  }

  // ---------------------------------------------------------
  // ✅ 4. TEAM (10%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("team_detail")) {
    const team = await professionals_work_experienceM.countDocuments({ company_row_id });
    let tScore = 0;
    if (basic?.company_size_row_id) {
      const company_size = basic?.company_size_row_id

      if ((company_size == 1 && team >= 1) ||
        (company_size == 2 && team >= 2) ||
        (company_size == 3 && team >= 5) ||
        (company_size == 4 && team >= 10)) {
        tScore = 10;
      }
    }
    updateObject.team_detail_score = tScore;
    total += tScore;
  }

  // ---------------------------------------------------------
  // ✅ 5. JOB OPENINGS (5%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("job_opening")) {
    const hasJobs = await jobsM.exists({ company_row_id, is_deleted: false });

    updateObject.job_opening_score = hasJobs ? 5 : 0;
    total += updateObject.job_opening_score;
  }

  // ---------------------------------------------------------
  // ✅ 6. FUNDING (5%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("funding")) {
    const hasFunding = await fundingInvestmentM.exists({ funds_raised_company_row_id: company_row_id });

    updateObject.funding_score = hasFunding ? 5 : 0;
    total += updateObject.funding_score;
  }

  // ---------------------------------------------------------
  // ✅ 7. INVESTMENT (5%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("investment")) {
    const hasInvestment = await fundingInvestmentM.exists({ investor_row_id: company_row_id });

    updateObject.investment_score = hasInvestment ? 5 : 0;
    total += updateObject.investment_score;
  }

  // ---------------------------------------------------------
  // ✅ 8. REVENUE (5%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("revenue")) {
    const hasRevenue = await company_revenue_growthM.exists({ company_row_id });

    updateObject.revenue_score_score = hasRevenue ? 5 : 0;
    total += updateObject.revenue_score_score;
  }

  // ---------------------------------------------------------
  // ✅ 9. FAQ (5%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("faq")) {
    const faqCount = await company_faqM.countDocuments({ company_row_id });

    updateObject.faq_score = faqCount >= 3 ? 5 : 0;
    total += updateObject.faq_score;
  }

  // ---------------------------------------------------------
  // ✅ 10. HOLDING CRYPTO (5%)
  // ---------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("holding_crypto")) {
    const hasHoldings = await company_holdingM.exists({ company_row_id });

    updateObject.holding_crypto_score = hasHoldings ? 5 : 0;
    total += updateObject.holding_crypto_score;
  }

  // ---------------------------------------------------------
  // ✅ FINAL PROFILE SCORE (Intelligent)
  // ---------------------------------------------------------
  let finalProfileScore = 0;

  if (fullUpdate) {
    finalProfileScore = total;
  } else {
    // Recompute profile_score based on replaced values
    let newScores = {
      basic_details_score: updateObject?.basic_details_score ?? existingScores?.basic_details_score,
      seo_details_score: updateObject?.seo_details_score ?? existingScores?.seo_details_score,
      social_media_score: updateObject?.social_media_score ?? existingScores.social_media_score,
      owned_product_score: updateObject?.owned_product_score ?? existingScores.owned_product_score,
      team_detail_score: updateObject?.team_detail_score ?? existingScores.team_detail_score,
      job_opening_score: updateObject?.job_opening_score ?? existingScores.job_opening_score,
      funding_score: updateObject?.funding_score ?? existingScores.funding_score,
      revenue_score_score: updateObject?.revenue_score_score ?? existingScores.revenue_score_score,
      investment_score: updateObject?.investment_score ?? existingScores.investment_score,
      faq_score: updateObject?.faq_score ?? existingScores.faq_score,
      holding_crypto_score: updateObject?.holding_crypto_score ?? existingScores.holding_crypto_score
    };

    finalProfileScore = Object.values(newScores).reduce((sum, x) => sum + x, 0);
  }

  updateObject.profile_score = finalProfileScore;

  // ✅ Final DB Update
  await companyM.updateOne({ _id: company_row_id }, updateObject);

  return updateObject;
}

export async function calculateEventScore(event_row_id, fieldsToUpdate = ["profile_score"]) {
  // full recalculation flag
  const fullUpdate = fieldsToUpdate.length === 0 || fieldsToUpdate.includes("profile_score");

  const updateObject = {};
  let total = 0;


  // Load old scores for partial update computation
  const oldScores = await eventM.findOne(
    { _id: event_row_id },
    {
      build_event_page_score: 1,
      contact_details_score: 1,
      seo_details_score: 1,
      tickets_coupons_score: 1,
      speakers_score: 1,
      sponsors_partners_score: 1,
      attendees_score: 1,
      faq_score: 1,
      profile_score: 1
    }
  ).lean();

  const existingScores = {
    build_event_page_score: oldScores?.build_event_page_score ?? 0,
    seo_details_score: oldScores?.seo_details_score ?? 0,
    contact_details_score: oldScores?.contact_details_score ?? 0,
    tickets_coupons_score: oldScores?.tickets_coupons_score ?? 0,
    speakers_score: oldScores?.speakers_score ?? 0,
    sponsors_partners_score: oldScores?.sponsors_partners_score ?? 0,
    attendees_score: oldScores?.attendees_score ?? 0,
    faq_score: oldScores?.faq_score ?? 0,
    profile_score: oldScores?.profile_score ?? 0
  };

  // Fetch core event data
  const event = await eventM.findOne({ _id: event_row_id }).lean();
  const event_seo = await event_seo_detailsM.findOne({ event_row_id: event_row_id }).lean();


  // -----------------------------------------------------------
  // ✅ 1. BUILD EVENT PAGE (40%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("build_event_page")) {
    let buildScore = 0;
    let socialScore = 0;
    const fields = [
      { value: event?.user_row_id || event?.company_row_id, points: 3 },
      { value: event?.event_title, points: 3 },
      { value: event?.event_image, points: 3 },
      { value: event?.alt_image_text, points: 1 },
      { value: event?.event_city || event?.event_state || event?.event_venue, points: 3 },
      { value: event?.start_date, points: 2 },
      { value: event?.end_date, points: 2 },
      { value: event?.event_type, points: 3 },
      { value: event?.event_tags, points: 2 },
      { value: event?.event_link, points: 3 },
      { value: event?.ticket_link, points: 2 },
      { value: event?.event_description, points: 3 },
    ];

    const seofields = [
      { value: event_seo?.meta_title, points: 3 },
      { value: event_seo?.meta_keywords, points: 4 },
      { value: event_seo?.meta_description, points: 3 }
    ];

    fields.forEach(f => {
      if (f.value && f.value !== "") buildScore += f.points;
    });
    seofields.forEach(f => {
      if (f.value && f.value !== "") socialScore += f.points;
    });

    if (buildScore > 30) buildScore = 30;
    updateObject.fields = fields
    updateObject.build_event_page_score = buildScore;
    updateObject.seo_details_score = socialScore;

    total += buildScore;
  }

  // -----------------------------------------------------------
  // ✅ 2. CONTACT DETAILS (10%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("contact_details")) {
    const contacts = await event_contactsM.countDocuments({ event_row_id });
    const score = contacts > 0 ? 10 : 0;


    updateObject.contact_details_score = score;
    total += score;
  }

  // -----------------------------------------------------------
  // ✅ 3. TICKETS + COUPONS (10%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("tickets_coupons")) {
    const tickets = await ticketM.countDocuments({ event_row_id });
    const score = tickets > 0 ? 10 : 0;
    updateObject.tickets_coupons_score = score;
    total += score;
  }

  // -----------------------------------------------------------
  // ✅ 4. SPEAKERS (15%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("speakers")) {
    const speakers = await event_speakersM.countDocuments({ event_row_id });
    const score = speakers > 0 ? 15 : 0;

    updateObject.speakers_score = score;
    total += score;
  }

  // -----------------------------------------------------------
  // ✅ 5. SPONSORS / PARTNERS (10%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("sponsors_partners")) {
    const sponsors = await event_sponsors_partner_detailsM.countDocuments({ event_row_id });
    const score = sponsors > 0 ? 10 : 0;

    updateObject.sponsors_partners_score = score;
    total += score;
  }

  // -----------------------------------------------------------
  // ✅ 6. ATTENDEES (5%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("attendees")) {
    const attendees = await event_attendeesM.countDocuments({ event_row_id });
    const score = attendees > 0 ? 5 : 0;

    updateObject.attendees_score = score;
    total += score;
  }

  // -----------------------------------------------------------
  // ✅ 7. FAQ (10%)
  // -----------------------------------------------------------
  if (fullUpdate || fieldsToUpdate.includes("faq")) {
    const faqCount = await event_faqM.countDocuments({ event_row_id });
    const score = faqCount >= 4 ? 10 : 0;

    updateObject.faq_score = score;
    total += score;
  }

  // -----------------------------------------------------------
  // ✅ FINAL PROFILE SCORE
  // -----------------------------------------------------------
  let finalProfileScore = 0;

  if (fullUpdate) {
    finalProfileScore = total;
  } else {
    const updatedScores = {
      build_event_page_score: updateObject.build_event_page_score ?? existingScores.build_event_page_score,
      seo_details_score: updateObject.seo_details_score ?? existingScores.seo_details_score,
      contact_details_score: updateObject.contact_details_score ?? existingScores.contact_details_score,
      tickets_coupons_score: updateObject.tickets_coupons_score ?? existingScores.tickets_coupons_score,
      speakers_score: updateObject.speakers_score ?? existingScores.speakers_score,
      sponsors_partners_score: updateObject.sponsors_partners_score ?? existingScores.sponsors_partners_score,
      attendees_score: updateObject.attendees_score ?? existingScores.attendees_score,
      faq_score: updateObject.faq_score ?? existingScores.faq_score
    };

    finalProfileScore = Object.values(updatedScores).reduce((a, b) => a + b, 0);
  }

  updateObject.profile_score = finalProfileScore;

  // ✅ Save in DB
  await eventM.updateOne({ _id: event_row_id }, updateObject);

  return updateObject;
}




export const sendJobEligibilityEmail = async (userData) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const pass_subject = `You Just Unlocked a Powerful Benefit!`
  const header_profile_section = `You Just Unlocked a Powerful Benefit!`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Congratulations! Your hard work and engagement on Coinpedia have paid off - you’ve unlocked the <b>Job Apply Eligibility. 🎯</b></p>
                  <p>💡<b> What You Can Do Now:</b></p>
                  <p>
  Your profile is now eligible to apply for job opportunities! Since you've completed a course, you can now explore and apply to openings from top Web3 and tech companies on Coinpedia.</p>
                  <a href="https://app.coinpedia.org/companies/">
                                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">Apply for Jobs</button>
                                  </a>
              </div>`

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}

export const sendDollarrewardEmail = async (userData) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const pass_subject = `$100 reward eligibility `
  const header_profile_section = `$100 reward eligibility `

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hi ${full_name},</h3>
                  <p style="margin: 0 0 8px">Big congratulations—you’ve earned it!</p>
                  <p style="margin: 0 0 8px"> Your active participation has unlocked the<b> $100 reward.</b></p>
                  <p>We appreciate your commitment to the community. Keep shining!</p>
              </div>`

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}


export const sendNewsCoverageEmail = async (userData) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const pass_subject = `You Just Unlocked a Powerful Benefit!`
  const header_profile_section = `You Just Unlocked a Powerful Benefit!`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Congratulations! Your influence on Coinpedia continues to grow - you’ve just unlocked the <b>Eligible for News Coverage feature. 🎯</b></p>
                  <p style="margin: 0 0 8px">By reaching 5,000+ followers and staying active in the ecosystem, you are now eligible to be featured in a Coinpedia news article.</p>
                  <p>💡<b> What You Can Do Now:</b></p>
                  <p>Submit your article for review. Once approved and published, you will be featured in Coinpedia’s global news coverage, giving you powerful visibility and recognition across the Web3 and tech community.</p>
                  <a href="https://app.coinpedia.org/benefits/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">Request Now</button>
                  </a>
              </div>`

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}

export const sendInterviewedTeamEmail = async (userData) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const pass_subject = `You Just Unlocked a Powerful Benefit!`
  const header_profile_section = `You Just Unlocked a Powerful Benefit!`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Congratulations! Your hard work and engagement on Coinpedia have paid off - you’ve unlocked the <b>Interview by Our Team. 🎯</b></p>
                  <p>💡<b> What You Can Do Now:</b></p>
                  <p>Submit your request for an interview. Once approved, you’ll get the opportunity to connect with our team and discuss your journey, expertise, and journalism-related insights.</p>
                  <a href="https://app.coinpedia.org/meetings/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">Request Now</button>
                  </a>
              </div>`

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}


export const sendJournalistInterviewEmail = async (userData, meeting_data) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { meeting_title, upload_document, meeting_datetime } = meeting_data
  const dateObj = new Date(meeting_datetime);

  // Extract date (YYYY-MM-DD)
  const date = dateObj.toISOString().split("T")[0];

  // Extract time (HH:mm:ss)
  const time = dateObj.toISOString().split("T")[1].substring(0, 5);
  const pass_subject = `Your Request Has Been Submitted!`
  const header_profile_section = `Your Request Has Been Submitted!`

  const attachedDocumentHtml = upload_document
    ? `<p><b>Attached Document:</b> ${upload_document}</p>`
    : "";

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Thank you for submitting your request for a <b>Journalist Meeting</b> with the Coinpedia team. 🗂️<br />
  Our team has received your request and will review it shortly.</p>
                  <p><b>Date:</b> ${date}</p>
                  <p><b>Time:</b> ${time} (UTC)</p>
                  <p><b>Topic/Purpose:</b> ${meeting_title}</p>
                  ${attachedDocumentHtml}
                  <p>Once your request is reviewed, a Coinpedia representative will get in touch with the next steps or scheduling confirmation.</p>
                  <a href="https://app.coinpedia.org/meetings/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View Meetings</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}

export const sendMeetingRequestEmail = async (userData, meeting_data, meeting_type, requested_user) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { meeting_title, meeting_datetime } = meeting_data
  const dateObj = new Date(meeting_datetime);


  // Extract date (YYYY-MM-DD)
  const date = dateObj.toISOString().split("T")[0];

  // Extract time (HH:mm:ss)
  const time = dateObj.toISOString().split("T")[1].substring(0, 5);
  const pass_subject = `You Have a Meeting Request!`
  const header_profile_section = `You Have a Meeting Request!`


  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">You’ve been invited to a <b>${meeting_type}</b> meeting by <b>${requested_user}</b> on Coinpedia.</p>
                  <p><b>Date:</b> ${date}</p>
                  <p><b>Time:</b> ${time} (UTC)</p>
                  <p><b>Topic/Purpose:</b> ${meeting_title}</p>
                  <p>Please review and respond to the request from your Coinpedia meetings.</p>
                  <a href="https://app.coinpedia.org/meetings/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View Requests</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}

export const sendUpcomingMeetingEmail = async (userData, meeting_data, meeting_type, requested_user) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { meeting_title, meeting_datetime } = meeting_data
  const dateObj = new Date(meeting_datetime);


  // Extract date (YYYY-MM-DD)
  const date = dateObj.toISOString().split("T")[0];

  // Extract time (HH:mm:ss)
  const time = dateObj.toISOString().split("T")[1].substring(0, 5);
  const pass_subject = `Your Meeting is Coming Up!`
  const header_profile_section = `Your Meeting is Coming Up!`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Just a quick reminder  - your <b>${meeting_type}</b> meeting with <b>${requested_user}</b>  is scheduled for tomorrow.</p>
                  <p><b>Date:</b> ${date}</p>
                  <p><b>Time:</b> ${time} (UTC)</p>
                  <p  style="margin: 0 0 8px"><b>Topic/Purpose:</b> ${meeting_title}</p>
                  <p>Please ensure you’re prepared and logged in a few minutes early to make the most of your meeting.</p>

                  <a href="https://app.coinpedia.org/meetings/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">Join Meeting</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}

export const sendConfirmedMeetingEmail = async (userData, meeting_data, meeting_type, requested_user) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { meeting_title, meeting_datetime, meeting_link } = meeting_data
  const dateObj = new Date(meeting_datetime);


  // Extract date (YYYY-MM-DD)
  const date = dateObj.toISOString().split("T")[0];

  // Extract time (HH:mm:ss)
  const time = dateObj.toISOString().split("T")[1].substring(0, 5);
  const pass_subject = `Your Meeting is Confirmed!`
  const header_profile_section = `Your Meeting is Confirmed!`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Your request for a <b>${meeting_type}</b> meeting with <b>${requested_user}</b> has been scheduled/rescheduled.</p>
                  <p><b>Date:</b> ${date}</p>
                  <p><b>Time:</b> ${time} (UTC)</p>
                  <p><b>Topic/Purpose:</b> ${meeting_title}</p>
                  <p style="margin: 0 0 8px"><b>Location:</b>  <a style='color: rgba(0, 102, 255, 1);' href="${meeting_link}">Meeting Link</a><p>
                  <p style="margin: 0 0 8px">Thank you for using Coinpedia to build stronger professional connections..</p>
                  <p>We're delighted to facilitate this connection for you on CoinPedia! Prepare for a productive discussion, and we'll keep you informed of any further details. 😊</p>

                  <a href="https://app.coinpedia.org/meetings/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View Meetings</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}

export const sendJobApplicantEmail = async (userData, job_data, resume) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { name, job_date, job_role } = job_data
  const dateObj = new Date(job_date);


  // Extract date (YYYY-MM-DD)
  const date = dateObj.toISOString().split("T")[0];

  // Extract time (HH:mm:ss)
  const pass_subject = `You Have a New Applicant! `
  const header_profile_section = `You Have a New Applicant! !`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">A new candidate has applied for your posted role: <b>${job_role}</b>.  has been scheduled/rescheduled.</p>
                  <p><b>Applicant Name:</b> ${name}</p>
                  <p><b>Role Applied:</b> ${job_role}</p>
                  <p><b>Applied On:</b> ${date}</p>
                  <p style="margin: 0 0 8px"><b>View Application:</b>  <a style='color: rgba(0, 102, 255, 1);' href="${resume}">Resume</a><p>
                  <p>We’re excited to help you find the right fit. You can review their profile and take the next step in your hiring process anytime.</p>

                  <a href="https://app.coinpedia.org/company/profile/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View Applicants</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}


export const sendJobAppliedEmail = async (userData, meeting_data) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { resume, job_role, company_name } = meeting_data
  const pass_subject = `Your Application is on its Way!`
  const header_profile_section = `Your Application is on its Way!`
  const attachedDocumentHtml = resume
    ? `<p style="margin: 0 0 8px"><b>Attached Document:</b> <a style='color: rgba(0, 102, 255, 1);' href="${resume}">Resume</a></p>`
    : "";

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">Thank you for applying for the role of <b>${job_role}</b> at <b>${company_name}</b> via Coinpedia! 🚀<br />
                  We’ve successfully submitted your application to the company.</p>
                  <p><b>Application Summary</b></p>
                  <p><b>Position:</b> ${job_role}</p>
                  <p><b>Company:</b> ${company_name}</p>
                  ${attachedDocumentHtml}
                  <p style="margin: 0 0 8px">🔍<b> What’s Next?</b><br/>
                    The company will review your profile, and you’ll be notified about any updates or interview opportunities right here.</p>
                  <p>In the meantime, feel free to explore more roles or update your profile to stand out even more!</p>

                  <a href="https://app.coinpedia.org/profile/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View Applications</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}


export const sendJobScheduledEmail = async (userData, meeting_data) => {
  const full_name = userData.full_name
  const email_id = userData.email_id
  const { meeting_datetime, meeting_link, company_name } = meeting_data
  const dateObj = new Date(meeting_datetime);


  // Extract date (YYYY-MM-DD)
  const date = dateObj.toISOString().split("T")[0];

  // Extract time (HH:mm:ss)
  const time = dateObj.toISOString().split("T")[1].substring(0, 5);
  const pass_subject = `Get Ready - Your Interview is Set!`
  const header_profile_section = `Get Ready - Your Interview is Set!`

  const pass_message = `
              <div style='background:#fff; padding: 20px 30px 20px 30px;border-radius: 0 0 10px 10px;'>
                  <h3>Hello ${full_name},</h3>
                  <p style="margin: 0 0 8px">We’re excited to confirm that your interview has been scheduled with <b>${company_name}</b></p>
                  <p><b>Date:</b> ${date}</p>
                  <p><b>Time:</b> ${time} (UTC)</p>
                  <p  style="margin: 0 0 8px"><b>Location:</b> <a style='color: rgba(0, 102, 255, 1);' href="${meeting_link}">Virtual Link</a> </p>
                  <p style="margin: 0 0 8px">This is a great opportunity to showcase your skills and explore what’s next in your journey.</p>
                  <p> 📌 Keep an eye on your applications for any updates or prep tips before your session.</p>

                  <a href="https://app.coinpedia.org/meetings/">
                      <button style="background: rgba(0, 102, 255, 0.1); border: 0; padding: 9px 24px;color: rgba(0, 102, 255, 1); border-radius: 8px;    width: max-content;
                      font-weight: 700; font-size: 14px; line-height: 18px;margin-top: 20px;">View Interviews</button>
                  </a>
              </div>`;

  await sendAcademyEmail(email_id, pass_subject, pass_message, header_profile_section)

  return { status: true }
}



export const EventWatchlistReminderEmail = async () => {
  try {
    const now = new Date();

    const watchlistPending = await event_watchlistsM.find({
      email_sent_status: false,
      reminder_time: { $lte: now },
      reminder_type: { $in: [0, 1, 2, 3, 4] }
    }).lean();

    const attendeePending = await events_attendeesM.find({
      reminder_email_sent_status: false,
      reminder_time: { $lte: now },
      reminder_type: { $in: [0, 1, 2, 3, 4] }
    }).lean();

    console.log(
      `Pending reminders -> Watchlist: ${watchlistPending.length}, Attendees: ${attendeePending.length}`
    );

    if (!watchlistPending.length && !attendeePending.length) return;

    for (const row of watchlistPending) {

      // lock verification
      const locked = await event_watchlistsM.updateOne(
        { _id: row._id, email_sent_status: false },
        { $set: { email_sent_status: true } }
      );

      if (!locked.modifiedCount) continue;

      await sendReminderEmail(row.user_row_id, row.event_row_id);
      console.log(`Reminder sent to WATCHLIST user: ${row.user_row_id}`);
    }
    for (const row of attendeePending) {

      // lock verification
      const locked = await events_attendeesM.updateOne(
        { _id: row._id, reminder_email_sent_status: false },
        { $set: { reminder_email_sent_status: true } }
      );

      if (!locked.modifiedCount) continue;

      await sendReminderEmail(row.user_row_id, row.event_row_id);
      console.log(`Reminder sent to REGISTERED ATTENDEE: ${row.user_row_id}`);
    }

  } catch (err) {
    console.log("Reminder email error:", err?.message);
  }
};
export const sendReminderEmail = async (user_row_id, event_row_id) => {
  const event = await eventM.findOne({ _id: event_row_id, active_status: 1 }).lean();
  if (!event) return;

  const user = await professionalsM.findOne({ _id: user_row_id }).lean();
  if (!user) return;
  let utc_row_id = 0

  const check_event_res = await checkEventRowID({ event_row_id: event_row_id, user_row_id: 0 })
  if (check_event_res.status) {

    utc_row_id = check_event_res.message.utc_row_id
  }
  const email_id = user.email_id
  const full_name = user.full_name
  const formatted_date = DateFormatter(event.start_date);
  const event_location = event.event_venue || "Online";
  const event_url = `https://events.coinpedia.org/${event.event_url}`;
  const event_title = event.event_title
  const subject = `Event Reminder: ${event.event_title}`;
  const get_utc_time = await event_utc_datesM.findOne({ _id: utc_row_id }, { utc_time: 1 })
  // const start_date_formatted = DateFormatter(start_date)
  const header_title = `
<table width="100%" cellspacing="0" cellpadding="0" style="padding: 10px 0;"> 

</table>
`;

  const message_to_pass = `
  <!-- Greeting -->
  <p style="font-weight:600; font-size:20px; margin-bottom:12px;">
    Hello ${capitalizeWords(full_name)},
  </p>

  <!-- Main Message -->
  <div style="font-size:16px; line-height:26px">
  <p style="margin:10px 0;">
    Your reminder for 
    <b style="text-transform:capitalize;">${event_title}</b> 
    is set and ready!
  </p>

  <!-- Details -->
 <p style="
    margin:14px 0;
    line-height:32px;
   
    font-family:'Figtree', Arial, sans-serif;
    color:#000;
">

  <!-- Starts At -->
  <img 
    src="https://image.coinpedia.org/static/common/clock.png"
    alt="Clock Icon"
    style="width:24px; vertical-align:middle; margin-right:6px;"
  >
  <b style="font-weight:600;">Starts at:</b>
  ${formatted_date} ${get_utc_time?.utc_time ? `(UTC${get_utc_time.utc_time})` : ``}
  <br>

  <!-- Where -->
  <img 
    src="https://image.coinpedia.org/static/common/location.png"
    alt="Location Icon"
    style="width:24px; vertical-align:middle; margin-right:6px; "
  >
  <b style="font-weight:600;">Where:</b>
  ${event_location}

</p>


  <!-- Description -->
  <p style="margin:18px 0;">
    The countdown has begun – get ready for insights, networking, and updates shaping the crypto world. See you there.
  </p>
  </div>

  <!-- Button -->
  <a href="${event_url}" 
     style="display:inline-block; margin-top:12px; background:#0052cc; color:#fff; 
            padding:10px 22px; border-radius:6px; text-decoration:none; 
            font-weight:600; font-size:14px;">
    Check Details
  </a>

  <!-- Footer Note -->
  <p style="font-size:12px; margin-top:8px; color:#17171780;">
    This link will direct you to the event detail page, where you can find all the essential details.
  </p>




`;

  await sendEventWatchlistEmail(
    email_id,
    subject,
    message_to_pass,
    header_title,
    user._id,
    event_row_id
  );
};

export const safeNum = (v) =>
  typeof v === "number" && !Number.isNaN(v) ? v.toLocaleString() : "N/A";

export const safeMoney = (v) =>
  typeof v === "number" && !Number.isNaN(v) ? `$${v.toLocaleString()}` : "N/A";

export const safeDateLong = (value, fallback = "upcoming date") => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch (e) {
    return fallback;
  }
};



export const capitalizeWords = (text = "") => {
  if (!text || typeof text !== "string") return text;
  return text
    .toLowerCase()
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
};




// Joins a resolved positions[] array (from getPositionResolutionStages()) into a single
// human-readable string for plain-text/email contexts that can only show one job-title
// value per person, e.g. [{position_name:"Founder"},{position_name:"CEO"}] -> "Founder and CEO"
// or three-plus -> "Founder, Co Founder and CEO". Mirrors the frontend's own join convention
// (no existing backend precedent for this pattern was found — see task report).
export const joinPositionNames = (positions = []) => {
  // Capitalize each position name individually BEFORE joining, so the joiner words
  // (", " / " and ") stay literal lowercase and never get re-processed by a downstream
  // capitalizeWords() call on the whole joined string (which would capitalize "and" and
  // defeat this join convention - see task-18 report). Consumers should use the returned
  // string as-is and must NOT wrap it in capitalizeWords() again.
  const names = (positions || [])
    .map(p => p && p.position_name)
    .filter(Boolean)
    .map(name => capitalizeWords(name));

  if (!names.length) return "";

  return names.join(", ").replace(/,([^,]*)$/, " and$1");
};




// Pipeline for sendCompanyWatchlist's "newly-verified employees" sub-aggregate. Extracted so the
// positions[] multi-position resolution (getPositionResolutionStages()) can be regression-tested
// in isolation, without mocking the many unrelated models the rest of sendCompanyWatchlist touches.
export const buildNewEmployeesWatchlistPipeline = (company_row_id, referenceDate) => ([
  {
    $match: {
      company_row_id,
      verified_status: true,
      till_date_status: 2,
      verified_on: { $gt: referenceDate }
    }
  },
  ...getPositionResolutionStages(),
  {
    $lookup: {
      from: "cln_professionals",
      foreignField: "_id",
      localField: "user_row_id",
      pipeline: [
        {
          $lookup: {
            from: "cln_professionals_profile_images",
            localField: "_id",
            foreignField: "user_row_id",
            as: "img"
          }
        },
        { $unwind: { path: "$img", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            full_name: 1,
            email_id: 1,
            profile_image: "$img.profile_image"
          }
        }
      ],
      as: "user_info"
    }
  },
  { $unwind: "$user_info" },
  {
    $addFields: {
      full_name: "$user_info.full_name"
    }
  },
  {
    $project: {
      _id: 1,
      full_name: 1,
      positions: 1,
      verified_on: 1
    }
  },
  { $sort: { verified_on: -1 } }
]);




export const sendCompanyWatchlist = async () => {

  const users = await company_watchlistM.distinct("user_row_id");

  let sentEmails = 0;
  let company = []

  for (const user_row_id of users) {

    const [watchEntries, user] = await Promise.all([
      company_watchlistM.find({ user_row_id }),
      professionalsM.findOne({ _id: user_row_id })
    ]);

    if (!watchEntries?.length || !user) continue;

    let companiesWithUpdates = [];
    let updatedIds = [];
    let hasNewUpdates = false;
    for (const entry of watchEntries) {

      const { company_row_id, date_n_time, last_email_sent_on } = entry;

      const referenceDate = last_email_sent_on || date_n_time;

      company = await companyM.findOne({
        _id: company_row_id,
        approval_status: 1,
        active_status: 1
      });

      if (!company) continue;
      updatedIds.push(entry._id);

      const [
        newEvents,
        newEmployees,
        newJobs,
        newRevenue,
        newFunding,
        companyProductsRaw,
        holdingsRaw
      ] = await Promise.all([
        eventM.find({
          company_row_id,
          approval_status: 1,
          active_status: 1,
          list_event_type: { $in: [2, 3] },
          $or: [
            { created_date_n_time: { $gt: referenceDate } },
            { updated_date_n_time: { $gt: referenceDate } }
          ]
        }),

        professionals_work_experienceM.aggregate(
          buildNewEmployeesWatchlistPipeline(company_row_id, referenceDate)
        ),

        jobsM.find({
          company_row_id,
          active_status: "active",
          createdAt: { $gt: referenceDate }
        }).sort({ createdAt: -1 }),

        company_revenue_growthM.find({
          company_row_id,
          year: { $gte: 2024 },
          updated_date_n_time: { $gt: referenceDate }
        }),

        await fundingInvestmentM.aggregate([

          // 1️⃣ MATCH RELEVANT RECORDS
          {
            $match: {
              verified_status: 1,
              verified_on: { $gt: referenceDate },
              $or: [
                { funds_raised_company_row_id: company_row_id },        // inbound
                { investor_type: 2, investor_row_id: company_row_id }   // outbound
              ]
            }
          },

          // 2️⃣ LOOKUP: INVESTOR USER (IF investor_type = 1)
          {
            $lookup: {
              from: "cln_professionals",
              let: {
                investor_type: "$investor_type",
                investor_registered: "$investor_registered_type",
                investor_id: "$investor_row_id"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$$investor_type", 1] },
                        { $eq: ["$$investor_registered", 1] },
                        { $eq: ["$_id", "$$investor_id"] }
                      ]
                    }
                  }
                },
                { $project: { full_name: 1, profile_image: 1 } }
              ],
              as: "investor_user"
            }
          },
          { $unwind: { path: "$investor_user", preserveNullAndEmptyArrays: true } },

          // 3️⃣ LOOKUP: INVESTOR COMPANY (IF investor_type = 2)
          {
            $lookup: {
              from: "cln_company_lists",
              let: {
                investor_type: "$investor_type",
                investor_registered: "$investor_registered_type",
                investor_id: "$investor_row_id"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$$investor_type", 2] },
                        { $eq: ["$$investor_registered", 1] },
                        { $eq: ["$_id", "$$investor_id"] }
                      ]
                    }
                  }
                },
                { $project: { company_name: 1, company_logo: 1 } }
              ],
              as: "investor_company"
            }
          },
          { $unwind: { path: "$investor_company", preserveNullAndEmptyArrays: true } },

          // 4️⃣ LOOKUP: FUNDING ROUND CATEGORY
          {
            $lookup: {
              from: "cln_static_company_funding_rounds",
              localField: "category_row_id",
              foreignField: "_id",
              as: "category_info"
            }
          },
          { $unwind: { path: "$category_info", preserveNullAndEmptyArrays: true } },

          // 5️⃣ LOOKUP: TARGET COMPANY (THE COMPANY BEING INVESTED INTO)
          {
            $lookup: {
              from: "cln_company_lists",
              localField: "funds_raised_company_row_id",
              foreignField: "_id",
              as: "target_company"
            }
          },
          { $unwind: { path: "$target_company", preserveNullAndEmptyArrays: true } },

          // 6️⃣ FINAL FIELD MAPPING
          {
            $set: {
              // Investor name depends on type
              investor_name: {
                $cond: [
                  { $eq: ["$investor_type", 1] },    // individual investor
                  "$investor_user.full_name",
                  "$investor_company.company_name"   // company investor
                ]
              },

              // Investor image
              investor_image: {
                $cond: [
                  { $eq: ["$investor_type", 1] },
                  "$investor_user.profile_image",
                  "$investor_company.company_logo"
                ]
              },

              category_name: "$category_info.category_name",
              target_company_name: "$target_company.company_name",

              target_company_logo: "$target_company.company_logo"
            }
          },

          { $sort: { verified_on: -1 } }
        ]),


        company_productsM.aggregate([
          {
            $match: {
              company_row_id,
              company_type: 1,
              date_n_time: { $gt: referenceDate }
            }
          },
          {
            $project: {
              product_type: 1,
              product_row_id: 1,
              register_type: 1,
              added_on: "$date_n_time"
            }
          }
        ]),

        // holding DB only
        markets_company_holdingM.aggregate([
          {
            $match: {
              company_row_id,
              company_type: 1,
              date_n_time: { $gt: referenceDate }
            }
          },
          {
            $sort: {
              purchased_value_in_usd: -1
            }
          },
          {
            $project: {
              token_type: 1,
              token_row_id: 1,
              purchased_value_in_usd: 1,
              purchased_date: 1
            }
          }
        ])
      ])

      // positions[] (multi-position feature) is resolved by getPositionResolutionStages() in
      // the newEmployees aggregate above; join it down to a single display string here since
      // this is a plain-text email that can only show one job title per person (unlike UI
      // surfaces that render position chips). Downstream rendering (below) still reads
      // emp.position_name, unchanged.
      newEmployees.forEach(emp => {
        emp.position_name = joinPositionNames(emp.positions);
      });

      let sectionsHtml = "";
      let hasSection = false;

      const addSection = (title, bodyHtml) => {
        if (!bodyHtml) return;

        hasNewUpdates = true;

        if (hasSection) {
          sectionsHtml += `
            <tr><td style="border-top:1px solid #E5E7EB; padding-top:14px;"></td></tr>`;
        }
        sectionsHtml += `
          <tr><td style="padding-bottom:10px; padding-top:${hasSection ? "4px" : "0"};">
            <div style="font-size:14px;font-weight:600;color:#6B7280;margin-bottom:4px;">${title}</div>
            <div style="font-size:12px;color:#111827;line-height:1.8;">${bodyHtml}</div>
          </td></tr>`;
        hasSection = true;
      };
      const productIds = {
        token: [],
        chain: [],
        exchange: []
      };

      for (const item of companyProductsRaw) {
        if (item.product_type === 1) {
          productIds.token.push(item.product_row_id);
        }

        if (item.product_type === 2) {
          productIds.chain.push(item.product_row_id);
        }

        if (item.product_type === 3) {
          productIds.exchange.push(item.product_row_id);
        }
      }

      const [
        tokenProducts,
        chainProducts,
        exchangeProducts
      ] = await Promise.all([
        marketDB.collection("cln_markets_tokens")
          .find(
            { _id: { $in: productIds.token } },
            {
              projection: {
                _id: 1,
                token_name: 1,
                price: 1,
                marketcap: 1
              }
            }
          )
          .toArray(),

        marketDB.collection("cln_chains")
          .find(
            { _id: { $in: productIds.chain } },
            {
              projection: {
                _id: 1,
                chain_name: 1,
                tvl: 1,
                protocols: 1
              }
            }
          )
          .toArray(),

        marketDB.collection("cln_exchanges")
          .find(
            { _id: { $in: productIds.exchange } },
            {
              projection: {
                _id: 1,
                exchange_name: 1,
                volume_24h: 1,
                total_coins: 1
              }
            }
          )
          .toArray()
      ]);

      const newProducts = companyProductsRaw.map((item) => {
        let productData = null;

        if (item.product_type === 1) {
          productData = tokenProducts.find((x) => x._id === item.product_row_id);

          return {
            product_type: item.product_type,
            added_on: item.added_on,
            name: productData?.token_name || "Unknown",
            type: "Crypto Token",
            price: productData?.price || null,
            market_cap: productData?.marketcap || null,
            tvl: null,
            protocols: null,
            volume_24h: null,
            total_coins: null
          };
        }

        if (item.product_type === 2) {
          productData = chainProducts.find((x) => x._id === item.product_row_id);

          return {
            product_type: item.product_type,
            added_on: item.added_on,
            name: productData?.chain_name || "Unknown",
            type: "Blockchain",
            price: null,
            market_cap: null,
            tvl: productData?.tvl || null,
            protocols: productData?.protocols || null,
            volume_24h: null,
            total_coins: null
          };
        }

        if (item.product_type === 3) {
          productData = exchangeProducts.find((x) => x._id === item.product_row_id);

          return {
            product_type: item.product_type,
            added_on: item.added_on,
            name: productData?.exchange_name || "Unknown",
            type: "Exchange",
            price: null,
            market_cap: null,
            tvl: null,
            protocols: null,
            volume_24h: productData?.volume_24h || null,
            total_coins: productData?.total_coins || null
          };
        }

        return null;
      }).filter(Boolean);


      // =========================
      // FIX newHoldings
      // =========================

      const holdingIds = {
        token: [],
        token_manual: []
      };

      for (const item of holdingsRaw) {
        if (item.token_type === 1) {
          holdingIds.token.push(item.token_row_id);
        }

        if (item.token_type === 2) {
          holdingIds.token_manual.push(item.token_row_id);
        }
      }

      const [
        holdingRegistered,
        holdingManual
      ] = await Promise.all([
        marketDB.collection("cln_markets_tokens")
          .find(
            { _id: { $in: holdingIds.token } },
            {
              projection: {
                _id: 1,
                token_name: 1,
                symbol: 1,
                token_image: 1
              }
            }
          )
          .toArray(),

        marketDB.collection("cln_markets_search_contract_addresses")
          .find(
            { _id: { $in: holdingIds.token_manual } },
            {
              projection: {
                _id: 1,
                token_name: 1,
                symbol: 1,
                token_image: 1
              }
            }
          )
          .toArray()
      ]);

      const newHoldings = holdingsRaw.map((item) => {
        let tokenData = null;

        if (item.token_type === 1) {
          tokenData = holdingRegistered.find(
            (x) => x._id === item.token_row_id
          );
        }

        if (item.token_type === 2) {
          tokenData = holdingManual.find(
            (x) => x._id === item.token_row_id
          );
        }

        return {
          symbol: tokenData?.symbol || null,
          token_name: tokenData?.token_name || null,
          purchased_value_in_usd: item.purchased_value_in_usd,
          purchased_date: item.purchased_date
        };
      }).filter((item) => item.token_name);

      let productsHoldingsLines = [];


      const blockchainProducts2 = newProducts
        .filter(p => p.product_type === 2)
        .sort((a, b) => new Date(b.added_on) - new Date(a.added_on))
        .slice(0, 2);

      const exchangeProducts2 = newProducts
        .filter(p => p.product_type === 3)
        .sort((a, b) => new Date(b.added_on) - new Date(a.added_on))
        .slice(0, 2);

      const tokenProducts2 = newProducts
        .filter(p => p.product_type === 1)
        .sort((a, b) => new Date(b.added_on) - new Date(a.added_on))
        .slice(0, 2);


      // ---- BLOCKCHAINS ----
      if (blockchainProducts2.length) {
        const lines = blockchainProducts2.map(p => {
          const name = `<b>${p.name}</b>`;
          const protocols = p.protocols ? `<b>${p.protocols}</b>` : "N/A";
          const tvl = p.tvl ? `<b>${safeMoney(p.tvl)}</b>` : "N/A";
          return `${name} blockchain supports ${protocols} protocols with a TVL of ${tvl}.`;
        });

        const sentence = lines.length === 1
          ? lines[0]
          : lines.join(" ");

        productsHoldingsLines.push(`<b>Blockchains</b><br>${sentence}`);
      }


      // ---- EXCHANGES ----
      if (exchangeProducts2.length) {
        const lines = exchangeProducts2.map(x => {
          const name = `<b>${x.name}</b>`;
          const volume = x.volume_24h ? `<b>${safeMoney(x.volume_24h)}</b>` : "N/A";
          const coins = x.total_coins ? `<b>${x.total_coins}</b>` : "N/A";

          return `${name} exchange recorded ${volume} in 24-hour trading volume with ${coins} listed coins.`;
        });

        const sentence = lines.length === 1
          ? lines[0]
          : lines.join(" ");

        productsHoldingsLines.push(`<b>Exchanges</b><br>${sentence}`);
      }
      if (tokenProducts2.length) {
        const lines = tokenProducts2.map(x => {
          const name = `<b>${x.name}</b>`;
          const price = x.price ? `<b>$${x.price.toFixed(2)}</b>` : "N/A";
          const mcap = x.market_cap ? `<b>$${(x.market_cap / 1_000_000_000).toFixed(2)}B</b>` : "N/A";

          return `${name} is trading at ${price} with a market cap of ${mcap}.`;
        });

        const sentence = lines.length === 1
          ? lines[0]
          : lines.join(" ");

        productsHoldingsLines.push(`<b>Tokens</b><br>${sentence}`);
      }

      if (newHoldings.length) {
        const formatUSD = n =>
          typeof n === "number" && !Number.isNaN(n)
            ? (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${safeNum(n)}`)
            : "N/A";

        const values = newHoldings
          .sort((a, b) => new Date(b.purchased_date) - new Date(a.purchased_date))
          .slice(0, 3);

        const holdingsText = values.map(h => {
          const amount = formatUSD(h.purchased_value_in_usd);
          const date = new Date(h.purchased_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
          });
          return `<b>${h.token_name}</b> (<b>${amount}</b>, purchased on ${date})`;
        });

        let holdingsSentence = "";

        if (holdingsText.length === 1) {
          holdingsSentence = `The company’s holdings include assets like ${holdingsText[0]}.`;
        } else if (holdingsText.length === 2) {
          holdingsSentence = `The company’s holdings include assets like ${holdingsText[0]} and ${holdingsText[1]}.`;
        } else {
          const last = holdingsText.pop();
          holdingsSentence = `The company’s holdings include assets like ${holdingsText.join(", ")}, and ${last}.`;
        }

        productsHoldingsLines.push(`<b>Holdings</b><br>${holdingsSentence}`);
      }


      if (productsHoldingsLines.length) {
        addSection("Products & Holdings", productsHoldingsLines.join("<br><br>"));
      }

      if (newEmployees.length) {
        const sorted = newEmployees.sort((a, b) => new Date(b.verified_on) - new Date(a.verified_on));
        const latest = sorted.slice(0, 2);

        const formatted = latest.map(emp => {
          const name = capitalizeWords(emp.full_name) || "New Member";
          // emp.position_name was already capitalized per-position inside joinPositionNames();
          // do NOT re-wrap in capitalizeWords() here - that would re-capitalize the lowercase
          // "and"/", " joiners and defeat the join convention (see task-18 report).
          const role = emp.position_name || "Position";
          return `<b style="text-transform:capitalize;">${name}</b> (${role})`;
        });

        let sentence = "";

        if (formatted.length === 1) {
          const emp = latest[0];

          const name = capitalizeWords(emp.full_name) || "A new member";
          // See comment above: emp.position_name is already capitalized by joinPositionNames().
          const role = emp.position_name || "a new role";

          sentence = `<b style="text-transform:capitalize;">${name}</b> is now part of the team as <b style="text-transform:capitalize;">${role}</b>.`;
        }
        else if (formatted.length === 2) {
          sentence = `New team additions include ${formatted[0]} and ${formatted[1]}.`;
        } else {
          const last = formatted.pop();
          sentence = `New team additions include ${formatted.join(", ")} and ${last}.`;
        }

        addSection(
          "Team Members",
          sentence
        );
      }

      if (newJobs.length) {
        const sorted = newJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const latest = sorted.slice(0, 2);

        const formatted = latest.map(j => `<b style="text-transform:capitalize;">${j.job_title}</b>`);

        let sentence = "";

        if (formatted.length === 1) {
          sentence = `A new position  is now open for ${formatted[0]}.`;
        } else if (formatted.length === 2) {
          sentence = `Open roles include ${formatted[0]} and ${formatted[1]}.`;
        } else {
          const last = formatted.pop();
          sentence = `Open roles include ${formatted.join(", ")} and ${last}.`;
        }

        const jobUrl = `https://app.coinpedia.org/company/${company.company_id}`;

        addSection(
          "Job Openings",
          `${sentence} <a href="${jobUrl}" style="color:#2563EB; text-decoration:none; font-weight:600;"> - Apply Now </a>`
        );
      }


      if (newEvents.length) {

        const sortedEvents = newEvents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
        const latest = sortedEvents.slice(0, 2);

        const formatted = latest.map(ev => {
          const event_title = capitalizeWords(ev.event_title)
          const dateStr = safeDateLong(ev.start_date, "upcoming date");

          return `“<b style="text-transform:capitalize;">${event_title}</b>” on <b>${dateStr}</b>`;
        });

        let summarySentence = "";

        if (formatted.length === 1) {
          summarySentence = `The company has announced a new event ${formatted[0]}.`;
        } else if (formatted.length === 2) {
          summarySentence = `Upcoming events include ${formatted[0]} and ${formatted[1]}.`;
        } else {
          const last = formatted.pop();
          summarySentence = `Upcoming events include ${formatted.join(", ")}, and ${last}.`;
        }

        // Use first event image for UI preview
        const firstEvent = latest[0];
        const eventUrl = `https://events.coinpedia.org/${firstEvent.event_url}`;
        const eventImage = firstEvent?.event_image
          ? `https://image.coinpedia.org/app_uploads/events/${firstEvent.event_image}`
          : `https://image.coinpedia.org/app_uploads/events/default.webp`;
        addSection(
          "Events",
          `
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <!-- LEFT TEXT -->
        <td style="vertical-align:top; width:80%; padding-right:10px;">
          ${summarySentence}
          <br>
          <a href="${eventUrl}" 
             style="color:#2563EB; text-decoration:none; font-weight:600;"> - Register Now </a>
        </td>

        <!-- RIGHT IMAGE -->
        <td style="width:30%; text-align:right;">
           <img src="${eventImage}" 
                alt="event" 
                style="width:95px; height:auto; border-radius:6px; border:1px solid #E5E7EB; object-fit:cover;">
        </td>
      </tr>
    </table>
    `
        );
      }

      if (newFunding.length || newRevenue.length) {

        const financeLines = [];

        // ---- FUNDING RECEIVED ----
        const receivedFunding = newFunding
          .filter(f => f.funds_raised_company_row_id === company_row_id)
          .sort((a, b) => new Date(b.verified_on) - new Date(a.verified_on))
          .slice(0, 2);

        if (receivedFunding.length) {
          const fundingText = receivedFunding.map(f => {
            const amount = f.amount ? safeMoney(f.amount) : "an undisclosed amount";
            const investor = capitalizeWords(f.investor_name) || "an investor";
            return `<b>${amount} from ${investor}</b>`;

          });

          let sentence = "";
          if (fundingText.length === 1) {
            sentence = `Recent funding round secured ${fundingText[0]}.`;
          } else if (fundingText.length === 2) {
            sentence = `Recent funding rounds secured ${fundingText[0]} and ${fundingText[1]}.`;
          } else {
            const last = fundingText.pop();
            sentence = `Recent funding rounds secured ${fundingText.join(", ")}, and ${last}.`;
          }

          financeLines.push(`
      <p style="margin:6px 0;font-size:12px;">
        <b>Funding</b><br>
        ${sentence}
      </p>
    `);
        }
        const outboundInvestments = newFunding
          .filter(f => f.investor_type === 2 && f.investor_row_id === company_row_id)
          .sort((a, b) => new Date(b.verified_on) - new Date(a.verified_on))
          .slice(0, 2);

        if (outboundInvestments.length) {
          const investmentText = outboundInvestments.map(f => {
            const amount = f.amount ? safeMoney(f.amount) : "an undisclosed amount";
            const target = capitalizeWords(f.target_company_name) || "a project";
            return `<b>${amount} in ${target}</b>`;

          });

          let sentence = "";
          if (investmentText.length === 1) {
            sentence = `The company invested ${investmentText[0]}.`;
          } else if (investmentText.length === 2) {
            sentence = `The company invested ${investmentText[0]} and ${investmentText[1]}.`;
          } else {
            const last = investmentText.pop();
            sentence = `The company invested ${investmentText.join(", ")}, and ${last}.`;
          }

          financeLines.push(`
      <p style="margin:6px 0;font-size:12px;">
        <b>Investments</b><br>
        ${sentence}
      </p>
    `);
        }
        const sortedRevenue = newRevenue
          .sort((a, b) => new Date(b.updated_date_n_time) - new Date(a.updated_date_n_time))
          .slice(0, 2);

        if (sortedRevenue.length) {
          const revenueText = sortedRevenue.map(r => {
            const amount = r.revenue ? safeMoney(r.revenue) : "updated financials";
            const year = r.year || "";
            const quarter = r.quarter ? `Q${r.quarter}` : "";
            return `<b>${amount} in ${year} ${quarter}</b>`;
          });


          let sentence = "";

          if (revenueText.length === 1) {
            sentence = `Revenue reports show ${revenueText[0]}.`;
          } else if (revenueText.length === 2) {
            sentence = `Revenue reports show ${revenueText[0]} and ${revenueText[1]}.`;
          } else {
            const last = revenueText.pop();
            sentence = `Revenue reports show ${revenueText.join(", ")}, and ${last}.`;
          }


          financeLines.push(`
      <p style="margin:6px 0;font-size:12px;">
        <b>Revenue</b><br>
        ${sentence}
      </p>
    `);
        }
        if (financeLines.length > 0) {
          addSection("Finance", financeLines.join(""));
        }
      }


      if (hasSection) {

        const timestamps = [
          ...newEvents,
          ...newEmployees,
          ...newJobs,
          ...newRevenue,
          ...newFunding,
          ...newProducts,
          ...newHoldings
        ]
          .map(x => new Date(x.updated_date_n_time || x.verified_on || x.date_n_time || x.createdAt || x.created_date_n_time))
          .filter(Boolean);

        const latestUpdate = timestamps.length ? new Date(Math.max(...timestamps)) : new Date();

        // Keep your original company card unchanged ⬇⬇⬇
        const companyTagline =
          company.describe_in_one_line ||
          "Stay on top of the latest updates from this company.";

        const companyLogo = company.company_logo
          ? `<img src="https://image.coinpedia.org/app_uploads/profile/${company.company_logo}" 
        alt="${company.company_name}" 
        style="width:40px;height:40px;border-radius:50%;object-fit:contain;margin-right:12px;">`
          : `<img src="	https://image.coinpedia.org/static/common/company_imgg.png" 
        alt="Default Logo" 
        style="width:40px;height:40px;border-radius:50%;object-fit:contain;margin-right:12px;">`;


        const messageHtml = `
            <table width="100%" cellpadding="0" cellspacing="0" 
              style="max-width:640px;margin:0 auto 24px auto;border:1px solid #E2EBF6;border-radius:12px;overflow:hidden; background:#FFFFFF;">
              
              <!-- HEADER -->
              <tr>
                <td style="padding:16px 20px 14px 20px;border-bottom:1px solid #E5E7EB; background:#F3F4FF; border-top-left-radius:12px;border-top-right-radius:12px;">
                  <div style="display:flex;align-items:center;">
                    ${companyLogo}
                    <div>
                      <div style="font-size:16px;font-weight:700;color:#171717;margin-bottom:2px;">
                        ${capitalizeWords(company.company_name)}
                      </div>
                      <div style="font-size:12px;color:#171717;line-height:1.4;">
                        ${companyTagline}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>

              <!-- CONTENT -->
              <tr>
                <td style="padding:16px 20px 12px 20px;background:#FFFFFF;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${sectionsHtml}
                  </table>
                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="padding:10px 20px 14px 20px;background:#FFFFFF;border-top:1px solid #E5E7EB;text-align:right; border-bottom-left-radius:12px;border-bottom-right-radius:12px;">
                  <a href="https://app.coinpedia.org/company/${company.company_id}"
                    style="font-size:13px;color:#0052CC;text-decoration:none;font-weight:600;">
                    View All Updates →
                  </a>
                </td>
              </tr>

            </table>
            `;

        companiesWithUpdates.push({
          name: company.company_name,
          html: messageHtml,
          updatedAt: latestUpdate,
          company_id: company.company_id
        });

      } else {
        console.log(`⏭️ No updates found for company: ${company.company_name}, skipping...`);
      }
    }
    companiesWithUpdates.sort((a, b) => b.updatedAt - a.updatedAt);

    const topThree = companiesWithUpdates.slice(0, 3);
    const remaining = companiesWithUpdates.slice(3);

    if (topThree.length > 0 && hasNewUpdates) {

      const user_name = capitalizeWords(user.full_name);

      const headerHtml = `
    <div style="max-width:640px;margin:0 auto 20px auto;">
        <p style="font-size:14px; font-weight:600; color:#171717; margin:12px 0 12px;">
            Hello ${user_name || "there"},
        </p>
        <p style="font-size:14px; color:#171717; margin:0 0 18px;">
            Keep track of what’s happening! Here are the newest updates from the companies on your watchlist.
        </p>
    </div>
  `;

      const companyPageUrl = `https://app.coinpedia.org/watchlist/`;

      // ---------------- FOOTER LOGIC ----------------
      let footerMessage = "";

      if (remaining.length > 0) {

        const footerCompanyLinks = remaining.map(c =>
          `<a href="https://app.coinpedia.org/company/${c.company_id}" 
     style="color:#0052CC; font-weight:600; text-decoration:none;">
     ${capitalizeWords(c.name)}
   </a>`
        );


        let namesText = "";

        if (footerCompanyLinks.length === 1) namesText = footerCompanyLinks[0];
        else if (footerCompanyLinks.length === 2) namesText = `${footerCompanyLinks[0]} and ${footerCompanyLinks[1]}`;
        else {
          const last = footerCompanyLinks.pop();
          namesText = `${footerCompanyLinks.join(", ")} and ${last}`;
        }

        footerMessage = `
      <p style="font-size:14px;color:#111827;margin-top:18px;margin-bottom:6px;">
         Your company watchlist just got updated! Check fianance,valuation,and social media changes from ${namesText}.
      </p>
    `;
      }

      const footerButton = `
    <div style="text-align:left ;margin-top:18px;">
        <a href="${companyPageUrl}" 
           style="display:inline-block; margin-top:12px; background:#0052cc; color:#fff; 
            padding:10px 30px; border-radius:8px; text-decoration:none; 
            font-weight:600; font-size:14px;">
    Explore Now
        </a>
        <div style="font-size:12px;color:#6B7280;margin-top:6px;">
            This link will direct you to Companies Watchlist page,where you can find essential details. 
        </div>
    </div>
  `;

      await sendCompanyWatchlistEmail(
        user.email_id,
        `Financial Insights On Your Watchlisted Companies - Don't Miss Out!`,
        headerHtml + topThree.map(c => c.html).join("") + footerMessage + footerButton
      );

      await company_watchlistM.updateMany(
        { _id: { $in: updatedIds } },
        { $set: { last_email_sent_on: new Date() } }
      );

      sentEmails++;
    }

    console.log(`Emails sent: ${sentEmails}`);
  };
}

export const crawlHeadings = async (url) => {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CoinpediaSEO/1.0)",
      },
      // axios throws on non-2xx by default; we need to allow 4xx
      validateStatus: (status) => status < 500,
    });
    if (response.status !== 200) return [];
    const $ = cheerio.load(response.data);

    const structure = [];
    $("h1, h2, h3").each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const text = $(el).text().trim();
      if (text) structure.push({ tag: tag.toUpperCase(), text });
    });

    return structure;

  } catch (err) {
    console.log("❌ Crawl Failed:", url, err.message);
    return [];
  }
};

/**
 * Helper function to determine updated_by and updated_by_row_id from token response
 * @param {Object} tokenData - Response from checkAllLoginToken, checkAdminLoginToken, or checkUserLoginToken
 * @returns {Object} - Contains updated_by and updated_by_row_id
 */
export function getUpdateTrackerFields(tokenData) {
  if (!tokenData || !tokenData.status) {
    return {
      updated_by: null,
      updated_by_row_id: null
    }
  }

  const message = tokenData.message

  // Handle checkAllLoginToken response (already normalized)
  if (message.user_type !== undefined) {
    const { user_type, user_row_id } = message

    // user_type == 1 is user
    // user_type == 2 is admin (if user_row_id is 0) or subadmin (if user_row_id > 0)
    let updated_by = null
    let updated_by_row_id = user_row_id

    if (user_type === 1) {
      updated_by = 'user'
    } else if (user_type === 2) {
      if (user_row_id === 0) {
        updated_by = 'admin'
        updated_by_row_id = 0
      } else {
        updated_by = 'subadmin'
      }
    }

    return {
      updated_by,
      updated_by_row_id
    }
  }

  // Handle checkAdminLoginToken response (full token object)
  if (message.admin_manager_type !== undefined) {
    const admin_manager_type = message.admin_manager_type
    const admin_row_id = message.admin_row_id

    // admin_manager_type == 1 is admin
    // admin_manager_type == 2 is subadmin
    if (admin_manager_type === 1) {
      return {
        updated_by: 'admin',
        updated_by_row_id: 0
      }
    } else if (admin_manager_type === 2) {
      return {
        updated_by: 'subadmin',
        updated_by_row_id: admin_row_id
      }
    }
  }

  // Handle checkUserLoginToken response (just user_row_id)
  if (typeof message === 'number') {
    return {
      updated_by: 'user',
      updated_by_row_id: message
    }
  }

  // Fallback for unknown structure
  return {
    updated_by: null,
    updated_by_row_id: null
  }
}


export const getManualCompanyList = async (company_ids) => {

  if (Array.isArray(company_ids)) {
    if (company_ids.length) {
      const get_query = await company_manual_retrievalsM.find({ _id: { $in: company_ids } }, { _id: 1, company_name: 1, company_email_id: 1, company_logo: 1 })
      if (get_query) {
        return get_query
      }
    }
  }
  return []
}

export const getCompanyList = async (company_ids) => {
  if (company_ids.length) {
    const get_query = await companyM.find({ _id: { $in: company_ids } }, { _id: 1, approval_status: 1, company_name: 1, company_id: 1, company_email_id: 1, company_logo: 1, describe_in_one_line: 1 })
    if (get_query) {
      return get_query
    }
  }
  return []
}


export const separateManualRegisterCompany = (anArray, columnNumber) => {
  const manual_array = []
  const register_array = []
  for (let run of anArray) {
    if (run.company_type === 1) {
      if (run[columnNumber]) {
        register_array.push(run[columnNumber])
      }
    }
    else if (run.company_type === 2) {
      if (run[columnNumber]) {
        manual_array.push(run[columnNumber])
      }
    }
  }
  return { manual_array, register_array }
}
