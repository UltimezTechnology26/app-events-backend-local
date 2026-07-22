const cron = require('node-cron');
// const fetch = require('node-fetch');
// const professionals_seo_detailsM = require('../models/app/professionals_seo_detailsM');
// const professionals_social_linksM = require('../models/app/professionals_social_linksM');
// const usersM = require('../models/app/usersM');
// const professionals_locationsM = require('../models/app/users/professionals_locationsM');
// const company_seo_detailsM = require('../models/app/company/company_seo_detailsM');
const companyM = require('../models/app/company/companyM');
const eventM = require('../models/app/events/eventM');
const professionalsM = require('../models/app/professionalsM');
// const company_social_linksM = require('../models/app/company/company_social_linksM');

// Delete Fields cln_professionals_seo_details::

// cron.schedule('28 21 * * *', async () => {
//     console.log('🧹 Starting field cleanup from cln_professionals_seo_details:', new Date());
//     try {
//         // Fields to remove from cln_professionals_seo_details
//         const fieldsToRemove = [
//             'vcf_status',
//             'user_bio',
//             'looking_for_id',
//             'website',
//             'facebook',
//             'twitter',
//             'linkedin',
//             'instagram',
//             'video_link',
//             'telegram',
//             'medium',
//             'reddit',
//             'feed_url',
//             'other_social_links',
//             'youtube_channel',
//             'location',
//             'email_status'
//         ];

//         console.log(`🗑️ Fields to remove: ${fieldsToRemove.join(', ')}`);

//         let totalCleaned = 0;
//         let totalErrors = 0;

//         // Process each field type separately for better performance
//         for (const field of fieldsToRemove) {
//             try {
//                 console.log(`\n🔍 Cleaning field: ${field}`);

//                 // Count documents that have this field first
//                 const count = await professionals_seo_detailsM.countDocuments({ [field]: { $exists: true } });

//                 if (count === 0) {
//                     console.log(`✅ No documents found with field: ${field}`);
//                     continue;
//                 }

//                 console.log(`📦 Found ${count} documents with field: ${field}`);

//                 // Use raw MongoDB collection to bypass Mongoose schema restrictions
//                 const collection = professionals_seo_detailsM.collection;

//                 // Clean this field from all documents using raw MongoDB operation
//                 const result = await collection.updateMany(
//                     { [field]: { $exists: true } },
//                     { $unset: { [field]: 1 } }
//                 );

//                 if (result.modifiedCount > 0) {
//                     totalCleaned += result.modifiedCount;
//                     console.log(`🧹 Cleaned field ${field} from ${result.modifiedCount} documents`);
//                 } else {
//                     console.log(`⏭️ No documents modified for field: ${field}`);
//                     // Try alternative approach - check if field values are null/undefined
//                     const sampleDoc = await professionals_seo_detailsM.findOne({ [field]: { $exists: true } }).lean();
//                     if (sampleDoc) {
//                         console.log(`🔍 Sample document with ${field}:`, JSON.stringify(sampleDoc[field]));
//                     }
//                 }

//                 // Small delay between field processing
//                 await new Promise(resolve => setTimeout(resolve, 100));

//             } catch (fieldError) {
//                 console.error(`❌ Error cleaning field ${field}:`, fieldError.message);
//                 totalErrors++;
//             }
//         }

//         console.log('\n🎉 Field cleanup completed!');
//         console.log(`📊 Summary:`);
//         console.log(`   Total cleaned: ${totalCleaned}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification - check if any documents still have these fields
//         console.log('\n🔍 Verifying cleanup...');
//         const remainingDocs = await professionals_seo_detailsM.countDocuments({
//             $or: fieldsToRemove.map(field => ({ [field]: { $exists: true } }))
//         });

//         if (remainingDocs > 0) {
//             console.log(`⚠️ Found ${remainingDocs} documents still containing target fields`);

//             // Show which fields still exist
//             for (const field of fieldsToRemove) {
//                 const count = await professionals_seo_detailsM.countDocuments({ [field]: { $exists: true } });
//                 if (count > 0) {
//                     console.log(`   ${field}: ${count} documents`);
//                 }
//             }
//         } else {
//             console.log('✅ All target fields successfully removed from collection');
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field cleanup cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });

// // Removed fields cln_company_lists

// cron.schedule('35 21 * * *', async () => {
//     console.log('🧹 Starting field cleanup from cln_company_lists:', new Date());
//     try {
//         // Fields to remove from cln_company_lists
//         const fieldsToRemove = [
//             "facebook",
//             "instagram",
//             "linkedin",
//             "medium",
//             "telegram",
//             "twitter",
//             "video_link",
//             "youtube_channel",
//             "reddit"
//         ];

//         console.log(`🗑️ Fields to remove: ${fieldsToRemove.join(', ')}`);

//         let totalCleaned = 0;
//         let totalErrors = 0;

//         // Process each field type separately for better performance
//         for (const field of fieldsToRemove) {
//             try {
//                 console.log(`\n🔍 Cleaning field: ${field}`);

//                 // Count documents that have this field first
//                 const count = await companyM.countDocuments({ [field]: { $exists: true } });

//                 if (count === 0) {
//                     console.log(`✅ No documents found with field: ${field}`);
//                     continue;
//                 }

//                 console.log(`📦 Found ${count} documents with field: ${field}`);

//                 // Use raw MongoDB collection to bypass Mongoose schema restrictions
//                 const collection = companyM.collection;

//                 // Clean this field from all documents using raw MongoDB operation
//                 const result = await collection.updateMany(
//                     { [field]: { $exists: true } },
//                     { $unset: { [field]: 1 } }
//                 );

//                 if (result.modifiedCount > 0) {
//                     totalCleaned += result.modifiedCount;
//                     console.log(`🧹 Cleaned field ${field} from ${result.modifiedCount} documents`);
//                 } else {
//                     console.log(`⏭️ No documents modified for field: ${field}`);
//                     // Try alternative approach - check if field values are null/undefined
//                     const sampleDoc = await companyM.findOne({ [field]: { $exists: true } }).lean();
//                     if (sampleDoc) {
//                         console.log(`🔍 Sample document with ${field}:`, JSON.stringify(sampleDoc[field]));
//                     }
//                 }

//                 // Small delay between field processing
//                 await new Promise(resolve => setTimeout(resolve, 100));

//             } catch (fieldError) {
//                 console.error(`❌ Error cleaning field ${field}:`, fieldError.message);
//                 totalErrors++;
//             }
//         }

//         console.log('\n🎉 Field cleanup completed!');
//         console.log(`📊 Summary:`);
//         console.log(`   Total cleaned: ${totalCleaned}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification - check if any documents still have these fields
//         console.log('\n🔍 Verifying cleanup...');
//         const remainingDocs = await companyM.countDocuments({
//             $or: fieldsToRemove.map(field => ({ [field]: { $exists: true } }))
//         });

//         if (remainingDocs > 0) {
//             console.log(`⚠️ Found ${remainingDocs} documents still containing target fields`);

//             // Show which fields still exist
//             for (const field of fieldsToRemove) {
//                 const count = await companyM.countDocuments({ [field]: { $exists: true } });
//                 if (count > 0) {
//                     console.log(`   ${field}: ${count} documents`);
//                 }
//             }
//         } else {
//             console.log('✅ All target fields successfully removed from collection');
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field cleanup cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });


// // Removed Fields cln_company_seo_details

// cron.schedule('40 21 * * *', async () => {
//     console.log('🧹 Starting field cleanup from cln_company_seo_details:', new Date());
//     try {
//         // Fields to remove from cln_company_seo_details
//         const fieldsToRemove = [
//             'about_company',
//             'facebook',
//             'twitter',
//             'linkedin',
//             'instagram',
//             'video_link',
//             'telegram',
//             'medium',
//             'reddit',
//             'feed_url',
//             'other_social_links',
//             'youtube_channel',
//             'total_employees'
//         ];

//         console.log(`🗑️ Fields to remove: ${fieldsToRemove.join(', ')}`);

//         let totalCleaned = 0;
//         let totalErrors = 0;

//         // Process each field type separately for better performance
//         for (const field of fieldsToRemove) {
//             try {
//                 console.log(`\n🔍 Cleaning field: ${field}`);

//                 // Count documents that have this field first
//                 const count = await company_seo_detailsM.countDocuments({ [field]: { $exists: true } });

//                 if (count === 0) {
//                     console.log(`✅ No documents found with field: ${field}`);
//                     continue;
//                 }

//                 console.log(`📦 Found ${count} documents with field: ${field}`);

//                 // Use raw MongoDB collection to bypass Mongoose schema restrictions
//                 const collection = company_seo_detailsM.collection;

//                 // Clean this field from all documents using raw MongoDB operation
//                 const result = await collection.updateMany(
//                     { [field]: { $exists: true } },
//                     { $unset: { [field]: 1 } }
//                 );

//                 if (result.modifiedCount > 0) {
//                     totalCleaned += result.modifiedCount;
//                     console.log(`🧹 Cleaned field ${field} from ${result.modifiedCount} documents`);
//                 } else {
//                     console.log(`⏭️ No documents modified for field: ${field}`);
//                     // Try alternative approach - check if field values are null/undefined
//                     const sampleDoc = await company_seo_detailsM.findOne({ [field]: { $exists: true } }).lean();
//                     if (sampleDoc) {
//                         console.log(`🔍 Sample document with ${field}:`, JSON.stringify(sampleDoc[field]));
//                     }
//                 }

//                 // Small delay between field processing
//                 await new Promise(resolve => setTimeout(resolve, 100));

//             } catch (fieldError) {
//                 console.error(`❌ Error cleaning field ${field}:`, fieldError.message);
//                 totalErrors++;
//             }
//         }

//         console.log('\n🎉 Field cleanup completed!');
//         console.log(`📊 Summary:`);
//         console.log(`   Total cleaned: ${totalCleaned}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification - check if any documents still have these fields
//         console.log('\n🔍 Verifying cleanup...');
//         const remainingDocs = await company_seo_detailsM.countDocuments({
//             $or: fieldsToRemove.map(field => ({ [field]: { $exists: true } }))
//         });

//         if (remainingDocs > 0) {
//             console.log(`⚠️ Found ${remainingDocs} documents still containing target fields`);

//             // Show which fields still exist
//             for (const field of fieldsToRemove) {
//                 const count = await company_seo_detailsM.countDocuments({ [field]: { $exists: true } });
//                 if (count > 0) {
//                     console.log(`   ${field}: ${count} documents`);
//                 }
//             }
//         } else {
//             console.log('✅ All target fields successfully removed from collection');
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field cleanup cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });


// // Remove Fields cln_professionals

// cron.schedule('45 21 * * *', async () => {
//     console.log('🧹 Starting field cleanup from cln_professionals:', new Date());
//     try {
//         // Fields to remove from cln_professionals
//         const fieldsToRemove = [
//             "company_name",
//             "email_otp_number",
//             "mobile_verify_status",
//             "password",
//             "work_position"
//         ];

//         console.log(`🗑️ Fields to remove: ${fieldsToRemove.join(', ')}`);

//         let totalCleaned = 0;
//         let totalErrors = 0;

//         // Process each field type separately for better performance
//         for (const field of fieldsToRemove) {
//             try {
//                 console.log(`\n🔍 Cleaning field: ${field}`);

//                 // Count documents that have this field first
//                 const count = await professionalsM.countDocuments({ [field]: { $exists: true } });

//                 if (count === 0) {
//                     console.log(`✅ No documents found with field: ${field}`);
//                     continue;
//                 }

//                 console.log(`📦 Found ${count} documents with field: ${field}`);

//                 // Use raw MongoDB collection to bypass Mongoose schema restrictions
//                 const collection = professionalsM.collection;

//                 // Clean this field from all documents using raw MongoDB operation
//                 const result = await collection.updateMany(
//                     { [field]: { $exists: true } },
//                     { $unset: { [field]: 1 } }
//                 );

//                 if (result.modifiedCount > 0) {
//                     totalCleaned += result.modifiedCount;
//                     console.log(`🧹 Cleaned field ${field} from ${result.modifiedCount} documents`);
//                 } else {
//                     console.log(`⏭️ No documents modified for field: ${field}`);
//                     // Try alternative approach - check if field values are null/undefined
//                     const sampleDoc = await professionalsM.findOne({ [field]: { $exists: true } }).lean();
//                     if (sampleDoc) {
//                         console.log(`🔍 Sample document with ${field}:`, JSON.stringify(sampleDoc[field]));
//                     }
//                 }

//                 // Small delay between field processing
//                 await new Promise(resolve => setTimeout(resolve, 100));

//             } catch (fieldError) {
//                 console.error(`❌ Error cleaning field ${field}:`, fieldError.message);
//                 totalErrors++;
//             }
//         }

//         console.log('\n🎉 Field cleanup completed!');
//         console.log(`📊 Summary:`);
//         console.log(`   Total cleaned: ${totalCleaned}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification - check if any documents still have these fields
//         console.log('\n🔍 Verifying cleanup...');
//         const remainingDocs = await professionalsM.countDocuments({
//             $or: fieldsToRemove.map(field => ({ [field]: { $exists: true } }))
//         });

//         if (remainingDocs > 0) {
//             console.log(`⚠️ Found ${remainingDocs} documents still containing target fields`);

//             // Show which fields still exist
//             for (const field of fieldsToRemove) {
//                 const count = await professionalsM.countDocuments({ [field]: { $exists: true } });
//                 if (count > 0) {
//                     console.log(`   ${field}: ${count} documents`);
//                 }
//             }
//         } else {
//             console.log('✅ All target fields successfully removed from collection');
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field cleanup cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });

// create_on, Date_n_time , updated_on feilds remove cronjob

// cron.schedule('55 14 * * *', async () => {
//     console.log('🔄 Starting field rename from created_on to created_date_n_time in companyM:', new Date());
//     try {
//         // Check if created_on field exists in any documents
//         const count = await companyM.countDocuments({ created_on: { $exists: true } });

//         if (count === 0) {
//             console.log('✅ No documents found with created_on field');
//             return;
//         }

//         console.log(`📊 Found ${count} documents with created_on field`);

//         // Process in batches for better performance
//         const batchSize = 1000;
//         let totalProcessed = 0;
//         let totalErrors = 0;

//         while (totalProcessed < count) {
//             try {
//                 const batch = await companyM.find(
//                     { created_on: { $exists: true } },
//                     { _id: 1, created_on: 1, created_date_n_time: 1 }
//                 ).limit(batchSize).skip(totalProcessed);

//                 if (batch.length === 0) break;

//                 console.log(`🔄 Processing batch of ${batch.length} documents (total: ${totalProcessed + batch.length}/${count})`);

//                 for (const doc of batch) {
//                     try {
//                         // Only update if created_date_n_time doesn't already exist
//                         if (!doc.created_date_n_time && doc.created_on) {
//                             await companyM.updateOne(
//                                 { _id: doc._id },
//                                 {
//                                     $set: { created_date_n_time: doc.created_on },
//                                     $unset: { created_on: 1 }
//                                 }
//                             );
//                         } else if (doc.created_date_n_time && doc.created_on) {
//                             // If created_date_n_time exists, just remove created_on
//                             await companyM.updateOne(
//                                 { _id: doc._id },
//                                 { $unset: { created_on: 1 } }
//                             );
//                         }
//                     } catch (error) {
//                         console.error(`❌ Error updating document ${doc._id}:`, error.message);
//                         totalErrors++;
//                     }
//                 }

//                 totalProcessed += batch.length;
//                 console.log(`✅ Batch completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`);

//             } catch (batchError) {
//                 console.error('🚨 Batch processing error:', batchError.message);
//                 totalErrors++;
//                 break;
//             }
//         }

//         console.log('\n📋 Field rename summary:');
//         console.log(`   Total processed: ${totalProcessed}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification
//         const remainingCreatedOn = await companyM.countDocuments({ created_on: { $exists: true } });
//         const withDateNTime = await companyM.countDocuments({ created_date_n_time: { $exists: true } });

//         console.log(`   Documents with created_on remaining: ${remainingCreatedOn}`);
//         console.log(`   Documents with created_date_n_time: ${withDateNTime}`);

//         if (remainingCreatedOn === 0) {
//             console.log('✅ Field rename completed successfully!');
//         } else {
//             console.log(`⚠️ ${remainingCreatedOn} documents still have created_on field`);
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field rename cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });

// // Update date_n_time field to created_date_n_time in eventsM

// cron.schedule('56 14 * * *', async () => {
//     console.log('🔄 Starting field rename from date_n_time to created_date_n_time in eventsM:', new Date());
//     try {
//         // Check if date_n_time field exists in any documents
//         const count = await eventM.countDocuments({ date_n_time: { $exists: true } });

//         if (count === 0) {
//             console.log('✅ No documents found with date_n_time field');
//             return;
//         }

//         console.log(`📊 Found ${count} documents with date_n_time field`);

//         // Process in batches for better performance
//         const batchSize = 1000;
//         let totalProcessed = 0;
//         let totalErrors = 0;

//         while (totalProcessed < count) {
//             try {
//                 const batch = await eventM.find(
//                     { date_n_time: { $exists: true } },
//                     { _id: 1, date_n_time: 1, created_date_n_time: 1 }
//                 ).limit(batchSize).skip(totalProcessed);

//                 if (batch.length === 0) break;

//                 console.log(`🔄 Processing batch of ${batch.length} documents (total: ${totalProcessed + batch.length}/${count})`);

//                 for (const doc of batch) {
//                     try {
//                         // Only update if created_date_n_time doesn't already exist
//                         if (!doc.created_date_n_time && doc.date_n_time) {
//                             await eventM.updateOne(
//                                 { _id: doc._id },
//                                 {
//                                     $set: { created_date_n_time: doc.date_n_time },
//                                     $unset: { date_n_time: 1 }
//                                 }
//                             );
//                         } else if (doc.created_date_n_time && doc.date_n_time) {
//                             // If created_date_n_time exists, just remove date_n_time
//                             await eventM.updateOne(
//                                 { _id: doc._id },
//                                 { $unset: { date_n_time: 1 } }
//                             );
//                         }
//                     } catch (error) {
//                         console.error(`❌ Error updating document ${doc._id}:`, error.message);
//                         totalErrors++;
//                     }
//                 }

//                 totalProcessed += batch.length;
//                 console.log(`✅ Batch completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`);

//             } catch (batchError) {
//                 console.error('🚨 Batch processing error:', batchError.message);
//                 totalErrors++;
//                 break;
//             }
//         }

//         console.log('\n📋 Field rename summary:');
//         console.log(`   Total processed: ${totalProcessed}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification
//         const remainingDateNTime = await eventM.countDocuments({ date_n_time: { $exists: true } });
//         const withCreatedDateNTime = await eventM.countDocuments({ created_date_n_time: { $exists: true } });

//         console.log(`   Documents with date_n_time remaining: ${remainingDateNTime}`);
//         console.log(`   Documents with created_date_n_time: ${withCreatedDateNTime}`);

//         if (remainingDateNTime === 0) {
//             console.log('✅ Field rename completed successfully!');
//         } else {
//             console.log(`⚠️ ${remainingDateNTime} documents still have date_n_time field`);
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field rename cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });

// // Update updated_at field to updated_date_n_time in eventM

// cron.schedule('57 14 * * *', async () => {
//     console.log('��� Starting field rename from updated_at to updated_date_n_time in eventM:', new Date());
//     try {
//         // Check if updated_at field exists in any documents
//         const count = await eventM.countDocuments({ updated_at: { $exists: true } });

//         if (count === 0) {
//             console.log('✅ No documents found with updated_at field');
//             return;
//         }

//         console.log(`��� Found ${count} documents with updated_at field`);

//         // Process in batches for better performance
//         const batchSize = 1000;
//         let totalProcessed = 0;
//         let totalErrors = 0;

//         while (totalProcessed < count) {
//             try {
//                 const batch = await eventM.find(
//                     { updated_at: { $exists: true } },
//                     { _id: 1, updated_at: 1, updated_date_n_time: 1 }
//                 ).limit(batchSize).skip(totalProcessed);

//                 if (batch.length === 0) break;

//                 console.log(`��� Processing batch of ${batch.length} documents (total: ${totalProcessed + batch.length}/${count})`);

//                 for (const doc of batch) {
//                     try {
//                         // Only update if updated_date_n_time doesn't already exist
//                         if (!doc.updated_date_n_time && doc.updated_at) {
//                             await eventM.updateOne(
//                                 { _id: doc._id },
//                                 {
//                                     $set: { updated_date_n_time: doc.updated_at },
//                                     $unset: { updated_at: 1 }
//                                 }
//                             );
//                         } else if (doc.updated_date_n_time && doc.updated_at) {
//                             // If updated_date_n_time exists, just remove updated_at
//                             await eventM.updateOne(
//                                 { _id: doc._id },
//                                 { $unset: { updated_at: 1 } }
//                             );
//                         }
//                     } catch (error) {
//                         console.error(`❌ Error updating document ${doc._id}:`, error.message);
//                         totalErrors++;
//                     }
//                 }

//                 totalProcessed += batch.length;
//                 console.log(`✅ Batch completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`);

//             } catch (batchError) {
//                 console.error('��� Batch processing error:', batchError.message);
//                 totalErrors++;
//                 break;
//             }
//         }

//         console.log('\n��� Field rename summary:');
//         console.log(`   Total processed: ${totalProcessed}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification
//         const remainingUpdatedAt = await eventM.countDocuments({ updated_at: { $exists: true } });
//         const withUpdatedDateNTime = await eventM.countDocuments({ updated_date_n_time: { $exists: true } });

//         console.log(`   Documents with updated_at remaining: ${remainingUpdatedAt}`);
//         console.log(`   Documents with updated_date_n_time: ${withUpdatedDateNTime}`);

//         if (remainingUpdatedAt === 0) {
//             console.log('✅ Field rename completed successfully!');
//         } else {
//             console.log(`⚠️ ${remainingUpdatedAt} documents still have updated_at field`);
//         }

//     } catch (error) {
//         console.error('��� Fatal error in field rename cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });

// cron.schedule('10 19 * * *', async () => {
//     console.log('🔄 Starting field rename from date_n_time to created_date_n_time in professionalsM:', new Date());
//     try {
//         // Check if date_n_time field exists in any documents
//         const count = await professionalsM.countDocuments({ date_n_time: { $exists: true } });

//         if (count === 0) {
//             console.log('✅ No documents found with date_n_time field');
//             return;
//         }

//         console.log(`📊 Found ${count} documents with date_n_time field`);

//         // Process in batches for better performance
//         const batchSize = 1000;
//         let totalProcessed = 0;
//         let totalErrors = 0;

//         while (totalProcessed < count) {
//             try {
//                 const batch = await professionalsM.find(
//                     { date_n_time: { $exists: true } },
//                     { _id: 1, date_n_time: 1, created_date_n_time: 1 }
//                 ).limit(batchSize).skip(totalProcessed);

//                 if (batch.length === 0) break;

//                 console.log(`🔄 Processing batch of ${batch.length} documents (total: ${totalProcessed + batch.length}/${count})`);

//                 for (const doc of batch) {
//                     try {
//                         // Only update if created_date_n_time doesn't already exist
//                         if (!doc.created_date_n_time && doc.date_n_time) {
//                             await professionalsM.updateOne(
//                                 { _id: doc._id },
//                                 {
//                                     $set: { created_date_n_time: doc.date_n_time },
//                                     $unset: { date_n_time: 1 }
//                                 }
//                             );
//                         } else if (doc.created_date_n_time && doc.date_n_time) {
//                             // If created_date_n_time exists, just remove date_n_time
//                             await professionalsM.updateOne(
//                                 { _id: doc._id },
//                                 { $unset: { date_n_time: 1 } }
//                             );
//                         }
//                     } catch (error) {
//                         console.error(`❌ Error updating document ${doc._id}:`, error.message);
//                         totalErrors++;
//                     }
//                 }

//                 totalProcessed += batch.length;
//                 console.log(`✅ Batch completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`);

//             } catch (batchError) {
//                 console.error('🚨 Batch processing error:', batchError.message);
//                 totalErrors++;
//                 break;
//             }
//         }

//         console.log('\n📋 Field rename summary:');
//         console.log(`   Total processed: ${totalProcessed}`);
//         console.log(`   Total errors: ${totalErrors}`);

//         // Final verification
//         const remainingDateNTime = await professionalsM.countDocuments({ date_n_time: { $exists: true } });
//         const withCreatedDateNTime = await professionalsM.countDocuments({ created_date_n_time: { $exists: true } });

//         console.log(`   Documents with date_n_time remaining: ${remainingDateNTime}`);
//         console.log(`   Documents with created_date_n_time: ${withCreatedDateNTime}`);

//         if (remainingDateNTime === 0) {
//             console.log('✅ Field rename completed successfully!');
//         } else {
//             console.log(`⚠️ ${remainingDateNTime} documents still have date_n_time field`);
//         }

//     } catch (error) {
//         console.error('🚨 Fatal error in field rename cron:', error.message);
//         console.error('Stack trace:', error.stack);
//     }
// }, {
//     timezone: 'Asia/Kolkata'
// });
