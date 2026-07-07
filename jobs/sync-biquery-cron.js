// const cron = require('node-cron');
// const eventM = require('../models/app/events/eventM');
// const companyM = require('../models/app/company/companyM');
// const professionalsM = require('../models/app/professionalsM');
// const companyOtherDetailsM = require('../models/app/company/company_seo_detailsM');
// import logger from '../config/logger';
// const usersOtherDetailsM = require('../models/app/professionals_seo_detailsM');
// const academyCoursesM = require('../models/main/academy/coursesM');
// const collaborationUsersRequestsM = require('../models/app/events/collaboration_users_requestsM');
// const couponM = require('../models/app/events/couponM');
// const deletedEventsM = require('../models/app/events/deleted_eventsM');
// const eventAttendeesM = require('../models/app/events/event_attendeesM');
// const { events, companies, users, companyOtherDetails, usersOtherDetails, academyCourses, eventAttendees, eventCollaborationUsersRequests, eventCoupons, deletedEvents, eventsAttendees } = require('../config/bigquery-tables');

// // BigQuery Sync Cron - Daily sync of MongoDB cln_events to BigQuery
// cron.schedule('5 14 * * *', async () => {
//     console.log(' BigQuery sync started at:', new Date());
//     logger.info('Starting BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!events.isClientReady()) {
//             console.error('❌ BigQuery client not initialized. Skipping sync.');
//             logger.error('BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating BigQuery table...');
//         await events.truncateTable();
//         console.log('✅ BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch events from MongoDB in batches
//             const eventsData = await eventM.find({ active_status: 1, approval_status: 1 })
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (eventsData.length === 0) {
//                 hasMoreData = false;
//                 break;
//             }

//             // Convert MongoDB documents to BigQuery format
//             const bigQueryRows = eventsData.map(event => {
//                 const row = { ...event };

//                 // Convert ObjectId to string if needed
//                 if (row._id && typeof row._id === 'object') {
//                     row._id = row._id.toString();
//                 }

//                 // Handle date fields conversion
//                 if (row.start_date) {
//                     row.start_date = new Date(row.start_date);
//                 }
//                 if (row.end_date) {
//                     row.end_date = new Date(row.end_date);
//                 }
//                 if (row.date_n_time) {
//                     row.date_n_time = new Date(row.date_n_time);
//                 }
//                 if (row.rejected_date_n_time) {
//                     row.rejected_date_n_time = new Date(row.rejected_date_n_time);
//                 }
//                 if (row.disabled_date_n_time) {
//                     row.disabled_date_n_time = new Date(row.disabled_date_n_time);
//                 }

//                 // Handle event_tags - ensure it's JSON serializable
//                 if (row.event_tags && typeof row.event_tags === 'object') {
//                     row.event_tags = JSON.stringify(row.event_tags);
//                 }

//                 // Handle header_structure - ensure it's JSON serializable
//                 if (row.header_structure && Array.isArray(row.header_structure)) {
//                     row.header_structure = JSON.stringify(row.header_structure);
//                 }

//                 return row;
//             });

//             // Insert batch into BigQuery
//             if (bigQueryRows.length > 0) {
//                 try {
//                     const result = await events.insertRows(bigQueryRows);
//                     totalInserted += result.length;
//                     totalProcessed += result.length;

//                     console.log(`📊 Batch processed: ${result.length} inserted`);
//                 } catch (insertError) {
//                     console.error('❌ Batch failed:', insertError.message);
//                     // Continue with next batch instead of failing completely
//                 }
//             }

//             skip += BATCH_SIZE;

//             // Small delay between batches to avoid overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }

//         // Get final row count in BigQuery
//         const finalRowCount = await events.getRowCount();

//         console.log(`🎉 BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`BigQuery sync completed successfully! Total events inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ BigQuery sync error:', error.message);
//         logger.error('Error in BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await events.getRowCount();
//             console.log(`📊 Current rows in BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Companies BigQuery Sync Cron - Daily sync of MongoDB cln_company_lists to BigQuery
// cron.schedule('59 16 * * *', async () => {
//     console.log('🔄 Companies BigQuery sync started at:', new Date());
//     logger.info('Starting Companies BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!companies.isClientReady()) {
//             console.error('❌ Companies BigQuery client not initialized. Skipping sync.');
//             logger.error('Companies BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Companies BigQuery table...');
//         await companies.truncateTable();
//         console.log('✅ Companies BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch companies from MongoDB in batches
//             const companiesData = await companyM.find({ active_status: 1, approval_status: 1 })
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (companiesData.length === 0) {
//                 hasMoreData = false;
//                 break;
//             }

//             // Convert MongoDB documents to BigQuery format
//             const bigQueryRows = companiesData.map(company => {
//                 const row = { ...company };

//                 // Convert ObjectId to string if needed
//                 if (row._id && typeof row._id === 'object') {
//                     row._id = row._id.toString();
//                 }

//                 // Handle date fields conversion
//                 if (row.established_in) {
//                     row.established_in = new Date(row.established_in);
//                 }
//                 if (row.rejected_date_n_time) {
//                     row.rejected_date_n_time = new Date(row.rejected_date_n_time);
//                 }
//                 if (row.disabled_date_n_time) {
//                     row.disabled_date_n_time = new Date(row.disabled_date_n_time);
//                 }
//                 if (row.updated_date_n_time) {
//                     row.updated_date_n_time = new Date(row.updated_date_n_time);
//                 }
//                 if (row.created_on) {
//                     row.created_on = new Date(row.created_on);
//                 }

//                 // Handle business_model_id - ensure it's JSON serializable
//                 if (row.business_model_id && typeof row.business_model_id === 'object') {
//                     row.business_model_id = JSON.stringify(row.business_model_id);
//                 }

//                 // Handle regularities_details - ensure it's JSON serializable
//                 if (row.regularities_details && Array.isArray(row.regularities_details)) {
//                     row.regularities_details = JSON.stringify(row.regularities_details);
//                 }

//                 return row;
//             });

//             // Insert batch into BigQuery
//             if (bigQueryRows.length > 0) {
//                 try {
//                     const result = await companies.insertRows(bigQueryRows);
//                     totalInserted += result.length;
//                     totalProcessed += result.length;

//                     console.log(`📊 Companies Batch processed: ${result.length} inserted`);
//                 } catch (insertError) {
//                     console.error('❌ Companies Batch failed:', insertError.message);
//                     // Continue with next batch instead of failing completely
//                 }
//             }

//             skip += BATCH_SIZE;

//             // Small delay between batches to avoid overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }

//         // Get final row count in BigQuery
//         const finalRowCount = await companies.getRowCount();

//         console.log(`🎉 Companies BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Companies BigQuery sync completed successfully! Total companies inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Companies BigQuery sync error:', error.message);
//         logger.error('Error in Companies BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await companies.getRowCount();
//             console.log(`📊 Current rows in Companies BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Companies row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Users BigQuery Sync Cron - Daily sync of MongoDB cln_professionals to BigQuery
// cron.schedule('4 19 * * *', async () => {
//     console.log('🔄 Users BigQuery sync started at:', new Date());
//     logger.info('Starting Users BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!users.isClientReady()) {
//             console.error('❌ Users BigQuery client not initialized. Skipping sync.');
//             logger.error('Users BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Users BigQuery table...');
//         await users.truncateTable();
//         console.log('✅ Users BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch users from MongoDB in batches
//             const usersData = await professionalsM.find({ approval_status: 1, login_status: 1 })
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (usersData.length === 0) {
//                 hasMoreData = false;
//                 break;
//             }

//             // Convert MongoDB documents to BigQuery format
//             const bigQueryRows = usersData.map(user => {
//                 const row = { ...user };

//                 // Convert ObjectId to string if needed
//                 if (row._id && typeof row._id === 'object') {
//                     row._id = row._id.toString();
//                 }

//                 // Handle date fields conversion
//                 if (row.updated_date_n_time) {
//                     row.updated_date_n_time = new Date(row.updated_date_n_time);
//                 }
//                 if (row.rejected_date_n_time) {
//                     row.rejected_date_n_time = new Date(row.rejected_date_n_time);
//                 }
//                 if (row.deleted_date_n_time) {
//                     row.deleted_date_n_time = new Date(row.deleted_date_n_time);
//                 }
//                 if (row.date_n_time) {
//                     row.date_n_time = new Date(row.date_n_time);
//                 }

//                 // Handle designation_id - ensure it's JSON serializable
//                 if (row.designation_id && typeof row.designation_id === 'object') {
//                     row.designation_id = JSON.stringify(row.designation_id);
//                 }

//                 return row;
//             });

//             // Insert batch into BigQuery
//             if (bigQueryRows.length > 0) {
//                 try {
//                     const result = await users.insertRows(bigQueryRows);
//                     totalInserted += result.length;
//                     totalProcessed += result.length;

//                     console.log(`📊 Users Batch processed: ${result.length} inserted`);
//                 } catch (insertError) {
//                     console.error('❌ Users Batch failed:', insertError.message);
//                     // Continue with next batch instead of failing completely
//                 }
//             }

//             skip += BATCH_SIZE;

//             // Small delay between batches to avoid overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }

//         // Get final row count in BigQuery
//         const finalRowCount = await users.getRowCount();

//         console.log(`🎉 Users BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Users BigQuery sync completed successfully! Total users inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Users BigQuery sync error:', error.message);
//         logger.error('Error in Users BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await users.getRowCount();
//             console.log(`📊 Current rows in Users BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Users row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Company Other Details BigQuery Sync Cron - Daily sync of MongoDB cln_company_seo_details to BigQuery
// cron.schedule('00 13 * * *', async () => {
//     console.log('🔄 Company Other Details BigQuery sync started at:', new Date());
//     logger.info('Starting Company Other Details BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!companyOtherDetails.isClientReady()) {
//             console.error('❌ Company Other Details BigQuery client not initialized. Skipping sync.');
//             logger.error('Company Other Details BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Company Other Details BigQuery table...');
//         await companyOtherDetails.truncateTable();
//         console.log('✅ Company Other Details BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch company other details from MongoDB in batches
//             const companyOtherDetailsData = await companyOtherDetailsM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (companyOtherDetailsData.length === 0) {
//                 hasMoreData = false;
//                 break;
//             }

//             // Convert MongoDB documents to BigQuery format
//             const bigQueryRows = companyOtherDetailsData.map(detail => {
//                 const row = { ...detail };

//                 // Convert ObjectId to string if needed
//                 if (row._id && typeof row._id === 'object') {
//                     row._id = row._id.toString();
//                 }

//                 // Handle other_social_links - ensure it's JSON serializable
//                 if (row.other_social_links && typeof row.other_social_links === 'object') {
//                     row.other_social_links = JSON.stringify(row.other_social_links);
//                 }

//                 // Handle header_structure - ensure it's JSON serializable
//                 if (row.header_structure && Array.isArray(row.header_structure)) {
//                     row.header_structure = JSON.stringify(row.header_structure);
//                 }

//                 return row;
//             });

//             // Insert batch into BigQuery
//             if (bigQueryRows.length > 0) {
//                 try {
//                     const result = await companyOtherDetails.insertRows(bigQueryRows);
//                     totalInserted += result.length;
//                     totalProcessed += result.length;

//                     console.log(`📊 Company Other Details Batch processed: ${result.length} inserted`);
//                 } catch (insertError) {
//                     console.error('❌ Company Other Details Batch failed:', insertError.message);
//                     // Continue with next batch instead of failing completely
//                 }
//             }

//             skip += BATCH_SIZE;

//             // Small delay between batches to avoid overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }

//         // Get final row count in BigQuery
//         const finalRowCount = await companyOtherDetails.getRowCount();

//         console.log(`🎉 Company Other Details BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Company Other Details BigQuery sync completed successfully! Total details inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Company Other Details BigQuery sync error:', error.message);
//         logger.error('Error in Company Other Details BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await companyOtherDetails.getRowCount();
//             console.log(`📊 Current rows in Company Other Details BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Company Other Details row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Users Other Details BigQuery Sync Cron - Daily sync of MongoDB cln_professionals_seo_details to BigQuery
// cron.schedule('15 13 * * *', async () => {
//     console.log('🔄 Users Other Details BigQuery sync started at:', new Date());
//     logger.info('Starting Users Other Details BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!usersOtherDetails.isClientReady()) {
//             console.error('❌ Users Other Details BigQuery client not initialized. Skipping sync.');
//             logger.error('Users Other Details BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Users Other Details BigQuery table...');
//         await usersOtherDetails.truncateTable();
//         console.log('✅ Users Other Details BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch users other details from MongoDB in batches
//             const usersOtherDetailsData = await usersOtherDetailsM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (usersOtherDetailsData.length === 0) {
//                 hasMoreData = false;
//                 break;
//             }

//             // Convert MongoDB documents to BigQuery format
//             const bigQueryRows = usersOtherDetailsData.map(detail => {
//                 const row = { ...detail };

//                 // Convert ObjectId to string if needed
//                 if (row._id && typeof row._id === 'object') {
//                     row._id = row._id.toString();
//                 }

//                 // Handle looking_for_id - ensure it's JSON serializable
//                 if (row.looking_for_id && typeof row.looking_for_id === 'object') {
//                     row.looking_for_id = JSON.stringify(row.looking_for_id);
//                 }

//                 // Handle other_social_links - ensure it's JSON serializable
//                 if (row.other_social_links && typeof row.other_social_links === 'object') {
//                     row.other_social_links = JSON.stringify(row.other_social_links);
//                 }

//                 // Handle header_structure - ensure it's JSON serializable
//                 if (row.header_structure && Array.isArray(row.header_structure)) {
//                     row.header_structure = JSON.stringify(row.header_structure);
//                 }

//                 return row;
//             });

//             // Insert batch into BigQuery
//             if (bigQueryRows.length > 0) {
//                 try {
//                     const result = await usersOtherDetails.insertRows(bigQueryRows);
//                     totalInserted += result.length;
//                     totalProcessed += result.length;

//                     console.log(`📊 Users Other Details Batch processed: ${result.length} inserted`);
//                 } catch (insertError) {
//                     console.error('❌ Users Other Details Batch failed:', insertError.message);
//                     // Continue with next batch instead of failing completely
//                 }
//             }

//             skip += BATCH_SIZE;

//             // Small delay between batches to avoid overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }

//         // Get final row count in BigQuery
//         const finalRowCount = await usersOtherDetails.getRowCount();

//         console.log(`🎉 Users Other Details BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Users Other Details BigQuery sync completed successfully! Total details inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Users Other Details BigQuery sync error:', error.message);
//         logger.error('Error in Users Other Details BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await usersOtherDetails.getRowCount();
//             console.log(`📊 Current rows in Users Other Details BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Users Other Details row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Academy Courses BigQuery Sync Cron - Daily sync of MongoDB cln_academy_courses to BigQuery
// cron.schedule('30 13 * * *', async () => {
//     console.log('🔄 Academy Courses BigQuery sync started at:', new Date());
//     logger.info('Starting Academy Courses BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!academyCourses.isClientReady()) {
//             console.error('❌ Academy Courses BigQuery client not initialized. Skipping sync.');
//             logger.error('Academy Courses BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Academy Courses BigQuery table...');
//         await academyCourses.truncateTable();
//         console.log('✅ Academy Courses BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch academy courses from MongoDB in batches
//             const academyCoursesData = await academyCoursesM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (academyCoursesData.length === 0) {
//                 hasMoreData = false;
//                 break;
//             }

//             // Convert MongoDB documents to BigQuery format
//             const bigQueryRows = academyCoursesData.map(course => {
//                 const row = { ...course };

//                 // Convert ObjectId to string if needed
//                 if (row._id && typeof row._id === 'object') {
//                     row._id = row._id.toString();
//                 }

//                 // Handle date fields conversion
//                 if (row.date_n_time) {
//                     row.date_n_time = new Date(row.date_n_time);
//                 }

//                 return row;
//             });

//             // Insert batch into BigQuery
//             if (bigQueryRows.length > 0) {
//                 try {
//                     const result = await academyCourses.insertRows(bigQueryRows);
//                     totalInserted += result.length;
//                     totalProcessed += result.length;

//                     console.log(`📊 Academy Courses Batch processed: ${result.length} inserted`);
//                 } catch (insertError) {
//                     console.error('❌ Academy Courses Batch failed:', insertError.message);
//                     // Continue with next batch instead of failing completely
//                 }
//             }

//             skip += BATCH_SIZE;

//             // Small delay between batches to avoid overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }

//         // Get final row count in BigQuery
//         const finalRowCount = await academyCourses.getRowCount();

//         console.log(`🎉 Academy Courses BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Academy Courses BigQuery sync completed successfully! Total courses inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Academy Courses BigQuery sync error:', error.message);
//         logger.error('Error in Academy Courses BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await academyCourses.getRowCount();
//             console.log(`📊 Current rows in Academy Courses BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Academy Courses row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Event Attendees BigQuery Sync Cron - Daily sync of MongoDB cln_event_attendees to BigQuery


// // Event Collaboration Users Requests BigQuery Sync Cron - Daily sync of MongoDB cln_events_collaboration_professionals_requests to BigQuery
// cron.schedule('01 12 * * *', async () => {
//     console.log('🔄 Event Collaboration Users Requests BigQuery sync started at:', new Date());
//     logger.info('Starting Event Collaboration Users Requests BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!eventCollaborationUsersRequests.isClientReady()) {
//             console.error('❌ Event Collaboration Users Requests BigQuery client not initialized. Skipping sync.');
//             logger.error('Event Collaboration Users Requests BigQuery client not initialized. Skipping sync.');
//             return;
//         }

//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Event Collaboration Users Requests BigQuery table...');
//         await eventCollaborationUsersRequests.truncateTable();
//         console.log('✅ Event Collaboration Users Requests BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch collaboration users requests from MongoDB in batches
//             const collaborationUsersRequestsData = await collaborationUsersRequestsM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (collaborationUsersRequestsData.length === 0) {
//                 hasMoreData = false;
//                 console.log('📋 No more collaboration users requests data to process');
//                 break;
//             }

//             console.log(`📊 Processing Event Collaboration Users Requests batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${collaborationUsersRequestsData.length} records`);

//             try {
//                 const result = await eventCollaborationUsersRequests.insertRows(collaborationUsersRequestsData);

//                 if (result && result.insertErrors && result.insertErrors.length > 0) {
//                     const failedCount = result.insertErrors.length;
//                     const successCount = collaborationUsersRequestsData.length - failedCount;

//                     console.log(`⚠️ Event Collaboration Users Requests Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${failedCount} failed, ${successCount} succeeded`);

//                     // Show only first 3 errors for debugging
//                     result.insertErrors.slice(0, 3).forEach((error, index) => {
//                         console.error(`❌ Error ${index + 1}: ${error.message}`);
//                     });

//                     if (failedCount > 3) {
//                         console.log(`... and ${failedCount - 3} more errors`);
//                     }

//                     totalInserted += successCount;
//                 } else {
//                     console.log(`✅ Event Collaboration Users Requests Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${collaborationUsersRequestsData.length} inserted successfully`);
//                     totalInserted += collaborationUsersRequestsData.length;
//                 }

//                 totalProcessed += collaborationUsersRequestsData.length;

//             } catch (batchError) {
//                 console.error(`❌ Event Collaboration Users Requests Batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError.message);
//                 logger.error(`Event Collaboration Users Requests batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError);
//             }

//             skip += BATCH_SIZE;

//             // Add small delay to prevent overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 100));
//         }

//         const finalRowCount = await eventCollaborationUsersRequests.getRowCount();

//         console.log(`🎉 Event Collaboration Users Requests BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Event Collaboration Users Requests BigQuery sync completed successfully! Total requests inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Event Collaboration Users Requests BigQuery sync error:', error.message);
//         logger.error('Error in Event Collaboration Users Requests BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await eventCollaborationUsersRequests.getRowCount();
//             console.log(`📊 Current rows in Event Collaboration Users Requests BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Event Collaboration Users Requests row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Event Coupons BigQuery Sync Cron - Daily sync of MongoDB cln_event_coupons to BigQuery
// cron.schedule('3 12 * * *', async () => {
//     console.log('🔄 Event Coupons BigQuery sync started at:', new Date());
//     logger.info('Starting Event Coupons BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!eventCoupons.isClientReady()) {
//             console.error('❌ Event Coupons BigQuery client not initialized. Skipping sync.');
//             logger.error('Event Coupons BigQuery client not initialized. Skipping sync.');
//             return;
//         }


//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Event Coupons BigQuery table...');
//         await eventCoupons.truncateTable();
//         console.log('✅ Event Coupons BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch event coupons from MongoDB in batches
//             const eventCouponsData = await couponM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (eventCouponsData.length === 0) {
//                 hasMoreData = false;
//                 console.log('📋 No more event coupons data to process');
//                 break;
//             }

//             console.log(`📊 Processing Event Coupons batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${eventCouponsData.length} records`);

//             try {
//                 const result = await eventCoupons.insertRows(eventCouponsData);

//                 if (result && result.insertErrors && result.insertErrors.length > 0) {
//                     const failedCount = result.insertErrors.length;
//                     const successCount = eventCouponsData.length - failedCount;

//                     console.log(`⚠️ Event Coupons Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${failedCount} failed, ${successCount} succeeded`);

//                     // Show only first 3 errors for debugging
//                     result.insertErrors.slice(0, 3).forEach((error, index) => {
//                         console.error(`❌ Error ${index + 1}: ${error.message}`);
//                     });

//                     if (failedCount > 3) {
//                         console.log(`... and ${failedCount - 3} more errors`);
//                     }

//                     totalInserted += successCount;
//                 } else {
//                     console.log(`✅ Event Coupons Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${eventCouponsData.length} inserted successfully`);
//                     totalInserted += eventCouponsData.length;
//                 }

//                 totalProcessed += eventCouponsData.length;

//             } catch (batchError) {
//                 console.error(`❌ Event Coupons Batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError.message);
//                 logger.error(`Event Coupons batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError);
//             }

//             skip += BATCH_SIZE;

//             // Add small delay to prevent overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 100));
//         }

//         const finalRowCount = await eventCoupons.getRowCount();

//         console.log(`🎉 Event Coupons BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Event Coupons BigQuery sync completed successfully! Total coupons inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Event Coupons BigQuery sync error:', error.message);
//         logger.error('Error in Event Coupons BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await eventCoupons.getRowCount();
//             console.log(`📊 Current rows in Event Coupons BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Event Coupons row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Deleted Events BigQuery Sync Cron - Daily sync of MongoDB cln_deleted_events to BigQuery
// cron.schedule('50 19 * * *', async () => {
//     console.log('🔄 Deleted Events BigQuery sync started at:', new Date());
//     logger.info('Starting Deleted Events BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!deletedEvents.isClientReady()) {
//             console.error('❌ Deleted Events BigQuery client not initialized. Skipping sync.');
//             logger.error('Deleted Events BigQuery client not initialized. Skipping sync.');
//             return;
//         }


//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Deleted Events BigQuery table...');
//         await deletedEvents.truncateTable();
//         console.log('✅ Deleted Events BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch deleted events from MongoDB in batches
//             const deletedEventsData = await deletedEventsM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (deletedEventsData.length === 0) {
//                 hasMoreData = false;
//                 console.log('📋 No more deleted events data to process');
//                 break;
//             }

//             console.log(`📊 Processing Deleted Events batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${deletedEventsData.length} records`);

//             try {
//                 const result = await deletedEvents.insertRows(deletedEventsData);

//                 if (result && result.insertErrors && result.insertErrors.length > 0) {
//                     const failedCount = result.insertErrors.length;
//                     const successCount = deletedEventsData.length - failedCount;

//                     console.log(`⚠️ Deleted Events Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${failedCount} failed, ${successCount} succeeded`);

//                     // Show only first 3 errors for debugging
//                     result.insertErrors.slice(0, 3).forEach((error, index) => {
//                         console.error(`❌ Error ${index + 1}: ${error.message}`);
//                     });

//                     if (failedCount > 3) {
//                         console.log(`... and ${failedCount - 3} more errors`);
//                     }

//                     totalInserted += successCount;
//                 } else {
//                     console.log(`✅ Deleted Events Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${deletedEventsData.length} inserted successfully`);
//                     totalInserted += deletedEventsData.length;
//                 }

//                 totalProcessed += deletedEventsData.length;

//             } catch (batchError) {
//                 console.error(`❌ Deleted Events Batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError.message);
//                 logger.error(`Deleted Events batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError);
//             }

//             skip += BATCH_SIZE;

//             // Add small delay to prevent overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 100));
//         }

//         const finalRowCount = await deletedEvents.getRowCount();

//         console.log(`🎉 Deleted Events BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Deleted Events BigQuery sync completed successfully! Total events inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Deleted Events BigQuery sync error:', error.message);
//         logger.error('Error in Deleted Events BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await deletedEvents.getRowCount();
//             console.log(`📊 Current rows in Deleted Events BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Deleted Events row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });

// // Events Attendees BigQuery Sync Cron - Daily sync of MongoDB cln_events_attendees to BigQuery
// cron.schedule('55 19 * * *', async () => {
//     console.log('🔄 Events Attendees BigQuery sync started at:', new Date());
//     logger.info('Starting Events Attendees BigQuery sync cron job at:', new Date());

//     try {
//         // Check if BigQuery client is ready
//         if (!eventsAttendees.isClientReady()) {
//             console.error('❌ Events Attendees BigQuery client not initialized. Skipping sync.');
//             logger.error('Events Attendees BigQuery client not initialized. Skipping sync.');
//             return;
//         }


//         // Delete all existing data before syncing
//         console.log('🗑️ Truncating Events Attendees BigQuery table...');
//         await eventsAttendees.truncateTable();
//         console.log('✅ Events Attendees BigQuery table truncated');

//         const BATCH_SIZE = 500;
//         let skip = 0;
//         let totalInserted = 0;
//         let totalProcessed = 0;
//         let hasMoreData = true;

//         while (hasMoreData) {
//             // Fetch events attendees from MongoDB in batches
//             const eventsAttendeesData = await eventAttendeesM.find({})
//                 .skip(skip)
//                 .limit(BATCH_SIZE)
//                 .lean();

//             if (eventsAttendeesData.length === 0) {
//                 hasMoreData = false;
//                 console.log('📋 No more events attendees data to process');
//                 break;
//             }

//             console.log(`📊 Processing Events Attendees batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${eventsAttendeesData.length} records`);

//             try {
//                 const result = await eventsAttendees.insertRows(eventsAttendeesData);

//                 if (result && result.insertErrors && result.insertErrors.length > 0) {
//                     const failedCount = result.insertErrors.length;
//                     const successCount = eventsAttendeesData.length - failedCount;

//                     console.log(`⚠️ Events Attendees Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${failedCount} failed, ${successCount} succeeded`);

//                     // Show only first 3 errors for debugging
//                     result.insertErrors.slice(0, 3).forEach((error, index) => {
//                         console.error(`❌ Error ${index + 1}: ${error.message}`);
//                     });

//                     if (failedCount > 3) {
//                         console.log(`... and ${failedCount - 3} more errors`);
//                     }

//                     totalInserted += successCount;
//                 } else {
//                     console.log(`✅ Events Attendees Batch ${Math.floor(skip / BATCH_SIZE) + 1}: ${eventsAttendeesData.length} inserted successfully`);
//                     totalInserted += eventsAttendeesData.length;
//                 }

//                 totalProcessed += eventsAttendeesData.length;

//             } catch (batchError) {
//                 console.error(`❌ Events Attendees Batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError.message);
//                 logger.error(`Events Attendees batch ${Math.floor(skip / BATCH_SIZE) + 1} failed:`, batchError);
//             }

//             skip += BATCH_SIZE;

//             // Add small delay to prevent overwhelming BigQuery
//             await new Promise(resolve => setTimeout(resolve, 100));
//         }

//         const finalRowCount = await eventsAttendees.getRowCount();

//         console.log(`🎉 Events Attendees BigQuery sync completed! Inserted: ${totalInserted}, Total in BigQuery: ${finalRowCount}`);
//         logger.info(`Events Attendees BigQuery sync completed successfully! Total attendees inserted: ${totalInserted}, Total rows in BigQuery: ${finalRowCount}`);

//     } catch (error) {
//         console.error('❌ Events Attendees BigQuery sync error:', error.message);
//         logger.error('Error in Events Attendees BigQuery sync cron job:', error);

//         try {
//             const currentRowCount = await eventsAttendees.getRowCount();
//             console.log(`📊 Current rows in Events Attendees BigQuery: ${currentRowCount}`);
//         } catch (countError) {
//             console.error('Could not get Events Attendees row count:', countError.message);
//         }
//     }
// }, {
//     timezone: "Asia/Kolkata"
// });
