// modules/company/company.faq.validation.ts
const { check } = require('express-validator')

export const updateFaqDetailsValidation = [
  check('company_row_id')
    .not().isEmpty().withMessage('The Company Row ID field is required.')
    .isInt().withMessage('The Company Row ID field must be contains only integers.'),
  check('faq_question')
    .not().isEmpty().withMessage('The Faq Question field is required.'),
  check('faq_answer')
    .not().isEmpty().withMessage('The Faq Answer field is required.'),
]
