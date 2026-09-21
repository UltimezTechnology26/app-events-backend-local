// modules/professionals-account-settings/professionals-account-settings.models.ts
//
// Phase A (4th and final setting.js slice, per plan doc 2026-09-10). Ports controllers/app/users/
// setting.js's /delete_user_account (~1942), /verify_email_n_delete_account (~1995),
// /change_email_id (~2049), /verify_current_email_id (~2106), /update_new_email_id (~2167),
// /verify_new_email_id (~2250) — the email-change + self-delete-account flow found while
// resolving the "Settings" domain (see plan doc, Jobs/Settings resolution, 2026-09-10).
//
// NOT ported here (out of scope, confirmed by tracing Settings.tsx's actual calls): the initial
// signup email-verification routes /verify_email_account (~1418) and /resend_otp (~1469) use the
// SAME verify_emailM model but a different flow (first-time signup verification, not settings) —
// Settings.tsx never calls either. Left in legacy for a future phase to scope properly, not
// assumed to belong here.
//
// REAL SCHEMA COLOCATION (2026-09-17): both schemas below now live here, ported verbatim from the
// legacy `models/app/auth_account/update_verify_emailsM.js` and
// `models/app/professionals_delete_verificationsM.js`. Both legacy files were reduced to one-line
// passthroughs so legacy `setting.js` (which stays live for the whole `_v2` parallel-verification
// window) keeps resolving to the exact same compiled model objects — same reverse-shim pattern
// already applied to every other colocated model in this migration (see professionals.models.ts's
// own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const updateVerifyEmailsSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, required: true, index: true },
  // 0: change email id, 1: otp verified, 2: update email id
  email_verify_type: { type: Number, default: 1 },
  email_verify_code: { type: String },
  otp_number: { type: String },
  email_id: { type: String },
  date_n_time: { type: Date },
})

updateVerifyEmailsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_update_verify_emails')
  }
  next()
})

export const UpdateVerifyEmailsM = mongoose.model('cln_professionals_update_verify_emails', updateVerifyEmailsSchema, 'cln_professionals_update_verify_emails')

const professionalsDeleteVerificationsSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, required: true, index: true },
  status: { type: Number, required: true },
  otp_number: { type: Number, required: true },
  date_n_time: { type: Date },
})

professionalsDeleteVerificationsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_delete_verifications')
  }
  next()
})

export const ProfessionalsDeleteVerificationsM = mongoose.model('cln_professionals_delete_verifications', professionalsDeleteVerificationsSchema, 'cln_professionals_delete_verifications')
