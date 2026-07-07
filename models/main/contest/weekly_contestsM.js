const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    title: {
        type: String
    },
    contest_image: {
        type: String
    },
    start_date: {
        type: Date
    },
    first_price_reward: {
        type: Number,
    },
    second_price_reward: {
        type: Number,
    },
    third_price_reward: {
        type: Number,
    },
    end_date: {
        type: Date
    },
    description: {
        type: String
    },
    active_status: {
        type: Number,
        default: 1
    },
    completed_status: {
        type: Number,
        default: 0
    }, //0:not completed, 1:completed
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_main_weekly_contests')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_main_weekly_contests', saveSchema)