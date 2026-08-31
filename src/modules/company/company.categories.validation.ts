// modules/company/company.categories.validation.ts
const { check } = require('express-validator')

/**
 * Ports the reachable (first-registered) POST /add_n_update_details handler's
 * express-validator chain verbatim (lines 174-179 of the legacy controller).
 */
export const addNUpdateDetailsValidation = [
  check('business_name').trim().not().isEmpty().withMessage('The Business Name field is required'),
  check('business_id').trim().not().isEmpty().withMessage('The Business ID field is required'),
]

/** Ports POST /update_categories/:category_id's express-validator chain verbatim (legacy lines 405-409). */
export const updateCategoriesValidation = [
  check('business_name').trim().not().isEmpty().withMessage('The Business Name field is required'),
]
