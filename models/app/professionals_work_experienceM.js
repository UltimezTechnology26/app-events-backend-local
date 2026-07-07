const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_account_type: {
        type: Number,
        required: true,
        index: true
    }, // 1 : registered user, 2: manual user
    user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    company_type: {
        type: Number,
        index: true
    }, // 1: registered, 2:manual
    company_row_id: {
        type: Number,
        index: true
    },
    employment_type: {
        type: Number,
        index: true
    }, // 1.Full time 2.Part time 3.Internship 4.Freelancer 5.Trainee
    position_type: {
        type: Number,
        default: 1,
        index: true
    }, // 1.Admin addded 2.Manually added 
    position_row_id: {
        type: Number,
        index: true
    },
    sub_position_row_id: {
        type: Number,
        index: true
    },
    // position: {
    //     type:String
    // }, 
    responsibilities: {
        type: String
    },
    location_type: {
        type: Number
    }, // 1.Onsite 2.Hybrid 3.Remote 

    designation_type: {
        type: Number,
        default: 1,
        //  1.employee 2.board member 3.advisor 
    },
    location: {
        type: String
    },
    start_date: {
        type: Date
    },
    till_date_status: {
        type: Number
    }, // 1:not present, 2:present
    end_date: {
        type: Date
    },
    verified_status: {
        type: Boolean,
        default: false
    }, // false:not verified, true:verified
    verified_on: {
        type: Date
    },
    public_view: {
        type: Boolean,
        default: false
    }, // link page display status & only for currently working
    positions: [{
        _id: false,
        position_type: { type: Number, required: true }, // 1: static, 2: manual
        position_row_id: { type: Number },               // used when position_type === 1
        sub_position_row_id: { type: Number },           // used when position_type === 2
    }]
})
// company_id: {
//     type:String
// },
// company_name: {
//     type:String
// },
// company_name: {
//     type:String
// },
saveSchema.index({ user_row_id: 1, public_view: 1, till_date_status: 1 });
saveSchema.index({ position_type: 1, sub_position_row_id: 1 });
saveSchema.index({ company_type: 1, company_row_id: 1 });
saveSchema.index({ user_row_id: 1, start_date: -1 });
saveSchema.index({ user_account_type: 1, user_row_id: 1 });

saveSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1 });
saveSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, start_date: -1 });
saveSchema.index({ verified_status: 1, company_type: 1, company_row_id: 1, till_date_status: 1 });
saveSchema.index({ position_row_id: 1 });
saveSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, position_row_id: 1 });
saveSchema.index({ company_type: 1, company_row_id: 1, user_row_id: 1 });
saveSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, position_type: 1 });
saveSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, start_date: -1, position_row_id: 1 });
saveSchema.index({ company_type: 1, company_row_id: 1, position_row_id: 1 });
saveSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, company_type: 1, company_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_work_experiences')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_work_experiences', saveSchema)