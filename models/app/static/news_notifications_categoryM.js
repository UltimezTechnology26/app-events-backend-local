const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    news_cp_category_row_id: {
        type: Number
    },
    category_name: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_news_notifications_categories')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_news_notifications_categories', saveSchema)