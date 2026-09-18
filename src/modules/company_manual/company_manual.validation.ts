// modules/company_manual/company_manual.validation.ts
const { check } = require('express-validator')

export const updateManualDetailValidation = [
  check('company_name').trim().not().isEmpty().withMessage('The Company Name field is required.'),
  check('website_link').trim().not().isEmpty().withMessage('The Website Link field is required.'),
]

export const editManualDetailValidation = [
  check('company_row_id').trim().not().isEmpty().withMessage('The Company Row ID field is required.'),
]

export const rejectManualCompanyValidation = [
  check('reject_reason')
    .trim().not().isEmpty().withMessage('The Company reject reason field required.')
    .isLength({ min: 4 }).withMessage('The Company reject reason field at least contain 5 characters in length.'),
]
