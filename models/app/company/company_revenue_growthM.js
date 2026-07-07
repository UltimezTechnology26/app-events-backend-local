const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    year: {
        type: Number
    },
    quarter: {
        type: Number
    },//1. Q1, 2. Q2, 3. Q3, 4. Q4, 5.Yearly
    revenue: {
        type: Number
    },
    revenue_streams: [
        {
            category_row_id: {
                type: Number
            },
            stream_amount: {
                type: Number
            }
        }
    ],
    updated_date_n_time: {
        type: Date
    }
})

// Additional indexes for companyList function optimization
saveSchema.index({ company_row_id: 1, year: -1, quarter: -1 });
saveSchema.index({ company_row_id: 1 });
saveSchema.index({ company_row_id: 1, year: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_revenue_details')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_revenue_details', saveSchema)