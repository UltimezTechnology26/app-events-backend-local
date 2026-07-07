const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    expert_name: {
        type: String
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_expert_tag')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_academy_expert_tag', saveSchema)