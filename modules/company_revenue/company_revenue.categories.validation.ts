// modules/company_revenue/company_revenue.categories.validation.ts
const { check } = require('express-validator')

/**
 * Ports controllers/admin_panel/category_tags/revenue_streams.js's POST
 * /save_n_edit express-validator chain verbatim (legacy lines 168-170).
 */
export const saveNEditValidation = [
  check('category_name').trim().not().isEmpty().withMessage('The revenue stream name field is required.'),
]
