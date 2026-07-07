const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
  _id: {
    type: Number
  },
  exchange_name: {
    type: String
  },
  exchange_slug: {
    type: String,
    unique: true
  },
  exchange_image: {
    type: String
  },
  total_pairs: {
    type: Number
  },
  total_coins: {
    type: Number
  },
  volume_24h: {
    type: Number
  },
  founder_user_row_id: {
    type: Number
  },
  founder_user_type: {
    type: Number
  },
  status: {
    type: Number,
    default: 1
  }, // 0:disabled, 1:enabled
  updated_on: {
    type: Date
  },
  date_n_time: {
    type: Date,
    required: true
  }
}, { versionKey: false })

saveSchema.index({ founder_user_row_id: 1, founder_user_type: 1 });
saveSchema.index({ founder_user_row_id: 1, founder_user_type: 1, status: 1 });

saveSchema.pre('save', async function (next) {
  if (!this._id) {
    const value = await getCollectionID('cln_exchanges')
    this._id = value
  }
  next()
})



module.exports = mongoose.model('cln_exchanges', saveSchema)

