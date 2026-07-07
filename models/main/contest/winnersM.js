const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    participated_row_id: {
        type: Number
    }, // id from cln_main_weekly_contests_questions
    contest_row_id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },
    winning_position: {
        type: Number
    }, // 1:1st Position, 2:2nd Position, 3:3rd Position
    reward_value: {
        type: Number
    },
    deposited_address: {
        type: String
    },
    trans_hash: {
        type: String
    },
    winner_status: {
        type: Number,
        default: 0
    },//0:winner selected, 1: payment updated
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_main_weekly_contests_winners')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_main_weekly_contests_winners', saveSchema)