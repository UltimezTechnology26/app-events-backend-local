const mongoose = require('mongoose');
const { marketDB } = require('../config/database_connector')


const saveSchema = new mongoose.Schema({
    _id:{
        type:Number
    },
    model: {
        type: String,
        required: true,
        index: true
    },
    count: {
        type: Number,
        default: 0,
        index: true
    }
})

module.exports = marketDB.model('identitycounters', saveSchema)