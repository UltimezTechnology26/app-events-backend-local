const cron = require('node-cron');
const companyM = require('../models/app/company/companyM');
const company_seo_detailsM = require('../models/app/company/company_seo_detailsM');
const event_seo_detailsM = require('../models/app/events/event_seo_detailsM');
const professionals_seo_detailsM = require('../models/app/professionals_seo_detailsM');
const professionalsM = require('../models/app/professionalsM');
const countryM = require('../models/app/static/countryM');
const fundingInvestmentM = require('../models/app/funding/fundingInvestmentM');
const professionals_work_experienceM = require('../models/app/professionals_work_experienceM');

/**
 * Cron Job: Backfill round_id for legacy funding investment rows
 * Runs every day at 2:30 AM (Asia/Kolkata)
 *
 * Purpose:
 *   Older rows in cln_funding_investment_lists were created before the
 *   round_id field existed, so each row represents a single (round + investor)
 *   pairing with no shared grouping key. This job sets round_id = _id for any
 *   row missing it, so each legacy row becomes its own standalone round-of-one —
 *   preserving exactly how it renders today, while making it safe for the
 *   $group-by-round_id queries used by the new multi-investor round feature.
 *
 * Safety:
 *   - Idempotent. Only touches rows where round_id does not exist or is null.
 *   - Safe to run daily indefinitely — after the first successful run, it
 *     should find 0 rows on every subsequent run unless an insert path
 *     somewhere forgets to set round_id, which this job will then catch.
 *   - Never overwrites a round_id that's already set, so it will never touch
 *     rows created by the new multi-investor insert flow.
 */
cron.schedule('18 11 * * *', async () => {
    console.log('Starting positions backfill cron job...');
    try {
        const rows = await professionals_work_experienceM.find({
            $or: [
                { positions: { $exists: false } },
                { positions: { $size: 0 } }
            ]
        });

        console.log(`Found ${rows.length} work experience row(s) missing positions array`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const row of rows) {
            // Skip docs that have no position data at all — nothing to backfill
            if (!row.position_row_id && !row.sub_position_row_id) {
                skippedCount++;
                continue;
            }

            await professionals_work_experienceM.updateOne(
                { _id: row._id },
                {
                    $set: {
                        positions: [
                            {
                                position_type: row.position_type || 1,
                                position_row_id: row.position_row_id || 0,
                                sub_position_row_id: row.sub_position_row_id || 0
                            }
                        ]
                    }
                }
            );
            updatedCount++;
        }

        console.log(`Successfully backfilled positions for ${updatedCount} row(s)`);
        if (skippedCount > 0) {
            console.log(`Skipped ${skippedCount} row(s) with no position data`);
        }
    } catch (error) {
        console.error('Error in positions backfill cron job:', error);
    }
}, {
    timezone: 'Asia/Kolkata'
});

cron.schedule('05 19 * * *', async () => {
    console.log('Starting round_id backfill cron job...');
    try {
        const rows = await fundingInvestmentM.find({
            $or: [
                { round_id: { $exists: false } },
                { round_id: null }
            ]
        });

        console.log(`Found ${rows.length} funding investment row(s) missing round_id`);

        let updatedCount = 0;
        for (const row of rows) {
            await fundingInvestmentM.updateOne(
                { _id: row._id },
                { $set: { round_id: row._id } }
            );
            updatedCount++;
        }

        console.log(`Successfully backfilled round_id for ${updatedCount} row(s)`);
    } catch (error) {
        console.error('Error in round_id backfill:', error);
    }
}, {
    timezone: 'Asia/Kolkata' // optional
});
/**
 * Cron Job 1: Transfer regulatory_bodies_ids from regularities_details array to regulatory_bodies_ids field
 * Runs every day at 2:00 AM
 */

/**
 * Cron Job 2: Restructure regularities_details array and remove regulatory_bodies_ids field
 * Runs every day at 3:00 AM (after the transfer job)
 */
cron.schedule('46 17 * * *', async () => {
    console.log('Starting regularities_details restructuring cron job...');

    try {
        sq
        const companies = await companyM.find({
            regularities_details: { $exists: true, $ne: [] }
        });

        console.log(`Found ${companies.length} companies with regulatory details`);

        let updatedCount = 0;

        for (const company of companies) {
            // Restructure regularities_details to only include regulatory_bodies_ids and _id
            const restructuredDetails = company.regularities_details
                .filter(detail => detail.regulatory_bodies_ids) // Filter out null/undefined
                .map(detail => ({
                    regulatory_bodies_ids: detail.regulatory_bodies_ids,
                    _id: detail._id
                }));

            await companyM.updateOne(
                { _id: company._id },
                {
                    $set: {
                        regularities_details: restructuredDetails,
                    },
                    $unset: { regulatory_bodies_ids: "" } // Remove the separate array field
                }
            );

            updatedCount++;
        }

        console.log(`Successfully restructured ${updatedCount} companies`);

    } catch (error) {
        console.error('Error in restructuring:', error);
    }
}, {
    timezone: 'Asia/Kolkata' // optional
});

/**
 * Cron Job 3: Set default SEO values for Company SEO Details
 * Sets robots_follow to "follow", robots_index to "index", twitter_creator to ""
 * Runs every day at 4:00 AM
 */
cron.schedule("16 16 * * *", async () => {
    console.log("Starting Company SEO default fields cron...");

    try {
        const result = await company_seo_detailsM.updateMany(
            {
                $or: [
                    { robots_follow: { $exists: false } },
                    { robots_follow: null },
                    { robots_follow: "" },

                    { robots_index: { $exists: false } },
                    { robots_index: null },
                    { robots_index: "" },

                    { twitter_creator: { $exists: false } },
                    { twitter_creator: null }
                ]
            },
            {
                $set: {
                    robots_follow: "follow",
                    robots_index: "index",
                    twitter_creator: ""
                }
            }
        );

        console.log(
            `Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`
        );

    } catch (error) {
        console.error("Company SEO cron error:", error);
    }
}, {
    timezone: "Asia/Kolkata"
});

/**
 * Cron Job 4: Set default SEO values for Events SEO Details
 * Sets robots_follow to "follow", robots_index to "index", twitter_creator to ""
 * Runs every day at 4:30 AM
 */
cron.schedule("25 16 * * *", async () => {
    console.log("Starting Professionals SEO default fields cron...");

    try {
        const result = await professionals_seo_detailsM.updateMany(
            {
                $or: [
                    { robots_follow: { $exists: false } },
                    { robots_follow: null },
                    { robots_follow: "" },

                    { robots_index: { $exists: false } },
                    { robots_index: null },
                    { robots_index: "" },

                    { twitter_creator: { $exists: false } },
                    { twitter_creator: null }
                ]
            },
            {
                $set: {
                    robots_follow: "follow",
                    robots_index: "index",
                    twitter_creator: ""
                }
            }
        );

        console.log(
            `Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`
        );

    } catch (error) {
        console.error("Professionals SEO cron error:", error);
    }
}, {
    timezone: "Asia/Kolkata"
});
cron.schedule("26 16 * * *", async () => {
    console.log("Starting Events SEO default fields cron...");

    try {
        const result = await event_seo_detailsM.updateMany(
            {
                $or: [
                    { robots_follow: { $exists: false } },
                    { robots_follow: null },
                    { robots_follow: "" },

                    { robots_index: { $exists: false } },
                    { robots_index: null },
                    { robots_index: "" },

                    { twitter_creator: { $exists: false } },
                    { twitter_creator: null }
                ]
            },
            {
                $set: {
                    robots_follow: "follow",
                    robots_index: "index",
                    twitter_creator: ""
                }
            }
        );

        console.log(
            `Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`
        );

    } catch (error) {
        console.error("Events SEO cron error:", error);
    }
}, {
    timezone: "Asia/Kolkata"
});

/**
 * Cron Job 6: Add location_country to professionals missing it
 * Sets location_country from country short name (sortname) for professionals who have location and country_id but missing location_country
 * Runs every day at 5:30 PM
 */

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

cron.schedule("32 17 * * *", async () => {
    console.log("Starting professionals location_country correction using Google Maps API...");

    try {
        // Fetch all professionals having location
        // We must also fix wrong existing values like IN instead of US
        const professionalsToUpdate = await professionalsM.find({
            location: {
                $exists: true,
                $nin: [null, ""]
            },
            $or: [
                { location_country: { $exists: false } },
                { location_country: null },
                { location_country: "" }
            ]

        }).select({
            _id: 1,
            location: 1,
            location_country: 1,
            country_name: 1
        });

        console.log(
            `Found ${professionalsToUpdate.length} professionals for validation`
        );

        if (!professionalsToUpdate.length) {
            console.log("No professionals found");
            return;
        }

        let updatedCount = 0;
        let skippedCount = 0;
        let invalidLocationCount = 0;
        let errorCount = 0;

        for (const professional of professionalsToUpdate) {
            try {
                const location = professional.location?.trim();

                // Skip short / manually typed invalid locations
                // Example: "shrinagar belgaum"
                if (
                    !location ||
                    location.length < 12 ||
                    !location.includes(",")
                ) {
                    invalidLocationCount++;

                    console.log(
                        `Skipped ${professional._id} → invalid/manual location: ${location}`
                    );
                    continue;
                }

                console.log(`Processing ${professional._id}`);
                console.log(`Location: ${location}`);
                console.log(`Current location_country: ${professional.location_country || "EMPTY"}`);

                const response = await axios.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    {
                        params: {
                            address: location,
                            key: GOOGLE_MAPS_API_KEY
                        }
                    }
                );

                const results = response.data.results;

                // Google could not resolve location
                if (
                    !results ||
                    !results.length ||
                    response.data.status !== "OK"
                ) {
                    invalidLocationCount++;

                    console.log(
                        `Skipped ${professional._id} → Google could not resolve location`
                    );
                    continue;
                }

                let countryCode = null;

                for (const component of results[0].address_components) {
                    if (component.types.includes("country")) {
                        countryCode = component.short_name; // US / IN / UK
                        break;
                    }
                }

                if (!countryCode) {
                    invalidLocationCount++;

                    console.log(
                        `Skipped ${professional._id} → country not found from Google`
                    );
                    continue;
                }

                // Skip only if correct value already exists
                if (
                    professional.location_country &&
                    professional.location_country.trim().toUpperCase() === countryCode.toUpperCase()
                ) {
                    skippedCount++;

                    console.log(
                        `Skipped ${professional._id} → already correct (${countryCode})`
                    );
                    continue;
                }

                // Update only when missing OR incorrect
                await professionalsM.updateOne(
                    {
                        _id: professional._id
                    },
                    {
                        $set: {
                            location_country: countryCode
                        }
                    }
                );

                updatedCount++;

                console.log(
                    `Updated ${professional._id} → ${professional.location_country || "EMPTY"} → ${countryCode}`
                );

                // Avoid Google API rate limits
                await new Promise(resolve =>
                    setTimeout(resolve, 200)
                );

            } catch (error) {
                errorCount++;

                console.log(
                    `Error for ${professional._id}:`,
                    error.message
                );
            }
        }

        console.log("Cron Completed");
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped Correct Existing: ${skippedCount}`);
        console.log(`Skipped Invalid Location: ${invalidLocationCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (error) {
        console.log(
            "Cron Job Error:",
            error.message
        );
    }
}, {
    timezone: "Asia/Kolkata"
});



