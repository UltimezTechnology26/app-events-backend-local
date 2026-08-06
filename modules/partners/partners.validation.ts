// modules/partners/partners.validation.ts
const { check } = require('express-validator')

export const rejectPartnerRequestValidation = [
  check('rejected_reason').trim().not().isEmpty().withMessage('The Reason Rejected field is required'),
]
