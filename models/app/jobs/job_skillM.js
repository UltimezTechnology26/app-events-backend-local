const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({ _id: Number, skill_name: { type: String, required: true, trim: true, unique: true }, }, { timestamps: true })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_job_skills')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_job_skills', saveSchema)