const BigQueryDatabaseHelper = require('./bigquery-database-helper');

// Events table configuration
const eventsConfig = {
    tableId: process.env.BIGQUERY_TABLE_ID || 'cln_events',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'user_row_id', type: 'INTEGER' },
        { name: 'event_title', type: 'STRING' },
        { name: 'company_row_id', type: 'INTEGER' },
        { name: 'event_tags', type: 'JSON' },
        { name: 'event_type', type: 'INTEGER' },
        { name: 'event_image', type: 'STRING' },
        { name: 'alt_image_text', type: 'STRING' },
        { name: 'event_city', type: 'STRING' },
        { name: 'event_state', type: 'STRING' },
        { name: 'event_venue', type: 'STRING' },
        { name: 'event_url', type: 'STRING' },
        { name: 'event_link', type: 'STRING' },
        { name: 'event_image_type', type: 'INTEGER' },
        { name: 'start_date', type: 'TIMESTAMP' },
        { name: 'end_date', type: 'TIMESTAMP' },
        { name: 'event_description', type: 'STRING' },
        { name: 'event_brief', type: 'STRING' },
        { name: 'describe_in_one_line', type: 'STRING' },
        { name: 'contact_user_name', type: 'STRING' },
        { name: 'contact_mobile_number', type: 'STRING' },
        { name: 'contact_country_row_id', type: 'INTEGER' },
        { name: 'contact_email_id', type: 'STRING' },
        { name: 'event_price', type: 'FLOAT' },
        { name: 'active_status', type: 'INTEGER' },
        { name: 'approval_status', type: 'INTEGER' },
        { name: 'webinar_meeting_type', type: 'INTEGER' },
        { name: 'webinar_meeting_link', type: 'STRING' },
        { name: 'list_event_type', type: 'INTEGER' },
        { name: 'reason_for_reject', type: 'STRING' },
        { name: 'rejected_date_n_time', type: 'TIMESTAMP' },
        { name: 'disable_reason', type: 'STRING' },
        { name: 'disabled_date_n_time', type: 'TIMESTAMP' },
        { name: 'created_by_admin_status', type: 'INTEGER' },
        { name: 'created_by_sub_admin_id', type: 'INTEGER' },
        { name: 'created_date_n_time', type: 'TIMESTAMP' },
        { name: 'meta_keywords', type: 'STRING' },
        { name: 'meta_description', type: 'STRING' },
        { name: 'meta_title', type: 'STRING' },
        { name: 'longitude', type: 'STRING' },
        { name: 'latitude', type: 'STRING' },
        { name: 'utc_row_id', type: 'INTEGER' },
        { name: 'view_counts', type: 'INTEGER' },
        { name: 'ticket_link', type: 'STRING' },
        { name: 'event_card_image', type: 'STRING' },
        { name: 'build_event_page_score', type: 'INTEGER' },
        { name: 'seo_details_score', type: 'INTEGER' },
        { name: 'contact_details_score', type: 'INTEGER' },
        { name: 'tickets_coupons_score', type: 'INTEGER' },
        { name: 'speakers_score', type: 'INTEGER' },
        { name: 'sponsors_partners_score', type: 'INTEGER' },
        { name: 'attendees_score', type: 'INTEGER' },
        { name: 'faq_score', type: 'INTEGER' },
        { name: 'profile_score', type: 'INTEGER' },
        { name: 'robots_index', type: 'STRING' },
        { name: 'robots_follow', type: 'STRING' },
        { name: 'og_title', type: 'STRING' },
        { name: 'og_description', type: 'STRING' },
        { name: 'twitter_title', type: 'STRING' },
        { name: 'twitter_description', type: 'STRING' },
        { name: 'twitter_creator', type: 'STRING' },
        { name: 'updated_date_n_time', type: 'TIMESTAMP' },
        { name: 'header_structure', type: 'JSON' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Users table configuration
const usersConfig = {
    tableId: 'cln_users_dummy',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'referral_row_id', type: 'INTEGER' },
        { name: 'referral_user_name', type: 'STRING' },
        { name: 'sub_admin_row_id', type: 'INTEGER' },
        { name: 'claim_status', type: 'INTEGER' },
        { name: 'user_name', type: 'STRING' },
        { name: 'full_name', type: 'STRING' },
        { name: 'about_in_one_line', type: 'STRING' },
        { name: 'gender', type: 'INTEGER' },
        { name: 'email_id', type: 'STRING' },
        { name: 'email_verify_status', type: 'BOOLEAN' },
        { name: 'mobile_number', type: 'STRING' },
        { name: 'country_id', type: 'INTEGER' },
        { name: 'country_mobile_id', type: 'INTEGER' },
        { name: 'location', type: 'STRING' },
        { name: 'updated_date_n_time', type: 'TIMESTAMP' },
        { name: 'account_visible_type', type: 'INTEGER' },
        { name: 'designation_id', type: 'JSON' },
        { name: 'login_status', type: 'INTEGER' },
        { name: 'approval_status', type: 'INTEGER' },
        { name: 'reason_rejected', type: 'STRING' },
        { name: 'rejected_date_n_time', type: 'TIMESTAMP' },
        { name: 'deleted_date_n_time', type: 'TIMESTAMP' },
        { name: 'view_counts', type: 'INTEGER' },
        { name: 'created_date_n_time', type: 'TIMESTAMP' },
        { name: 'wallet_address', type: 'STRING' },
        { name: 'pro_batch', type: 'BOOLEAN' },
        { name: 'professional_profile_score', type: 'INTEGER' },
        { name: 'seo_details_score', type: 'INTEGER' },
        { name: 'social_media_score', type: 'INTEGER' },
        { name: 'academy_score', type: 'INTEGER' },
        { name: 'community_score', type: 'INTEGER' },
        { name: 'professional_detail_score', type: 'INTEGER' },
        { name: 'investment_score', type: 'INTEGER' },
        { name: 'award_score', type: 'INTEGER' },
        { name: 'faq_score', type: 'INTEGER' },
        { name: 'profile_score', type: 'INTEGER' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Companies table configuration
const companiesConfig = {
    tableId: 'cln_company_lists_dummy',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'user_row_id', type: 'INTEGER' },
        { name: 'sub_admin_row_id', type: 'INTEGER' },
        { name: 'claim_status', type: 'INTEGER' },
        { name: 'company_name', type: 'STRING' },
        { name: 'company_id', type: 'STRING' },
        { name: 'company_email_id', type: 'STRING' },
        { name: 'company_logo', type: 'STRING' },
        { name: 'website_link', type: 'STRING' },
        { name: 'contact_number', type: 'STRING' },
        { name: 'established_in', type: 'TIMESTAMP' },
        { name: 'nft_wallet_address', type: 'STRING' },
        { name: 'describe_in_one_line', type: 'STRING' },
        { name: 'main_business_model_id', type: 'INTEGER' },
        { name: 'business_model_id', type: 'JSON' },
        { name: 'investor_model_id', type: 'INTEGER' },
        { name: 'country_id', type: 'INTEGER' },
        { name: 'country_mobile_id', type: 'INTEGER' },
        { name: 'company_location', type: 'STRING' },
        { name: 'city', type: 'STRING' },
        { name: 'state', type: 'STRING' },
        { name: 'longitude', type: 'STRING' },
        { name: 'latitude', type: 'STRING' },
        { name: 'company_valuation', type: 'FLOAT' },
        { name: 'company_size_row_id', type: 'INTEGER' },
        { name: 'investor_category_row_id', type: 'INTEGER' },
        { name: 'approval_sub_admin_row_id', type: 'INTEGER' },
        { name: 'reason_rejected', type: 'STRING' },
        { name: 'rejected_date_n_time', type: 'TIMESTAMP' },
        { name: 'disable_reason', type: 'STRING' },
        { name: 'disabled_date_n_time', type: 'TIMESTAMP' },
        { name: 'updated_date_n_time', type: 'TIMESTAMP' },
        { name: 'created_date_n_time', type: 'TIMESTAMP' },
        { name: 'approval_status', type: 'INTEGER' },
        { name: 'active_status', type: 'INTEGER' },
        { name: 'bulk_upload_status', type: 'INTEGER' },
        { name: 'view_counts', type: 'INTEGER' },
        { name: 'regularities_details', type: 'JSON' },
        { name: 'basic_details_score', type: 'INTEGER' },
        { name: 'seo_details_score', type: 'INTEGER' },
        { name: 'social_media_score', type: 'INTEGER' },
        { name: 'owned_product_score', type: 'INTEGER' },
        { name: 'team_detail_score', type: 'INTEGER' },
        { name: 'job_opening_score', type: 'INTEGER' },
        { name: 'funding_score', type: 'INTEGER' },
        { name: 'revenue_score_score', type: 'INTEGER' },
        { name: 'investment_score', type: 'INTEGER' },
        { name: 'faq_score', type: 'INTEGER' },
        { name: 'holding_crypto_score', type: 'INTEGER' },
        { name: 'profile_score', type: 'INTEGER' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Company Other Details table configuration
const companyOtherDetailsConfig = {
    tableId: 'cln_company_seo_details',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'company_row_id', type: 'INTEGER' },
        { name: 'about_company', type: 'STRING' },
        { name: 'facebook', type: 'STRING' },
        { name: 'twitter', type: 'STRING' },
        { name: 'linkedin', type: 'STRING' },
        { name: 'instagram', type: 'STRING' },
        { name: 'video_link', type: 'STRING' },
        { name: 'telegram', type: 'STRING' },
        { name: 'feed_url', type: 'STRING' },
        { name: 'medium', type: 'STRING' },
        { name: 'reddit', type: 'STRING' },
        { name: 'other_social_links', type: 'JSON' },
        { name: 'youtube_channel', type: 'STRING' },
        { name: 'meta_title', type: 'STRING' },
        { name: 'meta_keywords', type: 'STRING' },
        { name: 'meta_description', type: 'STRING' },
        { name: 'robots_index', type: 'STRING' },
        { name: 'robots_follow', type: 'STRING' },
        { name: 'og_title', type: 'STRING' },
        { name: 'og_description', type: 'STRING' },
        { name: 'twitter_title', type: 'STRING' },
        { name: 'twitter_description', type: 'STRING' },
        { name: 'twitter_creator', type: 'STRING' },
        { name: 'header_structure', type: 'JSON' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Users Other Details table configuration
const usersOtherDetailsConfig = {
    tableId: 'cln_professionals_seo_details',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'user_row_id', type: 'INTEGER' },
        { name: 'user_bio', type: 'STRING' },
        { name: 'looking_for_id', type: 'JSON' },
        { name: 'location', type: 'STRING' },
        { name: 'website', type: 'STRING' },
        { name: 'facebook', type: 'STRING' },
        { name: 'twitter', type: 'STRING' },
        { name: 'linkedin', type: 'STRING' },
        { name: 'instagram', type: 'STRING' },
        { name: 'video_link', type: 'STRING' },
        { name: 'telegram', type: 'STRING' },
        { name: 'medium', type: 'STRING' },
        { name: 'reddit', type: 'STRING' },
        { name: 'feed_url', type: 'STRING' },
        { name: 'other_social_links', type: 'JSON' },
        { name: 'meta_title', type: 'STRING' },
        { name: 'meta_keywords', type: 'STRING' },
        { name: 'meta_description', type: 'STRING' },
        { name: 'vcf_status', type: 'INTEGER' },
        { name: 'email_status', type: 'INTEGER' },
        { name: 'youtube_channel', type: 'STRING' },
        { name: 'robots_index', type: 'STRING' },
        { name: 'robots_follow', type: 'STRING' },
        { name: 'og_title', type: 'STRING' },
        { name: 'og_description', type: 'STRING' },
        { name: 'twitter_title', type: 'STRING' },
        { name: 'twitter_description', type: 'STRING' },
        { name: 'twitter_creator', type: 'STRING' },
        { name: 'header_structure', type: 'JSON' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Academy Courses table configuration
const academyCoursesConfig = {
    tableId: 'cln_academy_courses',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'course_name', type: 'STRING' },
        { name: 'course_description', type: 'STRING' },
        { name: 'course_slug', type: 'STRING' },
        { name: 'course_image', type: 'STRING' },
        { name: 'expert_tag', type: 'STRING' },
        { name: 'date_n_time', type: 'TIMESTAMP' },
        { name: 'meta_keywords', type: 'STRING' },
        { name: 'meta_description', type: 'STRING' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Event Attendees table configuration
const eventAttendeesConfig = {
    tableId: 'cln_event_attendees',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'event_row_id', type: 'INTEGER' },
        { name: 'applied_user_row_id', type: 'INTEGER' },
        { name: 'date_n_time', type: 'TIMESTAMP' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Event Collaboration Users Requests table configuration
const eventCollaborationUsersRequestsConfig = {
    tableId: 'cln_events_collaboration_professionals_requests',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'user_row_id', type: 'INTEGER' },
        { name: 'event_row_id', type: 'INTEGER' },
        { name: 'collaborations_ids', type: 'JSON' },
        { name: 'requested_status', type: 'INTEGER' },
        { name: 'updated_on', type: 'TIMESTAMP' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Event Coupons table configuration
const eventCouponsConfig = {
    tableId: 'cln_event_coupons',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'event_row_id', type: 'INTEGER' },
        { name: 'coupon_code', type: 'STRING' },
        { name: 'discount', type: 'INTEGER' },
        { name: 'updated_date_n_time', type: 'TIMESTAMP' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Deleted Events table configuration
const deletedEventsConfig = {
    tableId: 'cln_deleted_events',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'user_row_id', type: 'INTEGER' },
        { name: 'event_title', type: 'STRING' },
        { name: 'company_row_id', type: 'INTEGER' },
        { name: 'event_tags', type: 'JSON' },
        { name: 'event_type', type: 'INTEGER' },
        { name: 'event_city', type: 'STRING' },
        { name: 'event_venue', type: 'STRING' },
        { name: 'event_url', type: 'STRING' },
        { name: 'event_link', type: 'STRING' },
        { name: 'start_date', type: 'TIMESTAMP' },
        { name: 'end_date', type: 'TIMESTAMP' },
        { name: 'event_description', type: 'STRING' },
        { name: 'contact_user_name', type: 'STRING' },
        { name: 'contact_mobile_number', type: 'STRING' },
        { name: 'contact_country_row_id', type: 'INTEGER' },
        { name: 'contact_email_id', type: 'STRING' },
        { name: 'active_status', type: 'INTEGER' },
        { name: 'approval_status', type: 'INTEGER' },
        { name: 'webinar_meeting_type', type: 'INTEGER' },
        { name: 'webinar_meeting_link', type: 'STRING' },
        { name: 'list_event_type', type: 'INTEGER' },
        { name: 'deleted_reason', type: 'STRING' },
        { name: 'deleted_date_n_time', type: 'TIMESTAMP' },
        { name: 'created_by_admin_status', type: 'INTEGER' },
        { name: 'created_by_sub_admin_id', type: 'INTEGER' },
        { name: 'date_n_time', type: 'TIMESTAMP' },
        { name: 'longitude', type: 'STRING' },
        { name: 'latitude', type: 'STRING' },
        { name: 'utc_row_id', type: 'INTEGER' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Events Attendees table configuration
const eventsAttendeesConfig = {
    tableId: 'cln_events_attendees',
    keyFilename: 'for-ga4-bitquery-new-e971719171c1.json',
    datasetId: 'app_events_mongodb',
    projectId: 'for-ga4-bitquery-new',
    schema: [
        { name: '_id', type: 'INTEGER' },
        { name: 'event_row_id', type: 'INTEGER' },
        { name: 'user_type', type: 'INTEGER' },
        { name: 'user_row_id', type: 'INTEGER' },
        { name: 'sg_message_id', type: 'STRING' },
        { name: 'email_day_number', type: 'INTEGER' },
        { name: 'email_sent_status', type: 'BOOLEAN' },
        { name: 'invitation_status', type: 'INTEGER' },
        { name: 'invitation_type', type: 'INTEGER' },
        { name: 'reminder_type', type: 'INTEGER' },
        { name: 'reminder_email_sent_status', type: 'BOOLEAN' },
        { name: 'reminder_time', type: 'TIMESTAMP' },
        { name: 'created_date_n_time', type: 'TIMESTAMP' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
};

// Create helper instances for each table
const usersBigQuery = new BigQueryDatabaseHelper(usersConfig);
const companiesBigQuery = new BigQueryDatabaseHelper(companiesConfig);
const eventsBigQuery = new BigQueryDatabaseHelper(eventsConfig);
const companyOtherDetailsBigQuery = new BigQueryDatabaseHelper(companyOtherDetailsConfig);
const usersOtherDetailsBigQuery = new BigQueryDatabaseHelper(usersOtherDetailsConfig);
const academyCoursesBigQuery = new BigQueryDatabaseHelper(academyCoursesConfig);
const eventAttendeesBigQuery = new BigQueryDatabaseHelper(eventAttendeesConfig);
const eventCollaborationUsersRequestsBigQuery = new BigQueryDatabaseHelper(eventCollaborationUsersRequestsConfig);
const eventCouponsBigQuery = new BigQueryDatabaseHelper(eventCouponsConfig);
const deletedEventsBigQuery = new BigQueryDatabaseHelper(deletedEventsConfig);
const eventsAttendeesBigQuery = new BigQueryDatabaseHelper(eventsAttendeesConfig);

// Export table-specific helpers
module.exports = {
    // Users table operations
    users: {
        insertRows: (rows) => usersBigQuery.insertRows(rows),
        upsertRows: (rows) => usersBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => usersBigQuery.getRowCount(),
        isClientReady: () => usersBigQuery.isClientReady(),
        getConfig: () => usersBigQuery.getConfig(),
        truncateTable: () => usersBigQuery.truncateTable()
    },

    // Companies table operations
    companies: {
        insertRows: (rows) => companiesBigQuery.insertRows(rows),
        upsertRows: (rows) => companiesBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => companiesBigQuery.getRowCount(),
        isClientReady: () => companiesBigQuery.isClientReady(),
        getConfig: () => companiesBigQuery.getConfig(),
        truncateTable: () => companiesBigQuery.truncateTable()
    },

    // Events table operations
    events: {
        insertRows: (rows) => eventsBigQuery.insertRows(rows),
        upsertRows: (rows) => eventsBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => eventsBigQuery.getRowCount(),
        isClientReady: () => eventsBigQuery.isClientReady(),
        getConfig: () => eventsBigQuery.getConfig(),
        truncateTable: () => eventsBigQuery.truncateTable()
    },

    // Company Other Details table operations
    companyOtherDetails: {
        insertRows: (rows) => companyOtherDetailsBigQuery.insertRows(rows),
        upsertRows: (rows) => companyOtherDetailsBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => companyOtherDetailsBigQuery.getRowCount(),
        isClientReady: () => companyOtherDetailsBigQuery.isClientReady(),
        getConfig: () => companyOtherDetailsBigQuery.getConfig(),
        truncateTable: () => companyOtherDetailsBigQuery.truncateTable()
    },

    // Users Other Details table operations
    usersOtherDetails: {
        insertRows: (rows) => usersOtherDetailsBigQuery.insertRows(rows),
        upsertRows: (rows) => usersOtherDetailsBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => usersOtherDetailsBigQuery.getRowCount(),
        isClientReady: () => usersOtherDetailsBigQuery.isClientReady(),
        getConfig: () => usersOtherDetailsBigQuery.getConfig(),
        truncateTable: () => usersOtherDetailsBigQuery.truncateTable()
    },

    // Academy Courses table operations
    academyCourses: {
        insertRows: (rows) => academyCoursesBigQuery.insertRows(rows),
        upsertRows: (rows) => academyCoursesBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => academyCoursesBigQuery.getRowCount(),
        isClientReady: () => academyCoursesBigQuery.isClientReady(),
        getConfig: () => academyCoursesBigQuery.getConfig(),
        truncateTable: () => academyCoursesBigQuery.truncateTable()
    },

    // Event Attendees table operations
    eventAttendees: {
        insertRows: (rows) => eventAttendeesBigQuery.insertRows(rows),
        upsertRows: (rows) => eventAttendeesBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => eventAttendeesBigQuery.getRowCount(),
        isClientReady: () => eventAttendeesBigQuery.isClientReady(),
        getConfig: () => eventAttendeesBigQuery.getConfig(),
        truncateTable: () => eventAttendeesBigQuery.truncateTable()
    },

    // Event Collaboration Users Requests table operations
    eventCollaborationUsersRequests: {
        insertRows: (rows) => eventCollaborationUsersRequestsBigQuery.insertRows(rows),
        upsertRows: (rows) => eventCollaborationUsersRequestsBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => eventCollaborationUsersRequestsBigQuery.getRowCount(),
        isClientReady: () => eventCollaborationUsersRequestsBigQuery.isClientReady(),
        getConfig: () => eventCollaborationUsersRequestsBigQuery.getConfig(),
        truncateTable: () => eventCollaborationUsersRequestsBigQuery.truncateTable()
    },

    // Event Coupons table operations
    eventCoupons: {
        insertRows: (rows) => eventCouponsBigQuery.insertRows(rows),
        upsertRows: (rows) => eventCouponsBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => eventCouponsBigQuery.getRowCount(),
        isClientReady: () => eventCouponsBigQuery.isClientReady(),
        getConfig: () => eventCouponsBigQuery.getConfig(),
        truncateTable: () => eventCouponsBigQuery.truncateTable()
    },

    // Deleted Events table operations
    deletedEvents: {
        insertRows: (rows) => deletedEventsBigQuery.insertRows(rows),
        upsertRows: (rows) => deletedEventsBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => deletedEventsBigQuery.getRowCount(),
        isClientReady: () => deletedEventsBigQuery.isClientReady(),
        getConfig: () => deletedEventsBigQuery.getConfig(),
        truncateTable: () => deletedEventsBigQuery.truncateTable()
    },

    // Events Attendees table operations
    eventsAttendees: {
        insertRows: (rows) => eventsAttendeesBigQuery.insertRows(rows),
        upsertRows: (rows) => eventsAttendeesBigQuery.upsertRows(rows, { idField: '_id' }),
        getRowCount: () => eventsAttendeesBigQuery.getRowCount(),
        isClientReady: () => eventsAttendeesBigQuery.isClientReady(),
        getConfig: () => eventsAttendeesBigQuery.getConfig(),
        truncateTable: () => eventsAttendeesBigQuery.truncateTable()
    },

    // Raw helper instances for advanced usage
    usersBigQuery,
    companiesBigQuery,
    eventsBigQuery,
    companyOtherDetailsBigQuery,
    usersOtherDetailsBigQuery,
    academyCoursesBigQuery,
    eventAttendeesBigQuery,
    eventCollaborationUsersRequestsBigQuery,
    eventCouponsBigQuery,
    deletedEventsBigQuery,
    eventsAttendeesBigQuery
};
