require('dotenv').config()
const express = require('express')
const cors = require('cors')

const fileUpload = require('express-fileupload');
const compression = require('compression')
const http = require('node:http')
const PORTNUM = process.env.PORT || 3010
const agenda = require('./config/agenda'); 
require('./jobs/certificateGeneration')(agenda);
require('./controllers/app/events/jobs/event-card-generation')(agenda);
require('./jobs/crons');
require('./jobs/sync-biquery-cron');
require('./jobs/optimise_structure');
const { connectDatabase } = require('./config/database')


const { checkApiKey } = require('./middleware/authorization')
const community_postsM = require('./models/main/community/community_postsM')
const community_commentsM = require('./models/main/community/community_commentsM')
require('./controllers/app/events/jobs/event-card-generation')(agenda);
const route = require('./routes/index')

const event_attendeesM = require('./models/app/events/event_attendeesM')
const email_eventsM = require('./models/emails/email_eventsM')


const path = require('node:path')
const app = express()
// Was `express.static(__dirname + '/')` - unscoped, so it served every file in
// this directory over plain HTTP with no auth (package.json, .env's siblings,
// etc). Narrowed to the one real static asset (the repo-root favicon) instead
// of carrying forward the same open directory listing.
app.use('/favicon.png', express.static(path.join(__dirname, 'favicon.png')));

//middleware setup start here 
app.use(express.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000
}));

app.use(express.json({
    limit: "50mb"
}));
app.use(fileUpload())
app.use(compression())

app.get('/', async (req, res) => {

    res.json({
        status: true,
        message: "Welcome to app and events server."
    })
})

agenda.on('ready', async () => {
    console.log('Agenda connected, starting jobs...');

    await agenda.start();
    console.log('Agenda started');
});

const server = http.createServer(app)
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const data = req.body
        for (let run of data) {
            let sg_message_id = (run.sg_message_id).split('.')[0]
            let check_query = await event_attendeesM.findOne({ sg_message_id: sg_message_id })
            if (check_query) {
                if (run.attendee_row_id) {
                    let event_type = run.event

                    let insert_array = {
                        sg_message_id: sg_message_id,
                        event_type: event_type,
                        response: run.response,
                        attendee_row_id: run.attendee_row_id,
                        created_date_n_time: new Date(run.timestamp * 1000)
                    }
                    await email_eventsM(insert_array).save()
                }
            }
        }

        res.status(200)
    }
    catch (err) {
        console.log('Index event webhook error', err.message)
    }
})


const whitelist = [
    'https://testmarkets.coinpedia.org',
    'https://markets.coinpedia.org',
    'https://app.coinpedia.org',
    'https://events.coinpedia.org',
    'https://coinpedia.org',
    'https://testapp.coinpedia.org',
    'https://testevents.coinpedia.org',
    'https://demo-admin.coinpedia.org',
    'https://appadmin.coinpedia.org',
    'https://wordpress.coinpedia.org',
    'https://ubuntucp.coinpedia.org',
    'https://one.newrelic.com',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'https://ultimez.com',
    'https://ts-markets.coinpedia.org'
]

let corsOptions = {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
        }
        else {
            callback(new Error('Not allowed by CORS'))
        }
    }
}


app.use(cors())
app.disable("x-powered-by")


app.use(checkApiKey)
app.use(route)

// Centralized error handler — a safety net, not a replacement for the
// try/catch every route already has. Express only reaches this if a route
// or middleware throws synchronously or calls next(err) without having
// already sent a response, which none of the existing routes currently do
// (they all catch their own errors and respond directly) — so this adds
// coverage for the unhandled case without changing any route's current
// response. Must be registered after app.use(route) — Express only routes
// errors to handlers registered after the code that threw.
const logger = require('./config/logger').default
app.use((err, req, res, next) => {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err instanceof Error ? err.message : String(err)}`)
    if (res.headersSent) {
        return next(err)
    }
    res.status(500).json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
})

process.on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise')
    process.exit(1)
})

process.on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    process.exit(1)
})

const startPostChangeStream = () => {
    try {
        community_postsM.watch([], { fullDocument: 'updateLookup' })
            .on('change', async (data) => {
                const { operationType, fullDocument, documentKey, updateDescription } = data;
                if (!documentKey?._id) return;

                const postId = documentKey._id;

                switch (operationType) {
                    case 'insert':
                        if (fullDocument?.post_status) {
                            io.emit('new_post', fullDocument);
                            console.log('📢 New post emitted via socket:', postId);
                        }

                        break;

                    case 'update':
                        if (updateDescription?.updatedFields?.post_status !== undefined) {
                            io.emit('post_status_updated', {
                                _id: postId,
                                post_status: fullDocument.post_status
                            });
                            console.log(`🔄 Post status updated for ${postId}:`, fullDocument.post_status);
                        }
                        break;
                }
            })
            .on('error', (e) => {
                console.error('❌ Change stream error:', e.message);
                setTimeout(() => {
                    startPostChangeStream();
                }, 5000);
            });

        community_commentsM.watch([], { fullDocument: 'updateLookup' })
            .on('change', async (data) => {
                const { operationType, fullDocument, documentKey, updateDescription } = data;
                if (!documentKey?._id) return;

                const commentId = documentKey._id;

                switch (operationType) {
                    case 'insert':
                        io.emit('new_comment', fullDocument);
                        console.log('💬 New comment emitted:', commentId);
                        break;

                    case 'update':
                        if (updateDescription?.updatedFields) {
                            const updatedComment = {
                                _id: commentId,
                                ...updateDescription.updatedFields,
                            };
                            io.emit('update_comment', updatedComment);
                            console.log('✏️ Comment updated and emitted:', commentId);
                        }
                        break;
                }
            })
            .on('error', (e) => {
                console.error('❌ Comment stream error:', e.message);
                setTimeout(() => {
                    startPostChangeStream();
                }, 5000);
            });

        console.log('✅ Change stream started on community_postsM');
        return true;
    } catch (e) {
        console.error('❌ Failed to start change stream:', e.message);
        setTimeout(() => {
            startPostChangeStream();
        }, 5000);
        return false;
    }
};



//middleware setup start here 
app.use(express.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000
}));

app.use(express.json({
    limit: "50mb"
}));
// app.use('/images', images)





server.listen(PORTNUM, async () => {
    // Ensure database is connected before starting change streams
    console.log('🔄 Establishing database connection...');
    const dbConnected = await connectDatabase();
    if (dbConnected) {
        console.log('✅ Database connected, starting change streams...');
        startPostChangeStream()
    } else {
        console.log('⚠️ Database connection failed, starting server without change streams');
    }
})


