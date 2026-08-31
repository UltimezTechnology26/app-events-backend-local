// modules/company/company.regulatory_details.validation.ts
const { check } = require('express-validator')

/** Ports POST /save_n_edit's express-validator chain verbatim (legacy lines 15-18). */
export const saveNEditTypeValidation = [
  check('regulator_type_name')
    .trim()
    .not()
    .isEmpty()
    .withMessage('The category name field is required.'),
]

/** Ports POST /save_n_edit_bodies's express-validator chain verbatim (legacy lines 113-121). */
export const saveNEditBodiesValidation = [
  check('regulatory_bodies_name')
    .trim()
    .not()
    .isEmpty()
    .withMessage('The regulatory body name field is required.'),
  check('country_id')
    .not()
    .isEmpty()
    .withMessage('The country ID is required.')
    .isInt()
    .withMessage('The country ID must be a valid number.'),
  check('regulatory_type_id')
    .not()
    .isEmpty()
    .withMessage('The regulatory type id is required.')
    .isInt()
    .withMessage('The regulatory type id must be a valid number.'),
]
